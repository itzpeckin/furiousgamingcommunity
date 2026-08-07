import { json, database, validLeagueSlug, resolveLeague } from '../../../../../_lib/cloud-platform.js';

export async function onRequestGet(context) {
  const slug = String(context.params?.leagueSlug || '').trim().toLowerCase();
  if (!validLeagueSlug(slug)) return json({ ok:false, error:'Invalid league slug.' }, 400);
  const db = database(context.env);
  if (!db) return json({ ok:false, error:'D1 is not configured.' }, 503);
  const league = await resolveLeague(context.env, slug);
  if (!league) return json({ ok:false, error:'League not found.' }, 404);
  const rows = await db.prepare(`SELECT id, discovery_session_id, route_path, request_method, content_type,
      byte_length, top_level_keys_json, collections_json, received_at
    FROM companion_route_captures WHERE league_id = ? ORDER BY received_at DESC LIMIT 250`)
    .bind(league.id).all();
  const captures = (rows.results || []).map(row => ({
    captureId:row.id, discoverySessionId:row.discovery_session_id, routePath:row.route_path,
    method:row.request_method, contentType:row.content_type, byteLength:row.byte_length,
    topLevelKeys:JSON.parse(row.top_level_keys_json || '[]'), collections:JSON.parse(row.collections_json || '[]'),
    receivedAt:row.received_at
  }));
  const byRoute = new Map();
  for (const capture of captures) {
    const current = byRoute.get(capture.routePath) || { routePath:capture.routePath, captureCount:0, latestReceivedAt:null, latestByteLength:0, topLevelKeys:[], collections:[] };
    current.captureCount += 1;
    if (!current.latestReceivedAt) { current.latestReceivedAt=capture.receivedAt; current.latestByteLength=capture.byteLength; current.topLevelKeys=capture.topLevelKeys; current.collections=capture.collections; }
    byRoute.set(capture.routePath,current);
  }
  return json({ ok:true, release:'5.9.3.0', leagueId:league.id, leagueSlug:slug,
    sessionCount:new Set(captures.map(row=>row.discoverySessionId)).size,
    routeCount:byRoute.size, captureCount:captures.length, routes:[...byRoute.values()], captures,
    activationPerformed:false, rawPayloadReturned:false });
}
