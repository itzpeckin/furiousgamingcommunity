(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before league-tenant.js.');

  const VERSION = '6.1.0a';
  const REGISTRY_KEY = 'franchisehq.tenants.registry.v2';
  const ACTIVE_KEY = 'franchisehq.tenants.active.v2';
  const FGC_ALIASES = Object.freeze(['furious-gaming-community']);
  const DEFAULT_LEAGUE = Object.freeze({
    id: 'franchise-hq-primary',
    slug: 'furiousgamingcommunity',
    aliases: FGC_ALIASES,
    name: 'Furious Gaming Community',
    status: 'active',
    canonicalPath: '/leagues/furiousgamingcommunity',
    createdAt: '2026-08-06T00:00:00.000Z'
  });
  let registry = [];
  let activeLeagueId = null;
  const listeners = new Set();
  const clone = value => value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const freeze = value => Object.freeze(value);
  const slugify = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const canonicalSlug = value => {
    const slug = slugify(value);
    return FGC_ALIASES.includes(slug) ? DEFAULT_LEAGUE.slug : slug;
  };

  function normalizeLeague(input={}){
    const slug=canonicalSlug(input.slug||input.name);
    const aliases=[...new Set([...(input.aliases||[]),...(slug===DEFAULT_LEAGUE.slug?FGC_ALIASES:[])].map(slugify).filter(Boolean))];
    return freeze({
      id:input.id||`route:${slug}`,
      slug,
      aliases,
      name:String(input.name||slug||'Unknown League').trim(),
      status:input.status||'active',
      canonicalPath:`/leagues/${slug}`,
      createdAt:input.createdAt||null,
      dataState:input.dataState||null,
      counts:input.counts||null,
      serverResolved:input.serverResolved===true
    });
  }

  function persist(){
    try { localStorage.setItem(REGISTRY_KEY,JSON.stringify(registry)); localStorage.setItem(ACTIVE_KEY,activeLeagueId||''); return true; }
    catch(error){ console.warn('[leagueTenant] persistence unavailable',error); return false; }
  }
  function routeRawSlug(pathname=location.pathname){
    const match=String(pathname||'').match(/\/leagues\/([^/?#]+)/i);
    return match?slugify(decodeURIComponent(match[1])):null;
  }
  function resolveRouteSlug(pathname=location.pathname){ return canonicalSlug(routeRawSlug(pathname)); }
  function findBySlug(slug){
    const wanted=canonicalSlug(slug);
    return registry.find(item=>item.slug===wanted||(item.aliases||[]).includes(slugify(slug)))||null;
  }
  function routePlaceholder(slug){
    return normalizeLeague({id:`route:${slug}`,slug,name:slug,status:'resolving',dataState:'empty',counts:{teams:0,players:0,games:0,statistics:0,standings:0}});
  }
  function hydrate(){
    try {
      const saved=JSON.parse(localStorage.getItem(REGISTRY_KEY)||'[]');
      registry=(Array.isArray(saved)?saved:[]).map(normalizeLeague).filter(item=>item.slug!==DEFAULT_LEAGUE.slug);
    }catch{registry=[]}
    registry.unshift(normalizeLeague({...DEFAULT_LEAGUE,serverResolved:true}));
    const savedActive=localStorage.getItem(ACTIVE_KEY)||null;
    activeLeagueId=registry.some(item=>item.id===savedActive)?savedActive:DEFAULT_LEAGUE.id;
    persist();
  }
  function resolveRouteLeague(){ const slug=resolveRouteSlug(); return slug?findBySlug(slug):null; }
  function current(){
    const routeSlug=resolveRouteSlug();
    if(routeSlug){ return clone(findBySlug(routeSlug)||routePlaceholder(routeSlug)); }
    return clone(registry.find(item=>item.id===activeLeagueId)||normalizeLeague(DEFAULT_LEAGUE));
  }
  function list(){return freeze(registry.map(clone));}
  function getById(id){return clone(registry.find(item=>item.id===id)||null);}
  function getBySlug(slug){return clone(findBySlug(slug));}
  function register(input={}){
    const league=normalizeLeague(input);
    if(!league.slug)throw new Error('League name or slug is required.');
    const index=registry.findIndex(item=>item.id===league.id||item.slug===league.slug);
    if(index>=0)registry=[...registry.slice(0,index),league,...registry.slice(index+1)];
    else registry=[...registry,league];
    activeLeagueId=league.id; persist(); publish('league-registered',league); return clone(league);
  }
  function setActive(identifier,options={}){
    const league=registry.find(item=>item.id===identifier||item.slug===canonicalSlug(identifier));
    if(!league)throw new Error(`Unknown league: ${identifier}`);
    const previous=current(); activeLeagueId=league.id; persist();
    if(options.updateRoute===true&&history?.pushState)history.pushState({},'',`/leagues/${league.slug}${location.hash||'#home'}`);
    publish('league-activated',league,{previousLeagueId:previous.id}); return clone(league);
  }
  function scopedKey(base,leagueId=current().id||current().slug){
    const safe=String(base||'').trim(); if(!safe)throw new Error('A storage key base is required.');
    return `${safe}.league.${leagueId}`;
  }
  function apiPath(resource=''){const suffix=String(resource||'').replace(/^\/+/, '');return `/api/leagues/${current().slug}${suffix?`/${suffix}`:''}`;}
  function publicPath(route=''){const suffix=String(route||'').replace(/^\/+/, '');return `/leagues/${current().slug}${suffix?`/${suffix}`:''}`;}
  function exportEndpoint(){return apiPath('companion/export');}
  function publish(type,league,extra={}){
    const payload=freeze({type,league:clone(league),timestamp:new Date().toISOString(),...clone(extra)});
    listeners.forEach(fn=>{try{fn(payload)}catch(error){console.error('[leagueTenant] listener failed',error)}});
    HQ.events?.emit?.('league:tenant-changed',payload,{source:'leagueTenant'});
    window.dispatchEvent(new CustomEvent('franchisehq:league-tenant-changed',{detail:payload})); return payload;
  }
  function subscribe(listener,options={}){if(typeof listener!=='function')throw new TypeError('Tenant listener must be a function.');listeners.add(listener);if(options.immediate)listener(freeze({type:'league-ready',league:current(),timestamp:new Date().toISOString()}));return()=>listeners.delete(listener);}

  async function hydrateRouteLeague(){
    const routeSlug=resolveRouteSlug(); if(!routeSlug)return current();
    try{
      const response=await fetch(`/api/leagues/${encodeURIComponent(routeSlug)}`,{credentials:'same-origin',cache:'no-store'});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok||!payload?.tenant){publish('league-unavailable',routePlaceholder(routeSlug),{http:response.status});return current();}
      const tenant=payload.tenant;
      const league=normalizeLeague({id:tenant.id,slug:tenant.slug,name:tenant.name,status:tenant.status,createdAt:tenant.createdAt,dataState:tenant.dataState,counts:tenant.counts,serverResolved:true});
      const before=current(); register(league); activeLeagueId=league.id; persist();
      if(routeRawSlug()!==league.slug&&history?.replaceState)history.replaceState({},'',`${league.canonicalPath}${location.search||''}${location.hash||''}`);
      publish('league-resolved',league,{previousLeagueId:before.id}); return clone(league);
    }catch(error){console.warn('[leagueTenant] server resolution failed',error);return current();}
  }

  function diagnostics(){return freeze({service:'leagueTenant',version:VERSION,currentLeague:current(),leagueCount:registry.length,routeSlug:resolveRouteSlug(),rootCanonicalPath:DEFAULT_LEAGUE.canonicalPath,leagueScopedStorage:true,dynamicLeagueRoutes:true,serverTenantResolution:true,crossTenantFallback:false,exportEndpointTemplate:'/api/leagues/:leagueSlug/companion/export'});}

  hydrate();
  if((location.pathname==='/'||location.pathname==='/index.html')&&history?.replaceState){history.replaceState({},'',`${DEFAULT_LEAGUE.canonicalPath}${location.search||''}${location.hash||''}`);}
  const routeLeague=resolveRouteLeague(); if(routeLeague)activeLeagueId=routeLeague.id;

  const service={DEFAULT_LEAGUE,current,getCurrentLeague:current,list,getById,getBySlug,register,setActive,scopedKey,apiPath,publicPath,exportEndpoint,resolveRouteSlug,hydrateRouteLeague,subscribe,diagnostics};
  HQ.defineModuleService('league','leagueTenant',service,{replace:true,alias:'leagueTenant'});
  HQ.manifest?.register?.({scope:'module',module:'league',id:'league-tenant',service:'leagueTenant',script:'league-engine/league-tenant.js',version:VERSION,dependencies:[],capabilities:['server-backed-tenant-resolution','stable-league-id','unique-league-slug','canonical-league-route','league-scoped-storage-keys','dynamic-api-paths','no-cross-tenant-fallback']});
  hydrateRouteLeague().catch(()=>{});
})();
