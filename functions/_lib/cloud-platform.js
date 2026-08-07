const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

export const CLOUD_BINDINGS = Object.freeze({
  database: 'FRANCHISE_HQ_DB',
  exports: 'COMPANION_EXPORTS',
  metadata: 'COMPANION_EXPORT_META',
  token: 'COMPANION_EXPORT_TOKEN'
});

export const JSON_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*'
});

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

export function database(env) {
  return env.FRANCHISE_HQ_DB?.prepare ? env.FRANCHISE_HQ_DB : (env.DB?.prepare ? env.DB : null);
}

export function normalizeLeagueSlug(context) {
  return String(context.params?.leagueSlug || '').trim().toLowerCase();
}

export function validLeagueSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug || ''));
}

export function companionMetadataKey(slug) { return `league:${slug}:companion:latest`; }
export function companionTokenKey(slug) { return `league:${slug}:companion:export-token`; }
export function companionObjectKey(slug, exportId, receivedAt, season = null, week = null) {
  const date = receivedAt.slice(0, 10);
  const seasonPart = season == null ? 'season-unknown' : `season-${season}`;
  const weekPart = week == null ? 'week-unknown' : `week-${String(week).padStart(2, '0')}`;
  return `companion-exports/${slug}/${seasonPart}/${weekPart}/${date}/${exportId}.json`;
}

export async function configuredExportToken(env, slug) {
  const leagueToken = env.LEAGUE_CONFIG?.get ? await env.LEAGUE_CONFIG.get(companionTokenKey(slug)) : null;
  return leagueToken || env.COMPANION_EXPORT_TOKEN || null;
}

export function suppliedExportToken(request) {
  const url = new URL(request.url);
  return request.headers.get('x-franchisehq-export-token')
    || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    || url.searchParams.get('token') || '';
}

export function safeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ''));
  const b = new TextEncoder().encode(String(right || ''));
  if (a.length !== b.length || !a.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

export async function sha256Hex(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function resolveLeague(env, slug) {
  const db = database(env);
  if (!db) return null;
  return db.prepare(`SELECT id, name, slug, current_season, current_week, public_status
    FROM leagues WHERE slug = ? LIMIT 1`).bind(slug).first();
}

export function detectCompanionMetadata(payload) {
  const root = payload && typeof payload === 'object' ? payload : {};
  const meta = root.metadata || root.meta || root.league || root.franchise || {};
  const season = root.season ?? root.seasonYear ?? meta.season ?? meta.seasonYear ?? null;
  const week = root.week ?? root.currentWeek ?? meta.week ?? meta.currentWeek ?? null;
  const teams = root.teams || root.teamInfoList || root.leagueTeams || root.data?.teams || [];
  const players = root.players || root.rosters || root.playerInfoList || root.data?.players || [];
  return {
    season: Number.isFinite(Number(season)) ? Number(season) : null,
    week: Number.isFinite(Number(week)) ? Number(week) : null,
    teamCount: Array.isArray(teams) ? teams.length : null,
    playerCount: Array.isArray(players) ? players.length : null
  };
}

export function publicExport(row) {
  if (!row) return null;
  return {
    exportId: row.id || row.export_id,
    leagueId: row.league_id,
    receivedAt: row.received_at,
    status: row.status,
    byteLength: row.byte_length,
    contentType: row.content_type,
    season: row.season,
    week: row.week,
    teamCount: row.team_count,
    playerCount: row.player_count,
    payloadStored: Boolean(row.r2_object_key),
    inspected: Boolean(row.inspection_json),
    processedAt: row.processed_at || null
  };
}

export function bindingStatus(env) {
  const db = database(env);
  return {
    d1: Boolean(db?.prepare),
    r2: Boolean(env.COMPANION_EXPORTS?.put && env.COMPANION_EXPORTS?.get),
    kv: Boolean(env.COMPANION_EXPORT_META?.put && env.COMPANION_EXPORT_META?.get),
    secret: Boolean(env.COMPANION_EXPORT_TOKEN),
    maxBytes: DEFAULT_MAX_BYTES
  };
}

export async function databaseStatus(env) {
  const db = database(env);
  if (!db) return { configured: false, reachable: false, migrated: false, migration: null, error: null };
  try {
    const row = await db.prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 1').first();
    return { configured: true, reachable: true, migrated: Boolean(row && Number(row.version) >= 2), migration: row || null, error: null };
  } catch (error) {
    return { configured: true, reachable: true, migrated: false, migration: null, error: String(error?.message || error) };
  }
}

export async function platformReadiness(env) {
  const bindings = bindingStatus(env);
  const dbStatus = await databaseStatus(env);
  const configured = bindings.d1 && bindings.r2 && bindings.kv && bindings.secret;
  return { configured, ready: configured && dbStatus.migrated, bindings, database: dbStatus, release: '5.9.3.0a' };
}


export function normalizeDiscoveryPath(context) {
  const raw = context.params?.datasetPath;
  const parts = Array.isArray(raw) ? raw : String(raw || '').split('/');
  return parts.map(part => decodeURIComponent(String(part))).filter(Boolean).join('/');
}

export function safeRouteSegment(value) {
  return String(value || 'root').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'root';
}

export function companionRouteObjectKey(slug, sessionId, routePath, captureId, receivedAt) {
  const date = receivedAt.slice(0, 10);
  const route = String(routePath || 'root').split('/').map(safeRouteSegment).join('/');
  return `companion-route-discovery/${slug}/${date}/${sessionId}/${route}/${captureId}.json`;
}

export function summarizePayloadShape(payload) {
  const typeOf = value => Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  const root = payload && typeof payload === 'object' ? payload : null;
  const keys = root && !Array.isArray(root) ? Object.keys(root).slice(0, 100) : [];
  const collections = [];
  const walk = (value, path, depth) => {
    if (depth > 3 || collections.length >= 50 || value == null) return;
    if (Array.isArray(value)) {
      collections.push({ path: path || '$', count: value.length, sampleKeys: value[0] && typeof value[0] === 'object' && !Array.isArray(value[0]) ? Object.keys(value[0]).slice(0, 60) : [] });
      if (value[0] && typeof value[0] === 'object') walk(value[0], `${path}[0]`, depth + 1);
      return;
    }
    if (typeof value === 'object') Object.entries(value).slice(0, 100).forEach(([key, child]) => walk(child, path ? `${path}.${key}` : key, depth + 1));
  };
  walk(root, '', 0);
  return { rootType: typeOf(payload), topLevelKeys: keys, collections };
}
