import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { hashToken } from '../../functions/_lib/auth.js';
import {
  parseYearlyScheduleCapture,
  mergeYearlyScheduleCatalog,
  selectYearlyScheduleGames,
  yearlyScheduleCoverage
} from '../../functions/_lib/yearly-schedule.js';
import {
  buildTeamIdentityRebase,
  extendTeamIdRebaseFromMatchingGames,
  rebaseScheduleTeamIds
} from '../../functions/_lib/team-identity-rebase.js';
import {
  onRequestGet as getYearlySchedule,
  onRequestPost as updateYearlySchedule
} from '../../functions/api/leagues/[leagueSlug]/companion/yearly-schedule.js';
import { onRequestPost as candidateImport } from '../../functions/api/leagues/[leagueSlug]/companion/candidate-import.js';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';

function d1(database) {
  const statement=(sql,values=[])=>({
    sql,values,
    bind(...next){return statement(sql,next)},
    async first(){return database.prepare(sql).get(...values)||null},
    async all(){return{results:database.prepare(sql).all(...values)}},
    async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes||0)}}}
  });
  return{
    prepare:sql=>statement(sql),
    async batch(statements){
      database.exec('BEGIN IMMEDIATE');
      try{const results=[];for(const item of statements)results.push(await item.run());database.exec('COMMIT');return results}
      catch(error){database.exec('ROLLBACK');throw error}
    }
  };
}

function regularSeasonGames() {
  const games=[];
  for(let week=1;week<=18;week+=1){
    const teams=Array.from({length:32},(_,index)=>index)
      .filter(index=>!(week>=5&&week<=12&&Math.floor(index/4)===week-5));
    for(let index=0;index<teams.length;index+=2)games.push({
      gameId:`game-${week}-${index}`,
      stageIndex:1,
      weekIndex:week-1,
      homeTeamId:`team-${teams[index]}`,
      awayTeamId:`team-${teams[index+1]}`,
      homeScore:0,
      awayScore:0
    });
  }
  assert.equal(games.length,272);
  return games;
}

async function fixture({includeSeason=true}={}) {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  const files=(await walkFiles()).filter(file=>/^migrations\/\d+_.+\.sql$/.test(file)).sort();
  for(const file of files)sqlite.exec(await readFile(path.join(ROOT,file),'utf8'));
  sqlite.prepare(`INSERT INTO leagues (id,name,product_name,slug,public_status,tenant_status,timezone)
    VALUES (?,?,?,?,?,?,?)`).run('league-1','League','FranchiseHQ','league','active','enabled','America/Chicago');
  sqlite.prepare(`INSERT INTO users (id,discord_user_id,discord_username,display_name)
    VALUES (?,?,?,?)`).run('commissioner-1','discord-1','commissioner','Commissioner');
  sqlite.prepare(`INSERT INTO league_memberships (id,league_id,user_id,role,active)
    VALUES (?,?,?,?,1)`).run('membership-1','league-1','commissioner-1','commissioner');
  const token='yearly-schedule-session';
  sqlite.prepare(`INSERT INTO sessions (id,user_id,session_token_hash,expires_at)
    VALUES (?,?,?,'2099-01-01T00:00:00.000Z')`).run('session-1','commissioner-1',await hashToken(token));
  if(includeSeason){
    sqlite.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
        'season-2027','league-1','ea-madden-companion','742482','2','Madden NFL 27','League 2027',2027,'preview'
      );
    sqlite.exec(`INSERT INTO league_game_years
        (id,league_id,game_release,edition_year,display_name,status)
        VALUES ('game-year-27','league-1','Madden NFL 27',27,'Madden NFL 27','active');
      INSERT INTO game_year_franchise_seasons (game_year_id,league_id,franchise_season_id)
        VALUES ('game-year-27','league-1','season-2027');`);
  }
  const objects=new Map();
  const db=d1(sqlite);
  const env={
    DB:db,FRANCHISE_HQ_DB:db,
    COMPANION_EXPORTS:{get:async key=>objects.has(key)?{
      arrayBuffer:async()=>new TextEncoder().encode(objects.get(key)).buffer,
      text:async()=>objects.get(key)
    }:null}
  };
  const context=body=>({
    request:new Request('https://franchisehq.app/api/leagues/league/companion/yearly-schedule',{
      method:body===undefined?'GET':'POST',
      headers:{'content-type':'application/json',cookie:`franchise_hq_session=${token}`},
      body:body===undefined?undefined:JSON.stringify(body)
    }),
    params:{leagueSlug:'league'},env
  });
  return{sqlite,objects,context};
}

function seedFirstSeasonExport(sqlite,objects) {
  const games=regularSeasonGames();
  const routePath='xbsx/9001/week/reg/0/schedules';
  const objectKey='retained/first-season-schedule';
  const statsRoute='xbsx/9001/week/reg/1/passing';
  const statsKey='retained/first-season-passing';
  objects.set(objectKey,JSON.stringify({gameScheduleInfoList:games}));
  objects.set(statsKey,JSON.stringify({
    playerPassingStatInfoList:[{playerId:'player-1',teamId:'team-1',passingYards:250}]
  }));
  sqlite.prepare(`INSERT INTO platform_league_onboarding_plans
    (id,planned_league_id,slug,name,product_name,timezone,game_year,
     initial_commissioner_user_id,source_mode,plan_hash,status,created_by_user_id,
     updated_by_user_id,prepared_by_user_id,prepared_at,activated_by_user_id,activated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?, 'prepared',?,?,?,?,?,?)`).run(
      'plan-1','league-1','league','League','FranchiseHQ','America/Chicago',2027,
      'commissioner-1','companion','plan-hash-1','commissioner-1','commissioner-1',
      'commissioner-1','2026-09-20T00:00:00.000Z','commissioner-1','2026-09-20T00:01:00.000Z'
    );
  sqlite.prepare(`INSERT INTO madden_discovery_sessions
    (id,league_id,token_hash,status,expected_league_name,capture_count,expires_at,last_capture_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(
      'session-first','league-1','token-first','review_required','League',2,
      '2099-01-01T00:00:00.000Z','2026-09-20T00:02:00.000Z'
    );
  sqlite.prepare(`INSERT INTO companion_route_captures
    (id,league_id,discovery_session_id,route_path,request_method,content_type,byte_length,
     payload_hash,r2_object_key,received_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      'capture-first','league-1','session-first',routePath,'POST','application/json',100,
      'payload-first',objectKey,'2026-09-20T00:02:00.000Z'
    );
  sqlite.prepare(`INSERT INTO madden_discovery_session_captures
    (league_id,session_id,capture_id,route_path,observed_at) VALUES (?,?,?,?,?)`).run(
      'league-1','session-first','capture-first',routePath,'2026-09-20T00:02:00.000Z'
    );
  sqlite.prepare(`INSERT INTO companion_route_captures
    (id,league_id,discovery_session_id,route_path,request_method,content_type,byte_length,
     payload_hash,r2_object_key,received_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      'capture-stats','league-1','session-first',statsRoute,'POST','application/json',100,
      'payload-stats',statsKey,'2026-09-20T00:02:01.000Z'
    );
  sqlite.prepare(`INSERT INTO madden_discovery_session_captures
    (league_id,session_id,capture_id,route_path,observed_at) VALUES (?,?,?,?,?)`).run(
      'league-1','session-first','capture-stats',statsRoute,'2026-09-20T00:02:01.000Z'
    );
  const sourceMarkers={
    sourceFranchiseId:{expected:null,observed:['9001'],status:'observed'},
    season:{expected:null,observed:[],status:'missing'},
    week:{expected:null,observed:Array.from({length:18},(_,index)=>String(index+1)),status:'multi-period'}
  };
  const requirements={
    teams:{status:'located',recordCount:32,routes:['xbsx/9001/teams']},
    'team-rosters':{status:'missing',recordCount:0,routes:[]},
    players:{status:'missing',recordCount:0,routes:[]},
    standings:{status:'located',recordCount:32,routes:['xbsx/9001/standings']},
    schedule:{status:'located',recordCount:272,routes:[routePath]},
    statistics:{status:'located',recordCount:100,routes:['xbsx/9001/week/reg/0/stats']},
    'free-agents':{status:'missing',recordCount:0,routes:[]}
  };
  sqlite.prepare(`INSERT INTO madden_discovery_reports
    (id,league_id,session_id,status,route_count,capture_count,total_bytes,source_markers_json,
     source_verification_json,requirement_results_json,free_agent_evidence_json,
     sanitized_fixture_json,report_hash,generated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      'report-first','league-1','session-first','review_required',42,1,100,
      JSON.stringify(sourceMarkers),JSON.stringify({gameRelease:false,league:true,season:false,week:true,passed:false}),
      JSON.stringify(requirements),JSON.stringify({status:'missing',recordCount:0}),
      JSON.stringify({analysisPolicy:'retained-test'}),'report-hash-first','2026-09-20T00:03:00.000Z'
    );
  sqlite.prepare(`UPDATE companion_league_export_endpoints SET
    latest_session_id='session-first',latest_session_token_version=token_version,
    latest_report_id='report-first',latest_ready_report_id=NULL,
    last_received_at='2026-09-20T00:02:00.000Z',last_analyzed_at='2026-09-20T00:03:00.000Z'
    WHERE league_id='league-1'`).run();
}

test('yearly schedule parsing preserves ordinary route authority and limits Week 0 to payload periods',()=>{
  const ordinary=parseYearlyScheduleCapture({
    routePath:'xbsx/742482/week/reg/10/schedules',seasonYear:2027,observedAt:'2026-09-01T00:00:00Z',
    payload:{gameScheduleInfoList:[{gameId:'ordinary',stageIndex:1,weekIndex:0,homeTeamId:'1',awayTeamId:'2'}]}
  });
  assert.equal(ordinary.games[0].week_index,10);

  const sentinel=parseYearlyScheduleCapture({
    routePath:'xbsx/742482/week/reg/0/schedules',seasonYear:2027,observedAt:'2026-09-02T00:00:00Z',
    payload:{gameScheduleInfoList:[{gameId:'sentinel',stageIndex:1,weekIndex:9,homeTeamId:'1',awayTeamId:'2'}]}
  });
  assert.equal(sentinel.games[0].week_index,10);

  const warnings=[];
  const selected=selectYearlyScheduleGames([...sentinel.games,...ordinary.games],warnings);
  assert.equal(selected.length,1);
  assert.equal(selected[0].external_id,'ordinary');
  assert.match(warnings[0],/resolved using.*reg\/10\/schedules/i);

  const malformed=parseYearlyScheduleCapture({
    routePath:'xbsx/742482/week/reg/0/schedules',
    payload:{gameScheduleInfoList:[{gameId:'preseason',stageIndex:0,weekIndex:0,homeTeamId:'1',awayTeamId:'2'}]}
  });
  assert.equal(malformed.games.length,0);
  assert.match(malformed.warnings.join(' '),/malformed|conflicting/i);

  const empty=parseYearlyScheduleCapture({routePath:'xbsx/742482/week/reg/0/schedules',payload:{gameScheduleInfoList:[]}});
  assert.equal(empty.games.length,0);
  assert.match(empty.warnings.join(' '),/empty Week 0 placeholder/i);
});

test('weekly imports overlay the catalog without erasing earlier results or Confidence game identity',()=>{
  const yearly=[1,2,3].map(week=>({
    external_id:`catalog-${week}`,season_year:2027,stage:'regular-season',week_index:week,
    away_team_external_id:`away-${week}`,home_team_external_id:`home-${week}`,
    away_score:0,home_score:0,status:'scheduled',source_route_path:`x/week/reg/${week}/schedules`
  }));
  const prior=[{...yearly[0],away_score:14,home_score:21,status:'completed'}];
  const current=[{...yearly[1],external_id:'madden-renumbered',away_score:17,home_score:24,status:'completed'}];
  const merged=mergeYearlyScheduleCatalog({yearlyGames:yearly,priorGames:prior,currentGames:current,seasonYear:2027});
  assert.equal(merged.records.length,3);
  assert.equal(merged.records.find(game=>game.week_index===1).home_score,21);
  assert.equal(merged.records.find(game=>game.week_index===2).external_id,'catalog-2');
  assert.equal(merged.records.find(game=>game.week_index===2).source_game_external_id,'madden-renumbered');
  assert.equal(merged.records.find(game=>game.week_index===3).status,'scheduled');
});

test('retained schedules rebase team IDs and exact Madden game IDs remain unique',()=>{
  const sourceTeams=[
    {external_id:'old-chi',display_name:'Chicago Bears',abbreviation:'CHI'},
    {external_id:'old-tb',display_name:'Tampa Bay Buccaneers',abbreviation:'TB'}
  ];
  const destinationTeams=[
    {external_id:'new-chi',display_name:'Chicago Bears',abbreviation:'CHI'},
    {external_id:'new-tb',display_name:'Tampa Bay Buccaneers',abbreviation:'TB'}
  ];
  const {teamIdMap,audit}=buildTeamIdentityRebase(sourceTeams,destinationTeams);
  assert.equal(audit.remappedTeamCount,2);
  const oldGame={
    external_id:'545784060',season_year:2027,stage:'regular-season',week_index:2,
    away_team_external_id:'old-chi',home_team_external_id:'old-tb',
    away_score:0,home_score:0,status:'scheduled'
  };
  const directCollision=mergeYearlyScheduleCatalog({
    yearlyGames:[oldGame],
    currentGames:[{...oldGame,away_team_external_id:'new-chi',home_team_external_id:'new-tb',home_score:24}],
    seasonYear:2027
  });
  assert.equal(directCollision.records.length,1);
  assert.equal(directCollision.records[0].home_team_external_id,'new-tb');
  assert.equal(directCollision.deduplicatedExternalIds,1);

  const retained=rebaseScheduleTeamIds([oldGame],teamIdMap);
  assert.equal(retained.remappedGameCount,1);
  assert.equal(retained.remappedReferenceCount,2);
  assert.equal(retained.records[0].away_team_external_id,'new-chi');
  assert.equal(retained.records[0].home_team_external_id,'new-tb');

  const current=[{
    ...retained.records[0],away_score:17,home_score:24,status:'completed'
  }];
  const merged=mergeYearlyScheduleCatalog({
    yearlyGames:retained.records,
    priorGames:[{...retained.records[0],home_score:7}],
    currentGames:current,
    seasonYear:2027
  });
  assert.equal(merged.records.length,1);
  assert.equal(merged.records[0].home_score,24);
  assert.equal(merged.records[0].home_team_external_id,'new-tb');
  assert.equal(merged.deduplicatedExternalIds,0);
});

test('retained yearly schedules bridge superseded Madden team IDs through matching game identity',()=>{
  const baseTeamIdMap=new Map([
    ['active-chi','current-chi'],
    ['active-tb','current-tb']
  ]);
  const yearlyGames=[{
    external_id:'game-1',season_year:2027,stage:'regular-season',week_index:1,
    away_team_external_id:'yearly-chi',home_team_external_id:'yearly-tb'
  }];
  const activeGames=[{
    external_id:'game-1',season_year:2027,stage:'regular-season',week_index:1,
    away_team_external_id:'active-chi',home_team_external_id:'active-tb'
  }];
  const bridge=extendTeamIdRebaseFromMatchingGames(yearlyGames,activeGames,baseTeamIdMap);
  assert.equal(bridge.audit.proof,'matching-game-team-identity');
  assert.equal(bridge.audit.matchedGameCount,1);
  assert.equal(bridge.audit.inferredTeamCount,2);
  assert.equal(bridge.teamIdMap.get('yearly-chi'),'current-chi');
  assert.equal(bridge.teamIdMap.get('yearly-tb'),'current-tb');
  const rebased=rebaseScheduleTeamIds(yearlyGames,bridge.teamIdMap);
  assert.equal(rebased.records[0].away_team_external_id,'current-chi');
  assert.equal(rebased.records[0].home_team_external_id,'current-tb');
});

test('retained yearly schedule bridge rejects contradictory game evidence',()=>{
  const yearlyGames=[
    {external_id:'game-1',away_team_external_id:'yearly-a',home_team_external_id:'yearly-b'},
    {external_id:'game-2',away_team_external_id:'yearly-a',home_team_external_id:'yearly-b'}
  ];
  const activeGames=[
    {external_id:'game-1',away_team_external_id:'active-a',home_team_external_id:'active-b'},
    {external_id:'game-2',away_team_external_id:'active-b',home_team_external_id:'active-a'}
  ];
  const baseTeamIdMap=new Map([['active-a','current-a'],['active-b','current-b']]);
  assert.throws(
    ()=>extendTeamIdRebaseFromMatchingGames(yearlyGames,activeGames,baseTeamIdMap),
    /conflicting current teams/i
  );
});

test('Import Yearly Schedule seals 18 weeks atomically without snapshots, Discord, URL rotation, or data deletion',async()=>{
  const {sqlite,objects,context}=await fixture();
  try{
    sqlite.prepare(`UPDATE companion_league_export_endpoints SET token_version=7,
      latest_session_id=NULL,latest_ready_report_id=NULL WHERE league_id='league-1'`).run();
    const startedResponse=await updateYearlySchedule(context({action:'start'}));
    const started=await startedResponse.json();
    assert.equal(startedResponse.status,201,JSON.stringify(started));
    assert.equal(started.yearlyScheduleImport.status,'collecting');
    assert.equal(started.yearlyScheduleImport.permanentExportUrlPreserved,true);
    const importId=started.yearlyScheduleImport.id;

    const blockedResponse=await candidateImport(context({action:'start'}));
    const blocked=await blockedResponse.json();
    assert.equal(blockedResponse.status,409);
    assert.match(blocked.error,/Import Yearly Schedule is in progress/);

    const games=regularSeasonGames();
    for(let week=1;week<=18;week+=1){
      const id=`capture-week-${week}`,key=`yearly/${id}`;
      const payload={gameScheduleInfoList:games.filter(game=>game.weekIndex===week-1)};
      objects.set(key,JSON.stringify(payload));
      sqlite.prepare(`INSERT INTO companion_route_captures
        (id,league_id,discovery_session_id,route_path,request_method,byte_length,payload_hash,r2_object_key)
        VALUES (?,'league-1','yearly-session',?,'POST',100,?,?)`).run(
          id,`xbsx/742482/week/reg/${week}/schedules`,id,key
        );
      sqlite.prepare(`INSERT INTO yearly_schedule_import_captures
        (import_id,league_id,capture_id,route_path,observed_at) VALUES (?,?,?,?,?)`).run(
          importId,'league-1',id,`xbsx/742482/week/reg/${week}/schedules`,
          `2026-09-${String(week).padStart(2,'0')}T12:00:00.000Z`
        );
    }
    assert.throws(()=>sqlite.prepare(`INSERT INTO yearly_schedule_import_captures
      (import_id,league_id,capture_id,route_path,observed_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP)`)
      .run(importId,'league-1','capture-week-1','xbsx/742482/week/reg/2/schedules'),/collecting league import/i);
    const readyResponse=await getYearlySchedule(context());
    const ready=await readyResponse.json();
    assert.equal(ready.yearlyScheduleImport.status,'ready');
    assert.equal(ready.yearlyScheduleImport.capturedWeekCount,18);
    assert.equal(ready.yearlyScheduleImport.gameCount,272);
    assert.equal(ready.yearlyScheduleImport.readyToFinish,true);
    assert.deepEqual(yearlyScheduleCoverage(JSON.parse(sqlite.prepare(
      `SELECT schedule_json FROM yearly_schedule_imports WHERE id=?`
    ).get(importId)?.schedule_json||'[]')).weeks,[]);

    const finishedResponse=await updateYearlySchedule(context({action:'finish'}));
    const finished=await finishedResponse.json();
    assert.equal(finishedResponse.status,200,JSON.stringify(finished));
    assert.equal(finished.yearlyScheduleImport.status,'completed');
    assert.equal(finished.activationPerformed,false);
    assert.equal(finished.discordScheduleSyncPerformed,false);
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM league_snapshots').get().count,0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM discord_schedule_threads').get().count,0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM companion_route_captures').get().count,18);
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM yearly_schedule_import_captures').get().count,18);
    const revision=sqlite.prepare(`SELECT * FROM yearly_schedule_imports WHERE id=?`).get(importId);
    assert.equal(JSON.parse(revision.schedule_json).length,272);
    assert.equal(revision.captured_week_count,18);
    assert.ok(revision.schedule_sha256);
    const endpoint=sqlite.prepare(`SELECT token_version,latest_session_id,latest_report_id,latest_ready_report_id
      FROM companion_league_export_endpoints WHERE league_id='league-1'`).get();
    assert.equal(endpoint.token_version,7);
    assert.equal(endpoint.latest_session_id,null);
    assert.equal(endpoint.latest_report_id,null);
    assert.equal(endpoint.latest_ready_report_id,null);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM tenant_audit_events
      WHERE action IN ('companion.yearly_schedule.start','companion.yearly_schedule.finish')`).get().count,2);
    assert.throws(()=>sqlite.prepare(`UPDATE yearly_schedule_imports SET game_count=0 WHERE id=?`).run(importId),/immutable/i);
    assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{sqlite.close()}
});

test('switching an incomplete yearly collection to weekly imports retains captures and leaves live data untouched',async()=>{
  const {sqlite,objects,context}=await fixture();
  try{
    const startedResponse=await updateYearlySchedule(context({action:'start'}));
    const started=await startedResponse.json();
    assert.equal(startedResponse.status,201,JSON.stringify(started));
    const importId=started.yearlyScheduleImport.id;
    const routePath='xbsx/742482/week/reg/1/schedules';
    const objectKey='yearly/retained-week-1';
    objects.set(objectKey,JSON.stringify({gameScheduleInfoList:regularSeasonGames().filter(game=>game.weekIndex===0)}));
    sqlite.prepare(`INSERT INTO companion_route_captures
      (id,league_id,discovery_session_id,route_path,request_method,byte_length,payload_hash,r2_object_key)
      VALUES ('capture-week-1','league-1','yearly-session',?,'POST',100,'hash-week-1',?)`)
      .run(routePath,objectKey);
    sqlite.prepare(`INSERT INTO yearly_schedule_import_captures
      (import_id,league_id,capture_id,route_path,observed_at)
      VALUES (?,'league-1','capture-week-1',?,CURRENT_TIMESTAMP)`).run(importId,routePath);
    const collecting=await (await getYearlySchedule(context())).json();
    assert.equal(collecting.yearlyScheduleImport.capturedWeekCount,1);

    const before=sqlite.prepare(`SELECT token_version FROM companion_league_export_endpoints
      WHERE league_id='league-1'`).get();
    const switchedResponse=await updateYearlySchedule(context({action:'switch-to-weekly'}));
    const switched=await switchedResponse.json();
    assert.equal(switchedResponse.status,200,JSON.stringify(switched));
    assert.equal(switched.switchedToWeekly,true);
    assert.equal(switched.freshWeeklyExportRequired,true);
    assert.equal(switched.yearlyScheduleImport,null);
    assert.equal(sqlite.prepare(`SELECT status FROM yearly_schedule_imports WHERE id=?`).get(importId).status,'cancelled');
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM companion_route_captures`).get().count,1);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM yearly_schedule_import_captures`).get().count,1);
    assert.equal(objects.has(objectKey),true);
    assert.equal(sqlite.prepare(`SELECT token_version FROM companion_league_export_endpoints
      WHERE league_id='league-1'`).get().token_version,before.token_version);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM league_snapshots`).get().count,0);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM discord_schedule_threads`).get().count,0);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM tenant_audit_events
      WHERE action='companion.yearly_schedule.switch_to_weekly'`).get().count,1);
    const repeated=await (await updateYearlySchedule(context({action:'switch-to-weekly'}))).json();
    assert.equal(repeated.reused,true);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM tenant_audit_events
      WHERE action='companion.yearly_schedule.switch_to_weekly'`).get().count,1);
    assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{sqlite.close()}
});

test('new tenant first-season confirmation prepares only its league and reuses the retained yearly schedule',async()=>{
  const {sqlite,objects,context}=await fixture({includeSeason:false});
  try{
    sqlite.prepare(`INSERT INTO leagues (id,name,product_name,slug,public_status,tenant_status,timezone)
      VALUES ('league-fgc','Furious Gaming Community','FranchiseHQ','fgc','active','enabled','America/Chicago')`).run();
    sqlite.prepare(`INSERT INTO league_game_years
      (id,league_id,game_release,edition_year,display_name,status)
      VALUES ('fgc-game-year','league-fgc','Madden NFL 27',27,'Madden NFL 27','active')`).run();
    sqlite.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES ('fgc-season','league-fgc','ea-madden-companion','742482','2','Madden NFL 27','FGC 2027',2027,'active')`).run();
    seedFirstSeasonExport(sqlite,objects);

    let response=await getYearlySchedule(context());
    let payload=await response.json();
    assert.equal(response.status,200);
    assert.equal(payload.preparedSeason,null);
    assert.equal(payload.firstSeasonPreparation.status,'confirmation-required');
    assert.equal(payload.firstSeasonPreparation.gameRelease,'Madden NFL 27');
    assert.equal(payload.firstSeasonPreparation.sourceFranchiseId,'9001');
    assert.equal(payload.firstSeasonPreparation.retainedExport.routeCount,42);
    assert.equal(payload.firstSeasonPreparation.retainedExport.hasRoster,false);

    response=await updateYearlySchedule(context({
      action:'prepare-first-season',sourceFranchiseId:'9001',sourceSeasonId:'1',confirmSourceSeason:false
    }));
    payload=await response.json();
    assert.equal(response.status,409);
    assert.match(payload.error,/Confirm the exact Madden franchise season number/);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM franchise_seasons WHERE league_id='league-1'`).get().count,0);

    response=await updateYearlySchedule(context({
      action:'prepare-first-season',sourceFranchiseId:'9001',sourceSeasonId:'1',confirmSourceSeason:true
    }));
    payload=await response.json();
    assert.equal(response.status,201,JSON.stringify(payload));
    assert.equal(payload.prepared,true);
    assert.equal(payload.preparedSeason.seasonYear,2027);
    assert.equal(payload.firstSeasonPreparation.status,'prepared');
    assert.equal(payload.reanalysis.sourceVerified,true,JSON.stringify(payload.reanalysis));
    assert.equal(payload.reanalysis.importReady,false);
    assert.equal(payload.reanalysis.freeAgentCount,null);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM league_game_years WHERE league_id='league-1'`).get().count,1);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM franchise_seasons WHERE league_id='league-1'`).get().count,1);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM companion_import_destinations WHERE league_id='league-1'`).get().count,1);
    const preparedSession=sqlite.prepare(`SELECT expected_game_release,expected_season
      FROM madden_discovery_sessions WHERE id='session-first'`).get();
    assert.equal(preparedSession.expected_game_release,'Madden NFL 27');
    assert.equal(preparedSession.expected_season,'1');
    const reviewed=sqlite.prepare(`SELECT status,source_verification_json
      FROM madden_discovery_reports WHERE id='report-first'`).get();
    assert.equal(reviewed.status,'review_required');
    assert.equal(JSON.parse(reviewed.source_verification_json).passed,true);

    const fgcBefore=sqlite.prepare(`SELECT id,status FROM franchise_seasons WHERE league_id='league-fgc'`).get();
    response=await updateYearlySchedule(context({action:'start'}));
    payload=await response.json();
    assert.equal(response.status,201,JSON.stringify(payload));
    assert.equal(payload.yearlyScheduleImport.status,'ready');
    assert.equal(payload.yearlyScheduleImport.gameCount,272);
    assert.equal(payload.yearlyScheduleImport.captureCount,1);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM companion_route_captures
      WHERE league_id='league-1' AND id='capture-first'`).get().count,1);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM yearly_schedule_import_captures
      WHERE league_id='league-1'`).get().count,1);
    assert.deepEqual(sqlite.prepare(`SELECT id,status FROM franchise_seasons WHERE league_id='league-fgc'`).get(),fgcBefore);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM league_snapshots`).get().count,0);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM discord_schedule_threads`).get().count,0);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM tenant_audit_events
      WHERE league_id='league-1' AND action='companion.first_season.prepare'`).get().count,1);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM tenant_audit_events
      WHERE league_id='league-fgc'`).get().count,0);
    assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{sqlite.close()}
});

test('runtime and commissioner UI wire collection separately from live import and Discord',async()=>{
  const [receiver,candidate,builder,ui,compact]=await Promise.all([
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/export/[token]/[[datasetPath]].js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/candidate-import.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/build-snapshot.js',import.meta.url),'utf8'),
    readFile(new URL('../../league-engine/permanent-export-url.js',import.meta.url),'utf8'),
    readFile(new URL('../../league-engine/one-click-import.js',import.meta.url),'utf8')
  ]);
  assert.match(receiver,/yearly_schedule_import_captures/);
  assert.match(receiver,/!yearlyScheduleImport/);
  assert.match(candidate,/Import Latest Export is unavailable while Import Yearly Schedule is in progress/);
  assert.match(builder,/yearly_schedule_imports/);
  assert.match(builder,/yearlySchedule:/);
  assert.match(builder,/checkpointed-domain-v3/);
  assert.match(builder,/ON CONFLICT\(snapshot_id,domain,external_id\) DO UPDATE/);
  assert.match(builder,/checkpointToken/);
  assert.match(builder,/rebaseScheduleTeamIds/);
  assert.match(ui,/data-import-yearly-schedule/);
  assert.match(ui,/Import Yearly Schedule/);
  assert.match(ui,/Finish Full Schedule/);
  assert.match(ui,/Switch to Weekly Imports/);
  assert.match(ui,/data-switch-to-weekly/);
  assert.match(ui,/optional collection/);
  assert.match(ui,/Finish First-Season Setup/);
  assert.match(ui,/Confirm & Prepare Season/);
  assert.match(ui,/First roster is still required/);
  assert.match(ui,/Import unavailable:/);
  assert.match(compact,/Finish or Switch Schedule First/);
  assert.match(compact,/No live snapshot yet/);
  assert.match(compact,/You do not need to collect the entire season first/);
  assert.doesNotMatch(ui,/Schedule Preload|preload/i);
});
