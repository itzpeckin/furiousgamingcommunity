import {
  JSON_HEADERS, json, database, normalizeLeagueSlug, validLeagueSlug,
  companionMetadataKey, configuredExportToken, suppliedExportToken,
  safeEqual, resolveLeague, publicExport
} from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

export async function onRequestOptions() { return new Response(null, { status: 204, headers: { ...JSON_HEADERS, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,x-franchisehq-export-token,authorization' } }); }

export async function onRequestGet(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return json({ ok: false, error: 'Invalid league slug.' }, 400);
  const authorization = await requireCommissioner(context);
  if (!authorization.authorized) return authorization.response;
  const db = database(context.env);
  if (!db) return json({ ok: false, error: 'D1 is not configured.' }, 503);
  const league = await resolveLeague(context.env, slug);
  if (!league || authorization.session.membership?.leagueId !== league.id) {
    return json({ ok: false, error: 'Not found.' }, 404);
  }
  const rows = await db.prepare(`SELECT * FROM companion_exports WHERE league_id = ? ORDER BY received_at DESC LIMIT 25`).bind(league.id).all();
  const counts = await db.prepare(`SELECT status, COUNT(*) AS count FROM companion_exports WHERE league_id = ? GROUP BY status`).bind(league.id).all();
  return json({ ok: true, leagueId: league.id, leagueSlug: slug, exports: (rows.results || []).map(publicExport), counts: Object.fromEntries((counts.results || []).map(row => [row.status, Number(row.count || 0)])), rawPayloadReturned: false });
}

export async function onRequestPost(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return json({ ok: false, error: 'Invalid league slug.' }, 400);
  const db = database(context.env);
  if (!db || !context.env.COMPANION_EXPORT_META?.put) return json({ ok: false, error: 'D1 or KV is not configured.' }, 503);
  const league = await resolveLeague(context.env, slug);
  if (!league) return json({ ok: false, error: 'League not found.' }, 404);
  const token = await configuredExportToken(context.env, league);
  if (!token || !safeEqual(suppliedExportToken(context.request), token)) return json({ ok: false, error: 'Unauthorized export-management request.' }, 401);
  let body; try { body = await context.request.json(); } catch (_) { return json({ ok: false, error: 'Request body must be JSON.' }, 400); }
  if (body?.action !== 'reject' || !body?.exportId) return json({ ok: false, error: 'Supported action: reject with exportId.' }, 400);
  const row = await db.prepare(`SELECT * FROM companion_exports WHERE id = ? AND league_id = ? LIMIT 1`).bind(body.exportId, league.id).first();
  if (!row) return json({ ok: false, error: 'Export not found.' }, 404);
  if (['processed','rejected'].includes(row.status)) return json({ ok: false, error: `Export is already ${row.status}.` }, 409);
  const now = new Date().toISOString();
  const reason = String(body.reason || 'Rejected by commissioner').slice(0, 500);
  await db.batch([
    db.prepare(`UPDATE companion_exports SET status = 'rejected', processed_at = ? WHERE id = ? AND league_id = ?`).bind(now, row.id, league.id),
    db.prepare(`INSERT INTO companion_export_events (id, export_id, league_id, event_type, detail_json, created_at) VALUES (?, ?, ?, 'rejected', ?, ?)`).bind(crypto.randomUUID(), row.id, league.id, JSON.stringify({ reason, rawPayloadRetained: true }), now)
  ]);
  const next = await db.prepare(`SELECT * FROM companion_exports WHERE league_id = ? AND status IN ('pending','inspected','mapped') ORDER BY received_at DESC LIMIT 1`).bind(league.id).first();
  if (next) {
    await context.env.COMPANION_EXPORT_META.put(companionMetadataKey(league.id), JSON.stringify({ exportId: next.id, leagueId: league.id, leagueSlug: league.slug, receivedAt: next.received_at, updatedAt: now, status: next.status, byteLength: next.byte_length, contentType: next.content_type, r2ObjectKey: next.r2_object_key, payloadStored: true, season: next.season, week: next.week, teamCount: next.team_count, playerCount: next.player_count }));
  } else {
    await context.env.COMPANION_EXPORT_META.delete(companionMetadataKey(league.id));
  }
  return json({ ok: true, rejected: true, export: publicExport({ ...row, status: 'rejected', processed_at: now }), rawPayloadRetained: true, nextPendingExport: publicExport(next) });
}
