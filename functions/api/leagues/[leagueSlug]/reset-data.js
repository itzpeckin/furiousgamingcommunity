import { createId, jsonResponse } from '../../../_lib/auth.js';
import { requireCommissioner } from '../../../_lib/permissions.js';

const RELEASE = '7.0.4';
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const DELETE_ORDER = Object.freeze([
  'canonical_transaction_evidence',
  'canonical_transactions',
  'canonical_roster_snapshot_players',
  'canonical_roster_snapshots',
  'forward_detection_runs',
  'forward_roster_movements',
  'snapshot_validation_jobs',
  'league_snapshot_lifecycle_events',
  'league_active_snapshots',
  'league_snapshot_records',
  'league_snapshots',
  'companion_canonical_statistics_preview',
  'companion_statistics_mapping_batches',
  'canonical_statistics_snapshot_manifest',
  'companion_statistics_mapping_runs',
  'companion_canonical_games_preview',
  'companion_schedule_mapping_runs',
  'companion_canonical_players_preview',
  'companion_player_mapping_runs',
  'companion_canonical_teams_preview',
  'companion_team_mapping_runs',
  'companion_import_orchestrator_runs',
  'server_import_delegations',
  'companion_dataset_inspections',
  'companion_route_captures'
]);

async function resolveLeague(context) {
  const slug = String(context.params?.leagueSlug || '').trim();
  if (!/^[A-Za-z0-9-]{1,100}$/.test(slug)) return null;
  return context.env.DB.prepare(`
    SELECT id, slug, name FROM leagues
    WHERE lower(slug)=lower(?) AND public_status='active' LIMIT 1
  `).bind(slug).first();
}

async function hasLeagueId(db, table) {
  try {
    const result = await db.prepare(`PRAGMA table_info(${table})`).all();
    return (result?.results || []).some(column => column.name === 'league_id');
  } catch { return false; }
}

async function countTable(db, table, leagueId) {
  if (!await hasLeagueId(db, table)) return 0;
  try {
    const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE league_id=?`).bind(leagueId).first();
    return Number(row?.count || 0);
  } catch { return 0; }
}

async function counts(db, leagueId) {
  const result = {};
  for (const table of DELETE_ORDER) result[table] = await countTable(db, table, leagueId);
  return result;
}

async function access(context) {
  const auth = await requireCommissioner(context);
  if (!auth.authorized) return {response:auth.response};
  const league = await resolveLeague(context);
  if (!league || auth.session.membership?.leagueId !== league.id) {
    return {response:jsonResponse({ok:false,error:'Not found.'},404)};
  }
  return {auth,league};
}

export async function onRequestGet(context) {
  const state = await access(context);
  if (state.response) return state.response;
  return jsonResponse({
    ok:true,
    release:RELEASE,
    league:state.league,
    confirmation:state.league.slug,
    counts:await counts(context.env.DB, state.league.id),
    preservedDomains:['users','sessions','league_memberships','league_rules_documents','leagues']
  });
}

export async function onRequestPost(context) {
  const state = await access(context);
  if (state.response) return state.response;
  const body = await context.request.json().catch(() => null);
  if (!body || body.confirmation !== state.league.slug) {
    return jsonResponse({ok:false,error:'The exact league slug is required to confirm this reset.'},400);
  }
  const requested = Array.isArray(body.preserveUserIds) ? body.preserveUserIds.map(String) : [];
  if (requested.some(userId => !SAFE_ID.test(userId))) {
    return jsonResponse({ok:false,error:'A preserved user ID is invalid.'},400);
  }
  const preserved = [...new Set([state.auth.session.user.id, ...requested])];
  const captures = await context.env.DB.prepare(`
    SELECT r2_object_key AS objectKey FROM companion_route_captures WHERE league_id=?
  `).bind(state.league.id).all().catch(() => ({results:[]}));
  const deletedCounts = await counts(context.env.DB, state.league.id);
  const placeholders = preserved.map(() => '?').join(',');
  const disabledPreview = await context.env.DB.prepare(`
    SELECT COUNT(*) AS count FROM league_memberships
    WHERE league_id=? AND active=1 AND user_id NOT IN (${placeholders})
  `).bind(state.league.id, ...preserved).first();
  deletedCounts.disabledMemberships = Number(disabledPreview?.count || 0);
  const statements = [];
  for (const table of DELETE_ORDER) {
    if (await hasLeagueId(context.env.DB, table)) {
      statements.push(context.env.DB.prepare(`DELETE FROM ${table} WHERE league_id=?`).bind(state.league.id));
    }
  }
  statements.push(context.env.DB.prepare(`
    UPDATE league_memberships
    SET active=0, updated_at=CURRENT_TIMESTAMP
    WHERE league_id=? AND user_id NOT IN (${placeholders})
  `).bind(state.league.id, ...preserved));
  statements.push(context.env.DB.prepare(`
    INSERT INTO league_data_reset_audit
      (id, league_id, actor_user_id, preserved_user_ids_json, deleted_counts_json)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    createId('data_reset'), state.league.id, state.auth.session.user.id,
    JSON.stringify(preserved), JSON.stringify(deletedCounts)
  ));
  await context.env.DB.batch(statements);
  let objectDeleteFailures = 0;
  if (context.env.COMPANION_EXPORTS?.delete) {
    const objectResults = await Promise.allSettled((captures?.results || []).map(row => row.objectKey).filter(Boolean).map(key => context.env.COMPANION_EXPORTS.delete(key)));
    objectDeleteFailures = objectResults.filter(result => result.status === 'rejected').length;
  }
  return jsonResponse({
    ok:true,
    release:RELEASE,
    league:state.league,
    preservedUserIds:preserved,
    deletedCounts,
    objectDeleteFailures
  });
}
