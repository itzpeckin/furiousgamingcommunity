(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before league-tenant.js.');

  const VERSION = '7.2.0';
  const REGISTRY_KEY = 'franchisehq.tenants.registry.v3';
  const ACTIVE_KEY = 'franchisehq.tenants.active.v3';
  let registry = [];
  let activeLeagueId = null;
  const listeners = new Set();
  const clone = value => value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const freeze = value => Object.freeze(value);
  const slugify = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

  function normalizeLeague(input={}) {
    const slug = slugify(input.slug || input.name);
    if (!slug) return null;
    return freeze({
      id:input.id || `route:${slug}`,
      slug,
      name:String(input.name || slug).trim(),
      status:input.status || 'resolving',
      timezone:input.timezone || 'UTC',
      branding:freeze({...input.branding}),
      features:freeze({...input.features}),
      domains:freeze(Array.isArray(input.domains) ? input.domains.map(item=>freeze({...item})) : []),
      canonicalPath:`/leagues/${slug}`,
      createdAt:input.createdAt || null,
      dataState:input.dataState || null,
      counts:input.counts || null,
      serverResolved:input.serverResolved === true
    });
  }

  function persist() {
    try {
      localStorage.setItem(REGISTRY_KEY,JSON.stringify(registry.filter(item=>item.serverResolved)));
      localStorage.setItem(ACTIVE_KEY,activeLeagueId || '');
      return true;
    } catch(error) {
      console.warn('[leagueTenant] UI preference persistence unavailable',error);
      return false;
    }
  }

  function routeRawSlug(pathname=location.pathname) {
    const match=String(pathname||'').match(/\/leagues\/([^/?#]+)/i);
    return match ? slugify(decodeURIComponent(match[1])) : null;
  }
  function resolveRouteSlug(pathname=location.pathname) { return routeRawSlug(pathname); }
  function findBySlug(slug) {
    const wanted=slugify(slug);
    return registry.find(item=>item.slug===wanted) || null;
  }
  function routePlaceholder(slug) {
    return normalizeLeague({
      id:`route:${slug}`,slug,name:slug,status:'resolving',dataState:'empty',
      counts:{teams:0,players:0,games:0,statistics:0,standings:0}
    });
  }
  function hydrate() {
    try {
      const saved=JSON.parse(localStorage.getItem(REGISTRY_KEY)||'[]');
      registry=(Array.isArray(saved)?saved:[]).map(normalizeLeague).filter(Boolean);
    } catch { registry=[]; }
    const savedActive=localStorage.getItem(ACTIVE_KEY)||null;
    activeLeagueId=registry.some(item=>item.id===savedActive) ? savedActive : null;
  }
  function current() {
    const routeSlug=resolveRouteSlug();
    if(routeSlug) return clone(findBySlug(routeSlug)||routePlaceholder(routeSlug));
    return clone(registry.find(item=>item.id===activeLeagueId)||null);
  }
  function list(){return freeze(registry.map(clone));}
  function getById(id){return clone(registry.find(item=>item.id===id)||null);}
  function getBySlug(slug){return clone(findBySlug(slug));}
  function register(input={}) {
    const league=normalizeLeague(input);
    if(!league?.serverResolved)throw new Error('Only a server-resolved tenant can be registered.');
    const index=registry.findIndex(item=>item.id===league.id||item.slug===league.slug);
    if(index>=0)registry=[...registry.slice(0,index),league,...registry.slice(index+1)];
    else registry=[...registry,league];
    activeLeagueId=league.id;
    persist();
    publish('league-registered',league);
    return clone(league);
  }
  function setActive(identifier,options={}) {
    const league=registry.find(item=>item.id===identifier||item.slug===slugify(identifier));
    if(!league?.serverResolved)throw new Error(`Unknown server tenant: ${identifier}`);
    const previous=current();
    activeLeagueId=league.id;
    persist();
    if(options.updateRoute===true&&history?.pushState)history.pushState({},'',`/leagues/${league.slug}${location.hash||'#home'}`);
    publish('league-activated',league,{previousLeagueId:previous?.id||null});
    return clone(league);
  }
  function scopedKey(base,leagueId=current()?.id||current()?.slug) {
    const safe=String(base||'').trim();
    if(!safe||!leagueId)throw new Error('A storage key base and tenant are required.');
    return `${safe}.tenant.${leagueId}`;
  }
  function apiPath(resource='') {
    const league=current();
    if(!league?.slug)throw new Error('A route tenant is required.');
    const suffix=String(resource||'').replace(/^\/+/, '');
    return `/api/leagues/${league.slug}${suffix?`/${suffix}`:''}`;
  }
  function publicPath(route='') {
    const league=current();
    if(!league?.slug)throw new Error('A route tenant is required.');
    const suffix=String(route||'').replace(/^\/+/, '');
    return `/leagues/${league.slug}${suffix?`/${suffix}`:''}`;
  }
  function exportEndpoint(){return apiPath('companion/export');}
  function publish(type,league,extra={}) {
    const payload=freeze({type,league:clone(league),timestamp:new Date().toISOString(),...clone(extra)});
    listeners.forEach(fn=>{try{fn(payload)}catch(error){console.error('[leagueTenant] listener failed',error)}});
    HQ.events?.emit?.('league:tenant-changed',payload,{source:'leagueTenant'});
    window.dispatchEvent(new CustomEvent('franchisehq:league-tenant-changed',{detail:payload}));
    return payload;
  }
  function subscribe(listener,options={}) {
    if(typeof listener!=='function')throw new TypeError('Tenant listener must be a function.');
    listeners.add(listener);
    if(options.immediate)listener(freeze({type:'league-ready',league:current(),timestamp:new Date().toISOString()}));
    return()=>listeners.delete(listener);
  }

  async function hydrateRouteLeague() {
    const routeSlug=resolveRouteSlug();
    if(!routeSlug)return current();
    try {
      const response=await fetch(`/api/leagues/${encodeURIComponent(routeSlug)}`,{credentials:'same-origin',cache:'no-store'});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.ok||!payload?.tenant){
        publish('league-unavailable',routePlaceholder(routeSlug),{http:response.status});
        return current();
      }
      const tenant=payload.tenant;
      const league=normalizeLeague({
        id:tenant.id,slug:tenant.slug,name:tenant.name,status:tenant.status,
        timezone:tenant.timezone,branding:tenant.branding,features:tenant.features,
        domains:tenant.domains,createdAt:tenant.createdAt,dataState:tenant.dataState,
        counts:tenant.counts,serverResolved:true
      });
      const before=current();
      register(league);
      activeLeagueId=league.id;
      persist();
      if(routeRawSlug()!==league.slug&&history?.replaceState)history.replaceState({},'',`${league.canonicalPath}${location.search||''}${location.hash||''}`);
      publish('league-resolved',league,{previousLeagueId:before?.id||null});
      return clone(league);
    } catch(error) {
      console.warn('[leagueTenant] server resolution failed',error);
      return current();
    }
  }

  function diagnostics(){return freeze({
    service:'leagueTenant',version:VERSION,currentLeague:current(),leagueCount:registry.length,
    routeSlug:resolveRouteSlug(),leagueScopedStorage:true,dynamicLeagueRoutes:true,
    serverTenantResolution:true,crossTenantFallback:false,hardCodedDefaultTenant:false,
    exportEndpointTemplate:'/api/leagues/:leagueSlug/companion/export'
  });}

  hydrate();
  const routeLeague=findBySlug(resolveRouteSlug());
  if(routeLeague)activeLeagueId=routeLeague.id;

  const service={current,getCurrentLeague:current,list,getById,getBySlug,register,setActive,scopedKey,apiPath,publicPath,exportEndpoint,resolveRouteSlug,hydrateRouteLeague,subscribe,diagnostics};
  HQ.defineModuleService('league','leagueTenant',service,{replace:true,alias:'leagueTenant'});
  HQ.manifest?.register?.({scope:'module',module:'league',id:'league-tenant',service:'leagueTenant',script:'league-engine/league-tenant.js',version:VERSION,dependencies:[],capabilities:['server-backed-tenant-resolution','stable-league-id','unique-league-slug','canonical-league-route','league-scoped-storage-keys','dynamic-api-paths','no-cross-tenant-fallback','no-hard-coded-default-tenant']});
  hydrateRouteLeague().catch(()=>{});
})();
