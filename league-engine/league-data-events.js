(() => {
  'use strict';
  const HQ=window.FranchiseHQ;
  if(!HQ?.defineModuleService) throw new Error('platform/core.js must load before league-data-events.js.');
  const EVENT_NAME='league:dataUpdated';
  const listeners=new Set();
  const clone=(v)=>v==null?v:(typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v)));
  function publishLeagueDataUpdated(detail={}){
    const payload=Object.freeze({event:EVENT_NAME,reason:detail.reason||'import-completed',source:detail.source||'madden-companion',snapshotId:detail.snapshotId||null,importId:detail.importId||null,season:detail.season??null,week:detail.week??null,timestamp:new Date().toISOString(),simulated:detail.simulated===true});
    listeners.forEach(fn=>{try{fn(clone(payload));}catch(e){console.error('[leagueDataEvents] subscriber failed',e);}});
    HQ.events?.emit?.(EVENT_NAME,payload,{source:'leagueDataEvents'});
    window.dispatchEvent(new CustomEvent(`franchisehq:${EVENT_NAME}`,{detail:payload}));
    return payload;
  }
  function subscribeToLeagueDataUpdated(listener,options={}){ if(typeof listener!=='function') throw new TypeError('League data listener must be a function.'); listeners.add(listener); if(options.immediate===true) listener(Object.freeze({event:EVENT_NAME,reason:'subscription-ready',timestamp:new Date().toISOString()})); return ()=>listeners.delete(listener); }
  function diagnostics(){ return Object.freeze({service:'leagueDataEvents',version:'5.9.0.4',eventName:EVENT_NAME,subscriberCount:listeners.size,browserCompatibilityEvent:`franchisehq:${EVENT_NAME}`}); }
  const service=HQ.defineModuleService('league','leagueDataEvents',{EVENT_NAME,publishLeagueDataUpdated,subscribeToLeagueDataUpdated,diagnostics},{replace:true,alias:'leagueDataEvents'});
  HQ.manifest?.register?.({scope:'module',module:'league',id:'league-data-events',service:'leagueDataEvents',script:'league-engine/league-data-events.js',version:'5.9.0.4',dependencies:[],capabilities:['league-data-updated-event','shared-refresh-subscriptions','browser-event-compatibility']});
})();
