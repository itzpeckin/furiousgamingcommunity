(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  const dataStore = HQ?.store;

  if (!HQ?.defineService) {
    throw new Error('FranchiseHQ core must load before platform/league.js.');
  }

  const PRIMARY_LEAGUE_ID = 'franchise-hq-primary';
  const STORAGE_KEY = 'franchisehq-active-league';

  const state = {
    status: 'idle',
    activeLeague: null,
    memberships: [],
    error: null
  };

  function normalizeMembership(membership) {
    if (!membership || typeof membership !== 'object') return null;

    const leagueId = membership.leagueId || membership.league_id || null;
    if (!leagueId) return null;

    return Object.freeze({
      id: membership.id || null,
      leagueId,
      role: membership.role || null,
      teamId: membership.teamId || membership.team_id || null,
      active: membership.active === true
    });
  }

  function displayNameForLeague(leagueId) {
    if (leagueId === PRIMARY_LEAGUE_ID) return 'Franchise HQ Primary';

    return String(leagueId || 'League')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function normalizeLeague(league, membership = null) {
    if (!league && !membership) return null;

    if (typeof league === 'string') {
      league = { id: league };
    }

    const id = league?.id || league?.leagueId || membership?.leagueId || null;
    if (!id) return null;

    return Object.freeze({
      id,
      name: league?.name || league?.displayName || displayNameForLeague(id),
      slug: league?.slug || id,
      season: league?.season ?? null,
      salaryCap: league?.salaryCap ?? null,
      settings: Object.freeze({ ...(league?.settings || {}) }),
      membership: membership || league?.membership || null
    });
  }

  function snapshot() {
    return Object.freeze({
      status: state.status,
      activeLeague: state.activeLeague,
      memberships: Object.freeze([...state.memberships]),
      error: state.error
    });
  }

  function emit(source = 'league-service') {
    const detail = {
      ...snapshot(),
      source
    };

    window.dispatchEvent(new CustomEvent('franchisehq:league-changed', {
      detail
    }));

    HQ.events?.emit?.('league:changed', detail);
  }

  function persistActiveLeague(league) {
    try {
      if (!league?.id) {
        dataStore?.remove?.(STORAGE_KEY, { source: 'league' });
        return;
      }
      dataStore?.setString?.(STORAGE_KEY, league.id, { source: 'league' });
    } catch (error) {
      console.warn('Unable to persist the active Franchise HQ league.', error);
    }
  }

  function preferredLeagueId() {
    try {
      return dataStore?.getString?.(STORAGE_KEY, null) || null;
    } catch {
      return null;
    }
  }

  function setMemberships(memberships, options = {}) {
    const normalized = (Array.isArray(memberships) ? memberships : [memberships])
      .map(normalizeMembership)
      .filter(Boolean);

    state.memberships = normalized;
    state.status = 'ready';
    state.error = null;

    const requestedId = options.activeLeagueId || preferredLeagueId();
    const activeMembership = normalized.find((item) => item.leagueId === requestedId)
      || normalized.find((item) => item.active)
      || normalized[0]
      || null;

    state.activeLeague = activeMembership
      ? normalizeLeague({ id: activeMembership.leagueId }, activeMembership)
      : null;

    persistActiveLeague(state.activeLeague);

    if (options.silent !== true) {
      emit(options.source || 'memberships-updated');
    }

    return snapshot();
  }

  function hydrateFromAuth(authSnapshot = HQ.auth?.getSnapshot?.()) {
    state.status = authSnapshot?.status === 'loading' ? 'loading' : 'ready';
    state.error = authSnapshot?.error || null;

    if (!authSnapshot?.authenticated || !authSnapshot.membership) {
      state.memberships = [];
      state.activeLeague = null;
      persistActiveLeague(null);
      emit('auth-cleared');
      return snapshot();
    }

    return setMemberships([authSnapshot.membership], {
      source: 'auth-hydrated'
    });
  }

  function setActive(leagueOrId, options = {}) {
    const leagueId = typeof leagueOrId === 'string'
      ? leagueOrId
      : leagueOrId?.id || leagueOrId?.leagueId;

    if (!leagueId) {
      state.activeLeague = null;
      persistActiveLeague(null);
      emit(options.source || 'active-league-cleared');
      return null;
    }

    const membership = state.memberships.find((item) => item.leagueId === leagueId) || null;

    if (!membership && options.allowUnknown !== true) {
      return null;
    }

    state.activeLeague = normalizeLeague(
      typeof leagueOrId === 'string' ? { id: leagueOrId } : leagueOrId,
      membership
    );

    persistActiveLeague(state.activeLeague);
    emit(options.source || 'active-league-selected');
    return state.activeLeague;
  }

  function getActive() {
    return state.activeLeague;
  }

  function getActiveLeague() {
    return getActive();
  }

  function setActiveLeague(league, options = {}) {
    return setActive(league, {
      allowUnknown: true,
      ...options
    });
  }

  function getMemberships() {
    return [...state.memberships];
  }

  function getMembership(leagueId = state.activeLeague?.id) {
    if (!leagueId) return null;
    return state.memberships.find((item) => item.leagueId === leagueId) || null;
  }

  function getRole(leagueId) {
    return getMembership(leagueId)?.role || null;
  }

  function isMember(leagueId) {
    return getMembership(leagueId)?.active === true;
  }

  function hasRole(...roles) {
    const role = getRole();
    return isMember() && Boolean(role) && roles.includes(role);
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

  function getSettings() {
    return { ...(state.activeLeague?.settings || {}) };
  }

  function getSeason() {
    return state.activeLeague?.season ?? null;
  }

  function getSalaryCap() {
    return state.activeLeague?.salaryCap ?? null;
  }

  function clear(options = {}) {
    state.status = 'ready';
    state.activeLeague = null;
    state.memberships = [];
    state.error = null;
    persistActiveLeague(null);
    emit(options.source || 'league-cleared');
  }

  const service = {
    getSnapshot: snapshot,
    hydrateFromAuth,
    setMemberships,
    getMemberships,
    getMembership,
    setActive,
    getActive,
    setActiveLeague,
    getActiveLeague,
    getRole,
    hasRole,
    isMember,
    isCommissioner,
    isTradeCommittee,
    isTeamOwner,
    getSettings,
    getSeason,
    getSalaryCap,
    clear
  };

  HQ.defineService('league', service, {
    replace: true
  });

  window.addEventListener('franchisehq:auth-changed', (event) => {
    hydrateFromAuth(event.detail);
  });

  if (HQ.auth?.getSnapshot) {
    hydrateFromAuth(HQ.auth.getSnapshot());
  }
})();
