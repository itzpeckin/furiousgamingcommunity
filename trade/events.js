(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before trade/events.js.');

  const listeners = new Map();

  function on(name, handler) {
    if (typeof handler !== 'function') throw new TypeError('Trade event handler must be a function.');
    const key = String(name);
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(handler);
    return () => off(key, handler);
  }

  function off(name, handler) {
    listeners.get(String(name))?.delete(handler);
  }

  function emit(name, detail = {}) {
    const key = String(name);
    const payload = Object.freeze({ ...detail, name: key, timestamp: new Date().toISOString() });
    listeners.get(key)?.forEach((handler) => {
      try { handler(payload); } catch (error) { console.error(`[FranchiseHQ.trade.events] ${key}`, error); }
    });
    HQ.events?.emit?.(key, payload);
    return payload;
  }

  HQ.defineService('trade.events', { on, off, emit });
})();
