(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService || !HQ.leagueSchema || !HQ.leagueRepository || !HQ.leagueMockAdapter) {
    throw new Error('League schema, repository and mock adapter must load before data-state.js.');
  }

  const MODES = Object.freeze(['auto', 'empty', 'demo', 'live']);
  const MODE_KEY = 'fgc-league-data-mode';
  const listeners = new Set();
  const storedMode = String(HQ.store?.getString?.(MODE_KEY, 'auto') || 'auto').toLowerCase();
  let requestedMode = MODES.includes(storedMode) ? storedMode : 'auto';
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
      version: '5.4.3',
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
      lastTransitionAt
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

  function setMode(mode) {
    const normalized = String(mode || '').toLowerCase();
    if (!MODES.includes(normalized)) throw new TypeError(`Unsupported league data mode "${mode}".`);
    requestedMode = normalized;
    HQ.store?.setString?.(MODE_KEY, normalized, { source: 'league-data-source-selector' });
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

  function diagnostics() {
    const state = status();
    return Object.freeze({
      ...state,
      modes: MODES,
      subscriberCount: listeners.size,
      repository: HQ.leagueRepository.diagnostics(),
      compliant: state.readOnly === true && (!state.isLive || state.authority === 'madden')
    });
  }

  window.addEventListener('franchisehq:league-snapshot-installed', () => {
    notify('live-snapshot-installed');
  });

  const service = HQ.defineModuleService('league', 'leagueDataState', {
    version: '5.4.3',
    modes: MODES,
    current,
    exportCurrent,
    status,
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
    version: '5.4.3',
    dependencies: ['leagueSchema', 'leagueRepository', 'leagueMockAdapter'],
    capabilities: ['empty-state', 'demo-state', 'live-state', 'snapshot-switching', 'read-state-helpers', 'import-status']
  });
})();
