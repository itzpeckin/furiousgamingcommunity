(() => {
  'use strict';

  const HQ=window.FranchiseHQ;
  const VERSION='7.4.0.6';
  const page=()=>document.querySelector('[data-page-content]');
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const slug=()=>HQ?.leagueTenant?.getCurrentLeague?.()?.slug||null;
  const route=()=>String(location.hash||'#home').replace(/^#\/?/,'');
  const routePart=()=>route().split('/')[1]||'';
  let state=null,loading=null,lastError=null,builder=null,blockLookup=new Set(),blockManagerOpen=false,blockRosterOpen=false,blockEditor=null,blockRosterSearch='',blockRemovalCandidate=null,cancelArmedTradeId=null,builderGridScrollLeft=0;
  const builderPickerScroll=new Map();
  const assetFilters=new Map(),assetSearch=new Map(),blockFilters={scope:'league',name:'',position:'All',team:'All',overall:'All',development:'All'};

  const app=()=>window.FGC_APP;
  const teams=()=>app()?.teams||[];
  const players=()=>app()?.players||[];
  const teamById=id=>app()?.teamById?.(id)||teams().find(team=>String(team.id)===String(id));
  const playerById=id=>app()?.playerById?.(id)||players().find(player=>String(player.id)===String(id)||String(player.publicId)===String(id));
  const currentTeam=()=>String(state?.session?.teamKey||'').toLowerCase();
  const canReview=()=>['commissioner','trade_committee'].includes(state?.session?.role);
  const isCommissioner=()=>state?.session?.role==='commissioner';
  const teamName=key=>state?.teams?.find(team=>team.teamKey===key)?.displayName||teamById(key)?.fullName||String(key||'').toUpperCase();
  const teamAbbr=key=>state?.teams?.find(team=>team.teamKey===key)?.abbreviation||teamById(key)?.abbr||String(key||'').toUpperCase();
  const teamRecord=key=>{
    const shared=state?.teams?.find(team=>team.teamKey===key)||{};
    const live=teamById(shared.externalId||key)||teams().find(team=>String(team.abbr||team.abbreviation||'').toLowerCase()===String(shared.abbreviation||key||'').toLowerCase())||{};
    return{...live,...shared};
  };
  const cssColor=(value,fallback)=>/^#[0-9a-f]{3,8}$/i.test(String(value||'').trim())?String(value).trim():fallback;
  const teamVisual=key=>{const team=teamRecord(key);return{
    primary:cssColor(team.primaryColor||team.primary,'#27354a'),
    secondary:cssColor(team.secondaryColor||team.secondary,'#111827'),
    logo:team.logoUrl||team.logo||'',abbr:team.abbreviation||team.abbr||teamAbbr(key)
  }};
  const teamStyle=key=>{const visual=teamVisual(key);return `--trade-team-primary:${visual.primary};--trade-team-secondary:${visual.secondary}`};
  const teamMark=key=>{const visual=teamVisual(key);return visual.logo?`<img src="${esc(visual.logo)}" alt="">`:`<span>${esc(visual.abbr)}</span>`};
  const playerImage=player=>player?.imageUrl||player?.headshot||player?.headshotUrl||player?.image||player?.portraitUrl||player?.photoUrl||player?.portraitCandidates?.[0]||'';
  const money=value=>{const n=Number(value||0);return n?new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:1,notation:'compact'}).format(n):'—'};
  const teamKeyForPlayer=player=>{
    const raw=player?.teamId;
    const direct=state?.teams?.find(team=>[team.teamKey,team.externalId,team.abbreviation].some(value=>String(value||'').toLowerCase()===String(raw||'').toLowerCase()));
    return direct?.teamKey||String(raw||'').toLowerCase();
  };

  function endpoint(){
    if(!slug())throw new Error('A server-resolved league is required.');
    return `/api/leagues/${encodeURIComponent(slug())}/trade-center`;
  }

  function rebuildBlockLookup(){
    blockLookup=new Set((state?.listings||[]).flatMap(item=>[item.playerIdentityId,item.playerPublicId,item.draftPickId].filter(Boolean).map(String)));
  }

  async function request(action=null,payload={}){
    const response=await fetch(endpoint(),action?{
      method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({action,...payload})
    }:{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false)throw new Error(data.error||`Trade Center request failed (${response.status}).`);
    state=data;lastError=null;rebuildBlockLookup();
    if(action==='review')HQ?.liveData?.invalidateRosterAuthority?.();
    renderNotificationMenu();badges();return data;
  }

  async function load(force=false){
    if(state&&!force)return state;
    if(loading)return loading;
    loading=request().catch(error=>{lastError=error.message;throw error}).finally(()=>{loading=null});
    return loading;
  }

  function rerender(){
    const current=route();
    if(current.startsWith('trade-center'))renderTradeCenter(routePart());
    else if(current==='trade-block')renderTradeBlock();
    else if(current.startsWith('commissioner')&&document.querySelector('.commissioner-controls-page'))window.FGC_TRADE?.renderCommissioner?.('controls');
  }

  function loadingMarkup(title='Trade Center'){
    return `<div class="page-heading"><div><span class="eyebrow">Shared league workflow</span><h1>${esc(title)}</h1></div></div><article class="card live-trade-loading"><h2>${lastError?'Unable to load':'Loading league trades…'}</h2><p>${esc(lastError||'Reading the shared Trade Center, pick ledger, and notifications.')}</p>${lastError?'<button class="button button--primary" data-live-trade-retry>Retry</button>':''}</article>`;
  }

  function ensureState(title){
    if(state)return true;
    if(page())page().innerHTML=loadingMarkup(title);
    load().then(rerender).catch(rerender);
    return false;
  }

  function showToast(title,message){app()?.showToast?.(title,message)}
  function setRoute(next){app()?.setRoute?.(next)}
  function date(value){if(!value)return'';try{return new Date(value).toLocaleString()}catch{return String(value)}}
  function statusLabel(value){return({draft:'Draft',negotiating:'Negotiating',committee:'Committee Review',approved:'Approved',rejected:'Rejected',withdrawn:'Cancelled'})[value]||value}

  function assetLabel(asset){
    if(asset.assetType==='player'){
      const player=playerById(asset.sourcePlayerId)||playerById(asset.playerIdentityId);
      return player?.name||player?.displayName||'Player';
    }
    const pick=state?.picks?.find(item=>item.id===asset.draftPickId);
    return pick?`${pick.draftClass} Round ${pick.round} (${teamAbbr(pick.originalTeamKey)})`:'Draft Pick';
  }

  function assetValue(asset){
    if(!calculatorEnabled())return null;
    if(asset.assetType==='player')return playerValuation(playerById(asset.sourcePlayerId)||playerById(asset.playerIdentityId))?.total??null;
    return pickValuation(state?.picks?.find(item=>item.id===asset.draftPickId))?.total??null;
  }

  function assetValueToken(asset){
    const type=asset.assetType==='player'?'player':'draft-pick';
    const id=type==='player'?(asset.sourcePlayerId||asset.playerIdentityId):(asset.draftPickId||'');
    return `${type}:${id}`;
  }

  function valueMarkup(asset,label='Trade Value'){
    const value=assetValue(asset);
    return Number.isFinite(value)?`<button type="button" class="trade-value-button" data-live-open-asset-value="${esc(assetValueToken(asset))}" aria-label="Explain ${esc(label)} ${value.toLocaleString()}"><small>${esc(label)}</small><strong>${value.toLocaleString()}</strong><span aria-hidden="true">ⓘ</span></button>`:'';
  }

  function assetRow(asset){
    if(asset.assetType==='player'){
      const player=playerById(asset.sourcePlayerId)||playerById(asset.playerIdentityId)||{},image=playerImage(player),id=player.id||asset.sourcePlayerId||asset.playerIdentityId;
      return `<article class="trade-detail-asset trade-detail-asset--player">${image?`<img class="trade-detail-asset__photo" src="${esc(image)}" alt="">`:`<span class="trade-detail-asset__photo trade-detail-asset__photo--empty">${esc(player.position||'P')}</span>`}<span class="trade-detail-asset__identity"><button type="button" class="trade-package-player-link" data-live-open-player-button="${esc(id)}">${esc(assetLabel(asset))}</button><small><b>${esc(player.position||'—')}</b><b>${esc(player.overall??'—')} OVR</b><b>${esc(player.dev||player.developmentTrait||'Normal')}</b></small></span><span class="trade-detail-asset__route"><small>Moves from</small><strong>${esc(teamAbbr(asset.fromTeamKey))} <i aria-hidden="true">→</i> ${esc(teamAbbr(asset.toTeamKey))}</strong></span>${valueMarkup(asset)}</article>`;
    }
    return `<article class="trade-detail-asset trade-detail-asset--pick"><span class="trade-detail-asset__photo trade-detail-asset__photo--pick">R${esc(state?.picks?.find(item=>item.id===asset.draftPickId)?.round||'—')}</span><span class="trade-detail-asset__identity"><strong>${esc(assetLabel(asset))}</strong><small><b>Draft pick</b><b>FranchiseHQ ledger</b></small></span><span class="trade-detail-asset__route"><small>Moves from</small><strong>${esc(teamAbbr(asset.fromTeamKey))} <i aria-hidden="true">→</i> ${esc(teamAbbr(asset.toTeamKey))}</strong></span>${valueMarkup(asset)}</article>`;
  }

  function workflowInvolvesTeam(workflow,teamKey=currentTeam()){
    return Boolean(teamKey&&workflow?.participants?.some(item=>item.teamKey===teamKey));
  }

  function tabCount(tab){return filteredWorkflows(tab).length}

  function nav(active='all'){
    const tabs=[['received','Received'],['sent','Sent'],['drafts','Drafts'],['committee','Committee'],['approved','Approved'],['rejected','Rejected'],['history','History']];
    return `<div class="trade-center-nav"><div class="segmented-tabs">${tabs.map(([key,label])=>{const count=tabCount(key);return `<button class="${active===key?'is-active':''}" data-live-trade-tab="${key}"><span>${label}</span>${count?`<b>${count}</b>`:''}</button>`}).join('')}</div></div>`;
  }

  function filteredWorkflows(tab){
    const own=currentTeam();
    return (state?.workflows||[]).filter(workflow=>{
      const involved=workflow.participants.some(item=>item.teamKey===own);
      if(tab==='drafts')return workflow.status==='draft';
      if(tab==='committee')return workflow.status==='committee';
      if(tab==='approved')return workflow.status==='approved'&&involved;
      if(tab==='history')return workflow.status==='approved';
      if(tab==='rejected')return ['rejected','withdrawn'].includes(workflow.status);
      if(tab==='received')return workflow.status==='negotiating'&&workflow.proposerTeamKey!==own&&workflow.participants.some(item=>item.teamKey===own);
      if(tab==='sent')return workflow.status==='negotiating'&&workflow.proposerTeamKey===own;
      return false;
    });
  }

  function packageAsset(asset){
    if(asset.assetType==='player'){
      const player=playerById(asset.sourcePlayerId)||playerById(asset.playerIdentityId)||{};
      const image=playerImage(player),id=player.id||asset.sourcePlayerId||asset.playerIdentityId;
      return `<div class="trade-package-asset trade-package-asset--player">${image?`<img src="${esc(image)}" alt="">`:'<span class="trade-package-asset__placeholder">P</span>'}<span><button type="button" class="trade-package-player-link" data-live-open-player-button="${esc(id)}">${esc(player.name||player.displayName||assetLabel(asset))}</button><small>${esc(player.position||'—')} · ${esc(player.overall??'—')} OVR</small></span>${valueMarkup(asset,'Value')}</div>`;
    }
    return `<div class="trade-package-asset trade-package-asset--pick"><span class="trade-pick-ticket">PICK</span><span><strong>${esc(assetLabel(asset))}</strong><small>Draft capital</small></span>${valueMarkup(asset,'Value')}</div>`;
  }

  function workflowTitle(workflow,tab){
    const own=currentTeam(),others=workflow.participants.filter(item=>item.teamKey!==own).map(item=>teamName(item.teamKey)).join(', ');
    if(tab==='received')return `Offer from ${others||teamName(workflow.proposerTeamKey)}`;
    if(tab==='sent')return `Negotiation with ${others||'league owner'}`;
    if(tab==='committee')return `Committee review · ${workflow.participants.map(item=>teamAbbr(item.teamKey)).join(' ↔ ')}`;
    if(workflow.status==='approved')return `${workflow.participants.map(item=>teamAbbr(item.teamKey)).join(' ↔ ')} approved`;
    if(workflow.status==='rejected')return `${workflow.participants.map(item=>teamAbbr(item.teamKey)).join(' ↔ ')} closed`;
    if(workflow.status==='withdrawn')return `${workflow.participants.map(item=>teamAbbr(item.teamKey)).join(' ↔ ')} cancelled`;
    return workflow.participants.map(item=>teamAbbr(item.teamKey)).join(' ↔ ');
  }

  function workflowActionLabel(workflow,tab){
    if(tab==='received')return'Review Offer';
    if(tab==='committee')return'Review Trade';
    if(tab==='drafts')return'Continue Draft';
    return workflow.status==='approved'?'View Trade':'Open Trade';
  }

  function withdrawControls(workflow){
    if(workflow?.status!=='negotiating'||workflow.proposerTeamKey!==currentTeam())return'';
    if(cancelArmedTradeId===workflow.id)return `<button class="button button--danger" data-live-confirm-withdraw="${esc(workflow.id)}">Confirm Cancel Offer</button><button class="button button--ghost" data-live-keep-trade>Keep Negotiating</button>`;
    return `<button class="button button--danger button--subtle" data-live-withdraw="${esc(workflow.id)}">Cancel Offer</button>`;
  }

  function tradeCard(workflow,tab){
    const received=workflow.participants.map(participant=>{
      const assets=workflow.assets.filter(asset=>asset.toTeamKey===participant.teamKey);
      return `<section class="trade-package-team" style="${teamStyle(participant.teamKey)}"><div class="trade-package-team__watermark">${teamMark(participant.teamKey)}</div><header>${teamMark(participant.teamKey)}<strong>${esc(teamAbbr(participant.teamKey))} RECEIVE${assets.length===1?'S':''}</strong></header><div>${assets.map(packageAsset).join('')||'<span class="empty-mini">No incoming assets</span>'}</div></section>`;
    }).join('<span class="trade-package-swap" aria-hidden="true">⇄</span>');
    const fairness=calculatorEnabled()?tradeFairness(workflow.assets,workflow.participants.map(item=>item.teamKey)):null;
    const tone=workflow.status==='approved'?'success':['rejected','withdrawn'].includes(workflow.status)?'danger':workflow.status==='committee'?'warning':'accent';
    return `<article class="card live-trade-card live-trade-card--premium"><div class="live-trade-card__head"><div><span class="pill pill--${tone}">${esc(statusLabel(workflow.status))}</span><h3>${esc(workflowTitle(workflow,tab))}</h3><small>${esc(date(workflow.updatedAt))}</small></div><div class="live-trade-card__actions"><button class="button button--primary" data-live-open-trade="${esc(workflow.id)}">${workflowActionLabel(workflow,tab)}</button>${withdrawControls(workflow)}</div></div><div class="trade-package-matchup">${received}</div>${fairness?`<div class="trade-package-value">${fairness.rows.map(row=>`<button type="button" data-live-open-package-value="${esc(row.teamKey)}" data-live-package-direction="received" data-live-value-trade="${esc(workflow.id)}"><small>${esc(teamAbbr(row.teamKey))} package value</small><strong>${row.receivedValue.toLocaleString()} ⓘ</strong></button>`).join('')}<button type="button" data-live-open-fairness-value data-live-value-trade="${esc(workflow.id)}" class="${fairness.overall>=91?'is-positive':''}"><small>Package balance</small><strong>${fairness.overall}% · ${fairness.overall>=91?'Fair value':'Review value'} ⓘ</strong></button></div>`:''}</article>`;
  }

  function activityWorkflows(){
    return (state?.workflows||[]).filter(workflow=>workflow.status!=='draft'&&(workflowInvolvesTeam(workflow)||workflow.status==='approved')).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,5);
  }

  function activityItem(workflow){
    const involved=workflowInvolvesTeam(workflow),teams=workflow.participants.map(item=>teamAbbr(item.teamKey)).join(' ↔ ');
    let title=`${teams} trade updated`,copy='Your team trade has new activity.';
    if(workflow.status==='approved'){title=`${teams} trade approved`;copy=involved?'Your completed trade is now in league History.':'Commissioner-approved league trade.'}
    else if(workflow.status==='committee'){title='Committee review requested';copy=involved?`${teams} is awaiting a league decision.`:`${teams} is ready for your review.`}
    else if(workflow.status==='rejected'){title=`${teams} trade closed`;copy='A trade involving your team was rejected.'}
    else if(workflow.status==='withdrawn'){title=`${teams} offer cancelled`;copy='The proposing team ended this negotiation.'}
    else if(workflow.proposerTeamKey===currentTeam()){title='Your team sent an offer';copy=`Negotiation with ${workflow.participants.filter(item=>item.teamKey!==currentTeam()).map(item=>teamAbbr(item.teamKey)).join(', ')}.`}
    else {title=`${teamAbbr(workflow.proposerTeamKey)} sent your team an offer`;copy='Review the package or open the conversation.'}
    return `<button data-live-open-trade="${esc(workflow.id)}"><i class="trade-activity-dot trade-activity-dot--${esc(workflow.status)}"></i><span><strong>${esc(title)}</strong><small>${esc(copy)}</small></span><time>${esc(date(workflow.updatedAt))}</time></button>`;
  }

  function tradeBlockTargets(){
    const own=currentTeam();
    return (state?.listings||[]).filter(item=>item.assetType==='player'&&item.teamKey!==own).slice(0,3).map(item=>{const player=playerById(item.playerPublicId)||players().find(candidate=>candidate.name===item.playerName)||{},image=playerImage(player);return `<button class="trade-target" style="${teamStyle(item.teamKey)}" data-live-open-player="${esc(player.id||item.playerPublicId||'')}">${image?`<img class="trade-target__player" src="${esc(image)}" alt="">`:`<span class="trade-target__team">${teamMark(item.teamKey)}</span>`}<span><strong>${esc(player.name||item.playerName||'Player')}</strong><small>${esc(teamAbbr(item.teamKey))} · ${esc(player.position||'—')} · ${esc(player.overall??'—')} OVR</small></span></button>`}).join('');
  }

  function dashboardSummary(){
    const received=tabCount('received'),negotiating=(state?.workflows||[]).filter(workflow=>workflow.status==='negotiating'&&workflowInvolvesTeam(workflow)).length,committee=canReview()?tabCount('committee'):0,completed=(state?.workflows||[]).filter(workflow=>workflow.status==='approved').length;
    return `<div class="trade-summary-strip"><div><span>Needs your attention</span><strong>${received+committee}</strong></div><div><span>Active negotiations</span><strong>${negotiating}</strong></div><div><span>Committee review</span><strong>${committee}</strong></div><div><span>Completed</span><strong>${completed}</strong></div></div>`;
  }

  function renderDashboard(tab='received'){
    const list=filteredWorkflows(tab);
    const copy=tab==='history'?'Committee-approved FranchiseHQ trades are visible to the full league. Private negotiations and rejected proposals never appear here.':'Propose, negotiate, approve, and manage shared league trades.';
    const activity=activityWorkflows(),targets=tradeBlockTargets();
    page().innerHTML=`<div class="trade-center-page"><div class="page-heading"><div><span class="eyebrow">League transactions</span><h1>Trade Center</h1><p>${copy}</p></div>${currentTeam()?'<button class="button button--primary" data-live-start-trade>⇄&nbsp; Create Trade</button>':''}</div>${dashboardSummary()}<div class="trade-center-workspace"><main>${nav(tab)}${list.length?`<div class="live-trade-list">${list.map(workflow=>tradeCard(workflow,tab)).join('')}</div>`:`<article class="empty-state card trade-center-empty"><h2>No trades in this view</h2><p>When a relevant offer arrives, it will appear here with both team packages and the next action.</p>${currentTeam()?'<button class="button button--primary" data-live-start-trade>Create a Trade</button>':''}</article>`}</main><aside class="trade-center-rail"><section class="card trade-activity"><header><h2><span aria-hidden="true">↗</span> Trade Activity</h2><span>Private to you</span></header><div class="trade-activity__timeline">${activity.map(activityItem).join('')||'<p class="empty-mini">No relevant activity yet.</p>'}</div><button class="trade-activity__all text-button" data-live-trade-tab="history">View all trade activity <span aria-hidden="true">→</span></button><small class="trade-activity__privacy">Only activity involving your team and completed commissioner-approved trades from other teams appears here.</small></section><section class="card trade-targets"><header><h2>Trade Block Targets</h2><button class="text-button" data-route="trade-block">View all</button></header><div>${targets||'<p class="empty-mini">No other teams have listed players.</p>'}</div></section></aside></div></div>`;
  }

  function initBuilder(initialAsset=null,workflow=null){
    const own=currentTeam();
    builderGridScrollLeft=0;
    builderPickerScroll.clear();
    builder={teamKeys:own?[own]:[],transfers:[],note:workflow?.note||'',tradeId:workflow?.id||null,baseRevision:workflow?.revision||null};
    if(workflow){
      builder.teamKeys=workflow.participants.map(item=>item.teamKey);
      builder.transfers=workflow.assets.map(asset=>({assetType:asset.assetType,assetId:asset.sourcePlayerId||asset.draftPickId,fromTeamKey:asset.fromTeamKey,toTeamKey:asset.toTeamKey}));
    }
    if(initialAsset?.assetType==='player'){
      const player=playerById(initialAsset.assetId),from=teamKeyForPlayer(player);
      if(from&&!builder.teamKeys.includes(from))builder.teamKeys.push(from);
      if(player&&from){
        const destination=from===own?builder.teamKeys.find(key=>key!==from):own;
        builder.transfers.push({assetType:'player',assetId:String(player.id),fromTeamKey:from,toTeamKey:destination||''});
      }
    }
    if(initialAsset?.assetType==='draft-pick'){
      const pick=state?.picks?.find(item=>String(item.id)===String(initialAsset.assetId)),from=pick?.currentTeamKey;
      if(from&&!builder.teamKeys.includes(from))builder.teamKeys.push(from);
      if(pick&&from){
        const destination=from===own?builder.teamKeys.find(key=>key!==from):own;
        builder.transfers.push({assetType:'draft-pick',assetId:String(pick.id),fromTeamKey:from,toTeamKey:destination||''});
      }
    }
  }

  function captureBuilderViewport(){
    const grid=document.querySelector('[data-live-builder-grid]');
    if(grid)builderGridScrollLeft=grid.scrollLeft;
    document.querySelectorAll('[data-live-picker-scroll]').forEach(list=>builderPickerScroll.set(list.dataset.livePickerScroll,list.scrollTop));
  }

  function restoreBuilderViewport(){
    requestAnimationFrame(()=>{
      const grid=document.querySelector('[data-live-builder-grid]');
      if(grid)grid.scrollLeft=builderGridScrollLeft;
      document.querySelectorAll('[data-live-picker-scroll]').forEach(list=>{list.scrollTop=builderPickerScroll.get(list.dataset.livePickerScroll)||0});
    });
  }

  function selected(type,id){return builder?.transfers?.some(item=>item.assetType===type&&String(item.assetId)===String(id))}
  function teamNeeds(teamKey){return state?.teamNeeds?.find(profile=>profile.teamKey===teamKey)?.needs||[]}
  function teamCapSpace(teamKey){const team=teamRecord(teamKey),value=team.capSpace??team.availableCapSpace??team.capRoom??team.salaryCapSpace;return value==null?'—':money(value)}
  function participantAssetPicker(teamKey){
    const search=assetSearch.get(teamKey)||'';
    const roster=players().filter(player=>teamKeyForPlayer(player)===teamKey&&(!search||String(player.name||'').toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>Number(b.overall||0)-Number(a.overall||0));
    const picks=(state?.picks||[]).filter(pick=>pick.currentTeamKey===teamKey);
    const filter=assetFilters.get(teamKey)||'players',needs=teamNeeds(teamKey),visual=teamVisual(teamKey);
    const playerRows=filter==='picks'?'':roster.map(player=>{const active=selected('player',player.id),image=playerImage(player),asset={assetType:'player',sourcePlayerId:player.id},addLabel=active?'Player selected':`Add ${player.name||'player'} to trade`;return `<article class="live-trade-picker-row ${active?'is-selected':''}">${image?`<img class="live-trade-picker-photo" src="${esc(image)}" alt="">`:`<span class="live-trade-picker-photo live-trade-picker-photo--empty">${esc(player.position||'P')}</span>`}<span class="live-trade-picker-identity"><button type="button" class="trade-package-player-link" data-live-open-player-button="${esc(player.id)}">${esc(player.name)}</button><small>${esc(player.position||'—')} · ${esc(player.overall??'—')} OVR · ${esc(player.dev||player.developmentTrait||'Normal')}</small></span>${calculatorEnabled()?valueMarkup(asset):''}<button type="button" class="trade-builder-add" data-live-add-asset="player" data-live-asset-id="${esc(player.id)}" data-live-from-team="${esc(teamKey)}" ${active?'disabled':''} aria-label="${esc(addLabel)}">${active?'✓':'+'}</button></article>`}).join('');
    const pickRows=filter==='players'?'':picks.map(pick=>{const active=selected('draft-pick',pick.id),asset={assetType:'draft-pick',draftPickId:pick.id};return `<article class="live-trade-picker-row ${active?'is-selected':''}"><span class="trade-pick-ticket">R${esc(pick.round)}</span><span class="live-trade-picker-identity"><strong>${pick.draftClass} Round ${pick.round}</strong><small>Originally ${esc(teamAbbr(pick.originalTeamKey))}</small></span>${calculatorEnabled()?valueMarkup(asset):''}<button type="button" class="trade-builder-add" data-live-add-asset="draft-pick" data-live-asset-id="${esc(pick.id)}" data-live-from-team="${esc(teamKey)}" ${active?'disabled':''} aria-label="${active?'Pick selected':'Add pick to trade'}">${active?'✓':'+'}</button></article>`}).join('');
    return `<article class="trade-builder-team" data-live-builder-team="${esc(teamKey)}" style="${teamStyle(teamKey)}"><header class="trade-builder-team__hero"><span class="trade-builder-team__mark">${teamMark(teamKey)}</span><div><small>${esc(visual.abbr)}</small><h2>${esc(teamName(teamKey))}</h2></div><dl><div><dt>Cap Space</dt><dd>${esc(teamCapSpace(teamKey))}</dd></div><div><dt>Team Needs</dt><dd>${esc(needs.slice(0,3).join(', ')||'Open')}</dd></div></dl>${teamKey!==currentTeam()?`<button class="icon-button" data-live-remove-team="${esc(teamKey)}" aria-label="Remove ${esc(teamName(teamKey))}">×</button>`:''}</header><div class="trade-builder-team__tools"><div class="segmented-tabs live-asset-filters" aria-label="${esc(teamName(teamKey))} asset filters">${[['players','Players'],['picks','Picks']].map(([key,label])=>`<button class="${filter===key?'is-active':''}" data-live-asset-filter="${key}" data-live-filter-team="${esc(teamKey)}">${label}</button>`).join('')}</div><label class="trade-builder-search"><span aria-hidden="true">⌕</span><input data-live-asset-search="${esc(teamKey)}" value="${esc(search)}" placeholder="Search ${esc(teamName(teamKey))} ${filter}…" aria-label="Search ${esc(teamName(teamKey))} ${filter}"></label></div><div class="live-trade-picker-list" data-live-picker-scroll="${esc(teamKey)}">${playerRows}${pickRows||(!playerRows?'<div class="empty-mini">No matching assets.</div>':'')}</div></article>`;
  }

  function transferAsset(transfer){
    return {assetType:transfer.assetType,sourcePlayerId:transfer.assetType==='player'?(transfer.assetId||transfer.sourcePlayerId||transfer.playerIdentityId):null,draftPickId:transfer.assetType==='draft-pick'?(transfer.assetId||transfer.draftPickId):null,fromTeamKey:transfer.fromTeamKey,toTeamKey:transfer.toTeamKey};
  }

  function builderTransferRow(transfer,index){
    const asset=transferAsset(transfer),player=transfer.assetType==='player'?(playerById(transfer.assetId)||{}):null,image=playerImage(player);
    return `<div class="trade-builder-package-asset">${transfer.assetType==='player'?(image?`<img src="${esc(image)}" alt="">`:'<span class="trade-package-asset__placeholder">P</span>'):'<span class="trade-pick-ticket">PICK</span>'}<span>${player?`<button type="button" class="trade-package-player-link" data-live-open-player-button="${esc(player.id||transfer.assetId)}">${esc(assetLabel(asset))}</button>`:`<strong>${esc(assetLabel(asset))}</strong>`}<small>From ${esc(teamAbbr(transfer.fromTeamKey))}</small></span>${valueMarkup(asset,'Value')}${builder.teamKeys.length>2?`<label><span class="sr-only">Receiving team</span><select data-live-transfer-destination="${index}">${builder.teamKeys.filter(key=>key!==transfer.fromTeamKey).map(key=>`<option value="${esc(key)}" ${transfer.toTeamKey===key?'selected':''}>To ${esc(teamAbbr(key))}</option>`).join('')}</select></label>`:''}<button class="icon-button icon-button--small" data-live-remove-asset="${index}" aria-label="Remove ${esc(assetLabel(asset))}">×</button></div>`;
  }

  function builderPackageTeam(teamKey){
    const indexed=builder.transfers.map((transfer,index)=>({transfer,index})).filter(item=>item.transfer.toTeamKey===teamKey),incoming=indexed.map(item=>item.transfer),sent=builder.transfers.filter(item=>item.fromTeamKey===teamKey),valuation=packageValuation(incoming,sent);
    return `<section class="trade-package-team trade-builder-package-team" style="${teamStyle(teamKey)}"><div class="trade-package-team__watermark">${teamMark(teamKey)}</div><header>${teamMark(teamKey)}<span><strong>${esc(teamAbbr(teamKey))} RECEIVES</strong><small>${incoming.length} asset${incoming.length===1?'':'s'}</small></span></header><div>${indexed.length?indexed.map(item=>builderTransferRow(item.transfer,item.index)).join(''):'<span class="trade-builder-package-empty">Select assets for this team to receive.</span>'}</div>${calculatorEnabled()?`<button type="button" class="trade-package-total" data-live-open-package-value="${esc(teamKey)}"><small>Total Value</small><strong>${valuation.total.toLocaleString()}</strong><span>See calculation →</span></button>`:''}</section>`;
  }

  function builderPackageStage(){
    const result=calculatorEnabled()?tradeFairness(builder.transfers,builder.teamKeys):null;
    return `<section class="card trade-builder-package"><header><div><span class="eyebrow">Trade Package</span><h2>Review the exchange</h2><p>${builder.transfers.length} selected asset${builder.transfers.length===1?'':'s'} · every team must send and receive at least one asset.</p></div>${result?`<button type="button" class="trade-builder-balance ${result.overall>=91?'is-positive':''}" data-live-open-fairness-value><small>Package Balance</small><strong>${result.overall}%</strong><span>${result.overall>=91?'Fair value':'Review value'} ⓘ</span></button>`:''}</header><div class="trade-package-matchup trade-package-matchup--builder">${builder.teamKeys.map(builderPackageTeam).join('<span class="trade-package-swap" aria-hidden="true">⇄</span>')}</div><label class="field trade-builder-message"><span>Message to participating owners (optional)</span><textarea data-live-trade-note placeholder="Explain the proposed terms…">${esc(builder.note)}</textarea></label><footer><span>${builder.tradeId?'This revision resets prior acceptances.':'You can save this privately and return later.'}</span><div class="heading-actions">${!builder.tradeId?'<button class="button button--secondary" data-live-save-draft>Save Draft</button>':''}<button class="button button--primary" data-live-submit-trade>${builder.tradeId?'Send Revised Offer':'Send Trade Offer'}</button></div></footer></section>`;
  }

  function tradeFairness(transfers=builder?.transfers||[],teamKeys=builder?.teamKeys||[]){
    const rows=teamKeys.map(teamKey=>{
      const sent=transfers.filter(item=>item.fromTeamKey===teamKey),received=transfers.filter(item=>item.toTeamKey===teamKey);
      const sentValue=packageValuation(sent,received).total,receivedValue=packageValuation(received,sent).total;
      const fairness=sentValue&&receivedValue?Math.round(Math.min(sentValue,receivedValue)/Math.max(sentValue,receivedValue)*1000)/10:0;
      return{teamKey,sentValue,receivedValue,net:receivedValue-sentValue,fairness};
    });
    return{rows,overall:rows.length?Math.min(...rows.map(row=>row.fairness)):0};
  }

  function fairnessPanel(transfers,teamKeys){
    if(!calculatorEnabled())return'';
    const result=tradeFairness(transfers,teamKeys),tone=result.overall>=91?'success':result.overall>=85?'warning':'danger';
    return `<article class="card live-fairness-panel"><div class="card-header"><div><span class="eyebrow">Trade Value Calculator</span><h2>Multi-Team Fairness</h2><p>Overall fairness uses the least-balanced participating team, including three- and four-team trades.</p></div><button type="button" class="pill pill--${tone} trade-fairness-button" data-live-open-fairness-value>${result.overall}% fair · Explain</button></div><div class="fairness-meter"><span style="width:${result.overall}%"></span></div><div class="live-fairness-grid">${result.rows.map(row=>`<div><strong>${esc(teamAbbr(row.teamKey))}</strong><button type="button" data-live-open-package-value="${esc(row.teamKey)}" data-live-package-direction="sent">Sends ${row.sentValue.toLocaleString()} ⓘ</button><button type="button" data-live-open-package-value="${esc(row.teamKey)}" data-live-package-direction="received">Receives ${row.receivedValue.toLocaleString()} ⓘ</button><b class="${row.net<0?'is-negative':'is-positive'}">${row.net>=0?'+':''}${row.net.toLocaleString()} net · ${row.fairness}%</b></div>`).join('')}</div></article>`;
  }

  function renderBuilder(){
    if(!builder)initBuilder();
    captureBuilderViewport();
    const available=(state?.teams||[]).filter(team=>!builder.teamKeys.includes(team.teamKey));
    page().innerHTML=`<div class="trade-builder-page"><div class="page-heading"><div><button class="text-button" data-live-trade-back>← Trade Center</button><h1>${builder.tradeId?'Revise Trade':'Create Trade'}</h1><p>${builder.tradeId?'Update the current offer. Sending the revision resets every other team’s acceptance.':'Build the package. Review the value. Send the offer.'}</p></div><div class="heading-actions">${!builder.tradeId?'<button class="button button--secondary" data-live-save-draft>Save Draft</button>':''}<button class="button button--primary" data-live-submit-trade>${builder.tradeId?'Send Revised Offer':'Send Trade Offer'}</button></div></div><article class="trade-builder-add-team"><label><span>Add participating team</span><select data-live-team-select><option value="">Choose team…</option>${available.map(team=>`<option value="${esc(team.teamKey)}">${esc(team.displayName)}</option>`).join('')}</select></label><button class="button button--secondary" data-live-add-team ${builder.teamKeys.length>=4||!available.length?'disabled':''}>Add Team</button></article><div class="live-trade-builder-grid" data-live-builder-grid>${builder.teamKeys.map(participantAssetPicker).join('<span class="trade-builder-exchange" aria-hidden="true">⇄</span>')}</div>${builderPackageStage()}</div>`;
    restoreBuilderViewport();
  }

  function renderDetail(workflow){
    const own=currentTeam(),participant=workflow.participants.some(item=>item.teamKey===own);
    const ownAcceptance=workflow.participants.find(item=>item.teamKey===own)?.acceptedRevision===workflow.revision;
    const proposer=workflow.proposerTeamKey===own;
    const conflict=participant&&canReview();
    const mayAccept=participant&&workflow.status==='negotiating'&&!ownAcceptance;
    const mayRevise=participant&&workflow.status==='negotiating'&&(proposer||!ownAcceptance);
    const mayReview=canReview()&&workflow.status==='committee'&&!conflict;
    const action=`${workflow.status==='draft'?`<button class="button button--primary" data-live-revise="${esc(workflow.id)}">Continue Draft</button>`:''}${mayAccept?`<button class="button button--primary" data-live-accept="${esc(workflow.id)}">Accept Trade</button>`:''}${mayRevise?`<button class="button button--secondary" data-live-revise="${esc(workflow.id)}">${proposer?'Revise Offer':'Revise Terms'}</button>`:''}${mayAccept?`<button class="button button--danger button--subtle" data-live-reject="${esc(workflow.id)}">Reject</button>`:''}${withdrawControls(workflow)}`;
    const review=mayReview?`<article class="card live-trade-review"><div class="card-header"><div><span class="eyebrow">Confidential review</span><h3>${workflow.review.approvals} approve · ${workflow.review.rejections} reject</h3><p>${workflow.review.threshold} matching decisions are required.</p></div></div><label class="field"><span>Reason (optional)</span><textarea data-live-review-reason placeholder="Add a reason when useful…"></textarea></label>${state.settings.freeTradeDesignationEnabled?'<label class="trade-rule-toggle"><input type="checkbox" data-live-free-trade><span><strong>Designate as Free Trade if approved</strong><small>This trade will not use a seasonal trade slot.</small></span></label>':''}<div class="heading-actions"><button class="button button--primary" data-live-review="approve:${esc(workflow.id)}">Approve</button><button class="button button--danger" data-live-review="reject:${esc(workflow.id)}">Reject</button><button class="button button--ghost" data-live-review="abstain:${esc(workflow.id)}">Abstain</button></div></article>`:'';
    const privateDetails=participant||canReview()||workflow.status==='draft';
    page().innerHTML=`<div class="trade-detail-page"><div class="page-heading trade-detail-heading"><div><button class="text-button" data-live-trade-back>← Trade Center</button><span class="eyebrow">${esc(statusLabel(workflow.status))}</span><h1>${esc(workflow.participants.map(item=>teamAbbr(item.teamKey)).join(' ↔ '))}</h1>${workflow.note?`<p>${esc(workflow.note)}</p>`:''}</div><div class="heading-actions">${action}</div></div><div class="trade-package-matchup trade-package-matchup--detail">${workflow.participants.map(item=>{const incoming=workflow.assets.filter(asset=>asset.toTeamKey===item.teamKey);return `<section class="trade-package-team trade-detail-package-team" style="${teamStyle(item.teamKey)}"><div class="trade-package-team__watermark">${teamMark(item.teamKey)}</div><header>${teamMark(item.teamKey)}<span><strong>${esc(teamAbbr(item.teamKey))} RECEIVES</strong><small>${incoming.length} asset${incoming.length===1?'':'s'}</small></span></header><div class="trade-detail-package-team__assets">${incoming.map(assetRow).join('')||'<div class="empty-mini">No incoming assets</div>'}</div></section>`}).join('<span class="trade-package-swap" aria-hidden="true">⇄</span>')}</div>${fairnessPanel(workflow.assets,workflow.participants.map(item=>item.teamKey))}${review}${privateDetails?`<article class="card live-trade-messages"><div class="card-header"><div><h3>Negotiation</h3><p>Shared only with participating owners and authorized reviewers.</p></div></div>${workflow.messages.map(message=>`<div class="live-trade-message"><strong>${esc(message.authorName||'System')}</strong><p>${esc(message.message)}</p><small>${esc(date(message.createdAt))}</small></div>`).join('')||'<div class="empty-mini">No messages yet.</div>'}${participant&&!['approved','rejected','withdrawn'].includes(workflow.status)?`<div class="live-trade-message-compose"><textarea data-live-message-text placeholder="Write a message…"></textarea><button class="button button--primary" data-live-send-message="${esc(workflow.id)}">Send</button></div>`:''}</article>`:''}</div>`;
  }

  function renderTradeCenter(part=''){
    if(!ensureState('Trade Center'))return;
    if(part==='new'){renderBuilder();return}
    const workflow=state.workflows.find(item=>item.id===part);
    if(workflow){renderDetail(workflow);return}
    renderDashboard(['received','sent','drafts','committee','approved','rejected','history'].includes(part)?part:'received');
  }

  function renderTradeBlock(){
    if(!ensureState('Trade Block'))return;
    const own=currentTeam();
    const listings=(state.listings||[]).filter(item=>item.assetType==='player');
    const ownListings=listings.filter(item=>item.teamKey===own).map(item=>({...item,player:playerById(item.playerPublicId)||players().find(player=>String(player.name)===String(item.playerName))}));
    const rosterPlayers=own?players().filter(player=>teamKeyForPlayer(player)===own).sort((a,b)=>Number(b.overall||0)-Number(a.overall||0)):[];
    const visible=listings.filter(item=>blockFilters.scope!=='mine'||item.teamKey===own).map(item=>({...item,player:playerById(item.playerPublicId)||players().find(player=>String(player.name)===String(item.playerName))})).filter(item=>{
      const player=item.player||{},term=blockFilters.name.toLowerCase();
      return(!term||String(player.name||item.playerName||'').toLowerCase().includes(term))&&(blockFilters.position==='All'||player.position===blockFilters.position)&&(blockFilters.team==='All'||item.teamKey===blockFilters.team)&&(blockFilters.development==='All'||String(player.dev||player.developmentTrait||'Normal')===blockFilters.development)&&(blockFilters.overall==='All'||(blockFilters.overall==='90+'?Number(player.overall)>=90:blockFilters.overall==='80-89'?Number(player.overall)>=80&&Number(player.overall)<=89:Number(player.overall)<80));
    });
    const positions=['All',...new Set(players().map(player=>player.position).filter(Boolean))],development=['All','Normal','Star','Superstar','X-Factor'];
    const cards=visible.map(item=>{
      const player=item.player||{},image=playerImage(player),needs=teamNeeds(item.teamKey),id=player.id||item.playerPublicId||'',ownListing=item.teamKey===own;
      const marketContent=`<small>Looking for</small><strong>${esc(item.requestedReturn||'Open to offers')}</strong>${needs.length?`<span>${needs.slice(0,3).map(need=>`<em>${esc(need)}</em>`).join('')}</span>`:''}`;
      const market=ownListing?`<button type="button" class="live-block-player-row__market" data-live-edit-block="${esc(id)}" aria-label="Edit what you are looking for in a ${esc(player.name||'player')} trade">${marketContent}<i>Edit listing →</i></button>`:`<div class="live-block-player-row__market">${marketContent}</div>`;
      return `<article class="live-block-player-row" style="${teamStyle(item.teamKey)}" data-live-open-player="${esc(id)}" role="button" tabindex="0"><span class="live-block-player-row__brand">${teamMark(item.teamKey)}</span>${image?`<img class="live-block-player-row__photo" src="${esc(image)}" alt="">`:`<span class="live-block-player-row__photo live-block-player-row__photo--empty">${esc(player.position||'P')}</span>`}<button class="live-block-player-row__identity" data-live-open-player-button="${esc(id)}"><strong>${esc(player.name||item.playerName||'Player')}</strong><small>${esc(teamName(item.teamKey))}</small></button><div class="live-block-player-row__metrics"><span><small>POS</small><strong>${esc(player.position||'—')}</strong></span><span><small>OVR</small><strong>${esc(player.overall??'—')}</strong></span><span><small>DEV</small><strong>${esc(player.dev||player.developmentTrait||'Normal')}</strong></span><span><small>AGE</small><strong>${esc(player.age??'—')}</strong></span><span><small>CAP HIT</small><strong>${esc(money(player.capHit??player.contract?.capHit))}</strong></span></div>${market}<div class="live-block-actions">${ownListing?`<button class="icon-button is-active" data-live-request-block-remove="${esc(id)}" aria-label="Remove ${esc(player.name||'player')} from the Trade Block" title="Remove from Trade Block">★</button>`:`<button class="button button--primary" data-live-start-block-type="player" data-live-start-block-id="${esc(id)}">Add to Trade</button>`}</div></article>`;
    }).join('');
    if(blockManagerOpen){
      const visual=teamVisual(own),needs=state.teamNeeds?.find(profile=>profile.teamKey===own)?.needs||[];
      const available=rosterPlayers.filter(player=>!onBlock(player)&&String(player.name||'').toLowerCase().includes(blockRosterSearch.toLowerCase()));
      const rows=ownListings.map(item=>{const player=item.player||{},image=playerImage(player),id=String(player.id||item.playerPublicId||'');return `<article class="block-manager-row ${blockEditor===id?'is-targeted':''}" data-live-block-manager-player="${esc(id)}" style="${teamStyle(own)}">${image?`<img src="${esc(image)}" alt="">`:'<span class="block-manager-row__avatar">P</span>'}<button class="block-manager-row__identity text-button" data-live-open-player-button="${esc(id)}"><strong>★ ${esc(player.name||item.playerName||'Player')}</strong><small>${esc(player.position||'—')} · ${esc(player.overall??'—')} OVR · ${esc(player.dev||player.developmentTrait||'Normal')} · Age ${esc(player.age??'—')}</small></button><label><span>Notes for trade</span><input data-live-block-note="${esc(id)}" value="${esc(item.requestedReturn||'')}" placeholder="Notes are optional"></label><div class="block-manager-row__actions"><button class="button button--secondary" data-live-save-block-note="${esc(id)}">Save</button><button class="text-button text-button--danger" data-live-remove-block-player="${esc(id)}">Remove</button></div></article>`}).join('');
      const drawer=blockRosterOpen?`<div class="block-drawer-shell is-open" aria-hidden="false"><button class="block-drawer-backdrop" data-live-close-block-roster aria-label="Close Add Players"></button><aside class="block-drawer block-add-player-drawer" role="dialog" aria-modal="true"><header class="block-drawer__header"><div><span class="eyebrow">${esc(teamName(own))}</span><h2>Add Players</h2><p>Select a star to add instantly. Notes are optional.</p></div><button class="icon-button" data-live-close-block-roster>×</button></header><div class="block-drawer__body"><label class="field"><span>Search roster</span><input data-live-block-roster-search value="${esc(blockRosterSearch)}" placeholder="Search roster"></label><div class="drawer-card-list">${available.map(player=>{const image=playerImage(player);return `<article class="drawer-player-card">${image?`<img class="drawer-player-card__photo" src="${esc(image)}" alt="">`:`<span class="drawer-player-card__photo drawer-player-card__photo--empty">${esc(player.position||'P')}</span>`}<button class="drawer-player-card__identity text-button" data-live-open-player-button="${esc(player.id)}"><strong>${esc(player.name)}</strong><small>${esc(player.position)} · ${esc(player.overall??'—')} OVR · ${esc(player.dev||'Normal')}</small></button><button class="icon-button" data-live-add-block-player="${esc(player.id)}" aria-label="Add ${esc(player.name)} to Trade Block">☆</button></article>`}).join('')||'<div class="empty-mini">Every matching player is already listed.</div>'}</div></div></aside></div>`:'';
      page().innerHTML=`<div class="block-manager-page"><div class="page-heading"><div><span class="eyebrow">Team marketplace</span><h1>Manage My Trade Block</h1><p>Control who is available and what your team is looking for.</p></div><div class="heading-actions"><button class="text-button" data-live-close-block-manager>← Back to League Trade Block</button><button class="button button--primary" data-live-open-block-roster>Add Players</button></div></div><section class="block-manager-team-hero" style="${teamStyle(own)}"><div>${teamMark(own)}<span><small>${esc(visual.abbr)}</small><strong>${esc(teamName(own))}</strong><em>${ownListings.length} player${ownListings.length===1?'':'s'} listed</em></span></div><b>${esc(visual.abbr)}</b></section><section class="card block-manager-needs"><div><strong>Team Needs</strong><span>${needs.length?needs.map(need=>`<em>${esc(need)}</em>`).join(''):'<small>No team needs added yet.</small>'}</span></div><label><span>Update needs</span><input data-live-team-needs value="${esc(needs.join(', '))}" placeholder="Cornerback, Pass Rush, Offensive Line"></label><button class="button button--secondary" data-live-save-team-needs>Save Needs</button></section><div class="block-manager-list">${rows||'<article class="empty-state card"><h2>Your Trade Block is empty</h2><p>Add players from your roster. Notes can be added later.</p><button class="button button--primary" data-live-open-block-roster>Add Players</button></article>'}</div>${drawer}</div>`;
      return;
    }
    const removalListing=ownListings.find(item=>String(item.player?.id||item.playerPublicId||'')===String(blockRemovalCandidate||''));
    const removalDialog=removalListing?`<div class="trade-confirm-shell" role="presentation"><button class="trade-confirm-backdrop" data-live-cancel-block-remove aria-label="Keep player on Trade Block"></button><section class="trade-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="trade-block-remove-title"><span aria-hidden="true">★</span><div><small>Trade Block</small><h2 id="trade-block-remove-title">Remove ${esc(removalListing.player?.name||removalListing.playerName||'this player')}?</h2><p>The listing and its “Looking for” note will leave the league Trade Block. You can add the player again later.</p></div><footer><button class="button button--secondary" data-live-cancel-block-remove>Keep Listed</button><button class="button button--danger" data-live-confirm-block-remove="${esc(blockRemovalCandidate)}">Remove Player</button></footer></section></div>`:'';
    page().innerHTML=`<div class="trade-block-page"><div class="page-heading"><div><span class="eyebrow">League marketplace</span><h1>Trade Block</h1><p>Browse players that team owners have explicitly made available.</p></div>${own?'<button class="button button--primary" data-live-open-block-manager>Manage My Trade Block</button>':''}</div><div class="filter-bar trade-block-filters"><div class="segmented-tabs"><button class="${blockFilters.scope==='league'?'is-active':''}" data-live-block-scope="league">League Trade Block</button><button class="${blockFilters.scope==='mine'?'is-active':''}" data-live-block-scope="mine">My Trade Block</button></div><label class="field field--grow"><span>Name</span><input data-live-block-filter="name" value="${esc(blockFilters.name)}" placeholder="Player name"></label><label class="field"><span>Position</span><select data-live-block-filter="position">${positions.map(value=>`<option ${blockFilters.position===value?'selected':''}>${esc(value)}</option>`).join('')}</select></label><label class="field"><span>Team</span><select data-live-block-filter="team"><option>All</option>${(state.teams||[]).map(team=>`<option value="${esc(team.teamKey)}" ${blockFilters.team===team.teamKey?'selected':''}>${esc(team.abbreviation)}</option>`).join('')}</select></label><label class="field"><span>Overall</span><select data-live-block-filter="overall">${['All','90+','80-89','Under 80'].map(value=>`<option value="${value==='Under 80'?'under-80':value}" ${blockFilters.overall===(value==='Under 80'?'under-80':value)?'selected':''}>${value}</option>`).join('')}</select></label><label class="field"><span>Development Trait</span><select data-live-block-filter="development">${development.map(value=>`<option ${blockFilters.development===value?'selected':''}>${value}</option>`).join('')}</select></label></div><div class="trade-block-list">${cards}</div>${cards?'':'<article class="empty-state card"><h2>No matching Trade Block players</h2><p>Adjust the filters or manage your team’s listings.</p></article>'}${removalDialog}</div>`;
  }

  function renderCommissionerSettings(){
    if(!state){load().then(rerender).catch(rerender);return loadingMarkup('Trade Center Settings')}
    const settings=state.settings,value=settings.valueModel,number=(path,label,current,{min=0,max=10000,step=1}={})=>`<label class="field"><span>${label}</span><input type="number" min="${min}" max="${max}" step="${step}" data-live-value-path="${path}" value="${current}"></label>`;
    const playerLabels={overall:'Overall Rating',age:'Age & Window',development:'Development Trait',position:'Position Scarcity',contract:'Contract & Control',production:'Production',elite:'Elite Premium',injury:'Injury Risk'};
    const modelLabels={overallQuadratic:'Overall Curve',overall84Bonus:'84+ Bonus',overall92Bonus:'92+ Bonus',devStar:'Star Dev %',devSuperstar:'Superstar Dev %',devXFactor:'X-Factor Dev %',contractCapEfficiencyRate:'Cap Efficiency %',contractRookiePremium:'Rookie Premium %',contractFourYearControl:'Four-Year Control %',contractExpiringPenalty:'Expiring Penalty %',contractMaxPremium:'Max Contract Premium %',contractMaxPenalty:'Max Contract Penalty %'};
    return `<div class="commissioner-control-stack"><section class="card"><div class="card-header"><div><span class="eyebrow">Shared league policy</span><h3>Trade Center Settings</h3><p>All settings are server-backed and apply to this league on every device.</p></div><span class="pill pill--success">Revision ${settings.revision}</span></div><div class="trade-setting-grid trade-setting-grid--five">${number('seasonTradeLimit','Trades per Franchise season',settings.seasonTradeLimit,{min:1,max:100})}${number('maxPlayersPerTeam','Players per team / trade',settings.maxPlayersPerTeam,{min:1,max:12})}${number('maxPicksPerTeam','Picks per team / trade',settings.maxPicksPerTeam,{min:1,max:21})}${number('reviewApprovalThreshold','Matching review votes',settings.reviewApprovalThreshold,{min:1,max:12})}</div><label class="trade-rule-toggle"><input type="checkbox" data-live-setting="seasonTradeLimitEnabled" ${settings.seasonTradeLimitEnabled?'checked':''}><span><strong>Enforce Franchise season trade limit</strong></span></label><label class="trade-rule-toggle"><input type="checkbox" data-live-setting="freeTradeDesignationEnabled" ${settings.freeTradeDesignationEnabled?'checked':''}><span><strong>Allow Free Trade designations</strong></span></label><label class="trade-rule-toggle"><input type="checkbox" data-live-setting="calculatorEnabled" ${settings.calculatorEnabled?'checked':''}><span><strong>Enable Trade Calculator</strong><small>When disabled, player, pick, package, and fairness values are hidden everywhere.</small></span></label></section><section class="card"><div class="card-header"><div><h3>Player Value Calculations</h3><p>The complete pre-7.4.0 factor model is restored.</p></div></div><h4>Factor Weights</h4><div class="trade-setting-grid trade-setting-grid--five">${Object.entries(value.player).map(([key,current])=>number(`valueModel.player.${key}`,playerLabels[key]||key,current,{min:0,max:500})).join('')}</div><h4>Underlying Model Values</h4><div class="trade-setting-grid trade-setting-grid--five">${Object.entries(value.model).map(([key,current])=>number(`valueModel.model.${key}`,modelLabels[key]||key.replace(/^position/,'Position '),current,{min:key.startsWith('age')?-100:0,max:10000,step:.25})).join('')}</div></section><section class="card"><div class="card-header"><div><h3>Package Engine Adjustments</h3><p>Control elite scarcity, best-player, dilution, roster-space, and mixed-asset effects.</p></div></div><div class="trade-setting-grid trade-setting-grid--five">${Object.entries(value.package).map(([key,current])=>number(`valueModel.package.${key}`,key.replace(/([A-Z])/g,' $1'),current,{min:0,max:500})).join('')}</div></section><section class="card"><div class="card-header"><div><h3>Draft Pick Value Calculations</h3><p>Round values, future retention, and team projections are preserved by league.</p></div><span class="pill pill--success">${state.picks.length} active-horizon picks</span></div><h4>Round Base Values</h4><div class="trade-setting-grid trade-setting-grid--rounds">${Object.entries(value.draft.roundBases).map(([round,current])=>number(`valueModel.draft.roundBases.${round}`,`Round ${round}`,current,{min:25,max:10000,step:25})).join('')}</div><h4>Future Pick Retained Value</h4><div class="trade-setting-grid trade-setting-grid--five">${Object.entries(value.draft.futureRetention).map(([distance,current])=>number(`valueModel.draft.futureRetention.${distance}`,distance==='1'?'Next Draft':distance==='2'?'Two Drafts Away':'Three Drafts Away',current,{min:10,max:150,step:5})).join('')}${number('valueModel.draft.earlyPickMultiplier','Early Pick Multiplier',value.draft.earlyPickMultiplier,{min:50,max:200})}${number('valueModel.draft.latePickMultiplier','Late Pick Multiplier',value.draft.latePickMultiplier,{min:25,max:150})}</div><h4>Team Owner Pick Projections</h4><p>Choose Early (1–10), Mid (11–20), Late (21–28), or Super Bowl (29–32).</p><div class="projection-team-grid commissioner-pick-projections">${(state.teams||[]).map(team=>`<label class="projection-team-row"><span class="projection-team-owner"><strong>${esc(team.displayName)}</strong><small>${esc(team.ownerName||team.abbreviation)}</small></span><span class="projection-team-field"><em>Projected range</em><select data-live-projection="${esc(team.teamKey)}">${[['early','Early (Picks 1–10)'],['mid','Mid (Picks 11–20)'],['late','Late (Picks 21–28)'],['super-bowl','Super Bowl (Picks 29–32)']].map(([key,label])=>`<option value="${key}" ${(value.draft.teamProjections?.[team.teamKey]||'mid')===key?'selected':''}>${label}</option>`).join('')}</select></span></label>`).join('')}</div><div class="control-note"><strong>Automatic baseline</strong><span>${esc(state.pickBaseline?.classes?.join(', ')||'Next three draft classes')} · Rounds 1–7 · one original pick per active league team. Existing ownership is never reset.</span></div></section><div class="heading-actions"><button class="button button--primary" data-live-save-settings>Save League Settings</button></div></div>`;
  }

  function onBlock(player){
    return [player?.id,player?.publicId].filter(Boolean).some(id=>blockLookup.has(String(id)));
  }

  function startAssetTrade(assetType,assetId){
    if(!state){load().then(()=>startAssetTrade(assetType,assetId)).catch(error=>showToast('Trade Center unavailable',error.message));return}
    if(!currentTeam()){showToast('Team assignment required','An active team owner assignment is required to build a trade.');return}
    initBuilder({assetType,assetId});setRoute('trade-center/new');
  }
  function startPlayerTrade(playerId){startAssetTrade('player',playerId)}
  async function openLiveBlockManager(){if(!state)await load();blockManagerOpen=true;blockRosterOpen=false;blockEditor=null;blockRemovalCandidate=null;document.body.style.overflow='';if(route()==='trade-block')renderTradeBlock();else setRoute('trade-block')}

  function openBlockEditor(playerId){
    blockEditor=String(playerId||'');blockManagerOpen=true;blockRosterOpen=false;blockRemovalCandidate=null;document.body.style.overflow='';renderTradeBlock();
    requestAnimationFrame(()=>{
      const row=document.querySelector(`[data-live-block-manager-player="${CSS.escape(blockEditor)}"]`),input=row?.querySelector('[data-live-block-note]');
      row?.scrollIntoView?.({block:'center',inline:'nearest'});
      requestAnimationFrame(()=>input?.focus?.({preventScroll:true}));
    });
  }

  function requestBlockRemoval(playerId){
    blockRemovalCandidate=String(playerId||'');renderTradeBlock();document.body.style.overflow='hidden';
    requestAnimationFrame(()=>document.querySelector('[data-live-confirm-block-remove]')?.focus());
  }

  function closeBlockRemoval(){blockRemovalCandidate=null;document.body.style.overflow='';renderTradeBlock()}

  async function togglePlayerBlock(playerId,trigger=null){
    if(!state)await load();
    const player=playerById(playerId);
    if(!player||teamKeyForPlayer(player)!==currentTeam()){showToast('Trade Block unavailable','Only the owner of this roster can change the listing.');return}
    const active=onBlock(player);
    if(trigger)trigger.disabled=true;
    try{
      await request('trade-block',{assetType:'player',assetId:String(player.id),active:!active,requestedReturn:''});
      if(trigger){
        trigger.classList.toggle('is-active',!active);trigger.setAttribute('aria-pressed',String(!active));
        trigger.setAttribute('aria-label',!active?'Remove from Trade Block':'Add to Trade Block');
        trigger.title=!active?'Remove from Trade Block':'Add to Trade Block';
      }
      showToast(!active?'Added to Trade Block':'Removed from Trade Block',!active?'You can add optional notes later in Manage My Trade Block.':'The player is no longer listed.');
      if(route()==='trade-block')renderTradeBlock();
    }catch(error){showToast('Trade Block not updated',error.message)}
    finally{if(trigger)trigger.disabled=false}
  }

  function calculatorEnabled(){return state?.settings?.calculatorEnabled!==false}
  const pct=value=>(Number(value)||0)/100;
  const positionModelKey=position=>{const p=String(position||'').toUpperCase();if(['LT','RT','OT'].includes(p))return'OT';if(['LG','RG','OG'].includes(p))return'OG';if(['LE','RE','EDGE','REDG','LEDG','REDGE','LEDGE'].includes(p))return'EDGE';if(['LOLB','ROLB','OLB'].includes(p))return'OLB';if(['MLB','ILB'].includes(p))return'MLB';if(['FS','SS','S'].includes(p))return'S';if(['HB','RB'].includes(p))return'RB';return p||'C'};
  function ageFactor(player){const group=positionModelKey(player.position),age=Number(player.age||28);if(group==='QB')return age<=24?1.24:age<=29?1.16:age<=33?1.04:age<=35?.91:.74;if(['OT','OG','C'].includes(group))return age<=24?1.20:age<=29?1.12:age<=32?1.01:age<=34?.90:.73;if(group==='RB')return age<=23?1.25:age<=26?1.10:age<=28?.91:age<=30?.72:.52;if(['CB','S','EDGE','MLB','OLB'].includes(group))return age<=23?1.24:age<=27?1.13:age<=29?1:age<=31?.84:.65;return age<=23?1.23:age<=27?1.12:age<=30?.98:age<=32?.82:.64}
  function productionScore(player){const s=player.stats||{};let raw=0;if(player.position==='QB')raw=Number(s.passYds||s.passingYards||0)/18+Number(s.passTd||s.passingTD||0)*42-Number(s.int||s.interceptions||0)*26;else if(['RB','HB','FB'].includes(player.position))raw=Number(s.rushYds||s.rushingYards||0)/7+Number(s.rushTd||s.rushingTD||0)*46+Number(s.recYds||s.receivingYards||0)/18;else if(['WR','TE'].includes(player.position))raw=Number(s.recYds||s.receivingYards||0)/7+Number(s.recTd||s.receivingTD||0)*48+Number(s.rec||s.receptions||0)*5;else raw=Number(s.tackles||0)*4+Number(s.sacks||0)*62+Number(s.interceptions||0)*95;return Math.round(Math.min(1150,Math.max(0,raw)))}
  function playerValuation(player){
    if(!player)return{total:0,breakdown:[]};
    const valueModel=state?.settings?.valueModel||{},weights=valueModel.player||{},model=valueModel.model||{};
    const injury=String(player.injury||player.injuryStatus||'Healthy'),tradeable=injury==='Healthy';
    if(!calculatorEnabled())return{model:'LVE 1.1',total:0,tradeable,enabled:false,breakdown:[]};
    const overall=Number(player.overall||0),x=Math.max(0,overall-60),rawBase=Math.round(x*x*Number(model.overallQuadratic||4.25)+Math.max(0,overall-84)*Number(model.overall84Bonus||210)+Math.max(0,overall-92)*Number(model.overall92Bonus||420));
    const base=Math.round(rawBase*pct(weights.overall??100)),ageNumber=Number(player.age||28),ageBucket=ageNumber<=23?'age21_23':ageNumber<=26?'age24_26':ageNumber<=29?'age27_29':ageNumber<=32?'age30_32':'age33Plus';
    const age=Math.round(rawBase*(ageFactor(player)+Number(model[ageBucket]||0)/100-1)*pct(weights.age??100));
    const trait=String(player.dev||player.developmentTrait||'Normal').replace(/^xfactor$/i,'X-Factor');
    const devRate=({Normal:0,Star:Number(model.devStar||8)/100,Superstar:Number(model.devSuperstar||18)/100,'X-Factor':Number(model.devXFactor||28)/100}[trait]||0)*(ageNumber<=24?1.16:ageNumber>=31?.76:1);
    const development=Math.round(rawBase*devRate*pct(weights.development??100)),positionKey=positionModelKey(player.position),fallback={QB:134,WR:107,EDGE:120,CB:115,OT:112,DT:109,RB:94,TE:92,OG:102,C:102,MLB:104,OLB:104,S:100,K:45,P:45,FB:72}[positionKey]||100;
    const position=Math.round(rawBase*((Number(model[`position${positionKey}`]??fallback)/100)-1)*pct(weights.position??100));
    const capRaw=Number(player.capHit??player.contract?.capHit??0),capHit=capRaw>100000?capRaw/1000000:capRaw,years=Number(player.contractYears??player.years??player.contract?.yearsRemaining??0),market=Math.max(1,(overall-68)*.62),efficiency=(market-capHit)/Math.max(5,market);
    const contractBase=Math.round(rawBase*Math.max(-Number(model.contractMaxPenalty??24)/100,Math.min(Number(model.contractMaxPremium??20)/100,efficiency*Number(model.contractCapEfficiencyRate??15)/100)))+(ageNumber<=24&&years>=3?Math.round(rawBase*Number(model.contractRookiePremium??13)/100):0)+(years>=4?Math.round(rawBase*Number(model.contractFourYearControl??6)/100):years===1?-Math.round(rawBase*Number(model.contractExpiringPenalty??7)/100):0);
    const contract=Math.round(contractBase*pct(weights.contract??100)),production=Math.round(productionScore(player)*pct(weights.production??100)),elite=Math.round((overall>=95?rawBase*.13:overall>=90?rawBase*.06:0)*pct(weights.elite??100)),risk=Math.round((tradeable?0:-rawBase*.35)*pct(weights.injury??100));
    const total=Math.max(100,base+age+development+position+contract+production+elite+risk);
    return{model:'LVE 1.1',total,tradeable,breakdown:[['Overall rating',base,`${overall} OVR curved base`],['Age & window',age,`${ageNumber} years`],['Development',development,trait],['Contract & control',contract,`${years} years · ${money(capRaw)} cap hit`],['Production',production,'Current Madden production'],['Position scarcity',position,positionKey],['Elite premium',elite,overall>=90?'Applied':'Not applied'],['Risk',risk,injury]]};
  }
  function pickValuation(pick){
    if(!pick)return{total:0,breakdown:[]};
    if(pick.year&&!pick.draftClass){const resolved=state?.teams?.find(team=>[team.teamKey,team.externalId,team.abbreviation].some(value=>String(value)===String(pick.teamId)));pick={...pick,draftClass:Number(pick.year),currentTeamKey:resolved?.teamKey||String(pick.teamId||'').toLowerCase()}}
    const draft=state?.settings?.valueModel?.draft||{},round=Number(pick.round||1),base=Number(draft.roundBases?.[round]||0);
    const seasonYear=Number(state?.season?.seasonYear||2026),distance=Math.max(1,Number(pick.draftClass||seasonYear+1)-seasonYear);
    const configured=Number(draft.futureRetention?.[Math.min(3,distance)]),retention=Number.isFinite(configured)?configured/100:Math.max(.18,.4-Math.max(0,distance-3)*.08);
    const projection=draft.teamProjections?.[pick.currentTeamKey]||'mid',slot={early:5.5,mid:15.5,late:24.5,'super-bowl':30.5}[projection]||15.5,early=Number(draft.earlyPickMultiplier||134)/100,late=Number(draft.latePickMultiplier||84)/100,multiplier=early-((slot-1)/31)*(early-late);
    const projected=Math.round(base*(multiplier-1)),future=Math.round(base*multiplier*(retention-1)),total=Math.max(50,Math.round(base*multiplier*retention));
    return calculatorEnabled()?{model:'Draft Pick Engine 1.2',total,base,distance,retention,projection,breakdown:[['Round base',base,`${pick.draftClass} Round ${round}`],['Projected range',projected,projection],['Timeline adjustment',future,`${Math.round(retention*100)}% retained value`]]}:{model:'Draft Pick Engine 1.2',total:0,enabled:false,breakdown:[]};
  }
  function packageValuation(assets=[],opposingAssets=[]){
    if(!calculatorEnabled())return {raw:0,total:0,adjustment:0,rows:[],assetCount:assets.length,enabled:false};
    const item=asset=>{const type=asset.assetType||asset.type,shaped=type==='player'?{assetType:'player',sourcePlayerId:asset.sourcePlayerId||asset.assetId||asset.id}:{assetType:'draft-pick',draftPickId:asset.draftPickId||asset.assetId||asset.id};return{asset:shaped,value:assetValue(shaped)||0,player:type==='player'?playerById(shaped.sourcePlayerId):null}};
    const list=assets.map(item).sort((a,b)=>b.value-a.value),other=opposingAssets.map(item),raw=list.reduce((sum,row)=>sum+row.value,0);if(!list.length)return{raw:0,total:0,adjustment:0,rows:[],assetCount:0};
    const weights=state?.settings?.valueModel?.package||{},rows=[];let adjustment=0;const best=list[0];
    if(best.player&&Number(best.player.overall)>=90){const amount=Math.round(best.value*(Number(best.player.overall)>=95?.07:.035)*pct(weights.eliteScarcity??100));adjustment+=amount;rows.push(['Elite scarcity premium',amount,best.player.name])}
    const allPlayers=[...list,...other].filter(row=>row.player).sort((a,b)=>b.value-a.value),globalBest=allPlayers[0],nextBest=allPlayers[1];if(best.player&&globalBest&&best.asset.sourcePlayerId===globalBest.asset.sourcePlayerId&&(!nextBest||globalBest.value>nextBest.value)){const gap=nextBest?Math.max(0,(globalBest.value-nextBest.value)/globalBest.value):0,amount=Math.round(globalBest.value*(.025+Math.min(.035,gap*.08))*pct(weights.bestPlayer??100));adjustment+=amount;rows.push(['Best-player premium',amount,'Highest-value player in the trade'])}
    if(list.length>=3){let amount=0;list.slice(2).forEach((row,index)=>{amount-=Math.round(row.value*(index===0?.08:.14)*pct(weights.dilution??100))});adjustment+=amount;rows.push(['Package dilution',amount,`${list.length} outgoing assets`])}
    const playerCount=list.filter(row=>row.player).length;if(playerCount>2){const amount=Math.round(-(playerCount-2)*125*pct(weights.rosterSpot??100));adjustment+=amount;rows.push(['Roster-spot cost',amount,`${playerCount} players`])}
    if(list.some(row=>row.player)&&list.some(row=>!row.player)&&list.length<=3){const amount=Math.round(raw*.018*pct(weights.assetMix??100));adjustment+=amount;rows.push(['Asset mix bonus',amount,'Player and pick flexibility'])}
    return{raw,total:Math.max(0,raw+adjustment),adjustment,rows,assetCount:list.length,bestAsset:best};
  }

  function valuationContext(tradeId=''){
    if(builder)return{transfers:builder.transfers,teamKeys:builder.teamKeys};
    const workflow=state?.workflows?.find(item=>item.id===(tradeId||routePart()));
    return workflow?{transfers:workflow.assets,teamKeys:workflow.participants.map(item=>item.teamKey)}:{transfers:[],teamKeys:[]};
  }

  function valueBreakdownRows(rows=[]){
    return rows.map(([label,value,note])=>`<div class="trade-value-explainer__row"><span><strong>${esc(label)}</strong><small>${esc(note||'')}</small></span><b class="${Number(value)<0?'is-negative':''}">${Number(value)>=0?'+':''}${Number(value||0).toLocaleString()}</b></div>`).join('');
  }

  function openValueExplainer({eyebrow,title,subtitle,total,rows=[],model='',totalLabel='Total Value',totalSuffix=''}){
    const modal=document.querySelector('[data-value-card-modal]'),content=document.querySelector('[data-value-card-content]');
    if(!modal||!content)return;
    content.innerHTML=`<section class="trade-value-explainer"><header><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2><p>${esc(subtitle)}</p><div class="trade-value-explainer__total"><span>${esc(totalLabel)}</span><strong>${Number(total||0).toLocaleString()}${esc(totalSuffix)}</strong>${model?`<small>${esc(model)}</small>`:''}</div></header><div class="trade-value-explainer__rows">${valueBreakdownRows(rows)}</div><footer><span>League commissioners control the shared calculator settings. The same model is used for every owner.</span><button type="button" class="button button--primary" data-close-value-card>Done</button></footer></section>`;
    modal.classList.add('is-open');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  }

  function openAssetValueExplanation(token){
    const split=String(token||'').indexOf(':'),type=String(token||'').slice(0,split),id=String(token||'').slice(split+1);
    if(type==='player'){
      const player=playerById(id),valuation=playerValuation(player);
      if(!player)return;
      openValueExplainer({eyebrow:'Player Trade Value',title:player.name||'Player',subtitle:`${player.position||'—'} · ${player.overall??'—'} OVR · ${player.dev||player.developmentTrait||'Normal'}`,total:valuation.total,rows:valuation.breakdown,model:valuation.model});
      return;
    }
    const pick=state?.picks?.find(item=>String(item.id)===id),valuation=pickValuation(pick);
    if(!pick)return;
    openValueExplainer({eyebrow:'Draft Pick Value',title:`${pick.draftClass} Round ${pick.round}`,subtitle:`Current owner: ${teamName(pick.currentTeamKey)} · Originally ${teamAbbr(pick.originalTeamKey)}`,total:valuation.total,rows:valuation.breakdown,model:valuation.model});
  }

  function openPackageValueExplanation(teamKey,direction='received',tradeId=''){
    const context=valuationContext(tradeId),incoming=direction==='sent'?context.transfers.filter(item=>item.fromTeamKey===teamKey):context.transfers.filter(item=>item.toTeamKey===teamKey),opposing=direction==='sent'?context.transfers.filter(item=>item.toTeamKey===teamKey):context.transfers.filter(item=>item.fromTeamKey===teamKey),valuation=packageValuation(incoming,opposing);
    const assetRows=incoming.map(item=>{const asset=transferAsset(item),value=assetValue(asset)||0;return[assetLabel(asset),value,`${item.assetType==='player'?'Player':'Draft pick'} base value`]});
    openValueExplainer({eyebrow:`${teamAbbr(teamKey)} Package Value`,title:`${teamName(teamKey)} ${direction==='sent'?'sends':'receives'}`,subtitle:'Asset values plus package-level adjustments produce this total.',total:valuation.total,rows:[...assetRows,...valuation.rows],model:'FranchiseHQ Package Engine'});
  }

  function openFairnessExplanation(tradeId=''){
    const context=valuationContext(tradeId),result=tradeFairness(context.transfers,context.teamKeys);
    openValueExplainer({eyebrow:'Package Balance',title:`${result.overall}% fair`,subtitle:'The displayed balance is the least-balanced participating team so multi-team trades cannot hide an uneven package.',total:result.overall,totalLabel:'Overall Balance',totalSuffix:'%',rows:result.rows.map(row=>[teamName(row.teamKey),row.net,`Sends ${row.sentValue.toLocaleString()} · receives ${row.receivedValue.toLocaleString()} · ${row.fairness}% balanced`]),model:'Fairness percentage'});
  }

  function renderNotificationMenu(){
    if(!state)return false;
    const panel=document.querySelector('[data-notification-menu]'),items=state.notifications||[],unread=items.filter(item=>!item.readAt).length;
    const dot=document.querySelector('.notification-dot');if(dot)dot.hidden=!unread;
    if(panel)panel.innerHTML=`<div class="notification-menu__header"><div><span class="eyebrow">Notifications</span><strong>League trade activity</strong></div><div class="notification-menu__header-actions"><span class="pill ${unread?'pill--warning':'pill--neutral'}">${unread} unread</span>${unread?'<button type="button" class="text-button" data-live-notifications-read>Mark all read</button>':''}</div></div><div class="notification-menu__list">${items.length?items.map(item=>`<button data-live-notification-trade="${esc(item.tradeId||'')}" class="${item.readAt?'':'is-unread'}"><span><strong>${esc(item.title)}</strong><small>${esc(item.message)}</small></span><em>${esc(date(item.createdAt))}</em></button>`).join(''):'<div class="notification-menu__empty"><strong>You are all caught up</strong><small>Trade offers and decisions will appear here.</small></div>'}</div>`;
    return true;
  }

  function badges(){
    if(!state)return false;
    const actionable=(state.workflows||[]).filter(workflow=>['negotiating','committee'].includes(workflow.status)).length;
    document.querySelectorAll('.nav-item[data-route="trade-center"] .nav-badge').forEach(node=>node.textContent=String(actionable));
    return true;
  }

  async function act(action,payload,success){
    try{await request(action,payload);showToast(success,'The shared league record was updated.');rerender();return true}
    catch(error){showToast('Action not completed',error.message);return false}
  }

  function setDeep(target,path,value){const parts=String(path).split('.');let ref=target;for(const key of parts.slice(0,-1)){ref[key]=ref[key]&&typeof ref[key]==='object'?ref[key]:{};ref=ref[key]}ref[parts.at(-1)]=value}
  function openPlayerCard(playerId){return app()?.openRosterPlayerDetail?.(String(playerId||''))}

  document.addEventListener('click',event=>{
    let target;
    if(target=event.target.closest('[data-live-trade-retry]')){event.preventDefault();state=null;lastError=null;load(true).then(rerender).catch(rerender);return}
    if(target=event.target.closest('[data-live-start-trade]')){event.preventDefault();initBuilder();setRoute('trade-center/new');return}
    if(target=event.target.closest('[data-live-trade-back]')){event.preventDefault();builder=null;setRoute('trade-center');return}
    if(target=event.target.closest('[data-live-trade-tab]')){event.preventDefault();setRoute(`trade-center/${target.dataset.liveTradeTab}`);return}
    if(target=event.target.closest('[data-live-open-trade]')){event.preventDefault();setRoute(`trade-center/${target.dataset.liveOpenTrade}`);return}
    if(target=event.target.closest('[data-live-withdraw]')){event.preventDefault();cancelArmedTradeId=target.dataset.liveWithdraw;rerender();return}
    if(target=event.target.closest('[data-live-keep-trade]')){event.preventDefault();cancelArmedTradeId=null;rerender();return}
    if(target=event.target.closest('[data-live-confirm-withdraw]')){event.preventDefault();const workflow=state.workflows.find(item=>item.id===target.dataset.liveConfirmWithdraw);act('withdraw',{tradeId:target.dataset.liveConfirmWithdraw,revision:workflow?.revision},'Trade offer cancelled').then(ok=>{if(ok)cancelArmedTradeId=null});return}
    if(target=event.target.closest('[data-live-open-player-button]')){event.preventDefault();event.stopPropagation();openPlayerCard(target.dataset.liveOpenPlayerButton);return}
    if(target=event.target.closest('[data-live-open-asset-value]')){event.preventDefault();event.stopPropagation();openAssetValueExplanation(target.dataset.liveOpenAssetValue);return}
    if(target=event.target.closest('[data-live-open-package-value]')){event.preventDefault();event.stopPropagation();openPackageValueExplanation(target.dataset.liveOpenPackageValue,target.dataset.livePackageDirection||'received',target.dataset.liveValueTrade||'');return}
    if(target=event.target.closest('[data-live-open-fairness-value]')){event.preventDefault();event.stopPropagation();openFairnessExplanation(target.dataset.liveValueTrade||'');return}
    if(target=event.target.closest('[data-live-add-team]')){event.preventDefault();const select=document.querySelector('[data-live-team-select]'),key=select?.value;if(key&&builder.teamKeys.length<4&&!builder.teamKeys.includes(key)){builder.teamKeys.push(key);builder.transfers.forEach(item=>{if(!item.toTeamKey&&item.fromTeamKey!==key)item.toTeamKey=key});renderBuilder()}return}
    if(target=event.target.closest('[data-live-remove-team]')){event.preventDefault();const key=target.dataset.liveRemoveTeam;builder.teamKeys=builder.teamKeys.filter(item=>item!==key);builder.transfers=builder.transfers.filter(item=>item.fromTeamKey!==key&&item.toTeamKey!==key);renderBuilder();return}
    if(target=event.target.closest('[data-live-asset-filter]')){event.preventDefault();assetFilters.set(target.dataset.liveFilterTeam,target.dataset.liveAssetFilter);renderBuilder();return}
    if(target=event.target.closest('[data-live-add-asset]')){event.preventDefault();const assetType=target.dataset.liveAddAsset,assetId=target.dataset.liveAssetId,fromTeamKey=target.dataset.liveFromTeam;if(selected(assetType,assetId))return;const toTeamKey=builder.teamKeys.find(key=>key!==fromTeamKey)||'';builder.transfers.push({assetType,assetId,fromTeamKey,toTeamKey});renderBuilder();return}
    if(target=event.target.closest('[data-live-remove-asset]')){event.preventDefault();builder.transfers.splice(Number(target.dataset.liveRemoveAsset),1);renderBuilder();return}
    if(target=event.target.closest('[data-live-submit-trade]')){event.preventDefault();builder.note=document.querySelector('[data-live-trade-note]')?.value||builder.note;const revising=Boolean(builder.tradeId),revisedWorkflow=revising?state.workflows.find(item=>item.id===builder.tradeId):null,nextTab=revisedWorkflow?.proposerTeamKey===currentTeam()?'sent':'received';act(revising?'counter':'propose',{tradeId:builder.tradeId,revision:builder.baseRevision,transfers:builder.transfers,note:builder.note},revising?'Revised offer sent':'Trade offer sent').then(ok=>{if(ok){builder=null;setRoute(`trade-center/${revising?nextTab:'sent'}`)}});return}
    if(target=event.target.closest('[data-live-save-draft]')){event.preventDefault();builder.note=document.querySelector('[data-live-trade-note]')?.value||builder.note;act('save-draft',{transfers:builder.transfers,note:builder.note},'Trade draft saved').then(ok=>{if(ok){builder=null;setRoute('trade-center/drafts')}});return}
    if(target=event.target.closest('[data-live-accept]')){event.preventDefault();const workflow=state.workflows.find(item=>item.id===target.dataset.liveAccept);act('accept',{tradeId:target.dataset.liveAccept,revision:workflow?.revision},'Trade accepted');return}
    if(target=event.target.closest('[data-live-revise]')){event.preventDefault();const workflow=state.workflows.find(item=>item.id===target.dataset.liveRevise);initBuilder(null,workflow);setRoute('trade-center/new');return}
    if(target=event.target.closest('[data-live-reject]')){event.preventDefault();const workflow=state.workflows.find(item=>item.id===target.dataset.liveReject),reason=window.prompt('Reason for rejection (optional)','')||'';act('reject',{tradeId:target.dataset.liveReject,revision:workflow?.revision,reason},'Trade rejected');return}
    if(target=event.target.closest('[data-live-review]')){event.preventDefault();const [decision,tradeId]=target.dataset.liveReview.split(':'),workflow=state.workflows.find(item=>item.id===tradeId);act('review',{tradeId,revision:workflow?.revision,decision,reason:document.querySelector('[data-live-review-reason]')?.value||'',freeTrade:Boolean(document.querySelector('[data-live-free-trade]')?.checked)},'Review saved');return}
    if(target=event.target.closest('[data-live-send-message]')){event.preventDefault();const input=document.querySelector('[data-live-message-text]');if(input?.value.trim())act('message',{tradeId:target.dataset.liveSendMessage,message:input.value},'Message sent');return}
    if(target=event.target.closest('[data-live-toggle-block]')){event.preventDefault();const [assetType,...rest]=target.dataset.liveToggleBlock.split(':');const assetId=rest.join(':');if(assetType==='player')togglePlayerBlock(assetId,target);return}
    if(target=event.target.closest('[data-live-start-block-id]')){event.preventDefault();startAssetTrade(target.dataset.liveStartBlockType,target.dataset.liveStartBlockId);return}
    if(target=event.target.closest('[data-live-open-block-manager]')){event.preventDefault();blockManagerOpen=true;blockRosterOpen=false;blockEditor=null;renderTradeBlock();return}
    if(target=event.target.closest('[data-live-close-block-manager]')){event.preventDefault();blockManagerOpen=false;blockRosterOpen=false;blockEditor=null;renderTradeBlock();return}
    if(target=event.target.closest('[data-live-open-block-roster]')){event.preventDefault();blockRosterOpen=true;renderTradeBlock();return}
    if(target=event.target.closest('[data-live-close-block-roster]')){event.preventDefault();blockRosterOpen=false;renderTradeBlock();return}
    if(target=event.target.closest('[data-live-edit-block]')){event.preventDefault();event.stopPropagation();openBlockEditor(target.dataset.liveEditBlock);return}
    if(target=event.target.closest('[data-live-request-block-remove]')){event.preventDefault();event.stopPropagation();requestBlockRemoval(target.dataset.liveRequestBlockRemove);return}
    if(target=event.target.closest('[data-live-cancel-block-remove]')){event.preventDefault();closeBlockRemoval();return}
    if(target=event.target.closest('[data-live-confirm-block-remove]')){event.preventDefault();const playerId=target.dataset.liveConfirmBlockRemove;blockRemovalCandidate=null;document.body.style.overflow='';act('trade-block',{assetType:'player',assetId:playerId,active:false},'Player removed from Trade Block');return}
    if(target=event.target.closest('[data-live-add-block-player]')){event.preventDefault();act('trade-block',{assetType:'player',assetId:target.dataset.liveAddBlockPlayer,active:true,requestedReturn:''},'Player added to Trade Block');return}
    if(target=event.target.closest('[data-live-save-block-note]')){event.preventDefault();const playerId=target.dataset.liveSaveBlockNote,requestedReturn=document.querySelector(`[data-live-block-note="${CSS.escape(playerId)}"]`)?.value.trim()||'';act('trade-block',{assetType:'player',assetId:playerId,active:true,requestedReturn},'Trade Block notes saved');return}
    if(target=event.target.closest('[data-live-remove-block-player]')){event.preventDefault();act('trade-block',{assetType:'player',assetId:target.dataset.liveRemoveBlockPlayer,active:false},'Player removed from Trade Block');return}
    if(target=event.target.closest('[data-live-save-team-needs]')){event.preventDefault();const needs=document.querySelector('[data-live-team-needs]')?.value||'';act('trade-block-needs',{needs},'Team needs saved');return}
    if(target=event.target.closest('[data-live-block-scope]')){event.preventDefault();blockFilters.scope=target.dataset.liveBlockScope;renderTradeBlock();return}
    if(target=event.target.closest('[data-live-open-player]')){if(event.target.closest('button'))return;event.preventDefault();openPlayerCard(target.dataset.liveOpenPlayer);return}
    if(target=event.target.closest('[data-live-save-settings]')){event.preventDefault();const settings=structuredClone(state.settings);document.querySelectorAll('[data-live-setting]').forEach(input=>{settings[input.dataset.liveSetting]=input.type==='checkbox'?input.checked:Number(input.value)});document.querySelectorAll('[data-live-value-path]').forEach(input=>setDeep(settings,input.dataset.liveValuePath,Number(input.value)));document.querySelectorAll('[data-live-projection]').forEach(input=>setDeep(settings,`valueModel.draft.teamProjections.${input.dataset.liveProjection}`,input.value));act('settings',{revision:state.settings.revision,settings},'League settings saved');return}
    if(target=event.target.closest('[data-live-notifications-read]')){event.preventDefault();act('notifications-read',{},'Notifications read');return}
    if(target=event.target.closest('[data-live-notification-trade]')){event.preventDefault();document.querySelector('[data-notification-menu]')?.classList.remove('is-open');if(target.dataset.liveNotificationTrade)setRoute(`trade-center/${target.dataset.liveNotificationTrade}`);return}
  });

  document.addEventListener('change',event=>{
    const destination=event.target.closest('[data-live-transfer-destination]');
    if(destination&&builder){builder.transfers[Number(destination.dataset.liveTransferDestination)].toTeamKey=destination.value;renderBuilder();return}
    const filter=event.target.closest('[data-live-block-filter]');if(filter){blockFilters[filter.dataset.liveBlockFilter]=filter.value;renderTradeBlock()}
  });
  document.addEventListener('input',event=>{const assetInput=event.target.closest('[data-live-asset-search]');if(assetInput){const teamKey=assetInput.dataset.liveAssetSearch,value=assetInput.value;assetSearch.set(teamKey,value);renderBuilder();const next=document.querySelector(`[data-live-asset-search="${CSS.escape(teamKey)}"]`);next?.focus();next?.setSelectionRange?.(value.length,value.length);return}const filter=event.target.closest('[data-live-block-filter="name"]');if(filter){blockFilters.name=filter.value;renderTradeBlock();document.querySelector('[data-live-block-filter="name"]')?.focus();return}const rosterSearch=event.target.closest('[data-live-block-roster-search]');if(rosterSearch){blockRosterSearch=rosterSearch.value;renderTradeBlock();const next=document.querySelector('[data-live-block-roster-search]');next?.focus();next?.setSelectionRange?.(blockRosterSearch.length,blockRosterSearch.length)}});

  window.addEventListener('franchisehq:auth-changed',event=>{
    if(event.detail?.status!=='ready')return;
    state=null;load(true).then(()=>{
      const unread=state.notifications.filter(item=>!item.readAt).length;
      if(unread)showToast(`${unread} trade notification${unread===1?'':'s'}`,'Open Notifications to review league trade activity.');
      rerender();
    }).catch(()=>{});
  });
  window.addEventListener('franchisehq:league-tenant-changed',()=>{state=null;builder=null;blockManagerOpen=false;blockRosterOpen=false;blockEditor=null;blockRosterSearch='';blockRemovalCandidate=null;cancelArmedTradeId=null;builderGridScrollLeft=0;builderPickerScroll.clear();blockLookup.clear();assetFilters.clear();assetSearch.clear();document.body.style.overflow=''});

  const service={version:VERSION,load,refresh:()=>load(true),request,renderTradeCenter,renderTradeBlock,renderCommissionerSettings,
    renderNotificationMenu,badges,startPlayerTrade,startAssetTrade,togglePlayerBlock,onBlock,calculatorEnabled,playerValuation,pickValuation,packageValuation,
    openBlockManager:openLiveBlockManager,
    diagnostics:()=>({version:VERSION,loaded:Boolean(state),loading:Boolean(loading),workflowCount:state?.workflows?.length||0,pickCount:state?.picks?.length||0,lastError})};
  HQ.liveTradeCenter=service;
  if(window.FGC_TRADE){
    Object.assign(window.FGC_TRADE,{
      renderTradeCenter,renderTradeBlock,tradeCalculatorEnabled:calculatorEnabled,playerValuation,pickValuation,packageValuation,
      addPlayerToTrade:startPlayerTrade,togglePlayerBlock,onBlock,openBlockManager:openLiveBlockManager
    });
    HQ.trade?.attachLegacy?.(window.FGC_TRADE);
  }
  load().catch(()=>{});
})();
