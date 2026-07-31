(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService || !HQ.leagueSchema || !HQ.leagueRepository || !HQ.leagueMockAdapter) {
    throw new Error('League schema, repository and mock adapter must load before data-state.js.');
  }

  const MODES = Object.freeze(['auto', 'empty', 'demo', 'live']);
  const STORAGE_KEY = 'league.data.mode';
  const LEGACY_MODE_KEY = 'fgc-league-data-mode';
  const listeners = new Set();
  const PERSISTED_MODES = Object.freeze(['empty', 'demo', 'live']);

  function normalizePersistedMode(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return PERSISTED_MODES.includes(normalized) ? normalized : null;
  }

  function readLegacyMode() {
    const storeValue = HQ.store?.getString?.(LEGACY_MODE_KEY, null);
    if (storeValue != null) return storeValue;
    try { return window.localStorage.getItem(LEGACY_MODE_KEY); } catch (_) { return null; }
  }

  function readPersistedMode() {
    let storageAvailable = false;
    let rawValue = null;
    let source = 'none';

    try {
      storageAvailable = HQ.storage?.diagnostics?.().localAvailable === true;
      if (storageAvailable) {
        rawValue = HQ.storage.get(STORAGE_KEY, null);
        source = rawValue == null ? 'none' : 'platform-storage';
      }
    } catch (_) {
      storageAvailable = false;
    }

    const normalized = normalizePersistedMode(rawValue);
    if (normalized) return { mode: normalized, source, storageAvailable, migrated: false };

    // A present-but-invalid value in the new platform key is authoritative as
    // a failed preference. Resolve safely to Empty instead of falling back to
    // an older legacy preference. Legacy migration is allowed only when the
    // new key is genuinely missing.
    if (rawValue != null) {
      return { mode: 'empty', source: 'invalid-value', storageAvailable, migrated: false };
    }

    const legacyMode = normalizePersistedMode(readLegacyMode());
    if (legacyMode) {
      let migrated = false;
      if (storageAvailable) {
        try { migrated = HQ.storage.set(STORAGE_KEY, legacyMode) === true; } catch (_) {}
      }
      return { mode: legacyMode, source: 'legacy-storage', storageAvailable, migrated };
    }

    return { mode: 'empty', source: 'default', storageAvailable, migrated: false };
  }

  const startupPreference = readPersistedMode();
  let requestedMode = startupPreference.mode;
  let persistenceState = {
    key: STORAGE_KEY,
    available: startupPreference.storageAvailable,
    restoredFrom: startupPreference.source,
    migratedLegacyValue: startupPreference.migrated,
    lastWriteSucceeded: null,
    lastPersistedMode: PERSISTED_MODES.includes(startupPreference.mode) ? startupPreference.mode : null
  };
  let demoSnapshot = null;
  let lastTransitionAt = new Date().toISOString();

  const clone = (value) => value == null ? value : structuredClone(value);
  const freeze = (value, seen = new WeakSet()) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.getOwnPropertyNames(value).forEach((key) => freeze(value[key], seen));
    return Object.freeze(value);
  };

  function makeEmptySnapshot() {
    const snapshot = HQ.leagueSchema.emptySnapshot({
      importId: 'empty-state',
      rawSourceId: 'franchise-hq-empty-state'
    });
    snapshot.availability = {
      officialMaddenImport: false,
      demoData: false,
      emptyState: true
    };
    snapshot.warnings = ['No Madden franchise has been imported.'];
    return freeze(snapshot);
  }

  let emptySnapshot = makeEmptySnapshot();

  function hasLive() {
    return HQ.leagueRepository.hasSnapshot() === true;
  }

  function hasDemo() {
    return Boolean(demoSnapshot);
  }

  function resolveMode(mode = requestedMode) {
    if (mode === 'live') return hasLive() ? 'live' : 'empty';
    if (mode === 'demo') return hasDemo() ? 'demo' : 'empty';
    if (mode === 'empty') return 'empty';
    if (hasLive()) return 'live';
    if (hasDemo()) return 'demo';
    return 'empty';
  }

  function sourceFor(mode) {
    if (mode === 'live') return HQ.leagueRepository.current();
    if (mode === 'demo') return demoSnapshot;
    return emptySnapshot;
  }

  function counts(snapshot) {
    const names = ['teams', 'franchises', 'owners', 'players', 'rosters', 'games', 'standings', 'stats', 'contracts', 'injuries', 'draftPicks'];
    return Object.freeze(Object.fromEntries(names.map((name) => [name, Array.isArray(snapshot?.[name]) ? snapshot[name].length : 0])));
  }

  function status() {
    const activeMode = resolveMode();
    const snapshot = sourceFor(activeMode);
    const live = hasLive();
    const demo = hasDemo();
    return Object.freeze({
      service: 'leagueDataState',
      version: '5.4.7',
      requestedMode,
      activeMode,
      authority: activeMode === 'live' ? 'madden' : activeMode,
      readOnly: true,
      hasLiveSnapshot: live,
      hasDemoSnapshot: demo,
      hasAnyData: activeMode !== 'empty',
      isEmpty: activeMode === 'empty',
      isDemo: activeMode === 'demo',
      isLive: activeMode === 'live',
      importId: snapshot?.source?.importId || null,
      importedAt: snapshot?.source?.importedAt || null,
      leagueId: snapshot?.league?.id || null,
      leagueName: snapshot?.league?.name || snapshot?.league?.displayName || null,
      counts: counts(snapshot),
      warning: activeMode === 'empty'
        ? 'No Madden franchise has been imported.'
        : activeMode === 'demo'
          ? 'Displaying non-authoritative demo data.'
          : null,
      lastTransitionAt,
      persistence: Object.freeze({ ...persistenceState })
    });
  }

  function notify(reason) {
    lastTransitionAt = new Date().toISOString();
    const detail = Object.freeze({ reason, ...status() });
    listeners.forEach((listener) => {
      try { listener(detail); } catch (error) { console.error('[FranchiseHQ] league data-state subscriber failed', error); }
    });
    window.dispatchEvent(new CustomEvent('franchisehq:league-data-state-changed', { detail }));
    return detail;
  }

  function current() {
    return sourceFor(resolveMode());
  }

  function exportCurrent() {
    return clone(current());
  }

  function persistMode(mode) {
    if (!PERSISTED_MODES.includes(mode)) return false;
    let succeeded = false;
    try {
      succeeded = HQ.storage?.set?.(STORAGE_KEY, mode) === true;
    } catch (_) {
      succeeded = false;
    }
    persistenceState = {
      ...persistenceState,
      available: HQ.storage?.diagnostics?.().localAvailable === true,
      lastWriteSucceeded: succeeded,
      lastPersistedMode: succeeded ? mode : persistenceState.lastPersistedMode
    };
    return succeeded;
  }

  function setMode(mode) {
    const normalized = String(mode || '').toLowerCase();
    if (!MODES.includes(normalized)) throw new TypeError(`Unsupported league data mode "${mode}".`);
    requestedMode = normalized;
    // Only commissioner-facing modes are persisted. `auto` remains an
    // internal compatibility mode and is deliberately session-only.
    if (PERSISTED_MODES.includes(normalized)) persistMode(normalized);
    return notify('mode-changed');
  }

  function setDemoSnapshot(snapshot, options = {}) {
    if (!snapshot || typeof snapshot !== 'object') throw new TypeError('A demo snapshot is required.');
    if (snapshot.source?.source !== 'madden') throw new Error('Demo snapshots must use the Madden read-model schema.');
    const copy = clone(snapshot);
    copy.availability = {
      ...(copy.availability || {}),
      officialMaddenImport: false,
      demoData: true,
      emptyState: false
    };
    copy.warnings = [...new Set([...(copy.warnings || []), 'Demo data is non-authoritative and cannot update official league state.'])];
    demoSnapshot = freeze(copy);
    if (options.activate === true) requestedMode = 'demo';
    return notify('demo-snapshot-set');
  }

  function seedDemoFromLegacy(raw = {}, options = {}) {
    return setDemoSnapshot(HQ.leagueMockAdapter.fromLegacy(raw, options), options);
  }

  function clearDemo() {
    demoSnapshot = null;
    return notify('demo-snapshot-cleared');
  }

  function refreshEmpty() {
    emptySnapshot = makeEmptySnapshot();
    return notify('empty-snapshot-refreshed');
  }

  function subscribe(listener, options = {}) {
    if (typeof listener !== 'function') throw new TypeError('League data-state subscriber must be a function.');
    listeners.add(listener);
    if (options.immediate !== false) listener(Object.freeze({ reason: 'subscription', ...status() }));
    return () => listeners.delete(listener);
  }

  function emptyMessage(subject = 'league data') {
    if (resolveMode() !== 'empty') return null;
    const labels = {
      roster: 'No roster has been loaded.',
      rosters: 'No rosters have been loaded.',
      standings: 'No standings are available.',
      schedule: 'No schedule is available.',
      statistics: 'No statistics are available.',
      players: 'No players have been loaded.',
      teams: 'No teams have been loaded.'
    };
    return labels[String(subject || '').toLowerCase()] || `No ${subject} is available. Import a Madden franchise to begin.`;
  }

  function viewState(subject = 'league data') {
    const state = status();
    return Object.freeze({
      ...state,
      render: state.isEmpty ? 'empty' : 'data',
      message: state.isEmpty ? emptyMessage(subject) : state.warning,
      snapshot: current()
    });
  }


  // LD-007 public convenience API. These helpers intentionally derive from
  // status() and current() so the League Data State Manager remains the only
  // source of truth for mode, authority and source metadata.
  function getMode() {
    return status().activeMode;
  }

  function getStatus() {
    return status();
  }

  function isDevelopment() {
    return status().isDemo === true;
  }

  function isEmpty() {
    return status().isEmpty === true;
  }

  function isLive() {
    return status().isLive === true;
  }

  function canLoadLeague() {
    return status().hasAnyData === true;
  }

  function currentSource() {
    const state = status();
    const snapshot = current();
    const source = snapshot?.source || {};
    return Object.freeze({
      mode: state.activeMode,
      requestedMode: state.requestedMode,
      authority: state.authority,
      sourceType: state.isLive
        ? (source.type || source.sourceType || 'madden')
        : state.isDemo
          ? 'development'
          : 'none',
      source: source.source || null,
      importId: state.importId,
      importedAt: state.importedAt,
      snapshotId: source.snapshotId || source.importId || state.importId || null,
      leagueId: state.leagueId,
      leagueName: state.leagueName,
      authoritative: state.isLive === true,
      available: state.hasAnyData === true,
      counts: state.counts
    });
  }

  function diagnostics() {
    const state = status();
    return Object.freeze({
      ...state,
      modes: MODES,
      persistedModes: PERSISTED_MODES,
      storageKey: STORAGE_KEY,
      persistence: Object.freeze({ ...persistenceState }),
      storage: HQ.storage?.diagnostics?.() || null,
      subscriberCount: listeners.size,
      repository: HQ.leagueRepository.diagnostics(),
      compliant: state.readOnly === true && (!state.isLive || state.authority === 'madden')
    });
  }

  window.addEventListener('franchisehq:league-snapshot-installed', () => {
    notify('live-snapshot-installed');
  });

  const service = HQ.defineModuleService('league', 'leagueDataState', {
    version: '5.4.7',
    modes: MODES,
    current,
    exportCurrent,
    status,
    getMode,
    getStatus,
    isDevelopment,
    isEmpty,
    isLive,
    canLoadLeague,
    currentSource,
    viewState,
    setMode,
    setDemoSnapshot,
    seedDemoFromLegacy,
    clearDemo,
    refreshEmpty,
    subscribe,
    emptyMessage,
    diagnostics
  });

  Object.defineProperty(HQ, 'leagueData', {
    configurable: true,
    enumerable: true,
    get: () => service
  });

  HQ.manifest?.register?.({
    scope: 'module',
    module: 'league',
    id: 'league-data-state',
    service: 'leagueDataState',
    script: 'league-engine/data-state.js',
    version: '5.4.7',
    dependencies: ['leagueSchema', 'leagueRepository', 'leagueMockAdapter'],
    capabilities: ['empty-state', 'demo-state', 'live-state', 'snapshot-switching', 'read-state-helpers', 'public-api-compatibility', 'source-metadata', 'import-status']
  });
})();
