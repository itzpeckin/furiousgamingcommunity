import {
  database,
  json,
  normalizeLeagueSlug,
  resolveLeague,
  sha256Hex,
  validLeagueSlug
} from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';
import {
  CANDIDATE_IMPORT_PHASES,
  candidateCoverageWarnings,
  candidateCompleteness,
  candidateRetryGuidance,
  candidateSourceCoverage,
  nextCandidatePhase,
  parseCandidateJson,
  publicCandidateRun
} from '../../../../_lib/candidate-import.js';
import { normalizeGameRelease } from '../../../../_lib/game-year-transition.js';

const RELEASE = '7.3.4.2';
const text = value => String(value ?? '').trim();

async function state(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return { response:json({ ok:false, error:'Invalid league slug.', release:RELEASE }, 400) };
  const authorization = await requireCommissioner(context);
  if (!authorization.authorized) return { response:authorization.response };
  const db = database(context.env);
  const league = db ? await resolveLeague(context.env, slug) : null;
  if (!db || !league || authorization.session.membership?.leagueId !== league.id) {
    return { response:json({ ok:false, error:'Not found.', release:RELEASE }, 404) };
  }
  return { db, league, slug, authorization };
}

async function identitySource(db, leagueId) {
  return db.prepare(`SELECT r.id preview_run_id,r.status preview_status,r.free_agent_status,
      r.team_count,r.rostered_player_count,r.free_agent_count,r.created_at preview_created_at,
      s.id franchise_season_id,s.display_name,s.game_release,s.source_franchise_id,
      s.source_season_id,s.season_year
    FROM identity_preview_runs r
    JOIN franchise_seasons s ON s.id=r.franchise_season_id AND s.league_id=r.league_id
    WHERE r.league_id=? ORDER BY r.created_at DESC LIMIT 1`).bind(leagueId).first();
}

async function latestReport(db, leagueId) {
  const endpoint = await db.prepare(`SELECT latest_ready_report_id
    FROM companion_league_export_endpoints WHERE league_id=? LIMIT 1`).bind(leagueId).first();
  if (endpoint && !endpoint.latest_ready_report_id) return null;
  const selected = endpoint ? await db.prepare(`SELECT report.id,report.session_id,report.status,report.route_count,
      report.capture_count,report.total_bytes,report.report_hash,report.source_markers_json,
      report.dataset_inventory_json,report.requirement_results_json,report.free_agent_evidence_json,report.generated_at
    FROM madden_discovery_reports report
    WHERE report.league_id=? AND report.id=? LIMIT 1`).bind(leagueId,endpoint.latest_ready_report_id).first() : null;
  if (selected) return selected;
  if (endpoint) return null;
  return db.prepare(`SELECT id,session_id,status,route_count,capture_count,total_bytes,report_hash,
      source_markers_json,dataset_inventory_json,requirement_results_json,free_agent_evidence_json,generated_at
    FROM madden_discovery_reports WHERE league_id=? ORDER BY generated_at DESC,rowid DESC LIMIT 1`)
    .bind(leagueId).first();
}

async function reportForSession(db, leagueId, sessionId) {
  return db.prepare(`SELECT id,session_id,status,route_count,capture_count,total_bytes,report_hash,
      source_markers_json,dataset_inventory_json,requirement_results_json,free_agent_evidence_json,generated_at
    FROM madden_discovery_reports WHERE league_id=? AND session_id=? LIMIT 1`)
    .bind(leagueId,sessionId).first();
}

async function destinationFor(db, leagueId, franchiseSeasonId) {
  if (!franchiseSeasonId) return null;
  return db.prepare(`SELECT destination.*,game_year.status game_year_status,game_year.game_release
    FROM companion_import_destinations destination
    LEFT JOIN league_game_years game_year ON game_year.id=destination.game_year_id
    WHERE destination.league_id=? AND destination.franchise_season_id=? AND destination.status='active' LIMIT 1`)
    .bind(leagueId, franchiseSeasonId).first();
}

async function latestRun(db, leagueId) {
  return db.prepare(`SELECT * FROM companion_candidate_import_runs
    WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();
}

async function runForSource(db, leagueId, destinationId, fingerprint) {
  if (!destinationId || !fingerprint) return null;
  return db.prepare(`SELECT * FROM companion_candidate_import_runs
    WHERE league_id=? AND destination_id=? AND source_fingerprint=? LIMIT 1`)
    .bind(leagueId,destinationId,fingerprint).first();
}

async function activeSnapshot(db, leagueId) {
  return db.prepare(`SELECT active.snapshot_id,snapshot.week_index,snapshot.created_at
    FROM league_active_snapshots active
    JOIN league_snapshots snapshot ON snapshot.id=active.snapshot_id AND snapshot.league_id=active.league_id
    WHERE active.league_id=?`)
    .bind(leagueId).first();
}

async function activeSnapshotId(db, leagueId) {
  return (await activeSnapshot(db,leagueId))?.snapshot_id || null;
}

async function captureDigest(db, leagueId, sessionId) {
  const linked = await db.prepare(`SELECT c.route_path,c.payload_hash,c.byte_length
    FROM madden_discovery_session_captures link
    JOIN companion_route_captures c ON c.id=link.capture_id AND c.league_id=link.league_id
    WHERE link.league_id=? AND link.session_id=?
    ORDER BY c.route_path,c.payload_hash,c.id`).bind(leagueId,sessionId).all();
  let rows = linked.results || [];
  if (!rows.length) {
    const legacy = await db.prepare(`SELECT route_path,payload_hash,byte_length
      FROM companion_route_captures WHERE league_id=? AND discovery_session_id=?
      ORDER BY route_path,payload_hash,id`).bind(leagueId,sessionId).all();
    rows = legacy.results || [];
  }
  return sha256Hex(new TextEncoder().encode(rows.map(row =>
    `${row.route_path}:${row.payload_hash}:${Number(row.byte_length||0)}`
  ).join('\n')));
}

function publicDestination(row) {
  if (!row) return null;
  return {
    id:row.id,
    franchiseSeasonId:row.franchise_season_id,
    gameYearId:row.game_year_id || null,
    gameRelease:row.game_release || null,
    label:row.label,
    status:row.status,
    createdAt:row.created_at,
    private:true
  };
}

function sourceCounts(report, identity) {
  const requirements = parseCandidateJson(report?.requirement_results_json, {});
  const freeAgents = parseCandidateJson(report?.free_agent_evidence_json, {});
  return {
    captures:Number(report?.capture_count || 0),
    routes:Number(report?.route_count || 0),
    bytes:Number(report?.total_bytes || 0),
    teams:Number(requirements?.teams?.recordCount || identity?.team_count || 0),
    rosteredPlayers:Number(requirements?.players?.recordCount || identity?.rostered_player_count || 0),
    standings:Number(requirements?.standings?.recordCount || 0),
    schedule:Number(requirements?.schedule?.recordCount || 0),
    statistics:Number(requirements?.statistics?.recordCount || 0),
    freeAgentStatus:String(freeAgents?.status || identity?.free_agent_status || 'missing'),
    freeAgentCount:['located','empty-confirmed'].includes(String(freeAgents?.status || ''))
      ? Number(freeAgents?.recordCount || 0) : null
  };
}

async function sourceFingerprint(db, leagueId, report, identity, destination) {
  if (!report || !identity || !destination) return null;
  const digest = await captureDigest(db,leagueId,report.session_id);
  return sha256Hex(new TextEncoder().encode(
    `${report.report_hash}:${digest}:${identity.preview_run_id}:${destination.id}`
  ));
}

async function publicState(current, options = {}) {
  const identity = await identitySource(current.db, current.league.id);
  const report = options.discoverySessionId
    ? await reportForSession(current.db,current.league.id,options.discoverySessionId)
    : await latestReport(current.db, current.league.id);
  const destination = await destinationFor(current.db, current.league.id, identity?.franchise_season_id);
  const active = await activeSnapshot(current.db,current.league.id);
  const fingerprint = await sourceFingerprint(current.db,current.league.id,report,identity,destination);
  const run = await runForSource(current.db,current.league.id,destination?.id,fingerprint);
  const previousRun = run || await latestRun(current.db,current.league.id);
  const coverage = candidateSourceCoverage({
    sourceMarkers:parseCandidateJson(report?.source_markers_json,{}),
    datasetInventory:parseCandidateJson(report?.dataset_inventory_json,[])
  },active?.week_index);
  return {
    ok:true,
    release:RELEASE,
    commissionerOperated:true,
    destination:publicDestination(destination),
    source:report ? {
      reportId:report.id,
      discoverySessionId:report.session_id,
      reportStatus:report.status,
      reportHash:report.report_hash,
      sourceFingerprint:fingerprint,
      generatedAt:report.generated_at,
      selectionStatus:run ? 'existing-source' : 'new-source',
      coverage,
      coverageWarnings:candidateCoverageWarnings(coverage),
      counts:sourceCounts(report, identity),
      season:identity ? {
        id:identity.franchise_season_id,
        displayName:identity.display_name,
        gameRelease:identity.game_release,
        sourceFranchiseId:identity.source_franchise_id,
        sourceSeasonId:identity.source_season_id,
        seasonYear:identity.season_year === null ? null : Number(identity.season_year)
      } : null
    } : null,
    run:publicCandidateRun(run),
    previousRun:run ? null : publicCandidateRun(previousRun),
    activeSnapshotId:active?.snapshot_id || null,
    activeSnapshotWeek:active?.week_index === null || active?.week_index === undefined ? null : Number(active.week_index),
    phases:CANDIDATE_IMPORT_PHASES,
    private:true,
    activationPerformed:false,
    activeSnapshotChanged:false
  };
}

async function audit(current, action, resourceType, resourceId, detail = {}) {
  const id = `tenant_audit_${crypto.randomUUID()}`;
  await current.db.prepare(`INSERT INTO tenant_audit_events
    (id,league_id,actor_user_id,request_id,action_id,action,resource_type,resource_id,outcome,detail_json)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
      id,current.league.id,current.authorization.session.user.id,`request_${crypto.randomUUID()}`,
      `action_${crypto.randomUUID()}`,action,resourceType,resourceId,'success',JSON.stringify(detail)
    ).run();
}

async function createDestination(current, identity) {
  if (!identity) return { response:json({
    ok:false,error:'Generate the reviewed private identity preview before creating an import destination.',release:RELEASE
  }, 409) };
  let destination = await destinationFor(current.db,current.league.id,identity.franchise_season_id);
  let created = false;
  if (!destination) {
    const release = normalizeGameRelease(identity.game_release);
    if (!release.ok) return { response:json({ok:false,error:release.error,release:RELEASE},409) };
    let gameYear = await current.db.prepare(`SELECT * FROM league_game_years
      WHERE league_id=? AND game_release=?`).bind(current.league.id,release.gameRelease).first();
    if (!gameYear) {
      const gameYearId = `game_year_${crypto.randomUUID()}`;
      await current.db.batch([
        current.db.prepare(`INSERT INTO league_game_years
          (id,league_id,game_release,edition_year,display_name,status)
          VALUES (?,?,?,?,?,'preparing')`).bind(gameYearId,current.league.id,release.gameRelease,release.editionYear,release.gameRelease),
        current.db.prepare(`INSERT INTO game_year_franchise_seasons
          (game_year_id,league_id,franchise_season_id) VALUES (?,?,?)`)
          .bind(gameYearId,current.league.id,identity.franchise_season_id)
      ]);
      gameYear = await current.db.prepare(`SELECT * FROM league_game_years WHERE id=?`).bind(gameYearId).first();
    } else {
      await current.db.prepare(`INSERT OR IGNORE INTO game_year_franchise_seasons
        (game_year_id,league_id,franchise_season_id) VALUES (?,?,?)`)
        .bind(gameYear.id,current.league.id,identity.franchise_season_id).run();
    }
    if (!['preparing','active','restored'].includes(String(gameYear?.status||''))) {
      return { response:json({ok:false,error:'This Madden game year is archived. Start a new edition transition before importing into it.',release:RELEASE},409) };
    }
    const id = `import_destination_${crypto.randomUUID()}`;
    await current.db.prepare(`INSERT INTO companion_import_destinations
      (id,league_id,franchise_season_id,label,status,created_by_user_id,game_year_id)
      VALUES (?,?,?,?,?,?,?)`).bind(id,current.league.id,identity.franchise_season_id,
        `${identity.display_name} private candidate`,'active',current.authorization.session.user.id,gameYear.id).run();
    destination = await destinationFor(current.db,current.league.id,identity.franchise_season_id);
    created = true;
    await audit(current,'companion.candidate_destination.create','companion_import_destination',id,{
      franchiseSeasonId:identity.franchise_season_id,gameYearId:gameYear.id,activationPerformed:false
    });
  }
  return { destination, created };
}

async function startRun(current, destination, report, identity, retry) {
  if (!destination || !report || !identity) return { response:json({
    ok:false,error:'A reviewed identity destination and analyzed capture are required.',release:RELEASE
  }, 409) };
  const digest = await captureDigest(current.db,current.league.id,report.session_id);
  const fingerprint = await sha256Hex(new TextEncoder().encode(
    `${report.report_hash}:${digest}:${identity.preview_run_id}:${destination.id}`
  ));
  let run = await current.db.prepare(`SELECT * FROM companion_candidate_import_runs
    WHERE league_id=? AND destination_id=? AND source_fingerprint=? LIMIT 1`)
    .bind(current.league.id,destination.id,fingerprint).first();
  if (run?.status === 'preview-ready' || (run?.status === 'running' && !retry)) {
    return { run, reused:true, warm:run.status === 'preview-ready' };
  }
  const active = await activeSnapshot(current.db,current.league.id);
  const activeBefore = active?.snapshot_id || null;
  const coverage = candidateSourceCoverage({
    sourceMarkers:parseCandidateJson(report.source_markers_json,{}),
    datasetInventory:parseCandidateJson(report.dataset_inventory_json,[])
  },active?.week_index);
  if (coverage.continuityStatus === 'stale') return { response:json({
    ok:false,
    error:`The analyzed Week ${coverage.currentWeek} capture is older than active Week ${coverage.activeWeek}. Analyze a current export before building a replacement candidate.`,
    release:RELEASE,
    sourceCoverage:coverage,
    activeSnapshotChanged:false
  },409) };
  const coverageWarnings = candidateCoverageWarnings(coverage);
  const counts = { ...sourceCounts(report,identity), sourceWeek:coverage.currentWeek, sourceCoverage:coverage };
  if (run) {
    if (!retry) return { run, reused:true, warm:false };
    await current.db.prepare(`UPDATE companion_candidate_import_runs SET
      status='running',completeness_status='review-required',current_phase='analyze-source',phase_index=0,
      phase_state_json='{}',source_counts_json=?,result_counts_json='{}',warnings_json=?,retry_json='{}',
      team_mapping_run_id=NULL,player_mapping_run_id=NULL,schedule_mapping_run_id=NULL,
      statistics_mapping_run_id=NULL,candidate_snapshot_id=NULL,active_snapshot_id_before=?,
      active_snapshot_id_after=NULL,started_at=CURRENT_TIMESTAMP,completed_at=NULL,duration_ms=NULL,
      updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify(counts),JSON.stringify(coverageWarnings),activeBefore,run.id).run();
  } else {
    const id = `candidate_import_${crypto.randomUUID()}`;
    await current.db.prepare(`INSERT INTO companion_candidate_import_runs
      (id,league_id,destination_id,discovery_session_id,source_fingerprint,status,
       completeness_status,current_phase,phase_index,phase_state_json,source_counts_json,
       result_counts_json,warnings_json,retry_json,active_snapshot_id_before,created_by_user_id,started_at)
      VALUES (?,?,?,?,?,'running','review-required','analyze-source',0,'{}',?,'{}',?,'{}',?,?,CURRENT_TIMESTAMP)`)
      .bind(id,current.league.id,destination.id,report.session_id,fingerprint,JSON.stringify(counts),JSON.stringify(coverageWarnings),
        activeBefore,current.authorization.session.user.id).run();
    run = await current.db.prepare(`SELECT * FROM companion_candidate_import_runs WHERE id=?`).bind(id).first();
    await audit(current,'companion.candidate_import.start','companion_candidate_import',id,{
      discoverySessionId:report.session_id,sourceFingerprint:fingerprint,sourceCoverage:coverage,
      activationPerformed:false
    });
  }
  run = await current.db.prepare(`SELECT * FROM companion_candidate_import_runs WHERE id=?`).bind(run.id).first();
  return { run, reused:false, warm:false };
}

async function reportPhase(current, body) {
  const runId = text(body.runId);
  const phase = text(body.phase);
  const run = runId ? await current.db.prepare(`SELECT * FROM companion_candidate_import_runs
    WHERE id=? AND league_id=?`).bind(runId,current.league.id).first() : null;
  if (!run) return { response:json({ ok:false,error:'Candidate import run not found.',release:RELEASE }, 404) };
  if (run.status !== 'running') return { response:json({ ok:false,error:'Candidate import is not running.',run:publicCandidateRun(run),release:RELEASE }, 409) };
  if (phase !== run.current_phase) return { response:json({
    ok:false,error:`Expected phase ${run.current_phase}; received ${phase || 'none'}.`,run:publicCandidateRun(run),release:RELEASE
  }, 409) };
  const phaseState = parseCandidateJson(run.phase_state_json, {});
  const warnings = [
    ...parseCandidateJson(run.warnings_json, []),
    ...(Array.isArray(body.warnings) ? body.warnings.map(String) : [])
  ];
  const resultCounts = {
    ...parseCandidateJson(run.result_counts_json, {}),
    ...(body.counts && typeof body.counts === 'object' ? body.counts : {})
  };
  const durationMs = Math.max(0,Number(body.durationMs || 0));
  const ok = body.ok !== false;
  phaseState[phase] = {
    status:ok ? 'complete' : 'failed',
    summary:text(body.summary) || (ok ? 'Complete' : 'Failed'),
    durationMs,
    counts:body.counts && typeof body.counts === 'object' ? body.counts : {},
    warnings:Array.isArray(body.warnings) ? body.warnings.map(String) : [],
    completedAt:new Date().toISOString()
  };
  if (!ok) {
    const retry = candidateRetryGuidance(phase,text(body.error?.message || body.error || body.summary));
    await current.db.prepare(`UPDATE companion_candidate_import_runs SET
      status='failed',completeness_status='failed',phase_state_json=?,result_counts_json=?,warnings_json=?,
      retry_json=?,completed_at=CURRENT_TIMESTAMP,duration_ms=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(JSON.stringify(phaseState),JSON.stringify(resultCounts),JSON.stringify(warnings),
        JSON.stringify(retry),Number(body.totalDurationMs || 0),run.id).run();
  } else {
    const next = nextCandidatePhase(phase);
    const nextIndex = Math.max(0,CANDIDATE_IMPORT_PHASES.indexOf(next));
    await current.db.prepare(`UPDATE companion_candidate_import_runs SET
      current_phase=?,phase_index=?,phase_state_json=?,result_counts_json=?,warnings_json=?,retry_json='{}',
      team_mapping_run_id=COALESCE(?,team_mapping_run_id),
      player_mapping_run_id=COALESCE(?,player_mapping_run_id),
      schedule_mapping_run_id=COALESCE(?,schedule_mapping_run_id),
      statistics_mapping_run_id=COALESCE(?,statistics_mapping_run_id),
      candidate_snapshot_id=COALESCE(?,candidate_snapshot_id),updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(next || phase,nextIndex,JSON.stringify(phaseState),JSON.stringify(resultCounts),JSON.stringify(warnings),
        text(body.teamMappingRunId)||null,text(body.playerMappingRunId)||null,
        text(body.scheduleMappingRunId)||null,text(body.statisticsMappingRunId)||null,
        text(body.candidateSnapshotId)||null,run.id).run();
  }
  return { run:await current.db.prepare(`SELECT * FROM companion_candidate_import_runs WHERE id=?`).bind(run.id).first() };
}

async function finalize(current, body) {
  const runId = text(body.runId);
  const run = runId ? await current.db.prepare(`SELECT * FROM companion_candidate_import_runs
    WHERE id=? AND league_id=?`).bind(runId,current.league.id).first() : null;
  if (!run) return { response:json({ ok:false,error:'Candidate import run not found.',release:RELEASE }, 404) };
  const report = await reportForSession(current.db,current.league.id,run.discovery_session_id);
  if (!report) return { response:json({ ok:false,error:'The exact analyzed source report for this candidate is missing.',release:RELEASE }, 409) };
  if (run.current_phase !== 'preview-ready' || !run.candidate_snapshot_id) return { response:json({
    ok:false,error:'Complete and validate every candidate phase before finalizing.',run:publicCandidateRun(run),release:RELEASE
  }, 409) };
  const snapshot = await current.db.prepare(`SELECT * FROM league_snapshots WHERE id=? AND league_id=?`)
    .bind(run.candidate_snapshot_id,current.league.id).first();
  if (!snapshot || snapshot.validation_status !== 'ready' || Number(snapshot.validation_error_count || 0) !== 0) {
    return { response:json({ ok:false,error:'Candidate snapshot validation is not ready.',release:RELEASE }, 422) };
  }
  const activeAfter = await activeSnapshotId(current.db,current.league.id);
  if ((activeAfter || null) !== (run.active_snapshot_id_before || null) || activeAfter === snapshot.id) {
    return { response:json({ ok:false,error:'The active snapshot changed during candidate import; finalization refused.',release:RELEASE }, 409) };
  }
  const freeAgentEvidence = parseCandidateJson(report?.free_agent_evidence_json, {});
  const completeness = candidateCompleteness(freeAgentEvidence.status);
  const warnings = parseCandidateJson(run.warnings_json, []);
  if (freeAgentEvidence.status === 'blocked') warnings.push(
    'Madden Free Agents are blocked upstream. Candidate is rostered-player-only; the Free Agent count remains unknown.'
  );
  const counts = {
    ...parseCandidateJson(run.result_counts_json, {}),
    teams:Number(snapshot.team_count || 0),
    players:Number(snapshot.player_count || 0),
    games:Number(snapshot.game_count || 0),
    statistics:Number(snapshot.statistic_count || 0),
    standings:Number(snapshot.standing_count || 0),
    freeAgentStatus:String(freeAgentEvidence.status || 'missing'),
    freeAgentCount:['located','empty-confirmed'].includes(String(freeAgentEvidence.status || ''))
      ? Number(freeAgentEvidence.recordCount || 0) : null
  };
  const durationMs = Math.max(0,Number(body.durationMs || 0));
  await current.db.prepare(`UPDATE companion_candidate_import_runs SET
    status='preview-ready',completeness_status=?,result_counts_json=?,warnings_json=?,retry_json='{}',
    active_snapshot_id_after=?,duration_ms=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(completeness,JSON.stringify(counts),JSON.stringify([...new Set(warnings)]),activeAfter,durationMs,run.id).run();
  await audit(current,'companion.candidate_import.preview_ready','companion_candidate_import',run.id,{
    candidateSnapshotId:snapshot.id,completeness,durationMs,activationPerformed:false,activeSnapshotChanged:false
  });
  return { run:await current.db.prepare(`SELECT * FROM companion_candidate_import_runs WHERE id=?`).bind(run.id).first() };
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
  try { body = await context.request.json(); } catch {}
  const action = text(body.action).toLowerCase();
  const identity = await identitySource(current.db,current.league.id);
  const report = await latestReport(current.db,current.league.id);
  const destinationResult = action === 'create-destination'
    ? await createDestination(current,identity) : null;
  if (destinationResult?.response) return destinationResult.response;
  if (action === 'create-destination') return json({
    ...(await publicState(current)),created:destinationResult.created
  });
  const destination = await destinationFor(current.db,current.league.id,identity?.franchise_season_id);
  if (action === 'start') {
    const result = await startRun(current,destination,report,identity,body.retry === true);
    if (result.response) return result.response;
    return json({
      ...(await publicState(current,{discoverySessionId:result.run.discovery_session_id})),run:publicCandidateRun(result.run),reused:result.reused,warm:result.warm
    });
  }
  if (action === 'report-phase') {
    const result = await reportPhase(current,body);
    if (result.response) return result.response;
    return json({ ...(await publicState(current,{discoverySessionId:result.run.discovery_session_id})),run:publicCandidateRun(result.run) });
  }
  if (action === 'finalize') {
    const result = await finalize(current,body);
    if (result.response) return result.response;
    return json({ ...(await publicState(current,{discoverySessionId:result.run.discovery_session_id})),run:publicCandidateRun(result.run) });
  }
  return json({ ok:false,error:`Unsupported action: ${action || 'none'}.`,release:RELEASE }, 400);
}
