/* FHQ_BUILD: 7.3.4.7 */
(() => {
  'use strict';

  const HQ = window.FranchiseHQ = window.FranchiseHQ || {};
  const VERSION = '7.3.4.7';
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
    if (!pollTimer) {
      const delay = !state ? 0 : status === 'receiving' ? 5_000 : 15_000;
      pollTimer=setTimeout(()=>{
        pollTimer=null;
        if (document.querySelector('[data-permanent-league-export-panel]')) refresh().catch(()=>{});
      },delay);
    }
    return `<article class="card commissioner-league-export-card" data-permanent-league-export-panel>
      <div class="card-header"><div><span class="eyebrow">v${VERSION} · Permanent league connection</span><h2>Dedicated Madden Export URL</h2><p>Use the same league URL for every Madden Companion export. FranchiseHQ automatically separates, analyzes, and retains each export revision.</p></div><span class="pill pill--${tone}">${esc(historicalBackfill?'Historical backfill ready':statusLabel(status))}</span></div>
      <div class="league-import-framework-note"><svg><use href="#icon-lock"></use></svg><span>The URL is league-specific and remains valid until an authorized commissioner deliberately rotates it. Rotation immediately revokes the previous URL.</span></div>
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
      ${(latest.warnings || []).length ? `<div class="validation-errors"><strong>Latest export not selected</strong><ul>${latest.warnings.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></div>` : ''}
      ${errorMessage ? `<div class="validation-errors"><strong>Action stopped safely</strong><p>${esc(errorMessage)}</p></div>` : ''}
      <div class="league-import-framework-actions">
        <button class="button button--secondary" data-copy-permanent-export-url ${busy || !endpointState.exportUrl ? 'disabled' : ''}>${copied ? 'URL Copied' : 'Copy League Export URL'}</button>
        <button class="button button--primary" data-import-latest-export ${importDisabled ? 'disabled' : ''}>${busy ? 'Working…' : importDone ? 'Latest Export Live' : 'Import Latest Export'}</button>
        <button class="button button--ghost" data-refresh-permanent-export ${busy ? 'disabled' : ''}>Refresh</button>
      </div>
      <details class="commissioner-export-advanced"><summary>Export URL security</summary><p>Rotate only if the URL is exposed or league access changes. The newest ready export and active snapshot are preserved.</p><button class="button ${rotateArmed ? 'button--danger' : 'button--ghost'}" data-rotate-permanent-export ${busy ? 'disabled' : ''}>${rotateArmed ? 'Confirm Rotation — Revoke Previous URL' : 'Rotate Export URL'}</button>${rotateArmed ? '<button class="button button--ghost" data-cancel-export-rotation>Cancel</button>' : ''}</details>
      <p class="muted">A failed or partial export never replaces the previous ready source. Analysis starts automatically after the Madden export finishes. Free Agents remain blocked/unknown unless Madden returns valid data.</p>
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
