(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  const required = ['leagueSchema','leagueEntities','leagueRepository','leagueSelectors','leagueValidation','leagueMigrations','leagueMockAdapter'];
  if (!HQ?.defineService || required.some((name) => !HQ[name])) throw new Error('League Engine dependencies did not load correctly.');

  function installSnapshot(snapshot) {
    const validation = HQ.leagueValidation.assert(snapshot);
    return HQ.leagueRepository.install(snapshot, { validated: validation.valid });
  }

  function ingestMock(raw, options) {
    const snapshot = HQ.leagueMockAdapter.fromLegacy(raw, options);
    return installSnapshot(snapshot);
  }

  function diagnostics() {
    const services = Object.fromEntries(required.map((name) => [name, Boolean(HQ[name])]));
    const repository = HQ.leagueRepository.diagnostics();
    return Object.freeze({
      service: 'leagueReadModel', version: '5.1', authority: 'madden', readOnly: true,
      policy: 'Only a validated Madden import may replace official league state.',
      services: Object.freeze(services), repository,
      compliant: Object.values(services).every(Boolean) && repository.readOnly === true && repository.authority === 'madden'
    });
  }

  const service = HQ.defineService('leagueReadModel', {
    version: '5.1', authority: 'madden', readOnly: true,
    installSnapshot, ingestMock,
    get: HQ.leagueRepository.current,
    exportSnapshot: HQ.leagueRepository.exportSnapshot,
    selectors: HQ.leagueSelectors,
    validate: HQ.leagueValidation.validate,
    diagnostics
  });

  // Public alias for the new read model without replacing the legacy platform/league.js service.
  Object.defineProperty(HQ, 'maddenLeague', { configurable: true, enumerable: true, get: () => service });
  HQ.manifest?.register?.({ id: 'league-read-model', service: 'leagueReadModel', script: 'league-engine/index.js', version: '5.1.0', dependencies: required, capabilities: ['madden-authoritative-state', 'immutable-read-model', 'workflow-separation'] });
})();
