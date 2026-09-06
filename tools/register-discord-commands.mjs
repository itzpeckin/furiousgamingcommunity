import { DISCORD_GLOBAL_COMMANDS, DISCORD_COMMAND_RELEASE } from '../functions/_lib/discord-commands.js';

const apply=process.argv.includes('--apply');
const clientId=String(process.env.DISCORD_CLIENT_ID||'').trim();
const token=String(process.env.DISCORD_BOT_TOKEN||'').trim();

if(!apply){
  console.log(JSON.stringify({
    release:DISCORD_COMMAND_RELEASE,
    scope:'global',
    commandCount:DISCORD_GLOBAL_COMMANDS.length,
    commands:DISCORD_GLOBAL_COMMANDS
  },null,2));
  process.exit(0);
}

if(!/^[0-9]{17,20}$/.test(clientId)||!token){
  console.error('DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN are required for --apply.');
  process.exit(1);
}

const response=await fetch(`https://discord.com/api/v10/applications/${encodeURIComponent(clientId)}/commands`,{
  method:'PUT',
  headers:{Authorization:`Bot ${token}`,'content-type':'application/json'},
  body:JSON.stringify(DISCORD_GLOBAL_COMMANDS)
});
if(!response.ok){
  const detail=await response.text();
  console.error(`Global Discord command registration failed (${response.status}): ${detail.slice(0,500)}`);
  process.exit(1);
}
const registered=await response.json();
console.log(`Registered ${registered.length} global FranchiseHQ command(s) for release ${DISCORD_COMMAND_RELEASE}.`);
