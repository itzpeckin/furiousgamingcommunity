import { discordLeagueReadModel } from './discord-read-model.js';
import { gameCardMessage, gameSummaryDetails } from './discord-game.js';
import { resolveTeam } from './league-teams.js';
import { summaryGameFinal, summaryStage } from '../../league-engine/game-summary.js';
import { normalizeGame } from '../api/leagues/[leagueSlug]/snapshot/read-model.js';
import { discordBotRequest, discordErrorText } from './discord-api.js';
import { automaticScheduleDecision } from './discord-schedule-transition.js';
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const matches=(model,thread,game)=>Number(game.week)===Number(thread.week_index)&&summaryStage(game.stage)===thread.phase
  &&resolveTeam(model.teams,game.homeTeamId)?.teamKey===thread.home_team_key
  &&resolveTeam(model.teams,game.awayTeamId)?.teamKey===thread.away_team_key;

export async function syncDiscordGameResults(env,db,{league,snapshotId,maxOperations=1,fetchImpl=fetch}={}){
  const active=await db.prepare('SELECT snapshot_id FROM league_active_snapshots WHERE league_id=?').bind(league.id).first();
  if(active?.snapshot_id!==snapshotId)return {ok:true,status:'completed',superseded:true};
  const model=await discordLeagueReadModel({db,league},{domains:['teams','games']});
  if((await automaticScheduleDecision(db,league.id,model.snapshot)).allowed){
    return {ok:true,status:'completed',hasMore:false,resultMessages:0,skipped:true,reason:'week-advance'};
  }
  let previousSnapshotId=null;
  try{previousSnapshotId=JSON.parse(model.snapshot.manifest_json||'{}').discordScheduleTransition?.sourceSnapshotId||null;}catch{}
  const threads=await rows(db,`SELECT thread.*,result.message_id,result.payload_hash,result.nonce,result.lease_until
    FROM discord_schedule_threads thread
    JOIN discord_league_installations installation ON installation.league_id=thread.league_id
      AND installation.discord_guild_id=thread.discord_guild_id AND installation.status='active'
    LEFT JOIN discord_game_results result ON result.thread_record_id=thread.id AND result.league_id=thread.league_id
    WHERE thread.league_id=? AND thread.season_year=? AND thread.status='active'
    ORDER BY thread.week_index,thread.id`,league.id,model.snapshot.season_year);
  let operations=0,hasMore=false;
  for(const thread of threads){
    if(!/^[0-9]{17,20}$/.test(thread.discord_thread_id||''))continue;
    const game=model.games.find(g=>matches(model,thread,g));
    if(!game||!summaryGameFinal(game))continue;
    if(!thread.nonce){
      // Compare with the thread's last imported schedule. Do not announce a
      // historical final merely because this feature was deployed or a thread created.
      const priorSnapshotId=previousSnapshotId||thread.snapshot_id;
      if(!priorSnapshotId||priorSnapshotId===snapshotId)continue;
      const previous=await rows(db,`SELECT data_json FROM league_snapshot_records
        WHERE league_id=? AND snapshot_id=? AND domain='games'`,league.id,priorSnapshotId);
      const prior=previous.map(row=>normalizeGame(JSON.parse(row.data_json))).find(g=>matches(model,thread,g));
      if(!prior||summaryGameFinal(prior))continue;
    }
    await gameSummaryDetails({db,league},model,game);
    // Ownership is identical for every game in this snapshot. Resolve it once
    // per checkpoint, rather than repeating the same queries for each result.
    const message=await gameCardMessage({db,league,env},model,game),payloadHash=await hash(JSON.stringify(message));
    if(thread.message_id&&thread.payload_hash===payloadHash)continue;
    if(operations>=maxOperations){hasMore=true;break;}
    const nonce=(await hash(`game-result:${league.id}:${thread.id}`)).slice(0,24);
    await db.prepare(`INSERT OR IGNORE INTO discord_game_results(thread_record_id,league_id,snapshot_id,nonce)
      VALUES (?,?,?,?)`).bind(thread.id,league.id,snapshotId,nonce).run();
    const lease=crypto.randomUUID();
    const claimed=await db.prepare(`UPDATE discord_game_results SET lease_token=?,lease_until=?,last_error=NULL
      WHERE thread_record_id=? AND league_id=? AND (lease_until IS NULL OR lease_until<?)`)
      .bind(lease,new Date(Date.now()+120000).toISOString(),thread.id,league.id,new Date().toISOString()).run();
    if(!claimed.meta?.changes){hasMore=true;continue;}
    try{
      const stillActive=await db.prepare('SELECT snapshot_id FROM league_active_snapshots WHERE league_id=?').bind(league.id).first();
      if(stillActive?.snapshot_id!==snapshotId)return {ok:true,status:'completed',superseded:true};
      const saved=await db.prepare('SELECT message_id,payload_hash FROM discord_game_results WHERE thread_record_id=? AND lease_token=?').bind(thread.id,lease).first();
      let messageId=saved.message_id;
      if(!messageId){
        // Reconcile an accepted POST whose response was lost before persistence.
        const recent=await discordBotRequest(env,`/channels/${thread.discord_thread_id}/messages?limit=100`,{fetchImpl});
        messageId=Array.isArray(recent)?recent.find(item=>String(item.nonce||'')===nonce)?.id:null;
      }
      const result=messageId
        ?await discordBotRequest(env,`/channels/${thread.discord_thread_id}/messages/${messageId}`,{method:'PATCH',body:message,fetchImpl})
        :await discordBotRequest(env,`/channels/${thread.discord_thread_id}/messages`,{method:'POST',body:{...message,nonce,enforce_nonce:true},fetchImpl});
      messageId=result?.id||messageId;
      if(!/^[0-9]{17,20}$/.test(messageId||''))throw new Error('Discord did not return a result message ID.');
      await db.prepare(`UPDATE discord_game_results SET message_id=?,payload_hash=?,snapshot_id=?,last_error=NULL,
        updated_at=CURRENT_TIMESTAMP WHERE thread_record_id=? AND lease_token=?`)
        .bind(messageId,payloadHash,snapshotId,thread.id,lease).run();
      operations++;
    }catch(error){
      await db.prepare('UPDATE discord_game_results SET last_error=?,updated_at=CURRENT_TIMESTAMP WHERE thread_record_id=? AND lease_token=?')
        .bind(discordErrorText(error),thread.id,lease).run();
      throw error;
    }finally{
      await db.prepare('UPDATE discord_game_results SET lease_token=NULL,lease_until=NULL WHERE thread_record_id=? AND lease_token=?').bind(thread.id,lease).run();
    }
  }
  return {ok:!hasMore,status:hasMore?'running':'completed',hasMore,resultMessages:operations};
}
