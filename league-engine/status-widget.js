(function initializeLeagueStatusWidget(global) {
  'use strict';

  const FranchiseHQ = global.FranchiseHQ = global.FranchiseHQ || {};
  const HOST_SELECTOR = '[data-league-status-widget]';

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDate(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    }).format(date);
  }

  function model() {
    const status = FranchiseHQ.leagueData?.getStatus?.() || FranchiseHQ.leagueData?.status?.() || {};
    const source = FranchiseHQ.leagueData?.currentSource?.() || {};
    const mode = status.activeMode || source.mode || 'empty';
    const isLive = mode === 'live' && status.isLive === true;
    const isDevelopment = mode === 'demo' || status.isDemo === true;

    return Object.freeze({
      mode,
      modeLabel: isLive ? 'Live' : isDevelopment ? 'Development Data' : 'Empty',
      statusLabel: isLive ? 'Healthy' : isDevelopment ? 'Development' : 'Import Required',
      tone: isLive ? 'success' : isDevelopment ? 'accent' : 'warning',
      sourceLabel: isLive
        ? (source.sourceType === 'madden-companion' ? 'Madden Companion' : 'Madden Data')
        : isDevelopment ? 'Sample Dataset' : 'None',
      lastImport: isLive ? (formatDate(status.importedAt || source.importedAt) || 'Unavailable') : isDevelopment ? 'Not applicable' : 'Never',
      snapshot: source.snapshotId || status.importId || (isDevelopment ? 'Development Dataset' : 'None'),
      leagueName: status.leagueName || source.leagueName || (isDevelopment ? 'Development League' : 'No league loaded'),
      warning: status.warning || null,
      canLoadLeague: FranchiseHQ.leagueData?.canLoadLeague?.() === true
    });
  }

  function markup() {
    const state = model();
    return `<section class="card commissioner-league-status-widget" data-league-status-widget-card>
      <div class="card-header commissioner-league-status-widget__header">
        <div><span class="eyebrow">League Data</span><h3>Current Data Status</h3></div>
        <span class="pill pill--${escapeHtml(state.tone)}">${escapeHtml(state.statusLabel)}</span>
      </div>
      <div class="commissioner-league-status-widget__grid">
        <div><span>Mode</span><strong>${escapeHtml(state.modeLabel)}</strong></div>
        <div><span>Source</span><strong>${escapeHtml(state.sourceLabel)}</strong></div>
        <div><span>Last Import</span><strong>${escapeHtml(state.lastImport)}</strong></div>
        <div><span>Snapshot</span><strong title="${escapeHtml(state.snapshot)}">${escapeHtml(state.snapshot)}</strong></div>
      </div>
      <div class="commissioner-league-status-widget__footer">
        <span><small>League</small><strong>${escapeHtml(state.leagueName)}</strong></span>
        <button class="button button--ghost button--small" data-commissioner-tab="league-data">Manage League Data</button>
      </div>
    </section>`;
  }

  function render(host = null) {
    const target = host || global.document?.querySelector?.(HOST_SELECTOR);
    if (!target) return false;
    target.innerHTML = markup();
    return true;
  }

  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    const run = () => {
      renderQueued = false;
      global.document?.querySelectorAll?.(HOST_SELECTOR).forEach(render);
    };
    if (typeof global.requestAnimationFrame === 'function') global.requestAnimationFrame(run);
    else global.setTimeout(run, 0);
  }

  const service = Object.freeze({ model, markup, render, scheduleRender });

  if (typeof FranchiseHQ.defineModuleService === 'function') {
    FranchiseHQ.defineModuleService('league', 'statusWidget', service, {
      alias: 'leagueStatusWidget',
      replace: true
    });
  } else {
    Object.defineProperty(FranchiseHQ, 'leagueStatusWidget', {
      configurable: true,
      enumerable: false,
      value: service
    });
  }

  global.addEventListener('franchisehq:league:state-changed', scheduleRender);
  global.addEventListener('franchisehq:league-data-state-changed', scheduleRender);
})(window);
