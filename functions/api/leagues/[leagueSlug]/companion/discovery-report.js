import {
  json,
  database,
  normalizeLeagueSlug,
  validLeagueSlug,
  resolveLeague,
  sha256Hex
} from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';
import { buildMaddenDiscoveryReport } from '../../../../_lib/madden-discovery.js';

const RELEASE = '7.3.2';
const MAX_CAPTURE_COUNT = 250;
const READ_CONCURRENCY = 8;

function parse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

async function state(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return { response: json({ ok: false, error: 'Invalid league slug.', release: RELEASE }, 400) };
  const authorization = await requireCommissioner(context);
  if (!authorization.authorized) return { response: authorization.response };
  const db = database(context.env);
  const league = db ? await resolveLeague(context.env, slug) : null;
  if (!db || !league || authorization.session.membership?.leagueId !== league.id) {
    return { response: json({ ok: false, error: 'Not found.' }, 404) };
  }
  if (!context.env.COMPANION_EXPORTS?.get) {
    return { response: json({ ok: false, error: 'Companion capture storage is unavailable.', release: RELEASE }, 503) };
  }
  return { db, league, slug, authorization };
}

function publicReport(row) {
  if (!row) return null;
  const requirements = parse(row.requirement_results_json, {});
  return {
    id: row.id,
    discoverySessionId: row.session_id,
    status: row.status,
    routeCount: Number(row.route_count || 0),
    captureCount: Number(row.capture_count || 0),
    totalBytes: Number(row.total_bytes || 0),
    captureWindowMs: row.capture_window_ms === null ? null : Number(row.capture_window_ms),
    sourceMarkers: parse(row.source_markers_json, {}),
    sourceVerification: parse(row.source_verification_json, {}),
    datasetInventory: parse(row.dataset_inventory_json, []),
    fieldInventory: parse(row.field_inventory_json, []),
    relationshipInventory: parse(row.relationship_inventory_json, []),
    requirements,
    playerImportReadiness: requirements?.players?.assignmentEvidence || null,
    freeAgentEvidence: parse(row.free_agent_evidence_json, {}),
    sanitizedFixture: parse(row.sanitized_fixture_json, {}),
    reportHash: row.report_hash,
    generatedAt: row.generated_at,
    rawPayloadReturned: false,
    activationPerformed: false,
    activeSnapshotChanged: false
  };
}

async function latestReport(db, leagueId) {
  return db.prepare(`SELECT * FROM madden_discovery_reports
    WHERE league_id=? ORDER BY generated_at DESC LIMIT 1`).bind(leagueId).first();
}

async function sessionFor(db, leagueId, requestedSessionId) {
  if (requestedSessionId) {
    return db.prepare(`SELECT * FROM madden_discovery_sessions
      WHERE league_id=? AND id=? LIMIT 1`).bind(leagueId, requestedSessionId).first();
  }
  return db.prepare(`SELECT * FROM madden_discovery_sessions
    WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();
}

async function captureRows(db, leagueId, sessionId) {
  const joined = await db.prepare(`SELECT c.*, link.observed_at AS session_observed_at
    FROM madden_discovery_session_captures link
    JOIN companion_route_captures c ON c.id=link.capture_id AND c.league_id=link.league_id
    WHERE link.league_id=? AND link.session_id=?
    ORDER BY link.observed_at ASC LIMIT ?`).bind(leagueId, sessionId, MAX_CAPTURE_COUNT).all();
  if ((joined.results || []).length) return joined.results;
  const legacy = await db.prepare(`SELECT *, received_at AS session_observed_at
    FROM companion_route_captures WHERE league_id=? AND discovery_session_id=?
    ORDER BY received_at ASC LIMIT ?`).bind(leagueId, sessionId, MAX_CAPTURE_COUNT).all();
  return legacy.results || [];
}

async function payloadFor(env, row) {
  const object = row.r2_object_key ? await env.COMPANION_EXPORTS.get(row.r2_object_key) : null;
  if (!object) return null;
  try { return JSON.parse(await object.text()); } catch { return null; }
}

async function inspectCaptures(env, rows) {
  const captures = [];
  for (let offset = 0; offset < rows.length; offset += READ_CONCURRENCY) {
    const batch = rows.slice(offset, offset + READ_CONCURRENCY);
    const resolved = await Promise.all(batch.map(async row => ({
      captureId: row.id,
      routePath: row.route_path,
      byteLength: Number(row.byte_length || 0),
      receivedAt: row.session_observed_at || row.received_at,
      payloadHash: row.payload_hash,
      payload: await payloadFor(env, row)
    })));
    captures.push(...resolved);
  }
  return captures;
}

export async function onRequestGet(context) {
  const current = await state(context);
  if (current.response) return current.response;
  const report = await latestReport(current.db, current.league.id);
  return json({
    ok: true,
    release: RELEASE,
    reportAvailable: Boolean(report),
    report: publicReport(report),
    rawPayloadReturned: false,
    activationPerformed: false
  });
}

export async function onRequestPost(context) {
  const current = await state(context);
  if (current.response) return current.response;
  let body = {};
  try { body = await context.request.json(); } catch { body = {}; }
  const session = await sessionFor(current.db, current.league.id, String(body.sessionId || '').trim());
  if (!session) return json({ ok: false, error: 'No Madden 27 discovery session is available.', release: RELEASE }, 404);
  const rows = await captureRows(current.db, current.league.id, session.id);
  if (!rows.length) return json({ ok: false, error: 'This discovery session has not received any Madden routes yet.', release: RELEASE }, 422);

  const captures = await inspectCaptures(context.env, rows);
  const report = buildMaddenDiscoveryReport(captures, {
    discoverySessionId: session.id,
    expected: {
      gameRelease: session.expected_game_release,
      platform: session.expected_platform,
      leagueName: session.expected_league_name,
      season: session.expected_season,
      week: session.expected_week
    }
  });
  const reportHash = await sha256Hex(new TextEncoder().encode(JSON.stringify(report.sanitizedFixture)));
  const existingReport = await current.db.prepare(`SELECT id FROM madden_discovery_reports
    WHERE league_id=? AND session_id=? LIMIT 1`).bind(current.league.id, session.id).first();
  const reportId = existingReport?.id || `m27_report_${crypto.randomUUID()}`;
  const generatedAt = new Date().toISOString();

  await current.db.batch([
    current.db.prepare(`INSERT INTO madden_discovery_reports
      (id,league_id,session_id,status,route_count,capture_count,total_bytes,capture_window_ms,
       source_markers_json,source_verification_json,dataset_inventory_json,field_inventory_json,relationship_inventory_json,
       requirement_results_json,free_agent_evidence_json,sanitized_fixture_json,report_hash,
       generated_by_user_id,generated_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(league_id,session_id) DO UPDATE SET
       status=excluded.status,route_count=excluded.route_count,capture_count=excluded.capture_count,
       total_bytes=excluded.total_bytes,capture_window_ms=excluded.capture_window_ms,
       source_markers_json=excluded.source_markers_json,source_verification_json=excluded.source_verification_json,
       dataset_inventory_json=excluded.dataset_inventory_json,
       field_inventory_json=excluded.field_inventory_json,relationship_inventory_json=excluded.relationship_inventory_json,
       requirement_results_json=excluded.requirement_results_json,free_agent_evidence_json=excluded.free_agent_evidence_json,
       sanitized_fixture_json=excluded.sanitized_fixture_json,report_hash=excluded.report_hash,
       generated_by_user_id=excluded.generated_by_user_id,generated_at=excluded.generated_at,updated_at=excluded.updated_at`).bind(
        reportId,
        current.league.id,
        session.id,
        report.status,
        report.routeCount,
        report.captureCount,
        report.totalBytes,
        report.captureWindowMs,
        JSON.stringify(report.sourceMarkers),
        JSON.stringify(report.sourceVerification),
        JSON.stringify(report.datasetInventory),
        JSON.stringify(report.fieldInventory),
        JSON.stringify(report.relationshipInventory),
        JSON.stringify(report.requirements),
        JSON.stringify(report.freeAgentEvidence),
        JSON.stringify(report.sanitizedFixture),
        reportHash,
        current.authorization.session.user.id,
        generatedAt,
        generatedAt
      ),
    current.db.prepare(`UPDATE madden_discovery_sessions
      SET status=?, capture_count=?, completed_at=?, updated_at=? WHERE league_id=? AND id=?`).bind(
        report.status === 'passed' ? 'passed' : 'review_required',
        report.captureCount,
        generatedAt,
        generatedAt,
        current.league.id,
        session.id
      )
  ]);

  return json({
    ok: true,
    release: RELEASE,
    report: { ...report, id: reportId, reportHash, generatedAt },
    rawPayloadReturned: false,
    activationPerformed: false,
    activeSnapshotChanged: false
  });
}
