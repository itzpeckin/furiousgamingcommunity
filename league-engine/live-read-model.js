(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  const VERSION = '5.9.4.2';
  const cache = new Map();
  let summary = null;
  let busy = false;
  let lastError = null;
  let lastRefreshAt = null;

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const account = () => window.FGC_TRADE?.getCurrentAccount?.() || null;
  const leagueSlug = () => HQ?.leagueTenant?.getCurrentLeague?.()?.slug || 'furious-gaming-community';

  function endpoint(params = {}) {
    const url = new URL(`/api/leagues/${encodeURIComponent(leagueSlug())}/snapshot/read-model`, location.origin);
    Object.entries(params).forEach(([key,value]) => value && url.searchParams.set(key,value));
    return url.toString();
  }

  async function request(params = {}, force = false) {
    const key = JSON.stringify(params);
    if (!force && cache.has(key)) return cache.get(key);
    const response = await fetch(endpoint(params), {credentials:'same-origin',cache:'no-store'});
    const payload = await response.json().catch(() => ({ok:false,error:`HTTP ${response.status}`}));
    if (!response.ok || payload.ok === false) throw Object.assign(new Error(payload.error || `HTTP ${response.status}`), {payload});
    cache.set(key,payload);
    return payload;
  }

  async function refresh() {
    busy = true;
    lastError = null;
    cache.clear();
    rerender();
    try {
      summary = await request({}, true);
      lastRefreshAt = new Date().toISOString();
      return summary;
    } catch (error) {
      lastError = error.message;
      console.error('[Live Read Model]', error.payload || error);
      throw error;
    } finally {
      busy = false;
      rerender();
    }
  }

  async function getSnapshot() { return (summary || await request({})).snapshot; }
  async function getLeague() { return (summary || await request({})).league; }
  async function getState() { return (summary || await request({})).state; }
  async function getDomain(domain) { return (await request({domain})).records || []; }
  async function getTeams() { return getDomain('teams'); }
  async function getPlayers() { return getDomain('players'); }
  async function getStandings() { return getDomain('standings'); }
  async function getSchedule() { return getDomain('games'); }
  async function getStatistics() { return getDomain('statistics'); }

  async function loadSample(domain) {
    busy = true; lastError = null; rerender();
    try {
      const payload = await request({sample:domain}, true);
      summary = summary || payload;
      window.__FHQ_LIVE_READ_SAMPLE__ = payload.sample || null;
      return payload.sample;
    } finally {
      busy = false; rerender();
    }
  }

  function countCards() {
    const d = summary?.domains || {};
    return ['teams','players','games','statistics','standings'].map(key =>
      `<div><span>${esc(key[0].toUpperCase()+key.slice(1))}</span><strong>${d[key] ?? '—'}</strong></div>`
    ).join('');
  }

  function samplePanel() {
    const sample = window.__FHQ_LIVE_READ_SAMPLE__;
    if (!sample?.record) return '';
    return `<article class="card" style="margin-top:16px"><div class="card-header"><div><span class="eyebrow">Normalized contract</span><h3>Sample ${esc(sample.domain)}</h3></div><span class="pill pill--success">Read Model</span></div><pre style="white-space:pre-wrap;overflow:auto;max-height:520px">${esc(JSON.stringify(sample.record,null,2))}</pre></article>`;
  }

  function renderPanel() {
    const s = summary?.snapshot;
    const state = String(summary?.state || 'not-loaded').toUpperCase();
    return `<section data-live-read-model-panel>
      <article class="card">
        <div class="card-header"><div><span class="eyebrow">v5.9.4.2 · Live Snapshot Read Model</span><h3>Live Read Model</h3><p>Stable application-facing contracts backed only by the league's active immutable snapshot.</p></div><span class="pill pill--${state==='LIVE'?'success':'neutral'}">${esc(state)}</span></div>
        <div class="league-import-framework-grid">
          <div><span>Snapshot</span><strong>${esc(s?.id || '—')}</strong></div>
          <div><span>Season / Week</span><strong>${esc(s ? `${s.seasonYear ?? '—'} / ${s.weekIndex ?? '—'}` : '—')}</strong></div>
          <div><span>Snapshot Status</span><strong>${esc(s?.status || '—')}</strong></div>
          <div><span>Cache</span><strong>${summary ? 'Healthy' : 'Not loaded'}</strong></div>
          ${countCards()}
        </div>
        <div class="league-import-framework-actions">
          <button class="button button--primary" data-live-read-refresh ${busy?'disabled':''}>${busy?'Loading…':'Refresh Read Model'}</button>
          ${['teams','players','games','statistics','standings'].map(x=>`<button class="button button--ghost" data-live-read-sample="${x}" ${busy?'disabled':''}>Sample ${esc(x)}</button>`).join('')}
        </div>
        ${lastError?`<div class="validation-errors"><p>${esc(lastError)}</p></div>`:''}
        <div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span>UI integration releases consume this service. Preview, mapper, and pending snapshot tables are intentionally outside the public read contract.</span></div>
      </article>
      ${samplePanel()}
    </section>`;
  }

  function rerender() {
    const host = document.querySelector('[data-platform-workspace-panel]');
    if (host && document.querySelector('[data-live-read-model-panel]')) host.innerHTML = renderPanel();
  }

  document.addEventListener('click', event => {
    if (event.target.closest('[data-live-read-refresh]')) {
      event.preventDefault();
      refresh().catch(()=>{});
    }
    const sample = event.target.closest('[data-live-read-sample]');
    if (sample) {
      event.preventDefault();
      loadSample(sample.dataset.liveReadSample).catch(()=>{});
    }
  });

  function diagnostics() {
    return Object.freeze({
      service:'liveData',
      version:VERSION,
      state:summary?.state || 'not-loaded',
      activeSnapshot:Boolean(summary?.snapshot),
      snapshotId:summary?.snapshot?.id || null,
      cache:'healthy',
      cachedRequests:cache.size,
      domainsReady:Boolean(summary?.snapshot && Object.values(summary.domains || {}).every(v => Number(v) >= 0)),
      counts:summary?.domains || null,
      lastRefreshAt,
      lastError
    });
  }

  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before live-read-model.js.');
  const service = {refresh,getLeague,getTeams,getPlayers,getStandings,getSchedule,getStatistics,getSnapshot,getState,loadSample,renderPanel,diagnostics};
  HQ.defineModuleService('league','liveData',service,{replace:true,alias:'liveData'});
})();
