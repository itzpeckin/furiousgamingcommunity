(function(){
  'use strict';
  const VERSION='5.9.3.2';
  const HQ=window.FranchiseHQ=window.FranchiseHQ||{};
  let latest=null,lastError=null;
  function tenant(){return HQ.leagueTenant;}
  function endpoint(){return `/api/leagues/${encodeURIComponent(tenant().current().slug)}/companion/discovery`;}
  async function refresh(){
    const response=await fetch(endpoint(),{headers:{accept:'application/json'},cache:'no-store'});
    const payload=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
    if(!response.ok||payload.ok===false)throw new Error(payload.error||`Discovery request failed (${response.status}).`);
    latest=payload;lastError=null;rerender();return JSON.parse(JSON.stringify(payload));
  }
  function getReport(){return latest?JSON.parse(JSON.stringify(latest)):null;}
  function formatBytes(value){const b=Number(value||0);if(b<1024)return`${b} B`;if(b<1048576)return`${(b/1024).toFixed(1)} KB`;return`${(b/1048576).toFixed(1)} MB`;}
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function tokenizedBase(token){const clean=String(token||'').trim();if(!clean)return'';return `${location.origin}/api/leagues/${encodeURIComponent(tenant().current().slug)}/companion/export/${encodeURIComponent(clean)}`;}
  async function copyExportUrl(token){const value=tokenizedBase(token);if(!value)throw new Error('Enter the new private export token first.');await navigator.clipboard.writeText(value);return value;}
  function renderRows(){const rows=latest?.captures||[];if(!rows.length)return'<p class="league-import-status-note">No real Madden routes have been captured yet.</p>';return `<div class="import-history-list">${rows.slice(0,20).map(r=>`<div class="import-history-row"><div><strong>${esc(r.datasetType)}</strong><span>${esc(r.method)} · ${esc(r.routePath)}</span></div><div><span>${r.receivedAt?new Date(r.receivedAt).toLocaleString():'—'}</span><span>${formatBytes(r.byteLength)}</span></div></div>`).join('')}</div>`;}
  function renderPanel(){const count=latest?.routeCount??0;const summary=latest?.datasetSummary||{};return `<article class="card" data-companion-route-discovery-panel><div class="card-header"><div><span class="eyebrow">v5.9.3.2 · Route capture</span><h3>Madden Companion Route Discovery</h3><p>Captures every route Madden adds to the export base URL and stores each response separately for inspection.</p></div><span class="pill pill--${count?'success':'neutral'}">${count?`${count} Captured`:'Waiting'}</span></div><div class="league-import-framework-grid"><div><span>League</span><strong>${esc(tenant().current().name)}</strong></div><div><span>Routes Captured</span><strong>${count}</strong></div><div><span>League Info</span><strong>${summary['league-info']||0}</strong></div><div><span>Standings</span><strong>${summary.standings||0}</strong></div><div><span>Weekly Stats</span><strong>${summary['weekly-stats']||0}</strong></div><div><span>Unknown Routes</span><strong>${summary.unknown||0}</strong></div></div><div class="league-import-framework-actions"><input type="password" data-route-discovery-token placeholder="New private export token" autocomplete="off"><button class="button button--primary" data-copy-route-discovery-url>Copy Madden Export URL</button><button class="button button--ghost" data-refresh-route-discovery>Refresh Discovery</button></div><div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span>The token is used only to build the copied URL and is not saved in the browser. Rotate the token exposed in the screenshot before testing.</span></div><h4>Captured Routes</h4>${renderRows()}<p class="league-import-status-note">${esc(lastError||'No captured payload is activated automatically.')}</p></article>`;}
  function rerender(){const p=document.querySelector('[data-companion-route-discovery-panel]');if(p)p.outerHTML=renderPanel();}
  document.addEventListener('click',async e=>{const refreshButton=e.target.closest('[data-refresh-route-discovery]');if(refreshButton){refreshButton.disabled=true;try{await refresh()}catch(err){lastError=err.message;rerender()}return;}const copyButton=e.target.closest('[data-copy-route-discovery-url]');if(copyButton){const input=document.querySelector('[data-route-discovery-token]');try{await copyExportUrl(input?.value);copyButton.textContent='Copied';setTimeout(()=>{if(copyButton.isConnected)copyButton.textContent='Copy Madden Export URL'},1500)}catch(err){lastError=err.message;rerender()}}});
  function diagnostics(){return Object.freeze({service:'leagueCompanionRouteDiscovery',version:VERSION,catchAllRoute:true,pathTokenAuthentication:true,queryTokenDeprecated:true,rawPayloadExposed:false,activationPerformed:false,reportAvailable:Boolean(latest),lastError});}
  if(!HQ.defineModuleService)throw new Error('platform/core.js must load before companion-route-discovery.js.');
  HQ.defineModuleService('league','leagueCompanionRouteDiscovery',{endpoint,refresh,getReport,tokenizedBase,copyExportUrl,renderPanel,diagnostics},{replace:true,alias:'leagueCompanionRouteDiscovery'});
})();
