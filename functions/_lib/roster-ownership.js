export async function effectiveRosterOverlays(db,leagueId) {
  const result=await db.prepare(`SELECT source_player_id,to_team_key,internal_status,0 AS priority
    FROM trade_roster_overlays WHERE league_id=? AND internal_status='active'
    UNION ALL
    SELECT alias.source_player_id,ownership.current_team_key AS to_team_key,'active' AS internal_status,1 AS priority
    FROM league_player_ownership ownership JOIN player_source_aliases alias
      ON alias.league_id=ownership.league_id AND alias.player_identity_id=ownership.player_identity_id
    WHERE ownership.league_id=? ORDER BY priority`).bind(leagueId,leagueId).all();
  return result.results || [];
}

export function playerOwnershipStatement(db,{leagueId,playerIdentityId,sourcePlayerId,toTeamKey,snapshotId,actorUserId,sourceType}) {
  return db.prepare(`INSERT INTO league_player_ownership
    (league_id,player_identity_id,source_player_id,current_team_key,revision,source_snapshot_id,source_type,actor_user_id,updated_at)
    VALUES (?,?,?,?,1,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(league_id,player_identity_id) DO UPDATE SET source_player_id=excluded.source_player_id,
      current_team_key=excluded.current_team_key,revision=league_player_ownership.revision+1,
      source_snapshot_id=excluded.source_snapshot_id,source_type=excluded.source_type,actor_user_id=excluded.actor_user_id,updated_at=CURRENT_TIMESTAMP`)
    .bind(leagueId,playerIdentityId,sourcePlayerId,toTeamKey,snapshotId,sourceType,actorUserId);
}
