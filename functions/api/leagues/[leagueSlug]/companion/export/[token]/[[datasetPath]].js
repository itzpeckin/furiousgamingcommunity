import {
  JSON_HEADERS,
  json,
  database,
  validLeagueSlug,
  resolveLeague,
  configuredExportToken,
  safeEqual,
  sha256Hex,
  bindingStatus,
  normalizeDiscoveryPath,
  companionRouteObjectKey,
  summarizePayloadShape
} from '../../../../../../_lib/cloud-platform.js';

const RELEASE = '5.9.10.6.2e';
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS']);

function slugOf(context) {
  return String(context.params?.leagueSlug || '').trim().toLowerCase();
}

function tokenOf(context) {
  return String(context.params?.token || '').trim();
}

function headerSnapshot(request) {
  const allowed = [
    'content-type',
    'content-length',
    'content-encoding',
    'transfer-encoding',
    'user-agent',
    'accept',
    'accept-encoding',
    'x-forwarded-proto'
  ];
  const result = {};
  for (const name of allowed) {
    const value = request.headers.get(name);
    if (value) result[name] = value;
  }
  return result;
}

function sessionId(request, slug) {
  const supplied = request.headers.get('x-franchisehq-discovery-session');
  if (supplied && /^[a-zA-Z0-9._-]{4,100}$/.test(supplied)) return supplied;
  const bucket = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return `${slug}-${bucket}`;
}

function decodeUtf8(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch (_) {
    return '';
  }
}

function parseBody(bytes, contentType) {
  const text = decodeUtf8(bytes);
  const trimmed = text.trim();
  const type = String(contentType || '').toLowerCase();

  if (!bytes.byteLength) {
    return {
      bodyFormat: 'empty',
      parseStatus: 'empty',
      text,
      payload: null,
      shape: { topLevelKeys: [], collections: [] }
    };
  }

  const shouldTryJson =
    type.includes('json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[');

  if (shouldTryJson) {
    try {
      const payload = JSON.parse(trimmed);
      return {
        bodyFormat: 'json',
        parseStatus: 'parsed',
        text,
        payload,
        shape: summarizePayloadShape(payload)
      };
    } catch (_) {
      // Discovery mode must preserve unexpected bodies instead of rejecting them.
    }
  }

  if (type.includes('application/x-www-form-urlencoded')) {
    try {
      const params = new URLSearchParams(text);
      const payload = Object.fromEntries(params.entries());
      return {
        bodyFormat: 'form-urlencoded',
        parseStatus: 'parsed-as-form',
        text,
        payload,
        shape: summarizePayloadShape(payload)
      };
    } catch (_) {
      // Fall through to raw capture.
    }
  }

  return {
    bodyFormat: type.includes('text/') ? 'text' : 'binary-or-unknown',
    parseStatus: 'raw-only',
    text,
    payload: null,
    shape: { topLevelKeys: [], collections: [] }
  };
}

function freeAgentCaptureAssessment(routePath,parsed){
  if(!/\/freeagents\/roster\/?$/i.test(String(routePath||'')))return null;
  const list=Array.isArray(parsed?.payload?.rosterInfoList)?parsed.payload.rosterInfoList:[];
  return{
    dataset:'free-agents',
    datasetValid:parsed?.payload?.success!==false && list.length>0,
    playerCount:list.length,
    maddenSuccess:parsed?.payload?.success??null,
    maddenMessage:parsed?.payload?.message||null
  };
}

function successResponse(details, status = 200) {
  return json({
    ok: true,
    accepted: true,
    mode: 'route-discovery',
    release: RELEASE,
    activationPerformed: false,
    ...details
  }, status);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      ...JSON_HEADERS,
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,OPTIONS',
      'access-control-allow-headers': 'content-type,content-encoding,x-franchisehq-discovery-session'
    }
  });
}

export async function onRequest(context) {
  const slug = slugOf(context);
  const routePath = normalizeDiscoveryPath(context) || 'root';
  const method = String(context.request.method || 'GET').toUpperCase();

  try {
    if (!validLeagueSlug(slug)) {
      return json({ ok: false, error: 'Invalid league slug.', release: RELEASE }, 400);
    }

    if (!ALLOWED_METHODS.has(method)) {
      return json({ ok: false, error: `Unsupported method ${method}.`, release: RELEASE }, 405);
    }

    const expected = await configuredExportToken(context.env, slug);
    if (!expected || !safeEqual(tokenOf(context), expected)) {
      return json({ ok: false, error: 'Unauthorized export request.', release: RELEASE }, 401);
    }

    const db = database(context.env);
    const bindings = bindingStatus(context.env);
    if (!db || !bindings.r2 || !bindings.kv) {
      return json({ ok: false, error: 'Route discovery storage is not fully configured.', release: RELEASE }, 503);
    }

    const league = await resolveLeague(context.env, slug);
    if (!league) {
      return json({ ok: false, error: 'League not found.', release: RELEASE }, 404);
    }

    if (method === 'GET') {
      return json({
        ok: true,
        ready: true,
        mode: 'route-discovery',
        leagueSlug: slug,
        routePath,
        release: RELEASE
      });
    }

    const declaredLength = Number(context.request.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > bindings.maxBytes) {
      return json({ ok: false, error: 'Dataset exceeds the 20 MB receiver limit.', release: RELEASE }, 413);
    }

    const rawBuffer = await context.request.arrayBuffer();
    const rawBytes = new Uint8Array(rawBuffer);
    const byteLength = rawBytes.byteLength;
    if (byteLength > bindings.maxBytes) {
      return json({ ok: false, error: 'Dataset exceeds the 20 MB receiver limit.', release: RELEASE }, 413);
    }

    const contentType = context.request.headers.get('content-type') || 'application/octet-stream';
    const contentEncoding = context.request.headers.get('content-encoding') || null;
    const parsed = parseBody(rawBytes, contentType);
    const receivedAt = new Date().toISOString();
    const captureId = crypto.randomUUID();
    const discoverySessionId = sessionId(context.request, slug);
    const payloadHash = await sha256Hex(rawBytes);
    const key = companionRouteObjectKey(
      slug,
      discoverySessionId,
      routePath,
      captureId,
      receivedAt
    );

    const duplicate = await db.prepare(`SELECT id FROM companion_route_captures
      WHERE league_id = ? AND route_path = ? AND payload_hash = ? LIMIT 1`)
      .bind(league.id, routePath, payloadHash)
      .first();

    if (duplicate) {
      return json({
        ok: true,
        accepted: false,
        duplicate: true,
        captureId: duplicate.id,
        routePath,
        requestMethod: method,
        bodyFormat: parsed.bodyFormat,
        release: RELEASE
      }, 200);
    }

    const requestHeaders = {
      ...headerSnapshot(context.request),
      bodyFormat: parsed.bodyFormat,
      parseStatus: parsed.parseStatus,
      contentEncoding,
      emptyBody: byteLength === 0
    };

    await context.env.COMPANION_EXPORTS.put(key, rawBuffer, {
      httpMetadata: { contentType },
      customMetadata: {
        leagueId: String(league.id),
        leagueSlug: slug,
        captureId,
        discoverySessionId,
        routePath,
        requestMethod: method,
        bodyFormat: parsed.bodyFormat,
        parseStatus: parsed.parseStatus,
        receivedAt,
        payloadHash
      }
    });

    try {
      await db.prepare(`INSERT INTO companion_route_captures
        (id, league_id, discovery_session_id, route_path, request_method, content_type, byte_length,
         payload_hash, r2_object_key, top_level_keys_json, collections_json, request_headers_json, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          captureId,
          league.id,
          discoverySessionId,
          routePath,
          method,
          contentType,
          byteLength,
          payloadHash,
          key,
          JSON.stringify(parsed.shape.topLevelKeys || []),
          JSON.stringify(parsed.shape.collections || []),
          JSON.stringify(requestHeaders),
          receivedAt
        )
        .run();
    } catch (error) {
      await context.env.COMPANION_EXPORTS.delete(key).catch(() => {});
      return json({
        ok: false,
        error: 'Dataset reached R2 but could not be recorded in D1.',
        detail: String(error?.message || error),
        release: RELEASE
      }, 500);
    }

    const pointer = {
      captureId,
      discoverySessionId,
      leagueId: league.id,
      leagueSlug: slug,
      routePath,
      requestMethod: method,
      contentType,
      contentEncoding,
      bodyFormat: parsed.bodyFormat,
      parseStatus: parsed.parseStatus,
      receivedAt,
      byteLength,
      r2ObjectKey: key,
      status: 'captured'
    };

    try {
      await context.env.COMPANION_EXPORT_META.put(
        `league:${slug}:companion:discovery:latest`,
        JSON.stringify(pointer)
      );
    } catch (error) {
      // The payload is safely retained in R2 and D1. Report partial success instead of crashing Madden.
      return successResponse({
        partial: true,
        warning: 'Capture was stored in R2 and D1, but the KV latest pointer could not be updated.',
        captureId,
        discoverySessionId,
        leagueSlug: slug,
        routePath,
        requestMethod: method,
        byteLength,
        contentType,
        contentEncoding,
        bodyFormat: parsed.bodyFormat,
        parseStatus: parsed.parseStatus,
        payloadShape: parsed.shape,
        freeAgentAssessment: freeAgentCaptureAssessment(routePath, parsed),
        kvError: String(error?.message || error)
      });
    }

    return successResponse({
      captureId,
      discoverySessionId,
      leagueSlug: slug,
      routePath,
      requestMethod: method,
      byteLength,
      contentType,
      contentEncoding,
      bodyFormat: parsed.bodyFormat,
      parseStatus: parsed.parseStatus,
      payloadShape: parsed.shape,
      freeAgentAssessment: freeAgentCaptureAssessment(routePath, parsed)
    });
  } catch (error) {
    // Discovery mode must return a useful JSON response instead of a generic uncaught Worker exception.
    return json({
      ok: false,
      error: 'Companion request could not be captured.',
      detail: String(error?.message || error),
      leagueSlug: slug,
      routePath,
      requestMethod: method,
      release: RELEASE
    }, 500);
  }
}
