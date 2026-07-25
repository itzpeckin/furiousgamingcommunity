import {
  AUTH_CONSTANTS,
  clearSecureCookie,
  getCookie,
  hashToken,
  jsonResponse
} from "../../_lib/auth.js";

export async function onRequestPost(context) {
  try {
    const rawSessionToken = getCookie(
      context.request,
      AUTH_CONSTANTS.SESSION_COOKIE_NAME
    );

    if (rawSessionToken) {
      const sessionTokenHash = await hashToken(rawSessionToken);

      await context.env.DB
        .prepare(
          `
          UPDATE sessions
          SET revoked_at = CURRENT_TIMESTAMP
          WHERE session_token_hash = ?
            AND revoked_at IS NULL
          `
        )
        .bind(sessionTokenHash)
        .run();
    }

    return jsonResponse(
      {
        ok: true,
        authenticated: false
      },
      200,
      {
        "Set-Cookie": clearSecureCookie(
          AUTH_CONSTANTS.SESSION_COOKIE_NAME,
          "/"
        )
      }
    );
  } catch (error) {
    console.error("Logout failed:", error);

    return jsonResponse(
      {
        ok: false,
        error: "Unable to log out.",
        details:
          error instanceof Error
            ? error.message
            : String(error)
      },
      500
    );
  }
}
