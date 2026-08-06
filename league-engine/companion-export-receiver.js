(() => {
  'use strict';
  const HQ = window.FranchiseHQ = window.FranchiseHQ || {};
  const VERSION = '5.9.1.5';
  let latestStatus = null;
  let lastError = null;
  let latestInspection = null;
  const listeners = new Set();
  const clone = value => value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const freeze = value => Object.freeze(value);

  function tenant(){
    if (!HQ.leagueTenant) throw new Error('League tenant service is unavailable.');
    return HQ.leagueTenant;
  }
  function endpoint(){ return tenant().exportEndpoint(); }
  function inspectEndpoint(){ return endpoint().replace(/\/export$/, '/inspect'); }
  async function refresh(options = {}){
    lastError = null;
    try {
      const response = await fetch(endpoint(), { method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Receiver status request failed (${response.status}).`);
      latestStatus = freeze({ ...payload, checkedAt: new Date().toISOString() });
      publish('receiver-status-refreshed', latestStatus);
      return latestStatus;
    } catch (error) {
      lastError = error.message;
      if (options.silent !== true) console.warn('[Companion Export Receiver]', error);
      publish('receiver-status-failed', { error: error.message });
      throw error;
    }
  }

  async function inspect(token){
    const value=String(token||'').trim();
    if(!value) throw new Error('Enter the private Companion export token before inspecting.');
    lastError=null;
    const response=await fetch(inspectEndpoint(),{method:'GET',headers:{accept:'application/json','x-franchisehq-export-token':value},cache:'no-store'});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(payload.error||`Payload inspection failed (${response.status}).`);
    latestInspection=freeze(payload.inspection);
    publish('receiver-payload-inspected',latestInspection);
    return clone(latestInspection);
  }
  function getInspection(){return clone(latestInspection);}

  function getStatus(){ return clone(latestStatus); }
  function subscribe(listener, options = {}){
    if (typeof listener !== 'function') throw new TypeError('Receiver listener must be a function.');
    listeners.add(listener);
    if (options.immediate) listener(freeze({ type: 'receiver-ready', status: getStatus(), timestamp: new Date().toISOString() }));
    return () => listeners.delete(listener);
  }
  function publish(type, detail){
    const event = freeze({ type, leagueId: tenant().current().id, detail: clone(detail), timestamp: new Date().toISOString() });
    listeners.forEach(listener => { try { listener(event); } catch (error) { console.error('[Companion Export Receiver] listener failed', error); } });
    window.dispatchEvent(new CustomEvent('franchisehq:companion-export-receiver', { detail: event }));
    return event;
  }
  function copyUrl(){
    const url = new URL(endpoint(), location.origin).toString();
    return navigator.clipboard?.writeText(url).then(() => url).catch(() => url);
  }
  function diagnostics(){
    return freeze({
      service: 'leagueCompanionExportReceiver', version: VERSION,
      leagueId: tenant().current().id, leagueSlug: tenant().current().slug,
      endpoint: endpoint(), method: 'POST', previewOnly: true,
      automaticActivation: false, rawPayloadPrivate: true,
      statusAvailable: Boolean(latestStatus), inspectionAvailable: Boolean(latestInspection), rawPayloadExposed: false, lastError
    });
  }
  function formatBytes(value){
    const bytes = Number(value || 0); if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }
  function renderPanel(){
    const status = latestStatus;
    const receiver = status?.receiver || {};
    const pending = status?.pendingExport || null;
    const tone = pending ? 'warning' : receiver.ready ? 'success' : 'neutral';
    const label = pending ? 'New Export Available' : receiver.ready ? 'Receiver Ready' : status ? 'Setup Required' : 'Not Checked';
    return `<article class="card companion-export-receiver-card" data-companion-export-receiver-panel>
      <div class="card-header"><div><span class="eyebrow">v5.9.1.5 · Payload inspector</span><h3>Madden Companion Export Receiver</h3><p>Receives league JSON directly from Madden Companion and stores it as a pending export. Nothing becomes live automatically.</p></div><span class="pill pill--${tone}" data-receiver-badge>${label}</span></div>
      <div class="league-import-framework-grid">
        <div><span>League</span><strong>${tenant().current().name}</strong></div>
        <div><span>Endpoint</span><strong>${endpoint()}</strong></div>
        <div><span>Storage</span><strong>${receiver.storageConfigured === true ? 'Configured' : receiver.storageConfigured === false ? 'Not configured' : 'Not checked'}</strong></div>
        <div><span>Export Token</span><strong>${receiver.tokenConfigured === true ? 'Configured' : receiver.tokenConfigured === false ? 'Not configured' : 'Not checked'}</strong></div>
        <div><span>Pending Export</span><strong>${pending ? pending.exportId : 'None'}</strong></div>
        <div><span>Received</span><strong>${pending?.receivedAt ? new Date(pending.receivedAt).toLocaleString() : 'Never'}</strong></div>
        <div><span>Season / Week</span><strong>${pending ? `${pending.season ?? '—'} / ${pending.week ?? '—'}` : '—'}</strong></div>
        <div><span>Payload Size</span><strong>${pending ? formatBytes(pending.byteLength) : '—'}</strong></div>
      </div>
      <div class="league-import-framework-actions"><button class="button button--primary" data-refresh-companion-receiver>Check Receiver</button><button class="button button--ghost" data-copy-companion-endpoint>Copy Export URL</button></div>${pending ? `<div class="league-import-framework-actions"><input type="password" data-companion-inspector-token placeholder="Private export token" autocomplete="off"><button class="button button--primary" data-inspect-companion-payload>Inspect Pending Payload</button></div>` : ''}${latestInspection ? `<div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span>Inspection complete: ${latestInspection.collections?.length||0} array collections detected. Raw payload was not returned.</span></div>` : ''}
      <div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span>${pending ? 'A real Companion payload is waiting for mapping and commissioner review. The active snapshot has not changed.' : 'Cloudflare must have the R2, KV, and export-token bindings configured before Madden Companion can submit data.'}</span></div>
      <p class="league-import-status-note" data-receiver-message>${lastError ? lastError : 'Use this endpoint in Madden Companion after Cloudflare bindings are configured.'}</p>
    </article>`;
  }
  function rerender(){
    const panel = document.querySelector('[data-companion-export-receiver-panel]');
    if (panel) panel.outerHTML = renderPanel();
  }
  document.addEventListener('click', async event => {
    const refreshButton = event.target.closest('[data-refresh-companion-receiver]');
    if (refreshButton) {
      refreshButton.disabled = true; refreshButton.textContent = 'Checking…';
      try { await refresh(); } catch (_) {} finally { rerender(); }
      return;
    }
    const inspectButton=event.target.closest('[data-inspect-companion-payload]');
    if(inspectButton){const input=document.querySelector('[data-companion-inspector-token]');inspectButton.disabled=true;inspectButton.textContent='Inspecting…';try{await inspect(input?.value);rerender();}catch(error){lastError=error.message;rerender();}return;}
    const copyButton = event.target.closest('[data-copy-companion-endpoint]');
    if (copyButton) {
      const original = copyButton.textContent;
      await copyUrl(); copyButton.textContent = 'Copied';
      setTimeout(() => { if (copyButton.isConnected) copyButton.textContent = original; }, 1500);
    }
  });
  window.addEventListener('franchisehq:league-tenant-changed', () => { latestStatus = null; lastError = null; rerender(); });

  if (!HQ.defineModuleService) throw new Error('platform/core.js must load before companion-export-receiver.js.');
  HQ.defineModuleService('league','leagueCompanionExportReceiver',{endpoint,inspectEndpoint,refresh,inspect,getStatus,getInspection,subscribe,copyUrl,renderPanel,diagnostics},{replace:true,alias:'leagueCompanionExportReceiver'});
  HQ.manifest?.register?.({scope:'module',module:'league',id:'league-companion-export-receiver',service:'leagueCompanionExportReceiver',script:'league-engine/companion-export-receiver.js',version:VERSION,dependencies:['leagueTenant'],capabilities:['league-scoped-post-endpoint','token-authenticated-export','private-r2-payload-storage','kv-pending-metadata','sanitized-status','no-auto-activation','structural-payload-inspection','raw-payload-not-exposed']});
})();
