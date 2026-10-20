const number=value=>value===null||value===undefined||value===''?null:
  Number.isFinite(Number(value))?Math.max(0,Number(value)):null;

export function discordCooldown(response,detail={}){
  // retry_after is the actual rejection delay. A bucket reset may be much later.
  return number(detail.retry_after)??number(response.headers.get('retry-after'))??5;
}

export async function coordinateDiscord(env,input){
  if(!env?.FRANCHISE_IMPORT_WORKER?.fetch)return null;
  const response=await env.FRANCHISE_IMPORT_WORKER.fetch('https://franchise-import.internal/discord/pacing',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input),
    signal:AbortSignal.timeout(5000)
  });
  if(!response.ok)throw Object.assign(new Error('Discord scheduling coordinator is temporarily unavailable; retrying automatically.'),{status:503,retryAfterSeconds:5});
  return response.json();
}

export function discordPacedFetch(env,fetchImpl=fetch,{onWait=()=>{},deadlineAt=Infinity}={}){
  let digest;
  return async(url,options)=>{
    if(Date.now()>=deadlineAt)throw Object.assign(new Error('Scheduling checkpoint reached; continuing automatically.'),{status:429,retryAfterSeconds:0.1,rateLimitScope:'checkpoint'});
    if(!env?.FRANCHISE_IMPORT_WORKER?.fetch)return fetchImpl(url,options);
    digest??=crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(env.DISCORD_BOT_TOKEN||'')))
      .then(value=>Array.from(new Uint8Array(value),v=>v.toString(16).padStart(2,'0')).join(''));
    const path=new URL(url).pathname;
    const major=path.match(/\/(channels|guilds)\/(\d+)/)?.slice(1).join(':')||'other';
    const route=`${major}:${options?.method||'GET'}:${path.replace(/\d+/g,':id')}`;
    const input={credential:await digest,route,major,owner:crypto.randomUUID()};
    const admitted=await coordinateDiscord(env,{...input,action:'reserve'});
    if(!admitted.granted){
      const retryAfterSeconds=admitted.scope==='in-flight'?0.25:admitted.retryAfterSeconds;
      onWait({scope:admitted.scope,retryAfterSeconds});
      throw Object.assign(new Error('Discord pacing is waiting; scheduling will resume automatically.'),{status:429,retryAfterSeconds,rateLimitScope:admitted.scope});
    }
    let response;
    try{
      response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(Math.max(1,Math.min(20000,Math.floor(deadlineAt-Date.now()))))});
    }catch(error){
      await coordinateDiscord(env,{...input,action:'observe',status:0}).catch(()=>{});
      throw error;
    }
    const detail=response.status===429?await response.clone().json().catch(()=>({})):{};
    const retryAfterSeconds=response.status===429?discordCooldown(response,detail):null;
    await coordinateDiscord(env,{...input,action:'observe',status:response.status,
      bucket:response.headers.get('x-ratelimit-bucket'),remaining:number(response.headers.get('x-ratelimit-remaining')),
      resetAfterSeconds:number(response.headers.get('x-ratelimit-reset-after')),
      retryAfterSeconds,global:detail.global===true});
    if(response.status===429)onWait({scope:detail.global?'global':'bucket',retryAfterSeconds,provider:true});
    return response;
  };
}
