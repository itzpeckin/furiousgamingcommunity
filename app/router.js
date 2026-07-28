(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before app/router.js.');

  let renderer = null;
  let titleResolver = null;
  let afterRender = null;
  let lastRender = null;

  function normalize(route) {
    return HQ.navigation?.normalizeRoute?.(route) || String(route || 'home').replace(/^#\/?/, '').replace(/^\/+/, '') || 'home';
  }

  function configure(options = {}) {
    if (typeof options.renderer === 'function') renderer = options.renderer;
    if (typeof options.titleResolver === 'function') titleResolver = options.titleResolver;
    if (typeof options.afterRender === 'function') afterRender = options.afterRender;
    return diagnostics();
  }

  function render(route, options = {}) {
    const target = normalize(route);
    if (typeof renderer !== 'function') {
      return { route: target, rendered: false, reason: 'renderer-unavailable' };
    }

    const startedAt = performance.now();
    const result = renderer(target, options);
    const title = typeof titleResolver === 'function' ? titleResolver(target, result) : null;
    if (title) document.title = title;

    lastRender = Object.freeze({
      route: target,
      source: options.source || 'app-router',
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      timestamp: Date.now()
    });

    if (typeof afterRender === 'function') afterRender(target, lastRender);
    HQ.events?.emit?.('app-route-rendered', { ...lastRender });
    return { route: target, rendered: true, result, meta: lastRender };
  }

  function diagnostics() {
    return {
      configured: typeof renderer === 'function',
      hasTitleResolver: typeof titleResolver === 'function',
      hasAfterRender: typeof afterRender === 'function',
      lastRender
    };
  }

  HQ.defineService('appRouter', {
    configure,
    render,
    diagnostics
  });
})();
