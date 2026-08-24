import {
  AUTH_CONSTANTS,
  clearSecureCookie,
  getCookie,
  hashToken,
  redirectResponse
} from "../../_lib/auth.js";

const RELEASE = "6.1.2.8";

async function revokeSession(context) {
  const candidates = [
    getCookie(context.request, AUTH_CONSTANTS.SESSION_COOKIE_NAME),
    getCookie(context.request, AUTH_CONSTANTS.SESSION_RECOVERY_COOKIE_NAME)
  ].filter(Boolean);

  for (const rawToken of [...new Set(candidates)]) {
    try {
      const tokenHash = await hashToken(rawToken);
      await context.env.DB.prepare(`
        UPDATE sessions
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE session_token_hash = ? AND revoked_at IS NULL
      `).bind(tokenHash).run();
    } catch (error) {
      console.warn("Session revocation warning:", error?.message || error);
    }
  }
}

function clearCookieHeaders(headers) {
  headers.append("Set-Cookie", clearSecureCookie(AUTH_CONSTANTS.SESSION_COOKIE_NAME, "/"));
  headers.append("Set-Cookie", clearSecureCookie(AUTH_CONSTANTS.SESSION_RECOVERY_COOKIE_NAME, "/"));
}

export async function onRequestGet(context) {
  await revokeSession(context);
  const response = redirectResponse("/?logout=success");
  clearCookieHeaders(response.headers);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function onRequestPost(context) {
  await revokeSession(context);
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  clearCookieHeaders(headers);
  return new Response(JSON.stringify({
    ok: true,
    authenticated: false,
    release: RELEASE
  }), { status: 200, headers });
}
