(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  const dataStore = HQ?.store;
  if (!HQ?.defineService) {
    throw new Error('platform/core.js must load before platform/simulation.js.');
  }

  const ROLE_KEY = 'franchisehq-simulation-role';
  const LEGACY_ROLE_KEY = 'm1b-role';
  const ACCOUNT_KEY = 'franchisehq-simulation-account';
  const VALID_ROLES = new Set(['commissioner', 'owner', 'committee', 'guest']);

  function normalizeRole(role) {
    return VALID_ROLES.has(role) ? role : 'commissioner';
  }

  function initialRole() {
    const current = dataStore?.getString?.(ROLE_KEY, null);
    if (current) return normalizeRole(current);

    const legacy = dataStore?.getString?.(LEGACY_ROLE_KEY, null);
    const migrated = normalizeRole(legacy);
    dataStore?.setString?.(ROLE_KEY, migrated, { source: 'simulation-migration' });
    return migrated;
  }

  let role = initialRole();
  let accountId = dataStore?.getString?.(ACCOUNT_KEY, null) || null;

  function getAccount() {
    const current = window.FGC_TRADE?.getCurrentAccount?.() || null;
    if (current) return current;
    if (!accountId) return null;
    return window.FGC_TRADE?.accounts?.find?.((account) => account.id === accountId) || null;
  }

  function getTeam() {
    const account = getAccount();
    if (!account?.teamId) return null;
    return window.FGC_APP?.teamById?.(account.teamId) || null;
  }

  function emitChange(source = 'simulation') {
    const detail = snapshot();
    if (HQ.events?.emit) {
      HQ.events.emit('simulation-changed', { ...detail, source });
    } else {
      window.dispatchEvent(new CustomEvent('franchisehq:simulation-changed', {
        detail: { ...detail, source }
      }));
    }
    return detail;
  }

  function setRole(nextRole, options = {}) {
    const normalized = normalizeRole(nextRole);
    const changed = normalized !== role;
    role = normalized;
    dataStore?.setString?.(ROLE_KEY, role, { source: 'simulation' });

    // Keep the old key synchronized during the compatibility period.
    dataStore?.setString?.(LEGACY_ROLE_KEY, role, { source: 'simulation-legacy' });

    return options.silent || !changed
      ? snapshot()
      : emitChange(options.source || 'role-selector');
  }

  function setAccount(nextAccountId, options = {}) {
    accountId = nextAccountId || null;
    if (accountId) dataStore?.setString?.(ACCOUNT_KEY, accountId, { source: 'simulation-account' });
    else dataStore?.remove?.(ACCOUNT_KEY, { source: 'simulation-account' });

    const account = getAccount();
    if (options.syncRole !== false && account?.role) {
      role = normalizeRole(account.role);
      dataStore?.setString?.(ROLE_KEY, role, { source: 'simulation' });
      dataStore?.setString?.(LEGACY_ROLE_KEY, role, { source: 'simulation-legacy' });
    }

    return options.silent
      ? snapshot()
      : emitChange(options.source || 'account-selector');
  }

  function setPerspective(nextAccountId, options = {}) {
    if (!window.FGC_TRADE?.setUser) {
      return { ok: false, error: 'The prototype account adapter is not ready.' };
    }

    window.FGC_TRADE.setUser(nextAccountId, {
      source: options.source || 'simulation-service'
    });

    return { ok: true, ...snapshot() };
  }

  function getRole() {
    return role;
  }

  function isActive() {
    return Boolean(getAccount() || role);
  }

  function snapshot() {
    return Object.freeze({
      active: isActive(),
      role,
      accountId: getAccount()?.id || accountId,
      perspective: getAccount(),
      team: getTeam()
    });
  }

  HQ.defineService('simulation', {
    roles: Object.freeze(Array.from(VALID_ROLES)),
    getRole,
    setRole,
    getAccount,
    setAccount,
    getPerspective: getAccount,
    setPerspective,
    getTeam,
    isActive,
    getSnapshot: snapshot
  });
})();
