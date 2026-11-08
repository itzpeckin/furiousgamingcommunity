(() => {
  'use strict';
  const view=window.__FHQ_PUBLIC_VIEW__;
  if(!view?.readOnly)return;
  const publicRoutes=new Set(['home','teams','players','standings','stats','schedule','news','rules']);
  view.canBrowse=route=>publicRoutes.has(String(route||'home').split('/')[0]);
  const leaguePath='/leagues/'+encodeURIComponent(view.slug);
  view.joinPath=leaguePath+'?join=1';
  view.signInPath=()=>'/auth?returnTo='+encodeURIComponent(location.pathname+location.search+location.hash);
  const hiddenControls='[data-start-team-trade],[data-player-action],[data-team-tab="trade-history"],[data-open-block-drawer],[data-create-news],[data-standings-view="confidence"],[data-standings-view="history"],[data-standings-view="games"],.schedule-confidence-shell,.confidence-pool-shell,[data-open-team-trades]';
  function present(){
    document.querySelectorAll('[data-route]').forEach(node=>{
      if(!view.canBrowse(node.dataset.route))node.hidden=true;
    });
    document.querySelectorAll(hiddenControls).forEach(node=>{node.hidden=true;});
  }
  document.addEventListener('DOMContentLoaded',()=>{
    document.body.classList.add('public-league-view');
    const banner=document.createElement('aside');
    banner.className='public-league-notice';banner.setAttribute('aria-label','Public league viewing');
    const copy=document.createElement('div');
    const title=document.createElement('strong');title.textContent='Explore this league';
    const detail=document.createElement('span');detail.textContent='View rosters, standings and schedules. Join the league to manage a team.';
    copy.append(title,detail);banner.append(copy);
    const actions=document.createElement('div');actions.className='public-league-actions';
    const join=document.createElement('a');join.className='button button--primary';join.href=view.joinPath;join.textContent='Request to join';actions.append(join);
    if(!view.signedIn){const login=document.createElement('a');login.className='button button--ghost';login.href=view.signInPath();login.textContent='Sign in';login.addEventListener('click',()=>{login.href=view.signInPath();});actions.append(login);}
    banner.append(actions);document.querySelector('#main-content')?.prepend(banner);
    present();new MutationObserver(present).observe(document.body,{childList:true,subtree:true});
  });
})();
