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
    // 6.1.2: a shared /leagues/{slug} URL is the invitation context.
    // Store that context in the opaque OAuth-state record ID so it survives
    // Discord/mobile browser handoffs without relying on another cookie or DB column.
    const requestUrl = new URL(context.request.url);
    const rawReturnTo = String(requestUrl.searchParams.get("returnTo") || "");
    const returnMatch = rawReturnTo.match(/^\/leagues\/([^/?#]+)$/i);
    let joinLeagueSlug = null;
    if (returnMatch) {
      const candidate = decodeURIComponent(returnMatch[1]);
      const league = await context.env.DB
        .prepare(`SELECT slug FROM leagues WHERE lower(replace(slug,'-',''))=lower(replace(?,'-','')) AND public_status='active' LIMIT 1`)
        .bind(candidate)
        .first();
      joinLeagueSlug = league?.slug || null;
    }
    const encodeJoinSlug = (value) => btoa(unescape(encodeURIComponent(value)))
      .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
    const stateId = joinLeagueSlug
      ? `oauthjoin.${encodeJoinSlug(joinLeagueSlug)}.${crypto.randomUUID()}`
      : createId("oauth");
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
