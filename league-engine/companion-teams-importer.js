(() => {
  'use strict';

  const HQ = window.FranchiseHQ = window.FranchiseHQ || {};
  const VERSION = '5.9.1.2';
  let latestResult = null;

  const freeze = (value, seen = new WeakSet()) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.getOwnPropertyNames(value).forEach((key) => freeze(value[key], seen));
    return Object.freeze(value);
  };
  const clone = (value) => value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const makeId = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function dependencies() {
    return {
      mapper: HQ.leagueCompanionJsonMapper,
      snapshots: HQ.leagueSnapshotManager,
      validation: HQ.leagueValidationEngine,
      state: HQ.leagueImportState,
      history: HQ.leagueImportHistory,
      events: HQ.leagueDataEvents
    };
  }

  function requireDependencies() {
    const deps = dependencies();
    const missing = Object.entries(deps).filter(([, service]) => !service).map(([name]) => name);
    if (missing.length) throw new Error(`Teams importer dependencies are unavailable: ${missing.join(', ')}.`);
    return deps;
  }

  function getPreview(preview) {
    const deps = requireDependencies();
    const selected = preview || deps.mapper.getLastPreview?.();
    if (!selected) throw new Error('Preview a Companion JSON payload before importing teams.');
    if (!selected.validation?.valid) throw new Error('The current Companion JSON preview has blocking contract errors.');
    if (!Array.isArray(selected.mapped?.teams) || !selected.mapped.teams.length) throw new Error('The current preview does not contain any mapped teams.');
    return selected;
  }

  async function importTeams(preview, options = {}) {
    const deps = requireDependencies();
    const selected = getPreview(preview);
    const importId = options.importId || `companion-teams-${makeId()}`;
    const metadata = selected.mapped.metadata || {};
    const source = metadata.source || 'Madden Companion';
    const startedAt = new Date().toISOString();
    let candidate = null;

    deps.state.begin({
      importId,
      source: 'madden-companion-teams',
      metadata: { season: metadata.season, week: metadata.week, teamCount: selected.mapped.teams.length, dataset: 'teams' }
    });

    try {
      deps.state.validating({ metadata: { stage: 'teams-contract', teamCount: selected.mapped.teams.length } });
      deps.state.buildingSnapshot({ metadata: { stage: 'teams-snapshot', teamCount: selected.mapped.teams.length } });

      const snapshot = freeze({
        source: freeze({
          source: 'madden-companion-teams',
          provider: source,
          importId,
          importedAt: new Date().toISOString(),
          contractVersion: selected.mapped.contract?.version || '1.0',
          partialDataset: true,
          dataset: 'teams'
        }),
        season: metadata.season,
        week: metadata.week,
        meta: freeze({
          season: metadata.season,
          week: metadata.week,
          leagueId: metadata.leagueId || '',
          leagueName: metadata.leagueName || '',
          partialDataset: true,
          pendingDatasets: freeze(['players'])
        }),
        teams: freeze(clone(selected.mapped.teams)),
        players: freeze([])
      });

      candidate = deps.snapshots.createSnapshot(snapshot, {
        source: 'madden-companion-teams',
        importId,
        season: metadata.season,
        week: metadata.week
      });

      const validation = deps.validation.validateSnapshot(candidate.id, { rejectOnFailure: true });
      if (!validation.valid) {
        throw Object.assign(new Error(validation.errors.map((item) => item.message).join('; ') || 'Teams snapshot failed validation.'), { validation });
      }

      const activeSnapshot = deps.snapshots.activateSnapshot(candidate.id, { validated: true, validation });
      const completedAt = new Date().toISOString();
      const historyRecord = deps.history.add({
        id: importId,
        importId,
        source: 'madden-companion-teams',
        snapshotId: activeSnapshot.id,
        snapshotVersion: activeSnapshot.version,
        season: metadata.season,
        week: metadata.week,
        startedAt,
        completedAt,
        status: 'successful',
        warnings: validation.warnings?.length || 0,
        recordCounts: { teams: selected.mapped.teams.length, players: 0 },
        dataset: 'teams',
        simulated: options.simulated === true
      });

      deps.events.publishLeagueDataUpdated({
        reason: 'companion-teams-imported',
        source: 'madden-companion-teams',
        snapshotId: activeSnapshot.id,
        importId,
        season: metadata.season,
        week: metadata.week,
        datasets: ['teams'],
        partialDataset: true
      });

      deps.state.complete({
        message: `${selected.mapped.teams.length} teams imported into an active protected snapshot.`,
        metadata: { importId, snapshotId: activeSnapshot.id, teamCount: selected.mapped.teams.length, dataset: 'teams' }
      });

      latestResult = freeze({
        installed: true,
        importId,
        teamCount: selected.mapped.teams.length,
        playerCount: 0,
        snapshot: activeSnapshot,
        validation,
        historyRecord,
        partialDataset: true,
        nextDataset: 'players'
      });
      return latestResult;
    } catch (error) {
      if (candidate?.id && deps.snapshots.getSnapshot(candidate.id)) deps.snapshots.rejectSnapshot(candidate.id, error.message);
      deps.history.add({
        id: importId,
        importId,
        source: 'madden-companion-teams',
        snapshotId: candidate?.id || null,
        season: metadata.season,
        week: metadata.week,
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'failed',
        failureReason: error.message,
        recordCounts: { teams: selected.mapped.teams.length, players: 0 },
        dataset: 'teams',
        simulated: options.simulated === true
      });
      deps.state.fail(error, { metadata: { importId, dataset: 'teams', retainedSnapshotId: deps.snapshots.getActiveSnapshot()?.id || null } });
      latestResult = freeze({ installed: false, importId, error: error.message, snapshot: deps.snapshots.getActiveSnapshot(), partialDataset: true });
      throw error;
    }
  }

  async function importSample() {
    const deps = requireDependencies();
    const preview = await deps.mapper.preview(deps.mapper.samplePayload(), { filename: 'sample-companion-payload.json' });
    return importTeams(preview, { simulated: true });
  }

  function diagnostics() {
    const deps = dependencies();
    return freeze({
      service: 'leagueCompanionTeamsImporter',
      version: VERSION,
      mapperAvailable: Boolean(deps.mapper),
      snapshotManagerAvailable: Boolean(deps.snapshots),
      validationAvailable: Boolean(deps.validation),
      historyAvailable: Boolean(deps.history),
      eventIntegrationAvailable: Boolean(deps.events),
      teamsOnly: true,
      playersActivated: false,
      latestInstalled: latestResult?.installed ?? null,
      latestSnapshotId: latestResult?.snapshot?.id || null
    });
  }

  if (!HQ.defineModuleService) throw new Error('platform/core.js must load before companion-teams-importer.js.');
  HQ.defineModuleService('league', 'leagueCompanionTeamsImporter', {
    importTeams,
    importSample,
    getLatestResult: () => latestResult,
    diagnostics
  }, { replace: true, alias: 'leagueCompanionTeamsImporter' });
  HQ.manifest?.register?.({
    scope: 'module', module: 'league', id: 'league-companion-teams-importer', service: 'leagueCompanionTeamsImporter',
    script: 'league-engine/companion-teams-importer.js', version: VERSION,
    dependencies: ['leagueCompanionJsonMapper','leagueSnapshotManager','leagueValidationEngine','leagueImportState','leagueImportHistory','leagueDataEvents'],
    capabilities: ['teams-only-import','candidate-snapshot','validated-activation','failed-candidate-rejection','import-history','league-data-updated-event','partial-dataset-provenance']
  });
})();
