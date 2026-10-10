import { discordBotRequest, discordErrorText } from './discord-api.js';
import { discordLeagueReadModel } from './discord-read-model.js';
import { activeTeamAssignments, canonicalTeamKey, resolveTeam } from './league-teams.js';
import { snapshotCurrentPeriod } from './schedule-integrity.js';
import { automaticScheduleDecision } from './discord-schedule-transition.js';
import { createRandomToken, hashToken } from './auth.js';
import { summaryGameFinal } from '../../league-engine/game-summary.js';
import { syncDiscordGameResults } from './discord-game-results.js';

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
    name:safeThreadName(`${summaryGameFinal(game)?'✅':'🆚'} Week ${week} - ${teams.away.displayName} vs. ${teams.home.displayName}`),
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
  return db.prepare(`SELECT snapshot.id,snapshot.season_year AS seasonYear,snapshot.week_index AS weekIndex,snapshot.manifest_json
    FROM league_active_snapshots active
    JOIN league_snapshots snapshot ON snapshot.id=active.snapshot_id AND snapshot.league_id=active.league_id
    WHERE active.league_id=? LIMIT 1`).bind(leagueId).first();
}

async function canReconcileCurrent(db,leagueId,decision,active){
  let manifest={};try{manifest=JSON.parse(active?.manifest_json||'{}');}catch{}
  const period=snapshotCurrentPeriod(active,false);
  if(!period||manifest.currentPeriodProof?.status!=='proven'
    ||!(decision.reason==='initial-import'||decision.reason==='same-week'&&!decision.reviewRequired))return false;
  const present=await db.prepare(`SELECT id FROM discord_schedule_threads WHERE league_id=?
    AND season_year=? AND phase=? AND week_index=? AND status='active' LIMIT 1`)
    .bind(leagueId,active.seasonYear,period.stage,period.week).first();
  if(!present)return true;
  return Boolean(await db.prepare(`SELECT id FROM discord_schedule_sync_runs WHERE league_id=?
    AND snapshot_id=? AND status IN ('running','partial','failed') LIMIT 1`).bind(leagueId,active.id).first());
}

async function recoverableScheduleDecision(db,leagueId,active){
  const period=snapshotCurrentPeriod(active);
  const installation=await activeInstallation(db,leagueId);
  if(!installation?.guildId)return false;
  const prior=await rows(db,`SELECT snapshot.id,snapshot.season_year AS seasonYear,
      snapshot.week_index AS weekIndex,snapshot.manifest_json
    FROM discord_schedule_sync_runs run
    JOIN league_snapshots snapshot ON snapshot.id=run.snapshot_id AND snapshot.league_id=run.league_id
    WHERE run.league_id=? AND run.discord_guild_id=? AND run.season_year=? AND run.phase=? AND run.week_index=?
      AND run.status IN ('running','partial','failed')
    ORDER BY run.created_at DESC LIMIT 20`,leagueId,installation.guildId,active.seasonYear,period?.stage,period?.week);
  for(const snapshot of prior){
    const decision=await automaticScheduleDecision(db,leagueId,snapshot);
    if(decision.allowed===true&&decision.to?.key===period?.key)return true;
  }
  return false;
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

function presentation(record) {
  try { const value=JSON.parse(record?.presentation_json||'{}');return value&&typeof value==='object'?value:{}; }
  catch { return {}; }
}

async function commissionerIds(db,leagueId) {
  return (await rows(db,`SELECT u.discord_user_id AS discordUserId FROM league_memberships lm
    JOIN users u ON u.id=lm.user_id WHERE lm.league_id=? AND lm.active=1 AND lm.role='commissioner'`,leagueId))
    .map(row=>clean(row.discordUserId)).filter(id=>SNOWFLAKE.test(id));
}

function needsPresentation(record,message,commissioners) {
  const cached=presentation(record),members=Array.isArray(cached.members)?cached.members:[];
  return cached.name!==message.name||[...message.ids,...commissioners].some(id=>!members.includes(id));
}

async function syncPresentation(env,db,{record,message,commissioners,leagueId,snapshotId,fetchImpl}) {
  const cached=presentation(record);
  const members=new Set(Array.isArray(cached.members)?cached.members:[]);
  const save=()=>db.prepare(`UPDATE discord_schedule_threads SET presentation_json=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND league_id=? AND status='active'`).bind(JSON.stringify({...cached,members:[...members]}),record.id,leagueId).run();
  const guard=async()=>{
    if(String((await activeSnapshot(db,leagueId))?.id)!==String(snapshotId))throw new Error('The active snapshot changed during schedule sync. Retry Schedule Sync for the current week.');
  };
  if(!needsPresentation(record,message,commissioners))return;
  try {
    await guard();
    // Only current active threads can be reopened. Retired history never enters this path.
    await discordBotRequest(env,`/channels/${encodeURIComponent(record.discord_thread_id)}`,{
      method:'PATCH',body:{name:message.name,archived:false},fetchImpl
    });
    cached.name=message.name;await save();
    for(const id of new Set([...message.ids,...commissioners])) {
      if(members.has(id))continue;
      await guard();
      await discordBotRequest(env,`/channels/${encodeURIComponent(record.discord_thread_id)}/thread-members/${id}`,{method:'PUT',fetchImpl});
      members.add(id);await save();
    }
  } catch(error) {
    if(Number(error?.status)===403)throw new Error('Discord blocked schedule access. In the Scheduling Channel permissions, allow the bot View Channel, Read Message History, Send Messages in Threads and Manage Threads. Allow commissioners View Channel and Read Message History, then use League Controls → Discord Bot → Retry Schedule Sync.');
    throw error;
  }
}

async function createMatchupThread(env,db,{run,league,model,game,assignments,commissioners,phase,week,fetchImpl}) {
  const message = gameMessage({league,model,game,assignments,phase,week});
  if (!message) throw new Error(`Schedule game ${game.id || 'unknown'} does not resolve to two league teams.`);
  const homeTeamKey=scheduleTeamKey(message.teams.home),awayTeamKey=scheduleTeamKey(message.teams.away);
  let record = await existingThread(db,{leagueId:league.id,seasonYear:model.snapshot.season_year,phase,week,gameId:game.id});
  if(!record)record=await existingMatchupThread(db,{leagueId:league.id,seasonYear:model.snapshot.season_year,
    phase,week,homeTeamKey,awayTeamKey});
  if(record&&(record.discord_guild_id!==run.discord_guild_id||record.parent_channel_id!==run.schedule_channel_id))
    throw new Error('This matchup is tracked in a different Discord server or channel. Restore the Schedule threads routing before retrying.');
  if(record?.status==='archived')throw new Error('This matchup is archived. Open its history from the Scheduling Channel; it will not be recreated.');
  if (record?.status === 'active' && SNOWFLAKE.test(clean(record.discord_thread_id))) {
    // Preserve the original snapshot for first-final detection when transition evidence is absent.
    await syncPresentation(env,db,{record,message,commissioners,leagueId:league.id,snapshotId:model.snapshot.id,fetchImpl});
    return {created:false,record,owners:message.ids};
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
  record={...record,discord_thread_id:starterId,status:'active'};
  await syncPresentation(env,db,{record,message,commissioners,leagueId:league.id,snapshotId:model.snapshot.id,fetchImpl});
  return {created:true,record,owners:message.ids};
}

async function archiveSupersededScheduleThreads(env,db,{
  leagueId,snapshotId,seasonYear,phase,week,guildId,model,league,assignments,fetchImpl,limit=Number.MAX_SAFE_INTEGER
}) {
  const prior = await rows(db,`SELECT id,discord_thread_id AS discordThreadId,season_year AS seasonYear,
      phase,week_index AS weekIndex,home_team_key,away_team_key,presentation_json
    FROM discord_schedule_threads
    WHERE league_id=? AND discord_guild_id=? AND status='active'
      AND NOT (season_year=? AND phase=? AND week_index=?)
    ORDER BY created_at LIMIT ?`,leagueId,guildId,seasonYear,phase,week,limit);
  let removed=0;
  const errors=[];
  for (const item of prior) {
    if(String((await activeSnapshot(db,leagueId))?.id)!==String(snapshotId)){
      errors.push('The active snapshot changed during schedule cleanup; remaining prior threads were preserved.');
      break;
    }
    const threadId=clean(item.discordThreadId);
    if (!SNOWFLAKE.test(threadId)) {
      errors.push(`A prior FranchiseHQ schedule thread for ${item.phase} Week ${item.weekIndex} has no valid Discord thread ID.`);
      continue;
    }
    try {
      const game=model.games.find(game=>Number(item.seasonYear)===Number(model.snapshot.season_year)
        &&Number(game.week)===Number(item.weekIndex)&&canonicalDiscordSchedulePhase(game.stage)===item.phase
        &&scheduleTeamKey(resolveTeam(model.teams,game.homeTeamId))===item.home_team_key
        &&scheduleTeamKey(resolveTeam(model.teams,game.awayTeamId))===item.away_team_key);
      const message=game&&gameMessage({league,model,game,assignments,phase:item.phase,week:item.weekIndex});
      const cached=presentation(item);
      // One request preserves messages, removes the active thread and prevents member replies reopening it.
      await discordBotRequest(env,`/channels/${encodeURIComponent(threadId)}`,{
        method:'PATCH',body:{archived:true,locked:true,...(message?{name:message.name}:{})},fetchImpl
      });
      await db.prepare(`UPDATE discord_schedule_threads SET status='archived',presentation_json=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND league_id=? AND status='active'`).bind(JSON.stringify({...cached,
          ...(message?{name:message.name}:{}),retirement:'archived'}),item.id,leagueId).run();
      removed+=1;
    } catch (error) {
      // A missing Discord thread is already removed. Retain its database row as
      // the authoritative audit record while closing its active lifecycle.
      if (Number(error?.status)===404) {
        await db.prepare(`UPDATE discord_schedule_threads SET status='archived',presentation_json=json_set(presentation_json,'$.retirement','missing'),updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND league_id=? AND status='active'`).bind(item.id,leagueId).run();
        removed+=1;
      } else {
        errors.push(Number(error?.status)===403
          ? `${item.phase} Week ${item.weekIndex}: allow the bot Manage Threads in the Scheduling Channel, then use League Controls → Discord Bot → Retry Schedule Sync. The conversation has been preserved.`
          : `${item.phase} Week ${item.weekIndex}: ${discordErrorText(error)}`);
      }
    }
  }
  const remaining=Number((await db.prepare(`SELECT COUNT(*) AS count FROM discord_schedule_threads
    WHERE league_id=? AND discord_guild_id=? AND status='active'
      AND NOT (season_year=? AND phase=? AND week_index=?)`)
    .bind(leagueId,guildId,seasonYear,phase,week).first())?.count||0);
  return {removed,errors,remaining};
}

export async function syncDiscordScheduleThreads(env,db,{
  league,
  snapshotId = null,
  week = null,
  phase = null,
  channelId = null,
  source = 'candidate-import',
  requestedByUserId = null,
  maxOperations = Number.MAX_SAFE_INTEGER,
  fetchImpl = fetch
}) {
  const installation = await activeInstallation(db,league.id);
  if (!installation) return {ok:false,skipped:true,reason:'not-connected'};
  const active = await activeSnapshot(db,league.id);
  if (!active) return {ok:false,skipped:true,reason:'no-active-snapshot'};
  if (snapshotId && String(active.id) !== String(snapshotId)) return {ok:false,skipped:true,reason:'snapshot-superseded'};
  const decision=await automaticScheduleDecision(db,league.id,active);
  const recoveryAllowed=source==='rollover-recovery'&&await recoverableScheduleDecision(db,league.id,active);
  const reconcileCurrent=await canReconcileCurrent(db,league.id,decision,active);
  const presentationOnly=source==='candidate-import'&&!decision.allowed&&!reconcileCurrent;
  if(source==='rollover-recovery'&&!recoveryAllowed)return{ok:false,skipped:true,reason:'rollover-recovery-proof-unavailable'};
  const targetWeek = Number(week ?? active.weekIndex);
  const targetPhase = canonicalDiscordSchedulePhase(phase??snapshotCurrentPeriod(active)?.stage);
  if(source==='candidate-import'&&(targetWeek!==decision.to?.week||targetPhase!==decision.to?.stage))return{ok:false,skipped:true,reason:'target-period-mismatch'};
  if(targetWeek!==Number(active.weekIndex)||targetPhase!==snapshotCurrentPeriod(active)?.stage)return{ok:false,skipped:true,reason:'historical-schedule-read-only'};
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
  if(String(active.id)!==String(model.snapshot.id))return{ok:false,skipped:true,reason:'snapshot-superseded'};
  const assignments=await activeTeamAssignments(db,league.id,model.teams);
  const commissioners=await commissionerIds(db,league.id);
  const inventory=()=>rows(db,`SELECT * FROM discord_schedule_threads WHERE league_id=? AND discord_guild_id=?
    AND parent_channel_id=? AND season_year=? AND phase=? AND week_index=? AND status='active'`,
    league.id,installation.guildId,targetChannel,active.seasonYear,targetPhase,targetWeek);
  const pending=(threads)=>games.filter(game=>{
    const message=gameMessage({league,model,game,assignments,phase:targetPhase,week:targetWeek});
    const record=threads.find(thread=>thread.game_external_id===game.id||(message
      &&thread.home_team_key===scheduleTeamKey(message.teams.home)&&thread.away_team_key===scheduleTeamKey(message.teams.away)));
    if(!record)return !presentationOnly;
    return !message||needsPresentation(record,message,commissioners);
  });
  const pendingGames=pending(await inventory());
  if(presentationOnly&&!pendingGames.length)return{ok:true,skipped:true,...decision};
  const {run,reused} = await beginRun(db,{
    leagueId:league.id,snapshotId:active.id,guildId:installation.guildId,channelId:targetChannel,
    seasonYear:active.seasonYear,phase:targetPhase,week:targetWeek,
    source:source==='rollover-recovery'?'candidate-import':source,requestedByUserId
  });
  const replacesActiveSchedule=(decision.allowed||recoveryAllowed)
    &&targetWeek===Number(active.weekIndex)
    &&targetPhase===snapshotCurrentPeriod(active)?.stage
    &&String(active.id)===String(model.snapshot.id);
  if (reused&&!pendingGames.length) {
    const stillActive=await activeSnapshot(db,league.id);
    const cleanup=replacesActiveSchedule&&String(stillActive?.id)===String(active.id)
      ?await archiveSupersededScheduleThreads(env,db,{leagueId:league.id,snapshotId:active.id,seasonYear:active.seasonYear,
        phase:targetPhase,week:targetWeek,guildId:installation.guildId,model,league,assignments,fetchImpl,limit:maxOperations})
      :{removed:0,remaining:0,errors:[]};
    const hasMore=cleanup.remaining>0&&cleanup.errors.length===0;
    const status=cleanup.errors.length?'partial':hasMore?'running':'completed';
    if(status!=='completed')await db.prepare(`UPDATE discord_schedule_sync_runs SET status=?,error_count=?,last_error=?,
      updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,cleanup.errors.length,cleanup.errors[0]||null,run.id).run();
    return {ok:status==='completed',status,hasMore,
      reused:true,week:targetWeek,phase:targetPhase,
      games:Number(run.game_count||0),threads:Number(run.thread_count||0),removedPriorThreads:cleanup.removed,archivedPriorThreads:cleanup.removed,
      errors:cleanup.errors};
  }
  const bounded=Number.isSafeInteger(maxOperations)&&maxOperations>0?maxOperations:Number.MAX_SAFE_INTEGER;
  let created = 0;
  const owners = new Set();
  const errors = [];
  const batchStarted=Date.now();
  for (const game of pendingGames.slice(0,bounded)) {
    try {
      if(String((await activeSnapshot(db,league.id))?.id)!==String(active.id)){
        errors.push('The active snapshot changed during schedule sync; remaining threads were preserved.');
        break;
      }
      if(bounded!==Number.MAX_SAFE_INTEGER&&Date.now()-batchStarted>=30000)break;
      const result = await createMatchupThread(env,db,{run,league,model,game,assignments,commissioners,phase:targetPhase,week:targetWeek,fetchImpl});
      if (result.created) created += 1;
      result.owners.forEach(id=>owners.add(id));
    } catch (error) {
      errors.push(discordErrorText(error));
    }
  }
  const existingCount = Number((await db.prepare(`SELECT COUNT(*) AS count FROM discord_schedule_threads
    WHERE league_id=? AND season_year=? AND phase=? AND week_index=? AND status='active'`)
    .bind(league.id,active.seasonYear,targetPhase,targetWeek).first())?.count || 0);
  const pendingCount=pending(await inventory()).length;
  let removedPriorThreads=0,remainingPriorThreads=0;
  if (!errors.length&&!pendingCount&&existingCount===games.length&&replacesActiveSchedule) {
    const stillActive=await activeSnapshot(db,league.id);
    const cleanup=String(stillActive?.id)===String(active.id)?await archiveSupersededScheduleThreads(env,db,{leagueId:league.id,snapshotId:active.id,seasonYear:active.seasonYear,
        phase:targetPhase,week:targetWeek,guildId:installation.guildId,model,league,assignments,fetchImpl,limit:bounded})
      :{removed:0,remaining:0,errors:['The active snapshot changed during schedule sync; prior threads were preserved.']};
    removedPriorThreads=cleanup.removed;
    remainingPriorThreads=cleanup.remaining;
    errors.push(...cleanup.errors);
  }
  const hasMore=!errors.length&&(pendingCount>0||remainingPriorThreads>0);
  const status = errors.length ? (existingCount ? 'partial' : 'failed') : hasMore?'running':'completed';
  await db.prepare(`UPDATE discord_schedule_sync_runs SET status=?,game_count=?,thread_count=?,registered_owner_count=?,
    error_count=?,last_error=?,completed_at=CASE WHEN ?='completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
    updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(
      status,games.length,existingCount,owners.size,errors.length,errors[0]||null,status,run.id
    ).run();
  return {ok:status==='completed',status,reused:false,week:targetWeek,phase:targetPhase,
    games:games.length,threads:existingCount,created,removedPriorThreads,archivedPriorThreads:removedPriorThreads,remainingPriorThreads,
    hasMore,registeredOwners:owners.size,errors};
}

export async function scheduleActiveDiscordSync(context,{db,league,snapshotId,week,requestedByUserId,requestedBySessionId,source='candidate-import'}={}) {
  let effectiveSource=source;
  if(source==='candidate-import'){
    const active=await activeSnapshot(db,league.id);
    if(!active||String(active.id)!==String(snapshotId))return{scheduled:false,reason:'snapshot-superseded'};
    const decision=await automaticScheduleDecision(db,league.id,active);
    if(!decision.allowed){
      if(await recoverableScheduleDecision(db,league.id,active))effectiveSource='rollover-recovery';
      // Same-week imports still run the durable result checkpoint.
    }
  }
  const installation = await activeInstallation(db,league.id);
  if (!installation?.scheduleChannelId) return {scheduled:false,reason:'not-connected'};
  const binding=context.env?.FRANCHISE_IMPORT_WORKER;
  if(binding&&requestedBySessionId){
    // A completed pre-upgrade workflow must not swallow the new presentation work.
    // Membership/routing changes get a new deterministic job; ordinary retries reuse it.
    const members=await rows(db,`SELECT lm.role,lm.team_id,u.discord_user_id FROM league_memberships lm
      JOIN users u ON u.id=lm.user_id WHERE lm.league_id=? AND lm.active=1
        AND (lm.role='commissioner' OR lm.team_id IS NOT NULL) AND u.discord_user_id IS NOT NULL
      ORDER BY lm.user_id`,league.id);
    const presentationKey=await hashToken(JSON.stringify([installation.guildId,installation.scheduleChannelId,members]));
    const token=createRandomToken(32),tokenHash=await hashToken(token);
    await db.prepare(`INSERT INTO server_import_delegations (token_hash,session_id,league_id,expires_at)
      VALUES (?,?,?,?)`).bind(tokenHash,requestedBySessionId,league.id,
      new Date(Date.now()+30*60*1000).toISOString()).run();
    const origin=new URL(context.request.url).origin;
    const response=await binding.fetch('https://franchise-import.internal/schedule/start',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        leagueSlug:league.slug,origin,snapshotId,source:effectiveSource,
        workflowKey:`${snapshotId}:${effectiveSource}:thread-history-v1:${presentationKey}`,importAuthToken:token
      })
    }).catch(()=>null);
    if(!response)return{scheduled:false,reason:'durable-schedule-start-failed',
      detail:'Discord scheduling is temporarily unavailable. In League Controls → Discord Bot, select Retry Schedule Sync.'};
    const result=await response.json().catch(()=>({}));
    return response.ok&&result.ok?{scheduled:true,durable:true,workflowId:result.id,source:effectiveSource}
      :{scheduled:false,reason:'durable-schedule-start-failed',detail:result.error||`HTTP ${response.status}`};
  }
  const work = (async()=>{
    const schedule=await syncDiscordScheduleThreads(context.env,db,{
      league,snapshotId,week,channelId:installation.scheduleChannelId,requestedByUserId,source:effectiveSource
    });
    if(!schedule.ok||schedule.hasMore)return schedule;
    const results=await syncDiscordGameResults(context.env,db,{league,snapshotId,maxOperations:32});
    return {...schedule,results};
  })();
  const owner=typeof context.waitUntil==='function'?context:context.executionContext;
  if (typeof owner?.waitUntil === 'function') {
    owner.waitUntil(work.catch(error=>console.error('Discord schedule sync failed:',discordErrorText(error))));
    return {scheduled:true};
  }
  return work;
}

export async function latestDiscordScheduleSync(db,leagueId) {
  const active=await activeSnapshot(db,leagueId);
  const row = await db.prepare(`SELECT status,season_year AS seasonYear,phase,week_index AS weekIndex,
      game_count AS gameCount,thread_count AS threadCount,registered_owner_count AS registeredOwnerCount,
      error_count AS errorCount,last_error AS lastError,completed_at AS completedAt,created_at AS createdAt,updated_at AS updatedAt
    FROM discord_schedule_sync_runs WHERE league_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1`)
    .bind(leagueId).first();
  if(active){
    const decision=await automaticScheduleDecision(db,leagueId,active);
    const period=snapshotCurrentPeriod(active);
    const currentRun=row&&Number(row.seasonYear)===Number(active.seasonYear)
      &&row.phase===period?.stage&&Number(row.weekIndex)===Number(period?.week);
    if(!currentRun)return{
      status:decision.reviewRequired?'review-required':'not-started',weekIndex:period?.week,
      seasonYear:active.seasonYear,phase:period?.stage,reason:decision.reason,
      reviewRequired:decision.reviewRequired,transition:decision
    };
  }
  if(!row)return null;
  const started=Date.parse(row.createdAt||''),completed=Date.parse(row.completedAt||'');
  return {...row,durationMs:Number.isFinite(started)&&Number.isFinite(completed)?Math.max(0,completed-started):null};
}
