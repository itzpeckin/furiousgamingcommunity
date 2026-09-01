import { sha256Hex } from './cloud-platform.js';

export const GAME_YEAR_TRANSITION_RELEASE = '7.4.0.2';
export const GAME_YEAR_ARCHIVE_FORMAT = 1;

export const GAME_YEAR_OPERATIONS = Object.freeze({
  replaceCurrentImport: 'replace-current-import',
  startFranchiseSeason: 'start-franchise-season',
  archiveRemoveGameYear: 'archive-remove-game-year',
  rollback: 'rollback'
});

export const PERSISTENT_PLATFORM_TABLES = Object.freeze([
  'leagues',
  'users',
  'sessions',
  'league_memberships',
  'league_membership_audit',
  'league_settings',
  'league_setting_revisions',
  'league_rules_documents',
  'companion_league_export_endpoints',
  'tenant_audit_events',
  'player_identities',
  'player_source_aliases',
  'player_season_summaries',
  'gm_identities',
  'team_ownership_periods',
  'gm_season_summaries',
  'franchise_seasons',
  'franchise_season_closures'
]);

export const ARCHIVE_DATASETS = Object.freeze([
  'league_snapshots',
  'league_snapshot_records',
  'snapshot_validation_jobs',
  'snapshot_validation_player_ids',
  'league_snapshot_lifecycle_events',
  'canonical_statistics_snapshot_manifest',
  'import_performance_certifications',
  'canonical_roster_snapshots',
  'canonical_roster_snapshot_players',
  'forward_detection_jobs',
  'forward_detection_runs',
  'forward_roster_movements',
  'transaction_movement_classifications',
  'canonical_transactions',
  'canonical_transaction_evidence',
  'canonical_historical_player_states',
  'trade_workflows',
  'league_draft_picks',
  'trade_workflow_participants',
  'trade_workflow_assets',
  'trade_workflow_messages',
  'trade_workflow_reviews',
  'trade_block_listings',
  'league_notifications',
  'trade_roster_overlays',
  'trade_reconciliation_events',
  'companion_candidate_import_runs',
  'identity_preview_runs',
  'identity_preview_teams',
  'identity_preview_players',
  'companion_team_mapping_runs',
  'companion_canonical_teams_preview',
  'companion_player_mapping_runs',
  'companion_canonical_players_preview',
  'companion_schedule_mapping_runs',
  'companion_canonical_games_preview',
  'companion_statistics_mapping_runs',
  'companion_statistics_mapping_batches',
  'companion_canonical_statistics_preview',
  'madden_discovery_reports',
  'madden_discovery_session_captures',
  'companion_dataset_inspections',
  'companion_route_captures',
  'madden_discovery_sessions'
]);

export function editionYear(gameRelease) {
  const match = String(gameRelease || '').trim().match(/(?:^|\s)(\d{2,4})$/);
  const value = match ? Number(match[1]) : NaN;
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function normalizeGameRelease(value) {
  const release = String(value || '').replace(/\s+/g, ' ').trim();
  const year = editionYear(release);
  if (!release || !year || !/^Madden(?: NFL)? \d{2,4}$/i.test(release)) {
    return { ok:false, error:'Use an exact Madden game release such as Madden NFL 27.' };
  }
  return { ok:true, gameRelease:release.replace(/^madden nfl /i, 'Madden NFL '), editionYear:year };
}

export function transitionConfirmations(slug, gameRelease) {
  const league = String(slug || '').trim().toLowerCase();
  const release = String(gameRelease || '').trim();
  return Object.freeze({
    plan:`PLAN ${release} FOR ${league}`,
    archive:`ARCHIVE ${release} FOR ${league}`,
    detach:`DETACH ${release} FROM ${league}`,
    removeActive:`REMOVE ACTIVE ${release} FROM ${league}`,
    removeArchive:`REMOVE ARCHIVE ${release} FROM ${league}`,
    rollback:`ROLL BACK ${release} FOR ${league}`,
    startSeason:`START FRANCHISE SEASON IN ${release} FOR ${league}`
  });
}

export function normalizeFreeAgentEvidence(value = {}) {
  const status = String(value?.status || value?.freeAgentStatus || 'missing').trim().toLowerCase();
  const normalized = ['located', 'empty-confirmed', 'missing', 'blocked'].includes(status) ? status : 'missing';
  const count = ['located', 'empty-confirmed'].includes(normalized)
    ? Math.max(0, Number(value?.count ?? value?.recordCount ?? value?.freeAgentCount ?? 0))
    : null;
  return Object.freeze({ status:normalized, count, interpretedAsZero:false });
}

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

export function stableArchiveJson(value) {
  return JSON.stringify(stableValue(value));
}

export async function archiveDigest(value) {
  if (value instanceof ArrayBuffer) return sha256Hex(value);
  if (ArrayBuffer.isView(value)) {
    return sha256Hex(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  return sha256Hex(new TextEncoder().encode(typeof value === 'string' ? value : stableArchiveJson(value)));
}

export async function rootArchiveDigest(parts) {
  const normalized = [...(parts || [])]
    .map(part => ({ objectKey:String(part.objectKey), sha256:String(part.sha256), byteLength:Number(part.byteLength || 0) }))
    .sort((left, right) => left.objectKey.localeCompare(right.objectKey));
  return archiveDigest(normalized);
}

export function validateTypedConfirmation(presented, expected) {
  return typeof presented === 'string' && presented === expected;
}

export function canTransition(status, action) {
  const allowed = {
    archive:new Set(['planned']),
    detach:new Set(['archive-verified']),
    removeActive:new Set(['detached']),
    removeArchive:new Set(['active-data-removed']),
    rollback:new Set(['archive-verified', 'detached', 'active-data-removed', 'restoring'])
  };
  return allowed[action]?.has(String(status || '')) === true;
}

export function protectedCounts(rows = {}) {
  return Object.freeze({
    leagues:Number(rows.leagues || 0),
    users:Number(rows.users || 0),
    sessions:Number(rows.sessions || 0),
    memberships:Number(rows.memberships || 0),
    settings:Number(rows.settings || 0),
    rules:Number(rows.rules || 0),
    tenantAudits:Number(rows.tenantAudits || 0),
    membershipAudits:Number(rows.membershipAudits || 0)
  });
}

export function publicTransition(row) {
  if (!row) return null;
  const parse = value => { try { return JSON.parse(value || '{}'); } catch { return {}; } };
  return {
    id:row.id,
    operation:row.operation,
    status:row.status,
    phase:row.phase,
    outgoingGameYearId:row.outgoing_game_year_id || null,
    incomingGameYearId:row.incoming_game_year_id || null,
    manifestId:row.manifest_id || null,
    recoveryBookmarkId:row.recovery_bookmark_id || null,
    activeSnapshotIdBefore:row.active_snapshot_id_before || null,
    activeSnapshotIdAfter:row.active_snapshot_id_after || null,
    affectedCounts:parse(row.affected_counts_json),
    protectedCounts:parse(row.protected_counts_json),
    error:parse(row.error_json),
    createdAt:row.created_at,
    completedAt:row.completed_at || null
  };
}
