import {
  AUTH_CONSTANTS,
  clearSecureCookie,
  getCurrentSession,
  redirectResponse
} from "../../_lib/auth.js";

async function logout(context) {
  try {
    const session = await getCurrentSession(context);
    if (session?.sessionId && context.env?.DB) {
      await context.env.DB.prepare(
        `UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?`
      ).bind(session.sessionId).run();
    }
  } catch (error) {
    console.warn("Session revoke during logout failed:", error);
  }

  const headers = new Headers({ Location: "/", "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearSecureCookie(AUTH_CONSTANTS.SESSION_COOKIE_NAME, "/"));
  headers.append("Set-Cookie", clearSecureCookie(AUTH_CONSTANTS.SESSION_RECOVERY_COOKIE_NAME, "/"));
  headers.append("Set-Cookie", clearSecureCookie(AUTH_CONSTANTS.OAUTH_STATE_COOKIE_NAME, "/"));
  return new Response(null,{status:302,headers});
}

export const onRequestGet = logout;
export const onRequestPost = logout;
