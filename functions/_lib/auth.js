const SESSION_COOKIE_NAME = "franchise_hq_session";
const OAUTH_STATE_COOKIE_NAME = "franchise_hq_oauth_state";

export const AUTH_CONSTANTS = {
  SESSION_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
  SESSION_DURATION_SECONDS: 60 * 60 * 24 * 14,
  OAUTH_STATE_DURATION_SECONDS: 60 * 10
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
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAgeSeconds}`,
    `Path=${path}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
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

async function resolveSessionLeagueId(context) {
  if (!context?.env?.DB) return null;
  let rawSlug = String(context.params?.leagueSlug || '').trim().toLowerCase();
  if (!rawSlug) {
    try {
      const match = new URL(context.request.url).pathname.match(/\/leagues\/([^/?#]+)/i);
      rawSlug = match ? decodeURIComponent(match[1]).toLowerCase() : '';
    } catch {}
  }
  const candidates = rawSlug === 'furiousgamingcommunity' || rawSlug === 'furious-gaming-community'
    ? ['furiousgamingcommunity','furious-gaming-community']
    : [rawSlug].filter(Boolean);
  if (!candidates.length) candidates.push('furiousgamingcommunity','furious-gaming-community');
  const marks = candidates.map(() => '?').join(',');
  const row = await context.env.DB.prepare(`SELECT id FROM leagues WHERE LOWER(slug) IN (${marks}) LIMIT 1`)
    .bind(...candidates).first();
  return row?.id || null;
}

export async function getCurrentSession(context) {
  // Server-side Franchise Import Workflows authenticate with a short-lived
  // delegated token instead of persisting the commissioner's browser cookie.
  const delegated = await getImportDelegatedSession(context);
  if (delegated) {
    return delegated;
  }

  const rawSessionToken = getCookie(
    context.request,
    AUTH_CONSTANTS.SESSION_COOKIE_NAME
  );

  if (!rawSessionToken) {
    return null;
  }

  const sessionTokenHash = await hashToken(rawSessionToken);
  const sessionLeagueId = await resolveSessionLeagueId(context);

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
        league_memberships.active AS membership_active
      FROM sessions
      INNER JOIN users
        ON users.id = sessions.user_id
      LEFT JOIN league_memberships
        ON league_memberships.user_id = users.id
        AND league_memberships.league_id = ?
      WHERE sessions.session_token_hash = ?
        AND sessions.revoked_at IS NULL
        AND sessions.expires_at > CURRENT_TIMESTAMP
      LIMIT 1
      `
    )
    .bind(sessionLeagueId || "__no_league__", sessionTokenHash)
    .first();

  if (!record) {
    return null;
  }

  await context.env.DB
    .prepare(
      `
      UPDATE sessions
      SET last_seen_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `
    )
    .bind(record.session_id)
    .run();

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
