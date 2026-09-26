// The retained snapshot may still belong to the season just archived. Draft
// assets must follow its prepared successor without selecting unrelated previews.
export async function currentTradeSeason(db, leagueId) {
  const imported = await db.prepare(`SELECT season.id,season.season_year AS seasonYear,
      season.display_name AS displayName,season.game_release AS gameRelease,
      season.status,season.source_system AS sourceSystem,season.source_franchise_id AS sourceFranchiseId
    FROM league_active_snapshots active
    JOIN companion_candidate_import_runs run
      ON run.league_id=active.league_id AND run.candidate_snapshot_id=active.snapshot_id
    JOIN companion_import_destinations destination
      ON destination.id=run.destination_id AND destination.league_id=run.league_id
    JOIN franchise_seasons season
      ON season.id=destination.franchise_season_id AND season.league_id=destination.league_id
    WHERE active.league_id=?
    ORDER BY run.completed_at DESC,run.created_at DESC LIMIT 1`).bind(leagueId).first();
  if (imported && imported.status !== 'closed') return imported;
  if (imported) {
    const next = (await db.prepare(`SELECT id,season_year AS seasonYear,display_name AS displayName,game_release AS gameRelease
      FROM franchise_seasons WHERE league_id=? AND source_system=? AND source_franchise_id=?
        AND game_release=? AND season_year=? AND status IN ('active','preview')
      LIMIT 2`).bind(leagueId,imported.sourceSystem,imported.sourceFranchiseId,imported.gameRelease,Number(imported.seasonYear)+1).all()).results || [];
    return next.length === 1 ? next[0] : null;
  }
  return db.prepare(`SELECT id,season_year AS seasonYear,display_name AS displayName,game_release AS gameRelease
    FROM franchise_seasons WHERE league_id=? AND status='active'
    ORDER BY season_year DESC,created_at DESC LIMIT 1`).bind(leagueId).first();
}
