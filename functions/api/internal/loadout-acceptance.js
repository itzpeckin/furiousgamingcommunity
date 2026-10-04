// Temporary preview-only acceptance adapter; removed before release merge.
import {readLoadoutScreenshot} from '../../_lib/loadout-images.js';
import {evaluateLoadout} from '../../_lib/loadout-rules.js';
import {timingSafeTokenEqual} from '../../_lib/auth.js';
export async function onRequestPost(c){
 const key=c.env['READER_ACCEPTANCE_TOKEN'];
 if(c.env.CF_PAGES_BRANCH==='main'||!key||!await timingSafeTokenEqual(c.request.headers.get('x-fhq-reader-test')||'',key))return new Response('Not found',{status:404});
 const bytes=new Uint8Array(await c.request.arrayBuffer());if(bytes.length>16000000)return new Response('Too large',{status:413});
 const start=Date.now(),url='https://cdn.discordapp.com/attachments/100/100/test.png';
 try{const observed=await readLoadoutScreenshot(c.env,[url],{fetchImpl:async target=>target===url?new Response(bytes,{headers:{'content-type':c.request.headers.get('content-type')}}):fetch(target)});
 return Response.json({elapsedMs:Date.now()-start,observed,result:evaluateLoadout(observed,{banDuplicates:true,banned:new URL(c.request.url).searchParams.getAll('banned'),bannedPlaysheets:new URL(c.request.url).searchParams.getAll('sheet'),requirePlaysheets:true})},{headers:{'cache-control':'no-store'}});
 }catch(e){return Response.json({elapsedMs:Date.now()-start,error:e.message},{status:500});}
}
