import {
  AUTH_CONSTANTS,
  addSecondsToNow,
  createId,
  createRandomToken,
  createSecureCookie,
  hashToken,
  jsonResponse,
  redirectResponse
} from "../../../_lib/auth.js";

export async function onRequestGet(context) {
  try {
    const missingVariables = [
      "DB",
      "DISCORD_CLIENT_ID",
      "DISCORD_REDIRECT_URI"
    ].filter((name) => !context.env[name]);

    if (missingVariables.length > 0) {
      return jsonResponse(
        {
          ok: false,
          error: "Discord login is not configured.",
          missing: missingVariables
        },
        500
      );
    }

    const stateToken = createRandomToken(32);
    const stateTokenHash = await hashToken(stateToken);
    const stateId = createId("oauth");
    const expiresAt = addSecondsToNow(
      AUTH_CONSTANTS.OAUTH_STATE_DURATION_SECONDS
    );

    await context.env.DB
      .prepare(
        `
        INSERT INTO oauth_states (
          id,
          state_token_hash,
          expires_at
        )
        VALUES (?, ?, ?)
        `
      )
      .bind(stateId, stateTokenHash, expiresAt)
      .run();

    const authorizationUrl = new URL(
      "https://discord.com/oauth2/authorize"
    );

    authorizationUrl.searchParams.set(
      "client_id",
      context.env.DISCORD_CLIENT_ID
    );

    authorizationUrl.searchParams.set(
      "redirect_uri",
      context.env.DISCORD_REDIRECT_URI
    );

    authorizationUrl.searchParams.set(
      "response_type",
      "code"
    );

    authorizationUrl.searchParams.set(
      "scope",
      "identify"
    );

    authorizationUrl.searchParams.set(
      "state",
      stateToken
    );

    authorizationUrl.searchParams.set(
      "prompt",
      "consent"
    );

    const stateCookie = createSecureCookie(
      AUTH_CONSTANTS.OAUTH_STATE_COOKIE_NAME,
      stateToken,
      AUTH_CONSTANTS.OAUTH_STATE_DURATION_SECONDS,
      "/"
    );

    return redirectResponse(authorizationUrl.toString(), {
      "Set-Cookie": stateCookie
    });
  } catch (error) {
    console.error("Discord login start failed:", error);

    return jsonResponse(
      {
        ok: false,
        error: "Unable to begin Discord login.",
        details: error instanceof Error
          ? error.message
          : String(error)
      },
      500
    );
  }
}
