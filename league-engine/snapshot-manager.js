(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService || !HQ.leagueRepository) {
    throw new Error('League repository must load before snapshot-manager.js.');
  }

  const STORAGE_KEY = 'franchisehq.import.snapshots.v1';
  const MAX_RETAINED = 10;
  const listeners = new Set();
  const memory = {
    candidates: new Map(),
    retained: [],
    activeId: null,
    sequence: 0
  };

  const clone = (value) => {
    if (value == null) return value;
    return typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  };

  const freeze = (value, seen = new WeakSet()) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.getOwnPropertyNames(value).forEach((key) => freeze(value[key], seen));
    return Object.freeze(value);
  };

  function now() { return new Date().toISOString(); }
  function makeId(prefix = 'snapshot') {
    return window.crypto?.randomUUID?.()
      ? `${prefix}-${window.crypto.randomUUID()}`
      : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        retained: memory.retained,
        activeId: memory.activeId,
        sequence: memory.sequence
      }));
      return true;
    } catch (error) {
      console.warn('[snapshotManager] persistence unavailable', error);
      return false;
    }
  }

  function hydrate() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      memory.retained = Array.isArray(parsed.retained) ? parsed.retained.slice(0, MAX_RETAINED) : [];
      memory.activeId = parsed.activeId || null;
      memory.sequence = Number.isFinite(parsed.sequence) ? parsed.sequence : memory.retained.length;
    } catch (error) {
      console.warn('[snapshotManager] saved snapshot metadata could not be restored', error);
    }
  }

  function summary(record) {
    if (!record) return null;
    return freeze({
      id: record.id,
      version: record.version,
      status: record.status,
      source: record.source,
      importId: record.importId,
      season: record.season,
      week: record.week,
      createdAt: record.createdAt,
      activatedAt: record.activatedAt || null,
      rejectedAt: record.rejectedAt || null,
      rejectionReason: record.rejectionReason || null,
      recordCounts: freeze(clone(record.recordCounts || {}))
    });
  }

  function publish(type, record, extra = {}) {
    const payload = freeze({ type, snapshot: summary(record), timestamp: now(), ...clone(extra) });
    listeners.forEach((listener) => {
      try { listener(payload); }
      catch (error) { console.error('[snapshotManager] listener failed', error); }
    });
    HQ.events?.emit?.('snapshot:changed', payload, { source: 'leagueSnapshotManager' });
    window.dispatchEvent(new CustomEvent('franchisehq:snapshot-changed', { detail: payload }));
    return payload;
  }

  function recordCounts(snapshot) {
    const counts = {};
    ['teams','players','schedule','games','standings','statistics','transactions'].forEach((key) => {
      if (Array.isArray(snapshot?.[key])) counts[key] = snapshot[key].length;
      else if (snapshot?.[key] && typeof snapshot[key] === 'object') counts[key] = Object.keys(snapshot[key]).length;
    });
    return counts;
  }

  function createSnapshot(snapshot, metadata = {}) {
    if (!snapshot || typeof snapshot !== 'object') throw new TypeError('Snapshot data must be an object.');
    const id = metadata.snapshotId || makeId('candidate');
    if (memory.candidates.has(id) || memory.retained.some((item) => item.id === id)) {
      throw new Error(`Snapshot ID already exists: ${id}`);
    }
    const createdAt = now();
    const record = freeze({
      id,
      version: ++memory.sequence,
      status: 'candidate',
      source: metadata.source || snapshot.source?.provider || snapshot.source?.source || 'madden-companion',
      importId: metadata.importId || snapshot.source?.importId || null,
      season: metadata.season ?? snapshot.season ?? snapshot.meta?.season ?? null,
      week: metadata.week ?? snapshot.week ?? snapshot.meta?.week ?? null,
      createdAt,
      activatedAt: null,
      rejectedAt: null,
      rejectionReason: null,
      recordCounts: recordCounts(snapshot),
      snapshot: freeze(clone(snapshot)),
      validation: metadata.validation ? freeze(clone(metadata.validation)) : null
    });
    memory.candidates.set(id, record);
    persist();
    publish('candidate-created', record);
    return summary(record);
  }

  function getSnapshot(id, options = {}) {
    const record = memory.candidates.get(id) || memory.retained.find((item) => item.id === id) || null;
    if (!record) return null;
    return options.includeData === true ? freeze(clone(record)) : summary(record);
  }

  function getCandidateSnapshot() {
    const candidates = Array.from(memory.candidates.values());
    return summary(candidates[candidates.length - 1] || null);
  }

  function getActiveSnapshot(options = {}) {
    const record = memory.retained.find((item) => item.id === memory.activeId) || null;
    if (!record) return null;
    return options.includeData === true ? freeze(clone(record)) : summary(record);
  }

  function activateSnapshot(id, options = {}) {
    const candidate = memory.candidates.get(id);
    if (!candidate) throw new Error(`Candidate snapshot not found: ${id}`);
    if (options.validated !== true) throw new Error('Candidate snapshots may only be activated after validation.');

    const previous = memory.retained.find((item) => item.id === memory.activeId) || null;
    const activated = freeze({ ...clone(candidate), status: 'active', activatedAt: now() });

    if (activated.snapshot?.source?.source === 'madden') {
      HQ.leagueRepository.install(activated.snapshot, { validated: true, receipt: options.validation || activated.validation });
    }

    memory.candidates.delete(id);
    memory.activeId = id;
    memory.retained = [activated, ...memory.retained.filter((item) => item.id !== id)].slice(0, MAX_RETAINED);
    persist();
    publish('snapshot-activated', activated, { previousSnapshotId: previous?.id || null });
    return summary(activated);
  }

  function rejectSnapshot(id, reason = 'Snapshot rejected.') {
    const candidate = memory.candidates.get(id);
    if (!candidate) return null;
    const rejected = freeze({
      ...clone(candidate),
      status: 'rejected',
      rejectedAt: now(),
      rejectionReason: String(reason || 'Snapshot rejected.'),
      snapshot: null
    });
    memory.candidates.delete(id);
    publish('snapshot-rejected', rejected);
    return summary(rejected);
  }

  function rollbackSnapshot(targetId, options = {}) {
    const target = memory.retained.find((item) => item.id === targetId);
    if (!target) throw new Error(`Retained snapshot not found: ${targetId}`);
    if (targetId === memory.activeId) return summary(target);
    if (options.authorized !== true) throw new Error('Snapshot rollback requires explicit authorization.');

    const previousId = memory.activeId;
    if (target.snapshot?.source?.source === 'madden') {
      HQ.leagueRepository.install(target.snapshot, { validated: true, receipt: target.validation });
    }
    const reactivated = freeze({ ...clone(target), status: 'active', activatedAt: now() });
    memory.retained = [reactivated, ...memory.retained.filter((item) => item.id !== targetId)].slice(0, MAX_RETAINED);
    memory.activeId = targetId;
    persist();
    publish('snapshot-rolled-back', reactivated, { previousSnapshotId: previousId });
    return summary(reactivated);
  }

  function deleteSnapshot(id) {
    if (id === memory.activeId) throw new Error('The active snapshot cannot be deleted.');
    const candidateDeleted = memory.candidates.delete(id);
    const before = memory.retained.length;
    memory.retained = memory.retained.filter((item) => item.id !== id);
    persist();
    const deleted = candidateDeleted || before !== memory.retained.length;
    if (deleted) publish('snapshot-deleted', { id, status: 'deleted', version: null, source: null, importId: null, season: null, week: null, createdAt: null, recordCounts: {} });
    return deleted;
  }

  function listSnapshots() {
    return freeze(memory.retained.map(summary));
  }

  function listCandidates() {
    return freeze(Array.from(memory.candidates.values()).map(summary));
  }

  function subscribe(listener, options = {}) {
    if (typeof listener !== 'function') throw new TypeError('Snapshot listener must be a function.');
    listeners.add(listener);
    if (options.immediate === true) listener(freeze({ type: 'snapshot-status', snapshot: getActiveSnapshot(), timestamp: now() }));
    return () => listeners.delete(listener);
  }

  async function simulate(options = {}) {
    const candidate = createSnapshot({
      source: { source: 'development', importId: options.importId || `simulation-${Date.now()}` },
      season: options.season ?? 2027,
      week: options.week ?? 4,
      teams: [],
      players: []
    }, {
      source: 'development-simulation',
      season: options.season ?? 2027,
      week: options.week ?? 4
    });
    if (options.reject === true) return rejectSnapshot(candidate.id, 'Development rejection simulation.');
    return activateSnapshot(candidate.id, { validated: true });
  }

  function resetDevelopmentState() {
    memory.candidates.clear();
    memory.retained = [];
    memory.activeId = null;
    memory.sequence = 0;
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    publish('snapshot-state-reset', null);
    return diagnostics();
  }

  function diagnostics() {
    return freeze({
      service: 'leagueSnapshotManager',
      version: '5.9.0.4',
      activeSnapshotId: memory.activeId,
      candidateCount: memory.candidates.size,
      retainedCount: memory.retained.length,
      maxRetained: MAX_RETAINED,
      persistence: 'localStorage-metadata',
      immutableSnapshots: true,
      guardedActivation: true,
      rollbackAvailable: true
    });
  }

  hydrate();

  HQ.defineModuleService('league', 'leagueSnapshotManager', {
    createSnapshot,
    getSnapshot,
    getCandidateSnapshot,
    getActiveSnapshot,
    activateSnapshot,
    rejectSnapshot,
    rollbackSnapshot,
    deleteSnapshot,
    listSnapshots,
    listCandidates,
    subscribe,
    simulate,
    resetDevelopmentState,
    diagnostics
  });

  HQ.manifest?.register?.({
    scope: 'module',
    module: 'league',
    id: 'league-snapshot-manager',
    service: 'leagueSnapshotManager',
    script: 'league-engine/snapshot-manager.js',
    version: '5.9.0.4',
    dependencies: ['leagueRepository'],
    capabilities: [
      'candidate-snapshots',
      'immutable-snapshot-records',
      'validated-activation',
      'failed-candidate-rejection',
      'retained-snapshot-history',
      'authorized-rollback',
      'snapshot-events'
    ]
  });
})();
