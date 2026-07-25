(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) {
    throw new Error('platform/core.js must load before platform/navigation.js.');
  }

  function normalizeRoute(route) {
    return String(route || 'home').replace(/^#\/?/, '').replace(/^\//, '') || 'home';
  }

  function currentRoute() {
    return normalizeRoute(window.location.hash);
  }

  function go(route, options = {}) {
    const target = normalizeRoute(route);
    const previous = currentRoute();

    if (window.FGC_APP?.setRoute) {
      window.FGC_APP.setRoute(target);
    } else if (options.replace) {
      window.location.replace(`#${target}`);
    } else {
      window.location.hash = target;
    }

    HQ.events?.emit?.('navigation-changed', {
      previous,
      current: target,
      source: options.source || 'platform'
    });

    return target;
  }

  function refresh() {
    window.FGC_APP?.renderRoute?.();
  }

  HQ.defineService('navigation', {
    normalizeRoute,
    currentRoute,
    go,
    refresh
  });
})();
