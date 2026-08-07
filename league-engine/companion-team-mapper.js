(function(){
  'use strict';
  const VERSION='5.9.3.2a';
  const HQ=window.FranchiseHQ=window.FranchiseHQ||{};
  const PREVIEW_KEY='franchisehq:team-preview-enabled';
  let latest=null,lastError=null,busy=false,previewOpen=false;
  function tenant(){return HQ.leagueTenant;}
  function endpoint(){return `/api/leagues/${encodeURIComponent(tenant().current().slug)}/companion/map-teams`;}
  function previewEnabled(){return sessionStorage.getItem(PREVIEW_KEY)==='true';}
  function setPreviewEnabled(value){sessionStorage.setItem(PREVIEW_KEY,String(Boolean(value)));rerender();return previewEnabled();}
  async function request(method){
    const response=await fetch(endpoint(),{method,headers:{accept:'application/json','content-type':'application/json'},credentials:'same-origin',cache:'no-store',body:method==='POST'?'{}':undefined});
    const payload=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
    if(!response.ok||payload.ok===false)throw new Error(payload.detail||payload.error||`Team mapping failed (${response.status}).`);
    latest=payload;lastError=null;rerender();if(previewOpen)renderPreviewModal();return clone(payload);
  }
  function refresh(){return request('GET');}
  function mapTeams(){return request('POST');}
  function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
  function getPreview(){return latest?clone(latest):null;}
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function record(team){const parts=[];if(team.wins!=null&&team.losses!=null)parts.push(`${team.wins}-${team.losses}${team.ties?`-${team.ties}`:''}`);return parts.join(' · ')||'Record not mapped';}
  function color(team,key,fallback){const value=team?.[key];return /^#[0-9A-F]{6}$/i.test(value||'')?value:fallback;}
  function initials(team){return String(team.abbreviation||team.displayName||'TM').replace(/[^A-Za-z0-9]/g,'').slice(0,3).toUpperCase();}
  function teamCard(team){
    const primary=color(team,'primaryColor','#2C275F'),secondary=color(team,'secondaryColor','#F4F2FF');
    const logo=team.logoUrl?`<img src="${esc(team.logoUrl)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">`:'';
    return `<article class="card" style="overflow:hidden;padding:0"><div style="height:8px;background:${primary}"></div><div style="padding:18px;display:grid;grid-template-columns:64px 1fr;gap:14px;align-items:center"><div style="width:64px;height:64px;border-radius:16px;background:${secondary};border:1px solid rgba(0,0,0,.08);display:grid;place-items:center;overflow:hidden">${logo}<strong style="${team.logoUrl?'display:none;':''}color:${primary};font-size:18px">${esc(initials(team))}</strong></div><div><span class="eyebrow">${esc(team.conferenceName||'Conference not mapped')}${team.divisionName?` · ${esc(team.divisionName)}`:''}</span><h3 style="margin:4px 0">${esc(team.displayName)}</h3><p style="margin:0">${esc(team.abbreviation||'No abbreviation')} · ${esc(record(team))}</p></div></div><div style="padding:0 18px 18px;display:flex;gap:8px;flex-wrap:wrap"><span class="pill pill--${team.userControlled?'success':'neutral'}">${team.userControlled?'User controlled':'Control unknown'}</span>${team.ownerName?`<span class="pill pill--neutral">${esc(team.ownerName)}</span>`:''}<span class="pill pill--neutral">EA ID ${esc(team.externalId)}</span></div></article>`;
  }
  function renderPreviewModal(){
    let modal=document.querySelector('[data-team-preview-modal]');
    if(!modal){modal=document.createElement('div');modal.dataset.teamPreviewModal='';document.body.appendChild(modal);}
    const teams=latest?.teams||[];
    modal.innerHTML=`<div style="position:fixed;inset:0;z-index:9999;background:rgba(11,10,30,.72);padding:32px;overflow:auto" data-close-team-preview><section style="max-width:1240px;margin:0 auto;background:var(--surface,#fff);border-radius:20px;padding:24px" onclick="event.stopPropagation()"><div class="card-header"><div><span class="eyebrow">Pending import preview · Browser only</span><h2>Mapped Teams</h2><p>This is normalized preview data. Nothing here is live for league members.</p></div><button class="button button--ghost" data-close-team-preview>Close</button></div><div class="league-import-framework-grid"><div><span>Teams Mapped</span><strong>${teams.length}</strong></div><div><span>Source Route</span><strong>${esc(latest?.mappingRun?.sourceRoutePath||'—')}</strong></div><div><span>Status</span><strong>${esc(latest?.mappingRun?.status||'Not mapped')}</strong></div><div><span>Live Snapshot Changed</span><strong>No</strong></div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:20px">${teams.length?teams.map(teamCard).join(''):'<article class="card"><h3>No mapped teams yet</h3><p>Run the Team Mapper first.</p></article>'}</div></section></div>`;
    modal.hidden=!previewOpen;
  }
  function openPreview(){previewOpen=true;renderPreviewModal();}
  function closePreview(){previewOpen=false;const modal=document.querySelector('[data-team-preview-modal]');if(modal)modal.hidden=true;}
  function renderPanel(){
    const run=latest?.mappingRun,teams=latest?.teams||[],warnings=run?.warnings||[],enabled=previewEnabled();
    return `<article class="card" data-companion-team-mapper-panel><div class="card-header"><div><span class="eyebrow">v5.9.3.2a · Team source selection hotfix</span><h3>Team Mapper & Preview</h3><p>Selects the permanent league-teams dataset, rejects player/stat records, and stores normalized teams only in a pending preview run.</p></div><span class="pill pill--${teams.length?'success':'neutral'}">${teams.length?`${teams.length} Teams Mapped`:'Not Mapped'}</span></div><div class="league-import-framework-grid"><div><span>Source Route</span><strong>${esc(run?.sourceRoutePath||'—')}</strong></div><div><span>Mapped Teams</span><strong>${teams.length}</strong></div><div><span>Warnings</span><strong>${warnings.length}</strong></div><div><span>Preview Status</span><strong>${enabled?'Enabled for this browser':'Disabled'}</strong></div><div><span>Mapping State</span><strong>${esc(run?.status||'Waiting')}</strong></div><div><span>Live Snapshot Changed</span><strong>No</strong></div></div><div class="league-import-framework-actions"><button class="button button--primary" data-map-companion-teams ${busy?'disabled':''}>${busy?'Mapping…':'Map Latest Teams'}</button><button class="button button--ghost" data-refresh-companion-team-map ${busy?'disabled':''}>Refresh</button><button class="button button--secondary" data-open-team-preview ${teams.length?'':'disabled'}>Open Team Preview</button><button class="button button--ghost" data-toggle-team-preview ${teams.length?'':'disabled'}>${enabled?'Disable Browser Preview':'Enable Browser Preview'}</button></div><div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span>Browser Preview is session-only. It does not activate the pending data, change the active snapshot, or affect other league members.</span></div>${warnings.length?`<details><summary><strong>${warnings.length} mapping warning${warnings.length===1?'':'s'}</strong></summary><div class="validation-errors">${warnings.slice(0,50).map(item=>`<p>${esc(item)}</p>`).join('')}</div></details>`:''}<p class="league-import-status-note">${esc(lastError||'Map teams after dataset classification. Player and schedule data remain intentionally unavailable in this preview.')}</p></article>`;
  }
  function rerender(){const panel=document.querySelector('[data-companion-team-mapper-panel]');if(panel)panel.outerHTML=renderPanel();}
  document.addEventListener('click',async event=>{
    if(event.target.closest('[data-close-team-preview]')){closePreview();return;}
    const map=event.target.closest('[data-map-companion-teams]');
    const refreshButton=event.target.closest('[data-refresh-companion-team-map]');
    if(event.target.closest('[data-open-team-preview]')){openPreview();return;}
    if(event.target.closest('[data-toggle-team-preview]')){setPreviewEnabled(!previewEnabled());return;}
    if(!map&&!refreshButton)return;
    busy=true;rerender();
    try{if(map)await mapTeams();else await refresh();}catch(error){lastError=error.message;}finally{busy=false;rerender();}
  });
  function diagnostics(){return Object.freeze({service:'leagueCompanionTeamMapper',version:VERSION,previewAvailable:Boolean(latest?.teams?.length),teamCount:latest?.teams?.length||0,previewEnabled:previewEnabled(),status:latest?.mappingRun?.status||'not-mapped',activeSnapshotChanged:false,activationPerformed:false,rawPayloadExposed:false,lastError});}
  if(!HQ.defineModuleService)throw new Error('platform/core.js must load before companion-team-mapper.js.');
  HQ.defineModuleService('league','leagueCompanionTeamMapper',{endpoint,refresh,mapTeams,getPreview,previewEnabled,setPreviewEnabled,openPreview,renderPanel,diagnostics},{replace:true,alias:'leagueCompanionTeamMapper'});
})();
