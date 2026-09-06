import {
  DISCORD_EPHEMERAL_FLAG,
  DISCORD_INTERACTION_TYPES,
  DISCORD_RESPONSE_TYPES,
  completeInteractionReceipt,
  createInteractionReceipt,
  discordErrorResponse,
  discordInteractionResponse,
  editDiscordOriginalResponse,
  resolveDiscordContext,
  verifyDiscordInteractionRequest
} from '../../_lib/discord-security.js';
import {
  discordCommandName,
  discordInteractionIsPrivate,
  DISCORD_COMMAND_RELEASE
} from '../../_lib/discord-commands.js';
import { executeDiscordCommand } from '../../_lib/discord-bot.js';
import { flushDiscordDeliveries } from '../../_lib/discord-delivery.js';

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

export async function onRequestPost(context){
  const publicKey=String(context.env?.DISCORD_PUBLIC_KEY||'').trim();
  if(!publicKey)return httpJson({ok:false,release:DISCORD_COMMAND_RELEASE,error:'Discord interactions are not configured.'},503);
  const verified=await verifyDiscordInteractionRequest(context.request,publicKey);
  if(!verified.verified)return httpJson({ok:false,release:DISCORD_COMMAND_RELEASE,error:verified.error},verified.status);
  const interaction=verified.interaction;
  if(Number(interaction.type)===DISCORD_INTERACTION_TYPES.PING){
    return discordInteractionResponse(DISCORD_RESPONSE_TYPES.PONG);
  }
  if(Number(interaction.type)!==DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND){
    return discordErrorResponse('That Discord interaction is not supported.');
  }
  const command=discordCommandName(interaction);
  let c;
  try{
    c=await resolveDiscordContext(context.env,interaction,{membershipRequired:command!=='join'});
  }catch(error){
    return discordErrorResponse(safeCommandError(error));
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
    content,flags:visibility==='private'?DISCORD_EPHEMERAL_FLAG:0,allowed_mentions:{parse:[]}
  });
}

export function onRequestGet(){
  return httpJson({ok:false,release:DISCORD_COMMAND_RELEASE,error:'Discord interactions require a signed POST request.'},405);
}
