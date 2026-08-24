const SESSION_COOKIE_NAME = "franchise_hq_session";
const OAUTH_STATE_COOKIE_NAME = "franchise_hq_oauth_state";
const SESSION_RECOVERY_COOKIE_NAME = "franchise_hq_session_recovery";
const SESSION_TRANSFER_DURATION_SECONDS = 60 * 3;

export const AUTH_CONSTANTS = {
  SESSION_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
  SESSION_RECOVERY_COOKIE_NAME,
  SESSION_DURATION_SECONDS: 60 * 60 * 24 * 30,
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

export async function createSessionTransferToken(secret, payload = {}) {
  if (!secret) throw new Error("Session transfer signing secret is unavailable.");
  const body = encodeOpaqueContext(payload);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionTransferToken(secret, token) {
  if (!secret || !token) return null;
  const [body, signatureText, extra] = String(token).split(".");
  if (!body || !signatureText || extra) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(String(secret)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signatureText),
      new TextEncoder().encode(body)
    );
    if (!valid) return null;
    const payload = decodeOpaqueContext(body);
    if (!payload || Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) return null;
    return payload;
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

  // 6.1.2.5: /api/auth/me has no league slug in its own URL. On a full
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

  if (!routeSlug) return "franchise-hq-primary";

  try {
    const league = await context.env.DB
      .prepare(`SELECT id FROM leagues WHERE lower(replace(slug,'-','')) = lower(replace(?,'-','')) LIMIT 1`)
      .bind(String(routeSlug))
      .first();
    return league?.id || null;
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
    return delegated;
  }

  // 6.1.2.2: keep a second persistent recovery cookie for full/hard reloads.
  // Both cookies point to the same revocable server-side session; this does not
  // create a second login or bypass expiration/revocation.
  const primarySessionToken = getCookie(
    context.request,
    AUTH_CONSTANTS.SESSION_COOKIE_NAME
  );
  const recoverySessionToken = getCookie(
    context.request,
    AUTH_CONSTANTS.SESSION_RECOVERY_COOKIE_NAME
  );
  const rawSessionToken = primarySessionToken || recoverySessionToken;

  if (!rawSessionToken) return null;

  const sessionTokenHash = await hashToken(rawSessionToken);
  const requestedLeagueId = await resolveRequestedLeagueId(context, options);

  const record = await context.env.DB
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
        league_memberships.active AS membership_active,
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
        AND sessions.expires_at > CURRENT_TIMESTAMP
      LIMIT 1
      `
    )
    .bind(requestedLeagueId || "__no_matching_league__", sessionTokenHash)
    .first();

  if (!record) return null;

  const refreshedExpiresAt = addSecondsToNow(AUTH_CONSTANTS.SESSION_DURATION_SECONDS);

  await context.env.DB
    .prepare(`UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP, expires_at = ? WHERE id = ?`)
    .bind(refreshedExpiresAt, record.session_id)
    .run();

  return {
    sessionId: record.session_id,
    expiresAt: refreshedExpiresAt,
    rawSessionToken,
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
          active: Boolean(record.membership_active)
        }
      : null
  };
}
