import compiledWasm from './vendor/resvg/index_bg.wasm';
import font from './vendor/barlow/semibold.bin';
import { initWasm, Resvg } from './vendor/resvg/index.js';
import { discordPlayerCardSvg, playerCardImageUrl } from './discord-player-card.js';

// Compiled-module import is supported by Pages; never dynamically compile bytes.
const initialized = initWasm(compiledWasm);
async function boundedImage(url, env) {
  const safe=playerCardImageUrl(url);
  if(!safe)return null;
  try {
    // Workers supports manual/follow, not the browser's redirect:error. Never follow an unvalidated image origin.
    const request=new Request(safe,{signal:AbortSignal.timeout(2500),redirect:'manual'});
    const response=new URL(safe).hostname==='franchisehq.app' ? await env.ASSETS.fetch(request) : await fetch(request);
    const type=(response.headers.get('content-type') || '').split(';')[0];
    if(!response.ok || !response.body || !['image/png','image/jpeg'].includes(type) || Number(response.headers.get('content-length'))>1048576){await response.body?.cancel();console.warn('Discord card image unavailable',{host:new URL(safe).hostname,status:response.status});return null;}
    const reader=response.body.getReader(),chunks=[];
    let length=0;
    try {while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1048576){await reader.cancel();return null;}chunks.push(value);}}
    finally {reader.releaseLock();}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let encoded='';for(let i=0;i<bytes.length;i+=8192)encoded+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return `data:${type};base64,${btoa(encoded)}`;
  } catch(error) {console.warn('Discord card image unavailable',{host:new URL(safe).hostname,error:error.name,message:String(error.message).replace(/https?:\/\/\S+/g,'[image URL]').slice(0,180)});return null;}
}
export async function renderDiscordPlayerCard(card,env) {
  const [logo,portrait]=await Promise.all([boundedImage(card.l,env),boundedImage(card.i,env),initialized]);
  const renderer=new Resvg(discordPlayerCardSvg(card,{logo,portrait}),{font:{fontBuffers:[new Uint8Array(font)],defaultFontFamily:'Barlow'},fitTo:{mode:'original'}});
  let image;
  try {image=renderer.render();return {png:image.asPng().slice(),imagesComplete:(!card.l || Boolean(logo)) && (!card.i || Boolean(portrait))};}
  finally {image?.free();renderer.free();}
}
