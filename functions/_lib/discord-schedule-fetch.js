// Request-scoped limiter: independent thread channels may run concurrently,
// while calls to the same parent/thread serialize and honor Discord's headers.
export function scheduleFetch(fetchImpl,{now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  const queues=new Map(),blockedUntil=new Map();
  let globalUntil=0;
  return async(url,options)=>{
    const channel=new URL(url).pathname.match(/\/channels\/(\d+)/)?.[1]||'other';
    const prior=queues.get(channel)||Promise.resolve();
    const work=prior.catch(()=>{}).then(async()=>{
      const delay=Math.max(globalUntil,blockedUntil.get(channel)||0)-now();
      if(delay>0)await sleep(delay);
      const response=await fetchImpl(url,options);
      const header=name=>response.headers?.get?.(name);
      let seconds=Number(header('x-ratelimit-reset-after'));
      if(response.status===429){
        const detail=await response.clone().json().catch(()=>({}));
        seconds=Number(detail.retry_after??header('retry-after')??seconds);
        if(detail.global===true&&Number.isFinite(seconds))globalUntil=now()+Math.max(0,seconds)*1000+25;
      }
      if((header('x-ratelimit-remaining')==='0'||response.status===429)&&Number.isFinite(seconds))
        blockedUntil.set(channel,now()+Math.max(0,seconds)*1000+25);
      return response;
    });
    queues.set(channel,work);
    return work;
  };
}
