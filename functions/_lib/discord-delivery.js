import { discordBotRequest } from './discord-api.js';

const MAX_ATTEMPTS=5;
const rows=async(db,sql,...values)=>(await db.prepare(sql).bind(...values).all()).results||[];
const cleanError=value=>String(value?.message||value||'Discord delivery failed.').replace(/Bot\s+[A-Za-z0-9._-]+/g,'Bot [redacted]').slice(0,500);

function deliveryMessage(row){
  let payload={};try{payload=JSON.parse(row.payloadJson||'{}')}catch{}
  const title=String(payload.title||'FranchiseHQ update');
  const message=String(payload.message||'Open FranchiseHQ for details.');
  const slug=String(payload.leagueSlug||'').trim();
  const tradeId=String(payload.tradeId||'').trim();
  const link=slug
    ?`https://franchisehq.app/leagues/${encodeURIComponent(slug)}${tradeId?`#trade-center/${encodeURIComponent(tradeId)}`:''}`
    :null;
  const action=row.eventType==='received'&&tradeId?`Respond in the league server with \`/trade accept trade:${tradeId}\` or \`/trade reject trade:${tradeId}\`.`
    :row.eventType==='review-required'&&tradeId?`Review in the private committee channel with \`/trade review trade:${tradeId}\`.`
    :null;
  return {
    content:[`**${title}**`,message,action,link].filter(Boolean).join('\n').slice(0,2000),
    allowed_mentions:{parse:[]}
  };
}

async function sendDelivery(env,row,fetchImpl){
  let channelId=row.channelId;
  if(row.visibility==='direct-message'){
    const dm=await discordBotRequest(env,'/users/@me/channels',{
      method:'POST',body:{recipient_id:row.discordUserId},fetchImpl
    });
    channelId=dm?.id;
  }
  if(!channelId)throw new Error('Discord delivery channel could not be resolved.');
  await discordBotRequest(env,`/channels/${encodeURIComponent(channelId)}/messages`,{
    method:'POST',body:deliveryMessage(row),fetchImpl
  });
}

export async function flushDiscordDeliveries(env,db,{leagueId=null,limit=10,fetchImpl=fetch}={}){
  if(!String(env?.DISCORD_BOT_TOKEN||'').trim())return {sent:0,failed:0,skipped:true};
  const candidates=await rows(db,`SELECT id,league_id AS leagueId,discord_user_id AS discordUserId,
      channel_id AS channelId,event_type AS eventType,visibility,payload_json AS payloadJson,attempts
    FROM discord_delivery_events
    WHERE status IN ('pending','failed') AND attempts<? AND available_at<=CURRENT_TIMESTAMP
      AND (? IS NULL OR league_id=?)
    ORDER BY created_at LIMIT ?`,MAX_ATTEMPTS,leagueId,leagueId,Math.min(25,Math.max(1,Number(limit)||10)));
  let sent=0,failed=0;
  for(const row of candidates){
    const claim=await db.prepare(`UPDATE discord_delivery_events SET status='sending',attempts=attempts+1,
      updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','failed') AND attempts<?`)
      .bind(row.id,MAX_ATTEMPTS).run();
    if(Number(claim?.meta?.changes||0)!==1)continue;
    try{
      await sendDelivery(env,row,fetchImpl);
      await db.prepare(`UPDATE discord_delivery_events SET status='sent',sent_at=CURRENT_TIMESTAMP,
        last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(row.id).run();
      sent+=1;
    }catch(error){
      await db.prepare(`UPDATE discord_delivery_events SET status='failed',last_error=?,
        available_at=datetime('now','+5 minutes'),updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(cleanError(error),row.id).run();
      failed+=1;
    }
  }
  return {sent,failed,skipped:false};
}

export async function queueCommitteeReviewDelivery(db,{league,tradeId,title='Trade review required',message='An accepted trade requires a committee decision.'}){
  const installation=await db.prepare(`SELECT trade_committee_channel_id AS channelId
    FROM discord_league_installations WHERE league_id=? AND status='active' LIMIT 1`).bind(league.id).first();
  if(!installation?.channelId)return {queued:false};
  const result=await db.prepare(`INSERT INTO discord_delivery_events
    (id,league_id,channel_id,event_type,resource_type,resource_id,visibility,payload_json,idempotency_key)
    VALUES (?,?,?,?,?,?,'private-channel',?,?) ON CONFLICT(idempotency_key) DO NOTHING`)
    .bind(`discord_delivery_${crypto.randomUUID()}`,league.id,installation.channelId,'review-required',
      'trade_workflow',tradeId,JSON.stringify({title,message,tradeId,leagueSlug:league.slug}),
      `trade-review:${league.id}:${tradeId}`).run();
  return {queued:Number(result?.meta?.changes||0)===1};
}

export function scheduleDiscordDeliveryFlush(context,db,leagueId){
  if(!String(context?.env?.DISCORD_BOT_TOKEN||'').trim())return false;
  const task=flushDiscordDeliveries(context.env,db,{leagueId}).catch(error=>{
    console.error('Discord delivery flush failed:',cleanError(error));
  });
  const waitUntil=context?.waitUntil||context?.executionContext?.waitUntil;
  if(typeof waitUntil==='function')waitUntil.call(context?.executionContext||context,task);
  else task.catch(()=>{});
  return true;
}
