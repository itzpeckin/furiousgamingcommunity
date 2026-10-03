// Temporary preview acceptance adapter. Removed before production merge.
import {readLoadoutScreenshot} from '../../_lib/loadout-images.js';
import {evaluateLoadout} from '../../_lib/loadout-rules.js';
import {timingSafeTokenEqual} from '../../_lib/auth.js';
export async function onRequestPost({request,env}){
 const supplied=request.headers.get('x-fhq-reader-test')||'',expected=env.LOADOUT_ACCEPTANCE_TOKEN||'';
 if(!new URL(request.url).hostname.endsWith('.pages.dev')||env.APP_ENV==='production'||!expected||!await timingSafeTokenEqual(supplied,expected))return new Response('Not found',{status:404});
 if(Number(request.headers.get('content-length'))>8000000)return new Response('Too large',{status:413});
 const reader=request.body.getReader(),chunks=[];let length=0;
 for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>8000000){await reader.cancel();return new Response('Too large',{status:413});}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const started=Date.now();
 try{const observed=await readLoadoutScreenshot(env,['https://cdn.discordapp.com/attachments/1/2/acceptance.png'],{fetchImpl:async()=>new Response(bytes,{headers:{'content-type':request.headers.get('content-type')}})});
 return Response.json({observed,verdict:evaluateLoadout(observed,{banned:new URL(request.url).searchParams.getAll('banned'),banDuplicates:true}),elapsedMs:Date.now()-started},{headers:{'cache-control':'no-store'}});}
 catch(error){return Response.json({error:error.message,retryable:error.retryable!==false,elapsedMs:Date.now()-started},{status:503});}
}
