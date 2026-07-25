export async function onRequestGet(context) {
  try {
    if (!context.env.DB) {
      return jsonResponse(
        {
          ok: false,
          error: "Database binding is missing.",
          expectedBinding: "DB"
        },
        500
      );
    }

    const league = await context.env.DB
      .prepare(
        `
        SELECT
          id,
          name,
          product_name,
          slug,
          current_season,
          current_week,
          trade_start_week,
          trade_deadline_week,
          discord_guild_id,
          discord_connected,
          public_status,
          created_at,
          updated_at
        FROM leagues
        WHERE id = ?
        LIMIT 1
        `
      )
      .bind("franchise-hq-primary")
      .first();

    if (!league) {
      return jsonResponse(
        {
          ok: false,
          error: "League was not found."
        },
        404
      );
    }

    return jsonResponse({
      ok: true,
      league: {
        id: league.id,
        name: league.name,
        productName: league.product_name,
        slug: league.slug,
        currentSeason: league.current_season,
        currentWeek: league.current_week,
        tradeStartWeek: league.trade_start_week,
        tradeDeadlineWeek: league.trade_deadline_week,
        discordGuildId: league.discord_guild_id,
        discordConnected: Boolean(league.discord_connected),
        publicStatus: league.public_status,
        createdAt: league.created_at,
        updatedAt: league.updated_at
      }
    });
  } catch (error) {
    console.error("Unable to load league:", error);

    return jsonResponse(
      {
        ok: false,
        error: "Unable to load league.",
        details: error instanceof Error ? error.message : String(error)
      },
      500
    );
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
