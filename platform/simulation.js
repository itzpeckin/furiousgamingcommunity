(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) {
    throw new Error('platform/core.js must load before platform/simulation.js.');
  }

  function getPerspective() {
    return window.FGC_TRADE?.getCurrentAccount?.() || null;
  }

  function getTeam() {
    const perspective = getPerspective();
    if (!perspective?.teamId) return null;
    return window.FGC_APP?.teamById?.(perspective.teamId) || null;
  }

  function setPerspective(accountId) {
    if (!window.FGC_TRADE?.setUser) {
      return { ok: false, error: 'The prototype simulation adapter is not ready.' };
    }

    window.FGC_TRADE.setUser(accountId);
    const detail = { perspective: getPerspective(), team: getTeam() };
    HQ.events?.emit?.('simulation-changed', detail);
    return { ok: true, ...detail };
  }

  function isActive() {
    return Boolean(getPerspective());
  }

  function getRole() {
    return getPerspective()?.role || null;
  }

  function snapshot() {
    return Object.freeze({
      active: isActive(),
      perspective: getPerspective(),
      team: getTeam(),
      role: getRole()
    });
  }

  HQ.defineService('simulation', {
    getPerspective,
    getTeam,
    setPerspective,
    isActive,
    getRole,
    getSnapshot: snapshot
  });
})();
