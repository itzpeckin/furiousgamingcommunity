import {database} from '../../_lib/cloud-platform.js';
import {timingSafeTokenEqual} from '../../_lib/auth.js';
import {handleLoadoutEvent,loadoutEventRoutes} from '../../_lib/discord-loadouts.js';

export async function onRequestPost(context){
  const supplied=context.request.headers.get('x-fhq-coaching-scanner')||'',expected=context.env.COACHING_SCANNER_SECRET||'';
  if(!/^[a-f0-9]{64}$/.test(expected)||!/^[a-f0-9]{64}$/.test(supplied)||!await timingSafeTokenEqual(supplied,expected))return new Response('Not found',{status:404});
  if(Number(context.request.headers.get('content-length')||0)>1024)return new Response('Too large',{status:413});
  const reader=context.request.body?.getReader();if(!reader)return new Response('Invalid event',{status:400});
  let bytes=0,text='';const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1024){await reader.cancel();return new Response('Too large',{status:413});}text+=decoder.decode(value,{stream:true});}
  let event;try{event=JSON.parse(text+decoder.decode());}catch{return new Response('Invalid event',{status:400});}
  try{
    if(event?.action==='gateway-credentials'){
      if(context.env.LOADOUT_GATEWAY_ENABLED!=='true'||!context.env.DISCORD_BOT_TOKEN)return new Response('Not found',{status:404});
      return Response.json({ok:true,token:context.env.DISCORD_BOT_TOKEN},{headers:{'cache-control':'no-store','pragma':'no-cache'}});
    }
    if(event?.action==='routes')return Response.json({ok:true,routes:await loadoutEventRoutes(context.env,database(context.env))},{headers:{'cache-control':'no-store'}});
    const result=await handleLoadoutEvent(context.env,database(context.env),event);
    return Response.json(result,{status:result.ok?200:503,headers:{'cache-control':'no-store'}});
  }catch{return Response.json({ok:false,retry:true},{status:503,headers:{'cache-control':'no-store'}});}
}
