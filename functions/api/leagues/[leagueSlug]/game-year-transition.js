import { json, database, normalizeLeagueSlug, resolveLeague, validLeagueSlug } from '../../../_lib/cloud-platform.js';
import { requireDatabaseSchema } from '../../../_lib/database-schema.js';
import {
  ARCHIVE_DATASETS,
  GAME_YEAR_ARCHIVE_FORMAT,
  GAME_YEAR_OPERATIONS,
  GAME_YEAR_TRANSITION_RELEASE,
  archiveDigest,
  canTransition,
  normalizeFreeAgentEvidence,
  normalizeGameRelease,
  protectedCounts,
  publicTransition,
  rootArchiveDigest,
  stableArchiveJson,
  transitionConfirmations,
  validateTypedConfirmation
} from '../../../_lib/game-year-transition.js';
import { requireCommissioner } from '../../../_lib/permissions.js';
import { activeLeagueTeams, resolveTeam } from '../../../_lib/league-teams.js';
import { buildGmSeasonSummaries } from '../../../_lib/gm-career.js';

const RELEASE = GAME_YEAR_TRANSITION_RELEASE;
const PAGE_SIZE = 250;
const RESTORE_ROWS_PER_REQUEST = 96;
const RESTORE_BYTES_PER_REQUEST = 256 * 1024;
const RESTORE_SOURCES_PER_REQUEST = 8;
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const text = value => String(value ?? '').trim();
const parse = (value, fallback = null) => { try { return JSON.parse(value || 'null') ?? fallback; } catch { return fallback; } };
const resultRows = result => result?.results || [];

const RESTORE_ORDER = Object.freeze([
  'madden_discovery_sessions',
  'companion_route_captures',
  'madden_discovery_session_captures',
  'madden_discovery_reports',
  'companion_dataset_inspections',
  'companion_team_mapping_runs',
  'companion_canonical_teams_preview',
  'companion_player_mapping_runs',
  'companion_canonical_players_preview',
  'companion_schedule_mapping_runs',
  'companion_canonical_games_preview',
  'companion_statistics_mapping_runs',
  'companion_statistics_mapping_batches',
  'companion_canonical_statistics_preview',
  'identity_preview_runs',
  'identity_preview_teams',
  'identity_preview_players',
  'league_snapshots',
  'league_snapshot_records',
  'snapshot_validation_jobs',
  'snapshot_validation_player_ids',
  'league_snapshot_lifecycle_events',
  'canonical_statistics_snapshot_manifest',
  'import_performance_certifications',
  'canonical_roster_snapshots',
  'canonical_roster_snapshot_players',
  'canonical_historical_player_states',
  'forward_detection_jobs',
  'forward_detection_runs',
  'forward_roster_movements',
  'transaction_movement_classifications',
  'canonical_transactions',
  'canonical_transaction_evidence',
  'companion_candidate_import_runs'
]);

async function access(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return { response:json({ ok:false, error:'Invalid league slug.', release:RELEASE }, 400) };
  const authorization = await requireCommissioner(context);
  if (!authorization.authorized) return { response:authorization.response };
  const db = database(context.env);
  const league = db ? await resolveLeague(context.env, slug) : null;
  if (!db || !league || authorization.session.membership?.leagueId !== league.id) {
    return { response:json({ ok:false, error:'Not found.', release:RELEASE }, 404) };
  }
  try { await requireDatabaseSchema(db); }
  catch (error) { return { response:json({ ok:false, error:error.message, code:error.code, release:RELEASE }, 503) }; }
  return { context, db, league, slug, authorization };
}

async function all(db, sql, ...args) {
  return resultRows(await db.prepare(sql).bind(...args).all());
}

function ownershipGameRecord(row,teams,franchiseSeasonId){
  const raw=parse(row.data_json,{})||{};
  const source=typeof raw.source_record_json==='string'?parse(raw.source_record_json,{}):(raw.source_record_json||raw.source||{});
  const value=(...keys)=>{for(const key of keys){const candidate=raw[key]??source?.[key];if(candidate!==undefined&&candidate!==null&&candidate!=='')return candidate}return null};
  const home=value('home_team_external_id','homeTeamId','home_team_id','homeId');
  const away=value('away_team_external_id','awayTeamId','away_team_id','awayId');
  return{
    id:row.external_id,franchiseSeasonId,
    stage:value('stage','stage_name','stageName','seasonStage'),
    week:Number(value('week_index','weekIndex','week'))||0,
    status:value('status','game_status','gameStatus'),
    homeTeamKey:resolveTeam(teams,home)?.teamKey||'',awayTeamKey:resolveTeam(teams,away)?.teamKey||'',
    homeScore:Number(value('home_score','homeScore')),awayScore:Number(value('away_score','awayScore'))
  };
}

async function gmSeasonFreeze(current,franchiseSeasonId,snapshotId){
  const teams=await activeLeagueTeams(current.db,current.league.id);
  const periods=await all(current.db,`SELECT id,gm_identity_id,team_key,franchise_season_id,started_stage,started_week,ended_stage,ended_week
    FROM team_ownership_periods WHERE league_id=? AND franchise_season_id=?`,current.league.id,franchiseSeasonId);
  const rows=await all(current.db,`SELECT external_id,data_json FROM league_snapshot_records
    WHERE league_id=? AND snapshot_id=? AND domain='games' ORDER BY external_id`,current.league.id,snapshotId);
  const games=rows.map(row=>ownershipGameRecord(row,teams,franchiseSeasonId));
  const built=buildGmSeasonSummaries({games,periods,franchiseSeasonId});
  const statements=built.summaries.map(summary=>current.db.prepare(`INSERT INTO gm_season_summaries
    (league_id,franchise_season_id,gm_identity_id,teams_json,regular_wins,regular_losses,regular_ties,
     playoff_wins,playoff_losses,playoff_ties,playoff_appearance,conference_championships,
     super_bowl_appearances,super_bowl_championships,game_count,source_snapshot_id,frozen_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(league_id,franchise_season_id,gm_identity_id) DO UPDATE SET
      teams_json=excluded.teams_json,regular_wins=excluded.regular_wins,regular_losses=excluded.regular_losses,
      regular_ties=excluded.regular_ties,playoff_wins=excluded.playoff_wins,playoff_losses=excluded.playoff_losses,
      playoff_ties=excluded.playoff_ties,playoff_appearance=excluded.playoff_appearance,
      conference_championships=excluded.conference_championships,super_bowl_appearances=excluded.super_bowl_appearances,
      super_bowl_championships=excluded.super_bowl_championships,game_count=excluded.game_count,
      source_snapshot_id=excluded.source_snapshot_id,frozen_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`)
    .bind(current.league.id,franchiseSeasonId,summary.gmIdentityId,JSON.stringify(summary.teams),
      summary.regularWins,summary.regularLosses,summary.regularTies,summary.playoffWins,summary.playoffLosses,summary.playoffTies,
      summary.playoffAppearance,summary.conferenceChampionships,summary.superBowlAppearances,summary.superBowlChampionships,
      summary.gameCount,snapshotId));
  return{summaries:built.summaries,statements,attributedGameCount:built.attributedGames.length};
}

async function paged(db, sql, args = []) {
  const output = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await all(db, `${sql} LIMIT ? OFFSET ?`, ...args, PAGE_SIZE, offset);
    output.push(...page);
    if (page.length < PAGE_SIZE) return output;
  }
}

async function activeGameYear(db, leagueId) {
  return db.prepare(`SELECT gy.*,active.snapshot_id active_snapshot_id
    FROM league_game_years gy
    LEFT JOIN game_year_snapshots linked ON linked.game_year_id=gy.id AND linked.snapshot_status='active'
    LEFT JOIN league_active_snapshots active ON active.league_id=gy.league_id AND active.snapshot_id=linked.snapshot_id
    WHERE gy.league_id=? AND gy.status IN ('active','restored')
    ORDER BY gy.updated_at DESC LIMIT 1`).bind(leagueId).first();
}

async function currentSeason(db, leagueId, gameYearId) {
  return db.prepare(`SELECT season.* FROM franchise_seasons season
    JOIN game_year_franchise_seasons linked ON linked.franchise_season_id=season.id
    WHERE linked.league_id=? AND linked.game_year_id=? AND season.status IN ('active','preview')
    ORDER BY season.created_at DESC,season.rowid DESC LIMIT 1`).bind(leagueId, gameYearId).first();
}

async function latestTransition(db, leagueId, gameYearId) {
  return db.prepare(`SELECT * FROM game_year_transition_runs
    WHERE league_id=? AND outgoing_game_year_id=? ORDER BY created_at DESC LIMIT 1`)
    .bind(leagueId, gameYearId).first();
}

async function protectedPlaneCounts(db, leagueId) {
  const row = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM leagues WHERE id=?) leagues,
      (SELECT COUNT(*) FROM users) users,
      (SELECT COUNT(*) FROM sessions) sessions,
      (SELECT COUNT(*) FROM league_memberships WHERE league_id=?) memberships,
      (SELECT COUNT(*) FROM league_settings WHERE league_id=?) settings,
      (SELECT COUNT(*) FROM league_rules_documents WHERE league_id=?) rules,
      (SELECT COUNT(*) FROM tenant_audit_events WHERE league_id=?) tenantAudits,
      (SELECT COUNT(*) FROM league_membership_audit WHERE league_id=?) membershipAudits`)
    .bind(leagueId, leagueId, leagueId, leagueId, leagueId, leagueId).first();
  return protectedCounts(row || {});
}

async function freeAgentEvidence(db, leagueId, gameYearId) {
  const row = await db.prepare(`SELECT run.result_counts_json
    FROM companion_candidate_import_runs run
    JOIN companion_import_destinations destination ON destination.id=run.destination_id
    WHERE run.league_id=? AND destination.game_year_id=? AND run.status='preview-ready'
    ORDER BY run.completed_at DESC LIMIT 1`).bind(leagueId, gameYearId).first();
  if (row) return normalizeFreeAgentEvidence(parse(row.result_counts_json, {}));
  const manifest = await db.prepare(`SELECT free_agent_status,free_agent_count
    FROM game_year_archive_manifests WHERE league_id=? AND game_year_id=?
    ORDER BY created_at DESC LIMIT 1`).bind(leagueId,gameYearId).first();
  return normalizeFreeAgentEvidence(manifest ? {
    status:manifest.free_agent_status,
    count:manifest.free_agent_count
  } : {});
}

function datasetQueries(leagueId, gameYearId) {
  const snapshotScope = `SELECT snapshot_id FROM game_year_snapshots WHERE league_id=? AND game_year_id=?`;
  const runScope = `SELECT run.id FROM companion_candidate_import_runs run
    JOIN companion_import_destinations destination ON destination.id=run.destination_id
    WHERE run.league_id=? AND destination.game_year_id=?`;
  const sessionScope = `SELECT DISTINCT run.discovery_session_id FROM companion_candidate_import_runs run
    JOIN companion_import_destinations destination ON destination.id=run.destination_id
    WHERE run.league_id=? AND destination.game_year_id=?`;
  const identityScope = `SELECT preview.id FROM identity_preview_runs preview
    JOIN game_year_franchise_seasons season ON season.franchise_season_id=preview.franchise_season_id
    WHERE preview.league_id=? AND season.game_year_id=?`;
  const identityMappingScope = column => `SELECT DISTINCT ${column} FROM identity_preview_runs preview
    JOIN game_year_franchise_seasons season ON season.franchise_season_id=preview.franchise_season_id
    WHERE preview.league_id=? AND season.game_year_id=? AND ${column} IS NOT NULL`;
  const mappingScope = column => `SELECT DISTINCT ${column} FROM companion_candidate_import_runs run
    JOIN companion_import_destinations destination ON destination.id=run.destination_id
    WHERE run.league_id=? AND destination.game_year_id=? AND ${column} IS NOT NULL`;
  const args = [leagueId, gameYearId];
  return {
    league_snapshots:[`SELECT * FROM league_snapshots WHERE league_id=? AND id IN (${snapshotScope}) ORDER BY id`, [leagueId, leagueId, gameYearId]],
    league_snapshot_records:[`SELECT * FROM league_snapshot_records WHERE league_id=? AND snapshot_id IN (${snapshotScope}) ORDER BY snapshot_id,domain,external_id`, [leagueId, leagueId, gameYearId]],
    snapshot_validation_jobs:[`SELECT * FROM snapshot_validation_jobs WHERE league_id=? AND snapshot_id IN (${snapshotScope}) ORDER BY id`, [leagueId, leagueId, gameYearId]],
    snapshot_validation_player_ids:[`SELECT player.* FROM snapshot_validation_player_ids player JOIN snapshot_validation_jobs job ON job.id=player.job_id AND job.league_id=player.league_id WHERE player.league_id=? AND job.snapshot_id IN (${snapshotScope}) ORDER BY player.job_id,player.player_id`, [leagueId, leagueId, gameYearId]],
    league_snapshot_lifecycle_events:[`SELECT * FROM league_snapshot_lifecycle_events WHERE league_id=? AND snapshot_id IN (${snapshotScope}) ORDER BY id`, [leagueId, leagueId, gameYearId]],
    canonical_statistics_snapshot_manifest:[`SELECT * FROM canonical_statistics_snapshot_manifest WHERE league_id=? AND snapshot_id IN (${snapshotScope}) ORDER BY snapshot_id,route_path`, [leagueId, leagueId, gameYearId]],
    import_performance_certifications:[`SELECT * FROM import_performance_certifications WHERE league_id=? AND snapshot_id IN (${snapshotScope}) ORDER BY id`, [leagueId, leagueId, gameYearId]],
    canonical_roster_snapshots:[`SELECT * FROM canonical_roster_snapshots WHERE league_id=? AND snapshot_id IN (${snapshotScope}) ORDER BY snapshot_id`, [leagueId, leagueId, gameYearId]],
    canonical_roster_snapshot_players:[`SELECT * FROM canonical_roster_snapshot_players WHERE league_id=? AND snapshot_id IN (${snapshotScope}) ORDER BY snapshot_id,player_id`, [leagueId, leagueId, gameYearId]],
    forward_detection_jobs:[`SELECT * FROM forward_detection_jobs WHERE league_id=? AND (current_snapshot_id IN (${snapshotScope}) OR previous_snapshot_id IN (${snapshotScope})) ORDER BY id`, [leagueId, leagueId, gameYearId, leagueId, gameYearId]],
    forward_detection_runs:[`SELECT * FROM forward_detection_runs WHERE league_id=? AND (current_snapshot_id IN (${snapshotScope}) OR previous_snapshot_id IN (${snapshotScope})) ORDER BY id`, [leagueId, leagueId, gameYearId, leagueId, gameYearId]],
    forward_roster_movements:[`SELECT * FROM forward_roster_movements WHERE league_id=? AND (current_snapshot_id IN (${snapshotScope}) OR previous_snapshot_id IN (${snapshotScope})) ORDER BY id`, [leagueId, leagueId, gameYearId, leagueId, gameYearId]],
    transaction_movement_classifications:[`SELECT * FROM transaction_movement_classifications WHERE league_id=? AND (current_snapshot_id IN (${snapshotScope}) OR previous_snapshot_id IN (${snapshotScope})) ORDER BY id`, [leagueId, leagueId, gameYearId, leagueId, gameYearId]],
    canonical_transactions:[`SELECT * FROM canonical_transactions WHERE league_id=? AND (first_snapshot_id IN (${snapshotScope}) OR last_snapshot_id IN (${snapshotScope})) ORDER BY id`, [leagueId, leagueId, gameYearId, leagueId, gameYearId]],
    canonical_transaction_evidence:[`SELECT * FROM canonical_transaction_evidence WHERE league_id=? AND snapshot_id IN (${snapshotScope}) ORDER BY id`, [leagueId, leagueId, gameYearId]],
    canonical_historical_player_states:[`SELECT * FROM canonical_historical_player_states WHERE league_id=? AND snapshot_id IN (${snapshotScope}) ORDER BY snapshot_id,player_id`, [leagueId, leagueId, gameYearId]],
    companion_candidate_import_runs:[`SELECT run.* FROM companion_candidate_import_runs run JOIN companion_import_destinations destination ON destination.id=run.destination_id WHERE run.league_id=? AND destination.game_year_id=? ORDER BY run.id`, args],
    identity_preview_runs:[`SELECT * FROM identity_preview_runs WHERE league_id=? AND id IN (${identityScope}) ORDER BY id`, [leagueId, leagueId, gameYearId]],
    identity_preview_teams:[`SELECT * FROM identity_preview_teams WHERE league_id=? AND preview_run_id IN (${identityScope}) ORDER BY preview_run_id,team_external_id`, [leagueId, leagueId, gameYearId]],
    identity_preview_players:[`SELECT * FROM identity_preview_players WHERE league_id=? AND preview_run_id IN (${identityScope}) ORDER BY preview_run_id,player_identity_id`, [leagueId, leagueId, gameYearId]],
    companion_team_mapping_runs:[`SELECT * FROM companion_team_mapping_runs WHERE league_id=? AND
      (id IN (${mappingScope('run.team_mapping_run_id')}) OR id IN (${identityMappingScope('preview.team_mapping_run_id')}))
      ORDER BY id`, [leagueId, leagueId, gameYearId, leagueId, gameYearId]],
    companion_canonical_teams_preview:[`SELECT * FROM companion_canonical_teams_preview WHERE league_id=? AND
      (mapping_run_id IN (${mappingScope('run.team_mapping_run_id')}) OR mapping_run_id IN (${identityMappingScope('preview.team_mapping_run_id')}))
      ORDER BY mapping_run_id,external_id`, [leagueId, leagueId, gameYearId, leagueId, gameYearId]],
    companion_player_mapping_runs:[`SELECT * FROM companion_player_mapping_runs WHERE league_id=? AND
      (id IN (${mappingScope('run.player_mapping_run_id')}) OR id IN (${identityMappingScope('preview.player_mapping_run_id')}))
      ORDER BY id`, [leagueId, leagueId, gameYearId, leagueId, gameYearId]],
    companion_canonical_players_preview:[`SELECT * FROM companion_canonical_players_preview WHERE league_id=? AND
      (mapping_run_id IN (${mappingScope('run.player_mapping_run_id')}) OR mapping_run_id IN (${identityMappingScope('preview.player_mapping_run_id')}))
      ORDER BY mapping_run_id,external_id`, [leagueId, leagueId, gameYearId, leagueId, gameYearId]],
    companion_schedule_mapping_runs:[`SELECT * FROM companion_schedule_mapping_runs WHERE league_id=? AND id IN (${mappingScope('run.schedule_mapping_run_id')}) ORDER BY id`, [leagueId, leagueId, gameYearId]],
    companion_canonical_games_preview:[`SELECT * FROM companion_canonical_games_preview WHERE league_id=? AND mapping_run_id IN (${mappingScope('run.schedule_mapping_run_id')}) ORDER BY mapping_run_id,external_id`, [leagueId, leagueId, gameYearId]],
    companion_statistics_mapping_runs:[`SELECT * FROM companion_statistics_mapping_runs WHERE league_id=? AND id IN (${mappingScope('run.statistics_mapping_run_id')}) ORDER BY id`, [leagueId, leagueId, gameYearId]],
    companion_statistics_mapping_batches:[`SELECT * FROM companion_statistics_mapping_batches WHERE league_id=? AND mapping_run_id IN (${mappingScope('run.statistics_mapping_run_id')}) ORDER BY mapping_run_id,route_path`, [leagueId, leagueId, gameYearId]],
    companion_canonical_statistics_preview:[`SELECT * FROM companion_canonical_statistics_preview WHERE league_id=? AND mapping_run_id IN (${mappingScope('run.statistics_mapping_run_id')}) ORDER BY mapping_run_id,external_key`, [leagueId, leagueId, gameYearId]],
    madden_discovery_reports:[`SELECT * FROM madden_discovery_reports WHERE league_id=? AND session_id IN (${sessionScope}) ORDER BY id`, [leagueId, leagueId, gameYearId]],
    madden_discovery_session_captures:[`SELECT * FROM madden_discovery_session_captures WHERE league_id=? AND session_id IN (${sessionScope}) ORDER BY session_id,capture_id`, [leagueId, leagueId, gameYearId]],
    companion_dataset_inspections:[`SELECT inspection.* FROM companion_dataset_inspections inspection WHERE inspection.league_id=? AND inspection.discovery_session_id IN (${sessionScope}) ORDER BY inspection.id`, [leagueId, leagueId, gameYearId]],
    companion_route_captures:[`SELECT capture.* FROM companion_route_captures capture WHERE capture.league_id=? AND (capture.discovery_session_id IN (${sessionScope}) OR capture.id IN (SELECT link.capture_id FROM madden_discovery_session_captures link WHERE link.league_id=? AND link.session_id IN (${sessionScope}))) ORDER BY capture.id`, [leagueId, leagueId, gameYearId, leagueId, leagueId, gameYearId]],
    madden_discovery_sessions:[`SELECT * FROM madden_discovery_sessions WHERE league_id=? AND id IN (${sessionScope}) ORDER BY id`, [leagueId, leagueId, gameYearId]]
  };
}

async function relationalBundle(current, gameYear) {
  const queries = datasetQueries(current.league.id, gameYear.id);
  const datasets = {};
  for (const name of ARCHIVE_DATASETS) {
    const [sql, args] = queries[name];
    datasets[name] = await paged(current.db, sql, args);
  }
  const tableCounts = Object.fromEntries(Object.entries(datasets).map(([name, rows]) => [name, rows.length]));
  const sourceObjectKeys = [...new Set((datasets.companion_route_captures || []).map(row => row.r2_object_key).filter(Boolean).map(String))].sort();
  const persistent = await protectedPlaneCounts(current.db, current.league.id);
  const teamAssignments = await all(current.db, `SELECT id membership_id,user_id,role,team_id
    FROM league_memberships WHERE league_id=? AND active=1 AND team_id IS NOT NULL ORDER BY id`, current.league.id);
  const boundaryState = {
    franchiseSeasons:await all(current.db,`SELECT season.id,season.status,season.updated_at
      FROM franchise_seasons season JOIN game_year_franchise_seasons linked
        ON linked.franchise_season_id=season.id
      WHERE linked.league_id=? AND linked.game_year_id=? ORDER BY season.id`,current.league.id,gameYear.id),
    gameYearSnapshots:await all(current.db,`SELECT snapshot_id,snapshot_status,updated_at
      FROM game_year_snapshots WHERE league_id=? AND game_year_id=? ORDER BY snapshot_id`,current.league.id,gameYear.id),
    importDestinations:await all(current.db,`SELECT id,status,updated_at
      FROM companion_import_destinations WHERE league_id=? AND game_year_id=? ORDER BY id`,current.league.id,gameYear.id)
  };
  return {
    formatVersion:GAME_YEAR_ARCHIVE_FORMAT,
    release:RELEASE,
    league:{ id:current.league.id, slug:current.league.slug },
    gameYear:{ id:gameYear.id, gameRelease:gameYear.game_release, editionYear:Number(gameYear.edition_year) },
    generatedAt:new Date().toISOString(),
    persistentPlatformPlane:persistent,
    teamAssignments,
    boundaryState,
    datasets,
    tableCounts,
    sourceObjectKeys
  };
}

async function affectedPreview(current, gameYear) {
  const queries = datasetQueries(current.league.id, gameYear.id);
  const counts = {};
  for (const name of ARCHIVE_DATASETS) {
    const [sql, args] = queries[name];
    const row = await current.db.prepare(`SELECT COUNT(*) count FROM (${sql}) scoped`).bind(...args).first();
    counts[name] = Number(row?.count || 0);
  }
  counts.total = Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0);
  counts.teamAssignments = Number((await current.db.prepare(`SELECT COUNT(*) count FROM league_memberships
    WHERE league_id=? AND active=1 AND team_id IS NOT NULL`).bind(current.league.id).first())?.count || 0);
  return counts;
}

async function audit(current, action, resourceType, resourceId, detail, outcome = 'success') {
  return current.db.prepare(`INSERT INTO tenant_audit_events
    (id,league_id,actor_user_id,request_id,action_id,action,resource_type,resource_id,outcome,detail_json)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
      `tenant_audit_${crypto.randomUUID()}`, current.league.id, current.authorization.session.user.id,
      `request_${crypto.randomUUID()}`, `action_${crypto.randomUUID()}`, action,
      resourceType, resourceId, outcome, JSON.stringify(detail || {})
    );
}

function event(current, transitionId, eventType, detail = {}) {
  return current.db.prepare(`INSERT INTO game_year_transition_events
    (id,league_id,transition_run_id,event_type,actor_user_id,detail_json)
    VALUES (?,?,?,?,?,?)`).bind(
      `game_year_event_${crypto.randomUUID()}`, current.league.id, transitionId, eventType,
      current.authorization.session.user.id, JSON.stringify(detail)
    );
}

async function publicState(current, includePreview = false) {
  const gameYear = await activeGameYear(current.db, current.league.id)
    || await current.db.prepare(`SELECT * FROM league_game_years WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(current.league.id).first();
  const transition = gameYear ? await latestTransition(current.db, current.league.id, gameYear.id) : null;
  const seasons = gameYear ? await all(current.db, `SELECT season.* FROM franchise_seasons season
    JOIN game_year_franchise_seasons linked ON linked.franchise_season_id=season.id
    WHERE linked.league_id=? AND linked.game_year_id=? ORDER BY season.created_at DESC,season.rowid DESC`, current.league.id, gameYear.id) : [];
  const freeAgents = gameYear ? await freeAgentEvidence(current.db, current.league.id, gameYear.id) : normalizeFreeAgentEvidence();
  return {
    ok:true,
    release:RELEASE,
    league:{ id:current.league.id, slug:current.league.slug, name:current.league.name },
    gameYear:gameYear ? {
      id:gameYear.id,
      gameRelease:gameYear.game_release,
      editionYear:Number(gameYear.edition_year),
      displayName:gameYear.display_name,
      status:gameYear.status,
      activeSnapshotId:gameYear.active_snapshot_id || null
    } : null,
    franchiseSeasons:seasons.map(season => ({
      id:season.id, displayName:season.display_name, seasonYear:season.season_year,
      sourceSeasonId:season.source_season_id, status:season.status
    })),
    transition:publicTransition(transition),
    affectedCounts:includePreview && gameYear ? await affectedPreview(current, gameYear) : null,
    preservedDomains:[
      'leagues','users','memberships','roles','sessions','settings','rules','audits',
      'player identities','player season summaries','GM identities','ownership history'
    ],
    operations:[
      { id:GAME_YEAR_OPERATIONS.replaceCurrentImport, destructive:false },
      { id:GAME_YEAR_OPERATIONS.startFranchiseSeason, destructive:false },
      { id:GAME_YEAR_OPERATIONS.archiveRemoveGameYear, destructive:true }
    ],
    confirmations:gameYear ? transitionConfirmations(current.league.slug, gameYear.game_release) : null,
    freeAgents,
    activeSnapshotChanged:false,
    resetPerformed:false
  };
}

async function planArchive(current, gameYear, body) {
  const confirmations = transitionConfirmations(current.league.slug, gameYear.game_release);
  if (!validateTypedConfirmation(body.confirmation, confirmations.plan)) {
    return { response:json({ ok:false, error:`Type ${confirmations.plan} exactly to create this plan.`, release:RELEASE }, 400) };
  }
  const existing = await latestTransition(current.db, current.league.id, gameYear.id);
  if (existing && ['planned','archiving','archive-verified','detached','active-data-removed'].includes(existing.status)) return { transition:existing, reused:true };
  const id = `game_year_transition_${crypto.randomUUID()}`;
  const affected = await affectedPreview(current, gameYear);
  const persistent = await protectedPlaneCounts(current.db, current.league.id);
  const active = await current.db.prepare(`SELECT snapshot_id FROM league_active_snapshots WHERE league_id=?`).bind(current.league.id).first();
  const statements = [
    current.db.prepare(`INSERT INTO game_year_transition_runs
      (id,league_id,operation,outgoing_game_year_id,status,phase,active_snapshot_id_before,
       affected_counts_json,protected_counts_json,confirmation_scope,created_by_user_id)
      VALUES (?,?,? ,?,'planned','inventory',?,?,?,?,?)`).bind(
        id,current.league.id,GAME_YEAR_OPERATIONS.archiveRemoveGameYear,gameYear.id,
        active?.snapshot_id || null,JSON.stringify(affected),JSON.stringify(persistent),confirmations.plan,
        current.authorization.session.user.id
      ),
    event(current,id,'transition_planned',{gameRelease:gameYear.game_release,affectedCounts:affected,protectedCounts:persistent}),
    await audit(current,'game_year.transition.plan','game_year_transition',id,{
      gameYearId:gameYear.id,gameRelease:gameYear.game_release,activeSnapshotId:active?.snapshot_id || null,
      affectedCounts:affected,protectedCounts:persistent,resetPerformed:false
    })
  ];
  await current.db.batch(statements);
  return { transition:await current.db.prepare(`SELECT * FROM game_year_transition_runs WHERE id=?`).bind(id).first(), reused:false };
}

async function copySourceObjects(current, bundle, prefix) {
  if (!current.context.env.COMPANION_EXPORTS?.get || !current.context.env.GAME_YEAR_ARCHIVES?.put) {
    throw new Error('The source and private game-year archive bindings are required.');
  }
  const parts = [];
  for (let index = 0; index < bundle.sourceObjectKeys.length; index += 1) {
    const sourceKey = bundle.sourceObjectKeys[index];
    const source = await current.context.env.COMPANION_EXPORTS.get(sourceKey);
    if (!source) throw new Error(`Source object is unavailable: ${sourceKey}`);
    const bytes = new Uint8Array(await source.arrayBuffer());
    const sha256 = await archiveDigest(bytes);
    const objectKey = `${prefix}/source/${String(index + 1).padStart(4,'0')}.bin`;
    await current.context.env.GAME_YEAR_ARCHIVES.put(objectKey, bytes, {
      customMetadata:{ sourceKey, sha256, release:RELEASE }
    });
    const check = await current.context.env.GAME_YEAR_ARCHIVES.get(objectKey);
    if (!check) throw new Error(`Archived source object could not be read back: ${objectKey}`);
    const checked = new Uint8Array(await check.arrayBuffer());
    if (await archiveDigest(checked) !== sha256) throw new Error(`Archived source checksum mismatch: ${objectKey}`);
    parts.push({ partType:'source-object', sourceKey, objectKey, rowCount:0, byteLength:bytes.byteLength, sha256 });
  }
  return parts;
}

async function archive(current, gameYear, transition, body) {
  const confirmations = transitionConfirmations(current.league.slug, gameYear.game_release);
  if (!validateTypedConfirmation(body.confirmation, confirmations.archive)) {
    return { response:json({ ok:false, error:`Type ${confirmations.archive} exactly to create and verify the private archive.`, release:RELEASE }, 400) };
  }
  if (!canTransition(transition.status, 'archive')) return { response:json({ ok:false,error:'This transition is not ready to archive.',release:RELEASE },409) };
  const archiveBucket = current.context.env.GAME_YEAR_ARCHIVES;
  if (!archiveBucket?.put || !archiveBucket?.get) return { response:json({ ok:false,error:'Private game-year archive storage is not configured.',release:RELEASE },503) };
  await current.db.prepare(`UPDATE game_year_transition_runs SET status='archiving',phase='archive-copy',started_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='planned'`).bind(transition.id).run();
  try {
    const bundle = await relationalBundle(current, gameYear);
    const prefix = `game-year-archives/v${GAME_YEAR_ARCHIVE_FORMAT}/${current.league.id}/${Number(gameYear.edition_year)}/${transition.id}`;
    const relationalJson = stableArchiveJson(bundle);
    const relationalBytes = new TextEncoder().encode(relationalJson);
    const relationalSha256 = await archiveDigest(relationalBytes);
    const relationalObjectKey = `${prefix}/relational.json`;
    await archiveBucket.put(relationalObjectKey, relationalBytes, {
      httpMetadata:{ contentType:'application/json' },
      customMetadata:{ sha256:relationalSha256, release:RELEASE }
    });
    const relationalCheck = await archiveBucket.get(relationalObjectKey);
    if (!relationalCheck) throw new Error('Relational archive could not be read back.');
    const checkedBytes = new Uint8Array(await relationalCheck.arrayBuffer());
    if (await archiveDigest(checkedBytes) !== relationalSha256) throw new Error('Relational archive checksum verification failed.');
    const parts = [{
      partType:'relational',sourceKey:null,objectKey:relationalObjectKey,rowCount:Object.values(bundle.tableCounts).reduce((sum,count)=>sum+Number(count||0),0),
      byteLength:relationalBytes.byteLength,sha256:relationalSha256
    }, ...(await copySourceObjects(current,bundle,prefix))];
    const rootSha256 = await rootArchiveDigest(parts);
    const manifestId = `game_year_manifest_${crypto.randomUUID()}`;
    const bookmarkId = `game_year_bookmark_${crypto.randomUUID()}`;
    const freeAgents = await freeAgentEvidence(current.db,current.league.id,gameYear.id);
    const totalRows = Object.values(bundle.tableCounts).reduce((sum,count)=>sum+Number(count||0),0);
    const totalBytes = parts.reduce((sum,part)=>sum+part.byteLength,0);
    const sourceObjects = parts.filter(part=>part.partType==='source-object').map(part=>({
      sourceKey:part.sourceKey,archiveKey:part.objectKey,sha256:part.sha256,byteLength:part.byteLength
    }));
    const statements = [
      current.db.prepare(`INSERT INTO game_year_archive_manifests
        (id,league_id,game_year_id,transition_run_id,format_version,object_prefix,relational_object_key,
         relational_sha256,root_sha256,table_counts_json,source_objects_json,total_rows,total_objects,total_bytes,
         free_agent_status,free_agent_count,verified_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(
          manifestId,current.league.id,gameYear.id,transition.id,GAME_YEAR_ARCHIVE_FORMAT,prefix,
          relationalObjectKey,relationalSha256,rootSha256,JSON.stringify(bundle.tableCounts),JSON.stringify(sourceObjects),
          totalRows,parts.length,totalBytes,freeAgents.status,freeAgents.count
        ),
      ...parts.map(part => current.db.prepare(`INSERT INTO game_year_archive_parts
        (id,manifest_id,league_id,part_type,source_key,object_key,row_count,byte_length,sha256)
        VALUES (?,?,?,?,?,?,?,?,?)`).bind(
          `game_year_part_${crypto.randomUUID()}`,manifestId,current.league.id,part.partType,part.sourceKey,
          part.objectKey,part.rowCount,part.byteLength,part.sha256
        )),
      current.db.prepare(`INSERT INTO game_year_recovery_bookmarks
        (id,league_id,game_year_id,transition_run_id,manifest_id,active_snapshot_id,team_assignments_json,
         protected_counts_json,root_sha256)
        VALUES (?,?,?,?,?,?,?,?,?)`).bind(
          bookmarkId,current.league.id,gameYear.id,transition.id,manifestId,transition.active_snapshot_id_before,
          JSON.stringify(bundle.teamAssignments),JSON.stringify(bundle.persistentPlatformPlane),rootSha256
        ),
      current.db.prepare(`UPDATE game_year_transition_runs SET status='archive-verified',phase='verified',manifest_id=?,
        recovery_bookmark_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='archiving'`).bind(manifestId,bookmarkId,transition.id),
      event(current,transition.id,'archive_verified',{
        manifestId,bookmarkId,rootSha256,totalRows,totalObjects:parts.length,totalBytes,
        freeAgentStatus:freeAgents.status,freeAgentCount:freeAgents.count,freeAgentInterpretedAsZero:false
      }),
      await audit(current,'game_year.archive.verify','game_year_archive_manifest',manifestId,{
        transitionId:transition.id,gameYearId:gameYear.id,rootSha256,totalRows,totalObjects:parts.length,totalBytes,
        freeAgentStatus:freeAgents.status,freeAgentCount:freeAgents.count,freeAgentInterpretedAsZero:false,
        activeSnapshotChanged:false,resetPerformed:false
      })
    ];
    await current.db.batch(statements);
    return { manifestId, bookmarkId, rootSha256, totalRows, totalObjects:parts.length, totalBytes };
  } catch (error) {
    await current.db.batch([
      current.db.prepare(`UPDATE game_year_transition_runs SET status='failed',phase='archive-failed',error_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify({message:error.message}),transition.id),
      event(current,transition.id,'archive_failed',{message:error.message}),
      await audit(current,'game_year.archive.verify','game_year_transition',transition.id,{message:error.message},'failed')
    ]);
    throw error;
  }
}

async function detach(current, gameYear, transition, body) {
  const confirmations = transitionConfirmations(current.league.slug, gameYear.game_release);
  if (!validateTypedConfirmation(body.confirmation, confirmations.detach)) {
    return { response:json({ok:false,error:`Type ${confirmations.detach} exactly to detach this game year.`,release:RELEASE},400) };
  }
  if (!canTransition(transition.status,'detach')) return { response:json({ok:false,error:'A verified archive is required before detach.',release:RELEASE},409) };
  const active = await current.db.prepare(`SELECT snapshot_id FROM league_active_snapshots WHERE league_id=?`).bind(current.league.id).first();
  if ((active?.snapshot_id || null) !== (transition.active_snapshot_id_before || null)) {
    return { response:json({ok:false,error:'The active snapshot changed after planning; detach was refused.',release:RELEASE},409) };
  }
  const statements = [
    current.db.prepare(`DELETE FROM league_active_snapshots WHERE league_id=? AND snapshot_id=?`).bind(current.league.id,transition.active_snapshot_id_before),
    current.db.prepare(`UPDATE league_snapshots SET status='archived',archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE league_id=? AND id IN (SELECT snapshot_id FROM game_year_snapshots WHERE league_id=? AND game_year_id=?)`).bind(current.league.id,current.league.id,gameYear.id),
    current.db.prepare(`UPDATE game_year_snapshots SET snapshot_status='archived',updated_at=CURRENT_TIMESTAMP WHERE league_id=? AND game_year_id=?`).bind(current.league.id,gameYear.id),
    current.db.prepare(`UPDATE franchise_seasons SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE league_id=? AND id IN
      (SELECT franchise_season_id FROM game_year_franchise_seasons WHERE league_id=? AND game_year_id=?)`).bind(current.league.id,current.league.id,gameYear.id),
    current.db.prepare(`UPDATE team_ownership_periods SET ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
      WHERE league_id=? AND ended_at IS NULL AND franchise_season_id IN
      (SELECT franchise_season_id FROM game_year_franchise_seasons WHERE league_id=? AND game_year_id=?)`).bind(current.league.id,current.league.id,gameYear.id),
    current.db.prepare(`UPDATE league_memberships SET team_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE league_id=? AND team_id IS NOT NULL`).bind(current.league.id),
    current.db.prepare(`UPDATE league_game_years SET status='archived',archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND league_id=?`).bind(gameYear.id,current.league.id),
    current.db.prepare(`UPDATE game_year_transition_runs SET status='detached',phase='active-plane-detached',active_snapshot_id_after=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='archive-verified'`).bind(transition.id),
    event(current,transition.id,'active_data_detached',{activeSnapshotId:transition.active_snapshot_id_before,teamAssignmentsCleared:true}),
    await audit(current,'game_year.transition.detach','league_game_year',gameYear.id,{
      transitionId:transition.id,manifestId:transition.manifest_id,activeSnapshotBefore:transition.active_snapshot_id_before,
      activeSnapshotAfter:null,teamAssignmentsCleared:true,platformPlanePreserved:true,resetPerformed:false
    })
  ];
  await current.db.batch(statements);
  return { detached:true };
}

function marks(values) { return values.map(() => '?').join(','); }
function unique(values) { return [...new Set((values || []).filter(value => value !== null && value !== undefined).map(String))]; }
function deleteWhere(db, table, column, values) {
  if (!SAFE_IDENTIFIER.test(table) || !SAFE_IDENTIFIER.test(column)) throw new Error('Unsafe archive deletion identifier.');
  const ids = unique(values);
  if (!ids.length) return [];
  const statements = [];
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index,index+50);
    statements.push(db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${marks(batch)})`).bind(...batch));
  }
  return statements;
}

async function archivedBundle(current, transition) {
  const manifest = await current.db.prepare(`SELECT * FROM game_year_archive_manifests WHERE id=? AND league_id=?`).bind(transition.manifest_id,current.league.id).first();
  if (!manifest) throw new Error('Verified archive manifest not found.');
  if (await current.db.prepare(`SELECT 1 found FROM game_year_archive_removals WHERE manifest_id=?`).bind(manifest.id).first()) {
    throw new Error('The private archive copy has been removed.');
  }
  const object = await current.context.env.GAME_YEAR_ARCHIVES?.get?.(manifest.relational_object_key);
  if (!object) throw new Error('Relational archive object not found.');
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (await archiveDigest(bytes) !== manifest.relational_sha256) throw new Error('Relational archive checksum mismatch.');
  const parts = await all(current.db,`SELECT object_key,byte_length,sha256 FROM game_year_archive_parts
    WHERE manifest_id=? AND league_id=? ORDER BY object_key`,manifest.id,current.league.id);
  if (!parts.length || await rootArchiveDigest(parts.map(part=>({
    objectKey:part.object_key,byteLength:part.byte_length,sha256:part.sha256
  }))) !== manifest.root_sha256) throw new Error('Archive root checksum verification failed.');
  const relationalPart=parts.find(part=>part.object_key===manifest.relational_object_key);
  if (!relationalPart || relationalPart.sha256!==manifest.relational_sha256 || Number(relationalPart.byte_length)!==bytes.byteLength) {
    throw new Error('Relational archive part does not match its immutable manifest.');
  }
  const bundle = JSON.parse(new TextDecoder().decode(bytes));
  return { manifest, bundle };
}

async function removeActiveData(current, gameYear, transition, body) {
  const confirmations = transitionConfirmations(current.league.slug, gameYear.game_release);
  if (!validateTypedConfirmation(body.confirmation, confirmations.removeActive)) {
    return { response:json({ok:false,error:`Type ${confirmations.removeActive} exactly to remove detached active data.`,release:RELEASE},400) };
  }
  if (!canTransition(transition.status,'removeActive')) return { response:json({ok:false,error:'Detach the verified game-year archive before removing active data.',release:RELEASE},409) };
  const { manifest, bundle } = await archivedBundle(current,transition);
  const sources = parse(manifest.source_objects_json, []);
  if (sources.length && (!current.context.env.COMPANION_EXPORTS?.delete || !current.context.env.COMPANION_EXPORTS?.get)) {
    throw new Error('Source-object removal is unavailable; active-data removal was refused.');
  }
  for (const source of sources) {
    const archived = await current.context.env.GAME_YEAR_ARCHIVES.get(source.archiveKey);
    if (!archived || await archiveDigest(new Uint8Array(await archived.arrayBuffer())) !== source.sha256) {
      throw new Error(`Archived source verification failed before removal: ${source.archiveKey}`);
    }
  }
  for (const source of sources) {
    await current.context.env.COMPANION_EXPORTS.delete(source.sourceKey);
    if (await current.context.env.COMPANION_EXPORTS.get(source.sourceKey)) {
      throw new Error(`Source object remained after removal: ${source.sourceKey}`);
    }
  }
  const data = bundle.datasets || {};
  const snapshotIds = unique((data.league_snapshots || []).map(row=>row.id));
  const jobIds = unique((data.snapshot_validation_jobs || []).map(row=>row.id));
  const movementIds = unique((data.forward_roster_movements || []).map(row=>row.id));
  const transactionIds = unique((data.canonical_transactions || []).map(row=>row.id));
  const candidateRunIds = unique((data.companion_candidate_import_runs || []).map(row=>row.id));
  const identityRunIds = unique((data.identity_preview_runs || []).map(row=>row.id));
  const teamRunIds = unique((data.companion_team_mapping_runs || []).map(row=>row.id));
  const playerRunIds = unique((data.companion_player_mapping_runs || []).map(row=>row.id));
  const scheduleRunIds = unique((data.companion_schedule_mapping_runs || []).map(row=>row.id));
  const statisticsRunIds = unique((data.companion_statistics_mapping_runs || []).map(row=>row.id));
  const sessionIds = unique((data.madden_discovery_sessions || []).map(row=>row.id));
  const captureIds = unique((data.companion_route_captures || []).map(row=>row.id));
  const statements = [
    ...deleteWhere(current.db,'identity_preview_players','preview_run_id',identityRunIds),
    ...deleteWhere(current.db,'identity_preview_teams','preview_run_id',identityRunIds),
    ...deleteWhere(current.db,'identity_preview_runs','id',identityRunIds),
    ...deleteWhere(current.db,'companion_candidate_import_runs','id',candidateRunIds),
    ...deleteWhere(current.db,'companion_canonical_statistics_preview','mapping_run_id',statisticsRunIds),
    ...deleteWhere(current.db,'companion_statistics_mapping_batches','mapping_run_id',statisticsRunIds),
    ...deleteWhere(current.db,'companion_statistics_mapping_runs','id',statisticsRunIds),
    ...deleteWhere(current.db,'companion_canonical_games_preview','mapping_run_id',scheduleRunIds),
    ...deleteWhere(current.db,'companion_schedule_mapping_runs','id',scheduleRunIds),
    ...deleteWhere(current.db,'companion_canonical_players_preview','mapping_run_id',playerRunIds),
    ...deleteWhere(current.db,'companion_player_mapping_runs','id',playerRunIds),
    ...deleteWhere(current.db,'companion_canonical_teams_preview','mapping_run_id',teamRunIds),
    ...deleteWhere(current.db,'companion_team_mapping_runs','id',teamRunIds),
    ...deleteWhere(current.db,'madden_discovery_reports','session_id',sessionIds),
    ...deleteWhere(current.db,'madden_discovery_session_captures','session_id',sessionIds),
    ...deleteWhere(current.db,'companion_dataset_inspections','capture_id',captureIds),
    ...deleteWhere(current.db,'companion_route_captures','id',captureIds),
    ...deleteWhere(current.db,'madden_discovery_sessions','id',sessionIds),
    ...deleteWhere(current.db,'canonical_transaction_evidence','transaction_id',transactionIds),
    ...deleteWhere(current.db,'canonical_transactions','id',transactionIds),
    ...deleteWhere(current.db,'transaction_movement_classifications','movement_id',movementIds),
    ...deleteWhere(current.db,'forward_roster_movements','id',movementIds),
    ...deleteWhere(current.db,'forward_detection_jobs','current_snapshot_id',snapshotIds),
    ...deleteWhere(current.db,'forward_detection_runs','current_snapshot_id',snapshotIds),
    ...deleteWhere(current.db,'canonical_historical_player_states','snapshot_id',snapshotIds),
    ...deleteWhere(current.db,'canonical_roster_snapshot_players','snapshot_id',snapshotIds),
    ...deleteWhere(current.db,'canonical_roster_snapshots','snapshot_id',snapshotIds),
    ...deleteWhere(current.db,'snapshot_validation_player_ids','job_id',jobIds),
    ...deleteWhere(current.db,'snapshot_validation_jobs','id',jobIds),
    ...deleteWhere(current.db,'league_snapshot_lifecycle_events','snapshot_id',snapshotIds),
    ...deleteWhere(current.db,'canonical_statistics_snapshot_manifest','snapshot_id',snapshotIds),
    ...deleteWhere(current.db,'import_performance_certifications','snapshot_id',snapshotIds),
    ...deleteWhere(current.db,'league_snapshot_records','snapshot_id',snapshotIds),
    ...deleteWhere(current.db,'league_snapshots','id',snapshotIds),
    current.db.prepare(`UPDATE game_year_snapshots SET snapshot_status='removed',updated_at=CURRENT_TIMESTAMP WHERE league_id=? AND game_year_id=?`).bind(current.league.id,gameYear.id),
    current.db.prepare(`UPDATE league_game_years SET status='active-data-removed',removed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(gameYear.id),
    current.db.prepare(`UPDATE companion_import_destinations SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE league_id=? AND game_year_id=?`).bind(current.league.id,gameYear.id),
    current.db.prepare(`UPDATE game_year_transition_runs SET status='active-data-removed',phase='active-data-removed',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='detached'`).bind(transition.id),
    event(current,transition.id,'active_data_removed',{tableCounts:bundle.tableCounts,sourceObjectsRemoved:sources.length}),
    await audit(current,'game_year.transition.remove_active_data','league_game_year',gameYear.id,{
      transitionId:transition.id,manifestId:manifest.id,tableCounts:bundle.tableCounts,
      sourceObjectsRemoved:sources.length,platformPlanePreserved:true
    })
  ];
  for (let index = 0; index < statements.length; index += 80) await current.db.batch(statements.slice(index,index+80));
  return { removed:true, tableCounts:bundle.tableCounts };
}

async function removeArchive(current, gameYear, transition, body) {
  const confirmations = transitionConfirmations(current.league.slug, gameYear.game_release);
  if (!validateTypedConfirmation(body.confirmation, confirmations.removeArchive)) {
    return { response:json({ok:false,error:`Type ${confirmations.removeArchive} exactly to remove the private archive copy.`,release:RELEASE},400) };
  }
  if (!canTransition(transition.status,'removeArchive')) return { response:json({ok:false,error:'Active game-year data must be removed before its private archive can be removed.',release:RELEASE},409) };
  const manifest = await current.db.prepare(`SELECT * FROM game_year_archive_manifests WHERE id=? AND league_id=?`).bind(transition.manifest_id,current.league.id).first();
  const archiveBucket=current.context.env.GAME_YEAR_ARCHIVES;
  if(!archiveBucket?.get||!archiveBucket?.delete)throw new Error('Private archive removal is unavailable; no tombstone was written.');
  const parts = await all(current.db,`SELECT object_key,byte_length,sha256 FROM game_year_archive_parts WHERE manifest_id=? ORDER BY object_key`,manifest.id);
  if(!parts.length||await rootArchiveDigest(parts.map(part=>({objectKey:part.object_key,byteLength:part.byte_length,sha256:part.sha256})))!==manifest.root_sha256){
    throw new Error('Archive root checksum verification failed before removal.');
  }
  for (const part of parts) {
    const object=await archiveBucket.get(part.object_key);
    if(!object)throw new Error(`Archive object not found before removal: ${part.object_key}`);
    const bytes=new Uint8Array(await object.arrayBuffer());
    if(bytes.byteLength!==Number(part.byte_length)||await archiveDigest(bytes)!==part.sha256){
      throw new Error(`Archive object verification failed before removal: ${part.object_key}`);
    }
  }
  for (const part of parts) {
    await archiveBucket.delete(part.object_key);
    if(await archiveBucket.get(part.object_key))throw new Error(`Archive object remained after removal: ${part.object_key}`);
  }
  await current.db.batch([
    current.db.prepare(`INSERT INTO game_year_archive_removals
      (id,league_id,manifest_id,transition_run_id,object_count,confirmation_scope,removed_by_user_id)
      VALUES (?,?,?,?,?,?,?)`).bind(`game_year_archive_removal_${crypto.randomUUID()}`,current.league.id,manifest.id,transition.id,parts.length,confirmations.removeArchive,current.authorization.session.user.id),
    current.db.prepare(`UPDATE game_year_transition_runs SET status='archive-removed',phase='complete',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(transition.id),
    event(current,transition.id,'archive_objects_removed',{manifestId:manifest.id,objectCount:parts.length}),
    await audit(current,'game_year.archive.remove','game_year_archive_manifest',manifest.id,{transitionId:transition.id,objectCount:parts.length,manifestRowsRetained:true})
  ]);
  return { archiveRemoved:true, objectCount:parts.length, manifestRowsRetained:true };
}

async function tableColumns(db, table) {
  if (!ARCHIVE_DATASETS.includes(table) || !SAFE_IDENTIFIER.test(table)) throw new Error(`Unsupported restore table: ${table}`);
  const result = await db.prepare(`PRAGMA table_info(${table})`).all();
  return new Set(resultRows(result).map(column=>column.name));
}

function restoreRowCursor(phase) {
  const match = text(phase).match(/^restore-copy:(\d+):(\d+)$/);
  return match
    ? { tableIndex:Number(match[1]), rowOffset:Number(match[2]) }
    : { tableIndex:0, rowOffset:0 };
}

function restoreSourceCursor(phase) {
  const match = text(phase).match(/^restore-source:(\d+)$/);
  return match ? Number(match[1]) : 0;
}

async function saveRestorePhase(current, transitionId, phase) {
  await current.db.prepare(`UPDATE game_year_transition_runs
    SET status='restoring',phase=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(phase,transitionId).run();
}

async function restoreRows(current, bundle, transition) {
  const datasets = bundle.datasets || {};
  let { tableIndex, rowOffset } = restoreRowCursor(transition.phase);
  let remaining = RESTORE_ROWS_PER_REQUEST;
  let remainingBytes = RESTORE_BYTES_PER_REQUEST;
  let processed = 0;
  for (; tableIndex < RESTORE_ORDER.length; tableIndex += 1) {
    const table = RESTORE_ORDER[tableIndex];
    const rows = Array.isArray(datasets[table]) ? datasets[table] : [];
    if (!rows.length || rowOffset >= rows.length) {
      rowOffset = 0;
      continue;
    }
    const allowed = await tableColumns(current.db,table);
    const selected = [];
    for (let index=rowOffset;index<rows.length&&selected.length<remaining;index+=1) {
      const row=rows[index];
      const byteLength=new TextEncoder().encode(JSON.stringify(row)).byteLength;
      if(selected.length&&byteLength>remainingBytes)break;
      selected.push(row);
      remainingBytes=Math.max(0,remainingBytes-byteLength);
      if(remainingBytes===0)break;
    }
    const statements = [];
    for (const row of selected) {
      const columns = Object.keys(row).filter(column=>allowed.has(column)&&SAFE_IDENTIFIER.test(column));
      if (!columns.length) continue;
      statements.push(current.db.prepare(`INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES (${marks(columns)})`).bind(...columns.map(column=>row[column])));
    }
    for (let index=0;index<statements.length;index+=60) await current.db.batch(statements.slice(index,index+60));
    processed += selected.length;
    remaining -= selected.length;
    rowOffset += selected.length;
    if (rowOffset >= rows.length) {
      tableIndex += 1;
      rowOffset = 0;
    }
    const complete = tableIndex >= RESTORE_ORDER.length;
    const phase = complete ? 'restore-source:0' : `restore-copy:${tableIndex}:${rowOffset}`;
    if (complete || remaining <= 0 || remainingBytes <= 0) {
      await saveRestorePhase(current,transition.id,phase);
      return { complete, phase, rowsProcessed:processed };
    }
    tableIndex -= 1;
  }
  await saveRestorePhase(current,transition.id,'restore-source:0');
  return { complete:true, phase:'restore-source:0', rowsProcessed:processed };
}

async function restoreSources(current, manifest, transition) {
  const sources = parse(manifest.source_objects_json,[]);
  const start = restoreSourceCursor(transition.phase);
  const selected = sources.slice(start,start + RESTORE_SOURCES_PER_REQUEST);
  for (const source of selected) {
    const archived = await current.context.env.GAME_YEAR_ARCHIVES.get(source.archiveKey);
    if (!archived) throw new Error(`Archived source object not found: ${source.archiveKey}`);
    const bytes = new Uint8Array(await archived.arrayBuffer());
    if (await archiveDigest(bytes)!==source.sha256) throw new Error(`Archived source checksum mismatch: ${source.archiveKey}`);
    await current.context.env.COMPANION_EXPORTS.put(source.sourceKey,bytes);
    const restored = await current.context.env.COMPANION_EXPORTS.get(source.sourceKey);
    if (!restored || await archiveDigest(new Uint8Array(await restored.arrayBuffer()))!==source.sha256) {
      throw new Error(`Restored source checksum mismatch: ${source.sourceKey}`);
    }
  }
  const next = start + selected.length;
  const complete = next >= sources.length;
  const phase = complete ? 'restore-finalize' : `restore-source:${next}`;
  await saveRestorePhase(current,transition.id,phase);
  return { complete, phase, sourcesProcessed:selected.length, sourcesTotal:sources.length };
}

async function ensureIdentityMappingDependencies(current,bundle,transition) {
  const identityRuns=Array.isArray(bundle.datasets?.identity_preview_runs)
    ? bundle.datasets.identity_preview_runs
    : [];
  const specifications=[
    {
      column:'team_mapping_run_id',
      table:'companion_team_mapping_runs',
      archived:'companion_team_mapping_runs',
      countColumn:'team_count',
      identityCount:'team_count'
    },
    {
      column:'player_mapping_run_id',
      table:'companion_player_mapping_runs',
      archived:'companion_player_mapping_runs',
      countColumn:'player_count',
      identityCount:'rostered_player_count'
    }
  ];
  const repaired=[];
  for(const identityRun of identityRuns){
    for(const specification of specifications){
      const dependencyId=text(identityRun[specification.column]);
      if(!dependencyId)continue;
      const archivedRows=Array.isArray(bundle.datasets?.[specification.archived])
        ? bundle.datasets[specification.archived]
        : [];
      if(archivedRows.some(row=>text(row.id)===dependencyId))continue;
      if(await current.db.prepare(`SELECT 1 found FROM ${specification.table} WHERE id=? AND league_id=?`)
        .bind(dependencyId,current.league.id).first())continue;
      const template=archivedRows[0];
      if(!template)throw new Error(`Identity recovery dependency is unavailable: ${specification.table}`);
      const allowed=await tableColumns(current.db,specification.table);
      const rebuilt={
        ...template,
        id:dependencyId,
        status:'recovered-identity-dependency',
        [specification.countColumn]:Number(identityRun[specification.identityCount]||0),
        warning_count:Number(template.warning_count||0)+1,
        warnings_json:JSON.stringify([{
          code:'RECOVERED_IDENTITY_MAPPING_DEPENDENCY',
          archiveScope:'legacy-7.3.3',
          freeAgentStatus:identityRun.free_agent_status,
          freeAgentCount:identityRun.free_agent_count,
          freeAgentInterpretedAsZero:false
        }]),
        created_at:identityRun.created_at||template.created_at,
        updated_at:new Date().toISOString()
      };
      const columns=Object.keys(rebuilt).filter(column=>allowed.has(column)&&SAFE_IDENTIFIER.test(column));
      const result=await current.db.prepare(`INSERT OR IGNORE INTO ${specification.table}
        (${columns.join(',')}) VALUES (${marks(columns)})`).bind(...columns.map(column=>rebuilt[column])).run();
      if(Number(result?.meta?.changes||0)>0)repaired.push({table:specification.table,id:dependencyId});
    }
  }
  if(repaired.length){
    await current.db.batch([
      event(current,transition.id,'recovery_dependencies_rebuilt',{
        repaired:repaired.map(item=>item.table),
        reason:'legacy archive omitted identity-owned mapping parents',
        freeAgentInterpretedAsZero:false
      }),
      await audit(current,'game_year.recovery.dependencies','game_year_transition',transition.id,{
        repaired:repaired.map(item=>item.table),
        identityRowsRetained:true,
        archiveManifestImmutable:true,
        freeAgentInterpretedAsZero:false
      })
    ]);
  }
  return repaired;
}

async function rollback(current, gameYear, transition, body) {
  const confirmations = transitionConfirmations(current.league.slug, gameYear.game_release);
  if (!validateTypedConfirmation(body.confirmation, confirmations.rollback)) {
    return { response:json({ok:false,error:`Type ${confirmations.rollback} exactly to restore this game year.`,release:RELEASE},400) };
  }
  if (!canTransition(transition.status,'rollback')) return { response:json({ok:false,error:'This transition has no verified restorable archive.',release:RELEASE},409) };
  const { manifest, bundle } = await archivedBundle(current,transition);
  const bookmark = await current.db.prepare(`SELECT * FROM game_year_recovery_bookmarks WHERE id=? AND manifest_id=?`).bind(transition.recovery_bookmark_id,manifest.id).first();
  if(!bookmark)throw new Error('Immutable recovery bookmark not found.');
  const sources=parse(manifest.source_objects_json,[]);
  if(sources.length&&!current.context.env.COMPANION_EXPORTS?.put)throw new Error('Source-object recovery is unavailable; rollback was refused.');
  if (transition.status !== 'restoring') {
    transition = { ...transition, status:'restoring', phase:'restore-copy:0:0' };
    await saveRestorePhase(current,transition.id,transition.phase);
  }
  const rowCursor=restoreRowCursor(transition.phase);
  if(
    text(transition.phase).startsWith('restore-source:')
    || transition.phase==='restore-finalize'
    || (text(transition.phase).startsWith('restore-copy')&&rowCursor.tableIndex>=13)
  ){
    await ensureIdentityMappingDependencies(current,bundle,transition);
  }
  if (!text(transition.phase).startsWith('restore-source:') && transition.phase !== 'restore-finalize') {
    const step = await restoreRows(current,bundle,transition);
    return {
      restored:false,pending:true,phase:step.phase,
      rowsProcessed:step.rowsProcessed,activeSnapshotId:bookmark.active_snapshot_id || null
    };
  }
  if (text(transition.phase).startsWith('restore-source:')) {
    const step = await restoreSources(current,manifest,transition);
    return {
      restored:false,pending:true,phase:step.phase,
      sourcesProcessed:step.sourcesProcessed,sourcesTotal:step.sourcesTotal,
      activeSnapshotId:bookmark.active_snapshot_id || null
    };
  }
  const archivedSnapshots=Array.isArray(bundle.datasets?.league_snapshots)
    ? bundle.datasets.league_snapshots
    : [];
  const candidateSnapshotIds=new Set((bundle.datasets?.companion_candidate_import_runs||[])
    .map(run=>text(run.candidate_snapshot_id)).filter(Boolean));
  const boundary=bundle.boundaryState||{};
  const gameYearSnapshotState=Array.isArray(boundary.gameYearSnapshots)&&boundary.gameYearSnapshots.length
    ? boundary.gameYearSnapshots
    : archivedSnapshots.map(snapshot=>({
        snapshot_id:snapshot.id,
        snapshot_status:bookmark.active_snapshot_id===snapshot.id
          ? 'active'
          : candidateSnapshotIds.has(snapshot.id)?'candidate':'retained',
        updated_at:snapshot.updated_at
      }));
  const franchiseSeasonState=Array.isArray(boundary.franchiseSeasons)&&boundary.franchiseSeasons.length
    ? boundary.franchiseSeasons
    : (await all(current.db,`SELECT franchise_season_id id FROM game_year_franchise_seasons
        WHERE league_id=? AND game_year_id=? ORDER BY franchise_season_id`,current.league.id,gameYear.id))
      .map(season=>({...season,status:bookmark.active_snapshot_id?'active':'preview'}));
  const destinationState=Array.isArray(boundary.importDestinations)&&boundary.importDestinations.length
    ? boundary.importDestinations
    : (await all(current.db,`SELECT id FROM companion_import_destinations
        WHERE league_id=? AND game_year_id=? ORDER BY id`,current.league.id,gameYear.id))
      .map(destination=>({...destination,status:'active'}));
  const assignments = parse(bookmark.team_assignments_json,[]);
  const statements = [
    ...assignments.map(item=>current.db.prepare(`UPDATE league_memberships SET team_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND league_id=? AND user_id=?`).bind(item.team_id,item.membership_id,current.league.id,item.user_id)),
    bookmark.active_snapshot_id
      ? current.db.prepare(`INSERT OR REPLACE INTO league_active_snapshots (league_id,snapshot_id,activated_at,activated_by,previous_snapshot_id)
        VALUES (?,?,CURRENT_TIMESTAMP,?,NULL)`).bind(current.league.id,bookmark.active_snapshot_id,current.authorization.session.user.id)
      : current.db.prepare(`DELETE FROM league_active_snapshots WHERE league_id=?`).bind(current.league.id),
    ...archivedSnapshots.map(snapshot=>current.db.prepare(`UPDATE league_snapshots
      SET status=?,archived_at=?,updated_at=? WHERE id=? AND league_id=?`)
      .bind(snapshot.status,snapshot.archived_at||null,snapshot.updated_at||new Date().toISOString(),snapshot.id,current.league.id)),
    ...gameYearSnapshotState.map(snapshot=>current.db.prepare(`UPDATE game_year_snapshots
      SET snapshot_status=?,updated_at=? WHERE league_id=? AND game_year_id=? AND snapshot_id=?`)
      .bind(snapshot.snapshot_status,snapshot.updated_at||new Date().toISOString(),current.league.id,gameYear.id,snapshot.snapshot_id)),
    ...franchiseSeasonState.map(season=>current.db.prepare(`UPDATE franchise_seasons
      SET status=?,updated_at=? WHERE id=? AND league_id=?`)
      .bind(season.status,season.updated_at||new Date().toISOString(),season.id,current.league.id)),
    ...destinationState.map(destination=>current.db.prepare(`UPDATE companion_import_destinations
      SET status=?,updated_at=? WHERE id=? AND league_id=? AND game_year_id=?`)
      .bind(destination.status,destination.updated_at||new Date().toISOString(),destination.id,current.league.id,gameYear.id)),
    current.db.prepare(`UPDATE league_game_years SET status='restored',removed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(gameYear.id),
    current.db.prepare(`UPDATE game_year_transition_runs SET status='restored',phase='complete',active_snapshot_id_after=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(bookmark.active_snapshot_id,transition.id),
    event(current,transition.id,'game_year_restored',{manifestId:manifest.id,activeSnapshotId:bookmark.active_snapshot_id,teamAssignmentsRestored:assignments.length}),
    await audit(current,'game_year.transition.rollback','league_game_year',gameYear.id,{
      transitionId:transition.id,manifestId:manifest.id,activeSnapshotId:bookmark.active_snapshot_id,
      teamAssignmentsRestored:assignments.length,rootSha256:manifest.root_sha256
    })
  ];
  await current.db.batch(statements);
  return { restored:true, activeSnapshotId:bookmark.active_snapshot_id || null, teamAssignmentsRestored:assignments.length };
}

async function replaceCurrentImport(current, gameYear, body) {
  const confirmations = transitionConfirmations(current.league.slug,gameYear.game_release);
  if (!validateTypedConfirmation(body.confirmation,confirmations.plan)) return {response:json({ok:false,error:`Type ${confirmations.plan} exactly.`,release:RELEASE},400)};
  const id=`game_year_transition_${crypto.randomUUID()}`;
  await current.db.batch([
    current.db.prepare(`INSERT INTO game_year_transition_runs
      (id,league_id,operation,outgoing_game_year_id,incoming_game_year_id,status,phase,confirmation_scope,created_by_user_id,completed_at)
      VALUES (?,?,?,?,?,'completed','candidate-import',?,?,CURRENT_TIMESTAMP)`).bind(id,current.league.id,GAME_YEAR_OPERATIONS.replaceCurrentImport,gameYear.id,gameYear.id,confirmations.plan,current.authorization.session.user.id),
    event(current,id,'replace_current_import_selected',{gameYearId:gameYear.id,activeSnapshotChanged:false}),
    await audit(current,'game_year.operation.replace_current_import','league_game_year',gameYear.id,{transitionId:id,activeSnapshotChanged:false,resetPerformed:false})
  ]);
  return { completed:true, nextPath:'#commissioner/league-data', openImporter:true };
}

function nextFranchiseSeason(previous,current) {
  const seasonYear=Number(previous?.season_year)+1;
  if(!Number.isInteger(seasonYear)||seasonYear<2000||seasonYear>2200)return null;
  const priorSource=text(previous?.source_season_id);
  const numeric=priorSource.match(/^(.*?)(\d+)$/);
  const sourceSeasonId=numeric
    ? `${numeric[1]}${Number(numeric[2])+1}`
    : `${priorSource||'season'}-${seasonYear}`;
  return{
    sourceSeasonId,
    seasonYear,
    displayName:`${current.league.name} · ${previous.game_release} · ${seasonYear}`
  };
}

async function archiveFranchiseSeason(current, gameYear) {
  const previous=await currentSeason(current.db,current.league.id,gameYear.id);
  if(!previous)return{response:json({ok:false,error:'No current franchise season is available to archive.',release:RELEASE},409)};
  const active=await current.db.prepare(`SELECT snapshot.id,snapshot.season_year
    FROM league_active_snapshots pointer JOIN league_snapshots snapshot
      ON snapshot.id=pointer.snapshot_id AND snapshot.league_id=pointer.league_id
    WHERE pointer.league_id=?`).bind(current.league.id).first();
  if(previous.status==='preview'&&Number(active?.season_year)!==Number(previous.season_year)){
    return{completed:true,alreadyPrepared:true,franchiseSeasonId:previous.id,seasonYear:Number(previous.season_year)};
  }
  if(!active||Number(active.season_year)!==Number(previous.season_year)){
    return{response:json({ok:false,error:'The live snapshot does not match the franchise season selected for archive.',release:RELEASE},409)};
  }
  const next=nextFranchiseSeason(previous,current);
  if(!next)return{response:json({ok:false,error:'The next franchise season identity could not be derived safely.',release:RELEASE},409)};
  const summaries=await all(current.db,`SELECT player_identity_id,career_totals_json,season_totals_json FROM player_season_summaries WHERE league_id=? AND franchise_season_id=? ORDER BY player_identity_id`,current.league.id,previous.id);
  const periods=await all(current.db,`SELECT id,gm_identity_id,team_key,started_at,ended_at FROM team_ownership_periods WHERE league_id=? AND franchise_season_id=? ORDER BY id`,current.league.id,previous.id);
  const gmFreeze=await gmSeasonFreeze(current,previous.id,active.id);
  const frozenSha=await archiveDigest({summaries,periods,gmSeasonSummaries:gmFreeze.summaries});
  const newSeasonId=`franchise_season_${crypto.randomUUID()}`,closureId=`franchise_season_closure_${crypto.randomUUID()}`,transitionId=`game_year_transition_${crypto.randomUUID()}`;
  await current.db.batch([
    current.db.prepare(`UPDATE franchise_seasons SET status='closed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND league_id=?`).bind(previous.id,current.league.id),
    current.db.prepare(`UPDATE team_ownership_periods SET ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP),ended_stage=COALESCE(ended_stage,'pro-bowl'),ended_week=COALESCE(ended_week,999),updated_at=CURRENT_TIMESTAMP WHERE league_id=? AND franchise_season_id=?`).bind(current.league.id,previous.id),
    ...gmFreeze.statements,
    current.db.prepare(`INSERT INTO franchise_season_closures
      (id,league_id,game_year_id,franchise_season_id,player_summary_count,ownership_period_count,frozen_totals_sha256,postseason_summary_json,closed_by_user_id)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(closureId,current.league.id,gameYear.id,previous.id,summaries.length,periods.length,frozenSha,JSON.stringify({gmSeasonSummaryCount:gmFreeze.summaries.length,attributedGameCount:gmFreeze.attributedGameCount}),current.authorization.session.user.id),
    current.db.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES (?,?,?,?,?,?,?,?, 'preview')`).bind(newSeasonId,current.league.id,previous.source_system,previous.source_franchise_id,next.sourceSeasonId,gameYear.game_release,next.displayName,next.seasonYear),
    current.db.prepare(`INSERT INTO game_year_franchise_seasons (game_year_id,league_id,franchise_season_id) VALUES (?,?,?)`).bind(gameYear.id,current.league.id,newSeasonId),
    current.db.prepare(`UPDATE companion_import_destinations SET status='archived',updated_at=CURRENT_TIMESTAMP
      WHERE league_id=? AND franchise_season_id=?`).bind(current.league.id,previous.id),
    current.db.prepare(`UPDATE companion_league_export_endpoints SET latest_session_id=NULL,
      latest_session_token_version=NULL,latest_report_id=NULL,latest_ready_report_id=NULL,
      analysis_requested_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE league_id=?`).bind(current.league.id),
    current.db.prepare(`INSERT INTO game_year_transition_runs
      (id,league_id,operation,outgoing_game_year_id,incoming_game_year_id,status,phase,confirmation_scope,created_by_user_id,completed_at)
      VALUES (?,?,?,?,?,'completed','season-prepared',?,?,CURRENT_TIMESTAMP)`).bind(transitionId,current.league.id,GAME_YEAR_OPERATIONS.startFranchiseSeason,gameYear.id,gameYear.id,'one-click-archive-season',current.authorization.session.user.id),
    event(current,transitionId,'franchise_season_closed',{franchiseSeasonId:previous.id,closureId,playerSummaryCount:summaries.length,ownershipPeriodCount:periods.length,gmSeasonSummaryCount:gmFreeze.summaries.length,attributedGameCount:gmFreeze.attributedGameCount,frozenTotalsSha256:frozenSha}),
    event(current,transitionId,'franchise_season_prepared',{franchiseSeasonId:newSeasonId,sourceSeasonId:next.sourceSeasonId,seasonYear:next.seasonYear,latestExportSelectionCleared:true}),
    await audit(current,'franchise_season.archive_and_prepare','franchise_season',previous.id,{
      transitionId,previousSeasonId:previous.id,nextSeasonId:newSeasonId,closureId,gameYearId:gameYear.id,
      seasonYear:previous.season_year,nextSeasonYear:next.seasonYear,activeSnapshotChanged:false,
      historyPermanentlyDeleted:false,exportUrlRotated:false,freeAgentInterpretedAsZero:false
    })
  ]);
  return{completed:true,archivedSeasonId:previous.id,franchiseSeasonId:newSeasonId,
    seasonYear:next.seasonYear,closureId,frozenTotalsSha256:frozenSha,historyPermanentlyDeleted:false};
}

export async function onRequestGet(context) {
  const current=await access(context);if(current.response)return current.response;
  const includePreview=new URL(context.request.url).searchParams.get('preview')==='1';
  return json(await publicState(current,includePreview));
}

export async function onRequestPost(context) {
  const current=await access(context);if(current.response)return current.response;
  let body={};try{body=await context.request.json()}catch{}
  const action=text(body.action).toLowerCase();
  let gameYear=await activeGameYear(current.db,current.league.id);
  if(!gameYear&&body.gameYearId)gameYear=await current.db.prepare(`SELECT * FROM league_game_years WHERE id=? AND league_id=?`).bind(text(body.gameYearId),current.league.id).first();
  if(!gameYear)return json({ok:false,error:'No Madden game year is registered for this league.',release:RELEASE},409);
  try{
    if(action==='preview')return json(await publicState(current,true));
    if(action==='replace-current-import'){
      const result=await replaceCurrentImport(current,gameYear,body);if(result.response)return result.response;return json({...await publicState(current),result});
    }
    if(action==='archive-franchise-season'||action==='start-franchise-season'){
      const result=await archiveFranchiseSeason(current,gameYear);if(result.response)return result.response;return json({...await publicState(current),result});
    }
    if(action==='plan-archive'){
      const result=await planArchive(current,gameYear,body);if(result.response)return result.response;return json({...await publicState(current),planned:true,reused:result.reused});
    }
    const transition=await latestTransition(current.db,current.league.id,gameYear.id);
    if(!transition)return json({ok:false,error:'Create and review the game-year transition plan first.',release:RELEASE},409);
    if(action==='archive'){
      const result=await archive(current,gameYear,transition,body);if(result.response)return result.response;return json({...await publicState(current),archive:result});
    }
    if(action==='detach'){
      const result=await detach(current,gameYear,transition,body);if(result.response)return result.response;return json({...await publicState(current),activeSnapshotChanged:true,detach:result});
    }
    if(action==='remove-active-data'){
      const result=await removeActiveData(current,gameYear,transition,body);if(result.response)return result.response;return json({...await publicState(current),removal:result});
    }
    if(action==='remove-archive'){
      const result=await removeArchive(current,gameYear,transition,body);if(result.response)return result.response;return json({...await publicState(current),archiveRemoval:result});
    }
    if(action==='rollback'){
      const result=await rollback(current,gameYear,transition,body);if(result.response)return result.response;return json({...await publicState(current),activeSnapshotChanged:Boolean(result.restored&&result.activeSnapshotId),rollback:result});
    }
    return json({ok:false,error:`Unsupported action: ${action||'none'}.`,release:RELEASE},400);
  }catch(error){
    return json({ok:false,error:'Game-year transition stopped safely.',detail:error?.message||String(error),release:RELEASE},500);
  }
}

export { datasetQueries };
