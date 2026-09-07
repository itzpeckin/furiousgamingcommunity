import { discordBotRequest, discordErrorText } from './discord-api.js';
import { discordLeagueReadModel } from './discord-read-model.js';
import { activeTeamAssignments, canonicalTeamKey, resolveTeam } from './league-teams.js';

const SNOWFLAKE = /^[0-9]{17,20}$/;
const clean = value => String(value ?? '').trim();
const rows = async (db,sql,...values) => (await db.prepare(sql).bind(...values).all()).results || [];

export function canonicalDiscordSchedulePhase(value) {
  const stage = clean(value).toLowerCase().replace(/[_ ]+/g,'-');
  if (['pre','preseason','pre-season'].includes(stage)) return 'preseason';
  if (['post','postseason','post-season','playoff','playoffs'].includes(stage)) return 'playoffs';
  return 'regular-season';
}

function safeThreadName(value) {
  return clean(value).replace(/[\r\n\t]+/g,' ').slice(0,100) || 'FranchiseHQ matchup';
}

function matchup(model, game) {
  const home = resolveTeam(model.teams,game.homeTeamId);
  const away = resolveTeam(model.teams,game.awayTeamId);
  if (!home || !away) return null;
  return {home,away};
}

function scheduleTeamKey(team) {
  return canonicalTeamKey(team?.teamKey || team?.abbreviation || team?.id || team?.externalId);
}

function ownerMention(assignment) {
  return SNOWFLAKE.test(clean(assignment?.discordUserId)) ? `<@${assignment.discordUserId}>` : 'Unassigned';
}

function gameMessage({league,model,game,assignments,phase,week}) {
  const teams = matchup(model,game);
  if (!teams) return null;
  const homeOwner = assignments.get(scheduleTeamKey(teams.home));
  const awayOwner = assignments.get(scheduleTeamKey(teams.away));
  const ids = [...new Set([homeOwner?.discordUserId,awayOwner?.discordUserId].map(clean).filter(id=>SNOWFLAKE.test(id)))];
  const phaseLabel = phase === 'preseason' ? 'Preseason' : phase === 'playoffs' ? 'Playoffs' : 'Regular Season';
  const site = `https://franchisehq.app/leagues/${encodeURIComponent(league.slug)}#schedule`;
  return {
    name:safeThreadName(`${phaseLabel} Week ${week} · ${teams.away.abbreviation || teams.away.displayName} at ${teams.home.abbreviation || teams.home.displayName}`),
    content:[
      `**${league.name} · ${phaseLabel} Week ${week}**`,
      `**${teams.away.displayName} at ${teams.home.displayName}**`,
      `${ownerMention(awayOwner)} vs ${ownerMention(homeOwner)}`,
      game.scheduledAt ? `Scheduled: ${game.scheduledAt}` : null,
      `[Open the league schedule](${site})`
    ].filter(Boolean).join('\n').slice(0,2000),
    allowedMentions:{parse:[],users:ids},
    teams,
    homeOwner,
    awayOwner,
    ids
  };
}

async function activeInstallation(db,leagueId) {
  return db.prepare(`SELECT id,discord_guild_id AS guildId,schedule_channel_id AS scheduleChannelId
    FROM discord_league_installations WHERE league_id=? AND status='active' LIMIT 1`).bind(leagueId).first();
}

async function activeSnapshot(db,leagueId) {
  return db.prepare(`SELECT snapshot.id,snapshot.season_year AS seasonYear,snapshot.week_index AS weekIndex
    FROM league_active_snapshots active
    JOIN league_snapshots snapshot ON snapshot.id=active.snapshot_id AND snapshot.league_id=active.league_id
    WHERE active.league_id=? LIMIT 1`).bind(leagueId).first();
}

async function beginRun(db,{leagueId,snapshotId,guildId,channelId,seasonYear,phase,week,source,requestedByUserId}) {
  let run = await db.prepare(`SELECT * FROM discord_schedule_sync_runs
    WHERE league_id=? AND snapshot_id=? AND phase=? AND week_index=? AND schedule_channel_id=? LIMIT 1`)
    .bind(leagueId,snapshotId,phase,week,channelId).first();
  if (run?.status === 'completed') return {run,reused:true};
  if (!run) {
    const id = `discord_schedule_sync_${crypto.randomUUID()}`;
    await db.prepare(`INSERT INTO discord_schedule_sync_runs
      (id,league_id,snapshot_id,discord_guild_id,schedule_channel_id,season_year,phase,week_index,source,requested_by_user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,leagueId,snapshotId,guildId,channelId,seasonYear,phase,week,source,requestedByUserId||null).run();
    run = await db.prepare(`SELECT * FROM discord_schedule_sync_runs WHERE id=?`).bind(id).first();
  }
  await db.prepare(`UPDATE discord_schedule_sync_runs SET status='running',started_at=COALESCE(started_at,CURRENT_TIMESTAMP),
    last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(run.id).run();
  return {run:{...run,status:'running'},reused:false};
}

async function existingThread(db,{leagueId,seasonYear,phase,week,gameId}) {
  return db.prepare(`SELECT * FROM discord_schedule_threads
    WHERE league_id=? AND season_year=? AND phase=? AND week_index=? AND game_external_id=? LIMIT 1`)
    .bind(leagueId,seasonYear,phase,week,gameId).first();
}

async function existingMatchupThread(db,{leagueId,seasonYear,phase,week,homeTeamKey,awayTeamKey}) {
  return db.prepare(`SELECT * FROM discord_schedule_threads
    WHERE league_id=? AND season_year=? AND phase=? AND week_index=?
      AND home_team_key=? AND away_team_key=?
    ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'creating' THEN 1 ELSE 2 END,created_at DESC
    LIMIT 1`).bind(leagueId,seasonYear,phase,week,homeTeamKey,awayTeamKey).first();
}

async function createMatchupThread(env,db,{run,league,model,game,assignments,phase,week,fetchImpl}) {
  const message = gameMessage({league,model,game,assignments,phase,week});
  if (!message) throw new Error(`Schedule game ${game.id || 'unknown'} does not resolve to two league teams.`);
  const homeTeamKey=scheduleTeamKey(message.teams.home),awayTeamKey=scheduleTeamKey(message.teams.away);
  let record = await existingThread(db,{leagueId:league.id,seasonYear:model.snapshot.season_year,phase,week,gameId:game.id});
  if(!record)record=await existingMatchupThread(db,{leagueId:league.id,seasonYear:model.snapshot.season_year,
    phase,week,homeTeamKey,awayTeamKey});
  if (record?.status === 'active' && SNOWFLAKE.test(clean(record.discord_thread_id))) {
    await db.prepare(`UPDATE discord_schedule_threads SET snapshot_id=?,sync_run_id=?,game_external_id=?,
      home_discord_user_id=?,away_discord_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(
        model.snapshot.id,run.id,game.id,message.homeOwner?.discordUserId||null,message.awayOwner?.discordUserId||null,record.id
      ).run();
    return {created:false,record:{...record,game_external_id:game.id},owners:message.ids};
  }
  if (!record) {
    const id = `discord_schedule_thread_${crypto.randomUUID()}`;
    await db.prepare(`INSERT OR IGNORE INTO discord_schedule_threads
      (id,league_id,snapshot_id,sync_run_id,discord_guild_id,parent_channel_id,game_external_id,
       season_year,phase,week_index,home_team_key,away_team_key,home_discord_user_id,away_discord_user_id,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'creating')`).bind(
        id,league.id,model.snapshot.id,run.id,run.discord_guild_id,run.schedule_channel_id,game.id,
        model.snapshot.season_year,phase,week,homeTeamKey,awayTeamKey,
        message.homeOwner?.discordUserId||null,message.awayOwner?.discordUserId||null
      ).run();
    record = await existingThread(db,{leagueId:league.id,seasonYear:model.snapshot.season_year,phase,week,gameId:game.id});
  }
  let starterId = clean(record?.starter_message_id);
  if (!SNOWFLAKE.test(starterId)) {
    const starter = await discordBotRequest(env, `/channels/${encodeURIComponent(run.schedule_channel_id)}/messages`, {
      method:'POST',
      body:{content:message.content,allowed_mentions:message.allowedMentions},
      fetchImpl
    });
    starterId = clean(starter?.id);
    if (!SNOWFLAKE.test(starterId)) throw new Error('Discord did not return the matchup starter message.');
    await db.prepare(`UPDATE discord_schedule_threads SET starter_message_id=?,discord_thread_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(starterId,starterId,record.id).run();
  }
  try {
    await discordBotRequest(env, `/channels/${encodeURIComponent(run.schedule_channel_id)}/messages/${encodeURIComponent(starterId)}/threads`, {
      method:'POST', body:{name:message.name,auto_archive_duration:10080}, fetchImpl
    });
  } catch (error) {
    const existing = await discordBotRequest(env, `/channels/${encodeURIComponent(starterId)}`, {fetchImpl}).catch(()=>null);
    if (Number(existing?.type) !== 11) throw error;
  }
  await db.prepare(`UPDATE discord_schedule_threads SET discord_thread_id=?,status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(starterId,record.id).run();
  return {created:true,record:{...record,discord_thread_id:starterId,status:'active'},owners:message.ids};
}

async function removeSupersededScheduleThreads(env,db,{
  leagueId,seasonYear,phase,week,guildId,fetchImpl
}) {
  const prior = await rows(db,`SELECT id,discord_thread_id AS discordThreadId,season_year AS seasonYear,
      phase,week_index AS weekIndex
    FROM discord_schedule_threads
    WHERE league_id=? AND discord_guild_id=? AND status='active'
      AND NOT (season_year=? AND phase=? AND week_index=?)
    ORDER BY created_at`,leagueId,guildId,seasonYear,phase,week);
  let removed=0;
  const errors=[];
  for (const item of prior) {
    const threadId=clean(item.discordThreadId);
    if (!SNOWFLAKE.test(threadId)) {
      errors.push(`A prior FranchiseHQ schedule thread for ${item.phase} Week ${item.weekIndex} has no valid Discord thread ID.`);
      continue;
    }
    try {
      await discordBotRequest(env,`/channels/${encodeURIComponent(threadId)}`,{method:'DELETE',fetchImpl});
      await db.prepare(`UPDATE discord_schedule_threads SET status='archived',updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND league_id=? AND status='active'`).bind(item.id,leagueId).run();
      removed+=1;
    } catch (error) {
      // A missing Discord thread is already removed. Retain its database row as
      // the authoritative audit record while closing its active lifecycle.
      if (Number(error?.status)===404) {
        await db.prepare(`UPDATE discord_schedule_threads SET status='archived',updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND league_id=? AND status='active'`).bind(item.id,leagueId).run();
        removed+=1;
      } else {
        errors.push(`${item.phase} Week ${item.weekIndex}: ${discordErrorText(error)}`);
      }
    }
  }
  return {removed,errors};
}

export async function syncDiscordScheduleThreads(env,db,{
  league,
  snapshotId = null,
  week = null,
  phase = 'regular-season',
  channelId = null,
  source = 'candidate-import',
  requestedByUserId = null,
  fetchImpl = fetch
}) {
  const installation = await activeInstallation(db,league.id);
  if (!installation) return {ok:false,skipped:true,reason:'not-connected'};
  const active = await activeSnapshot(db,league.id);
  if (!active) return {ok:false,skipped:true,reason:'no-active-snapshot'};
  if (snapshotId && String(active.id) !== String(snapshotId)) return {ok:false,skipped:true,reason:'snapshot-superseded'};
  const targetWeek = Number(week ?? active.weekIndex);
  const targetPhase = canonicalDiscordSchedulePhase(phase);
  const targetChannel = clean(channelId || installation.scheduleChannelId);
  if (!Number.isInteger(targetWeek) || targetWeek < 1 || !SNOWFLAKE.test(targetChannel)) {
    return {ok:false,skipped:true,reason:'schedule-channel-or-week-unavailable'};
  }
  if (targetChannel !== clean(installation.scheduleChannelId)) {
    await db.prepare(`UPDATE discord_league_installations SET schedule_channel_id=?,updated_at=CURRENT_TIMESTAMP WHERE league_id=?`)
      .bind(targetChannel,league.id).run();
  }
  const model = await discordLeagueReadModel({db,league},{domains:['teams','games']});
  const games = model.games.filter(game => Number(game.week) === targetWeek
    && canonicalDiscordSchedulePhase(game.stage) === targetPhase);
  if (!games.length) return {ok:false,skipped:true,reason:'no-games-for-week',week:targetWeek,phase:targetPhase};
  const {run,reused} = await beginRun(db,{
    leagueId:league.id,snapshotId:active.id,guildId:installation.guildId,channelId:targetChannel,
    seasonYear:active.seasonYear,phase:targetPhase,week:targetWeek,source,requestedByUserId
  });
  const replacesActiveSchedule=source==='candidate-import'
    &&targetWeek===Number(active.weekIndex)
    &&String(active.id)===String(model.snapshot.id);
  if (reused) {
    const cleanup=replacesActiveSchedule
      ?await removeSupersededScheduleThreads(env,db,{leagueId:league.id,seasonYear:active.seasonYear,
        phase:targetPhase,week:targetWeek,guildId:installation.guildId,fetchImpl})
      :{removed:0,errors:[]};
    return {ok:cleanup.errors.length===0,reused:true,week:targetWeek,phase:targetPhase,
      games:Number(run.game_count||0),threads:Number(run.thread_count||0),removedPriorThreads:cleanup.removed,
      errors:cleanup.errors};
  }
  const assignments = await activeTeamAssignments(db,league.id);
  let created = 0;
  const owners = new Set();
  const errors = [];
  for (const game of games) {
    try {
      const result = await createMatchupThread(env,db,{run,league,model,game,assignments,phase:targetPhase,week:targetWeek,fetchImpl});
      if (result.created) created += 1;
      result.owners.forEach(id=>owners.add(id));
    } catch (error) {
      errors.push(discordErrorText(error));
    }
  }
  const existingCount = Number((await db.prepare(`SELECT COUNT(*) AS count FROM discord_schedule_threads
    WHERE league_id=? AND season_year=? AND phase=? AND week_index=? AND status='active'`)
    .bind(league.id,active.seasonYear,targetPhase,targetWeek).first())?.count || 0);
  let removedPriorThreads=0;
  if (!errors.length&&existingCount===games.length&&replacesActiveSchedule) {
    const cleanup=await removeSupersededScheduleThreads(env,db,{leagueId:league.id,seasonYear:active.seasonYear,
      phase:targetPhase,week:targetWeek,guildId:installation.guildId,fetchImpl});
    removedPriorThreads=cleanup.removed;
    errors.push(...cleanup.errors);
  }
  const status = errors.length ? (existingCount ? 'partial' : 'failed') : 'completed';
  await db.prepare(`UPDATE discord_schedule_sync_runs SET status=?,game_count=?,thread_count=?,registered_owner_count=?,
    error_count=?,last_error=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(
      status,games.length,existingCount,owners.size,errors.length,errors[0]||null,run.id
    ).run();
  return {ok:status==='completed',status,reused:false,week:targetWeek,phase:targetPhase,
    games:games.length,threads:existingCount,created,removedPriorThreads,registeredOwners:owners.size,errors};
}

export async function scheduleActiveDiscordSync(context,{db,league,snapshotId,week,requestedByUserId,source='candidate-import'}={}) {
  const installation = await activeInstallation(db,league.id);
  if (!installation?.scheduleChannelId) return {scheduled:false,reason:'not-connected'};
  const work = syncDiscordScheduleThreads(context.env,db,{
    league,snapshotId,week,channelId:installation.scheduleChannelId,requestedByUserId,source
  });
  const waitUntil = context.waitUntil || context.executionContext?.waitUntil;
  if (typeof waitUntil === 'function') {
    waitUntil.call(context.executionContext || context,work.catch(error=>console.error('Discord schedule sync failed:',discordErrorText(error))));
    return {scheduled:true};
  }
  return work;
}

export async function latestDiscordScheduleSync(db,leagueId) {
  const row = await db.prepare(`SELECT status,season_year AS seasonYear,phase,week_index AS weekIndex,
      game_count AS gameCount,thread_count AS threadCount,registered_owner_count AS registeredOwnerCount,
      error_count AS errorCount,last_error AS lastError,completed_at AS completedAt,created_at AS createdAt
    FROM discord_schedule_sync_runs WHERE league_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1`)
    .bind(leagueId).first();
  return row || null;
}
