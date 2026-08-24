const RELEASE = "6.1.2.1";
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

    return jsonResponse({
      ok: true,
      authenticated: true,
      user: session.user,
      membership: session.membership,
      session: {
        expiresAt: session.expiresAt
      },
      release: RELEASE
    }, 200, {
      "Set-Cookie": createSecureCookie(
        AUTH_CONSTANTS.SESSION_COOKIE_NAME,
        session.rawSessionToken,
        AUTH_CONSTANTS.SESSION_DURATION_SECONDS,
        "/"
      )
    });
  } catch (error) {
    console.error("Current-user lookup failed:", error);

    return jsonResponse(
      {
        ok: false,
        error: "Unable to load the current user.",
        details:
          error instanceof Error
            ? error.message
            : String(error)
      },
      500
    );
  }
}
