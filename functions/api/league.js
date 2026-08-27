import { database, json, canonicalLeagueSlug, resolveLeague, DEFAULT_LEAGUE_SLUG } from '../_lib/cloud-platform.js';
import { getCurrentSession } from '../_lib/auth.js';

export async function onRequestGet(context) {
  try {
    const db = database(context.env);
    if (!db) return json({ok:false,error:'Database binding is missing.'},500);
    const url = new URL(context.request.url);
    const slug = canonicalLeagueSlug(url.searchParams.get('slug') || DEFAULT_LEAGUE_SLUG);
    const league = await resolveLeague(context.env, slug);
    if (!league) return json({ok:false,error:'League was not found.',leagueSlug:slug},404);
    const session = await getCurrentSession(context, { leagueId: league.id });
    if (!session) return json({ok:false,error:'Authentication required.'},401);
    if (!session.membership?.active || session.membership.leagueId !== league.id) {
      return json({ok:false,error:'Not found.'},404);
    }
    return json({ok:true,release:'7.0.4',league:{
      id:league.id,name:league.name,productName:league.product_name || 'Franchise HQ',slug:league.slug,
      currentSeason:league.current_season,currentWeek:league.current_week,tradeStartWeek:league.trade_start_week,
      tradeDeadlineWeek:league.trade_deadline_week,discordGuildId:league.discord_guild_id,
      discordConnected:Boolean(league.discord_connected),publicStatus:league.public_status,createdAt:league.created_at,updatedAt:league.updated_at
    }});
  } catch (error) {
    console.error('League lookup failed:', error);
    return json({ok:false,error:'Unable to load league.'},500);
  }
}
