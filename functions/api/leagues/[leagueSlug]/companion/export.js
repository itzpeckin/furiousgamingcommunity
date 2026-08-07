import {
  JSON_HEADERS,
  bindingStatus,
  companionMetadataKey,
  companionObjectKey,
  configuredExportToken,
  json,
  normalizeLeagueSlug,
  safeEqual,
  suppliedExportToken,
  validLeagueSlug
} from '../../../../_lib/cloud-platform.js';

const MAX_BYTES = 20 * 1024 * 1024;

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

async function resolveLeagueId(env, slug) {
  if (!env.FRANCHISE_HQ_DB?.prepare) return null;
  try {
    const row = await env.FRANCHISE_HQ_DB.prepare('SELECT id FROM leagues WHERE slug = ? LIMIT 1').bind(slug).first();
    return row?.id || null;
  } catch (_) {
    return null;
  }
}

async function auditExport(env, metadata) {
  if (!env.FRANCHISE_HQ_DB?.prepare || !metadata.leagueId) return false;
  try {
    await env.FRANCHISE_HQ_DB.prepare(`
      INSERT INTO companion_exports
      (id, league_id, received_at, status, r2_object_key, byte_length, content_type, season, week, team_count, player_count)
      VALUES (?, ?, ?, 'pending', ?, ?, 'application/json', ?, ?, ?, ?)
    `).bind(
      metadata.exportId, metadata.leagueId, metadata.receivedAt, metadata.r2ObjectKey,
      metadata.byteLength, metadata.season, metadata.week, metadata.teamCount, metadata.playerCount
    ).run();
    return true;
  } catch (_) {
    return false;
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      ...JSON_HEADERS,
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-franchisehq-export-token'
    }
  });
}

export async function onRequestGet(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return json({ ok: false, error: 'Invalid league slug.' }, 400);

  const bindings = bindingStatus(context.env);
  const storageConfigured = bindings.r2 && bindings.kv;
  const tokenConfigured = Boolean(await configuredExportToken(context.env, slug));
  let latest = null;
  if (context.env.COMPANION_EXPORT_META?.get) {
    latest = await context.env.COMPANION_EXPORT_META.get(companionMetadataKey(slug), { type: 'json' });
  }

  return json({
    ok: true,
    leagueSlug: slug,
    receiver: {
      ready: storageConfigured && tokenConfigured,
      storageConfigured,
      tokenConfigured,
      databaseConfigured: bindings.d1,
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
      payloadStored: latest.payloadStored === true,
      databaseRecorded: latest.databaseRecorded === true
    } : null
  });
}

export async function onRequestPost(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return json({ ok: false, error: 'Invalid league slug.' }, 400);
  if (!context.env.COMPANION_EXPORTS?.put || !context.env.COMPANION_EXPORT_META?.put) {
    return json({
      ok: false,
      error: 'Companion receiver storage is not configured.',
      requiredBindings: ['COMPANION_EXPORTS (R2)', 'COMPANION_EXPORT_META (KV)']
    }, 503);
  }

  const expectedToken = await configuredExportToken(context.env, slug);
  if (!expectedToken) return json({ ok: false, error: 'No export token is configured for this league.' }, 503);
  if (!safeEqual(suppliedExportToken(context.request), expectedToken)) {
    return json({ ok: false, error: 'Unauthorized export request.' }, 401);
  }

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
  try { payload = JSON.parse(raw); }
  catch (_) { return json({ ok: false, error: 'Export body is not valid JSON.' }, 400); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return json({ ok: false, error: 'Export JSON must contain an object at the top level.' }, 400);
  }

  const receivedAt = new Date().toISOString();
  const exportId = crypto.randomUUID();
  const r2ObjectKey = companionObjectKey(slug, exportId, receivedAt);
  const detected = detectMetadata(payload);
  const leagueId = await resolveLeagueId(context.env, slug);

  await context.env.COMPANION_EXPORTS.put(r2ObjectKey, raw, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { leagueSlug: slug, exportId, receivedAt }
  });

  const metadata = {
    exportId, leagueId, leagueSlug: slug, receivedAt, status: 'pending', byteLength,
    contentType: 'application/json', r2ObjectKey, payloadStored: true, ...detected
  };
  metadata.databaseRecorded = await auditExport(context.env, metadata);
  await context.env.COMPANION_EXPORT_META.put(companionMetadataKey(slug), JSON.stringify(metadata));

  return json({
    ok: true,
    accepted: true,
    message: 'Companion export received and stored as pending. No league data was activated.',
    pendingExport: {
      exportId, receivedAt, status: 'pending', byteLength,
      season: detected.season, week: detected.week,
      teamCount: detected.teamCount, playerCount: detected.playerCount,
      databaseRecorded: metadata.databaseRecorded
    }
  }, 202);
}
