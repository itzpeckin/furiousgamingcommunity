(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService || !HQ?.validate) {
    throw new Error('League module services and platform validation must load before foundation-completion.js.');
  }

  const REQUIRED_SERVICES = Object.freeze([
    ['leagueDataState', 'League Data State'],
    ['leagueDataBanner', 'League Data Banner'],
    ['emptyState', 'Empty-State Framework'],
    ['statusWidget', 'Commissioner Status Widget']
  ]);

  function badgeModel() {
    const state = HQ.leagueData?.getStatus?.() || HQ.leagueData?.status?.() || {};
    if (state.isLive) return Object.freeze({ label: 'Healthy', tone: 'success', mode: 'live' });
    if (state.isDemo) return Object.freeze({ label: 'Development', tone: 'accent', mode: 'demo' });
    if (state.isEmpty) return Object.freeze({ label: 'Import Required', tone: 'warning', mode: 'empty' });
    return Object.freeze({ label: 'Warning', tone: 'danger', mode: state.activeMode || 'unknown' });
  }

  function importStatus() {
    const state = HQ.leagueData?.getStatus?.() || HQ.leagueData?.status?.() || {};
    const source = HQ.leagueData?.currentSource?.() || {};
    const available = state.hasLiveSnapshot === true;
    return Object.freeze({
      name: 'Madden Companion Import',
      status: available ? 'Snapshot Available' : 'Coming Soon',
      tone: available ? 'success' : 'neutral',
      availability: available ? 'A verified live snapshot is available.' : 'Available in Version 6.0',
      lastImport: state.isLive && state.importedAt ? state.importedAt : 'Never',
      snapshotId: available ? (source.snapshotId || state.importId || 'Available') : null,
      actionEnabled: false,
      actionLabel: 'Import Madden Data',
      actionReason: 'The commissioner-facing Madden importer is planned for Version 6.0.'
    });
  }

  function serviceChecks() {
    return Object.freeze(Object.fromEntries(REQUIRED_SERVICES.map(([service]) => [
      service,
      HQ.hasModuleService?.('league', service) === true
    ])));
  }

  function eventChecks() {
    const diagnostics = HQ.leagueData?.diagnostics?.()?.normalizedEvents || {};
    const failed = diagnostics.failed || {};
    return Object.freeze({
      registered: Boolean(HQ.events?.on && HQ.events?.emit),
      modeChannelHealthy: Number(failed.mode || 0) === 0,
      dataChannelHealthy: Number(failed.data || 0) === 0,
      stateChannelHealthy: Number(failed.state || 0) === 0,
      lastFailure: diagnostics.lastFailure || null
    });
  }

  function foundationStatus() {
    const state = HQ.leagueData?.getStatus?.() || HQ.leagueData?.status?.() || {};
    const persistence = state.persistence || {};
    const services = serviceChecks();
    const events = eventChecks();
    const checks = Object.freeze({
      leagueDataRegistered: HQ.hasModuleService?.('league', 'leagueDataState') === true,
      validMode: ['empty', 'demo', 'live'].includes(state.activeMode),
      safeEmptyDefault: ['empty', 'demo', 'live'].includes(persistence.lastPersistedMode || 'empty'),
      persistenceAvailable: persistence.available === true,
      publicApi: ['getMode','getStatus','isDevelopment','isEmpty','isLive','canLoadLeague','currentSource']
        .every((name) => typeof HQ.leagueData?.[name] === 'function'),
      bannerRegistered: services.leagueDataBanner === true,
      emptyStateRegistered: services.emptyState === true,
      statusWidgetRegistered: services.statusWidget === true,
      eventsHealthy: events.registered && events.modeChannelHealthy && events.dataChannelHealthy && events.stateChannelHealthy,
      repositoryProtected: HQ.leagueData?.diagnostics?.()?.compliant === true,
      importStatusRegistered: typeof importStatus === 'function'
    });
    const failedChecks = Object.freeze(Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name));
    return Object.freeze({
      certified: failedChecks.length === 0,
      epic: '5.4',
      version: '5.4.12',
      readiness: failedChecks.length === 0 ? 'Roster Engine Ready' : 'Action Required',
      activeMode: state.activeMode || 'unknown',
      checks,
      failedChecks,
      services,
      events,
      persistence: Object.freeze({ ...persistence }),
      generatedAt: new Date().toISOString()
    });
  }

  function diagnostics() {
    return Object.freeze({
      service: 'leagueDataFoundation',
      version: '5.4.12',
      badge: badgeModel(),
      importStatus: importStatus(),
      foundation: foundationStatus(),
      leagueData: HQ.leagueData?.diagnostics?.() || null,
      validation: HQ.validate?.diagnostics?.() || null
    });
  }

  const service = HQ.defineModuleService('league', 'foundation', {
    version: '5.4.12',
    badgeModel,
    importStatus,
    foundationStatus,
    diagnostics
  }, { alias: 'leagueDataFoundation', replace: true });

  HQ.validate.register({
    id: 'league-data-foundation',
    name: 'League Data Foundation 5.4 Certification',
    version: '5.4.12',
    tests: [
      { id: 'valid-league-mode', name: 'Valid League Data mode', run: ({ assert }) => { const s=HQ.leagueData.getStatus(); assert(['empty','demo','live'].includes(s.activeMode), 'Active League Data mode is invalid.', s); return { details: s.activeMode }; } },
      { id: 'persistent-mode-storage', name: 'Persistent mode storage available', run: ({ assert }) => { const p=HQ.leagueData.getStatus().persistence; assert(p?.available===true, 'League Data persistence is unavailable.', p); return { details: p }; } },
      { id: 'empty-state-registered', name: 'Empty-State Framework registered', run: ({ assert }) => { assert(HQ.hasModuleService('league','emptyState'), 'Empty-State Framework is not registered.'); return { details: HQ.leagueEmptyState?.definitions || null }; } },
      { id: 'development-banner-registered', name: 'League Data banner registered', run: ({ assert }) => { assert(HQ.hasModuleService('league','leagueDataBanner'), 'League Data banner is not registered.'); return { details: HQ.leagueDataBanner?.presentation?.() || 'live-suppressed' }; } },
      { id: 'status-widget-registered', name: 'Commissioner status widget registered', run: ({ assert }) => { assert(HQ.hasModuleService('league','statusWidget'), 'Status widget is not registered.'); return { details: HQ.leagueStatusWidget?.model?.() || null }; } },
      { id: 'public-api-compatible', name: 'Public League Data API compatible', run: ({ assert }) => { const names=['getMode','getStatus','isDevelopment','isEmpty','isLive','canLoadLeague','currentSource']; const missing=names.filter(n=>typeof HQ.leagueData?.[n]!=='function'); assert(missing.length===0, 'Public League Data API methods are missing.', missing); return { details: names }; } },
      { id: 'league-events-healthy', name: 'League Data events healthy', run: ({ assert }) => { const e=eventChecks(); assert(e.registered && e.modeChannelHealthy && e.dataChannelHealthy && e.stateChannelHealthy, 'League Data event delivery is unhealthy.', e); return { details: e }; } },
      { id: 'live-repository-protected', name: 'Live Madden repository authority preserved', run: ({ assert }) => { const d=HQ.leagueData.diagnostics(); assert(d.compliant===true, 'League Data repository authority is not compliant.', d); return { details: d.repository }; } },
      { id: 'foundation-certified', name: 'League Data Foundation certified', run: ({ assert }) => { const f=foundationStatus(); assert(f.certified===true, 'League Data Foundation is not certified.', f); return { details: f }; } }
    ]
  });

  HQ.manifest?.register?.({
    scope: 'module', module: 'league', id: 'league-data-foundation', service: 'foundation',
    script: 'league-engine/foundation-completion.js', version: '5.4.12',
    dependencies: ['leagueDataState','leagueDataBanner','emptyState','statusWidget'],
    capabilities: ['navigation-status','import-status','validation','diagnostics','foundation-certification']
  });
})();
