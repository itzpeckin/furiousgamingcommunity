(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) {
    throw new Error('FranchiseHQ core must load before platform/store.js.');
  }

  const memory = new Map();
  const listeners = new Map();
  let transactionDepth = 0;
  const pendingChanges = new Map();

  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch {}
    }
    try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
  }

  function emit(key, value, previousValue, source = 'store') {
    const detail = Object.freeze({
      key,
      value: clone(value),
      previousValue: clone(previousValue),
      source
    });

    if (transactionDepth > 0) {
      const existing = pendingChanges.get(key);
      pendingChanges.set(key, existing
        ? { ...detail, previousValue: existing.previousValue }
        : detail);
      return;
    }

    listeners.get(key)?.forEach((handler) => handler(detail));
    listeners.get('*')?.forEach((handler) => handler(detail));
    HQ.events?.emit?.('store:changed', detail);
  }

  function readStorage(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function writeStorage(key, value) {
    try {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn(`Unable to persist Franchise HQ store key "${key}".`, error);
      return false;
    }
  }

  function getString(key, fallback = null) {
    if (memory.has(key)) return memory.get(key);
    const value = readStorage(key);
    return value === null ? fallback : value;
  }

  function setString(key, value, options = {}) {
    const previousValue = getString(key, null);
    const normalized = value === null || value === undefined ? null : String(value);
    memory.delete(key);
    writeStorage(key, normalized);
    if (options.silent !== true && previousValue !== normalized) {
      emit(key, normalized, previousValue, options.source || 'persistent-string');
    }
    return normalized;
  }

  function getJSON(key, fallback = null) {
    const raw = getString(key, null);
    if (raw === null) return clone(fallback);
    try { return JSON.parse(raw); } catch { return clone(fallback); }
  }

  function setJSON(key, value, options = {}) {
    const previousValue = getJSON(key, undefined);
    const serialized = value === undefined ? null : JSON.stringify(value);
    memory.delete(key);
    writeStorage(key, serialized);
    if (options.silent !== true) {
      emit(key, value, previousValue, options.source || 'persistent-json');
    }
    return value;
  }

  function getMemory(key, fallback = null) {
    return memory.has(key) ? clone(memory.get(key)) : clone(fallback);
  }

  function setMemory(key, value, options = {}) {
    const previousValue = getMemory(key, undefined);
    memory.set(key, clone(value));
    if (options.silent !== true) {
      emit(key, value, previousValue, options.source || 'memory');
    }
    return value;
  }

  function updateJSON(key, updater, fallback = {}, options = {}) {
    if (typeof updater !== 'function') {
      throw new TypeError('FranchiseHQ.store.updateJSON requires an updater function.');
    }
    const current = getJSON(key, fallback);
    const next = updater(clone(current));
    return setJSON(key, next === undefined ? current : next, options);
  }

  function remove(key, options = {}) {
    const previousValue = getJSON(key, getString(key, null));
    memory.delete(key);
    writeStorage(key, null);
    if (options.silent !== true) {
      emit(key, null, previousValue, options.source || 'remove');
    }
  }

  function has(key) {
    return memory.has(key) || readStorage(key) !== null;
  }

  function subscribe(key, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('FranchiseHQ.store.subscribe requires a handler.');
    }
    const normalized = key || '*';
    const bucket = listeners.get(normalized) || new Set();
    bucket.add(handler);
    listeners.set(normalized, bucket);
    return () => {
      bucket.delete(handler);
      if (!bucket.size) listeners.delete(normalized);
    };
  }

  function transaction(callback, options = {}) {
    if (typeof callback !== 'function') {
      throw new TypeError('FranchiseHQ.store.transaction requires a callback.');
    }
    transactionDepth += 1;
    try {
      return callback(service);
    } finally {
      transactionDepth -= 1;
      if (transactionDepth === 0 && pendingChanges.size) {
        const changes = [...pendingChanges.values()];
        pendingChanges.clear();
        changes.forEach((detail) => emit(
          detail.key,
          detail.value,
          detail.previousValue,
          options.source || detail.source || 'transaction'
        ));
        HQ.events?.emit?.('store:transaction', Object.freeze({ changes }));
      }
    }
  }

  function leagueKey(key, leagueId = HQ.league?.getActive?.()?.id || 'global') {
    return `franchisehq:league:${leagueId}:${key}`;
  }

  function clearFranchiseHQ(options = {}) {
    const prefixes = options.prefixes || ['fgc-', 'm1b-', 'franchisehq-','franchisehq:'];
    let removed = 0;
    try {
      Object.keys(localStorage).forEach((key) => {
        if (prefixes.some((prefix) => key.startsWith(prefix))) {
          localStorage.removeItem(key);
          removed += 1;
        }
      });
    } catch (error) {
      console.warn('Unable to clear Franchise HQ browser data.', error);
    }
    memory.clear();
    HQ.events?.emit?.('store:cleared', { removed, source: options.source || 'store' });
    return removed;
  }

  function snapshot(keys = []) {
    const selected = Array.isArray(keys) ? keys : [keys];
    return Object.freeze(Object.fromEntries(selected.map((key) => [key, getJSON(key, getString(key, null))])));
  }

  const service = {
    getString,
    setString,
    getJSON,
    setJSON,
    updateJSON,
    getMemory,
    setMemory,
    remove,
    has,
    subscribe,
    transaction,
    leagueKey,
    clearFranchiseHQ,
    snapshot,
    storage: Object.freeze({ getString, setString, getJSON, setJSON, remove, has })
  };

  HQ.defineService('store', service);
})();
