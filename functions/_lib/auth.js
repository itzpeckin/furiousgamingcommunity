import { resolveTenant } from './tenant-context.js';

const SESSION_COOKIE_NAME = "franchise_hq_session";
const OAUTH_STATE_COOKIE_NAME = "franchise_hq_oauth_state";
const SESSION_RECOVERY_COOKIE_NAME = "franchise_hq_session_recovery";
const CSRF_COOKIE_NAME = "franchise_hq_csrf";
const SESSION_TRANSFER_DURATION_SECONDS = 60 * 2;
const SESSION_IDLE_DURATION_SECONDS = 60 * 60 * 24 * 7;
const SESSION_ABSOLUTE_DURATION_SECONDS = 60 * 60 * 24 * 30;
const SESSION_ROTATION_DURATION_SECONDS = 60 * 60 * 24;

export const AUTH_CONSTANTS = {
  SESSION_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
  SESSION_RECOVERY_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  SESSION_DURATION_SECONDS: SESSION_IDLE_DURATION_SECONDS,
  SESSION_IDLE_DURATION_SECONDS,
  SESSION_ABSOLUTE_DURATION_SECONDS,
  SESSION_ROTATION_DURATION_SECONDS,
  OAUTH_STATE_DURATION_SECONDS: 60 * 10,
  SESSION_TRANSFER_DURATION_SECONDS
};

export function createRandomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function hashToken(token) {
  const encoded = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function userAgentHash(request) {
  const userAgent = String(request?.headers?.get("user-agent") || "unknown").slice(0, 512);
  return hashToken(userAgent);
}

function requestOrigin(request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

function earliestIso(...values) {
  const parsed = values
    .map((value) => Date.parse(String(value || "")))
    .filter(Number.isFinite);
  return parsed.length ? new Date(Math.min(...parsed)).toISOString() : null;
}

async function getImportDelegatedSession(context) {
  const token = context.request.headers.get("x-franchisehq-import-token");
  if (!token || !context.env?.DB) {
    return null;
  }

  const tokenHash = await hashToken(token);

  let record = null;
  try {
    record = await context.env.DB
      .prepare(
        `
        SELECT
          sessions.id AS session_id,
          sessions.expires_at,
          sessions.revoked_at,
          users.id AS user_id,
          users.discord_user_id,
          users.discord_username,
          users.discord_global_name,
          users.display_name,
          users.avatar_url,
          league_memberships.id AS membership_id,
          league_memberships.league_id,
          league_memberships.role,
          league_memberships.team_id,
          league_memberships.active AS membership_active
        FROM server_import_delegations
        INNER JOIN sessions
          ON sessions.id = server_import_delegations.session_id
        INNER JOIN users
          ON users.id = sessions.user_id
        LEFT JOIN league_memberships
          ON league_memberships.user_id = users.id
          AND league_memberships.league_id = server_import_delegations.league_id
        WHERE server_import_delegations.token_hash = ?
          AND server_import_delegations.expires_at > CURRENT_TIMESTAMP
          AND sessions.revoked_at IS NULL
          AND sessions.expires_at > CURRENT_TIMESTAMP
          AND (sessions.absolute_expires_at IS NULL OR sessions.absolute_expires_at > CURRENT_TIMESTAMP)
        LIMIT 1
        `
      )
      .bind(tokenHash)
      .first();
  } catch {
    return null;
  }

  if (!record) {
    return null;
  }

  return {
    sessionId: record.session_id,
    expiresAt: record.expires_at,
    user: {
      id: record.user_id,
      discordUserId: record.discord_user_id,
      discordUsername: record.discord_username,
      discordGlobalName: record.discord_global_name,
      displayName: record.display_name,
      avatarUrl: record.avatar_url
    },
    membership: record.membership_id
      ? {
          id: record.membership_id,
          leagueId: record.league_id,
          role: record.role,
          teamId: record.team_id,
          active: Boolean(record.membership_active)
        }
      : null
  };
}

export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function getCookie(request, cookieName) {
  const cookieHeader = request.headers.get("Cookie");

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");

    if (rawName === cookieName) {
      return decodeURIComponent(rawValueParts.join("="));
    }
  }

  return null;
}

export function createSecureCookie(
  name,
  value,
  maxAgeSeconds,
  path = "/"
) {
  const expires = new Date(Date.now() + Number(maxAgeSeconds || 0) * 1000).toUTCString();
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${expires}`,
    `Path=${path}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Priority=High"
  ].join("; ");
}

export function createClientCookie(name, value, maxAgeSeconds, path = "/") {
  const expires = new Date(Date.now() + Number(maxAgeSeconds || 0) * 1000).toUTCString();
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${expires}`,
    `Path=${path}`,
    "Secure",
    "SameSite=Strict",
    "Priority=High"
  ].join("; ");
}


function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = String(value || "").replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function encodeOpaqueContext(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value || {}));
  return bytesToBase64Url(bytes);
}

export function decodeOpaqueContext(value) {
  try {
    const bytes = base64UrlToBytes(value);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function clearSecureCookie(name, path = "/") {
  return [
    `${name}=`,
    "Max-Age=0",
    `Path=${path}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}

export function clearClientCookie(name, path = "/") {
  return [
    `${name}=`,
    "Max-Age=0",
    `Path=${path}`,
    "Secure",
    "SameSite=Strict"
  ].join("; ");
}

export function appendBrowserSessionCookies(headers, session) {
  if (!headers || !session?.rawSessionToken || !session?.rawCsrfToken) return headers;
  const now = Date.now();
  const idleRemaining = Math.max(0, Math.floor((Date.parse(session.expiresAt) - now) / 1000));
  const absoluteRemaining = Math.max(0, Math.floor((Date.parse(session.absoluteExpiresAt) - now) / 1000));
  const maxAge = Math.max(0, Math.min(
    AUTH_CONSTANTS.SESSION_IDLE_DURATION_SECONDS,
    Number.isFinite(idleRemaining) ? idleRemaining : AUTH_CONSTANTS.SESSION_IDLE_DURATION_SECONDS,
    Number.isFinite(absoluteRemaining) ? absoluteRemaining : AUTH_CONSTANTS.SESSION_IDLE_DURATION_SECONDS
  ));
  headers.append("Set-Cookie", createSecureCookie(
    AUTH_CONSTANTS.SESSION_COOKIE_NAME,
    session.rawSessionToken,
    maxAge,
    "/"
  ));
  headers.append("Set-Cookie", createClientCookie(
    AUTH_CONSTANTS.CSRF_COOKIE_NAME,
    session.rawCsrfToken,
    maxAge,
    "/"
  ));
  headers.append("Set-Cookie", clearSecureCookie(AUTH_CONSTANTS.SESSION_RECOVERY_COOKIE_NAME, "/"));
  return headers;
}

export function appendClearedBrowserSessionCookies(headers) {
  headers.append("Set-Cookie", clearSecureCookie(AUTH_CONSTANTS.SESSION_COOKIE_NAME, "/"));
  headers.append("Set-Cookie", clearSecureCookie(AUTH_CONSTANTS.SESSION_RECOVERY_COOKIE_NAME, "/"));
  headers.append("Set-Cookie", clearClientCookie(AUTH_CONSTANTS.CSRF_COOKIE_NAME, "/"));
  return headers;
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });

  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers
  });
}

export function redirectResponse(location, extraHeaders = {}) {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
    ...extraHeaders
  });

  return new Response(null, {
    status: 302,
    headers
  });
}

export function addSecondsToNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function sessionCapabilities(session) {
  const membership = session?.membership;
  if (!membership?.active) return Object.freeze([]);
  const capabilities = new Set(["league:read"]);
  if (membership.teamId) {
    capabilities.add("trade:create");
    capabilities.add("trade-block:manage");
    capabilities.add("confidence:submit");
  }
  if (["commissioner", "trade_committee"].includes(membership.role)) {
    capabilities.add("trade:review");
    capabilities.add("trade:vote");
  }
  if (membership.role === "commissioner") {
    capabilities.add("league:manage");
    capabilities.add("league:import");
    capabilities.add("league:memberships");
    capabilities.add("league:settings");
  }
  return Object.freeze([...capabilities].sort());
}

async function securityEventStatement(db, {
  sessionId = null,
  userId,
  leagueId = null,
  eventType,
  reason = null,
  request,
  detail = {},
  requireSession = false
}) {
  const values = [
    createId("session_event"), sessionId, userId, leagueId, eventType, reason,
    requestOrigin(request), await userAgentHash(request), JSON.stringify(detail || {})
  ];
  if (requireSession) {
    return db.prepare(`INSERT INTO session_security_events
      (id,session_id,user_id,league_id,event_type,reason,request_origin,user_agent_hash,detail_json)
      SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM sessions WHERE id=?)`)
      .bind(...values, sessionId);
  }
  return db.prepare(`INSERT INTO session_security_events
    (id,session_id,user_id,league_id,event_type,reason,request_origin,user_agent_hash,detail_json)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(...values);
}

export async function issueBrowserSession(context, userId, options = {}) {
  const db = context.env?.DB;
  if (!db) throw new Error("The session database is unavailable.");
  const rawSessionToken = createRandomToken(48);
  const rawCsrfToken = createRandomToken(32);
  const [sessionTokenHash, csrfTokenHash] = await Promise.all([
    hashToken(rawSessionToken),
    hashToken(rawCsrfToken)
  ]);
  const absoluteExpiresAt = options.absoluteExpiresAt
    || addSecondsToNow(AUTH_CONSTANTS.SESSION_ABSOLUTE_DURATION_SECONDS);
  const expiresAt = earliestIso(
    absoluteExpiresAt,
    addSecondsToNow(AUTH_CONSTANTS.SESSION_IDLE_DURATION_SECONDS)
  );
  if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
    throw new Error("The session lifetime has expired.");
  }
  const sessionId = createId("session");
  const recoveryMode = ["standard", "mobile-handoff", "owner-recovery"].includes(options.recoveryMode)
    ? options.recoveryMode
    : "standard";
  const oneTimeState = options.oneTimeState?.id && options.oneTimeState?.tokenHash
    ? options.oneTimeState
    : null;
  const issuedEvent = await securityEventStatement(db, {
    sessionId,
    userId,
    leagueId:options.leagueId || null,
    eventType:recoveryMode === "owner-recovery" ? "owner_recovery" : "issued",
    reason:options.reason || recoveryMode,
    request:context.request,
    detail:{ recoveryMode, parentSessionId:options.parentSessionId || null },
    requireSession:Boolean(oneTimeState)
  });
  const insert = oneTimeState
    ? db.prepare(`INSERT INTO sessions
        (id,user_id,session_token_hash,expires_at,absolute_expires_at,last_rotated_at,
         parent_session_id,csrf_token_hash,recovery_mode)
        SELECT ?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?
        WHERE EXISTS (SELECT 1 FROM oauth_states
          WHERE id=? AND state_token_hash=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP)`)
      .bind(sessionId,userId,sessionTokenHash,expiresAt,absoluteExpiresAt,
        options.parentSessionId || null,csrfTokenHash,recoveryMode,oneTimeState.id,oneTimeState.tokenHash)
    : db.prepare(`INSERT INTO sessions
        (id,user_id,session_token_hash,expires_at,absolute_expires_at,last_rotated_at,
         parent_session_id,csrf_token_hash,recovery_mode)
        VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?)`)
      .bind(sessionId,userId,sessionTokenHash,expiresAt,absoluteExpiresAt,
        options.parentSessionId || null,csrfTokenHash,recoveryMode);
  const consume = oneTimeState
    ? db.prepare(`UPDATE oauth_states SET used_at=CURRENT_TIMESTAMP
        WHERE id=? AND state_token_hash=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP`)
      .bind(oneTimeState.id,oneTimeState.tokenHash)
    : null;
  const results = await db.batch([insert, issuedEvent, ...(consume ? [consume] : [])]);
  if (Number(results?.[0]?.meta?.changes || 0) !== 1
    || (consume && Number(results?.[2]?.meta?.changes || 0) !== 1)) {
    if (oneTimeState) {
      const error = new Error("The login handoff expired or was already used.");
      error.code = "SESSION_HANDOFF_CONSUMED";
      throw error;
    }
    throw new Error("The authenticated session could not be stored.");
  }
  return {
    kind:"browser",
    sessionId,
    userId,
    rawSessionToken,
    rawCsrfToken,
    expiresAt,
    absoluteExpiresAt,
    recoveryMode,
    rotated:false,
    needsRotation:false
  };
}

export async function rotateBrowserSession(context, session, options = {}) {
  if (!session || session.kind !== "browser") return session;
  if (!session.needsRotation && options.force !== true) return session;
  const db = context.env?.DB;
  const replacement = await issueBrowserSession(context, session.user.id, {
    absoluteExpiresAt:session.absoluteExpiresAt,
    parentSessionId:session.sessionId,
    leagueId:session.membership?.leagueId || null,
    recoveryMode:options.recoveryMode || session.recoveryMode || "standard",
    reason:options.reason || "scheduled-rotation"
  });
  const rotated = await db.prepare(`UPDATE sessions
    SET revoked_at=CURRENT_TIMESTAMP,revocation_reason='rotated',last_rotated_at=CURRENT_TIMESTAMP
    WHERE id=? AND user_id=? AND revoked_at IS NULL`).bind(
      session.sessionId, session.user.id
    ).run();
  if (Number(rotated?.meta?.changes || 0) !== 1) {
    await db.prepare(`UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP,revocation_reason='rotation-race'
      WHERE id=? AND revoked_at IS NULL`).bind(replacement.sessionId).run();
    throw new Error("The session changed while it was being renewed.");
  }
  const rotatedEvent = await securityEventStatement(db, {
    sessionId:replacement.sessionId,
    userId:session.user.id,
    leagueId:session.membership?.leagueId || null,
    eventType:"rotated",
    reason:options.reason || "scheduled-rotation",
    request:context.request,
    detail:{ previousSessionId:session.sessionId }
  });
  await rotatedEvent.run();
  return {
    ...session,
    ...replacement,
    rotated:true,
    capabilities:sessionCapabilities(session)
  };
}

export async function revokeBrowserSessions(context, options = {}) {
  const db = context.env?.DB;
  if (!db) return 0;
  const rawTokens = [...new Set((options.rawTokens || []).filter(Boolean))];
  const hashes = await Promise.all(rawTokens.map(hashToken));
  let changed = 0;
  const rows = [];
  for (const tokenHash of hashes) {
    const row = await db.prepare(`SELECT id,user_id AS userId FROM sessions
      WHERE session_token_hash=? AND revoked_at IS NULL LIMIT 1`).bind(tokenHash).first();
    if (row) rows.push(row);
  }
  if (options.userId) {
    const result = await db.prepare(`SELECT id,user_id AS userId FROM sessions
      WHERE user_id=? AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP`).bind(options.userId).all();
    for (const row of result?.results || []) {
      if (!rows.some(existing => existing.id === row.id)) rows.push(row);
    }
  }
  for (const row of rows) {
    const result = await db.prepare(`UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP,revocation_reason=?
      WHERE id=? AND revoked_at IS NULL`).bind(options.reason || "revoked", row.id).run();
    if (Number(result?.meta?.changes || 0) !== 1) continue;
    changed += 1;
    const event = await securityEventStatement(db, {
      sessionId:row.id,
      userId:row.userId,
      leagueId:options.leagueId || null,
      eventType:options.eventType || "logged_out",
      reason:options.reason || "revoked",
      request:context.request,
      detail:options.detail || {}
    });
    await event.run();
  }
  return changed;
}

async function timingSafeTokenEqual(left, right) {
  const [leftHash, rightHash] = await Promise.all([hashToken(left), hashToken(right)]);
  const leftBytes = new TextEncoder().encode(leftHash);
  const rightBytes = new TextEncoder().encode(rightHash);
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(leftBytes, rightBytes);
  }
  let mismatch = leftBytes.byteLength ^ rightBytes.byteLength;
  const length = Math.max(leftBytes.byteLength, rightBytes.byteLength);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return mismatch === 0;
}

export async function verifyMutationCsrf(context) {
  const sessionToken = getCookie(context.request, AUTH_CONSTANTS.SESSION_COOKIE_NAME)
    || getCookie(context.request, AUTH_CONSTANTS.SESSION_RECOVERY_COOKIE_NAME);
  if (!sessionToken) return { browserSession:false, valid:true };
  const csrfCookie = getCookie(context.request, AUTH_CONSTANTS.CSRF_COOKIE_NAME);
  let csrfPresented = String(context.request.headers.get("x-franchisehq-csrf") || "").trim();
  if (!csrfPresented && String(context.request.headers.get("content-type") || "")
    .toLowerCase().includes("application/x-www-form-urlencoded")) {
    const form = await context.request.clone().formData().catch(() => null);
    csrfPresented = String(form?.get("csrfToken") || "").trim();
  }
  if (!csrfCookie || !csrfPresented || !/^[a-f0-9]{64}$/i.test(csrfCookie)
    || !/^[a-f0-9]{64}$/i.test(csrfPresented)
    || !(await timingSafeTokenEqual(csrfCookie, csrfPresented))) {
    return { browserSession:true, valid:false, reason:"missing-or-mismatched-token" };
  }
  const [sessionHash, csrfHash] = await Promise.all([hashToken(sessionToken), hashToken(csrfCookie)]);
  const row = await context.env?.DB?.prepare(`SELECT id FROM sessions
    WHERE session_token_hash=? AND csrf_token_hash=? AND revoked_at IS NULL
      AND expires_at>CURRENT_TIMESTAMP
      AND (absolute_expires_at IS NULL OR absolute_expires_at>CURRENT_TIMESTAMP)
    LIMIT 1`).bind(sessionHash, csrfHash).first();
  return row
    ? { browserSession:true, valid:true, sessionId:row.id }
    : { browserSession:true, valid:false, reason:"unbound-token" };
}

async function resolveRequestedLeagueId(context, options = {}) {
  if (options.leagueId) return String(options.leagueId);

  const url = new URL(context.request.url);
  const explicitSlug = options.leagueSlug || url.searchParams.get("league");
  let routeSlug = explicitSlug;

  if (!routeSlug) {
    const match = url.pathname.match(/\/(?:api\/)?leagues\/([^/?#]+)/i);
    routeSlug = match ? decodeURIComponent(match[1]) : null;
  }

  if (!routeSlug && context.params?.leagueSlug) {
    routeSlug = context.params.leagueSlug;
  }

  // 6.1.2.7: /api/auth/me has no league slug in its own URL. On a full
  // reload, recover the active tenant from the browser Referer so the auth
  // client receives the correct commissioner/team membership instead of an
  // authenticated user with membership=null.
  if (!routeSlug) {
    try {
      const referer = context.request.headers.get("Referer") || context.request.headers.get("Referrer");
      if (referer) {
        const refererUrl = new URL(referer);
        const refererMatch = refererUrl.pathname.match(/\/leagues\/([^/?#]+)/i);
        routeSlug = refererMatch ? decodeURIComponent(refererMatch[1]) : null;
      }
    } catch {}
  }

  if (!routeSlug) return null;

  try {
    const tenant = await resolveTenant(context.env, routeSlug);
    return tenant?.id || null;
  } catch {
    return null;
  }
}

export async function getCurrentSession(context, options = {}) {
  // Server-side Franchise Import Workflows authenticate with a short-lived
  // delegated token instead of persisting the commissioner's browser cookie.
  const delegated = await getImportDelegatedSession(context);
  if (delegated) {
    const requestedLeagueId = await resolveRequestedLeagueId(context, options);
    if (requestedLeagueId && delegated.membership?.leagueId !== requestedLeagueId) {
      delegated.membership = null;
    }
    delegated.kind = "delegated";
    delegated.capabilities = sessionCapabilities(delegated);
    return delegated;
  }

  // The primary cookie is the only 7.5 session authority. The former recovery
  // cookie is accepted only as a one-time migration input and forces rotation.
  const primarySessionToken = getCookie(
    context.request,
    AUTH_CONSTANTS.SESSION_COOKIE_NAME
  );
  const recoverySessionToken = getCookie(
    context.request,
    AUTH_CONSTANTS.SESSION_RECOVERY_COOKIE_NAME
  );
  const sessionTokens = [...new Set([primarySessionToken, recoverySessionToken].filter(Boolean))];
  if (!sessionTokens.length) return null;
  const requestedLeagueId = await resolveRequestedLeagueId(context, options);
  let record = null;
  let rawSessionToken = null;
  let usedLegacyRecovery = false;
  for (const candidate of sessionTokens) {
    const sessionTokenHash = await hashToken(candidate);
    record = await context.env.DB.prepare(
      `
      SELECT
        sessions.id AS session_id,
        sessions.created_at,
        sessions.expires_at,
        sessions.absolute_expires_at,
        sessions.last_rotated_at,
        sessions.csrf_token_hash,
        sessions.recovery_mode,
        sessions.revoked_at,
        users.id AS user_id,
        users.discord_user_id,
        users.discord_username,
        users.discord_global_name,
        users.display_name,
        users.avatar_url,
        league_memberships.id AS membership_id,
        league_memberships.league_id,
        league_memberships.role,
        league_memberships.team_id,
        league_memberships.active AS membership_active,
        league_memberships.authorization_version,
        leagues.slug AS league_slug,
        leagues.name AS league_name
      FROM sessions
      INNER JOIN users ON users.id = sessions.user_id
      LEFT JOIN league_memberships
        ON league_memberships.user_id = users.id
        AND league_memberships.league_id = ?
      LEFT JOIN leagues ON leagues.id = league_memberships.league_id
      WHERE sessions.session_token_hash = ?
        AND sessions.revoked_at IS NULL
      LIMIT 1
      `
    ).bind(requestedLeagueId || "__no_matching_league__", sessionTokenHash).first();
    if (record) {
      rawSessionToken = candidate;
      usedLegacyRecovery = !primarySessionToken || candidate !== primarySessionToken;
      break;
    }
  }

  if (!record) return null;

  const absoluteExpiresAt = record.absolute_expires_at || record.expires_at;
  const idleExpired = Date.parse(record.expires_at) <= Date.now();
  const absoluteExpired = Date.parse(absoluteExpiresAt) <= Date.now();
  if (idleExpired || absoluteExpired) {
    await revokeBrowserSessions(context, {
      rawTokens:[rawSessionToken],
      leagueId:requestedLeagueId,
      eventType:"expired",
      reason:absoluteExpired ? "absolute-expiry" : "idle-expiry"
    });
    return null;
  }
  const refreshedExpiresAt = earliestIso(
    absoluteExpiresAt,
    addSecondsToNow(AUTH_CONSTANTS.SESSION_IDLE_DURATION_SECONDS)
  );

  const refreshed = await context.env.DB
    .prepare(`UPDATE sessions SET last_seen_at=CURRENT_TIMESTAMP,expires_at=?
      WHERE id=? AND revoked_at IS NULL
        AND (absolute_expires_at IS NULL OR absolute_expires_at>CURRENT_TIMESTAMP)`)
    .bind(refreshedExpiresAt, record.session_id)
    .run();
  if (Number(refreshed?.meta?.changes || 0) !== 1) return null;

  const csrfCookie = getCookie(context.request, AUTH_CONSTANTS.CSRF_COOKIE_NAME);
  const csrfTokenHash = csrfCookie ? await hashToken(csrfCookie) : null;
  const csrfValid = Boolean(
    csrfCookie
    && record.csrf_token_hash
    && await timingSafeTokenEqual(csrfTokenHash, record.csrf_token_hash)
  );
  const rotationAnchor = Date.parse(record.last_rotated_at || record.created_at || "");
  const rotationDue = !Number.isFinite(rotationAnchor)
    || Date.now() - rotationAnchor >= AUTH_CONSTANTS.SESSION_ROTATION_DURATION_SECONDS * 1000;

  const session = {
    kind:"browser",
    sessionId: record.session_id,
    expiresAt: refreshedExpiresAt,
    absoluteExpiresAt,
    rawSessionToken,
    rawCsrfToken:csrfValid ? csrfCookie : null,
    recoveryMode:record.recovery_mode || "standard",
    needsRotation:usedLegacyRecovery || !csrfValid || rotationDue,
    user: {
      id: record.user_id,
      discordUserId: record.discord_user_id,
      discordUsername: record.discord_username,
      discordGlobalName: record.discord_global_name,
      displayName: record.display_name,
      avatarUrl: record.avatar_url
    },
    membership: record.membership_id
      ? {
          id: record.membership_id,
          leagueId: record.league_id,
          leagueSlug: record.league_slug,
          leagueName: record.league_name,
          role: record.role,
          teamId: record.team_id,
          active: Boolean(record.membership_active),
          authorizationVersion:Number(record.authorization_version || 1)
        }
      : null
  };
  session.capabilities = sessionCapabilities(session);
  return session;
}
