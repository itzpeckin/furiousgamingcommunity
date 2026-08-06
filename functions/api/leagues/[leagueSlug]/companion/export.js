const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,x-franchisehq-export-token'
};

const MAX_BYTES = 20 * 1024 * 1024;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

function leagueSlug(context) {
  return String(context.params?.leagueSlug || '').trim().toLowerCase();
}

function metadataKey(slug) {
  return `league:${slug}:companion:latest`;
}

function tokenKey(slug) {
  return `league:${slug}:companion:export-token`;
}

function objectKey(slug, exportId, receivedAt) {
  const date = receivedAt.slice(0, 10);
  return `companion-exports/${slug}/${date}/${exportId}.json`;
}

async function configuredToken(env, slug) {
  const fromKv = env.LEAGUE_CONFIG?.get ? await env.LEAGUE_CONFIG.get(tokenKey(slug)) : null;
  return fromKv || env.COMPANION_EXPORT_TOKEN || null;
}

function suppliedToken(request) {
  const url = new URL(request.url);
  return request.headers.get('x-franchisehq-export-token') || url.searchParams.get('token') || '';
}

function safeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ''));
  const b = new TextEncoder().encode(String(right || ''));
  if (a.length !== b.length || !a.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

function detectMetadata(payload) {
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

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function onRequestGet(context) {
  const slug = leagueSlug(context);
  if (!slugPattern.test(slug)) return json({ ok: false, error: 'Invalid league slug.' }, 400);

  const storageConfigured = Boolean(context.env.COMPANION_EXPORTS && context.env.COMPANION_EXPORT_META);
  const tokenConfigured = Boolean(await configuredToken(context.env, slug));
  let latest = null;
  if (context.env.COMPANION_EXPORT_META?.get) {
    latest = await context.env.COMPANION_EXPORT_META.get(metadataKey(slug), { type: 'json' });
  }

  return json({
    ok: true,
    leagueSlug: slug,
    receiver: {
      ready: storageConfigured && tokenConfigured,
      storageConfigured,
      tokenConfigured,
      maxBytes: MAX_BYTES
    },
    pendingExport: latest ? {
      exportId: latest.exportId,
      receivedAt: latest.receivedAt,
      status: latest.status,
      byteLength: latest.byteLength,
      contentType: latest.contentType,
      season: latest.season,
      week: latest.week,
      teamCount: latest.teamCount,
      playerCount: latest.playerCount,
      payloadStored: latest.payloadStored === true
    } : null
  });
}

export async function onRequestPost(context) {
  const slug = leagueSlug(context);
  if (!slugPattern.test(slug)) return json({ ok: false, error: 'Invalid league slug.' }, 400);
  if (!context.env.COMPANION_EXPORTS?.put || !context.env.COMPANION_EXPORT_META?.put) {
    return json({
      ok: false,
      error: 'Companion receiver storage is not configured.',
      requiredBindings: ['COMPANION_EXPORTS (R2)', 'COMPANION_EXPORT_META (KV)']
    }, 503);
  }

  const expectedToken = await configuredToken(context.env, slug);
  if (!expectedToken) return json({ ok: false, error: 'No export token is configured for this league.' }, 503);
  if (!safeEqual(suppliedToken(context.request), expectedToken)) return json({ ok: false, error: 'Unauthorized export request.' }, 401);

  const contentType = context.request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return json({ ok: false, error: 'Madden Companion exports must use application/json.' }, 415);
  }

  const declaredLength = Number(context.request.headers.get('content-length') || 0);
  if (declaredLength > MAX_BYTES) return json({ ok: false, error: 'Export exceeds the 20 MB receiver limit.' }, 413);

  const raw = await context.request.text();
  const byteLength = new TextEncoder().encode(raw).byteLength;
  if (!raw.trim()) return json({ ok: false, error: 'Export payload is empty.' }, 400);
  if (byteLength > MAX_BYTES) return json({ ok: false, error: 'Export exceeds the 20 MB receiver limit.' }, 413);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (_) {
    return json({ ok: false, error: 'Export body is not valid JSON.' }, 400);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return json({ ok: false, error: 'Export JSON must contain an object at the top level.' }, 400);
  }

  const receivedAt = new Date().toISOString();
  const exportId = crypto.randomUUID();
  const key = objectKey(slug, exportId, receivedAt);
  const detected = detectMetadata(payload);
  await context.env.COMPANION_EXPORTS.put(key, raw, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { leagueSlug: slug, exportId, receivedAt }
  });

  const metadata = {
    exportId,
    leagueSlug: slug,
    receivedAt,
    status: 'pending',
    byteLength,
    contentType: 'application/json',
    r2ObjectKey: key,
    payloadStored: true,
    ...detected
  };
  await context.env.COMPANION_EXPORT_META.put(metadataKey(slug), JSON.stringify(metadata));

  return json({
    ok: true,
    accepted: true,
    message: 'Companion export received and stored as pending. No league data was activated.',
    pendingExport: {
      exportId,
      receivedAt,
      status: 'pending',
      byteLength,
      season: detected.season,
      week: detected.week,
      teamCount: detected.teamCount,
      playerCount: detected.playerCount
    }
  }, 202);
}
