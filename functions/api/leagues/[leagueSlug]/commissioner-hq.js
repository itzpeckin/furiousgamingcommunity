import { jsonResponse } from '../../../_lib/auth.js';
import { requireCommissioner } from '../../../_lib/permissions.js';
import {
  createTenantAuditContext,
  resolveRequestTenant,
  tenantAuditStatement
} from '../../../_lib/tenant-context.js';

const RELEASE = '7.4.2';
const MANAGED_FEATURES = new Map([
  ['trade_center', 'Trade Center'],
  ['trade_block', 'Trade Block'],
  ['confidence_pool', 'Confidence Pool'],
  ['game_of_the_week', 'Game of the Week']
]);

const parseJson = (value, fallback = {}) => {
  try {
    const parsed = JSON.parse(value || 'null');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const rows = async (db, sql, ...values) => (
  await db.prepare(sql).bind(...values).all()
).results || [];

async function requestContext(context) {
  const authorization = await requireCommissioner(context);
  if (!authorization.authorized) return { response:authorization.response };
  const league = await resolveRequestTenant(context);
  if (!league || authorization.session.membership?.leagueId !== league.id) {
    return { response:jsonResponse({ ok:false, error:'Not found.' }, 404) };
  }
  return { db:context.env.DB, league, session:authorization.session, request:context.request };
}

async function settingsState(db, leagueId) {
  const row = await db.prepare(`SELECT revision,settings_json AS settingsJson,
      updated_by_user_id AS updatedByUserId,updated_at AS updatedAt
    FROM league_settings WHERE league_id=? LIMIT 1`).bind(leagueId).first();
  return {
    revision:Number(row?.revision || 0),
    document:parseJson(row?.settingsJson, {}),
    updatedByUserId:row?.updatedByUserId || null,
    updatedAt:row?.updatedAt || null
  };
}

async function overview(c) {
  const [settings, membershipCounts, activeSnapshot, featureRows, ruleWorkspace,
    publishedRules, settingHistory, auditRows, transactionCount] = await Promise.all([
    settingsState(c.db, c.league.id),
    c.db.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN active=0 THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN active=1 AND team_id IS NOT NULL THEN 1 ELSE 0 END) AS assigned,
        SUM(CASE WHEN active=1 AND role='commissioner' THEN 1 ELSE 0 END) AS commissioners,
        SUM(CASE WHEN active=1 AND role='trade_committee' THEN 1 ELSE 0 END) AS committee
      FROM league_memberships WHERE league_id=?`).bind(c.league.id).first(),
    c.db.prepare(`SELECT active.snapshot_id AS snapshotId,active.activated_at AS activatedAt,
        snapshot.validation_status AS validationStatus,snapshot.validation_score AS validationScore
      FROM league_active_snapshots active
      LEFT JOIN league_snapshots snapshot
        ON snapshot.id=active.snapshot_id AND snapshot.league_id=active.league_id
      WHERE active.league_id=? LIMIT 1`).bind(c.league.id).first(),
    rows(c.db, `SELECT feature_key AS featureKey,enabled,configuration_json AS configurationJson,
        updated_at AS updatedAt FROM league_features WHERE league_id=? ORDER BY feature_key`, c.league.id),
    c.db.prepare(`SELECT revision,base_publication_revision AS basePublicationRevision,
        draft_rules_json AS draftRulesJson,updated_at AS updatedAt
      FROM league_rules_workspaces WHERE league_id=? LIMIT 1`).bind(c.league.id).first(),
    c.db.prepare(`SELECT publication_revision AS publicationRevision,created_at AS publishedAt
      FROM league_rule_publications WHERE league_id=?
      ORDER BY publication_revision DESC LIMIT 1`).bind(c.league.id).first(),
    rows(c.db, `SELECT revision.revision,revision.change_reason AS changeReason,
        revision.created_at AS createdAt,
        user.display_name AS changedBy
      FROM league_setting_revisions revision
      LEFT JOIN users user ON user.id=revision.changed_by_user_id
      WHERE revision.league_id=? ORDER BY revision.revision DESC LIMIT 12`, c.league.id),
    rows(c.db, `SELECT audit.id,audit.action,audit.resource_type AS resourceType,
        audit.resource_id AS resourceId,audit.outcome,audit.detail_json AS detailJson,
        audit.created_at AS createdAt,user.display_name AS actorName
      FROM tenant_audit_events audit
      LEFT JOIN users user ON user.id=audit.actor_user_id
      WHERE audit.league_id=? ORDER BY audit.created_at DESC,audit.id DESC LIMIT 60`, c.league.id),
    c.db.prepare(`SELECT COUNT(*) AS count FROM league_transaction_history
      WHERE league_id=?`).bind(c.league.id).first()
  ]);

  const features = [...MANAGED_FEATURES].map(([featureKey, label]) => {
    const stored = featureRows.find(item => item.featureKey === featureKey);
    return {
      featureKey,
      label,
      enabled:stored ? Boolean(Number(stored.enabled)) : true,
      configuration:parseJson(stored?.configurationJson, {}),
      updatedAt:stored?.updatedAt || null
    };
  });
  const draft = parseJson(ruleWorkspace?.draftRulesJson, {categories:[]});
  const rulesDirty = Boolean(ruleWorkspace && (
    Number(ruleWorkspace.basePublicationRevision || 0) !== Number(publishedRules?.publicationRevision || 0)
    || JSON.stringify(draft) !== JSON.stringify(parseJson((await c.db.prepare(
      `SELECT rules_json AS rulesJson FROM league_rules_documents WHERE league_id=? LIMIT 1`
    ).bind(c.league.id).first())?.rulesJson, {categories:[]}))
  ));
  const audit = auditRows.map(item => ({
    ...item,
    detail:parseJson(item.detailJson, {}),
    detailJson:undefined
  }));
  const attention = [];
  if (Number(membershipCounts?.pending || 0)) attention.push({
    code:'pending_members',tone:'warning',title:`${membershipCounts.pending} member${Number(membershipCounts.pending) === 1 ? '' : 's'} awaiting assignment`,
    message:'Assign a team and role before they can enter the league.',target:'teams'
  });
  if (rulesDirty) attention.push({
    code:'rules_draft',tone:'accent',title:'Rules draft not published',
    message:'Owners still see the previous published rulebook.',target:'rules'
  });
  if (!activeSnapshot?.snapshotId) attention.push({
    code:'snapshot_missing',tone:'danger',title:'No active league snapshot',
    message:'Review League Data before owners use the league.',target:'league-data'
  });

  return {
    ok:true,
    release:RELEASE,
    league:{
      id:c.league.id,slug:c.league.slug,name:c.league.name,
      currentSeason:Number(c.league.current_season || 1),
      currentWeek:Number(c.league.current_week || 1),timezone:c.league.timezone || 'UTC'
    },
    settings:{revision:settings.revision,updatedAt:settings.updatedAt},
    memberships:{
      total:Number(membershipCounts?.total || 0),active:Number(membershipCounts?.active || 0),
      pending:Number(membershipCounts?.pending || 0),assigned:Number(membershipCounts?.assigned || 0),
      commissioners:Number(membershipCounts?.commissioners || 0),committee:Number(membershipCounts?.committee || 0)
    },
    activeSnapshot:activeSnapshot ? {
      snapshotId:activeSnapshot.snapshotId,activatedAt:activeSnapshot.activatedAt,
      validationStatus:activeSnapshot.validationStatus || 'active',
      validationScore:activeSnapshot.validationScore == null ? null : Number(activeSnapshot.validationScore)
    } : null,
    transactionCount:Number(transactionCount?.count || 0),
    features,
    rules:{
      workspaceRevision:Number(ruleWorkspace?.revision || 0),
      publicationRevision:Number(publishedRules?.publicationRevision || 0),
      updatedAt:ruleWorkspace?.updatedAt || null,
      publishedAt:publishedRules?.publishedAt || null,
      dirty:rulesDirty
    },
    settingHistory,
    audit,
    attention
  };
}

async function updateFeature(c, body) {
  const featureKey = String(body.featureKey || '');
  if (!MANAGED_FEATURES.has(featureKey)) {
    throw Object.assign(new Error('That feature cannot be managed from Commissioner HQ.'), {status:400});
  }
  const current = await settingsState(c.db, c.league.id);
  if (!Number.isInteger(Number(body.revision)) || Number(body.revision) !== current.revision) {
    throw Object.assign(new Error('League settings changed in another session. Refresh before saving.'), {status:409});
  }
  const enabled = body.enabled === true;
  const document = structuredClone(current.document);
  document.commissioner = document.commissioner && typeof document.commissioner === 'object'
    ? document.commissioner : {};
  document.commissioner.features = document.commissioner.features && typeof document.commissioner.features === 'object'
    ? document.commissioner.features : {};
  document.commissioner.features[featureKey] = enabled;
  const nextRevision = current.revision + 1;
  const audit = createTenantAuditContext({request:c.request}, c.league, c.session, 'league_feature_updated');
  await c.db.batch([
    c.db.prepare(`INSERT INTO league_features
      (league_id,feature_key,enabled,configuration_json,updated_by_user_id,updated_at)
      VALUES (?,?,?,'{}',?,CURRENT_TIMESTAMP)
      ON CONFLICT(league_id,feature_key) DO UPDATE SET enabled=excluded.enabled,
        updated_by_user_id=excluded.updated_by_user_id,updated_at=CURRENT_TIMESTAMP`)
      .bind(c.league.id,featureKey,enabled ? 1 : 0,c.session.user.id),
    c.db.prepare(`INSERT INTO league_settings
      (league_id,revision,settings_json,updated_by_user_id,updated_at)
      VALUES (?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(league_id) DO UPDATE SET revision=excluded.revision,
        settings_json=excluded.settings_json,updated_by_user_id=excluded.updated_by_user_id,
        updated_at=CURRENT_TIMESTAMP`)
      .bind(c.league.id,nextRevision,JSON.stringify(document),c.session.user.id),
    c.db.prepare(`INSERT INTO league_setting_revisions
      (id,league_id,revision,settings_json,changed_by_user_id,change_reason,created_at)
      VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
      .bind(`setting_revision_${crypto.randomUUID()}`,c.league.id,nextRevision,
        JSON.stringify(document),c.session.user.id,`${MANAGED_FEATURES.get(featureKey)} ${enabled ? 'enabled' : 'disabled'}`),
    tenantAuditStatement(c.db,audit,{
      resourceType:'league_feature',resourceId:featureKey,
      detail:{featureKey,enabled,settingsRevision:nextRevision}
    })
  ]);
}

export async function onRequestGet(context) {
  try {
    const c = await requestContext(context);
    if (c.response) return c.response;
    return jsonResponse(await overview(c));
  } catch (error) {
    return jsonResponse({ok:false,release:RELEASE,error:error?.message || 'Commissioner HQ could not be loaded.'}, Number(error?.status) || 500);
  }
}

export async function onRequestPost(context) {
  try {
    const c = await requestContext(context);
    if (c.response) return c.response;
    const body = await context.request.json();
    if (body?.action !== 'feature') {
      return jsonResponse({ok:false,release:RELEASE,error:'Unknown Commissioner HQ action.'}, 400);
    }
    await updateFeature(c, body);
    return jsonResponse({...await overview(c),action:'feature'});
  } catch (error) {
    return jsonResponse({ok:false,release:RELEASE,error:error?.message || 'Commissioner action failed.'}, Number(error?.status) || 500);
  }
}
