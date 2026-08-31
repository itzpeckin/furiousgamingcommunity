import { canonicalOwnershipStage } from './gm-career.js';

const clean = value => value === null || value === undefined ? '' : String(value).trim();

export async function currentFranchiseContext(db, leagueId) {
  const row = await db.prepare(`SELECT active.snapshot_id,snapshot.season_year,snapshot.week_index,
      (SELECT json_extract(record.data_json,'$.stage')
       FROM league_snapshot_records record
       WHERE record.league_id=active.league_id AND record.snapshot_id=active.snapshot_id AND record.domain='games'
       ORDER BY CASE
         WHEN lower(COALESCE(json_extract(record.data_json,'$.stage'),'')) LIKE '%pro%' THEN 4
         WHEN lower(COALESCE(json_extract(record.data_json,'$.stage'),'')) LIKE '%play%' THEN 3
         WHEN lower(COALESCE(json_extract(record.data_json,'$.stage'),'')) LIKE '%post%' THEN 3
         WHEN lower(COALESCE(json_extract(record.data_json,'$.stage'),'')) LIKE '%regular%' THEN 2
         WHEN lower(COALESCE(json_extract(record.data_json,'$.stage'),'')) LIKE '%pre%' THEN 1
         ELSE 0 END DESC,
         CAST(COALESCE(json_extract(record.data_json,'$.week_index'),json_extract(record.data_json,'$.weekIndex'),0) AS INTEGER) DESC
       LIMIT 1) current_stage,
      (SELECT destination.franchise_season_id
       FROM companion_candidate_import_runs run
       JOIN companion_import_destinations destination
         ON destination.id=run.destination_id AND destination.league_id=run.league_id
       WHERE run.league_id=active.league_id AND run.candidate_snapshot_id=active.snapshot_id
       ORDER BY run.created_at DESC LIMIT 1) franchise_season_id
    FROM league_active_snapshots active
    JOIN league_snapshots snapshot ON snapshot.id=active.snapshot_id AND snapshot.league_id=active.league_id
    WHERE active.league_id=? LIMIT 1`).bind(leagueId).first();
  return row ? {
    snapshotId:row.snapshot_id,
    franchiseSeasonId:row.franchise_season_id || null,
    seasonYear:Number(row.season_year),
    stage:canonicalOwnershipStage(row.current_stage||'regular-season'),
    week:Number(row.week_index) || 1
  } : {snapshotId:null,franchiseSeasonId:null,seasonYear:null,stage:'preseason',week:1};
}

function gmPublicId() {
  return `gm_${crypto.randomUUID().replaceAll('-','')}`;
}

export async function ownershipChangeStatements(db, {leagueId,userId,displayName,nextTeamKey,expectedMembershipActive = 1} = {}) {
  const identity = await db.prepare(`SELECT id,public_id,display_name FROM gm_identities WHERE league_id=? AND user_id=? LIMIT 1`)
    .bind(leagueId,userId).first();
  const gmIdentityId = identity?.id || `gm_identity_${crypto.randomUUID()}`;
  const context = await currentFranchiseContext(db,leagueId);
  const open = await db.prepare(`SELECT id,team_key,franchise_season_id FROM team_ownership_periods
    WHERE league_id=? AND gm_identity_id=? AND ended_at IS NULL LIMIT 1`).bind(leagueId,gmIdentityId).first();
  const existingInSeason = context.franchiseSeasonId ? await db.prepare(`SELECT COUNT(*) count FROM team_ownership_periods
    WHERE league_id=? AND gm_identity_id=? AND franchise_season_id=?`).bind(leagueId,gmIdentityId,context.franchiseSeasonId).first() : null;
  const statements=[];
  const wanted=clean(nextTeamKey).toLowerCase() || null;
  const membershipGuard=`EXISTS (
    SELECT 1 FROM league_memberships membership
    WHERE membership.league_id=? AND membership.user_id=? AND membership.active=?
      AND ((? IS NULL AND membership.team_id IS NULL) OR lower(membership.team_id)=?)
  )`;
  const guardBindings=[leagueId,userId,Number(expectedMembershipActive),wanted,wanted];

  if (!identity) {
    statements.push(db.prepare(`INSERT INTO gm_identities
      (id,league_id,user_id,public_id,display_name)
      SELECT ?,?,?,?,? WHERE ${membershipGuard}`)
      .bind(gmIdentityId,leagueId,userId,gmPublicId(),clean(displayName)||'League Member',...guardBindings));
  } else if (clean(displayName) && clean(displayName) !== clean(identity.display_name)) {
    statements.push(db.prepare(`UPDATE gm_identities SET display_name=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND league_id=? AND ${membershipGuard}`)
      .bind(clean(displayName),gmIdentityId,leagueId,...guardBindings));
  }

  if (open && clean(open.team_key).toLowerCase() === wanted && clean(open.franchise_season_id) === clean(context.franchiseSeasonId)) {
    return {statements,gmIdentityId,context,changed:false};
  }
  if (open) {
    statements.push(db.prepare(`UPDATE team_ownership_periods SET
      ended_at=CURRENT_TIMESTAMP,ended_stage=?,ended_week=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND league_id=? AND ended_at IS NULL AND ${membershipGuard}`)
      .bind(context.stage,context.week,open.id,leagueId,...guardBindings));
  }
  if (wanted) {
    const firstInSeason=Number(existingInSeason?.count || 0) === 0;
    statements.push(db.prepare(`INSERT INTO team_ownership_periods
      (id,league_id,gm_identity_id,team_key,franchise_season_id,started_at,started_stage,started_week,assignment_source)
      SELECT ?,?,?,?,?,CURRENT_TIMESTAMP,?,?,? WHERE ${membershipGuard}`)
      .bind(`ownership_period_${crypto.randomUUID()}`,leagueId,gmIdentityId,wanted,context.franchiseSeasonId,
        firstInSeason?'preseason':context.stage,firstInSeason?1:context.week,'commissioner-reviewed',...guardBindings));
  }
  return {statements,gmIdentityId,context,changed:Boolean(open||wanted)};
}
