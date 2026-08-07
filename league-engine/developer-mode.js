(() => {
  'use strict';
  const HQ = window.FranchiseHQ = window.FranchiseHQ || {};
  const VERSION = '5.9.3.0';
  const STORAGE_KEY = 'franchise-hq:developer-mode-enabled';
  let enabled = localStorage.getItem(STORAGE_KEY) === 'true';
  let latestResult = null;
  let busy = false;
  let lastError = null;
  const listeners = new Set();

  function isCommissioner() { return HQ.auth?.isCommissioner?.() === true; }
  function isEnabled() { return isCommissioner() && enabled; }
  function tenant() { if (!HQ.leagueTenant) throw new Error('League tenant service is unavailable.'); return HQ.leagueTenant; }
  function endpoint() { return tenant().exportEndpoint().replace(/\/export$/, '/test'); }
  function clone(value) { return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character])); }

  function publish(type, detail) {
    const event = Object.freeze({ type, detail: clone(detail), timestamp: new Date().toISOString() });
    listeners.forEach(listener => { try { listener(event); } catch (error) { console.error('[Developer Mode] listener failed', error); } });
    window.dispatchEvent(new CustomEvent('franchisehq:developer-mode', { detail: event }));
    return event;
  }

  function setEnabled(next) {
    if (!isCommissioner()) throw new Error('Commissioner access is required to use Developer Mode.');
    enabled = next === true;
    localStorage.setItem(STORAGE_KEY, String(enabled));
    latestResult = null;
    lastError = null;
    publish(enabled ? 'enabled' : 'disabled', { enabled });
    rerender();
    return status();
  }

  async function run(action) {
    if (!isEnabled()) throw new Error('Enable Developer Mode before running storage tests.');
    busy = true; lastError = null; rerender();
    try {
      const response = await fetch(endpoint(), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ action })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `Request failed (${response.status}).`);
      latestResult = payload;
      publish(`storage-test-${action}`, payload);
      await HQ.leagueCompanionExportReceiver?.refresh?.({ silent: true }).catch(() => {});
      return clone(payload);
    } catch (error) {
      lastError = error.message;
      publish('storage-test-failed', { action, error: error.message });
      throw error;
    } finally {
      busy = false; rerender();
    }
  }

  const sendTestExport = () => run('create');
  const verifyTestStorage = () => run('verify');
  const cleanupTestExport = () => run('cleanup');
  function status() { return Object.freeze({ version: VERSION, commissioner: isCommissioner(), enabled: isEnabled(), busy, latestResult: clone(latestResult), lastError }); }
  function subscribe(listener, options = {}) { if (typeof listener !== 'function') throw new TypeError('Developer Mode listener must be a function.'); listeners.add(listener); if (options.immediate) listener(Object.freeze({ type: 'ready', detail: status(), timestamp: new Date().toISOString() })); return () => listeners.delete(listener); }
  function diagnostics() { return Object.freeze({ service: 'leagueDeveloperMode', version: VERSION, commissionerOnly: true, defaultEnabled: false, enabled: isEnabled(), localPreferenceOnly: true, privateTokenRequired: false, serverAuthorization: 'authenticated-commissioner-session', testEndpoint: endpoint(), activeSnapshotMutation: false, rawR2TestArchiveRetained: true, latestResult: clone(latestResult), lastError }); }

  function renderChecks(result) {
    const checks = result?.checks;
    if (!checks) return '';
    return `<div class="league-certification-checks">${Object.entries(checks).map(([name, passed]) => `<span class="${passed ? 'is-pass' : 'is-fail'}">${passed ? '✓' : '×'} ${escapeHtml(name.replace(/([A-Z])/g, ' $1'))}</span>`).join('')}</div>`;
  }

  function renderPanel() {
    if (!isCommissioner()) return '';
    const active = isEnabled();
    const result = latestResult;
    const resultText = lastError || result?.message || (active ? 'Developer tools are ready. No test has been run yet.' : 'Developer tools are hidden until you enable them on this browser.');
    return `<article class="card league-import-framework-card" data-developer-mode-panel>
      <div class="card-header"><div><span class="eyebrow">v${VERSION} · Internal support tools</span><h3>Developer Mode</h3><p>Commissioner-only diagnostics for testing cloud storage without PowerShell or exposing the Companion export token.</p></div><span class="pill pill--${active ? 'warning' : 'neutral'}">${active ? 'Enabled' : 'Disabled'}</span></div>
      <div class="league-import-framework-grid">
        <div><span>Visibility</span><strong>${active ? 'Developer tools visible' : 'Developer tools hidden'}</strong></div>
        <div><span>Authorization</span><strong>Commissioner session</strong></div>
        <div><span>Private Token</span><strong>Not exposed</strong></div>
        <div><span>Live Snapshot</span><strong>Never changed</strong></div>
      </div>
      <div class="league-import-framework-actions"><button class="button ${active ? 'button--ghost' : 'button--primary'}" data-toggle-developer-mode>${active ? 'Disable Developer Mode' : 'Enable Developer Mode'}</button></div>
      ${active ? `<div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span>These controls create only records labeled as Franchise HQ development tests. They are not real Madden imports.</span></div>
      <div class="league-import-framework-actions"><button class="button button--primary" data-send-test-export ${busy ? 'disabled' : ''}>Send Test Export</button><button class="button button--ghost" data-verify-test-storage ${busy ? 'disabled' : ''}>Verify D1, R2 & KV</button><button class="button button--ghost" data-cleanup-test-export ${busy ? 'disabled' : ''}>Reject & Clean Up Test</button></div>
      ${renderChecks(result)}` : ''}
      <p class="league-import-status-note">${escapeHtml(busy ? 'Running the requested Developer Mode test…' : resultText)}</p>
    </article>`;
  }

  function rerender() { const panel = document.querySelector('[data-developer-mode-panel]'); if (panel) panel.outerHTML = renderPanel(); }
  document.addEventListener('click', async event => {
    const toggle = event.target.closest('[data-toggle-developer-mode]');
    if (toggle) { setEnabled(!isEnabled()); return; }
    const create = event.target.closest('[data-send-test-export]');
    if (create) { try { await sendTestExport(); } catch (_) {} return; }
    const verify = event.target.closest('[data-verify-test-storage]');
    if (verify) { try { await verifyTestStorage(); } catch (_) {} return; }
    const cleanup = event.target.closest('[data-cleanup-test-export]');
    if (cleanup) { if (!confirm('Reject the latest development test and remove it from the pending queue? The private R2 archive will remain.')) return; try { await cleanupTestExport(); } catch (_) {} }
  });
  window.addEventListener('franchisehq:auth-changed', rerender);
  window.addEventListener('franchisehq:league-tenant-changed', () => { latestResult = null; lastError = null; rerender(); });

  if (!HQ.defineModuleService) throw new Error('platform/core.js must load before developer-mode.js.');
  HQ.defineModuleService('league', 'leagueDeveloperMode', { isEnabled, setEnabled, sendTestExport, verifyTestStorage, cleanupTestExport, status, subscribe, renderPanel, diagnostics }, { replace: true, alias: 'leagueDeveloperMode' });
  HQ.manifest?.register?.({ scope: 'module', module: 'league', id: 'league-developer-mode', service: 'leagueDeveloperMode', script: 'league-engine/developer-mode.js', version: VERSION, dependencies: ['auth','leagueTenant','leagueCompanionExportReceiver'], capabilities: ['commissioner-only','local-mode-toggle','one-click-storage-test','no-private-token-in-browser','no-live-snapshot-mutation'] });
})();
