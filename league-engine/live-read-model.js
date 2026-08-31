(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  const VERSION = '7.3.6';
  const cache = new Map();
  let summary = null;
  const domainCache = new Map();
  const inFlight = new Map();
  let busy = false;
  let lastError = null;
  let lastRefreshAt = null;

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const account = () => window.FGC_TRADE?.getCurrentAccount?.() || null;
  const leagueSlug = () => HQ?.leagueTenant?.getCurrentLeague?.()?.slug || null;

  function endpoint(params = {}) {
    if (!leagueSlug()) throw new Error('A server-resolved tenant route is required.');
    const url = new URL(`/api/leagues/${encodeURIComponent(leagueSlug())}/snapshot/read-model`, location.origin);
    Object.entries(params).forEach(([key,value]) => value && url.searchParams.set(key,value));
    return url.toString();
  }

  async function request(params = {}, force = false) {
    const key = `${leagueSlug()}:${JSON.stringify(params)}`;
    if (!force && cache.has(key)) return cache.get(key);
    if (!force && inFlight.has(key)) return inFlight.get(key);

    const work=(async()=>{
      const response = await fetch(endpoint(params), {credentials:'same-origin',cache:'no-store'});
      const payload = await response.json().catch(() => ({ok:false,error:`HTTP ${response.status}`}));
      if (!response.ok || payload.ok === false) throw Object.assign(new Error(payload.error || `HTTP ${response.status}`), {payload});
      cache.set(key,payload);
      return payload;
    })();

    inFlight.set(key,work);
    try{return await work}
    finally{inFlight.delete(key)}
  }

  function storageKey(snapshotId,domain){
    return `fhq:live-read:7.3.6:${leagueSlug()}:${snapshotId}:${domain}`;
  }

  function readPersisted(snapshotId,domain){
    if(!snapshotId||!['standings','games','players','statistics'].includes(domain))return null;
    try{
      const parsed=JSON.parse(sessionStorage.getItem(storageKey(snapshotId,domain))||'null');
      if(!parsed||!Array.isArray(parsed.records))return null;
      return parsed.records;
    }catch{return null}
  }

  function persist(snapshotId,domain,records){
    if(!snapshotId||!['standings','games','players','statistics'].includes(domain))return;
    try{
      sessionStorage.setItem(storageKey(snapshotId,domain),JSON.stringify({savedAt:Date.now(),records}));
    }catch{
      // Player payloads can exceed browser storage on some devices. Memory cache still works.
    }
  }

  async function refresh() {
    busy = true;
    lastError = null;
    cache.clear();
    domainCache.clear();
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
  async function getSummary() { return summary || request({}); }
  async function getLeague() { return (summary || await request({})).league; }
  async function getState() { return (summary || await request({})).state; }
  async function getFreeAgentState() { return (summary || await request({})).freeAgents; }
  async function getIntegrity() { return (summary || await request({})).integrity; }
  async function getDomain(domain) {
    const domainKey=`${leagueSlug()}:${domain}`;
    if (domainCache.has(domainKey)) return domainCache.get(domainKey);

    const snapshot=await getSnapshot();
    const persisted=readPersisted(snapshot?.id,domain);
    if(persisted){
      domainCache.set(domainKey,persisted);
      return persisted;
    }

    const flightKey=`domain:${leagueSlug()}:${domain}`;
    if(inFlight.has(flightKey))return inFlight.get(flightKey);

    const work=(async()=>{
      const limit=500;
      let cursor=null;
      const records=[];
      let guard=0;
      do {
        const params={domain,limit};
        if(domain==='statistics')params.compact='1';
        if(cursor)params.cursor=cursor;
        const payload=await request(params);
        records.push(...(payload.records||[]));
        cursor=payload.nextCursor||null;
        guard++;
        if(guard>100||records.length>50000)throw new Error(`Live ${domain} read exceeded the safe pagination limit.`);
      } while(cursor);
      domainCache.set(domainKey,records);
      persist(snapshot?.id,domain,records);
      return records;
    })();

    inFlight.set(flightKey,work);
    try{return await work}
    finally{inFlight.delete(flightKey)}
  }

  async function getTeams() { return getDomain('teams'); }
  async function getPlayers() { return getDomain('players'); }
  async function getStandings() { return getDomain('standings'); }
  async function getSchedule() { return getDomain('games'); }
  async function getStatistics() { return getDomain('statistics'); }

  function invalidateOwnership() {
    domainCache.delete(`${leagueSlug()}:teams`);
    for (const key of [...cache.keys()]) {
      if (key.includes('"domain":"teams"')) cache.delete(key);
    }
  }

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
        <div class="card-header"><div><span class="eyebrow">v5.9.10.6.2h · Paged Live Snapshot Read Model</span><h3>Live Read Model</h3><p>Stable application-facing contracts backed only by the league's active immutable snapshot.</p></div><span class="pill pill--${state==='LIVE'?'success':'neutral'}">${esc(state)}</span></div>
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

  window.addEventListener('franchisehq:league-tenant-changed',()=>{
    cache.clear(); domainCache.clear(); inFlight.clear(); summary=null; lastError=null; lastRefreshAt=null;
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
      cachedDomains:domainCache.size,
      domainsReady:Boolean(summary?.snapshot && Object.values(summary.domains || {}).every(v => Number(v) >= 0)),
      counts:summary?.domains || null,
      lastRefreshAt,
      lastError
    });
  }

  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before live-read-model.js.');
  async function warm(){
    try{
      await getSnapshot();
      await Promise.allSettled([getTeams(),getStandings(),getSchedule(),getPlayers()]);
      // Statistics are secondary and can be larger. Start them after the core shell
      // datasets so they never delay League Home boot.
      getStatistics().catch(()=>{});
      return true;
    }catch{return false}
  }

  const service = {refresh,warm,invalidateOwnership,getSummary,getLeague,getTeams,getPlayers,getStandings,getSchedule,getStatistics,getSnapshot,getState,getFreeAgentState,getIntegrity,loadSample,renderPanel,diagnostics};
  HQ.defineModuleService('league','liveData',service,{replace:true,alias:'liveData'});

  const scheduleWarm=()=>setTimeout(()=>warm(),0);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleWarm,{once:true});
  else scheduleWarm();
})();
