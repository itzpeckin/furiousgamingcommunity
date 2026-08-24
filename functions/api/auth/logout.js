import {
  AUTH_CONSTANTS,
  clearSecureCookie,
  getCookie,
  hashToken,
  jsonResponse,
  redirectResponse
} from "../../_lib/auth.js";

async function revokeSession(context) {
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

    return { ok: true, cookie: clearSecureCookie(AUTH_CONSTANTS.SESSION_COOKIE_NAME, "/") };
  } catch (error) {
    console.error("Logout failed:", error);

    return { ok: false, error };
  }
}


export async function onRequestGet(context) {
  const result = await revokeSession(context);
  if (!result.ok) return redirectResponse("/?logout=error");
  const response = redirectResponse("/?logout=success");
  response.headers.set("Set-Cookie", result.cookie);
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function onRequestPost(context) {
  const result = await revokeSession(context);
  if (!result.ok) {
    return jsonResponse({ ok:false, error:"Unable to log out.", details: result.error instanceof Error ? result.error.message : String(result.error) },500);
  }
  return jsonResponse({ ok:true, authenticated:false },200,{ "Set-Cookie": result.cookie });
}
