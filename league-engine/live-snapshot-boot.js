(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  const VERSION = '7.3.8';
  let running = null;
  let lastResult = null;
  let lastError = null;

  const now = () => new Date().toISOString();

  function buildRepositoryReference(summary) {
    const snapshot = summary?.snapshot || {};
    const league = summary?.league || {};
    return {
      version: VERSION,
      source: {
        source: 'madden',
        type: 'madden-companion',
        sourceType: 'madden-companion',
        importId: snapshot.id,
        snapshotId: snapshot.id,
        importedAt: snapshot.activatedAt || snapshot.createdAt || now(),
        authoritative: true,
        remoteBacked: true
      },
      league: {
        id: league.id || null,
        slug: league.slug || null,
        name: league.name || null,
        displayName: league.name || null,
        seasonYear: snapshot.seasonYear ?? null,
        weekIndex: snapshot.weekIndex ?? null
      },
      availability: {
        officialMaddenImport: true,
        demoData: false,
        emptyState: false,
        remoteReadModel: true
      },
      metadata: {
        snapshotId: snapshot.id,
        status: snapshot.status || 'live',
        activatedAt: snapshot.activatedAt || null,
        domainCounts: {...(summary?.domains || {})}
      },
      teams: [], franchises: [], owners: [], players: [], rosters: [], games: [], standings: [], stats: [], contracts: [], injuries: [], draftPicks: []
    };
  }

  function rerenderCurrentRoute() {
    const deepPath = String(location.pathname || '').match(/^\/leagues\/[^/]+\/(teams|players)\/([^/]+)\/?$/i);
    let route = '';
    if (deepPath) {
      try {
        route = `${deepPath[1].toLowerCase()}/${decodeURIComponent(deepPath[2])}`;
      } catch (_) {
        route = '';
      }
    }
    route = route
      || HQ?.navigation?.currentRoute?.()
      || String(location.hash || '#home').replace(/^#\/?/, '')
      || 'home';
    setTimeout(() => {
      try {
        HQ?.appRouter?.render?.(route, {source:'live-snapshot-boot'});
      } catch (error) {
        console.warn('[Live Snapshot Boot] Route refresh skipped.', error);
      }
      try {
        window.dispatchEvent(new CustomEvent('franchisehq:live-snapshot-booted', {detail:lastResult}));
      } catch (_) {}
    }, 0);
  }

  async function boot({force=false} = {}) {
    if (running && !force) return running;
    running = (async () => {
      lastError = null;
      const liveData = HQ?.liveData;
      const repository = HQ?.leagueRepository;
      const leagueData = HQ?.leagueData;
      if (!liveData?.refresh || !repository?.install || !leagueData?.setMode) {
        throw new Error('Live Snapshot Boot dependencies are not available.');
      }

      const summary = await liveData.refresh();
      if (String(summary?.state || '').toLowerCase() !== 'live' || !summary?.snapshot?.id) {
        lastResult = Object.freeze({
          ok: true,
          version: VERSION,
          state: 'empty',
          snapshotId: null,
          changed: false,
          checkedAt: now()
        });
        return lastResult;
      }

      const activeId = String(summary.snapshot.id);
      const installedId = String(repository.current?.()?.source?.snapshotId || repository.current?.()?.source?.importId || '');
      if (installedId !== activeId) {
        repository.install(buildRepositoryReference(summary), {validated:true});
      }

      const before = leagueData.status?.();
      if (before?.requestedMode !== 'live' || before?.activeMode !== 'live') {
        leagueData.setMode('live');
      }

      lastResult = Object.freeze({
        ok: true,
        version: VERSION,
        state: 'live',
        snapshotId: activeId,
        changed: installedId !== activeId || before?.activeMode !== 'live',
        domains: Object.freeze({...summary.domains}),
        checkedAt: now()
      });

      console.info('[Live Snapshot Boot]', lastResult);
      rerenderCurrentRoute();
      return lastResult;
    })().catch(error => {
      lastError = error;
      console.error('[Live Snapshot Boot]', error);
      throw error;
    }).finally(() => {
      running = null;
    });
    return running;
  }

  function diagnostics() {
    return Object.freeze({
      service: 'liveSnapshotBoot',
      version: VERSION,
      running: Boolean(running),
      lastResult,
      lastError: lastError?.message || null
    });
  }

  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before live-snapshot-boot.js.');
  HQ.defineModuleService('league', 'liveSnapshotBoot', {boot, diagnostics}, {replace:true, alias:'liveSnapshotBoot'});

  // Do not block application startup. The remote active snapshot is restored
  // immediately in parallel, then the current route is rendered again as Live.
  boot().catch(() => {});
})();
