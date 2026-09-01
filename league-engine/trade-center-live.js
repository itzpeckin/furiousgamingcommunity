(() => {
  'use strict';

  const HQ=window.FranchiseHQ;
  const VERSION='7.4.0';
  const page=()=>document.querySelector('[data-page-content]');
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const slug=()=>HQ?.leagueTenant?.getCurrentLeague?.()?.slug||null;
  const route=()=>String(location.hash||'#home').replace(/^#\/?/,'');
  const routePart=()=>route().split('/')[1]||'';
  let state=null,loading=null,lastError=null,builder=null,blockLookup=new Set();

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
  function statusLabel(value){return({draft:'Draft',negotiating:'Negotiating',committee:'Committee Review',approved:'Approved',rejected:'Rejected',withdrawn:'Withdrawn'})[value]||value}

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

  function valueMarkup(asset){
    const value=assetValue(asset);
    return Number.isFinite(value)?`<b class="asset-value">${value.toLocaleString()}</b>`:'';
  }

  function assetRow(asset){
    return `<div class="live-trade-asset"><span><strong>${esc(assetLabel(asset))}</strong><small>${esc(teamAbbr(asset.fromTeamKey))} → ${esc(teamAbbr(asset.toTeamKey))}</small></span>${valueMarkup(asset)}</div>`;
  }

  function nav(active='all'){
    const tabs=[['all','All'],['received','Received'],['committee','Committee'],['approved','Approved'],['rejected','Rejected']];
    return `<div class="filter-bar trade-tabs trade-center-nav"><div class="segmented-tabs">${tabs.map(([key,label])=>`<button class="${active===key?'is-active':''}" data-live-trade-tab="${key}">${label}</button>`).join('')}</div></div>`;
  }

  function filteredWorkflows(tab){
    const own=currentTeam();
    return (state?.workflows||[]).filter(workflow=>{
      if(tab==='approved'||tab==='rejected'||tab==='committee')return workflow.status===tab;
      if(tab==='received')return workflow.status==='negotiating'&&workflow.proposerTeamKey!==own&&workflow.participants.some(item=>item.teamKey===own);
      return true;
    });
  }

  function tradeCard(workflow){
    const teamsLabel=workflow.participants.map(item=>teamAbbr(item.teamKey)).join(' ↔ ');
    return `<button class="card live-trade-card" data-live-open-trade="${esc(workflow.id)}"><div><span class="pill pill--${workflow.status==='approved'?'success':workflow.status==='rejected'?'danger':workflow.status==='committee'?'warning':'accent'}">${esc(statusLabel(workflow.status))}</span><h3>${esc(teamsLabel)}</h3><p>${esc(workflow.note||'Private league trade')}</p></div><div><strong>${workflow.assets.length} asset${workflow.assets.length===1?'':'s'}</strong><small>${esc(date(workflow.updatedAt))}</small></div></button>`;
  }

  function renderDashboard(tab='all'){
    const list=filteredWorkflows(tab);
    page().innerHTML=`<div class="page-heading"><div><span class="eyebrow">League transactions</span><h1>Trade Center</h1><p>Propose, negotiate, approve, and manage shared league trades.</p></div>${currentTeam()?'<button class="button button--primary" data-live-start-trade>Create Trade</button>':''}</div>${nav(tab)}${list.length?`<div class="live-trade-list">${list.map(tradeCard).join('')}</div>`:`<article class="empty-state card"><h2>No trades in this view</h2><p>New shared league transactions will appear here.</p></article>`}`;
  }

  function initBuilder(initialAsset=null,workflow=null){
    const own=currentTeam();
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

  function selected(type,id){return builder?.transfers?.some(item=>item.assetType===type&&String(item.assetId)===String(id))}
  function participantAssetPicker(teamKey){
    const roster=players().filter(player=>teamKeyForPlayer(player)===teamKey).sort((a,b)=>Number(b.overall||0)-Number(a.overall||0));
    const picks=(state?.picks||[]).filter(pick=>pick.currentTeamKey===teamKey);
    return `<article class="card live-trade-team-assets"><div class="card-header"><div><span class="eyebrow">${esc(teamAbbr(teamKey))} assets</span><h3>${esc(teamName(teamKey))}</h3></div>${teamKey!==currentTeam()?`<button class="text-button" data-live-remove-team="${esc(teamKey)}">Remove</button>`:''}</div><div class="live-trade-picker-list">${roster.map(player=>`<button data-live-add-asset="player" data-live-asset-id="${esc(player.id)}" data-live-from-team="${esc(teamKey)}" ${selected('player',player.id)?'disabled':''}><span><strong>${esc(player.name)}</strong><small>${esc(player.position||'')} · ${esc(player.overall??'—')} OVR${calculatorEnabled()?` · ${playerValuation(player).total.toLocaleString()} value`:''}</small></span><b>+</b></button>`).join('')}${picks.map(pick=>`<button data-live-add-asset="draft-pick" data-live-asset-id="${esc(pick.id)}" data-live-from-team="${esc(teamKey)}" ${selected('draft-pick',pick.id)?'disabled':''}><span><strong>${pick.draftClass} Round ${pick.round}</strong><small>Originally ${esc(teamAbbr(pick.originalTeamKey))}${calculatorEnabled()?` · ${pickValuation(pick).total.toLocaleString()} value`:''}</small></span><b>+</b></button>`).join('')}</div></article>`;
  }

  function builderTransferRow(transfer,index){
    const asset={assetType:transfer.assetType,sourcePlayerId:transfer.assetType==='player'?transfer.assetId:null,draftPickId:transfer.assetType==='draft-pick'?transfer.assetId:null,fromTeamKey:transfer.fromTeamKey,toTeamKey:transfer.toTeamKey};
    return `<div class="live-trade-builder-row"><span><strong>${esc(assetLabel(asset))}</strong><small>${esc(teamAbbr(transfer.fromTeamKey))} sends to</small></span>${valueMarkup(asset)}<select data-live-transfer-destination="${index}">${builder.teamKeys.filter(key=>key!==transfer.fromTeamKey).map(key=>`<option value="${esc(key)}" ${transfer.toTeamKey===key?'selected':''}>${esc(teamName(key))}</option>`).join('')}</select><button class="icon-button" data-live-remove-asset="${index}" aria-label="Remove asset">×</button></div>`;
  }

  function renderBuilder(){
    if(!builder)initBuilder();
    const available=(state?.teams||[]).filter(team=>!builder.teamKeys.includes(team.teamKey));
    page().innerHTML=`<div class="page-heading"><div><button class="text-button" data-live-trade-back>← Trade Center</button><h1>${builder.tradeId?'Revise Trade':'Create Trade'}</h1><p>Every team must send and receive at least one player or draft pick.</p></div><button class="button button--primary" data-live-submit-trade>${builder.tradeId?'Send Revised Offer':'Send Trade Offer'}</button></div><article class="card live-trade-team-toolbar"><label class="field field--grow"><span>Add participating team</span><select data-live-team-select><option value="">Choose team…</option>${available.map(team=>`<option value="${esc(team.teamKey)}">${esc(team.displayName)}</option>`).join('')}</select></label><button class="button button--secondary" data-live-add-team ${builder.teamKeys.length>=4?'disabled':''}>Add Team</button></article><div class="live-trade-builder-grid">${builder.teamKeys.map(participantAssetPicker).join('')}</div><article class="card live-trade-draft"><div class="card-header"><div><h2>Trade Package</h2><p>${builder.transfers.length} selected asset${builder.transfers.length===1?'':'s'}</p></div></div>${builder.transfers.length?builder.transfers.map(builderTransferRow).join(''):'<div class="empty-mini">Select assets from the participating teams.</div>'}<label class="field"><span>Message to participating owners</span><textarea data-live-trade-note placeholder="Explain the proposed terms…">${esc(builder.note)}</textarea></label><div class="heading-actions"><button class="button button--primary" data-live-submit-trade>${builder.tradeId?'Send Revised Offer':'Send Trade Offer'}</button></div></article>`;
  }

  function renderDetail(workflow){
    const own=currentTeam(),participant=workflow.participants.some(item=>item.teamKey===own);
    const ownAcceptance=workflow.participants.find(item=>item.teamKey===own)?.acceptedRevision===workflow.revision;
    const conflict=participant&&canReview();
    const mayAccept=participant&&workflow.status==='negotiating'&&!ownAcceptance;
    const mayReview=canReview()&&workflow.status==='committee'&&!conflict;
    const action=`${mayAccept?`<button class="button button--primary" data-live-accept="${esc(workflow.id)}">Accept Trade</button><button class="button button--secondary" data-live-revise="${esc(workflow.id)}">Revise Terms</button><button class="button button--danger button--subtle" data-live-reject="${esc(workflow.id)}">Reject</button>`:''}`;
    const review=mayReview?`<article class="card live-trade-review"><div class="card-header"><div><span class="eyebrow">Confidential review</span><h3>${workflow.review.approvals} approve · ${workflow.review.rejections} reject</h3><p>${workflow.review.threshold} matching decisions are required.</p></div></div><label class="field"><span>Reason (optional)</span><textarea data-live-review-reason placeholder="Add a reason when useful…"></textarea></label>${state.settings.freeTradeDesignationEnabled?'<label class="trade-rule-toggle"><input type="checkbox" data-live-free-trade><span><strong>Designate as Free Trade if approved</strong><small>This trade will not use a seasonal trade slot.</small></span></label>':''}<div class="heading-actions"><button class="button button--primary" data-live-review="approve:${esc(workflow.id)}">Approve</button><button class="button button--danger" data-live-review="reject:${esc(workflow.id)}">Reject</button><button class="button button--ghost" data-live-review="abstain:${esc(workflow.id)}">Abstain</button></div></article>`:'';
    page().innerHTML=`<div class="page-heading"><div><button class="text-button" data-live-trade-back>← Trade Center</button><span class="eyebrow">${esc(statusLabel(workflow.status))}</span><h1>${esc(workflow.participants.map(item=>teamAbbr(item.teamKey)).join(' ↔ '))}</h1><p>${esc(workflow.note||'League trade')}</p></div><div class="heading-actions">${action}</div></div><div class="live-trade-package-grid">${workflow.participants.map(item=>`<article class="card"><h3>${esc(teamName(item.teamKey))} sends</h3>${workflow.assets.filter(asset=>asset.fromTeamKey===item.teamKey).map(assetRow).join('')||'<div class="empty-mini">No assets</div>'}</article>`).join('')}</div>${review}<article class="card live-trade-messages"><div class="card-header"><div><h3>Negotiation</h3><p>Shared only with participating owners and authorized reviewers.</p></div></div>${workflow.messages.map(message=>`<div class="live-trade-message"><strong>${esc(message.authorName||'System')}</strong><p>${esc(message.message)}</p><small>${esc(date(message.createdAt))}</small></div>`).join('')||'<div class="empty-mini">No messages yet.</div>'}${participant&&!['approved','rejected','withdrawn'].includes(workflow.status)?`<div class="live-trade-message-compose"><textarea data-live-message-text placeholder="Write a message…"></textarea><button class="button button--primary" data-live-send-message="${esc(workflow.id)}">Send</button></div>`:''}</article>`;
  }

  function renderTradeCenter(part=''){
    if(!ensureState('Trade Center'))return;
    if(part==='new'){renderBuilder();return}
    const workflow=state.workflows.find(item=>item.id===part);
    if(workflow){renderDetail(workflow);return}
    renderDashboard(['received','committee','approved','rejected'].includes(part)?part:'all');
  }

  function renderTradeBlock(){
    if(!ensureState('Trade Block'))return;
    const own=currentTeam();
    const listings=state.listings||[];
    const managePlayers=own?players().filter(player=>teamKeyForPlayer(player)===own).sort((a,b)=>Number(b.overall||0)-Number(a.overall||0)):[];
    const managePicks=own?(state.picks||[]).filter(pick=>pick.currentTeamKey===own):[];
    page().innerHTML=`<div class="page-heading"><div><span class="eyebrow">League marketplace</span><h1>Trade Block</h1><p>Owners control their own listings and can describe the return they want.</p></div></div><div class="trade-block-grid trade-block-grid--full">${listings.map(item=>`<article class="card block-player-card"><div><span class="eyebrow">${esc(teamAbbr(item.teamKey))}</span><h3>${esc(item.playerName||(state.picks.find(pick=>pick.id===item.draftPickId)?`${state.picks.find(pick=>pick.id===item.draftPickId).draftClass} Round ${state.picks.find(pick=>pick.id===item.draftPickId).round}`:'Draft Pick'))}</h3><p>${esc(item.requestedReturn||'Open to offers')}</p></div>${item.teamKey!==own?`<button class="button button--primary" data-live-start-block-type="${esc(item.assetType)}" data-live-start-block-id="${esc(item.playerPublicId||item.draftPickId||'')}">Build Trade</button>`:'<span class="pill pill--accent">Your listing</span>'}</article>`).join('')||'<article class="empty-state card"><h2>No active listings</h2><p>Team owners can add players or picks below.</p></article>'}</div>${own?`<article class="card live-trade-block-manager"><div class="card-header"><div><h2>Manage ${esc(teamName(own))} Trade Block</h2><p>Click the star, then describe what you want in return.</p></div></div><div class="live-trade-picker-list">${managePlayers.map(player=>`<button data-live-toggle-block="player:${esc(player.id)}"><span><strong>${esc(player.name)}</strong><small>${esc(player.position)} · ${esc(player.overall??'—')} OVR</small></span><b>${onBlock(player)?'★':'☆'}</b></button>`).join('')}${managePicks.map(pick=>`<button data-live-toggle-block="draft-pick:${esc(pick.id)}"><span><strong>${pick.draftClass} Round ${pick.round}</strong><small>Originally ${esc(teamAbbr(pick.originalTeamKey))}</small></span><b>${blockLookup.has(String(pick.id))?'★':'☆'}</b></button>`).join('')}</div></article>`:''}`;
  }

  function renderCommissionerSettings(){
    if(!state){load().then(rerender).catch(rerender);return loadingMarkup('Trade Center Settings')}
    const settings=state.settings;
    return `<div class="commissioner-control-stack"><section class="card"><div class="card-header"><div><span class="eyebrow">Shared league policy</span><h3>Trade Center Settings</h3><p>Changes are saved once and apply to every commissioner and league member.</p></div><span class="pill pill--success">Revision ${settings.revision}</span></div><div class="trade-setting-grid trade-setting-grid--five"><label class="field"><span>Trades per Franchise season</span><input type="number" min="1" max="100" data-live-setting="seasonTradeLimit" value="${settings.seasonTradeLimit}"></label><label class="field"><span>Players per team / trade</span><input type="number" min="1" max="12" data-live-setting="maxPlayersPerTeam" value="${settings.maxPlayersPerTeam}"></label><label class="field"><span>Picks per team / trade</span><input type="number" min="1" max="21" data-live-setting="maxPicksPerTeam" value="${settings.maxPicksPerTeam}"></label><label class="field"><span>Matching review votes</span><input type="number" min="1" max="12" data-live-setting="reviewApprovalThreshold" value="${settings.reviewApprovalThreshold}"></label></div><label class="trade-rule-toggle"><input type="checkbox" data-live-setting="seasonTradeLimitEnabled" ${settings.seasonTradeLimitEnabled?'checked':''}><span><strong>Enforce Franchise season trade limit</strong></span></label><label class="trade-rule-toggle"><input type="checkbox" data-live-setting="freeTradeDesignationEnabled" ${settings.freeTradeDesignationEnabled?'checked':''}><span><strong>Allow Free Trade designations</strong></span></label><label class="trade-rule-toggle"><input type="checkbox" data-live-setting="calculatorEnabled" ${settings.calculatorEnabled?'checked':''}><span><strong>Show Trade Calculator values</strong><small>Turning this off removes calculated values throughout FranchiseHQ.</small></span></label><h4>Calculator weights</h4><div class="trade-setting-grid trade-setting-grid--five">${[['overallWeight','Overall'],['ageCurveWeight','Age curve'],['developmentWeight','Development'],['positionWeight','Position'],['contractWeight','Contract']].map(([key,label])=>`<label class="field"><span>${label}</span><input type="number" min="0" max="10" step="0.1" data-live-model-setting="${key}" value="${settings.valueModel[key]}"></label>`).join('')}</div><h4>Draft round values</h4><div class="trade-setting-grid trade-setting-grid--five">${Object.entries(settings.valueModel.draftRoundValues).map(([round,value])=>`<label class="field"><span>Round ${round}</span><input type="number" min="0" max="100000" step="10" data-live-round-setting="${round}" value="${value}"></label>`).join('')}</div><h4>Future pick retained value</h4><div class="trade-setting-grid trade-setting-grid--five">${Object.entries(settings.valueModel.futurePickRetention).map(([distance,value])=>`<label class="field"><span>${distance} draft${distance==='1'?'':'s'} away</span><input type="number" min="0" max="1" step="0.01" data-live-retention-setting="${distance}" value="${value}"></label>`).join('')}</div><div class="heading-actions"><button class="button button--primary" data-live-save-settings>Save League Settings</button></div></section><section class="card"><div class="card-header"><div><h3>Draft Pick Ledger</h3><p>Madden does not currently export pick ownership. Create the reviewed baseline once; approved Trade Center deals maintain it.</p></div><span class="pill ${state.picks.length?'pill--success':'pill--warning'}">${state.picks.length} picks</span></div><label class="field"><span>Draft classes (comma separated)</span><input data-live-draft-classes value="${state.season?.seasonYear?`${Number(state.season.seasonYear)+1}, ${Number(state.season.seasonYear)+2}, ${Number(state.season.seasonYear)+3}`:'2027, 2028, 2029'}"></label><button class="button button--secondary" data-live-seed-picks>Create Missing Pick Baseline</button></section></div>`;
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

  async function togglePlayerBlock(playerId,trigger=null){
    if(!state)await load();
    const player=playerById(playerId);
    if(!player||teamKeyForPlayer(player)!==currentTeam()){showToast('Trade Block unavailable','Only the owner of this roster can change the listing.');return}
    const active=!onBlock(player);
    let requestedReturn='';
    if(active){requestedReturn=window.prompt(`What would you like in return for ${player.name}? (Optional)`,'Open to fair offers')||''}
    try{await request('trade-block',{assetType:'player',assetId:String(player.id),active,requestedReturn});showToast(active?'Added to Trade Block':'Removed from Trade Block',player.name);trigger?.blur?.();rerender()}
    catch(error){showToast('Trade Block not updated',error.message)}
  }

  function calculatorEnabled(){return state?.settings?.calculatorEnabled!==false}
  function playerValuation(player){
    if(!calculatorEnabled()||!player)return null;
    const model=state?.settings?.valueModel||{};
    const overall=Math.max(0,Number(player.overall||0)-55)*Number(model.overallWeight??1)*24;
    const age=Math.max(-180,Math.min(240,(28-Number(player.age||28))*20))*Number(model.ageCurveWeight??1);
    const trait=String(player.dev||player.developmentTrait||'Normal').toLowerCase();
    const development=({normal:0,star:110,superstar:230,'x-factor':360,xfactor:360}[trait]||0)*Number(model.developmentWeight??1);
    const positionKey=String(player.position||'').toUpperCase();
    const positionBase=({QB:260,LT:150,RT:145,WR:125,CB:125,REDG:135,LEDG:135,REDGE:135,LEDGE:135,DT:90,MLB:70,WILL:70,SAM:70,MIKE:70}[positionKey]||45);
    const position=positionBase*Number(model.positionWeight??1);
    const years=Number(player.contractYears??player.years??player.contract?.yearsRemaining??0);
    const capHit=Number(player.capHit??player.contract?.capHit??0);
    const capMillions=capHit>100000?capHit/1000000:capHit;
    const contract=(Math.min(4,Math.max(0,years))*35-Math.min(180,Math.max(0,capMillions-5)*8))*Number(model.contractWeight??1);
    return {total:Math.max(0,Math.round(overall+age+development+position+contract)),overall,age,development,position,contract};
  }
  function pickValuation(pick){
    if(!calculatorEnabled()||!pick)return null;
    const round=Number(pick.round||1),base=Number(state?.settings?.valueModel?.draftRoundValues?.[round]||0);
    const seasonYear=Number(state?.season?.seasonYear||2026),distance=Math.max(1,Number(pick.draftClass||seasonYear+1)-seasonYear);
    const configured=Number(state?.settings?.valueModel?.futurePickRetention?.[Math.min(3,distance)]);
    const retention=Number.isFinite(configured)?configured:Math.max(.2,.68-Math.max(0,distance-3)*.1);
    return {total:Math.max(0,Math.round(base*retention)),base,distance,retention};
  }
  function packageValuation(assets=[]){
    if(!calculatorEnabled())return {raw:0,total:0,adjustment:0,rows:[],assetCount:assets.length,enabled:false};
    const raw=assets.reduce((sum,asset)=>{
      const type=asset.assetType||asset.type;
      const shaped=type==='player'
        ?{assetType:'player',sourcePlayerId:asset.sourcePlayerId||asset.assetId||asset.id}
        :{assetType:'draft-pick',draftPickId:asset.draftPickId||asset.assetId||asset.id};
      return sum+(assetValue(shaped)||0);
    },0);
    return {raw,total:raw,adjustment:0,rows:[],assetCount:assets.length};
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

  document.addEventListener('click',event=>{
    let target;
    if(target=event.target.closest('[data-live-trade-retry]')){event.preventDefault();state=null;lastError=null;load(true).then(rerender).catch(rerender);return}
    if(target=event.target.closest('[data-live-start-trade]')){event.preventDefault();initBuilder();setRoute('trade-center/new');return}
    if(target=event.target.closest('[data-live-trade-back]')){event.preventDefault();builder=null;setRoute('trade-center');return}
    if(target=event.target.closest('[data-live-trade-tab]')){event.preventDefault();setRoute(`trade-center/${target.dataset.liveTradeTab}`);return}
    if(target=event.target.closest('[data-live-open-trade]')){event.preventDefault();setRoute(`trade-center/${target.dataset.liveOpenTrade}`);return}
    if(target=event.target.closest('[data-live-add-team]')){event.preventDefault();const select=document.querySelector('[data-live-team-select]'),key=select?.value;if(key&&builder.teamKeys.length<4&&!builder.teamKeys.includes(key)){builder.teamKeys.push(key);builder.transfers.forEach(item=>{if(!item.toTeamKey&&item.fromTeamKey!==key)item.toTeamKey=key});renderBuilder()}return}
    if(target=event.target.closest('[data-live-remove-team]')){event.preventDefault();const key=target.dataset.liveRemoveTeam;builder.teamKeys=builder.teamKeys.filter(item=>item!==key);builder.transfers=builder.transfers.filter(item=>item.fromTeamKey!==key&&item.toTeamKey!==key);renderBuilder();return}
    if(target=event.target.closest('[data-live-add-asset]')){event.preventDefault();const assetType=target.dataset.liveAddAsset,assetId=target.dataset.liveAssetId,fromTeamKey=target.dataset.liveFromTeam;const toTeamKey=builder.teamKeys.find(key=>key!==fromTeamKey)||'';builder.transfers.push({assetType,assetId,fromTeamKey,toTeamKey});renderBuilder();return}
    if(target=event.target.closest('[data-live-remove-asset]')){event.preventDefault();builder.transfers.splice(Number(target.dataset.liveRemoveAsset),1);renderBuilder();return}
    if(target=event.target.closest('[data-live-submit-trade]')){event.preventDefault();builder.note=document.querySelector('[data-live-trade-note]')?.value||builder.note;act(builder.tradeId?'counter':'propose',{tradeId:builder.tradeId,revision:builder.baseRevision,transfers:builder.transfers,note:builder.note},builder.tradeId?'Revised offer sent':'Trade offer sent').then(ok=>{if(ok)builder=null});return}
    if(target=event.target.closest('[data-live-accept]')){event.preventDefault();const workflow=state.workflows.find(item=>item.id===target.dataset.liveAccept);act('accept',{tradeId:target.dataset.liveAccept,revision:workflow?.revision},'Trade accepted');return}
    if(target=event.target.closest('[data-live-revise]')){event.preventDefault();const workflow=state.workflows.find(item=>item.id===target.dataset.liveRevise);initBuilder(null,workflow);setRoute('trade-center/new');return}
    if(target=event.target.closest('[data-live-reject]')){event.preventDefault();const workflow=state.workflows.find(item=>item.id===target.dataset.liveReject),reason=window.prompt('Reason for rejection (optional)','')||'';act('reject',{tradeId:target.dataset.liveReject,revision:workflow?.revision,reason},'Trade rejected');return}
    if(target=event.target.closest('[data-live-review]')){event.preventDefault();const [decision,tradeId]=target.dataset.liveReview.split(':'),workflow=state.workflows.find(item=>item.id===tradeId);act('review',{tradeId,revision:workflow?.revision,decision,reason:document.querySelector('[data-live-review-reason]')?.value||'',freeTrade:Boolean(document.querySelector('[data-live-free-trade]')?.checked)},'Review saved');return}
    if(target=event.target.closest('[data-live-send-message]')){event.preventDefault();const input=document.querySelector('[data-live-message-text]');if(input?.value.trim())act('message',{tradeId:target.dataset.liveSendMessage,message:input.value},'Message sent');return}
    if(target=event.target.closest('[data-live-toggle-block]')){event.preventDefault();const [assetType,...rest]=target.dataset.liveToggleBlock.split(':');const assetId=rest.join(':');if(assetType==='player')togglePlayerBlock(assetId,target);else{const active=!blockLookup.has(assetId),requestedReturn=active?(window.prompt('What would you like in return? (Optional)','Open to fair offers')||''):'';act('trade-block',{assetType:'draft-pick',assetId,active,requestedReturn},active?'Pick listed':'Pick removed')}return}
    if(target=event.target.closest('[data-live-start-block-id]')){event.preventDefault();startAssetTrade(target.dataset.liveStartBlockType,target.dataset.liveStartBlockId);return}
    if(target=event.target.closest('[data-live-save-settings]')){event.preventDefault();const settings=structuredClone(state.settings);document.querySelectorAll('[data-live-setting]').forEach(input=>{settings[input.dataset.liveSetting]=input.type==='checkbox'?input.checked:Number(input.value)});document.querySelectorAll('[data-live-model-setting]').forEach(input=>{settings.valueModel[input.dataset.liveModelSetting]=Number(input.value)});document.querySelectorAll('[data-live-round-setting]').forEach(input=>{settings.valueModel.draftRoundValues[input.dataset.liveRoundSetting]=Number(input.value)});document.querySelectorAll('[data-live-retention-setting]').forEach(input=>{settings.valueModel.futurePickRetention[input.dataset.liveRetentionSetting]=Number(input.value)});act('settings',{revision:state.settings.revision,settings},'League settings saved');return}
    if(target=event.target.closest('[data-live-seed-picks]')){event.preventDefault();const draftClasses=String(document.querySelector('[data-live-draft-classes]')?.value||'').split(',').map(Number).filter(Number.isInteger);act('seed-picks',{draftClasses},'Draft pick baseline ready');return}
    if(target=event.target.closest('[data-live-notifications-read]')){event.preventDefault();act('notifications-read',{},'Notifications read');return}
    if(target=event.target.closest('[data-live-notification-trade]')){event.preventDefault();document.querySelector('[data-notification-menu]')?.classList.remove('is-open');if(target.dataset.liveNotificationTrade)setRoute(`trade-center/${target.dataset.liveNotificationTrade}`);return}
  });

  document.addEventListener('change',event=>{
    const destination=event.target.closest('[data-live-transfer-destination]');
    if(destination&&builder){builder.transfers[Number(destination.dataset.liveTransferDestination)].toTeamKey=destination.value}
  });

  window.addEventListener('franchisehq:auth-changed',event=>{
    if(event.detail?.status!=='ready')return;
    state=null;load(true).then(()=>{
      const unread=state.notifications.filter(item=>!item.readAt).length;
      if(unread)showToast(`${unread} trade notification${unread===1?'':'s'}`,'Open Notifications to review league trade activity.');
      rerender();
    }).catch(()=>{});
  });
  window.addEventListener('franchisehq:league-tenant-changed',()=>{state=null;builder=null;blockLookup.clear()});

  const service={version:VERSION,load,refresh:()=>load(true),request,renderTradeCenter,renderTradeBlock,renderCommissionerSettings,
    renderNotificationMenu,badges,startPlayerTrade,startAssetTrade,togglePlayerBlock,onBlock,calculatorEnabled,playerValuation,pickValuation,packageValuation,
    diagnostics:()=>({version:VERSION,loaded:Boolean(state),loading:Boolean(loading),workflowCount:state?.workflows?.length||0,pickCount:state?.picks?.length||0,lastError})};
  HQ.liveTradeCenter=service;
  if(window.FGC_TRADE){
    Object.assign(window.FGC_TRADE,{
      renderTradeCenter,renderTradeBlock,tradeCalculatorEnabled:calculatorEnabled,playerValuation,pickValuation,packageValuation,
      addPlayerToTrade:startPlayerTrade,togglePlayerBlock,onBlock
    });
    HQ.trade?.attachLegacy?.(window.FGC_TRADE);
  }
  load().catch(()=>{});
})();
