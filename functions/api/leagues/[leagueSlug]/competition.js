import { createId, jsonResponse } from '../../../_lib/auth.js';
import { requireActiveMembership } from '../../../_lib/permissions.js';
import {
  createTenantAuditContext,
  resolveRequestTenant,
  tenantAuditStatement
} from '../../../_lib/tenant-context.js';

const RELEASE = '7.4.4.5';
const MAX_BODY_BYTES = 16 * 1024;
const SAFE_GAME_ID = /^[A-Za-z0-9._:-]{1,180}$/;
const SAFE_TEAM_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const STAGES = new Set(['preseason', 'regular', 'postseason']);

const parse = (value, fallback = null) => {
  try { return JSON.parse(value); } catch { return fallback; }
};
const rows = async (db, sql, ...values) => (
  await db.prepare(sql).bind(...values).all()
).results || [];
const cleanStage = value => {
  const stage = String(value || 'regular').trim().toLowerCase();
  if (/pre/.test(stage)) return 'preseason';
  if (/post|playoff|wild|divisional|conference|super/.test(stage)) return 'postseason';
  return STAGES.has(stage) ? stage : 'regular';
};
const number = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function publicGame(row, snapshot) {
  const raw = parse(row.data_json, {}) || {};
  const source = raw.source_record_json ? parse(raw.source_record_json, raw) : raw;
  const id = String(raw.external_id ?? raw.game_id ?? raw.gameId ?? source.external_id
    ?? source.game_id ?? source.gameId ?? row.external_id ?? '');
  const seasonYear = number(raw.season_year ?? raw.seasonYear ?? source.season_year
    ?? source.seasonYear ?? snapshot.seasonYear) ?? snapshot.seasonYear;
  const weekIndex = number(raw.week_index ?? raw.weekIndex ?? raw.week ?? source.week_index
    ?? source.weekIndex ?? source.week);
  const homeTeamId = String(raw.home_team_external_id ?? raw.home_team_id ?? raw.homeTeamId
    ?? source.home_team_external_id ?? source.home_team_id ?? source.homeTeamId ?? '');
  const awayTeamId = String(raw.away_team_external_id ?? raw.away_team_id ?? raw.awayTeamId
    ?? source.away_team_external_id ?? source.away_team_id ?? source.awayTeamId ?? '');
  const homeScore = number(raw.home_score ?? raw.homeScore ?? source.home_score ?? source.homeScore);
  const awayScore = number(raw.away_score ?? raw.awayScore ?? source.away_score ?? source.awayScore);
  const status = String(raw.status ?? raw.game_status ?? raw.gameStatus ?? source.status
    ?? source.game_status ?? source.gameStatus ?? 'scheduled').toLowerCase();
  const stage = cleanStage(raw.stage ?? raw.stage_name ?? raw.stageName ?? source.stage
    ?? source.stage_name ?? source.stageName);
  return {
    id, seasonYear, stage, weekIndex,
    homeTeamId, awayTeamId, homeScore, awayScore, status,
    scheduledAt:String(raw.scheduled_at ?? raw.scheduledAt ?? source.scheduled_at
      ?? source.scheduledAt ?? '') || null
  };
}

async function requestContext(context, {commissioner = false} = {}) {
  const access = await requireActiveMembership(context);
  if (!access.authorized) return {response:access.response};
  if (commissioner && access.session.membership?.role !== 'commissioner') {
    return {response:jsonResponse({ok:false,error:'You do not have permission to perform this action.'}, 403)};
  }
  const league = await resolveRequestTenant(context);
  if (!league || access.session.membership?.leagueId !== league.id) {
    return {response:jsonResponse({ok:false,error:'Not found.'}, 404)};
  }
  return {db:context.env.DB, league, session:access.session, request:context.request};
}

async function readBody(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return {response:jsonResponse({ok:false,error:'Competition request is too large.'}, 413)};
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return {response:jsonResponse({ok:false,error:'Competition request is too large.'}, 413)};
  }
  try {
    const body = raw ? JSON.parse(raw) : {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid');
    return {body};
  } catch {
    return {response:jsonResponse({ok:false,error:'Request body must be a JSON object.'}, 400)};
  }
}

async function activeSnapshot(c) {
  const row = await c.db.prepare(`SELECT active.snapshot_id AS snapshotId,
      snapshot.season_year AS seasonYear,snapshot.week_index AS currentWeek
    FROM league_active_snapshots active
    INNER JOIN league_snapshots snapshot
      ON snapshot.id=active.snapshot_id AND snapshot.league_id=active.league_id
    WHERE active.league_id=? LIMIT 1`).bind(c.league.id).first();
  if (!row?.snapshotId) throw Object.assign(new Error('No active league snapshot is available.'), {status:409});
  return {
    snapshotId:String(row.snapshotId),
    seasonYear:number(row.seasonYear) ?? number(c.league.current_season) ?? 2026,
    currentWeek:number(row.currentWeek) ?? number(c.league.current_week) ?? 1
  };
}

async function activeGames(c, snapshot) {
  const result = await rows(c.db, `SELECT external_id,data_json
    FROM league_snapshot_records
    WHERE league_id=? AND snapshot_id=? AND domain='games'
    ORDER BY external_id`, c.league.id, snapshot.snapshotId);
  return result.map(row => publicGame(row, snapshot))
    .filter(game => game.id && game.weekIndex !== null && game.homeTeamId && game.awayTeamId);
}

async function featureState(c) {
  const result = await rows(c.db, `SELECT feature_key AS featureKey,enabled
    FROM league_features WHERE league_id=?
      AND feature_key IN ('confidence_pool','game_of_the_week')`, c.league.id);
  const byKey = new Map(result.map(row => [row.featureKey, Boolean(Number(row.enabled))]));
  return {
    confidencePool:byKey.has('confidence_pool') ? byKey.get('confidence_pool') : true,
    gameOfTheWeek:byKey.has('game_of_the_week') ? byKey.get('game_of_the_week') : true
  };
}

function entryModel(entryRows, pickRows, userId, seasonYear) {
  const entries = entryRows.filter(row => row.userId === userId);
  const picks = {};
  const submittedWeeks = {};
  for (const entry of entries) {
    if (entry.status === 'submitted') submittedWeeks[String(entry.weekIndex)] = entry.submittedAt || entry.updatedAt;
  }
  const entryIds = new Set(entries.map(row => row.id));
  for (const pick of pickRows) {
    if (!entryIds.has(pick.entryId)) continue;
    picks[pick.gameId] = {
      gameId:pick.gameId,
      week:Number(pick.weekIndex),
      selectedTeamId:pick.selectedTeamId || null,
      confidence:pick.confidenceValue == null ? null : Number(pick.confidenceValue)
    };
  }
  return {
    userId, season:String(seasonYear),
    status:entries.length && entries.every(row => row.status === 'submitted') ? 'submitted' : 'draft',
    picks, submittedWeeks,
    updatedAt:entries.map(row => row.updatedAt).sort().at(-1) || null,
    submittedAt:entries.map(row => row.submittedAt).filter(Boolean).sort().at(-1) || null
  };
}

function winner(game) {
  if (!/final|complete|played/.test(game.status)) return null;
  if (game.homeScore == null || game.awayScore == null) return null;
  if (game.homeScore === game.awayScore) return 'tie';
  return game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
}

function leaderboard(entryRows, pickRows, games, members) {
  const gameMap = new Map(games.map(game => [game.id, game]));
  const entryMap = new Map(entryRows.map(entry => [entry.id, entry]));
  const userScores = new Map();
  for (const pick of pickRows) {
    const entry = entryMap.get(pick.entryId);
    const game = gameMap.get(pick.gameId);
    if (!entry || !game || !pick.selectedTeamId) continue;
    const row = userScores.get(entry.userId) || {userId:entry.userId,totalPoints:0,correctPicks:0,weeks:{},status:'draft'};
    const gameWinner = winner(game);
    const value = Number(pick.confidenceValue || 0);
    const points = !gameWinner ? 0 : gameWinner === 'tie' ? value / 2 : gameWinner === pick.selectedTeamId ? value : 0;
    if (gameWinner && gameWinner !== 'tie' && gameWinner === pick.selectedTeamId) row.correctPicks += 1;
    row.totalPoints += points;
    const week = row.weeks[entry.weekIndex] || {week:Number(entry.weekIndex),points:0,correct:0,finalGames:0};
    week.points += points;
    if (gameWinner) week.finalGames += 1;
    if (gameWinner && gameWinner !== 'tie' && gameWinner === pick.selectedTeamId) week.correct += 1;
    row.weeks[entry.weekIndex] = week;
    if (entry.status === 'submitted') row.status = 'submitted';
    userScores.set(entry.userId, row);
  }
  const memberMap = new Map(members.map(member => [member.userId, member]));
  return [...userScores.values()].map(row => ({
    ...row,
    name:memberMap.get(row.userId)?.displayName || 'League Member',
    teamId:memberMap.get(row.userId)?.teamId || null,
    weeks:Object.values(row.weeks).sort((a,b) => a.week - b.week)
  })).sort((a,b) => b.totalPoints - a.totalPoints || b.correctPicks - a.correctPicks || a.name.localeCompare(b.name));
}

export async function competitionState(c) {
  const snapshot = await activeSnapshot(c);
  const games = await activeGames(c, snapshot);
  const features = await featureState(c);
  const [gotwRows, weekRows, entryRows, pickRows, memberRows] = await Promise.all([
    rows(c.db, `SELECT season_year AS seasonYear,stage,week_index AS weekIndex,game_id AS gameId,
        source_snapshot_id AS sourceSnapshotId,updated_at AS updatedAt
      FROM league_game_of_week_selections WHERE league_id=? AND season_year=?`, c.league.id, snapshot.seasonYear),
    rows(c.db, `SELECT season_year AS seasonYear,stage,week_index AS weekIndex,status,revision,
        opened_at AS openedAt,locked_at AS lockedAt,finalized_at AS finalizedAt,updated_at AS updatedAt
      FROM confidence_pool_weeks WHERE league_id=? AND season_year=?
      ORDER BY stage,week_index`, c.league.id, snapshot.seasonYear),
    rows(c.db, `SELECT id,user_id AS userId,season_year AS seasonYear,stage,
        week_index AS weekIndex,status,revision,submitted_at AS submittedAt,updated_at AS updatedAt
      FROM confidence_pool_entries WHERE league_id=? AND season_year=?`, c.league.id, snapshot.seasonYear),
    rows(c.db, `SELECT pick.entry_id AS entryId,pick.game_id AS gameId,
        pick.selected_team_id AS selectedTeamId,pick.confidence_value AS confidenceValue,
        entry.week_index AS weekIndex
      FROM confidence_pool_picks pick
      INNER JOIN confidence_pool_entries entry
        ON entry.id=pick.entry_id AND entry.league_id=pick.league_id
      WHERE pick.league_id=? AND entry.season_year=?`, c.league.id, snapshot.seasonYear),
    rows(c.db, `SELECT membership.user_id AS userId,membership.team_id AS teamId,user.display_name AS displayName
      FROM league_memberships membership
      INNER JOIN users user ON user.id=membership.user_id
      WHERE membership.league_id=? AND membership.active=1`, c.league.id)
  ]);
  const currentUserId = String(c.session.user.id);
  const currentEntry = entryModel(entryRows, pickRows, currentUserId, snapshot.seasonYear);
  const openWeeks = weekRows.filter(row => row.status === 'open' && cleanStage(row.stage) === 'regular')
    .map(row => Number(row.weekIndex)).sort((a,b) => a-b);
  const poolStatus = openWeeks.length ? 'open'
    : weekRows.some(row => row.status === 'final') ? 'final' : 'locked';
  return {
    ok:true, release:RELEASE,
    context:{...snapshot,stage:'regular'},
    features,
    games,
    gotw:Object.fromEntries(gotwRows.map(row => [`${cleanStage(row.stage)}:${Number(row.weekIndex)}`, row.gameId])),
    confidence:{
      season:String(snapshot.seasonYear),status:poolStatus,openWeeks,weeks:weekRows,
      entry:currentEntry,
      entries:{[currentUserId]:currentEntry},
      entryCount:new Set(entryRows.map(row => row.userId)).size,
      leaderboard:leaderboard(entryRows, pickRows, games, memberRows)
    }
  };
}

function assertSafeGameId(value) {
  const gameId = String(value || '').trim();
  if (!SAFE_GAME_ID.test(gameId)) throw Object.assign(new Error('Choose a valid matchup.'), {status:400});
  return gameId;
}

async function gameForMutation(c, snapshot, body) {
  const gameId = assertSafeGameId(body.gameId);
  const games = await activeGames(c, snapshot);
  const game = games.find(item => item.id === gameId);
  if (!game) throw Object.assign(new Error('The selected matchup is not in the active league snapshot.'), {status:409});
  return {game, games};
}

async function setGotw(c, body) {
  if (c.session.membership?.role !== 'commissioner') throw Object.assign(new Error('Commissioner access is required.'), {status:403});
  const snapshot = await activeSnapshot(c);
  const {game} = await gameForMutation(c, snapshot, body);
  const audit = createTenantAuditContext({request:c.request}, c.league, c.session, 'game_of_the_week_selected');
  await c.db.batch([
    c.db.prepare(`INSERT INTO league_game_of_week_selections
      (id,league_id,season_year,stage,week_index,game_id,source_snapshot_id,selected_by_user_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(league_id,season_year,stage,week_index) DO UPDATE SET
        game_id=excluded.game_id,source_snapshot_id=excluded.source_snapshot_id,
        selected_by_user_id=excluded.selected_by_user_id,updated_at=CURRENT_TIMESTAMP`)
      .bind(createId('gotw'),c.league.id,game.seasonYear,game.stage,game.weekIndex,game.id,
        snapshot.snapshotId,c.session.user.id),
    tenantAuditStatement(c.db,audit,{resourceType:'league_game',resourceId:game.id,
      detail:{seasonYear:game.seasonYear,stage:game.stage,weekIndex:game.weekIndex,snapshotId:snapshot.snapshotId}})
  ]);
}

async function setConfidenceWindow(c, body) {
  if (c.session.membership?.role !== 'commissioner') throw Object.assign(new Error('Commissioner access is required.'), {status:403});
  const snapshot = await activeSnapshot(c);
  const games = await activeGames(c, snapshot);
  const available = [...new Set(games.filter(game => game.stage === 'regular').map(game => game.weekIndex))].sort((a,b) => a-b);
  if (!available.length) throw Object.assign(new Error('No regular-season games are available in the active snapshot.'), {status:409});
  const start = Number(body.startWeek), end = Number(body.endWeek);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end
    || !available.includes(start) || !available.includes(end)) {
    throw Object.assign(new Error('Choose a valid first and last week from the active schedule.'), {status:400});
  }
  const audit = createTenantAuditContext({request:c.request}, c.league, c.session, 'confidence_pool_window_opened');
  const statements = [
    c.db.prepare(`UPDATE confidence_pool_weeks SET status='locked',revision=revision+1,
      locked_at=CURRENT_TIMESTAMP,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE league_id=? AND season_year=? AND stage='regular' AND status='open'`)
      .bind(c.session.user.id,c.league.id,snapshot.seasonYear)
  ];
  for (const weekIndex of available.filter(week => week >= start && week <= end)) {
    statements.push(c.db.prepare(`INSERT INTO confidence_pool_weeks
      (league_id,season_year,stage,week_index,status,revision,opened_at,updated_by_user_id,created_at,updated_at)
      VALUES (?,?,'regular',?,'open',1,CURRENT_TIMESTAMP,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(league_id,season_year,stage,week_index) DO UPDATE SET
        status='open',revision=confidence_pool_weeks.revision+1,opened_at=CURRENT_TIMESTAMP,
        locked_at=NULL,finalized_at=NULL,updated_by_user_id=excluded.updated_by_user_id,
        updated_at=CURRENT_TIMESTAMP`).bind(c.league.id,snapshot.seasonYear,weekIndex,c.session.user.id));
  }
  statements.push(tenantAuditStatement(c.db,audit,{resourceType:'confidence_pool',resourceId:String(snapshot.seasonYear),
    detail:{seasonYear:snapshot.seasonYear,stage:'regular',startWeek:start,endWeek:end}}));
  await c.db.batch(statements);
}

async function setConfidenceStatus(c, body) {
  if (c.session.membership?.role !== 'commissioner') throw Object.assign(new Error('Commissioner access is required.'), {status:403});
  const status = String(body.status || 'locked').toLowerCase();
  if (!['locked','final'].includes(status)) throw Object.assign(new Error('Confidence Pool status is invalid.'), {status:400});
  const snapshot = await activeSnapshot(c);
  const timestampColumn = status === 'final' ? 'finalized_at' : 'locked_at';
  const audit = createTenantAuditContext({request:c.request}, c.league, c.session,
    status === 'final' ? 'confidence_pool_finalized' : 'confidence_pool_locked');
  await c.db.batch([
    c.db.prepare(`UPDATE confidence_pool_weeks SET status=?,revision=revision+1,
      ${timestampColumn}=CURRENT_TIMESTAMP,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE league_id=? AND season_year=? AND stage='regular'`)
      .bind(status,c.session.user.id,c.league.id,snapshot.seasonYear),
    tenantAuditStatement(c.db,audit,{resourceType:'confidence_pool',resourceId:String(snapshot.seasonYear),
      detail:{seasonYear:snapshot.seasonYear,stage:'regular',status}})
  ]);
}

async function openEntry(c, game) {
  const week = await c.db.prepare(`SELECT status FROM confidence_pool_weeks
    WHERE league_id=? AND season_year=? AND stage=? AND week_index=? LIMIT 1`)
    .bind(c.league.id,game.seasonYear,game.stage,game.weekIndex).first();
  if (week?.status !== 'open') throw Object.assign(new Error(`Week ${game.weekIndex} is not currently open for picks.`), {status:409});
  const existing = await c.db.prepare(`SELECT id,status FROM confidence_pool_entries
    WHERE league_id=? AND season_year=? AND stage=? AND week_index=? AND user_id=? LIMIT 1`)
    .bind(c.league.id,game.seasonYear,game.stage,game.weekIndex,c.session.user.id).first();
  if (existing?.status === 'submitted') throw Object.assign(new Error(`Week ${game.weekIndex} has already been submitted.`), {status:409});
  return existing?.id || createId('confidence_entry');
}

async function savePick(c, body) {
  const snapshot = await activeSnapshot(c);
  const {game, games} = await gameForMutation(c, snapshot, body);
  const features = await featureState(c);
  if (!features.confidencePool) throw Object.assign(new Error('The Confidence Pool is disabled for this league.'), {status:409});
  const entryId = await openEntry(c, game);
  const selectedTeamId = body.selectedTeamId == null ? null : String(body.selectedTeamId).trim();
  if (selectedTeamId && (!SAFE_TEAM_ID.test(selectedTeamId)
    || ![game.homeTeamId,game.awayTeamId].includes(selectedTeamId))) {
    throw Object.assign(new Error('Choose one of the teams in this matchup.'), {status:400});
  }
  let confidenceValue = body.confidenceValue;
  if (confidenceValue === '' || confidenceValue == null) confidenceValue = null;
  else confidenceValue = Number(confidenceValue);
  const weekGameCount = games.filter(item => item.seasonYear === game.seasonYear
    && item.stage === game.stage && item.weekIndex === game.weekIndex).length;
  if (confidenceValue !== null && (!Number.isInteger(confidenceValue)
    || confidenceValue < 1 || confidenceValue > weekGameCount)) {
    throw Object.assign(new Error(`Confidence must be between 1 and ${weekGameCount}.`), {status:400});
  }
  const existingPick = await c.db.prepare(`SELECT selected_team_id AS selectedTeamId,
      confidence_value AS confidenceValue FROM confidence_pool_picks
    WHERE league_id=? AND entry_id=? AND game_id=? LIMIT 1`)
    .bind(c.league.id,entryId,game.id).first();
  const nextTeam = selectedTeamId || existingPick?.selectedTeamId || null;
  if (!nextTeam) throw Object.assign(new Error('Choose a winner before assigning confidence.'), {status:400});
  const nextConfidence = body.field === 'selection'
    ? (existingPick?.confidenceValue == null ? null : Number(existingPick.confidenceValue))
    : confidenceValue;
  const audit = createTenantAuditContext({request:c.request}, c.league, c.session, 'confidence_pool_pick_saved');
  try {
    await c.db.batch([
      c.db.prepare(`INSERT INTO confidence_pool_entries
        (id,league_id,season_year,stage,week_index,user_id,status,revision,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'draft',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(league_id,season_year,stage,week_index,user_id) DO UPDATE SET
          revision=confidence_pool_entries.revision+1,updated_at=CURRENT_TIMESTAMP`)
        .bind(entryId,c.league.id,game.seasonYear,game.stage,game.weekIndex,c.session.user.id),
      c.db.prepare(`INSERT INTO confidence_pool_picks
        (id,entry_id,league_id,game_id,selected_team_id,confidence_value,created_at,updated_at)
        VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(entry_id,game_id) DO UPDATE SET
          selected_team_id=excluded.selected_team_id,confidence_value=excluded.confidence_value,
          updated_at=CURRENT_TIMESTAMP`)
        .bind(createId('confidence_pick'),entryId,c.league.id,game.id,nextTeam,nextConfidence),
      tenantAuditStatement(c.db,audit,{resourceType:'confidence_pool_entry',resourceId:entryId,
        detail:{seasonYear:game.seasonYear,stage:game.stage,weekIndex:game.weekIndex,gameId:game.id,field:body.field || 'pick'}})
    ]);
  } catch (error) {
    if (/unique/i.test(String(error?.message || ''))) {
      throw Object.assign(new Error(`Confidence ${nextConfidence} is already used in Week ${game.weekIndex}.`), {status:409});
    }
    throw error;
  }
}

async function clearEntry(c, body, allSeason = false) {
  const snapshot = await activeSnapshot(c);
  const week = Number(body.weekIndex);
  if (!allSeason && (!Number.isInteger(week) || week < 0)) {
    throw Object.assign(new Error('Choose a valid week.'), {status:400});
  }
  if (!allSeason) {
    const row = await c.db.prepare(`SELECT status FROM confidence_pool_weeks
      WHERE league_id=? AND season_year=? AND stage='regular' AND week_index=? LIMIT 1`)
      .bind(c.league.id,snapshot.seasonYear,week).first();
    if (row?.status !== 'open') throw Object.assign(new Error(`Week ${week} is not currently open for picks.`), {status:409});
  }
  const action = allSeason ? 'confidence_pool_season_entry_cleared' : 'confidence_pool_week_entry_cleared';
  const audit = createTenantAuditContext({request:c.request}, c.league, c.session, action);
  await c.db.batch([
    allSeason
      ? c.db.prepare(`DELETE FROM confidence_pool_entries
          WHERE league_id=? AND season_year=? AND user_id=? AND status='draft'`)
          .bind(c.league.id,snapshot.seasonYear,c.session.user.id)
      : c.db.prepare(`DELETE FROM confidence_pool_entries
          WHERE league_id=? AND season_year=? AND stage='regular' AND week_index=?
            AND user_id=? AND status='draft'`)
          .bind(c.league.id,snapshot.seasonYear,week,c.session.user.id),
    tenantAuditStatement(c.db,audit,{resourceType:'confidence_pool_entry',resourceId:c.session.user.id,
      detail:{seasonYear:snapshot.seasonYear,weekIndex:allSeason ? null : week,scope:allSeason ? 'draft-season' : 'draft-week'}})
  ]);
}

async function submitEntry(c, body) {
  const snapshot = await activeSnapshot(c);
  const weekIndex = Number(body.weekIndex);
  if (!Number.isInteger(weekIndex) || weekIndex < 0) throw Object.assign(new Error('Choose a valid week.'), {status:400});
  const games = (await activeGames(c, snapshot)).filter(game => game.seasonYear === snapshot.seasonYear
    && game.stage === 'regular' && game.weekIndex === weekIndex);
  if (!games.length) throw Object.assign(new Error(`Week ${weekIndex} has no games in the active schedule.`), {status:409});
  const week = await c.db.prepare(`SELECT status FROM confidence_pool_weeks
    WHERE league_id=? AND season_year=? AND stage='regular' AND week_index=? LIMIT 1`)
    .bind(c.league.id,snapshot.seasonYear,weekIndex).first();
  if (week?.status !== 'open') throw Object.assign(new Error(`Week ${weekIndex} is not currently open for submission.`), {status:409});
  const entry = await c.db.prepare(`SELECT id,status FROM confidence_pool_entries
    WHERE league_id=? AND season_year=? AND stage='regular' AND week_index=? AND user_id=? LIMIT 1`)
    .bind(c.league.id,snapshot.seasonYear,weekIndex,c.session.user.id).first();
  if (!entry) throw Object.assign(new Error(`Complete every Week ${weekIndex} game before submitting.`), {status:409});
  if (entry.status === 'submitted') return;
  const picks = await rows(c.db, `SELECT game_id AS gameId,selected_team_id AS selectedTeamId,
      confidence_value AS confidenceValue FROM confidence_pool_picks WHERE league_id=? AND entry_id=?`, c.league.id, entry.id);
  const validGameIds = new Set(games.map(game => game.id));
  const validPicks = picks.filter(pick => validGameIds.has(pick.gameId) && pick.selectedTeamId
    && Number.isInteger(Number(pick.confidenceValue)));
  const values = validPicks.map(pick => Number(pick.confidenceValue));
  const expected = new Set(games.map((_, index) => index + 1));
  if (validPicks.length !== games.length || new Set(values).size !== games.length
    || values.some(value => !expected.has(value))) {
    throw Object.assign(new Error(`Complete every Week ${weekIndex} game and use each confidence value once.`), {status:409});
  }
  const audit = createTenantAuditContext({request:c.request}, c.league, c.session, 'confidence_pool_week_submitted');
  await c.db.batch([
    c.db.prepare(`UPDATE confidence_pool_entries SET status='submitted',revision=revision+1,
      submitted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND league_id=? AND user_id=? AND status='draft'`)
      .bind(entry.id,c.league.id,c.session.user.id),
    tenantAuditStatement(c.db,audit,{resourceType:'confidence_pool_entry',resourceId:entry.id,
      detail:{seasonYear:snapshot.seasonYear,stage:'regular',weekIndex,pickCount:validPicks.length}})
  ]);
}

export async function onRequestGet(context) {
  try {
    const c = await requestContext(context);
    if (c.response) return c.response;
    return jsonResponse(await competitionState(c));
  } catch (error) {
    return jsonResponse({ok:false,release:RELEASE,error:error?.message || 'League competition state could not be loaded.'}, Number(error?.status) || 500);
  }
}

export async function executeCompetitionAction(c, body = {}) {
  if (body.action === 'set-gotw') await setGotw(c, body);
  else if (body.action === 'open-confidence-window') await setConfidenceWindow(c, body);
  else if (body.action === 'set-confidence-status') await setConfidenceStatus(c, body);
  else if (body.action === 'save-confidence-pick') await savePick(c, body);
  else if (body.action === 'clear-confidence-week') await clearEntry(c, body, false);
  else if (body.action === 'clear-confidence-season') await clearEntry(c, body, true);
  else if (body.action === 'submit-confidence-week') await submitEntry(c, body);
  else throw Object.assign(new Error('Unknown competition action.'), {status:400});
  return {...await competitionState(c),action:body.action};
}

export async function onRequestPost(context) {
  try {
    const c = await requestContext(context);
    if (c.response) return c.response;
    const parsed = await readBody(context.request);
    if (parsed.response) return parsed.response;
    const body = parsed.body;
    return jsonResponse(await executeCompetitionAction(c,body));
  } catch (error) {
    return jsonResponse({ok:false,release:RELEASE,error:error?.message || 'League competition action failed.'}, Number(error?.status) || 500);
  }
}
