(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) {
    throw new Error('platform/core.js must load before platform/events.js.');
  }

  const target = new EventTarget();
  const subscriptions = new Map();
  const byEvent = new Map();
  const history = [];
  const MAX_HISTORY = 100;

  function normalizeName(name) {
    let value = String(name || '').trim().replace(/^franchisehq:/, '');
    if (!value) throw new TypeError('An event name is required.');
    // 4.15 accepts legacy namespace-action names and normalizes them to the
    // canonical namespace:action contract without breaking existing callers.
    if (!value.includes(':') && value.includes('-')) {
      const separator = value.indexOf('-');
      value = `${value.slice(0, separator)}:${value.slice(separator + 1)}`;
    }
    if (!/^[a-z][a-z0-9.-]*:[a-z][a-z0-9-]*$/.test(value)) {
      throw new TypeError(`Invalid Franchise HQ event name "${value}". Use namespace:past-tense-action.`);
    }
    return `franchisehq:${value}`;
  }

  function metadata(name, detail, options = {}) {
    return Object.freeze({
      id: options.id || (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      name: name.replace(/^franchisehq:/, ''),
      source: options.source || 'unknown',
      timestamp: new Date().toISOString(),
      correlationId: options.correlationId || null,
      detail
    });
  }

  function emit(name, detail = null, options = {}) {
    const originalName = String(name || '').trim().replace(/^franchisehq:/, '');
    const eventName = normalizeName(name);
    const payload = metadata(eventName, detail, options);
    const event = new CustomEvent(eventName, { detail });
    Object.defineProperty(event, 'franchiseHQ', { value: payload, enumerable: true });
    target.dispatchEvent(event);

    if (options.window !== false) {
      const windowEvent = new CustomEvent(eventName, { detail });
      Object.defineProperty(windowEvent, 'franchiseHQ', { value: payload, enumerable: true });
      window.dispatchEvent(windowEvent);

      // During the 4.15 migration, older application code still listens for
      // window events such as `franchisehq:auth-changed`. The canonical event
      // is now `franchisehq:auth:changed`, so dispatch the legacy alias as well
      // whenever a legacy hyphenated name was supplied by the caller.
      if (!originalName.includes(':') && originalName.includes('-')) {
        const legacyEventName = `franchisehq:${originalName}`;
        if (legacyEventName !== eventName) {
          const legacyWindowEvent = new CustomEvent(legacyEventName, { detail });
          Object.defineProperty(legacyWindowEvent, 'franchiseHQ', { value: payload, enumerable: true });
          window.dispatchEvent(legacyWindowEvent);
        }
      }
    }

    history.push(payload);
    if (history.length > MAX_HISTORY) history.shift();
    return payload;
  }

  function on(name, handler, options = {}) {
    if (typeof handler !== 'function') {
      throw new TypeError('FranchiseHQ.events.on requires a handler function.');
    }

    const eventName = normalizeName(name);
    const bucket = byEvent.get(eventName) || new Map();
    if (options.preventDuplicate !== false && bucket.has(handler)) {
      return bucket.get(handler).unsubscribe;
    }

    let token;
    const wrapped = (event) => {
      try { handler(event, event.franchiseHQ); }
      catch (error) { console.error(`[FranchiseHQ.events] ${eventName}`, error); }
      finally { if (options.once === true && token) off(token); }
    };

    target.addEventListener(eventName, wrapped);
    token = Symbol(eventName);
    const unsubscribe = () => off(token);
    const subscription = {
      token,
      eventName,
      handler,
      wrapped,
      once: options.once === true,
      owner: options.owner || 'anonymous',
      createdAt: new Date().toISOString(),
      unsubscribe
    };
    subscriptions.set(token, subscription);
    bucket.set(handler, subscription);
    byEvent.set(eventName, bucket);
    return unsubscribe;
  }

  function once(name, handler, options = {}) {
    return on(name, handler, { ...options, once: true });
  }

  function off(tokenOrName, handler) {
    if (typeof tokenOrName === 'symbol') {
      const subscription = subscriptions.get(tokenOrName);
      if (!subscription) return false;
      target.removeEventListener(subscription.eventName, subscription.wrapped);
      subscriptions.delete(tokenOrName);
      const bucket = byEvent.get(subscription.eventName);
      bucket?.delete(subscription.handler);
      if (bucket && !bucket.size) byEvent.delete(subscription.eventName);
      return true;
    }

    const eventName = normalizeName(tokenOrName);
    if (typeof handler !== 'function') return false;
    const subscription = byEvent.get(eventName)?.get(handler);
    return subscription ? off(subscription.token) : false;
  }

  function cleanupOwner(owner) {
    const normalized = String(owner || '').trim();
    let removed = 0;
    [...subscriptions.values()].forEach((subscription) => {
      if (subscription.owner === normalized && off(subscription.token)) removed += 1;
    });
    return removed;
  }

  function fromWindow(name, handler, options = {}) {
    const eventName = normalizeName(name);
    window.addEventListener(eventName, handler, options);
    return () => window.removeEventListener(eventName, handler, options);
  }

  function diagnostics() {
    const eventCounts = {};
    byEvent.forEach((bucket, eventName) => {
      eventCounts[eventName.replace(/^franchisehq:/, '')] = bucket.size;
    });
    const ownerCounts = {};
    subscriptions.forEach((subscription) => {
      ownerCounts[subscription.owner] = (ownerCounts[subscription.owner] || 0) + 1;
    });
    return Object.freeze({
      service: 'events',
      activeSubscriptionCount: subscriptions.size,
      subscriptionsByEvent: Object.freeze(eventCounts),
      subscriptionsByOwner: Object.freeze(ownerCounts),
      recentEvents: Object.freeze(history.slice(-10)),
      duplicatePrevention: true,
      cleanupByOwner: true
    });
  }

  HQ.defineService('events', {
    emit,
    on,
    once,
    off,
    cleanupOwner,
    fromWindow,
    normalizeName,
    diagnostics
  });
})();
