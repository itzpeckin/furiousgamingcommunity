import {
  database,
  json,
  normalizeLeagueSlug,
  resolveLeague,
  validLeagueSlug
} from '../../../../_lib/cloud-platform.js';
import { normalizeLeagueTeam } from '../../../../_lib/league-teams.js';
import { requirePlatformOwner } from '../../../../_lib/permissions.js';
import {
  freeAgentPreviewCount,
  previewCompleteness,
  publicPlayerId,
  validateSeasonInput
} from '../../../../_lib/permanent-identity.js';

const RELEASE = '7.3.1';
const SOURCE_SYSTEM = 'ea-madden-companion';

const parse = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};

async function state(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return { response:json({ ok:false, error:'Invalid league slug.', release:RELEASE }, 400) };
  const authorization = await requirePlatformOwner(context);
  if (!authorization.authorized) return { response:authorization.response };
  const db = database(context.env);
  const league = db ? await resolveLeague(context.env, slug) : null;
  if (!db || !league || authorization.session.membership?.leagueId !== league.id) {
    return { response:json({ ok:false, error:'Not found.' }, 404) };
  }
  return { db, league, slug, authorization };
}

async function latestRun(db, leagueId) {
  return db.prepare(`SELECT r.*,s.display_name season_display_name,s.game_release,s.source_franchise_id,s.source_season_id
    FROM identity_preview_runs r
    JOIN franchise_seasons s ON s.id=r.franchise_season_id AND s.league_id=r.league_id
    WHERE r.league_id=? ORDER BY r.created_at DESC LIMIT 1`).bind(leagueId).first();
}

function publicRun(row) {
  if (!row) return null;
  return {
    id:row.id,
    status:row.status,
    freeAgentStatus:row.free_agent_status,
    teamCount:Number(row.team_count || 0),
    rosteredPlayerCount:Number(row.rostered_player_count || 0),
    freeAgentCount:row.free_agent_count === null ? null : Number(row.free_agent_count),
    season:{
      id:row.franchise_season_id,
      displayName:row.season_display_name,
      gameRelease:row.game_release,
      sourceFranchiseId:row.source_franchise_id,
      sourceSeasonId:row.source_season_id
    },
    createdAt:row.created_at,
    private:true,
    activationPerformed:false,
    activeSnapshotChanged:false
  };
}

async function previewRows(db, leagueId, runId) {
  if (!runId) return { teams:[], players:[] };
  const [teams, players] = await Promise.all([
    db.prepare(`SELECT team_external_id,team_key,display_name
      FROM identity_preview_teams WHERE league_id=? AND preview_run_id=? ORDER BY display_name`)
      .bind(leagueId, runId).all(),
    db.prepare(`SELECT p.player_identity_id,i.public_id,p.source_player_id,p.team_external_id,
        p.display_name,p.position,p.overall
      FROM identity_preview_players p
      JOIN player_identities i ON i.id=p.player_identity_id AND i.league_id=p.league_id
      WHERE p.league_id=? AND p.preview_run_id=?
      ORDER BY p.team_external_id,p.overall DESC,p.display_name`)
      .bind(leagueId, runId).all()
  ]);
  return {
    teams:(teams.results || []).map(row => ({
      externalId:row.team_external_id, teamKey:row.team_key, displayName:row.display_name
    })),
    players:(players.results || []).map(row => ({
      publicId:row.public_id,
      sourcePlayerId:row.source_player_id,
      teamExternalId:row.team_external_id,
      displayName:row.display_name,
      position:row.position,
      overall:row.overall === null ? null : Number(row.overall)
    }))
  };
}

async function batched(db, statements, size = 100) {
  for (let offset = 0; offset < statements.length; offset += size) {
    await db.batch(statements.slice(offset, offset + size));
  }
}

export async function onRequestGet(context) {
  const current = await state(context);
  if (current.response) return current.response;
  const run = await latestRun(current.db, current.league.id);
  const rows = await previewRows(current.db, current.league.id, run?.id);
  return json({
    ok:true,
    release:RELEASE,
    previewAvailable:Boolean(run),
    preview:publicRun(run),
    ...rows,
    private:true,
    rawPayloadReturned:false,
    activationPerformed:false,
    activeSnapshotChanged:false
  });
}

export async function onRequestPost(context) {
  const current = await state(context);
  if (current.response) return current.response;
  let body = {};
  try { body = await context.request.json(); } catch {}
  const reviewedSeason = validateSeasonInput(body.season);
  if (!reviewedSeason.ok) return json({ ok:false, error:reviewedSeason.error, release:RELEASE }, 422);
  const season = reviewedSeason.value;

  const [teamRun, playerRun, report] = await Promise.all([
    current.db.prepare(`SELECT * FROM companion_team_mapping_runs
      WHERE league_id=? AND status='pending-preview' ORDER BY created_at DESC LIMIT 1`).bind(current.league.id).first(),
    current.db.prepare(`SELECT * FROM companion_player_mapping_runs
      WHERE league_id=? AND status='pending-preview' ORDER BY created_at DESC LIMIT 1`).bind(current.league.id).first(),
    current.db.prepare(`SELECT * FROM madden_discovery_reports
      WHERE league_id=? ORDER BY generated_at DESC LIMIT 1`).bind(current.league.id).first()
  ]);
  if (!teamRun || !playerRun || !report) {
    return json({
      ok:false,
      error:'Analyze the captured export and map teams and rostered players before creating the identity preview.',
      release:RELEASE
    }, 409);
  }

  const [teamResult, playerResult] = await Promise.all([
    current.db.prepare(`SELECT external_id,display_name,abbreviation,nickname
      FROM companion_canonical_teams_preview WHERE league_id=? AND mapping_run_id=? ORDER BY display_name`)
      .bind(current.league.id, teamRun.id).all(),
    current.db.prepare(`SELECT external_id,team_external_id,first_name,last_name,display_name,position,overall
      FROM companion_canonical_players_preview WHERE league_id=? AND mapping_run_id=? ORDER BY external_id`)
      .bind(current.league.id, playerRun.id).all()
  ]);
  const teams = teamResult.results || [];
  const rosteredPlayers = (playerResult.results || []).filter(row => String(row.team_external_id || '').trim());
  const unassignedCount = (playerResult.results || []).length - rosteredPlayers.length;
  if (!teams.length || !rosteredPlayers.length || unassignedCount) {
    return json({
      ok:false,
      error:'The private identity preview requires mapped teams and assigned rostered players only.',
      teamCount:teams.length,
      rosteredPlayerCount:rosteredPlayers.length,
      unassignedPlayerCount:unassignedCount,
      release:RELEASE
    }, 422);
  }

  const sourceVerification = parse(report.source_verification_json, {});
  const reportFranchiseId = String(sourceVerification?.sourceFranchiseId || sourceVerification?.franchiseId || '').trim();
  if (reportFranchiseId && reportFranchiseId !== season.sourceFranchiseId) {
    return json({ ok:false, error:'Reviewed season franchise does not match the analyzed capture.', release:RELEASE }, 409);
  }
  const freeAgentEvidence = parse(report.free_agent_evidence_json, {});
  const freeAgentStatus = ['located','empty-confirmed','missing','blocked'].includes(freeAgentEvidence.status)
    ? freeAgentEvidence.status : 'missing';
  const completeness = previewCompleteness(freeAgentStatus);
  const seasonId = `season_${crypto.randomUUID()}`;
  const existingSeason = await current.db.prepare(`SELECT id FROM franchise_seasons
    WHERE league_id=? AND source_system=? AND source_franchise_id=? AND source_season_id=?`)
    .bind(current.league.id, SOURCE_SYSTEM, season.sourceFranchiseId, season.sourceSeasonId).first();
  const permanentSeasonId = existingSeason?.id || seasonId;
  const now = new Date().toISOString();

  await current.db.prepare(`INSERT INTO franchise_seasons
    (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,'preview',?,?)
    ON CONFLICT(league_id,source_system,source_franchise_id,source_season_id) DO UPDATE SET
      game_release=excluded.game_release,display_name=excluded.display_name,
      season_year=excluded.season_year,updated_at=excluded.updated_at`)
    .bind(permanentSeasonId,current.league.id,SOURCE_SYSTEM,season.sourceFranchiseId,season.sourceSeasonId,
      season.gameRelease,season.displayName,season.seasonYear,now,now).run();

  const aliasesResult = await current.db.prepare(`SELECT source_player_id,player_identity_id
    FROM player_source_aliases WHERE league_id=? AND source_system=? AND source_franchise_id=?`)
    .bind(current.league.id,SOURCE_SYSTEM,season.sourceFranchiseId).all();
  const aliases = new Map((aliasesResult.results || []).map(row => [String(row.source_player_id), row.player_identity_id]));
  const previewRunId = `identity_preview_${crypto.randomUUID()}`;
  const identityStatements = [];
  const mappingStatements = [];

  for (const player of rosteredPlayers) {
    const sourcePlayerId = String(player.external_id);
    let identityId = aliases.get(sourcePlayerId);
    if (!identityId) {
      identityId = `player_${crypto.randomUUID()}`;
      aliases.set(sourcePlayerId, identityId);
      identityStatements.push(current.db.prepare(`INSERT INTO player_identities
        (id,league_id,public_id,display_name,first_name,last_name,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?)`).bind(identityId,current.league.id,publicPlayerId(),player.display_name,
          player.first_name,player.last_name,now,now));
      identityStatements.push(current.db.prepare(`INSERT INTO player_source_aliases
        (league_id,source_system,source_franchise_id,source_player_id,player_identity_id,
         first_seen_season_id,last_seen_season_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).bind(current.league.id,SOURCE_SYSTEM,season.sourceFranchiseId,
          sourcePlayerId,identityId,permanentSeasonId,permanentSeasonId,now,now));
    } else {
      identityStatements.push(current.db.prepare(`UPDATE player_identities SET
        display_name=?,first_name=?,last_name=?,updated_at=? WHERE league_id=? AND id=?`)
        .bind(player.display_name,player.first_name,player.last_name,now,current.league.id,identityId));
      identityStatements.push(current.db.prepare(`UPDATE player_source_aliases SET
        last_seen_season_id=?,updated_at=? WHERE league_id=? AND source_system=?
        AND source_franchise_id=? AND source_player_id=?`).bind(permanentSeasonId,now,current.league.id,
          SOURCE_SYSTEM,season.sourceFranchiseId,sourcePlayerId));
    }
    mappingStatements.push(current.db.prepare(`INSERT INTO player_season_summaries
      (league_id,franchise_season_id,player_identity_id,current_team_external_id,roster_status,
       career_totals_json,season_totals_json,source_mapping_run_id,first_seen_at,last_seen_at)
      VALUES (?,?,?,?,'rostered','{}','{}',?,?,?)
      ON CONFLICT(league_id,franchise_season_id,player_identity_id) DO UPDATE SET
       current_team_external_id=excluded.current_team_external_id,roster_status='rostered',
       source_mapping_run_id=excluded.source_mapping_run_id,last_seen_at=excluded.last_seen_at`)
      .bind(current.league.id,permanentSeasonId,identityId,player.team_external_id,playerRun.id,now,now));
    mappingStatements.push(current.db.prepare(`INSERT INTO identity_preview_players
      (preview_run_id,league_id,player_identity_id,source_player_id,team_external_id,display_name,position,overall)
      VALUES (?,?,?,?,?,?,?,?)`).bind(previewRunId,current.league.id,identityId,sourcePlayerId,
        player.team_external_id,player.display_name,player.position,player.overall));
  }
  await batched(current.db, identityStatements);

  const freeAgentCount = freeAgentPreviewCount(freeAgentStatus, freeAgentEvidence.recordCount);
  await current.db.prepare(`INSERT INTO identity_preview_runs
    (id,league_id,franchise_season_id,team_mapping_run_id,player_mapping_run_id,discovery_report_id,
     status,free_agent_status,team_count,rostered_player_count,free_agent_count,created_by_user_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(previewRunId,current.league.id,permanentSeasonId,teamRun.id,
      playerRun.id,report.id,completeness,freeAgentStatus,teams.length,rosteredPlayers.length,freeAgentCount,
      current.authorization.session.user.id,now).run();
  const teamStatements = teams.map(team => {
    const normalized = normalizeLeagueTeam(team);
    return current.db.prepare(`INSERT INTO identity_preview_teams
      (preview_run_id,league_id,team_external_id,team_key,display_name) VALUES (?,?,?,?,?)`)
      .bind(previewRunId,current.league.id,team.external_id,normalized.teamKey,team.display_name);
  });
  await batched(current.db, [...teamStatements, ...mappingStatements]);

  const run = await latestRun(current.db,current.league.id);
  return json({
    ok:true,
    release:RELEASE,
    previewAvailable:true,
    preview:publicRun(run),
    warnings:freeAgentStatus === 'blocked'
      ? ['Madden Free Agents are blocked upstream. This is a rostered-player-only preview, not proof of zero Free Agents.']
      : [],
    private:true,
    rawPayloadReturned:false,
    activationPerformed:false,
    activeSnapshotChanged:false
  });
}
