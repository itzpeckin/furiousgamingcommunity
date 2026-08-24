import {
  AUTH_CONSTANTS,
  addSecondsToNow,
  clearSecureCookie,
  createId,
  createRandomToken,
  createSecureCookie,
  getCookie,
  hashToken,
  jsonResponse,
  redirectResponse
} from "../../../_lib/auth.js";

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);

    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    const discordError = url.searchParams.get("error");

    if (discordError) {
      return redirectResponse(
        `/?auth=error&reason=${encodeURIComponent(discordError)}`,
        {
          "Set-Cookie": clearSecureCookie(
            AUTH_CONSTANTS.OAUTH_STATE_COOKIE_NAME,
            "/api/auth/discord"
          )
        }
      );
    }

    if (!code || !returnedState) {
      return jsonResponse(
        {
          ok: false,
          error: "Discord did not return a valid login response."
        },
        400
      );
    }

    const stateCookie = getCookie(
      context.request,
      AUTH_CONSTANTS.OAUTH_STATE_COOKIE_NAME
    );

    if (!stateCookie || stateCookie !== returnedState) {
      return jsonResponse(
        {
          ok: false,
          error: "Discord login state validation failed."
        },
        400
      );
    }

    const returnedStateHash = await hashToken(returnedState);

    const storedState = await context.env.DB
      .prepare(
        `
        SELECT
          id,
          expires_at,
          used_at
        FROM oauth_states
        WHERE state_token_hash = ?
          AND used_at IS NULL
          AND expires_at > CURRENT_TIMESTAMP
        LIMIT 1
        `
      )
      .bind(returnedStateHash)
      .first();

    if (!storedState) {
      return jsonResponse(
        {
          ok: false,
          error: "The Discord login request expired or was already used."
        },
        400
      );
    }

    await context.env.DB
      .prepare(
        `
        UPDATE oauth_states
        SET used_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `
      )
      .bind(storedState.id)
      .run();

    const tokenBody = new URLSearchParams({
      client_id: context.env.DISCORD_CLIENT_ID,
      client_secret: context.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: context.env.DISCORD_REDIRECT_URI
    });

    const tokenResponse = await fetch(
      "https://discord.com/api/v10/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: tokenBody.toString()
      }
    );

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.text();

      console.error(
        "Discord token exchange failed:",
        tokenResponse.status,
        tokenError
      );

      return jsonResponse(
        {
          ok: false,
          error: "Discord rejected the authorization code."
        },
        502
      );
    }

    const tokenData = await tokenResponse.json();

    const userResponse = await fetch(
      "https://discord.com/api/v10/users/@me",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    if (!userResponse.ok) {
      const userError = await userResponse.text();

      console.error(
        "Discord user lookup failed:",
        userResponse.status,
        userError
      );

      return jsonResponse(
        {
          ok: false,
          error: "Unable to retrieve the Discord user."
        },
        502
      );
    }

    const discordUser = await userResponse.json();

    const displayName =
      discordUser.global_name ||
      discordUser.username ||
      "Discord User";

    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`
      : null;

    let user = await context.env.DB
      .prepare(
        `
        SELECT id
        FROM users
        WHERE discord_user_id = ?
        LIMIT 1
        `
      )
      .bind(discordUser.id)
      .first();

    if (!user) {
      const userId = createId("user");

      await context.env.DB
        .prepare(
          `
          INSERT INTO users (
            id,
            discord_user_id,
            discord_username,
            discord_global_name,
            display_name,
            avatar_hash,
            avatar_url,
            last_login_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `
        )
        .bind(
          userId,
          discordUser.id,
          discordUser.username,
          discordUser.global_name || null,
          displayName,
          discordUser.avatar || null,
          avatarUrl
        )
        .run();

      user = { id: userId };
    } else {
      await context.env.DB
        .prepare(
          `
          UPDATE users
          SET
            discord_username = ?,
            discord_global_name = ?,
            display_name = ?,
            avatar_hash = ?,
            avatar_url = ?,
            updated_at = CURRENT_TIMESTAMP,
            last_login_at = CURRENT_TIMESTAMP
          WHERE id = ?
          `
        )
        .bind(
          discordUser.username,
          discordUser.global_name || null,
          displayName,
          discordUser.avatar || null,
          avatarUrl,
          user.id
        )
        .run();
    }

    const rawSessionToken = createRandomToken(48);
    const sessionTokenHash = await hashToken(rawSessionToken);
    const sessionId = createId("session");
    const expiresAt = addSecondsToNow(
      AUTH_CONSTANTS.SESSION_DURATION_SECONDS
    );

    await context.env.DB
      .prepare(
        `
        INSERT INTO sessions (
          id,
          user_id,
          session_token_hash,
          expires_at
        )
        VALUES (?, ?, ?, ?)
        `
      )
      .bind(
        sessionId,
        user.id,
        sessionTokenHash,
        expiresAt
      )
      .run();

    const sessionCookie = createSecureCookie(
      AUTH_CONSTANTS.SESSION_COOKIE_NAME,
      rawSessionToken,
      AUTH_CONSTANTS.SESSION_DURATION_SECONDS,
      "/"
    );

    // 6.1.0c: the public root is now a landing page, so a successful
    // Discord login must return the user to an actual league instead of /.
    // Resolve the destination from the authenticated user's active memberships
    // to preserve multi-tenant behavior and avoid hard-coding any league slug.
    let destination = "/?auth=success&state=no-league";

    try {
      const league = await context.env.DB
        .prepare(
          `
          SELECT
            leagues.slug,
            league_memberships.role
          FROM league_memberships
          INNER JOIN leagues
            ON leagues.id = league_memberships.league_id
          WHERE league_memberships.user_id = ?
            AND league_memberships.active = 1
            AND leagues.public_status = 'active'
          ORDER BY
            CASE league_memberships.role
              WHEN 'commissioner' THEN 0
              WHEN 'trade_committee' THEN 1
              WHEN 'team_owner' THEN 2
              ELSE 3
            END,
            league_memberships.updated_at DESC,
            leagues.slug ASC
          LIMIT 1
          `
        )
        .bind(user.id)
        .first();

      if (league?.slug) {
        destination = `/leagues/${encodeURIComponent(league.slug)}?auth=success`;
      }
    } catch (destinationError) {
      console.error(
        "Discord post-login league resolution failed:",
        destinationError
      );
    }

    const headers = new Headers({
      Location: destination,
      "Cache-Control": "no-store"
    });

    headers.append("Set-Cookie", sessionCookie);

    headers.append(
      "Set-Cookie",
      clearSecureCookie(
        AUTH_CONSTANTS.OAUTH_STATE_COOKIE_NAME,
        "/api/auth/discord"
      )
    );

    return new Response(null, {
      status: 302,
      headers
    });
  } catch (error) {
    console.error("Discord callback failed:", error);

    return jsonResponse(
      {
        ok: false,
        error: "Discord login could not be completed.",
        details: error instanceof Error
          ? error.message
          : String(error)
      },
      500
    );
  }
}
