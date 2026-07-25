(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) {
    throw new Error('platform/core.js must load before platform/permissions.js.');
  }

  const POLICIES = Object.freeze({
    OPEN_COMMISSIONER_HQ: 'openCommissionerHQ',
    IMPORT_LEAGUE: 'importLeague',
    EDIT_LEAGUE_SETTINGS: 'editLeagueSettings',
    MANAGE_TEAMS: 'manageTeams',
    REVIEW_TRADES: 'reviewTrades',
    VOTE_ON_TRADES: 'voteOnTrades',
    CREATE_TRADE: 'createTrade'
  });

  function membership() {
    return HQ.auth?.getMembership?.() || null;
  }

  function isActiveMember() {
    const current = membership();
    return Boolean(HQ.auth?.isAuthenticated?.() && current?.active !== false);
  }

  function role() {
    return HQ.auth?.getRole?.() || null;
  }

  function isCommissioner() {
    return isActiveMember() && role() === 'commissioner';
  }

  function isCommittee() {
    return isActiveMember() && ['commissioner', 'trade_committee'].includes(role());
  }

  function evaluate(permission) {
    switch (permission) {
      case POLICIES.OPEN_COMMISSIONER_HQ:
      case POLICIES.IMPORT_LEAGUE:
      case POLICIES.EDIT_LEAGUE_SETTINGS:
      case POLICIES.MANAGE_TEAMS:
        return isCommissioner();
      case POLICIES.REVIEW_TRADES:
      case POLICIES.VOTE_ON_TRADES:
        return isCommittee();
      case POLICIES.CREATE_TRADE:
        return isActiveMember();
      default:
        return false;
    }
  }

  function explain(permission) {
    const allowed = evaluate(permission);
    return {
      allowed,
      permission,
      authenticated: HQ.auth?.isAuthenticated?.() === true,
      activeMembership: isActiveMember(),
      role: role(),
      league: HQ.league?.getActiveLeague?.() || null,
      reason: allowed
        ? 'allowed'
        : 'The authenticated league membership does not grant this capability.'
    };
  }

  HQ.defineService('permissions', {
    POLICIES,
    can: evaluate,
    explain,
    canOpenCommissionerHQ: () => evaluate(POLICIES.OPEN_COMMISSIONER_HQ),
    canImportLeague: () => evaluate(POLICIES.IMPORT_LEAGUE),
    canEditLeagueSettings: () => evaluate(POLICIES.EDIT_LEAGUE_SETTINGS),
    canManageTeams: () => evaluate(POLICIES.MANAGE_TEAMS),
    canReviewTrades: () => evaluate(POLICIES.REVIEW_TRADES),
    canVoteOnTrades: () => evaluate(POLICIES.VOTE_ON_TRADES),
    canCreateTrade: () => evaluate(POLICIES.CREATE_TRADE)
  });
})();
