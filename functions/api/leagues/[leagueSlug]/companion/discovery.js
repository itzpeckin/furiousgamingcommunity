import { json, database, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';
import { classifyMaddenRoute } from '../../../../_lib/madden-discovery.js';

const RELEASE = '7.3.0';

export async function onRequestGet(context) {
  const slug = String(context.params?.leagueSlug || '').trim().toLowerCase();
  if (!validLeagueSlug(slug)) return json({ ok:false, error:'Invalid league slug.' }, 400);
  const authorization = await requireCommissioner(context);
  if (!authorization.authorized) return authorization.response;
  const db = database(context.env);
  if (!db) return json({ ok:false, error:'D1 is not configured.' }, 503);
  const league = await resolveLeague(context.env, slug);
  if (!league || authorization.session.membership?.leagueId !== league.id) {
    return json({ ok:false, error:'Not found.' }, 404);
  }
  const latestSession = await db.prepare(`SELECT id,status,capture_count,expires_at,last_capture_at,created_at
    FROM madden_discovery_sessions WHERE league_id=? ORDER BY created_at DESC LIMIT 1`)
    .bind(league.id).first();
  const rows = latestSession
    ? await db.prepare(`SELECT c.id,link.session_id AS discovery_session_id,c.route_path,c.request_method,c.content_type,
        c.byte_length,c.top_level_keys_json,c.collections_json,link.observed_at AS received_at
      FROM madden_discovery_session_captures link
      JOIN companion_route_captures c ON c.id=link.capture_id AND c.league_id=link.league_id
      WHERE link.league_id=? AND link.session_id=? ORDER BY link.observed_at DESC LIMIT 250`)
      .bind(league.id, latestSession.id).all()
    : await db.prepare(`SELECT id, discovery_session_id, route_path, request_method, content_type,
        byte_length, top_level_keys_json, collections_json, received_at
      FROM companion_route_captures WHERE league_id = ? ORDER BY received_at DESC LIMIT 250`)
      .bind(league.id).all();
  const captures = (rows.results || []).map(row => ({
    captureId:row.id, discoverySessionId:row.discovery_session_id, routePath:row.route_path,
    method:row.request_method, contentType:row.content_type, byteLength:row.byte_length,
    topLevelKeys:JSON.parse(row.top_level_keys_json || '[]'), collections:JSON.parse(row.collections_json || '[]'),
    receivedAt:row.received_at, datasetType:classifyMaddenRoute(row.route_path)
  }));
  const byRoute = new Map();
  for (const capture of captures) {
    const current = byRoute.get(capture.routePath) || { routePath:capture.routePath, captureCount:0, latestReceivedAt:null, latestByteLength:0, topLevelKeys:[], collections:[] };
    current.captureCount += 1;
    if (!current.latestReceivedAt) { current.latestReceivedAt=capture.receivedAt; current.latestByteLength=capture.byteLength; current.topLevelKeys=capture.topLevelKeys; current.collections=capture.collections; }
    byRoute.set(capture.routePath,current);
  }
  const datasetSummary = {};
  for (const capture of captures) datasetSummary[capture.datasetType] = (datasetSummary[capture.datasetType] || 0) + 1;
  return json({ ok:true, release:RELEASE, leagueId:league.id, leagueSlug:slug,
    discoverySession:latestSession ? {
      id:latestSession.id,status:latestSession.status,captureCount:Number(latestSession.capture_count||0),
      expiresAt:latestSession.expires_at,lastCaptureAt:latestSession.last_capture_at,createdAt:latestSession.created_at
    } : null,
    sessionCount:new Set(captures.map(row=>row.discoverySessionId)).size,
    routeCount:byRoute.size, captureCount:captures.length, datasetSummary, routes:[...byRoute.values()], captures,
    activationPerformed:false, rawPayloadReturned:false });
}
