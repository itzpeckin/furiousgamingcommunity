(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  const deps = [
    'leagueMaddenJsonAdapter',
    'leagueImportValidator',
    'leagueImportQuarantine',
    'leagueRepository',
    'leagueImportState'
  ];
  if (!HQ?.defineModuleService || deps.some((name) => !HQ[name])) {
    throw new Error('League import dependencies did not load correctly.');
  }

  const history = [];
  const clone = (value) => {
    if (value == null) return value;
    return typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  };

  function preview(input, metadata = {}) {
    try {
      const prepared = HQ.leagueMaddenJsonAdapter.from(input, metadata);
      const report = HQ.leagueImportValidator.validate(prepared.envelope, prepared.snapshot);
      return Object.freeze({ envelope: prepared.envelope, snapshot: prepared.snapshot, report });
    } catch (error) {
      const report = Object.freeze({
        valid: false,
        publishable: false,
        importId: null,
        errors: Object.freeze([error.message]),
        warnings: Object.freeze([]),
        checkedAt: new Date().toISOString()
      });
      return Object.freeze({ envelope: null, snapshot: null, report });
    }
  }

  function commit(previewResult, options = {}) {
    const manageState = options.manageState !== false;
    if (manageState && HQ.leagueImportState.get().status === HQ.leagueImportState.STATES.IMPORTING) {
      HQ.leagueImportState.validating({ metadata: { stage: 'commit-validation' } });
    }

    if (!previewResult?.report?.valid) {
      const quarantine = HQ.leagueImportQuarantine.add({
        envelope: previewResult?.envelope,
        report: previewResult?.report,
        reason: 'Import failed validation and was not published.'
      });
      const failure = Object.freeze({
        installed: false,
        retainedImportId: HQ.leagueRepository.current()?.source?.importId || null,
        quarantine,
        report: previewResult?.report || null
      });
      if (manageState) {
        HQ.leagueImportState.fail(
          previewResult?.report?.errors?.[0] || 'Import failed validation.',
          { metadata: { retainedImportId: failure.retainedImportId, quarantined: true } }
        );
      }
      return failure;
    }

    if (manageState) {
      HQ.leagueImportState.buildingSnapshot({
        metadata: { importId: previewResult.report.importId || previewResult.envelope?.importId || null }
      });
    }

    const snapshot = HQ.leagueRepository.install(previewResult.snapshot, { receipt: previewResult.report });
    const record = Object.freeze({
      importId: snapshot.source.importId,
      importedAt: snapshot.source.importedAt,
      installedAt: new Date().toISOString(),
      warnings: previewResult.report.warnings.length
    });
    history.unshift(record);
    if (history.length > 50) history.length = 50;

    if (manageState) {
      HQ.leagueImportState.complete({
        metadata: {
          importId: record.importId,
          installedAt: record.installedAt,
          warnings: record.warnings
        }
      });
    }

    return Object.freeze({ installed: true, snapshot, report: previewResult.report, record });
  }

  function ingest(input, metadata = {}) {
    return startImport(input, metadata);
  }

  function startImport(input, metadata = {}) {
    const source = metadata.source
      || metadata.channel
      || input?.source?.provider
      || input?.source
      || 'madden-companion';

    HQ.leagueImportState.begin({
      importId: metadata.importId || input?.importId || null,
      source,
      metadata: {
        season: metadata.season ?? input?.season ?? null,
        week: metadata.week ?? input?.week ?? null,
        simulated: metadata.simulated === true
      }
    });

    try {
      const previewResult = preview(input, metadata);
      return commit(previewResult, { manageState: true });
    } catch (error) {
      HQ.leagueImportState.fail(error);
      throw error;
    }
  }

  async function simulate(options = {}) {
    const delay = Number.isFinite(options.delay) ? Math.max(0, options.delay) : 150;
    const pause = () => new Promise((resolve) => window.setTimeout(resolve, delay));
    HQ.leagueImportState.begin({
      source: options.source || 'development-simulation',
      importId: options.importId,
      metadata: { simulated: true }
    });
    await pause();
    HQ.leagueImportState.validating({ metadata: { simulated: true } });
    await pause();
    if (options.fail === true) {
      return HQ.leagueImportState.fail(
        options.error || 'Simulated import validation failure.',
        { metadata: { simulated: true } }
      );
    }
    HQ.leagueImportState.buildingSnapshot({ metadata: { simulated: true } });
    await pause();
    return HQ.leagueImportState.complete({
      message: 'Import framework simulation completed.',
      metadata: { simulated: true, dataChanged: false }
    });
  }

  function getImportStatus() {
    return HQ.leagueImportState.get();
  }

  function subscribeToImportStatus(listener, options = {}) {
    return HQ.leagueImportState.subscribe(listener, options);
  }

  function resetImportStatus(options = {}) {
    return HQ.leagueImportState.reset(options);
  }

  function diagnostics() {
    return Object.freeze({
      service: 'leagueImportService',
      version: '5.9.0.1.3',
      lastValidImportId: HQ.leagueRepository.current()?.source?.importId || null,
      successfulImports: history.length,
      quarantinedImports: HQ.leagueImportQuarantine.diagnostics().count,
      readOnlyOfficialState: true,
      lifecycleState: HQ.leagueImportState.diagnostics(),
      backwardCompatibleApis: Object.freeze(['preview', 'commit', 'ingest', 'history'])
    });
  }

  const service = HQ.defineModuleService('league', 'leagueImportService', {
    startImport,
    preview,
    commit,
    ingest,
    simulate,
    getImportStatus,
    subscribeToImportStatus,
    resetImportStatus,
    history: () => Object.freeze(history.map(clone)),
    diagnostics
  });

  HQ.manifest?.register?.({
    scope: 'module',
    module: 'league',
    id: 'league-import-service',
    service: 'leagueImportService',
    script: 'league-engine/import-service.js',
    version: '5.9.0.1.3',
    dependencies: deps,
    capabilities: [
      'preview-before-publish',
      'atomic-install',
      'last-valid-retention',
      'import-history',
      'shared-import-lifecycle',
      'observable-import-status',
      'development-import-simulation'
    ]
  });
})();
