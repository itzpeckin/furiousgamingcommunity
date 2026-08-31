/* FHQ_BUILD: 7.3.5.1 */
(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  const VERSION = '7.3.5.1';
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

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[character]));
  const slug = () => HQ?.leagueTenant?.getCurrentLeague?.()?.slug || null;
  const base = () => `/api/leagues/${encodeURIComponent(slug())}/companion/`;
  const now = () => window.performance?.now?.() ?? Date.now();

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
      throw failure;
    }
    return payload;
  }

  async function refresh() {
    state = await api('candidate-import');
    rerender();
    return state;
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
      result = await api('map-statistics','POST',{action:'next',runId});
      guard += 1;
    }
    if (!result.complete) throw new Error('Statistics mapping exceeded the 5,000-batch safety limit.');
    const final = await api('map-statistics');
    const failed = Number(final?.progress?.failed ?? final?.delta?.failedRoutes ?? 0);
    if (failed) throw new Error(`${failed} statistics route(s) failed; candidate build stopped safely.`);
    return {...final, mappingRun:{...(final.mappingRun||{}),id:runId}};
  }

  async function validateCandidate(snapshotId) {
    let result = await api('snapshot-lifecycle','POST',{action:'validate-start',snapshotId});
    let guard = 0;
    while (!result.complete && guard < 500) {
      const job = result.validationJob || {};
      notice = `Validate Candidate · ${Number(job.processedCount||0).toLocaleString()}/${Number(job.totalCount||0).toLocaleString()} records`;
      rerender();
      result = await api('snapshot-lifecycle','POST',{action:'validate-next',snapshotId,limit:250});
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
    return refreshed;
  }

  async function runImport({retry=false}={}) {
    if (busy) return;
    busy = true;
    errorMessage = '';
    notice = 'Starting live league import…';
    rerender();
    const wallStartedAt = now();
    let runId = null;
    try {
      if (!state?.destination) {
        state = await api('candidate-import','POST',{action:'create-destination'});
        if (!state?.destination) throw new Error('The franchise-season import destination is unavailable.');
      }
      state = await api('candidate-import','POST',{action:'start',retry});
      runId = state?.run?.id;
      if (!runId) throw new Error('Candidate importer did not return a durable run ID.');
      if (state.warm && state.run?.status === 'preview-ready') {
        const finalDuration=Math.max(0,Math.round(now()-wallStartedAt));
        state=await api('candidate-import','POST',{action:'finalize',runId,durationMs:finalDuration});
        notice = `Validated import is live in ${durationLabel(finalDuration)}.`;
        const refreshed=await refreshLiveApplication({
          runId,candidateSnapshotId:state.run?.candidateSnapshotId,durationMs:finalDuration,
          importMode:state.run?.resultCounts?.importMode||state.source?.coverage?.importMode
        });
        if(!refreshed)notice+=' Live data will retry in the background without requiring a browser reload.';
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

      const players = await runPhase(runId,'map-players',()=>api('map-players','POST',{compact:true,discoverySessionId}),payload=>{
        const count=Number(payload.mappingRun?.playerCount ?? payload.playerCount ?? 0);
        const freeAgentStatus=payload.mappingCompleteness === 'complete' ? 'located' : (analyzed.report?.freeAgentEvidence?.status || 'missing');
        const warnings=[...(payload.mappingRun?.warnings||[])];
        if (freeAgentStatus === 'blocked') warnings.push('Madden Free Agents are blocked upstream; count remains unknown.');
        return {
          summary:`${count} rostered players mapped`,
          counts:{players:count,rosteredPlayers:Number(payload.mappingRun?.rosteredCount ?? count),freeAgentStatus,
            freeAgentCount:['located','empty-confirmed'].includes(freeAgentStatus)?Number(payload.mappingRun?.freeAgentCount||0):null},
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
      const built = await runPhase(runId,'build-candidate',()=>api('build-snapshot','POST',{
        candidateImportRunId:runId,...mappingRunIds
      }),payload=>({
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

      const finalDuration=Math.max(0,Math.round(now()-wallStartedAt));
      state = await api('candidate-import','POST',{action:'finalize',runId,durationMs:finalDuration});
      notice = finalDuration < 60000
        ? `Import live in ${durationLabel(finalDuration)}.`
        : `Import live in ${durationLabel(finalDuration)}; review the sub-60-second performance target.`;
      const refreshed=await refreshLiveApplication({
        runId,candidateSnapshotId:state.run?.candidateSnapshotId,durationMs:finalDuration,
        importMode:state.run?.resultCounts?.importMode||state.source?.coverage?.importMode
      });
      if(!refreshed)notice+=' Live data will retry in the background without requiring a browser reload.';
    } catch (error) {
      errorMessage = error.message;
      notice = 'Import stopped safely. The previous live snapshot was preserved.';
    } finally {
      busy = false;
      await refresh().catch(()=>rerender());
    }
    return state;
  }

  async function importLatestExport() {
    await refresh();
    if (!state?.source) throw new Error('No analyzed league export is ready to import.');
    if (!state.destination) await createDestination();
    if (!state?.destination) throw new Error('The franchise-season import destination is unavailable.');
    return runImport({retry:['failed','running'].includes(currentRun()?.status)});
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

  function renderPanel() {
    const run=currentRun();
    const source=state?.source;
    const resultCounts=counts();
    const faStatus=resultCounts.freeAgentStatus || source?.counts?.freeAgentStatus || 'missing';
    const faCount=['located','empty-confirmed'].includes(faStatus)
      ? countLabel(resultCounts.freeAgentCount ?? source?.counts?.freeAgentCount) : 'unknown';
    const ready=run?.status==='preview-ready';
    const live=Boolean(run?.activationPerformed);
    const sub60=live && Number(run.durationMs)<60000;
    const coverage=source?.coverage||{};
    const historicalBackfill=coverage.importMode==='historical-backfill';
    const retainedPeriods=Array.isArray(coverage.completePeriods)?coverage.completePeriods:[];
    const periodLabel=period=>`${period?.stage==='preseason'?'Preseason':period?.stage==='playoffs'?'Playoffs':'Regular Season'} Week ${period?.week}`;
    const retainedScope=retainedPeriods.length>1?`${retainedPeriods.length} periods (${periodLabel(retainedPeriods[0])} through ${periodLabel(retainedPeriods.at(-1))})`:periodLabel(coverage.currentPeriod||{stage:'regular-season',week:coverage.currentWeek});
    const sourceWarnings=[...new Set([...(source?.coverageWarnings||[]),...(run?.warnings||[])])];
    const sourceIsNew=source?.selectionStatus==='new-source';
    const runDisabled=busy||!source||live;
    const runLabel=busy?'Import Running…'
      :live?'Latest Export Live'
        :run?.status==='failed'?'Retry Candidate Import'
          :'Import Latest Export';
    return `<section class="card commissioner-live-import-card" data-one-click-import-panel>
      <div class="card-header"><div><span class="eyebrow">v${VERSION} · Commissioner-operated Madden importer</span><h3>One-Click Live Import</h3><p>Analyze, map, validate, and atomically publish the newest eligible export with one action.</p></div><span class="pill pill--${live?'success':run?.status==='failed'?'danger':sourceIsNew?'warning':'neutral'}">${esc(live?'Live':run?.status|| (sourceIsNew?'New export':'Not started'))}</span></div>
      <div class="league-import-framework-note"><svg><use href="#icon-shield"></use></svg><span><strong>Atomic safety:</strong> Validation must pass before the live pointer moves. Any failure leaves the previous live snapshot untouched; no reset or destructive replacement runs.</span></div>
      ${historicalBackfill?`<div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span><strong>Historical backfill:</strong> ${esc(retainedScope)} will be composed in one import. Active Regular Season Week ${esc(coverage.activeWeek)} teams, rosters, players, standings, and live-week position are preserved.</span></div>`:''}
      ${faStatus==='blocked'?`<div class="league-import-framework-note"><svg><use href="#icon-alert-triangle"></use></svg><span><strong>Free Agents blocked upstream:</strong> this candidate is rostered-player-only. The Free Agent count is unknown, never zero.</span></div>`:''}
      <div class="commissioner-import-summary">
        <div><small>Destination</small><strong>${esc(state?.destination?.label||'Not created')}</strong></div>
        <div><small>Season</small><strong>${esc(source?.season?.seasonYear ?? '—')}</strong></div>
        <div><small>Active / captured week</small><strong>${esc(state?.activeSnapshotWeek ?? '—')} / ${esc(coverage.currentWeek ?? 'unknown')}</strong></div>
        <div><small>Week continuity</small><strong>${esc(coverage.continuityStatus||'unknown')}</strong></div>
        <div><small>Capture analyzed</small><strong>${esc(dateLabel(source?.generatedAt))}</strong></div>
        <div><small>Teams</small><strong>${countLabel(resultCounts.teams ?? source?.counts?.teams)}</strong></div>
        <div><small>Rostered players</small><strong>${countLabel(resultCounts.rosteredPlayers ?? resultCounts.players ?? source?.counts?.rosteredPlayers)}</strong></div>
        <div><small>Free Agents</small><strong>${esc(faCount)}</strong></div>
        <div><small>Wall time</small><strong>${durationLabel(run?.durationMs)}</strong></div>
      </div>
      <div class="commissioner-import-progress-block"><div class="commissioner-import-progress-head"><span>${esc(notice||'Candidate workflow')}</span><strong>${Number(run?.progress||0)}%</strong></div><div class="commissioner-import-progress-track"><span style="width:${Number(run?.progress||0)}%"></span></div><ol class="commissioner-import-phase-list">${phaseRows()}</ol></div>
      ${sourceWarnings.length?`<div class="validation-errors"><strong>Coverage and candidate warnings</strong><ul>${sourceWarnings.map(value=>`<li>${esc(value)}</li>`).join('')}</ul></div>`:''}
      ${errorMessage?`<div class="validation-errors"><strong>Stopped safely</strong><p>${esc(errorMessage)}</p>${run?.retry?.message?`<p>${esc(run.retry.message)}</p>`:''}</div>`:''}
      ${sub60?`<div class="league-import-framework-note"><svg><use href="#icon-check"></use></svg><span><strong>Performance target met:</strong> ${esc(durationLabel(run.durationMs))}, under 60 seconds.</span></div>`:''}
      <div class="league-import-framework-actions">
        <button class="button button--primary" data-run-candidate-import ${runDisabled?'disabled':''}>${esc(runLabel)}</button>
        <button class="button button--ghost" data-refresh-candidate-import ${busy?'disabled':''}>Refresh</button>
      </div>
      <p class="muted">Source fingerprint: ${esc(source?.sourceFingerprint?.slice(0,12)||'—')} · snapshot: ${esc(run?.candidateSnapshotId||'—')} · previous snapshot: ${esc(run?.activeSnapshotIdBefore||'—')} · completeness: ${esc(run?.completenessStatus||'not evaluated')} · live: ${live?'yes':'no'}</p>
    </section>`;
  }

  function rerender() {
    document.querySelectorAll('[data-one-click-import-panel]').forEach(node=>{ node.outerHTML=renderPanel(); });
  }

  document.addEventListener('click', event=>{
    if (event.target.closest('[data-create-candidate-destination]')) createDestination();
    if (event.target.closest('[data-run-candidate-import]')) runImport({retry:['failed','running'].includes(currentRun()?.status)});
    if (event.target.closest('[data-refresh-candidate-import]')) refresh().catch(error=>{errorMessage=error.message;rerender();});
  });

  const diagnostics=()=>({release:VERSION,busy,state,error:errorMessage,activationPerformed:Boolean(currentRun()?.activationPerformed),activeSnapshotChanged:Boolean(currentRun()?.activeSnapshotChanged)});
  if(!HQ?.defineModuleService)throw new Error('platform/core.js must load before one-click-import.js.');
  HQ.defineModuleService('platform','oneClickImport',{runImport,importLatestExport,createDestination,refresh,renderPanel,diagnostics},{replace:true,alias:'oneClickImport'});
  HQ.manifest?.register?.({scope:'module',module:'platform',id:'candidate-import',service:'oneClickImport',script:'league-engine/one-click-import.js',version:VERSION,dependencies:['auth','leagueTenant'],capabilities:['commissioner-operated','one-click-live-import','atomic-snapshot-activation','sub-60-second-target','blocked-free-agents-unknown']});
  setTimeout(()=>refresh().catch(()=>{}),0);
})();
