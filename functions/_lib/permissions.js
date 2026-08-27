import {
  getCurrentSession,
  jsonResponse
} from "./auth.js";

export const LEAGUE_ROLES = Object.freeze({
  COMMISSIONER: "commissioner",
  TRADE_COMMITTEE: "trade_committee",
  TEAM_OWNER: "team_owner"
});

export async function requireAuthenticatedUser(context) {
  const session = await getCurrentSession(context);

  if (!session) {
    return {
      authorized: false,
      response: jsonResponse(
        {
          ok: false,
          error: "Authentication required."
        },
        401
      )
    };
  }

  return {
    authorized: true,
    session
  };
}

export async function requireActiveMembership(context) {
  const authentication = await requireAuthenticatedUser(context);

  if (!authentication.authorized) {
    return authentication;
  }

  const { session } = authentication;

  if (!session.membership || !session.membership.active) {
    return {
      authorized: false,
      response: jsonResponse(
        {
          ok: false,
          error: "Not found."
        },
        404
      )
    };
  }

  return {
    authorized: true,
    session
  };
}

export async function requireLeagueRole(
  context,
  allowedRoles
) {
  const membershipCheck =
    await requireActiveMembership(context);

  if (!membershipCheck.authorized) {
    return membershipCheck;
  }

  const roles = Array.isArray(allowedRoles)
    ? allowedRoles
    : [allowedRoles];

  const userRole =
    membershipCheck.session.membership.role;

  if (!roles.includes(userRole)) {
    return {
      authorized: false,
      response: jsonResponse(
        {
          ok: false,
          error: "You do not have permission to perform this action."
        },
        403
      )
    };
  }

  return membershipCheck;
}

export async function requireCommissioner(context) {
  return requireLeagueRole(
    context,
    LEAGUE_ROLES.COMMISSIONER
  );
}

export async function requireTradeCommitteeAccess(
  context
) {
  return requireLeagueRole(context, [
    LEAGUE_ROLES.COMMISSIONER,
    LEAGUE_ROLES.TRADE_COMMITTEE
  ]);
}

export async function requireTeamOwnerAccess(context) {
  const access = await requireLeagueRole(context, [
    LEAGUE_ROLES.COMMISSIONER,
    LEAGUE_ROLES.TRADE_COMMITTEE,
    LEAGUE_ROLES.TEAM_OWNER
  ]);
  if (!access.authorized) return access;
  if (!access.session.membership?.teamId) {
    return {
      authorized:false,
      response:jsonResponse({
        ok:false,
        error:"An active team assignment is required."
      },403)
    };
  }
  return access;
}
