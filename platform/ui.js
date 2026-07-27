(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) {
    throw new Error('platform/core.js must load before platform/ui.js.');
  }

  const adapters = new Map();

  function registerAdapter(name, adapter) {
    const key = String(name || '').trim();
    if (!key) throw new TypeError('A UI adapter name is required.');
    if (!adapter || typeof adapter !== 'object') {
      throw new TypeError('A UI adapter object is required.');
    }
    adapters.set(key, adapter);
    HQ.events?.emit?.('ui-adapter-registered', { name: key });
    return () => adapters.delete(key);
  }

  function findMethod(methodName) {
    for (const adapter of Array.from(adapters.values()).reverse()) {
      if (typeof adapter?.[methodName] === 'function') {
        return adapter[methodName].bind(adapter);
      }
    }
    return null;
  }

  function toast(title, message, options = {}) {
    const method = findMethod('showToast');
    if (method) return method(title, message, options);

    HQ.events?.emit?.('ui-toast-requested', { title, message, options });
    console.info(`[Franchise HQ] ${title}: ${message}`);
    return null;
  }

  function openSimulationSelector(options = {}) {
    const method = findMethod('openSimulationSelector');
    if (method) return method(options);

    HQ.events?.emit?.('ui-simulation-selector-requested', options);
    return false;
  }

  function closeSimulationSelector(options = {}) {
    const method = findMethod('closeSimulationSelector');
    if (method) return method(options);
    HQ.events?.emit?.('ui-simulation-selector-close-requested', options);
    return false;
  }

  function getTeam(teamId) {
    if (!teamId) return null;
    const method = findMethod('getTeam');
    return method ? method(teamId) : null;
  }

  function getSimulationAccount() {
    const method = findMethod('getSimulationAccount');
    return method ? method() : (HQ.simulation?.getPerspective?.() || null);
  }

  function getSimulationTeam() {
    const directMethod = findMethod('getSimulationTeam');
    if (directMethod) return directMethod();
    const account = getSimulationAccount();
    if (!account?.teamId) return null;
    return getTeam(account.teamId) || HQ.simulation?.getTeam?.() || null;
  }

  function diagnostics() {
    return Object.freeze({
      adapters: Object.freeze(Array.from(adapters.keys())),
      hasToastAdapter: Boolean(findMethod('showToast')),
      hasSimulationSelectorAdapter: Boolean(findMethod('openSimulationSelector')),
      hasTeamAdapter: Boolean(findMethod('getTeam'))
    });
  }

  HQ.defineService('ui', {
    registerAdapter,
    toast,
    showToast: toast,
    openSimulationSelector,
    closeSimulationSelector,
    getTeam,
    getSimulationAccount,
    getSimulationTeam,
    diagnostics
  });
})();
