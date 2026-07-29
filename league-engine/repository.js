(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService || !HQ.leagueSchema) throw new Error('League schema must load before repository.js.');

  const state = { current: null, previous: null, installedAt: null };
  const deepFreeze = (value, seen = new WeakSet()) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key], seen));
    return Object.freeze(value);
  };
  const copy = (value) => value == null ? value : structuredClone(value);

  function install(snapshot, options = {}) {
    if (!snapshot || typeof snapshot !== 'object') throw new TypeError('A validated Madden snapshot is required.');
    if (options.validated !== true) throw new Error('League snapshots may only be installed after validation.');
    if (snapshot.source?.source !== 'madden') throw new Error('Only Madden-authoritative snapshots may become official league state.');
    state.previous = state.current;
    state.current = deepFreeze(copy(snapshot));
    state.installedAt = new Date().toISOString();
    window.dispatchEvent(new CustomEvent('franchisehq:league-snapshot-installed', { detail: { importId: state.current.source.importId, installedAt: state.installedAt } }));
    return state.current;
  }

  function current() { return state.current; }
  function previous() { return state.previous; }
  function hasSnapshot() { return Boolean(state.current); }
  function exportSnapshot() { return copy(state.current); }
  function diagnostics() {
    return Object.freeze({ service: 'leagueRepository', readOnly: true, authority: 'madden', hasSnapshot: hasSnapshot(), importId: state.current?.source?.importId || null, importedAt: state.current?.source?.importedAt || null, installedAt: state.installedAt, previousImportId: state.previous?.source?.importId || null });
  }

  const service = HQ.defineModuleService('league', 'leagueRepository', { install, current, previous, hasSnapshot, exportSnapshot, diagnostics });
  HQ.manifest?.register?.({ scope: 'module', module: 'league', id: 'league-repository', service: 'leagueRepository', script: 'league-engine/repository.js', version: '1.0.0', dependencies: ['leagueSchema'], capabilities: ['immutable-snapshot', 'last-valid-snapshot', 'read-only-access'] });
})();
