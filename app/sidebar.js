(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before app/sidebar.js.');

  const STORAGE_KEY = 'franchisehq:ui:sidebar-nav-scroll-top';
  let sidebar = null;
  let scrollContainer = null;
  let overlay = null;
  let saveTimer = null;
  let restoreTimers = [];
  let initialized = false;
  let desiredScrollTop = 0;

  function readSavedPosition() {
    return Math.max(0, Number(HQ.store?.getString?.(STORAGE_KEY, '0')) || 0);
  }

  function clearRestoreTimers() {
    restoreTimers.forEach((timer) => clearTimeout(timer));
    restoreTimers = [];
  }

  function persist(source = 'sidebar') {
    if (!scrollContainer) return 0;
    desiredScrollTop = Math.max(0, scrollContainer.scrollTop || 0);
    HQ.store?.setString?.(STORAGE_KEY, String(desiredScrollTop), { source });
    return desiredScrollTop;
  }

  function applyPosition(target) {
    if (!scrollContainer) return;
    scrollContainer.scrollTop = target;
  }

  function ensureActiveRouteVisible(options = {}) {
    if (!scrollContainer) return false;
    const route = (location.hash.slice(1) || 'home').split('/')[0];
    const active = scrollContainer.querySelector(`[data-route="${CSS.escape(route)}"]`) ||
      scrollContainer.querySelector('.nav-item.is-active');
    if (!active) return false;

    const containerRect = scrollContainer.getBoundingClientRect();
    const itemRect = active.getBoundingClientRect();
    const padding = options.padding ?? 18;
    if (itemRect.top < containerRect.top + padding) {
      scrollContainer.scrollTop -= (containerRect.top + padding - itemRect.top);
    } else if (itemRect.bottom > containerRect.bottom - padding) {
      scrollContainer.scrollTop += (itemRect.bottom - (containerRect.bottom - padding));
    }
    desiredScrollTop = scrollContainer.scrollTop;
    return true;
  }

  function restore(options = {}) {
    if (!scrollContainer) return 0;
    const target = options.position == null ? readSavedPosition() : Math.max(0, Number(options.position) || 0);
    desiredScrollTop = target;
    clearRestoreTimers();

    // The scrollable element is the navigation list, not the sidebar shell.
    // Reapply after route rendering and Trade Center initialization, then make
    // the active route visible without snapping the navigation back to the top.
    requestAnimationFrame(() => {
      applyPosition(target);
      requestAnimationFrame(() => applyPosition(target));
    });

    [120, 320, 700].forEach((delay) => {
      restoreTimers.push(setTimeout(() => {
        applyPosition(target);
        if (options.ensureActive !== false) ensureActiveRouteVisible();
      }, delay));
    });
    return target;
  }

  function open() {
    if (!sidebar || !overlay) return false;
    document.body.classList.add('sidebar-open');
    sidebar.classList.add('is-open');
    overlay.hidden = false;
    overlay.classList.add('is-open');
    requestAnimationFrame(() => overlay.classList.add('is-visible'));
    document.body.style.overflow = 'hidden';
    return true;
  }

  function close() {
    if (!sidebar || !overlay) return false;
    document.body.classList.remove('sidebar-open');
    sidebar.classList.remove('is-open');
    overlay.classList.remove('is-open', 'is-visible');
    overlay.hidden = true;
    if (!document.querySelector('.modal.is-open, [data-command-modal].is-open, [data-style-panel].is-open, [data-detail-modal].is-open')) {
      document.body.style.overflow = '';
    }
    return true;
  }

  function settleNavigation(source = 'navigation-settled') {
    restore({ position: desiredScrollTop, ensureActive: true });
    restoreTimers.push(setTimeout(() => persist(source), 760));
  }

  function init(options = {}) {
    if (initialized) return diagnostics();
    sidebar = options.sidebar || document.querySelector('[data-sidebar]');
    scrollContainer = options.scrollContainer || sidebar?.querySelector('[data-nav-list]') || null;
    overlay = options.overlay || document.querySelector('[data-mobile-overlay]');
    if (!sidebar || !scrollContainer) return diagnostics();

    desiredScrollTop = readSavedPosition();
    scrollContainer.addEventListener('scroll', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => persist('sidebar-nav-scroll'), 80);
    }, { passive: true });

    window.addEventListener('pagehide', () => {
      clearTimeout(saveTimer);
      persist('pagehide');
    });

    HQ.events?.on?.('navigation-changed', () => close());
    HQ.events?.on?.('navigation-rendered', () => { close(); settleNavigation('navigation-rendered'); });
    HQ.events?.on?.('app-route-rendered', () => settleNavigation('app-route-rendered'));
    HQ.events?.on?.('trade-after-render', () => settleNavigation('trade-after-render'));
    HQ.events?.on?.('trade-ready', () => settleNavigation('trade-ready'));

    initialized = true;
    close();
    restore({ position: desiredScrollTop, ensureActive: true });
    return diagnostics();
  }

  function diagnostics() {
    return {
      initialized,
      hasSidebar: Boolean(sidebar),
      hasScrollContainer: Boolean(scrollContainer),
      scrollContainer: scrollContainer?.matches?.('[data-nav-list]') ? 'nav-list' : null,
      hasOverlay: Boolean(overlay),
      savedScrollTop: readSavedPosition(),
      currentScrollTop: scrollContainer?.scrollTop || 0,
      desiredScrollTop,
      activeRoute: (location.hash.slice(1) || 'home').split('/')[0],
      open: Boolean(sidebar?.classList.contains('is-open'))
    };
  }

  HQ.defineService('sidebar', {
    init,
    open,
    close,
    persist,
    restore,
    ensureActiveRouteVisible,
    diagnostics
  });
})();
