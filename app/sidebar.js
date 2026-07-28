(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before app/sidebar.js.');

  const STORAGE_KEY = 'franchisehq:ui:sidebar-scroll-top';
  let sidebar = null;
  let overlay = null;
  let saveTimer = null;
  let restoreTimer = null;
  let initialized = false;
  let desiredScrollTop = 0;

  function readSavedPosition() {
    return Math.max(0, Number(HQ.store?.getString?.(STORAGE_KEY, '0')) || 0);
  }

  function persist(source = 'sidebar') {
    if (!sidebar) return 0;
    desiredScrollTop = Math.max(0, sidebar.scrollTop || 0);
    HQ.store?.setString?.(STORAGE_KEY, String(desiredScrollTop), { source });
    return desiredScrollTop;
  }

  function restore(options = {}) {
    if (!sidebar) return 0;
    const target = options.position == null ? readSavedPosition() : Math.max(0, Number(options.position) || 0);
    desiredScrollTop = target;
    clearTimeout(restoreTimer);

    // Navigation highlighting and Trade Center initialization can alter sidebar
    // geometry after the first paint. Restore across multiple frames and once
    // after layout settles so refresh does not snap back to the top.
    requestAnimationFrame(() => {
      sidebar.scrollTop = target;
      requestAnimationFrame(() => {
        sidebar.scrollTop = target;
        restoreTimer = setTimeout(() => {
          sidebar.scrollTop = target;
        }, options.delay ?? 140);
      });
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

  function init(options = {}) {
    if (initialized) return diagnostics();
    sidebar = options.sidebar || document.querySelector('[data-sidebar]');
    overlay = options.overlay || document.querySelector('[data-mobile-overlay]');
    if (!sidebar) return diagnostics();

    desiredScrollTop = readSavedPosition();
    sidebar.addEventListener('scroll', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => persist('sidebar-scroll'), 100);
    }, { passive: true });

    window.addEventListener('pagehide', () => {
      clearTimeout(saveTimer);
      persist('pagehide');
    });

    HQ.events?.on?.('navigation-changed', () => close());
    HQ.events?.on?.('navigation-rendered', () => {
      close();
      restore({ position: desiredScrollTop });
    });
    HQ.events?.on?.('app-route-rendered', () => restore({ position: desiredScrollTop }));

    initialized = true;
    close();
    restore({ position: desiredScrollTop, delay: 180 });
    return diagnostics();
  }

  function diagnostics() {
    return {
      initialized,
      hasSidebar: Boolean(sidebar),
      hasOverlay: Boolean(overlay),
      savedScrollTop: readSavedPosition(),
      currentScrollTop: sidebar?.scrollTop || 0,
      open: Boolean(sidebar?.classList.contains('is-open'))
    };
  }

  HQ.defineService('sidebar', {
    init,
    open,
    close,
    persist,
    restore,
    diagnostics
  });
})();
