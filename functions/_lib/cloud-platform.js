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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

export function normalizeLeagueSlug(context) {
  return String(context.params?.leagueSlug || '').trim().toLowerCase();
}

export function validLeagueSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug || ''));
}

export function companionMetadataKey(slug) {
  return `league:${slug}:companion:latest`;
}

export function companionTokenKey(slug) {
  return `league:${slug}:companion:export-token`;
}

export function companionObjectKey(slug, exportId, receivedAt) {
  return `companion-exports/${slug}/${receivedAt.slice(0, 10)}/${exportId}.json`;
}

export async function configuredExportToken(env, slug) {
  const leagueToken = env.LEAGUE_CONFIG?.get
    ? await env.LEAGUE_CONFIG.get(companionTokenKey(slug))
    : null;
  return leagueToken || env.COMPANION_EXPORT_TOKEN || null;
}

export function suppliedExportToken(request) {
  const url = new URL(request.url);
  return request.headers.get('x-franchisehq-export-token')
    || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    || url.searchParams.get('token')
    || '';
}

export function safeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ''));
  const b = new TextEncoder().encode(String(right || ''));
  if (a.length !== b.length || !a.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

export function bindingStatus(env) {
  return {
    d1: Boolean(env.FRANCHISE_HQ_DB?.prepare),
    r2: Boolean(env.COMPANION_EXPORTS?.put && env.COMPANION_EXPORTS?.get),
    kv: Boolean(env.COMPANION_EXPORT_META?.put && env.COMPANION_EXPORT_META?.get),
    secret: Boolean(env.COMPANION_EXPORT_TOKEN),
    maxBytes: DEFAULT_MAX_BYTES
  };
}

export async function databaseStatus(env) {
  if (!env.FRANCHISE_HQ_DB?.prepare) {
    return { configured: false, reachable: false, migrated: false, migration: null, error: null };
  }
  try {
    const row = await env.FRANCHISE_HQ_DB
      .prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 1')
      .first();
    return {
      configured: true,
      reachable: true,
      migrated: Boolean(row && Number(row.version) >= 1),
      migration: row || null,
      error: null
    };
  } catch (error) {
    return {
      configured: true,
      reachable: true,
      migrated: false,
      migration: null,
      error: String(error?.message || error)
    };
  }
}

export async function platformReadiness(env) {
  const bindings = bindingStatus(env);
  const database = await databaseStatus(env);
  const configured = bindings.d1 && bindings.r2 && bindings.kv && bindings.secret;
  return {
    configured,
    ready: configured && database.migrated,
    bindings,
    database,
    release: '5.9.2.0'
  };
}
