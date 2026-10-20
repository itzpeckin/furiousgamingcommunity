import { discordBotRequest, discordErrorText } from './discord-api.js';
import { discordLeagueReadModel } from './discord-read-model.js';
import { activeTeamAssignments, canonicalTeamKey, resolveTeam } from './league-teams.js';
import { snapshotCurrentPeriod } from './schedule-integrity.js';
import { automaticScheduleDecision } from './discord-schedule-transition.js';
import { createRandomToken, hashToken } from './auth.js';
import { summaryGameFinal } from '../../league-engine/game-summary.js';
import { syncDiscordGameResults } from './discord-game-results.js';
import { boundedMap } from './bounded-map.js';
import { scheduleFetch } from './discord-schedule-fetch.js';
import { coordinateDiscord, discordPacedFetch } from './discord-pacing.js';

// Preserve provider throttling as resumable progress, never a permanent conflict.
function isTransientDiscord(error){return Number(error?.status)===429||Number(error?.status)>=500||error instanceof TypeError||['AbortError','TimeoutError'].includes(error?.name);}

const SNOWFLAKE = /^[0-9]{17,20}$/;
const clean = value => String(value ?? '').trim();
const rows = async (db,sql,...values) => (await db.prepare(sql).bind(...values).all()).results || [];

export function canonicalDiscordSchedulePhase(value) {
  const stage = clean(value).toLowerCase().replace(/[_ ]+/g,'-');
  if(stage==='offseason')return 'offseason';
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

// A preseason clock stays preseason. Only a commissioner can opt this season
// into regular Week 1 scheduling, using the already-published season data.
async function seasonOpening(db,leagueId,active,installation) {
  if(snapshotCurrentPeriod(active,false)?.stage!=='preseason')return null;
  const base={snapshotId:active.id,seasonYear:active.seasonYear,ready:false,launched:false};
  if(!installation?.scheduleChannelId)return {...base,reason:'Connect Discord and choose a Scheduling Channel in League Controls → Discord Bot.'};
  const intent=await db.prepare(`SELECT run.id FROM discord_schedule_sync_runs run
    JOIN league_snapshots snapshot ON snapshot.id=run.snapshot_id AND snapshot.league_id=run.league_id
    WHERE run.league_id=? AND run.discord_guild_id=? AND run.schedule_channel_id=? AND run.season_year=?
      AND run.phase='regular-season' AND run.week_index=1 AND run.source='discord-command'
      AND json_extract(snapshot.manifest_json,'$.currentPeriod.stage')='preseason' LIMIT 1`)
    .bind(leagueId,installation.guildId,installation.scheduleChannelId,active.seasonYear).first();
  base.launched=Boolean(intent);
  let manifest={};try{manifest=JSON.parse(active.manifest_json||'{}');}catch{}
  if(manifest.currentPeriodProof?.status!=='proven')return {...base,reason:'Refresh and import verified league information first.'};
  const model=await discordLeagueReadModel({db,league:{id:leagueId}},{domains:['teams','games']});
  if(model.snapshot?.id!==active.id)return {...base,reason:'A newer import is live. Refresh before launching Week 1.'};
  const games=model.games.filter(game=>game.stage==='regular-season'&&(game.season==null||Number(game.season)===Number(active.seasonYear))&&game.week>=1&&game.week<=18);
  if(model.teams.length!==32||games.length!==272||new Set(games.map(game=>game.week)).size!==18)
    return {...base,reason:'Import the full regular-season schedule and league information first (18 weeks, 272 games).'};
  const roster=await db.prepare(`SELECT external_id FROM league_snapshot_records WHERE league_id=? AND snapshot_id=? AND domain='players'
    AND COALESCE(json_extract(data_json,'$.team_external_id'),'') NOT IN ('','0') LIMIT 1`).bind(leagueId,active.id).first();
  if(!roster)return {...base,reason:'Import Rosters and League Info before launching Week 1.'};
  return {...base,ready:true,reason:'Ready from the imported season schedule and rosters.'};
}

export async function prepareDiscordSeasonOpening(db,league,{snapshotId,requestedByUserId}={}) {
  const active=await activeSnapshot(db,league.id),installation=await activeInstallation(db,league.id);
  if(!snapshotId||active?.id!==snapshotId)throw Object.assign(new Error('A newer import is live. Refresh before launching Week 1.'),{status:409});
  const opening=await seasonOpening(db,league.id,active,installation);
  if(!opening?.ready)throw Object.assign(new Error(opening?.reason||'Early Week 1 launch is available during preseason after the season data is imported.'),{status:409});
  // This pending run is the durable, season/server/channel-scoped launch intent.
  // A failed dispatch can be retried; concurrent requests retain the same intent.
  await db.prepare(`INSERT INTO discord_schedule_sync_runs
    (id,league_id,snapshot_id,discord_guild_id,schedule_channel_id,season_year,phase,week_index,source,requested_by_user_id)
    SELECT ?,?,?,?,?,?,'regular-season',1,'discord-command',?
    WHERE EXISTS (SELECT 1 FROM league_active_snapshots WHERE league_id=? AND snapshot_id=?)
    ON CONFLICT(league_id,snapshot_id,phase,week_index,schedule_channel_id) DO NOTHING`)
    .bind(`discord_schedule_sync_${crypto.randomUUID()}`,league.id,active.id,installation.guildId,
      installation.scheduleChannelId,active.seasonYear,requestedByUserId||null,league.id,active.id).run();
  if((await activeSnapshot(db,league.id))?.id!==active.id)throw Object.assign(new Error('A newer import is live. Refresh before launching Week 1.'),{status:409});
  return opening;
}

async function canReconcileCurrent(db,leagueId,decision,active){
  let manifest={};try{manifest=JSON.parse(active?.manifest_json||'{}');}catch{}
  const period=snapshotCurrentPeriod(active,false);
  if(!period||period.stage==='offseason'||manifest.currentPeriodProof?.status!=='proven'
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

function needsPresentation(record,message,commissioners,snapshotId) {
  const cached=presentation(record),members=Array.isArray(cached.members)?cached.members:[];
  return cached.name!==message.name||[...message.ids,...commissioners].some(id=>!members.includes(id)
    &&cached.unavailable?.[id]!==snapshotId);
}

async function syncPresentation(env,db,{record,message,commissioners,leagueId,snapshotId,fetchImpl}) {
  const cached=presentation(record);
  const members=new Set(Array.isArray(cached.members)?cached.members:[]);
  cached.unavailable=cached.unavailable||{};
  const save=()=>db.prepare(`UPDATE discord_schedule_threads SET presentation_json=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND league_id=? AND status='active'`).bind(JSON.stringify({...cached,members:[...members]}),record.id,leagueId).run();
  const guard=async()=>{
    if(String((await activeSnapshot(db,leagueId))?.id)!==String(snapshotId))throw new Error('The active snapshot changed during schedule sync. Retry Schedule Sync for the current week.');
  };
  if(!needsPresentation(record,message,commissioners,snapshotId))return;
  try {
    await guard();
    // Only current active threads can be reopened. Retired history never enters this path.
    if(cached.name!==message.name){
      await discordBotRequest(env,`/channels/${encodeURIComponent(record.discord_thread_id)}`,{
        method:'PATCH',body:{name:message.name,archived:false},fetchImpl
      });
      cached.name=message.name;
    }
    for(const id of new Set([...message.ids,...commissioners])) {
      if(members.has(id)||cached.unavailable[id]===snapshotId)continue;
      await guard();
      try {
        await discordBotRequest(env,`/channels/${encodeURIComponent(record.discord_thread_id)}/thread-members/${id}`,{method:'PUT',fetchImpl});
        members.add(id);delete cached.unavailable[id];
      } catch(error) {
        // Missing/unreachable members must never prevent games from being scheduled.
        // Retry their access on the next imported snapshot; retain successful additions.
        if([10007,10013,50001].includes(Number(error.discordCode))||Number(error.status)===403){
          cached.unavailable[id]=snapshotId;continue;
        }
        throw error;
      }
    }
  } catch(error) {
    if(Number(error?.status)===403)throw new Error('Discord blocked schedule access. In the Scheduling Channel permissions, allow the bot View Channel, Read Message History, Send Messages in Threads and Manage Threads. Allow commissioners View Channel and Read Message History, then use League Controls → Discord Bot → Retry Schedule Sync.');
    throw error;
  } finally {
    // Retain completed member additions even if one member is inaccessible.
    await save();
  }
}

async function createMatchupThread(env,db,{run,league,model,game,assignments,commissioners,phase,week,fetchImpl,deferMembers=false}) {
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
    if(!deferMembers)await syncPresentation(env,db,{record,message,commissioners,leagueId:league.id,snapshotId:model.snapshot.id,fetchImpl});
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
      body:{content:message.content,allowed_mentions:message.allowedMentions,
        nonce:(await hashToken(record.id)).slice(0,24),enforce_nonce:true},
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
    // A throttle rejected the operation; probing the same starter cannot make
    // progress and would consume another request during the cooldown.
    if(Number(error?.status)===429)throw error;
    const existing = await discordBotRequest(env, `/channels/${encodeURIComponent(starterId)}`, {fetchImpl}).catch(()=>null);
    if (Number(existing?.type) !== 11) throw error;
  }
  const initialPresentation=JSON.stringify({name:message.name,members:[]});
  await db.prepare(`UPDATE discord_schedule_threads SET discord_thread_id=?,status='active',presentation_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(starterId,initialPresentation,record.id).run();
  record={...record,discord_thread_id:starterId,status:'active',presentation_json:initialPresentation};
  if(!deferMembers)await syncPresentation(env,db,{record,message,commissioners,leagueId:league.id,snapshotId:model.snapshot.id,fetchImpl});
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
  let removed=0,retryAfterSeconds=0;
  const errors=[];
  await boundedMap(prior,4,async item=>{
    if(String((await activeSnapshot(db,leagueId))?.id)!==String(snapshotId)){
      errors.push('The active snapshot changed during schedule cleanup; remaining prior threads were preserved.');
      return;
    }
    const threadId=clean(item.discordThreadId);
    if (!SNOWFLAKE.test(threadId)) {
      errors.push(`A prior FranchiseHQ schedule thread for ${item.phase} Week ${item.weekIndex} has no valid Discord thread ID.`);
      return;
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
      } else if(isTransientDiscord(error)){
        retryAfterSeconds=Math.max(retryAfterSeconds,Number(error.retryAfterSeconds)||2);
      } else {
        errors.push(Number(error?.status)===403
          ? `${item.phase} Week ${item.weekIndex}: allow the bot Manage Threads in the Scheduling Channel, then use League Controls → Discord Bot → Retry Schedule Sync. The conversation has been preserved.`
          : `${item.phase} Week ${item.weekIndex}: ${discordErrorText(error)}`);
      }
    }
  });
  const remaining=Number((await db.prepare(`SELECT COUNT(*) AS count FROM discord_schedule_threads
    WHERE league_id=? AND discord_guild_id=? AND status='active'
      AND NOT (season_year=? AND phase=? AND week_index=?)`)
    .bind(leagueId,guildId,seasonYear,phase,week).first())?.count||0);
  return {removed,errors,remaining,retryAfterSeconds};
}

export async function syncDiscordScheduleThreads(env,db,options){
  // A stable league lock also covers simultaneous workflows for different
  // snapshots, so external thread creation cannot race ahead of its checkpoint.
  const lock={credential:await hashToken(`schedule:${options.league.id}`),
    route:'schedule',owner:crypto.randomUUID()};
  const acquired=await coordinateDiscord(env,{...lock,action:'lock'});
  if(acquired&&!acquired.granted)return{ok:false,status:'running',hasMore:true,
    retryAfterSeconds:acquired.retryAfterSeconds,progressPhase:'waiting-for-current-job',errors:[]};
  try{return await syncScheduleBatch(env,db,options);}
  finally{if(acquired)await coordinateDiscord(env,{...lock,action:'unlock'}).catch(()=>{});}
}

async function syncScheduleBatch(env,db,{
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
  const waits=[];
  const checkpointStarted=Date.now();
  fetchImpl=scheduleFetch(discordPacedFetch(env,fetchImpl,{
    deadlineAt:checkpointStarted+45000,onWait:value=>{if(waits.length<20)waits.push(value);}
  }),{maxWaitMs:1000});
  fetchImpl.discordPaced=true;
  fetchImpl.discordNoInlineRetry=maxOperations!==Number.MAX_SAFE_INTEGER;
  const installation = await activeInstallation(db,league.id);
  if (!installation) return {ok:false,skipped:true,reason:'not-connected'};
  const active = await activeSnapshot(db,league.id);
  if (!active) return {ok:false,skipped:true,reason:'no-active-snapshot'};
  if(snapshotCurrentPeriod(active)?.stage==='offseason')return{ok:true,skipped:true,reason:'offseason-no-matchups'};
  if (snapshotId && String(active.id) !== String(snapshotId)) return {ok:false,skipped:true,reason:'snapshot-superseded'};
  const opening=await seasonOpening(db,league.id,active,installation);
  const earlyWeekOne=opening?.launched&&opening.ready;
  if(opening?.launched&&!opening.ready)return{ok:false,skipped:true,reason:'season-opening-data-incomplete',errors:[opening.reason]};
  if(snapshotCurrentPeriod(active)?.stage==='preseason'&&!earlyWeekOne){
    const cleanup=await archiveSupersededScheduleThreads(env,db,{leagueId:league.id,snapshotId:active.id,
      seasonYear:active.seasonYear,phase:'regular-season',week:1,guildId:installation.guildId,
      model:{games:[]},league,assignments:new Map(),fetchImpl,limit:maxOperations});
    return {ok:!cleanup.errors.length,status:cleanup.errors.length?'partial':cleanup.remaining?'running':'completed',
      hasMore:cleanup.remaining>0&&!cleanup.errors.length,retryAfterSeconds:cleanup.retryAfterSeconds,nonPlaying:true,created:0,
      archivedPriorThreads:cleanup.removed,errors:cleanup.errors,reason:'preseason-no-matchups'};
  }
  const decision=await automaticScheduleDecision(db,league.id,active);
  const recoveryAllowed=source==='rollover-recovery'&&await recoverableScheduleDecision(db,league.id,active);
  const reconcileCurrent=await canReconcileCurrent(db,league.id,decision,active);
  const presentationOnly=!earlyWeekOne&&source==='candidate-import'&&!decision.allowed&&!reconcileCurrent;
  if(source==='rollover-recovery'&&!recoveryAllowed&&!earlyWeekOne)return{ok:false,skipped:true,reason:'rollover-recovery-proof-unavailable'};
  const targetWeek = Number(week ?? (earlyWeekOne?1:active.weekIndex));
  const targetPhase = canonicalDiscordSchedulePhase(phase??(earlyWeekOne?'regular-season':snapshotCurrentPeriod(active)?.stage));
  if(earlyWeekOne&&(targetWeek!==1||targetPhase!=='regular-season'))return{ok:false,skipped:true,reason:'target-period-mismatch'};
  if(!earlyWeekOne&&source==='candidate-import'&&(targetWeek!==decision.to?.week||targetPhase!==decision.to?.stage))return{ok:false,skipped:true,reason:'target-period-mismatch'};
  if(!earlyWeekOne&&(targetWeek!==Number(active.weekIndex)||targetPhase!==snapshotCurrentPeriod(active)?.stage))return{ok:false,skipped:true,reason:'historical-schedule-read-only'};
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
    return !message||needsPresentation(record,message,commissioners,active.id);
  });
  const initialThreads=await inventory();
  const missingGames=games.filter(game=>{
    const message=gameMessage({league,model,game,assignments,phase:targetPhase,week:targetWeek});
    return !initialThreads.some(t=>t.game_external_id===game.id||(message&&t.home_team_key===scheduleTeamKey(message.teams.home)&&t.away_team_key===scheduleTeamKey(message.teams.away)));
  });
  const creationPhase=!presentationOnly&&missingGames.length>0;
  // Archive work is always attempted before member subscriptions on a new week.
  const pendingGames=creationPhase?missingGames:pending(initialThreads);
  if(presentationOnly&&!pendingGames.length)return{ok:true,skipped:true,...decision};
  const {run,reused} = await beginRun(db,{
    leagueId:league.id,snapshotId:active.id,guildId:installation.guildId,channelId:targetChannel,
    seasonYear:active.seasonYear,phase:targetPhase,week:targetWeek,
    source:source==='rollover-recovery'?'candidate-import':source,requestedByUserId
  });
  const replacesActiveSchedule=earlyWeekOne||(decision.allowed||recoveryAllowed)
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
    await db.prepare(`UPDATE discord_schedule_sync_runs SET status=?,error_count=?,last_error=?,
      completed_at=CASE WHEN ?='completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(status,cleanup.errors.length,cleanup.errors[0]||null,status,run.id).run();
    return {ok:status==='completed',status,hasMore,nonPlaying:Boolean(earlyWeekOne),
      retryAfterSeconds:cleanup.retryAfterSeconds,reused:true,week:targetWeek,phase:targetPhase,
      games:Number(run.game_count||0),threads:Number(run.thread_count||0),removedPriorThreads:cleanup.removed,archivedPriorThreads:cleanup.removed,
      errors:cleanup.errors};
  }
  const bounded=Number.isSafeInteger(maxOperations)&&maxOperations>0?maxOperations:Number.MAX_SAFE_INTEGER;
  let created = 0;
  const owners = new Set();
  const errors = [];
  let retryAfterSeconds=0;
  const batchStarted=Date.now();
  let priorityCleanup=null;
  if(!creationPhase&&replacesActiveSchedule){
    priorityCleanup=await archiveSupersededScheduleThreads(env,db,{leagueId:league.id,snapshotId:active.id,seasonYear:active.seasonYear,
      phase:targetPhase,week:targetWeek,guildId:installation.guildId,model,league,assignments,fetchImpl,limit:bounded});
    errors.push(...priorityCleanup.errors);
    retryAfterSeconds=priorityCleanup.retryAfterSeconds||0;
  }
  await boundedMap((priorityCleanup?.remaining||errors.length?[]:pendingGames).slice(0,bounded),4,async game=>{
    try {
      if(String((await activeSnapshot(db,league.id))?.id)!==String(active.id)){
        errors.push('The active snapshot changed during schedule sync; remaining threads were preserved.');
        return;
      }
      if(bounded!==Number.MAX_SAFE_INTEGER&&Date.now()-batchStarted>=30000)return;
      const result = await createMatchupThread(env,db,{run,league,model,game,assignments,commissioners,phase:targetPhase,week:targetWeek,fetchImpl,deferMembers:creationPhase});
      if (result.created) created += 1;
      result.owners.forEach(id=>owners.add(id));
    } catch (error) {
      if(isTransientDiscord(error))retryAfterSeconds=Math.max(retryAfterSeconds,Number(error.retryAfterSeconds)||2);
      else errors.push(discordErrorText(error));
    }
  });
  if(creationPhase&&bounded===Number.MAX_SAFE_INTEGER){
    await boundedMap(await inventory(),4,async record=>{
      const game=games.find(g=>g.id===record.game_external_id);
      const message=game&&gameMessage({league,model,game,assignments,phase:targetPhase,week:targetWeek});
      if(!message)return;
      try{await syncPresentation(env,db,{record,message,commissioners,leagueId:league.id,snapshotId:active.id,fetchImpl});}
      catch(error){if(isTransientDiscord(error))retryAfterSeconds=Math.max(retryAfterSeconds,Number(error.retryAfterSeconds)||2);else errors.push(discordErrorText(error));}
    });
  }
  const existingCount = Number((await db.prepare(`SELECT COUNT(*) AS count FROM discord_schedule_threads
    WHERE league_id=? AND season_year=? AND phase=? AND week_index=? AND status='active'`)
    .bind(league.id,active.seasonYear,targetPhase,targetWeek).first())?.count || 0);
  const pendingCount=pending(await inventory()).length;
  let removedPriorThreads=priorityCleanup?.removed||0,remainingPriorThreads=priorityCleanup?.remaining||0;
  if (!priorityCleanup&&!errors.length&&existingCount===games.length&&replacesActiveSchedule) {
    const stillActive=await activeSnapshot(db,league.id);
    const cleanup=String(stillActive?.id)===String(active.id)?await archiveSupersededScheduleThreads(env,db,{leagueId:league.id,snapshotId:active.id,seasonYear:active.seasonYear,
        phase:targetPhase,week:targetWeek,guildId:installation.guildId,model,league,assignments,fetchImpl,limit:bounded})
      :{removed:0,remaining:0,errors:['The active snapshot changed during schedule sync; prior threads were preserved.']};
    removedPriorThreads=cleanup.removed;
    remainingPriorThreads=cleanup.remaining;
    errors.push(...cleanup.errors);
    retryAfterSeconds=Math.max(retryAfterSeconds,cleanup.retryAfterSeconds||0);
  }
  const hasMore=!errors.length&&(pendingCount>0||remainingPriorThreads>0||retryAfterSeconds>0);
  const status = errors.length ? (existingCount ? 'partial' : 'failed') : hasMore?'running':'completed';
  let previous={};try{previous=JSON.parse(run.progress_json||'{}');}catch{}
  const ready=existingCount===games.length&&remainingPriorThreads===0&&!errors.length;
  const progress={phase:existingCount<games.length?'creating-threads':remainingPriorThreads?'archiving-threads':pendingCount?'adding-members':'completed',
    games:games.length,threadsReady:existingCount,memberThreadsRemaining:pendingCount,
    archivedThreads:Number(previous.archivedThreads||0)+removedPriorThreads,remainingPriorThreads,
    threadsCreatedAt:previous.threadsCreatedAt||(existingCount===games.length?new Date().toISOString():null),
    threadsReadyAt:previous.threadsReadyAt||(ready?new Date().toISOString():null),
    membersCompletedAt:status==='completed'?new Date().toISOString():null,
    checkpoints:Number(previous.checkpoints||0)+1,
    processingMs:Number(previous.processingMs||0)+Date.now()-checkpointStarted,
    retryWaitRequestedMs:Number(previous.retryWaitRequestedMs||0)+Math.ceil(Math.max(0,retryAfterSeconds))*1000,
    nextRetryAt:retryAfterSeconds>0?new Date(Date.now()+Math.ceil(retryAfterSeconds+1)*1000).toISOString():null,
    lastWait:waits.at(-1)||null};
  await db.prepare(`UPDATE discord_schedule_sync_runs SET status=?,game_count=?,thread_count=?,registered_owner_count=?,
    error_count=?,last_error=?,completed_at=CASE WHEN ?='completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
    progress_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(
      status,games.length,existingCount,owners.size,errors.length,errors[0]||(retryAfterSeconds>0?'Discord rate limit: scheduling will resume automatically.':null),status,JSON.stringify(progress),run.id
    ).run();
  return {ok:status==='completed',status,reused:false,nonPlaying:Boolean(earlyWeekOne),week:targetWeek,phase:targetPhase,
    games:games.length,threads:existingCount,created,removedPriorThreads,archivedPriorThreads:removedPriorThreads,remainingPriorThreads,
    hasMore,retryAfterSeconds,progressPhase:progress.phase,progress,registeredOwners:owners.size,errors};
}

export async function scheduleActiveDiscordSync(context,{db,league,snapshotId,week,requestedByUserId,requestedBySessionId,source='candidate-import'}={}) {
  let effectiveSource=source;
  if(source==='candidate-import'){
    const active=await activeSnapshot(db,league.id);
    if(!active||String(active.id)!==String(snapshotId))return{scheduled:false,reason:'snapshot-superseded'};
    if(snapshotCurrentPeriod(active)?.stage==='offseason')return{scheduled:false,status:'not-required',reason:'offseason-no-matchups'};
    const decision=await automaticScheduleDecision(db,league.id,active);
    if(!decision.allowed){
      if(await recoverableScheduleDecision(db,league.id,active))effectiveSource='rollover-recovery';
      // Same-week imports still run the durable result checkpoint.
    }
  }
  const installation = await activeInstallation(db,league.id);
  if (!installation?.scheduleChannelId) return {scheduled:false,reason:'not-connected'};
  const opening=await seasonOpening(db,league.id,await activeSnapshot(db,league.id),installation);
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
        workflowKey:`${snapshotId}:${effectiveSource}:thread-history-v2:${opening?.launched?'opening-week-one:':''}${presentationKey}`,importAuthToken:token
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
    if(!schedule.ok||schedule.hasMore||schedule.nonPlaying)return schedule;
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
  const opening=await seasonOpening(db,leagueId,active,await activeInstallation(db,leagueId));
  const row = await db.prepare(`SELECT status,season_year AS seasonYear,phase,week_index AS weekIndex,
      game_count AS gameCount,thread_count AS threadCount,registered_owner_count AS registeredOwnerCount,
      error_count AS errorCount,last_error AS lastError,progress_json AS progressJson,completed_at AS completedAt,created_at AS createdAt,updated_at AS updatedAt
    FROM discord_schedule_sync_runs WHERE league_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1`)
    .bind(leagueId).first();
  if(active){
    if(opening&&!opening.launched)return{status:'not-required',phase:'preseason',seasonYear:active.seasonYear,reason:'preseason-no-matchups',reviewRequired:false,seasonOpening:opening};
    if(snapshotCurrentPeriod(active)?.stage==='offseason')return{status:'not-required',phase:'offseason',seasonYear:active.seasonYear,reason:'offseason-no-matchups',reviewRequired:false};
    const decision=await automaticScheduleDecision(db,leagueId,active);
    const period=opening?.launched?{stage:'regular-season',week:1}:snapshotCurrentPeriod(active);
    const currentRun=row&&Number(row.seasonYear)===Number(active.seasonYear)
      &&row.phase===period?.stage&&Number(row.weekIndex)===Number(period?.week);
    if(!currentRun)return{
      status:!opening?.launched&&decision.reviewRequired?'review-required':'not-started',weekIndex:period?.week,
      seasonYear:active.seasonYear,phase:period?.stage,reason:decision.reason,
      reviewRequired:opening?.launched?false:decision.reviewRequired,transition:decision,seasonOpening:opening
    };
  }
  if(!row)return null;
  const started=Date.parse(row.createdAt||''),completed=Date.parse(row.completedAt||'');
  let progress={};try{progress=JSON.parse(row.progressJson||'{}');}catch{}
  delete row.progressJson;
  return {...row,progress,seasonOpening:opening,durationMs:Number.isFinite(started)&&Number.isFinite(completed)?Math.max(0,completed-started):null};
}
