import { database } from '../../_lib/cloud-platform.js';
import { scanCoaching } from '../../_lib/discord-coaching.js';
import { scanLoadouts } from '../../_lib/discord-loadouts.js';
import { DISCORD_COMMAND_RELEASE, DISCORD_GLOBAL_COMMANDS } from '../../_lib/discord-commands.js';
import { discordBotRequest, upsertDiscordGlobalCommands } from '../../_lib/discord-api.js';
import { timingSafeTokenEqual } from '../../_lib/auth.js';
import { prepareLoadoutEmojis } from '../../_lib/loadout-emojis.js';

export async function onRequestPost(context){
  const supplied=context.request.headers.get('x-fhq-coaching-scanner')||'';
  const expected=context.env.COACHING_SCANNER_SECRET||'';
  if(!/^[a-f0-9]{64}$/.test(expected)||!/^[a-f0-9]{64}$/.test(supplied))return new Response('Not found',{status:404});
  if(!await timingSafeTokenEqual(supplied,expected))return new Response('Not found',{status:404});
  // Publish new/changed command definitions without requiring a
  // commissioner to resave unrelated routing or delete any other command.
  const cache=context.env.LEAGUE_CONFIG||context.env.COMPANION_EXPORT_META,key=`platform:discord:coaching-commands:${DISCORD_COMMAND_RELEASE}`;
  let commandsRegistered=false;
  if(context.env.DISCORD_BOT_TOKEN&&context.env.DISCORD_CLIENT_ID&&cache){
    commandsRegistered=await cache.get(key)==='registered';
    if(!commandsRegistered){
      await upsertDiscordGlobalCommands(context.env,DISCORD_GLOBAL_COMMANDS.filter(command=>['coach','rush','pass','loadout'].includes(command.name)));
      await cache.put(key,'registered');commandsRegistered=true;
    }
  }
  let messageContentAvailable=null;
  if(commandsRegistered){
    const application=await discordBotRequest(context.env,'/applications/@me',{rateLimitRetries:0});
    messageContentAvailable=Boolean(Number(application.flags)&((1<<18)|(1<<19)));
  }
  const db=database(context.env);
  // Idempotent app-owned assets; provisioning never holds up a screenshot.
  if(context.env.LOADOUT_CUSTOM_EMOJI_ENABLED==='true')try{await prepareLoadoutEmojis(context.env);}
  catch{console.warn(JSON.stringify({event:'loadout-emoji-provision-retry'}));}
  const [archetypes,loadouts]=await Promise.all([scanCoaching(context.env,db),scanLoadouts(context.env,db)]);
  return Response.json({ok:archetypes.ok&&loadouts.ok,idle:Boolean(archetypes.idle&&loadouts.idle),
    processed:Boolean(archetypes.processed||loadouts.processed),archetypes,loadouts,commandsRegistered,
    imageReaderAvailable:Boolean(context.env.AI?.run),messageContentAvailable},{headers:{'cache-control':'no-store'}});
}
