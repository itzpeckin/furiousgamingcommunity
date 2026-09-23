import { jsonResponse } from '../../_lib/auth.js';
import { requireDatabaseSchema } from '../../_lib/database-schema.js';
import { requirePlatformOwner } from '../../_lib/permissions.js';
import { tenantDatabase } from '../../_lib/tenant-context.js';
import {
  PLATFORM_ONBOARDING_RELEASE,
  activatedLeagueStatements,
  inspectOnboardingConflicts,
  listOnboardingPlans,
  loadOnboardingPlan,
  normalizeOnboardingInput,
  onboardingEventStatement,
  onboardingPlanHash,
  onboardingReadiness,
  preparedLeagueStatements,
  requestId,
  validateOnboardingInput
} from '../../_lib/platform-onboarding.js';

const RELEASE_HEADERS = Object.freeze({ 'x-franchisehq-onboarding-release':PLATFORM_ONBOARDING_RELEASE });

function json(body, status = 200) {
  return jsonResponse(body, status, RELEASE_HEADERS);
}

function changed(result) {
  return Number(result?.meta?.changes || 0);
}

function safeRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision > 0 ? revision : null;
}

async function authorizedContext(context) {
  const authorization = await requirePlatformOwner(context);
  if (!authorization.authorized) return { response:authorization.response };
  const db = tenantDatabase(context.env);
  if (!db) return { response:json({ ok:false,error:'Platform storage is unavailable.' },503) };
  try {
    await requireDatabaseSchema(db);
  } catch (error) {
    return { response:json({
      ok:false,
      error:'Platform onboarding is not ready until the current database migration is applied.',
      code:error?.code || 'DATABASE_MIGRATION_REQUIRED'
    },503) };
  }
  return {
    db,
    actorUserId:String(authorization.session.user.id),
    requestId:requestId(context)
  };
}

async function responsePlan(db, plan) {
  return {
    ...plan,
    readiness:await onboardingReadiness(db,plan)
  };
}

async function listPayload(db) {
  const plans = await listOnboardingPlans(db);
  const enriched = [];
  for (const plan of plans) enriched.push(await responsePlan(db,plan));
  const leagues = await db.prepare(`SELECT
      league.id,league.slug,league.name,league.current_season,league.current_week,
      league.tenant_status,league.public_status,league.discord_connected,
      league.created_at,league.updated_at,
      COUNT(DISTINCT CASE WHEN membership.active=1 THEN membership.id END) AS active_members,
      active.snapshot_id AS active_snapshot_id,
      snapshot.activated_at AS active_snapshot_created_at
    FROM leagues league
    LEFT JOIN league_memberships membership ON membership.league_id=league.id
    LEFT JOIN league_active_snapshots active ON active.league_id=league.id
    LEFT JOIN league_snapshots snapshot
      ON snapshot.league_id=active.league_id AND snapshot.id=active.snapshot_id
    GROUP BY league.id,league.slug,league.name,league.current_season,league.current_week,
      league.tenant_status,league.public_status,league.discord_connected,
      league.created_at,league.updated_at,active.snapshot_id,snapshot.activated_at
    ORDER BY CASE WHEN league.tenant_status='enabled' AND league.public_status='active' THEN 0 ELSE 1 END,
      lower(league.name),league.slug`).all();
  const events = await db.prepare(`SELECT id,plan_id,actor_user_id,action,outcome,
      from_status,to_status,revision,request_id,detail_json,created_at
    FROM platform_league_onboarding_events
    ORDER BY created_at DESC,rowid DESC LIMIT 100`).all();
  const users = await db.prepare(`SELECT id,display_name,discord_username
    FROM users ORDER BY lower(COALESCE(display_name,discord_username,id)),id`).all();
  return {
    release:PLATFORM_ONBOARDING_RELEASE,
    activationAvailable:true,
    leagues:(leagues?.results || []).map(league => ({
      id:String(league.id),
      slug:String(league.slug),
      name:String(league.name),
      currentSeason:Number(league.current_season || 0) || null,
      currentWeek:Number(league.current_week || 0) || null,
      tenantStatus:String(league.tenant_status || 'disabled'),
      publicStatus:String(league.public_status || 'inactive'),
      discordConnected:Boolean(league.discord_connected),
      activeMembers:Number(league.active_members || 0),
      activeSnapshotId:league.active_snapshot_id ? String(league.active_snapshot_id) : null,
      activeSnapshotCreatedAt:league.active_snapshot_created_at || null,
      createdAt:league.created_at || null,
      updatedAt:league.updated_at || null
    })),
    plans:enriched,
    events:events?.results || [],
    users:(users?.results || []).map(user => ({
      id:String(user.id),
      displayName:String(user.display_name || user.discord_username || user.id)
    }))
  };
}

async function normalizedCandidate(body, actorUserId) {
  const candidate = normalizeOnboardingInput(body.plan || body,actorUserId);
  const validation = validateOnboardingInput(candidate);
  return { candidate,validation,planHash:validation.ok ? await onboardingPlanHash(candidate) : null };
}

async function preview(db, actorUserId, body) {
  const normalized = await normalizedCandidate(body,actorUserId);
  const conflict = normalized.validation.ok
    ? await inspectOnboardingConflicts(db,normalized.candidate,String(body.planId || '') || null)
    : { ok:false,conflicts:[],commissioner:null };
  return json({
    ok:normalized.validation.ok && conflict.ok,
    release:PLATFORM_ONBOARDING_RELEASE,
    activationAvailable:false,
    preview:{
      plan:normalized.candidate,
      planHash:normalized.planHash,
      validation:normalized.validation,
      conflicts:conflict.conflicts,
      initialCommissioner:conflict.commissioner,
      outcome:'A disabled, non-public tenant shell will be prepared. No membership, data, Discord connection, or activation will occur.'
    }
  },normalized.validation.ok && conflict.ok ? 200 : 422);
}

async function save(db, actorUserId, operationRequestId, body) {
  const normalized = await normalizedCandidate(body,actorUserId);
  if (!normalized.validation.ok) {
    return json({ ok:false,error:'The onboarding plan needs attention.',validation:normalized.validation },422);
  }
  const planId = String(body.planId || '').trim();
  const existing = planId ? await loadOnboardingPlan(db,planId) : null;
  if (planId && !existing) return json({ ok:false,error:'Onboarding plan not found.' },404);
  if (existing && existing.status !== 'draft') {
    return json({ ok:false,error:'Only a draft onboarding plan can be edited.',plan:await responsePlan(db,existing) },409);
  }
  const conflict = await inspectOnboardingConflicts(db,normalized.candidate,existing?.id || null);
  if (!conflict.ok) return json({ ok:false,error:'The onboarding plan conflicts with a reserved identity.',conflicts:conflict.conflicts },409);

  if (!existing) {
    const id = `onboarding_${crypto.randomUUID()}`;
    const plannedLeagueId = `league_${crypto.randomUUID()}`;
    await db.batch([
      db.prepare(`INSERT INTO platform_league_onboarding_plans
        (id,planned_league_id,slug,name,product_name,timezone,game_year,
         initial_commissioner_user_id,source_mode,desired_domain,discord_requested,
         discord_guild_id,branding_json,desired_features_json,configuration_json,
         plan_hash,status,revision,created_by_user_id,updated_by_user_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',1,?,?)`).bind(
        id,plannedLeagueId,normalized.candidate.slug,normalized.candidate.name,
        normalized.candidate.productName,normalized.candidate.timezone,normalized.candidate.gameYear,
        normalized.candidate.initialCommissionerUserId,normalized.candidate.sourceMode,
        normalized.candidate.desiredDomain,normalized.candidate.discord.requested ? 1 : 0,
        normalized.candidate.discord.guildId,JSON.stringify(normalized.candidate.branding),
        JSON.stringify(normalized.candidate.desiredFeatures),JSON.stringify({ activationAvailable:false,limits:normalized.candidate.limits }),
        normalized.planHash,actorUserId,actorUserId
      ),
      onboardingEventStatement(db,{
        planId:id,actorUserId,action:'plan.created',toStatus:'draft',revision:1,
        requestId:operationRequestId,detail:{ planHash:normalized.planHash,plannedLeagueId }
      })
    ]);
    return json({ ok:true,created:true,plan:await responsePlan(db,await loadOnboardingPlan(db,id)) },201);
  }

  const expectedRevision = safeRevision(body.expectedRevision);
  if (expectedRevision !== existing.revision) {
    return json({ ok:false,error:'This plan changed in another session. Refresh it before saving.',plan:await responsePlan(db,existing) },409);
  }
  const nextRevision = existing.revision + 1;
  const update = await db.prepare(`UPDATE platform_league_onboarding_plans SET
      slug=?,name=?,product_name=?,timezone=?,game_year=?,initial_commissioner_user_id=?,
      source_mode=?,desired_domain=?,discord_requested=?,discord_guild_id=?,branding_json=?,
      desired_features_json=?,configuration_json=?,plan_hash=?,revision=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND revision=? AND status='draft'`).bind(
    normalized.candidate.slug,normalized.candidate.name,normalized.candidate.productName,
    normalized.candidate.timezone,normalized.candidate.gameYear,
    normalized.candidate.initialCommissionerUserId,normalized.candidate.sourceMode,
    normalized.candidate.desiredDomain,normalized.candidate.discord.requested ? 1 : 0,
    normalized.candidate.discord.guildId,JSON.stringify(normalized.candidate.branding),
    JSON.stringify(normalized.candidate.desiredFeatures),JSON.stringify({ activationAvailable:false,limits:normalized.candidate.limits }),normalized.planHash,nextRevision,
    actorUserId,existing.id,existing.revision
  ).run();
  if (changed(update) !== 1) {
    return json({ ok:false,error:'This plan changed in another session. Refresh it before saving.' },409);
  }
  await onboardingEventStatement(db,{
    planId:existing.id,actorUserId,action:'plan.saved',fromStatus:'draft',toStatus:'draft',
    revision:nextRevision,requestId:operationRequestId,detail:{ planHash:normalized.planHash }
  }).run();
  return json({ ok:true,created:false,plan:await responsePlan(db,await loadOnboardingPlan(db,existing.id)) });
}

async function validatePreparedIdentity(db, plan) {
  const rows = await db.prepare(`SELECT id,slug,tenant_status,public_status,configuration_json
    FROM leagues WHERE id=? OR lower(slug)=lower(?)`).bind(plan.plannedLeagueId,plan.slug).all();
  for (const row of rows?.results || []) {
    if (row.id !== plan.plannedLeagueId) return { ok:false,error:'That league URL was reserved by another league.' };
    let configuration = {};
    try { configuration = JSON.parse(row.configuration_json || '{}'); } catch {}
    if (String(row.slug).toLowerCase() !== plan.slug.toLowerCase()
      || row.tenant_status !== 'disabled'
      || row.public_status === 'active'
      || configuration?.onboarding?.planId !== plan.id) {
      return { ok:false,error:'The reserved tenant shell no longer matches this onboarding plan.' };
    }
  }
  if (plan.desiredDomain) {
    const domain = await db.prepare(`SELECT league_id FROM league_domains WHERE lower(hostname)=lower(?) LIMIT 1`)
      .bind(plan.desiredDomain).first();
    if (domain && domain.league_id !== plan.plannedLeagueId) {
      return { ok:false,error:'That custom domain is already assigned to a league.' };
    }
  }
  return { ok:true };
}

async function prepare(db, actorUserId, operationRequestId, body) {
  let plan = await loadOnboardingPlan(db,String(body.planId || ''));
  if (!plan) return json({ ok:false,error:'Onboarding plan not found.' },404);
  if (plan.status === 'cancelled') return json({ ok:false,error:'A cancelled onboarding plan cannot be prepared.' },409);
  if (plan.status === 'prepared') return json({ ok:true,resumed:true,plan:await responsePlan(db,plan) });

  if (plan.status === 'draft') {
    const expectedRevision = safeRevision(body.expectedRevision);
    if (expectedRevision !== plan.revision) {
      return json({ ok:false,error:'This plan changed in another session. Refresh it before preparing.',plan:await responsePlan(db,plan) },409);
    }
    const nextRevision = plan.revision + 1;
    const claim = await db.prepare(`UPDATE platform_league_onboarding_plans SET
        status='preparing',revision=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND revision=? AND status='draft'`)
      .bind(nextRevision,actorUserId,plan.id,plan.revision).run();
    if (changed(claim) !== 1) return json({ ok:false,error:'This plan changed in another session. Refresh it before preparing.' },409);
    await onboardingEventStatement(db,{
      planId:plan.id,actorUserId,action:'prepare.started',fromStatus:'draft',toStatus:'preparing',
      revision:nextRevision,requestId:operationRequestId,detail:{ planHash:plan.planHash }
    }).run();
    plan = await loadOnboardingPlan(db,plan.id);
  }

  const identity = await validatePreparedIdentity(db,plan);
  if (!identity.ok) return json({ ok:false,error:identity.error,code:'ONBOARDING_IDENTITY_CONFLICT' },409);

  await db.batch(preparedLeagueStatements(db,plan,actorUserId));
  const preparedView = Object.freeze({ ...plan,status:'prepared' });
  const readiness = await onboardingReadiness(db,preparedView);
  if (readiness.checks.some(item => item.status === 'fail')) {
    return json({
      ok:false,
      error:'Preparation stopped at a safe checkpoint. Select Resume after reviewing the failed readiness check.',
      code:'ONBOARDING_PREPARATION_INCOMPLETE',
      plan:{ ...plan,readiness }
    },409);
  }

  const nextRevision = plan.revision + 1;
  const completed = await db.prepare(`UPDATE platform_league_onboarding_plans SET
      status='prepared',revision=?,prepared_by_user_id=?,prepared_at=COALESCE(prepared_at,CURRENT_TIMESTAMP),
      updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND revision=? AND status='preparing'`)
    .bind(nextRevision,actorUserId,actorUserId,plan.id,plan.revision).run();
  if (changed(completed) !== 1) {
    const latest = await loadOnboardingPlan(db,plan.id);
    if (latest?.status === 'prepared') return json({ ok:true,resumed:true,plan:await responsePlan(db,latest) });
    return json({ ok:false,error:'This plan changed in another session. Refresh it before resuming.' },409);
  }
  await onboardingEventStatement(db,{
    planId:plan.id,actorUserId,action:'prepare.completed',fromStatus:'preparing',toStatus:'prepared',
    revision:nextRevision,requestId:operationRequestId,
    detail:{ plannedLeagueId:plan.plannedLeagueId,activationAvailable:false }
  }).run();
  return json({ ok:true,resumed:plan.revision > 2,plan:await responsePlan(db,await loadOnboardingPlan(db,plan.id)) });
}

async function cancel(db, actorUserId, operationRequestId, body) {
  const plan = await loadOnboardingPlan(db,String(body.planId || ''));
  if (!plan) return json({ ok:false,error:'Onboarding plan not found.' },404);
  if (plan.activatedAt) return json({ ok:false,error:'An activated league cannot be cancelled through onboarding.' },409);
  if (plan.status === 'cancelled') return json({ ok:true,contained:true,plan:await responsePlan(db,plan) });
  const expectedRevision = safeRevision(body.expectedRevision);
  if (expectedRevision !== plan.revision) {
    return json({ ok:false,error:'This plan changed in another session. Refresh it before cancelling.',plan:await responsePlan(db,plan) },409);
  }
  const readiness = await onboardingReadiness(db,plan);
  if (Object.values(readiness.counts).some(value => Number(value) !== 0)) {
    return json({
      ok:false,
      error:'This plan has live league data or delivery state and cannot be cancelled by onboarding.',
      code:'ONBOARDING_CANCEL_BLOCKED',
      plan:{ ...plan,readiness }
    },409);
  }
  const nextRevision = plan.revision + 1;
  const result = await db.prepare(`UPDATE platform_league_onboarding_plans SET
      status='cancelled',revision=?,cancelled_by_user_id=?,cancelled_at=CURRENT_TIMESTAMP,
      updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND revision=? AND status<>'cancelled'`)
    .bind(nextRevision,actorUserId,actorUserId,plan.id,plan.revision).run();
  if (changed(result) !== 1) return json({ ok:false,error:'This plan changed in another session. Refresh it before cancelling.' },409);
  await db.batch([
    db.prepare(`UPDATE leagues SET configuration_json=json_set(configuration_json,
        '$.onboarding.status','cancelled','$.onboarding.activationAvailable',json('false')),
        updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND tenant_status='disabled' AND public_status<>'active'`).bind(plan.plannedLeagueId),
    onboardingEventStatement(db,{
      planId:plan.id,actorUserId,action:'plan.cancelled',outcome:'contained',
      fromStatus:plan.status,toStatus:'cancelled',revision:nextRevision,requestId:operationRequestId,
      detail:{ retainedDisabledTenant:true,deletedData:false }
    })
  ]);
  return json({ ok:true,contained:true,plan:await responsePlan(db,await loadOnboardingPlan(db,plan.id)) });
}

async function activate(db, actorUserId, operationRequestId, body) {
  let plan = await loadOnboardingPlan(db,String(body.planId || ''));
  if (!plan) return json({ ok:false,error:'Onboarding plan not found.' },404);
  if (plan.activatedAt) {
    return json({ ok:true,replayed:true,plan:await responsePlan(db,plan) });
  }
  if (plan.status !== 'prepared') {
    return json({ ok:false,error:'Prepare the disabled league and pass every readiness check before activation.' },409);
  }
  const expectedRevision = safeRevision(body.expectedRevision);
  if (expectedRevision !== plan.revision) {
    return json({ ok:false,error:'This plan changed in another session. Refresh it before activation.',plan:await responsePlan(db,plan) },409);
  }
  const readiness = await onboardingReadiness(db,plan);
  if (!readiness.readyForActivationReview || !readiness.activationAvailable) {
    return json({
      ok:false,error:'The league did not pass the activation readiness gate.',
      code:'ONBOARDING_ACTIVATION_NOT_READY',plan:{ ...plan,readiness }
    },409);
  }
  try {
    await db.batch(activatedLeagueStatements(db,plan,actorUserId,operationRequestId));
  } catch (error) {
    const latest = await loadOnboardingPlan(db,plan.id);
    if (latest?.activatedAt) return json({ ok:true,replayed:true,plan:await responsePlan(db,latest) });
    throw error;
  }
  plan = await loadOnboardingPlan(db,plan.id);
  if (!plan?.activatedAt) {
    return json({ ok:false,error:'Activation stopped without publishing the league. The disabled shell is still retained.' },409);
  }
  const activatedReadiness = await onboardingReadiness(db,plan);
  if (!activatedReadiness.activated || activatedReadiness.checks.some(check => check.status === 'fail')) {
    throw new Error('Activated tenant verification failed.');
  }
  return json({ ok:true,activated:true,plan:{ ...plan,readiness:activatedReadiness } });
}

export async function onRequestGet(context) {
  const operation = await authorizedContext(context);
  if (operation.response) return operation.response;
  return json({ ok:true,...await listPayload(operation.db) });
}

export async function onRequestPost(context) {
  const operation = await authorizedContext(context);
  if (operation.response) return operation.response;
  let body = {};
  try { body = await context.request.json(); }
  catch { return json({ ok:false,error:'A JSON request body is required.' },400); }
  const action = String(body.action || '').trim().toLowerCase();
  try {
    if (action === 'preview') return preview(operation.db,operation.actorUserId,body);
    if (action === 'save') return save(operation.db,operation.actorUserId,operation.requestId,body);
    if (action === 'prepare' || action === 'resume') return prepare(operation.db,operation.actorUserId,operation.requestId,body);
    if (action === 'activate') return activate(operation.db,operation.actorUserId,operation.requestId,body);
    if (action === 'cancel') return cancel(operation.db,operation.actorUserId,operation.requestId,body);
    return json({ ok:false,error:'Unsupported onboarding action.' },400);
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint')) {
      return json({ ok:false,error:'That league URL or custom domain was reserved by another onboarding plan.' },409);
    }
    console.error('Platform onboarding operation failed',{
      action,requestId:operation.requestId,errorName:error?.name || 'Error'
    });
    return json({ ok:false,error:'The onboarding operation could not be completed.',requestId:operation.requestId },500);
  }
}
