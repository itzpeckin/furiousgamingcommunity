(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  const VERSION = '5.9.3.8';
  const OWNER_HANDLE = String(document.querySelector('meta[name="franchise-hq-platform-owner-handle"]')?.content || 'Peckin').trim().toLowerCase();
  const TAB_KEY = 'franchisehq:platform-workspace:tab';
  const VALID_TABS = new Set([
    'overview','route-discovery','classification','team-mapper','player-mapper',
    'payload-inspector','schedule-mapper','statistics-mapper','snapshot-builder','snapshot-lifecycle','snapshot-verification',
    'certification','diagnostics'
  ]);

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const account = () => window.FGC_TRADE?.getCurrentAccount?.() || null;
  const normalize = value => String(value || '').trim().toLowerCase();

  function isPlatformOwner() {
    const identityService = HQ?.platformOwnerIdentity;
    if (identityService?.isPlatformOwner) return Boolean(identityService.isPlatformOwner());
    const current = account();
    return Boolean(current && String(current.id) === 'owner-tb');
  }

  function currentTab() {
    try {
      const value = sessionStorage.getItem(TAB_KEY) || 'overview';
      return VALID_TABS.has(value) ? value : 'overview';
    } catch {
      return 'overview';
    }
  }

  function setTab(tab) {
    const next = VALID_TABS.has(tab) ? tab : 'overview';
    try { sessionStorage.setItem(TAB_KEY, next); } catch {}
    const host = document.querySelector('[data-platform-workspace-host]');
    if (host) host.innerHTML = renderWorkspace(next);
    return next;
  }

  const servicePanel = (serviceName, fallbackTitle) => {
    const service = HQ?.[serviceName];
    if (service?.renderPanel) return service.renderPanel();
    return `<article class="card"><div class="card-header"><div><span class="eyebrow">Reserved workspace</span><h3>${esc(fallbackTitle)}</h3></div><span class="pill pill--neutral">Coming next</span></div><p>This workspace is reserved for the next mapper release. It is visible only to the Platform Owner.</p></article>`;
  };

  function overviewPanel() {
    const team = HQ?.leagueCompanionTeamMapper?.diagnostics?.() || {};
    const player = HQ?.leagueCompanionPlayerMapper?.diagnostics?.() || {};
    const discovery = HQ?.leagueCompanionRouteDiscovery?.diagnostics?.() || {};
    const classification = HQ?.leagueCompanionDatasetClassification?.diagnostics?.() || {};
    return `<section class="platform-overview-grid">
      <article class="card"><div class="card-header"><div><span class="eyebrow">Import Engine</span><h3>Workspace Overview</h3></div><span class="pill pill--success">Owner only</span></div><p>All mapper, discovery, certification, and diagnostic controls are isolated from Commissioner HQ.</p><div class="league-import-framework-grid"><div><span>Captured Routes</span><strong>${discovery.routeCount ?? '—'}</strong></div><div><span>Inspected Routes</span><strong>${classification.inspectedRouteCount ?? '—'}</strong></div><div><span>Mapped Teams</span><strong>${team.teamCount ?? '—'}</strong></div><div><span>Mapped Players</span><strong>${player.playerCount ?? '—'}</strong></div></div></article>
      <article class="card"><div class="card-header"><div><span class="eyebrow">Access Boundary</span><h3>Platform Owner</h3></div><span class="pill pill--success">${esc(account()?.handle || 'Verified')}</span></div><p>This workspace is rendered only when the active authenticated simulation resolves to the configured Platform Owner handle.</p><div class="league-import-framework-note"><svg><use href="#icon-lock"></use></svg><span>Commissioners, committee members, and league members do not receive this navigation item or workspace content.</span></div></article>
      <article class="card"><div class="card-header"><div><span class="eyebrow">Product States</span><h3>League Experience</h3></div><span class="pill pill--neutral">Permanent model</span></div><div class="league-import-framework-grid"><div><span>Empty State</span><strong>Default onboarding</strong></div><div><span>Demo State</span><strong>Evaluation data</strong></div><div><span>Live Franchise</span><strong>Validated exports</strong></div></div></article>
    </section>`;
  }

  function diagnosticsPanel() {
    return `${servicePanel('leagueCloudPlatformFoundation','Cloud Platform Diagnostics')}${servicePanel('leagueDeveloperMode','Developer Mode')}${servicePanel('leagueImportFrameworkUI','Import Framework Certification')}`;
  }

  function contentFor(tab) {
    switch (tab) {
      case 'route-discovery': return servicePanel('leagueCompanionRouteDiscovery','Route Discovery');
      case 'classification': return servicePanel('leagueCompanionDatasetClassification','Dataset Classification');
      case 'team-mapper': return servicePanel('leagueCompanionTeamMapper','Team Mapper');
      case 'player-mapper': return servicePanel('leagueCompanionPlayerMapper','Player Mapper');
      case 'payload-inspector': return servicePanel('leagueDataExplorer','Data Explorer & Payload Inspector');
      case 'schedule-mapper': return servicePanel('leagueCompanionScheduleMapper','Schedule Mapper');
      case 'statistics-mapper': return servicePanel('leagueCompanionStatisticsMapper','Statistics Mapper');
      case 'snapshot-builder': return servicePanel('leagueSnapshotBuilder','Snapshot Builder');
      case 'snapshot-lifecycle': return servicePanel('snapshotLifecycle','Validation & Activation');
      case 'snapshot-verification': return servicePanel('snapshotVerification','Snapshot Verification');
      case 'certification': return `${servicePanel('leagueImportFrameworkUI','Import Framework Certification')}${servicePanel('leagueCompanionImportUI','Companion Import Certification')}`;
      case 'diagnostics': return diagnosticsPanel();
      default: return overviewPanel();
    }
  }

  const tabs = [
    ['overview','Overview'],['route-discovery','Route Discovery'],['classification','Dataset Classification'],
    ['team-mapper','Team Mapper'],['player-mapper','Player Mapper'],['payload-inspector','Payload Inspector'],
    ['schedule-mapper','Schedule Mapper'],['statistics-mapper','Statistics Mapper'],['snapshot-builder','Snapshot Builder'],['snapshot-lifecycle','Validation & Activation'],['snapshot-verification','Snapshot Verification'],
    ['certification','Certification'],['diagnostics','Diagnostics']
  ];

  function renderWorkspace(tab = currentTab()) {
    if (!isPlatformOwner()) return renderNotFound();
    const active = VALID_TABS.has(tab) ? tab : 'overview';
    return `<section class="platform-workspace" data-platform-workspace>
      <div class="page-heading platform-workspace-heading"><div><span class="eyebrow">Private platform operations</span><h1>Platform Workspace</h1><p>Import engine development, payload inspection, certification, and diagnostics. Visible only to the Platform Owner.</p></div><span class="pill pill--success">Owner: ${esc(account()?.handle || OWNER_HANDLE)}</span></div>
      <div class="platform-workspace-layout">
        <nav class="platform-workspace-tabs" aria-label="Platform Workspace tools">${tabs.map(([id,label])=>`<button type="button" class="platform-workspace-tab ${id===active?'is-active':''}" data-platform-tab="${id}" aria-pressed="${id===active?'true':'false'}">${esc(label)}</button>`).join('')}</nav>
        <main class="platform-workspace-panel" data-platform-workspace-panel>${contentFor(active)}</main>
      </div>
    </section>`;
  }

  function renderNotFound() {
    return `<section class="empty-state-card card" data-platform-not-found><span class="eyebrow">404</span><h1>Page not found</h1><p>The requested page does not exist.</p><a class="button button--primary" href="#home" data-route="home">Return Home</a></section>`;
  }

  function syncVisibility() {
    const allowed = isPlatformOwner();
    document.querySelectorAll('[data-platform-owner-only]').forEach(node => {
      node.hidden = !allowed;
      node.setAttribute('aria-hidden', String(!allowed));
    });
    return allowed;
  }

  document.addEventListener('click', event => {
    const workspaceLink = event.target.closest('[data-platform-owner-only]');
    if (workspaceLink) {
      if (!isPlatformOwner()) {
        event.preventDefault();
        location.hash = '#home';
        return;
      }
      setTimeout(() => window.FGC_TRADE?.renderPlatformWorkspace?.(), 0);
    }
    const tab = event.target.closest('[data-platform-tab]');
    if (tab) {
      event.preventDefault();
      if (!isPlatformOwner()) return;
      setTab(tab.dataset.platformTab);
      return;
    }
    if (event.target.closest('[data-login-account], [data-open-simulation], [data-simulation-account]')) {
      setTimeout(syncVisibility, 0);
    }
  });

  function enforceWorkspaceRoute() {
    syncVisibility();
    if (String(location.hash).toLowerCase().startsWith('#commissioner/platform-workspace')) {
      setTimeout(() => window.FGC_TRADE?.renderPlatformWorkspace?.(), 0);
    }
  }

  document.addEventListener('franchisehq:identity-changed', enforceWorkspaceRoute);
  window.addEventListener('hashchange', enforceWorkspaceRoute);
  window.addEventListener('DOMContentLoaded', () => setTimeout(enforceWorkspaceRoute, 0));
  setTimeout(enforceWorkspaceRoute, 0);

  function diagnostics() {
    return Object.freeze({
      service: 'platformWorkspace', version: VERSION, configuredOwnerHandle: OWNER_HANDLE, ownerIdentity: HQ?.platformOwnerIdentity?.diagnostics?.() || null,
      platformOwner: isPlatformOwner(), commissionerAccess: false, memberAccess: false,
      hiddenNavigation: true, isolatedTabs: true, activeTab: currentTab()
    });
  }

  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before platform-workspace.js.');
  HQ.defineModuleService('platform','platformWorkspace',{isPlatformOwner,currentTab,setTab,renderWorkspace,renderNotFound,syncVisibility,diagnostics},{replace:true,alias:'platformWorkspace'});
})();
