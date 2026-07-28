(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before trade/service.js.');

  let legacy = null;

  function attachLegacy(adapter) {
    if (!adapter || typeof adapter !== 'object') throw new TypeError('A legacy Trade Center adapter is required.');
    legacy = adapter;
    HQ.getService?.('trade.diagnostics')?.connectLegacyAdapter?.();
    HQ.getService?.('trade.state')?.patch?.({ initialized: true }, 'trade-legacy-attached');
    HQ.getService?.('trade.diagnostics')?.markInitialized?.({ legacyAdapterConnected: true });
    HQ.getService?.('trade.events')?.emit?.('trade-platform-ready', { version: '4.13' });
    return service;
  }

  function invoke(method, ...args) {
    const fn = legacy?.[method];
    if (typeof fn !== 'function') return undefined;
    const isRender = method.startsWith('render');
    const route = (location.hash.slice(1) || 'home').split('/')[0];
    const started = performance.now();
    if (isRender) HQ.getService?.('trade.events')?.emit?.('trade-before-render', { method, route });
    const result = fn(...args);
    if (isRender) {
      const durationMs = Math.round((performance.now() - started) * 100) / 100;
      HQ.getService?.('trade.state')?.patch?.({ currentView: route, lastRenderAt: new Date().toISOString() }, 'trade-render');
      HQ.getService?.('trade.diagnostics')?.markRender?.({ route, durationMs });
      HQ.getService?.('trade.events')?.emit?.('trade-after-render', { method, route, durationMs });
    }
    return result;
  }

  function renderTradeCenter(...args) { return invoke('renderTradeCenter', ...args); }
  function renderTradeBlock(...args) { return invoke('renderTradeBlock', ...args); }
  function renderCommissioner(...args) { return invoke('renderCommissioner', ...args); }

  function diagnostics() {
    return HQ.getService?.('trade.diagnostics')?.snapshot?.() || {
      initialized: Boolean(legacy),
      moduleVersion: '4.13'
    };
  }

  const service = {
    attachLegacy,
    invoke,
    renderTradeCenter,
    renderTradeBlock,
    renderCommissioner,
    diagnostics,
    get state() { return HQ.getService?.('trade.state'); },
    get events() { return HQ.getService?.('trade.events'); },
    get negotiations() { return HQ.getService?.('trade.negotiations'); },
    get legacyConnected() { return Boolean(legacy); }
  };

  HQ.defineService('trade', service, { freeze: false });
})();
