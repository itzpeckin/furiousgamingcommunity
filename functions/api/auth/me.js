const RELEASE = "7.0.3";
import {
  AUTH_CONSTANTS,
  createSecureCookie,
  getCurrentSession,
  jsonResponse
} from "../../_lib/auth.js";

export async function onRequestGet(context) {
  try {
    const session = await getCurrentSession(context);

    if (!session) {
      return jsonResponse({
        ok: true,
        authenticated: false,
        user: null,
        membership: null
      });
    }

    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    headers.append("Set-Cookie", createSecureCookie(
      AUTH_CONSTANTS.SESSION_COOKIE_NAME,
      session.rawSessionToken,
      AUTH_CONSTANTS.SESSION_DURATION_SECONDS,
      "/"
    ));
    headers.append("Set-Cookie", createSecureCookie(
      AUTH_CONSTANTS.SESSION_RECOVERY_COOKIE_NAME,
      session.rawSessionToken,
      AUTH_CONSTANTS.SESSION_DURATION_SECONDS,
      "/"
    ));

    return new Response(JSON.stringify({
      ok: true,
      authenticated: true,
      user: session.user,
      membership: session.membership,
      session: { expiresAt: session.expiresAt },
      release: RELEASE
    }, null, 2), { status: 200, headers });
  } catch (error) {
    console.error("Current-user lookup failed:", error);

    return jsonResponse(
      {
        ok: false,
        error: "Unable to load the current user."
      },
      500
    );
  }
}
