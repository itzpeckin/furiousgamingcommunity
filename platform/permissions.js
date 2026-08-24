(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before platform/permissions.js.');

  const POLICIES = Object.freeze({
    OPEN_COMMISSIONER_HQ: 'openCommissionerHQ',
    IMPORT_LEAGUE: 'importLeague',
    EDIT_LEAGUE_SETTINGS: 'editLeagueSettings',
    MANAGE_TEAMS: 'manageTeams',
    CREATE_TRADE: 'createTrade',
    MANAGE_TRADE_BLOCK: 'manageTradeBlock',
    REVIEW_TRADES: 'reviewTrades',
    VOTE_ON_TRADES: 'voteOnTrades'
  });

  const PLATFORM_POLICIES = new Set([
    POLICIES.OPEN_COMMISSIONER_HQ,
    POLICIES.IMPORT_LEAGUE,
    POLICIES.EDIT_LEAGUE_SETTINGS,
    POLICIES.MANAGE_TEAMS
  ]);

  function authMembership() { return HQ.auth?.getMembership?.() || null; }
  function authRole() { return HQ.auth?.getRole?.() || null; }
  function isActiveMember() {
    const membership = authMembership();
    return Boolean(HQ.auth?.isAuthenticated?.() && membership?.active !== false);
  }
  function isCommissioner() { return isActiveMember() && authRole() === 'commissioner'; }

  function perspective(context = {}) {
    return context.perspective || HQ.simulation?.getPerspective?.() || HQ.simulation?.getSnapshot?.()?.perspective || null;
  }
  function authenticatedWorkflowRole() {
    if (!isActiveMember()) return null;
    const role = authRole();
    if (role === 'team_owner') return 'owner';
    if (role === 'trade_committee') return 'committee';
    if (role === 'commissioner') return 'commissioner';
    return null;
  }
  function perspectiveRole(context = {}) {
    return authenticatedWorkflowRole() || context.role || perspective(context)?.role || HQ.simulation?.getRole?.() || 'guest';
  }
  function perspectiveTeamId(context = {}) {
    if (isActiveMember()) return authMembership()?.teamId || null;
    return context.teamId || perspective(context)?.teamId || HQ.simulation?.getTeam?.()?.id || null;
  }

  function evaluate(permission, context = {}) {
    if (PLATFORM_POLICIES.has(permission)) return isCommissioner();

    const role = perspectiveRole(context);
    const teamId = perspectiveTeamId(context);
    switch (permission) {
      case POLICIES.CREATE_TRADE:
      case POLICIES.MANAGE_TRADE_BLOCK:
        return Boolean(teamId && ['owner', 'commissioner'].includes(role));
      case POLICIES.REVIEW_TRADES:
      case POLICIES.VOTE_ON_TRADES:
        return ['committee', 'commissioner'].includes(role);
      default:
        return false;
    }
  }

  function explain(permission, context = {}) {
    const platformPolicy = PLATFORM_POLICIES.has(permission);
    const allowed = evaluate(permission, context);
    return {
      allowed,
      permission,
      scope: platformPolicy ? 'authenticated-platform' : (isActiveMember() ? 'authenticated-league' : 'simulated-workflow'),
      authenticated: HQ.auth?.isAuthenticated?.() === true,
      activeMembership: isActiveMember(),
      authenticatedRole: authRole(),
      simulationRole: perspectiveRole(context),
      simulationTeamId: perspectiveTeamId(context),
      league: HQ.league?.getActiveLeague?.() || null,
      reason: allowed ? 'allowed' : platformPolicy
        ? 'The authenticated league membership does not grant this capability.'
        : 'The active simulation perspective does not grant this workflow capability.'
    };
  }

  HQ.defineService('permissions', {
    POLICIES,
    can: evaluate,
    explain,
    isCommissioner,
    canOpenCommissionerHQ: () => evaluate(POLICIES.OPEN_COMMISSIONER_HQ),
    canImportLeague: () => evaluate(POLICIES.IMPORT_LEAGUE),
    canEditLeagueSettings: () => evaluate(POLICIES.EDIT_LEAGUE_SETTINGS),
    canManageTeams: () => evaluate(POLICIES.MANAGE_TEAMS),
    canCreateTrade: (context) => evaluate(POLICIES.CREATE_TRADE, context),
    canManageTradeBlock: (context) => evaluate(POLICIES.MANAGE_TRADE_BLOCK, context),
    canReviewTrades: (context) => evaluate(POLICIES.REVIEW_TRADES, context),
    canVoteOnTrades: (context) => evaluate(POLICIES.VOTE_ON_TRADES, context)
  });
})();
