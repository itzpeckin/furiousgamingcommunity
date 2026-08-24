import {
  AUTH_CONSTANTS,
  addSecondsToNow,
  createId,
  createRandomToken,
  createSecureCookie,
  encodeOpaqueContext,
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
    // 6.1.2.3: keep the league join intent AND the browser origin inside the
    // server-side OAuth state record. This survives Discord/mobile handoffs and
    // lets the callback hand the finished login back to the exact FranchiseHQ
    // origin that initiated it.
    const requestUrl = new URL(context.request.url);
    const rawReturnTo = String(requestUrl.searchParams.get("returnTo") || "");
    const returnMatch = rawReturnTo.match(/^\/leagues\/([^/?#]+)$/i);
    let joinLeague = null;
    if (returnMatch) {
      const candidate = decodeURIComponent(returnMatch[1]);
      joinLeague = await context.env.DB
        .prepare(`SELECT id, slug FROM leagues WHERE lower(replace(slug,'-',''))=lower(replace(?,'-','')) AND public_status='active' LIMIT 1`)
        .bind(candidate)
        .first();
    }
    const oauthContext = encodeOpaqueContext({
      origin: requestUrl.origin,
      joinLeagueId: joinLeague?.id || null,
      joinLeagueSlug: joinLeague?.slug || null
    });
    const stateId = `oauthctx.${oauthContext}.${crypto.randomUUID()}`;
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
