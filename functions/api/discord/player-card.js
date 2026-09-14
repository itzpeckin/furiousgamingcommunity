import { verifiedDiscordPlayerCard } from '../../_lib/discord-player-card.js';
import { renderDiscordPlayerCard } from '../../_lib/discord-player-card-renderer.js';

export async function onRequestGet({request,env,waitUntil}) {
  // Self-contained signed public presentation: no anonymous database access or roster enumeration.
  const card=await verifiedDiscordPlayerCard(env,new URL(request.url));
  if(!card)return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  try {
    const url=new URL(request.url),canonical=new URL(url.pathname,url.origin);
    canonical.searchParams.set('card',url.searchParams.get('card'));canonical.searchParams.set('sig',url.searchParams.get('sig'));
    const cache=globalThis.caches?.default,cacheKey=new Request(canonical,{method:'GET'});
    const cached=await cache?.match(cacheKey);if(cached)return cached;
    const {png,imagesComplete}=await renderDiscordPlayerCard(card,env);
    const response=new Response(png,{headers:{'Content-Type':'image/png','Cache-Control':imagesComplete?'public, max-age=604800, immutable':'public, max-age=60','X-Content-Type-Options':'nosniff'}});
    if(cache && waitUntil)waitUntil(cache.put(cacheKey,response.clone()).catch(()=>{}));
    return response;
  } catch(error) {
    console.error('Discord card rendering failed',{error:error.name});
    return new Response('Card rendering temporarily unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
