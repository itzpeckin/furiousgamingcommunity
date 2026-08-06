(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService) {
    throw new Error('platform/core.js must load before league-engine/import-state.js.');
  }

  const STATES = Object.freeze({
    IDLE: 'idle',
    IMPORTING: 'importing',
    VALIDATING: 'validating',
    BUILDING_SNAPSHOT: 'building-snapshot',
    COMPLETED: 'completed',
    FAILED: 'failed'
  });

  const ACTIVE_STATES = Object.freeze([
    STATES.IMPORTING,
    STATES.VALIDATING,
    STATES.BUILDING_SNAPSHOT
  ]);

  const ALLOWED_TRANSITIONS = Object.freeze({
    [STATES.IDLE]: Object.freeze([STATES.IMPORTING]),
    [STATES.IMPORTING]: Object.freeze([STATES.VALIDATING, STATES.FAILED]),
    [STATES.VALIDATING]: Object.freeze([STATES.BUILDING_SNAPSHOT, STATES.FAILED]),
    [STATES.BUILDING_SNAPSHOT]: Object.freeze([STATES.COMPLETED, STATES.FAILED]),
    [STATES.COMPLETED]: Object.freeze([STATES.IDLE, STATES.IMPORTING]),
    [STATES.FAILED]: Object.freeze([STATES.IDLE, STATES.IMPORTING])
  });

  const listeners = new Set();
  let sequence = 0;
  let current = createState(STATES.IDLE, {
    message: 'Import framework is ready.',
    progress: 0
  });

  function now() {
    return new Date().toISOString();
  }

  function createId() {
    return window.crypto?.randomUUID?.()
      || `import-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function clone(value) {
    if (value == null) return value;
    return typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function createState(status, patch = {}) {
    const timestamp = now();
    const active = ACTIVE_STATES.includes(status);
    return Object.freeze({
      status,
      label: labelFor(status),
      active,
      terminal: status === STATES.COMPLETED || status === STATES.FAILED,
      importId: patch.importId || null,
      source: patch.source || null,
      message: patch.message || '',
      progress: Number.isFinite(patch.progress) ? Math.max(0, Math.min(100, patch.progress)) : 0,
      error: patch.error || null,
      metadata: Object.freeze(clone(patch.metadata || {})),
      startedAt: patch.startedAt || null,
      updatedAt: timestamp,
      completedAt: patch.completedAt || null,
      sequence: ++sequence
    });
  }

  function labelFor(status) {
    switch (status) {
      case STATES.IMPORTING: return 'Importing';
      case STATES.VALIDATING: return 'Validating';
      case STATES.BUILDING_SNAPSHOT: return 'Building Snapshot';
      case STATES.COMPLETED: return 'Completed';
      case STATES.FAILED: return 'Failed';
      default: return 'Idle';
    }
  }

  function snapshot() {
    return Object.freeze(clone(current));
  }

  function publish(previous, reason = 'state-transition') {
    const next = snapshot();
    listeners.forEach((listener) => {
      try { listener(next, previous); }
      catch (error) { console.error('[leagueImportState] listener failed', error); }
    });

    HQ.events?.emit?.('import:state-changed', {
      reason,
      previousStatus: previous?.status || null,
      status: next.status,
      importId: next.importId,
      source: next.source,
      progress: next.progress,
      message: next.message,
      error: next.error,
      timestamp: next.updatedAt
    }, { source: 'leagueImportState' });

    window.dispatchEvent(new CustomEvent('franchisehq:import-state-changed', {
      detail: next
    }));

    return next;
  }

  function assertTransition(nextStatus, options = {}) {
    if (!Object.values(STATES).includes(nextStatus)) {
      throw new TypeError(`Unknown import state "${nextStatus}".`);
    }
    if (nextStatus === current.status) return;
    if (options.force === true) return;
    if (!ALLOWED_TRANSITIONS[current.status]?.includes(nextStatus)) {
      throw new Error(`Invalid import state transition: ${current.status} → ${nextStatus}.`);
    }
  }

  function transition(nextStatus, patch = {}, options = {}) {
    assertTransition(nextStatus, options);
    const previous = snapshot();
    const startedAt = nextStatus === STATES.IMPORTING
      ? (patch.startedAt || now())
      : (patch.startedAt || current.startedAt);
    const completedAt = nextStatus === STATES.COMPLETED || nextStatus === STATES.FAILED
      ? (patch.completedAt || now())
      : null;

    current = createState(nextStatus, {
      importId: patch.importId || current.importId,
      source: patch.source || current.source,
      message: patch.message ?? current.message,
      progress: patch.progress ?? current.progress,
      error: patch.error ?? (nextStatus === STATES.FAILED ? current.error : null),
      metadata: { ...clone(current.metadata), ...clone(patch.metadata || {}) },
      startedAt,
      completedAt
    });
    return publish(previous, options.reason);
  }

  function begin(options = {}) {
    return transition(STATES.IMPORTING, {
      importId: options.importId || createId(),
      source: options.source || 'unknown',
      message: options.message || 'Import started.',
      progress: 10,
      metadata: options.metadata || {},
      startedAt: now(),
      error: null
    }, {
      force: current.status !== STATES.IDLE,
      reason: options.reason || 'import-started'
    });
  }

  function validating(patch = {}) {
    return transition(STATES.VALIDATING, {
      message: patch.message || 'Validating import data.',
      progress: patch.progress ?? 45,
      metadata: patch.metadata || {}
    }, { reason: patch.reason || 'validation-started' });
  }

  function buildingSnapshot(patch = {}) {
    return transition(STATES.BUILDING_SNAPSHOT, {
      message: patch.message || 'Building candidate snapshot.',
      progress: patch.progress ?? 75,
      metadata: patch.metadata || {}
    }, { reason: patch.reason || 'snapshot-build-started' });
  }

  function complete(patch = {}) {
    return transition(STATES.COMPLETED, {
      message: patch.message || 'Import completed successfully.',
      progress: 100,
      metadata: patch.metadata || {},
      error: null
    }, { reason: patch.reason || 'import-completed' });
  }

  function fail(error, patch = {}) {
    const normalized = error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: 'ImportError', message: String(error || 'Import failed.') };
    return transition(STATES.FAILED, {
      message: patch.message || normalized.message,
      progress: patch.progress ?? current.progress,
      metadata: patch.metadata || {},
      error: Object.freeze(normalized)
    }, { reason: patch.reason || 'import-failed' });
  }

  function reset(options = {}) {
    const previous = snapshot();
    current = createState(STATES.IDLE, {
      message: options.message || 'Import framework is ready.',
      progress: 0
    });
    return publish(previous, options.reason || 'import-reset');
  }

  function subscribe(listener, options = {}) {
    if (typeof listener !== 'function') {
      throw new TypeError('leagueImportState.subscribe requires a function.');
    }
    listeners.add(listener);
    if (options.immediate !== false) listener(snapshot(), null);
    return () => listeners.delete(listener);
  }

  function diagnostics() {
    return Object.freeze({
      service: 'leagueImportState',
      version: '5.9.0.1.3',
      status: current.status,
      active: current.active,
      listenerCount: listeners.size,
      supportedStates: Object.freeze(Object.values(STATES)),
      transitionGuard: true,
      eventIntegration: Boolean(HQ.events?.emit)
    });
  }

  HQ.defineModuleService('league', 'leagueImportState', {
    STATES,
    get: snapshot,
    begin,
    validating,
    buildingSnapshot,
    complete,
    fail,
    reset,
    transition,
    subscribe,
    isActive: () => current.active,
    diagnostics
  });

  HQ.manifest?.register?.({
    scope: 'module',
    module: 'league',
    id: 'league-import-state',
    service: 'leagueImportState',
    script: 'league-engine/import-state.js',
    version: '5.9.0.1.3',
    dependencies: ['events'],
    capabilities: [
      'guarded-import-lifecycle',
      'observable-import-status',
      'import-progress-metadata',
      'failure-state-capture',
      'legacy-window-event-compatibility'
    ]
  });
})();
