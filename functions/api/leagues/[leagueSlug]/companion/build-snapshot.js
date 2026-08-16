import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';
const RELEASE='5.9.10.6.3P.2',DEFAULT_OWNER_ACCOUNT_ID='owner-tb';
const ownerAccountId=env=>String(env.PLATFORM_OWNER_ACCOUNT_ID||DEFAULT_OWNER_ACCOUNT_ID).trim();
async function requirePlatformOwner(context){const auth=await requireCommissioner(context);if(!auth.authorized)return auth;const presented=String(context.request.headers.get('x-franchisehq-platform-owner-account-id')||'').trim();if(!presented||presented!==ownerAccountId(context.env))return{authorized:false,response:json({ok:false,error:'Not found.'},404)};return auth;}
const parse=v=>{try{return JSON.parse(v||'null')}catch{return null}};
async function latest(db,table,leagueId,status=true){const where=status?" AND status='pending-preview'":'';return db.prepare(`SELECT * FROM ${table} WHERE league_id=?${where} ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();}
async function rows(db,sql,...args){const r=await db.prepare(sql).bind(...args).all();return r.results||[];}
async function standings(context,leagueId){const c=await database(context.env).prepare(`SELECT id,route_path,r2_object_key,received_at FROM companion_route_captures WHERE league_id=? AND route_path LIKE '%/standings' ORDER BY received_at DESC LIMIT 1`).bind(leagueId).first();if(!c)return{capture:null,records:[]};const obj=await context.env.COMPANION_EXPORTS.get(c.r2_object_key);if(!obj)return{capture:c,records:[]};const data=JSON.parse(new TextDecoder().decode(await obj.arrayBuffer()));const arrays=[];const walk=(v,p='$',d=0)=>{if(d>6||v==null)return;if(Array.isArray(v)){arrays.push({path:p,values:v});return}if(typeof v==='object')for(const[k,x]of Object.entries(v))walk(x,`${p}.${k}`,d+1)};walk(data);arrays.sort((a,b)=>b.values.length-a.values.length);return{capture:c,records:(arrays[0]?.values||[]).filter(x=>x&&typeof x==='object')};}
function publicSnapshot(s){if(!s)return null;return{snapshotId:s.id,status:s.status,seasonYear:s.season_year,weekIndex:s.week_index,counts:{teams:s.team_count,players:s.player_count,games:s.game_count,statistics:s.statistic_count,standings:s.standing_count},warningCount:s.warning_count,warnings:parse(s.warnings_json)||[],manifest:parse(s.manifest_json)||{},createdAt:s.created_at,activatedAt:s.activated_at||null};}
async function getLatest(db,leagueId){return publicSnapshot(await db.prepare(`SELECT * FROM league_snapshots WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first());}

async function tableExists(db,name){
  const row=await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(name).first();
  return Boolean(row);
}
async function storageCount(db,table,leagueId){
  try{return Number((await db.prepare(`SELECT COUNT(*) count FROM ${table} WHERE league_id=?`).bind(leagueId).first())?.count||0)}
  catch{return 0}
}
async function pruneSnapshotStorage(db,leagueId){
  const activeRow=await db.prepare(`SELECT snapshot_id,previous_snapshot_id FROM league_active_snapshots WHERE league_id=?`).bind(leagueId).first();
  const activeId=activeRow?.snapshot_id?String(activeRow.snapshot_id):null;

  // Forward detection only needs the snapshot that is LIVE when the next snapshot is activated.
  // Older test snapshots have already served their comparison purpose and are the largest D1 consumer.
  let deletedRecords=0,deletedSnapshots=0,deletedEvents=0,deletedValidationJobs=0,deletedStatisticsManifests=0;

  if(activeId){
    const count=await db.prepare(`SELECT COUNT(*) count FROM league_snapshot_records WHERE league_id=? AND snapshot_id<>?`).bind(leagueId,activeId).first();
    deletedRecords=Number(count?.count||0);
    await db.prepare(`DELETE FROM league_snapshot_records WHERE league_id=? AND snapshot_id<>?`).bind(leagueId,activeId).run();

    if(await tableExists(db,'snapshot_validation_jobs')){
      const countJobs=await db.prepare(`SELECT COUNT(*) count FROM snapshot_validation_jobs WHERE league_id=? AND snapshot_id<>?`).bind(leagueId,activeId).first();
      deletedValidationJobs=Number(countJobs?.count||0);
      await db.prepare(`DELETE FROM snapshot_validation_jobs WHERE league_id=? AND snapshot_id<>?`).bind(leagueId,activeId).run();
    }

    const eventCount=await db.prepare(`SELECT COUNT(*) count FROM league_snapshot_lifecycle_events WHERE league_id=? AND snapshot_id<>?`).bind(leagueId,activeId).first();
    deletedEvents=Number(eventCount?.count||0);
    await db.prepare(`DELETE FROM league_snapshot_lifecycle_events WHERE league_id=? AND snapshot_id<>?`).bind(leagueId,activeId).run();

    if(await tableExists(db,'canonical_statistics_snapshot_manifest')){
      const manifestCount=await db.prepare(`SELECT COUNT(*) count FROM canonical_statistics_snapshot_manifest
        WHERE league_id=? AND snapshot_id<>?`).bind(leagueId,activeId).first();
      deletedStatisticsManifests=Number(manifestCount?.count||0);
      await db.prepare(`DELETE FROM canonical_statistics_snapshot_manifest
        WHERE league_id=? AND snapshot_id<>?`).bind(leagueId,activeId).run();
    }

    const snapCount=await db.prepare(`SELECT COUNT(*) count FROM league_snapshots WHERE league_id=? AND id<>?`).bind(leagueId,activeId).first();
    deletedSnapshots=Number(snapCount?.count||0);
    await db.prepare(`DELETE FROM league_snapshots WHERE league_id=? AND id<>?`).bind(leagueId,activeId).run();

    // The prior pointer may now refer to a deliberately pruned test snapshot.
    await db.prepare(`UPDATE league_active_snapshots SET previous_snapshot_id=NULL WHERE league_id=?`).bind(leagueId).run();
  }

  return{activeSnapshotId:activeId,deletedRecords,deletedSnapshots,deletedEvents,deletedValidationJobs,deletedStatisticsManifests};
}
async function pruneMapperPreviewStorage(db,leagueId,runIds){
  const result={teams:0,players:0,games:0,statistics:0};
  const specs=[
    ['teams','companion_canonical_teams_preview',runIds.team],
    ['players','companion_canonical_players_preview',runIds.player],
    ['games','companion_canonical_games_preview',runIds.schedule],
    ['statistics','companion_canonical_statistics_preview',runIds.statistics]
  ];
  for(const [label,table,runId] of specs){
    if(!runId||!(await tableExists(db,table)))continue;
    try{
      const before=await db.prepare(`SELECT COUNT(*) count FROM ${table} WHERE league_id=? AND mapping_run_id<>?`).bind(leagueId,runId).first();
      result[label]=Number(before?.count||0);
      await db.prepare(`DELETE FROM ${table} WHERE league_id=? AND mapping_run_id<>?`).bind(leagueId,runId).run();
    }catch{}
  }
  return result;
}

function canonicalStatsCategory(sourceCategory=''){
  return String(sourceCategory)==='team'?'team-game':String(sourceCategory||'');
}
async function ensureStatisticsManifestSchema(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS canonical_statistics_snapshot_manifest (
    league_id TEXT NOT NULL,
    snapshot_id TEXT NOT NULL,
    route_path TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    season_year INTEGER,
    stage TEXT NOT NULL,
    week_index INTEGER NOT NULL,
    source_category TEXT NOT NULL,
    record_count INTEGER NOT NULL DEFAULT 0,
    mapping_run_id TEXT,
    committed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (league_id,snapshot_id,route_path)
  )`).run();
}
async function statisticDeltaBatches(db,leagueId,runId){
  const result=await db.prepare(`SELECT route_path,payload_hash,source_category,stage,week_index,season_year,
      record_count,status
    FROM companion_statistics_mapping_batches
    WHERE league_id=? AND mapping_run_id=? AND status='complete'
    ORDER BY route_path`).bind(leagueId,runId).all();
  return result.results||[];
}
async function copyStatisticsManifest(db,leagueId,fromSnapshotId,toSnapshotId){
  if(!fromSnapshotId)return 0;
  await ensureStatisticsManifestSchema(db);
  const before=Number((await db.prepare(`SELECT COUNT(*) c FROM canonical_statistics_snapshot_manifest
    WHERE league_id=? AND snapshot_id=?`).bind(leagueId,fromSnapshotId).first())?.c||0);
  if(!before)return 0;
  await db.prepare(`INSERT OR REPLACE INTO canonical_statistics_snapshot_manifest
    (league_id,snapshot_id,route_path,payload_hash,season_year,stage,week_index,source_category,record_count,mapping_run_id,committed_at)
    SELECT league_id,?,route_path,payload_hash,season_year,stage,week_index,source_category,record_count,mapping_run_id,CURRENT_TIMESTAMP
    FROM canonical_statistics_snapshot_manifest WHERE league_id=? AND snapshot_id=?`)
    .bind(toSnapshotId,leagueId,fromSnapshotId).run();
  return before;
}
async function upsertStatisticsManifestFromRun(db,leagueId,snapshotId,runId){
  await ensureStatisticsManifestSchema(db);
  const batches=await db.prepare(`SELECT route_path,payload_hash,source_category,stage,week_index,season_year,record_count,status
    FROM companion_statistics_mapping_batches
    WHERE league_id=? AND mapping_run_id=? AND status IN ('complete','skipped')
    ORDER BY route_path`).bind(leagueId,runId).all();
  let count=0;
  for(const row of batches.results||[]){
    if(!row.payload_hash)continue;
    await db.prepare(`INSERT OR REPLACE INTO canonical_statistics_snapshot_manifest
      (league_id,snapshot_id,route_path,payload_hash,season_year,stage,week_index,source_category,record_count,mapping_run_id,committed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
      .bind(leagueId,snapshotId,row.route_path,row.payload_hash,row.season_year==null?null:Number(row.season_year),
        row.stage,Number(row.week_index||0),row.source_category,Number(row.record_count||0),runId).run();
    count++;
  }
  return count;
}
async function copyActiveStatistics(db,leagueId,activeSnapshotId,newSnapshotId){
  if(!activeSnapshotId)return 0;
  const count=Number((await db.prepare(`SELECT COUNT(*) c FROM league_snapshot_records
    WHERE league_id=? AND snapshot_id=? AND domain='statistics'`).bind(leagueId,activeSnapshotId).first())?.c||0);
  if(!count)return 0;
  await db.prepare(`INSERT INTO league_snapshot_records (snapshot_id,league_id,domain,external_id,data_json)
    SELECT ?,league_id,domain,external_id,data_json
    FROM league_snapshot_records
    WHERE league_id=? AND snapshot_id=? AND domain='statistics'`)
    .bind(newSnapshotId,leagueId,activeSnapshotId).run();
  return count;
}
async function removeChangedStatisticPeriods(db,leagueId,snapshotId,batches){
  let removed=0;
  for(const batch of batches||[]){
    if(batch.season_year==null)continue;
    const category=canonicalStatsCategory(batch.source_category);
    const result=await db.prepare(`DELETE FROM league_snapshot_records
      WHERE league_id=? AND snapshot_id=? AND domain='statistics'
        AND CAST(json_extract(data_json,'$.season_year') AS INTEGER)=?
        AND json_extract(data_json,'$.stage')=?
        AND CAST(json_extract(data_json,'$.week_index') AS INTEGER)=?
        AND json_extract(data_json,'$.category')=?`)
      .bind(leagueId,snapshotId,Number(batch.season_year),batch.stage,Number(batch.week_index),category).run();
    removed+=Number(result?.meta?.changes||0);
  }
  return removed;
}
export async function onRequestGet(context){const slug=normalizeLeagueSlug(context);if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);const auth=await requirePlatformOwner(context);if(!auth.authorized)return auth.response;const db=database(context.env),league=await resolveLeague(context.env,slug);if(!db||!league||auth.session.membership?.leagueId!==league.id)return json({ok:false,error:'Not found.'},404);const snapshot=await getLatest(db,league.id);return json({ok:true,release:RELEASE,snapshotAvailable:Boolean(snapshot),snapshot,activeSnapshotChanged:false,activationPerformed:false});}
export async function onRequestPost(context){const slug=normalizeLeagueSlug(context);if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);const auth=await requirePlatformOwner(context);if(!auth.authorized)return auth.response;const db=database(context.env),league=await resolveLeague(context.env,slug);if(!db||!league||auth.session.membership?.leagueId!==league.id)return json({ok:false,error:'Not found.'},404);
try{
 const teamRun=await latest(db,'companion_team_mapping_runs',league.id),
   playerRun=await latest(db,'companion_player_mapping_runs',league.id),
   scheduleRun=await latest(db,'companion_schedule_mapping_runs',league.id),
   statisticsRun=await latest(db,'companion_statistics_mapping_runs',league.id);
 const missing=[];
 if(!teamRun)missing.push('teams');
 if(!playerRun)missing.push('players');
 if(!scheduleRun)missing.push('schedule');
 if(!statisticsRun)missing.push('statistics');
 if(missing.length)return json({ok:false,error:`Map required domains before building a snapshot: ${missing.join(', ')}.`},422);

 await ensureStatisticsManifestSchema(db);

 // Reclaim old test snapshots/previews, but preserve the currently LIVE snapshot.
 const retention={
   snapshots:await pruneSnapshotStorage(db,league.id),
   previews:await pruneMapperPreviewStorage(db,league.id,{
     team:teamRun.id,
     player:playerRun.id,
     schedule:scheduleRun.id,
     statistics:statisticsRun.id
   })
 };
 const activeSnapshotId=retention.snapshots?.activeSnapshotId||null;

 const teams=await rows(db,`SELECT * FROM companion_canonical_teams_preview WHERE league_id=? AND mapping_run_id=?`,league.id,teamRun.id);
 const players=await rows(db,`SELECT * FROM companion_canonical_players_preview WHERE league_id=? AND mapping_run_id=?`,league.id,playerRun.id);
 const games=await rows(db,`SELECT * FROM companion_canonical_games_preview WHERE league_id=? AND mapping_run_id=?`,league.id,scheduleRun.id);
 const statisticsDelta=await rows(db,`SELECT * FROM companion_canonical_statistics_preview WHERE league_id=? AND mapping_run_id=?`,league.id,statisticsRun.id);
 const deltaBatches=await statisticDeltaBatches(db,league.id,statisticsRun.id);
 const standingSource=await standings(context,league.id),standingRows=standingSource.records;

 const warnings=[];
 if(teams.length!==32)warnings.push(`Expected 32 teams; found ${teams.length}.`);
 if(!players.length)warnings.push('No players were available.');
 if(!games.length)warnings.push('No games were available.');
 if(!activeSnapshotId&&!statisticsDelta.length)warnings.push('No statistics were available for the baseline snapshot.');
 if(!standingRows.length)warnings.push('No standings payload was available.');
 if(Number(playerRun.warning_count||0))warnings.push(`Player mapper reported ${playerRun.warning_count} warning(s).`);
 if(Number(scheduleRun.warning_count||0))warnings.push(`Schedule mapper reported ${scheduleRun.warning_count} warning(s).`);
 if(Number(statisticsRun.warning_count||0))warnings.push(`Statistics mapper reported ${statisticsRun.warning_count} warning(s).`);

 const seasonCandidates=[...games.map(x=>x.season_year),...statisticsDelta.map(x=>x.season_year),...standingRows.map(x=>x.calendarYear)]
   .map(Number).filter(Number.isFinite);
 const weekCandidates=[...statisticsDelta.map(x=>x.week_index),...standingRows.map(x=>x.weekIndex)]
   .map(Number).filter(Number.isFinite);

 const snapshotId=crypto.randomUUID();
 const deltaInfo={
   enabled:true,
   priorSnapshotId:activeSnapshotId,
   changedOrNewRoutes:deltaBatches.length,
   deltaStatisticRows:statisticsDelta.length,
   unchangedRoutes:Number((await db.prepare(`SELECT COUNT(*) c FROM companion_statistics_mapping_batches
     WHERE league_id=? AND mapping_run_id=? AND status='skipped'`).bind(league.id,statisticsRun.id).first())?.c||0)
 };

 const manifest={release:RELEASE,leagueId:league.id,storageRetention:retention,deltaStatistics:deltaInfo,
   sources:{teamMappingRunId:teamRun.id,playerMappingRunId:playerRun.id,scheduleMappingRunId:scheduleRun.id,
     statisticsMappingRunId:statisticsRun.id,standingsCaptureId:standingSource.capture?.id||null,
     standingsRoute:standingSource.capture?.route_path||null},
   builtAt:new Date().toISOString(),immutable:true,activationPerformed:false};

 // Create the pending snapshot before composing statistics.
 await db.prepare(`INSERT INTO league_snapshots
   (id,league_id,status,season_year,week_index,team_count,player_count,game_count,statistic_count,
    standing_count,warning_count,warnings_json,manifest_json)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
   .bind(snapshotId,league.id,'pending-validation',
     seasonCandidates.length?Math.max(...seasonCandidates):null,
     weekCandidates.length?Math.max(...weekCandidates):null,
     teams.length,players.length,games.length,0,standingRows.length,warnings.length,
     JSON.stringify(warnings),JSON.stringify(manifest)).run();

 const inserts=[];
 const add=(domain,items,idFn)=>items.forEach((item,i)=>inserts.push(
   db.prepare(`INSERT INTO league_snapshot_records (snapshot_id,league_id,domain,external_id,data_json)
     VALUES (?,?,?,?,?)`).bind(snapshotId,league.id,domain,String(idFn(item,i)),JSON.stringify(item))
 ));
 add('teams',teams,(x,i)=>x.external_id||i);
 add('players',players,(x,i)=>x.external_id||i);
 add('games',games,(x,i)=>x.external_id||i);
 add('standings',standingRows,(x,i)=>x.teamId||x.teamName||i);
 for(let i=0;i<inserts.length;i+=75)await db.batch(inserts.slice(i,i+75));

 // Statistics delta composition:
 // 1) carry forward committed statistics from the current LIVE snapshot;
 // 2) remove only periods whose payload changed;
 // 3) insert newly mapped rows for those changed/new periods.
 const copiedStatistics=await copyActiveStatistics(db,league.id,activeSnapshotId,snapshotId);
 const removedStatistics=await removeChangedStatisticPeriods(db,league.id,snapshotId,deltaBatches);

 const statInserts=[];
 for(let i=0;i<statisticsDelta.length;i++){
   const item=statisticsDelta[i];
   statInserts.push(db.prepare(`INSERT OR REPLACE INTO league_snapshot_records
     (snapshot_id,league_id,domain,external_id,data_json) VALUES (?,?,?,?,?)`)
     .bind(snapshotId,league.id,'statistics',String(item.external_key||i),JSON.stringify(item)));
 }
 for(let i=0;i<statInserts.length;i+=75)await db.batch(statInserts.slice(i,i+75));

 const totalStatistics=Number((await db.prepare(`SELECT COUNT(*) c FROM league_snapshot_records
   WHERE league_id=? AND snapshot_id=? AND domain='statistics'`).bind(league.id,snapshotId).first())?.c||0);

 // Snapshot-scoped fingerprints make the LIVE snapshot the source of truth for what is already committed.
 await copyStatisticsManifest(db,league.id,activeSnapshotId,snapshotId);
 const manifestRoutes=await upsertStatisticsManifestFromRun(db,league.id,snapshotId,statisticsRun.id);

 deltaInfo.copiedStatisticRows=copiedStatistics;
 deltaInfo.replacedStatisticRows=removedStatistics;
 deltaInfo.totalStatisticRows=totalStatistics;
 deltaInfo.manifestRoutes=manifestRoutes;
 manifest.deltaStatistics=deltaInfo;

 await db.prepare(`UPDATE league_snapshots
   SET statistic_count=?,manifest_json=?,updated_at=CURRENT_TIMESTAMP
   WHERE id=?`).bind(totalStatistics,JSON.stringify(manifest),snapshotId).run();
 const snapshot=await getLatest(db,league.id);return json({ok:true,release:RELEASE,snapshotAvailable:true,snapshot,storageRetention:retention,activeSnapshotChanged:false,activationPerformed:false});
}catch(error){return json({ok:false,error:'Pending snapshot build failed.',detail:error?.message||String(error),release:RELEASE},500)}}
