import {
  database,
  json,
  normalizeLeagueSlug,
  resolveLeague,
  validLeagueSlug
} from '../../../../_lib/cloud-platform.js';
import { requireCommissioner, requirePlatformOwner } from '../../../../_lib/permissions.js';
import {
  deriveLeagueExportToken,
  leagueExportUrl,
  permanentExportPublicState
} from '../../../../_lib/permanent-league-export.js';
import { candidateSourceCoverage } from '../../../../_lib/candidate-import.js';
import {
  generateMaddenDiscoveryReport,
  publicMaddenDiscoveryReport,
  recoverMaddenDiscoveryCohort
} from '../../../../_lib/madden-discovery-report.js';
import { CANONICAL_APP_ORIGIN } from '../../../../_lib/origin.js';

const RELEASE = '7.3.4.5';
const AUTO_ANALYZE_IDLE_MS = 5_000;
const AUTO_ANALYZE_CLAIM_STALE_MS = 30_000;
const text = value => String(value ?? '').trim();

async function state(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return { response:json({ok:false,error:'Invalid league slug.',release:RELEASE},400) };
  const authorization = await requireCommissioner(context);
  if (!authorization.authorized) return { response:authorization.response };
  const db = database(context.env);
  const league = db ? await resolveLeague(context.env,slug) : null;
  if (!db || !league || authorization.session.membership?.leagueId !== league.id) {
    return { response:json({ok:false,error:'Not found.'},404) };
  }
  const signingSecret = text(context.env.COMPANION_EXPORT_TOKEN || context.env.SESSION_SIGNING_SECRET);
  if (!signingSecret) return { response:json({ok:false,error:'The permanent export URL signer is unavailable.',release:RELEASE},503) };
  await db.prepare(`INSERT OR IGNORE INTO companion_league_export_endpoints (league_id,created_by_user_id)
    VALUES (?,?)`).bind(league.id,authorization.session.user.id).run();
  return { db,league,slug,authorization,signingSecret,env:context.env,request:context.request };
}

async function endpointFor(db, leagueId) {
  return db.prepare(`SELECT * FROM companion_league_export_endpoints WHERE league_id=?`).bind(leagueId).first();
}

async function reportFor(db, leagueId, reportId) {
  if (!reportId) return null;
  return db.prepare(`SELECT * FROM madden_discovery_reports WHERE league_id=? AND id=? LIMIT 1`)
    .bind(leagueId,reportId).first();
}

async function sessionFor(db, leagueId, sessionId) {
  if (!sessionId) return null;
  return db.prepare(`SELECT * FROM madden_discovery_sessions WHERE league_id=? AND id=? LIMIT 1`)
    .bind(leagueId,sessionId).first();
}

async function candidateFor(db, leagueId, discoverySessionId) {
  if (!discoverySessionId) return null;
  return db.prepare(`SELECT id,status,candidate_snapshot_id,active_snapshot_id_before,
      active_snapshot_id_after,duration_ms,completed_at
    FROM companion_candidate_import_runs WHERE league_id=? AND discovery_session_id=?
    ORDER BY created_at DESC,rowid DESC LIMIT 1`).bind(leagueId,discoverySessionId).first();
}

async function maybeAnalyzeIdleExport(current, endpoint) {
  const session = await sessionFor(current.db,current.league.id,endpoint?.latest_session_id);
  const idleMs = session?.last_capture_at ? Date.now()-(Date.parse(session.last_capture_at) || Date.now()) : 0;
  if (session?.status !== 'open' || Number(session.capture_count || 0) < 1 || idleMs < AUTO_ANALYZE_IDLE_MS) return null;
  const claimAge = endpoint?.analysis_requested_at
    ? Date.now()-(Date.parse(endpoint.analysis_requested_at) || Date.now())
    : Number.POSITIVE_INFINITY;
  if (claimAge < AUTO_ANALYZE_CLAIM_STALE_MS) return null;
  try {
    return await generateMaddenDiscoveryReport({
      db:current.db,
      env:current.env,
      leagueId:current.league.id,
      sessionId:session.id,
      reuseExisting:true
    });
  } catch {
    return null;
  }
}

function countsFor(report) {
  const requirements = report?.requirements || {};
  const freeAgents = report?.freeAgentEvidence || {};
  const freeAgentStatus = String(freeAgents.status || 'missing');
  return {
    teams:Number(requirements?.teams?.recordCount || 0),
    rosteredPlayers:Number(requirements?.players?.recordCount || 0),
    standings:Number(requirements?.standings?.recordCount || 0),
    schedule:Number(requirements?.schedule?.recordCount || 0),
    statistics:Number(requirements?.statistics?.recordCount || 0),
    freeAgentStatus,
    freeAgentCount:['located','empty-confirmed'].includes(freeAgentStatus)
      ? Number(freeAgents.recordCount || 0) : null
  };
}

async function publicState(current) {
  let endpoint = await endpointFor(current.db,current.league.id);
  await maybeAnalyzeIdleExport(current,endpoint);
  endpoint = await endpointFor(current.db,current.league.id);
  const [latestSession,latestReportRow,readyReportRow,activeSnapshot] = await Promise.all([
    sessionFor(current.db,current.league.id,endpoint?.latest_session_id),
    reportFor(current.db,current.league.id,endpoint?.latest_report_id),
    reportFor(current.db,current.league.id,endpoint?.latest_ready_report_id),
    current.db.prepare(`SELECT snapshot.week_index FROM league_active_snapshots active
      JOIN league_snapshots snapshot ON snapshot.id=active.snapshot_id AND snapshot.league_id=active.league_id
      WHERE active.league_id=? LIMIT 1`).bind(current.league.id).first()
  ]);
  const latestReport = publicMaddenDiscoveryReport(latestReportRow);
  const readyReport = publicMaddenDiscoveryReport(readyReportRow);
  const candidate = await candidateFor(current.db,current.league.id,readyReport?.discoverySessionId);
  const summary = permanentExportPublicState({
    endpoint,
    latestSession,
    latestReport:latestReportRow,
    readyReport:readyReportRow,
    candidateRun:candidate
  });
  const token = await deriveLeagueExportToken(current.signingSecret,current.league.id,endpoint.token_version);
  const markers = latestReport?.sourceMarkers || readyReport?.sourceMarkers || {};
  const sourceCoverage = candidateSourceCoverage(readyReport || latestReport || {},activeSnapshot?.week_index);
  const origin = text(current.env.APP_ENV).toLowerCase() === 'production'
    ? CANONICAL_APP_ORIGIN
    : new URL(current.request.url).origin;
  return {
    ok:true,
    release:RELEASE,
    leagueSlug:current.slug,
    endpoint:{
      status:endpoint.status,
      exportUrl:leagueExportUrl(origin,current.slug,token),
      tokenVersion:Number(endpoint.token_version || 1),
      createdAt:endpoint.created_at,
      rotatedAt:endpoint.rotated_at,
      lastReceivedAt:endpoint.last_received_at,
      lastAnalyzedAt:endpoint.last_analyzed_at,
      revocable:true,
      reusable:true
    },
    latestExport:{
      ...summary,
      sessionId:latestSession?.id || null,
      receivedAt:latestSession?.last_capture_at || endpoint.last_received_at || null,
      analyzedAt:latestReport?.generatedAt || null,
      capturedWeek:markers?.week?.observed?.[0] ?? markers?.week?.expected ?? null,
      activeSnapshotWeek:activeSnapshot?.week_index ?? null,
      sourceCoverage,
      importMode:sourceCoverage.importMode,
      reportStatus:latestReport?.status || null,
      counts:countsFor(latestReport || readyReport),
      candidateSnapshotId:candidate?.candidate_snapshot_id || null,
      durationMs:candidate?.duration_ms === null || candidate?.duration_ms === undefined ? null : Number(candidate.duration_ms),
      warnings:summary.status === 'review-required'
        ? ['The newest export is incomplete or failed source validation. The previous ready export remains selected.']
        : []
    },
    selectedReportId:readyReport?.id || null,
    activeSnapshotChanged:Boolean(summary.importLive),
    activationPerformed:Boolean(summary.importLive)
  };
}

async function audit(current, action, detail) {
  await current.db.prepare(`INSERT INTO tenant_audit_events
    (id,league_id,actor_user_id,request_id,action_id,action,resource_type,resource_id,outcome,detail_json)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
      `tenant_audit_${crypto.randomUUID()}`,current.league.id,current.authorization.session.user.id,
      `request_${crypto.randomUUID()}`,`action_${crypto.randomUUID()}`,action,
      'companion_league_export_endpoint',current.league.id,'success',JSON.stringify(detail || {})
    ).run();
}

export async function onRequestGet(context) {
  const current = await state(context);
  if (current.response) return current.response;
  return json(await publicState(current));
}

export async function onRequestPost(context) {
  const current = await state(context);
  if (current.response) return current.response;
  let body = {};
  try { body=await context.request.json(); } catch {}
  const action = text(body.action).toLowerCase();
  if (action === 'recover-cohort') {
    const owner = await requirePlatformOwner(context);
    if (!owner.authorized) return owner.response;
    const firstReceivedAt = text(body.firstReceivedAt);
    const lastReceivedAt = text(body.lastReceivedAt);
    const expectedCaptureCount = Number(body.expectedCaptureCount || 0);
    const expectedConfirmation = `RECOVER ${current.slug} ${firstReceivedAt} ${lastReceivedAt} ${expectedCaptureCount}`;
    if (text(body.confirmation) !== expectedConfirmation || expectedCaptureCount !== 43) {
      return json({ok:false,error:'Exact cohort recovery confirmation is required.',release:RELEASE},409);
    }
    const before = await current.db.prepare(`SELECT snapshot_id FROM league_active_snapshots
      WHERE league_id=? LIMIT 1`).bind(current.league.id).first();
    try {
      const recovery = await recoverMaddenDiscoveryCohort({
        db:current.db,
        env:current.env,
        leagueId:current.league.id,
        leagueName:current.league.name,
        firstReceivedAt,
        lastReceivedAt,
        expectedCaptureCount,
        generatedByUserId:owner.session.user.id
      });
      const after = await current.db.prepare(`SELECT snapshot_id FROM league_active_snapshots
        WHERE league_id=? LIMIT 1`).bind(current.league.id).first();
      if ((before?.snapshot_id || null) !== (after?.snapshot_id || null)) {
        return json({ok:false,error:'Recovery stopped because the active snapshot changed.',release:RELEASE},409);
      }
      await audit(current,'companion.export_cohort.recover',{
        firstReceivedAt,lastReceivedAt,expectedCaptureCount,
        recoverySessionId:recovery.sessionId,recoveryReportId:recovery.reportId,
        activeSnapshotId:after?.snapshot_id || null,
        activeSnapshotChanged:false,activationPerformed:false,
        freeAgentStatus:recovery.readiness.freeAgentStatus,
        freeAgentCount:recovery.readiness.freeAgentCount,
        freeAgentInterpretedAsZero:false
      });
      return json({
        ...(await publicState(current)),
        recovered:true,
        recovery,
        activeSnapshotId:after?.snapshot_id || null,
        activeSnapshotChanged:false,
        activationPerformed:false
      });
    } catch (error) {
      return json({ok:false,error:error?.message || 'The capture cohort could not be recovered.',release:RELEASE},error?.status || 500);
    }
  }
  if (action !== 'rotate') return json({ok:false,error:`Unsupported action: ${action || 'none'}.`,release:RELEASE},400);
  const before = await endpointFor(current.db,current.league.id);
  await current.db.prepare(`UPDATE companion_league_export_endpoints SET
    token_version=token_version+1,status='active',rotated_by_user_id=?,rotated_at=CURRENT_TIMESTAMP,
    revoked_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE league_id=?`).bind(
      current.authorization.session.user.id,current.league.id
    ).run();
  await audit(current,'companion.export_url.rotate',{
    previousTokenVersion:Number(before?.token_version || 1),
    newTokenVersion:Number(before?.token_version || 1)+1,
    latestReadyReportPreserved:true,
    activeSnapshotChanged:false
  });
  return json({...(await publicState(current)),rotated:true});
}
