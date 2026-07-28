(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before platform/storage.js.');

  const PREFIX = 'franchisehq:';
  const SCHEMA_VERSION = 1;
  const stats = { reads: 0, writes: 0, removes: 0, expirations: 0, corruptions: 0 };

  function backend(session = false) {
    try {
      const target = session ? window.sessionStorage : window.localStorage;
      const probe = `${PREFIX}__probe__`;
      target.setItem(probe, '1');
      target.removeItem(probe);
      return target;
    } catch {
      return null;
    }
  }

  function keyFor(key) {
    const normalized = String(key || '').trim();
    if (!normalized) throw new TypeError('A storage key is required.');
    return `${PREFIX}${normalized}`;
  }

  function set(key, value, options = {}) {
    const target = backend(options.session === true);
    if (!target) return false;
    const ttlMs = Number(options.ttlMs || 0);
    const record = {
      schemaVersion: SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      expiresAt: ttlMs > 0 ? Date.now() + ttlMs : null,
      value
    };
    target.setItem(keyFor(key), JSON.stringify(record));
    stats.writes += 1;
    return true;
  }

  function get(key, fallback = null, options = {}) {
    const target = backend(options.session === true);
    if (!target) return fallback;
    stats.reads += 1;
    const storageKey = keyFor(key);
    const raw = target.getItem(storageKey);
    if (raw == null) return fallback;
    try {
      const record = JSON.parse(raw);
      if (!record || typeof record !== 'object' || !('value' in record)) throw new Error('Invalid storage record.');
      if (record.expiresAt && Date.now() >= Number(record.expiresAt)) {
        target.removeItem(storageKey);
        stats.expirations += 1;
        return fallback;
      }
      return record.value;
    } catch (error) {
      target.removeItem(storageKey);
      stats.corruptions += 1;
      HQ.errors?.record?.(error, { source: 'storage', key: storageKey });
      return fallback;
    }
  }

  function remove(key, options = {}) {
    const target = backend(options.session === true);
    if (!target) return false;
    target.removeItem(keyFor(key));
    stats.removes += 1;
    return true;
  }

  function has(key, options = {}) {
    const marker = Symbol('missing');
    return get(key, marker, options) !== marker;
  }

  function keys(options = {}) {
    const target = backend(options.session === true);
    if (!target) return Object.freeze([]);
    return Object.freeze(Object.keys(target)
      .filter((key) => key.startsWith(PREFIX))
      .map((key) => key.slice(PREFIX.length)));
  }

  function clearNamespace(options = {}) {
    const target = backend(options.session === true);
    if (!target) return 0;
    const matching = Object.keys(target).filter((key) => key.startsWith(PREFIX));
    matching.forEach((key) => target.removeItem(key));
    stats.removes += matching.length;
    return matching.length;
  }

  function migrate(key, migrator, options = {}) {
    if (typeof migrator !== 'function') throw new TypeError('Storage migrator must be a function.');
    const current = get(key, undefined, options);
    const next = migrator(current);
    set(key, next, options);
    return next;
  }

  function diagnostics() {
    return Object.freeze({
      service: 'storage',
      version: '1.0',
      namespace: PREFIX,
      schemaVersion: SCHEMA_VERSION,
      localAvailable: Boolean(backend(false)),
      sessionAvailable: Boolean(backend(true)),
      localKeyCount: keys().length,
      sessionKeyCount: keys({ session: true }).length,
      stats: Object.freeze({ ...stats })
    });
  }

  HQ.defineService('storage', { set, get, remove, has, keys, clearNamespace, migrate, diagnostics });
  HQ.manifest?.register?.({ id: 'storage', service: 'storage', script: 'platform/storage.js', version: '1.0', capabilities: ['local-storage', 'session-storage', 'ttl', 'migration', 'corruption-recovery'] });
})();
