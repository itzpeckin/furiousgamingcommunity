(() => {
  'use strict';
  const HQ = window.FranchiseHQ = window.FranchiseHQ || {};
  const VERSION = '5.9.2.1a';
  let latestStatus = null, latestHistory = null, latestInspection = null, lastError = null;
  const listeners = new Set();
  const clone = value => value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const freeze = value => Object.freeze(value);
  function tenant(){ if (!HQ.leagueTenant) throw new Error('League tenant service is unavailable.'); return HQ.leagueTenant; }
  function endpoint(){ return tenant().exportEndpoint(); }
  function inspectEndpoint(){ return endpoint().replace(/\/export$/, '/inspect'); }
  function historyEndpoint(){ return endpoint().replace(/\/export$/, '/exports'); }
  async function readJson(response){ const payload = await response.json().catch(() => ({})); if (!response.ok || payload.ok === false) throw new Error(payload.error || `Request failed (${response.status}).`); return payload; }
  async function refresh(options = {}) {
    lastError = null;
    try {
      const [status, history] = await Promise.all([
        fetch(endpoint(), { headers: { accept: 'application/json' }, cache: 'no-store' }).then(readJson),
        fetch(historyEndpoint(), { headers: { accept: 'application/json' }, cache: 'no-store' }).then(readJson)
      ]);
      latestStatus = freeze({ ...status, checkedAt: new Date().toISOString() }); latestHistory = freeze(history);
      publish('receiver-status-refreshed', { status: latestStatus, history: latestHistory }); return getStatus();
    } catch (error) { lastError = error.message; if (options.silent !== true) console.warn('[Companion Storage]', error); publish('receiver-status-failed', { error: error.message }); throw error; }
  }
  async function inspect(token){
    const value=String(token||'').trim(); if(!value) throw new Error('Enter the private Companion export token before inspecting.');
    const payload=await fetch(inspectEndpoint(),{headers:{accept:'application/json','x-franchisehq-export-token':value},cache:'no-store'}).then(readJson);
    latestInspection=freeze(payload.inspection); await refresh({silent:true}); publish('receiver-payload-inspected',latestInspection); return clone(latestInspection);
  }
  async function reject(exportId, token, reason='Rejected by commissioner'){
    const value=String(token||'').trim(); if(!value) throw new Error('Enter the private Companion export token before rejecting.');
    const payload=await fetch(historyEndpoint(),{method:'POST',headers:{'content-type':'application/json','x-franchisehq-export-token':value},body:JSON.stringify({action:'reject',exportId,reason})}).then(readJson);
    await refresh({silent:true}); publish('receiver-export-rejected',payload); return clone(payload);
  }
  function getStatus(){ return clone({ status: latestStatus, history: latestHistory }); }
  function getInspection(){ return clone(latestInspection); }
  function subscribe(listener, options={}){ if(typeof listener!=='function') throw new TypeError('Receiver listener must be a function.'); listeners.add(listener); if(options.immediate) listener(freeze({type:'receiver-ready',detail:getStatus(),timestamp:new Date().toISOString()})); return()=>listeners.delete(listener); }
  function publish(type,detail){ const event=freeze({type,leagueId:tenant().current().id,detail:clone(detail),timestamp:new Date().toISOString()}); listeners.forEach(listener=>{try{listener(event)}catch(error){console.error('[Companion Storage] listener failed',error)}}); window.dispatchEvent(new CustomEvent('franchisehq:companion-export-receiver',{detail:event})); return event; }
  function exportUrlWithToken(token){ const url=new URL(endpoint(),location.origin); if(token) url.searchParams.set('token',String(token).trim()); return url.toString(); }
  function copyUrl(token=''){ const url=exportUrlWithToken(token); return navigator.clipboard?.writeText(url).then(()=>url).catch(()=>url); }
  function diagnostics(){ return freeze({service:'leagueCompanionExportReceiver',version:VERSION,leagueId:tenant().current().id,leagueSlug:tenant().current().slug,endpoint:endpoint(),historyEndpoint:historyEndpoint(),method:'POST',durableD1History:true,privateR2Payloads:true,kvLatestPointer:true,duplicateProtection:'sha-256',rejectionRetainsRawPayload:true,automaticActivation:false,statusAvailable:Boolean(latestStatus),historyAvailable:Boolean(latestHistory),inspectionAvailable:Boolean(latestInspection),rawPayloadExposed:false,lastError}); }
  function formatBytes(value){const bytes=Number(value||0);if(!bytes)return'—';if(bytes<1024)return`${bytes} B`;if(bytes<1048576)return`${(bytes/1024).toFixed(1)} KB`;return`${(bytes/1048576).toFixed(1)} MB`;}
  function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}
  function renderHistory(){ const rows=latestHistory?.exports||[]; if(!rows.length)return'<p class="league-import-status-note">No Companion exports have been received yet.</p>'; return `<div class="import-history-list">${rows.slice(0,8).map(row=>`<div class="import-history-row"><div><strong>${escapeHtml(row.exportId)}</strong><span>${row.receivedAt?new Date(row.receivedAt).toLocaleString():'—'} · ${formatBytes(row.byteLength)}</span></div><div><span class="pill pill--${row.status==='rejected'?'warning':row.status==='processed'?'success':'neutral'}">${escapeHtml(row.status)}</span><span>Season ${row.season??'—'} · Week ${row.week??'—'}</span></div></div>`).join('')}</div>`; }
  function renderPanel(){
    const status=latestStatus, receiver=status?.receiver||{}, pending=status?.pendingExport||null, latest=status?.latestExport||null;
    const tone=pending?'warning':receiver.ready?'success':'neutral'; const label=pending?'New Export Available':receiver.ready?'Storage Ready':status?'Setup Required':'Not Checked';
    return `<article class="card companion-export-receiver-card" data-companion-export-receiver-panel>
      <div class="card-header"><div><span class="eyebrow">v5.9.2.1a · Durable storage</span><h3>Madden Companion Storage Layer</h3><p>Stores every authenticated export in private R2, records it in D1, and points KV to the latest pending record.</p></div><span class="pill pill--${tone}">${label}</span></div>
      <div class="league-import-framework-grid">
        <div><span>League</span><strong>${escapeHtml(tenant().current().name)}</strong></div><div><span>League ID</span><strong>${escapeHtml(status?.leagueId||tenant().current().id)}</strong></div>
        <div><span>R2 Storage</span><strong>${receiver.storageConfigured===true?'Ready':'Not ready'}</strong></div><div><span>D1 Storage</span><strong>${receiver.databaseConfigured===true?'Ready':'Not ready'}</strong></div>
        <div><span>KV Pointer</span><strong>${receiver.kvPointerReady===true?'Ready':'Not ready'}</strong></div><div><span>Pending Exports</span><strong>${status?.pendingCount??'—'}</strong></div>
        <div><span>Latest Export</span><strong>${latest?.exportId||'None'}</strong></div><div><span>Latest Status</span><strong>${latest?.status||'—'}</strong></div>
        <div><span>Received</span><strong>${latest?.receivedAt?new Date(latest.receivedAt).toLocaleString():'Never'}</strong></div><div><span>Payload Size</span><strong>${latest?formatBytes(latest.byteLength):'—'}</strong></div>
      </div>
      <div class="league-import-framework-actions"><button class="button button--primary" data-refresh-companion-receiver>Check Storage</button><button class="button button--ghost" data-copy-companion-endpoint>Copy Base Export URL</button></div>
      ${pending?`<div class="league-import-framework-actions"><input type="password" data-companion-storage-token placeholder="Private export token" autocomplete="off"><button class="button button--primary" data-inspect-companion-payload>Inspect</button><button class="button button--ghost" data-reject-companion-export data-export-id="${escapeHtml(pending.exportId)}">Reject</button></div>`:''}
      <div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span>${pending?'The raw payload is private and the active league snapshot has not changed.':'Use the tokenized URL in Madden Companion only after this card reports Storage Ready.'}</span></div>
      <h4>Recent Receiver History</h4>${renderHistory()}
      <p class="league-import-status-note">${escapeHtml(lastError||latestStatus?.message||'Run Check Storage after deployment.')}</p>
    </article>`;
  }
  function rerender(){const panel=document.querySelector('[data-companion-export-receiver-panel]');if(panel)panel.outerHTML=renderPanel();}
  document.addEventListener('click',async event=>{
    const refreshButton=event.target.closest('[data-refresh-companion-receiver]'); if(refreshButton){refreshButton.disabled=true;refreshButton.textContent='Checking…';try{await refresh()}catch(_){}finally{rerender()}return;}
    const inspectButton=event.target.closest('[data-inspect-companion-payload]'); if(inspectButton){const input=document.querySelector('[data-companion-storage-token]');inspectButton.disabled=true;try{await inspect(input?.value)}catch(error){lastError=error.message}finally{rerender()}return;}
    const rejectButton=event.target.closest('[data-reject-companion-export]'); if(rejectButton){const input=document.querySelector('[data-companion-storage-token]');if(!confirm('Reject this pending export? The raw R2 file will be retained.'))return;rejectButton.disabled=true;try{await reject(rejectButton.dataset.exportId,input?.value)}catch(error){lastError=error.message}finally{rerender()}return;}
    const copyButton=event.target.closest('[data-copy-companion-endpoint]'); if(copyButton){const original=copyButton.textContent;await copyUrl();copyButton.textContent='Copied';setTimeout(()=>{if(copyButton.isConnected)copyButton.textContent=original},1500);}
  });
  window.addEventListener('franchisehq:league-tenant-changed',()=>{latestStatus=null;latestHistory=null;latestInspection=null;lastError=null;rerender()});
  if(!HQ.defineModuleService)throw new Error('platform/core.js must load before companion-export-receiver.js.');
  HQ.defineModuleService('league','leagueCompanionExportReceiver',{endpoint,inspectEndpoint,historyEndpoint,refresh,inspect,reject,getStatus,getInspection,subscribe,exportUrlWithToken,copyUrl,renderPanel,diagnostics},{replace:true,alias:'leagueCompanionExportReceiver'});
  HQ.manifest?.register?.({scope:'module',module:'league',id:'league-companion-export-receiver',service:'leagueCompanionExportReceiver',script:'league-engine/companion-export-receiver.js',version:VERSION,dependencies:['leagueTenant'],capabilities:['d1-export-history','private-r2-payload-storage','kv-latest-pointer','sha256-duplicate-protection','commissioner-rejection','raw-payload-retention','no-auto-activation']});
})();
