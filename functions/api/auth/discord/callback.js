import {
  AUTH_CONSTANTS,
  clearSecureCookie,
  createId,
  createSessionTransferToken,
  decodeOpaqueContext,
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
            "/"
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

    // 6.1.0d: Discord can hand the callback back through a different mobile
    // browser context, which may drop the temporary OAuth cookie even though
    // the one-time state token is still valid. Treat the cookie as an
    // additional same-browser signal, but make the expiring, single-use D1
    // state record authoritative. This preserves CSRF state validation without
    // breaking legitimate mobile/in-app-browser handoffs.
    if (!stateCookie || stateCookie !== returnedState) {
      console.warn(
        "Discord OAuth state cookie missing or mismatched; validating against D1 state record."
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

    // 6.1.2.4: recover both league invitation context and the origin that
    // initiated OAuth. The state record is authoritative and single-use.
    let joinLeagueId = null;
    let joinLeagueSlug = null;
    let loginOrigin = new URL(context.request.url).origin;
    if (String(storedState.id || "").startsWith("oauthctx.")) {
      const encoded = String(storedState.id).split(".")[1] || "";
      const oauthContext = decodeOpaqueContext(encoded);
      if (oauthContext) {
        joinLeagueId = oauthContext.joinLeagueId || null;
        joinLeagueSlug = oauthContext.joinLeagueSlug || null;
        if (/^https:\/\//i.test(String(oauthContext.origin || ""))) {
          loginOrigin = String(oauthContext.origin);
        }
      }
    } else if (String(storedState.id || "").startsWith("oauthjoin.")) {
      // Backward compatibility for an OAuth flow that began on 6.1.2.2.
      try {
        const encoded = String(storedState.id).split(".")[1] || "";
        joinLeagueSlug = decodeOpaqueContext(encoded) || null;
      } catch {}
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

    // A shared league URL creates an inactive/unassigned membership. We do NOT
    // write role='pending' because the production membership schema restricts
    // role to real league roles. Pending is a workflow state, not a permission.
    let destination = "/leagues?auth=success";
    if (joinLeagueId || joinLeagueSlug) {
      try {
        const league = await context.env.DB
          .prepare(`SELECT id, slug FROM leagues WHERE (id=? OR lower(replace(slug,'-',''))=lower(replace(?,'-',''))) AND public_status='active' LIMIT 1`)
          .bind(joinLeagueId || "", joinLeagueSlug || "")
          .first();
        if (league) {
          const existing = await context.env.DB
            .prepare(`SELECT id, active, role, team_id AS teamId FROM league_memberships WHERE league_id=? AND user_id=? LIMIT 1`)
            .bind(league.id, user.id)
            .first();

          if (!existing) {
            await context.env.DB.prepare(`
              INSERT INTO league_memberships (id, league_id, user_id, role, team_id, active, created_at, updated_at)
              VALUES (?, ?, ?, 'team_owner', NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).bind(createId("membership"), league.id, user.id).run();
            destination = `/leagues/${encodeURIComponent(league.slug)}?auth=pending`;
          } else if (Number(existing.active)) {
            destination = `/leagues/${encodeURIComponent(league.slug)}?auth=success`;
          } else {
            const explicitDisable = await context.env.DB.prepare(`
              SELECT 1 AS disabled FROM league_membership_audit
              WHERE league_id=? AND subject_user_id=? AND action='membership_deactivated'
              LIMIT 1
            `).bind(league.id, user.id).first().catch(() => null);
            if (explicitDisable) {
              destination = `/leagues?access=disabled`;
            } else {
              // Old failed/premature join records are normalized back to the
              // self-service Pending state rather than being mislabeled Disabled.
              await context.env.DB.prepare(`
                UPDATE league_memberships
                SET role='team_owner', team_id=NULL, active=0, updated_at=CURRENT_TIMESTAMP
                WHERE league_id=? AND user_id=?
              `).bind(league.id, user.id).run();
              destination = `/leagues/${encodeURIComponent(league.slug)}?auth=pending`;
            }
          }
        }
      } catch (joinError) {
        console.error("League pending-membership registration failed:", joinError);
      }
    }

    // 6.1.2.4: OAuth may complete on the pages.dev callback host while the
    // user actually entered through franchisehq.app. Cookies cannot cross
    // those hosts. Hand the authenticated Discord identity back to the origin
    // that initiated login with a short-lived signed transfer token; that
    // origin then creates the D1 session and sets its own persistent cookies.
    const transferSecret = context.env.SESSION_SIGNING_SECRET || context.env.DISCORD_CLIENT_SECRET;
    const transferToken = await createSessionTransferToken(transferSecret, {
      userId: user.id,
      destination,
      exp: Math.floor(Date.now() / 1000) + AUTH_CONSTANTS.SESSION_TRANSFER_DURATION_SECONDS
    });
    const claimUrl = new URL("/api/auth/session/claim", loginOrigin);
    claimUrl.searchParams.set("token", transferToken);

    const headers = new Headers({
      Location: claimUrl.toString(),
      "Cache-Control": "no-store"
    });
    headers.append("Set-Cookie", clearSecureCookie(AUTH_CONSTANTS.OAUTH_STATE_COOKIE_NAME, "/"));
    headers.append("Set-Cookie", clearSecureCookie(AUTH_CONSTANTS.OAUTH_STATE_COOKIE_NAME, "/api/auth/discord"));

    return new Response(null, { status: 302, headers });
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
