(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before import-framework-ui.js.');
  const VERSION = '5.9.0.5';
  const CERT_KEY = 'franchisehq.import.framework.certification.v1';
  let running = false;
  let lastCertification = null;
  const wait = (ms) => new Promise(resolve => window.setTimeout(resolve, ms));
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  try { const raw=localStorage.getItem(CERT_KEY); lastCertification=raw?JSON.parse(raw):null; } catch (_) {}
  function services(){ return {state:HQ.leagueImportState,importer:HQ.leagueImportService,snapshots:HQ.leagueSnapshotManager,validation:HQ.leagueValidationEngine,history:HQ.leagueImportHistory,events:HQ.leagueDataEvents}; }
  function status(){ const s=services(); return Object.freeze({version:VERSION,running,importState:s.importer?.getImportStatus?.()||s.state?.get?.()||null,snapshot:s.snapshots?.diagnostics?.()||null,validation:s.validation?.diagnostics?.()||null,history:s.history?.diagnostics?.()||null,events:s.events?.diagnostics?.()||null,latest:s.history?.getLatestImport?.()||null,lastCertification}); }
  async function simulateSuccess(options={}){
    if(running) throw new Error('An import simulation is already running.'); running=true; renderMounted();
    const s=services(), importId=`ui-success-${Date.now()}`, startedAt=new Date().toISOString();
    try{
      s.state.begin({importId,source:'development-ui-simulation',metadata:{simulated:true}}); renderMounted(); await wait(options.delay??250);
      s.state.validating({metadata:{simulated:true}}); renderMounted(); await wait(options.delay??250);
      const data={source:{source:'development-ui-simulation',importId},season:options.season??2027,week:options.week??4,teams:[{id:'TEAM-1',name:'Certification Team'}],players:[{id:'PLAYER-1',teamId:'TEAM-1',position:'QB'}]};
      const candidate=s.snapshots.createSnapshot(data,{source:'development-ui-simulation',season:data.season,week:data.week});
      const validation=s.validation.validateSnapshot(candidate.id,{rejectOnFailure:true});
      if(!validation.valid) throw new Error(validation.errors?.[0]?.message||'Simulation validation failed.');
      s.state.buildingSnapshot({metadata:{simulated:true,candidateId:candidate.id}}); renderMounted(); await wait(options.delay??250);
      const active=s.snapshots.activateSnapshot(candidate.id,{validated:true,validation});
      const completed=s.state.complete({message:'Protected import simulation completed.',metadata:{simulated:true,snapshotId:active.id}});
      s.history.add({importId,source:'development-ui-simulation',snapshotId:active.id,snapshotVersion:active.version,season:data.season,week:data.week,startedAt,completedAt:new Date().toISOString(),status:'successful',warnings:validation.warningCount||0,simulated:true});
      s.events.publishLeagueDataUpdated({reason:'commissioner-simulation-completed',source:'development-ui-simulation',snapshotId:active.id,importId,season:data.season,week:data.week,simulated:true});
      return completed;
    }catch(error){ s.state.fail(error,{metadata:{simulated:true}}); s.history.add({importId,source:'development-ui-simulation',startedAt,completedAt:new Date().toISOString(),status:'failed',failureReason:error.message,validationErrors:[error.message],simulated:true}); throw error; }
    finally{ running=false; renderMounted(); }
  }
  async function simulateFailure(options={}){
    if(running) throw new Error('An import simulation is already running.'); running=true; renderMounted();
    const s=services(), importId=`ui-failure-${Date.now()}`, startedAt=new Date().toISOString(), activeBefore=s.snapshots.getActiveSnapshot?.()?.id||null;
    try{
      s.state.begin({importId,source:'development-ui-failure',metadata:{simulated:true}}); renderMounted(); await wait(options.delay??250);
      s.state.validating({metadata:{simulated:true}}); renderMounted(); await wait(options.delay??250);
      const candidate=s.snapshots.createSnapshot({source:{source:'development-ui-failure',importId},season:null,week:null,teams:[{id:'DUP'},{id:'DUP'}],players:[{id:'P1',teamId:'UNKNOWN',position:'INVALID'}]},{source:'development-ui-failure'});
      const validation=s.validation.validateSnapshot(candidate.id,{rejectOnFailure:true});
      if(validation.valid) throw new Error('Forced failure unexpectedly passed validation.');
      const message=validation.errors?.[0]?.message||'Candidate snapshot failed validation.';
      s.state.fail(message,{metadata:{simulated:true,activeSnapshotPreserved:(s.snapshots.getActiveSnapshot?.()?.id||null)===activeBefore}});
      s.history.add({importId,source:'development-ui-failure',season:null,week:null,startedAt,completedAt:new Date().toISOString(),status:'failed',failureReason:message,validationErrors:(validation.errors||[]).map(x=>x.message||x.code),simulated:true});
      return Object.freeze({status:'failed',activeSnapshotPreserved:(s.snapshots.getActiveSnapshot?.()?.id||null)===activeBefore,validation});
    } finally { running=false; renderMounted(); }
  }
  function certify(){
    const s=services(); const checks={importState:Boolean(s.state?.diagnostics),importService:Boolean(s.importer?.diagnostics),snapshotManager:Boolean(s.snapshots?.diagnostics),validationEngine:Boolean(s.validation?.diagnostics),importHistory:Boolean(s.history?.diagnostics),leagueDataEvents:Boolean(s.events?.diagnostics),eventContract:s.events?.diagnostics?.().eventName==='league:dataUpdated',protectedSnapshots:s.snapshots?.diagnostics?.().guardedActivation===true,automaticRejection:s.validation?.diagnostics?.().automaticCandidateRejection===true,persistentHistory:s.history?.diagnostics?.().persistence==='localStorage'};
    const failures=Object.entries(checks).filter(([,ok])=>!ok).map(([name])=>name);
    lastCertification=Object.freeze({release:VERSION,certified:failures.length===0,checkedAt:new Date().toISOString(),checks:Object.freeze(checks),failures:Object.freeze(failures)});
    try{localStorage.setItem(CERT_KEY,JSON.stringify(lastCertification));}catch(_){}
    renderMounted(); return lastCertification;
  }
  function resetStatus(){ services().importer?.resetImportStatus?.({message:'Import framework is ready.'}); renderMounted(); }
  function clearSimulationHistory(){ services().history?.clear?.(); renderMounted(); }
  function renderPanel(){
    const x=status(), st=x.importState||{status:'unavailable',label:'Unavailable',progress:0,message:'Import state unavailable.'}, latest=x.latest, cert=x.lastCertification, active=x.snapshot?.activeSnapshotId||'None', records=x.history?.recordCount??0;
    const stateTone=st.status==='failed'?'danger':st.status==='completed'?'success':st.active?'accent':'neutral';
    const history=(services().history?.getImportHistory?.({limit:5})||[]).map(item=>`<article class="import-history-row"><span class="pill pill--${item.status==='successful'?'success':'danger'}">${escapeHtml(item.status)}</span><div><strong>${escapeHtml(item.source)}</strong><small>${item.season?`Season ${item.season}`:'No season'}${item.week!=null?` · Week ${item.week}`:''}</small></div><time>${escapeHtml(new Date(item.completedAt||item.startedAt).toLocaleString())}</time></article>`).join('')||'<div class="import-framework-empty">No import history yet.</div>';
    return `<article class="card league-import-framework-card league-import-framework-card--complete" data-import-framework-panel><div class="card-header"><div><span class="eyebrow">v5.9.0 complete foundation</span><h3>Madden Companion Import Framework</h3><p>The protected pipeline is installed, observable, and ready for the first real Companion dataset.</p></div><span class="pill pill--${cert?.certified?'success':'accent'}">${cert?.certified?'Certified':'Ready to certify'}</span></div><div class="import-framework-status"><div><span>Current State</span><strong>${escapeHtml(st.label||st.status)}</strong><small>${escapeHtml(st.message||'')}</small></div><div class="import-framework-progress"><span style="width:${Number(st.progress||0)}%"></span></div><span class="pill pill--${stateTone}">${Number(st.progress||0)}%</span></div><div class="league-import-framework-grid"><div><span>Import Engine</span><strong>Ready</strong></div><div><span>Snapshot Manager</span><strong>Ready</strong></div><div><span>Validation Engine</span><strong>Ready</strong></div><div><span>Import History</span><strong>Ready</strong></div><div><span>Refresh Events</span><strong>Ready</strong></div><div><span>Active Snapshot</span><strong title="${escapeHtml(active)}">${escapeHtml(active)}</strong></div><div><span>History Records</span><strong>${records}</strong></div><div><span>Latest Import</span><strong>${latest?escapeHtml(latest.status):'Never'}</strong></div><div><span>Source</span><strong>${latest?escapeHtml(latest.source):'None'}</strong></div><div><span>Release</span><strong>${VERSION}</strong></div></div><div class="import-framework-actions"><button class="button button--primary" data-import-framework-success ${running?'disabled':''}>Run Successful Import</button><button class="button button--ghost" data-import-framework-failure ${running?'disabled':''}>Run Failed Import</button><button class="button button--ghost" data-import-framework-reset>Reset Status</button><button class="button button--ghost" data-import-framework-certify>Run Certification</button></div>${cert?`<div class="league-import-framework-note ${cert.certified?'is-certified':'is-warning'}"><svg><use href="#${cert.certified?'icon-shield':'icon-info'}"></use></svg><span>${cert.certified?'All v5.9.0 foundation checks passed.':'Certification failed: '+escapeHtml(cert.failures.join(', '))}</span></div>`:''}<div class="import-framework-history"><div class="card-header"><div><span class="eyebrow">Persistent audit trail</span><h4>Import History</h4></div><button class="button button--ghost button--small" data-import-framework-clear-history>Clear Test History</button></div>${history}</div></article>`;
  }
  function renderMounted(){ document.querySelectorAll('[data-import-framework-panel]').forEach(el=>{el.outerHTML=renderPanel();}); }
  document.addEventListener('click', async e=>{ const btn=e.target.closest('[data-import-framework-success],[data-import-framework-failure],[data-import-framework-reset],[data-import-framework-certify],[data-import-framework-clear-history]'); if(!btn)return; e.preventDefault(); try{ if(btn.hasAttribute('data-import-framework-success')) await simulateSuccess(); else if(btn.hasAttribute('data-import-framework-failure')) await simulateFailure(); else if(btn.hasAttribute('data-import-framework-reset')) resetStatus(); else if(btn.hasAttribute('data-import-framework-certify')) certify(); else if(btn.hasAttribute('data-import-framework-clear-history')) clearSimulationHistory(); }catch(error){ console.error('[Import Framework UI]',error); renderMounted(); } },true);
  const service=HQ.defineModuleService('league','leagueImportFrameworkUI',{renderPanel,renderMounted,simulateSuccess,simulateFailure,certify,resetStatus,clearSimulationHistory,status,diagnostics:()=>Object.freeze({service:'leagueImportFrameworkUI',version:VERSION,running,lastCertification})},{replace:true,alias:'leagueImportFrameworkUI'});
  HQ.manifest?.register?.({scope:'module',module:'league',id:'league-import-framework-ui',service:'leagueImportFrameworkUI',script:'league-engine/import-framework-ui.js',version:VERSION,dependencies:['leagueImportState','leagueImportService','leagueSnapshotManager','leagueValidationEngine','leagueImportHistory','leagueDataEvents'],capabilities:['commissioner-import-status','success-simulation','failure-simulation','import-history-panel','framework-certification']});
})();
