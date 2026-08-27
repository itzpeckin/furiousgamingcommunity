import {
  JSON_HEADERS, json, database, normalizeLeagueSlug, validLeagueSlug,
  companionMetadataKey, configuredExportToken, suppliedExportToken,
  safeEqual, resolveLeague, publicExport
} from '../../../../_lib/cloud-platform.js';

function kind(value) { if (Array.isArray(value)) return 'array'; if (value === null) return 'null'; return typeof value; }
function summarizeObject(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) return null; return { keys: Object.keys(value).slice(0, 100), fieldTypes: Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, val]) => [key, kind(val)])) }; }
function collectionCandidates(root) {
  const found = [];
  const walk = (object, path, depth) => {
    if (depth > 3 || !object || typeof object !== 'object') return;
    for (const [key, value] of Object.entries(object)) {
      const next = path ? `${path}.${key}` : key;
      if (Array.isArray(value)) {
        const first = value.find(item => item && typeof item === 'object' && !Array.isArray(item));
        found.push({ path: next, count: value.length, item: summarizeObject(first) });
      } else if (value && typeof value === 'object') walk(value, next, depth + 1);
    }
  };
  walk(root, '', 0); return found.slice(0, 60);
}
function likelyFields(keys = []) {
  const match = terms => keys.filter(key => terms.some(term => key.toLowerCase().includes(term))).slice(0, 20);
  return { ids: match(['id','assetname']), teamAssignments: match(['team','club','roster']), names: match(['name','first','last']), positions: match(['position','pos']), ratings: match(['overall','ovr','rating']), development: match(['dev','trait']), status: match(['injury','status','reserve']) };
}
function analyze(payload, row) {
  const root = summarizeObject(payload) || { keys: [], fieldTypes: {} };
  const collections = collectionCandidates(payload).map(candidate => ({ ...candidate, likelyFields: likelyFields(candidate.item?.keys || []) }));
  return { exportId: row.id, receivedAt: row.received_at, byteLength: row.byte_length, season: row.season, week: row.week, topLevel: root, collections, rawPayloadReturned: false, activationPerformed: false };
}
export async function onRequestOptions() { return new Response(null, { status: 204, headers: { ...JSON_HEADERS, 'access-control-allow-methods': 'GET,OPTIONS', 'access-control-allow-headers': 'x-franchisehq-export-token,authorization' } }); }
export async function onRequestGet(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return json({ ok: false, error: 'Invalid league slug.' }, 400);
  const db = database(context.env);
  if (!db || !context.env.COMPANION_EXPORTS?.get || !context.env.COMPANION_EXPORT_META?.put) return json({ ok: false, error: 'Companion storage is not configured.' }, 503);
  const league = await resolveLeague(context.env, slug);
  if (!league) return json({ ok: false, error: 'League not found.' }, 404);
  const token = await configuredExportToken(context.env, league);
  if (!token) return json({ ok: false, error: 'No export token is configured for this league.' }, 503);
  if (!safeEqual(suppliedExportToken(context.request), token)) return json({ ok: false, error: 'Unauthorized inspection request.' }, 401);
  const row = await db.prepare(`SELECT * FROM companion_exports WHERE league_id = ? AND status IN ('pending','inspected','mapped') ORDER BY received_at DESC LIMIT 1`).bind(league.id).first();
  if (!row?.r2_object_key) return json({ ok: false, error: 'No pending Companion export is available.' }, 404);
  const object = await context.env.COMPANION_EXPORTS.get(row.r2_object_key);
  if (!object) return json({ ok: false, error: 'The pending export payload could not be found in R2.' }, 404);
  let payload; try { payload = JSON.parse(await object.text()); } catch (_) { return json({ ok: false, error: 'Stored export is not valid JSON.' }, 422); }
  const inspection = analyze(payload, row);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE companion_exports SET status = 'inspected', inspection_json = ? WHERE id = ? AND league_id = ?`).bind(JSON.stringify(inspection), row.id, league.id),
    db.prepare(`INSERT INTO companion_export_events (id, export_id, league_id, event_type, detail_json, created_at) VALUES (?, ?, ?, 'inspected', ?, ?)`).bind(crypto.randomUUID(), row.id, league.id, JSON.stringify({ collectionCount: inspection.collections.length }), now)
  ]);
  const pointer = { exportId: row.id, leagueId: league.id, leagueSlug: slug, receivedAt: row.received_at, updatedAt: now, status: 'inspected', byteLength: row.byte_length, contentType: row.content_type, r2ObjectKey: row.r2_object_key, payloadStored: true, season: row.season, week: row.week, teamCount: row.team_count, playerCount: row.player_count };
  await context.env.COMPANION_EXPORT_META.put(companionMetadataKey(league.id), JSON.stringify(pointer));
  return json({ ok: true, leagueSlug: slug, export: publicExport({ ...row, status: 'inspected', inspection_json: JSON.stringify(inspection) }), inspection });
}
