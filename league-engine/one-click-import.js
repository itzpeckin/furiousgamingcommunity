(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  const VERSION = '5.9.10.6.3';
  const STAGES = [
    ['discover','Discover Latest Companion Captures'],
    ['storage-preflight','Prepare Import Storage'],
    ['map-teams','Map Teams'],
    ['map-players','Map Players'],
    ['map-schedule','Map Schedule'],
    ['map-statistics','Map Statistics'],
    ['build-snapshot','Build Snapshot'],
    ['validate-snapshot','Validate Snapshot'],
    ['activate-snapshot','Activate Snapshot'],
    ['detect-transactions','Detect Roster Movements'],
    ['classify-transactions','Classify Transactions'],
    ['verify-active-snapshot','Verify Live Snapshot']
  ];

  let busy = false;
  let run = null;
  let stageState = {};
  let lastError = null;
  let progress = '';
  let snapshotId = null;

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

  function setStage(id, state, detail='') {
    stageState[id] = {state, detail, at:new Date().toISOString()};
    rerender();
  }

  function stageIcon(id) {
    const state = stageState[id]?.state || 'pending';
    return state === 'complete' ? '✓' : state === 'running' ? '→' : state === 'failed' ? '!' : '○';
  }

  function stageClass(id) {
    const state = stageState[id]?.state || 'pending';
    return state === 'complete' ? 'success' : state === 'failed' ? 'danger' : state === 'running' ? 'warning' : 'neutral';
  }

  async function report(stage, ok, extra={}) {
    if (!run?.id) return null;
    const payload = await orchestrator('POST', {action:'report', runId:run.id, stage, ok, ...extra});
    run = payload.run || run;
    return payload;
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
      const count=final.mappingRun?.recordCount ?? payload.mappingRun?.recordCount ?? 0;
      const summary=`${count} statistics records mapped`;
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
          payload=await api(`${base()}snapshot-lifecycle`,'POST',{action:'validate-next',snapshotId,limit:75});
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
      while (!payload.complete && guard < 100) {
        job=payload.job||job||{};
        const total=(job.currentTotal||0)+(job.exitTotal||0);
        const compared=job.comparedCount||0;
        progress=`Roster comparison ${compared}/${total||'?'} · ${job.movementCount||0} movement(s)`;
        stageState[stage]={state:'running',detail:progress};
        rerender();
        payload=await forwardDetection('POST',{action:'next',limit:75});
        guard++;
      }
      if (guard>=100) throw new Error('Forward transaction detection stopped after 100 batches.');
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

  async function runImport() {
    if (busy) return;
    busy=true; lastError=null; progress='Preparing import…'; snapshotId=null; stageState={}; rerender();
    try {
      setStage('discover','running','Refreshing Companion capture discovery…');
      const discovery=await HQ?.leagueCompanionRouteDiscovery?.refresh?.();
      if (!discovery) throw new Error('Route Discovery service is unavailable.');
      if (!Number(discovery.routeCount||0)) throw new Error('No Madden Companion captures are available to import.');
      setStage('discover','complete',`${discovery.routeCount} captured routes discovered`);

      setStage('storage-preflight','running','Reclaiming disposable Madden import staging data…');
      const storage=await api(`${base()}storage-preflight`,'POST',{});
      const reclaimed=storage.reclaimed||{};
      const reclaimedRows=Object.values(reclaimed).reduce((sum,value)=>sum+Number(value||0),0);
      setStage('storage-preflight','complete',`${reclaimedRows} obsolete D1 row(s) reclaimed`);
      await report('storage-preflight',true,{summary:`${reclaimedRows} obsolete D1 row(s) reclaimed`}).catch(()=>{});

      const start=await orchestrator('POST',{action:'start'});
      run=start.run;
      await runSimpleStage('map-teams','map-teams',p=>`${p.teams?.length ?? p.mappingRun?.teamCount ?? '?'} teams mapped`);
      await runSimpleStage('map-players','map-players',p=>`${p.players?.length ?? p.mappingRun?.playerCount ?? '?'} players mapped`);
      await runSimpleStage('map-schedule','map-schedule',p=>`${p.games?.length ?? p.mappingRun?.gameCount ?? '?'} games mapped`);
      await runStatistics();
      await buildSnapshot();
      await lifecycle('validate-snapshot','validate');
      await lifecycle('activate-snapshot','activate');
      await detectTransactions();
      await classifyTransactions();
      await verify();
      progress=`Import complete · ${snapshotId} is LIVE`;
      try { window.dispatchEvent(new CustomEvent('franchisehq:one-click-import-complete',{detail:{snapshotId,runId:run?.id}})); } catch (_) {}
    } catch(error) {
      lastError=error;
      progress='Import stopped safely. The previous LIVE snapshot was not replaced unless activation had already completed.';
      console.error('[One-Click Import]',error.payload||error);
    } finally {
      busy=false; rerender();
    }
  }

  function renderPanel() {
    const completed=STAGES.filter(([id])=>stageState[id]?.state==='complete').length;
    const percent=Math.round((completed/STAGES.length)*100);
    return `<article class="card" data-one-click-import-panel>
      <div class="card-header"><div><span class="eyebrow">v${VERSION} · Commissioner import workflow</span><h3>Import Latest Madden Data</h3><p>One action maps the newest Companion captures, builds and validates a new immutable snapshot, activates it, runs roster movement detection in safe batches, and refreshes Franchise HQ.</p></div><span class="pill pill--${lastError?'danger':busy?'warning':completed===STAGES.length?'success':'neutral'}">${lastError?'Stopped':busy?`${percent}% Importing`:completed===STAGES.length?'LIVE':'Ready'}</span></div>
      <div style="height:8px;background:rgba(127,127,127,.16);border-radius:999px;overflow:hidden;margin:16px 0"><div style="height:100%;width:${percent}%;background:currentColor;transition:width .2s ease"></div></div>
      <div style="display:grid;gap:8px;margin:14px 0">${STAGES.map(([id,label])=>`<div style="display:grid;grid-template-columns:28px minmax(180px,.7fr) 1fr;gap:10px;align-items:center;padding:9px 10px;border:1px solid rgba(127,127,127,.14);border-radius:10px"><span class="pill pill--${stageClass(id)}" style="justify-content:center;min-width:26px">${stageIcon(id)}</span><strong>${esc(label)}</strong><small>${esc(stageState[id]?.detail||'Pending')}</small></div>`).join('')}</div>
      <div class="league-import-framework-actions"><button class="button button--primary" data-run-one-click-import ${busy?'disabled':''}>${busy?'Importing Madden Data…':'Import Latest Madden Data'}</button></div>
      ${progress?`<div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span>${esc(progress)}</span></div>`:''}
      ${snapshotId?`<p class="league-import-status-note"><strong>New Snapshot:</strong> ${esc(snapshotId)}</p>`:''}
      ${lastError?`<div class="validation-errors"><p><strong>${esc(lastError.message)}</strong></p>${lastError.payload?`<pre style="white-space:pre-wrap;max-height:260px;overflow:auto">${esc(JSON.stringify(lastError.payload,null,2))}</pre>`:''}</div>`:''}
      <div class="league-import-framework-note"><svg><use href="#icon-lock"></use></svg><span>Fail-safe behavior: the existing LIVE snapshot remains authoritative until the new snapshot passes validation and activation succeeds.</span></div>
    </article>`;
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

  function diagnostics(){return Object.freeze({service:'oneClickImport',version:VERSION,busy,runId:run?.id||null,snapshotId,stageState:{...stageState},lastError:lastError?.message||null});}
  if(!HQ?.defineModuleService)throw new Error('platform/core.js must load before one-click-import.js.');
  HQ.defineModuleService('platform','oneClickImport',{runImport,renderPanel,diagnostics},{replace:true,alias:'oneClickImport'});
})();
