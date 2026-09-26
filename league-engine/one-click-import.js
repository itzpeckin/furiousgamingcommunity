/* FHQ_BUILD: 8.0.9 */
(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  const VERSION = '8.0.9';
  const PHASES = [
    ['analyze-source', 'Analyze Captured Export'],
    ['classify-captures', 'Classify Captures'],
    ['map-teams', 'Map 32 Teams'],
    ['map-players', 'Map Rostered Players'],
    ['map-schedule', 'Map Schedule'],
    ['map-statistics', 'Map Statistics'],
    ['build-candidate', 'Build Import Snapshot'],
    ['validate-candidate', 'Validate Import'],
    ['preview-ready', 'Make Import Live']
  ];

  let state = null;
  let busy = false;
  let errorMessage = '';
  let notice = '';
  let lastOutcome = null;
  let notificationTimer = null;

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[character]));
  const slug = () => HQ?.leagueTenant?.getCurrentLeague?.()?.slug || null;
  const base = () => `/api/leagues/${encodeURIComponent(slug())}/companion/`;
  const now = () => window.performance?.now?.() ?? Date.now();
  const exportUrlService = () => HQ?.leagueExportUrl || HQ?.platform?.leagueExportUrl || HQ?.getModuleService?.('platform','leagueExportUrl');
  const exportUrlDiagnostics = () => exportUrlService()?.diagnostics?.() || {};

  const phaseLabel = phase => PHASES.find(row=>row[0]===phase)?.[1] || 'Import setup';
  const routineWarning = value => /free agents?|rostered-player-only|carried forward|retained from|source snapshot/i.test(String(value||''));

  function failureGuidance(error={},phase=null) {
    const message=String(error?.message||'The import could not be completed.');
    const status=Number(error?.status||0);
    const endpoint=String(error?.endpoint||'');
    const run=currentRun();
    const runId=String(run?.id||'');
    const supportCode=runId ? `${runId.slice(0,12)} · ${phase||run?.currentPhase||'setup'}` : `setup · ${phase||'not-started'}`;
    const shared={
      tone:'error',
      detail:message,
      phase:phaseLabel(phase||run?.currentPhase),
      supportCode,
      runId:runId||null,
      endpoint:endpoint||null,
      status:status||null,
      preserved:true
    };
    if(status===401||status===403||/session expired|sign in|not authorized|unauthorized|forbidden/i.test(message))return{
      ...shared,title:'Sign in again to continue',
      summary:'Your commissioner session ended before the import could finish.',
      action:'Sign in with Discord, return to Commissioner HQ, and select Import Latest Export again.'
    };
    if(/no analyzed league export|no .*export is ready|selected ready export|exact capture session|recognized teams dataset|teams dataset|team-like record/i.test(message))return{
      ...shared,title:'The export is not ready',
      summary:'FranchiseHQ could not prove a complete League Info and player source for this franchise season.',
      action:'Export League Info and Weekly Stats to the same league URL. Include Rosters for the first snapshot of a season; later same-season imports may safely carry the live roster forward.'
    };
    if(/historical.*did not produce|week\/period backfill|schedule.*(?:missing|failed|unavailable)|statistics.*(?:missing|failed|unavailable)|missing week|coverage gap/i.test(message))return{
      ...shared,title:'Weekly game data is incomplete',
      summary:'The export did not contain both schedules and statistics for every week being added.',
      action:'Export the missing week—or All Weeks—with Weekly Stats enabled, wait for Ready to import, then try again.'
    };
    if(/active snapshot changed|live import.*refused|pointer.*changed|compare-and-swap/i.test(message))return{
      ...shared,title:'League data changed during the import',
      summary:'Another league update finished first, so FranchiseHQ stopped this import to avoid replacing newer data.',
      action:'Select Refresh in Commissioner HQ, confirm the latest export is still Ready to import, and try once more.'
    };
    if(/validation|duplicate|invalid assignment|not ready/i.test(message))return{
      ...shared,title:'The export did not pass validation',
      summary:'FranchiseHQ found data that could not be published safely.',
      action:'Open Import Details to review the failed phase. Export League Info and Weekly Stats again; include Rosters if no complete snapshot is already live for this season.'
    };
    if(status>=500||/network|failed to fetch|load failed|timed out|timeout|safety limit|HTTP 5\d\d/i.test(message))return{
      ...shared,title:'The importer could not finish',
      summary:'An import service request was interrupted. This does not establish a problem with your connection.',
      action:'Select Retry to resume the retained export. If it fails again, share the support code shown below.'
    };
    return{
      ...shared,title:'The import could not finish',
      summary:'FranchiseHQ stopped before publishing the new data.',
      action:'Select Retry once. If the same message returns, share the support code shown below.'
    };
  }

  function renderImportNotification(outcome=lastOutcome) {
    const existing=document.querySelector('[data-franchise-import-notification]');
    if(!outcome){existing?.remove();return false;}
    const node=existing||document.createElement('aside');
    node.className=`franchise-import-notification is-visible is-${outcome.tone||'running'}`;
    node.dataset.franchiseImportNotification='';
    node.setAttribute('role',outcome.tone==='error'?'alert':'status');
    node.setAttribute('aria-live',outcome.tone==='error'?'assertive':'polite');
    node.innerHTML=`<span class="franchise-import-notification__indicator" aria-hidden="true"></span><span><strong>${esc(outcome.title)}</strong><small>${esc(outcome.summary||'')}</small>${outcome.action?`<small><b>Next:</b> ${esc(outcome.action)}</small>`:''}</span><button type="button" class="franchise-import-notification__close" data-close-import-notification aria-label="Dismiss import notification">×</button>`;
    if(!existing)document.body.append(node);
    if(notificationTimer)clearTimeout(notificationTimer);
    if(outcome.tone==='success')notificationTimer=setTimeout(()=>node.remove(),8000);
    return true;
  }

  async function api(endpoint, method='GET', body) {
    const response = await fetch(`${base()}${endpoint}`, {
      method,
      credentials:'same-origin',
      cache:'no-store',
      headers:{accept:'application/json','content-type':'application/json'},
      body:body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({ok:false,error:`HTTP ${response.status}`}));
    if (!response.ok || payload.ok === false) {
      const failure = new Error(payload.detail || payload.error || `Candidate import request failed (${response.status}).`);
      failure.payload = payload;
      failure.status = response.status;
      failure.endpoint = endpoint;
      throw failure;
    }
    return payload;
  }

  async function refresh() {
    state = await api('candidate-import');
    rerender();
    return state;
  }

  async function refreshWorkspace() {
    if (busy) return state;
    busy = true;
    errorMessage = '';
    rerender();
    try {
      const connectionRefresh = exportUrlService()?.refresh?.();
      await Promise.all([refresh(), connectionRefresh || Promise.resolve()]);
      notice = 'Import readiness refreshed.';
      return state;
    } catch (error) {
      errorMessage = error.message;
      lastOutcome = failureGuidance(error,'analyze-source');
      renderImportNotification();
      throw error;
    } finally {
      busy = false;
      rerender();
    }
  }

  function currentRun() { return state?.run || null; }
  function counts() { return currentRun()?.resultCounts || currentRun()?.sourceCounts || state?.source?.counts || {}; }
  function durationLabel(ms) {
    if (ms === null || ms === undefined) return '—';
    return `${(Number(ms) / 1000).toFixed(2)}s`;
  }
  function countLabel(value) { return value === null || value === undefined ? 'unknown' : Number(value).toLocaleString(); }
  function dateLabel(value) {
    if (!value) return 'Not analyzed';
    const parsed=new Date(value);
    return Number.isNaN(parsed.valueOf()) ? String(value) : parsed.toLocaleString();
  }

  async function createDestination() {
    if (busy) return;
    busy = true;
    errorMessage = '';
    notice = 'Preparing the franchise-season import destination…';
    rerender();
    try {
      state = await api('candidate-import','POST',{action:'create-destination'});
      notice = state.created ? 'Franchise-season import destination prepared.' : 'Existing franchise-season destination selected.';
    } catch (error) {
      errorMessage = error.message;
      notice = '';
      lastOutcome=failureGuidance(error,'analyze-source');
      renderImportNotification();
    } finally {
      busy = false;
      rerender();
    }
    return state;
  }

  async function reportPhase(runId, phase, startedAt, result, extra={}) {
    state = await api('candidate-import','POST',{
      action:'report-phase',
      runId,
      phase,
      ok:true,
      durationMs:Math.max(0,Math.round(now()-startedAt)),
      totalDurationMs:extra.totalDurationMs,
      summary:extra.summary || 'Complete',
      counts:extra.counts || {},
      warnings:extra.warnings || [],
      teamMappingRunId:extra.teamMappingRunId,
      playerMappingRunId:extra.playerMappingRunId,
      scheduleMappingRunId:extra.scheduleMappingRunId,
      statisticsMappingRunId:extra.statisticsMappingRunId,
      candidateSnapshotId:extra.candidateSnapshotId
    });
    return result;
  }

  async function runPhase(runId, phase, work, summarize, wallStartedAt) {
    notice = `${PHASES.find(row=>row[0]===phase)?.[1] || phase}…`;
    rerender();
    const startedAt = now();
    try {
      const result = await work();
      const summary = summarize(result) || {};
      await reportPhase(runId, phase, startedAt, result, {
        ...summary,
        totalDurationMs:Math.max(0,Math.round(now()-wallStartedAt))
      });
      return result;
    } catch (error) {
      error.importPhase=phase;
      await api('candidate-import','POST',{
        action:'report-phase',runId,phase,ok:false,
        durationMs:Math.max(0,Math.round(now()-startedAt)),
        totalDurationMs:Math.max(0,Math.round(now()-wallStartedAt)),
        summary:error.message,error:{message:error.message}
      }).catch(()=>{});
      throw error;
    }
  }

  async function mapStatistics(discoverySessionId,candidateImportRunId) {
    let result = await api('map-statistics','POST',{action:'start',discoverySessionId,candidateImportRunId});
    const runId = result?.mappingRun?.id;
    if (!runId) throw new Error('Statistics mapper did not return its exact run ID.');
    let guard = 0;
    while (!result.complete && guard < 5000) {
      const progress = result.progress || {};
      notice = `Map Statistics · ${Number(progress.done||0).toLocaleString()}/${Number(progress.total||0).toLocaleString()} routes`;
      rerender();
      result = await api('map-statistics','POST',{action:'next',runId,batches:4});
      guard += 1;
    }
    if (!result.complete) throw new Error('Statistics mapping exceeded the 5,000-batch safety limit.');
    const final = await api('map-statistics');
    const failed = Number(final?.progress?.failed ?? final?.delta?.failedRoutes ?? 0);
    if (failed) throw new Error(`${failed} statistics route(s) failed; candidate build stopped safely.`);
    return {...final, mappingRun:{...(final.mappingRun||{}),id:runId}};
  }

  async function checkpointedBuildRequest(body) {
    let lastError=null;
    for(let attempt=0;attempt<3;attempt+=1){
      try{return await api('build-snapshot','POST',body);}
      catch(error){
        lastError=error;
        const retryable=!Number(error?.status||0)||Number(error.status)>=500;
        if(!retryable||attempt===2)throw error;
        await new Promise(resolve=>window.setTimeout(resolve,250*(attempt+1)));
      }
    }
    throw lastError||new Error('Checkpointed snapshot request failed.');
  }

  async function buildCandidate(candidateImportRunId,mappingRunIds) {
    let result=await checkpointedBuildRequest({
      action:'start',candidateImportRunId,...mappingRunIds
    });
    const snapshotId=result?.snapshot?.snapshotId;
    if(!snapshotId)throw new Error('Candidate builder did not return a snapshot ID.');
    let stalled=0;
    let priorCheckpoint=String(result?.buildJob?.checkpointToken||'');
    while(!result.complete){
      const job=result.buildJob||{};
      const total=Number.isFinite(Number(job.totalCount))&&Number(job.totalCount)>0
        ?Number(job.totalCount).toLocaleString():'planning';
      notice=`Build Import Snapshot · ${Number(job.processedCount||0).toLocaleString()}/${total} records · ${job.phase||'checkpoint'}`;
      rerender();
      result=await checkpointedBuildRequest({
        action:'next',candidateImportRunId,snapshotId,limit:500
      });
      const nextJob=result.buildJob||{};
      const checkpoint=String(nextJob.checkpointToken
        ||`${nextJob.phase||''}:${Number(nextJob.processedCount||0)}`);
      if(checkpoint===priorCheckpoint)stalled+=1;
      else stalled=0;
      if(stalled>=3)throw new Error('Candidate snapshot build stopped making progress at its durable checkpoint.');
      priorCheckpoint=checkpoint;
    }
    return result;
  }

  async function validateCandidate(snapshotId) {
    let result = await api('snapshot-lifecycle','POST',{action:'validate-start',snapshotId});
    let guard = 0;
    while (!result.complete && guard < 500) {
      const job = result.validationJob || {};
      notice = `Validate Candidate · ${Number(job.processedCount||0).toLocaleString()}/${Number(job.totalCount||0).toLocaleString()} records`;
      rerender();
      result = await api('snapshot-lifecycle','POST',{action:'validate-next',snapshotId,limit:500,batches:4});
      guard += 1;
    }
    if (!result.complete) throw new Error('Candidate validation exceeded the 500-batch safety limit.');
    const snapshot = (result.snapshots || []).find(item=>item.snapshotId===snapshotId);
    const report = result.report || snapshot?.validationReport || {};
    if (String(snapshot?.validationStatus || report.status || '').toLowerCase() !== 'ready' || Number(report.errorCount || snapshot?.errorCount || 0)) {
      throw new Error(`Candidate validation failed: ${(report.errors || []).slice(0,5).join(' | ') || 'not ready'}`);
    }
    return {...result,snapshot};
  }

  async function refreshLiveApplication(detail={}) {
    const startedAt=now();
    let refreshed=true;
    const liveData=HQ?.liveData || HQ?.league?.liveData || HQ?.getModuleService?.('league','liveData');
    try {
      if (typeof liveData?.refresh === 'function') await liveData.refresh();
    } catch (error) {
      refreshed=false;
      console.warn('[One-Click Import] Live data refresh failed after successful activation.',error);
    }
    const eventDetail={...detail,activationPerformed:true,applicationDataRefreshed:refreshed};
    window.dispatchEvent(new CustomEvent('franchisehq:one-click-import-complete',{detail:eventDetail}));
    window.dispatchEvent(new CustomEvent('franchisehq:league-import-live',{detail:eventDetail}));
    return {refreshed,durationMs:Math.max(0,Math.round(now()-startedAt))};
  }

  async function retainClientPerformance(runId,{clickToLiveMs,browserRefreshMs,browserRefreshOk}={}){
    try{
      const reported=await api('candidate-import','POST',{
        action:'record-performance',runId,clickToLiveMs,browserRefreshMs,browserRefreshOk
      });
      if(reported?.run)state=reported;
    }catch(error){
      console.warn('[One-Click Import] Performance timing could not be retained.',error);
    }
  }

  async function runImport({retry=false}={}) {
    if(busy)return;
    busy=true;
    errorMessage='';
    notice='Starting a durable league import…';
    lastOutcome={tone:'running',title:'Importing latest export',
      summary:'FranchiseHQ is processing the retained export in the background.'};
    renderImportNotification();
    rerender();
    const wallStartedAt=now();
    let workflowId=null,consecutivePollFailures=0;
    try{
      const started=await api('import-job','POST',{
        retry,sourceFingerprint:state?.source?.sourceFingerprint||''
      });
      workflowId=started.id;
      if(!workflowId)throw new Error('The background importer did not return a workflow ID.');
      for(let poll=0;poll<600;poll+=1){
        let progress;
        try{
          progress=await api(`import-job?id=${encodeURIComponent(workflowId)}`);
          consecutivePollFailures=0;
        }catch(error){
          consecutivePollFailures+=1;
          if(consecutivePollFailures>=5)throw new Error(
            'Import status temporarily unavailable. The background import may still be running; select Refresh before retrying.'
          );
          await new Promise(resolve=>window.setTimeout(resolve,1500));
          continue;
        }
        const durableRun=progress?.candidate?.run||null;
        const run=durableRun?{
          ...state?.run,...durableRun,currentPhase:durableRun.currentStage,
          phaseState:durableRun.stageState,candidateSnapshotId:durableRun.snapshotId,
          progress:Math.round(Number(durableRun.stageIndex||0)/(PHASES.length-1)*100)
        }:state?.run;
        if(durableRun)state={...state,run};
        notice=`${phaseLabel(run?.currentPhase)} · ${run?.progress??0}%`;
        rerender();
        const workflowState=String(progress.workflowState||'').toLowerCase();
        if(run?.activationPerformed&&['complete','completed'].includes(workflowState)){
          await refresh();
          const clickToLiveMs=Math.max(0,Math.round(now()-wallStartedAt));
          const refreshed=await refreshLiveApplication({runId:run.id,
            candidateSnapshotId:run.candidateSnapshotId,durationMs:clickToLiveMs,
            importMode:run.resultCounts?.importMode||state?.source?.coverage?.importMode});
          await retainClientPerformance(run.id,{clickToLiveMs,browserRefreshMs:refreshed.durationMs,
            browserRefreshOk:refreshed.refreshed});
          notice=`League data live in ${durationLabel(clickToLiveMs)}. Discord thread delivery is tracked separately.`;
          lastOutcome={tone:'success',title:'Import complete',summary:notice};
          renderImportNotification();
          return state;
        }
        if(['errored','failed','terminated','cancelled','canceled'].includes(workflowState)){
          const detail=progress.workflowStatus?.error;
          const error=new Error(run?.phaseState?.[run.currentPhase]?.summary
            ||(typeof detail==='string'?detail:detail?.message)
            ||'The background importer stopped before publication.');
          error.importPhase=run?.currentPhase||null;
          throw error;
        }
        if(workflowState==='complete'||workflowState==='completed'){
          throw new Error('The background importer completed without an active validated snapshot.');
        }
        await new Promise(resolve=>window.setTimeout(resolve,1500));
      }
      throw new Error('Import is still running after 15 minutes. Refresh for its latest status; do not export again.');
    }catch(error){
      await refresh().catch(()=>{});
      errorMessage=error.message;
      const monitoringInterrupted=/Import status temporarily unavailable|still running after 15 minutes/i.test(error.message);
      notice=monitoringInterrupted
        ?'The background import may still be running. Refresh to see the retained progress.'
        :'Import stopped safely. The previous live snapshot remains available.';
      lastOutcome=monitoringInterrupted
        ?{tone:'running',title:'Import status needs refresh',summary:notice,
          action:'Select Refresh, then Import Latest Export to reconnect to the same background job.'}
        :failureGuidance(error,error.importPhase||currentRun()?.currentPhase||null);
      renderImportNotification();
    }finally{
      busy=false;
      rerender();
    }
    return state;
  }

  async function runBrowserImport({retry=false}={}) {
    if (busy) return;
    busy = true;
    errorMessage = '';
    notice = 'Starting live league import…';
    lastOutcome={tone:'running',title:'Importing latest export',summary:'FranchiseHQ is checking and publishing the newest ready league data.'};
    renderImportNotification();
    rerender();
    const wallStartedAt = now();
    let runId = null;
    let sourceEligibilityMs = 0;
    try {
      const sourceEligibilityStartedAt=now();
      if (!state?.destination) {
        state = await api('candidate-import','POST',{action:'create-destination'});
        if (!state?.destination) throw new Error('The franchise-season import destination is unavailable.');
      }
      state = await api('candidate-import','POST',{action:'start',retry});
      sourceEligibilityMs=Math.max(0,Math.round(now()-sourceEligibilityStartedAt));
      runId = state?.run?.id;
      if (!runId) throw new Error('Candidate importer did not return a durable run ID.');
      if (state.warm && state.run?.status === 'preview-ready') {
        const elapsedBeforeActivation=Math.max(0,Math.round(now()-wallStartedAt));
        state=await api('candidate-import','POST',{action:'finalize',runId,durationMs:elapsedBeforeActivation,clientTimings:{sourceEligibilityMs}});
        const clickToLiveMs=Math.max(0,Math.round(now()-wallStartedAt));
        notice = `Validated import is live in ${durationLabel(clickToLiveMs)}.`;
        const refreshResult=await refreshLiveApplication({
          runId,candidateSnapshotId:state.run?.candidateSnapshotId,durationMs:clickToLiveMs,
          importMode:state.run?.resultCounts?.importMode||state.source?.coverage?.importMode
        });
        await retainClientPerformance(runId,{clickToLiveMs,browserRefreshMs:refreshResult.durationMs,browserRefreshOk:refreshResult.refreshed});
        if(!refreshResult.refreshed)notice+=' Live data will retry in the background without requiring a browser reload.';
        lastOutcome={tone:'success',title:'Import complete',summary:`The latest league data is live${clickToLiveMs?` in ${durationLabel(clickToLiveMs)}`:''}.`};
        renderImportNotification();
        return;
      }

      const discoverySessionId=state.source?.discoverySessionId;
      if (!discoverySessionId) throw new Error('The selected ready export does not have an exact capture session.');

      const analyzed = await runPhase(runId,'analyze-source',
        ()=>api('discovery-report','POST',{sessionId:discoverySessionId,reuseExisting:true}),
        payload=>({
          summary:`${Number(payload.report?.captureCount||0)} captures analyzed`,
          counts:{captures:Number(payload.report?.captureCount||0),routes:Number(payload.report?.routeCount||0)}
        }),wallStartedAt);

      await runPhase(runId,'classify-captures',()=>api('classify','POST',{discoverySessionId}),payload=>({
        summary:`${Number(payload.inspectedRouteCount||0)} captures classified`,
        counts:{classifiedCaptures:Number(payload.inspectedRouteCount||0)}
      }),wallStartedAt);

      const teams = await runPhase(runId,'map-teams',()=>api('map-teams','POST',{discoverySessionId}),payload=>({
        summary:`${Number(payload.mappingRun?.teamCount ?? payload.teams?.length ?? 0)} teams mapped`,
        counts:{teams:Number(payload.mappingRun?.teamCount ?? payload.teams?.length ?? 0)},
        teamMappingRunId:payload.mappingRun?.id
      }),wallStartedAt);

      const players = await runPhase(runId,'map-players',()=>api('map-players','POST',{compact:true,discoverySessionId,candidateImportRunId:runId}),payload=>{
        const count=Number(payload.mappingRun?.playerCount ?? payload.playerCount ?? 0);
        const freeAgentStatus=payload.rosterCarryForward?.freeAgentStatus
          || (payload.mappingCompleteness === 'complete' ? 'located' : (analyzed.report?.freeAgentEvidence?.status || 'missing'));
        const warnings=[...(payload.mappingRun?.warnings||[])];
        if (freeAgentStatus === 'blocked') warnings.push('Madden Free Agents are blocked upstream; count remains unknown.');
        return {
          summary:payload.rosterCarryForward ? `${count} players carried forward unchanged` : `${count} rostered players mapped`,
          counts:{players:count,rosteredPlayers:Number(payload.mappingRun?.rosteredCount ?? count),freeAgentStatus,
            freeAgentCount:['located','empty-confirmed'].includes(freeAgentStatus)?Number(payload.mappingRun?.freeAgentCount||0):null,
            rosterCarryForward:payload.rosterCarryForward||null},
          warnings,
          playerMappingRunId:payload.mappingRun?.id
        };
      },wallStartedAt);

      const schedule = await runPhase(runId,'map-schedule',()=>api('map-schedule','POST',{discoverySessionId,candidateImportRunId:runId}),payload=>({
        summary:`${Number(payload.mappingRun?.gameCount ?? payload.games?.length ?? 0)} games mapped`,
        counts:{games:Number(payload.mappingRun?.gameCount ?? payload.games?.length ?? 0)},
        warnings:payload.mappingRun?.warnings||[],
        scheduleMappingRunId:payload.mappingRun?.id
      }),wallStartedAt);

      const statistics = await runPhase(runId,'map-statistics',()=>mapStatistics(discoverySessionId,runId),payload=>({
        summary:`${Number(payload.mappingRun?.recordCount||0)} statistics mapped`,
        counts:{statistics:Number(payload.mappingRun?.recordCount||0)},
        warnings:payload.mappingRun?.warnings||[],
        statisticsMappingRunId:payload.mappingRun?.id
      }),wallStartedAt);

      const mappingRunIds={
        teamMappingRunId:teams.mappingRun?.id,
        playerMappingRunId:players.mappingRun?.id,
        scheduleMappingRunId:schedule.mappingRun?.id,
        statisticsMappingRunId:statistics.mappingRun?.id
      };
      const built = await runPhase(runId,'build-candidate',()=>buildCandidate(runId,mappingRunIds),payload=>({
        summary:`Import snapshot ${payload.snapshot?.snapshotId || 'built'}`,
        counts:payload.snapshot?.counts||{},
        warnings:payload.snapshot?.warnings||[],
        candidateSnapshotId:payload.snapshot?.snapshotId
      }),wallStartedAt);
      const snapshotId=built.snapshot?.snapshotId;
      if (!snapshotId) throw new Error('Candidate builder did not return a snapshot ID.');

      await runPhase(runId,'validate-candidate',()=>validateCandidate(snapshotId),payload=>({
        summary:'Import validation ready',
        counts:payload.snapshot?.counts||{},
        warnings:payload.snapshot?.warnings||[],
        candidateSnapshotId:snapshotId
      }),wallStartedAt);

      const elapsedBeforeActivation=Math.max(0,Math.round(now()-wallStartedAt));
      state = await api('candidate-import','POST',{action:'finalize',runId,durationMs:elapsedBeforeActivation,clientTimings:{sourceEligibilityMs}});
      const clickToLiveMs=Math.max(0,Math.round(now()-wallStartedAt));
      notice = clickToLiveMs < 60000
        ? `Import live in ${durationLabel(clickToLiveMs)}.`
        : `Import live in ${durationLabel(clickToLiveMs)}; review the sub-60-second performance target.`;
      const refreshResult=await refreshLiveApplication({
        runId,candidateSnapshotId:state.run?.candidateSnapshotId,durationMs:clickToLiveMs,
        importMode:state.run?.resultCounts?.importMode||state.source?.coverage?.importMode
      });
      await retainClientPerformance(runId,{clickToLiveMs,browserRefreshMs:refreshResult.durationMs,browserRefreshOk:refreshResult.refreshed});
      if(!refreshResult.refreshed)notice+=' Live data will retry in the background without requiring a browser reload.';
      lastOutcome={tone:'success',title:'Import complete',summary:`The latest league data is live in ${durationLabel(clickToLiveMs)}.`};
      renderImportNotification();
    } catch (error) {
      errorMessage = error.message;
      notice = 'Import stopped safely. The previous live snapshot was preserved.';
      lastOutcome=failureGuidance(error,error.importPhase||currentRun()?.currentPhase||null);
      renderImportNotification();
    } finally {
      busy = false;
      await refresh().catch(()=>rerender());
    }
    return state;
  }

  async function importLatestExport() {
    try{
      await refresh();
      if (!state?.source) throw new Error('No analyzed league export is ready to import.');
      if (!state.destination) await createDestination();
      if (!state?.destination) throw new Error('The franchise-season import destination is unavailable.');
      return runImport({retry:['failed','running'].includes(currentRun()?.status)});
    }catch(error){
      errorMessage=error.message;
      lastOutcome=failureGuidance(error,'analyze-source');
      renderImportNotification();
      rerender();
      throw error;
    }
  }

  function phaseRows() {
    const run=currentRun();
    const phaseState=run?.phaseState||{};
    return PHASES.map(([id,label])=>{
      const item=phaseState[id];
      const active=run?.status==='running'&&run?.currentPhase===id;
      const complete=id==='preview-ready'?run?.status==='preview-ready':item?.status==='complete';
      const failed=item?.status==='failed';
      const icon=complete?'✓':failed?'!':active?'→':'○';
      return `<li class="${complete?'is-complete':failed?'is-failed':active?'is-active':''}"><span>${icon}</span><div><strong>${esc(label)}</strong><small>${esc(item?.summary || (active?'In progress':'Pending'))}${item?.durationMs!=null?` · ${esc(durationLabel(item.durationMs))}`:''}</small></div></li>`;
    }).join('');
  }

  function importControlsState() {
    const run=currentRun(),source=state?.source,connection=exportUrlDiagnostics();
    setTimeout(()=>exportUrlService()?.ensurePolling?.(),0);
    const endpointState=connection.state?.endpoint||{},latestExport=connection.state?.latestExport||{};
    const exportStatus=latestExport.status||'loading';
    const latestExportLive=latestExport.importLive===true||latestExport.importStatus==='live';
    const exportStatusLabel=({loading:'Loading connection','awaiting-export':'Awaiting export',receiving:'Receiving export',ready:'Ready to import','review-required':'Review required',revoked:'URL revoked'})[exportStatus]||'Loading connection';
    const live=Boolean(run?.activationPerformed);
    const yearlyScheduleImport=connection.state?.yearlyScheduleImport||null;
    const yearlyActive=['collecting','ready'].includes(yearlyScheduleImport?.status);
    const runDisabled=busy||connection.busy||yearlyActive||exportStatus!=='ready'||!source||live||latestExportLive;
    const runLabel=busy||connection.busy?'Working…':yearlyActive?'Finish or Switch Schedule First':live||latestExportLive?'Latest Export Live':run?.status==='failed'?'Retry Candidate Import':'Import Latest Export';
    const activePhase=run?.currentPhase||(!source?'analyze-source':live?'preview-ready':'analyze-source');
    const activePhaseIndex=Math.max(0,PHASES.findIndex(([id])=>id===activePhase));
    const segment=100/PHASES.length,overall=Number(run?.progress||0),activeItem=run?.phaseState?.[activePhase];
    const phaseProgress=live||activeItem?.status==='complete'?100:Math.max(0,Math.min(99,Math.round((overall-activePhaseIndex*segment)/segment*100)));
    return {run,source,connection,endpointState,latestExport,exportStatus,latestExportLive,exportStatusLabel,live,yearlyScheduleImport,yearlyActive,runDisabled,runLabel,activePhase,phaseProgress};
  }

  function renderCompactPanel() {
    const {run,source,connection,endpointState,latestExport,exportStatus,latestExportLive,exportStatusLabel,live,runDisabled,runLabel,activePhase,phaseProgress}=importControlsState();
    const resultCounts=counts(),coverage=source?.coverage||{},threadSync=state?.discordScheduleSync||null;
    const rosterCarryForward=resultCounts.rosterCarryForward||source?.rosterCarryForward||source?.counts?.rosterCarryForward||null;
    const freeAgentStatus=resultCounts.freeAgentStatus||source?.counts?.freeAgentStatus||'missing';
    const freeAgentLabel=freeAgentStatus==='located'?countLabel(resultCounts.freeAgentCount??source?.counts?.freeAgentCount)
      :freeAgentStatus==='empty-confirmed'?'0':freeAgentStatus==='blocked'?'Unavailable':'Not included';
    const actionableSourceWarnings=[...new Set([...(source?.coverageWarnings||[]),...(run?.warnings||[])])].filter(value=>!routineWarning(value));
    const historicalBackfill=coverage.importMode==='historical-backfill';
    const threadLabel=threadSync?.reviewRequired?'Needs review':['failed','partial'].includes(threadSync?.status)?'Needs attention':threadSync?.status==='complete'?'Ready':threadSync?.status==='not-required'?'Not required':threadSync?.scheduled?'Running':'Pending';
    const connectionService=exportUrlService();
    return `<section class="commissioner-command-panel commissioner-command-import" data-compact-import-panel aria-label="Import collected Madden data">
      <header><div><h3>Refresh &amp; import</h3></div><span class="pill pill--${live||latestExportLive?'success':run?.status==='failed'?'danger':exportStatus==='ready'?'success':'neutral'}">${esc(live||latestExportLive?'Live':exportStatusLabel)}</span></header>
      <div class="commissioner-import-steps">
        <section><span class="eyebrow">Step 2 · Refresh</span><p>After the export finishes, check for the latest captured data.</p><button class="button button--ghost" data-refresh-companion-import ${busy||connection.busy?'disabled':''}>Refresh</button></section>
        <section><span class="eyebrow">Step 3 · Import</span><p>Publish the export to update rosters, ratings, traits, and game stats.</p><button class="button button--primary" data-import-latest-export data-import-in-place ${runDisabled?'disabled':''}>${esc(runLabel)}</button></section>
      </div>
      ${run?.status==='running'||run?.status==='failed'?`<div class="commissioner-command-import__progress" aria-live="polite"><div><span><small>CURRENT STEP</small><strong>${esc(phaseLabel(activePhase))}</strong></span><b>${phaseProgress}%</b></div><div class="commissioner-import-progress-track" role="progressbar" aria-label="${esc(phaseLabel(activePhase))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${phaseProgress}"><span style="width:${phaseProgress}%"></span></div></div>`:''}
      <div class="commissioner-import-glance" aria-label="Latest import summary">
        <span><small>Live week</small><strong>${esc(state?.activeSnapshotWeek??latestExport.activeSnapshotWeek??'—')}</strong></span>
        <span><small>Captured week</small><strong>${esc(coverage.currentWeek??latestExport.capturedWeek??'—')}</strong></span>
        <span><small>Latest export</small><strong>${esc(dateLabel(latestExport.receivedAt||source?.generatedAt))}</strong></span>
      </div>
      <details class="commissioner-import-details"><summary>View latest import details</summary><div class="commissioner-import-detail-grid">
        <span><small>Season</small><strong>${esc(source?.season?.seasonYear??'—')}</strong></span>
        <span><small>Teams</small><strong>${countLabel(resultCounts.teams??source?.counts?.teams??latestExport.counts?.teams)}</strong></span>
        <span><small>Rostered players</small><strong>${countLabel(resultCounts.rosteredPlayers??resultCounts.players??source?.counts?.rosteredPlayers??latestExport.counts?.rosteredPlayers)}</strong></span>
        <span><small>Games</small><strong>${countLabel(resultCounts.games??source?.counts?.games??latestExport.counts?.games)}</strong></span>
        <span><small>Statistics</small><strong>${countLabel(resultCounts.statistics??source?.counts?.statistics??latestExport.counts?.statistics)}</strong></span>
        <span><small>Rosters</small><strong>${rosterCarryForward?'Carried forward':'Updated from export'}</strong></span>
        <span><small>Free Agents</small><strong>${esc(freeAgentLabel)}</strong></span>
        <span><small>Discord threads</small><strong>${esc(threadLabel)}</strong></span>
      </div>${historicalBackfill?'<p class="commissioner-import-detail-note"><strong>Historical backfill:</strong> completed earlier weeks are being added without moving the active week.</p>':''}${rosterCarryForward?'<p class="commissioner-import-detail-note"><strong>Roster carried forward:</strong> league info, games, results, standings, and weekly statistics can update while the retained roster remains authoritative.</p>':''}${actionableSourceWarnings.length?`<div class="commissioner-import-detail-warning"><strong>Needs attention</strong><ul>${actionableSourceWarnings.map(value=>`<li>${esc(value)}</li>`).join('')}</ul></div>`:''}</details>
      ${lastOutcome?.tone==='error'?`<section class="commissioner-import-recovery" role="alert"><div><h4>${esc(lastOutcome.title)}</h4><p>${esc(lastOutcome.summary)}</p><p><strong>What to do:</strong> ${esc(lastOutcome.action)}</p></div><details><summary>Support details</summary><p>${esc(lastOutcome.detail)}</p><code>${esc(lastOutcome.supportCode)}</code></details></section>`:''}
      <details class="commissioner-import-details" ${!connection.state?.preparedSeason||['collecting','ready','failed'].includes(connection.state?.yearlyScheduleImport?.status)?'open':''}><summary>Companion export URL &amp; season schedule</summary><button class="button button--secondary" data-copy-permanent-export-url ${busy||connection.busy||!endpointState.exportUrl?'disabled':''}>${connection.copied?'URL Copied':'Copy URL'}</button>${exportUrlService()?.renderYearlyScheduleControls?.({compact:true})||''}${connectionService?.renderSecurityControls?.()||''}</details>
    </section>`;
  }

  function renderPanel() {
    const {run,source,connection,endpointState,latestExport,exportStatus,latestExportLive,exportStatusLabel,live,yearlyScheduleImport,runDisabled,runLabel,activePhase,phaseProgress}=importControlsState();
    const connectionService=exportUrlService();
    const resultCounts=counts();
    const faStatus=resultCounts.freeAgentStatus || source?.counts?.freeAgentStatus || 'missing';
    const faCount=['located','empty-confirmed'].includes(faStatus)
      ? countLabel(resultCounts.freeAgentCount ?? source?.counts?.freeAgentCount) : 'unknown';
    const ready=run?.status==='preview-ready';
    const sub60=live && Number(run.durationMs)<60000;
    const coverage=source?.coverage||{};
    const historicalBackfill=coverage.importMode==='historical-backfill';
    const retainedPeriods=Array.isArray(coverage.completePeriods)?coverage.completePeriods:[];
    const periodLabel=period=>`${period?.stage==='preseason'?'Preseason':period?.stage==='playoffs'?'Playoffs':'Regular Season'} Week ${period?.week}`;
    const retainedScope=retainedPeriods.length>1?`${retainedPeriods.length} periods (${periodLabel(retainedPeriods[0])} through ${periodLabel(retainedPeriods.at(-1))})`:periodLabel(coverage.currentPeriod||{stage:'regular-season',week:coverage.currentWeek});
    const sourceWarnings=[...new Set([...(source?.coverageWarnings||[]),...(run?.warnings||[])])];
    const actionableSourceWarnings=sourceWarnings.filter(value=>!routineWarning(value));
    const sourceIsNew=source?.selectionStatus==='new-source';
    const threadSync=state?.discordScheduleSync;
    const sourceTiming=run?.phaseState?.['source-eligibility'];
    const activationTiming=run?.phaseState?.['atomic-activation'];
    const refreshTiming=run?.phaseState?.['browser-refresh'];
    const rosterCarryForward=resultCounts.rosterCarryForward||source?.rosterCarryForward||source?.counts?.rosterCarryForward||null;
    const collectingSchedule=['collecting','ready'].includes(yearlyScheduleImport?.status);
    const awaitingFirstLiveImport=(!run&&!source&&exportStatus!=='ready'||collectingSchedule&&run?.status!=='running')
      &&!state?.activeSnapshotId&&!state?.activeSnapshotWeek&&!latestExport.activeSnapshotWeek;
    const threadTiming=threadSync?.durationMs!=null?durationLabel(threadSync.durationMs)
      :threadSync?.status==='not-required'?'Not required':threadSync?.scheduled?'Running':threadSync?.status||'—';
    const threadReview=threadSync?.reviewRequired?`Schedule threads need commissioner review (${threadSync.reason}). After verifying the current period, use /week${threadSync.weekIndex} in the connected Discord server.`
      :['failed','partial'].includes(threadSync?.status)?`Schedule thread sync needs retry: ${threadSync.lastError||'Discord delivery failed'}. Check the configured channel permissions, then use /week${threadSync.weekIndex}.`:'';
    return `<section class="card commissioner-live-import-card commissioner-companion-workspace" data-one-click-import-panel>
      <div class="card-header commissioner-import-header"><div><span class="eyebrow">Permanent league connection</span><h3>Madden Companion Import</h3><p>Use the same league URL every week, then analyze, validate, and make the newest eligible export live with one action.</p></div><span class="pill pill--${live||latestExportLive?'success':run?.status==='failed'?'danger':exportStatus==='ready'?'success':sourceIsNew?'warning':'neutral'}">${esc(live||latestExportLive?'Live':exportStatusLabel)}</span></div>
      <div class="commissioner-import-primary-actions" aria-label="Madden Companion import actions">
        <button class="button button--secondary" data-copy-permanent-export-url ${busy||connection.busy||!endpointState.exportUrl?'disabled':''}>${connection.copied?'URL Copied':'Copy URL'}</button>
        <button class="button button--primary" data-import-latest-export ${runDisabled?'disabled':''}>${esc(runLabel)}</button>
        <button class="button button--ghost" data-refresh-companion-import ${busy||connection.busy?'disabled':''}>Refresh</button>
      </div>
      ${connectionService?.renderYearlyScheduleControls?.()||''}
      ${awaitingFirstLiveImport?`<section class="commissioner-import-empty-state" aria-label="First live import pending"><span class="eyebrow">No live snapshot yet</span><h4>${collectingSchedule?'Collecting an optional full-season schedule':'Ready for a first weekly import'}</h4><p>${collectingSchedule?'Captured schedule weeks are retained, but they do not publish a live week or create threads. Finish all 18 weeks, or choose Switch to Weekly Imports above.':'Export League Info, Rosters, and Weekly Stats for the Madden week you want live, then select Import Latest Export. You do not need to collect the entire season first.'}</p><p>The first live import needs a roster baseline. Later same-season imports can carry that roster forward when Madden cannot export Rosters.</p></section>`:`<div class="commissioner-import-progress-block commissioner-import-progress-block--modern"><div class="commissioner-import-progress-head"><span><small>CURRENT STEP</small><strong>${esc(phaseLabel(activePhase))}</strong></span><b>${phaseProgress}%</b></div><div class="commissioner-import-progress-track" aria-label="${esc(phaseLabel(activePhase))} ${phaseProgress}% complete"><span style="width:${phaseProgress}%"></span></div><p>${esc(notice||'Ready when the next Madden export arrives.')}</p><details class="commissioner-import-phase-details" ${run?.status==='running'?'open':''}><summary>View all import steps</summary><ol class="commissioner-import-phase-list">${phaseRows()}</ol></details></div>`}
      ${awaitingFirstLiveImport?'':`<section class="commissioner-latest-snapshot" aria-labelledby="commissioner-latest-snapshot-title"><header><div><span class="eyebrow">Most recent import source</span><h4 id="commissioner-latest-snapshot-title">Latest Snapshot</h4></div><span>${endpointState.exportUrl?'Permanent URL connected':'Connection unavailable'}</span></header><div class="commissioner-import-summary">
        <div><small>Latest export</small><strong>${esc(dateLabel(latestExport.receivedAt||source?.generatedAt))}</strong></div>
        <div><small>Destination</small><strong>${esc(state?.destination?.label||'Not created')}</strong></div>
        <div><small>Season</small><strong>${esc(source?.season?.seasonYear ?? '—')}</strong></div>
        <div><small>Active / captured week</small><strong>${esc(state?.activeSnapshotWeek ?? latestExport.activeSnapshotWeek ?? '—')} / ${esc(coverage.currentWeek ?? latestExport.capturedWeek ?? 'unknown')}</strong></div>
        <div><small>Week continuity</small><strong>${esc(coverage.continuityStatus||'unknown')}</strong></div>
        <div><small>Captured routes</small><strong>${countLabel(latestExport.captureCount)}</strong></div>
        <div><small>Teams</small><strong>${countLabel(resultCounts.teams ?? source?.counts?.teams ?? latestExport.counts?.teams)}</strong></div>
        <div><small>Rostered players</small><strong>${countLabel(resultCounts.rosteredPlayers ?? resultCounts.players ?? source?.counts?.rosteredPlayers ?? latestExport.counts?.rosteredPlayers)}</strong></div>
        <div><small>Free Agents</small><strong>${esc(faCount)}</strong></div>
        <div><small>Click to live</small><strong>${durationLabel(run?.durationMs)}</strong></div>
        <div><small>Source check</small><strong>${durationLabel(sourceTiming?.durationMs)}</strong></div>
        <div><small>Atomic activation</small><strong>${durationLabel(activationTiming?.durationMs)}</strong></div>
        <div><small>Browser refresh</small><strong>${durationLabel(refreshTiming?.durationMs)}</strong></div>
        <div><small>Thread readiness</small><strong>${esc(threadTiming)}</strong></div>
      </div></section>`}
      <div class="league-import-framework-note"><svg><use href="#icon-shield"></use></svg><span><strong>Atomic safety:</strong> Validation must pass before the live pointer moves. Any failure leaves the previous live snapshot untouched; no reset or destructive replacement runs.</span></div>
      ${historicalBackfill?`<div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span><strong>Historical backfill:</strong> ${esc(retainedScope)} will be composed in one import. Active Regular Season Week ${esc(coverage.activeWeek)} teams, rosters, players, standings, and live-week position are preserved.</span></div>`:''}
      ${rosterCarryForward?`<div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span><strong>Roster carried forward:</strong> Players, team assignments, contracts, and the ${esc(rosterCarryForward.freeAgentStatus||'unknown')} Free Agent state remain unchanged from the active snapshot. League Info, games, results, standings, and weekly statistics will update normally.</span></div>`:''}
      ${threadReview?`<p class="commissioner-import-thread-review" role="status">${esc(threadReview)}</p>`:''}
      ${connectionService?.renderNotices?.()||''}
      ${actionableSourceWarnings.length?`<details class="commissioner-import-source-notes"><summary>${actionableSourceWarnings.length} source note${actionableSourceWarnings.length===1?'':'s'}</summary><ul>${actionableSourceWarnings.map(value=>`<li>${esc(value)}</li>`).join('')}</ul></details>`:''}
      ${lastOutcome?.tone==='error'?`<section class="commissioner-import-recovery" role="alert"><div><span class="eyebrow">${esc(lastOutcome.phase)}</span><h4>${esc(lastOutcome.title)}</h4><p>${esc(lastOutcome.summary)}</p><p><strong>What to do:</strong> ${esc(lastOutcome.action)}</p><small>Your current league data is still live.</small></div><details><summary>Technical details</summary><p>${esc(lastOutcome.detail)}</p><code>Support code: ${esc(lastOutcome.supportCode)}</code></details></section>`:''}
      ${sub60?`<div class="league-import-framework-note"><svg><use href="#icon-check"></use></svg><span><strong>Performance target met:</strong> ${esc(durationLabel(run.durationMs))}, under 60 seconds.</span></div>`:''}
      <details class="commissioner-import-technical"><summary>Import identifiers</summary><p class="muted">Source fingerprint: ${esc(source?.sourceFingerprint?.slice(0,12)||'—')} · snapshot: ${esc(run?.candidateSnapshotId||'—')} · previous snapshot: ${esc(run?.activeSnapshotIdBefore||'—')}</p></details>
      ${connectionService?.renderSecurityControls?.()||''}
    </section>`;
  }

  function rerender() {
    document.querySelectorAll('[data-one-click-import-panel]').forEach(node=>{ node.outerHTML=renderPanel(); });
    document.querySelectorAll('[data-compact-import-panel]').forEach(node=>{ node.outerHTML=renderCompactPanel(); });
  }

  document.addEventListener('click', event=>{
    if(event.target.closest('[data-close-import-notification]')){event.target.closest('[data-franchise-import-notification]')?.remove();return;}
    if (event.target.closest('[data-create-candidate-destination]')) createDestination();
    if (event.target.closest('[data-run-candidate-import]')) runImport({retry:['failed','running'].includes(currentRun()?.status)});
    if (event.target.closest('[data-refresh-candidate-import]')) refresh().catch(error=>{errorMessage=error.message;lastOutcome=failureGuidance(error,'analyze-source');renderImportNotification();rerender();});
    if (event.target.closest('[data-refresh-companion-import]')) refreshWorkspace().catch(()=>{});
  });

  window.addEventListener('franchisehq:permanent-export-updated',()=>rerender());

  const diagnostics=()=>({release:VERSION,busy,state,error:errorMessage,outcome:lastOutcome,activationPerformed:Boolean(currentRun()?.activationPerformed),activeSnapshotChanged:Boolean(currentRun()?.activeSnapshotChanged)});
  if(!HQ?.defineModuleService)throw new Error('platform/core.js must load before one-click-import.js.');
  HQ.defineModuleService('platform','oneClickImport',{runImport,importLatestExport,createDestination,refresh,refreshWorkspace,renderPanel,renderCompactPanel,renderImportNotification,failureGuidance,diagnostics},{replace:true,alias:'oneClickImport'});
  HQ.manifest?.register?.({scope:'module',module:'platform',id:'candidate-import',service:'oneClickImport',script:'league-engine/one-click-import.js',version:VERSION,dependencies:['auth','leagueTenant'],capabilities:['commissioner-operated','one-click-live-import','atomic-snapshot-activation','actionable-failure-guidance','sub-60-second-target','blocked-free-agents-unknown']});
  setTimeout(()=>refresh().catch(()=>{}),0);
})();
