(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService || !HQ.leagueSchema) throw new Error('League schema must load before repository.js.');

  const states=new Map();
  const deepFreeze=(value,seen=new WeakSet())=>{if(!value||typeof value!=='object'||seen.has(value))return value;seen.add(value);Object.getOwnPropertyNames(value).forEach(key=>deepFreeze(value[key],seen));return Object.freeze(value)};
  const copy=value=>value==null?value:structuredClone(value);
  const tenantKey=()=>String(HQ?.leagueTenant?.current?.()?.id||HQ?.leagueTenant?.current?.()?.slug||'unresolved');
  function state(){const key=tenantKey();if(!states.has(key))states.set(key,{current:null,previous:null,installedAt:null});return states.get(key)}
  function install(snapshot,options={}){
    if(!snapshot||typeof snapshot!=='object')throw new TypeError('A validated Madden snapshot is required.');
    if(options.validated!==true)throw new Error('League snapshots may only be installed after validation.');
    if(snapshot.source?.source!=='madden')throw new Error('Only Madden-authoritative snapshots may become official league state.');
    const s=state();s.previous=s.current;s.current=deepFreeze(copy(snapshot));s.installedAt=new Date().toISOString();
    window.dispatchEvent(new CustomEvent('franchisehq:league-snapshot-installed',{detail:{leagueId:tenantKey(),importId:s.current.source.importId,installedAt:s.installedAt}}));return s.current;
  }
  function current(){return state().current} function previous(){return state().previous} function hasSnapshot(){return Boolean(state().current)} function exportSnapshot(){return copy(state().current)}
  function diagnostics(){const s=state();return Object.freeze({service:'leagueRepository',version:'6.1.0',tenantKey:tenantKey(),tenantCount:states.size,readOnly:true,authority:'madden',hasSnapshot:hasSnapshot(),importId:s.current?.source?.importId||null,importedAt:s.current?.source?.importedAt||null,installedAt:s.installedAt,previousImportId:s.previous?.source?.importId||null,crossTenantSharedState:false})}
  const service=HQ.defineModuleService('league','leagueRepository',{install,current,previous,hasSnapshot,exportSnapshot,diagnostics},{replace:true,alias:'leagueRepository'});
  HQ.manifest?.register?.({scope:'module',module:'league',id:'league-repository',service:'leagueRepository',script:'league-engine/repository.js',version:'6.1.0',dependencies:['leagueSchema','leagueTenant'],capabilities:['immutable-snapshot','last-valid-snapshot','read-only-access','tenant-scoped-memory']});
})();
