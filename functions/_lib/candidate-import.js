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
  const routeWeek = item => {
    const match = item.routePath.match(WEEK_ROUTE);
    return match ? Number.parseInt(match[2], 10) : null;
  };
  const scheduleWeeks = weekNumbers(routes.filter(item => item.datasetType === 'schedule').map(routeWeek));
  const statisticsWeeks = weekNumbers(routes.filter(item => item.datasetType === 'statistics').map(routeWeek));
  const observedWeeks = weekNumbers([...markerWeeks, ...scheduleWeeks, ...statisticsWeeks]);
  const currentWeek = observedWeeks.length ? observedWeeks.at(-1) : null;
  const activeWeek = activeWeekIndex !== null && activeWeekIndex !== undefined && activeWeekIndex !== ''
    && Number.isInteger(Number(activeWeekIndex)) ? Number(activeWeekIndex) : null;
  const suppliedWeeks = new Set([...scheduleWeeks, ...statisticsWeeks]);
  const missingWeeks = activeWeek !== null && currentWeek !== null && currentWeek > activeWeek + 1
    ? Array.from({ length: currentWeek - activeWeek - 1 }, (_, index) => activeWeek + index + 1)
      .filter(week => !suppliedWeeks.has(week))
    : [];
  const scheduleCurrentWeek = currentWeek !== null && scheduleWeeks.includes(currentWeek);
  const statisticsCurrentWeek = currentWeek !== null && statisticsWeeks.includes(currentWeek);
  const currentWeekStatus = currentWeek === null
    ? 'unknown'
    : scheduleCurrentWeek && statisticsCurrentWeek ? 'covered' : 'partial';
  const continuityStatus = activeWeek === null || currentWeek === null
    ? 'unknown'
    : currentWeek < activeWeek ? 'stale'
      : missingWeeks.length ? 'gap-detected' : 'continuous';
  return {
    activeWeek,
    currentWeek,
    observedWeeks,
    scheduleWeeks,
    statisticsWeeks,
    scheduleCurrentWeek,
    statisticsCurrentWeek,
    currentWeekStatus,
    continuityStatus,
    missingWeeks
  };
}

export function candidateCoverageWarnings(coverage = {}) {
  const warnings = [];
  if (coverage.currentWeek === null || coverage.currentWeek === undefined) {
    warnings.push('The analyzed capture does not prove a Madden week. Review source coverage before activation.');
    return warnings;
  }
  if (!coverage.scheduleCurrentWeek) warnings.push(`Week ${coverage.currentWeek} schedule coverage is missing.`);
  if (!coverage.statisticsCurrentWeek) warnings.push(`Week ${coverage.currentWeek} statistics coverage is missing.`);
  if (coverage.continuityStatus === 'stale') {
    warnings.push(`The analyzed Week ${coverage.currentWeek} capture is older than active Week ${coverage.activeWeek}.`);
  }
  if (Array.isArray(coverage.missingWeeks) && coverage.missingWeeks.length) {
    warnings.push(`Week coverage gap after active Week ${coverage.activeWeek}: missing ${coverage.missingWeeks.map(week => `Week ${week}`).join(', ')}.`);
  }
  return warnings;
}

function recordWeek(record) {
  const value = record?.week_index ?? record?.weekIndex ?? record?.week;
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function candidateHistoryCarryForward(freshRecords = [], priorRows = [], options = {}) {
  const keyName = String(options.keyName || 'external_id');
  const currentWeek = options.currentWeek === null || options.currentWeek === undefined
    ? null : Number(options.currentWeek);
  const output = new Map((freshRecords || []).map(item => [String(item?.[keyName] ?? ''), item]));
  const retainedWeeks = new Set();
  let retained = 0;
  for (const row of priorRows || []) {
    const item = typeof row?.data_json === 'string'
      ? parseCandidateJson(row.data_json, null)
      : row?.data ?? row;
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
