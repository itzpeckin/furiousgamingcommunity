import { discordBotRequest } from './discord-api.js';
import { activeLeagueTeams, activeTeamAssignments, resolveTeam } from './league-teams.js';
import { attachProjectedPickSlots, projectDraftOrder } from './draft-pick-projections.js';
import { tradeDecisionComponents, tradeLinkButton, tradeReviewComponents } from './discord-trade-components.js';
import { normalizePlayer } from '../api/leagues/[leagueSlug]/snapshot/read-model.js';

const MAX_ATTEMPTS=5;
const SNOWFLAKE=/^\d{17,20}$/;
const DISCORD_SUPPRESS_EMBEDS=1<<2;
const rows=async(db,sql,...values)=>(await db.prepare(sql).bind(...values).all()).results||[];
const cleanError=value=>String(value?.message||value||'Discord delivery failed.').replace(/Bot\s+[A-Za-z0-9._-]+/g,'Bot [redacted]').slice(0,500);

const parse=value=>{try{return JSON.parse(value||'{}')||{}}catch{return{}}};
const money=value=>{
  const amount=Number(value);
  if(!Number.isFinite(amount))return null;
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(amount);
};
const teamLabel=(teams,key)=>{
  const team=resolveTeam(teams,key);
  return team?.displayName||team?.abbreviation||String(key||'Team').toUpperCase();
};
const embedColor=value=>{
  const hex=String(value||'').trim().replace(/^#/,'');
  return /^[0-9a-f]{6}$/i.test(hex)?Number.parseInt(hex,16):0x4f8cff;
};
const available=value=>value!==null&&value!==undefined&&value!=='';
const playerFact=(label,value)=>`**${label}**: ${available(value)?value:'Unavailable'}`;
const tradeStatusLabel=workflow=>{
  const status=String(workflow?.status||'').toLowerCase();
  if(status==='negotiating')return 'Negotiating';
  if(status==='committee')return 'Accepted';
  if(status==='approved')return 'Approved';
  if(status==='withdrawn')return 'Cancelled';
  if(status==='rejected')return 'Rejected';
  return status?status.replaceAll('-',' ').replace(/\b\w/g,letter=>letter.toUpperCase()):'Status unavailable';
};

async function tradeDeliveryDetails(db,row,payload){
  const tradeId=String(payload.tradeId||row.resourceId||'').trim();
  if(!tradeId)return null;
  const workflow=await db.prepare(`SELECT revision,status
    FROM trade_workflows WHERE id=? AND league_id=? LIMIT 1`)
    .bind(tradeId,row.leagueId).first();
  if(!workflow)return null;
  const assets=await rows(db,`SELECT asset.asset_type AS assetType,asset.source_player_id AS sourcePlayerId,
      asset.player_identity_id AS playerIdentityId,asset.draft_pick_id AS draftPickId,
      asset.from_team_key AS fromTeamKey,asset.to_team_key AS toTeamKey,asset.ordinal,
      identity.public_id AS playerPublicId,identity.display_name AS playerName,
      record.data_json AS playerDataJson,pick.draft_class AS draftClass,pick.round,
      pick.original_team_key AS originalTeamKey,pick.current_team_key AS currentTeamKey
    FROM trade_workflow_assets asset
    LEFT JOIN player_identities identity ON identity.id=asset.player_identity_id AND identity.league_id=asset.league_id
    LEFT JOIN league_active_snapshots active ON active.league_id=asset.league_id
    LEFT JOIN league_snapshot_records record ON record.league_id=asset.league_id
      AND record.snapshot_id=active.snapshot_id AND record.domain='players' AND record.external_id=asset.source_player_id
    LEFT JOIN league_draft_picks pick ON pick.id=asset.draft_pick_id AND pick.league_id=asset.league_id
    WHERE asset.league_id=? AND asset.trade_id=? AND asset.revision=?
    ORDER BY asset.ordinal,asset.id`,row.leagueId,tradeId,Number(workflow.revision));
  if(!assets.length)return null;
  const teams=await activeLeagueTeams(db,row.leagueId);
  const standingRows=assets.some(item=>item.assetType==='draft-pick')?await rows(db,`SELECT record.external_id AS externalId,record.data_json AS dataJson
    FROM league_active_snapshots active JOIN league_snapshot_records record
      ON record.league_id=active.league_id AND record.snapshot_id=active.snapshot_id
    WHERE active.league_id=? AND record.domain='standings' ORDER BY record.external_id`,row.leagueId):[];
  const projection=projectDraftOrder(standingRows,teams);
  const picks=attachProjectedPickSlots(assets.filter(item=>item.assetType==='draft-pick').map(item=>({
    ...item,id:item.draftPickId,draftClass:item.draftClass,round:item.round,originalTeamKey:item.originalTeamKey
  })),projection);
  const pickById=new Map(picks.map(item=>[String(item.draftPickId||item.id),item]));
  const groups=new Map();
  for(const asset of assets){
    const destination=String(asset.toTeamKey||'');
    if(!groups.has(destination))groups.set(destination,[]);
    if(asset.assetType==='player'){
      const player=normalizePlayer(parse(asset.playerDataJson),asset.playerPublicId),href=payload.leagueSlug
        ?`https://franchisehq.app/leagues/${encodeURIComponent(payload.leagueSlug)}#players/${encodeURIComponent(player.publicId||player.id||asset.sourcePlayerId)}`:null;
      const name=player.displayName||asset.playerName||asset.sourcePlayerId||'Player';
      const savings=player.contract?.releaseNetSavings!==null&&player.contract?.releaseNetSavings!==undefined&&Number.isFinite(Number(player.contract.releaseNetSavings))?Number(player.contract.releaseNetSavings):null;
      const penalty=player.contract?.releasePenalty!==null&&player.contract?.releasePenalty!==undefined&&Number.isFinite(Number(player.contract.releasePenalty))?Number(player.contract.releasePenalty):null;
      const sourceCap=player.contract?.capHit!==null&&player.contract?.capHit!==undefined&&Number.isFinite(Number(player.contract.capHit))?Number(player.contract.capHit):null;
      const playerSection=[
        '**PLAYER**',
        playerFact('Position',player.position?`\`${player.position}\``:null),
        playerFact('Overall',available(player.overall)?`\`${player.overall}\``:null),
        playerFact('Development',player.devTrait?`\`${player.devTrait}\``:null),
        playerFact('Age',available(player.age)?`\`${player.age}\``:null)
      ].join('\n');
      const contractSection=[
        '**CONTRACT**',
        playerFact('Cap Hit',sourceCap!==null?`**${money(sourceCap)}**`:null),
        playerFact('Release Penalty',penalty!==null?money(penalty):null),
        playerFact('Net Release Savings',savings!==null?money(savings):null),
        playerFact('Total Contract',available(player.contract?.totalSalary)?money(player.contract.totalSalary):null),
        playerFact('Total Bonus',available(player.contract?.totalBonus)?money(player.contract.totalBonus):null),
        playerFact('Years Left',available(player.contract?.yearsRemaining)?String(player.contract.yearsRemaining):null)
      ].join('\n');
      groups.get(destination).push({
        name:'👤 PLAYER',
        value:[href?`**[${name}](${href})**`:`**${name}**`,playerSection,'',contractSection].join('\n').slice(0,1024)
      });
    }else{
      const pick=pickById.get(String(asset.draftPickId))||asset;
      groups.get(destination).push({
        name:'🏈 DRAFT PICK',
        value:[`**${pick.draftClass||'Future'} — ROUND ${pick.round||'—'}**`,
          pick.projectedPick?`**Projected Pick: ${pick.projectedPick}${pick.projectionTied?' (approx.)':''}**`:'**Projected Pick: Unavailable**',
          pick.originalTeamKey?`Original Team: **${String(pick.originalTeamKey).toUpperCase()}**`:null
        ].filter(Boolean).join('\n').slice(0,1024)
      });
    }
  }
  const embeds=[];
  for(const [teamKey,items] of groups){
    const team=resolveTeam(teams,teamKey);
    embeds.push({
      title:`${teamLabel(teams,teamKey)} receives`,
      color:embedColor(team?.primaryColor),
      fields:items.flatMap((item,index)=>[
        ...(index?[{name:'\u200b',value:'\u200b',inline:false}]:[]),
        {...item,inline:false}
      ]),
      ...(team?.logoUrl?{thumbnail:{url:team.logoUrl}}:{})
    });
  }
  embeds.push({title:'Trade status',description:`**${tradeStatusLabel(workflow)}**`,color:0x4f8cff});
  return {embeds,workflow,assetCount:assets.length};
}

async function recoverSuppressedTradeEmbeds(env,channelId,posted,message,fetchImpl){
  if(!message?.embeds?.length||!posted?.id)return {recovered:false};
  const responseEmbeds=Array.isArray(posted.embeds)?posted.embeds:null;
  const suppressed=Boolean(Number(posted.flags||0)&DISCORD_SUPPRESS_EMBEDS);
  if(responseEmbeds!==null&&responseEmbeds.length===message.embeds.length&&!suppressed)return {recovered:false};
  if(responseEmbeds===null&&!suppressed)return {recovered:false};

  const replacement={...message,...(suppressed?{flags:Number(posted.flags||0)&~DISCORD_SUPPRESS_EMBEDS}:{})};
  const restored=await discordBotRequest(env,`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(posted.id)}`,{
    method:'PATCH',body:replacement,fetchImpl
  }).catch(()=>null);
  if(Array.isArray(restored?.embeds)&&restored.embeds.length===message.embeds.length){
    return {recovered:true,method:suppressed?'replaced-and-unsuppressed':'replaced'};
  }
  await discordBotRequest(env,`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(posted.id)}`,{
    method:'DELETE',fetchImpl
  }).catch(()=>null);
  throw new Error('Discord removed the Trade Committee detail cards. The original incomplete post was removed; allow Embed Links in the configured channel and FranchiseHQ will retry safely.');
}

export async function tradeConversationMessage(db,row,{disabled=false,statusMessage=null}={}){
  let payload={};try{payload=JSON.parse(row.payloadJson||'{}')}catch{}
  const title=String(payload.title||'FranchiseHQ update');
  const message=String(payload.message||'Open FranchiseHQ for details.');
  const slug=String(payload.leagueSlug||'').trim();
  const tradeId=String(payload.tradeId||'').trim();
  const link=slug
    ?`https://franchisehq.app/leagues/${encodeURIComponent(slug)}${tradeId?`#trade-center/${encodeURIComponent(tradeId)}`:''}`
    :null;
  const action=['received','thread-update','revision-submitted'].includes(row.eventType)&&tradeId?'Use the buttons below to respond to the current offer.'
    :row.eventType==='review-required'&&tradeId?'Commissioners can record their decision with the buttons below.'
    :null;
  let details=null;
  try{details=await tradeDeliveryDetails(db,row,payload)}
  catch(error){console.error('Discord trade detail render failed:',cleanError(error))}
  const decisionReady=['received','thread-update','revision-submitted'].includes(row.eventType)&&tradeId&&details?.workflow?.status==='negotiating';
  const reviewReady=row.eventType==='review-required'&&tradeId&&details?.workflow?.status==='committee';
  const revisionReady=['thread-update','revision-submitted'].includes(row.eventType)&&tradeId&&details?.workflow?.status==='rejected';
  const committeeRoleId=SNOWFLAKE.test(String(payload.tradeCommitteeRoleId||''))
    ?String(payload.tradeCommitteeRoleId):null;
  const components=decisionReady?tradeDecisionComponents(tradeId,Number(details.workflow.revision),{disabled}):reviewReady
    ?tradeReviewComponents(tradeId,Number(details.workflow.revision),{disabled}):[];
  const linkButton=(decisionReady||revisionReady)&&slug?tradeLinkButton(slug,tradeId,{label:revisionReady?'Revise Trade':'Counter Offer',disabled}):null;
  if(linkButton){
    if(components.length)components[0].components.push(linkButton);
    else components.push({type:1,components:[linkButton]});
  }
  return {
    content:[row.eventType==='review-required'&&committeeRoleId?`<@&${committeeRoleId}>`:null,
      `**${title}**`,message,statusMessage,action,
      link?`[Open this trade in FranchiseHQ](${link})`:null].filter(Boolean).join('\n\n').slice(0,2000),
    ...(details?{embeds:details.embeds}:{}),
    ...(components.length?{components}:{}),
    allowed_mentions:row.eventType==='review-required'&&committeeRoleId
      ?{roles:[committeeRoleId],users:[],replied_user:false}:{parse:[]}
  };
}

async function deliveryMessage(db,row){
  return tradeConversationMessage(db,row);
}

async function participantDiscordIds(db,leagueId,tradeId,teams){
  const participants=await rows(db,`SELECT team_key AS teamKey FROM trade_workflow_participants
    WHERE league_id=? AND trade_id=? ORDER BY team_key`,leagueId,tradeId);
  const assignments=await activeTeamAssignments(db,leagueId,teams);
  return participants.map(item=>assignments.get(String(item.teamKey))?.discordUserId||null).filter(Boolean);
}

export async function ensureDiscordTradeRoom(env,db,{league,installation,interaction,tradeId,fetchImpl=fetch}={}){
  if(!String(env?.DISCORD_BOT_TOKEN||'').trim())return {opened:false,fallback:'direct-message',reason:'bot-token-unavailable'};
  const parentChannelId=String(installation?.tradeChannelId||installation?.notificationChannelId||installation?.scheduleChannelId||interaction?.channel_id||'').trim();
  const guildId=String(installation?.guildId||interaction?.guild_id||'').trim();
  if(!/^\d{17,20}$/.test(parentChannelId)||!/^\d{17,20}$/.test(guildId)){
    return {opened:false,fallback:'direct-message',reason:'private-thread-channel-unavailable'};
  }
  const workflow=await db.prepare(`SELECT revision,status FROM trade_workflows WHERE id=? AND league_id=? LIMIT 1`)
    .bind(String(tradeId||''),league.id).first();
  if(!workflow||workflow.status!=='negotiating')return {opened:false,fallback:'direct-message',reason:'trade-not-negotiating'};
  const teams=await activeLeagueTeams(db,league.id),discordIds=await participantDiscordIds(db,league.id,tradeId,teams);
  if(discordIds.length<2)return {opened:false,fallback:'direct-message',reason:'registered-owner-identities-incomplete'};
  const existing=await db.prepare(`SELECT id,discord_thread_id AS threadId FROM discord_trade_rooms
    WHERE league_id=? AND trade_id=? LIMIT 1`).bind(league.id,tradeId).first();
  let roomId=existing?.id||`discord_trade_room_${crypto.randomUUID()}`,threadId=existing?.threadId||null;
  await db.prepare(`INSERT INTO discord_trade_rooms
    (id,league_id,trade_id,revision,discord_guild_id,parent_channel_id,discord_thread_id,status,last_error,updated_at)
    VALUES (?,?,?,?,?,?,?,'creating',NULL,CURRENT_TIMESTAMP)
    ON CONFLICT(league_id,trade_id) DO UPDATE SET revision=excluded.revision,
      discord_guild_id=excluded.discord_guild_id,parent_channel_id=excluded.parent_channel_id,
      status='creating',last_error=NULL,updated_at=CURRENT_TIMESTAMP`)
    .bind(roomId,league.id,tradeId,Number(workflow.revision),guildId,parentChannelId,threadId).run();
  try{
    if(!threadId){
      const labels=(await rows(db,`SELECT team_key AS teamKey FROM trade_workflow_participants
        WHERE league_id=? AND trade_id=? ORDER BY team_key`,league.id,tradeId))
        .map(item=>teamLabel(teams,item.teamKey)).join('-');
      const created=await discordBotRequest(env,`/channels/${encodeURIComponent(parentChannelId)}/threads`,{
        method:'POST',body:{name:`trade-${labels}`.toLowerCase().replace(/[^a-z0-9-]+/g,'-').slice(0,90),type:12,auto_archive_duration:1440,invitable:false},fetchImpl
      });
      threadId=String(created?.id||'');
      if(!/^\d{17,20}$/.test(threadId))throw new Error('Discord did not return the private trade thread it created.');
      await db.prepare(`UPDATE discord_trade_rooms SET discord_thread_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(threadId,roomId).run();
    }
    for(const discordId of new Set(discordIds)){
      await discordBotRequest(env,`/channels/${encodeURIComponent(threadId)}/thread-members/${encodeURIComponent(discordId)}`,{method:'PUT',fetchImpl});
    }
    const message=await tradeConversationMessage(db,{
      leagueId:league.id,eventType:'received',resourceId:tradeId,
      payloadJson:JSON.stringify({title:'Private trade negotiation',message:'Both registered team owners can review and respond here.',tradeId,leagueSlug:league.slug})
    });
    const posted=await discordBotRequest(env,`/channels/${encodeURIComponent(threadId)}/messages`,{method:'POST',body:message,fetchImpl});
    await db.batch([
      db.prepare(`UPDATE discord_trade_rooms SET revision=?,discord_thread_id=?,message_id=?,status='active',last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(Number(workflow.revision),threadId,String(posted?.id||'')||null,roomId),
      db.prepare(`UPDATE discord_delivery_events SET status='suppressed',last_error='Delivered in private trade thread',updated_at=CURRENT_TIMESTAMP
        WHERE league_id=? AND resource_id=? AND visibility='direct-message' AND event_type IN ('sent','received') AND status IN ('pending','failed')`)
        .bind(league.id,tradeId)
    ]);
    return {opened:true,threadId,participants:discordIds.length,fallback:null};
  }catch(error){
    await db.prepare(`UPDATE discord_trade_rooms SET discord_thread_id=?,status='failed',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(threadId,cleanError(error),roomId).run().catch(()=>{});
    return {opened:false,threadId:threadId||null,fallback:'direct-message',reason:'private-thread-unavailable'};
  }
}

export async function queueTradeRoomUpdate(db,{league,tradeId,eventKey,eventType='thread-update',title='Trade updated',message='The trade workflow changed.',closeRoom=false}={}){
  const room=await db.prepare(`SELECT id,discord_thread_id AS threadId FROM discord_trade_rooms
    WHERE league_id=? AND trade_id=? LIMIT 1`).bind(league.id,tradeId).first();
  if(!room?.threadId)return {queued:false,reason:'trade-room-unavailable'};
  const workflow=await db.prepare(`SELECT revision,status FROM trade_workflows WHERE league_id=? AND id=? LIMIT 1`)
    .bind(league.id,tradeId).first();
  if(!workflow)return {queued:false,reason:'trade-unavailable'};
  const roomStatus=['committee','approved','rejected','withdrawn'].includes(workflow.status)?workflow.status:'active';
  const key=String(eventKey||`${eventType}:${workflow.revision}:${workflow.status}`).slice(0,180);
  const results=await db.batch([
    db.prepare(`UPDATE discord_trade_rooms SET revision=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(Number(workflow.revision),roomStatus,room.id),
    db.prepare(`UPDATE discord_delivery_events SET status='suppressed',last_error='Delivered in private trade thread',updated_at=CURRENT_TIMESTAMP
      WHERE league_id=? AND resource_id=? AND visibility='direct-message'
        AND event_type IN ('sent','received','accepted','review-required') AND status IN ('pending','failed')`)
      .bind(league.id,tradeId),
    db.prepare(`INSERT INTO discord_delivery_events
      (id,league_id,channel_id,event_type,resource_type,resource_id,visibility,payload_json,idempotency_key)
      VALUES (?,?,?,?,?,?,'private-channel',?,?) ON CONFLICT(idempotency_key) DO NOTHING`)
      .bind(`discord_delivery_${crypto.randomUUID()}`,league.id,room.threadId,eventType,'trade_workflow',tradeId,
        JSON.stringify({title,message,tradeId,leagueSlug:league.slug,archiveThreadAfterSend:Boolean(closeRoom)}),`trade-room:${league.id}:${tradeId}:${key}`)
  ]);
  return {queued:Number(results?.[2]?.meta?.changes||0)===1,threadId:room.threadId};
}

async function tradeRoomForDelivery(db,row,payload){
  const tradeId=String(payload?.tradeId||row.resourceId||'').trim();
  if(!tradeId||!SNOWFLAKE.test(String(row.channelId||'')))return null;
  return db.prepare(`SELECT id,discord_thread_id AS threadId FROM discord_trade_rooms
    WHERE league_id=? AND trade_id=? AND discord_thread_id=? LIMIT 1`)
    .bind(row.leagueId,tradeId,row.channelId).first();
}

async function setTradeThreadState(env,db,row,payload,state,fetchImpl){
  const room=await tradeRoomForDelivery(db,row,payload);
  if(!room?.threadId)throw new Error('Discord trade thread could not be verified.');
  await discordBotRequest(env,`/channels/${encodeURIComponent(room.threadId)}`,{
    method:'PATCH',body:state,fetchImpl
  });
  return room;
}

async function sendDelivery(env,db,row,fetchImpl){
  let channelId=row.channelId;
  const payload=parse(row.payloadJson);
  if(row.visibility==='direct-message'){
    const dm=await discordBotRequest(env,'/users/@me/channels',{
      method:'POST',body:{recipient_id:row.discordUserId},fetchImpl
    });
    channelId=dm?.id;
  }
  if(!channelId)throw new Error('Discord delivery channel could not be resolved.');
  if(row.eventType==='thread-close'){
    const room=await setTradeThreadState(env,db,row,payload,{archived:true,locked:true},fetchImpl);
    return {room,archived:true};
  }
  if(row.eventType==='revision-submitted'&&row.visibility==='private-channel'){
    const room=await tradeRoomForDelivery(db,row,payload);
    if(room?.threadId){
      await discordBotRequest(env,`/channels/${encodeURIComponent(room.threadId)}`,{
        method:'PATCH',body:{archived:false,locked:false},fetchImpl
      });
    }
  }
  const message=await deliveryMessage(db,row);
  if(row.eventType==='review-required'&&(!message.embeds?.length||!message.components?.length)){
    throw new Error('Discord committee delivery stopped because its trade asset package was incomplete.');
  }
  const posted=await discordBotRequest(env,`/channels/${encodeURIComponent(channelId)}/messages`,{
    method:'POST',body:message,fetchImpl
  });
  const embedRecovery=row.eventType==='review-required'
    ?await recoverSuppressedTradeEmbeds(env,channelId,posted,message,fetchImpl):null;
  if(payload.archiveThreadAfterSend&&row.visibility==='private-channel'){
    try{
      const room=await setTradeThreadState(env,db,row,payload,{archived:true,locked:true},fetchImpl);
      return {room,archived:true};
    }catch(error){
      return {archiveError:cleanError(error),payload};
    }
  }
  return {archived:false,embedRecovery};
}

export async function flushDiscordDeliveries(env,db,{leagueId=null,limit=10,fetchImpl=fetch}={}){
  if(!String(env?.DISCORD_BOT_TOKEN||'').trim())return {sent:0,failed:0,skipped:true};
  const candidates=await rows(db,`SELECT id,league_id AS leagueId,discord_user_id AS discordUserId,
      channel_id AS channelId,event_type AS eventType,resource_id AS resourceId,
      visibility,payload_json AS payloadJson,attempts
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
      const outcome=await sendDelivery(env,db,row,fetchImpl);
      await db.prepare(`UPDATE discord_delivery_events SET status='sent',sent_at=CURRENT_TIMESTAMP,
        last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(row.id).run();
      if(outcome?.room?.id&&outcome.archived){
        await db.prepare(`UPDATE discord_trade_rooms SET status='archived',last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
          .bind(outcome.room.id).run();
      }else if(outcome?.archiveError){
        const payload=outcome.payload||parse(row.payloadJson),tradeId=String(payload.tradeId||row.resourceId||'').trim();
        const room=await tradeRoomForDelivery(db,row,payload);
        if(room?.id){
          await db.batch([
            db.prepare(`UPDATE discord_trade_rooms SET last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
              .bind(outcome.archiveError,room.id),
            db.prepare(`INSERT INTO discord_delivery_events
              (id,league_id,channel_id,event_type,resource_type,resource_id,visibility,payload_json,idempotency_key)
              VALUES (?,?,?,?,?,?,'private-channel',?,?) ON CONFLICT(idempotency_key) DO NOTHING`)
              .bind(`discord_delivery_${crypto.randomUUID()}`,row.leagueId,row.channelId,'thread-close','trade_workflow',tradeId,
                JSON.stringify({tradeId,leagueSlug:payload.leagueSlug}),
                `trade-room-close:${row.leagueId}:${tradeId}:${Date.now()}`)
          ]);
        }
      }
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
  const installation=await db.prepare(`SELECT trade_committee_channel_id AS channelId,
      trade_committee_role_id AS tradeCommitteeRoleId
    FROM discord_league_installations WHERE league_id=? AND status='active' LIMIT 1`).bind(league.id).first();
  if(!installation?.channelId)return {queued:false};
  const workflow=await db.prepare(`SELECT revision FROM trade_workflows WHERE league_id=? AND id=? LIMIT 1`).bind(league.id,tradeId).first();
  if(!workflow)return {queued:false};
  const result=await db.prepare(`INSERT INTO discord_delivery_events
    (id,league_id,channel_id,event_type,resource_type,resource_id,visibility,payload_json,idempotency_key)
    VALUES (?,?,?,?,?,?,'private-channel',?,?) ON CONFLICT(idempotency_key) DO NOTHING`)
    .bind(`discord_delivery_${crypto.randomUUID()}`,league.id,installation.channelId,'review-required',
      'trade_workflow',tradeId,JSON.stringify({title,message,tradeId,leagueSlug:league.slug,
        tradeCommitteeRoleId:SNOWFLAKE.test(String(installation.tradeCommitteeRoleId||''))?String(installation.tradeCommitteeRoleId):null}),
      `trade-review:${league.id}:${tradeId}:${Number(workflow.revision)}`).run();
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
