const RELEASE = '7.2.0';
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_NAMESPACE = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

export const TENANT_RELEASE = RELEASE;

export function normalizeTenantSlug(value) {
  return String(value || '').trim().toLowerCase();
}

export function validTenantSlug(value) {
  return SAFE_SLUG.test(normalizeTenantSlug(value));
}

export function tenantSlugFromContext(context, options = {}) {
  const explicit = options.leagueSlug ?? context?.params?.leagueSlug;
  if (explicit) return normalizeTenantSlug(explicit);
  if (options.allowQuery === true && context?.request) {
    const query = new URL(context.request.url).searchParams.get('league');
    if (query) return normalizeTenantSlug(query);
  }
  return null;
}

export function tenantDatabase(env) {
  return env?.FRANCHISE_HQ_DB?.prepare
    ? env.FRANCHISE_HQ_DB
    : (env?.DB?.prepare ? env.DB : null);
}

function parseJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function exactTenantRow(db, slug) {
  return db.prepare(`
    SELECT id, name, product_name, slug, current_season, current_week,
      trade_start_week, trade_deadline_week, discord_guild_id,
      discord_connected, public_status, tenant_status, timezone,
      branding_json, configuration_json, created_at, updated_at
    FROM leagues
    WHERE lower(slug) = lower(?)
    LIMIT 1
  `).bind(slug).first();
}

async function aliasTenantRow(db, slug) {
  return db.prepare(`
    SELECT l.id, l.name, l.product_name, l.slug, l.current_season,
      l.current_week, l.trade_start_week, l.trade_deadline_week,
      l.discord_guild_id, l.discord_connected, l.public_status,
      l.tenant_status, l.timezone, l.branding_json,
      l.configuration_json, l.created_at, l.updated_at
    FROM league_slug_aliases a
    INNER JOIN leagues l ON l.id = a.league_id
    WHERE lower(a.alias_slug) = lower(?)
    LIMIT 1
  `).bind(slug).first();
}

async function tenantRowById(db, leagueId) {
  return db.prepare(`
    SELECT id, name, product_name, slug, current_season, current_week,
      trade_start_week, trade_deadline_week, discord_guild_id,
      discord_connected, public_status, tenant_status, timezone,
      branding_json, configuration_json, created_at, updated_at
    FROM leagues
    WHERE id = ?
    LIMIT 1
  `).bind(leagueId).first();
}

async function tenantFeatures(db, leagueId) {
  const result = await db.prepare(`
    SELECT feature_key, enabled, configuration_json
    FROM league_features
    WHERE league_id = ?
    ORDER BY feature_key
  `).bind(leagueId).all();
  return Object.freeze(Object.fromEntries((result?.results || []).map(row => [
    String(row.feature_key),
    Object.freeze({
      enabled: Boolean(row.enabled),
      configuration: Object.freeze(parseJson(row.configuration_json))
    })
  ])));
}

async function tenantDomains(db, leagueId) {
  const result = await db.prepare(`
    SELECT hostname, is_primary, enabled
    FROM league_domains
    WHERE league_id = ? AND enabled = 1
    ORDER BY is_primary DESC, hostname
  `).bind(leagueId).all();
  return Object.freeze((result?.results || []).map(row => Object.freeze({
    hostname: String(row.hostname).toLowerCase(),
    primary: Boolean(row.is_primary)
  })));
}

async function materializeTenant(db, row, requestedSlug, options) {
  if (!row) return null;
  if (options.requireEnabled !== false
    && (row.tenant_status !== 'enabled' || row.public_status !== 'active')) return null;

  const [features, domains] = await Promise.all([
    tenantFeatures(db, row.id),
    tenantDomains(db, row.id)
  ]);
  const canonicalSlug = normalizeTenantSlug(row.slug);
  return Object.freeze({
    ...row,
    tenantId: String(row.id),
    id: String(row.id),
    slug: canonicalSlug,
    storage_slug: canonicalSlug,
    requested_slug: requestedSlug || canonicalSlug,
    enabled: row.tenant_status === 'enabled' && row.public_status === 'active',
    timezone: String(row.timezone || 'UTC'),
    branding: Object.freeze(parseJson(row.branding_json)),
    configuration: Object.freeze(parseJson(row.configuration_json)),
    features,
    domains
  });
}

export async function resolveTenant(env, requestedSlug, options = {}) {
  const db = tenantDatabase(env);
  const slug = normalizeTenantSlug(requestedSlug);
  if (!db || !validTenantSlug(slug)) return null;

  const row = await exactTenantRow(db, slug) || await aliasTenantRow(db, slug);
  return materializeTenant(db, row, slug, options);
}

export async function resolveTenantById(env, leagueId, options = {}) {
  const db = tenantDatabase(env);
  const id = String(leagueId || '').trim();
  if (!db || !id || !SAFE_NAMESPACE.test(id)) return null;
  return materializeTenant(db, await tenantRowById(db, id), null, options);
}

export async function resolveRequestTenant(context, options = {}) {
  const slug = tenantSlugFromContext(context, options);
  if (!slug) return null;
  return resolveTenant(context.env, slug, options);
}

export function sessionBelongsToTenant(session, tenant) {
  return Boolean(
    session?.membership?.active
    && tenant?.id
    && session.membership.leagueId === tenant.id
  );
}

export function tenantFeatureEnabled(tenant, featureKey) {
  const key = String(featureKey || '').trim();
  return Boolean(key && tenant?.features?.[key]?.enabled === true);
}

export function tenantNamespace(tenantOrId, namespace, suffix = '') {
  const tenantId = typeof tenantOrId === 'object' ? tenantOrId?.id : tenantOrId;
  const id = String(tenantId || '').trim();
  const scope = String(namespace || '').trim();
  if (!SAFE_NAMESPACE.test(id) || !SAFE_NAMESPACE.test(scope)) {
    throw new TypeError('A safe tenant id and namespace are required.');
  }
  const tail = String(suffix || '').replace(/^:+/, '');
  return `tenant:${id}:${scope}${tail ? `:${tail}` : ''}`;
}

export function createTenantAuditContext(context, tenant, session, action) {
  const suppliedRequestId = context?.request?.headers?.get('x-request-id');
  const requestId = suppliedRequestId && SAFE_NAMESPACE.test(suppliedRequestId)
    ? suppliedRequestId
    : `req_${crypto.randomUUID()}`;
  return Object.freeze({
    leagueId: tenant?.id || null,
    actorUserId: session?.user?.id || null,
    requestId,
    actionId: `act_${crypto.randomUUID()}`,
    action: String(action || 'unspecified').slice(0, 100)
  });
}

export function tenantAuditStatement(db, audit, details = {}) {
  if (!db || !audit?.leagueId || !audit?.requestId || !audit?.actionId) {
    throw new TypeError('Complete tenant audit context is required.');
  }
  const id = `tenant_audit_${crypto.randomUUID()}`;
  return db.prepare(`
    INSERT INTO tenant_audit_events
      (id, league_id, actor_user_id, request_id, action_id, action,
       resource_type, resource_id, outcome, detail_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    audit.leagueId,
    audit.actorUserId,
    audit.requestId,
    audit.actionId,
    audit.action,
    details.resourceType || null,
    details.resourceId || null,
    details.outcome || 'success',
    JSON.stringify(details.detail || {})
  );
}

export async function writeTenantAuditEvent(db, audit, details = {}) {
  await tenantAuditStatement(db, audit, details).run();
  return audit;
}
