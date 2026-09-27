import { verifiedDiscordGameCard } from '../../_lib/discord-game-card.js';
import { renderDiscordGameCard } from '../../_lib/discord-player-card-renderer.js';
export async function onRequestGet({request,env,waitUntil}){
  const url=new URL(request.url),card=await verifiedDiscordGameCard(env,url);
  if(!card)return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  try{
    const canonical=new URL(url.pathname,url.origin);
    canonical.searchParams.set('card',url.searchParams.get('card'));canonical.searchParams.set('sig',url.searchParams.get('sig'));
    const cache=globalThis.caches?.default,key=new Request(canonical),cached=await cache?.match(key);
    if(cached)return cached;
    const {png,imagesComplete}=await renderDiscordGameCard(card,env);
    const response=new Response(png,{headers:{'Content-Type':'image/png','Cache-Control':imagesComplete?'public, max-age=604800, immutable':'public, max-age=60','X-Content-Type-Options':'nosniff'}});
    if(cache&&waitUntil)waitUntil(cache.put(key,response.clone()).catch(()=>{}));
    return response;
  }catch(error){console.error('Game card rendering failed',{error:error.name});return new Response('Card unavailable',{status:503,headers:{'Cache-Control':'no-store'}});}
}
