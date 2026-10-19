import { activeLeagueTeams, resolveTeam, canonicalTeamKey } from './league-teams.js';
import { currentTradeSeason } from './trade-season.js';

// Retire the old team's listing, never transfer it to the new owner. The active
// pointer guard prevents a concurrent import from applying stale ownership evidence.
export async function reconcileTradeBlockListings(db,leagueId,expectedSnapshotId=null){
  const active=await db.prepare('SELECT snapshot_id FROM league_active_snapshots WHERE league_id=?').bind(leagueId).first();
  if(!active||expectedSnapshotId&&active.snapshot_id!==expectedSnapshotId)return {retired:0};
  const season=await currentTradeSeason(db,leagueId);
  if(!season)return {retired:0};
  const scope=await db.prepare('SELECT source_system,source_franchise_id FROM franchise_seasons WHERE id=? AND league_id=?').bind(season.id,leagueId).first();
  if(!scope)return {retired:0};
  const teams=await activeLeagueTeams(db,leagueId);
  const listings=(await db.prepare(`SELECT listing.id,listing.team_key,record.data_json,
      ownership.current_team_key,overlay.to_team_key
    FROM trade_block_listings listing
    JOIN player_source_aliases alias ON alias.league_id=listing.league_id
      AND alias.player_identity_id=listing.player_identity_id AND alias.source_system=? AND alias.source_franchise_id=?
    JOIN league_snapshot_records record ON record.league_id=listing.league_id AND record.snapshot_id=?
      AND record.domain='players' AND record.external_id=alias.source_player_id
    LEFT JOIN league_player_ownership ownership ON ownership.league_id=listing.league_id AND ownership.player_identity_id=listing.player_identity_id
    LEFT JOIN trade_roster_overlays overlay ON overlay.league_id=listing.league_id AND overlay.player_identity_id=listing.player_identity_id AND overlay.internal_status='active'
    WHERE listing.league_id=? AND listing.active=1 AND listing.asset_type='player'`)
    .bind(scope.source_system,scope.source_franchise_id,active.snapshot_id,leagueId).all()).results||[];
  const retired=new Set();
  for(const row of listings){
    const player=JSON.parse(row.data_json||'{}');
    const sourceTeam=player.team_external_id??player.teamId??player.team_id;
    const override=row.current_team_key??row.to_team_key;
    // Do not infer a move from incomplete source evidence. Explicit unassigned/FA is evidence.
    if(override==null&&!['team_external_id','teamId','team_id'].some(key=>Object.hasOwn(player,key)))continue;
    const owner=override!=null?canonicalTeamKey(override):resolveTeam(teams,sourceTeam)?.teamKey;
    if(canonicalTeamKey(row.team_key)!==owner)retired.add(row.id);
  }
  let count=0;
  for(const id of retired){
    const result=await db.prepare(`UPDATE trade_block_listings SET active=0,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND league_id=? AND active=1 AND EXISTS
        (SELECT 1 FROM league_active_snapshots WHERE league_id=? AND snapshot_id=?)`)
      .bind(id,leagueId,leagueId,active.snapshot_id).run();
    count+=Number(result.meta?.changes||0);
  }
  return {retired:count};
}
