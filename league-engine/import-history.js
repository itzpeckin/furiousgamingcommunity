(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before import-history.js.');
  const STORAGE_KEY = 'franchisehq.import.history.v1';
  const MAX_RECORDS = 100;
  let records = [];
  const clone = (v) => v == null ? v : (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
  const freeze = (v) => Object.freeze(v);
  const now = () => new Date().toISOString();
  function persist(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); return true; }catch(e){ console.warn('[importHistory] persistence unavailable',e); return false; } }
  function hydrate(){ try{ const raw=localStorage.getItem(STORAGE_KEY); const parsed=raw?JSON.parse(raw):[]; records=Array.isArray(parsed)?parsed.slice(0,MAX_RECORDS):[]; }catch(_){ records=[]; } }
  function normalize(input={}){
    return freeze({
      id: input.id || input.importId || `import-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      importId: input.importId || null,
      source: input.source || 'madden-companion',
      snapshotId: input.snapshotId || null,
      snapshotVersion: input.snapshotVersion || null,
      season: input.season ?? null,
      week: input.week ?? null,
      startedAt: input.startedAt || now(),
      completedAt: input.completedAt || null,
      status: input.status || 'started',
      warnings: Number(input.warnings || 0),
      validationErrors: freeze([...(input.validationErrors || [])]),
      failureReason: input.failureReason || null,
      simulated: input.simulated === true
    });
  }
  function add(input={}){ const record=normalize(input); records=[record,...records.filter(x=>x.id!==record.id)].slice(0,MAX_RECORDS); persist(); HQ.events?.emit?.('import:history-updated',{record,count:records.length}); return clone(record); }
  function update(id, patch={}){ const current=records.find(x=>x.id===id || x.importId===id); if(!current) return add({...patch,id}); return add({...current,...patch,id:current.id}); }
  function getImportHistory(options={}){ const limit=Number.isFinite(options.limit)?Math.max(0,options.limit):MAX_RECORDS; return freeze(records.slice(0,limit).map(clone)); }
  function getLatestImport(){ return records.length?clone(records[0]):null; }
  function clear(){ records=[]; try{localStorage.removeItem(STORAGE_KEY);}catch(_){} HQ.events?.emit?.('import:history-updated',{record:null,count:0}); return diagnostics(); }
  function simulate(options={}){ const started=now(); const id=options.importId||`simulation-${Date.now()}`; return add({id,importId:id,source:options.source||'development-simulation',season:options.season??2027,week:options.week??4,startedAt:started,completedAt:now(),status:options.fail?'failed':'successful',failureReason:options.fail?'Simulated validation failure.':null,validationErrors:options.fail?['Simulated validation failure.']:[],simulated:true,snapshotId:options.fail?null:`snapshot-${Date.now()}`,snapshotVersion:options.fail?null:records.length+1}); }
  function diagnostics(){ return freeze({service:'leagueImportHistory',version:'5.9.0.4a',recordCount:records.length,maxRecords:MAX_RECORDS,persistence:'localStorage',latestStatus:records[0]?.status||null}); }
  hydrate();
  const service=HQ.defineModuleService('league','leagueImportHistory',{add,update,getImportHistory,getLatestImport,clear,simulate,diagnostics},{replace:true,alias:'leagueImportHistory'});
  HQ.manifest?.register?.({scope:'module',module:'league',id:'league-import-history',service:'leagueImportHistory',script:'league-engine/import-history.js',version:'5.9.0.4a',dependencies:[],capabilities:['persistent-import-history','latest-import','success-and-failure-records','bounded-history']});
})();
