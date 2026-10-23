(() => {
  'use strict';
  if(window.__FHQ_PUBLIC_DEMO__?.slug!=='demo')return;
  const message='Public demo — view only. Changes are disabled.';
  // Presentation protection, backed by the server's read-only demo provider.
  // This never changes authentication or grants operational capabilities.
  const originalFetch=window.fetch.bind(window);
  window.fetch=(input,init={})=>{
    const method=String(init.method||(input instanceof Request?input.method:'GET')).toUpperCase();
    const url=new URL(input instanceof Request?input.url:String(input),location.href);
    if(url.origin===location.origin&&!['GET','HEAD','OPTIONS'].includes(method)){
      return Promise.resolve(new Response(JSON.stringify({ok:false,code:'DEMO_READ_ONLY',error:message}),{status:403,headers:{'content-type':'application/json'}}));
    }
    return originalFetch(input,init);
  };
  const browsing=new Set([
    'route','profile-button','mobile-menu-toggle','mobile-overlay','sidebar-toggle','open-sidebar','close-sidebar','open-command','close-profile','close-detail','detail-back','close-value-card',
    'command-button','command-input','close-command','command-close','command-route','command-news',
    'commissioner-tab','commissioner-controls-tab','calculator-settings-tab','value-model-tab','open-gameplay-rules','roster-open','roster-close','roster-type','roster-team','roster-search','roster-more',
    'team-tab','team-id','team-search','team-conference','team-division','team-schedule-phase','team-view',
    'open-player-card','player-id','roster-player-detail','player-card-tab','canonical-player-tab','player-stat-tab','player-career-stat-tab','player-back',
    'player-search','player-position','player-team','player-status','player-dev','player-rookie','player-free-agents','player-min-ovr','player-max-ovr','player-min-age','player-max-age','player-sort','player-page','player-page-size','player-clear-filters',
    'roster-group','roster-position','roster-dev','roster-sort','cap-position','cap-sort','sort-col','sort-table','depth-chart-view','depth-player-id',
    'home-leader-metric','feature-game','player-stat-phase','player-game-log-season','retry-player-career','previous-game-id','game-center-switch','matchup-previous','recap-format','copy-transaction-link','loadout-search','loadout-position','loadout-category',
    'standings-view','stats-category','stats-scope','stats-week','stats-team','stats-min-games','live-stats-sort','stats-team-category','season-team-sort',
    'schedule-team','live-schedule-phase','live-schedule-week','schedule-section','game-center-tab','matchup-tab','game-id','news-category','news-id','activity-filter',
    'confidence-week-change','confidence-standings-view','confidence-standings-week','transaction-search','transaction-type','transaction-team','transaction-season',
    'live-trade-tab','live-open-trade','live-trade-back','live-filter-team','live-block-filter','live-open-player','live-open-player-button','live-open-asset-value','live-open-fairness-value','live-open-package-value',
    'trade-tab','open-trade','open-pick-card','open-value-card','open-team-trades','inline-approved-detail','close-analytics-drilldown','close-replay','commissioner-team-search'
  ]);
  function allowed(element){
    if(element.matches('a[href]')){
      const href=element.getAttribute('href');
      if(href.startsWith('#'))return !/^#(?:trade-center\/new|trade-center\/create)/.test(href);
      const url=new URL(href,location.href);
      return url.origin===location.origin && (['/','/beta-apply','/auth','/leagues'].includes(url.pathname)||/^\/support(?:\/|$)/.test(url.pathname)||url.pathname.startsWith('/leagues/demo'));
    }
    return [...element.attributes].some(attr=>attr.name.startsWith('data-')&&browsing.has(attr.name.slice(5)));
  }
  document.addEventListener('click',event=>{
    const control=event.target.closest?.('button,a,input,select,textarea,[role="button"]');
    if(control&&!allowed(control)){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  document.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();},true);
  function protect(){
    document.querySelectorAll('button,input,select,textarea,[role="button"]').forEach(control=>{
      if(!allowed(control)){
        if('disabled' in control)control.disabled=true;
        control.setAttribute('aria-disabled','true');control.title=message;
      }
    });
    document.querySelectorAll('a[href]').forEach(link=>{if(!allowed(link)){link.setAttribute('aria-disabled','true');link.title=message;}});
    document.querySelectorAll('.commissioner-hq-authority strong').forEach(label=>{if(label.textContent!=='Demo visitor')label.textContent='Demo visitor';});
  }
  document.addEventListener('DOMContentLoaded',()=>{
    document.body.classList.add('public-demo-league');
    const main=document.querySelector('#main-content');
    const banner=document.createElement('aside');banner.className='public-demo-notice';banner.setAttribute('aria-label','Public demo');
    banner.innerHTML='<div><strong>FHQ Demo League</strong><span>Explore the platform with fictional league data. All pages are open; changes are disabled.</span></div><a class="button button--primary" href="/beta-apply">Apply for beta access</a>';
    main?.prepend(banner);
    protect();
    new MutationObserver(protect).observe(document.body,{childList:true,subtree:true});
  });
})();
