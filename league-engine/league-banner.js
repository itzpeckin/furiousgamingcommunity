(function initializeLeagueDataBanner(global) {
  'use strict';

  const FranchiseHQ = global.FranchiseHQ = global.FranchiseHQ || {};

  function activeSource() {
    const source = FranchiseHQ.leagueData?.currentSource?.();
    if (source) return source;

    const status = FranchiseHQ.leagueData?.status?.();
    if (!status) return null;
    return {
      mode: status.activeMode,
      sourceType: status.isLive ? 'madden-companion' : status.isDemo ? 'development' : 'none',
      authoritative: status.isLive === true,
      available: status.isEmpty !== true
    };
  }

  function presentation() {
    const source = activeSource();
    if (!source) return null;

    const mode = String(source.mode || '').toLowerCase();
    const live = mode === 'live' || source.authoritative === true || source.sourceType === 'madden-companion';
    if (live) return null;

    const empty = mode === 'empty' || source.available === false || source.sourceType === 'none';
    return Object.freeze({
      mode: empty ? 'empty' : 'demo',
      variant: empty ? 'empty' : 'development',
      badge: empty ? 'NO DATA' : 'SAMPLE DATA',
      title: empty ? 'No League Loaded' : 'Development Mode',
      copy: empty
        ? 'No league data is currently loaded.'
        : 'You are viewing sample league data used for development and testing.',
      icon: empty ? 'icon-info' : 'icon-settings'
    });
  }

  function globalMarkup(model, canManage) {
    return `<aside class="league-data-global-banner league-data-global-banner--${model.variant}" role="status" aria-live="polite" data-league-data-banner-instance="global">
      <span class="league-data-global-banner__icon"><svg><use href="#${model.icon}"></use></svg></span>
      <div class="league-data-global-banner__copy"><span>${model.badge}</span><strong>${model.title}</strong><p>${model.copy}</p></div>
      ${canManage ? '<button class="button button--ghost button--small" data-route="commissioner/league-data">Manage source</button>' : ''}
    </aside>`;
  }

  function inlineMarkup(model) {
    return `<aside class="player-data-source-notice player-data-source-notice--${model.variant}" role="status" data-league-data-banner-instance="player-card">
      <span class="player-data-source-notice__icon"><svg><use href="#${model.icon}"></use></svg></span>
      <div><span>${model.badge}</span><strong>${model.title}</strong><p>${model.copy}</p></div>
    </aside>`;
  }

  function renderGlobal(options = {}) {
    const host = options.host || global.document?.querySelector?.('[data-league-data-global-banner]');
    if (!host) return false;

    const model = presentation();
    if (!model) {
      host.replaceChildren();
      host.hidden = true;
      delete host.dataset.bannerSignature;
      return false;
    }

    const canManage = options.canManage === true;
    const signature = `${model.mode}:${canManage ? 'manage' : 'read'}`;
    host.hidden = false;
    if (host.dataset.bannerSignature !== signature || host.querySelectorAll('[data-league-data-banner-instance="global"]').length !== 1) {
      host.innerHTML = globalMarkup(model, canManage);
      host.dataset.bannerSignature = signature;
    }
    return true;
  }

  function renderInline() {
    const model = presentation();
    return model ? inlineMarkup(model) : '';
  }

  const bannerService = Object.freeze({
    version: '5.4.12a',
    activeSource,
    presentation,
    renderGlobal,
    renderInline
  });

  if (typeof FranchiseHQ.defineModuleService === 'function') {
    FranchiseHQ.defineModuleService(
      'league',
      'leagueDataBanner',
      bannerService,
      { alias: 'leagueDataBanner', replace: true }
    );
  } else {
    FranchiseHQ.leagueDataBanner = bannerService;
  }
})(window);
