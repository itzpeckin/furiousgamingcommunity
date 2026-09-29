export default {
  async scheduled(_event,env){
    if(!/^[a-f0-9]{64}$/.test(env.COACHING_SCANNER_SECRET||''))throw new Error('Coaching scanner credential is unavailable.');
    // Pages cannot be used as a service-binding target. This fixed destination
    // uses an independent server credential; user cookies are never forwarded.
    const origin=env.FHQ_ORIGIN;
    if(!['https://franchisehq.app','https://staging.franchise-hq.pages.dev'].includes(origin))throw new Error('Invalid scanner destination.');
    let processed=0;
    for(let index=0;index<8;index++){
      const response=await fetch(`${origin}/api/internal/coaching-scan`,{method:'POST',
        headers:{'x-fhq-coaching-scanner':env.COACHING_SCANNER_SECRET},redirect:'manual',signal:AbortSignal.timeout(180000)});
      // Workers rejects redirect:'error'. Manual mode also prevents the scanner
      // credential being forwarded to a redirect destination; all 3xx fail below.
      if(!response.ok)throw new Error(`Coaching scanner endpoint returned HTTP ${response.status}.`);
      const result=await response.json();
      if(!result.ok)throw new Error('Coaching scanner could not finish; the saved check will retry.');
      if(result.idle)break;
      if(result.processed)processed++;
    }
    console.log(JSON.stringify({event:'coaching-scan-tick',processed}));
  },
  fetch(){return new Response('Not found',{status:404});}
};
