import { normalizeTenantSlug, validTenantSlug } from './tenant-context.js';

export const PLATFORM_ONBOARDING_RELEASE = '8.0.2';
export const PLATFORM_ONBOARDING_SCHEMA_VERSION = 2;

export const ONBOARDING_FEATURE_KEYS = Object.freeze([
  'core_browsing',
  'commissioner_hq',
  'madden_import',
  'trade_center',
  'confidence_pool',
  'game_of_the_week',
  'rules'
]);

export const DEFAULT_ONBOARDING_FEATURES = Object.freeze({
  core_browsing:true,
  commissioner_hq:true,
  madden_import:true,
  trade_center:true,
  confidence_pool:false,
  game_of_the_week:false,
  rules:true
});

export const DEFAULT_ONBOARDING_LIMITS = Object.freeze({
  memberLimit:64,
  importConcurrency:1,
  discordDeliveriesPerMinute:60
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const DISCORD_SNOWFLAKE = /^\d{17,20}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

function text(value, maximum = 500) {
  return String(value ?? '').trim().slice(0, maximum);
}

function parseObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || 'null'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeHostname(value) {
  const raw = text(value, 300).toLowerCase().replace(/\.$/, '');
  if (!raw) return null;
  if (raw.includes('://') || raw.includes('/') || raw.includes(':')) return raw;
  return raw;
}

function validTimezone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone:value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function normalizeFeatures(value) {
  const supplied = parseObject(value);
  return Object.freeze(Object.fromEntries(ONBOARDING_FEATURE_KEYS.map(key => [
    key,
    supplied[key] === undefined ? Boolean(DEFAULT_ONBOARDING_FEATURES[key]) : supplied[key] === true
  ])));
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(minimum,Math.min(maximum,parsed)) : fallback;
}

export function normalizeOnboardingInput(input = {}, fallbackUserId = '') {
  const branding = parseObject(input.branding);
  const discord = parseObject(input.discord);
  const limits = parseObject(input.limits);
  const name = text(input.name, 80);
  const proposedSlug = input.slug || name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return Object.freeze({
    name,
    slug:normalizeTenantSlug(proposedSlug).slice(0, 63),
    productName:text(input.productName || 'FranchiseHQ', 80) || 'FranchiseHQ',
    timezone:text(input.timezone || 'UTC', 100) || 'UTC',
    gameYear:Number(input.gameYear || new Date().getUTCFullYear()),
    initialCommissionerUserId:text(input.initialCommissionerUserId || fallbackUserId, 128),
    sourceMode:text(input.sourceMode || 'companion', 40).toLowerCase(),
    desiredDomain:normalizeHostname(input.desiredDomain),
    limits:Object.freeze({
      memberLimit:boundedInteger(limits.memberLimit,DEFAULT_ONBOARDING_LIMITS.memberLimit,2,1000),
      importConcurrency:boundedInteger(limits.importConcurrency,DEFAULT_ONBOARDING_LIMITS.importConcurrency,1,10),
      discordDeliveriesPerMinute:boundedInteger(limits.discordDeliveriesPerMinute,DEFAULT_ONBOARDING_LIMITS.discordDeliveriesPerMinute,1,300)
    }),
    discord:Object.freeze({
      requested:discord.requested === true,
      guildId:text(discord.guildId, 24) || null
    }),
    branding:Object.freeze({
      primaryColor:text(branding.primaryColor || '#0878ff', 7).toLowerCase(),
      secondaryColor:text(branding.secondaryColor || '#00b7ff', 7).toLowerCase(),
      logoUrl:text(branding.logoUrl, 500) || null
    }),
    desiredFeatures:normalizeFeatures(input.desiredFeatures)
  });
}

export function validateOnboardingInput(plan) {
  const errors = [];
  if (plan.name.length < 2) errors.push('League name must contain at least 2 characters.');
  if (!validTenantSlug(plan.slug) || plan.slug.length > 63) {
    errors.push('League slug must use lowercase letters, numbers, and single hyphens.');
  }
  if (!validTimezone(plan.timezone)) errors.push('Select a valid IANA timezone.');
  if (!Number.isInteger(plan.gameYear) || plan.gameYear < 2020 || plan.gameYear > 2100) {
    errors.push('Madden game year must be between 2020 and 2100.');
  }
  if (!SAFE_ID.test(plan.initialCommissionerUserId)) {
    errors.push('An existing FranchiseHQ user is required as the initial commissioner.');
  }
  if (plan.sourceMode !== 'companion') {
    errors.push('Only the Madden Companion connection is available for onboarding in 8.0.2.');
  }
  if (plan.desiredDomain && !HOSTNAME.test(plan.desiredDomain)) {
    errors.push('Custom domain must be a hostname without a protocol, path, or port.');
  }
  if (plan.discord.requested && plan.discord.guildId && !DISCORD_SNOWFLAKE.test(plan.discord.guildId)) {
    errors.push('Discord server ID must be a valid Discord snowflake.');
  }
  if (!HEX_COLOR.test(plan.branding.primaryColor) || !HEX_COLOR.test(plan.branding.secondaryColor)) {
    errors.push('Brand colors must be six-digit hexadecimal colors.');
  }
  if (plan.branding.logoUrl) {
    try {
      if (new URL(plan.branding.logoUrl).protocol !== 'https:') errors.push('Logo URL must use HTTPS.');
    } catch {
      errors.push('Logo URL must be a valid HTTPS URL.');
    }
  }
  return Object.freeze({ ok:errors.length === 0, errors:Object.freeze(errors) });
}

function canonicalPlanDocument(plan) {
  return {
    schemaVersion:PLATFORM_ONBOARDING_SCHEMA_VERSION,
    name:plan.name,
    slug:plan.slug,
    productName:plan.productName,
    timezone:plan.timezone,
    gameYear:plan.gameYear,
    initialCommissionerUserId:plan.initialCommissionerUserId,
    sourceMode:plan.sourceMode,
    desiredDomain:plan.desiredDomain,
    discord:{ requested:plan.discord.requested, guildId:plan.discord.guildId },
    branding:{
      primaryColor:plan.branding.primaryColor,
      secondaryColor:plan.branding.secondaryColor,
      logoUrl:plan.branding.logoUrl
    },
    desiredFeatures:Object.fromEntries(ONBOARDING_FEATURE_KEYS.map(key => [key, Boolean(plan.desiredFeatures[key])])),
    limits:{
      memberLimit:plan.limits.memberLimit,
      importConcurrency:plan.limits.importConcurrency,
      discordDeliveriesPerMinute:plan.limits.discordDeliveriesPerMinute
    }
  };
}

export async function onboardingPlanHash(plan) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalPlanDocument(plan)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function onboardingEventStatement(db, {
  planId,
  actorUserId,
  action,
  outcome = 'success',
  fromStatus = null,
  toStatus = null,
  revision,
  requestId,
  detail = {}
}) {
  return db.prepare(`INSERT INTO platform_league_onboarding_events
    (id,plan_id,actor_user_id,action,outcome,from_status,to_status,revision,request_id,detail_json)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
    `onboarding_event_${crypto.randomUUID()}`,
    planId,
    actorUserId,
    text(action, 80),
    outcome,
    fromStatus,
    toStatus,
    Number(revision),
    text(requestId, 128),
    JSON.stringify(detail || {})
  );
}

export function requestId(context) {
  const supplied = text(context?.request?.headers?.get('x-request-id'), 128);
  return SAFE_ID.test(supplied) ? supplied : `req_${crypto.randomUUID()}`;
}

export async function inspectOnboardingConflicts(db, plan, excludePlanId = null) {
  const [league, draft, domain, domainPlan, commissioner] = await Promise.all([
    db.prepare(`SELECT id,name,slug,tenant_status,public_status FROM leagues
      WHERE lower(slug)=lower(?) LIMIT 1`).bind(plan.slug).first(),
    db.prepare(`SELECT id,status FROM platform_league_onboarding_plans
      WHERE lower(slug)=lower(?) AND id<>? LIMIT 1`).bind(plan.slug, excludePlanId || '').first(),
    plan.desiredDomain
      ? db.prepare(`SELECT league_id,hostname FROM league_domains
          WHERE lower(hostname)=lower(?) LIMIT 1`).bind(plan.desiredDomain).first()
      : Promise.resolve(null),
    plan.desiredDomain
      ? db.prepare(`SELECT id,status FROM platform_league_onboarding_plans
          WHERE lower(desired_domain)=lower(?) AND id<>? LIMIT 1`)
          .bind(plan.desiredDomain, excludePlanId || '').first()
      : Promise.resolve(null),
    db.prepare(`SELECT id,display_name,discord_username FROM users WHERE id=? LIMIT 1`)
      .bind(plan.initialCommissionerUserId).first()
  ]);
  const conflicts = [];
  if (league) conflicts.push({ code:'slug-in-use', message:'That league URL is already reserved.', resourceId:league.id });
  if (draft) conflicts.push({ code:'plan-slug-in-use', message:'Another onboarding plan already reserves that league URL.', resourceId:draft.id });
  if (domain) conflicts.push({ code:'domain-in-use', message:'That custom domain is already assigned to a league.', resourceId:domain.league_id });
  if (domainPlan) conflicts.push({ code:'plan-domain-in-use', message:'Another onboarding plan already reserves that custom domain.', resourceId:domainPlan.id });
  if (!commissioner) conflicts.push({ code:'commissioner-missing', message:'The selected initial commissioner is not an existing FranchiseHQ user.' });
  return Object.freeze({
    ok:conflicts.length === 0,
    conflicts:Object.freeze(conflicts),
    commissioner:commissioner ? Object.freeze({
      id:String(commissioner.id),
      displayName:String(commissioner.display_name || commissioner.discord_username || 'FranchiseHQ User')
    }) : null
  });
}

export function planFromRow(row) {
  if (!row) return null;
  const configuration = parseObject(row.configuration_json);
  return Object.freeze({
    id:String(row.id),
    plannedLeagueId:String(row.planned_league_id),
    name:String(row.name),
    slug:String(row.slug),
    productName:String(row.product_name || 'FranchiseHQ'),
    timezone:String(row.timezone || 'UTC'),
    gameYear:Number(row.game_year),
    initialCommissionerUserId:String(row.initial_commissioner_user_id),
    initialCommissionerDisplayName:String(row.initial_commissioner_display_name || row.initial_commissioner_user_id),
    sourceMode:String(row.source_mode || 'companion'),
    desiredDomain:row.desired_domain ? String(row.desired_domain) : null,
    discord:Object.freeze({
      requested:Boolean(row.discord_requested),
      guildId:row.discord_guild_id ? String(row.discord_guild_id) : null
    }),
    branding:Object.freeze(parseObject(row.branding_json)),
    desiredFeatures:Object.freeze(parseObject(row.desired_features_json)),
    configuration:Object.freeze(configuration),
    limits:Object.freeze({ ...DEFAULT_ONBOARDING_LIMITS,...parseObject(configuration.limits) }),
    planHash:String(row.plan_hash),
    status:String(row.status),
    revision:Number(row.revision),
    preparedAt:row.prepared_at || null,
    activatedAt:row.activated_at || null,
    activatedByUserId:row.activated_by_user_id || null,
    activationRequestId:row.activation_request_id || null,
    cancelledAt:row.cancelled_at || null,
    createdAt:row.created_at || null,
    updatedAt:row.updated_at || null
  });
}

export async function loadOnboardingPlan(db, planId) {
  const row = await db.prepare(`SELECT plan.*,user.display_name AS initial_commissioner_display_name
    FROM platform_league_onboarding_plans plan
    INNER JOIN users user ON user.id=plan.initial_commissioner_user_id
    WHERE plan.id=? LIMIT 1`).bind(String(planId || '')).first();
  return planFromRow(row);
}

export async function listOnboardingPlans(db) {
  const result = await db.prepare(`SELECT plan.*,user.display_name AS initial_commissioner_display_name
    FROM platform_league_onboarding_plans plan
    INNER JOIN users user ON user.id=plan.initial_commissioner_user_id
    ORDER BY plan.updated_at DESC,plan.created_at DESC`).all();
  return (result?.results || []).map(planFromRow);
}

function check(id, label, status, detail) {
  return Object.freeze({ id, label, status, detail });
}

export async function onboardingReadiness(db, plan) {
  const results = await db.batch([
    db.prepare(`SELECT id,slug,name,tenant_status,public_status,configuration_json
      FROM leagues WHERE id=? LIMIT 1`).bind(plan.plannedLeagueId),
    db.prepare(`SELECT COUNT(*) count,SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) enabled_count
      FROM league_features WHERE league_id=?`).bind(plan.plannedLeagueId),
    db.prepare(`SELECT COUNT(*) count FROM league_memberships WHERE league_id=?`).bind(plan.plannedLeagueId),
    db.prepare(`SELECT COUNT(*) count FROM league_active_snapshots WHERE league_id=?`).bind(plan.plannedLeagueId),
    db.prepare(`SELECT COUNT(*) count FROM league_snapshots WHERE league_id=?`).bind(plan.plannedLeagueId),
    db.prepare(`SELECT COUNT(*) count FROM companion_candidate_import_runs WHERE league_id=?`).bind(plan.plannedLeagueId),
    db.prepare(`SELECT COUNT(*) count FROM discord_league_installations WHERE league_id=?`).bind(plan.plannedLeagueId),
    db.prepare(`SELECT COUNT(*) count FROM discord_schedule_threads WHERE league_id=?`).bind(plan.plannedLeagueId),
    db.prepare(`SELECT COUNT(*) count FROM companion_league_export_endpoints WHERE league_id=?`).bind(plan.plannedLeagueId),
    db.prepare(`SELECT COUNT(*) count FROM league_memberships
      WHERE league_id=? AND user_id=? AND role='commissioner' AND active=1`)
      .bind(plan.plannedLeagueId,plan.initialCommissionerUserId),
    db.prepare(`SELECT COUNT(*) count FROM platform_league_activations
      WHERE plan_id=? AND league_id=?`).bind(plan.id,plan.plannedLeagueId)
  ]);
  const first = index => results[index]?.results?.[0] || null;
  const league = first(0);
  const featureCount = Number(first(1)?.count || 0);
  const enabledFeatureCount = Number(first(1)?.enabled_count || 0);
  const membershipCount = Number(first(2)?.count || 0);
  const activePointerCount = Number(first(3)?.count || 0);
  const snapshotCount = Number(first(4)?.count || 0);
  const importCount = Number(first(5)?.count || 0);
  const discordInstallationCount = Number(first(6)?.count || 0);
  const discordThreadCount = Number(first(7)?.count || 0);
  const exportEndpointCount = Number(first(8)?.count || 0);
  const commissionerCount = Number(first(9)?.count || 0);
  const activationCount = Number(first(10)?.count || 0);
  const leagueConfiguration = parseObject(league?.configuration_json);
  const activated = Boolean(plan.activatedAt);
  const shellMatches = Boolean(league
    && String(league.slug).toLowerCase() === plan.slug.toLowerCase()
    && league.tenant_status === 'disabled'
    && league.public_status !== 'active'
    && leagueConfiguration?.onboarding?.planId === plan.id);
  const activeMatches = Boolean(league
    && String(league.slug).toLowerCase() === plan.slug.toLowerCase()
    && league.tenant_status === 'enabled'
    && league.public_status === 'active'
    && leagueConfiguration?.onboarding?.planId === plan.id
    && leagueConfiguration?.onboarding?.status === 'activated');
  const empty = membershipCount === 0 && activePointerCount === 0 && snapshotCount === 0
    && importCount === 0 && discordInstallationCount === 0 && discordThreadCount === 0;
  const prepared = plan.status === 'prepared';
  const desiredEnabledCount = ONBOARDING_FEATURE_KEYS
    .filter(key => plan.desiredFeatures[key] === true).length;
  const checks = [
    check('plan','Validated plan',plan.planHash ? 'pass' : 'fail','The normalized onboarding contract is retained with an integrity hash.'),
    check('tenant-shell',activated ? 'Active tenant' : 'Disabled tenant shell',prepared ? ((activated ? activeMatches : shellMatches) ? 'pass' : 'fail') : 'pending',activated ? 'The league is enabled at its permanent league URL.' : (prepared ? 'The reserved league exists but is not public or enabled.' : 'Created only when Prepare is selected.')),
    check('features',activated ? 'Feature configuration active' : 'Feature configuration staged',prepared ? (featureCount === ONBOARDING_FEATURE_KEYS.length && enabledFeatureCount === (activated ? desiredEnabledCount : 0) ? 'pass' : 'fail') : 'pending',activated ? 'Only the features retained in the reviewed plan were enabled.' : 'Desired features are retained while every runtime feature remains disabled.'),
    check('commissioner',activated ? 'Initial commissioner active' : 'Initial commissioner staged',prepared ? (activated ? (commissionerCount === 1 && membershipCount === 1 ? 'pass' : 'fail') : (membershipCount === 0 ? 'pass' : 'fail')) : 'pending',activated ? 'The selected FranchiseHQ account has commissioner access.' : 'The existing user is selected, but no membership is granted before activation.'),
    check('export','Permanent export connection reserved',prepared ? (exportEndpointCount === 1 ? 'pass' : 'fail') : 'pending','The permanent endpoint identity is reserved but inaccessible while the tenant is disabled.'),
    check('discord','Discord connection deferred',prepared ? (discordInstallationCount === 0 && discordThreadCount === 0 ? 'pass' : 'fail') : 'pending',plan.discord.requested ? 'Requested settings are staged; no guild or thread is connected.' : 'Discord was not requested for this plan.'),
    check('data',activated ? 'No imported league data yet' : 'No live league data',prepared ? ((activated ? (activePointerCount === 0 && snapshotCount === 0 && importCount === 0 && discordThreadCount === 0) : empty) ? 'pass' : 'fail') : 'pending',activated ? 'Activation did not import Madden data or create Discord schedule threads.' : 'No membership, snapshot, import, Discord installation, or schedule thread exists.'),
    check('activation',activated ? 'Activation recorded' : 'Platform Owner activation required',activated ? (activationCount === 1 ? 'pass' : 'fail') : 'pass',activated ? 'The one-time activation ledger and request evidence are retained.' : 'Preparation cannot publish the league; only the Platform Owner can activate it.')
  ];
  return Object.freeze({
    readyForActivationReview:prepared && !activated && checks.every(item => item.status !== 'fail'),
    activationAvailable:prepared && !activated && checks.every(item => item.status !== 'fail'),
    activated,
    checks:Object.freeze(checks),
    counts:Object.freeze({
      memberships:membershipCount,
      activeSnapshots:activePointerCount,
      snapshots:snapshotCount,
      imports:importCount,
      discordInstallations:discordInstallationCount,
      discordThreads:discordThreadCount
    })
  });
}

export function preparedLeagueStatements(db, plan, actorUserId) {
  const configuration = {
    onboarding:{
      schemaVersion:PLATFORM_ONBOARDING_SCHEMA_VERSION,
      planId:plan.id,
      planHash:plan.planHash,
      status:'prepared',
      activationAvailable:false
    },
    sourceMode:plan.sourceMode,
    gameYear:plan.gameYear,
    desiredDomain:plan.desiredDomain,
    discordRequested:plan.discord.requested,
    discordGuildId:plan.discord.guildId,
    desiredFeatures:plan.desiredFeatures,
    limits:plan.limits
  };
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO leagues
      (id,name,product_name,slug,current_season,current_week,trade_start_week,trade_deadline_week,
       discord_connected,public_status,tenant_status,timezone,branding_json,configuration_json)
      VALUES (?,?,?,?,1,1,1,9,0,'inactive','disabled',?,?,?)`).bind(
      plan.plannedLeagueId,plan.name,plan.productName,plan.slug,plan.timezone,
      JSON.stringify(plan.branding),JSON.stringify(configuration)
    ),
    db.prepare(`INSERT OR IGNORE INTO league_settings
      (league_id,revision,settings_json,updated_by_user_id) VALUES (?,1,?,?)`).bind(
      plan.plannedLeagueId,
      JSON.stringify({ onboarding:{ planId:plan.id,status:'prepared' } }),
      actorUserId
    ),
    db.prepare(`INSERT OR IGNORE INTO league_rules_documents
      (league_id,rules_json,updated_by_user_id) VALUES (?,'{"categories":[]}',?)`).bind(
      plan.plannedLeagueId,actorUserId
    )
  ];
  for (const key of ONBOARDING_FEATURE_KEYS) {
    statements.push(db.prepare(`INSERT OR IGNORE INTO league_features
      (league_id,feature_key,enabled,configuration_json,updated_by_user_id)
      VALUES (?,?,0,?,?)`).bind(
      plan.plannedLeagueId,
      key,
      JSON.stringify({ desiredOnActivation:Boolean(plan.desiredFeatures[key]), onboardingPlanId:plan.id }),
      actorUserId
    ));
  }
  statements.push(db.prepare(`UPDATE companion_league_export_endpoints
    SET created_by_user_id=COALESCE(created_by_user_id,?),updated_at=CURRENT_TIMESTAMP
    WHERE league_id=?`).bind(actorUserId,plan.plannedLeagueId));
  return statements;
}

export function activatedLeagueStatements(db, plan, actorUserId, operationRequestId) {
  const nextRevision = plan.revision + 1;
  const activatedAt = new Date().toISOString();
  const configuration = {
    onboarding:{
      schemaVersion:PLATFORM_ONBOARDING_SCHEMA_VERSION,
      planId:plan.id,
      planHash:plan.planHash,
      status:'activated',
      activationAvailable:false,
      activatedAt
    },
    sourceMode:plan.sourceMode,
    gameYear:plan.gameYear,
    desiredDomain:plan.desiredDomain,
    discordRequested:plan.discord.requested,
    discordGuildId:plan.discord.guildId,
    desiredFeatures:plan.desiredFeatures,
    limits:plan.limits
  };
  const statements = [
    db.prepare(`INSERT INTO platform_league_activations
      (id,plan_id,league_id,activated_by_user_id,initial_commissioner_user_id,
       plan_hash,request_id,previous_tenant_status,previous_public_status,activated_at,detail_json)
      VALUES (?,?,?,?,?,?,?,'disabled','inactive',?,?)`).bind(
      `activation_${crypto.randomUUID()}`,plan.id,plan.plannedLeagueId,actorUserId,
      plan.initialCommissionerUserId,plan.planHash,operationRequestId,activatedAt,
      JSON.stringify({ desiredFeatures:plan.desiredFeatures,sourceMode:plan.sourceMode,discordConnected:false })
    ),
    db.prepare(`UPDATE platform_league_onboarding_plans SET
      activated_by_user_id=?,activated_at=?,activation_request_id=?,revision=?,
      updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='prepared' AND activated_at IS NULL AND revision=?`).bind(
      actorUserId,activatedAt,operationRequestId,nextRevision,actorUserId,plan.id,plan.revision
    ),
    db.prepare(`INSERT INTO league_memberships
      (id,league_id,user_id,role,team_id,active,created_at,updated_at)
      VALUES (?,?,?,'commissioner',NULL,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(
      `membership_${crypto.randomUUID()}`,plan.plannedLeagueId,plan.initialCommissionerUserId
    ),
    db.prepare(`UPDATE leagues SET tenant_status='enabled',public_status='active',
      branding_json=?,configuration_json=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND tenant_status='disabled' AND public_status<>'active'`).bind(
      JSON.stringify(plan.branding),JSON.stringify(configuration),plan.plannedLeagueId
    ),
    db.prepare(`UPDATE league_settings SET revision=revision+1,settings_json=?,
      updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE league_id=?`).bind(
      JSON.stringify({ onboarding:{ planId:plan.id,status:'activated',activatedAt } }),
      actorUserId,plan.plannedLeagueId
    )
  ];
  for (const key of ONBOARDING_FEATURE_KEYS) {
    statements.push(db.prepare(`UPDATE league_features SET enabled=?,configuration_json=?,
      updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE league_id=? AND feature_key=?`).bind(
      plan.desiredFeatures[key] === true ? 1 : 0,
      JSON.stringify({ desiredOnActivation:Boolean(plan.desiredFeatures[key]),onboardingPlanId:plan.id,activatedAt }),
      actorUserId,plan.plannedLeagueId,key
    ));
  }
  statements.push(onboardingEventStatement(db,{
    planId:plan.id,actorUserId,action:'tenant.activated',fromStatus:'prepared',toStatus:'prepared',
    revision:nextRevision,requestId:operationRequestId,
    detail:{ plannedLeagueId:plan.plannedLeagueId,initialCommissionerUserId:plan.initialCommissionerUserId }
  }));
  statements.push(db.prepare(`INSERT INTO tenant_audit_events
    (id,league_id,actor_user_id,request_id,action_id,action,resource_type,resource_id,outcome,detail_json)
    VALUES (?,?,?,?,?,'tenant.activated','onboarding-plan',?,'success',?)`).bind(
    `tenant_audit_${crypto.randomUUID()}`,plan.plannedLeagueId,actorUserId,operationRequestId,
    `act_${crypto.randomUUID()}`,plan.id,
    JSON.stringify({ initialCommissionerUserId:plan.initialCommissionerUserId,planHash:plan.planHash })
  ));
  return statements;
}
