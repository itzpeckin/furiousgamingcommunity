// Request-scoped pacing follows Discord route/bucket keys plus the major channel.
// Unrelated message creation and membership routes do not inherit each other's cooldown.
import { discordCooldown } from './discord-pacing.js';
export function scheduleFetch(fetchImpl,{now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),maxWaitMs=Infinity}={}){
  const queues=new Map(),blockedUntil=new Map(),buckets=new Map();
  let globalUntil=0;
  return async(url,options)=>{
    const path=new URL(url).pathname,channel=path.match(/\/channels\/(\d+)/)?.[1]||'other';
    const route=`${options?.method||'GET'}:${path.replace(/(\/channels\/\d+).*$/,match=>match.replace(/\d+/g,':id'))}`;
    const fallback=`${channel}:${route}`;
    const key=()=>buckets.get(fallback)||fallback;
    const prior=Promise.all([queues.get(fallback),queues.get(key())].filter(Boolean).map(p=>p.catch(()=>{})));
    const work=prior.catch(()=>{}).then(async()=>{
      const delay=Math.max(globalUntil,blockedUntil.get(key())||0)-now();
      if(delay>maxWaitMs)throw Object.assign(new Error('Discord is temporarily rate limited; scheduling will resume automatically.'),{status:429,retryAfterSeconds:delay/1000});
      if(delay>0)await sleep(delay);
      const response=await fetchImpl(url,options);
      const header=name=>response.headers?.get?.(name);
      const bucket=header('x-ratelimit-bucket');
      if(bucket){
        const learned=`${channel}:bucket:${bucket}`;
        buckets.set(fallback,learned);
        if(!queues.has(learned))queues.set(learned,queues.get(fallback)||work);
      }
      let seconds=Number(header('x-ratelimit-reset-after'));
      if(response.status===429){
        const detail=await response.clone().json().catch(()=>({}));
        seconds=discordCooldown(response,detail);
        if(detail.global===true&&Number.isFinite(seconds))globalUntil=now()+Math.max(0,seconds)*1000+25;
      }
      if((header('x-ratelimit-remaining')==='0'||response.status===429)&&Number.isFinite(seconds))
        blockedUntil.set(key(),now()+Math.max(0,seconds)*1000+25);
      return response;
    });
    queues.set(fallback,work);
    queues.set(key(),work);
    return work;
  };
}
