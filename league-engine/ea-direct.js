/* FHQ_BUILD: 8.0.10 */
(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  const VERSION = '8.0.10';
  const terminalStatuses = new Set(['complete', 'completed', 'ready', 'failed', 'cancelled']);
  let context = null;
  let generation = 0;
  let state = null;
  let collection = null;
  let busy = false;
  let loading = false;
  let polling = false;
  let loaded = false;
  let errorMessage = '';
  let notice = '';
  let selectedPath = 'ea-direct';
  let pollTimer = null;
  const controllers = new Set();

  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
  const slug = () => HQ?.leagueTenant?.getCurrentLeague?.()?.slug || null;
  const date = value => {
    if (!value) return 'Not yet collected';
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? 'Unavailable' : parsed.toLocaleString();
  };
  const safeMessage = value => String(value || 'The connection request could not finish. Please try again.')
    .replace(/https?:\/\/\S+/gi, '[connection address]')
    .replace(/\b(?:access_token|refresh_token|authorization|code)\s*[:=]\s*\S+/gi, '[private sign-in information]');

  function resetContext() {
    generation += 1;
    context = slug();
    controllers.forEach(controller => controller.abort());
    controllers.clear();
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    state = null;
    collection = null;
    busy = false;
    loading = false;
    polling = false;
    loaded = false;
    errorMessage = '';
    notice = '';
    selectedPath = 'ea-direct';
  }

  function ensureContext() {
    if (context !== slug()) resetContext();
    return {slug: context, generation};
  }

  const stillCurrent = token => token.slug === slug() && token.generation === generation;
  const previewVerified = () => Boolean(state?.previewVerified || state?.connection?.previewVerified);

  async function api(resource, method = 'GET', body, token = ensureContext()) {
    if (!token.slug || !stillCurrent(token)) throw new Error('Select the league before connecting Madden.');
    if (!HQ.api?.request) throw new Error('The connection service is not ready. Refresh FranchiseHQ and try again.');
    const controller = new AbortController();
    controllers.add(controller);
    try {
      const result = await HQ.api.request(`/api/leagues/${encodeURIComponent(token.slug)}/ea-direct/${resource}`, {
        method, body, signal: controller.signal, timeoutMs: 45000, retries: 0
      });
      if (!stillCurrent(token)) return null;
      return result;
    } finally {
      controllers.delete(controller);
    }
  }

  function loginHref(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && (url.hostname === 'ea.com' || url.hostname.endsWith('.ea.com'))
        ? url.href : null;
    } catch (_) { return null; }
  }

  function connectionState(payload) {
    const previous = state || {};
    return {
      configured: payload.configured ?? previous.configured,
      status: payload.status || previous.status || 'not-connected',
      connection: payload.connection === undefined ? previous.connection || null : payload.connection,
      setup: payload.setup === undefined ? previous.setup || null : payload.setup,
      loginUrl: payload.loginUrl === undefined ? previous.loginUrl || null : loginHref(payload.loginUrl),
      message: payload.message ? safeMessage(payload.message) : '',
      previewVerified: payload.previewVerified ?? previous.previewVerified ?? false
    };
  }

  async function refresh() {
    const token = ensureContext();
    if (!token.slug || loading) return state;
    loading = true;
    rerender();
    try {
      const payload = await api('connection', 'GET', undefined, token);
      if (!payload || !stillCurrent(token)) return null;
      state = connectionState(payload);
      if (payload.latestSync?.id && (!collection || collection.id === payload.latestSync.id)) {
        collection = {...collection, ...payload.latestSync};
        schedulePoll(token);
      } else if (state.status === 'connected' && !collection) {
        const latest = await api('sync', 'GET', undefined, token);
        if (!stillCurrent(token)) return null;
        if (latest?.id || latest?.job?.id) {
          collection = {...latest.job, ...latest};
          schedulePoll(token);
        }
      }
      errorMessage = '';
      return state;
    } catch (error) {
      if (stillCurrent(token)) errorMessage = safeMessage(error.message);
      return null;
    } finally {
      if (stillCurrent(token)) { loading = false; loaded = true; rerender(); }
    }
  }

  async function connectionAction(action, fields = {}) {
    const token = ensureContext();
    if (busy || !token.slug) return null;
    busy = true;
    errorMessage = '';
    notice = '';
    rerender();
    try {
      const payload = await api('connection', 'POST', {action, ...fields}, token);
      if (!payload || !stillCurrent(token)) return null;
      state = connectionState(payload);
      if (action === 'connect' || action === 'disconnect') {
        state.setup = null;
        state.loginUrl = null;
        collection = null;
      }
      if (action === 'disconnect') notice = 'EA account disconnected. Your imported league data remains available.';
      if (action === 'connect') notice = 'EA account connected. Collect a preview to check the available league data.';
      return state;
    } catch (error) {
      if (stillCurrent(token)) errorMessage = safeMessage(error.message);
      return null;
    } finally {
      if (stillCurrent(token)) { busy = false; rerender(); }
    }
  }

  function schedulePoll(token) {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    if (!stillCurrent(token) || !collection?.id || terminalStatuses.has(collection.status)) return;
    pollTimer = setTimeout(() => pollCollection(token), 3000);
  }

  async function pollCollection(token = ensureContext()) {
    if (!collection?.id || !stillCurrent(token) || polling) return null;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    polling = true;
    try {
      const payload = await api(`sync?id=${encodeURIComponent(collection.id)}`, 'GET', undefined, token);
      if (!payload || !stillCurrent(token)) return null;
      collection = {...collection, ...payload.job, ...payload};
      errorMessage = '';
      if (terminalStatuses.has(collection.status)) {
        if (collection.status === 'failed') errorMessage = safeMessage(collection.message || 'EA could not finish this collection. Review the available data and try again.');
        else if (collection.mode === 'preview' && !['failed', 'cancelled'].includes(collection.status)) {
          notice = 'Preview collected. Review the coverage below before starting a league sync.';
        }
        await refresh();
      } else schedulePoll(token);
      rerender();
      return collection;
    } catch (error) {
      if (stillCurrent(token)) {
        errorMessage = 'Collection status could not be checked. Select Check Collection to reconnect to its progress.';
        rerender();
      }
      return null;
    } finally {
      if (stillCurrent(token)) polling = false;
    }
  }

  async function collect(mode) {
    if (!['preview', 'weekly', 'yearly'].includes(mode)) return null;
    const token = ensureContext();
    if (busy || state?.status !== 'connected' || (collection && !terminalStatuses.has(collection.status))) return null;
    if (mode !== 'preview' && !previewVerified()) return null;
    busy = true;
    errorMessage = '';
    notice = '';
    rerender();
    try {
      const payload = await api('sync', 'POST', {mode}, token);
      if (!payload || !stillCurrent(token)) return null;
      collection = {...payload.job, ...payload, mode: payload.mode || payload.job?.mode || mode};
      if (terminalStatuses.has(collection.status)) await refresh();
      else schedulePoll(token);
      return collection;
    } catch (error) {
      if (stillCurrent(token)) errorMessage = safeMessage(error.message);
      return null;
    } finally {
      if (stillCurrent(token)) { busy = false; rerender(); }
    }
  }

  async function reviewImport() {
    const token = ensureContext();
    if (busy || !collection?.readyToImport || collection.mode === 'preview') return;
    busy = true;
    errorMessage = '';
    rerender();
    try {
      await HQ.oneClickImport?.refreshWorkspace?.();
      if (!stillCurrent(token)) return;
      notice = 'Your EA data has been collected. Review the import details below, then select Import Latest Export to publish it.';
      document.querySelector('[data-compact-import-panel]')?.scrollIntoView({behavior: 'smooth', block: 'start'});
    } catch (error) {
      if (stillCurrent(token)) errorMessage = safeMessage(error.message);
    } finally {
      if (stillCurrent(token)) { busy = false; rerender(); }
    }
  }

  function coverageMarkup(coverage) {
    if (!coverage || typeof coverage !== 'object') return '';
    const labels = {leagueInfo: 'League info', teams: 'Teams', rosters: 'Rosters', freeAgents: 'Free Agents', schedules: 'Schedules', statistics: 'Weekly stats', weeks: 'Weeks collected'};
    const rows = Object.entries(labels).filter(([key]) => coverage[key] !== undefined).map(([key, label]) => {
      const value = coverage[key];
      let summary = value;
      if (Array.isArray(value)) summary = value.map(item => typeof item === 'object' ? item.label || item.week || 'Available' : item).join(', ');
      else if (value && typeof value === 'object') {
        const status = value.status || (value.available === false ? 'Unavailable' : value.available === true ? 'Available' : 'Unknown');
        summary = `${status}${value.count !== undefined && value.count !== null ? ` · ${value.count}` : ''}${value.message ? ` · ${safeMessage(value.message)}` : ''}`;
      } else if (typeof value === 'boolean') summary = value ? 'Available' : 'Unavailable';
      else if (value === null) summary = 'Unknown';
      return `<div><dt>${label}</dt><dd>${esc(summary)}</dd></div>`;
    });
    return rows.length ? `<dl class="ea-direct-coverage">${rows.join('')}</dl>` : '';
  }

  function collectionMarkup() {
    if (!collection) return '';
    const finished = terminalStatuses.has(collection.status);
    const progress = Number(collection.progress?.percent ?? collection.progress);
    const percent = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : null;
    const title = collection.mode === 'preview' ? 'Connection preview' : collection.mode === 'yearly' ? 'Yearly schedule collection' : 'League data collection';
    return `<section class="ea-direct-collection" aria-label="EA collection status"><div class="ea-direct-collection__heading"><strong>${title}</strong><span>${esc(collection.status || 'Starting')}</span></div><p role="status">${esc(collection.message ? safeMessage(collection.message) : collection.step || (finished ? 'Collection finished.' : 'Collecting data from EA…'))}</p>${!finished && percent !== null ? `<progress max="100" value="${percent}" aria-label="EA collection progress">${percent}%</progress>` : ''}${coverageMarkup(collection.coverage)}<div class="ea-direct-actions">${!finished ? '<button class="button button--ghost" type="button" data-ea-action="check-collection">Check Collection</button>' : ''}${collection.readyToImport && collection.mode !== 'preview' ? `<button class="button button--primary" type="button" data-ea-action="review-import" ${busy ? 'disabled' : ''}>Review Import</button><span>Collected data is published only after you run the import.</span>` : ''}</div></section>`;
  }

  function setupMarkup() {
    const setup = state?.setup;
    const disabled = busy ? 'disabled' : '';
    const personas = Array.isArray(setup?.personas) ? setup.personas : [];
    const leagues = Array.isArray(setup?.leagues) ? setup.leagues : [];
    if (state?.status === 'choosing-profile') return `<form data-ea-form="persona" class="ea-direct-form"><label class="field"><span>Madden profile</span><select name="personaId" required ${disabled}><option value="">Choose your profile</option>${personas.map(item => `<option value="${esc(item.id ?? item.personaId)}">${esc(item.name || item.personaName || item.displayName || 'Madden profile')}${item.platform ? ` · ${esc(item.platform)}` : ''}</option>`).join('')}</select></label><button type="submit" class="button button--primary" ${disabled}>Find Franchises</button></form>`;
    if (state?.status === 'choosing-franchise' || leagues.length) return `<form data-ea-form="franchise" class="ea-direct-form"><label class="field"><span>Madden franchise for this league</span><select name="externalLeagueId" required ${disabled}><option value="">Choose the franchise</option>${leagues.map(item => `<option value="${esc(item.id ?? item.externalLeagueId ?? item.leagueId)}">${esc(item.name || item.leagueName || 'Madden franchise')}${item.season ? ` · ${esc(item.season)}` : ''}</option>`).join('')}</select></label><button type="submit" class="button button--primary" ${disabled}>Connect Franchise</button></form>`;
    const href = loginHref(state?.loginUrl);
    if (setup?.id && href) return `<div class="ea-direct-signin"><ol><li><a class="button button--primary" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Sign in on EA</a><span>Enter your EA password only on EA’s website.</span></li><li>After sign-in, EA opens a localhost address. The page may say it cannot connect. Copy the full address from that tab and paste it below.</li></ol><form data-ea-form="exchange" class="ea-direct-form"><label class="field"><span>EA return address</span><input type="text" name="redirectUrl" required autocomplete="off" spellcheck="false" placeholder="Paste the full localhost address" ${disabled}><small>This address contains a one-time sign-in code. Do not share it.</small></label><button type="submit" class="button button--primary" ${disabled}>Continue Connection</button></form><button class="text-button" type="button" data-ea-action="begin" ${disabled}>Restart EA sign-in</button></div>`;
    return `<div class="ea-direct-actions"><button class="button button--primary" type="button" data-ea-action="begin" ${disabled}>${state?.status === 'reconnect-required' ? 'Reconnect EA Account' : 'Connect EA Account'}</button><p>Sign in with the EA account that has access to your Madden franchise.</p></div>`;
  }

  function renderPanel() {
    const token = ensureContext();
    if (!loaded && !loading && token.slug) setTimeout(() => { if (stillCurrent(token) && !loaded) refresh(); }, 0);
    const connected = state?.status === 'connected';
    const activeCollection = Boolean(collection && !terminalStatuses.has(collection.status));
    const disabled = busy || loading || activeCollection ? 'disabled' : '';
    const verified = previewVerified();
    const statusLabel = loading ? 'Checking connection' : connected ? 'Connected' : state?.status === 'reconnect-required' ? 'Reconnect needed' : state?.configured === false ? 'Setup required' : 'Not connected';
    const body = selectedPath === 'companion'
      ? '<p>Export from the Madden Companion App to your league’s export URL. Use the import controls below when the export is ready.</p><button class="button button--secondary" type="button" data-ea-action="companion-import">Open Companion Import</button>'
      : loading && !state ? '<p role="status">Checking EA Direct availability for this league…</p>'
      : state?.configured === false ? `<p>${esc(state.message || 'EA Direct is being configured for FranchiseHQ. Companion imports remain available below.')}</p><button type="button" class="button button--ghost" data-ea-action="refresh" ${disabled}>Check Availability</button>`
      : !loaded || !state ? '<p>Connection status is unavailable. Select Refresh Connection to try again.</p>'
      : connected ? `<div class="ea-direct-connected"><dl class="ea-direct-identity"><div><dt>Madden franchise</dt><dd>${esc(state.connection?.leagueName || 'Connected franchise')}</dd></div><div><dt>EA profile</dt><dd>${esc(state.connection?.personaName || 'Connected profile')}${state.connection?.platform ? ` · ${esc(state.connection.platform)}` : ''}</dd></div><div><dt>Last collected</dt><dd>${esc(date(state.connection?.lastSyncedAt))}</dd></div></dl><div class="ea-direct-actions"><button class="button ${verified ? 'button--secondary' : 'button--primary'}" type="button" data-ea-collect="preview" ${disabled}>Test Connection &amp; Collect Preview</button>${verified ? `<button class="button button--primary" type="button" data-ea-collect="weekly" ${disabled}>Sync from EA</button><button class="button button--secondary" type="button" data-ea-collect="yearly" ${disabled}>Import Yearly Schedule</button>` : ''}</div><p>${verified ? 'Sync collects the previous and current weeks together. Yearly Schedule collects the season schedule without advancing the live week.' : 'The preview checks League Info, schedules, stats, rosters, and Free Agents before you import any EA data.'}</p><details class="ea-direct-settings"><summary>Connection settings</summary><button class="button button--ghost" type="button" data-ea-action="disconnect" ${disabled}>Disconnect EA Account</button><small>Imported snapshots stay in your league.</small></details></div>${collectionMarkup()}`
      : setupMarkup();
    return `<section class="card ea-direct-card" data-ea-direct-panel aria-labelledby="ea-direct-title"><div class="ea-direct-header"><div><span class="eyebrow">League data connection</span><h2 id="ea-direct-title">Madden Connection</h2><p>Choose how to bring your Madden franchise into this league.</p></div><span class="pill pill--${connected ? 'success' : 'neutral'}">${esc(statusLabel)}</span></div><div class="ea-direct-paths" role="group" aria-label="Madden connection method"><button type="button" data-ea-path="ea-direct" aria-pressed="${selectedPath === 'ea-direct'}">EA Direct</button><button type="button" data-ea-path="companion" aria-pressed="${selectedPath === 'companion'}">Companion App</button></div><div class="ea-direct-content" aria-busy="${busy || loading}">${body}${errorMessage ? `<p class="ea-direct-error" role="alert">${esc(errorMessage)}</p>` : ''}${notice ? `<p class="ea-direct-notice" role="status">${esc(notice)}</p>` : ''}</div><div class="ea-direct-footer"><small>EA Direct is a manual connection. Sign in or collect data when you choose.</small><button type="button" class="text-button" data-ea-action="refresh" ${disabled}>Refresh Connection</button></div></section>`;
  }

  function rerender() {
    document.querySelectorAll('[data-ea-direct-panel]').forEach(node => { node.outerHTML = renderPanel(); });
  }

  document.addEventListener('click', event => {
    const panel = event.target.closest('[data-ea-direct-panel]');
    if (!panel) return;
    const path = event.target.closest('[data-ea-path]');
    if (path) { selectedPath = path.dataset.eaPath === 'companion' ? 'companion' : 'ea-direct'; rerender(); return; }
    const collectButton = event.target.closest('[data-ea-collect]');
    if (collectButton && !collectButton.disabled) { collect(collectButton.dataset.eaCollect); return; }
    const button = event.target.closest('[data-ea-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.eaAction;
    if (action === 'begin') connectionAction('begin');
    if (action === 'disconnect') connectionAction('disconnect');
    if (action === 'refresh') refresh();
    if (action === 'check-collection') pollCollection();
    if (action === 'review-import') reviewImport();
    if (action === 'companion-import') document.querySelector('[data-compact-import-panel]')?.scrollIntoView({behavior: 'smooth', block: 'start'});
  });

  document.addEventListener('submit', event => {
    const form = event.target.closest('[data-ea-form]');
    if (!form) return;
    event.preventDefault();
    if (busy) return;
    const setupId = state?.setup?.id;
    if (!setupId) return;
    if (form.dataset.eaForm === 'exchange') {
      const input = form.querySelector('[name="redirectUrl"]');
      const redirectUrl = String(input?.value || '').trim();
      if (input) input.value = '';
      if (redirectUrl) connectionAction('exchange', {setupId, redirectUrl});
    }
    if (form.dataset.eaForm === 'persona') {
      const personaId = form.querySelector('[name="personaId"]')?.value;
      if (personaId) connectionAction('select-persona', {setupId, personaId});
    }
    if (form.dataset.eaForm === 'franchise') {
      const externalLeagueId = form.querySelector('[name="externalLeagueId"]')?.value;
      if (externalLeagueId) connectionAction('connect', {setupId, externalLeagueId});
    }
  });

  window.addEventListener('franchisehq:league-tenant-changed', () => { resetContext(); rerender(); });
  window.addEventListener('franchisehq:auth-changed', () => { resetContext(); rerender(); });
  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before ea-direct.js.');
  HQ.defineModuleService('platform', 'eaDirect', {renderPanel, refresh, collect, pollCollection}, {replace: true, alias: 'eaDirect'});
  HQ.manifest?.register?.({scope: 'module', module: 'platform', id: 'ea-direct', service: 'eaDirect', script: 'league-engine/ea-direct.js', version: VERSION, dependencies: ['auth', 'leagueTenant'], capabilities: ['commissioner-operated-ea-connection', 'private-collection-preview', 'tenant-scoped-ea-sync']});
})();
