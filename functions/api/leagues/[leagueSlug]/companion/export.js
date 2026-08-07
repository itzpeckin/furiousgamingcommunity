import {
  JSON_HEADERS, json, database, normalizeLeagueSlug, validLeagueSlug,
  companionMetadataKey, companionObjectKey, configuredExportToken,
  suppliedExportToken, safeEqual, sha256Hex, resolveLeague,
  detectCompanionMetadata, publicExport, bindingStatus
} from '../../../../_lib/cloud-platform.js';

const ACTIONABLE = "('pending','inspected','mapped')";

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: {
    ...JSON_HEADERS,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-franchisehq-export-token,authorization'
  }});
}

async function latestExport(db, leagueId) {
  return db.prepare(`SELECT * FROM companion_exports WHERE league_id = ? ORDER BY received_at DESC LIMIT 1`)
    .bind(leagueId).first();
}

export async function onRequestGet(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return json({ ok: false, error: 'Invalid league slug.' }, 400);
  const bindings = bindingStatus(context.env);
  const db = database(context.env);
  const league = db ? await resolveLeague(context.env, slug) : null;
  const tokenConfigured = Boolean(await configuredExportToken(context.env, slug));
  let latest = null, pendingCount = 0, kvPointer = null;
  if (db && league) {
    latest = await latestExport(db, league.id);
    const count = await db.prepare(`SELECT COUNT(*) AS count FROM companion_exports WHERE league_id = ? AND status IN ${ACTIONABLE}`)
      .bind(league.id).first();
    pendingCount = Number(count?.count || 0);
  }
  if (context.env.COMPANION_EXPORT_META?.get) {
    kvPointer = await context.env.COMPANION_EXPORT_META.get(companionMetadataKey(slug), { type: 'json' });
  }
  return json({
    ok: true,
    leagueSlug: slug,
    leagueId: league?.id || null,
    receiver: {
      ready: Boolean(bindings.r2 && bindings.kv && tokenConfigured && db && league),
      storageConfigured: Boolean(bindings.r2 && bindings.kv),
      tokenConfigured,
      databaseConfigured: Boolean(db),
      leagueResolved: Boolean(league),
      kvPointerReady: Boolean(context.env.COMPANION_EXPORT_META?.put),
      maxBytes: bindings.maxBytes
    },
    latestExport: publicExport(latest),
    pendingExport: latest && ['pending','inspected','mapped'].includes(latest.status) ? publicExport(latest) : null,
    pendingCount,
    kvPointer: kvPointer ? { exportId: kvPointer.exportId, status: kvPointer.status, updatedAt: kvPointer.updatedAt || kvPointer.receivedAt } : null
  });
}

export async function onRequestPost(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return json({ ok: false, error: 'Invalid league slug.' }, 400);
  const db = database(context.env);
  if (!db || !context.env.COMPANION_EXPORTS?.put || !context.env.COMPANION_EXPORT_META?.put) {
    return json({ ok: false, error: 'Companion storage is not fully configured.', requiredBindings: ['FRANCHISE_HQ_DB (D1)', 'COMPANION_EXPORTS (R2)', 'COMPANION_EXPORT_META (KV)'] }, 503);
  }
  const league = await resolveLeague(context.env, slug);
  if (!league) return json({ ok: false, error: 'No active Franchise HQ league matches this URL.' }, 404);
  const expectedToken = await configuredExportToken(context.env, slug);
  if (!expectedToken) return json({ ok: false, error: 'No export token is configured for this league.' }, 503);
  if (!safeEqual(suppliedExportToken(context.request), expectedToken)) return json({ ok: false, error: 'Unauthorized export request.' }, 401);

  const contentType = context.request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return json({ ok: false, error: 'Madden Companion exports must use application/json.' }, 415);
  const maxBytes = bindingStatus(context.env).maxBytes;
  const declaredLength = Number(context.request.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) return json({ ok: false, error: 'Export exceeds the 20 MB receiver limit.' }, 413);
  const raw = await context.request.text();
  const byteLength = new TextEncoder().encode(raw).byteLength;
  if (!raw.trim()) return json({ ok: false, error: 'Export payload is empty.' }, 400);
  if (byteLength > maxBytes) return json({ ok: false, error: 'Export exceeds the 20 MB receiver limit.' }, 413);
  let payload;
  try { payload = JSON.parse(raw); } catch (_) { return json({ ok: false, error: 'Export body is not valid JSON.' }, 400); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json({ ok: false, error: 'Export JSON must contain an object at the top level.' }, 400);

  const payloadHash = await sha256Hex(raw);
  const duplicate = await db.prepare(`SELECT ce.* FROM companion_export_fingerprints cef
    JOIN companion_exports ce ON ce.id = cef.export_id
    WHERE cef.league_id = ? AND cef.payload_hash = ? LIMIT 1`).bind(league.id, payloadHash).first();
  if (duplicate) {
    return json({ ok: true, accepted: false, duplicate: true, message: 'This exact Companion payload was already received. No duplicate record was created.', existingExport: publicExport(duplicate) }, 200);
  }

  const receivedAt = new Date().toISOString();
  const exportId = crypto.randomUUID();
  const detected = detectCompanionMetadata(payload);
  const key = companionObjectKey(slug, exportId, receivedAt, detected.season, detected.week);
  await context.env.COMPANION_EXPORTS.put(key, raw, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { leagueId: league.id, leagueSlug: slug, exportId, receivedAt, payloadHash }
  });
  try {
    await db.batch([
      db.prepare(`INSERT INTO companion_exports
        (id, league_id, received_at, status, r2_object_key, byte_length, content_type, season, week, team_count, player_count, created_at)
        VALUES (?, ?, ?, 'pending', ?, ?, 'application/json', ?, ?, ?, ?, ?)`)
        .bind(exportId, league.id, receivedAt, key, byteLength, detected.season, detected.week, detected.teamCount, detected.playerCount, receivedAt),
      db.prepare(`INSERT INTO companion_export_fingerprints (league_id, payload_hash, export_id, created_at) VALUES (?, ?, ?, ?)`)
        .bind(league.id, payloadHash, exportId, receivedAt),
      db.prepare(`INSERT INTO companion_export_events (id, export_id, league_id, event_type, detail_json, created_at)
        VALUES (?, ?, ?, 'received', ?, ?)`)
        .bind(crypto.randomUUID(), exportId, league.id, JSON.stringify({ byteLength, contentType: 'application/json', ...detected }), receivedAt)
    ]);
  } catch (error) {
    await context.env.COMPANION_EXPORTS.delete(key).catch(() => {});
    return json({ ok: false, error: 'The payload reached R2 but could not be recorded in D1. The temporary R2 object was removed.', detail: String(error?.message || error) }, 500);
  }
  const metadata = { exportId, leagueId: league.id, leagueSlug: slug, receivedAt, updatedAt: receivedAt, status: 'pending', byteLength, contentType: 'application/json', r2ObjectKey: key, payloadStored: true, payloadHash, ...detected };
  await context.env.COMPANION_EXPORT_META.put(companionMetadataKey(slug), JSON.stringify(metadata));
  return json({ ok: true, accepted: true, duplicate: false, message: 'Companion export stored in R2, recorded in D1, and marked pending in KV. No league data was activated.', pendingExport: publicExport({ id: exportId, league_id: league.id, received_at: receivedAt, status: 'pending', r2_object_key: key, byte_length: byteLength, content_type: 'application/json', season: detected.season, week: detected.week, team_count: detected.teamCount, player_count: detected.playerCount }) }, 202);
}
