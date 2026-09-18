/* FHQ_BUILD: 7.6.0-rc.1 */
import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';
import {
  candidateCoverageWarnings,
  candidateHistoricalBackfill,
  candidateHistoryCarryForward,
  candidateMergedPeriodCoverage,
  candidatePeriodLabel,
  candidateSourceCoverage
} from '../../../../_lib/candidate-import.js';
import { scheduleAdvanceDecision, snapshotCurrentPeriod } from '../../../../_lib/schedule-integrity.js';
import { mergeYearlyScheduleCatalog } from '../../../../_lib/yearly-schedule.js';
import { buildTeamIdentityRebase, rebaseScheduleTeamIds } from '../../../../_lib/team-identity-rebase.js';

const RELEASE='7.6.0-rc.1';
const BUILD_MODE='checkpointed-domain-v3';
const LEGACY_BUILD_MODES=Object.freeze(['checkpointed-domain-v2']);
const BUILD_PLAN_REVISION='unique-external-id-upsert-v1';
const BUILD_DOMAINS=Object.freeze(['teams','players','games','statistics','standings']);
const BUILD_RECORD_LIMIT=125;
const parse=v=>{try{return JSON.parse(v||'null')}catch{return null}};
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];

async function latest(db,table,leagueId,status=true){
  const where=status?" AND status='pending-preview'":'';
  return db.prepare(`SELECT * FROM ${table} WHERE league_id=?${where} ORDER BY created_at DESC LIMIT 1`)
    .bind(leagueId).first();
}

async function selectedRun(db,table,leagueId,requestedId){
  return requestedId
    ?db.prepare(`SELECT * FROM ${table} WHERE league_id=? AND id=? AND status='pending-preview' LIMIT 1`)
      .bind(leagueId,requestedId).first()
    :latest(db,table,leagueId);
}

async function standings(context,leagueId,discoverySessionId){
  const db=database(context.env);
  const capture=await db.prepare(`SELECT c.id,c.route_path,c.r2_object_key,c.received_at
    FROM madden_discovery_session_captures link
    JOIN companion_route_captures c ON c.id=link.capture_id AND c.league_id=link.league_id
    WHERE link.league_id=? AND link.session_id=? AND c.route_path LIKE '%/standings'
    ORDER BY link.observed_at DESC LIMIT 1`).bind(leagueId,discoverySessionId).first();
  if(!capture)return{capture:null,records:[]};
  const object=await context.env.COMPANION_EXPORTS.get(capture.r2_object_key);
  if(!object)return{capture,records:[]};
  const payload=JSON.parse(new TextDecoder().decode(await object.arrayBuffer()));
  const arrays=[];
  const walk=(value,path='$',depth=0)=>{
    if(depth>6||value==null)return;
    if(Array.isArray(value)){arrays.push({path,values:value});return;}
    if(typeof value==='object')for(const[key,item]of Object.entries(value))walk(item,`${path}.${key}`,depth+1);
  };
  walk(payload);
  arrays.sort((left,right)=>right.values.length-left.values.length);
  return{capture,records:(arrays[0]?.values||[]).filter(value=>value&&typeof value==='object')};
}

function publicSnapshot(snapshot){
  if(!snapshot)return null;
  return{
    snapshotId:snapshot.id,
    status:snapshot.status,
    seasonYear:snapshot.season_year,
    weekIndex:snapshot.week_index,
    counts:{
      teams:snapshot.team_count,
      players:snapshot.player_count,
      games:snapshot.game_count,
      statistics:snapshot.statistic_count,
      standings:snapshot.standing_count
    },
    warningCount:snapshot.warning_count,
    warnings:parse(snapshot.warnings_json)||[],
    manifest:parse(snapshot.manifest_json)||{},
    createdAt:snapshot.created_at,
    activatedAt:snapshot.activated_at||null
  };
}

async function getLatest(db,leagueId){
  return publicSnapshot(await db.prepare(`SELECT * FROM league_snapshots WHERE league_id=? ORDER BY created_at DESC LIMIT 1`)
    .bind(leagueId).first());
}

function buildState(manifest={}){
  const state=manifest?.buildState&&typeof manifest.buildState==='object'?manifest.buildState:{};
  return{
    mode:BUILD_MODE,
    planRevision:BUILD_PLAN_REVISION,
    status:state.status||'building',
    currentDomain:state.currentDomain||BUILD_DOMAINS[0],
    domains:state.domains&&typeof state.domains==='object'?state.domains:{},
    startedAt:state.startedAt||new Date().toISOString(),
    completedAt:state.completedAt||null
  };
}

function initialManifest({league,candidateRun,requested,coverage,retention}){
  const historicalBackfill=coverage.importMode==='historical-backfill';
  const period=historicalBackfill?(coverage.activePeriod||null):(coverage.currentPeriod||null);
  return{
    release:RELEASE,
    leagueId:league.id,
    candidateImportRunId:candidateRun.id,
    storageRetention:retention,
    sourceCoverage:coverage,
    importMode:coverage.importMode,
    pinnedMappingRuns:{
      teams:requested.team,
      players:requested.player,
      schedule:requested.schedule,
      statistics:requested.statistics
    },
    currentPeriod:period,
    currentPeriodProof:coverage.currentPeriodProof||null,
    buildState:buildState(),
    builtAt:null,
    immutable:true,
    privateCandidate:true,
    activationPerformed:false,
    activeSnapshotChanged:false
  };
}

async function activeSourceFor(db,league,candidateRun){
  if(!candidateRun.active_snapshot_id_before)return null;
  return db.prepare(`SELECT snapshot.id,snapshot.week_index,snapshot.season_year,
      snapshot.team_count,snapshot.player_count,snapshot.manifest_json
    FROM league_snapshots snapshot
    JOIN game_year_snapshots linked
      ON linked.snapshot_id=snapshot.id AND linked.league_id=snapshot.league_id
    JOIN companion_candidate_import_runs active_run
      ON active_run.candidate_snapshot_id=snapshot.id AND active_run.league_id=snapshot.league_id
    JOIN companion_import_destinations active_destination
      ON active_destination.id=active_run.destination_id AND active_destination.league_id=active_run.league_id
    WHERE snapshot.id=? AND snapshot.league_id=? AND linked.game_year_id=?
      AND snapshot.season_year=? AND active_destination.franchise_season_id=?
    ORDER BY active_run.created_at DESC LIMIT 1`)
    .bind(candidateRun.active_snapshot_id_before,league.id,candidateRun.game_year_id,
      candidateRun.destination_season_year,candidateRun.franchise_season_id).first();
}

async function sharedBuildContext(db,league,candidateRun){
  const runSourceCounts=parse(candidateRun.source_counts_json)||{};
  const rosterCarryForward=runSourceCounts?.rosterCarryForward?.eligible===true
    ?runSourceCounts.rosterCarryForward:null;
  const activeSource=await activeSourceFor(db,league,candidateRun);
  if(rosterCarryForward&&(!activeSource
    ||String(activeSource.id)!==String(rosterCarryForward.sourceSnapshotId)
    ||String(candidateRun.active_snapshot_id_before||'')!==String(rosterCarryForward.sourceSnapshotId))){
    return{response:json({ok:false,release:RELEASE,
      error:'The active roster source changed during this rosterless import; build refused.',
      activeSnapshotChanged:false,activationPerformed:false},409)};
  }
  let coverage=runSourceCounts.sourceCoverage||null;
  if(!coverage){
    const report=await db.prepare(`SELECT source_markers_json,dataset_inventory_json
      FROM madden_discovery_reports WHERE league_id=? AND session_id=? LIMIT 1`)
      .bind(league.id,candidateRun.discovery_session_id).first();
    coverage=candidateSourceCoverage({
      sourceMarkers:parse(report?.source_markers_json)||{},
      datasetInventory:parse(report?.dataset_inventory_json)||[]
    },activeSource,{seasonYear:candidateRun.destination_season_year});
  }
  if(coverage.currentPeriodProof?.status!=='proven'||!coverage.currentPeriod
    ||coverage.currentWeekStatus!=='covered')return{response:json({ok:false,release:RELEASE,
    error:'The export must prove the current Madden period with both current-period schedule and statistics routes. Future schedule coverage alone cannot advance the league.',
    sourceCoverage:coverage,activeSnapshotChanged:false,activationPerformed:false},422)};
  const historicalBackfill=coverage.importMode==='historical-backfill';
  if(historicalBackfill&&!activeSource)return{response:json({ok:false,release:RELEASE,
    error:'Historical backfill requires the exact active Madden game year and franchise-season snapshot.',
    activeSnapshotChanged:false,activationPerformed:false},409)};
  const currentWeek=coverage.currentWeek;
  const sourcePeriods=Array.isArray(coverage.completePeriods)&&coverage.completePeriods.length
    ?coverage.completePeriods
    :(currentWeek===null||currentWeek===undefined?[]:[{stage:'regular-season',week:currentWeek,key:`regular-season:${currentWeek}`}]);
  const sourceWeeks=[...new Set(sourcePeriods.map(period=>Number(period.week)).filter(Number.isInteger))];
  return{activeSource,coverage,historicalBackfill,rosterCarryForward,sourcePeriods,sourceWeeks};
}

async function priorDomain(db,leagueId,snapshotId,domain){
  if(!snapshotId)return[];
  return rows(db,`SELECT external_id,data_json FROM league_snapshot_records
    WHERE league_id=? AND snapshot_id=? AND domain=? ORDER BY external_id`,leagueId,snapshotId,domain);
}

function parsedPrior(records){
  return(records||[]).map(row=>parse(row.data_json)).filter(Boolean);
}

function plannedRecords(domain,items,idFn){
  const selected=new Map();
  for(const [index,item] of (items||[]).entries()){
    const externalId=String(idFn(item,index)??'').trim();
    if(!externalId)throw new Error(`The ${domain} build plan contains a record without an external ID.`);
    selected.set(externalId,{domain,externalId,item});
  }
  return[...selected.values()].sort((left,right)=>left.externalId.localeCompare(right.externalId));
}

async function domainPlan({context,db,league,candidateRun,runs,shared,domain}){
  const activeSnapshotId=shared.activeSource?.id||null;
  if(domain==='teams'){
    const items=shared.historicalBackfill
      ?parsedPrior(await priorDomain(db,league.id,activeSnapshotId,'teams'))
      :await rows(db,`SELECT * FROM companion_canonical_teams_preview
        WHERE league_id=? AND mapping_run_id=? ORDER BY external_id`,league.id,runs.team.id);
    return{records:plannedRecords(domain,items,(item,index)=>item.external_id||index),meta:{}};
  }
  if(domain==='players'){
    const items=shared.historicalBackfill
      ?parsedPrior(await priorDomain(db,league.id,activeSnapshotId,'players'))
      :await rows(db,`SELECT * FROM companion_canonical_players_preview
        WHERE league_id=? AND mapping_run_id=? ORDER BY external_id`,league.id,runs.player.id);
    if(shared.rosterCarryForward&&(items.length!==Number(shared.activeSource.player_count)
      ||Number(shared.rosterCarryForward.playerCount)!==Number(shared.activeSource.player_count))){
      return{response:json({ok:false,release:RELEASE,
        error:'The carried-forward player preview does not exactly match the active roster snapshot.',
        activeSnapshotChanged:false,activationPerformed:false},409)};
    }
    return{records:plannedRecords(domain,items,(item,index)=>item.external_id||index),meta:{}};
  }
  if(domain==='games'){
    const [fresh,prior,yearlySchedule,sourceTeamRows,destinationTeams]=await Promise.all([
      rows(db,`SELECT * FROM companion_canonical_games_preview
        WHERE league_id=? AND mapping_run_id=? ORDER BY external_id`,league.id,runs.schedule.id),
      priorDomain(db,league.id,activeSnapshotId,'games'),
      db.prepare(`SELECT * FROM yearly_schedule_imports
        WHERE league_id=? AND franchise_season_id=? AND status='completed'
        ORDER BY revision DESC,finished_at DESC LIMIT 1`)
        .bind(league.id,candidateRun.franchise_season_id).first(),
      activeSnapshotId&&!shared.historicalBackfill
        ?priorDomain(db,league.id,activeSnapshotId,'teams'):Promise.resolve([]),
      activeSnapshotId&&!shared.historicalBackfill
        ?rows(db,`SELECT * FROM companion_canonical_teams_preview
          WHERE league_id=? AND mapping_run_id=? ORDER BY external_id`,league.id,runs.team.id):Promise.resolve([])
    ]);
    const yearlyGames=Array.isArray(parse(yearlySchedule?.schedule_json))?parse(yearlySchedule.schedule_json):[];
    let retainedYearlyGames=yearlyGames,retainedPriorGames=parsedPrior(prior),scheduleTeamRebase=null;
    if(activeSnapshotId&&!shared.historicalBackfill){
      const sourceTeams=sourceTeamRows.map(row=>({...(parse(row.data_json)||{}),external_id:row.external_id}));
      const {teamIdMap,audit}=buildTeamIdentityRebase(sourceTeams,destinationTeams);
      const yearlyRebase=rebaseScheduleTeamIds(retainedYearlyGames,teamIdMap);
      const priorRebase=rebaseScheduleTeamIds(retainedPriorGames,teamIdMap);
      retainedYearlyGames=yearlyRebase.records;
      retainedPriorGames=priorRebase.records;
      scheduleTeamRebase={
        ...audit,
        remappedGameCount:yearlyRebase.remappedGameCount+priorRebase.remappedGameCount,
        remappedReferenceCount:yearlyRebase.remappedReferenceCount+priorRebase.remappedReferenceCount
      };
    }
    const history=shared.historicalBackfill
      ?candidateHistoricalBackfill(fresh,prior,{keyName:'external_id',activeWeek:shared.activeSource.week_index,
        activePeriod:shared.coverage.activePeriod,sourceWeeks:shared.sourceWeeks,sourcePeriods:shared.sourcePeriods})
      :mergeYearlyScheduleCatalog({yearlyGames:retainedYearlyGames,priorGames:retainedPriorGames,currentGames:fresh,
        seasonYear:candidateRun.destination_season_year});
    const appliedKeys=new Set((history.appliedPeriods||[]).map(period=>period.key));
    const missingAppliedPeriods=shared.historicalBackfill
      ?shared.sourcePeriods.filter(period=>!appliedKeys.has(period.key)):[];
    if(shared.historicalBackfill&&(!history.applied||missingAppliedPeriods.length))return{response:json({
      ok:false,release:RELEASE,
      error:`Historical Week/period backfill did not produce games for ${missingAppliedPeriods.length?missingAppliedPeriods.map(candidatePeriodLabel).join(', '):'every retained period'}.`,
      sourceCoverage:shared.coverage,activeSnapshotChanged:false,activationPerformed:false
    },422)};
    return{
      records:plannedRecords(domain,history.records,(item,index)=>item.external_id||index),
      meta:{
        retained:Number(history.retained||0),
        retainedWeeks:history.retainedWeeks||[],
        applied:Number(history.applied||0),
        appliedPeriods:history.appliedPeriods||[],
        deduplicatedExternalIds:Number(history.deduplicatedExternalIds||0),
        teamIdentityRebase:scheduleTeamRebase,
        yearlySchedule:yearlySchedule?{
          importId:yearlySchedule.id,
          revision:Number(yearlySchedule.revision||1),
          scheduleSha256:yearlySchedule.schedule_sha256,
          gameCount:yearlyGames.length,
          finishedAt:yearlySchedule.finished_at,
          applied:!shared.historicalBackfill
        }:null
      }
    };
  }
  if(domain==='statistics'){
    const [fresh,prior]=await Promise.all([
      rows(db,`SELECT * FROM companion_canonical_statistics_preview
        WHERE league_id=? AND mapping_run_id=? ORDER BY external_key`,league.id,runs.statistics.id),
      priorDomain(db,league.id,activeSnapshotId,'statistics')
    ]);
    const history=shared.historicalBackfill
      ?candidateHistoricalBackfill(fresh,prior,{keyName:'external_key',activeWeek:shared.activeSource.week_index,
        activePeriod:shared.coverage.activePeriod,sourceWeeks:shared.sourceWeeks,sourcePeriods:shared.sourcePeriods})
      :candidateHistoryCarryForward(fresh,prior,{keyName:'external_key',currentWeek:shared.coverage.currentWeek});
    const appliedKeys=new Set((history.appliedPeriods||[]).map(period=>period.key));
    const missingAppliedPeriods=shared.historicalBackfill
      ?shared.sourcePeriods.filter(period=>!appliedKeys.has(period.key)):[];
    if(shared.historicalBackfill&&(!history.applied||missingAppliedPeriods.length))return{response:json({
      ok:false,release:RELEASE,
      error:`Historical Week/period backfill did not produce statistics for ${missingAppliedPeriods.length?missingAppliedPeriods.map(candidatePeriodLabel).join(', '):'every retained period'}.`,
      sourceCoverage:shared.coverage,activeSnapshotChanged:false,activationPerformed:false
    },422)};
    return{
      records:plannedRecords(domain,history.records,(item,index)=>item.external_key||index),
      meta:{
        retained:Number(history.retained||0),
        retainedWeeks:history.retainedWeeks||[],
        applied:Number(history.applied||0),
        appliedPeriods:history.appliedPeriods||[]
      }
    };
  }
  if(domain==='standings'){
    let capture=null;
    let items=[];
    if(shared.historicalBackfill){
      items=parsedPrior(await priorDomain(db,league.id,activeSnapshotId,'standings'));
    }else{
      const source=await standings(context,league.id,candidateRun.discovery_session_id);
      capture=source.capture;
      items=source.records;
    }
    return{
      records:plannedRecords(domain,items,(item,index)=>item.teamId||item.teamName||index),
      meta:{captureId:capture?.id||null,route:capture?.route_path||null}
    };
  }
  return{records:[],meta:{}};
}

function buildProgress(state){
  let processedCount=0,totalCount=0,knownTotal=true;
  for(const domain of BUILD_DOMAINS){
    const value=state.domains?.[domain];
    processedCount+=Number(value?.processed||0);
    if(value?.total===undefined||value?.total===null)knownTotal=false;
    else totalCount+=Number(value.total||0);
  }
  const current=state.domains?.[state.currentDomain]||{};
  const cursor=Number(current.cursor??current.processed??0);
  return{
    phase:state.currentDomain,
    processedCount,
    totalCount:knownTotal?totalCount:null,
    remainingCount:knownTotal?Math.max(0,totalCount-processedCount):null,
    checkpointToken:`${state.mode}:${state.planRevision||BUILD_PLAN_REVISION}:${state.currentDomain}:${cursor}`
  };
}

async function snapshotPeriodCoverage(db,leagueId,snapshotId){
  const periodRows=await rows(db,`SELECT domain,
      COALESCE(json_extract(data_json,'$.stage'),json_extract(data_json,'$.season_stage'),'regular-season') stage,
      CAST(COALESCE(json_extract(data_json,'$.week_index'),json_extract(data_json,'$.weekIndex'),json_extract(data_json,'$.week')) AS INTEGER) week
    FROM league_snapshot_records
    WHERE league_id=? AND snapshot_id=? AND domain IN ('games','statistics')
    GROUP BY domain,stage,week`,leagueId,snapshotId);
  const games=[],statistics=[];
  for(const row of periodRows){
    if(!Number.isInteger(Number(row.week)))continue;
    const item={stage:row.stage||'regular-season',week_index:Number(row.week)};
    if(row.domain==='games')games.push(item);
    if(row.domain==='statistics')statistics.push(item);
  }
  return{games,statistics};
}

async function finalizeSnapshot({db,league,candidateRun,runs,snapshot,manifest,shared,retention}){
  const state=buildState(manifest);
  const counts=Object.fromEntries(BUILD_DOMAINS.map(domain=>[domain,Number(state.domains?.[domain]?.total||0)]));
  const periods=await snapshotPeriodCoverage(db,league.id,snapshot.id);
  const mergedCoverage=candidateMergedPeriodCoverage(periods.games,periods.statistics,
    shared.historicalBackfill?shared.activeSource.week_index:null);
  const gameMeta=state.domains?.games?.meta||{};
  const statisticMeta=state.domains?.statistics?.meta||{};
  const standingMeta=state.domains?.standings?.meta||{};
  const warnings=candidateCoverageWarnings(shared.coverage);
  if(shared.historicalBackfill){
    warnings.push(`Historical backfill applied ${gameMeta.applied||0} game record(s) and ${statisticMeta.applied||0} statistic record(s) across ${shared.sourcePeriods.length} retained period(s) without changing active Regular Season Week ${shared.activeSource.week_index}.`);
    if(mergedCoverage.missingWeeks.length)warnings.push(`Historical coverage still missing through active Week ${shared.activeSource.week_index}: ${mergedCoverage.missingWeeks.map(week=>`Week ${week}`).join(', ')}.`);
  }else{
    if(shared.activeSource&&gameMeta.retained)warnings.push(`${gameMeta.retained} known same-season game record(s) were carried forward from active snapshot ${shared.activeSource.id}.`);
    if(shared.activeSource&&statisticMeta.retained)warnings.push(`${statisticMeta.retained} earlier statistic record(s) were carried forward from active snapshot ${shared.activeSource.id}.`);
    if(Number(gameMeta.teamIdentityRebase?.remappedTeamCount||0))warnings.push(
      `Retained schedule team IDs were safely rebased for ${Number(gameMeta.teamIdentityRebase.remappedTeamCount)} uniquely matched teams before weekly results were overlaid.`
    );
    if(Number(gameMeta.deduplicatedExternalIds||0))warnings.push(
      `${Number(gameMeta.deduplicatedExternalIds)} duplicate retained Madden game ID(s) were resolved using the current weekly schedule authority.`
    );
  }
  if(candidateRun.active_snapshot_id_before&&!shared.activeSource)warnings.push('The active snapshot was not eligible for same-season history carry-forward; no prior weekly records were merged.');
  if(counts.teams!==32)warnings.push(`Expected 32 teams; found ${counts.teams}.`);
  if(!counts.players)warnings.push('No players were available.');
  if(!counts.games)warnings.push('No games were available.');
  if(!counts.statistics)warnings.push('No statistics were available.');
  if(!counts.standings)warnings.push('No standings payload was available.');
  if(Number(runs.player.warning_count||0))warnings.push(`Player mapper reported ${runs.player.warning_count} warning(s).`);
  if(Number(runs.schedule.warning_count||0))warnings.push(`Schedule mapper reported ${runs.schedule.warning_count} warning(s).`);
  if(Number(runs.statistics.warning_count||0))warnings.push(`Statistics mapper reported ${runs.statistics.warning_count} warning(s).`);
  if(shared.rosterCarryForward){
    warnings.push(`Players, contracts, roster assignments, and Free Agent state were carried forward from active snapshot ${shared.activeSource.id}.`);
    if(Number(shared.rosterCarryForward?.teamIdentityRebase?.remappedTeamCount||0))warnings.push(
      `Madden team IDs were safely rebased for ${Number(shared.rosterCarryForward.teamIdentityRebase.remappedTeamCount)} uniquely matched teams; roster assignments remain unchanged.`
    );
  }
  const currentPeriod=shared.historicalBackfill?snapshotCurrentPeriod(shared.activeSource):shared.coverage.currentPeriod;
  const currentPeriodProof=shared.historicalBackfill
    ?(parse(shared.activeSource.manifest_json)?.currentPeriodProof||shared.coverage.currentPeriodProof)
    :shared.coverage.currentPeriodProof;
  state.status='complete';
  state.currentDomain='complete';
  state.completedAt=new Date().toISOString();
  const completedManifest={
    ...manifest,
    release:RELEASE,
    storageRetention:retention,
    sourceCoverage:shared.coverage,
    importMode:shared.coverage.importMode,
    rosterCarryForward:shared.rosterCarryForward?{
      ...shared.rosterCarryForward,
      eligible:true,
      carriedPlayerMappingRunId:runs.player.id,
      assignmentsUnchanged:true,
      sourcePlayerRecordsUnchanged:true,
      freeAgentInterpretedAsZero:false
    }:null,
    yearlySchedule:gameMeta.yearlySchedule||null,
    historyCarryForward:{
      sourceSnapshotId:shared.activeSource?.id||null,
      games:shared.historicalBackfill?0:Number(gameMeta.retained||0),
      statistics:shared.historicalBackfill?0:Number(statisticMeta.retained||0),
      gameWeeks:shared.historicalBackfill?[]:(gameMeta.retainedWeeks||[]),
      statisticWeeks:shared.historicalBackfill?[]:(statisticMeta.retainedWeeks||[])
    },
    historicalBackfill:shared.historicalBackfill?{
      sourceSnapshotId:shared.activeSource.id,
      sourceWeeks:shared.sourceWeeks,
      sourcePeriods:shared.sourcePeriods,
      liveWeekPreserved:Number(shared.activeSource.week_index),
      gamesApplied:Number(gameMeta.applied||0),
      statisticsApplied:Number(statisticMeta.applied||0),
      teamsPreserved:counts.teams,
      playersPreserved:counts.players,
      standingsPreserved:counts.standings,
      mergedCoverage
    }:null,
    sources:{
      teamMappingRunId:runs.team.id,
      playerMappingRunId:runs.player.id,
      scheduleMappingRunId:runs.schedule.id,
      statisticsMappingRunId:runs.statistics.id,
      standingsCaptureId:standingMeta.captureId||null,
      standingsRoute:standingMeta.route||null
    },
    pinnedMappingRuns:{teams:runs.team.id,players:runs.player.id,schedule:runs.schedule.id,statistics:runs.statistics.id},
    currentPeriod,
    currentPeriodProof,
    scheduleHorizon:mergedCoverage.gamePeriods?.at(-1)||shared.coverage.scheduleHorizon,
    discordScheduleTransition:scheduleAdvanceDecision(shared.activeSource,{
      period:currentPeriod,proof:currentPeriodProof,seasonYear:candidateRun.destination_season_year
    }),
    buildState:state,
    builtAt:new Date().toISOString(),
    immutable:true,
    privateCandidate:true,
    activationPerformed:false,
    activeSnapshotChanged:false
  };
  await db.prepare(`UPDATE league_snapshots SET season_year=?,week_index=?,team_count=?,player_count=?,game_count=?,
      statistic_count=?,standing_count=?,warning_count=?,warnings_json=?,manifest_json=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND league_id=? AND status='pending-validation'`)
    .bind(Number(candidateRun.destination_season_year)||null,currentPeriod?.week??null,counts.teams,counts.players,
      counts.games,counts.statistics,counts.standings,warnings.length,JSON.stringify(warnings),
      JSON.stringify(completedManifest),snapshot.id,league.id).run();
  return{manifest:completedManifest,warnings,counts,state};
}

async function snapshotResponse(db,leagueId,snapshotId,state,retention,extra={}){
  const snapshot=publicSnapshot(await db.prepare(`SELECT * FROM league_snapshots WHERE id=? AND league_id=?`)
    .bind(snapshotId,leagueId).first());
  const progress=buildProgress(state);
  return json({
    ok:true,
    release:RELEASE,
    complete:state.status==='complete',
    snapshotAvailable:true,
    snapshot,
    buildJob:{snapshotId,...progress,recordLimit:BUILD_RECORD_LIMIT},
    storageRetention:retention,
    privateCandidate:true,
    activeSnapshotChanged:false,
    activationPerformed:false,
    ...extra
  });
}

export async function onRequestGet(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);
  const auth=await requireCommissioner(context);
  if(!auth.authorized)return auth.response;
  const db=database(context.env),league=await resolveLeague(context.env,slug);
  if(!db||!league||auth.session.membership?.leagueId!==league.id)return json({ok:false,error:'Not found.'},404);
  const snapshot=await getLatest(db,league.id);
  return json({ok:true,release:RELEASE,snapshotAvailable:Boolean(snapshot),snapshot,activeSnapshotChanged:false,activationPerformed:false});
}

export async function onRequestPost(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);
  const auth=await requireCommissioner(context);
  if(!auth.authorized)return auth.response;
  const db=database(context.env),league=await resolveLeague(context.env,slug);
  if(!db||!league||auth.session.membership?.leagueId!==league.id)return json({ok:false,error:'Not found.'},404);
  let body={};
  try{body=await context.request.json();}catch{}
  try{
    const buildAction=String(body?.action||'start').trim().toLowerCase();
    if(!['legacy','start','next'].includes(buildAction))return json({ok:false,error:'A valid snapshot build action is required.',release:RELEASE},400);
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
      team:String(body?.teamMappingRunId||candidateRun.team_mapping_run_id||'').trim(),
      player:String(body?.playerMappingRunId||candidateRun.player_mapping_run_id||'').trim(),
      schedule:String(body?.scheduleMappingRunId||candidateRun.schedule_mapping_run_id||'').trim(),
      statistics:String(body?.statisticsMappingRunId||candidateRun.statistics_mapping_run_id||'').trim()
    };
    const [teamRun,playerRun,scheduleRun,statisticsRun]=await Promise.all([
      selectedRun(db,'companion_team_mapping_runs',league.id,requested.team),
      selectedRun(db,'companion_player_mapping_runs',league.id,requested.player),
      selectedRun(db,'companion_schedule_mapping_runs',league.id,requested.schedule),
      selectedRun(db,'companion_statistics_mapping_runs',league.id,requested.statistics)
    ]);
    const missing=[];
    if(!teamRun)missing.push('teams');
    if(!playerRun)missing.push('players');
    if(!scheduleRun)missing.push('schedule');
    if(!statisticsRun)missing.push('statistics');
    if(missing.length)return json({ok:false,error:`Map required domains before building a snapshot: ${missing.join(', ')}.`,release:RELEASE},422);
    const runs={team:teamRun,player:playerRun,schedule:scheduleRun,statistics:statisticsRun};
    const pinned={team:candidateRun.team_mapping_run_id,player:candidateRun.player_mapping_run_id,
      schedule:candidateRun.schedule_mapping_run_id,statistics:candidateRun.statistics_mapping_run_id};
    const mismatch=Object.entries(pinned).filter(([key,value])=>value&&String(value)!==String(requested[key]||''));
    if(mismatch.length)return json({ok:false,error:`Candidate mapping run mismatch: ${mismatch.map(([key])=>key).join(', ')}.`,release:RELEASE},409);
    const sourceMismatch=Object.values(runs).filter(run=>String(run.discovery_session_id||'')!==String(candidateRun.discovery_session_id));
    if(sourceMismatch.length)return json({ok:false,error:'Candidate mapping runs must all come from the exact analyzed discovery session.',release:RELEASE},409);

    const retention={mode:'non-destructive',deletedSnapshots:0,deletedPreviewRows:0};
    const requestedSnapshotId=String(body?.snapshotId||candidateRun.candidate_snapshot_id||'').trim();
    let snapshot=requestedSnapshotId?await db.prepare(`SELECT snapshot.*,linked.game_year_id linked_game_year_id
      FROM league_snapshots snapshot
      JOIN game_year_snapshots linked ON linked.snapshot_id=snapshot.id AND linked.league_id=snapshot.league_id
      WHERE snapshot.id=? AND snapshot.league_id=? AND snapshot.status='pending-validation' LIMIT 1`)
      .bind(requestedSnapshotId,league.id).first():null;
    let manifest=parse(snapshot?.manifest_json)||{};
    const resumable=Boolean(snapshot
      &&[BUILD_MODE,...LEGACY_BUILD_MODES].includes(manifest?.buildState?.mode)
      &&String(manifest.candidateImportRunId||'')===candidateRun.id
      &&String(snapshot.linked_game_year_id||'')===String(candidateRun.game_year_id)
      &&Object.entries({teams:requested.team,players:requested.player,schedule:requested.schedule,statistics:requested.statistics})
        .every(([key,value])=>String(manifest?.pinnedMappingRuns?.[key]||'')===String(value||'')));
    if(snapshot&&!resumable)return json({ok:false,error:'The pending snapshot does not belong to this exact checkpointed candidate import.',release:RELEASE},409);
    if(buildAction==='next'&&!resumable)return json({ok:false,error:'The pending snapshot build could not be resumed.',release:RELEASE},409);

    const shared=await sharedBuildContext(db,league,candidateRun);
    if(shared.response)return shared.response;
    if(!snapshot){
      const snapshotId=crypto.randomUUID();
      manifest=initialManifest({league,candidateRun,requested,coverage:shared.coverage,retention});
      const period=manifest.currentPeriod;
      await db.batch([
        db.prepare(`INSERT INTO league_snapshots
          (id,league_id,status,season_year,week_index,team_count,player_count,game_count,statistic_count,
           standing_count,warning_count,warnings_json,manifest_json)
          VALUES (?,?, 'pending-validation',?,?,?,?,?,?,?,?,?,?)`)
          .bind(snapshotId,league.id,Number(candidateRun.destination_season_year)||null,period?.week??null,
            0,0,0,0,0,0,'[]',JSON.stringify(manifest)),
        db.prepare(`INSERT INTO game_year_snapshots
          (game_year_id,league_id,snapshot_id,snapshot_status) VALUES (?,?,?,'candidate')`)
          .bind(candidateRun.game_year_id,league.id,snapshotId),
        db.prepare(`UPDATE companion_candidate_import_runs SET candidate_snapshot_id=?,updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND league_id=? AND status='running' AND current_phase='build-candidate'`)
          .bind(snapshotId,candidateRun.id,league.id)
      ]);
      snapshot=await db.prepare(`SELECT snapshot.*,linked.game_year_id linked_game_year_id
        FROM league_snapshots snapshot
        JOIN game_year_snapshots linked ON linked.snapshot_id=snapshot.id AND linked.league_id=snapshot.league_id
        WHERE snapshot.id=? AND snapshot.league_id=?`).bind(snapshotId,league.id).first();
      return snapshotResponse(db,league.id,snapshotId,buildState(manifest),retention,{
        importMode:shared.coverage.importMode,historicalBackfill:null,
        mappingRunIds:{teams:teamRun.id,players:playerRun.id,schedule:scheduleRun.id,statistics:statisticsRun.id}
      });
    }

    if(buildAction==='start'){
      await db.prepare(`UPDATE companion_candidate_import_runs SET candidate_snapshot_id=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND league_id=?`).bind(snapshot.id,candidateRun.id,league.id).run();
      return snapshotResponse(db,league.id,snapshot.id,buildState(manifest),retention,{
        importMode:shared.coverage.importMode,historicalBackfill:manifest.historicalBackfill||null,
        mappingRunIds:{teams:teamRun.id,players:playerRun.id,schedule:scheduleRun.id,statistics:statisticsRun.id}
      });
    }

    const state=buildState(manifest);
    if(state.status==='complete')return snapshotResponse(db,league.id,snapshot.id,state,retention,{
      importMode:shared.coverage.importMode,historicalBackfill:manifest.historicalBackfill||null,
      mappingRunIds:{teams:teamRun.id,players:playerRun.id,schedule:scheduleRun.id,statistics:statisticsRun.id}
    });
    if(state.currentDomain==='finalize'){
      const finalized=await finalizeSnapshot({db,league,candidateRun,runs,snapshot,manifest,shared,retention});
      return snapshotResponse(db,league.id,snapshot.id,finalized.state,retention,{
        importMode:shared.coverage.importMode,
        historicalBackfill:finalized.manifest.historicalBackfill,
        mappingRunIds:{teams:teamRun.id,players:playerRun.id,schedule:scheduleRun.id,statistics:statisticsRun.id},
        playerCount:finalized.counts.players
      });
    }

    const domain=BUILD_DOMAINS.includes(state.currentDomain)?state.currentDomain:BUILD_DOMAINS[0];
    const plan=await domainPlan({context,db,league,candidateRun,runs,shared,domain});
    if(plan.response)return plan.response;
    const existing=Number((await db.prepare(`SELECT COUNT(*) count FROM league_snapshot_records
      WHERE snapshot_id=? AND league_id=? AND domain=?`).bind(snapshot.id,league.id,domain).first())?.count||0);
    if(existing>plan.records.length)return json({ok:false,
      error:`The pending snapshot contains more ${domain} records than its immutable build plan.`,release:RELEASE},409);
    const domainState=state.domains?.[domain]||{};
    const hasCurrentCursor=domainState.planRevision===BUILD_PLAN_REVISION
      &&Number.isInteger(Number(domainState.cursor))&&Number(domainState.cursor)>=0;
    // v2 used stored row count as its plan offset. That cannot represent a
    // duplicate-ID repair, so v3 deliberately replays this private domain
    // from cursor zero with idempotent upserts and leaves every audit intact.
    const cursor=hasCurrentCursor?Number(domainState.cursor):0;
    if(cursor>plan.records.length)return json({ok:false,
      error:`The pending snapshot ${domain} cursor exceeds its immutable build plan.`,release:RELEASE},409);
    const requestLimit=Math.max(1,Math.min(BUILD_RECORD_LIMIT,Math.floor(Number(body?.limit)||BUILD_RECORD_LIMIT)));
    const pending=plan.records.slice(cursor,cursor+requestLimit).map(record=>db.prepare(`INSERT INTO league_snapshot_records
      (snapshot_id,league_id,domain,external_id,data_json) VALUES (?,?,?,?,?)
      ON CONFLICT(snapshot_id,domain,external_id) DO UPDATE SET data_json=excluded.data_json`)
      .bind(snapshot.id,league.id,record.domain,record.externalId,JSON.stringify(record.item)));
    if(pending.length)await db.batch(pending);
    const storedCount=Number((await db.prepare(`SELECT COUNT(*) count FROM league_snapshot_records
      WHERE snapshot_id=? AND league_id=? AND domain=?`).bind(snapshot.id,league.id,domain).first())?.count||0);
    const nextCursor=cursor+pending.length;
    if(nextCursor===plan.records.length&&storedCount!==plan.records.length)return json({ok:false,
      error:`The pending snapshot stored ${storedCount} unique ${domain} records but its immutable build plan contains ${plan.records.length}.`,
      release:RELEASE},409);
    const complete=nextCursor===plan.records.length;
    state.domains[domain]={
      total:plan.records.length,
      processed:nextCursor,
      cursor:nextCursor,
      storedCount,
      complete,
      planRevision:BUILD_PLAN_REVISION,
      meta:plan.meta||{}
    };
    if(complete){
      const nextIndex=BUILD_DOMAINS.indexOf(domain)+1;
      state.currentDomain=nextIndex<BUILD_DOMAINS.length?BUILD_DOMAINS[nextIndex]:'finalize';
    }
    manifest={...manifest,release:RELEASE,buildState:state};
    const countColumn={teams:'team_count',players:'player_count',games:'game_count',statistics:'statistic_count',standings:'standing_count'}[domain];
    await db.prepare(`UPDATE league_snapshots SET ${countColumn}=?,manifest_json=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND league_id=? AND status='pending-validation'`)
      .bind(storedCount,JSON.stringify(manifest),snapshot.id,league.id).run();
    return snapshotResponse(db,league.id,snapshot.id,state,retention,{
      importMode:shared.coverage.importMode,
      historicalBackfill:manifest.historicalBackfill||null,
      mappingRunIds:{teams:teamRun.id,players:playerRun.id,schedule:scheduleRun.id,statistics:statisticsRun.id},
      playerCount:Number(state.domains?.players?.total||0),
      recordLimit:requestLimit
    });
  }catch(error){
    return json({ok:false,error:'Pending snapshot build failed.',detail:error?.message||String(error),release:RELEASE},500);
  }
}
