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

export function publicCandidateRun(row) {
  if (!row) return null;
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
    private: true,
    activationPerformed: false,
    activeSnapshotChanged: false
  };
}
