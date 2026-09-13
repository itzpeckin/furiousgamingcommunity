import { discordBotRequest } from './discord-api.js';
import { parseTradeDecisionCustomId } from './discord-trade-components.js';

const parse=value=>{try{return JSON.parse(value||'{}')||{}}catch{return{}}};
const rows=async(db,sql,...values)=>(await db.prepare(sql).bind(...values).all()).results||[];
const SNOWFLAKE=/^\d{17,20}$/;

// Message references live in the existing outbox payload. No schema migration,
// token, or Discord configuration change is needed to refresh delivered cards.
export async function rememberDiscordTradeMessages(db,row,channelId,messageIds,{textFallback=false,textMessageIds=[]}={}){
  const ids=[...new Set(messageIds.map(String).filter(id=>id&&id.length<=100))];
  if(!row.id||!channelId||!ids.length)return;
  await db.prepare(`UPDATE discord_delivery_events SET payload_json=json_set(payload_json,
      '$.discordMessages',json(?)),updated_at=CURRENT_TIMESTAMP WHERE id=? AND league_id=?`)
    .bind(JSON.stringify({channelId:String(channelId),messageIds:ids,textFallback,textMessageIds}),row.id,row.leagueId).run();
}

export function discordTradeSyncStatement(db,{league,tradeId}={}){
  return db.prepare(`INSERT INTO discord_delivery_events
    (id,league_id,channel_id,event_type,resource_type,resource_id,visibility,payload_json,idempotency_key)
    VALUES (?,?,?,'trade-message-sync','trade_workflow',?,'private-channel',?,?)`)
    .bind(`discord_delivery_${crypto.randomUUID()}`,league.id,'trade-message-sync',tradeId,
      JSON.stringify({tradeId,leagueSlug:league.slug}),`trade-sync:${league.id}:${tradeId}:${crypto.randomUUID()}`);
}

export async function queueDiscordTradeSync(db,options){
  await discordTradeSyncStatement(db,options).run();
}

export async function rememberDiscordTradeInteraction(db,c,decision){
  const messageId=String(c.interaction?.message?.id||''),channelId=String(c.interaction?.channel_id||'');
  if(!SNOWFLAKE.test(messageId)||!SNOWFLAKE.test(channelId))return;
  if(c.interaction.message.author?.id&&String(c.interaction.message.author.id)!==String(c.interaction.application_id))return;
  const review=decision.action.startsWith('review-');
  const dm=!c.interaction?.guild_id;
  const id=`discord_delivery_${crypto.randomUUID()}`;
  await db.prepare(`INSERT INTO discord_delivery_events
    (id,league_id,user_id,discord_user_id,channel_id,event_type,resource_type,resource_id,
      visibility,payload_json,idempotency_key,status,sent_at)
    VALUES (?,?,?,?,?,?,'trade_workflow',?,?,?,?, 'sent',CURRENT_TIMESTAMP)
    ON CONFLICT(idempotency_key) DO NOTHING`)
    .bind(id,c.league.id,dm?c.session.user.id:null,dm?String(c.interaction.user?.id||c.interaction.member?.user?.id):null,
      channelId,review?'review-required':'thread-update',decision.tradeId,dm?'direct-message':'private-channel',
      JSON.stringify({title:review?'Trade review required':'Trade updated',message:'',tradeId:decision.tradeId,
        leagueSlug:c.league.slug,discordMessages:{channelId,messageIds:[messageId],textFallback:false}}),
      `trade-message:${c.league.id}:${decision.tradeId}:${channelId}:${messageId}`).run();
}

function ownsTradeMessage(message,botId,tradeId,slug){
  if(!botId||String(message?.author?.id)!==botId)return false;
  const link=`https://franchisehq.app/leagues/${encodeURIComponent(slug)}#trade-center/${encodeURIComponent(tradeId)}`;
  if(String(message?.content||'').includes(`(${link})`)||String(message?.content||'').includes(link))return true;
  return (message?.components||[]).some(row=>(row?.components||[]).some(button=>
    parseTradeDecisionCustomId(button?.custom_id)?.tradeId===tradeId));
}

async function stamp(db,leagueId,tradeId){
  const row=await db.prepare(`SELECT workflow.revision,workflow.status,
      SUM(CASE WHEN review.decision='approve' THEN 1 ELSE 0 END) AS approvals,
      SUM(CASE WHEN review.decision='reject' THEN 1 ELSE 0 END) AS rejections
    FROM trade_workflows workflow LEFT JOIN trade_workflow_reviews review
      ON review.trade_id=workflow.id AND review.league_id=workflow.league_id AND review.revision=workflow.revision
    WHERE workflow.league_id=? AND workflow.id=? GROUP BY workflow.id`)
    .bind(leagueId,tradeId).first();
  return row?JSON.stringify(row):null;
}

export async function syncDiscordTradeMessages(env,db,event,{render,fetchImpl=fetch,pass=0}={}){
  const payload=parse(event.payloadJson),tradeId=String(payload.tradeId||event.resourceId||'');
  const startingStamp=await stamp(db,event.leagueId,tradeId);
  if(!startingStamp)return {updated:0};
  const deliveries=await rows(db,`SELECT id,league_id AS leagueId,user_id AS userId,
      discord_user_id AS discordUserId,channel_id AS channelId,event_type AS eventType,
      resource_id AS resourceId,visibility,payload_json AS payloadJson
    FROM discord_delivery_events WHERE league_id=? AND resource_id=?
      AND event_type IN ('review-required','received','thread-update','revision-submitted')
      AND status IN ('sent','sending','failed') ORDER BY created_at DESC LIMIT 501`,event.leagueId,tradeId);
  if(deliveries.length>500)throw new Error('Discord trade synchronization exceeded its bounded message inventory.');
  const room=await db.prepare(`SELECT discord_thread_id AS channelId,message_id AS messageId
    FROM discord_trade_rooms WHERE league_id=? AND trade_id=? LIMIT 1`).bind(event.leagueId,tradeId).first();
  if(room?.channelId&&room?.messageId)deliveries.push({leagueId:event.leagueId,channelId:room.channelId,
    eventType:'thread-update',resourceId:tradeId,visibility:'private-channel',
    payloadJson:JSON.stringify({title:'Private trade negotiation',message:'Both registered team owners can review and respond here.',
      tradeId,leagueSlug:payload.leagueSlug,discordMessages:{channelId:room.channelId,messageIds:[room.messageId]}})});
  const installation=await db.prepare(`SELECT application_id AS botId FROM discord_league_installations
    WHERE league_id=? AND status='active' LIMIT 1`).bind(event.leagueId).first();
  const botId=String(installation?.botId||env?.DISCORD_CLIENT_ID||'');
  const histories=new Map(),patched=new Set(),detailsCache=new Map();let renderedStamp=null;
  let updated=0,failures=0;
  for(const delivery of deliveries){
    try{
      if(delivery.visibility==='direct-message'){
        const member=await db.prepare(`SELECT membership.role FROM league_memberships membership JOIN users user ON user.id=membership.user_id
          WHERE membership.league_id=? AND membership.active=1 AND user.discord_user_id=? LIMIT 1`)
          .bind(event.leagueId,delivery.discordUserId).first();
        if(!member||(delivery.eventType==='review-required'&&!['commissioner','trade_committee'].includes(member.role)))continue;
      }
      let reference=parse(delivery.payloadJson).discordMessages;
      if(!reference?.messageIds?.length){
        let channelId=delivery.channelId;
        if(delivery.visibility==='direct-message'){
          const dm=await discordBotRequest(env,'/users/@me/channels',{method:'POST',body:{recipient_id:delivery.discordUserId},fetchImpl});
          channelId=dm?.id;
        }
        if(!SNOWFLAKE.test(String(channelId||'')))continue;
        // Recover pre-release messages only in known delivery destinations,
        // with the exact application author and trade link/button identity.
        if(!histories.has(channelId)){
          const found=[];let before='';
          for(let page=0;page<2;page++){
            const history=await discordBotRequest(env,`/channels/${channelId}/messages?limit=100${before?`&before=${before}`:''}`,{fetchImpl});
            if(!Array.isArray(history))break;
            found.push(...history.filter(message=>ownsTradeMessage(message,botId,tradeId,payload.leagueSlug)));
            if(history.length<100)break;
            before=String(history.at(-1)?.id||'');if(!SNOWFLAKE.test(before))break;
          }
          histories.set(channelId,found);
        }
        const found=histories.get(channelId);
        reference={channelId,messageIds:found.map(message=>String(message.id)),
          textMessageIds:found.filter(message=>!message.embeds?.length).map(message=>String(message.id))};
        await rememberDiscordTradeMessages(db,delivery,channelId,reference.messageIds,reference);
      }
      for(let index=0;index<(reference?.messageIds||[]).length;index++){
        const messageId=reference.messageIds[index],key=`${reference.channelId}:${messageId}`;
        if(patched.has(key))continue;
        for(let attempt=0;attempt<3;attempt++){
          const before=await stamp(db,event.leagueId,tradeId);
          if(renderedStamp!==before){detailsCache.clear();renderedStamp=before}
          const message=await render(db,delivery,{detailsCache});
          if(!message.embeds?.length)throw new Error('Discord trade synchronization could not render its canonical cards.');
          const body={...message,components:message.components||[],allowed_mentions:{parse:[]}};
          if(reference.textFallback||reference.textMessageIds?.includes(String(messageId))){
            // Keep the delivered asset chunks intact on channels without Embed
            // Links. The status and controls live on the final fallback chunk.
            if(reference.textFallback&&index!==reference.messageIds.length-1){patched.add(key);break}
            const current=await discordBotRequest(env,`/channels/${reference.channelId}/messages/${encodeURIComponent(messageId)}`,{fetchImpl});
            const status=message.embeds.find(embed=>embed.title==='Trade status');
            body.content=`${String(current?.content||'').split('**TRADE STATUS**')[0].trim()}\n\n**TRADE STATUS**\n${status.description}`.trim();
            body.embeds=[];
          }
          // If another vote arrived while rendering, never send the old tally.
          if(before!==await stamp(db,event.leagueId,tradeId))continue;
          await discordBotRequest(env,`/channels/${reference.channelId}/messages/${encodeURIComponent(messageId)}`,{method:'PATCH',body,fetchImpl});
          if(before===await stamp(db,event.leagueId,tradeId)){patched.add(key);updated++;break}
          if(attempt===2)throw new Error('Discord trade votes changed during synchronization; retry required.');
        }
        if(!patched.has(key))throw new Error('Discord trade votes changed while rendering; retry required.');
      }
    }catch(error){
      // Deleted messages/closed threads are not recreated. One unavailable DM
      // must not stop the other owners, reviewers, or committee channel.
      if(Number(error?.status)!==404)failures++;
    }
  }
  if(failures)throw new Error(`Discord trade synchronization requires retry for ${failures} destination(s).`);
  // A late vote can arrive after earlier copies were patched. Repeat the whole
  // inventory once so they converge too, not only the last clicked message.
  if(startingStamp!==await stamp(db,event.leagueId,tradeId)){
    if(pass>=2)throw new Error('Discord trade votes remained busy; synchronization retry required.');
    return syncDiscordTradeMessages(env,db,event,{render,fetchImpl,pass:pass+1});
  }
  return {updated};
}
