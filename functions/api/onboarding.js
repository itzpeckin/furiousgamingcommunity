import { jsonResponse } from '../_lib/auth.js';
import { requireDatabaseSchema } from '../_lib/database-schema.js';
import { requireAuthenticatedUser } from '../_lib/permissions.js';
import { tenantDatabase } from '../_lib/tenant-context.js';
import { accountReadiness,availableBetaInvitation } from '../_lib/beta-access.js';
import { leagueReadiness } from '../_lib/league-readiness.js';
import {
  DEFAULT_ONBOARDING_FEATURES,
  DEFAULT_ONBOARDING_LIMITS,
  activatedLeagueStatements,
  PLATFORM_ONBOARDING_RELEASE,
  inspectOnboardingConflicts,
  loadOnboardingPlan,
  normalizeOnboardingInput,
  onboardingEventStatement,
  onboardingPlanHash,
  onboardingReadiness,
  planFromRow,
  preparedLeagueStatements,
  requestId,
  validateOnboardingInput
} from '../_lib/platform-onboarding.js';

const HEADERS = Object.freeze({ 'x-franchisehq-onboarding-release':PLATFORM_ONBOARDING_RELEASE });

function json(body,status = 200) { return jsonResponse(body,status,HEADERS); }
function changed(result) { return Number(result?.meta?.changes || 0); }

async function readiness(db,plan) {
  if (!plan.activatedAt) return onboardingReadiness(db,plan);
  const league = await db.prepare('SELECT id,name,slug,tenant_status FROM leagues WHERE id=?').bind(plan.plannedLeagueId).first();
  return leagueReadiness(db,league,plan.initialCommissionerUserId);
}

async function contextForUser(context) {
  const authorization = await requireAuthenticatedUser(context);
  if (!authorization.authorized) return { response:authorization.response };
  const db = tenantDatabase(context.env);
  if (!db) return { response:json({ ok:false,error:'League registration storage is unavailable.' },503) };
  try { await requireDatabaseSchema(db); }
  catch { return { response:json({ ok:false,error:'League registration is temporarily unavailable.' },503) }; }
  return {
    db,userId:String(authorization.session.user.id),session:authorization.session,
    requestId:requestId(context)
  };
}

async function ownedPlans(db,userId) {
  const result = await db.prepare(`SELECT plan.*,user.display_name AS initial_commissioner_display_name
    FROM platform_league_onboarding_plans plan
    INNER JOIN users user ON user.id=plan.initial_commissioner_user_id
    WHERE plan.created_by_user_id=? AND plan.initial_commissioner_user_id=?
    ORDER BY plan.updated_at DESC,plan.created_at DESC`).bind(userId,userId).all();
  const plans = [];
  for (const row of result?.results || []) {
    const plan = planFromRow(row);
    plans.push({ ...plan,readiness:await readiness(db,plan),
      leagueUrl:plan.activatedAt ? `/leagues/${encodeURIComponent(plan.slug)}` : null });
  }
  return plans;
}

async function ownedPlan(db,userId,planId) {
  const row = await db.prepare(`SELECT id FROM platform_league_onboarding_plans
    WHERE id=? AND created_by_user_id=? AND initial_commissioner_user_id=? LIMIT 1`)
    .bind(String(planId || ''),userId,userId).first();
  return row ? loadOnboardingPlan(db,row.id) : null;
}

function selfServiceCandidate(body,userId) {
  const supplied = body?.plan && typeof body.plan === 'object' ? body.plan : body || {};
  return normalizeOnboardingInput({
    name:supplied.name,slug:supplied.slug,timezone:supplied.timezone,gameYear:supplied.gameYear,
    franchiseSeasonYear:supplied.franchiseSeasonYear,preferredExportMethod:supplied.preferredExportMethod,
    productName:'FranchiseHQ',sourceMode:'companion',initialCommissionerUserId:userId,
    desiredDomain:null,discord:{ requested:false,guildId:null },
    limits:DEFAULT_ONBOARDING_LIMITS,
    branding:supplied.branding,
    desiredFeatures:{ ...DEFAULT_ONBOARDING_FEATURES,...(supplied.desiredFeatures || {}) }
  },userId);
}

async function prepareOwned(db,userId,operationRequestId,plan) {
  if (plan.activatedAt) return { ok:true,replayed:true,plan };
  if (plan.status === 'cancelled') return { ok:false,status:409,error:'This league registration was cancelled.' };
  if (plan.status === 'prepared') return { ok:true,replayed:true,plan };
  if (plan.status === 'draft') {
    const nextRevision = plan.revision + 1;
    const claim = await db.prepare(`UPDATE platform_league_onboarding_plans SET
      status='preparing',revision=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND created_by_user_id=? AND initial_commissioner_user_id=?
        AND status='draft' AND revision=?`).bind(
      nextRevision,userId,plan.id,userId,userId,plan.revision
    ).run();
    if (changed(claim) !== 1) return { ok:false,status:409,error:'This registration changed. Refresh and try again.' };
    await onboardingEventStatement(db,{
      planId:plan.id,actorUserId:userId,action:'self-service.prepare.started',
      fromStatus:'draft',toStatus:'preparing',revision:nextRevision,
      requestId:operationRequestId,detail:{ planHash:plan.planHash }
    }).run();
    plan = await loadOnboardingPlan(db,plan.id);
  }
  await db.batch(preparedLeagueStatements(db,plan,userId));
  const staged = Object.freeze({ ...plan,status:'prepared' });
  const readiness = await onboardingReadiness(db,staged);
  if (readiness.checks.some(item => item.status === 'fail')) {
    return { ok:false,status:409,error:'League preparation paused safely. Select Retry after the registration is refreshed.',code:'ONBOARDING_PREPARATION_INCOMPLETE',plan:{ ...plan,readiness } };
  }
  const nextRevision = plan.revision + 1;
  const result = await db.prepare(`UPDATE platform_league_onboarding_plans SET
    status='prepared',revision=?,prepared_by_user_id=?,prepared_at=COALESCE(prepared_at,CURRENT_TIMESTAMP),
    updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND created_by_user_id=? AND initial_commissioner_user_id=?
      AND status='preparing' AND revision=?`).bind(
    nextRevision,userId,userId,plan.id,userId,userId,plan.revision
  ).run();
  if (changed(result) !== 1) {
    const latest = await ownedPlan(db,userId,plan.id);
    if (latest?.status === 'prepared') return { ok:true,replayed:true,plan:latest };
    return { ok:false,status:409,error:'This registration changed. Refresh and try again.' };
  }
  await onboardingEventStatement(db,{
    planId:plan.id,actorUserId:userId,action:'self-service.prepare.completed',
    fromStatus:'preparing',toStatus:'prepared',revision:nextRevision,
    requestId:operationRequestId,detail:{ plannedLeagueId:plan.plannedLeagueId,activationRequiresBetaInvitation:true }
  }).run();
  return { ok:true,plan:await loadOnboardingPlan(db,plan.id) };
}

async function submit(operation,body) {
  const candidate = selfServiceCandidate(body,operation.userId);
  const validation = validateOnboardingInput(candidate);
  if (!validation.ok) return json({ ok:false,error:'The league registration needs attention.',errors:validation.errors },422);
  if (candidate.franchiseSeasonYear == null) return json({ ok:false,error:'Enter the current calendar year shown inside your Madden franchise.' },422);
  const verified = await accountReadiness(operation.db,operation.userId);
  if (!verified.verified) return json({ ok:false,error:'Verify your email in Account Settings before creating a league.',code:'ACCOUNT_VERIFICATION_REQUIRED' },403);
  const replay = await operation.db.prepare(`SELECT id FROM platform_league_onboarding_plans
    WHERE slug=? AND created_by_user_id=? AND initial_commissioner_user_id=?`)
    .bind(candidate.slug,operation.userId,operation.userId).first();
  if (replay) return finishRegistration(operation,await loadOnboardingPlan(operation.db,replay.id));
  const invitation = await availableBetaInvitation(operation.db,operation.userId);
  if (!invitation) return json({ ok:false,error:'An invitation is required to create a league during the beta.',code:'BETA_INVITATION_REQUIRED' },403);
  const open = await operation.db.prepare(`SELECT COUNT(*) count FROM platform_league_onboarding_plans
    WHERE created_by_user_id=? AND activated_at IS NULL AND status<>'cancelled'`).bind(operation.userId).first();
  if (Number(open?.count || 0) >= 3) {
    return json({ ok:false,error:'This account already has three league registrations awaiting review.' },409);
  }
  const conflict = await inspectOnboardingConflicts(operation.db,candidate,null);
  if (!conflict.ok) return json({ ok:false,error:'That league URL is already reserved.',conflicts:conflict.conflicts },409);
  const planHash = await onboardingPlanHash(candidate);
  const id = `onboarding_${crypto.randomUUID()}`;
  const plannedLeagueId = `league_${crypto.randomUUID()}`;
  try {
    await operation.db.batch([
      operation.db.prepare(`INSERT INTO platform_league_onboarding_plans
        (id,planned_league_id,slug,name,product_name,timezone,game_year,
         initial_commissioner_user_id,source_mode,desired_domain,discord_requested,
         discord_guild_id,branding_json,desired_features_json,configuration_json,
         plan_hash,status,revision,created_by_user_id,updated_by_user_id)
        SELECT ?,?,?,?,?,?,?,?,? ,NULL,0,NULL,?,?,?,?,'draft',1,?,?
        WHERE EXISTS (SELECT 1 FROM platform_beta_invitations WHERE id=? AND claimed_by_user_id=?
          AND plan_id IS NULL AND revoked_at IS NULL AND datetime(expires_at)>CURRENT_TIMESTAMP)`).bind(
        id,plannedLeagueId,candidate.slug,candidate.name,candidate.productName,
        candidate.timezone,candidate.gameYear,operation.userId,candidate.sourceMode,
        JSON.stringify(candidate.branding),JSON.stringify(candidate.desiredFeatures),
        JSON.stringify({ betaInvitationRequired:true,franchiseSeasonYear:candidate.franchiseSeasonYear,
          preferredExportMethod:candidate.preferredExportMethod,limits:candidate.limits }),
        planHash,operation.userId,operation.userId,invitation.id,operation.userId
      ),
      operation.db.prepare(`UPDATE platform_beta_invitations SET plan_id=? WHERE id=? AND plan_id IS NULL`)
        .bind(id,invitation.id),
      onboardingEventStatement(operation.db,{
        planId:id,actorUserId:operation.userId,action:'self-service.plan.created',
        toStatus:'draft',revision:1,requestId:operation.requestId,
        detail:{ planHash,plannedLeagueId,authenticationProvider:operation.session.user.authProvider || 'discord' }
      })
    ]);
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint')) {
      return json({ ok:false,error:'That league URL is already reserved.' },409);
    }
    throw error;
  }
  return finishRegistration(operation,await loadOnboardingPlan(operation.db,id),true);
}

async function finishRegistration(operation,original,created = false) {
  const preparation = await prepareOwned(operation.db,operation.userId,operation.requestId,original);
  if (!preparation.ok) return json(preparation,preparation.status || 409);
  let plan = preparation.plan;
  if (!plan.activatedAt) {
    if (!(await accountReadiness(operation.db,operation.userId)).verified) return json({ ok:false,error:'Verify your email in Account Settings first.' },403);
    const invitation = await availableBetaInvitation(operation.db,operation.userId,plan.id);
    if (!invitation) return json({ ok:false,error:'A valid beta invitation is required to activate this league.' },403);
    try {
      await operation.db.batch([
        operation.db.prepare(`UPDATE platform_beta_invitations SET plan_id=NULL WHERE plan_id=? AND id<>?
          AND (revoked_at IS NOT NULL OR datetime(expires_at)<=CURRENT_TIMESTAMP)
          AND NOT EXISTS (SELECT 1 FROM platform_beta_redemptions WHERE plan_id=?)`)
          .bind(plan.id,invitation.id,plan.id),
        operation.db.prepare(`UPDATE platform_beta_invitations SET plan_id=? WHERE id=? AND (plan_id IS NULL OR plan_id=?)`)
          .bind(plan.id,invitation.id,plan.id),
        operation.db.prepare(`INSERT INTO platform_beta_redemptions(invitation_id,plan_id,user_id)
          VALUES ((SELECT id FROM platform_beta_invitations WHERE id=? AND plan_id=? AND claimed_by_user_id=?
            AND revoked_at IS NULL AND datetime(expires_at)>CURRENT_TIMESTAMP),?,?)`)
          .bind(invitation.id,plan.id,operation.userId,plan.id,operation.userId),
        ...activatedLeagueStatements(operation.db,plan,operation.userId,operation.requestId)
      ]);
    } catch (error) {
      const latest = await loadOnboardingPlan(operation.db,plan.id);
      if (!latest?.activatedAt) throw error;
    }
    plan = await loadOnboardingPlan(operation.db,plan.id);
  }
  return json({
    ok:true,created,release:PLATFORM_ONBOARDING_RELEASE,
    plan:{ ...plan,leagueUrl:`/leagues/${encodeURIComponent(plan.slug)}`,readiness:await readiness(operation.db,plan) }
  },created ? 201 : 200);
}

export async function onRequestGet(context) {
  const operation = await contextForUser(context);
  if (operation.response) return operation.response;
  return json({ ok:true,release:PLATFORM_ONBOARDING_RELEASE,plans:await ownedPlans(operation.db,operation.userId) });
}

export async function onRequestPost(context) {
  const operation = await contextForUser(context);
  if (operation.response) return operation.response;
  let body;
  try { body = await context.request.json(); }
  catch { return json({ ok:false,error:'A valid league registration form is required.' },400); }
  const action = String(body?.action || 'submit').toLowerCase();
  try {
    if (action === 'submit') return submit(operation,body);
    if (action === 'resume') {
      const plan = await ownedPlan(operation.db,operation.userId,body.planId);
      if (!plan) return json({ ok:false,error:'League registration not found.' },404);
      return finishRegistration(operation,plan);
    }
    return json({ ok:false,error:'Unsupported league registration action.' },400);
  } catch (error) {
    console.error('Self-service league registration failed',{ requestId:operation.requestId,errorName:error?.name || 'Error' });
    return json({ ok:false,error:'The league registration could not be completed.',requestId:operation.requestId },500);
  }
}
