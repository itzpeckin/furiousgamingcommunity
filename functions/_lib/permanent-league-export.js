const text = value => String(value ?? '').trim();

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

export function reportImportReadiness(report = {}) {
  const requirements = report.requirements || {};
  const players = report.playerImportReadiness || requirements?.players?.assignmentEvidence || {};
  const freeAgentStatus = text(report.freeAgentEvidence?.status || requirements?.['free-agents']?.status || 'missing').toLowerCase();
  const located = name => text(requirements?.[name]?.status).toLowerCase() === 'located';
  const explicitEmptyStatistics = text(requirements?.statistics?.status).toLowerCase() === 'empty'
    && Array.isArray(requirements?.statistics?.routes)
    && requirements.statistics.routes.length > 0;
  const sourcePassed = report.sourceVerification?.passed === true;
  const ready = sourcePassed
    && located('teams')
    && located('team-rosters')
    && located('players')
    && located('standings')
    && located('schedule')
    && (located('statistics') || explicitEmptyStatistics)
    && players.canBuildRosteredPlayerPreview === true
    && ['located', 'empty-confirmed', 'blocked'].includes(freeAgentStatus);
  return {
    ready,
    completeness:ready && ['located','empty-confirmed'].includes(freeAgentStatus)
      ? 'complete'
      : ready && freeAgentStatus === 'blocked' ? 'rostered-players-only' : 'review-required',
    freeAgentStatus,
    freeAgentCount:['located','empty-confirmed'].includes(freeAgentStatus)
      ? Number(report.freeAgentEvidence?.recordCount ?? requirements?.['free-agents']?.recordCount ?? 0)
      : null
  };
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
