import {
  DISCORD_GLOBAL_COMMANDS,
  DISCORD_COMMAND_RELEASE,
  DISCORD_RETIRED_GLOBAL_COMMANDS
} from '../functions/_lib/discord-commands.js';
import { reconcileDiscordGlobalCommands } from '../functions/_lib/discord-api.js';

const apply=process.argv.includes('--apply');
const clientId=String(process.env.DISCORD_CLIENT_ID||'').trim();
const token=String(process.env.DISCORD_BOT_TOKEN||'').trim();

if(!apply){
  console.log(JSON.stringify({
    release:DISCORD_COMMAND_RELEASE,
    scope:'global',
    commandCount:DISCORD_GLOBAL_COMMANDS.length,
    retiredCommands:DISCORD_RETIRED_GLOBAL_COMMANDS,
    commands:DISCORD_GLOBAL_COMMANDS
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
  },DISCORD_GLOBAL_COMMANDS,{retiredNames:DISCORD_RETIRED_GLOBAL_COMMANDS});
  console.log(`Upserted ${result.registered.length} global FranchiseHQ command(s) and retired ${result.retired.length} exact legacy command(s) for release ${DISCORD_COMMAND_RELEASE} without deleting unowned commands.`);
}catch(error){
  console.error(`Discord command reconciliation failed: ${String(error?.message||error).slice(0,500)}`);
  process.exit(1);
}
