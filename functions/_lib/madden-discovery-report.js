import { sha256Hex } from './cloud-platform.js';
import { buildMaddenDiscoveryReport } from './madden-discovery.js';
import { reportImportReadiness } from './permanent-league-export.js';

const MAX_CAPTURE_COUNT = 250;
const READ_CONCURRENCY = 8;
const MAX_RECOVERY_WINDOW_MS = 10_000;
const PARTIAL_STITCH_WINDOW_MINUTES = 360;

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
  if ((linked.results || []).length) return latestCapturePerRoute(linked.results);
  const legacy = await db.prepare(`SELECT *,received_at session_observed_at
    FROM companion_route_captures WHERE league_id=? AND discovery_session_id=?
    ORDER BY received_at ASC LIMIT ?`).bind(leagueId,sessionId,MAX_CAPTURE_COUNT).all();
  return latestCapturePerRoute(legacy.results || []);
}

export function latestCapturePerRoute(rows = []) {
  const latest = new Map();
  for (const row of rows) {
    const route = String(row?.route_path || '').trim().toLowerCase();
    if (!route) continue;
    const observedAt = Date.parse(row?.session_observed_at || row?.received_at || '') || 0;
    const retained = latest.get(route);
    const retainedAt = Date.parse(retained?.session_observed_at || retained?.received_at || '') || 0;
    if (!retained || observedAt > retainedAt || (observedAt === retainedAt && String(row?.id || '') > String(retained?.id || ''))) {
      latest.set(route,row);
    }
  }
  return [...latest.values()].sort((left,right) => {
    const leftAt = Date.parse(left?.session_observed_at || left?.received_at || '') || 0;
    const rightAt = Date.parse(right?.session_observed_at || right?.received_at || '') || 0;
    return leftAt-rightAt || String(left?.route_path || '').localeCompare(String(right?.route_path || ''));
  });
}

function markerValues(row, marker) {
  const markers = parse(row?.source_markers_json, {});
  const values = Array.isArray(markers?.[marker]?.observed) ? markers[marker].observed : [];
  return values.map(value=>String(value ?? '').trim().toLowerCase()).filter(Boolean);
}

export function partialReportsCanStitch(rows = []) {
  if (rows.length < 2) return false;
  for (const marker of ['sourceFranchiseId','week','stage']) {
    const observed = new Set(rows.flatMap(row=>markerValues(row,marker)));
    if (observed.size > 1) return false;
  }
  return true;
}

export function partialCaptureRoutesCanStitch(rows = []) {
  const franchises = new Set();
  const periods = new Set();
  for (const row of rows) {
    const segments = String(row?.route_path || '').trim().toLowerCase().replace(/^\/+|\/+$/g,'').split('/');
    if (/^(?:xbsx|xbox|ps5|ps4|pc)$/.test(segments[0] || '') && segments[1]) {
      franchises.add(segments[1] === 'franchise' ? segments[2] : segments[1]);
    }
    const weekIndex = segments.indexOf('week');
    if (weekIndex >= 0 && segments[weekIndex+1] && segments[weekIndex+2]) {
      periods.add(`${segments[weekIndex+1]}:${segments[weekIndex+2]}`);
    }
  }
  return franchises.size <= 1 && periods.size <= 1;
}

export async function stitchRecentPartialMaddenCohort({
  db,env,leagueId,anchorSessionId,generatedByUserId=null
}) {
  const anchor = await sessionFor(db,leagueId,anchorSessionId);
  if (!anchor || !['open','review_required'].includes(String(anchor.status || ''))) {
    return { stitched:false,ready:false,reason:'anchor-not-partial' };
  }
  const anchorAt = anchor.last_capture_at || anchor.created_at;
  const candidates = await db.prepare(`SELECT session.*,report.id report_id,
      report.source_markers_json,report.requirement_results_json
    FROM madden_discovery_sessions session
    LEFT JOIN madden_discovery_reports report
      ON report.league_id=session.league_id AND report.session_id=session.id
    WHERE session.league_id=? AND session.status IN ('open','review_required')
      AND session.id NOT LIKE 'm27_stitched_%'
      AND datetime(COALESCE(session.last_capture_at,session.created_at))>=datetime(?,'-${PARTIAL_STITCH_WINDOW_MINUTES} minutes')
      AND datetime(COALESCE(session.last_capture_at,session.created_at))<=datetime(?,'+30 seconds')
    ORDER BY COALESCE(session.last_capture_at,session.created_at) DESC LIMIT 12`)
    .bind(leagueId,anchorAt,anchorAt).all();
  const rows = candidates.results || [];
  if (!rows.some(row=>row.id===anchor.id) || !partialReportsCanStitch(rows)) {
    return { stitched:false,ready:false,reason:'no-compatible-partials' };
  }
  const placeholders = rows.map(()=>'?').join(',');
  const linked = await db.prepare(`SELECT capture.*,link.observed_at session_observed_at,
      link.session_id source_session_id
    FROM madden_discovery_session_captures link
    JOIN companion_route_captures capture
      ON capture.id=link.capture_id AND capture.league_id=link.league_id
    WHERE link.league_id=? AND link.session_id IN (${placeholders})
    ORDER BY link.observed_at ASC,capture.id ASC LIMIT ?`)
    .bind(leagueId,...rows.map(row=>row.id),MAX_CAPTURE_COUNT).all();
  const selected = latestCapturePerRoute(linked.results || []);
  if (selected.length < 2 || !selected.some(row=>row.source_session_id===anchor.id)
    || !partialCaptureRoutesCanStitch(selected)) {
    return { stitched:false,ready:false,reason:'insufficient-routes' };
  }
  const digest = await sha256Hex(new TextEncoder().encode(selected.map(row=>row.id).sort().join(':')));
  const sessionId = `m27_stitched_${digest.slice(0,24)}`;
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now()+24*60*60*1000).toISOString();
  const tokenHash = await sha256Hex(new TextEncoder().encode(`stitched:${leagueId}:${digest}`));
  await db.prepare(`INSERT OR IGNORE INTO madden_discovery_sessions
    (id,league_id,token_hash,status,expected_game_release,expected_platform,expected_league_name,
     expected_season,expected_week,capture_count,expires_at,last_capture_at,created_at,updated_at)
    VALUES (?,?,?,'open',?,?,?,?,?,?,?,?,?,?)`).bind(
      sessionId,leagueId,tokenHash,anchor.expected_game_release,anchor.expected_platform,
      anchor.expected_league_name,anchor.expected_season,anchor.expected_week,selected.length,
      expiresAt,anchorAt,now,now
    ).run();
  const links = selected.map(row=>db.prepare(`INSERT OR IGNORE INTO madden_discovery_session_captures
    (league_id,session_id,capture_id,route_path,observed_at) VALUES (?,?,?,?,?)`).bind(
      leagueId,sessionId,row.id,row.route_path,row.session_observed_at || row.received_at
    ));
  for (let offset=0; offset<links.length; offset+=75) await db.batch(links.slice(offset,offset+75));
  await db.prepare(`UPDATE madden_discovery_sessions SET capture_count=(
      SELECT COUNT(*) FROM madden_discovery_session_captures WHERE league_id=? AND session_id=?
    ),last_capture_at=?,updated_at=? WHERE league_id=? AND id=?`).bind(
      leagueId,sessionId,anchorAt,now,leagueId,sessionId
    ).run();
  const generated = await generateMaddenDiscoveryReport({
    db,env,leagueId,sessionId,generatedByUserId,reuseExisting:true
  });
  if (generated.readiness?.ready !== true) {
    return { stitched:true,ready:false,sessionId,reportId:generated.report.id,selectedRouteCount:selected.length };
  }
  const advanced = await db.prepare(`UPDATE companion_league_export_endpoints SET
    latest_session_id=?,latest_session_token_version=token_version,latest_report_id=?,latest_ready_report_id=?,
    last_analyzed_at=?,analysis_requested_at=NULL,updated_at=?
    WHERE league_id=? AND latest_session_id=?`).bind(
      sessionId,generated.report.id,generated.report.id,generated.report.generatedAt,
      generated.report.generatedAt,leagueId,anchor.id
    ).run();
  if (Number(advanced?.meta?.changes || 0)) {
    await db.prepare(`INSERT INTO tenant_audit_events
      (id,league_id,request_id,action_id,action,resource_type,resource_id,outcome,detail_json)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(
        `tenant_audit_${crypto.randomUUID()}`,leagueId,`request_${crypto.randomUUID()}`,
        `action_${crypto.randomUUID()}`,'companion.export_cohort.auto_stitch',
        'madden_discovery_session',sessionId,'success',JSON.stringify({
          sourceSessionIds:rows.map(row=>row.id),selectedRouteCount:selected.length,
          activeSnapshotChanged:false,activationPerformed:false,
          freeAgentStatus:generated.readiness.freeAgentStatus,
          freeAgentCount:generated.readiness.freeAgentCount,
          freeAgentInterpretedAsZero:false
        })
      ).run();
  }
  return {
    stitched:true,ready:Boolean(Number(advanced?.meta?.changes || 0)),sessionId,
    reportId:generated.report.id,selectedRouteCount:selected.length
  };
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
