import { discordBotRequest } from './discord-api.js';
import { activeLeagueTeams, resolveTeam } from './league-teams.js';
import { attachProjectedPickSlots, projectDraftOrder } from './draft-pick-projections.js';
import { normalizePlayer, normalizeTeam } from '../api/leagues/[leagueSlug]/snapshot/read-model.js';

const MAX_ATTEMPTS=5;
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

async function tradeDeliveryDetails(db,row,payload){
  const tradeId=String(payload.tradeId||row.resourceId||'').trim();
  if(!tradeId)return null;
  const workflow=await db.prepare(`SELECT revision FROM trade_workflows WHERE id=? AND league_id=? LIMIT 1`)
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
  const teamRows=await rows(db,`SELECT record.external_id AS externalId,record.data_json AS dataJson
    FROM league_active_snapshots active JOIN league_snapshot_records record
      ON record.league_id=active.league_id AND record.snapshot_id=active.snapshot_id
    WHERE active.league_id=? AND record.domain='teams'`,row.leagueId);
  const capByTeam=new Map();
  for(const item of teamRows){
    const source=normalizeTeam(parse(item.dataJson)),team=resolveTeam(teams,source.id)||resolveTeam(teams,source.abbreviation);
    if(team&&Number.isFinite(Number(source.source?.capAvailable)))capByTeam.set(team.teamKey,Number(source.source.capAvailable));
  }
  const groups=new Map(),capMoves=new Map();
  for(const asset of assets){
    const destination=String(asset.toTeamKey||'');
    if(!groups.has(destination))groups.set(destination,[]);
    if(asset.assetType==='player'){
      const player=normalizePlayer(parse(asset.playerDataJson),asset.playerPublicId),href=payload.leagueSlug
        ?`https://franchisehq.app/leagues/${encodeURIComponent(payload.leagueSlug)}#players/${encodeURIComponent(player.publicId||player.id||asset.sourcePlayerId)}`:null;
      const name=player.displayName||asset.playerName||asset.sourcePlayerId||'Player';
      const cap=money(player.contract?.capHit);
      groups.get(destination).push([
        href?`**[${name}](${href})**`:`**${name}**`,player.position||null,
        player.overall!==null&&player.overall!==undefined?`${player.overall} OVR`:null,
        player.age!==null&&player.age!==undefined?`Age ${player.age}`:null,
        player.devTrait?`${player.devTrait} Dev`:null,cap?`Cap ${cap}`:'Cap unavailable'
      ].filter(Boolean).join(' · '));
      if(Number.isFinite(Number(player.contract?.capHit))){
        const from=String(asset.fromTeamKey||''),amount=Number(player.contract.capHit);
        capMoves.set(from,Number(capMoves.get(from)||0)-amount);
        capMoves.set(destination,Number(capMoves.get(destination)||0)+amount);
      }
    }else{
      const pick=pickById.get(String(asset.draftPickId))||asset;
      groups.get(destination).push(`**${pick.draftClass||'Future'} Round ${pick.round||'—'}** · ${String(pick.originalTeamKey||'').toUpperCase()} original${pick.projectedPick?` · Projected ${pick.projectedPick}${pick.projectionTied?' approx.':''}`:''}`);
    }
  }
  const fields=[];
  for(const [teamKey,items] of groups){
    fields.push({name:`${teamLabel(teams,teamKey)} receives`,value:items.join('\n').slice(0,1024),inline:false});
  }
  const capLines=[];
  for(const [teamKey,net] of capMoves){
    const available=capByTeam.get(teamKey),projected=Number.isFinite(available)?available-net:null;
    capLines.push(`**${teamLabel(teams,teamKey)}:** ${net>0?'+':''}${money(net)} incoming cap${projected!==null?` · estimated space ${money(projected)}`:' · available space unavailable'}`);
  }
  if(capLines.length)fields.push({name:'FranchiseHQ cap estimate',value:`${capLines.join('\n')}\nEstimate excludes Madden dead-cap and bonus acceleration effects.`,inline:false});
  return {fields,color:0x4f8cff};
}

async function deliveryMessage(db,row){
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
  const details=await tradeDeliveryDetails(db,row,payload).catch(()=>null);
  return {
    content:[`**${title}**`,message,action,link?`[Open this trade in FranchiseHQ](${link})`:null].filter(Boolean).join('\n').slice(0,2000),
    ...(details?{embeds:[{title:'Trade details',...details}]}:{}),
    allowed_mentions:{parse:[]}
  };
}

async function sendDelivery(env,db,row,fetchImpl){
  let channelId=row.channelId;
  if(row.visibility==='direct-message'){
    const dm=await discordBotRequest(env,'/users/@me/channels',{
      method:'POST',body:{recipient_id:row.discordUserId},fetchImpl
    });
    channelId=dm?.id;
  }
  if(!channelId)throw new Error('Discord delivery channel could not be resolved.');
  await discordBotRequest(env,`/channels/${encodeURIComponent(channelId)}/messages`,{
    method:'POST',body:await deliveryMessage(db,row),fetchImpl
  });
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
      await sendDelivery(env,db,row,fetchImpl);
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
