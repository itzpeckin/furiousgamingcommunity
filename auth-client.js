(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) {
    throw new Error('platform/core.js must load before auth-client.js.');
  }

  const api = HQ.api;
  if (!api) {
    throw new Error('platform/api.js must load before auth-client.js.');
  }

  const boot = window.__FHQ_AUTH_BOOTSTRAP__ && typeof window.__FHQ_AUTH_BOOTSTRAP__ === 'object' ? window.__FHQ_AUTH_BOOTSTRAP__ : null;

  const authState = {
    status: boot?.authenticated === true ? 'ready' : 'loading',
    authenticated: boot?.authenticated === true,
    user: boot?.user || null,
    membership: boot?.membership || null,
    session: boot?.session || null,
    error: null
  };

  function getSnapshot() {
    return Object.freeze({
      status: authState.status,
      authenticated: authState.authenticated,
      user: authState.user,
      membership: authState.membership,
      session: authState.session,
      error: authState.error
    });
  }

  function notifyAuthChanged(source = 'auth-client') {
    const detail = { ...getSnapshot(), source };
    HQ.events?.emit?.('auth-changed', detail);
    return detail;
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

  async function refresh(options = {}) {
    const hadAuthenticatedSession = authState.authenticated === true;
    authState.status = hadAuthenticatedSession ? 'ready' : 'loading';
    authState.error = null;
    notifyAuthChanged('refresh-started');

    const routeLeague = window.FranchiseHQ?.leagueTenant?.resolveRouteSlug?.() || (location.pathname.match(/\/leagues\/([^/?#]+)/i)?.[1] || null);
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const payload = await api.get('/api/auth/me', {
          query: routeLeague ? { league: decodeURIComponent(routeLeague) } : null,
          retries: 0
        });
        applyAuthResponse(payload);
        notifyAuthChanged('refresh-succeeded');
        HQ.lifecycle?.markCheckpoint?.('auth:resolved', {
          authenticated: authState.authenticated,
          status: authState.status
        });
        return getSnapshot();
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 175 * (attempt + 1)));
      }
    }

    // A league document is only served after the server validates the session.
    // If that authenticated server bootstrap exists, a transient /api/auth/me
    // failure must not demote the user to Guest or eject a commissioner.
    if (hadAuthenticatedSession || boot?.authenticated === true) {
      authState.status = 'ready';
      authState.error = lastError instanceof Error ? lastError.message : String(lastError || 'Session refresh failed.');
      notifyAuthChanged('refresh-deferred');
      HQ.lifecycle?.markCheckpoint?.('auth:resolved', {
        authenticated: true,
        status: authState.status,
        deferred: true
      });
      return getSnapshot();
    }

    resetAuthState();
    authState.status = 'error';
    authState.error = lastError instanceof Error ? lastError.message : String(lastError || 'Authentication failed.');
    console.error('Franchise HQ authentication failed:', lastError);
    notifyAuthChanged('refresh-failed');
    HQ.lifecycle?.markCheckpoint?.('auth:resolved', {
      authenticated: false,
      status: authState.status,
      error: authState.error
    });
    return getSnapshot();
  }

  function login() {
    const joinPath = location.pathname.match(/^\/leagues\/[^/?#]+$/i) ? location.pathname : null;
    window.location.assign(api.buildUrl('/api/auth/discord/login', joinPath ? { returnTo: joinPath } : null));
  }

  async function logout() {
    try {
      await api.endpoints.auth.logout();
      resetAuthState();
      notifyAuthChanged('logout');
      window.location.assign('/?logout=success');
      return { ok: true };
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
    if (!authState.user) return 'Guest';
    return authState.user.displayName ||
      authState.user.discordGlobalName ||
      authState.user.discordUsername ||
      'Franchise HQ User';
  }

  function getRoleTag() {
    const role = getRole();
    if (role === 'commissioner') return '[C]';
    if (role === 'trade_committee') return '[TC]';
    return '';
  }

  function getAvatarUrl() {
    return authState.user?.avatarUrl || null;
  }

  const authService = HQ.defineService('auth', {
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
  }, { replace: true });

  refresh();
})();
