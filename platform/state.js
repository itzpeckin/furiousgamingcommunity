(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) {
    throw new Error('platform/core.js must load before platform/state.js.');
  }

  const namespaces = new Map();
  const subscriptions = new Map();
  const history = [];
  const MAX_HISTORY = 100;

  const clone = (value) => {
    if (value === undefined) return undefined;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch {}
    }
    try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
  };

  const freezeSnapshot = (value) => {
    const copied = clone(value);
    return copied && typeof copied === 'object' ? Object.freeze(copied) : copied;
  };

  function normalizeNamespace(name) {
    const value = String(name || '').trim();
    if (!value) throw new TypeError('A state namespace is required.');
    if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(value)) {
      throw new TypeError(`Invalid state namespace "${value}".`);
    }
    return value;
  }

  function normalizeDefinition(definition = {}) {
    const defaults = clone(definition.defaults || {});
    return {
      defaults,
      persist: definition.persist === true,
      storageKey: definition.storageKey || null,
      resetOn: Object.freeze([...(definition.resetOn || [])]),
      owner: definition.owner || 'platform',
      version: definition.version || 1,
      validate: typeof definition.validate === 'function' ? definition.validate : null
    };
  }

  function register(name, definition = {}) {
    const namespace = normalizeNamespace(name);
    if (namespaces.has(namespace)) return api(namespace);

    const normalized = normalizeDefinition(definition);
    const record = {
      name: namespace,
      definition: normalized,
      value: clone(normalized.defaults),
      hydrated: false,
      revision: 0,
      updatedAt: null,
      updatedBy: null
    };

    namespaces.set(namespace, record);
    if (normalized.persist) hydrate(namespace, { silent: true });
    HQ.events?.emit?.('state:namespace-registered', {
      namespace,
      owner: normalized.owner,
      persistent: normalized.persist,
      version: normalized.version
    });
    return api(namespace);
  }

  function getRecord(name) {
    const namespace = normalizeNamespace(name);
    const record = namespaces.get(namespace);
    if (!record) throw new Error(`State namespace "${namespace}" has not been registered.`);
    return record;
  }

  function storageKey(record) {
    return record.definition.storageKey || `franchisehq:state:${record.name}:v${record.definition.version}`;
  }

  function notify(record, previousValue, source, reason = 'updated') {
    const detail = Object.freeze({
      namespace: record.name,
      value: freezeSnapshot(record.value),
      previousValue: freezeSnapshot(previousValue),
      revision: record.revision,
      source,
      reason,
      timestamp: record.updatedAt
    });

    history.push(detail);
    if (history.length > MAX_HISTORY) history.shift();

    subscriptions.get(record.name)?.forEach((handler) => {
      try { handler(detail); } catch (error) { console.error(`[FranchiseHQ.state] ${record.name}`, error); }
    });
    subscriptions.get('*')?.forEach((handler) => {
      try { handler(detail); } catch (error) { console.error('[FranchiseHQ.state] wildcard subscriber', error); }
    });

    HQ.events?.emit?.('state:changed', detail);
    HQ.events?.emit?.(`${record.name}:state-changed`, detail);
    return detail;
  }

  function persist(record) {
    if (!record.definition.persist) return false;
    const payload = {
      version: record.definition.version,
      value: record.value,
      updatedAt: record.updatedAt
    };
    return HQ.store?.setJSON?.(storageKey(record), payload, {
      source: `state:${record.name}`,
      silent: true
    }) !== undefined;
  }

  function hydrate(name, options = {}) {
    const record = getRecord(name);
    if (!record.definition.persist) {
      record.hydrated = true;
      return snapshot(name);
    }

    const persisted = HQ.store?.getJSON?.(storageKey(record), null);
    const candidate = persisted?.value;
    if (candidate && (!record.definition.validate || record.definition.validate(candidate))) {
      const previousValue = clone(record.value);
      record.value = clone(candidate);
      record.revision += 1;
      record.updatedAt = new Date().toISOString();
      record.updatedBy = options.source || 'hydrate';
      record.hydrated = true;
      if (options.silent !== true) notify(record, previousValue, record.updatedBy, 'hydrated');
    } else {
      record.hydrated = true;
    }
    return snapshot(name);
  }

  function snapshot(name) {
    const record = getRecord(name);
    return freezeSnapshot(record.value);
  }

  function metadata(name) {
    const record = getRecord(name);
    return Object.freeze({
      namespace: record.name,
      owner: record.definition.owner,
      persistent: record.definition.persist,
      storageKey: record.definition.persist ? storageKey(record) : null,
      version: record.definition.version,
      hydrated: record.hydrated,
      revision: record.revision,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
      resetOn: record.definition.resetOn
    });
  }

  function replace(name, nextValue, options = {}) {
    const record = getRecord(name);
    if (record.definition.validate && !record.definition.validate(nextValue)) {
      throw new TypeError(`State validation failed for namespace "${record.name}".`);
    }
    const previousValue = clone(record.value);
    record.value = clone(nextValue);
    record.revision += 1;
    record.updatedAt = new Date().toISOString();
    record.updatedBy = options.source || 'state.replace';
    persist(record);
    if (options.silent !== true) notify(record, previousValue, record.updatedBy, options.reason || 'replaced');
    return snapshot(name);
  }

  function patch(name, partial, options = {}) {
    const record = getRecord(name);
    const patchValue = typeof partial === 'function'
      ? partial(clone(record.value))
      : partial;
    if (!patchValue || typeof patchValue !== 'object' || Array.isArray(patchValue)) {
      throw new TypeError(`State patch for "${record.name}" must be an object or updater function returning an object.`);
    }
    return replace(name, { ...record.value, ...patchValue }, {
      ...options,
      reason: options.reason || 'patched'
    });
  }

  function reset(name, options = {}) {
    const record = getRecord(name);
    return replace(name, clone(record.definition.defaults), {
      ...options,
      source: options.source || 'state.reset',
      reason: options.reason || 'reset'
    });
  }

  function resetByTrigger(trigger, options = {}) {
    const normalized = String(trigger || '').trim();
    const resetNamespaces = [];
    namespaces.forEach((record) => {
      if (record.definition.resetOn.includes(normalized)) {
        reset(record.name, { source: options.source || `trigger:${normalized}` });
        resetNamespaces.push(record.name);
      }
    });
    HQ.events?.emit?.('state:reset-triggered', {
      trigger: normalized,
      namespaces: Object.freeze(resetNamespaces)
    });
    return Object.freeze(resetNamespaces);
  }

  function subscribe(name, handler, options = {}) {
    if (typeof handler !== 'function') throw new TypeError('A state subscription handler is required.');
    const namespace = name === '*' ? '*' : normalizeNamespace(name);
    if (namespace !== '*' && !namespaces.has(namespace)) {
      throw new Error(`State namespace "${namespace}" has not been registered.`);
    }
    const bucket = subscriptions.get(namespace) || new Set();
    if (options.preventDuplicate !== false && bucket.has(handler)) {
      return () => unsubscribe(namespace, handler);
    }
    bucket.add(handler);
    subscriptions.set(namespace, bucket);
    if (options.immediate === true && namespace !== '*') {
      handler(Object.freeze({
        namespace,
        value: snapshot(namespace),
        previousValue: undefined,
        revision: metadata(namespace).revision,
        source: 'subscribe',
        reason: 'snapshot',
        timestamp: new Date().toISOString()
      }));
    }
    return () => unsubscribe(namespace, handler);
  }

  function unsubscribe(name, handler) {
    const namespace = name === '*' ? '*' : normalizeNamespace(name);
    const bucket = subscriptions.get(namespace);
    if (!bucket) return false;
    const removed = bucket.delete(handler);
    if (!bucket.size) subscriptions.delete(namespace);
    return removed;
  }

  function api(name) {
    const namespace = normalizeNamespace(name);
    return Object.freeze({
      snapshot: () => snapshot(namespace),
      metadata: () => metadata(namespace),
      patch: (partial, options) => patch(namespace, partial, options),
      replace: (value, options) => replace(namespace, value, options),
      reset: (options) => reset(namespace, options),
      hydrate: (options) => hydrate(namespace, options),
      subscribe: (handler, options) => subscribe(namespace, handler, options)
    });
  }

  function diagnostics() {
    const namespaceDiagnostics = {};
    namespaces.forEach((record, name) => {
      namespaceDiagnostics[name] = {
        ...metadata(name),
        subscriberCount: subscriptions.get(name)?.size || 0
      };
    });
    return Object.freeze({
      service: 'state',
      namespaceCount: namespaces.size,
      namespaces: Object.freeze(namespaceDiagnostics),
      wildcardSubscriberCount: subscriptions.get('*')?.size || 0,
      historySize: history.length,
      recentChanges: Object.freeze(history.slice(-10))
    });
  }

  const service = {
    register,
    api,
    snapshot,
    metadata,
    replace,
    patch,
    reset,
    resetByTrigger,
    hydrate,
    subscribe,
    unsubscribe,
    diagnostics
  };

  HQ.defineService('state', service);

  register('platform', {
    owner: 'platform',
    defaults: {
      loading: false,
      activeModal: null,
      notifications: [],
      ready: false
    },
    resetOn: ['session-ended']
  });

  register('identity', {
    owner: 'identity',
    defaults: {
      userId: null,
      leagueId: null,
      teamId: null,
      role: null,
      permissions: []
    },
    resetOn: ['session-ended', 'identity-changed']
  });

  register('league', {
    owner: 'leagueEngine',
    defaults: {
      season: null,
      week: null,
      phase: null
    },
    resetOn: ['league-changed', 'session-ended']
  });

  register('dataCache', {
    owner: 'dataServices',
    defaults: {
      teams: null,
      players: null,
      schedule: null,
      standings: null,
      news: null,
      updatedAt: {}
    },
    resetOn: ['league-changed', 'session-ended']
  });
})();
