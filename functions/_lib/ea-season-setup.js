import { sha256Hex } from './cloud-platform.js';
import { normalizeGameRelease } from './game-year-transition.js';
import { EaDirectError } from './ea-direct.js';

const fail = message => { throw new EaDirectError('EA_SEASON_SETUP_REQUIRED',message); };
const safeSource = value => /^[A-Za-z0-9._:-]{1,80}$/.test(String(value ?? ''));

// The authenticated EA hub supplies the franchise's calendar. A missing native
// season identifier requires an explicit commissioner value, never a year offset.
export async function prepareEaFirstSeason({db,league,hub,externalLeagueId,actorId,confirmedSourceSeasonId}) {
  const existing = await db.prepare(`SELECT id FROM franchise_seasons WHERE league_id=? LIMIT 1`).bind(league.id).first();
  if (existing) return;
  const plan = await db.prepare(`SELECT game_year FROM platform_league_onboarding_plans
    WHERE planned_league_id=? AND status='prepared' AND activated_at IS NOT NULL
    ORDER BY activated_at DESC,updated_at DESC LIMIT 1`).bind(league.id).first();
  const release = normalizeGameRelease(`Madden NFL ${Number(plan?.game_year)%100}`);
  if (!plan || !release.ok || release.gameRelease !== hub.gameRelease) fail('The connected Madden edition does not match this league’s saved setup.');
  if (!Number.isInteger(hub.seasonYear) || hub.seasonYear < 2000 || hub.seasonYear > 2200) fail('EA must identify the calendar year before preparing this season.');
  const sourceSeasonId = String(hub.sourceSeasonId || confirmedSourceSeasonId || '');
  if (!safeSource(sourceSeasonId)) fail('Enter and confirm the Madden franchise season number in Step 2, then import the season schedule.');
  if (hub.sourceSeasonId && confirmedSourceSeasonId && String(confirmedSourceSeasonId) !== hub.sourceSeasonId) fail('The confirmed season number does not match EA.');
  if (!safeSource(externalLeagueId)) fail('The selected EA franchise is invalid.');
  const id = async (prefix,parts) => `${prefix}_${(await sha256Hex(JSON.stringify(parts))).slice(0,24)}`;
  const savedYear = await db.prepare(`SELECT id FROM league_game_years WHERE league_id=? AND game_release=?
    AND status IN ('active','restored','preparing') LIMIT 1`).bind(league.id,release.gameRelease).first();
  const gameYearId = savedYear?.id || await id('game_year',[league.id,release.gameRelease]);
  const seasonId = await id('franchise_season',[league.id,'ea-madden-companion',String(externalLeagueId),sourceSeasonId]);
  const destinationId = await id('import_destination',[league.id,seasonId]);
  const displayName = `${league.name} ${hub.seasonYear}`;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO league_game_years (id,league_id,game_release,edition_year,display_name,status)
      VALUES (?,?,?,?,?,'preparing')`).bind(gameYearId,league.id,release.gameRelease,release.editionYear,release.gameRelease),
    db.prepare(`INSERT OR IGNORE INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      SELECT ?,?,'ea-madden-companion',?,?,?,?,?,'preview'
      WHERE NOT EXISTS (SELECT 1 FROM franchise_seasons WHERE league_id=?)`)
      .bind(seasonId,league.id,String(externalLeagueId),sourceSeasonId,release.gameRelease,displayName,hub.seasonYear,league.id),
    db.prepare(`INSERT OR IGNORE INTO game_year_franchise_seasons (game_year_id,league_id,franchise_season_id)
      SELECT ?,?,id FROM franchise_seasons WHERE id=? AND league_id=?`).bind(gameYearId,league.id,seasonId,league.id),
    db.prepare(`INSERT OR IGNORE INTO companion_import_destinations
      (id,league_id,franchise_season_id,label,status,created_by_user_id,game_year_id)
      SELECT ?,?,id,?,'active',?,? FROM franchise_seasons WHERE id=? AND league_id=?`)
      .bind(destinationId,league.id,`${displayName} live imports`,actorId,gameYearId,seasonId,league.id),
    db.prepare(`INSERT INTO tenant_audit_events
      (id,league_id,actor_user_id,request_id,action_id,action,resource_type,resource_id,outcome,detail_json)
      SELECT ?,?,?,?,?,?,'franchise_season',id,'success',? FROM franchise_seasons WHERE id=? AND league_id=?`)
      .bind(`tenant_audit_${crypto.randomUUID()}`,league.id,actorId,`request_${crypto.randomUUID()}`,`action_${crypto.randomUUID()}`,
        'ea_direct.first_season.prepare',JSON.stringify({sourceFranchiseId:String(externalLeagueId),sourceSeasonId,
          sourceSeasonConfirmedByCommissioner:!hub.sourceSeasonId,seasonYear:hub.seasonYear,activeSnapshotChanged:false}),seasonId,league.id)
  ]);
}
