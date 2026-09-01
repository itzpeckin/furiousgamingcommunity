/* FHQ_BUILD: 7.4.0.1 */
(() => {
  'use strict';

  const HQ = window.FranchiseHQ = window.FranchiseHQ || {};
  const VERSION = '7.4.0.1';
  let state = null;
  let busy = false;
  let errorMessage = '';
  let rotateArmed = false;
  let copied = false;
  let pollTimer = null;

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[character]));
  const slug = () => HQ?.leagueTenant?.getCurrentLeague?.()?.slug || null;
  const endpoint = () => `/api/leagues/${encodeURIComponent(slug())}/companion/export-url`;
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

  async function refresh() {
    try {
      state = await api();
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

  async function importLatest() {
    if (busy || state?.latestExport?.status !== 'ready') return;
    busy = true;
    errorMessage = '';
    window.dispatchEvent(new CustomEvent('franchisehq:open-candidate-import'));
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
    if(/teams?|league info|classified teams dataset/i.test(message))return{
      title:'League Info is missing',
      summary:'The newest export did not include a complete 32-team League Info source.',
      action:'Run the Madden export again with League Info, Rosters, and Weekly Stats selected, using the same league URL.'
    };
    if(/schedule|statistics|weekly|week.*(?:missing|gap|incomplete)/i.test(message))return{
      title:'Weekly data is incomplete',
      summary:'The newest export is missing schedule or statistics data needed for a safe import.',
      action:'Export the missing week—or All Weeks—with Weekly Stats selected, then wait for Ready to import.'
    };
    if(/roster|players?/i.test(message))return{
      title:'Roster data is incomplete',
      summary:'The newest export did not include a complete roster for every team.',
      action:'Run the Madden export again with Rosters and League Info selected, using the same league URL.'
    };
    return{
      title:'The newest export needs attention',
      summary:'FranchiseHQ received the export, but it did not pass source readiness checks.',
      action:'Run the export again with League Info, Rosters, and Weekly Stats selected. If it repeats, open Import Details.'
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

  function renderPanel() {
    if (state?.leagueSlug && state.leagueSlug !== slug()) state=null;
    const endpointState = state?.endpoint || {};
    const latest = state?.latestExport || {};
    const counts = latest.counts || {};
    const status = latest.status || 'loading';
    const historicalBackfill = status === 'ready' && latest.importMode === 'historical-backfill';
    const importDone = latest.importLive === true || latest.importStatus === 'live';
    const importDisabled = busy || status !== 'ready' || importDone;
    const tone = status === 'ready' ? 'success' : status === 'review-required' ? 'warning' : status === 'revoked' ? 'danger' : 'neutral';
    const sourceIssue=readinessIssue(latest.warnings||[]);
    const actionIssue=errorMessage?readinessIssue([errorMessage])||{
      title:'The action could not finish',summary:errorMessage,
      action:'Check your connection and try once more. If the same message returns, open Import Details.'
    }:null;
    if (!pollTimer) {
      const delay = !state ? 0 : status === 'receiving' ? 5_000 : 15_000;
      pollTimer=setTimeout(()=>{
        pollTimer=null;
        if (document.querySelector('[data-permanent-league-export-panel]')) refresh().catch(()=>{});
      },delay);
    }
    return `<article class="card commissioner-league-export-card" data-permanent-league-export-panel>
      <div class="card-header"><div><span class="eyebrow">v${VERSION} · Permanent league connection</span><h2>Dedicated Madden Export URL</h2><p>Use the same league URL for every Madden Companion export. FranchiseHQ automatically separates, analyzes, and retains each export revision.</p></div><span class="pill pill--${tone}">${esc(historicalBackfill?'Historical backfill ready':statusLabel(status))}</span></div>
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
      ${historicalBackfill?`<div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span><strong>Historical backfill:</strong> Week ${esc(latest.capturedWeek)} games and statistics can be added while live Week ${esc(latest.activeSnapshotWeek)} teams, rosters, players, standings, and week position remain unchanged.</span></div>`:''}
      ${sourceIssue?`<section class="commissioner-import-recovery commissioner-import-recovery--warning"><div><h3>${esc(sourceIssue.title)}</h3><p>${esc(sourceIssue.summary)}</p><p><strong>What to do:</strong> ${esc(sourceIssue.action)}</p></div></section>`:''}
      ${Array.isArray(latest.readinessProblems)&&latest.readinessProblems.length?`<details class="commissioner-import-source-notes" open><summary>Latest rejected export diagnostics</summary><ul>${latest.readinessProblems.map(value=>`<li>${esc(value)}</li>`).join('')}</ul></details>`:''}
      ${actionIssue?`<section class="commissioner-import-recovery" role="alert"><div><h3>${esc(actionIssue.title)}</h3><p>${esc(actionIssue.summary)}</p><p><strong>What to do:</strong> ${esc(actionIssue.action)}</p></div></section>`:''}
      <div class="league-import-framework-actions">
        <button class="button button--secondary" data-copy-permanent-export-url ${busy || !endpointState.exportUrl ? 'disabled' : ''}>${copied ? 'URL Copied' : 'Copy League Export URL'}</button>
        <button class="button button--primary" data-import-latest-export ${importDisabled ? 'disabled' : ''}>${busy ? 'Working…' : importDone ? 'Latest Export Live' : 'Import Latest Export'}</button>
        <button class="button button--ghost" data-refresh-permanent-export ${busy ? 'disabled' : ''}>Refresh</button>
      </div>
      <details class="commissioner-export-advanced"><summary>Export URL security</summary><p>Rotate only if the URL is exposed or league access changes. The newest ready export and active snapshot are preserved.</p><button class="button ${rotateArmed ? 'button--danger' : 'button--ghost'}" data-rotate-permanent-export ${busy ? 'disabled' : ''}>${rotateArmed ? 'Confirm Rotation — Revoke Previous URL' : 'Rotate Export URL'}</button>${rotateArmed ? '<button class="button button--ghost" data-cancel-export-rotation>Cancel</button>' : ''}</details>
    </article>`;
  }

  function rerender() {
    document.querySelectorAll('[data-permanent-league-export-panel]').forEach(node=>{ node.outerHTML=renderPanel(); });
  }

  document.addEventListener('click',event=>{
    if (event.target.closest('[data-copy-permanent-export-url]')) copyUrl().catch(error=>{errorMessage=error.message;rerender();});
    if (event.target.closest('[data-import-latest-export]')) importLatest();
    if (event.target.closest('[data-refresh-permanent-export]')) refresh().catch(()=>{});
    if (event.target.closest('[data-rotate-permanent-export]')) rotateUrl();
    if (event.target.closest('[data-cancel-export-rotation]')) { rotateArmed=false;rerender(); }
  });

  const diagnostics = () => ({release:VERSION,busy,state,error:errorMessage,permanent:true,revocable:true,activationPerformed:Boolean(state?.latestExport?.importLive)});
  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before permanent-export-url.js.');
  HQ.defineModuleService('platform','leagueExportUrl',{refresh,copyUrl,rotateUrl,importLatest,renderPanel,diagnostics},{replace:true,alias:'leagueExportUrl'});
  HQ.manifest?.register?.({scope:'module',module:'platform',id:'permanent-league-export-url',service:'leagueExportUrl',script:'league-engine/permanent-export-url.js',version:VERSION,dependencies:['auth','leagueTenant','oneClickImport'],capabilities:['permanent-url','explicit-rotation','automatic-analysis','latest-export-readiness','one-click-import']});
  setTimeout(()=>refresh().catch(()=>{}),0);
})();
