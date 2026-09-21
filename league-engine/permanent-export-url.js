/* FHQ_BUILD: 8.0.4 */
(() => {
  'use strict';

  const HQ = window.FranchiseHQ = window.FranchiseHQ || {};
  const VERSION = '8.0.4';
  let state = null;
  let busy = false;
  let errorMessage = '';
  let infoMessage = '';
  let rotateArmed = false;
  let copied = false;
  let pollTimer = null;

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[character]));
  const slug = () => HQ?.leagueTenant?.getCurrentLeague?.()?.slug || null;
  const endpoint = () => `/api/leagues/${encodeURIComponent(slug())}/companion/export-url`;
  const yearlyEndpoint = () => `/api/leagues/${encodeURIComponent(slug())}/companion/yearly-schedule`;
  const count = value => value === null || value === undefined ? 'unknown' : Number(value).toLocaleString();
  const routineWarning = value => /free agents?|rostered-player-only|carried forward|retained from|source snapshot/i.test(String(value||''));
  const date = value => {
    if (!value) return 'Not received';
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? String(value) : parsed.toLocaleString();
  };

  async function api(method='GET', body) {
    if (!slug()) throw new Error('The current league context is unavailable.');
    const response = await fetch(endpoint(),{
      method,credentials:'same-origin',cache:'no-store',
      headers:{accept:'application/json','content-type':'application/json'},
      body:body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
    if (!response.ok || payload.ok === false) throw new Error(payload.error || `Export URL request failed (${response.status}).`);
    return payload;
  }

  async function yearlyApi(method='GET',body) {
    if (!slug()) throw new Error('The current league context is unavailable.');
    const response=await fetch(yearlyEndpoint(),{
      method,credentials:'same-origin',cache:'no-store',
      headers:{accept:'application/json','content-type':'application/json'},
      body:body===undefined?undefined:JSON.stringify(body)
    });
    const payload=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
    if(!response.ok||payload.ok===false)throw Object.assign(
      new Error(payload.error||`Yearly schedule request failed (${response.status}).`),{payload}
    );
    return payload;
  }

  async function refresh() {
    try {
      const [connection,yearly]=await Promise.all([api(),yearlyApi()]);
      state={
        ...connection,
        preparedSeason:yearly.preparedSeason||null,
        firstSeasonPreparation:yearly.firstSeasonPreparation||null,
        yearlyScheduleImport:yearly.yearlyScheduleImport||null
      };
      errorMessage = '';
      if (state?.latestExport?.status === 'ready') {
        window.dispatchEvent(new CustomEvent('franchisehq:latest-export-ready',{detail:state.latestExport}));
      }
      return state;
    } catch (error) {
      errorMessage = error.message;
      throw error;
    } finally {
      rerender();
    }
  }

  async function yearlyAction(action) {
    if(busy)return state;
    busy=true;errorMessage='';infoMessage='';rerender();
    try{
      const result=await yearlyApi('POST',{action});
      await refresh();
      if(action==='switch-to-weekly'&&result.switchedToWeekly)infoMessage='Weekly imports are available. Your collected schedule exports were retained. Make a fresh export for the Madden week you want live; a new league’s first live import still needs Rosters.';
      return state;
    }catch(error){
      errorMessage=error.message;
      throw error;
    }finally{
      busy=false;rerender();
    }
  }

  const startYearlySchedule=()=>yearlyAction('start');
  const finishYearlySchedule=()=>yearlyAction('finish');
  const switchToWeekly=()=>yearlyAction('switch-to-weekly');

  async function prepareFirstSeason(form) {
    if(busy)return state;
    const preparation=state?.firstSeasonPreparation||{};
    const sourceSeasonId=String(form?.querySelector('[data-first-season-source-season]')?.value||'').trim();
    const confirmed=form?.querySelector('[data-first-season-confirm]')?.checked===true;
    busy=true;errorMessage='';rerender();
    try{
      await yearlyApi('POST',{
        action:'prepare-first-season',
        sourceFranchiseId:preparation.sourceFranchiseId,
        sourceSeasonId,
        confirmSourceSeason:confirmed
      });
      await refresh();
      return state;
    }catch(error){
      errorMessage=error.message;
      throw error;
    }finally{
      busy=false;rerender();
    }
  }

  async function copyUrl() {
    const value = state?.endpoint?.exportUrl;
    if (!value) throw new Error('The permanent league export URL is not available.');
    await navigator.clipboard.writeText(value);
    copied = true;
    rerender();
    setTimeout(()=>{ copied=false;rerender(); },1800);
  }

  async function rotateUrl() {
    if (!rotateArmed) {
      rotateArmed = true;
      rerender();
      return;
    }
    busy = true;
    errorMessage = '';
    rerender();
    try {
      state = await api('POST',{action:'rotate'});
      rotateArmed = false;
      copied = false;
    } catch (error) {
      errorMessage = error.message;
    } finally {
      busy = false;
      rerender();
    }
  }

  async function importLatest({inPlace=false}={}) {
    const yearlyStatus=state?.yearlyScheduleImport?.status;
    if (busy || ['collecting','ready'].includes(yearlyStatus) || state?.latestExport?.status !== 'ready') return;
    busy = true;
    errorMessage = '';
    rerender();
    if (!inPlace) window.dispatchEvent(new CustomEvent('franchisehq:open-candidate-import'));
    try {
      const importer = HQ?.oneClickImport || HQ?.platform?.oneClickImport || HQ?.getModuleService?.('platform','oneClickImport');
      if (!importer?.importLatestExport) throw new Error('The latest-export importer is unavailable.');
      await importer.importLatestExport();
      await refresh();
    } catch (error) {
      errorMessage = error.message;
    } finally {
      busy = false;
      rerender();
    }
  }

  function readinessIssue(warnings=[]) {
    const items=warnings.filter(value=>!routineWarning(value));
    if(!items.length)return null;
    const message=items.join(' ');
    if(/roster|players?/i.test(message))return{
      title:'First roster is still required',
      summary:'The newest export did not include a complete roster and this league does not have a compatible live roster to retain yet.',
      action:'Run one export with Rosters and League Info selected. After the first complete snapshot is live, same-season weekly exports may omit Rosters.'
    };
    if(/League Info did not|classified teams dataset|complete 32-team/i.test(message))return{
      title:'League Info is missing',
      summary:'The newest export did not include a complete 32-team League Info source.',
      action:'Run the Madden export again with League Info and Weekly Stats selected, using the same league URL. Include Rosters for the season’s first snapshot.'
    };
    if(/schedule|statistics|weekly|week.*(?:missing|gap|incomplete)/i.test(message))return{
      title:'Weekly data is incomplete',
      summary:'The newest export is missing schedule or statistics data needed for a safe import.',
      action:'Export the missing week—or All Weeks—with Weekly Stats selected, then wait for Ready to import.'
    };
    if(/source identity|release|season/i.test(message))return{
      title:'Source identity needs confirmation',
      summary:'FranchiseHQ retained the export, but the first Madden season has not been fully confirmed for this league.',
      action:'Complete First-Season Setup below. The retained export will be checked again automatically.'
    };
    return{
      title:'The newest export needs attention',
      summary:'FranchiseHQ received the export, but it did not pass source readiness checks.',
      action:'Run the export again with League Info and Weekly Stats selected. Include Rosters for the first snapshot of the season. If it repeats, open Import Details.'
    };
  }

  function statusLabel(status) {
    return ({
      'awaiting-export':'Awaiting export',
      receiving:'Receiving export',
      ready:'Ready to import',
      'review-required':'Review required',
      revoked:'URL revoked'
    })[status] || 'Loading';
  }

  function renderNotices() {
    const latest = state?.latestExport || {};
    const sourceIssue = readinessIssue(latest.warnings || []);
    const actionIssue = errorMessage ? readinessIssue([errorMessage]) || {
      title:'The action could not finish',summary:errorMessage,
      action:'Check your connection and try once more. If the same message returns, open Import Details.'
    } : null;
    return `${infoMessage?`<div class="league-import-framework-note" role="status"><svg><use href="#icon-check"></use></svg><span>${esc(infoMessage)}</span></div>`:''}
      ${sourceIssue?`<section class="commissioner-import-recovery commissioner-import-recovery--warning"><div><h3>${esc(sourceIssue.title)}</h3><p>${esc(sourceIssue.summary)}</p><p><strong>What to do:</strong> ${esc(sourceIssue.action)}</p></div></section>`:''}
      ${Array.isArray(latest.readinessProblems)&&latest.readinessProblems.length?`<details class="commissioner-import-source-notes" open><summary>Latest rejected export diagnostics</summary><ul>${latest.readinessProblems.map(value=>`<li>${esc(value)}</li>`).join('')}</ul></details>`:''}
      ${actionIssue?`<section class="commissioner-import-recovery" role="alert"><div><h3>${esc(actionIssue.title)}</h3><p>${esc(actionIssue.summary)}</p><p><strong>What to do:</strong> ${esc(actionIssue.action)}</p></div></section>`:''}`;
  }

  function renderSecurityControls() {
    return `<details class="commissioner-export-advanced"><summary>Export URL security</summary><p>Rotate only if the URL is exposed or league access changes. The newest ready export and active snapshot are preserved.</p><button class="button ${rotateArmed ? 'button--danger' : 'button--ghost'}" data-rotate-permanent-export ${busy ? 'disabled' : ''}>${rotateArmed ? 'Confirm Rotation — Revoke Previous URL' : 'Rotate Export URL'}</button>${rotateArmed ? '<button class="button button--ghost" data-cancel-export-rotation>Cancel</button>' : ''}</details>`;
  }

  function renderYearlyScheduleControls({compact=false}={}) {
    const annual=state?.yearlyScheduleImport;
    const prepared=state?.preparedSeason;
    const preparation=state?.firstSeasonPreparation||{};
    if(!annual&&!prepared){
      const retained=preparation.retainedExport||{};
      const sourceReady=preparation.canPrepare===true;
      const suggested=preparation.suggestedSourceSeasonId||'';
      return `<section class="commissioner-first-season${compact?' commissioner-yearly-schedule--compact':''}">
        <div class="commissioner-first-season__intro"><div><strong>Finish First-Season Setup</strong><small>${esc(preparation.nextAction||'Confirm this league’s Madden season before importing.')}</small></div><span class="pill pill--${sourceReady?'warning':'neutral'}">${sourceReady?'Confirmation needed':'Waiting'}</span></div>
        <div class="commissioner-first-season__evidence">
          <span><small>Madden release</small><strong>${esc(preparation.gameRelease||'Not prepared')}</strong></span>
          <span><small>Observed franchise</small><strong>${esc(preparation.sourceFranchiseId||'Not observed')}</strong></span>
          <span><small>Retained routes</small><strong>${count(retained.routeCount||retained.captureCount||0)}</strong></span>
          <span><small>First roster</small><strong>${retained.hasRoster?'Received':'Still required'}</strong></span>
        </div>
        ${sourceReady?`<form class="commissioner-first-season__form" data-first-season-form>
          <label><span>Madden franchise season number</span><input class="input" data-first-season-source-season value="${esc(suggested)}" inputmode="numeric" maxlength="80" required placeholder="Example: 1"><small>Use the season number shown inside this Madden franchise. FranchiseHQ will not copy this value from another league.</small></label>
          <label class="commissioner-first-season__confirm"><input type="checkbox" data-first-season-confirm required><span>I confirm this is the exact season for ${esc(state?.leagueSlug||'this league')}.</span></label>
          <button class="button button--primary" type="submit" ${busy?'disabled':''}>${busy?'Preparing…':'Confirm & Prepare Season'}</button>
        </form>`:''}
      </section>`;
    }
    if(!annual)return `<section class="commissioner-yearly-schedule${compact?' commissioner-yearly-schedule--compact':''}">
      <div><strong>Want the full-season schedule?</strong><small>Optional: collect Weeks 1–18 without changing the current week or creating Discord threads. To start with only the current week, skip this and use the normal Madden export and Import Latest Export.</small></div>
      <button class="button button--secondary" data-import-yearly-schedule ${busy||!prepared?'disabled':''} title="${prepared?'Start a retained, non-live schedule collection.':'Finish First-Season Setup first.'}">${busy?'Working…':'Import Yearly Schedule'}</button>
    </section>`;
    if(annual.status==='completed')return `<section class="commissioner-yearly-schedule is-complete${compact?' commissioner-yearly-schedule--compact':''}">
      <div><strong>Schedule Import Complete</strong><small>${count(annual.gameCount)} games across all 18 regular-season weeks. The next current-week export will use this schedule without changing its week.</small></div>
      <span class="pill pill--success">Complete</span>
    </section>`;
    const ready=annual.status==='ready';
    return `<section class="commissioner-yearly-schedule is-active${compact?' commissioner-yearly-schedule--compact':''}">
      <div><strong>Full-season schedule collection</strong><small>${count(annual.capturedWeekCount)} of ${count(annual.expectedWeekCount)} weeks · ${count(annual.gameCount)} of ${count(annual.expectedGameCount)} games captured.${compact?' No live week published.':' This has not published a live week.'}</small></div>
      <div class="commissioner-yearly-schedule__actions">
        <button class="button ${ready?'button--primary':'button--secondary'}" data-finish-yearly-schedule ${busy||!annual.readyToFinish?'disabled':''}>${busy?'Working…':'Finish Full Schedule'}</button>
        <button class="button button--ghost" data-switch-to-weekly ${busy?'disabled':''}>Switch to Weekly Imports</button>
      </div>
      <p class="commissioner-yearly-schedule__help">${compact?'Switching keeps captured exports. The first live import still needs Rosters.':'Switching keeps every captured export but ends this optional collection. Run a fresh export for the week you want to make live; the first live import of a new league still needs Rosters.'}</p>
    </section>`;
  }

  function ensurePolling() {
    if (pollTimer || !document.querySelector('[data-permanent-league-export-panel],[data-one-click-import-panel],[data-compact-import-panel]')) return;
    const status = state?.latestExport?.status;
    const delay = !state ? 0 : status === 'receiving' ? 5_000 : 15_000;
    pollTimer=setTimeout(()=>{
      pollTimer=null;
      if (document.querySelector('[data-permanent-league-export-panel],[data-one-click-import-panel],[data-compact-import-panel]')) refresh().catch(()=>{});
    },delay);
  }

  function renderPanel() {
    if (state?.leagueSlug && state.leagueSlug !== slug()) state=null;
    const endpointState = state?.endpoint || {};
    const latest = state?.latestExport || {};
    const counts = latest.counts || {};
    const status = latest.status || 'loading';
    const historicalBackfill = status === 'ready' && latest.importMode === 'historical-backfill';
    const importDone = latest.importLive === true || latest.importStatus === 'live';
    const yearlyActive=['collecting','ready'].includes(state?.yearlyScheduleImport?.status);
    const importDisabled = busy || yearlyActive || status !== 'ready' || importDone;
    const sourceIssue=readinessIssue(latest.warnings||[]);
    const importReason=busy?'FranchiseHQ is finishing the current action.'
      :yearlyActive?'Finish the full schedule or switch to weekly imports above before publishing a live snapshot.'
        :importDone?'The newest eligible export is already live.'
          :status==='review-required'?(sourceIssue?.action||'Review the newest export prerequisites below.')
            :status==='receiving'?'FranchiseHQ is still receiving and checking the export.'
              :status==='awaiting-export'?'Run a Madden export to this league’s permanent URL.'
                :status!=='ready'?'The newest export is not ready to import.':'';
    const tone = status === 'ready' ? 'success' : status === 'review-required' ? 'warning' : status === 'revoked' ? 'danger' : 'neutral';
    ensurePolling();
    return `<article class="card commissioner-league-export-card" data-permanent-league-export-panel>
      <div class="card-header"><div><span class="eyebrow">Permanent league connection</span><h2>Dedicated Madden Export URL</h2><p>Use the same league URL for every Madden Companion export. FranchiseHQ automatically separates, analyzes, and retains each export revision.</p></div><span class="pill pill--${tone}">${esc(historicalBackfill?'Historical backfill ready':statusLabel(status))}</span></div>
      <div class="commissioner-import-summary">
        <div><small>Export URL</small><strong>${endpointState.exportUrl ? 'Permanent URL ready' : 'Unavailable'}</strong></div>
        <div><small>Latest export</small><strong>${esc(date(latest.receivedAt))}</strong></div>
        <div><small>Captured week</small><strong>${esc(latest.capturedWeek ?? 'unknown')}</strong></div>
        <div><small>Live week</small><strong>${esc(latest.activeSnapshotWeek ?? 'none')}</strong></div>
        <div><small>Captured routes</small><strong>${count(latest.captureCount || 0)}</strong></div>
        <div><small>Teams</small><strong>${count(counts.teams)}</strong></div>
        <div><small>Rostered players</small><strong>${count(counts.rosteredPlayers)}</strong></div>
        <div><small>Free Agents</small><strong>${['located','empty-confirmed'].includes(counts.freeAgentStatus) ? count(counts.freeAgentCount) : 'unknown'}</strong></div>
        <div><small>Import status</small><strong>${esc(importDone ? 'Live' : latest.importStatus === 'preview-ready' ? 'Validated · ready to publish' : latest.importStatus || 'Not started')}</strong></div>
      </div>
      ${renderYearlyScheduleControls()}
      ${historicalBackfill?`<div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span><strong>Historical backfill:</strong> Week ${esc(latest.capturedWeek)} games and statistics can be added while live Week ${esc(latest.activeSnapshotWeek)} teams, rosters, players, standings, and week position remain unchanged.</span></div>`:''}
      ${renderNotices()}
      <div class="league-import-framework-actions">
        <button class="button button--secondary" data-copy-permanent-export-url ${busy || !endpointState.exportUrl ? 'disabled' : ''}>${copied ? 'URL Copied' : 'Copy League Export URL'}</button>
        <button class="button button--primary" data-import-latest-export ${importDisabled ? 'disabled' : ''} title="${esc(importReason||'Validate and publish the newest eligible export.')}">${busy ? 'Working…' : yearlyActive ? 'Finish or Switch Schedule First' : importDone ? 'Latest Export Live' : 'Import Latest Export'}</button>
        <button class="button button--ghost" data-refresh-permanent-export ${busy ? 'disabled' : ''}>Refresh</button>
      </div>
      ${importDisabled&&importReason?`<p class="commissioner-import-disabled-reason"><strong>Import unavailable:</strong> ${esc(importReason)}</p>`:''}
      ${renderSecurityControls()}
    </article>`;
  }

  function rerender() {
    document.querySelectorAll('[data-permanent-league-export-panel]').forEach(node=>{ node.outerHTML=renderPanel(); });
    window.dispatchEvent(new CustomEvent('franchisehq:permanent-export-updated'));
  }

  document.addEventListener('click',event=>{
    if (event.target.closest('[data-copy-permanent-export-url]')) copyUrl().catch(error=>{errorMessage=error.message;rerender();});
    const importButton=event.target.closest('[data-import-latest-export]');
    if (importButton) importLatest({inPlace:importButton.hasAttribute('data-import-in-place')});
    if (event.target.closest('[data-refresh-permanent-export]')) refresh().catch(()=>{});
    if (event.target.closest('[data-import-yearly-schedule]')) startYearlySchedule().catch(()=>{});
    if (event.target.closest('[data-finish-yearly-schedule]')) finishYearlySchedule().catch(()=>{});
    if (event.target.closest('[data-switch-to-weekly]')) switchToWeekly().catch(()=>{});
    if (event.target.closest('[data-rotate-permanent-export]')) rotateUrl();
    if (event.target.closest('[data-cancel-export-rotation]')) { rotateArmed=false;rerender(); }
  });

  document.addEventListener('submit',event=>{
    const form=event.target.closest('[data-first-season-form]');
    if(!form)return;
    event.preventDefault();
    if(!form.reportValidity())return;
    prepareFirstSeason(form).catch(()=>{});
  });

  const diagnostics = () => ({release:VERSION,busy,state,error:errorMessage,copied,rotateArmed,permanent:true,revocable:true,yearlyScheduleImport:state?.yearlyScheduleImport||null,activationPerformed:Boolean(state?.latestExport?.importLive)});
  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before permanent-export-url.js.');
  HQ.defineModuleService('platform','leagueExportUrl',{refresh,copyUrl,rotateUrl,importLatest,prepareFirstSeason,startYearlySchedule,finishYearlySchedule,switchToWeekly,renderPanel,renderNotices,renderSecurityControls,renderYearlyScheduleControls,ensurePolling,diagnostics},{replace:true,alias:'leagueExportUrl'});
  HQ.manifest?.register?.({scope:'module',module:'platform',id:'permanent-league-export-url',service:'leagueExportUrl',script:'league-engine/permanent-export-url.js',version:VERSION,dependencies:['auth','leagueTenant','oneClickImport'],capabilities:['permanent-url','explicit-rotation','automatic-analysis','latest-export-readiness','one-click-import']});
  setTimeout(()=>refresh().catch(()=>{}),0);
})();
