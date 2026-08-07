(function(){
  'use strict';
  const VERSION='5.9.3.1';
  const HQ=window.FranchiseHQ=window.FranchiseHQ||{};
  let latest=null,lastError=null,busy=false;
  function tenant(){return HQ.leagueTenant;}
  function endpoint(){return `/api/leagues/${encodeURIComponent(tenant().current().slug)}/companion/classify`;}
  async function request(method){
    const response=await fetch(endpoint(),{method,headers:{accept:'application/json','content-type':'application/json'},credentials:'same-origin',cache:'no-store',body:method==='POST'?'{}':undefined});
    const payload=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
    if(!response.ok||payload.ok===false)throw new Error(payload.detail||payload.error||`Dataset classification failed (${response.status}).`);
    latest=payload;lastError=null;rerender();return JSON.parse(JSON.stringify(payload));
  }
  function refresh(){return request('GET');}
  function classify(){return request('POST');}
  function getReport(){return latest?JSON.parse(JSON.stringify(latest)):null;}
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function fmtBytes(v){const b=Number(v||0);if(b<1024)return`${b} B`;if(b<1048576)return`${(b/1024).toFixed(1)} KB`;return`${(b/1048576).toFixed(1)} MB`;}
  function tone(confidence){return confidence==='high'?'success':confidence==='medium'?'warning':'neutral';}
  function renderDataset(item,index){
    const collections=(item.collections||[]).map(c=>`${c.path} (${c.count})`).join(', ')||'None detected';
    const fields=(item.collections||[]).flatMap(c=>c.sampleKeys||[]).filter((v,i,a)=>a.indexOf(v)===i).slice(0,24);
    return `<details class="card dataset-inspection-item" ${index===0?'open':''}><summary><div><strong>${esc(item.datasetLabel)}</strong><span>${esc(item.routePath)}</span></div><div><span class="pill pill--${tone(item.confidence)}">${esc(item.confidence)} confidence</span><span>${Number(item.recordCount||0).toLocaleString()} records</span></div></summary><div class="league-import-framework-grid"><div><span>Method</span><strong>${esc(item.requestMethod)}</strong></div><div><span>Payload Size</span><strong>${fmtBytes(item.byteLength)}</strong></div><div><span>Parsed</span><strong>${item.parsed?'Yes':'No'}</strong></div><div><span>Root Type</span><strong>${esc(item.rootType)}</strong></div><div><span>Top-Level Fields</span><strong>${(item.topLevelKeys||[]).length}</strong></div><div><span>Collections</span><strong>${(item.collections||[]).length}</strong></div></div><p><strong>Top-level keys:</strong> ${esc((item.topLevelKeys||[]).join(', ')||'None')}</p><p><strong>Collections:</strong> ${esc(collections)}</p><p><strong>Representative fields:</strong> ${esc(fields.join(', ')||'None detected')}</p></details>`;
  }
  function renderPanel(){
    const datasets=latest?.datasets||[];
    const inspected=latest?.inspectedRouteCount||0;
    const captured=latest?.capturedRouteCount||0;
    const summary=latest?.classificationSummary||{};
    return `<article class="card" data-companion-dataset-classification-panel><div class="card-header"><div><span class="eyebrow">v5.9.3.1 · Payload inspection</span><h3>Dataset Classification</h3><p>Reads the private route captures, identifies the likely Madden dataset type, and reports only safe structural metadata.</p></div><span class="pill pill--${inspected?'success':'neutral'}">${inspected?`${inspected} Inspected`:'Not Run'}</span></div><div class="league-import-framework-grid"><div><span>Captured Routes</span><strong>${captured}</strong></div><div><span>Inspected Routes</span><strong>${inspected}</strong></div><div><span>Teams</span><strong>${summary.teams||0}</strong></div><div><span>Players / Rosters</span><strong>${summary['players-rosters']||0}</strong></div><div><span>Standings</span><strong>${summary.standings||0}</strong></div><div><span>Unknown</span><strong>${summary.unknown||0}</strong></div></div><div class="league-import-framework-actions"><button class="button button--primary" data-run-dataset-classification ${busy?'disabled':''}>${busy?'Inspecting…':'Classify Latest Export'}</button><button class="button button--ghost" data-refresh-dataset-classification ${busy?'disabled':''}>Refresh Report</button></div><div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span>Raw Madden payloads remain private in R2. This report cannot activate or modify the live league snapshot.</span></div><h4>Discovered Datasets</h4>${datasets.length?datasets.map(renderDataset).join(''):'<p class="league-import-status-note">Run classification after a successful Madden export.</p>'}<p class="league-import-status-note">${esc(lastError||'No raw payload content is returned to the browser.')}</p></article>`;
  }
  function rerender(){const panel=document.querySelector('[data-companion-dataset-classification-panel]');if(panel)panel.outerHTML=renderPanel();}
  document.addEventListener('click',async event=>{
    const run=event.target.closest('[data-run-dataset-classification]');
    const refreshButton=event.target.closest('[data-refresh-dataset-classification]');
    if(!run&&!refreshButton)return;
    busy=true;rerender();
    try{if(run)await classify();else await refresh();}catch(error){lastError=error.message;}finally{busy=false;rerender();}
  });
  function diagnostics(){return Object.freeze({service:'leagueCompanionDatasetClassification',version:VERSION,reportAvailable:Boolean(latest),capturedRouteCount:latest?.capturedRouteCount||0,inspectedRouteCount:latest?.inspectedRouteCount||0,rawPayloadExposed:false,activationPerformed:false,lastError});}
  if(!HQ.defineModuleService)throw new Error('platform/core.js must load before companion-dataset-classification.js.');
  HQ.defineModuleService('league','leagueCompanionDatasetClassification',{endpoint,refresh,classify,getReport,renderPanel,diagnostics},{replace:true,alias:'leagueCompanionDatasetClassification'});
})();
