(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) {
    throw new Error('platform/core.js must load before platform/navigation.js.');
  }

  const routes = new Map();
  let started = false;
  let lastRoute = null;

  const DEFAULT_ROUTES = [
    ['home', { label: 'League Home' }],
    ['league-activity', { label: 'League Activity' }],
    ['teams', { label: 'Teams' }],
    ['my-team', { label: 'My Team' }],
    ['players', { label: 'Players' }],
    ['standings', { label: 'Standings' }],
    ['stats', { label: 'Stats' }],
    ['schedule', { label: 'Schedule' }],
    ['news', { label: 'News' }],
    ['trade-center', { label: 'Trade Center' }],
    ['trade-block', { label: 'Trade Block' }],
    ['commissioner', {
      label: 'Commissioner HQ',
      permission: 'openCommissionerHQ',
      fallback: 'home'
    }],
    ['design-system', { label: 'Design System' }]
  ];

  function normalizeRoute(route) {
    return String(route || 'home')
      .trim()
      .replace(/^#\/?/, '')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '') || 'home';
  }

  function splitRoute(route) {
    const normalized = normalizeRoute(route);
    const [base, ...segments] = normalized.split('/');
    return {
      route: normalized,
      base: base || 'home',
      segments,
      id: segments[0] || null
    };
  }

  function currentRoute() {
    return normalizeRoute(window.location.hash);
  }

  function registerRoute(name, definition = {}) {
    const key = splitRoute(name).base;
    const existing = routes.get(key) || {};
    routes.set(key, Object.freeze({ ...existing, ...definition, name: key }));
    return routes.get(key);
  }

  function getRoute(name) {
    return routes.get(splitRoute(name).base) || null;
  }

  function listRoutes() {
    return Array.from(routes.values());
  }

  function accessState(route) {
    const definition = getRoute(route);
    if (!definition?.permission) return true;

    const permissions = HQ.permissions;
    const auth = HQ.auth;
    const checkerName = `can${definition.permission.charAt(0).toUpperCase()}${definition.permission.slice(1)}`;
    const checker = permissions?.[checkerName];

    if (!auth?.getSnapshot || typeof checker !== 'function') return null;
    const snapshot = auth.getSnapshot();
    if (snapshot?.status === 'loading') return null;
    return checker.call(permissions) === true;
  }

  function emit(name, detail) {
    if (HQ.events?.emit) {
      HQ.events.emit(name, detail);
      return;
    }
    window.dispatchEvent(new CustomEvent(`franchisehq:${name}`, { detail }));
  }

  function render(route, options = {}) {
    const target = normalizeRoute(route);
    if (typeof window.FGC_APP?.renderRoute === 'function') {
      window.FGC_APP.renderRoute(target);
    }
    if (options.emit !== false) {
      emit('navigation-rendered', {
        current: target,
        source: options.source || 'platform'
      });
    }
    return target;
  }

  function go(route, options = {}) {
    let target = normalizeRoute(route);
    const previous = currentRoute();
    const definition = getRoute(target);
    const access = accessState(target);

    if (access === false) {
      const deniedTarget = target;
      target = normalizeRoute(definition?.fallback || options.fallback || 'home');
      emit('navigation-denied', {
        requested: deniedTarget,
        fallback: target,
        permission: definition?.permission || null,
        source: options.source || 'platform'
      });
    }

    const hash = `#${target}`;
    if (window.location.hash === hash) {
      render(target, { source: options.source || 'platform' });
    } else if (options.replace === true) {
      window.history.replaceState(null, '', hash);
      handleHashChange({ source: options.source || 'platform', replaced: true });
    } else {
      window.location.hash = target;
    }

    return target;
  }

  function replace(route, options = {}) {
    return go(route, { ...options, replace: true });
  }

  function refresh(options = {}) {
    return render(currentRoute(), {
      source: options.source || 'refresh'
    });
  }

  function back() {
    window.history.back();
  }

  function forward() {
    window.history.forward();
  }

  function handleHashChange(event = {}) {
    const current = currentRoute();
    const previous = lastRoute;
    lastRoute = current;

    render(current, {
      source: event.source || 'hashchange',
      emit: false
    });

    emit('navigation-changed', {
      previous,
      current,
      source: event.source || 'hashchange',
      replaced: event.replaced === true
    });

    return current;
  }

  function start(options = {}) {
    if (started) return currentRoute();
    started = true;
    lastRoute = currentRoute();
    window.addEventListener('hashchange', handleHashChange);

    if (options.renderInitial !== false) {
      render(lastRoute, { source: 'startup' });
    }

    emit('navigation-ready', {
      current: lastRoute,
      routes: listRoutes().map(route => route.name)
    });

    return lastRoute;
  }

  function stop() {
    if (!started) return;
    window.removeEventListener('hashchange', handleHashChange);
    started = false;
  }

  DEFAULT_ROUTES.forEach(([name, definition]) => registerRoute(name, definition));

  HQ.defineService('navigation', {
    normalizeRoute,
    splitRoute,
    currentRoute,
    registerRoute,
    getRoute,
    listRoutes,
    accessState,
    go,
    replace,
    refresh,
    back,
    forward,
    start,
    stop,
    isStarted: () => started
  });
})();
