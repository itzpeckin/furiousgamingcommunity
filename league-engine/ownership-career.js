(() => {
  'use strict';
  const HQ=window.FranchiseHQ;
  const VERSION='8.2.18';
  const cache=new Map();
  const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const leagueSlug=()=>HQ?.leagueTenant?.getCurrentLeague?.()?.slug||location.pathname.match(/^\/leagues\/([^/]+)/i)?.[1]||null;
  const canReconcile=()=>HQ?.auth?.getRole?.()==='commissioner';

  let cacheRevision=0;
  const clear=()=>{cacheRevision++;cache.clear();};
  let lastSnapshot=null;
  window.addEventListener('franchisehq:league-tenant-changed',clear);
  window.addEventListener('franchisehq:live-read-refreshed',event=>{
    const next=`${event.detail?.leagueSlug}:${event.detail?.snapshotId}`;
    if(next!==lastSnapshot){lastSnapshot=next;clear();}
  });
  document.addEventListener('franchisehq:roster-ownership-changed',clear);
  async function readHistory(teamKey='',view='',force=false){
    const slug=leagueSlug();
    if(!slug)throw new Error('A server-resolved league is required.');
    const key=`${slug}:${view}:${String(teamKey).toLowerCase()}`,revision=cacheRevision;
    const cached=cache.get(key);
    if(!force&&cached&&cached.expires>Date.now())return cached.promise;
    const url=new URL(`/api/leagues/${encodeURIComponent(slug)}/ownership-career`,location.origin);
    if(teamKey)url.searchParams.set('teamKey',teamKey);
    if(view)url.searchParams.set('view',view);
    const promise=(async()=>{
      const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
      const payload=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
      if(!response.ok||payload.ok===false)throw new Error(payload.error||`HTTP ${response.status}`);
      if(leagueSlug()!==slug)throw new Error('The league changed. Open history in the selected league.');
      return payload;
    })();
    cache.set(key,{promise,expires:Date.now()+30000});
    try{return await promise}catch(error){if(revision===cacheRevision)cache.delete(key);throw error;}
  }
  const request=(teamKey='',force=false)=>readHistory(teamKey,'',force);
  const requestLeague=(force=false)=>readHistory('','league',force);

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

  function coveredMetric(totals,key,count){
    const known=Number(totals[count]||0),all=Number(totals.gameCount||0);
    if(!known)return '<span title="No recorded game data">—</span>';
    return `${Number(totals[key]||0).toLocaleString()}${known<all?`<small title="${known} of ${all} games have this data">${known}/${all} games</small>`:''}`;
  }
  function renderLeague(payload={}){
    const owners=payload.owners||[];
    if(!owners.length)return '<article class="card gm-career-empty"><h3>No GM history yet</h3><p>GM History appears as assigned teams complete games.</p></article>';
    return `<section class="league-history-shell">
      <article class="card league-history-intro"><div><span class="eyebrow">Career standings</span><h2>GM History</h2><p>Regular season and playoffs across current and archived seasons. Results follow the GM assigned for that game’s week.</p></div><div class="league-history-summary"><span><strong>${owners.length}</strong><small>GMs recorded</small></span></div></article>
      <article class="card league-history-table-card"><div class="table-wrap" tabindex="0" role="region" aria-label="GM career statistics, scroll horizontally for more columns"><table class="league-history-table gm-history-stat-table"><thead><tr><th>Rank</th><th>GM / Teams</th><th>Wins</th><th>Losses</th><th>Ties</th><th>Win %</th><th>Playoff Berths</th><th>Super Bowl Appearances</th><th>Super Bowl Wins</th><th>Points For</th><th>Points Against</th><th>Giveaways</th><th>Takeaways</th></tr></thead><tbody>${owners.map(entry=>{
        const t=entry.totals||{};
        return `<tr><td>${Number(entry.rank||0)}</td><td><strong>${esc(entry.owner?.displayName||'GM')}</strong><small>${(t.teams||[]).map(team=>esc(team.displayName)).join(', ')}</small></td><td>${Number(t.wins||0)}</td><td>${Number(t.losses||0)}</td><td>${Number(t.ties||0)}</td><td>${t.winPercentage==null?'—':`${(100*t.winPercentage).toFixed(1)}%`}</td><td>${Number(t.playoffAppearances||0)}</td><td>${Number(t.superBowlAppearances||0)}</td><td><strong>${Number(t.superBowlChampionships||0)}</strong></td><td>${coveredMetric(t,'pointsFor','scoredGames')}</td><td>${coveredMetric(t,'pointsAgainst','scoredGames')}</td><td>${coveredMetric(t,'giveaways','giveawayGames')}</td><td>${coveredMetric(t,'takeaways','takeawayGames')}</td></tr>`;
      }).join('')}</tbody></table></div><p class="gm-history-note">Win percentage counts a tie as half a win. Giveaways = interceptions thrown + fumbles lost. Takeaways = defensive interceptions + fumbles recovered. A dash means data is unavailable; partial totals show their game coverage.</p></article>
    </section>`;
  }

  const gameHosts=new WeakMap(),gameSelections=new Map();
  function filterHistory(payload,first,second=''){
    if(!first||first===second)return [];
    return (payload.games||[]).filter(game=>{
      const ids=[game.home.owner?.publicId,game.away.owner?.publicId];
      return ids.includes(first)&&(!second||ids.includes(second));
    });
  }
  function historySummary(games,id){
    const totals={wins:0,losses:0,ties:0,pointsFor:0,pointsAgainst:0,scoredGames:0,gameCount:games.length};
    for(const game of games){
      const own=game.home.owner?.publicId===id?game.home:game.away,other=own===game.home?game.away:game.home;
      totals[own.result==='win'?'wins':own.result==='loss'?'losses':'ties']++;
      if(own.score!==null&&other.score!==null){totals.pointsFor+=own.score;totals.pointsAgainst+=other.score;totals.scoredGames++;}
    }
    return totals;
  }
  function roundLabel(game){
    if(game.stage!=='playoffs')return `Week ${game.week}`;
    return ({1:'Wild Card',2:'Divisional',3:'Conference Championship',4:'Super Bowl',19:'Wild Card',20:'Divisional',21:'Conference Championship',22:'Super Bowl',23:'Super Bowl'})[game.week]||`Playoffs · Week ${game.week}`;
  }
  function renderGameResults(payload,first,second){
    if(!first)return '<div class="gm-history-empty"><h3>Choose a GM to see their games</h3><p>Add a second GM to compare their head-to-head history.</p></div>';
    const games=filterHistory(payload,first,second);
    const owner=id=>(payload.owners||[]).find(row=>row.owner?.publicId===id)?.owner;
    const cards=[first,...(second?[second]:[])].map(id=>{
      const t=historySummary(games,id);
      return `<article class="card gm-matchup-summary"><h3>${esc(owner(id)?.displayName||'GM')}</h3><dl><div><dt>Wins</dt><dd>${t.wins}</dd></div><div><dt>Losses</dt><dd>${t.losses}</dd></div><div><dt>Ties</dt><dd>${t.ties}</dd></div><div><dt>Points For</dt><dd>${coveredMetric(t,'pointsFor','scoredGames')}</dd></div><div><dt>Points Against</dt><dd>${coveredMetric(t,'pointsAgainst','scoredGames')}</dd></div></dl></article>`;
    }).join('');
    return `<div class="gm-matchup-summaries">${cards}</div><div class="gm-history-list-heading"><h3>${games.length} recorded game${games.length===1?'':'s'}</h3><span>Most recent first</span></div>${games.length?`<ol class="gm-game-list">${games.map(game=>`<li class="card gm-history-game"><div class="gm-history-game__period"><strong>${esc(game.seasonYear||game.label)}</strong><span>${esc(roundLabel(game))}</span></div><div class="gm-history-game__teams"><div><strong>${esc(game.away.teamName)}</strong><small>${esc(game.away.owner?.displayName||'No recorded GM')} · Away</small></div><strong class="gm-history-game__score">${game.away.score==null?'—':Number(game.away.score)} <span>–</span> ${game.home.score==null?'—':Number(game.home.score)}</strong><div><strong>${esc(game.home.teamName)}</strong><small>${esc(game.home.owner?.displayName||'No recorded GM')} · Home</small></div></div><span class="pill">${game.resultProof==='bracket-advancement'?'Bracket result · score unavailable':'Final'}</span></li>`).join('')}</ol>`:'<div class="card gm-history-empty"><h3>No recorded matchups</h3><p>No completed games match these GMs in the retained season history.</p></div>'}`;
  }
  function renderGames(payload={}){
    const owners=[...(payload.owners||[])].sort((a,b)=>String(a.owner?.displayName).localeCompare(String(b.owner?.displayName)));
    const saved=gameSelections.get(leagueSlug())||{},valid=id=>owners.some(row=>row.owner.publicId===id);
    const first=valid(saved.first)?saved.first:'',second=valid(saved.second)&&saved.second!==first?saved.second:'';
    const options=(selected,excluded)=>owners.map(row=>`<option value="${esc(row.owner.publicId)}" ${selected===row.owner.publicId?'selected':''} ${excluded===row.owner.publicId?'disabled':''}>${esc(row.owner.displayName)}</option>`).join('');
    return `<section class="gm-game-history" data-gm-game-history><article class="card"><span class="eyebrow">Career matchups</span><h2>Game History</h2><p>Compare GMs across regular-season and playoff games, including archived seasons.</p><div class="gm-history-filters"><label>First GM<select data-history-gm="first"><option value="">Choose a GM</option>${options(first,second)}</select></label><label>Opponent<select data-history-gm="second"><option value="">All opponents</option>${options(second,first)}</select></label></div></article><div data-gm-game-results aria-live="polite">${renderGameResults(payload,first,second)}</div><p class="gm-history-note">Only games with recorded ownership can be attributed to a GM. Missing scores are not treated as zero. Preseason games are excluded.</p></section>`;
  }
  function bindGames(host,payload){
    const target=host?.querySelector('[data-gm-game-history]');
    if(target)gameHosts.set(target,payload);
  }
  document.addEventListener('change',event=>{
    const select=event.target.closest('[data-history-gm]'),host=select?.closest('[data-gm-game-history]');
    const payload=host&&gameHosts.get(host);if(!payload)return;
    const first=host.querySelector('[data-history-gm="first"]').value,second=host.querySelector('[data-history-gm="second"]').value;
    gameSelections.set(leagueSlug(),{first,second});
    for(const control of host.querySelectorAll('[data-history-gm]'))for(const option of control.options)option.disabled=Boolean(option.value&&option.value===(control.dataset.historyGm==='first'?second:first));
    host.querySelector('[data-gm-game-results]').innerHTML=renderGameResults(payload,first,second);
  });

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
    clear();
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

  HQ.defineModuleService('league','ownershipCareer',{version:VERSION,request,requestLeague,render,renderLeague,renderGames,bindGames,filterHistory,historySummary,mountTeam,mountLeague,reconcile,clear},{replace:true,alias:'ownershipCareer'});
})();
