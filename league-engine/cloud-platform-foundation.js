(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  const VERSION = '5.9.2.1a';
  let latest = null;
  let lastError = null;
  const listeners = new Set();

  function endpoint() { return '/api/platform/status'; }
  function notify() { listeners.forEach(listener => { try { listener(status()); } catch (_) {} }); }
  function status() { return latest ? structuredClone(latest) : null; }
  function subscribe(listener) { if (typeof listener !== 'function') return () => {}; listeners.add(listener); return () => listeners.delete(listener); }
  async function refresh() {
    lastError = null;
    const response = await fetch(endpoint(), { headers: { accept: 'application/json' }, cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) throw new Error(body.error || `Platform status failed (${response.status}).`);
    latest = body;
    notify();
    return status();
  }
  function diagnostics() {
    return {
      service: 'leagueCloudPlatformFoundation', version: VERSION,
      endpoint: endpoint(), checked: Boolean(latest), ready: latest?.platform?.ready === true,
      d1MigrationRequired: true, storageAbstraction: true, lastError
    };
  }
  function pill(tone, text) { return `<span class="pill pill--${tone}">${text}</span>`; }
  function item(label, value, tone = null) {
    return `<div><span>${label}</span><strong>${tone ? pill(tone, value) : value}</strong></div>`;
  }
  function renderPanel() {
    const platform = latest?.platform;
    const bindings = platform?.bindings || {};
    const database = platform?.database || {};
    const ready = platform?.ready === true;
    const configured = platform?.configured === true;
    const stateLabel = ready ? 'Platform Ready' : configured ? 'Migration Required' : 'Configuration Required';
    const tone = ready ? 'success' : 'warning';
    return `<article class="card league-import-framework-card" data-cloud-platform-panel>
      <div class="card-header"><div><span class="eyebrow">v5.9.2.1a · Storage foundation</span><h3>Cloud Platform Foundation</h3><p>D1, R2, KV, and secret readiness for the multi-league backend.</p></div>${pill(tone, stateLabel)}</div>
      <div class="league-import-framework-grid">
        ${item('D1 Binding', bindings.d1 ? 'Configured' : 'Missing', bindings.d1 ? 'success' : 'warning')}
        ${item('D1 Migration', database.migrated ? 'Applied' : 'Not Applied', database.migrated ? 'success' : 'warning')}
        ${item('R2 Storage', bindings.r2 ? 'Configured' : 'Missing', bindings.r2 ? 'success' : 'warning')}
        ${item('Workers KV', bindings.kv ? 'Configured' : 'Missing', bindings.kv ? 'success' : 'warning')}
        ${item('Export Secret', bindings.secret ? 'Configured' : 'Missing', bindings.secret ? 'success' : 'warning')}
        ${item('Release', VERSION)}
      </div>
      <div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span>${ready ? 'All cloud services are configured and migrations 0001–0002 are installed.' : configured ? 'Bindings are present. Apply migrations/0002_companion_storage_layer.sql to FRANCHISE_HQ_DB.' : 'Add the exact Cloudflare bindings listed in the validation guide, then redeploy.'}</span></div>
      <button class="button button--primary" data-check-cloud-platform>Check Cloud Platform</button>
      <p class="league-import-status-note" data-cloud-platform-message>${lastError || latest?.message || 'Run the readiness check after configuring Cloudflare.'}</p>
    </article>`;
  }
  function rerender() {
    const panel = document.querySelector('[data-cloud-platform-panel]');
    if (panel) panel.outerHTML = renderPanel();
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-check-cloud-platform]');
    if (!button) return;
    button.disabled = true; button.textContent = 'Checking…';
    try { await refresh(); } catch (error) { lastError = error.message; } finally { rerender(); }
  });

  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before cloud-platform-foundation.js.');
  HQ.defineModuleService('league', 'leagueCloudPlatformFoundation', {
    endpoint, refresh, status, subscribe, renderPanel, diagnostics
  }, { replace: true, alias: 'leagueCloudPlatformFoundation' });
  HQ.manifest?.register?.({
    scope: 'module', module: 'league', id: 'league-cloud-platform-foundation',
    service: 'leagueCloudPlatformFoundation', script: 'league-engine/cloud-platform-foundation.js',
    version: VERSION, dependencies: ['leagueTenant'],
    capabilities: ['d1-readiness', 'r2-readiness', 'kv-readiness', 'secret-readiness', 'migration-verification', 'shared-storage-contract']
  });
})();
