import {
  DISCORD_COMMAND_RELEASE,
  DISCORD_RETIRED_GLOBAL_COMMANDS,
  discordGlobalCommandsNamed
} from '../functions/_lib/discord-commands.js';
import { reconcileDiscordGlobalCommands } from '../functions/_lib/discord-api.js';

const apply=process.argv.includes('--apply');
const nameIndexes=process.argv.flatMap((arg,index)=>arg==='--name'?[index]:[]);
const requestedNames=nameIndexes.map(index=>process.argv[index+1]);
if(requestedNames.some(name=>!name||name.startsWith('--'))){
  throw new Error('Every --name option requires one exact Discord command name.');
}
const exactNameUpsert=requestedNames.length>0;
const commands=discordGlobalCommandsNamed(requestedNames);
const retiredCommands=exactNameUpsert?[]:DISCORD_RETIRED_GLOBAL_COMMANDS;
const clientId=String(process.env.DISCORD_CLIENT_ID||'').trim();
const token=String(process.env.DISCORD_BOT_TOKEN||'').trim();

if(!apply){
  console.log(JSON.stringify({
    release:DISCORD_COMMAND_RELEASE,
    scope:'global',
    commandCount:commands.length,
    exactNameUpsert,
    retiredCommands,
    commands
  },null,2));
  process.exit(0);
}

if(!/^[0-9]{17,20}$/.test(clientId)||!token){
  console.error('DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN are required for --apply.');
  process.exit(1);
}

try{
  const result=await reconcileDiscordGlobalCommands({
    DISCORD_CLIENT_ID:clientId,DISCORD_BOT_TOKEN:token
  },commands,{retiredNames:retiredCommands});
  console.log(`Upserted ${result.registered.length} global FranchiseHQ command(s) and retired ${result.retired.length} exact legacy command(s) for release ${DISCORD_COMMAND_RELEASE} without deleting unowned commands.`);
}catch(error){
  console.error(`Discord command reconciliation failed: ${String(error?.message||error).slice(0,500)}`);
  process.exit(1);
}
