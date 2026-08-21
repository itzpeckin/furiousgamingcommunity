(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  const VERSION = '5.9.10.6.5.4';
  const STAGES = [
    ['discover','Discover Latest Companion Captures'],
    ['storage-preflight','Prepare Import Storage'],
    ['map-teams','Map Teams'],
    ['reconstruct-player-lifecycle','Reconstruct Player Lifecycle'],
    ['map-players','Map Players'],
    ['map-schedule','Map Schedule'],
    ['map-statistics','Map Statistics'],
    ['build-snapshot','Build Snapshot'],
    ['validate-snapshot','Validate Snapshot'],
    ['activate-snapshot','Activate Snapshot'],
    ['detect-transactions','Detect Roster Movements'],
    ['classify-transactions','Classify Transactions'],
    ['reconcile-transactions','Reconcile Transactions'],
    ['verify-active-snapshot','Verify Live Snapshot'],
    ['publish-transactions','Publish Transactions & Free Agents']
  ];

  let busy = false;
  let run = null;
  let stageState = {};
  let lastError = null;
  let progress = '';
  let snapshotId = null;
  let importStartedAt = null;
  let importCompletedAt = null;
  let stageTimings = {};
  let currentStageStartedAt = {};
  let lastCertification = null;
  let deltaPlan = null;

  const nowMs = () => (window.performance?.now?.() ?? Date.now());
  const isoNow = () => new Date().toISOString();

  function timingStart(stage) {
    currentStageStartedAt[stage] = {ms:nowMs(), at:isoNow()};
    stageTimings[stage] = {
      ...(stageTimings[stage] || {}),
      stage,
      startedAt: currentStageStartedAt[stage].at,
      completedAt: null,
      durationMs: null,
      durationSeconds: null,
      state:'running'
    };
  }

  function timingFinish(stage,state='complete') {
    const start=currentStageStartedAt[stage];
    if(!start)return;
    const duration=Math.max(0,Math.round(nowMs()-start.ms));
    stageTimings[stage]={
      ...(stageTimings[stage]||{}),
      completedAt:isoNow(),
      durationMs:duration,
      durationSeconds:Number((duration/1000).toFixed(2)),
      state
    };
    delete currentStageStartedAt[stage];
  }

  function timingSummary() {
    const rows=STAGES.map(([id])=>stageTimings[id]).filter(Boolean);
    const totalMs=rows.reduce((sum,row)=>sum+Number(row.durationMs||0),0);
    const wallMs=importStartedAt
      ? Math.max(0,Math.round((importCompletedAt?.ms ?? nowMs())-importStartedAt.ms))
      : 0;
    return {
      release:VERSION,
      startedAt:importStartedAt?.at||null,
      completedAt:importCompletedAt?.at||null,
      totalStageDurationMs:totalMs,
      totalStageDurationSeconds:Number((totalMs/1000).toFixed(2)),
      wallClockDurationMs:wallMs,
      wallClockDurationSeconds:Number((wallMs/1000).toFixed(2)),
      stages:rows
    };
  }

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const account = () => window.FGC_TRADE?.getCurrentAccount?.() || null;
  const slug = () => HQ?.leagueTenant?.getCurrentLeague?.()?.slug || document.querySelector('meta[name="franchise-hq-league-slug"]')?.content || 'furious-gaming-community';
  const base = () => `/api/leagues/${encodeURIComponent(slug())}/companion/`;
  const headers = () => ({accept:'application/json','content-type':'application/json','x-franchisehq-platform-owner-account-id':String(account()?.id||'')});

  async function api(url, method='GET', body) {
    const response = await fetch(url, {
      method,
      headers: headers(),
      credentials: 'same-origin',
      cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({ok:false,error:`HTTP ${response.status}`}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.detail || payload.error || `Import request failed (${response.status}).`);
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  const orchestrator = (method='GET', body) => api(`${base()}import-orchestrator`, method, body);
  const forwardDetection = (method='POST', body) => api(`/api/leagues/${encodeURIComponent(slug())}/transactions/forward-detection`, method, body);
  const transactionClassification = (method='POST', body) => api(`/api/leagues/${encodeURIComponent(slug())}/transactions/classification`, method, body);
  const canonicalTransactions = (method='POST', body) => api(`/api/leagues/${encodeURIComponent(slug())}/transactions/canonical`, method, body);
  const importCertification = (method='GET', body) => api(`${base()}import-certification`, method, body);
  const changeCheck = () => api(`${base()}change-check`,'GET');
  const importJob = (method='GET', body, id='') => api(`${base()}import-job${id?`?id=${encodeURIComponent(id)}`:''}`,method,body);
  const JOB_KEY = () => `franchisehq:import-job:${slug()}`;
  const workflowDone = status => ['complete','completed','failed','errored','terminated','cancelled'].includes(String(status||'').toLowerCase());

  function applyServerRun(serverRun){
    if(!serverRun)return;
    run=serverRun;
    const states=serverRun.stageState||serverRun.stage_state||serverRun.stages||{};
    for(const [id] of STAGES){
      const row=states?.[id];
      if(row){
        stageState[id]={state:row.ok===false?'failed':'complete',detail:row.summary||'',at:row.at||new Date().toISOString()};
      }else if(serverRun.currentStage===id||serverRun.current_stage===id){
        stageState[id]={state:'running',detail:'Running on Franchise HQ servers…',at:new Date().toISOString()};
      }
    }
  }

  async function monitorServerJob(id,{silent=false}={}){
    if(!id)return null;
    busy=true;
    if(!silent){
      progress='Import started on Franchise HQ servers · you may lock your phone or close this page';
      rerender(); renderImportNotification();
    }
    let guard=0;
    while(guard<7200){
      const status=await importJob('GET',undefined,id);
      const ws=status?.workflowStatus||{};
      const serverRun=status?.orchestrator?.run||null;
      applyServerRun(serverRun);
      const state=String(ws.status||'running').toLowerCase();
      if(serverRun?.snapshotId||serverRun?.snapshot_id)snapshotId=serverRun.snapshotId||serverRun.snapshot_id;
      if(workflowDone(state)){
        localStorage.removeItem(JOB_KEY());
        busy=false;
        if(state==='complete'||state==='completed'){
          progress=ws?.output?.noNewExport
            ? 'No new Madden Companion export detected · nothing to import'
            : 'Import complete · server-side job finished successfully';
          try{await HQ?.liveSnapshotBoot?.boot?.({force:true});}catch(_){}
          try{window.dispatchEvent(new CustomEvent('franchisehq:one-click-import-complete',{detail:{snapshotId,serverSide:true}}));}catch(_){}
        }else{
          lastError=new Error(ws?.error?.message||ws?.error||`Server-side import ${state}.`);
          progress='Import stopped safely on the server.';
        }
        rerender(); renderImportNotification();
        return status;
      }
      const current=serverRun?.currentStage||serverRun?.current_stage;
      progress=current?`Import running on server · ${stageLabel(current)}`:'Import running on Franchise HQ servers…';
      rerender(); renderImportNotification();
      await new Promise(resolve=>setTimeout(resolve,1500));
      guard++;
    }
    throw new Error('Import status monitoring exceeded the local display window. The server-side import may still be running.');
  }

  async function reconnectServerJob(){
    const id=localStorage.getItem(JOB_KEY());
    if(!id||busy)return;
    try{await monitorServerJob(id,{silent:true});}
    catch(error){console.warn('[Server Import Monitor]',error);}
  }

  function setStage(id, state, detail='') {
    const previous=stageState[id]?.state;
    if(state==='running' && previous!=='running')timingStart(id);
    if((state==='complete'||state==='failed') && previous==='running')timingFinish(id,state);
    stageState[id] = {state, detail, at:new Date().toISOString()};
    rerender();
    renderImportNotification();
  }

  function stageIcon(id) {
    const state = stageState[id]?.state || 'pending';
    return state === 'complete' ? '✓' : state === 'running' ? '→' : state === 'failed' ? '!' : '○';
  }

  function stageClass(id) {
    const state = stageState[id]?.state || 'pending';
    return state === 'complete' ? 'success' : state === 'failed' ? 'danger' : state === 'running' ? 'warning' : 'neutral';
  }

  function stageLabel(id) {
    return STAGES.find(([stage])=>stage===id)?.[1] || id;
  }

  function activeStage() {
    return STAGES.find(([id])=>stageState[id]?.state==='running')?.[0] || null;
  }

  function ensureImportNotification() {
    let node=document.querySelector('[data-franchise-import-notification]');
    if(node)return node;
    node=document.createElement('div');
    node.setAttribute('data-franchise-import-notification','');
    node.className='franchise-import-notification';
    node.setAttribute('aria-live','polite');
    document.body.appendChild(node);
    return node;
  }

  function renderImportNotification() {
    const node=ensureImportNotification();
    const current=activeStage();
    if(!busy && !lastError && !importCompletedAt){
      node.className='franchise-import-notification';
      node.innerHTML='';
      return;
    }
    let title='Importing Franchise';
    let detail=current?stageLabel(current):(progress||'Preparing import…');
    let state='running';
    if(lastError){
      title='Import Stopped';
      detail=lastError.message||'The import could not be completed.';
      state='error';
    }else if(!busy&&importCompletedAt){
      title='Franchise Updated';
      detail=`Import complete · ${timingSummary().wallClockDurationSeconds}s`;
      state='success';
    }
    node.className=`franchise-import-notification is-visible is-${state}`;
    node.innerHTML=`<span class="franchise-import-notification__indicator" aria-hidden="true"></span><span><strong>${esc(title)}</strong><small>${esc(detail)}</small></span>`;
  }

  async function report(stage, ok, extra={}) {
    if (!run?.id) return null;
    const payload = await orchestrator('POST', {action:'report', runId:run.id, stage, ok, ...extra});
    run = payload.run || run;
    return payload;
  }

  async function skipReportedStage(stage,summary){
    setStage(stage,'running','Reusing unchanged LIVE data…');
    setStage(stage,'complete',summary);
    await report(stage,true,{summary,reused:true});
    return {ok:true,reused:true,summary};
  }

  async function runSimpleStage(stage, endpoint, summaryFn) {
    setStage(stage,'running','Working…');
    try {
      const payload = await api(`${base()}${endpoint}`,'POST',{});
      const summary = summaryFn ? summaryFn(payload) : null;
      setStage(stage,'complete',summary || 'Complete');
      await report(stage,true,{summary});
      return payload;
    } catch (error) {
      setStage(stage,'failed',error.message);
      await report(stage,false,{error:{message:error.message,detail:error.payload||null}}).catch(()=>{});
      throw error;
    }
  }

  async function runStatistics() {
    const stage='map-statistics';
    setStage(stage,'running','Starting chunked statistics map…');
    try {
      let payload = await api(`${base()}map-statistics`,'POST',{action:'start'});
      const statsRunId = payload.mappingRun?.id;
      if (!statsRunId) throw new Error('Statistics mapper did not return a run ID.');
      let guard=0;
      while (!payload.complete && guard < 5000) {
        const p=payload.progress||{};
        const next=p.next||{};
        const routeText=p.total?`${Math.min((p.done||0)+1,p.total)}/${p.total}`:'processing';
        const recText=next.recordTotal?` · ${next.recordOffset||0}/${next.recordTotal} records`:'';
        const cat=next.category?` · ${next.category}`:'';
        const week=next.weekIndex!=null?` · week ${next.weekIndex}`:'';
        progress=`Statistics ${routeText}${cat}${week}${recText}`;
        stageState[stage]={state:'running',detail:progress};
        rerender();
        payload = await api(`${base()}map-statistics`,'POST',{action:'next',runId:statsRunId});
        guard++;
      }
      if (guard >= 5000) throw new Error('Statistics mapping stopped after 5000 chunks.');
      const final = await api(`${base()}map-statistics`,'GET');
      const failedRoutes=Number(final.progress?.failed ?? final.delta?.failedRoutes ?? 0);
      if(failedRoutes>0){
        const names=(final.failedRoutes||[]).map(row=>row.routePath).filter(Boolean);
        throw Object.assign(new Error(`${failedRoutes} statistics route(s) failed mapping${names.length?`: ${names.join(', ')}`:''}. Snapshot build has been blocked to prevent stale/partial weekly statistics from going LIVE.`),{payload:final});
      }
      const count=final.mappingRun?.recordCount ?? payload.mappingRun?.recordCount ?? 0;
      const delta=final.delta||payload.delta||payload.deltaPlan||{};
      const skipped=Number(delta.skippedRoutes||0);
      const changed=Number(delta.processedRoutes??delta.changedOrNewRoutes??0);
      const summary=`${count} new/changed statistics records mapped · ${skipped} route(s) skipped${changed?` · ${changed} route(s) processed`:''}`;
      setStage(stage,'complete',summary);
      await report(stage,true,{summary,statisticsMappingRunId:statsRunId});
      return final;
    } catch (error) {
      setStage(stage,'failed',error.message);
      await report(stage,false,{error:{message:error.message,detail:error.payload||null}}).catch(()=>{});
      throw error;
    }
  }

  async function buildSnapshot() {
    const stage='build-snapshot';
    setStage(stage,'running','Building immutable snapshot…');
    try {
      const payload=await api(`${base()}build-snapshot`,'POST',{});
      snapshotId=payload.snapshot?.snapshotId || payload.snapshotId || null;
      if (!snapshotId) throw new Error('Snapshot Builder completed without returning a Snapshot ID.');
      const counts=payload.snapshot?.counts||{};
      const summary=`${snapshotId} · ${counts.teams??'?'} teams · ${counts.players??'?'} players · ${counts.games??'?'} games · ${counts.statistics??'?'} stats`;
      setStage(stage,'complete',summary);
      await report(stage,true,{summary,snapshotId});
      return payload;
    } catch(error) {
      setStage(stage,'failed',error.message);
      await report(stage,false,{error:{message:error.message,detail:error.payload||null}}).catch(()=>{});
      throw error;
    }
  }

  async function lifecycle(stage, action) {
    setStage(stage,'running',`${action==='validate'?'Starting batched validation':'Activating'} snapshot…`);
    try {
      if (!snapshotId) throw new Error('No new Snapshot ID is available.');

      let payload;
      if (action==='validate') {
        payload=await api(`${base()}snapshot-lifecycle`,'POST',{action:'validate-start',snapshotId});
        let guard=0;
        while (!payload.complete && guard < 500) {
          const job=payload.validationJob||{};
          const phase=job.phase||'validation';
          const offset=Number(job.phaseOffset||0);
          const total=Number(job.phaseTotal||0);
          progress=`Snapshot validation · ${phase} ${total?`${Math.min(offset,total)}/${total}`:'processing'}`;
          stageState[stage]={state:'running',detail:progress};
          rerender();
          payload=await api(`${base()}snapshot-lifecycle`,'POST',{action:'validate-next',snapshotId,limit:250});
          guard++;
        }
        if (guard>=500) throw new Error('Snapshot validation stopped after 500 batches.');
      } else {
        payload=await api(`${base()}snapshot-lifecycle`,'POST',{action,snapshotId});
      }

      const record=(payload.snapshots||[]).find(s=>String(s.snapshotId)===String(snapshotId));
      if (action==='validate' && record?.validationStatus && record.validationStatus!=='ready') {
        throw Object.assign(new Error(`Snapshot validation returned ${record.validationStatus}.`),{payload:record.validationReport||payload.report||record});
      }
      if (action==='activate' && payload.activeSnapshotId && String(payload.activeSnapshotId)!==String(snapshotId)) {
        throw new Error('Snapshot activation did not move the live pointer to the new snapshot.');
      }
      const summary=action==='validate'?`Validation ready${record?.validationScore!=null?` · ${record.validationScore}%`:''}`:`LIVE · ${snapshotId}`;
      setStage(stage,'complete',summary);
      await report(stage,true,{summary,snapshotId});
      return payload;
    } catch(error) {
      setStage(stage,'failed',error.message);
      await report(stage,false,{error:{message:error.message,detail:error.payload||null}}).catch(()=>{});
      throw error;
    }
  }

  async function detectTransactions() {
    const stage='detect-transactions';
    setStage(stage,'running','Starting batched roster comparison…');
    try {
      let payload=await forwardDetection('POST',{action:'start'});
      let job=payload.job||{};
      if (payload.complete) {
        const summary=job.status==='baseline'
          ? `Baseline established · ${job.currentTotal||0} players`
          : `${job.movementCount||0} movement(s) detected`;
        setStage(stage,'complete',summary);
        await report(stage,true,{summary,snapshotId});
        return payload;
      }
      let guard=0;
      while (!payload.complete && guard < 20) {
        job=payload.job||job||{};
        const total=(job.currentTotal||0)+(job.exitTotal||0);
        const compared=job.comparedCount||0;
        progress=`Roster comparison ${compared}/${total||'?'} · ${job.movementCount||0} movement(s)`;
        stageState[stage]={state:'running',detail:progress};
        rerender();
        payload=await forwardDetection('POST',{action:'next',limit:750});
        guard++;
      }
      if (guard>=20) throw new Error('Forward transaction detection stopped after 20 accelerated batches.');
      job=payload.job||{};
      const summary=`${job.movementCount||0} movement(s) · ${job.teamChanges||0} team change(s) · ${job.rosterEntries||0} entries · ${job.rosterExits||0} exits`;
      setStage(stage,'complete',summary);
      await report(stage,true,{summary,snapshotId});
      return payload;
    } catch(error) {
      setStage(stage,'failed',error.message);
      await report(stage,false,{error:{message:error.message,detail:error.payload||null}}).catch(()=>{});
      throw error;
    }
  }

  async function classifyTransactions() {
    const stage='classify-transactions';
    setStage(stage,'running','Classifying roster movement evidence…');
    try {
      const payload=await transactionClassification('POST',{action:'classify'});
      const s=payload.summary||{};
      const summary=payload.baseline
        ? 'Baseline · no classification required'
        : `${payload.classifiedCount||0} classified · ${s.teamChanges||0} team change(s) · ${s.rosterEntries||0} entries · ${s.rosterExits||0} exits`;
      setStage(stage,'complete',summary);
      await report(stage,true,{summary,snapshotId});
      return payload;
    } catch(error) {
      setStage(stage,'failed',error.message);
      await report(stage,false,{error:{message:error.message,detail:error.payload||null}}).catch(()=>{});
      throw error;
    }
  }

  async function reconcileTransactions() {
    const stage='reconcile-transactions';
    setStage(stage,'running','Reconciling lifecycle evidence into the canonical transaction ledger…');
    try {
      // Capture-history finalization already merges Release / Signing / Team Change /
      // roster-status evidence into the canonical ledger. Re-running it here is
      // idempotent and places reconciliation in the exact orchestrator stage order.
      const payload=await canonicalTransactions('POST',{action:'capture-lifecycle-finalize'});
      const summary=`${Number(payload?.eventCount||0)} lifecycle event(s) · ${Number(payload?.signings||0)} signing(s) · ${Number(payload?.releases||0)} release(s) · ${Number(payload?.teamChanges||0)} team change(s)`;
      setStage(stage,'complete',summary);
      await report(stage,true,{summary,snapshotId});
      return payload;
    } catch(error) {
      setStage(stage,'failed',error.message);
      await report(stage,false,{error:{message:error.message,detail:error.payload||null}}).catch(()=>{});
      throw error;
    }
  }

  async function verify() {
    const stage='verify-active-snapshot';
    setStage(stage,'running','Verifying active snapshot…');
    try {
      const payload=await api(`${base()}snapshot-verification`,'GET');
      const active=payload.snapshot?.id || payload.snapshot?.snapshotId || payload.activeSnapshotId || null;
      if (active && snapshotId && String(active)!==String(snapshotId)) throw new Error(`Verification returned a different active snapshot (${active}).`);
      const status=payload.integrity?.status || 'verified';
      const score=payload.integrity?.score;
      if (String(status).toLowerCase()==='fail') throw Object.assign(new Error('Active snapshot verification failed.'),{payload});
      const summary=`${status}${score!=null?` · ${score}%`:''}`;
      setStage(stage,'complete',summary);
      await report(stage,true,{summary,snapshotId});
      try { await HQ?.liveSnapshotBoot?.boot?.({force:true}); } catch (_) {}
      return payload;
    } catch(error) {
      setStage(stage,'failed',error.message);
      await report(stage,false,{error:{message:error.message,detail:error.payload||null}}).catch(()=>{});
      throw error;
    }
  }

  async function reconstructPlayerLifecycle(){
    const stage='reconstruct-player-lifecycle';
    setStage(stage,'running','Reconstructing roster history before Player Mapping…');
    try{
      const plan=await canonicalTransactions('POST',{action:'capture-lifecycle-plan'});
      const pending=(plan.sessions||[]).filter(row=>!row.processed);
      let processed=0;
      for(const session of pending){
        progress=`Lifecycle history ${processed+1}/${pending.length} · ${session.sessionId}`;
        stageState[stage]={state:'running',detail:progress};
        rerender();
        await canonicalTransactions('POST',{action:'capture-lifecycle-session',sessionId:session.sessionId});
        processed++;
      }
      const finalized=await canonicalTransactions('POST',{action:'capture-lifecycle-finalize'});
      const freeAgents=Number(finalized?.freeAgents?.currentFreeAgents||0);
      const events=Number(finalized?.eventCount||0);
      const summary=`${events} lifecycle event(s) · ${freeAgents} preserved Free Agent(s) · ${processed} new roster session(s) processed`;
      setStage(stage,'complete',summary);
      return {...finalized,processedSessions:processed};
    }catch(error){
      setStage(stage,'failed',error.message);
      throw error;
    }
  }

  async function publishTransactions(){
    const stage='publish-transactions';
    setStage(stage,'running','Confirming canonical transaction ledger and Free Agent state…');
    try{
      const lifecycle=await canonicalTransactions('POST',{action:'capture-lifecycle-finalize'});
      const payload=await canonicalTransactions('GET');
      const freeAgents=Number(lifecycle?.freeAgents?.currentFreeAgents||0);
      const events=Number(lifecycle?.eventCount||0);
      const transactions=Number(payload?.transactions?.length ?? payload?.canonical?.transactions?.length ?? payload?.count ?? 0);
      const summary=`${transactions} canonical transaction(s) · ${events} lifecycle event(s) · ${freeAgents} Free Agent(s)`;
      setStage(stage,'complete',summary);
      try{
        if(typeof window.FranchiseHQ?.playerLiveSync?.refresh==='function')await window.FranchiseHQ.playerLiveSync.refresh();
      }catch(_){}
      return {canonical:payload,lifecycle};
    }catch(error){
      setStage(stage,'failed',error.message);
      throw error;
    }
  }

  async function certifyCompletedImport() {
    if(lastError||!snapshotId)return null;
    const timing=timingSummary();
    let playerSync=null;
    try {
      const service=window.FranchiseHQ?.playerLiveSync;
      if(service?.refresh)playerSync=await service.refresh();
      else if(service?.status)playerSync=service.status();
    } catch(error) {
      console.warn('[Import Certification] Player service synchronization check could not run.',error);
    }

    const payload=await importCertification('POST',{
      snapshotId,
      runId:run?.id||null,
      timing,
      playerSync
    });
    lastCertification=payload.certification||null;
    window.__FHQ_IMPORT_CERTIFICATION__=lastCertification;
    console.info('[Import Performance Certification]',lastCertification);
    return lastCertification;
  }

  async function runImport() {
    if(busy)return;
    busy=true; lastError=null; progress='Starting server-side import…'; snapshotId=null; stageState={}; lastCertification=null; deltaPlan=null;
    stageTimings={}; currentStageStartedAt={};
    importStartedAt={ms:nowMs(),at:isoNow()}; importCompletedAt=null;
    rerender(); renderImportNotification();
    try{
      const started=await importJob('POST',{});
      const id=started?.id;
      if(!id)throw new Error('Server-side importer did not return a Workflow ID.');
      localStorage.setItem(JOB_KEY(),id);
      progress='Import accepted by Franchise HQ servers · you may lock your phone now';
      rerender(); renderImportNotification();
      await monitorServerJob(id);
    }catch(error){
      lastError=error;
      busy=false;
      progress='Import could not be started or monitored.';
      console.error('[Server-Side Import]',error.payload||error);
      rerender(); renderImportNotification();
    }finally{
      importCompletedAt={ms:nowMs(),at:isoNow()};
    }
  }


  function renderPanel() {
    const completed=STAGES.filter(([id])=>stageState[id]?.state==='complete').length;
    const current=activeStage();
    const status=lastError?'Stopped':busy?(current?stageLabel(current):'Importing…'):importCompletedAt?'Complete':'Ready';
    const lastSeconds=importCompletedAt?timingSummary().wallClockDurationSeconds:null;
    return `<section class="card commissioner-live-import-card" data-one-click-import-panel>
      <div class="card-header">
        <div><span class="eyebrow">Madden Companion</span><h2>Import Franchise</h2><p>Import the latest Madden Companion data into Franchise HQ. Your current LIVE league remains active until the new import passes validation.</p></div>
        <span class="pill pill--${lastError?'danger':busy?'warning':importCompletedAt?'success':'accent'}">${esc(status)}</span>
      </div>
      <div class="commissioner-live-import-summary">
        <span><small>Release</small><strong>${esc(VERSION)}</strong></span>
        <span><small>Status</small><strong>${busy?`${completed}/${STAGES.length} complete`:status}</strong></span>
        ${lastSeconds!=null?`<span><small>Last Run</small><strong>${esc(lastSeconds)}s</strong></span>`:''}
      </div>
      <div class="commissioner-import-actions">
        <button class="button button--primary" data-run-one-click-import ${busy?'disabled':''}><svg><use href="#icon-refresh"></use></svg>${busy?'Import Running…':'Import Latest Madden Data'}</button>
      </div>
      ${lastError?`<div class="validation-errors"><p><strong>${esc(lastError.message)}</strong></p>${lastError.payload?`<pre style="white-space:pre-wrap;max-height:220px;overflow:auto">${esc(JSON.stringify(lastError.payload,null,2))}</pre>`:''}</div>`:''}
      <div class="league-import-framework-note"><svg><use href="#icon-lock"></use></svg><span>Franchise HQ will show a small notification with the current import task. No stage-by-stage interaction is required.</span></div>
    </section>`;
  }

  function rerender() {
    document.querySelectorAll('[data-one-click-import-panel]').forEach(node=>node.outerHTML=renderPanel());
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-run-one-click-import]');
    if(!button)return;
    event.preventDefault();
    runImport();
  });

  function diagnostics(){return Object.freeze({
    service:'oneClickImport',
    version:VERSION,
    busy,
    runId:run?.id||null,
    snapshotId,
    stageState:{...stageState},
    deltaPlan:deltaPlan?{
      changedRouteCount:Number(deltaPlan.changedRouteCount||0),
      changedByClass:deltaPlan.changedByClass||{},
      rosterChanged:Boolean(deltaPlan.rosterChanged),
      canReusePlayers:Boolean(deltaPlan.canReusePlayers),
      reusablePlayerPreviewCount:Number(deltaPlan.reusablePlayerPreviewCount||0)
    }:null,
    lastError:lastError?.message||null
  });}
  if(!HQ?.defineModuleService)throw new Error('platform/core.js must load before one-click-import.js.');
  HQ.defineModuleService('platform','oneClickImport',{runImport,renderPanel,diagnostics,renderImportNotification},{replace:true,alias:'oneClickImport'});

  window.FranchiseHQ=window.FranchiseHQ||{};
  window.FranchiseHQ.importCertification={
    release:VERSION,
    last:()=>lastCertification||window.__FHQ_IMPORT_CERTIFICATION__||null,
    refresh:async()=>{
      const payload=await importCertification('GET');
      lastCertification=payload.certification||null;
      window.__FHQ_IMPORT_CERTIFICATION__=lastCertification;
      return lastCertification;
    }
  };

  window.FranchiseHQ.importTiming={
    release:VERSION,
    current:()=>timingSummary(),
    last:()=>window.__FHQ_IMPORT_TIMING__||null,
    reset:()=>{
      stageTimings={};
      currentStageStartedAt={};
      importStartedAt=null;
      importCompletedAt=null;
      window.__FHQ_IMPORT_TIMING__=null;
      return true;
    }
  };

  setTimeout(()=>reconnectServerJob(),250);
})();
