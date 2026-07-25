(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) {
    throw new Error('platform/core.js must load before platform/events.js.');
  }

  const target = new EventTarget();
  const subscriptions = new Map();

  function normalizeName(name) {
    const value = String(name || '').trim();
    if (!value) throw new TypeError('An event name is required.');
    return value.startsWith('franchisehq:') ? value : `franchisehq:${value}`;
  }

  function emit(name, detail = null, options = {}) {
    const eventName = normalizeName(name);
    const event = new CustomEvent(eventName, { detail });
    target.dispatchEvent(event);

    if (options.window !== false) {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
    }

    return event;
  }

  function on(name, handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new TypeError('FranchiseHQ.events.on requires a handler function.');
    }

    const eventName = normalizeName(name);
    target.addEventListener(eventName, handler, options);

    const token = Symbol(eventName);
    subscriptions.set(token, { eventName, handler, options });
    return () => off(token);
  }

  function once(name, handler) {
    return on(name, handler, { once: true });
  }

  function off(tokenOrName, handler) {
    if (typeof tokenOrName === 'symbol') {
      const subscription = subscriptions.get(tokenOrName);
      if (!subscription) return false;
      target.removeEventListener(
        subscription.eventName,
        subscription.handler,
        subscription.options
      );
      subscriptions.delete(tokenOrName);
      return true;
    }

    const eventName = normalizeName(tokenOrName);
    if (typeof handler !== 'function') return false;
    target.removeEventListener(eventName, handler);
    return true;
  }

  function fromWindow(name, handler, options = {}) {
    const eventName = normalizeName(name);
    window.addEventListener(eventName, handler, options);
    return () => window.removeEventListener(eventName, handler, options);
  }

  HQ.defineService('events', {
    emit,
    on,
    once,
    off,
    fromWindow,
    normalizeName
  });
})();
