import { sha256Hex } from './cloud-platform.js';
import { currentTradeSeason } from './trade-season.js';

// Resolve the same live roster identifiers offered by autocomplete, including
// leagues imported without the older, optional identity-preview operation.
export async function resolveLiveTradePlayer(db, leagueId, query) {
  const season = await currentTradeSeason(db, leagueId);
  if (!season) return null;
  const scope = await db.prepare(`SELECT id,source_system,source_franchise_id FROM franchise_seasons
    WHERE id=? AND league_id=?`).bind(season.id,leagueId).first();
  if (!scope) return null;
  const rows = (await db.prepare(`SELECT record.external_id AS sourcePlayerId,record.data_json AS dataJson,
      identity.id AS playerIdentityId,identity.public_id AS publicId,
      COALESCE(json_extract(record.data_json,'$.display_name'),json_extract(record.data_json,'$.displayName'),identity.display_name) AS displayName
    FROM league_active_snapshots active
    JOIN league_snapshot_records record ON record.league_id=active.league_id AND record.snapshot_id=active.snapshot_id
    LEFT JOIN player_source_aliases alias ON alias.league_id=record.league_id AND alias.source_player_id=record.external_id
      AND alias.source_system=? AND alias.source_franchise_id=?
    LEFT JOIN player_identities identity ON identity.id=alias.player_identity_id AND identity.league_id=alias.league_id
    WHERE active.league_id=? AND record.domain='players'
      AND (record.external_id=? OR identity.id=? OR identity.public_id=?
        OR lower(COALESCE(json_extract(record.data_json,'$.display_name'),json_extract(record.data_json,'$.displayName'),identity.display_name))=lower(?))
    LIMIT 2`).bind(scope.source_system,scope.source_franchise_id,leagueId,query,query,query,query).all()).results || [];
  if (rows.length > 1) throw Object.assign(new Error('More than one active player has that name. Choose a player from autocomplete.'),{status:409});
  return rows.length === 1 ? {...rows[0],scope} : null;
}

export async function ensureLiveTradePlayerIdentity(db, leagueId, player) {
  if (player.playerIdentityId) return player;
  const {scope,sourcePlayerId}=player;
  const digest=await sha256Hex(JSON.stringify([leagueId,scope.source_system,scope.source_franchise_id,sourcePlayerId]));
  const identityId=`player_${digest}`,publicId=`plr_${digest.slice(0,32)}`;
  const record=JSON.parse(player.dataJson||'{}');
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO player_identities (id,league_id,public_id,display_name,first_name,last_name)
      VALUES (?,?,?,?,?,?)`).bind(identityId,leagueId,publicId,player.displayName||sourcePlayerId,record.first_name||record.firstName||null,record.last_name||record.lastName||null),
    db.prepare(`INSERT OR IGNORE INTO player_source_aliases
      (league_id,source_system,source_franchise_id,source_player_id,player_identity_id,first_seen_season_id,last_seen_season_id)
      VALUES (?,?,?,?,?,?,?)`).bind(leagueId,scope.source_system,scope.source_franchise_id,sourcePlayerId,identityId,scope.id,scope.id)
  ]);
  // Read the winning alias after concurrent proposals or identity preparation.
  return resolveLiveTradePlayer(db,leagueId,sourcePlayerId);
}
