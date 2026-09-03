/* FHQ_BUILD: 5.9.10.6.5.4h-p5d */
import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';
import { candidateCoverageWarnings, candidateHistoricalBackfill, candidateHistoryCarryForward, candidateMergedPeriodCoverage, candidatePeriodLabel, candidateSourceCoverage } from '../../../../_lib/candidate-import.js';
const RELEASE='7.4.0.3';
const parse=v=>{try{return JSON.parse(v||'null')}catch{return null}};
async function latest(db,table,leagueId,status=true){const where=status?" AND status='pending-preview'":'';return db.prepare(`SELECT * FROM ${table} WHERE league_id=?${where} ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();}
async function rows(db,sql,...args){const r=await db.prepare(sql).bind(...args).all();return r.results||[];}
async function standings(context,leagueId,discoverySessionId){const c=await database(context.env).prepare(`SELECT c.id,c.route_path,c.r2_object_key,c.received_at FROM madden_discovery_session_captures link JOIN companion_route_captures c ON c.id=link.capture_id AND c.league_id=link.league_id WHERE link.league_id=? AND link.session_id=? AND c.route_path LIKE '%/standings' ORDER BY link.observed_at DESC LIMIT 1`).bind(leagueId,discoverySessionId).first();if(!c)return{capture:null,records:[]};const obj=await context.env.COMPANION_EXPORTS.get(c.r2_object_key);if(!obj)return{capture:c,records:[]};const data=JSON.parse(new TextDecoder().decode(await obj.arrayBuffer()));const arrays=[];const walk=(v,p='$',d=0)=>{if(d>6||v==null)return;if(Array.isArray(v)){arrays.push({path:p,values:v});return}if(typeof v==='object')for(const[k,x]of Object.entries(v))walk(x,`${p}.${k}`,d+1)};walk(data);arrays.sort((a,b)=>b.values.length-a.values.length);return{capture:c,records:(arrays[0]?.values||[]).filter(x=>x&&typeof x==='object')};}
function publicSnapshot(s){if(!s)return null;return{snapshotId:s.id,status:s.status,seasonYear:s.season_year,weekIndex:s.week_index,counts:{teams:s.team_count,players:s.player_count,games:s.game_count,statistics:s.statistic_count,standings:s.standing_count},warningCount:s.warning_count,warnings:parse(s.warnings_json)||[],manifest:parse(s.manifest_json)||{},createdAt:s.created_at,activatedAt:s.activated_at||null};}
async function getLatest(db,leagueId){return publicSnapshot(await db.prepare(`SELECT * FROM league_snapshots WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first());}

async function selectedRun(db,table,leagueId,requestedId){
  return requestedId
    ? db.prepare(`SELECT * FROM ${table} WHERE league_id=? AND id=? AND status='pending-preview' LIMIT 1`).bind(leagueId,requestedId).first()
    : latest(db,table,leagueId);
}

export async function onRequestGet(context){const slug=normalizeLeagueSlug(context);if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);const auth=await requireCommissioner(context);if(!auth.authorized)return auth.response;const db=database(context.env),league=await resolveLeague(context.env,slug);if(!db||!league||auth.session.membership?.leagueId!==league.id)return json({ok:false,error:'Not found.'},404);const snapshot=await getLatest(db,league.id);return json({ok:true,release:RELEASE,snapshotAvailable:Boolean(snapshot),snapshot,activeSnapshotChanged:false,activationPerformed:false});}
export async function onRequestPost(context){const slug=normalizeLeagueSlug(context);if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);const auth=await requireCommissioner(context);if(!auth.authorized)return auth.response;const db=database(context.env),league=await resolveLeague(context.env,slug);if(!db||!league||auth.session.membership?.leagueId!==league.id)return json({ok:false,error:'Not found.'},404);
let body={};try{body=await context.request.json()}catch{}
try{
 const candidateRunId=String(body?.candidateImportRunId||'').trim();
 const candidateRun=candidateRunId?await db.prepare(`SELECT r.*,s.season_year destination_season_year,
   d.game_year_id,d.franchise_season_id
   FROM companion_candidate_import_runs r
   JOIN companion_import_destinations d ON d.id=r.destination_id AND d.league_id=r.league_id
   JOIN franchise_seasons s ON s.id=d.franchise_season_id AND s.league_id=d.league_id
   WHERE r.id=? AND r.league_id=? AND r.status='running' AND r.current_phase='build-candidate' LIMIT 1`)
   .bind(candidateRunId,league.id).first():null;
 if(!candidateRun)return json({ok:false,error:'A running commissioner candidate import at build-candidate is required.',release:RELEASE},409);
 if(!candidateRun.game_year_id)return json({ok:false,error:'The candidate destination is not attached to a Madden game year.',release:RELEASE},409);
 const requested={
   team:String(body?.teamMappingRunId||'').trim(),
   player:String(body?.playerMappingRunId||'').trim(),
   schedule:String(body?.scheduleMappingRunId||'').trim(),
   statistics:String(body?.statisticsMappingRunId||'').trim()
 };
 const [teamRun,playerRun,scheduleRun,statisticsRun]=await Promise.all([
   selectedRun(db,'companion_team_mapping_runs',league.id,requested.team),
   selectedRun(db,'companion_player_mapping_runs',league.id,requested.player),
   selectedRun(db,'companion_schedule_mapping_runs',league.id,requested.schedule),
   selectedRun(db,'companion_statistics_mapping_runs',league.id,requested.statistics)
 ]);
 const missing=[];if(!teamRun)missing.push('teams');if(!playerRun)missing.push('players');if(!scheduleRun)missing.push('schedule');if(!statisticsRun)missing.push('statistics');if(missing.length)return json({ok:false,error:`Map required domains before building a snapshot: ${missing.join(', ')}.`},422);
 const pinned={team:candidateRun.team_mapping_run_id,player:candidateRun.player_mapping_run_id,schedule:candidateRun.schedule_mapping_run_id,statistics:candidateRun.statistics_mapping_run_id};
 const mismatch=Object.entries(pinned).filter(([key,value])=>value&&String(value)!==String(requested[key]||''));
 if(mismatch.length)return json({ok:false,error:`Candidate mapping run mismatch: ${mismatch.map(([key])=>key).join(', ')}.`,release:RELEASE},409);
 const sourceMismatch=[teamRun,playerRun,scheduleRun,statisticsRun].filter(run=>String(run.discovery_session_id||'')!==String(candidateRun.discovery_session_id));
 if(sourceMismatch.length)return json({ok:false,error:'Candidate mapping runs must all come from the exact analyzed discovery session.',release:RELEASE},409);

 // 7.3.2 candidate builds are append-only. No snapshot, mapper preview, audit,
 // identity, or active-pointer row is pruned during commissioner review.
 const retention={mode:'non-destructive',deletedSnapshots:0,deletedPreviewRows:0};

 const [freshTeams,freshPlayers,freshGames,freshStatistics,standingSource,sourceReport,activeSource]=await Promise.all([
   rows(db,`SELECT * FROM companion_canonical_teams_preview WHERE league_id=? AND mapping_run_id=?`,league.id,teamRun.id),
   rows(db,`SELECT * FROM companion_canonical_players_preview WHERE league_id=? AND mapping_run_id=?`,league.id,playerRun.id),
   rows(db,`SELECT * FROM companion_canonical_games_preview WHERE league_id=? AND mapping_run_id=?`,league.id,scheduleRun.id),
   rows(db,`SELECT * FROM companion_canonical_statistics_preview WHERE league_id=? AND mapping_run_id=?`,league.id,statisticsRun.id),
   standings(context,league.id,candidateRun.discovery_session_id),
   db.prepare(`SELECT source_markers_json,dataset_inventory_json FROM madden_discovery_reports
     WHERE league_id=? AND session_id=? LIMIT 1`).bind(league.id,candidateRun.discovery_session_id).first(),
   candidateRun.active_snapshot_id_before?db.prepare(`SELECT snapshot.id,snapshot.week_index,snapshot.season_year
     FROM league_snapshots snapshot
     JOIN game_year_snapshots linked ON linked.snapshot_id=snapshot.id AND linked.league_id=snapshot.league_id
     JOIN companion_candidate_import_runs active_run
       ON active_run.candidate_snapshot_id=snapshot.id AND active_run.league_id=snapshot.league_id
     JOIN companion_import_destinations active_destination
       ON active_destination.id=active_run.destination_id AND active_destination.league_id=active_run.league_id
     WHERE snapshot.id=? AND snapshot.league_id=? AND linked.game_year_id=?
       AND snapshot.season_year=? AND active_destination.franchise_season_id=?
     ORDER BY active_run.created_at DESC LIMIT 1`)
     .bind(candidateRun.active_snapshot_id_before,league.id,candidateRun.game_year_id,
       candidateRun.destination_season_year,candidateRun.franchise_season_id).first():null
 ]);
 const runSourceCounts=parse(candidateRun.source_counts_json)||{};
 const coverage=runSourceCounts.sourceCoverage||candidateSourceCoverage({
   sourceMarkers:parse(sourceReport?.source_markers_json)||{},
   datasetInventory:parse(sourceReport?.dataset_inventory_json)||[]
 },activeSource?.week_index);
 const historicalBackfill=coverage.importMode==='historical-backfill';
 if(historicalBackfill&&!activeSource)return json({ok:false,release:RELEASE,
   error:'Historical backfill requires the exact active Madden game year and franchise-season snapshot.',
   activeSnapshotChanged:false,activationPerformed:false},409);
 const priorRecords=activeSource?await rows(db,`SELECT domain,external_id,data_json FROM league_snapshot_records
   WHERE league_id=? AND snapshot_id=? AND domain IN ('teams','players','games','statistics','standings')`,league.id,activeSource.id):[];
 const priorDomain=domain=>priorRecords.filter(row=>row.domain===domain);
 const parsedDomain=domain=>priorDomain(domain).map(row=>parse(row.data_json)).filter(Boolean);
 const currentWeek=coverage.currentWeek;
 const sourcePeriods=Array.isArray(coverage.completePeriods)&&coverage.completePeriods.length
   ?coverage.completePeriods:(currentWeek===null||currentWeek===undefined?[]:[{stage:'regular-season',week:currentWeek}]);
 const sourceWeeks=[...new Set(sourcePeriods.map(period=>Number(period.week)).filter(Number.isInteger))];
 const gameHistory=historicalBackfill
   ?candidateHistoricalBackfill(freshGames,priorDomain('games'),{keyName:'external_id',activeWeek:activeSource.week_index,activePeriod:coverage.activePeriod,sourceWeeks,sourcePeriods})
   :candidateHistoryCarryForward(freshGames,priorDomain('games'),{keyName:'external_id',currentWeek});
 const statisticHistory=historicalBackfill
   ?candidateHistoricalBackfill(freshStatistics,priorDomain('statistics'),{keyName:'external_key',activeWeek:activeSource.week_index,activePeriod:coverage.activePeriod,sourceWeeks,sourcePeriods})
   :candidateHistoryCarryForward(freshStatistics,priorDomain('statistics'),{keyName:'external_key',currentWeek});
 const teams=historicalBackfill?parsedDomain('teams'):freshTeams;
 const players=historicalBackfill?parsedDomain('players'):freshPlayers;
 const standingRows=historicalBackfill?parsedDomain('standings'):standingSource.records;
 const games=gameHistory.records,statistics=statisticHistory.records;
 const gameAppliedPeriods=new Set((gameHistory.appliedPeriods||[]).map(period=>period.key));
 const statisticAppliedPeriods=new Set((statisticHistory.appliedPeriods||[]).map(period=>period.key));
 const missingAppliedPeriods=sourcePeriods.filter(period=>!gameAppliedPeriods.has(period.key)||!statisticAppliedPeriods.has(period.key));
 if(historicalBackfill&&(!gameHistory.applied||!statisticHistory.applied||missingAppliedPeriods.length))return json({ok:false,release:RELEASE,
   error:`Historical Week/period backfill did not produce both route-scoped games and statistics for ${missingAppliedPeriods.length?missingAppliedPeriods.map(candidatePeriodLabel).join(', '):'every retained period'}.`,
   sourceCoverage:coverage,activeSnapshotChanged:false,activationPerformed:false},422);
 const mergedCoverage=candidateMergedPeriodCoverage(games,statistics,historicalBackfill?activeSource.week_index:null);
 const warnings=candidateCoverageWarnings(coverage);
 if(historicalBackfill){
   warnings.push(`Historical backfill applied ${gameHistory.applied} game record(s) and ${statisticHistory.applied} statistic record(s) across ${sourcePeriods.length} retained period(s) without changing active Regular Season Week ${activeSource.week_index}.`);
   if(mergedCoverage.missingWeeks.length)warnings.push(`Historical coverage still missing through active Week ${activeSource.week_index}: ${mergedCoverage.missingWeeks.map(week=>`Week ${week}`).join(', ')}.`);
 }else{
   if(activeSource&&gameHistory.retained)warnings.push(`${gameHistory.retained} earlier game record(s) were carried forward from active snapshot ${activeSource.id}.`);
   if(activeSource&&statisticHistory.retained)warnings.push(`${statisticHistory.retained} earlier statistic record(s) were carried forward from active snapshot ${activeSource.id}.`);
 }
 if(candidateRun.active_snapshot_id_before&&!activeSource)warnings.push('The active snapshot was not eligible for same-season history carry-forward; no prior weekly records were merged.');
 if(teams.length!==32)warnings.push(`Expected 32 teams; found ${teams.length}.`);
 if(!players.length)warnings.push('No players were available.');
 if(!games.length)warnings.push('No games were available.');
 if(!statistics.length)warnings.push('No statistics were available.');
 if(!standingRows.length)warnings.push('No standings payload was available.');
 if(Number(playerRun.warning_count||0))warnings.push(`Player mapper reported ${playerRun.warning_count} warning(s).`);
 if(Number(scheduleRun.warning_count||0))warnings.push(`Schedule mapper reported ${scheduleRun.warning_count} warning(s).`);
 if(Number(statisticsRun.warning_count||0))warnings.push(`Statistics mapper reported ${statisticsRun.warning_count} warning(s).`);
 const seasonCandidates=[...games.map(x=>x.season_year),...statistics.map(x=>x.season_year),...standingRows.map(x=>x.calendarYear)].map(Number).filter(Number.isFinite);
 const weekCandidates=[...games.map(x=>x.week_index),...statistics.map(x=>x.week_index),...standingRows.map(x=>x.weekIndex)].map(Number).filter(Number.isFinite);
 const manifest={release:RELEASE,leagueId:league.id,candidateImportRunId:candidateRun.id,storageRetention:retention,sourceCoverage:coverage,importMode:coverage.importMode,historyCarryForward:{sourceSnapshotId:activeSource?.id||null,games:historicalBackfill?0:gameHistory.retained,statistics:historicalBackfill?0:statisticHistory.retained,gameWeeks:historicalBackfill?[]:gameHistory.retainedWeeks,statisticWeeks:historicalBackfill?[]:statisticHistory.retainedWeeks},historicalBackfill:historicalBackfill?{sourceSnapshotId:activeSource.id,sourceWeeks,sourcePeriods,liveWeekPreserved:Number(activeSource.week_index),gamesApplied:gameHistory.applied,statisticsApplied:statisticHistory.applied,teamsPreserved:teams.length,playersPreserved:players.length,standingsPreserved:standingRows.length,mergedCoverage}:null,sources:{teamMappingRunId:teamRun.id,playerMappingRunId:playerRun.id,scheduleMappingRunId:scheduleRun.id,statisticsMappingRunId:statisticsRun.id,standingsCaptureId:standingSource.capture?.id||null,standingsRoute:standingSource.capture?.route_path||null},pinnedMappingRuns:{teams:teamRun.id,players:playerRun.id,schedule:scheduleRun.id,statistics:statisticsRun.id},builtAt:new Date().toISOString(),immutable:true,privateCandidate:true,activationPerformed:false,activeSnapshotChanged:false};
 const snapshotId=crypto.randomUUID();
 await db.batch([
  db.prepare(`INSERT INTO league_snapshots (id,league_id,status,season_year,week_index,team_count,player_count,game_count,statistic_count,standing_count,warning_count,warnings_json,manifest_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(snapshotId,league.id,'pending-validation',Number(candidateRun.destination_season_year)|| (seasonCandidates.length?Math.max(...seasonCandidates):null),weekCandidates.length?Math.max(...weekCandidates):null,teams.length,players.length,games.length,statistics.length,standingRows.length,warnings.length,JSON.stringify(warnings),JSON.stringify(manifest)),
  db.prepare(`INSERT INTO game_year_snapshots (game_year_id,league_id,snapshot_id,snapshot_status) VALUES (?,?,?,'candidate')`).bind(candidateRun.game_year_id,league.id,snapshotId)
 ]);
 const inserts=[];const add=(domain,items,idFn)=>items.forEach((item,i)=>inserts.push(db.prepare(`INSERT INTO league_snapshot_records (snapshot_id,league_id,domain,external_id,data_json) VALUES (?,?,?,?,?)`).bind(snapshotId,league.id,domain,String(idFn(item,i)),JSON.stringify(item))));
 add('teams',teams,(x,i)=>x.external_id||i);add('players',players,(x,i)=>x.external_id||i);add('games',games,(x,i)=>x.external_id||i);add('statistics',statistics,(x,i)=>x.external_key||i);add('standings',standingRows,(x,i)=>x.teamId||x.teamName||i);
 for(let i=0;i<inserts.length;i+=150)await db.batch(inserts.slice(i,i+150));
 const snapshot=publicSnapshot(await db.prepare(`SELECT * FROM league_snapshots WHERE id=? AND league_id=?`).bind(snapshotId,league.id).first());return json({ok:true,release:RELEASE,snapshotAvailable:true,snapshot,storageRetention:retention,importMode:coverage.importMode,historicalBackfill:manifest.historicalBackfill,mappingRunIds:{teams:teamRun.id,players:playerRun.id,schedule:scheduleRun.id,statistics:statisticsRun.id},playerCount:players.length,privateCandidate:true,activeSnapshotChanged:false,activationPerformed:false});
}catch(error){return json({ok:false,error:'Pending snapshot build failed.',detail:error?.message||String(error),release:RELEASE},500)}}
