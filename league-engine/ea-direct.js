/* FHQ_BUILD: 8.0.11 */
(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  const VERSION = '8.0.11';
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
  let selectedPersonaId = '';
  let selectedLeagueId = '';
  let seasonDraft = '';
  let settingsOpen = false;
  let actionRevision = 0;
  let authScope = null;
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
  const personaId = item => String(item.id ?? item.personaId ?? '');
  const leagueId = item => String(item.id ?? item.externalLeagueId ?? item.leagueId ?? '');
  const currentAuthScope = () => {
    const auth = HQ.auth?.getSnapshot?.();
    return auth?.authenticated && auth.user?.id ? JSON.stringify([auth.user.id,auth.membership?.leagueId,
      auth.membership?.role,auth.membership?.authorizationVersion,auth.session?.id||auth.session?.sessionId]) : null;
  };

  function resetSelections() {
    selectedPersonaId = '';
    selectedLeagueId = '';
  }

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
    seasonDraft = '';
    settingsOpen = false;
    actionRevision += 1;
    authScope = currentAuthScope();
    resetSelections();
  }

  function ensureContext() {
    if (context !== slug()) resetContext();
    return {slug: context, generation};
  }

  const stillCurrent = token => token.slug === slug() && token.generation === generation;
  const previewVerified = () => Boolean(state?.weeklyReady || state?.previewVerified || state?.connection?.previewVerified);

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
    const next = {
      configured: payload.configured ?? previous.configured,
      status: payload.status || previous.status || 'not-connected',
      connection: payload.connection === undefined ? previous.connection || null : payload.connection,
      setup: payload.setup === undefined ? previous.setup || null : payload.setup,
      loginUrl: payload.loginUrl === undefined ? previous.loginUrl || null : loginHref(payload.loginUrl),
      message: payload.message ? safeMessage(payload.message) : '',
      previewVerified: payload.previewVerified ?? false,
      weeklyReady: payload.weeklyReady ?? false
    };
    if (next.setup?.id !== previous.setup?.id) resetSelections();
    const personas = Array.isArray(next.setup?.personas) ? next.setup.personas : [];
    const leagues = Array.isArray(next.setup?.leagues) ? next.setup.leagues : [];
    if (!personas.some(item => personaId(item) === selectedPersonaId)) selectedPersonaId = '';
    if (!leagues.some(item => leagueId(item) === selectedLeagueId)) selectedLeagueId = '';
    return next;
  }

  async function refresh() {
    const token = ensureContext();
    if (!token.slug || loading || busy) return state;
    const revision = actionRevision;
    loading = true;
    rerender();
    try {
      const payload = await api('connection', 'GET', undefined, token);
      if (!payload || !stillCurrent(token) || revision !== actionRevision) return null;
      state = connectionState(payload);
      if (payload.latestSync?.id && (!collection || collection.id === payload.latestSync.id)) {
        collection = {...collection, ...payload.latestSync};
        schedulePoll(token);
      } else if (state.status === 'connected' && !collection) {
        const latest = await api('sync', 'GET', undefined, token);
        if (!stillCurrent(token) || revision !== actionRevision) return null;
        if (latest?.id || latest?.job?.id) {
          collection = {...latest.job, ...latest};
          schedulePoll(token);
        }
      }
      errorMessage = '';
      return state;
    } catch (error) {
      if (stillCurrent(token) && revision === actionRevision) errorMessage = safeMessage(error.message);
      return null;
    } finally {
      if (stillCurrent(token)) { loading = false; loaded = true; rerender(); }
    }
  }

  async function connectionAction(action, fields = {}) {
    const token = ensureContext();
    if (busy || !token.slug) return null;
    actionRevision += 1;
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
        resetSelections();
      }
      if (action === 'disconnect') notice = 'EA account disconnected. Your imported league data remains available.';
      if (action === 'connect') notice = previewVerified()
        ? 'EA account connected. Your season schedule is ready; collect weekly stats in Step 3.'
        : 'EA account connected. Import the season schedule in Step 2.';
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
    const revision = actionRevision;
    const jobId = collection.id;
    try {
      const payload = await api(`sync?id=${encodeURIComponent(jobId)}`, 'GET', undefined, token);
      if (!payload || !stillCurrent(token) || revision !== actionRevision || collection?.id !== jobId) return null;
      collection = {...collection, ...payload.job, ...payload};
      errorMessage = '';
      if (terminalStatuses.has(collection.status)) {
        if (collection.status === 'failed') errorMessage = safeMessage(collection.message || 'EA could not finish this collection. Review the available data and try again.');
        else if (collection.mode === 'preview' && !['failed', 'cancelled'].includes(collection.status)) {
          notice = 'Preview collected. Review the coverage below before starting a league sync.';
        }
        await refresh();
        if (stillCurrent(token) && collection?.mode === 'yearly') await HQ.leagueExportUrl?.refresh?.();
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

  async function collect(mode, setup = {}) {
    if (!['preview', 'weekly', 'yearly'].includes(mode)) return null;
    const token = ensureContext();
    if (busy || state?.status !== 'connected' || (collection && !terminalStatuses.has(collection.status))) return null;
    if (mode === 'weekly' && !previewVerified()) return null;
    busy = true;
    actionRevision += 1;
    errorMessage = '';
    notice = '';
    rerender();
    try {
      const payload = await api('sync', 'POST', {mode, ...setup}, token);
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
    if (finished && collection.mode === 'yearly' && collection.previewVerified) return '<p class="ea-direct-export-complete" role="status">Season schedule complete. Collect weekly stats in Step 3.</p>';
    if (finished && collection.readyToImport && collection.mode === 'weekly') return '<p class="ea-direct-export-complete" role="status">EA export complete. Use Refresh below, then Import Latest Export.</p>';
    const progress = Number(collection.progress?.percent ?? collection.progress);
    const percent = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : null;
    const title = collection.mode === 'preview' ? 'Connection preview' : collection.mode === 'yearly' ? 'Yearly schedule collection' : 'League data collection';
    return `<section class="ea-direct-collection" aria-label="EA collection status"><div class="ea-direct-collection__heading"><strong>${title}</strong><span>${esc(collection.status || 'Starting')}</span></div><p role="status">${esc(collection.message ? safeMessage(collection.message) : collection.step || (finished ? 'Collection finished.' : 'Collecting data from EA…'))}</p>${!finished && percent !== null ? `<progress max="100" value="${percent}" aria-label="EA collection progress">${percent}%</progress>` : ''}${coverageMarkup(collection.coverage)}<div class="ea-direct-actions">${!finished ? '<button class="button button--ghost" type="button" data-ea-action="check-collection">Check Collection</button>' : ''}${collection.readyToImport && collection.mode !== 'preview' ? '<span>Export complete. Use Refresh below, then Import Latest Export.</span>' : ''}</div></section>`;
  }

  function setupMarkup() {
    const setup = state?.setup;
    const disabled = busy ? 'disabled' : '';
    const personas = Array.isArray(setup?.personas) ? setup.personas : [];
    const leagues = Array.isArray(setup?.leagues) ? setup.leagues : [];
    const restart = `<button class="text-button" type="button" data-ea-action="begin" ${disabled}>Restart EA sign-in</button>`;
    if (state?.status === 'choosing-profile') return `<form data-ea-form="persona" class="ea-direct-form"><label class="field"><span>Madden profile</span><select name="personaId" required ${disabled}><option value="">Choose your profile</option>${personas.map(item => `<option value="${esc(personaId(item))}"${personaId(item) === selectedPersonaId ? ' selected' : ''}>${esc(item.name || item.personaName || item.displayName || 'Madden profile')}${item.platform ? ` · ${esc(item.platform)}` : ''}</option>`).join('')}</select></label><button type="submit" class="button button--primary" ${disabled}>Find Franchises</button></form>${restart}`;
    if (state?.status === 'choosing-franchise' || leagues.length) return `<form data-ea-form="franchise" class="ea-direct-form"><label class="field"><span>Madden franchise for this league</span><select name="externalLeagueId" required ${disabled}><option value="">Choose the franchise</option>${leagues.map(item => `<option value="${esc(leagueId(item))}"${leagueId(item) === selectedLeagueId ? ' selected' : ''}>${esc(item.name || item.leagueName || 'Madden franchise')}${item.season ? ` · ${esc(item.season)}` : ''}</option>`).join('')}</select></label><button type="submit" class="button button--primary" ${disabled}>Connect Franchise</button></form>${restart}`;
    const href = loginHref(state?.loginUrl);
    if (setup?.id && href) return `<div class="ea-direct-signin"><ol><li><a class="button button--primary" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Sign in on EA</a><span>Enter your EA password only on EA’s website.</span></li><li>After sign-in, EA opens a localhost address. The page may say it cannot connect. Copy the full address from that tab and paste it below.</li></ol><form data-ea-form="exchange" class="ea-direct-form"><label class="field"><span>EA return address</span><input type="text" name="redirectUrl" required autocomplete="off" spellcheck="false" placeholder="Paste the full localhost address" ${disabled}><small>This address contains a one-time sign-in code. Do not share it.</small></label><button type="submit" class="button button--primary" ${disabled}>Continue Connection</button></form>${restart}</div>`;
    return `<div class="ea-direct-actions"><button class="button button--primary" type="button" data-ea-action="begin" ${disabled}>${state?.status === 'reconnect-required' ? 'Reconnect EA Account' : 'Connect EA Account'}</button><p>Sign in with the EA account that has access to your Madden franchise.</p></div>`;
  }

  function renderPanel() {
    const token = ensureContext();
    if (!loaded && !loading && token.slug) setTimeout(() => { if (stillCurrent(token) && !loaded) refresh(); }, 0);
    const connected = state?.status === 'connected';
    const activeCollection = Boolean(collection && !terminalStatuses.has(collection.status));
    const disabled = busy || activeCollection ? 'disabled' : '';
    const verified = previewVerified();
    const statusLabel = loading ? 'Checking connection' : connected ? 'Connected' : state?.status === 'reconnect-required' ? 'Reconnect needed' : state?.configured === false ? 'Setup required' : 'Not connected';
    const exportService = HQ.leagueExportUrl;
    const exportInfo = exportService?.diagnostics?.() || {};
    const exportState = exportInfo.state?.leagueSlug === token.slug ? exportInfo.state : null;
    const annual = exportState?.yearlyScheduleImport;
    const complete = annual?.status === 'completed';
    const prepared = exportState?.preparedSeason;
    const connectionMarkup = selectedPath === 'companion' ? ''
      : loading && !state ? '<p role="status">Checking EA connection…</p>'
      : state?.configured === false ? '<p>EA Direct is unavailable. Choose Companion App.</p>'
      : connected ? `<details class="ea-direct-settings"><summary>${esc(state.connection?.leagueName || 'Connected franchise')} · ${esc(state.connection?.personaName || 'Connected profile')} · Connection settings</summary><small>Last collected: ${esc(date(state.connection?.lastSyncedAt))}</small><div class="ea-direct-actions"><button class="button button--ghost" data-ea-collect="preview" ${disabled}>Test Connection</button><button class="button button--ghost" data-ea-action="refresh" ${disabled}>Refresh Connection</button><button class="button button--ghost" data-ea-action="begin" ${disabled}>Reconnect EA Account</button><button class="button button--ghost" data-ea-action="disconnect" ${disabled}>Disconnect EA Account</button></div></details>`
      : setupMarkup();
    const schedule = selectedPath === 'companion' ? exportService?.renderWorkflowScheduleControls?.() || '<p>Loading schedule…</p>'
      : `${complete ? '<span class="pill pill--success">18 weeks · 272 games · Complete</span>' : ''}${!prepared && connected && exportState ? '<form data-ea-form="season" class="ea-direct-form"><label class="field"><span>Madden franchise season number</span><input name="sourceSeasonId" value="'+esc(seasonDraft)+'" required pattern="[A-Za-z0-9._:-]{1,80}" placeholder="Exact season number in Madden"><small>One-time confirmation for this franchise.</small></label><button type="submit" class="button button--primary" '+disabled+'>Confirm &amp; Import Season Schedule</button></form>' : '<button class="button button--secondary" data-ea-collect="yearly" '+(!connected||busy||loading||activeCollection||!exportState?'disabled':'')+'>'+(complete?'Update Season Schedule':'Import Season Schedule')+'</button>'}`;
    const weekly = selectedPath === 'companion'
      ? `<button class="button button--primary" data-copy-permanent-export-url ${!exportState?.endpoint?.exportUrl||exportInfo.busy?'disabled':''}>${exportInfo.copied?'URL Copied':'Copy URL'}</button><small>In Companion, export League Info, Rosters, and your selected weeks.</small>`
      : `<button class="button button--primary" data-ea-collect="weekly" ${!connected||!verified||busy||loading||activeCollection?'disabled':''}>Collect Current + Previous Week</button><small>Includes team rosters and Free Agents.</small>`;
    return `<section class="card ea-direct-card" data-ea-direct-panel aria-labelledby="ea-direct-title">
      <div class="ea-direct-header"><h3 id="ea-direct-title"><span class="madden-step-number">1</span> Choose export option</h3><span class="pill pill--${connected?'success':'neutral'}">${selectedPath==='companion'?'Companion App':esc(statusLabel)}</span></div>
      <div class="ea-direct-paths" role="group" aria-label="Madden connection method"><button type="button" data-ea-path="ea-direct" aria-pressed="${selectedPath==='ea-direct'}">EA Direct</button><button type="button" data-ea-path="companion" aria-pressed="${selectedPath==='companion'}">Companion App</button></div>
      <div class="ea-direct-content" aria-busy="${busy||loading}">${connectionMarkup}
      <section class="madden-workflow-step"><h3><span class="madden-step-number">2</span> Import season schedule <small>Once per season</small></h3><div class="madden-step-actions">${schedule}</div></section>
      <section class="madden-workflow-step"><h3><span class="madden-step-number">3</span> Collect weekly stats</h3><div class="madden-step-actions">${weekly}</div></section>
      ${selectedPath==='ea-direct'?collectionMarkup():exportService?.renderNotices?.()||''}
      ${errorMessage?`<p class="ea-direct-error" role="alert">${esc(errorMessage)}</p>`:''}${notice?`<p class="ea-direct-notice" role="status">${esc(notice)}</p>`:''}</div></section>`;
  }

  function rerender() {
    document.querySelectorAll('[data-ea-direct-panel]').forEach(node => {
      const details = node.querySelector?.('.ea-direct-settings');
      if (details) settingsOpen = details.open;
      // Background export notifications must not replace a button between
      // pointer-down and click, or destroy the address being pasted into a form.
      const input = node.querySelector?.('[name="redirectUrl"]');
      const address = input?.value || '';
      const focused = document.activeElement;
      const name = node.contains?.(focused) ? focused?.name : null;
      const start = focused?.selectionStart;
      const end = focused?.selectionEnd;
      node.outerHTML = renderPanel();
      const replacement = document.querySelector?.('[data-ea-direct-panel]');
      const nextDetails = replacement?.querySelector?.('.ea-direct-settings');
      if (nextDetails) nextDetails.open = settingsOpen;
      const nextInput = replacement?.querySelector?.('[name="redirectUrl"]');
      if (nextInput) nextInput.value = address;
      if (name && ['redirectUrl', 'sourceSeasonId', 'personaId', 'externalLeagueId'].includes(name)) {
        const next = replacement?.querySelector?.(`[name="${name}"]`);
        next?.focus?.({preventScroll: true});
        if (typeof start === 'number') next?.setSelectionRange?.(start, end);
      }
    });
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
  });

  document.addEventListener('submit', event => {
    const form = event.target.closest('[data-ea-form]');
    if (!form) return;
    event.preventDefault();
    if (busy) return;
    if (form.dataset.eaForm === 'season') {
      if (!form.reportValidity()) return;
      collect('yearly', {sourceSeasonId: String(form.querySelector('[name="sourceSeasonId"]')?.value || '').trim(), confirmSeason: true});
      return;
    }
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
      if (personaId) { selectedPersonaId = personaId; connectionAction('select-persona', {setupId, personaId}); }
    }
    if (form.dataset.eaForm === 'franchise') {
      const externalLeagueId = form.querySelector('[name="externalLeagueId"]')?.value;
      if (externalLeagueId) { selectedLeagueId = externalLeagueId; connectionAction('connect', {setupId, externalLeagueId}); }
    }
  });

  document.addEventListener('input', event => {
    if (event.target.closest('[data-ea-form="season"]')) seasonDraft = String(event.target.value || '');
  });

  document.addEventListener('change', event => {
    const form = event.target.closest('[data-ea-form]');
    if (!form || busy) return;
    if (form.dataset.eaForm === 'persona') {
      selectedPersonaId = String(event.target.value || '');
      selectedLeagueId = '';
    }
    if (form.dataset.eaForm === 'franchise') selectedLeagueId = String(event.target.value || '');
  });

  window.addEventListener('franchisehq:permanent-export-updated', () => {
    const panel = document.querySelector?.('[data-ea-direct-panel]');
    if (panel?.querySelector?.('.ea-direct-settings[open], [data-ea-form]')) return;
    rerender();
  });
  window.addEventListener('franchisehq:league-tenant-changed', () => { resetContext(); rerender(); });
  window.addEventListener('franchisehq:auth-changed', () => {
    const next = currentAuthScope();
    if (next && next === authScope) return;
    resetContext(); rerender();
  });
  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before ea-direct.js.');
  HQ.defineModuleService('platform', 'eaDirect', {renderPanel, refresh, collect, pollCollection}, {replace: true, alias: 'eaDirect'});
  HQ.manifest?.register?.({scope: 'module', module: 'platform', id: 'ea-direct', service: 'eaDirect', script: 'league-engine/ea-direct.js', version: VERSION, dependencies: ['auth', 'leagueTenant'], capabilities: ['commissioner-operated-ea-connection', 'private-collection-preview', 'tenant-scoped-ea-sync']});
})();
