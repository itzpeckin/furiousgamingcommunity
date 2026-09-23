(() => {
  'use strict';

  const RELEASE = '8.0.8.1';
  const root = document.querySelector('[data-platform-admin-root]');
  const loading = document.querySelector('[data-platform-admin-loading]');
  const section = document.body.dataset.platformAdminSection || 'overview';
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[character]));

  const liveLeague = league => league.tenantStatus === 'enabled' && league.publicStatus === 'active';
  const statusClass = league => liveLeague(league) ? 'live' : league.tenantStatus === 'suspended' ? 'suspended' : 'setup';
  const statusLabel = league => liveLeague(league) ? 'Live' : league.tenantStatus === 'suspended' ? 'Suspended' : 'Setup';
  const activePlan = plan => !plan.activatedAt && !['cancelled'].includes(plan.status);

  async function load() {
    const response = await fetch('/api/platform/onboarding',{ credentials:'same-origin',cache:'no-store',headers:{ accept:'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.error || `Platform status could not be loaded (HTTP ${response.status}).`);
    return payload;
  }

  function leagueCard(league, diagnostics = false) {
    const phase = league.currentSeason && league.currentWeek ? `Season ${league.currentSeason} · Week ${league.currentWeek}` : 'Season data not available';
    const snapshot = league.activeSnapshotId ? 'Active Madden data' : 'No active Madden data';
    const href = diagnostics
      ? `/leagues/${encodeURIComponent(league.slug)}#commissioner/platform-workspace`
      : `/leagues/${encodeURIComponent(league.slug)}`;
    return `<article class="admin-league-card">
      <div class="admin-league-mark">${esc(league.name.split(/\s+/).map(word => word[0]).join('').slice(0,2).toUpperCase() || 'FH')}</div>
      <div><h3>${esc(league.name)}</h3><p>${esc(phase)} · ${esc(league.activeMembers)} active member${league.activeMembers === 1 ? '' : 's'} · ${snapshot}</p></div>
      <div class="admin-league-card__actions"><span class="status status--${statusClass(league)}">${statusLabel(league)}</span>${liveLeague(league) ? `<a class="button button--ghost" href="${href}">${diagnostics ? 'Open diagnostics' : 'Open league'}</a>` : ''}</div>
    </article>`;
  }

  function healthPanel(data) {
    const leagues = data.leagues || [];
    const live = leagues.filter(liveLeague);
    const missingData = live.filter(league => !league.activeSnapshotId);
    const disconnected = live.filter(league => !league.discordConnected);
    return `<article class="card admin-health">
      <div><span class="eyebrow">Cross-league status</span><h3 style="margin:6px 0 0">Platform Health</h3></div>
      <div class="admin-health-row"><span class="admin-health-dot"></span><div><strong>Owner access is protected</strong><small>This console is available only to the configured Platform Owner.</small></div></div>
      <div class="admin-health-row"><span class="admin-health-dot ${missingData.length ? 'admin-health-dot--warning' : ''}"></span><div><strong>${missingData.length ? `${missingData.length} live league${missingData.length === 1 ? '' : 's'} without active Madden data` : 'Every live league has active Madden data'}</strong><small>${missingData.length ? missingData.map(item => item.name).join(', ') : 'Current league pages can read an activated snapshot.'}</small></div></div>
      <div class="admin-health-row"><span class="admin-health-dot ${disconnected.length ? 'admin-health-dot--warning' : ''}"></span><div><strong>${disconnected.length ? `${disconnected.length} live league${disconnected.length === 1 ? '' : 's'} without Discord` : 'Discord connections are present'}</strong><small>Discord is optional; this is informational and does not block league access.</small></div></div>
      <div class="admin-divider"></div>
      <a class="button button--secondary" href="/platform-admin/diagnostics">Open Advanced Diagnostics</a>
    </article>`;
  }

  function overview(data) {
    const leagues = data.leagues || [];
    const live = leagues.filter(liveLeague).length;
    const setup = leagues.length - live;
    const pending = (data.plans || []).filter(activePlan).length;
    return `<section class="admin-page" data-platform-admin-overview>
      <header class="admin-hero"><div><span class="eyebrow">Owner-only platform operations · ${RELEASE}</span><h1>Run FranchiseHQ.</h1><p>Manage league activation and see every tenant from one platform-level console. League imports, rules, teams, and weekly operations stay inside each league.</p></div><div class="admin-hero__actions"><a class="button button--primary" href="#league-onboarding">Add a league</a><a class="button button--ghost" href="/leagues">Open league selector</a></div></header>
      <section class="admin-summary" aria-label="Platform summary">
        <article class="admin-stat"><span>Total leagues</span><strong>${leagues.length}</strong><small>Every retained tenant</small></article>
        <article class="admin-stat"><span>Live</span><strong>${live}</strong><small>Enabled and public</small></article>
        <article class="admin-stat"><span>In setup</span><strong>${setup}</strong><small>Not visible to members</small></article>
        <article class="admin-stat"><span>Onboarding queue</span><strong>${pending}</strong><small>Draft or activation work</small></article>
      </section>
      <section class="admin-grid">
        <div class="admin-section"><div class="section-heading"><div><span class="eyebrow">League directory</span><h2>All Leagues</h2><p>Open a live league for its normal commissioner work.</p></div></div><div class="admin-league-list">${leagues.length ? leagues.map(league => leagueCard(league)).join('') : '<div class="admin-empty">No league tenants are registered.</div>'}</div></div>
        ${healthPanel(data)}
      </section>
      <section class="admin-section" id="league-onboarding"><div class="section-heading"><div><span class="eyebrow">Registration and activation</span><h2>League Onboarding</h2><p>Prepare and activate new leagues without entering an existing league.</p></div></div><div data-platform-onboarding-host></div></section>
    </section>`;
  }

  function diagnostics(data) {
    const leagues = data.leagues || [];
    return `<section class="admin-page" data-platform-admin-diagnostics>
      <header class="admin-hero"><div><span class="eyebrow">Private support tools · ${RELEASE}</span><h1>Advanced Diagnostics</h1><p>Use these tools only when a league needs import or data troubleshooting. They remain isolated from normal commissioner navigation.</p></div><div class="admin-hero__actions"><a class="button button--ghost" href="/platform-admin">Back to Platform Admin</a></div></header>
      <div class="admin-note"><strong>Choose the affected league first.</strong> Diagnostics open in that league's protected context so no tool can silently assume FGC, P2W, or another tenant.</div>
      <section class="admin-diagnostics-grid">${leagues.length ? leagues.map(league => `<article class="card admin-diagnostic-card"><div><span class="eyebrow">${esc(league.slug)}</span><h3>${esc(league.name)}</h3></div><p>${liveLeague(league) ? 'Open the retained import inspectors, mapping evidence, snapshot verification, and support diagnostics for this league.' : 'This tenant is not live. Activate it through Platform Admin before using league diagnostics.'}</p>${liveLeague(league) ? `<a class="button button--secondary" href="/leagues/${encodeURIComponent(league.slug)}#commissioner/platform-workspace">Open league diagnostics</a>` : '<span class="status status--setup">Setup</span>'}</article>`).join('') : '<div class="admin-empty">No leagues are available for diagnostics.</div>'}</section>
    </section>`;
  }

  function mountOnboarding() {
    const host = document.querySelector('[data-platform-onboarding-host]');
    const service = window.FranchiseHQ?.platformOnboarding;
    if (host && service?.renderPanel) host.innerHTML = service.renderPanel();
  }

  load().then(data => {
    if (loading) loading.remove();
    root.innerHTML = section === 'diagnostics' ? diagnostics(data) : overview(data);
    if (section === 'overview') mountOnboarding();
  }).catch(error => {
    if (loading) loading.remove();
    root.innerHTML = `<div class="admin-error" role="alert"><strong>Platform Admin could not load.</strong><br>${esc(error.message)} Refresh once. If this continues, use the normal league selector while support reviews the platform request.</div>`;
  });
})();
