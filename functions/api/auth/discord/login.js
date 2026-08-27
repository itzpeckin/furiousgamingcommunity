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
import {
  canonicalAuthenticationOrigin,
  discordRedirectUriForOrigin,
  normalizeLeagueReturnTo
} from "../../../_lib/origin.js";
import { resolveTenant } from "../../../_lib/tenant-context.js";

export async function onRequestGet(context) {
  try {
    const missingVariables = [
      "DB",
      "DISCORD_CLIENT_ID"
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
    const loginOrigin = canonicalAuthenticationOrigin(requestUrl);
    const redirectUri = discordRedirectUriForOrigin(context.env, loginOrigin);
    const safeReturnTo = normalizeLeagueReturnTo(requestUrl.searchParams.get("returnTo"));
    const returnMatch = safeReturnTo?.match(/^\/leagues\/([^/?#]+)(#[\s\S]+)?$/i) || null;
    let joinLeague = null;
    if (returnMatch) {
      const candidate = decodeURIComponent(returnMatch[1]);
      joinLeague = await resolveTenant(context.env, candidate);
    }
    const oauthContext = encodeOpaqueContext({
      origin: loginOrigin,
      redirectUri,
      joinLeagueId: joinLeague?.id || null,
      joinLeagueSlug: joinLeague?.slug || null,
      returnTo: joinLeague
        ? `/leagues/${joinLeague.slug}${returnMatch?.[2] || ""}`
        : null
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
      redirectUri
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
