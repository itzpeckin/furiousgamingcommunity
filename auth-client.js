(() => {
  'use strict';

  window.FranchiseHQ = window.FranchiseHQ || {};

  const api = window.FranchiseHQ.api;
  if (!api) {
    throw new Error('platform/api.js must load before auth-client.js.');
  }

  const authState = {
    status: 'loading',
    authenticated: false,
    user: null,
    membership: null,
    session: null,
    error: null
  };

  function notifyAuthChanged() {
    window.dispatchEvent(
      new CustomEvent('franchisehq:auth-changed', {
        detail: getSnapshot()
      })
    );
  }

  function getSnapshot() {
    return {
      status: authState.status,
      authenticated: authState.authenticated,
      user: authState.user,
      membership: authState.membership,
      session: authState.session,
      error: authState.error
    };
  }

  function resetAuthState() {
    authState.status = 'ready';
    authState.authenticated = false;
    authState.user = null;
    authState.membership = null;
    authState.session = null;
    authState.error = null;
  }

  function applyAuthResponse(payload) {
    authState.status = 'ready';
    authState.authenticated = payload.authenticated === true;
    authState.user = payload.user || null;
    authState.membership = payload.membership || null;
    authState.session = payload.session || null;
    authState.error = null;
  }

  async function refresh() {
    authState.status = 'loading';
    authState.error = null;
    notifyAuthChanged();

    try {
      const payload = await api.endpoints.auth.me();

      applyAuthResponse(payload);
      notifyAuthChanged();

      return getSnapshot();
    } catch (error) {
      resetAuthState();
      authState.status = 'error';
      authState.error =
        error instanceof Error ? error.message : String(error);

      console.error('Franchise HQ authentication failed:', error);
      notifyAuthChanged();

      return getSnapshot();
    }
  }

  function login() {
    window.location.assign(api.buildUrl('/api/auth/discord/login'));
  }

  async function logout() {
    try {
      await api.endpoints.auth.logout();

      resetAuthState();
      notifyAuthChanged();

      return {
        ok: true
      };
    } catch (error) {
      console.error('Franchise HQ logout failed:', error);

      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  function isAuthenticated() {
    return authState.authenticated === true;
  }

  function getCurrentUser() {
    return authState.user;
  }

  function getMembership() {
    return authState.membership;
  }

  function getRole() {
    return authState.membership?.role || null;
  }

  function hasRole(...allowedRoles) {
    const role = getRole();

    return Boolean(
      authState.authenticated &&
      authState.membership?.active &&
      role &&
      allowedRoles.includes(role)
    );
  }

  function isCommissioner() {
    return hasRole('commissioner');
  }

  function isTradeCommittee() {
    return hasRole('commissioner', 'trade_committee');
  }

  function isTeamOwner() {
    return hasRole('commissioner', 'team_owner');
  }

  function getDisplayName() {
    if (!authState.user) {
      return 'Guest';
    }

    return (
      authState.user.displayName ||
      authState.user.discordGlobalName ||
      authState.user.discordUsername ||
      'Franchise HQ User'
    );
  }

  function getRoleTag() {
    const role = getRole();

    if (role === 'commissioner') {
      return '[C]';
    }

    if (role === 'trade_committee') {
      return '[TC]';
    }

    return '';
  }

  function getAvatarUrl() {
    return authState.user?.avatarUrl || null;
  }


  window.FranchiseHQ.auth = Object.freeze({
    refresh,
    login,
    logout,
    getSnapshot,
    isAuthenticated,
    getCurrentUser,
    getMembership,
    getRole,
    hasRole,
    isCommissioner,
    isTradeCommittee,
    isTeamOwner,
    getDisplayName,
    getRoleTag,
    getAvatarUrl
  });

  refresh();
})();
