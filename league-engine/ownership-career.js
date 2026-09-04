(() => {
  'use strict';
  const HQ=window.FranchiseHQ;
  const VERSION='7.4.0.8';
  const cache=new Map();
  const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const leagueSlug=()=>HQ?.leagueTenant?.getCurrentLeague?.()?.slug||location.pathname.match(/^\/leagues\/([^/]+)/i)?.[1]||null;
  const canReconcile=()=>HQ?.auth?.getRole?.()==='commissioner';

  async function request(teamKey='',force=false){
    const slug=leagueSlug();
    if(!slug)throw new Error('A server-resolved league is required.');
    const key=String(teamKey||'').toLowerCase();
    if(!force&&cache.has(key))return cache.get(key);
    const url=new URL(`/api/leagues/${encodeURIComponent(slug)}/ownership-career`,location.origin);
    if(key)url.searchParams.set('teamKey',key);
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
    const payload=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
    if(!response.ok||payload.ok===false)throw new Error(payload.error||`HTTP ${response.status}`);
    cache.set(key,payload);
    return payload;
  }

  async function requestLeague(force=false){
    const slug=leagueSlug();
    if(!slug)throw new Error('A server-resolved league is required.');
    const key='__league_history__';
    if(!force&&cache.has(key))return cache.get(key);
    const url=new URL(`/api/leagues/${encodeURIComponent(slug)}/ownership-career`,location.origin);
    url.searchParams.set('view','league');
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
    const payload=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
    if(!response.ok||payload.ok===false)throw new Error(payload.error||`HTTP ${response.status}`);
    cache.set(key,payload);
    return payload;
  }

  function record(wins,losses,ties){return `${Number(wins||0)}-${Number(losses||0)}${Number(ties||0)?`-${Number(ties)}`:''}`}
  function trophy(label,value,copy){return `<article><span>${esc(label)}</span><strong>${Number(value||0)}</strong><small>${esc(copy)}</small></article>`}
  function render(payload){
    if(payload.state==='unassigned')return `<article class="card gm-career-empty"><span class="eyebrow">Franchise ownership</span><h3>No current owner</h3><p>This team is not assigned to an active FranchiseHQ membership.</p></article>`;
    if(payload.state==='pending-reconciliation')return `<article class="card gm-career-empty"><span class="eyebrow">Franchise ownership</span><h3>${esc(payload.owner?.displayName||'Owner')} · history pending</h3><p>The reviewed membership is authoritative, but its permanent ownership period has not been initialized.</p>${canReconcile()?'<button type="button" class="button button--primary" data-reconcile-ownership>Initialize reviewed ownership history</button>':''}</article>`;
    const career=payload.career||{},totals=career.totals||{},seasons=career.seasons||[];
    return `<section class="gm-career-shell card">
      <div class="card-header"><div><span class="eyebrow">GM Career · Membership-authoritative</span><h3>${esc(payload.owner?.displayName||'General Manager')}</h3><p>${(totals.teams||[]).map(team=>esc(team.displayName)).join(' · ')||esc(payload.team?.displayName||'Current team')}</p></div><span class="pill pill--success">Reconciled</span></div>
      <div class="gm-career-records">
        <article><span>Regular Season</span><strong>${esc(record(totals.regularWins,totals.regularLosses,totals.regularTies))}</strong><small>Career record</small></article>
        <article><span>Playoffs</span><strong>${esc(record(totals.playoffWins,totals.playoffLosses,totals.playoffTies))}</strong><small>${Number(totals.playoffAppearances||0)} appearance${Number(totals.playoffAppearances||0)===1?'':'s'}</small></article>
        ${trophy('Conference Titles',totals.conferenceChampionships,'Conference championships')}
        ${trophy('Super Bowl Trips',totals.superBowlAppearances,'Championship appearances')}
        ${trophy('Super Bowl Titles',totals.superBowlChampionships,'League championships')}
      </div>
      <div class="gm-trophy-case" aria-label="GM trophy case">${Number(totals.superBowlChampionships||0)?Array.from({length:Number(totals.superBowlChampionships)},(_,index)=>`<span title="Super Bowl Championship ${index+1}">🏆</span>`).join(''):'<span class="gm-trophy-case__empty">Trophy case ready for the first championship.</span>'}</div>
      <div class="table-wrap gm-season-history"><table><thead><tr><th>Season</th><th>Team(s)</th><th>Regular</th><th>Playoffs</th><th>Playoff Berth</th><th>Conference</th><th>Super Bowl</th><th>Champion</th></tr></thead><tbody>${seasons.map(season=>`<tr><td>${esc(season.seasonYear||season.label)}</td><td>${(season.teams||[]).map(team=>esc(team.displayName)).join(', ')||'—'}</td><td>${esc(record(season.regularWins,season.regularLosses,season.regularTies))}</td><td>${esc(record(season.playoffWins,season.playoffLosses,season.playoffTies))}</td><td>${season.playoffAppearance?'Yes':'—'}</td><td>${Number(season.conferenceChampionships||0)}</td><td>${Number(season.superBowlAppearances||0)}</td><td>${Number(season.superBowlChampionships||0)}</td></tr>`).join('')}</tbody></table></div>
      <p class="gm-career-authority">Game attribution uses reviewed FranchiseHQ membership periods. Madden owner-name fields are ignored.</p>
    </section>`;
  }

  function renderLeague(payload={}){
    const owners=payload.owners||[];
    if(payload.state==='empty'||!owners.length)return `<article class="card gm-career-empty"><span class="eyebrow">History Books</span><h3>No GM history yet</h3><p>League History will populate from reviewed FranchiseHQ ownership periods as games and seasons are completed.</p></article>`;
    const championships=owners.reduce((sum,entry)=>sum+Number(entry.totals?.superBowlChampionships||0),0);
    return `<section class="league-history-shell">
      <article class="card league-history-intro">
        <div><span class="eyebrow">History Books · Membership-authoritative</span><h2>League GM History</h2><p>Career results follow the person who controlled each team when a game was played. Madden owner-name fields are ignored.</p></div>
        <div class="league-history-summary"><span><strong>${owners.length}</strong><small>GMs recorded</small></span><span><strong>${championships}</strong><small>Super Bowl wins</small></span></div>
      </article>
      <article class="card league-history-table-card">
        <div class="table-wrap"><table class="league-history-table"><thead><tr><th>Rank</th><th>GM / Owner</th><th>Teams Managed</th><th>Career Record</th><th>Playoff Record</th><th>Playoff Appearances</th><th>Super Bowl Appearances</th><th>Super Bowl Wins</th></tr></thead><tbody>${owners.map(entry=>{const totals=entry.totals||{};return `<tr><td><span class="seed">${Number(entry.rank||0)}</span></td><td><strong>${esc(entry.owner?.displayName||'General Manager')}</strong>${(entry.currentTeams||[]).length?`<small>Current: ${(entry.currentTeams||[]).map(team=>esc(team.displayName)).join(', ')}</small>`:''}</td><td>${(totals.teams||[]).map(team=>esc(team.displayName)).join(', ')||'—'}</td><td><strong>${esc(record(totals.regularWins,totals.regularLosses,totals.regularTies))}</strong></td><td>${esc(record(totals.playoffWins,totals.playoffLosses,totals.playoffTies))}</td><td>${Number(totals.playoffAppearances||0)}</td><td>${Number(totals.superBowlAppearances||0)}</td><td><strong>${Number(totals.superBowlChampionships||0)}</strong></td></tr>`}).join('')}</tbody></table></div>
      </article>
    </section>`;
  }

  async function mountTeam(host,teamKey=''){
    if(typeof host==='string')host=document.querySelector(host);
    if(!host)return false;
    host.innerHTML='<article class="card gm-career-empty"><span class="spinner" aria-hidden="true"></span><strong>Loading GM career history…</strong></article>';
    try{host.innerHTML=render(await request(teamKey));return true}
    catch(error){host.innerHTML=`<article class="card gm-career-empty"><h3>GM history unavailable</h3><p>${esc(error.message)}</p></article>`;return false}
  }

  async function mountLeague(host){
    if(typeof host==='string')host=document.querySelector(host);
    if(!host)return false;
    host.innerHTML='<article class="card gm-career-empty"><span class="spinner" aria-hidden="true"></span><strong>Loading League History…</strong></article>';
    try{host.innerHTML=renderLeague(await requestLeague());return true}
    catch(error){host.innerHTML=`<article class="card gm-career-empty"><h3>League History unavailable</h3><p>${esc(error.message)}</p></article>`;return false}
  }

  async function reconcile(){
    const slug=leagueSlug();
    const response=await fetch(`/api/leagues/${encodeURIComponent(slug)}/ownership-career`,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'reconcile-current-assignments'})});
    const payload=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
    if(!response.ok||payload.ok===false)throw new Error(payload.error||`HTTP ${response.status}`);
    cache.clear();
    return payload;
  }

  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-reconcile-ownership]');if(!button)return;
    event.preventDefault();button.disabled=true;button.textContent='Initializing…';
    try{
      await reconcile();
      const host=button.closest('[data-gm-career-host]');
      await mountTeam(host,host?.dataset.gmCareerHost||'');
    }catch(error){button.disabled=false;button.textContent='Retry ownership history';HQ?.ui?.toast?.('Ownership history stopped',error.message)}
  });

  HQ.defineModuleService('league','ownershipCareer',{version:VERSION,request,requestLeague,render,renderLeague,mountTeam,mountLeague,reconcile,clear:()=>cache.clear()},{replace:true,alias:'ownershipCareer'});
})();
