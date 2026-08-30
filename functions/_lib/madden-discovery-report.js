import { sha256Hex } from './cloud-platform.js';
import { buildMaddenDiscoveryReport } from './madden-discovery.js';
import { reportImportReadiness } from './permanent-league-export.js';

const MAX_CAPTURE_COUNT = 250;
const READ_CONCURRENCY = 8;
const MAX_RECOVERY_WINDOW_MS = 10_000;

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

function recoveryDataset(routePath) {
  const route = String(routePath || '').toLowerCase();
  if (/\/team\/[^/]+\/roster\/?$/.test(route)) return 'team-rosters';
  if (/\/freeagents\/roster\/?$/.test(route)) return 'free-agents';
  if (/\/(?:league)?teams\/?$/.test(route)) return 'teams';
  if (/\/standings\/?$/.test(route)) return 'standings';
  if (/\/schedules\/?$/.test(route)) return 'schedule';
  if (/\/week\//.test(route)) return 'statistics';
  return 'other';
}

export function recoveryCohortSummary(rows = []) {
  const unique = new Map();
  for (const row of rows) {
    const captureId = String(row?.id || row?.capture_id || '').trim();
    if (captureId) unique.set(captureId,row);
  }
  const counts = {
    captures:unique.size,
    teams:0,
    teamRosters:0,
    freeAgents:0,
    standings:0,
    schedule:0,
    statistics:0,
    other:0
  };
  for (const row of unique.values()) {
    const dataset = recoveryDataset(row.route_path);
    if (dataset === 'team-rosters') counts.teamRosters += 1;
    else if (dataset === 'free-agents') counts.freeAgents += 1;
    else counts[dataset] += 1;
  }
  return counts;
}

function assertRecoveryWindow(firstReceivedAt, lastReceivedAt) {
  const first = Date.parse(String(firstReceivedAt || ''));
  const last = Date.parse(String(lastReceivedAt || ''));
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) {
    throw Object.assign(new Error('A valid exact recovery capture window is required.'),{status:400});
  }
  if (last-first > MAX_RECOVERY_WINDOW_MS) {
    throw Object.assign(new Error('Recovery refuses capture windows longer than ten seconds.'),{status:409});
  }
}

export async function recoverMaddenDiscoveryCohort({
  db,env,leagueId,leagueName,firstReceivedAt,lastReceivedAt,
  expectedCaptureCount=43,generatedByUserId=null
}) {
  assertRecoveryWindow(firstReceivedAt,lastReceivedAt);
  const selected = await db.prepare(`SELECT c.*,MIN(link.observed_at) session_observed_at
    FROM madden_discovery_session_captures link
    JOIN companion_route_captures c ON c.id=link.capture_id AND c.league_id=link.league_id
    WHERE link.league_id=? AND link.observed_at>=? AND link.observed_at<=?
    GROUP BY c.id ORDER BY session_observed_at ASC LIMIT ?`).bind(
      leagueId,firstReceivedAt,lastReceivedAt,MAX_CAPTURE_COUNT+1
    ).all();
  const rows = selected.results || [];
  const summary = recoveryCohortSummary(rows);
  if (summary.captures !== Number(expectedCaptureCount)) {
    throw Object.assign(new Error(
      `Recovery expected ${Number(expectedCaptureCount)} captures but found ${summary.captures}.`
    ),{status:409});
  }
  if (
    summary.teams !== 1
    || summary.teamRosters !== 32
    || summary.freeAgents !== 1
    || summary.standings !== 1
    || summary.schedule !== 1
    || summary.statistics < 1
    || summary.other !== 0
  ) {
    throw Object.assign(new Error('The selected capture window is not one complete Madden export cohort.'),{status:409});
  }

  const digest = await sha256Hex(new TextEncoder().encode(rows.map(row=>row.id).sort().join(':')));
  const sessionId = `m27_recovered_${digest.slice(0,24)}`;
  const tokenHash = await sha256Hex(new TextEncoder().encode(`recovered:${leagueId}:${digest}`));
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now()+24*60*60*1000).toISOString();
  const gameYear = await db.prepare(`SELECT game_release FROM league_game_years
    WHERE league_id=? AND status IN ('active','restored','preparing')
    ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'restored' THEN 1 ELSE 2 END,updated_at DESC LIMIT 1`)
    .bind(leagueId).first();
  const season = await db.prepare(`SELECT source_season_id FROM franchise_seasons
    WHERE league_id=? ORDER BY updated_at DESC,created_at DESC LIMIT 1`).bind(leagueId).first();
  await db.prepare(`INSERT OR IGNORE INTO madden_discovery_sessions
    (id,league_id,token_hash,status,expected_game_release,expected_league_name,expected_season,
     capture_count,expires_at,last_capture_at,created_at,updated_at)
    VALUES (?,?,?,'open',?,?,?,?,?,?,?,?)`).bind(
      sessionId,leagueId,tokenHash,gameYear?.game_release || null,leagueName || null,
      season?.source_season_id || null,summary.captures,expiresAt,lastReceivedAt,now,now
    ).run();
  const links = rows.map(row=>db.prepare(`INSERT OR IGNORE INTO madden_discovery_session_captures
    (league_id,session_id,capture_id,route_path,observed_at) VALUES (?,?,?,?,?)`).bind(
      leagueId,sessionId,row.id,row.route_path,row.session_observed_at || row.received_at
    ));
  for (let offset=0; offset<links.length; offset+=75) await db.batch(links.slice(offset,offset+75));
  await db.prepare(`UPDATE madden_discovery_sessions SET
    capture_count=(SELECT COUNT(*) FROM madden_discovery_session_captures
      WHERE league_id=? AND session_id=?),last_capture_at=?,updated_at=?
    WHERE league_id=? AND id=?`).bind(
      leagueId,sessionId,lastReceivedAt,now,leagueId,sessionId
    ).run();

  const generated = await generateMaddenDiscoveryReport({
    db,env,leagueId,sessionId,generatedByUserId,reuseExisting:true
  });
  if (generated.readiness?.ready !== true) {
    const missing = Object.entries(generated.report?.requirements || {})
      .filter(([,value])=>String(value?.status || '') === 'missing')
      .map(([name])=>name);
    throw Object.assign(new Error(
      `The recovered cohort did not pass latest-export readiness${missing.length ? `; missing: ${missing.join(', ')}` : ''}.`
    ),{status:409});
  }
  await db.prepare(`UPDATE companion_league_export_endpoints SET
    latest_session_id=?,latest_session_token_version=token_version,
    latest_report_id=?,latest_ready_report_id=?,last_analyzed_at=?,
    analysis_requested_at=NULL,updated_at=? WHERE league_id=?`).bind(
      sessionId,generated.report.id,generated.report.id,generated.report.generatedAt,
      generated.report.generatedAt,leagueId
    ).run();
  return {
    sessionId,
    reportId:generated.report.id,
    summary,
    readiness:generated.readiness,
    reusedExisting:generated.reusedExisting === true,
    activeSnapshotChanged:false,
    activationPerformed:false
  };
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
