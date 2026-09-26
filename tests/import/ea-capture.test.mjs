import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';
import { beginEaCapture, storeEaCapture, finalizeEaCapture, normalizeEaHub, eaCapturePlan } from '../../functions/_lib/ea-capture.js';
import { generateMaddenDiscoveryReport, latestMaddenDiscoveryReport, stitchRecentPartialMaddenCohort } from '../../functions/_lib/madden-discovery-report.js';
import { retainedPeriodBundle } from '../../functions/api/leagues/[leagueSlug]/companion/candidate-import.js';

function d1(database) {
  const statement = (sql,values=[]) => ({
    bind(...next){ return statement(sql,next); },
    async first(){ return database.prepare(sql).get(...values) || null; },
    async all(){ return {results:database.prepare(sql).all(...values)}; },
    async run(){ return {meta:{changes:Number(database.prepare(sql).run(...values).changes)}}; }
  });
  return {prepare:sql=>statement(sql),async batch(items){
    database.exec('BEGIN IMMEDIATE');
    try { const results=[]; for(const item of items) results.push(await item.run()); database.exec('COMMIT'); return results; }
    catch(error){database.exec('ROLLBACK');throw error;}
  }};
}

function rawHub(week=5) {
  return {success:true,careerHubInfo:{seasonInfo:{seasonYear:2,calendarYear:2027,weekTitle:`Week ${week}`,seasonWeekType:1}},
    availableWeekInfoList:Array.from({length:18},(_,i)=>({stageIndex:1,weekIndex:i,weekTitle:`Week ${i+1}`})),
    teamIdInfoList:[{teamId:10},{teamId:20}]};
}

async function fixture(mode='preview',hub=rawHub()) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of (await walkFiles()).filter(file=>/^migrations\/\d+_.+\.sql$/.test(file)).sort()) {
    sqlite.exec(await readFile(path.join(ROOT,file),'utf8'));
  }
  sqlite.exec(`INSERT INTO leagues (id,name,product_name,slug,public_status,tenant_status,timezone)
    VALUES ('ea-test','EA Test','FranchiseHQ','ea-test','active','enabled','America/Chicago');
    INSERT INTO users (id,discord_user_id,discord_username,display_name) VALUES ('actor','discord-actor','actor','Actor');
    INSERT INTO sessions (id,user_id,session_token_hash,expires_at) VALUES ('ea-auth-session','actor','ea-auth-hash','2099-01-01');
    INSERT INTO league_memberships (id,league_id,user_id,role,active) VALUES ('ea-membership','ea-test','actor','commissioner',1);
    INSERT INTO franchise_seasons (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES ('ea-season','ea-test','ea-madden-companion','1234','2','Madden NFL 27','2027',2027,'preview');
    INSERT INTO league_game_years (id,league_id,game_release,edition_year,display_name,status)
      VALUES ('ea-year','ea-test','Madden NFL 27',27,'Madden NFL 27','active');
    INSERT INTO game_year_franchise_seasons (game_year_id,league_id,franchise_season_id) VALUES ('ea-year','ea-test','ea-season');`);
  const objects = new Map();
  const bucket = {async put(key,value){objects.set(key,value);},async get(key){return objects.has(key)?{
    text:async()=>objects.get(key),arrayBuffer:async()=>new TextEncoder().encode(objects.get(key)).buffer
  }:null;}};
  const db=d1(sqlite),league={id:'ea-test',name:'EA Test'},collectionId=`collection-${mode}`;
  sqlite.exec(`INSERT INTO ea_direct_connections (id,league_id,connected_by,status,platform,persona_id,persona_name,external_league_id,external_league_name,credential_cipher)
    VALUES ('connection-1','ea-test','actor','connected','ps5','persona-1','Persona','1234','EA Test','encrypted-test');`);
  sqlite.prepare(`INSERT INTO ea_direct_collection_jobs (id,league_id,connection_id,actor_id,session_id,mode,status,token_hash,expires_at)
    VALUES (?,'ea-test','connection-1','actor','ea-auth-session',?,'running','job-test-hash','2099-01-01')`).run(collectionId,mode);
  const created = await beginEaCapture({db,bucket,league,actorId:'actor',hub,platform:'ps5',externalLeagueId:'1234',
    mode,connectionId:'connection-1',collectionId});
  const plan=eaCapturePlan(hub,{mode});
  const store = (request,payload) => storeEaCapture({db,bucket,leagueId:league.id,sessionId:created.sessionId,collectionId,
    ...request,payload,hub,platform:'ps5',externalLeagueId:'1234'});
  const finish = (options={}) => finalizeEaCapture({db,bucket,leagueId:league.id,sessionId:created.sessionId,collectionId,
    mode,actorId:'actor',expectedRequests:plan,publishReady:true,...options});
  return {sqlite,db,bucket,objects,league,hub,created,plan,store,finish};
}

function payloadFor(request) {
  const {kind,args} = request;
  if (kind === 'hub') return rawHub();
  if (kind === 'teams') return {success:true,leagueTeamInfoList:[{teamId:10,displayName:'One'},{teamId:20,displayName:'Two'}]};
  if (kind === 'standings') return {success:true,teamStandingInfoList:[{teamId:10,wins:1},{teamId:20,wins:0}]};
  if (kind === 'roster') return {success:true,rosterInfoList:[{rosterId:`player-${args.teamId}`,teamId:args.teamId,isFreeAgent:false,isActive:true}]};
  if (kind === 'free-agents') return {success:false,message:'EA high server load'};
  if (kind === 'schedule') return {success:true,gameScheduleInfoList:[{scheduleId:`game-${args.weekIndex}`,homeTeamId:10,awayTeamId:20,
    stageIndex:args.stageIndex,weekIndex:args.weekIndex,homeScore:args.weekIndex===3?27:0,awayScore:args.weekIndex===3?10:0}]};
  return {success:true,[`${args.category}StatInfoList`]:args.weekIndex===4?[]:[{rosterId:'player-10',teamId:10,
    stageIndex:args.stageIndex,weekIndex:args.weekIndex,statId:`${args.category}-4`,yards:200}]};
}

async function collect(f,alter=(request,payload)=>payload) {
  for (const request of f.plan) await f.store(request,alter(request,payloadFor(request)));
}

test('EA current period comes from the hub title, never the last available schedule',()=>{
  const hub=normalizeEaHub(rawHub());
  assert.deepEqual(hub.currentPeriod,{stage:'regular-season',week:5,key:'regular-season:5'});
  assert.equal(hub.sourceSeasonId,'2');
  assert.equal(hub.seasonYear,2027);
  assert.deepEqual([...new Set(eaCapturePlan(rawHub()).filter(item=>item.kind==='schedule').map(item=>item.args.weekIndex))],[3,4]);
  assert.throws(()=>normalizeEaHub({...rawHub(),careerHubInfo:{seasonInfo:{seasonYear:2,weekTitle:'Offseason'}}}),/current export week/);
});

test('native EA seasonWeek proves the current week even when weekTitle is only Week',()=>{
  for(const week of [1,7,8,18]){
    const raw=rawHub(week);
    Object.assign(raw.careerHubInfo.seasonInfo,{weekTitle:'Week',seasonWeek:week-1,displayWeek:week});
    const hub=normalizeEaHub({responseInfo:{value:raw}});
    assert.equal(hub.currentPeriod.week,week);
    assert.equal(hub.weekIndex,week-1);
    assert.equal(hub.sourceSeasonId,'2');
    assert.deepEqual([...new Set(eaCapturePlan(raw).filter(item=>item.kind==='schedule').map(item=>item.args.weekIndex))],
      [...new Set([Math.max(0,week-2),week-1])]);
  }
});

test('native EA week evidence rejects mismatches, missing export periods and advancing leagues',()=>{
  const raw=rawHub(8);
  Object.assign(raw.careerHubInfo.seasonInfo,{weekTitle:'Week',seasonWeek:7,displayWeek:9});
  assert.throws(()=>normalizeEaHub(raw),/does not agree/);
  raw.careerHubInfo.seasonInfo.displayWeek=8;
  assert.throws(()=>normalizeEaHub({...raw,availableWeekInfoList:[]}),/does not agree/);
  raw.careerHubInfo.isLeagueAdvancing=true;
  assert.throws(()=>normalizeEaHub(raw),/advancing/);
  raw.careerHubInfo.isLeagueAdvancing=false;
  Object.assign(raw.careerHubInfo.seasonInfo,{seasonWeekType:3,weekTitle:'Offseason'});
  assert.throws(()=>normalizeEaHub(raw),/current export week/);
});

test('native preseason indices are kept separate from regular-season weeks',()=>{
  const raw=rawHub(1);
  Object.assign(raw.careerHubInfo.seasonInfo,{weekTitle:'Preseason Week',seasonWeek:0,displayWeek:1,seasonWeekType:0});
  raw.availableWeekInfoList.push({stageIndex:0,weekIndex:0,weekTitle:'Preseason Week 1'});
  assert.deepEqual(normalizeEaHub(raw).currentPeriod,{stage:'preseason',week:1,key:'preseason:1'});
});

test('EA preview retains all data and proves both weeks without moving any import pointer',async()=>{
  const f=await fixture();
  try {
    const before={...f.sqlite.prepare('SELECT * FROM companion_league_export_endpoints').get()};
    await collect(f);
    const result=await f.finish();
    assert.equal(result.readiness.ready,true);
    assert.equal(result.readyPointerChanged,false);
    assert.equal(result.previewVerified,true);
    assert.equal(result.readiness.freeAgentStatus,'blocked');
    assert.equal(result.readiness.freeAgentCount,null);
    assert.equal(result.currentPeriod.week,5);
    assert.deepEqual({...f.sqlite.prepare('SELECT * FROM companion_league_export_endpoints').get()},before);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM league_active_snapshots').get().n,0);
    const report=f.sqlite.prepare('SELECT * FROM madden_discovery_reports WHERE id=?').get(result.reportId);
    const inventory=JSON.parse(report.dataset_inventory_json);
    assert.deepEqual([...new Set(inventory.filter(item=>item.datasetType==='statistics').map(item=>item.canonicalWeek))],[4,5]);
    assert.ok([...f.objects.keys()].some(key=>key.includes('/raw/')));
    assert.ok(inventory.every(item=>!item.routePath.includes('/week/reg/0/')));
  } finally {f.sqlite.close();}
});

test('EA weekly collection offers one source with previous statistics and the current schedule',async()=>{
  const f=await fixture('weekly');
  try {
    await collect(f);
    const result=await f.finish();
    assert.equal(result.readiness.ready,true);
    assert.equal(result.readyPointerChanged,true);
    assert.equal(f.sqlite.prepare('SELECT latest_ready_report_id FROM companion_league_export_endpoints').get().latest_ready_report_id,result.reportId);
    assert.equal(result.activationPerformed,false);
    assert.deepEqual(await f.finish(),result);
  } finally {f.sqlite.close();}
});

test('a missing weekly category keeps the entire new source unpublished',async()=>{
  const f=await fixture('weekly');
  try {
    await collect(f,(request,payload)=>request.kind==='statistics'&&request.args.category==='rushing'&&request.args.weekIndex===3?{}:payload);
    const result=await f.finish();
    assert.equal(result.readiness.ready,false);
    assert.equal(result.readyPointerChanged,false);
    assert.deepEqual(result.readiness.missingRoutes,['ps5/1234/week/reg/4/rushing']);
    assert.equal(f.sqlite.prepare('SELECT latest_ready_report_id FROM companion_league_export_endpoints').get().latest_ready_report_id,null);
  } finally {f.sqlite.close();}
});

test('a partial roster stays retained and is excluded as a whole from the accepted collection',async()=>{
  const f=await fixture('weekly');
  try {
    await collect(f,(request,payload)=>request.kind==='roster'&&request.args.teamId===20?{success:false,message:'unavailable'}:payload);
    const result=await f.finish();
    assert.equal(result.rosterComplete,false);
    assert.equal(result.readiness.ready,false,'first import must still have a valid roster');
    const report=f.sqlite.prepare('SELECT requirement_results_json FROM madden_discovery_reports WHERE id=?').get(result.reportId);
    assert.equal(JSON.parse(report.requirement_results_json)['team-rosters'].status,'missing');
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM madden_discovery_session_captures WHERE session_id=? AND route_path LIKE '%/team/%/roster'").get(f.created.rawSessionId).n,2);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM madden_discovery_session_captures WHERE session_id=? AND route_path LIKE '%/team/%/roster'").get(f.created.sessionId).n,0);
  } finally {f.sqlite.close();}
});

test('EA yearly schedules produce a retained 18-week catalog without advancing the active week',async()=>{
  const f=await fixture('yearly');
  try {
    const before={...f.sqlite.prepare('SELECT * FROM companion_league_export_endpoints').get()};
    await collect(f,(request,payload)=>{
      if(request.kind!=='schedule') return payload;
      const week=request.args.weekIndex+1;
      const teams=Array.from({length:32},(_,i)=>i+1).filter(i=>!(week>=5&&week<=12&&Math.floor((i-1)/4)===week-5));
      return {success:true,gameScheduleInfoList:Array.from({length:teams.length/2},(_,i)=>({
        scheduleId:`${week}-${i}`,stageIndex:1,weekIndex:week-1,homeTeamId:teams[i*2],awayTeamId:teams[i*2+1],homeScore:0,awayScore:0
      }))};
    });
    const result=await f.finish();
    assert.equal(result.readiness.ready,true);
    assert.equal(result.currentPeriod.week,5);
    assert.equal(result.readyPointerChanged,false);
    assert.equal(result.yearlyScheduleCoverage.capturedWeekCount,18);
    const yearly=f.sqlite.prepare('SELECT * FROM yearly_schedule_imports WHERE id=?').get(result.yearlyScheduleImportId);
    assert.equal(yearly.status,'completed');
    assert.equal(yearly.game_count,272);
    assert.deepEqual({...f.sqlite.prepare('SELECT * FROM companion_league_export_endpoints').get()},before);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM league_active_snapshots').get().n,0);
  } finally {f.sqlite.close();}
});

test('EA collection rejects a franchise or season mismatch before retaining an import session',async()=>{
  const f=await fixture();
  try {
    await assert.rejects(beginEaCapture({db:f.db,bucket:f.bucket,league:f.league,actorId:'actor',hub:rawHub(),platform:'ps5',
      externalLeagueId:'9999',mode:'weekly',connectionId:'connection-1',collectionId:'wrong-franchise'}),/do not match/);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM madden_discovery_sessions WHERE id LIKE 'ea_weekly_%'").get().n,0);
  } finally {f.sqlite.close();}
});

test('disconnect during final analysis atomically prevents weekly and yearly publication',async()=>{
  for(const mode of ['weekly','yearly']) {
    const f=await fixture(mode);
    try {
      await collect(f,(request,payload)=>{
        if(mode!=='yearly'||request.kind!=='schedule') return payload;
        const week=request.args.weekIndex+1;
        const teams=Array.from({length:32},(_,i)=>i+1).filter(i=>!(week>=5&&week<=12&&Math.floor((i-1)/4)===week-5));
        return {success:true,gameScheduleInfoList:Array.from({length:teams.length/2},(_,i)=>({
          scheduleId:`${week}-${i}`,homeTeamId:teams[i*2],awayTeamId:teams[i*2+1],stageIndex:1,weekIndex:week-1
        }))};
      });
      const originalGet=f.bucket.get;
      let disconnected=false;
      f.bucket.get=async key=>{
        const result=await originalGet(key);
        if(!disconnected&&key.includes('/canonical/')) {
          f.sqlite.exec("UPDATE ea_direct_connections SET status='disconnected',credential_cipher=NULL; UPDATE ea_direct_collection_jobs SET status='cancelled';");
          disconnected=true;
        }
        return result;
      };
      await assert.rejects(f.finish(),/no longer active/);
      assert.equal(f.sqlite.prepare('SELECT latest_ready_report_id FROM companion_league_export_endpoints').get().latest_ready_report_id,null);
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM yearly_schedule_imports').get().n,0);
    } finally {f.sqlite.close();}
  }
});

test('a new Companion export arriving during EA collection retains the source pointer',async()=>{
  const f=await fixture('weekly');
  try {
    await collect(f);
    f.sqlite.exec("UPDATE companion_league_export_endpoints SET last_received_at='2098-01-01T00:00:00.000Z'");
    const result=await f.finish();
    assert.equal(result.readiness.ready,true);
    assert.equal(result.readyPointerChanged,false);
    assert.match(result.message,/Another export arrived/);
    assert.equal(f.sqlite.prepare('SELECT latest_ready_report_id FROM companion_league_export_endpoints').get().latest_ready_report_id,null);
  } finally {f.sqlite.close();}
});

test('generic Companion analysis cannot promote EA preview or raw staging reports',async()=>{
  const f=await fixture();
  try {
    await collect(f);
    await f.finish();
    assert.equal(await latestMaddenDiscoveryReport(f.db,f.league.id),null);
    for(const sessionId of [f.created.sessionId,f.created.rawSessionId]) {
      await assert.rejects(generateMaddenDiscoveryReport({db:f.db,env:{COMPANION_EXPORTS:f.bucket},leagueId:f.league.id,sessionId}),/must complete through EA Direct/);
    }
    assert.equal(f.sqlite.prepare('SELECT latest_ready_report_id FROM companion_league_export_endpoints').get().latest_ready_report_id,null);
  } finally {f.sqlite.close();}
});

test('generic analysis reuses the vetted EA weekly report without regenerating it',async()=>{
  const f=await fixture('weekly');
  try {
    await collect(f);
    const finished=await f.finish();
    const reportBefore={...f.sqlite.prepare('SELECT * FROM madden_discovery_reports WHERE id=?').get(finished.reportId)};
    const reused=await generateMaddenDiscoveryReport({db:f.db,env:{COMPANION_EXPORTS:f.bucket},leagueId:f.league.id,sessionId:f.created.sessionId,reuseExisting:true});
    assert.equal(reused.reusedExisting,true);
    assert.equal(reused.readiness.ready,true);
    assert.deepEqual({...f.sqlite.prepare('SELECT * FROM madden_discovery_reports WHERE id=?').get(finished.reportId)},reportBefore);
    assert.equal((await latestMaddenDiscoveryReport(f.db,f.league.id)).id,finished.reportId);
  } finally {f.sqlite.close();}
});

test('automatic Companion repair cannot stitch an unfinished private EA collection into its export',async()=>{
  const f=await fixture('preview',rawHub(1));
  try {
    await collect(f);
    const now=new Date().toISOString();
    f.sqlite.prepare(`INSERT INTO madden_discovery_sessions
      (id,league_id,token_hash,status,expected_game_release,expected_season,expires_at,created_at,last_capture_at)
      VALUES ('companion-partial','ea-test','companion-test-hash','review_required','Madden NFL 27','2','2099-01-01',?,?)`).run(now,now);
    const teamCapture=f.sqlite.prepare("SELECT * FROM companion_route_captures WHERE route_path LIKE '%/leagueteams'").get();
    f.sqlite.prepare(`INSERT INTO madden_discovery_session_captures (league_id,session_id,capture_id,route_path,observed_at)
      VALUES ('ea-test','companion-partial',?,?,?)`).run(teamCapture.id,teamCapture.route_path,now);
    const result=await stitchRecentPartialMaddenCohort({db:f.db,env:{COMPANION_EXPORTS:f.bucket},leagueId:f.league.id,anchorSessionId:'companion-partial'});
    assert.equal(result.stitched,false);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM madden_discovery_reports').get().n,0);
    assert.equal(f.sqlite.prepare('SELECT latest_ready_report_id FROM companion_league_export_endpoints').get().latest_ready_report_id,null);
  } finally {f.sqlite.close();}
});

test('EA weekly import bundle is pinned to its completed collection and excludes other EA previews',async()=>{
  const f=await fixture('weekly');
  try {
    await collect(f);
    const finished=await f.finish();
    const report=f.sqlite.prepare('SELECT * FROM madden_discovery_reports WHERE id=?').get(finished.reportId);
    const at=report.generated_at;
    f.sqlite.prepare(`INSERT INTO madden_discovery_sessions (id,league_id,token_hash,status,expires_at)
      VALUES ('ea_preview_other','ea-test','other-private-hash','passed','2099-01-01')`).run();
    f.sqlite.prepare(`INSERT INTO companion_route_captures
      (id,league_id,discovery_session_id,route_path,request_method,content_type,byte_length,payload_hash,r2_object_key,collections_json,received_at)
      VALUES ('zz-private-stat','ea-test','ea_preview_other','ps5/1234/week/reg/4/passing','POST','application/json',20,'private-other','private-other','[{"count":1}]',?)`).run(at);
    f.sqlite.prepare(`INSERT INTO madden_discovery_session_captures (league_id,session_id,capture_id,route_path,observed_at)
      VALUES ('ea-test','ea_preview_other','zz-private-stat','ps5/1234/week/reg/4/passing',?)`).run(at);
    f.sqlite.prepare(`INSERT INTO madden_discovery_reports
      (id,league_id,session_id,status,report_hash,dataset_inventory_json,source_markers_json,generated_at)
      VALUES ('private-other-report','ea-test','ea_preview_other','passed','private-other-hash',?,?,?)`)
      .run(report.dataset_inventory_json,report.source_markers_json,at);
    const bundle=await retainedPeriodBundle(f.db,'ea-test',report,{source_franchise_id:'1234',season_year:2027,season_created_at:'1970-01-01'},null);
    assert.ok(bundle.sourceCaptureIds.length>0);
    assert.ok(!bundle.sourceCaptureIds.includes('zz-private-stat'));
    assert.deepEqual(bundle.sourcePeriods.map(item=>item.week),[4,5]);
  } finally {f.sqlite.close();}
});

test('finalization safely replays when its R2 completion manifest write is interrupted',async()=>{
  const f=await fixture('weekly');
  try {
    await collect(f);
    const originalPut=f.bucket.put;
    let interrupted=false;
    f.bucket.put=async(key,value)=>{
      if(!interrupted&&key.endsWith('/manifest.json')&&JSON.parse(value).status==='completed') {
        interrupted=true; throw new Error('simulated interrupted completion write');
      }
      return originalPut(key,value);
    };
    await assert.rejects(f.finish(),/interrupted completion/);
    const before=f.sqlite.prepare('SELECT latest_ready_report_id FROM companion_league_export_endpoints').get().latest_ready_report_id;
    const replayed=await f.finish();
    assert.equal(replayed.readyPointerChanged,true);
    assert.equal(replayed.reportId,before);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM madden_discovery_reports').get().n,1);
  } finally {f.sqlite.close();}
});
