import {
  AUTH_CONSTANTS,
  clearSecureCookie,
  getCookie,
  hashToken,
  jsonResponse
} from "../../_lib/auth.js";

const RELEASE = "7.2.0";

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
  return jsonResponse({
    ok: false,
    error: "Logout requires POST."
  }, 405, { Allow: "POST" });
}

export async function onRequestPost(context) {
  await revokeSession(context);
  const wantsHtml = String(context.request.headers.get("accept") || "").includes("text/html");
  const headers = new Headers({
    "Cache-Control": "no-store"
  });
  clearCookieHeaders(headers);
  if (wantsHtml) {
    headers.set("Location", "/?logout=success");
    return new Response(null, { status: 303, headers });
  }
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify({
    ok: true,
    authenticated: false,
    release: RELEASE
  }), { status: 200, headers });
}
