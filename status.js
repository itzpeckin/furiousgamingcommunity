const LEAGUE_ID='franchise-hq-demo';
export function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
export function requireCommissioner(request,env){const supplied=request.headers.get('x-commissioner-key')||'';if(!env.COMMISSIONER_API_KEY)return json({error:'COMMISSIONER_API_KEY is not configured in Cloudflare.'},503);if(!supplied||supplied!==env.COMMISSIONER_API_KEY)return json({error:'Enter the correct Commissioner deployment key.'},401);return null}
export function requireBindings(env){if(!env.DB)return json({error:'The Cloudflare D1 binding named DB is missing.'},503);if(!env.DISCORD_BOT_TOKEN)return json({error:'DISCORD_BOT_TOKEN is not configured in Cloudflare Secrets.'},503);if(!env.DISCORD_GUILD_ID)return json({error:'DISCORD_GUILD_ID is not configured.'},503);return null}
export async function discordFetch(env,path,init={}){const r=await fetch(`https://discord.com/api/v10${path}`,{...init,headers:{authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,'content-type':'application/json',...(init.headers||{})}});let data=null;try{data=await r.json()}catch{}if(!r.ok)throw new Error(data?.message||`Discord API returned ${r.status}`);return data}
export async function getConnection(env){return await env.DB.prepare('SELECT * FROM discord_connections WHERE league_id = ?').bind(LEAGUE_ID).first()}
export async function channelFromDiscord(env,id){return await discordFetch(env,`/channels/${id}`)}
export {LEAGUE_ID};
