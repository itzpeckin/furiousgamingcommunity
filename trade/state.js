(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before trade/state.js.');
  if (!HQ.state?.register) throw new Error('platform/state.js must load before trade/state.js.');

  const namespace = HQ.state.register('trade', {
    owner: 'featureModules.trade',
    defaults: {
      initialized: false,
      activeNegotiationId: null,
      activeTradeId: null,
      builderOpen: false,
      currentView: null,
      filters: {},
      lastRenderAt: null
    },
    resetOn: ['league-changed', 'identity-changed', 'session-ended']
  });

  function snapshot() {
    const state = namespace.snapshot();
    return Object.freeze({
      ...state,
      filters: Object.freeze({ ...(state.filters || {}) })
    });
  }

  function patch(next = {}, source = 'trade.state') {
    return namespace.patch(next || {}, { source });
  }

  function setFilter(name, value, source = 'trade.filter') {
    const state = namespace.snapshot();
    return namespace.patch({
      filters: { ...(state.filters || {}), [String(name)]: value }
    }, { source });
  }

  function reset(source = 'trade.state.reset') {
    return namespace.reset({ source });
  }

  function subscribe(handler, options = {}) {
    return namespace.subscribe(handler, options);
  }

  HQ.defineService('trade.state', {
    snapshot,
    patch,
    setFilter,
    reset,
    subscribe,
    metadata: namespace.metadata
  });
})();
