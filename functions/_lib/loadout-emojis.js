import {discordBotRequest} from './discord-api.js';
import {STATUS_EMOJI_IMAGES} from './loadout-emoji-images.js';
const key='platform:discord:loadout-status-emoji:v1';
const cache=env=>env.LEAGUE_CONFIG||env.COMPANION_EXPORT_META;
export async function loadoutEmojiEnvironment(env){
  try{const raw=await cache(env)?.get(key),ids=raw?JSON.parse(raw):{};
    return {...env,LOADOUT_PASS_EMOJI_ID:ids.pass,LOADOUT_FAIL_EMOJI_ID:ids.fail};
  }catch{return env;}
}
export async function prepareLoadoutEmojis(env,{fetchImpl=fetch}={}){
  if(!cache(env)||!/^\d{17,20}$/.test(env.DISCORD_CLIENT_ID||''))return false;
  if(await cache(env).get(key))return true;
  const path=`/applications/${env.DISCORD_CLIENT_ID}/emojis`;
  const existing=await discordBotRequest(env,path,{fetchImpl,rateLimitRetries:0}),ids={};
  for(const [kind,image]of Object.entries(STATUS_EMOJI_IMAGES)){
    const name=`fhq_${kind}`,found=existing.items?.find(e=>e.name===name);
    const emoji=found||await discordBotRequest(env,path,{method:'POST',body:{name,image},fetchImpl,rateLimitRetries:0});
    if(!/^\d{17,20}$/.test(emoji.id||''))throw new Error('Loadout status emoji could not be prepared');ids[kind]=emoji.id;
  }
  await cache(env).put(key,JSON.stringify(ids));return true;
}
