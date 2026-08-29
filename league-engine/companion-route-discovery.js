(() => {
  'use strict';

  const VERSION = '7.3.0';
  const HQ = window.FranchiseHQ = window.FranchiseHQ || {};
  const REQUIRED = ['teams', 'team-rosters', 'players', 'free-agents', 'standings', 'schedule', 'statistics'];
  let discovery = null;
  let sessions = [];
  let report = null;
  let captureBaseUrl = '';
  let busy = false;
  let lastError = null;

  const tenant = () => HQ.leagueTenant;
  const slug = () => tenant().current().slug;
  const account = () => window.FGC_TRADE?.getCurrentAccount?.() || null;
  const headers = json => ({
    accept: 'application/json',
    ...(json ? { 'content-type': 'application/json' } : {}),
    'x-franchisehq-platform-owner-account-id': String(account()?.id || '')
  });
  const endpoint = name => `/api/leagues/${encodeURIComponent(slug())}/companion/${name}`;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));

  async function request(name, options = {}) {
    const response = await fetch(endpoint(name), {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: { ...headers(Boolean(options.body)), ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
    if (!response.ok || payload.ok === false) throw Object.assign(new Error(payload.error || `Request failed (${response.status}).`), { status: response.status, payload });
    return payload;
  }

  async function optional(name) {
    try { return await request(name); }
    catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  async function refresh() {
    busy = true;
    lastError = null;
    rerender();
    try {
      const [routePayload, sessionPayload, reportPayload] = await Promise.all([
        request('discovery'),
        request('discovery-session'),
        optional('discovery-report')
      ]);
      discovery = routePayload;
      sessions = sessionPayload?.sessions || [];
      report = reportPayload?.report || null;
      return getReport();
    } catch (error) {
      lastError = error.message;
      throw error;
    } finally {
      busy = false;
      rerender();
    }
  }

  function expectation(name) {
    return document.querySelector(`[data-m27-expected-${name}]`)?.value?.trim() || null;
  }

  async function startSession() {
    const expectedPlatform = expectation('platform');
    const expectedSeason = expectation('season');
    const expectedWeek = expectation('week');
    busy = true;
    lastError = null;
    rerender();
    try {
      const payload = await request('discovery-session', {
        method: 'POST',
        body: JSON.stringify({
          expected: {
            gameRelease: 'Madden NFL 27',
            leagueName: tenant().current().name,
            platform: expectedPlatform,
            season: expectedSeason,
            week: expectedWeek
          }
        })
      });
      captureBaseUrl = payload.captureBaseUrl || '';
      sessions = [payload.session, ...sessions.filter(item => item.id !== payload.session?.id)];
      report = null;
      return payload;
    } catch (error) {
      lastError = error.message;
      throw error;
    } finally {
      busy = false;
      rerender();
    }
  }

  async function analyzeLatest() {
    const current = sessions[0];
    if (!current?.id) throw new Error('Start a Madden 27 discovery session first.');
    busy = true;
    lastError = null;
    rerender();
    try {
      const payload = await request('discovery-report', {
        method: 'POST',
        body: JSON.stringify({ sessionId: current.id })
      });
      report = payload.report || null;
      captureBaseUrl = '';
      return payload;
    } catch (error) {
      lastError = error.message;
      throw error;
    } finally {
      busy = false;
      rerender();
    }
  }

  async function copyCaptureUrl() {
    if (!captureBaseUrl) throw new Error('Start a new discovery session to receive its one-time capture URL.');
    await navigator.clipboard.writeText(captureBaseUrl);
    return captureBaseUrl;
  }

  function getReport() {
    return JSON.parse(JSON.stringify({ discovery, sessions, report }));
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function statusClass(status) {
    return ['passed', 'located', 'matched', 'observed', 'empty-confirmed'].includes(status) ? 'success' : 'neutral';
  }

  function requirementGrid() {
    const requirements = report?.requirements || {};
    return `<div class="league-import-framework-grid">${REQUIRED.map(key => {
      const item = requirements[key];
      const label = key.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
      return `<div><span>${esc(label)}</span><strong>${esc(item ? `${item.status} · ${item.recordCount}` : 'Waiting')}</strong></div>`;
    }).join('')}</div>`;
  }

  function routeRows() {
    const rows = report?.datasetInventory || discovery?.captures || [];
    if (!rows.length) return '<p class="league-import-status-note">No Madden 27 routes have been captured in this environment yet.</p>';
    return `<div class="import-history-list">${rows.slice(0, 40).map(row => `<div class="import-history-row"><div><strong>${esc(row.datasetType || 'Unclassified')}</strong><span>${esc(row.routePath)}</span></div><div><span>${row.receivedAt ? new Date(row.receivedAt).toLocaleString() : '—'}</span><span>${formatBytes(row.byteLength)}</span></div></div>`).join('')}</div>`;
  }

  function sessionPanel() {
    const current = sessions[0];
    const expires = current?.expiresAt ? new Date(current.expiresAt).toLocaleString() : '—';
    return `<div class="league-import-framework-grid"><div><span>Session</span><strong>${esc(current?.status || 'Not started')}</strong></div><div><span>Captured Responses</span><strong>${current?.captureCount ?? 0}</strong></div><div><span>Expires</span><strong>${esc(expires)}</strong></div><div><span>Raw Data Activated</span><strong>No</strong></div></div>`;
  }

  function renderPanel() {
    const current = sessions[0];
    const reportStatus = report?.status || 'waiting';
    return `<article class="card" data-companion-route-discovery-panel>
      <div class="card-header"><div><span class="eyebrow">7.3.0 · Madden NFL 27 source lock</span><h3>Madden 27 Discovery</h3><p>Captures one real export privately, proves every required dataset, and never changes the active league.</p></div><span class="pill pill--${statusClass(reportStatus)}">${esc(reportStatus)}</span></div>
      ${sessionPanel()}
      <div class="league-import-framework-grid"><label><span>Platform</span><input type="text" data-m27-expected-platform placeholder="Xbox Series X|S"></label><label><span>Franchise Season</span><input type="text" inputmode="numeric" data-m27-expected-season placeholder="1"></label><label><span>Current Week</span><input type="text" inputmode="numeric" data-m27-expected-week placeholder="1"></label></div>
      <div class="league-import-framework-actions"><button class="button button--primary" data-start-m27-discovery ${busy ? 'disabled' : ''}>${busy ? 'Working…' : 'Start Secure Capture'}</button><button class="button button--secondary" data-copy-m27-discovery ${captureBaseUrl ? '' : 'disabled'}>Copy Capture URL</button><button class="button button--primary" data-analyze-m27-discovery ${!current?.captureCount || busy ? 'disabled' : ''}>Analyze Captured Export</button><button class="button button--ghost" data-refresh-route-discovery ${busy ? 'disabled' : ''}>Refresh</button></div>
      <div class="league-import-framework-note"><svg><use href="#icon-lock"></use></svg><span>The capture URL is shown once, expires after 30 minutes, and is stored only as a hash. Starting a new session cancels the previous open URL.</span></div>
      <h4>Required Madden 27 datasets</h4>${requirementGrid()}
      ${report ? `<div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span>Free Agents: <strong>${esc(report.freeAgentEvidence?.status || 'unknown')}</strong> · ${report.freeAgentEvidence?.recordCount ?? 0} players. Source lock: <strong>${report.status === 'passed' ? 'passed' : 'review required'}</strong>.</span></div>` : ''}
      <h4>Captured routes</h4>${routeRows()}
      <p class="league-import-status-note">${esc(lastError || 'Raw payloads remain private in isolated storage. This tool cannot activate, reset, or publish Madden data.')}</p>
    </article>`;
  }

  function rerender() {
    const panel = document.querySelector('[data-companion-route-discovery-panel]');
    if (panel) panel.outerHTML = renderPanel();
  }

  document.addEventListener('click', async event => {
    const start = event.target.closest('[data-start-m27-discovery]');
    const copy = event.target.closest('[data-copy-m27-discovery]');
    const analyze = event.target.closest('[data-analyze-m27-discovery]');
    const refreshButton = event.target.closest('[data-refresh-route-discovery]');
    if (!start && !copy && !analyze && !refreshButton) return;
    try {
      if (start) await startSession();
      else if (copy) {
        await copyCaptureUrl();
        copy.textContent = 'Copied';
        setTimeout(() => { if (copy.isConnected) copy.textContent = 'Copy Capture URL'; }, 1500);
      } else if (analyze) await analyzeLatest();
      else await refresh();
    } catch (error) {
      lastError = error.message;
      rerender();
    }
  });

  function diagnostics() {
    return Object.freeze({
      service: 'leagueCompanionRouteDiscovery',
      version: VERSION,
      shortLivedCaptureSession: true,
      tokenStoredAsHashOnly: true,
      duplicateCaptureLinking: true,
      rawPayloadExposed: false,
      activationPerformed: false,
      reportAvailable: Boolean(report),
      sourceLockStatus: report?.status || 'waiting',
      routeCount: report?.routeCount || discovery?.routeCount || 0,
      lastError
    });
  }

  if (!HQ.defineModuleService) throw new Error('platform/core.js must load before companion-route-discovery.js.');
  HQ.defineModuleService('league', 'leagueCompanionRouteDiscovery', {
    refresh,
    startSession,
    analyzeLatest,
    copyCaptureUrl,
    getReport,
    renderPanel,
    diagnostics
  }, { replace: true, alias: 'leagueCompanionRouteDiscovery' });
})();
