import { database } from '../../_lib/cloud-platform.js';
import { scanCoaching } from '../../_lib/discord-coaching.js';
import { DISCORD_COMMAND_RELEASE, DISCORD_GLOBAL_COMMANDS } from '../../_lib/discord-commands.js';
import { upsertDiscordGlobalCommands } from '../../_lib/discord-api.js';
import { timingSafeTokenEqual } from '../../_lib/auth.js';

export async function onRequestPost(context){
  const supplied=context.request.headers.get('x-fhq-coaching-scanner')||'';
  const expected=context.env.COACHING_SCANNER_SECRET||'';
  if(!/^[a-f0-9]{64}$/.test(expected)||!/^[a-f0-9]{64}$/.test(supplied))return new Response('Not found',{status:404});
  if(!await timingSafeTokenEqual(supplied,expected))return new Response('Not found',{status:404});
  // Publish the two new/changed command definitions without requiring a
  // commissioner to resave unrelated routing or delete any other command.
  const cache=context.env.LEAGUE_CONFIG,key=`discord:coaching-commands:${DISCORD_COMMAND_RELEASE}`;
  let commandsRegistered=false;
  if(context.env.DISCORD_BOT_TOKEN&&context.env.DISCORD_CLIENT_ID&&cache){
    commandsRegistered=await cache.get(key)==='registered';
    if(!commandsRegistered){
      await upsertDiscordGlobalCommands(context.env,DISCORD_GLOBAL_COMMANDS.filter(command=>['coach','rush'].includes(command.name)));
      await cache.put(key,'registered');commandsRegistered=true;
    }
  }
  return Response.json({...await scanCoaching(context.env,database(context.env)),commandsRegistered},{headers:{'cache-control':'no-store'}});
}
