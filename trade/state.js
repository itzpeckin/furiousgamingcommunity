(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before trade/state.js.');

  const state = {
    initialized: false,
    activeNegotiationId: null,
    activeTradeId: null,
    builderOpen: false,
    currentView: null,
    filters: Object.create(null),
    lastRenderAt: null
  };

  function snapshot() {
    return Object.freeze({
      initialized: state.initialized,
      activeNegotiationId: state.activeNegotiationId,
      activeTradeId: state.activeTradeId,
      builderOpen: state.builderOpen,
      currentView: state.currentView,
      filters: Object.freeze({ ...state.filters }),
      lastRenderAt: state.lastRenderAt
    });
  }

  function patch(next = {}, source = 'trade-state') {
    Object.assign(state, next || {});
    HQ.events?.emit?.('trade-state-changed', { source, state: snapshot() });
    return snapshot();
  }

  function setFilter(name, value, source = 'trade-filter') {
    state.filters[String(name)] = value;
    return patch({}, source);
  }

  function reset(source = 'trade-state-reset') {
    state.activeNegotiationId = null;
    state.activeTradeId = null;
    state.builderOpen = false;
    state.currentView = null;
    state.filters = Object.create(null);
    state.lastRenderAt = null;
    return patch({}, source);
  }

  HQ.defineService('trade.state', {
    snapshot,
    patch,
    setFilter,
    reset
  });
})();
