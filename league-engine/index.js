(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  const required = ['leagueSchema','leagueEntities','leagueImportContract','leagueValidation','leagueImportValidator','leagueImportQuarantine','leagueMaddenJsonAdapter','leagueRepository','leagueSelectors','leagueMigrations','leagueMockAdapter','leagueImportService'];
  if (!HQ?.defineModuleService || required.some((name) => !HQ[name])) throw new Error('League Engine dependencies did not load correctly.');

  function ingestMock(raw, options = {}) {
    const legacy = HQ.leagueMockAdapter.fromLegacy(raw, options);
    const envelope = HQ.leagueImportContract.createEnvelope({ importedAt: legacy.source.importedAt, importId: legacy.source.importId, rawSourceId: legacy.source.rawSourceId, channel: 'manual-upload', payload: legacy });
    return HQ.leagueImportService.ingest(envelope);
  }

  function diagnostics() {
    const services = Object.fromEntries(required.map((name) => [name, Boolean(HQ[name])]));
    const repository = HQ.leagueRepository.diagnostics();
    const imports = HQ.leagueImportService.diagnostics();
    return Object.freeze({
      service: 'leagueReadModel', version: '5.2', authority: 'madden', readOnly: true,
      policy: 'Only a validated Madden import may replace official league state.',
      services: Object.freeze(services), repository, imports,
      compliant: Object.values(services).every(Boolean) && repository.readOnly === true && repository.guardedInstall === true && repository.authority === 'madden'
    });
  }

  const service = HQ.defineModuleService('league', 'leagueReadModel', {
    version: '5.2', authority: 'madden', readOnly: true,
    previewImport: HQ.leagueImportService.preview,
    commitImport: HQ.leagueImportService.commit,
    ingest: HQ.leagueImportService.ingest,
    ingestMock,
    get: HQ.leagueRepository.current,
    exportSnapshot: HQ.leagueRepository.exportSnapshot,
    selectors: HQ.leagueSelectors,
    validateSnapshot: HQ.leagueValidation.validate,
    importContract: HQ.leagueImportContract,
    importHistory: HQ.leagueImportService.history,
    quarantine: HQ.leagueImportQuarantine,
    diagnostics
  });

  Object.defineProperty(HQ, 'maddenLeague', { configurable: true, enumerable: true, get: () => service });
  HQ.manifest?.register?.({ scope: 'module', module: 'league', id: 'league-read-model', service: 'leagueReadModel', script: 'league-engine/index.js', version: '5.2.0', dependencies: required, capabilities: ['madden-authoritative-state', 'immutable-read-model', 'validated-imports', 'failed-import-retention'] });
})();
