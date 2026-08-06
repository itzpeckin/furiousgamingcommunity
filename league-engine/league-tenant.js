(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before league-tenant.js.');

  const VERSION = '5.9.1.4';
  const REGISTRY_KEY = 'franchisehq.tenants.registry.v1';
  const ACTIVE_KEY = 'franchisehq.tenants.active.v1';
  const DEFAULT_LEAGUE = Object.freeze({
    id: 'lg_fgc_001',
    slug: 'furious-gaming-community',
    name: 'Furious Gaming Community',
    status: 'active',
    createdAt: '2026-08-06T00:00:00.000Z'
  });
  let registry = [];
  let activeLeagueId = null;
  const listeners = new Set();
  const clone = value => value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const freeze = value => Object.freeze(value);
  const slugify = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

  function persist(){
    try {
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
      localStorage.setItem(ACTIVE_KEY, activeLeagueId || '');
      return true;
    } catch (error) { console.warn('[leagueTenant] persistence unavailable', error); return false; }
  }
  function hydrate(){
    try {
      const saved = JSON.parse(localStorage.getItem(REGISTRY_KEY) || '[]');
      registry = Array.isArray(saved) ? saved : [];
      if (!registry.some(item => item.id === DEFAULT_LEAGUE.id)) registry.unshift(clone(DEFAULT_LEAGUE));
      activeLeagueId = localStorage.getItem(ACTIVE_KEY) || null;
    } catch (_) { registry = [clone(DEFAULT_LEAGUE)]; activeLeagueId = null; }
    if (!registry.some(item => item.id === activeLeagueId)) activeLeagueId = resolveRouteLeague()?.id || DEFAULT_LEAGUE.id;
    persist();
  }
  function resolveRouteSlug(pathname = location.pathname){
    const match = String(pathname || '').match(/\/leagues\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]).toLowerCase() : null;
  }
  function resolveRouteLeague(){
    const slug = resolveRouteSlug();
    return slug ? registry.find(item => item.slug === slug) || null : null;
  }
  function current(){ return clone(registry.find(item => item.id === activeLeagueId) || DEFAULT_LEAGUE); }
  function list(){ return freeze(registry.map(clone)); }
  function getById(id){ return clone(registry.find(item => item.id === id) || null); }
  function getBySlug(slug){ return clone(registry.find(item => item.slug === slugify(slug)) || null); }
  function register(input = {}){
    const slug = slugify(input.slug || input.name);
    if (!slug) throw new Error('League name or slug is required.');
    const existing = registry.find(item => item.slug === slug || item.id === input.id);
    if (existing) return clone(existing);
    const league = freeze({
      id: input.id || `lg_${crypto?.randomUUID?.() || Date.now()}`,
      slug,
      name: String(input.name || slug).trim(),
      status: input.status || 'active',
      createdAt: input.createdAt || new Date().toISOString()
    });
    registry = [...registry, league]; persist(); publish('league-registered', league); return clone(league);
  }
  function setActive(identifier, options = {}){
    const league = registry.find(item => item.id === identifier || item.slug === slugify(identifier));
    if (!league) throw new Error(`Unknown league: ${identifier}`);
    const previous = current();
    activeLeagueId = league.id; persist();
    if (options.updateRoute === true && history?.pushState) history.pushState({},'',`/leagues/${league.slug}${location.hash || '#home'}`);
    publish('league-activated', league, { previousLeagueId: previous.id });
    return clone(league);
  }
  function scopedKey(base, leagueId = current().id){
    const safe = String(base || '').trim();
    if (!safe) throw new Error('A storage key base is required.');
    return `${safe}.league.${leagueId}`;
  }
  function apiPath(resource = ''){
    const suffix = String(resource || '').replace(/^\/+/, '');
    return `/api/leagues/${current().slug}${suffix ? `/${suffix}` : ''}`;
  }
  function publicPath(route = ''){
    const suffix = String(route || '').replace(/^\/+/, '');
    return `/leagues/${current().slug}${suffix ? `/${suffix}` : ''}`;
  }
  function exportEndpoint(){ return apiPath('companion/export'); }
  function publish(type, league, extra = {}){
    const payload = freeze({ type, league: clone(league), timestamp: new Date().toISOString(), ...clone(extra) });
    listeners.forEach(fn => { try { fn(payload); } catch(error){ console.error('[leagueTenant] listener failed', error); } });
    HQ.events?.emit?.('league:tenant-changed', payload, { source: 'leagueTenant' });
    window.dispatchEvent(new CustomEvent('franchisehq:league-tenant-changed',{detail:payload}));
    return payload;
  }
  function subscribe(listener, options = {}){
    if (typeof listener !== 'function') throw new TypeError('Tenant listener must be a function.');
    listeners.add(listener); if (options.immediate) listener(freeze({type:'league-ready',league:current(),timestamp:new Date().toISOString()}));
    return () => listeners.delete(listener);
  }
  function diagnostics(){ return freeze({service:'leagueTenant',version:VERSION,currentLeague:current(),leagueCount:registry.length,routeSlug:resolveRouteSlug(),rootBackwardCompatibility:true,leagueScopedStorage:true,dynamicLeagueRoutes:true,exportEndpointTemplate:'/api/leagues/:leagueSlug/companion/export'}); }

  hydrate();
  const routeLeague = resolveRouteLeague();
  if (routeLeague && routeLeague.id !== activeLeagueId) { activeLeagueId = routeLeague.id; persist(); }

  HQ.defineModuleService('league','leagueTenant',{DEFAULT_LEAGUE,current,list,getById,getBySlug,register,setActive,scopedKey,apiPath,publicPath,exportEndpoint,resolveRouteSlug,subscribe,diagnostics},{replace:true,alias:'leagueTenant'});
  HQ.manifest?.register?.({scope:'module',module:'league',id:'league-tenant',service:'leagueTenant',script:'league-engine/league-tenant.js',version:VERSION,dependencies:[],capabilities:['league-registry','stable-league-id','unique-league-slug','root-route-backward-compatibility','league-scoped-storage-keys','dynamic-api-paths']});
})();
