import { freeAgentStateFromMappingRun, resolveSnapshotPlayerMappingRun } from './live-data-experience.js';

const text = value => String(value ?? '').trim();
const parse = (value, fallback = null) => {
  if (value && typeof value === 'object') return value;
  try { return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
};

function readinessReport(report = {}) {
  return {
    ...report,
    requirements:report.requirements || parse(report.requirement_results_json, {}),
    sourceMarkers:report.sourceMarkers || parse(report.source_markers_json, {}),
    sourceVerification:report.sourceVerification || parse(report.source_verification_json, {}),
    freeAgentEvidence:report.freeAgentEvidence || parse(report.free_agent_evidence_json, {})
  };
}

function rosterSourceAbsent(requirements = {}) {
  const roster = requirements?.['team-rosters'] || {};
  const players = requirements?.players || {};
  const freeAgents = requirements?.['free-agents'] || {};
  const noRows = value => Number(value?.recordCount || 0) === 0;
  const noRoutes = value => !Array.isArray(value?.routes) || value.routes.length === 0;
  return noRows(roster) && noRoutes(roster)
    && noRows(players) && noRoutes(players)
    && !['located','empty-confirmed'].includes(text(freeAgents.status).toLowerCase());
}

function markerIncludes(marker, expected) {
  const value = text(expected).toLowerCase();
  if (!value) return true;
  return [marker?.expected,...(Array.isArray(marker?.observed) ? marker.observed : [])]
    .map(item=>text(item).toLowerCase()).includes(value);
}

export async function rosterCarryForwardEligibility(db, leagueId, inputReport = {}) {
  const report = readinessReport(inputReport);
  const unavailable = reason => ({eligible:false,mode:'fresh-rosters-required',reason});
  if (!db || !leagueId) return unavailable('League storage is unavailable.');
  if (!rosterSourceAbsent(report.requirements)) {
    return unavailable('This export contains roster source data or partial roster routes.');
  }
  if (report.sourceVerification?.passed !== true) {
    return unavailable('The rosterless export did not pass source identity verification.');
  }

  const active = await db.prepare(`SELECT active.snapshot_id AS source_snapshot_id,
      snapshot.player_count,snapshot.team_count,snapshot.season_year,snapshot.manifest_json,
      snapshot.created_at AS snapshot_created_at,linked.game_year_id,
      destination.franchise_season_id,season.source_franchise_id,season.source_season_id
    FROM league_active_snapshots active
    JOIN league_snapshots snapshot
      ON snapshot.id=active.snapshot_id AND snapshot.league_id=active.league_id
    JOIN game_year_snapshots linked
      ON linked.snapshot_id=snapshot.id AND linked.league_id=snapshot.league_id
    JOIN companion_candidate_import_runs import_run
      ON import_run.candidate_snapshot_id=snapshot.id AND import_run.league_id=snapshot.league_id
    JOIN companion_import_destinations destination
      ON destination.id=import_run.destination_id AND destination.league_id=import_run.league_id
    JOIN franchise_seasons season
      ON season.id=destination.franchise_season_id AND season.league_id=destination.league_id
    WHERE active.league_id=?
    ORDER BY import_run.created_at DESC LIMIT 1`).bind(leagueId).first();
  if (!active?.source_snapshot_id || Number(active.player_count || 0) < 1 || Number(active.team_count || 0) < 1) {
    return unavailable('A populated active snapshot is required before rosters can be carried forward.');
  }
  const currentSeason = await db.prepare(`SELECT id,source_franchise_id,source_season_id,season_year
    FROM franchise_seasons WHERE league_id=? AND status IN ('active','preview')
    ORDER BY created_at DESC,rowid DESC LIMIT 1`).bind(leagueId).first();
  if (!currentSeason || String(currentSeason.id) !== String(active.franchise_season_id)
    || Number(currentSeason.season_year) !== Number(active.season_year)) {
    return unavailable('The active snapshot is not the current prepared franchise season.');
  }
  if (!markerIncludes(report.sourceMarkers?.sourceFranchiseId,active.source_franchise_id)
    || !markerIncludes(report.sourceMarkers?.season,active.source_season_id)) {
    return unavailable('The export source does not match the active franchise season.');
  }

  const [playerRows,teamRows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count FROM league_snapshot_records
      WHERE league_id=? AND snapshot_id=? AND domain='players'`)
      .bind(leagueId,active.source_snapshot_id).first(),
    db.prepare(`SELECT COUNT(*) AS count FROM league_snapshot_records
      WHERE league_id=? AND snapshot_id=? AND domain='teams'`)
      .bind(leagueId,active.source_snapshot_id).first()
  ]);
  if (Number(playerRows?.count || 0) !== Number(active.player_count)
    || Number(teamRows?.count || 0) !== Number(active.team_count)) {
    return unavailable('The active snapshot roster domains are not complete.');
  }
  const mapping = await resolveSnapshotPlayerMappingRun(db,leagueId,{
    id:active.source_snapshot_id,
    player_count:active.player_count,
    manifest_json:active.manifest_json
  });
  if (!mapping) return unavailable('The active snapshot roster provenance is unavailable.');
  const freeAgents = freeAgentStateFromMappingRun(mapping);
  const freeAgentStatus = freeAgents.status === 'ready' ? 'located'
    : freeAgents.status === 'unavailable' ? 'missing' : freeAgents.status;
  return {
    eligible:true,
    mode:'active-snapshot-roster-carry-forward',
    reason:'Rosters, players, contracts, and Free Agent state will remain unchanged from the active snapshot.',
    sourceSnapshotId:String(active.source_snapshot_id),
    playerSourceSnapshotId:String(mapping.sourceSnapshotId || active.source_snapshot_id),
    playerMappingRunId:String(mapping.id),
    franchiseSeasonId:String(active.franchise_season_id),
    gameYearId:String(active.game_year_id),
    seasonYear:Number(active.season_year),
    teamCount:Number(active.team_count),
    playerCount:Number(active.player_count),
    rosteredCount:Number(mapping.rostered_count ?? active.player_count),
    freeAgentStatus,
    freeAgentCount:['located','empty-confirmed'].includes(freeAgentStatus)
      ? Number(mapping.free_agent_count || 0) : null,
    rosterCapturedAt:mapping.created_at || active.snapshot_created_at || null,
    freeAgentInterpretedAsZero:false
  };
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function deriveLeagueExportToken(secret, leagueId, tokenVersion = 1) {
  const keyMaterial = text(secret);
  const league = text(leagueId);
  const version = Math.max(1, Number.parseInt(String(tokenVersion || 1), 10) || 1);
  if (!keyMaterial || !league) throw new TypeError('A signing secret and league ID are required.');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keyMaterial),
    { name:'HMAC', hash:'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`franchisehq:league-export:v1:${league}:${version}`)
  );
  return bytesToHex(new Uint8Array(signature));
}

export function leagueExportUrl(origin, leagueSlug, token) {
  const root = new URL(String(origin || 'https://franchisehq.app'));
  root.pathname = `/api/leagues/${encodeURIComponent(text(leagueSlug).toLowerCase())}/companion/export/${encodeURIComponent(text(token))}`;
  root.search = '';
  root.hash = '';
  return root.toString().replace(/\/$/, '');
}

export function reportImportReadiness(inputReport = {}, {rosterCarryForward=null} = {}) {
  const report = readinessReport(inputReport);
  const requirements = report.requirements || {};
  const players = report.playerImportReadiness || requirements?.players?.assignmentEvidence || {};
  const carryingRosters = rosterCarryForward?.eligible === true && rosterSourceAbsent(requirements);
  const freeAgentStatus = text(carryingRosters
    ? rosterCarryForward.freeAgentStatus
    : report.freeAgentEvidence?.status || requirements?.['free-agents']?.status || 'missing').toLowerCase();
  const located = name => text(requirements?.[name]?.status).toLowerCase() === 'located';
  const explicitEmptyStatistics = text(requirements?.statistics?.status).toLowerCase() === 'empty'
    && Array.isArray(requirements?.statistics?.routes)
    && requirements.statistics.routes.length > 0;
  const sourcePassed = report.sourceVerification?.passed === true;
  const ready = sourcePassed
    && located('teams')
    && (carryingRosters || (located('team-rosters') && located('players')))
    && located('standings')
    && located('schedule')
    && (located('statistics') || explicitEmptyStatistics)
    && (carryingRosters || players.canBuildRosteredPlayerPreview === true)
    && (carryingRosters || ['located', 'empty-confirmed', 'blocked'].includes(freeAgentStatus));
  const result = {
    ready,
    completeness:ready && ['located','empty-confirmed'].includes(freeAgentStatus)
      ? 'complete'
      : ready && freeAgentStatus === 'blocked' ? 'rostered-players-only' : 'review-required',
    freeAgentStatus,
    freeAgentCount:['located','empty-confirmed'].includes(freeAgentStatus)
      ? Number(carryingRosters
        ? rosterCarryForward.freeAgentCount
        : report.freeAgentEvidence?.recordCount ?? requirements?.['free-agents']?.recordCount ?? 0)
      : null
  };
  if (carryingRosters) result.rosterCarryForward = rosterCarryForward;
  return result;
}

export function permanentExportPublicState({ endpoint, latestSession, latestReport, readyReport, candidateRun } = {}) {
  const captureCount = Number(latestReport?.capture_count || latestSession?.capture_count || 0);
  const latestReportId = latestReport?.id || null;
  const readyReportId = readyReport?.id || null;
  const status = !endpoint || endpoint.status !== 'active'
    ? 'revoked'
    : !latestSession ? 'awaiting-export'
      : !latestReport ? captureCount ? 'receiving' : 'awaiting-export'
        : latestReportId === readyReportId ? 'ready' : 'review-required';
  const importLive=Boolean(
    candidateRun?.candidate_snapshot_id
    && candidateRun?.active_snapshot_id_after
    && String(candidateRun.candidate_snapshot_id)===String(candidateRun.active_snapshot_id_after)
  );
  return {
    status,
    captureCount,
    latestReportId,
    readyReportId,
    importAvailable:status === 'ready' && !importLive,
    importStatus:importLive ? 'live' : candidateRun?.status || 'not-started',
    importLive
  };
}
