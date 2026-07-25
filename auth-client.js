(() => {
  'use strict';

  window.FranchiseHQ = window.FranchiseHQ || {};

  const authState = {
    status: 'loading',
    authenticated: false,
    user: null,
    membership: null,
    session: null,
    error: null
  };

  const leagueState = {
    activeLeague: null
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
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json'
        }
      });

      const payload = await response.json();

      if (!response.ok || payload.ok === false) {
        throw new Error(
          payload.error || 'Unable to load the authenticated user.'
        );
      }

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
    window.location.assign('/api/auth/discord/login');
  }

  async function logout() {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json'
        }
      });

      const payload = await response.json();

      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || 'Unable to log out.');
      }

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

  function setActiveLeague(league) {
    leagueState.activeLeague = league || null;

    window.dispatchEvent(
      new CustomEvent('franchisehq:league-changed', {
        detail: {
          activeLeague: leagueState.activeLeague
        }
      })
    );
  }

  function getActiveLeague() {
    return leagueState.activeLeague;
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

  window.FranchiseHQ.league = Object.freeze({
    setActiveLeague,
    getActiveLeague
  });

  refresh();
})();
