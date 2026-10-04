// Temporary preview-only acceptance adapter; removed before release.
import { readLoadoutScreenshot } from '../../_lib/loadout-images.js';
import { evaluateLoadout } from '../../_lib/loadout-rules.js';
export async function onRequestPost({request,env}) {
 const url=new URL(request.url),token=request.headers.get('x-fhq-reader-test');
 if(env.APP_ENV!=='staging'||!url.hostname.endsWith('.franchise-hq.pages.dev')||!env.LOADOUT_ACCEPTANCE_TOKEN||token!==env.LOADOUT_ACCEPTANCE_TOKEN)return new Response(null,{status:404});
 if(Number(request.headers.get('content-length'))>16000000)return new Response(null,{status:413});
 const bytes=await request.arrayBuffer();if(bytes.byteLength>16000000)return new Response(null,{status:413});
 const type=request.headers.get('content-type'),start=Date.now();
 const observed=await readLoadoutScreenshot(env,['https://cdn.discordapp.com/attachments/1/2/acceptance.png'],{fetchImpl:async()=>new Response(bytes,{headers:{'content-type':type}})});
 return Response.json({observed,result:evaluateLoadout(observed,{banned:url.searchParams.getAll('banned'),banDuplicates:true}),elapsedMs:Date.now()-start},{headers:{'cache-control':'no-store'}});
}
