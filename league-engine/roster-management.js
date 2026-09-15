(() => {
  'use strict';
  const HQ=window.FranchiseHQ;
  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const slug=()=>HQ?.leagueTenant?.getCurrentLeague?.()?.slug;
  let dialog=null,ownerSlug=null,data=null,candidate=null,filter={type:'draft-pick',team:'',q:'',offset:0},generation=0,timer=null,busy=false,previousFocus=null;
  const endpoint=()=>`/api/leagues/${encodeURIComponent(ownerSlug)}/roster-management`;
  const teamName=key=>data?.teams?.find(team=>team.teamKey===key)?.displayName || String(key || 'Unknown').toUpperCase();
  function renderControl(){return `<div class="commissioner-roster-control"><div><strong>Roster & Pick Corrections</strong><small>Move an asset between teams with a permanent audit trail.</small></div><button class="button button--secondary" data-roster-open>Manage Roster & Picks</button></div>`;}
  function status(message,error=false){const element=dialog?.querySelector('[data-roster-status]');if(element){element.textContent=message;element.classList.toggle('is-error',error);}}
  function options(){return `<option value="">All teams</option>${(data?.teams || []).map(team=>`<option value="${esc(team.teamKey)}" ${filter.team===team.teamKey?'selected':''}>${esc(team.displayName)}</option>`).join('')}`;}
  async function load(append=false){
    const current=++generation,currentSlug=ownerSlug;
    status('Loading current ownership…');
    try {
      const params=new URLSearchParams({type:filter.type,team:filter.team,q:filter.q,offset:String(filter.offset)});
      const response=await fetch(`${endpoint()}?${params}`,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      const result=await response.json();
      if(!response.ok || !result.ok)throw new Error(result.error || 'Unable to load ownership.');
      if(current!==generation || !dialog?.open || currentSlug!==slug())return;
      if(append && data?.snapshotId===result.snapshotId)result.items=[...data.items,...result.items];
      data=result;dialog.querySelector('[data-roster-team]').innerHTML=options();
      renderRows();status(`${data.items.length} assets shown. Ownership changes are immediate and audited.`);
    } catch(error){if(current===generation && dialog?.open)status(error.message,true);}
  }
  function renderRows(){
    dialog.querySelector('[data-roster-list]').innerHTML=(data?.items || []).map(item=>`<article class="roster-correction-row"><div><strong>${esc(item.name)}</strong><small>${item.assetType==='player'?`${esc(item.position || '—')} · OVR ${esc(item.overall ?? '—')} · AGE ${esc(item.age ?? '—')} · ${esc(item.development || '—')}`:`Original owner: ${esc(teamName(item.originalTeamKey))}`}</small></div><span class="roster-owner-badge">${esc(teamName(item.teamKey))}</span><button class="button button--secondary" data-roster-move="${esc(item.assetId)}">Move</button></article>`).join('') || '<div class="roster-correction-empty">No matching assets.</div>';
    dialog.querySelector('[data-roster-more]').hidden=data?.nextOffset==null;
  }
  function open(){
    if(!slug() || dialog?.open)return;
    previousFocus=document.activeElement;ownerSlug=slug();data=null;candidate=null;filter={type:'draft-pick',team:'',q:'',offset:0};
    dialog=document.createElement('dialog');dialog.className='roster-management-dialog';dialog.setAttribute('aria-labelledby','roster-management-title');
    dialog.innerHTML=`<header class="roster-management-header"><div><span class="eyebrow">Commissioner corrections</span><h2 id="roster-management-title">Roster & Picks</h2><p>FranchiseHQ preserves these changes across Madden imports.</p></div><button class="button button--ghost" data-roster-close aria-label="Close roster management">✕</button></header><div class="roster-management-filters"><label>Asset type<select data-roster-type><option value="draft-pick">Draft picks</option><option value="player">Players</option></select></label><label>Current owner<select data-roster-team><option value="">All teams</option></select></label><label>Search<input type="search" data-roster-search placeholder="Name, position, year or round" autocomplete="off"></label></div><p class="roster-management-status" data-roster-status role="status" aria-live="polite"></p><section class="roster-move-confirmation" data-roster-confirm hidden></section><div class="roster-management-list" data-roster-list></div><footer class="roster-management-footer"><span>Every correction appears in Audit and league Transactions. Trade allowances are unchanged.</span><button class="button button--secondary" data-roster-more hidden>Show more</button></footer>`;
    document.body.appendChild(dialog);dialog.showModal();
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.addEventListener('close',()=>{generation++;clearTimeout(timer);dialog.remove();dialog=null;candidate=null;previousFocus?.focus?.();});
    load();
  }
  function chooseMove(id){
    candidate=data?.items.find(item=>item.assetId===id);if(!candidate)return;
    const panel=dialog.querySelector('[data-roster-confirm]');panel.hidden=false;
    panel.innerHTML=`<strong>Move ${esc(candidate.name)}</strong><p>Currently owned by ${esc(teamName(candidate.teamKey))}.</p><div class="roster-move-fields"><label>Destination team<select data-roster-destination><option value="">Choose destination…</option>${data.teams.filter(team=>team.teamKey!==candidate.teamKey).map(team=>`<option value="${esc(team.teamKey)}">${esc(team.displayName)}</option>`).join('')}</select></label><label>Audit note (optional)<input data-roster-reason maxlength="500" placeholder="Why is this correction needed?"></label></div><div class="roster-confirm-actions"><button class="button button--secondary" data-roster-cancel>Cancel</button><button class="button button--primary" data-roster-save>Confirm Move</button></div>`;
    panel.scrollIntoView({block:'nearest',behavior:'smooth'});panel.querySelector('select').focus();
  }
  async function save(){
    if(busy || !candidate || ownerSlug!==slug())return;
    const destination=dialog.querySelector('[data-roster-destination]').value;
    if(!destination){status('Choose a destination team.',true);return;}
    const asset=candidate,requestId=crypto.randomUUID(),snapshotId=data.snapshotId,reason=dialog.querySelector('[data-roster-reason]').value.trim();
    busy=true;dialog.querySelectorAll('button,input,select').forEach(element=>{element.disabled=true;});status(`Moving ${asset.name} to ${teamName(destination)}…`);
    try {
      const response=await fetch(endpoint(),{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({
        requestId,assetType:asset.assetType,assetId:asset.assetId,fromTeamKey:asset.teamKey,toTeamKey:destination,expectedRevision:asset.revision,snapshotId,reason
      })});
      const result=await response.json();if(!response.ok || !result.ok)throw new Error(result.error || 'The move could not be saved.');
      if(ownerSlug!==slug())return;
      HQ?.liveData?.invalidateRosterAuthority?.();
      let refreshFailed=false;
      try {await window.FGC_APP?.syncTradeCenterLiveBridge?.({rerender:false,forceLive:true});}catch{refreshFailed=true;}
      await HQ?.liveTradeCenter?.load?.(true).catch(()=>{});
      candidate=null;dialog.querySelector('[data-roster-confirm]').hidden=true;filter.offset=0;
      await load();status(`${asset.name} moved to ${teamName(destination)}. Audit recorded.${refreshFailed?' Refresh the page to reload roster views.':''}`);
    } catch(error){status(error.message,true);}
    finally {busy=false;if(ownerSlug!==slug())dialog?.close();else dialog?.querySelectorAll('button,input,select').forEach(element=>{element.disabled=false;});}
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest?.('button');if(!target)return;
    if(target.hasAttribute('data-roster-open')){event.preventDefault();open();}
    else if(target.hasAttribute('data-roster-close')&&!busy)dialog?.close();
    else if(target.hasAttribute('data-roster-move'))chooseMove(target.dataset.rosterMove);
    else if(target.hasAttribute('data-roster-cancel')){candidate=null;dialog.querySelector('[data-roster-confirm]').hidden=true;}
    else if(target.hasAttribute('data-roster-save'))save();
    else if(target.hasAttribute('data-roster-more')&&data?.nextOffset!=null){filter.offset=data.nextOffset;load(true);}
  });
  document.addEventListener('change',event=>{
    if(!dialog?.contains(event.target) || busy)return;
    if(event.target.hasAttribute('data-roster-type'))filter.type=event.target.value;
    else if(event.target.hasAttribute('data-roster-team'))filter.team=event.target.value;
    else return;
    candidate=null;dialog.querySelector('[data-roster-confirm]').hidden=true;filter.offset=0;load();
  });
  document.addEventListener('input',event=>{
    if(!event.target.hasAttribute?.('data-roster-search') || busy)return;
    filter.q=event.target.value;filter.offset=0;generation++;clearTimeout(timer);timer=setTimeout(()=>load(),200);
  });
  window.addEventListener('franchisehq:league-tenant-changed',()=>{if(!busy)dialog?.close();generation++;});
  HQ.rosterManagement={release:'7.5.6.4',renderControl,open};
})();
