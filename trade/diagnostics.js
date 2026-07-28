(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before trade/diagnostics.js.');

  const metrics = {
    initialized: false,
    renderCount: 0,
    lastTradeContextRoute: null,
    lastRenderDurationMs: null,
    lastRenderAt: null,
    legacyAdapterConnected: false
  };

  function markInitialized(detail = {}) {
    metrics.initialized = true;
    Object.assign(metrics, detail);
    return snapshot();
  }

  function markRender(detail = {}) {
    metrics.renderCount += 1;
    metrics.lastTradeContextRoute = detail.route || metrics.lastTradeContextRoute;
    metrics.lastRenderDurationMs = Number.isFinite(detail.durationMs) ? detail.durationMs : metrics.lastRenderDurationMs;
    metrics.lastRenderAt = new Date().toISOString();
    return snapshot();
  }

  function connectLegacyAdapter() {
    metrics.legacyAdapterConnected = true;
    return snapshot();
  }

  function currentApplicationRoute() {
    return HQ.getService?.('appRouter')?.diagnostics?.()?.lastRender?.route ||
      (location.hash.slice(1) || 'home').split('/')[0];
  }

  function snapshot() {
    const tradeState = HQ.getService?.('trade.state')?.snapshot?.() || null;
    return Object.freeze({
      ...metrics,
      // Deprecated compatibility alias. This is trade context, not the active app route.
      lastRenderRoute: metrics.lastTradeContextRoute,
      currentApplicationRoute: currentApplicationRoute(),
      moduleVersion: '4.13',
      activeNegotiationId: tradeState?.activeNegotiationId || null,
      activeTradeId: tradeState?.activeTradeId || null,
      builderOpen: Boolean(tradeState?.builderOpen)
    });
  }

  HQ.defineService('trade.diagnostics', {
    markInitialized,
    markRender,
    connectLegacyAdapter,
    snapshot
  });
})();
