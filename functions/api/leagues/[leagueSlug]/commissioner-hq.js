import { jsonResponse } from '../../../_lib/auth.js';
import { requireCommissioner } from '../../../_lib/permissions.js';
import {
  createTenantAuditContext,
  resolveRequestTenant,
  tenantAuditStatement
} from '../../../_lib/tenant-context.js';
import {
  normalizeTradeCenterSettings,
  tradeCenterSettingsFromLeagueDocument,
  withTradeCenterSettings
} from '../../../_lib/trade-center.js';
import { operationalHealth } from '../../../_lib/operational-health.js';
import { scheduleDiscordDeliveryFlush } from '../../../_lib/discord-delivery.js';

const RELEASE = '8.0.2';
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
  return { db:context.env.DB, league, session:authorization.session, request:context.request, context };
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
  const [settings, membershipCounts, memberAttentionRows, activeSnapshot, featureRows, ruleWorkspace,
    publishedRules, settingHistory, auditRows, transactionCount] = await Promise.all([
    settingsState(c.db, c.league.id),
    c.db.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN active=0 AND COALESCE((SELECT audit.action FROM league_membership_audit audit
          WHERE audit.league_id=league_memberships.league_id
            AND audit.subject_user_id=league_memberships.user_id
            AND audit.action IN ('membership_deactivated','membership_restored_pending','membership_removed')
          ORDER BY audit.created_at DESC,audit.rowid DESC LIMIT 1),'')
          NOT IN ('membership_deactivated','membership_removed') THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN active=1 AND team_id IS NULL THEN 1 ELSE 0 END) AS unassigned,
        SUM(CASE WHEN active=1 AND team_id IS NOT NULL THEN 1 ELSE 0 END) AS assigned,
        SUM(CASE WHEN active=1 AND EXISTS (SELECT 1 FROM sessions session
          WHERE session.user_id=league_memberships.user_id AND session.revoked_at IS NULL
            AND session.expires_at>CURRENT_TIMESTAMP
            AND session.last_seen_at>=datetime('now','-5 minutes')) THEN 1 ELSE 0 END) AS online,
        SUM(CASE WHEN active=1 AND role='commissioner' THEN 1 ELSE 0 END) AS commissioners,
        SUM(CASE WHEN active=1 AND role='trade_committee' THEN 1 ELSE 0 END) AS committee
      FROM league_memberships WHERE league_id=?`).bind(c.league.id).first(),
    rows(c.db, `SELECT membership.user_id AS userId,membership.active,membership.team_id AS teamId,
        user.display_name AS displayName,
        (SELECT audit.action FROM league_membership_audit audit
          WHERE audit.league_id=membership.league_id AND audit.subject_user_id=membership.user_id
            AND audit.action IN ('membership_deactivated','membership_restored_pending','membership_removed')
          ORDER BY audit.created_at DESC,audit.rowid DESC LIMIT 1) AS lastAccessAction
      FROM league_memberships membership
      INNER JOIN users user ON user.id=membership.user_id
      WHERE membership.league_id=? ORDER BY lower(user.display_name)`, c.league.id),
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
  const removedMembers = memberAttentionRows.filter(item => !Number(item.active) && item.lastAccessAction === 'membership_removed');
  const pendingMembers = memberAttentionRows.filter(item => !Number(item.active)
    && !['membership_deactivated','membership_removed'].includes(item.lastAccessAction));
  const unassignedMembers = memberAttentionRows.filter(item => Number(item.active) && !item.teamId);
  const attention = [];
  if (pendingMembers.length) attention.push({
    code:'pending_members',tone:'warning',title:`${pendingMembers.length} member${pendingMembers.length === 1 ? '' : 's'} awaiting approval`,
    message:`Approve ${pendingMembers.slice(0,3).map(item => item.displayName).join(', ')}${pendingMembers.length > 3 ? ` and ${pendingMembers.length-3} more` : ''}.`,target:'teams'
  });
  if (unassignedMembers.length) attention.push({
    code:'unassigned_members',tone:'warning',title:`${unassignedMembers.length} active member${unassignedMembers.length === 1 ? '' : 's'} without a team`,
    message:`Assign ${unassignedMembers.slice(0,3).map(item => item.displayName).join(', ')}${unassignedMembers.length > 3 ? ` and ${unassignedMembers.length-3} more` : ''}, or remove league access.`,target:'teams'
  });
  if (rulesDirty) attention.push({
    code:'rules_draft',tone:'accent',title:'Rules draft not published',
    message:'Owners still see the previous published rulebook.',target:'rules'
  });
  if (!activeSnapshot?.snapshotId) attention.push({
    code:'snapshot_missing',tone:'danger',title:'No active league snapshot',
    message:'Review League Data before owners use the league.',target:'league-data'
  });
  const operations = await operationalHealth(c.db, c.league);
  for (const alert of operations.alerts) {
    attention.push({
      code:`operations_${alert.code}`,
      tone:alert.tone,
      title:alert.title,
      message:alert.message,
      target:['canonical_snapshot','import_pipeline'].includes(alert.code)
        ? 'league-data'
        : 'audit'
    });
  }

  return {
    ok:true,
    release:RELEASE,
    league:{
      id:c.league.id,slug:c.league.slug,name:c.league.name,
      currentSeason:Number(c.league.current_season || 1),
      currentWeek:Number(c.league.current_week || 1),timezone:c.league.timezone || 'UTC'
    },
    settings:{revision:settings.revision,updatedAt:settings.updatedAt},
    quickControls:{
      seasonTradeLimitEnabled:tradeCenterSettingsFromLeagueDocument(settings.document).seasonTradeLimitEnabled,
      freeTradeDesignationEnabled:tradeCenterSettingsFromLeagueDocument(settings.document).freeTradeDesignationEnabled,
      calculatorEnabled:tradeCenterSettingsFromLeagueDocument(settings.document).calculatorEnabled,
      confidencePool:features.find(item => item.featureKey === 'confidence_pool')?.enabled !== false
    },
    memberships:{
      total:Math.max(0,Number(membershipCounts?.total || 0)-removedMembers.length),active:Number(membershipCounts?.active || 0),
      pending:Number(membershipCounts?.pending || 0),unassigned:Number(membershipCounts?.unassigned || 0),assigned:Number(membershipCounts?.assigned || 0),
      online:Number(membershipCounts?.online || 0),commissioners:Number(membershipCounts?.commissioners || 0),committee:Number(membershipCounts?.committee || 0)
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
    attention,
    operations
  };
}

async function updateQuickControl(c, body) {
  const key = String(body.key || '');
  const value = body.enabled === true;
  if (key === 'confidencePool') {
    await updateFeature(c,{featureKey:'confidence_pool',enabled:value,revision:body.revision});
    return;
  }
  if (!['seasonTradeLimitEnabled','freeTradeDesignationEnabled','calculatorEnabled'].includes(key)) {
    throw Object.assign(new Error('That Command Center control is not available.'), {status:400});
  }
  const current = await settingsState(c.db,c.league.id);
  if (!Number.isInteger(Number(body.revision)) || Number(body.revision) !== current.revision) {
    throw Object.assign(new Error('League settings changed in another session. Refresh before saving.'), {status:409});
  }
  const settings = normalizeTradeCenterSettings({...tradeCenterSettingsFromLeagueDocument(current.document),[key]:value});
  const document = withTradeCenterSettings(current.document,settings);
  const nextRevision = current.revision + 1;
  const label = ({seasonTradeLimitEnabled:'Trade limit enforcement',freeTradeDesignationEnabled:'Free Trade designations',calculatorEnabled:'Trade Calculator'})[key];
  const audit = createTenantAuditContext({request:c.request},c.league,c.session,'trade_settings_updated');
  await c.db.batch([
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
      .bind(`setting_revision_${crypto.randomUUID()}`,c.league.id,nextRevision,JSON.stringify(document),
        c.session.user.id,`${label} ${value ? 'enabled' : 'disabled'}`),
    tenantAuditStatement(c.db,audit,{resourceType:'league_settings',resourceId:c.league.id,
      detail:{revision:nextRevision,scope:'tradeCenter',key,enabled:value}})
  ]);
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

async function retryDiscordDelivery(c, body) {
  const deliveryId=String(body.deliveryId||'').trim();
  if(!/^discord_delivery_[a-z0-9-]{20,80}$/i.test(deliveryId)){
    throw Object.assign(new Error('That Discord delivery could not be verified.'),{status:400});
  }
  const original=await c.db.prepare(`SELECT id,channel_id AS channelId,event_type AS eventType,
      resource_type AS resourceType,resource_id AS resourceId,payload_json AS payloadJson,status,attempts
    FROM discord_delivery_events WHERE id=? AND league_id=? LIMIT 1`).bind(deliveryId,c.league.id).first();
  if(!original)throw Object.assign(new Error('That Discord delivery was not found in this league.'),{status:404});
  if(original.eventType!=='trade-message-sync'){
    throw Object.assign(new Error('This delivery cannot use the destination-safe retry.'),{status:400});
  }
  if(original.status!=='failed'||Number(original.attempts||0)<5){
    throw Object.assign(new Error('This delivery is not waiting for commissioner retry.'),{status:409});
  }
  const installation=await c.db.prepare(`SELECT status FROM discord_league_installations
    WHERE league_id=? LIMIT 1`).bind(c.league.id).first();
  if(installation?.status!=='active'){
    throw Object.assign(new Error('Reconnect this league to Discord before retrying the delivery.'),{status:409});
  }
  const existing=await c.db.prepare(`SELECT id,status FROM discord_delivery_events
    WHERE league_id=? AND json_extract(payload_json,'$.retryOfDeliveryEventId')=?
      AND status IN ('pending','sending','sent') ORDER BY created_at DESC LIMIT 1`).bind(c.league.id,deliveryId).first();
  if(existing?.status==='sent'){
    throw Object.assign(new Error('This delivery was already resolved by a retained retry.'),{status:409});
  }
  let queuedId=existing?.id||null;
  if(!queuedId){
    queuedId=`discord_delivery_${crypto.randomUUID()}`;
    const payload=parseJson(original.payloadJson,{});
    const audit=createTenantAuditContext({request:c.request},c.league,c.session,'discord_delivery_retry_queued');
    await c.db.batch([
      c.db.prepare(`INSERT INTO discord_delivery_events
        (id,league_id,channel_id,event_type,resource_type,resource_id,visibility,payload_json,idempotency_key)
        VALUES (?,?,?,'trade-message-sync',?,?,'private-channel',?,?)`)
        .bind(queuedId,c.league.id,original.channelId||'trade-message-sync',original.resourceType||'trade_workflow',
          original.resourceId,JSON.stringify({...payload,tradeId:payload.tradeId||original.resourceId,
            leagueSlug:c.league.slug,retryOfDeliveryEventId:deliveryId}),
          `trade-sync-retry:${c.league.id}:${deliveryId}`),
      tenantAuditStatement(c.db,audit,{resourceType:'discord_delivery_event',resourceId:deliveryId,
        detail:{queuedDeliveryEventId:queuedId,eventType:'trade-message-sync',resourceId:original.resourceId}})
    ]);
  }
  scheduleDiscordDeliveryFlush(c.context,c.db,c.league.id);
  return {queuedDeliveryEventId:queuedId};
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
    if (body?.action === 'quick-control') {
      await updateQuickControl(c,body);
      return jsonResponse({...await overview(c),action:'quick-control'});
    }
    if (body?.action === 'retry-discord-delivery') {
      const retry=await retryDiscordDelivery(c,body);
      return jsonResponse({...await overview(c),action:'retry-discord-delivery',retry});
    }
    if (body?.action !== 'feature') {
      return jsonResponse({ok:false,release:RELEASE,error:'Unknown Commissioner HQ action.'}, 400);
    }
    await updateFeature(c, body);
    return jsonResponse({...await overview(c),action:'feature'});
  } catch (error) {
    return jsonResponse({ok:false,release:RELEASE,error:error?.message || 'Commissioner action failed.'}, Number(error?.status) || 500);
  }
}
