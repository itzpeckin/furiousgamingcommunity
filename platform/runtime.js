(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) {
    throw new Error('platform/core.js must load before platform/runtime.js.');
  }

  const modules = new Map();
  const history = [];
  const MAX_HISTORY = 100;
  const VALID_STATES = Object.freeze([
    'registered',
    'initializing',
    'initialized',
    'starting',
    'started',
    'ready',
    'stopping',
    'stopped',
    'failed'
  ]);

  function now() {
    return new Date().toISOString();
  }

  function normalizeId(value) {
    const id = String(value || '').trim();
    if (!/^[a-z][a-z0-9.-]*$/.test(id)) {
      throw new TypeError(`Invalid module id "${id}". Use lowercase letters, numbers, dots, or hyphens.`);
    }
    return id;
  }

  function normalizeList(value) {
    if (value == null) return Object.freeze([]);
    if (!Array.isArray(value)) throw new TypeError('Module list metadata must be an array.');
    return Object.freeze([...new Set(value.map((item) => String(item).trim()).filter(Boolean))]);
  }

  function snapshotRecord(record) {
    return Object.freeze({
      id: record.id,
      name: record.name,
      version: record.version,
      state: record.state,
      routes: record.routes,
      permissions: record.permissions,
      dependencies: record.dependencies,
      registeredAt: record.registeredAt,
      initializedAt: record.initializedAt,
      startedAt: record.startedAt,
      readyAt: record.readyAt,
      stoppedAt: record.stoppedAt,
      lastTransitionAt: record.lastTransitionAt,
      error: record.error,
      transitionCount: record.transitionCount
    });
  }

  function recordTransition(record, from, to, detail = null) {
    const entry = Object.freeze({
      moduleId: record.id,
      from,
      to,
      detail,
      at: now()
    });
    history.push(entry);
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
    HQ.events?.emit?.('runtime:module-transitioned', entry);
    window.dispatchEvent(new CustomEvent('franchisehq:runtime:module-transitioned', { detail: entry }));
  }

  function transition(record, state, detail = null) {
    if (!VALID_STATES.includes(state)) throw new TypeError(`Unknown runtime state "${state}".`);
    const previous = record.state;
    record.state = state;
    record.lastTransitionAt = now();
    record.transitionCount += 1;
    if (state === 'initialized') record.initializedAt = record.lastTransitionAt;
    if (state === 'started') record.startedAt = record.lastTransitionAt;
    if (state === 'ready') record.readyAt = record.lastTransitionAt;
    if (state === 'stopped') record.stoppedAt = record.lastTransitionAt;
    recordTransition(record, previous, state, detail);
  }

  function register(definition, options = {}) {
    if (!definition || typeof definition !== 'object') {
      throw new TypeError('FranchiseHQ.runtime.register requires a module definition.');
    }

    const id = normalizeId(definition.id);
    if (modules.has(id) && options.replace !== true) return snapshotRecord(modules.get(id));

    const record = {
      id,
      name: String(definition.name || id),
      version: String(definition.version || '0.0.0'),
      routes: normalizeList(definition.routes),
      permissions: normalizeList(definition.permissions),
      dependencies: normalizeList(definition.dependencies),
      hooks: Object.freeze({
        initialize: typeof definition.initialize === 'function' ? definition.initialize : null,
        start: typeof definition.start === 'function' ? definition.start : null,
        ready: typeof definition.ready === 'function' ? definition.ready : null,
        shutdown: typeof definition.shutdown === 'function' ? definition.shutdown : null,
        diagnostics: typeof definition.diagnostics === 'function' ? definition.diagnostics : null
      }),
      state: 'registered',
      registeredAt: now(),
      initializedAt: null,
      startedAt: null,
      readyAt: null,
      stoppedAt: null,
      lastTransitionAt: null,
      transitionCount: 0,
      error: null,
      context: Object.create(null),
      operation: Promise.resolve()
    };

    modules.set(id, record);
    recordTransition(record, null, 'registered', { replaced: options.replace === true });
    return snapshotRecord(record);
  }

  function getRecord(id) {
    const key = normalizeId(id);
    const record = modules.get(key);
    if (!record) throw new Error(`Runtime module "${key}" is not registered.`);
    return record;
  }

  function dependenciesReady(record) {
    const missing = [];
    const notReady = [];
    record.dependencies.forEach((dependency) => {
      if (dependency.startsWith('service:')) {
        const serviceName = dependency.slice(8);
        if (!HQ.hasService?.(serviceName)) missing.push(dependency);
        return;
      }
      const module = modules.get(dependency);
      if (!module) missing.push(dependency);
      else if (module.state !== 'ready') notReady.push(dependency);
    });
    return { missing, notReady };
  }

  function contextFor(record) {
    return Object.freeze({
      id: record.id,
      metadata: snapshotRecord(record),
      platform: HQ,
      services: Object.freeze({
        get: (name) => HQ.getService?.(name),
        has: (name) => HQ.hasService?.(name)
      }),
      state: record.context
    });
  }

  async function invokeHook(record, hookName) {
    const hook = record.hooks[hookName];
    if (!hook) return undefined;
    return hook(contextFor(record));
  }

  function queue(record, operation) {
    record.operation = record.operation.then(operation, operation);
    return record.operation;
  }

  async function initializeOne(record) {
    if (['initialized', 'starting', 'started', 'ready'].includes(record.state)) return snapshotRecord(record);
    if (record.state === 'failed') throw new Error(`Module "${record.id}" is failed. Stop or replace it before restarting.`);
    transition(record, 'initializing');
    try {
      await invokeHook(record, 'initialize');
      transition(record, 'initialized');
      return snapshotRecord(record);
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error);
      transition(record, 'failed', { phase: 'initialize', error: record.error });
      HQ.errors?.record?.(error, { source: 'runtime', moduleId: record.id, phase: 'initialize' });
      throw error;
    }
  }

  async function startOne(record) {
    if (record.state === 'ready') return snapshotRecord(record);
    await initializeOne(record);

    const dependencyStatus = dependenciesReady(record);
    if (dependencyStatus.missing.length || dependencyStatus.notReady.length) {
      const error = new Error(`Module "${record.id}" dependencies are not ready.`);
      error.details = dependencyStatus;
      record.error = error.message;
      transition(record, 'failed', dependencyStatus);
      throw error;
    }

    transition(record, 'starting');
    try {
      await invokeHook(record, 'start');
      transition(record, 'started');
      await invokeHook(record, 'ready');
      transition(record, 'ready');
      return snapshotRecord(record);
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error);
      transition(record, 'failed', { phase: 'start', error: record.error });
      HQ.errors?.record?.(error, { source: 'runtime', moduleId: record.id, phase: 'start' });
      throw error;
    }
  }

  async function stopOne(record) {
    if (['registered', 'stopped'].includes(record.state)) return snapshotRecord(record);
    transition(record, 'stopping');
    try {
      await invokeHook(record, 'shutdown');
      record.error = null;
      transition(record, 'stopped');
      return snapshotRecord(record);
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error);
      transition(record, 'failed', { phase: 'shutdown', error: record.error });
      HQ.errors?.record?.(error, { source: 'runtime', moduleId: record.id, phase: 'shutdown' });
      throw error;
    }
  }

  function initialize(id) {
    const record = getRecord(id);
    return queue(record, () => initializeOne(record));
  }

  function start(id) {
    const record = getRecord(id);
    return queue(record, () => startOne(record));
  }

  function stop(id) {
    const record = getRecord(id);
    return queue(record, () => stopOne(record));
  }

  async function startAll() {
    const pending = new Set(modules.keys());
    const results = [];
    let progressed = true;

    while (pending.size && progressed) {
      progressed = false;
      for (const id of [...pending]) {
        const record = modules.get(id);
        const dependencies = dependenciesReady(record);
        if (dependencies.missing.length || dependencies.notReady.length) continue;
        try {
          results.push(await start(id));
        } catch (error) {
          results.push(snapshotRecord(record));
        }
        pending.delete(id);
        progressed = true;
      }
    }

    for (const id of pending) {
      const record = modules.get(id);
      record.error = 'Unresolved module dependencies.';
      transition(record, 'failed', dependenciesReady(record));
      results.push(snapshotRecord(record));
    }

    const detail = diagnostics();
    HQ.events?.emit?.('runtime:ready', detail);
    return Object.freeze(results);
  }

  async function stopAll() {
    const ordered = [...modules.values()].reverse();
    const results = [];
    for (const record of ordered) {
      try {
        results.push(await stop(record.id));
      } catch (error) {
        results.push(snapshotRecord(record));
      }
    }
    return Object.freeze(results);
  }

  function get(id) {
    return snapshotRecord(getRecord(id));
  }

  function list() {
    return Object.freeze([...modules.values()].map(snapshotRecord));
  }

  function diagnostics() {
    const snapshots = [...modules.values()].map((record) => {
      const snapshot = { ...snapshotRecord(record) };
      if (record.hooks.diagnostics) {
        try {
          snapshot.moduleDiagnostics = record.hooks.diagnostics(contextFor(record));
        } catch (error) {
          snapshot.moduleDiagnostics = { error: error instanceof Error ? error.message : String(error) };
        }
      }
      return Object.freeze(snapshot);
    });
    const counts = snapshots.reduce((result, module) => {
      result[module.state] = (result[module.state] || 0) + 1;
      return result;
    }, {});
    return Object.freeze({
      service: 'runtime',
      version: '1.2',
      moduleCount: snapshots.length,
      ready: snapshots.length > 0 && snapshots.every((module) => module.state === 'ready'),
      counts: Object.freeze(counts),
      modules: Object.freeze(snapshots),
      recentTransitions: Object.freeze(history.slice(-25))
    });
  }

  const service = HQ.defineService('runtime', {
    register,
    initialize,
    start,
    startAll,
    stop,
    stopAll,
    get,
    list,
    diagnostics,
    states: VALID_STATES
  });

  register({
    id: 'platform-foundation',
    name: 'Platform Foundation',
    version: HQ.metadata.version,
    routes: [],
    permissions: [],
    dependencies: ['service:manifest', 'service:storage', 'service:config', 'service:features', 'service:security', 'service:release', 'service:contract', 'service:events', 'service:state', 'service:errors', 'service:api'],
    diagnostics: () => ({ services: HQ.listServices?.().filter((name) => ['manifest', 'storage', 'config', 'features', 'security', 'release', 'contract', 'events', 'state', 'errors', 'api'].includes(name)) })
  });

  register({
    id: 'application-shell',
    name: 'Application Shell',
    version: HQ.metadata.version,
    routes: ['home', 'commissioner-hq', 'my-team', 'teams', 'players', 'schedule', 'standings', 'league-news', 'trade-center'],
    permissions: [],
    dependencies: ['platform-foundation', 'service:navigation', 'service:appRouter', 'service:sidebar', 'service:ui']
  });

  register({
    id: 'identity',
    name: 'Identity and League Context',
    version: HQ.metadata.version,
    routes: [],
    permissions: ['authenticated', 'commissioner', 'trade-committee'],
    dependencies: ['platform-foundation', 'service:auth', 'service:league', 'service:permissions']
  });

  register({
    id: 'data-services',
    name: 'League Data Services',
    version: HQ.metadata.version,
    routes: [],
    permissions: [],
    dependencies: ['platform-foundation', 'service:data', 'service:teams', 'service:players', 'service:schedule', 'service:standings', 'service:news']
  });

  register({
    id: 'trade-center',
    name: 'Trade Center',
    version: HQ.metadata.version,
    routes: ['trade-center'],
    permissions: ['authenticated'],
    dependencies: ['application-shell', 'identity', 'data-services', 'service:trade']
  });

  window.addEventListener('load', () => {
    service.startAll().catch((error) => {
      console.error('Franchise HQ module runtime failed to start.', error);
    });
  }, { once: true });
})();
