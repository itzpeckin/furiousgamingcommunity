import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../_lib/cloud-platform.js';
import { requireActiveMembership } from '../../../_lib/permissions.js';
import { currentFranchiseContext } from '../../../_lib/ownership-periods.js';

const categories = new Set(['passing','rushing','receiving','defense','kicking','punting']);
const parse = value => { try { return JSON.parse(value || '{}'); } catch { return {}; } };

// Separate from the active read model: archived totals must never enter current
// player details, game logs, leaderboards, matchup statistics, or Discord rules.
export async function archivedPlayerCareer(db, leagueId, playerId, expectedSnapshotId) {
  const current = await currentFranchiseContext(db, leagueId);
  if (!current.snapshotId || current.snapshotId !== expectedSnapshotId) {
    return {status:409,error:'League data changed. Reopen the player card to load the current statistics.'};
  }
  const player = await db.prepare(`SELECT external_id FROM league_snapshot_records
    WHERE league_id=? AND snapshot_id=? AND domain='players' AND external_id=? LIMIT 1`)
    .bind(leagueId,current.snapshotId,playerId).first();
  if (!player) return {status:404,error:'Player not found.'};
  const season = await db.prepare(`SELECT id,source_system,source_franchise_id,game_release,season_year
    FROM franchise_seasons WHERE league_id=? AND id=? AND season_year=? LIMIT 1`)
    .bind(leagueId,current.franchiseSeasonId||'',current.seasonYear).first();
  if (!season) return {status:409,error:'This league’s season identity is unavailable. Refresh league data before opening career history.'};
  const result = await db.prepare(`SELECT history.franchise_season_id,previous.season_year,history.season_totals_json
    FROM player_source_aliases alias
    JOIN player_season_summaries history ON history.league_id=alias.league_id AND history.player_identity_id=alias.player_identity_id
    JOIN franchise_seasons previous ON previous.league_id=history.league_id AND previous.id=history.franchise_season_id
    JOIN franchise_season_closures closure ON closure.league_id=previous.league_id AND closure.franchise_season_id=previous.id
    WHERE alias.league_id=? AND alias.source_system=? AND alias.source_franchise_id=? AND alias.source_player_id=?
      AND previous.source_system=? AND previous.source_franchise_id=? AND previous.game_release=?
      AND previous.status IN ('closed','archived') AND previous.season_year<?
    ORDER BY previous.season_year DESC,previous.id`)
    .bind(leagueId,season.source_system,season.source_franchise_id,playerId,
      season.source_system,season.source_franchise_id,season.game_release,current.seasonYear).all();
  const seen = new Set(), seasons = [];
  for (const row of result.results || []) {
    if (seen.has(row.franchise_season_id)) continue;
    seen.add(row.franchise_season_id);
    const saved = parse(row.season_totals_json), approved = {};
    for (const [category,metrics] of Object.entries(saved.categories || {})) {
      if (!categories.has(category) || !metrics || typeof metrics !== 'object') continue;
      approved[category] = Object.fromEntries(Object.entries(metrics)
        .filter(([,value])=>typeof value==='number' && Number.isFinite(value)));
    }
    if (Object.keys(approved).length) seasons.push({seasonId:row.franchise_season_id,year:row.season_year,categories:approved});
  }
  const latest = await db.prepare('SELECT snapshot_id FROM league_active_snapshots WHERE league_id=?').bind(leagueId).first();
  if (latest?.snapshot_id !== current.snapshotId) return {status:409,error:'League data changed. Reopen the player card to load the current statistics.'};
  return {status:200,snapshotId:current.snapshotId,playerId,seasons};
}

export async function onRequestGet(context) {
  const authorization = await requireActiveMembership(context);
  if (!authorization.authorized) return authorization.response;
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return json({ok:false,error:'Not found.'},404);
  const db = database(context.env), league = await resolveLeague(context.env,slug);
  if (!db || !league || authorization.session.membership?.leagueId !== league.id) return json({ok:false,error:'Not found.'},404);
  const url = new URL(context.request.url), playerId = url.searchParams.get('playerId') || '', snapshotId = url.searchParams.get('snapshotId') || '';
  if (!/^[a-zA-Z0-9._:-]{1,150}$/.test(playerId) || !/^[a-zA-Z0-9._:-]{1,150}$/.test(snapshotId)) return json({ok:false,error:'A player and current snapshot are required.'},400);
  try {
    const {status,...payload} = await archivedPlayerCareer(db,league.id,playerId,snapshotId);
    return json({ok:status===200,...payload},status,{'Cache-Control':'no-store'});
  } catch {
    return json({ok:false,error:'Archived player statistics could not be loaded. Try again from the Statistics tab.'},503);
  }
}
