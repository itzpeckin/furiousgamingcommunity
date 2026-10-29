import { requireAuthenticatedUser,requirePlatformOwner } from './permissions.js';
import { accountReadiness,availableBetaInvitation } from './beta-access.js';
import { tenantDatabase } from './tenant-context.js';

// Server-selected authorization adapters, never a request-body access/payment flag.
// A paid adapter must verify a durable provider event before it can be added here.
export async function authorizeLeagueActivation(context,plan,source) {
  if (!['owner-approval','beta-invitation'].includes(source)) return {allowed:false,status:403,code:'PAYMENT_NOT_ENABLED',error:'Paid league access is not enabled.'};
  const authorization=source==='owner-approval' ? await requirePlatformOwner(context) : await requireAuthenticatedUser(context);
  if (!authorization.authorized) return {allowed:false,response:authorization.response};
  const db=tenantDatabase(context.env),actorUserId=String(authorization.session.user.id);
  let invitation=null;
  if(source==='beta-invitation'){
    const owned=await db.prepare('SELECT id FROM platform_league_onboarding_plans WHERE id=? AND created_by_user_id=? AND initial_commissioner_user_id=?').bind(plan.id,actorUserId,actorUserId).first();
    if(!owned || plan.initialCommissionerUserId!==actorUserId || plan.configuration?.betaApplicationRequired) return {allowed:false,status:403,code:'BETA_INVITATION_REQUIRED',error:'This league requires owner approval.'};
    if(!(await accountReadiness(db,actorUserId)).verified) return {allowed:false,status:403,code:'ACCOUNT_VERIFICATION_REQUIRED',error:'Verify your email in Account Settings first.'};
    invitation=await availableBetaInvitation(db,actorUserId,plan.id);
    if(!invitation) return {allowed:false,status:403,code:'BETA_INVITATION_REQUIRED',error:'A valid beta invitation is required to activate this league.'};
  }
  return {allowed:true,actorUserId,invitation,grant:Object.freeze({
    schemaVersion:1,kind:'complimentary',source,referenceId:invitation?.id || actorUserId,
    planId:plan.id,leagueId:plan.plannedLeagueId,accountId:plan.initialCommissionerUserId,expiresAt:null
  })};
}

export function validateActivationGrant(plan,grant) {
  if(!grant || grant.kind!=='complimentary' || !['owner-approval','beta-invitation'].includes(grant.source)
    || !grant.referenceId || grant.planId!==plan.id || grant.leagueId!==plan.plannedLeagueId
    || grant.accountId!==plan.initialCommissionerUserId || grant.expiresAt!==null) {
    throw new Error('A scoped, server-authorized league access grant is required.');
  }
  return {schemaVersion:1,kind:'complimentary',source:grant.source,referenceId:grant.referenceId,
    planId:plan.id,leagueId:plan.plannedLeagueId,accountId:plan.initialCommissionerUserId,expiresAt:null};
}
