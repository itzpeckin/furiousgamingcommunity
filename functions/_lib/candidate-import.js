export const CANDIDATE_IMPORT_PHASES = Object.freeze([
  'analyze-source',
  'classify-captures',
  'map-teams',
  'map-players',
  'map-schedule',
  'map-statistics',
  'build-candidate',
  'validate-candidate',
  'preview-ready'
]);

export const parseCandidateJson = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
};

export function candidateCompleteness(freeAgentStatus) {
  if (freeAgentStatus === 'located' || freeAgentStatus === 'empty-confirmed') return 'complete';
  if (freeAgentStatus === 'blocked' || freeAgentStatus === 'missing') return 'rostered-players-only';
  return 'review-required';
}

export function nextCandidatePhase(currentPhase) {
  const index = CANDIDATE_IMPORT_PHASES.indexOf(String(currentPhase || ''));
  return index >= 0 && index + 1 < CANDIDATE_IMPORT_PHASES.length
    ? CANDIDATE_IMPORT_PHASES[index + 1]
    : null;
}

export function candidateProgress(phaseIndex, status) {
  if (status === 'preview-ready') return 100;
  const bounded = Math.max(0, Math.min(CANDIDATE_IMPORT_PHASES.length - 1, Number(phaseIndex || 0)));
  return Math.round((bounded / (CANDIDATE_IMPORT_PHASES.length - 1)) * 100);
}

export function candidateRetryGuidance(phase, message) {
  const label = String(phase || 'candidate import');
  return {
    safeToRetry: true,
    resumeFromPhase: label,
    message: String(message || `${label} failed. Correct the reported source issue and retry this candidate import.`),
    activeSnapshotPreserved: true
  };
}

const WEEK_ROUTE = /(?:^|\/)week\/(pre|reg|post)\/(\d+)(?:\/|$)/i;
const PERIOD_STAGE_ORDER = Object.freeze({ preseason:0, 'regular-season':1, playoffs:2 });

export function candidateCanonicalStage(value) {
  const stage=String(value??'').trim().toLowerCase();
  if (['0','pre','preseason'].includes(stage)) return 'preseason';
  if (['2','post','postseason','playoff','playoffs'].includes(stage)) return 'playoffs';
  if (['1','reg','regular','regular-season'].includes(stage)) return 'regular-season';
  return null;
}

export function candidatePeriodKey(period) {
  const stage=candidateCanonicalStage(period?.stage);
  const week=Number.parseInt(String(period?.week??''),10);
  return stage&&Number.isInteger(week)&&week>=0&&week<=40?`${stage}:${week}`:null;
}

export function candidatePeriodLabel(period) {
  const stage=candidateCanonicalStage(period?.stage);
  const week=Number.parseInt(String(period?.week??''),10);
  if(!stage||!Number.isInteger(week))return 'Unknown period';
  const label=stage==='preseason'?'Preseason':stage==='playoffs'?'Playoffs':'Regular Season';
  return `${label} Week ${week}`;
}

function periodFromRoute(routePath) {
  const match=String(routePath||'').match(WEEK_ROUTE);
  if(!match)return null;
  const stage=candidateCanonicalStage(match[1]),week=Number.parseInt(match[2],10);
  return stage&&Number.isInteger(week)?{stage,week,key:`${stage}:${week}`} : null;
}

function comparePeriods(left,right) {
  const stage=(PERIOD_STAGE_ORDER[left?.stage]??99)-(PERIOD_STAGE_ORDER[right?.stage]??99);
  return stage||Number(left?.week||0)-Number(right?.week||0);
}

export const candidateComparePeriods = comparePeriods;

function uniquePeriods(values) {
  const periods=new Map();
  for(const value of values||[]){
    const period=typeof value==='string'&&value.includes(':')
      ?(()=>{const [stage,week]=value.split(':');return{stage:candidateCanonicalStage(stage),week:Number.parseInt(week,10)}})()
      :value;
    const key=candidatePeriodKey(period);
    if(key)periods.set(key,{stage:candidateCanonicalStage(period.stage),week:Number(period.week),key});
  }
  return [...periods.values()].sort(comparePeriods);
}

function weekNumbers(values) {
  return [...new Set((values || [])
    .map(value => Number.parseInt(String(value), 10))
    .filter(value => Number.isInteger(value) && value >= 0 && value <= 40))]
    .sort((left, right) => left - right);
}

export function candidateSourceCoverage(report = {}, activeWeekIndex = null) {
  const sourceMarkers = report.sourceMarkers || report.source_markers || {};
  const datasetInventory = Array.isArray(report.datasetInventory || report.dataset_inventory)
    ? (report.datasetInventory || report.dataset_inventory) : [];
  const markerWeeks = weekNumbers([
    sourceMarkers?.week?.expected,
    ...(Array.isArray(sourceMarkers?.week?.observed) ? sourceMarkers.week.observed : [])
  ]);
  const routes = datasetInventory.map(item => ({
    datasetType: String(item?.datasetType || item?.dataset_type || ''),
    routePath: String(item?.routePath || item?.route_path || '')
  }));
  const schedulePeriods=uniquePeriods(routes.filter(item=>item.datasetType==='schedule').map(item=>periodFromRoute(item.routePath)));
  const statisticsPeriods=uniquePeriods(routes.filter(item=>item.datasetType==='statistics').map(item=>periodFromRoute(item.routePath)));
  const scheduleKeys=new Set(schedulePeriods.map(period=>period.key));
  const statisticKeys=new Set(statisticsPeriods.map(period=>period.key));
  const completePeriods=uniquePeriods(schedulePeriods.filter(period=>statisticKeys.has(period.key)));
  const partialPeriods=uniquePeriods([
    ...schedulePeriods.filter(period=>!statisticKeys.has(period.key)),
    ...statisticsPeriods.filter(period=>!scheduleKeys.has(period.key))
  ]);
  const routeWeek = item => periodFromRoute(item.routePath)?.week ?? null;
  const scheduleWeeks = weekNumbers(schedulePeriods.map(period=>period.week));
  const statisticsWeeks = weekNumbers(statisticsPeriods.map(period=>period.week));
  const observedWeeks = weekNumbers([...markerWeeks, ...scheduleWeeks, ...statisticsWeeks]);
  const observedPeriods=uniquePeriods([...schedulePeriods,...statisticsPeriods]);
  const markerStage=candidateCanonicalStage(sourceMarkers?.stage?.expected
    ??(Array.isArray(sourceMarkers?.stage?.observed)?sourceMarkers.stage.observed.at(-1):null));
  if(!observedPeriods.length&&markerStage){
    for(const week of markerWeeks)observedPeriods.push({stage:markerStage,week,key:`${markerStage}:${week}`});
  }
  observedPeriods.sort(comparePeriods);
  const currentPeriod=observedPeriods.at(-1)||null;
  const currentWeek = currentPeriod?.week ?? (observedWeeks.length ? observedWeeks.at(-1) : null);
  const activeWeek = activeWeekIndex !== null && activeWeekIndex !== undefined && activeWeekIndex !== ''
    && Number.isInteger(Number(activeWeekIndex)) ? Number(activeWeekIndex) : null;
  const activePeriod=activeWeek===null?null:{stage:'regular-season',week:activeWeek,key:`regular-season:${activeWeek}`};
  const suppliedWeeks = new Set([...scheduleWeeks, ...statisticsWeeks]);
  const missingWeeks = activeWeek !== null && currentWeek !== null && currentWeek > activeWeek + 1
    ? Array.from({ length: currentWeek - activeWeek - 1 }, (_, index) => activeWeek + index + 1)
      .filter(week => !suppliedWeeks.has(week))
    : [];
  const scheduleCurrentWeek = Boolean(currentPeriod&&scheduleKeys.has(currentPeriod.key));
  const statisticsCurrentWeek = Boolean(currentPeriod&&statisticKeys.has(currentPeriod.key));
  const currentWeekStatus = currentWeek === null
    ? 'unknown'
    : scheduleCurrentWeek && statisticsCurrentWeek ? 'covered' : 'partial';
  const periodComparison=activePeriod&&currentPeriod?comparePeriods(currentPeriod,activePeriod):null;
  const continuityStatus = activeWeek === null || currentWeek === null
    ? 'unknown'
    : periodComparison<0 ? 'historical-backfill'
      : missingWeeks.length ? 'gap-detected' : 'continuous';
  const importMode = activeWeek === null || currentWeek === null
    ? 'unknown'
    : periodComparison<0 ? 'historical-backfill'
      : periodComparison===0 ? 'same-week' : 'forward';
  return {
    activeWeek,
    activePeriod,
    currentWeek,
    currentPeriod,
    observedWeeks,
    observedPeriods,
    scheduleWeeks,
    schedulePeriods,
    statisticsWeeks,
    statisticsPeriods,
    completePeriods,
    partialPeriods,
    scheduleCurrentWeek,
    statisticsCurrentWeek,
    currentWeekStatus,
    continuityStatus,
    importMode,
    missingWeeks
  };
}

export function candidateCoverageWarnings(coverage = {}) {
  const warnings = [];
  if (coverage.currentWeek === null || coverage.currentWeek === undefined) {
    warnings.push('The analyzed capture does not prove a Madden week. Review source coverage before activation.');
    return warnings;
  }
  const currentLabel=candidatePeriodLabel(coverage.currentPeriod||{stage:'regular-season',week:coverage.currentWeek});
  if (!coverage.scheduleCurrentWeek) warnings.push(`${currentLabel} schedule coverage is missing.`);
  if (!coverage.statisticsCurrentWeek) warnings.push(`${currentLabel} statistics coverage is missing.`);
  if (coverage.importMode === 'historical-backfill') {
    const periods=uniquePeriods(coverage.completePeriods||[]);
    const scope=periods.length>1?`${periods.length} retained periods from ${candidatePeriodLabel(periods[0])} through ${candidatePeriodLabel(periods.at(-1))}`:`Historical ${currentLabel}`;
    warnings.push(`${scope} will be backfilled while preserving the active Regular Season Week ${coverage.activeWeek} teams, players, rosters, standings, and live-week position.`);
  }
  if(Array.isArray(coverage.partialPeriods)&&coverage.partialPeriods.length)warnings.push(`Incomplete retained periods will not be imported: ${coverage.partialPeriods.map(candidatePeriodLabel).join(', ')}.`);
  if (Array.isArray(coverage.missingWeeks) && coverage.missingWeeks.length) {
    warnings.push(`Week coverage gap after active Week ${coverage.activeWeek}: missing ${coverage.missingWeeks.map(week => `Week ${week}`).join(', ')}.`);
  }
  return warnings;
}

function candidateRecord(row) {
  return typeof row?.data_json === 'string'
    ? parseCandidateJson(row.data_json, null)
    : row?.data ?? row;
}

function recordWeek(record) {
  const value = record?.week_index ?? record?.weekIndex ?? record?.week;
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function recordPeriod(record) {
  const routed=periodFromRoute(record?.source_route_path??record?.sourceRoutePath);
  if(routed)return routed;
  const week=recordWeek(record);
  // Snapshots created before 7.3.4.6 only persisted week_index. Those rows are
  // regular-season records unless an authoritative capture route says otherwise.
  const stage=candidateCanonicalStage(record?.stage??record?.season_stage??record?.seasonStage)
    ??(week===null?null:'regular-season');
  const key=candidatePeriodKey({stage,week});
  return key?{stage,week,key}:null;
}

export function candidateNormalizePeriod(record) {
  if(!record||typeof record!=='object')return record;
  const period=recordPeriod(record);
  return period?{...record,stage:period.stage,week_index:period.week}:record;
}

export function candidateHistoryCarryForward(freshRecords = [], priorRows = [], options = {}) {
  const keyName = String(options.keyName || 'external_id');
  const currentWeek = options.currentWeek === null || options.currentWeek === undefined
    ? null : Number(options.currentWeek);
  const output = new Map((freshRecords || []).map(item => {
    const normalized=candidateNormalizePeriod(item);
    return [String(normalized?.[keyName] ?? ''),normalized];
  }));
  const retainedWeeks = new Set();
  let retained = 0;
  for (const row of priorRows || []) {
    const item = candidateNormalizePeriod(candidateRecord(row));
    const key = String(row?.external_id ?? item?.[keyName] ?? '');
    const week = recordWeek(item);
    if (!item || !key || output.has(key)) continue;
    if (currentWeek !== null && week !== null && week >= currentWeek) continue;
    output.set(key, item);
    retained += 1;
    if (week !== null) retainedWeeks.add(week);
  }
  return {
    records: [...output.values()],
    retained,
    retainedWeeks: [...retainedWeeks].sort((left, right) => left - right)
  };
}

export function candidateHistoricalBackfill(freshRecords = [], priorRows = [], options = {}) {
  const keyName = String(options.keyName || 'external_id');
  const activeWeek = Number.parseInt(String(options.activeWeek ?? ''), 10);
  const activePeriod=options.activePeriod||{stage:'regular-season',week:activeWeek};
  const sourceWeeks = new Set(weekNumbers(options.sourceWeeks || []));
  const sourcePeriods=new Set(uniquePeriods(options.sourcePeriods||[]).map(period=>period.key));
  const output = new Map();
  for (const row of priorRows || []) {
    const item = candidateNormalizePeriod(candidateRecord(row));
    const key = String(row?.external_id ?? item?.[keyName] ?? '');
    if (item && key) output.set(key,item);
  }
  let applied = 0;
  let rejected = 0;
  const appliedWeeks = new Set();
  const appliedPeriods = new Set();
  for (const item of freshRecords || []) {
    const normalized=candidateNormalizePeriod(item);
    const key = String(normalized?.[keyName] ?? '');
    const period=recordPeriod(normalized),week=period?.week??null;
    const periodAllowed=period&&sourcePeriods.size?sourcePeriods.has(period.key):sourceWeeks.has(week);
    const eligible = Boolean(
      normalized
      && key
      && week !== null
      && periodAllowed
      && activePeriod
      && comparePeriods(period,activePeriod)<0
    );
    if (!eligible) {
      rejected += 1;
      continue;
    }
    output.set(key,normalized);
    applied += 1;
    appliedWeeks.add(week);
    appliedPeriods.add(period.key);
  }
  return {
    records:[...output.values()],
    applied,
    rejected,
    appliedWeeks:[...appliedWeeks].sort((left,right)=>left-right),
    appliedPeriods:uniquePeriods([...appliedPeriods]),
    preserved:output.size-applied
  };
}

export function candidateMergedWeekCoverage(games = [], statistics = [], activeWeekIndex = null) {
  const activeWeek = Number.parseInt(String(activeWeekIndex ?? ''),10);
  const gameWeeks = weekNumbers((games || []).map(recordWeek));
  const statisticWeeks = weekNumbers((statistics || []).map(recordWeek));
  if (!Number.isInteger(activeWeek) || activeWeek < 1) {
    return {activeWeek:null,gameWeeks,statisticWeeks,completeWeeks:[],missingWeeks:[]};
  }
  const gameSet=new Set(gameWeeks),statisticSet=new Set(statisticWeeks);
  const expectedWeeks=Array.from({length:activeWeek},(_,index)=>index+1);
  const completeWeeks=expectedWeeks.filter(week=>gameSet.has(week)&&statisticSet.has(week));
  const missingWeeks=expectedWeeks.filter(week=>!gameSet.has(week)||!statisticSet.has(week));
  return {activeWeek,gameWeeks,statisticWeeks,completeWeeks,missingWeeks};
}


export function candidateMergedPeriodCoverage(games=[],statistics=[],activeWeekIndex=null){
  const gamePeriods=uniquePeriods((games||[]).map(recordPeriod));
  const statisticPeriods=uniquePeriods((statistics||[]).map(recordPeriod));
  const gameSet=new Set(gamePeriods.map(period=>period.key)),statisticSet=new Set(statisticPeriods.map(period=>period.key));
  const allPeriods=uniquePeriods([...gamePeriods,...statisticPeriods]);
  const completePeriods=allPeriods.filter(period=>gameSet.has(period.key)&&statisticSet.has(period.key));
  const partialPeriods=allPeriods.filter(period=>!gameSet.has(period.key)||!statisticSet.has(period.key));
  const regularGames=(games||[]).filter(record=>recordPeriod(record)?.stage==='regular-season');
  const regularStatistics=(statistics||[]).filter(record=>recordPeriod(record)?.stage==='regular-season');
  const regular=candidateMergedWeekCoverage(regularGames,regularStatistics,activeWeekIndex);
  return{...regular,gamePeriods,statisticPeriods,completePeriods,partialPeriods};
}

export function publicCandidateRun(row) {
  if (!row) return null;
  const activationPerformed=Boolean(
    row.candidate_snapshot_id
    && row.active_snapshot_id_after
    && String(row.candidate_snapshot_id)===String(row.active_snapshot_id_after)
  );
  return {
    id: row.id,
    destinationId: row.destination_id,
    discoverySessionId: row.discovery_session_id,
    sourceFingerprint: row.source_fingerprint,
    status: row.status,
    completenessStatus: row.completeness_status,
    currentPhase: row.current_phase,
    phaseIndex: Number(row.phase_index || 0),
    progress: candidateProgress(row.phase_index, row.status),
    phases: CANDIDATE_IMPORT_PHASES,
    phaseState: parseCandidateJson(row.phase_state_json, {}),
    sourceCounts: parseCandidateJson(row.source_counts_json, {}),
    resultCounts: parseCandidateJson(row.result_counts_json, {}),
    warnings: parseCandidateJson(row.warnings_json, []),
    retry: parseCandidateJson(row.retry_json, {}),
    mappingRuns: {
      teams: row.team_mapping_run_id || null,
      players: row.player_mapping_run_id || null,
      schedule: row.schedule_mapping_run_id || null,
      statistics: row.statistics_mapping_run_id || null
    },
    candidateSnapshotId: row.candidate_snapshot_id || null,
    activeSnapshotIdBefore: row.active_snapshot_id_before || null,
    activeSnapshotIdAfter: row.active_snapshot_id_after || null,
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    createdAt: row.created_at,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    updatedAt: row.updated_at,
    private: !activationPerformed,
    activationPerformed,
    activeSnapshotChanged: activationPerformed
      && String(row.active_snapshot_id_before || '')!==String(row.active_snapshot_id_after || '')
  };
}
