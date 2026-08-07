import {
  JSON_HEADERS, json, database, validLeagueSlug, resolveLeague, configuredExportToken,
  safeEqual, sha256Hex, bindingStatus, normalizeDiscoveryPath, companionRouteObjectKey,
  summarizePayloadShape
} from '../../../../../../_lib/cloud-platform.js';

function slugOf(context) { return String(context.params?.leagueSlug || '').trim().toLowerCase(); }
function tokenOf(context) { return String(context.params?.token || '').trim(); }
function headerSnapshot(request) {
  const allowed = ['content-type','content-length','user-agent','accept','accept-encoding','x-forwarded-proto'];
  const result = {};
  for (const name of allowed) { const value = request.headers.get(name); if (value) result[name] = value; }
  return result;
}
function sessionId(request, slug) {
  const supplied = request.headers.get('x-franchisehq-discovery-session');
  if (supplied && /^[a-zA-Z0-9._-]{4,100}$/.test(supplied)) return supplied;
  const bucket = new Date().toISOString().slice(0,16).replace(/[-:T]/g,'');
  return `${slug}-${bucket}`;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: {
    ...JSON_HEADERS,
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'content-type,x-franchisehq-discovery-session'
  }});
}

export async function onRequest(context) {
  const slug = slugOf(context);
  if (!validLeagueSlug(slug)) return json({ ok:false, error:'Invalid league slug.' }, 400);
  const expected = await configuredExportToken(context.env, slug);
  if (!expected || !safeEqual(tokenOf(context), expected)) return json({ ok:false, error:'Unauthorized export request.' }, 401);
  const db = database(context.env);
  const bindings = bindingStatus(context.env);
  if (!db || !bindings.r2 || !bindings.kv) return json({ ok:false, error:'Route discovery storage is not fully configured.' }, 503);
  const league = await resolveLeague(context.env, slug);
  if (!league) return json({ ok:false, error:'League not found.' }, 404);

  const routePath = normalizeDiscoveryPath(context) || 'root';
  const method = context.request.method.toUpperCase();
  if (method === 'GET') return json({ ok:true, ready:true, mode:'route-discovery', leagueSlug:slug, routePath, release:'5.9.3.0' });
  if (!['POST','PUT'].includes(method)) return json({ ok:false, error:`Unsupported method ${method}.` }, 405);

  const maxBytes = bindings.maxBytes;
  const raw = await context.request.text();
  const byteLength = new TextEncoder().encode(raw).byteLength;
  if (byteLength > maxBytes) return json({ ok:false, error:'Dataset exceeds the 20 MB receiver limit.' }, 413);
  if (!raw.trim()) return json({ ok:false, error:'Dataset payload is empty.' }, 400);
  let payload;
  try { payload = JSON.parse(raw); }
  catch (_) { return json({ ok:false, error:'Dataset body is not valid JSON.' }, 400); }

  const receivedAt = new Date().toISOString();
  const captureId = crypto.randomUUID();
  const discoverySessionId = sessionId(context.request, slug);
  const payloadHash = await sha256Hex(raw);
  const shape = summarizePayloadShape(payload);
  const key = companionRouteObjectKey(slug, discoverySessionId, routePath, captureId, receivedAt);
  const duplicate = await db.prepare(`SELECT id FROM companion_route_captures
    WHERE league_id = ? AND route_path = ? AND payload_hash = ? LIMIT 1`)
    .bind(league.id, routePath, payloadHash).first();
  if (duplicate) return json({ ok:true, accepted:false, duplicate:true, captureId:duplicate.id, routePath }, 200);

  await context.env.COMPANION_EXPORTS.put(key, raw, {
    httpMetadata:{ contentType:context.request.headers.get('content-type') || 'application/json' },
    customMetadata:{ leagueId:league.id, leagueSlug:slug, captureId, discoverySessionId, routePath, receivedAt, payloadHash }
  });
  try {
    await db.prepare(`INSERT INTO companion_route_captures
      (id, league_id, discovery_session_id, route_path, request_method, content_type, byte_length,
       payload_hash, r2_object_key, top_level_keys_json, collections_json, request_headers_json, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(captureId, league.id, discoverySessionId, routePath, method,
        context.request.headers.get('content-type') || 'application/json', byteLength, payloadHash, key,
        JSON.stringify(shape.topLevelKeys), JSON.stringify(shape.collections), JSON.stringify(headerSnapshot(context.request)), receivedAt).run();
  } catch (error) {
    await context.env.COMPANION_EXPORTS.delete(key).catch(()=>{});
    return json({ ok:false, error:'Dataset reached R2 but could not be recorded in D1.', detail:String(error?.message || error) }, 500);
  }
  const pointer = { captureId, discoverySessionId, leagueId:league.id, leagueSlug:slug, routePath, receivedAt, byteLength, r2ObjectKey:key, status:'captured' };
  await context.env.COMPANION_EXPORT_META.put(`league:${slug}:companion:discovery:latest`, JSON.stringify(pointer));
  return json({ ok:true, accepted:true, mode:'route-discovery', captureId, discoverySessionId, routePath, byteLength, payloadShape:shape, activationPerformed:false }, 202);
}
