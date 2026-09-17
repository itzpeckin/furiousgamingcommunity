const TRAIT_JSON=`COALESCE(
  json_extract(record.data_json,'$.development_trait'),
  json_extract(record.data_json,'$.developmentTrait'),
  json_extract(record.data_json,'$.dev_trait'),
  json_extract(record.data_json,'$.devTrait'),'')`;
const TRAIT_KEY=`lower(replace(replace(${TRAIT_JSON},'-',''),' ',''))`;

export function observeDevelopmentTraitsStatement(db,{
  leagueId,franchiseSeasonId,snapshotId,seasonYear,stage,week
}={}){
  return db.prepare(`INSERT OR IGNORE INTO player_development_trait_observations
    (league_id,franchise_season_id,snapshot_id,source_player_id,player_identity_id,
     team_external_id,player_name,position,years_pro,development_trait,
     season_year,stage,week_index,observed_at)
    SELECT ?,?,?,record.external_id,
      (SELECT alias.player_identity_id FROM player_source_aliases alias
       WHERE alias.league_id=record.league_id AND alias.source_player_id=record.external_id
       ORDER BY alias.updated_at DESC LIMIT 1),
      COALESCE(json_extract(record.data_json,'$.team_external_id'),json_extract(record.data_json,'$.teamExternalId'),
        json_extract(record.data_json,'$.team_id'),json_extract(record.data_json,'$.teamId')),
      COALESCE(json_extract(record.data_json,'$.display_name'),json_extract(record.data_json,'$.displayName'),
        trim(COALESCE(json_extract(record.data_json,'$.first_name'),json_extract(record.data_json,'$.firstName'),'') || ' ' ||
          COALESCE(json_extract(record.data_json,'$.last_name'),json_extract(record.data_json,'$.lastName'),'')),record.external_id),
      COALESCE(json_extract(record.data_json,'$.position'),json_extract(record.data_json,'$.positionName')),
      CAST(COALESCE(json_extract(record.data_json,'$.years_pro'),json_extract(record.data_json,'$.yearsPro')) AS INTEGER),
      CASE WHEN ${TRAIT_KEY} IN ('3','xfactor','superstarxfactor') THEN 'X-Factor' ELSE 'Superstar' END,
      ?,?,?,CURRENT_TIMESTAMP
    FROM league_snapshot_records record
    WHERE record.league_id=? AND record.snapshot_id=? AND record.domain='players'
      AND ${TRAIT_KEY} IN ('2','3','superstar','xfactor','superstarxfactor')
      AND EXISTS (SELECT 1 FROM league_active_snapshots active
        WHERE active.league_id=? AND active.snapshot_id=?)`)
    .bind(leagueId,franchiseSeasonId,snapshotId,Number(seasonYear)||null,
      String(stage||'regular-season'),Math.max(0,Number(week)||0),
      leagueId,snapshotId,leagueId,snapshotId);
}
