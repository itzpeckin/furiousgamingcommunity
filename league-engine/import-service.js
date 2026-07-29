(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  const deps = ['leagueMaddenJsonAdapter','leagueImportValidator','leagueImportQuarantine','leagueRepository'];
  if (!HQ?.defineModuleService || deps.some((name) => !HQ[name])) throw new Error('League import dependencies did not load correctly.');

  const history = [];
  const clone = (value) => value == null ? value : structuredClone(value);

  function preview(input, metadata = {}) {
    try {
      const prepared = HQ.leagueMaddenJsonAdapter.from(input, metadata);
      const report = HQ.leagueImportValidator.validate(prepared.envelope, prepared.snapshot);
      return Object.freeze({ envelope: prepared.envelope, snapshot: prepared.snapshot, report });
    } catch (error) {
      const report = Object.freeze({ valid: false, publishable: false, importId: null, errors: Object.freeze([error.message]), warnings: Object.freeze([]), checkedAt: new Date().toISOString() });
      return Object.freeze({ envelope: null, snapshot: null, report });
    }
  }

  function commit(previewResult) {
    if (!previewResult?.report?.valid) {
      const quarantine = HQ.leagueImportQuarantine.add({ envelope: previewResult?.envelope, report: previewResult?.report, reason: 'Import failed validation and was not published.' });
      return Object.freeze({ installed: false, retainedImportId: HQ.leagueRepository.current()?.source?.importId || null, quarantine, report: previewResult?.report || null });
    }
    const snapshot = HQ.leagueRepository.install(previewResult.snapshot, { receipt: previewResult.report });
    const record = Object.freeze({ importId: snapshot.source.importId, importedAt: snapshot.source.importedAt, installedAt: new Date().toISOString(), warnings: previewResult.report.warnings.length });
    history.unshift(record);
    if (history.length > 50) history.length = 50;
    return Object.freeze({ installed: true, snapshot, report: previewResult.report, record });
  }

  function ingest(input, metadata = {}) { return commit(preview(input, metadata)); }
  function diagnostics() {
    return Object.freeze({ service: 'leagueImportService', version: '5.2', lastValidImportId: HQ.leagueRepository.current()?.source?.importId || null, successfulImports: history.length, quarantinedImports: HQ.leagueImportQuarantine.diagnostics().count, readOnlyOfficialState: true });
  }

  const service = HQ.defineModuleService('league', 'leagueImportService', { preview, commit, ingest, history: () => Object.freeze(history.map(clone)), diagnostics });
  HQ.manifest?.register?.({ scope: 'module', module: 'league', id: 'league-import-service', service: 'leagueImportService', script: 'league-engine/import-service.js', version: '5.2.0', dependencies: deps, capabilities: ['preview-before-publish', 'atomic-install', 'last-valid-retention', 'import-history'] });
})();
