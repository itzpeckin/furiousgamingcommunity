import { sha256Hex } from './cloud-platform.js';
import { buildMaddenDiscoveryReport } from './madden-discovery.js';
import { reportImportReadiness } from './permanent-league-export.js';

const MAX_CAPTURE_COUNT = 250;
const READ_CONCURRENCY = 8;

function parse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

export function publicMaddenDiscoveryReport(row) {
  if (!row) return null;
  const requirements = parse(row.requirement_results_json, {});
  return {
    id:row.id,
    discoverySessionId:row.session_id,
    status:row.status,
    routeCount:Number(row.route_count || 0),
    captureCount:Number(row.capture_count || 0),
    totalBytes:Number(row.total_bytes || 0),
    captureWindowMs:row.capture_window_ms === null ? null : Number(row.capture_window_ms),
    sourceMarkers:parse(row.source_markers_json, {}),
    sourceVerification:parse(row.source_verification_json, {}),
    datasetInventory:parse(row.dataset_inventory_json, []),
    fieldInventory:parse(row.field_inventory_json, []),
    relationshipInventory:parse(row.relationship_inventory_json, []),
    requirements,
    playerImportReadiness:requirements?.players?.assignmentEvidence || null,
    freeAgentEvidence:parse(row.free_agent_evidence_json, {}),
    sanitizedFixture:parse(row.sanitized_fixture_json, {}),
    reportHash:row.report_hash,
    generatedAt:row.generated_at,
    rawPayloadReturned:false,
    activationPerformed:false,
    activeSnapshotChanged:false
  };
}

export async function latestMaddenDiscoveryReport(db, leagueId) {
  return db.prepare(`SELECT * FROM madden_discovery_reports
    WHERE league_id=? ORDER BY generated_at DESC,rowid DESC LIMIT 1`).bind(leagueId).first();
}

async function sessionFor(db, leagueId, sessionId) {
  return db.prepare(`SELECT * FROM madden_discovery_sessions
    WHERE league_id=? AND id=? LIMIT 1`).bind(leagueId,sessionId).first();
}

async function captureRows(db, leagueId, sessionId) {
  const linked = await db.prepare(`SELECT c.*,link.observed_at session_observed_at
    FROM madden_discovery_session_captures link
    JOIN companion_route_captures c ON c.id=link.capture_id AND c.league_id=link.league_id
    WHERE link.league_id=? AND link.session_id=?
    ORDER BY link.observed_at ASC LIMIT ?`).bind(leagueId,sessionId,MAX_CAPTURE_COUNT).all();
  if ((linked.results || []).length) return linked.results;
  const legacy = await db.prepare(`SELECT *,received_at session_observed_at
    FROM companion_route_captures WHERE league_id=? AND discovery_session_id=?
    ORDER BY received_at ASC LIMIT ?`).bind(leagueId,sessionId,MAX_CAPTURE_COUNT).all();
  return legacy.results || [];
}

async function payloadFor(env, row) {
  const object = row.r2_object_key ? await env.COMPANION_EXPORTS.get(row.r2_object_key) : null;
  if (!object) return null;
  try { return JSON.parse(await object.text()); } catch { return null; }
}

async function inspectCaptures(env, rows) {
  const captures = [];
  for (let offset=0; offset<rows.length; offset+=READ_CONCURRENCY) {
    const resolved = await Promise.all(rows.slice(offset,offset+READ_CONCURRENCY).map(async row => ({
      captureId:row.id,
      routePath:row.route_path,
      byteLength:Number(row.byte_length || 0),
      receivedAt:row.session_observed_at || row.received_at,
      payloadHash:row.payload_hash,
      payload:await payloadFor(env,row)
    })));
    captures.push(...resolved);
  }
  return captures;
}

async function updatePermanentPointer(db, leagueId, sessionId, reportId, generatedAt, ready) {
  await db.prepare(`UPDATE companion_league_export_endpoints SET
    latest_session_id=?,latest_report_id=?,
    latest_ready_report_id=CASE WHEN ?=1 THEN ? ELSE latest_ready_report_id END,
    last_analyzed_at=?,analysis_requested_at=NULL,updated_at=?
    WHERE league_id=? AND (latest_session_id IS NULL OR latest_session_id=?)`).bind(
      sessionId,reportId,ready ? 1 : 0,reportId,generatedAt,generatedAt,leagueId,sessionId
    ).run();
}

export async function generateMaddenDiscoveryReport({
  db,env,leagueId,sessionId,generatedByUserId=null,reuseExisting=false
}) {
  const session = await sessionFor(db,leagueId,sessionId);
  if (!session) throw Object.assign(new Error('Madden discovery session not found.'),{status:404});
  const rows = await captureRows(db,leagueId,session.id);
  if (!rows.length) throw Object.assign(new Error('This export has not received any Madden routes yet.'),{status:422});
  const retained = reuseExisting
    ? await db.prepare(`SELECT * FROM madden_discovery_reports WHERE league_id=? AND session_id=? LIMIT 1`)
      .bind(leagueId,session.id).first()
    : null;
  const totalBytes = rows.reduce((sum,row)=>sum+Number(row.byte_length || 0),0);
  const newestObservedAt = rows.reduce((latest,row)=>Math.max(
    latest,Date.parse(row.session_observed_at || row.received_at || '') || 0
  ),0);
  if (retained
    && Number(retained.capture_count || 0) === rows.length
    && Number(retained.total_bytes || 0) === totalBytes
    && (Date.parse(retained.generated_at || '') || 0) >= newestObservedAt) {
    const retainedPublic = publicMaddenDiscoveryReport(retained);
    const retainedReadiness = reportImportReadiness(retainedPublic);
    await updatePermanentPointer(db,leagueId,session.id,retained.id,retained.generated_at,retainedReadiness.ready);
    return { report:retainedPublic,reusedExisting:true,readiness:retainedReadiness };
  }

  const captures = await inspectCaptures(env,rows);
  const report = buildMaddenDiscoveryReport(captures,{
    discoverySessionId:session.id,
    expected:{
      gameRelease:session.expected_game_release,
      platform:session.expected_platform,
      leagueName:session.expected_league_name,
      season:session.expected_season,
      week:session.expected_week
    }
  });
  const reportHash = await sha256Hex(new TextEncoder().encode(JSON.stringify(report.sanitizedFixture)));
  const existing = await db.prepare(`SELECT id FROM madden_discovery_reports
    WHERE league_id=? AND session_id=? LIMIT 1`).bind(leagueId,session.id).first();
  const reportId = existing?.id || `m27_report_${crypto.randomUUID()}`;
  const generatedAt = new Date().toISOString();
  const readiness = reportImportReadiness(report);

  await db.batch([
    db.prepare(`INSERT INTO madden_discovery_reports
      (id,league_id,session_id,status,route_count,capture_count,total_bytes,capture_window_ms,
       source_markers_json,source_verification_json,dataset_inventory_json,field_inventory_json,relationship_inventory_json,
       requirement_results_json,free_agent_evidence_json,sanitized_fixture_json,report_hash,
       generated_by_user_id,generated_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(league_id,session_id) DO UPDATE SET
       status=excluded.status,route_count=excluded.route_count,capture_count=excluded.capture_count,
       total_bytes=excluded.total_bytes,capture_window_ms=excluded.capture_window_ms,
       source_markers_json=excluded.source_markers_json,source_verification_json=excluded.source_verification_json,
       dataset_inventory_json=excluded.dataset_inventory_json,field_inventory_json=excluded.field_inventory_json,
       relationship_inventory_json=excluded.relationship_inventory_json,
       requirement_results_json=excluded.requirement_results_json,free_agent_evidence_json=excluded.free_agent_evidence_json,
       sanitized_fixture_json=excluded.sanitized_fixture_json,report_hash=excluded.report_hash,
       generated_by_user_id=excluded.generated_by_user_id,generated_at=excluded.generated_at,updated_at=excluded.updated_at`).bind(
        reportId,leagueId,session.id,report.status,report.routeCount,report.captureCount,report.totalBytes,
        report.captureWindowMs,JSON.stringify(report.sourceMarkers),JSON.stringify(report.sourceVerification),
        JSON.stringify(report.datasetInventory),JSON.stringify(report.fieldInventory),JSON.stringify(report.relationshipInventory),
        JSON.stringify(report.requirements),JSON.stringify(report.freeAgentEvidence),JSON.stringify(report.sanitizedFixture),
        reportHash,generatedByUserId,generatedAt,generatedAt
      ),
    db.prepare(`UPDATE madden_discovery_sessions SET status=?,capture_count=?,completed_at=?,updated_at=?
      WHERE league_id=? AND id=?`).bind(
        readiness.ready ? 'passed' : 'review_required',report.captureCount,generatedAt,generatedAt,leagueId,session.id
      ),
    db.prepare(`UPDATE companion_league_export_endpoints SET
      latest_session_id=?,latest_report_id=?,
      latest_ready_report_id=CASE WHEN ?=1 THEN ? ELSE latest_ready_report_id END,
      last_analyzed_at=?,analysis_requested_at=NULL,updated_at=?
      WHERE league_id=? AND (latest_session_id IS NULL OR latest_session_id=?)`).bind(
        session.id,reportId,readiness.ready ? 1 : 0,reportId,generatedAt,generatedAt,leagueId,session.id
      )
  ]);

  return {
    report:{...report,id:reportId,reportHash,generatedAt},
    reusedExisting:false,
    readiness
  };
}
