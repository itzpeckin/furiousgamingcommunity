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
  companionDiscoveryKey,
  summarizePayloadShape
} from '../../../../../../_lib/cloud-platform.js';
import { hashToken } from '../../../../../../_lib/auth.js';
import { deriveLeagueExportToken } from '../../../../../../_lib/permanent-league-export.js';
import { generateMaddenDiscoveryReport } from '../../../../../../_lib/madden-discovery-report.js';

const RELEASE = '7.3.4.5';
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS']);
const AUTOMATIC_COHORT_WINDOW_MS = 2 * 60 * 1000;
const AUTOMATIC_LATE_CAPTURE_WINDOW_MS = 15 * 1000;
const AUTOMATIC_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const AUTOMATIC_ANALYSIS_IDLE_MS = 3_000;
const AUTOMATIC_ANALYSIS_MAX_WAIT_MS = 24_000;

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

async function discoverySessionFor(db, leagueId, token) {
  const tokenHash = await hashToken(token);
  return db.prepare(`SELECT id,expires_at FROM madden_discovery_sessions
    WHERE league_id=? AND token_hash=? AND status='open'
      AND datetime(expires_at)>CURRENT_TIMESTAMP
    LIMIT 1`).bind(leagueId, tokenHash).first();
}

async function permanentEndpointFor(db, leagueId) {
  return db.prepare(`SELECT * FROM companion_league_export_endpoints
    WHERE league_id=? LIMIT 1`).bind(leagueId).first();
}

async function automaticCohortId(leagueId, endpoint) {
  const marker = [
    'permanent-cohort-v2',
    leagueId,
    Number(endpoint?.token_version || 1),
    endpoint?.latest_session_id || 'initial',
    endpoint?.last_received_at || endpoint?.updated_at || endpoint?.created_at || 'initial'
  ].join(':');
  const digest = await sha256Hex(new TextEncoder().encode(marker));
  return `m27_auto_${digest.slice(0,32)}`;
}

export async function automaticSessionFor(db, league, suppliedEndpoint) {
  const endpoint = await permanentEndpointFor(db,league.id) || suppliedEndpoint;
  if (!endpoint || endpoint.status !== 'active') {
    throw new Error('The permanent league export endpoint is unavailable.');
  }
  const previous = endpoint?.latest_session_id
    ? await db.prepare(`SELECT * FROM madden_discovery_sessions
      WHERE league_id=? AND id=? LIMIT 1`).bind(league.id,endpoint.latest_session_id).first()
    : null;
  const previousActivity = Date.parse(previous?.last_capture_at || previous?.created_at || '') || 0;
  const reuseWindow = previous?.status === 'open'
    ? AUTOMATIC_COHORT_WINDOW_MS
    : AUTOMATIC_LATE_CAPTURE_WINDOW_MS;
  if (previous && Number(endpoint.latest_session_token_version) === Number(endpoint.token_version)
    && !['expired','cancelled'].includes(previous.status)
    && Date.now()-previousActivity <= reuseWindow) return previous;

  const gameYear = await db.prepare(`SELECT game_release FROM league_game_years
    WHERE league_id=? AND status IN ('active','restored','preparing')
    ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'restored' THEN 1 ELSE 2 END,updated_at DESC LIMIT 1`)
    .bind(league.id).first();
  const season = await db.prepare(`SELECT source_season_id FROM franchise_seasons
    WHERE league_id=? ORDER BY updated_at DESC,created_at DESC LIMIT 1`).bind(league.id).first();
  // Every concurrent request that observes the same endpoint generation derives
  // the same candidate ID. INSERT OR IGNORE plus the compare-and-swap pointer
  // prevents one Madden burst from fragmenting into many sessions.
  const id = await automaticCohortId(league.id,endpoint);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now()+AUTOMATIC_SESSION_DURATION_MS).toISOString();
  const tokenHash = await hashToken(`permanent:${league.id}:${endpoint.token_version}:${id}`);
  await db.prepare(`INSERT OR IGNORE INTO madden_discovery_sessions
      (id,league_id,token_hash,status,expected_game_release,expected_league_name,expected_season,
       expires_at,created_at,updated_at)
      VALUES (?,?,?,'open',?,?,?,?,?,?)`).bind(
        id,league.id,tokenHash,
        gameYear?.game_release || null,league.name,season?.source_season_id || null,
        expiresAt,createdAt,createdAt
      ).run();
  await db.prepare(`UPDATE companion_league_export_endpoints SET
      latest_session_id=?,latest_session_token_version=?,analysis_requested_at=NULL,updated_at=?
      WHERE league_id=? AND status='active' AND token_version=?
        AND latest_session_id IS ?`).bind(
          id,endpoint.token_version,createdAt,league.id,
          endpoint.token_version,endpoint.latest_session_id || null
        ).run();
  const winner = await permanentEndpointFor(db,league.id);
  if (Number(winner?.token_version) !== Number(endpoint.token_version)) {
    throw new Error('The permanent export URL changed while Madden was sending data.');
  }
  const winnerId = winner?.latest_session_id;
  if (!winnerId) throw new Error('The automatic export cohort could not be claimed.');
  const session = await db.prepare(`SELECT * FROM madden_discovery_sessions
    WHERE league_id=? AND id=? LIMIT 1`).bind(league.id,winnerId).first();
  if (!session) throw new Error('The claimed automatic export cohort is unavailable.');
  return session;
}

async function afterPermanentCapture(context, db, leagueId, sessionId, receivedAt) {
  await db.prepare(`UPDATE companion_league_export_endpoints SET
    latest_session_id=?,last_received_at=?,updated_at=? WHERE league_id=?`).bind(
      sessionId,receivedAt,receivedAt,leagueId
    ).run();
  const claim = await db.prepare(`UPDATE companion_league_export_endpoints
    SET analysis_requested_at=?,updated_at=?
    WHERE league_id=? AND (
      analysis_requested_at IS NULL
      OR datetime(analysis_requested_at)<=datetime(?,'-30 seconds')
    )`).bind(receivedAt,receivedAt,leagueId,receivedAt).run();
  if (!Number(claim?.meta?.changes || 0)) return;
  const analyze = (async()=>{
    try {
      const deadline = Date.now()+AUTOMATIC_ANALYSIS_MAX_WAIT_MS;
      while (Date.now()<deadline) {
        const session = await db.prepare(`SELECT last_capture_at FROM madden_discovery_sessions
          WHERE league_id=? AND id=? LIMIT 1`).bind(leagueId,sessionId).first();
        const idleMs = Date.now()-(Date.parse(session?.last_capture_at || '') || Date.now());
        if (idleMs >= AUTOMATIC_ANALYSIS_IDLE_MS) break;
        await new Promise(resolve=>setTimeout(resolve,Math.min(
          AUTOMATIC_ANALYSIS_IDLE_MS-idleMs,
          Math.max(1,deadline-Date.now())
        )));
      }
      await generateMaddenDiscoveryReport({
        db,env:context.env,leagueId,sessionId,reuseExisting:true
      });
    } catch (error) {
      console.error('Automatic Madden export analysis failed',error?.message || error);
    } finally {
      await db.prepare(`UPDATE companion_league_export_endpoints SET analysis_requested_at=NULL
        WHERE league_id=? AND latest_session_id=?`).bind(leagueId,sessionId).run().catch(()=>{});
    }
  })();
  if (typeof context.waitUntil === 'function') context.waitUntil(analyze);
  else await analyze;
}

async function linkSessionCapture(db, leagueId, discoverySessionId, captureId, routePath, observedAt) {
  if (!discoverySessionId) return;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO madden_discovery_session_captures
      (league_id,session_id,capture_id,route_path,observed_at) VALUES (?,?,?,?,?)`)
      .bind(leagueId, discoverySessionId, captureId, routePath, observedAt),
    db.prepare(`UPDATE madden_discovery_sessions
      SET capture_count=(SELECT COUNT(*) FROM madden_discovery_session_captures
        WHERE league_id=? AND session_id=?),last_capture_at=?,updated_at=?
      WHERE league_id=? AND id=?`).bind(
        leagueId, discoverySessionId, observedAt, observedAt, leagueId, discoverySessionId
      )
  ]);
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

    const db = database(context.env);
    const bindings = bindingStatus(context.env);
    if (!db || !bindings.r2 || !bindings.kv) {
      return json({ ok: false, error: 'Route discovery storage is not fully configured.', release: RELEASE }, 503);
    }

    const league = await resolveLeague(context.env, slug);
    if (!league) {
      return json({ ok: false, error: 'League not found.', release: RELEASE }, 404);
    }

    const suppliedToken = tokenOf(context);
    let discoverySession = await discoverySessionFor(db, league.id, suppliedToken);
    const permanentEndpoint = await permanentEndpointFor(db,league.id);
    const permanentSigningSecret = context.env.COMPANION_EXPORT_TOKEN || context.env.SESSION_SIGNING_SECRET;
    const permanentToken = permanentEndpoint?.status === 'active' && permanentSigningSecret
      ? await deriveLeagueExportToken(permanentSigningSecret,league.id,permanentEndpoint.token_version)
      : null;
    const permanentAuthorized = Boolean(permanentToken && safeEqual(suppliedToken,permanentToken));
    const expected = await configuredExportToken(context.env, league);
    const legacyAuthorized = Boolean(!permanentEndpoint && expected && safeEqual(suppliedToken, expected));
    if (!discoverySession && !legacyAuthorized && !permanentAuthorized) {
      return json({ ok: false, error: 'Unauthorized export request.', release: RELEASE }, 401);
    }

    if (permanentAuthorized && method !== 'GET') {
      discoverySession = await automaticSessionFor(db,league,permanentEndpoint);
    }

    if (method === 'GET') {
      return json({
        ok: true,
        ready: true,
        mode: permanentAuthorized ? 'permanent-league-export' : 'route-discovery',
        leagueSlug: slug,
        routePath,
        discoverySessionId: discoverySession?.id || null,
        expiresAt: permanentAuthorized ? null : discoverySession?.expires_at || null,
        reusable:permanentAuthorized,
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
    const discoverySessionId = discoverySession?.id || sessionId(context.request, slug);
    const payloadHash = await sha256Hex(rawBytes);
    const key = companionRouteObjectKey(
      league.id,
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
      if (discoverySession) {
        await linkSessionCapture(db, league.id, discoverySession.id, duplicate.id, routePath, receivedAt);
      }
      if (permanentAuthorized && discoverySession) {
        await afterPermanentCapture(context,db,league.id,discoverySession.id,receivedAt);
      }
      return json({
        ok: true,
        accepted: false,
        duplicate: true,
        mode:permanentAuthorized ? 'permanent-league-export' : 'route-discovery',
        captureId: duplicate.id,
        discoverySessionId,
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
      const statements = [db.prepare(`INSERT INTO companion_route_captures
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
      ];
      if (discoverySession) {
        statements.push(
          db.prepare(`INSERT OR IGNORE INTO madden_discovery_session_captures
            (league_id,session_id,capture_id,route_path,observed_at) VALUES (?,?,?,?,?)`)
            .bind(league.id, discoverySession.id, captureId, routePath, receivedAt),
          db.prepare(`UPDATE madden_discovery_sessions
            SET capture_count=capture_count+1,last_capture_at=?,updated_at=?
            WHERE league_id=? AND id=?`).bind(receivedAt, receivedAt, league.id, discoverySession.id)
        );
      }
      await db.batch(statements);
    } catch (error) {
      await context.env.COMPANION_EXPORTS.delete(key).catch(() => {});
      return json({
        ok: false,
        error: 'Dataset reached R2 but could not be recorded in D1.',
        detail: String(error?.message || error),
        release: RELEASE
      }, 500);
    }

    if (permanentAuthorized && discoverySession) {
      await afterPermanentCapture(context,db,league.id,discoverySession.id,receivedAt);
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
        companionDiscoveryKey(league.id),
        JSON.stringify(pointer)
      );
    } catch (error) {
      // The payload is safely retained in R2 and D1. Report partial success instead of crashing Madden.
      return successResponse({
        mode:permanentAuthorized ? 'permanent-league-export' : 'route-discovery',
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
      mode:permanentAuthorized ? 'permanent-league-export' : 'route-discovery',
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
