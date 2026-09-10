import {
  DISCORD_EPHEMERAL_FLAG,
  DISCORD_INTERACTION_TYPES,
  DISCORD_RESPONSE_TYPES,
  completeInteractionReceipt,
  createInteractionReceipt,
  discordErrorResponse,
  discordInteractionResponse,
  discordMessageData,
  editDiscordOriginalResponse,
  resolveDiscordContext,
  resolveDiscordTradeComponentContext,
  verifyDiscordInteractionRequest
} from '../../_lib/discord-security.js';
import {
  discordCommandName,
  discordScheduleThreadWeek,
  discordInteractionIsPrivate,
  DISCORD_COMMAND_RELEASE
} from '../../_lib/discord-commands.js';
import { executeDiscordCommand, executeDiscordTradeComponent } from '../../_lib/discord-bot.js';
import { discordAutocompleteChoices } from '../../_lib/discord-autocomplete.js';
import { flushDiscordDeliveries } from '../../_lib/discord-delivery.js';
import { parseTradeDecisionCustomId, tradeDenyModal } from '../../_lib/discord-trade-components.js';

function httpJson(body,status){
  return new Response(JSON.stringify(body),{
    status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
  });
}

function safeCommandError(error){
  const status=Number(error?.status)||500;
  if(status>=400&&status<500)return String(error?.message||'This command could not be completed.').slice(0,1800);
  console.error('Discord command failed:',String(error?.message||error).slice(0,500));
  return 'FranchiseHQ could not complete that command. No league data was changed. Try again or contact a commissioner.';
}

async function runCommand(context,c,interaction){
  try{
    const content=await executeDiscordCommand(c);
    await completeInteractionReceipt(c.db,interaction.id,{status:'completed',response:content});
    await flushDiscordDeliveries(context.env,c.db,{leagueId:c.league.id,limit:10}).catch(()=>{});
    return content;
  }catch(error){
    const message=safeCommandError(error);
    await completeInteractionReceipt(c.db,interaction.id,{
      status:Number(error?.status)>=400&&Number(error?.status)<500?'rejected':'failed',
      response:message,errorCode:error?.code||`http-${Number(error?.status)||500}`
    }).catch(()=>{});
    return message;
  }
}

async function runTradeComponent(context,interaction,decision){
  let c;
  const reviewer=decision.action.startsWith('review-');
  try{c=await resolveDiscordTradeComponentContext(context.env,interaction,{tradeId:decision.tradeId,access:reviewer?'reviewer':'participant'});}
  catch(error){return discordErrorResponse(safeCommandError(error));}
  let accepted;
  try{accepted=await createInteractionReceipt(c.db,interaction,{leagueId:c.league.id,visibility:'private'});}
  catch{return discordErrorResponse('FranchiseHQ trade buttons require database migration 37 before they can be enabled.');}
  if(!accepted)return discordErrorResponse('This trade decision was already received. Its first result remains authoritative.');
  try{
    const message=await executeDiscordTradeComponent(c,decision);
    await completeInteractionReceipt(c.db,interaction.id,{status:'completed',response:message});
    const work=flushDiscordDeliveries(context.env,c.db,{leagueId:c.league.id,limit:10}).catch(()=>{});
    const waitUntil=context.waitUntil||context.executionContext?.waitUntil;
    if(typeof waitUntil==='function')waitUntil.call(context.executionContext||context,work);
    else work.catch(()=>{});
    return discordInteractionResponse(DISCORD_RESPONSE_TYPES.UPDATE_MESSAGE,discordMessageData(message));
  }catch(error){
    const message=safeCommandError(error);
    await completeInteractionReceipt(c.db,interaction.id,{
      status:Number(error?.status)>=400&&Number(error?.status)<500?'rejected':'failed',
      response:message,errorCode:error?.code||`http-${Number(error?.status)||500}`
    }).catch(()=>{});
    return discordErrorResponse(message);
  }
}

function modalReason(interaction){
  for(const row of interaction?.data?.components||[]){
    for(const component of row?.components||[]){
      if(component?.custom_id==='reason')return String(component.value||'').trim().slice(0,2000);
    }
  }
  return '';
}

export async function onRequestPost(context){
  const publicKey=String(context.env?.DISCORD_PUBLIC_KEY||'').trim();
  if(!publicKey)return httpJson({ok:false,release:DISCORD_COMMAND_RELEASE,error:'Discord interactions are not configured.'},503);
  const verified=await verifyDiscordInteractionRequest(context.request,publicKey);
  if(!verified.verified)return httpJson({ok:false,release:DISCORD_COMMAND_RELEASE,error:verified.error},verified.status);
  const interaction=verified.interaction;
  if(Number(interaction.type)===DISCORD_INTERACTION_TYPES.PING){
    return discordInteractionResponse(DISCORD_RESPONSE_TYPES.PONG);
  }
  if(Number(interaction.type)===DISCORD_INTERACTION_TYPES.MESSAGE_COMPONENT){
    const decision=parseTradeDecisionCustomId(interaction?.data?.custom_id);
    if(!decision)return discordErrorResponse('That FranchiseHQ trade action is no longer supported.');
    if(decision.action==='review-deny'){
      try{await resolveDiscordTradeComponentContext(context.env,interaction,{tradeId:decision.tradeId,access:'reviewer'});}
      catch(error){return discordErrorResponse(safeCommandError(error));}
      const modal=tradeDenyModal(decision.tradeId,decision.revision);
      return modal?discordInteractionResponse(DISCORD_RESPONSE_TYPES.MODAL,modal):discordErrorResponse('This trade review is no longer available.');
    }
    return runTradeComponent(context,interaction,decision);
  }
  if(Number(interaction.type)===DISCORD_INTERACTION_TYPES.MODAL_SUBMIT){
    const decision=parseTradeDecisionCustomId(interaction?.data?.custom_id);
    if(!decision||decision.action!=='review-deny')return discordErrorResponse('That FranchiseHQ trade review is no longer supported.');
    return runTradeComponent(context,interaction,{...decision,reason:modalReason(interaction)});
  }
  const autocomplete=Number(interaction.type)===DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND_AUTOCOMPLETE;
  if(Number(interaction.type)!==DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND&&!autocomplete){
    return discordErrorResponse('That Discord interaction is not supported.');
  }
  const command=discordCommandName(interaction);
  let c;
  try{
    c=await resolveDiscordContext(context.env,interaction,{
      membershipRequired:command!=='join',
      allowCommissionerBootstrap:Boolean(discordScheduleThreadWeek(command))
    });
  }catch(error){
    return autocomplete
      ?discordInteractionResponse(DISCORD_RESPONSE_TYPES.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,{choices:[]})
      :discordErrorResponse(safeCommandError(error));
  }
  if(autocomplete){
    try{
      const choices=await discordAutocompleteChoices(c);
      return discordInteractionResponse(DISCORD_RESPONSE_TYPES.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,{choices});
    }catch(error){
      console.error('Discord autocomplete failed:',safeCommandError(error));
      return discordInteractionResponse(DISCORD_RESPONSE_TYPES.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,{choices:[]});
    }
  }
  const visibility=discordInteractionIsPrivate(interaction)?'private':'public';
  let accepted;
  try{accepted=await createInteractionReceipt(c.db,interaction,{leagueId:c.league.id,visibility});}
  catch{return discordErrorResponse('FranchiseHQ Discord commands require database migration 34 before they can be enabled.');}
  if(!accepted)return discordErrorResponse('This Discord interaction was already received. Its first result remains authoritative.');

  const waitUntil=context.waitUntil||context.executionContext?.waitUntil;
  if(typeof waitUntil==='function'){
    const work=runCommand(context,c,interaction).then(content=>editDiscordOriginalResponse(interaction,content));
    waitUntil.call(context.executionContext||context,work.catch(error=>console.error('Discord response delivery failed:',safeCommandError(error))));
    return discordInteractionResponse(DISCORD_RESPONSE_TYPES.DEFERRED_CHANNEL_MESSAGE,{
      ...(visibility==='private'?{flags:DISCORD_EPHEMERAL_FLAG}:{}),
      allowed_mentions:{parse:[]}
    });
  }
  const content=await runCommand(context,c,interaction);
  return discordInteractionResponse(DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE,{
    ...discordMessageData(content),flags:visibility==='private'?DISCORD_EPHEMERAL_FLAG:0
  });
}

export function onRequestGet(){
  return httpJson({ok:false,release:DISCORD_COMMAND_RELEASE,error:'Discord interactions require a signed POST request.'},405);
}
