import { sha256Hex, summarizePayloadShape } from './cloud-platform.js';
import { buildMaddenDiscoveryReport } from './madden-discovery.js';
import { canonicalMaddenStage } from './madden-period.js';
import { reportImportReadiness, rosterCarryForwardEligibility } from './permanent-league-export.js';
import { parseYearlyScheduleCapture, selectYearlyScheduleGames, yearlyScheduleCoverage } from './yearly-schedule.js';

const STATS = Object.freeze(['passing','rushing','receiving','defense','kicking','punting','team']);
const ACTIVE_COLLECTION_SQL = `SELECT 1 FROM ea_direct_collection_jobs job
  JOIN ea_direct_connections connection ON connection.id=job.connection_id AND connection.league_id=job.league_id
  JOIN sessions session ON session.id=job.session_id AND session.user_id=job.actor_id
  JOIN league_memberships member ON member.league_id=job.league_id AND member.user_id=job.actor_id
  WHERE job.id=? AND job.league_id=? AND job.connection_id=? AND job.mode=? AND job.status='running'
    AND julianday(job.expires_at)>julianday('now') AND connection.status='connected' AND connection.credential_cipher IS NOT NULL
    AND connection.external_league_id=? AND connection.platform=?
    AND session.revoked_at IS NULL AND julianday(session.expires_at)>julianday('now')
    AND (session.absolute_expires_at IS NULL OR julianday(session.absolute_expires_at)>julianday('now'))
    AND member.active=1 AND member.role='commissioner'`;
const text = value => String(value ?? '').trim();
const integer = value => value !== null && value !== undefined && text(value) !== '' && Number.isInteger(Number(value)) ? Number(value) : null;
const fail = message => { throw Object.assign(new Error(message), {status:409}); };
const safeId = value => /^[a-zA-Z0-9._:-]{1,120}$/.test(text(value)) ? text(value) : fail('The EA collection identity is invalid.');
const manifestKey = (leagueId, collectionId) => `ea-direct/by-tenant/${safeId(leagueId)}/collections/${safeId(collectionId)}/manifest.json`;
const period = (stageIndex, weekIndex) => {
  const stage = canonicalMaddenStage(stageIndex), index = integer(weekIndex);
  if (!stage || index === null || index < 0 || index > 39) fail('EA did not provide a valid export week.');
  return {stage, week:index + 1, key:`${stage}:${index + 1}`};
};

// Native seasonWeek is zero-based; weekTitle may be only "Week".
// Require a matching available export entry before using native indices.
// No schedule maximum, season offset, or guessed offseason clock is used.
export function normalizeEaHub(input = {}) {
  const hub = input.responseInfo?.value || input;
  const season = hub.careerHubInfo?.seasonInfo || hub.seasonInfo || hub;
  if (hub.success === false || hub.error || hub.careerHubInfo?.isLeagueAdvancing) fail('EA league information is unavailable or the league is advancing.');
  let selected;
  if (hub.currentPeriod) {
    const stage = canonicalMaddenStage(hub.currentPeriod.stage === 'postseason' ? 'playoffs' : hub.currentPeriod.stage);
    const week = integer(hub.currentPeriod.week);
    if (!stage || !week || week > 40) fail('EA current-period evidence is invalid.');
    selected = {stageIndex:{preseason:0,'regular-season':1,playoffs:2}[stage],weekIndex:week-1};
  } else if (integer(season.weekIndex) !== null && integer(season.stageIndex) !== null) {
    selected = season;
  } else if ([0,1].includes(integer(season.seasonWeekType)) && integer(season.seasonWeek) !== null) {
    const stageIndex=integer(season.seasonWeekType), weekIndex=integer(season.seasonWeek);
    const matches=(hub.availableWeekInfoList || []).filter(item=>integer(item.stageIndex)===stageIndex && integer(item.weekIndex)===weekIndex);
    if (!matches.length || weekIndex<0 || (stageIndex===0 ? weekIndex>3 : weekIndex>17)
      || (integer(season.displayWeek)!==null && integer(season.displayWeek)!==weekIndex+1)) {
      fail('EA current week does not agree with its available export weeks.');
    }
    selected=matches[0];
  } else {
    const title = text(season.weekTitle).toLowerCase();
    const matches = (hub.availableWeekInfoList || []).filter(item => title && text(item.weekTitle).toLowerCase() === title);
    const keys = new Set(matches.map(item => `${item.stageIndex}:${item.weekIndex}`));
    if (keys.size !== 1) fail('EA has not identified one current export week; sync is paused until the hub identifies it.');
    selected = matches[0];
  }
  const currentPeriod = period(selected.stageIndex, selected.weekIndex);
  const sourceSeasonId = text(hub.sourceSeasonId ?? season.sourceSeasonId ?? hub.seasonIndex ?? season.seasonIndex
    ?? (integer(season.seasonYear) !== null && Number(season.seasonYear) < 1900 ? season.seasonYear : ''));
  const calendarYear = integer(season.calendarYear ?? hub.calendarYear
    ?? (Number(season.seasonYear) >= 1900 ? season.seasonYear : hub.seasonYear));
  if (!sourceSeasonId && (calendarYear===null || calendarYear<1900 || calendarYear>9999)) {
    fail('EA has not provided an exact franchise season identifier.');
  }
  return {
    currentPeriod,stageIndex:Number(selected.stageIndex),weekIndex:Number(selected.weekIndex),
    sourceSeasonId,seasonIndex:integer(sourceSeasonId),seasonYear:calendarYear,
    gameRelease:text(hub.gameRelease) || 'Madden NFL 27',weekTitle:text(season.weekTitle),
    teamIdInfoList:Array.isArray(hub.teamIdInfoList) ? hub.teamIdInfoList : [],
    raw:input
  };
}

function routeFor(platform, externalLeagueId, kind, args = {}) {
  if (!['pc','ps5','ps4','xbsx','xbox','xone'].includes(text(platform).toLowerCase())) fail('Unsupported EA platform.');
  const routePlatform = text(platform).toLowerCase() === 'xone' ? 'xbox' : text(platform).toLowerCase();
  const base = `${routePlatform}/${safeId(externalLeagueId)}`;
  if (kind === 'hub') return `${base}/info`;
  if (kind === 'teams') return `${base}/leagueteams`;
  if (kind === 'standings') return `${base}/standings`;
  if (kind === 'roster') return `${base}/team/${safeId(args.teamId)}/roster`;
  if (kind === 'free-agents') return `${base}/freeagents/roster`;
  if (!['schedule','statistics'].includes(kind)) fail('Unknown EA dataset.');
  const value = period(args.stageIndex ?? args.stage, args.weekIndex);
  const category = kind === 'schedule' ? 'schedules' : text(args.category).toLowerCase();
  if (kind === 'statistics' && !STATS.includes(category)) fail('Unknown EA statistics category.');
  return `${base}/week/${{preseason:'pre','regular-season':'reg',playoffs:'post'}[value.stage]}/${value.week}/${category}`;
}

export function eaCapturePlan(hubInput, {mode = 'weekly', includeRosters = true} = {}) {
  const hub = normalizeEaHub(hubInput);
  const requests = [{kind:'hub',args:{}},{kind:'teams',args:{}},{kind:'standings',args:{}}];
  const previousIndex = hub.stageIndex === 1 && hub.weekIndex === 22 ? 20 : Math.max(0,hub.weekIndex-1);
  const indices = mode === 'yearly' ? Array.from({length:18},(_,index)=>index)
    : [...new Set([previousIndex,hub.weekIndex])];
  for (const weekIndex of indices) {
    const args = {stageIndex:mode === 'yearly' ? 1 : hub.stageIndex,weekIndex};
    requests.push({kind:'schedule',args});
    if (mode !== 'yearly') for (const category of STATS) requests.push({kind:'statistics',args:{...args,category}});
  }
  if (mode !== 'yearly' && includeRosters) {
    for (const [listIndex,team] of hub.teamIdInfoList.entries()) requests.push({kind:'roster',args:{teamId:team.teamId,listIndex}});
    requests.push({kind:'free-agents',args:{}});
  }
  return requests;
}

async function readManifest(bucket, leagueId, collectionId) {
  const object = await bucket.get(manifestKey(leagueId,collectionId));
  if (!object) fail('EA collection manifest is unavailable.');
  return JSON.parse(await object.text());
}

async function writeManifest(bucket, manifest) {
  await bucket.put(manifestKey(manifest.leagueId,manifest.collectionId),JSON.stringify(manifest),{
    httpMetadata:{contentType:'application/json'},customMetadata:{source:'ea-direct',leagueId:manifest.leagueId,collectionId:manifest.collectionId}
  });
}

async function scopedSeason(db, leagueId, hub, externalLeagueId) {
  const rows = await db.prepare(`SELECT season.id franchise_season_id,season.source_season_id,season.season_year,season.game_release,
      linked.game_year_id FROM franchise_seasons season
    JOIN game_year_franchise_seasons linked ON linked.franchise_season_id=season.id AND linked.league_id=season.league_id
    JOIN league_game_years game_year ON game_year.id=linked.game_year_id AND game_year.league_id=season.league_id
    WHERE season.league_id=? AND season.source_franchise_id=?
      AND ((?<>'' AND season.source_season_id=?) OR (?='' AND season.season_year=?))
      AND season.status IN ('active','preview') AND game_year.status IN ('active','restored','preparing')
      AND season.game_release=? LIMIT 2`)
    .bind(leagueId,text(externalLeagueId),hub.sourceSeasonId,hub.sourceSeasonId,hub.sourceSeasonId,hub.seasonYear,hub.gameRelease).all();
  const row=rows.results?.[0];
  // A calendar-only hub must identify exactly one already prepared season.
  // Never derive a source season index from a year offset or latest snapshot.
  if (rows.results?.length!==1 || !row || (hub.seasonYear !== null && row.season_year !== null && Number(row.season_year) !== hub.seasonYear)) {
    fail('The selected EA franchise, season, and Madden edition do not match this league’s prepared season.');
  }
  return row;
}

export async function beginEaCapture({db,bucket,league,actorId,hub:hubInput,platform,externalLeagueId,mode='preview',connectionId,collectionId}) {
  if (!['preview','weekly','yearly'].includes(mode)) fail('Unknown EA collection mode.');
  safeId(league?.id); safeId(collectionId); safeId(connectionId);
  const hub = normalizeEaHub(hubInput), scope = await scopedSeason(db,league.id,hub,externalLeagueId);
  routeFor(platform,externalLeagueId,'hub');
  const key = manifestKey(league.id,collectionId), existing = await bucket.get(key);
  if (existing) {
    const retained = JSON.parse(await existing.text());
    if (retained.mode !== mode || retained.connectionId !== connectionId || retained.externalLeagueId !== text(externalLeagueId)
      || retained.platform !== text(platform).toLowerCase() || retained.currentPeriod?.key !== hub.currentPeriod.key
      || retained.gameYearId !== scope.game_year_id || retained.franchiseSeasonId !== scope.franchise_season_id) fail('EA collection identity changed.');
    return {...retained,manifestKey:key};
  }
  const sessionId = `ea_${mode}_${await sha256Hex(`${league.id}:${collectionId}`)}`;
  const rawSessionId = `${sessionId}_raw`, now = new Date().toISOString();
  const exportPointer = await db.prepare(`SELECT latest_session_id,latest_report_id,last_received_at
    FROM companion_league_export_endpoints WHERE league_id=?`).bind(league.id).first();
  const manifest = {
    schemaVersion:1,source:'ea-direct',leagueId:league.id,collectionId,connectionId,mode,status:'collecting',
    sessionId,rawSessionId,platform:text(platform).toLowerCase(),externalLeagueId:text(externalLeagueId),
    gameYearId:scope.game_year_id,franchiseSeasonId:scope.franchise_season_id,gameRelease:scope.game_release,
    sourceSeasonId:scope.source_season_id,seasonYear:scope.season_year,currentPeriod:hub.currentPeriod,
    actorId,createdAt:now,completedAt:null,requests:[],exportPointer:exportPointer || {},activationPerformed:false,activeSnapshotChanged:false
  };
  for (const id of [sessionId,rawSessionId]) {
    await db.prepare(`INSERT OR IGNORE INTO madden_discovery_sessions
      (id,league_id,token_hash,status,expected_game_release,expected_platform,expected_league_name,
       expected_season,expected_week,opened_by_user_id,expires_at,created_at,updated_at)
      VALUES (?,?,?,'open',?,?,?,?,?,?,?,?,?)`).bind(id,league.id,await sha256Hex(`private:${id}:${crypto.randomUUID()}`),
        scope.game_release,manifest.platform,league.name,manifest.sourceSeasonId,String(hub.currentPeriod.week),
        actorId || null,new Date(Date.now()+86_400_000).toISOString(),now,now).run();
  }
  await writeManifest(bucket,manifest);
  return {...manifest,manifestKey:key};
}

export async function storeEaCapture({db,bucket,leagueId,sessionId,collectionId,kind,args={},payload,hub:hubInput,platform,externalLeagueId}) {
  const manifest = await readManifest(bucket,leagueId,collectionId);
  if (manifest.sessionId !== sessionId || manifest.status !== 'collecting'
    || manifest.platform !== text(platform).toLowerCase() || manifest.externalLeagueId !== text(externalLeagueId)) fail('EA collection is closed or belongs to another source.');
  const routePath = routeFor(platform,externalLeagueId,kind,args);
  const now = new Date().toISOString(), raw = JSON.stringify(payload), rawHash = await sha256Hex(raw);
  const rootKey = `ea-direct/by-tenant/${safeId(leagueId)}/collections/${safeId(collectionId)}`;
  const rawKey = `${rootKey}/raw/${await sha256Hex(routePath)}/${rawHash}.json`;
  await bucket.put(rawKey,raw,{httpMetadata:{contentType:'application/json'}});
  let canonical = payload;
  if (kind === 'hub') {
    const hub = normalizeEaHub(hubInput || payload);
    const sameSeason=hub.sourceSeasonId ? hub.sourceSeasonId===manifest.sourceSeasonId
      : hub.seasonYear!==null&&hub.seasonYear===Number(manifest.seasonYear);
    if (!sameSeason || hub.currentPeriod.key !== manifest.currentPeriod.key) fail('EA advanced during collection; start a fresh sync.');
    canonical = {success:true,source:'ea-direct',gameRelease:manifest.gameRelease,platform:manifest.platform,
      franchiseId:manifest.externalLeagueId,seasonIndex:manifest.sourceSeasonId,
      currentWeek:manifest.currentPeriod.week,currentStage:manifest.currentPeriod.stage};
  }
  const serialized = JSON.stringify(canonical), payloadHash = await sha256Hex(serialized);
  const shape = summarizePayloadShape(canonical), byteLength = new TextEncoder().encode(serialized).byteLength;
  const key = `${rootKey}/canonical/${await sha256Hex(routePath)}/${payloadHash}.json`;
  await bucket.put(key,serialized,{httpMetadata:{contentType:'application/json'}});
  const captureId = `ea_capture_${await sha256Hex(`${leagueId}:${routePath}:${payloadHash}`)}`;
  await db.prepare(`INSERT OR IGNORE INTO companion_route_captures
    (id,league_id,discovery_session_id,route_path,request_method,content_type,byte_length,payload_hash,
     r2_object_key,top_level_keys_json,collections_json,request_headers_json,received_at)
    VALUES (?,?,?,?,?,'application/json',?,?,?,?,?,?,?)`).bind(
      captureId,leagueId,manifest.rawSessionId,routePath,'POST',byteLength,payloadHash,key,
      JSON.stringify(shape.topLevelKeys),JSON.stringify(shape.collections),JSON.stringify({source:'ea-direct',collectionId,
        connectionId:manifest.connectionId,gameYearId:manifest.gameYearId,franchiseSeasonId:manifest.franchiseSeasonId,mode:manifest.mode}),now).run();
  const retained = await db.prepare(`SELECT id FROM companion_route_captures WHERE league_id=? AND route_path=? AND payload_hash=?`)
    .bind(leagueId,routePath,payloadHash).first();
  if (!retained) fail('EA data could not be retained.');
  await db.prepare(`INSERT OR IGNORE INTO madden_discovery_session_captures
    (league_id,session_id,capture_id,route_path,observed_at) VALUES (?,?,?,?,?)`)
    .bind(leagueId,manifest.rawSessionId,retained.id,routePath,now).run();
  const hasCollection = shape.collections.some(item=>Number.isInteger(item.count));
  const outcome = {kind,args,routePath,captureId:retained.id,rawKey,rawHash,
    success:canonical?.success !== false && !canonical?.error && (kind === 'hub' || hasCollection),receivedAt:now};
  manifest.requests = manifest.requests.filter(item=>item.routePath !== routePath).concat(outcome);
  await writeManifest(bucket,manifest);
  return outcome;
}

async function retainReport(db, manifest, report, readiness, actorId) {
  const id = `ea_report_${await sha256Hex(`${manifest.leagueId}:${manifest.collectionId}`)}`;
  const generatedAt = new Date().toISOString(), reportHash = await sha256Hex(JSON.stringify(report.sanitizedFixture));
  await db.prepare(`INSERT INTO madden_discovery_reports
    (id,league_id,session_id,status,route_count,capture_count,total_bytes,capture_window_ms,source_markers_json,
     source_verification_json,dataset_inventory_json,field_inventory_json,relationship_inventory_json,
     requirement_results_json,free_agent_evidence_json,sanitized_fixture_json,report_hash,generated_by_user_id,generated_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(league_id,session_id) DO NOTHING`).bind(id,manifest.leagueId,manifest.sessionId,
      readiness.ready ? 'passed' : 'review_required',report.routeCount,report.captureCount,report.totalBytes,
      report.captureWindowMs,JSON.stringify(report.sourceMarkers),JSON.stringify(report.sourceVerification),
      JSON.stringify(report.datasetInventory),JSON.stringify(report.fieldInventory),JSON.stringify(report.relationshipInventory),
      JSON.stringify(report.requirements),JSON.stringify(report.freeAgentEvidence),JSON.stringify(report.sanitizedFixture),
      reportHash,actorId || null,generatedAt,generatedAt).run();
  const retained = await db.prepare(`SELECT id,generated_at,report_hash FROM madden_discovery_reports
    WHERE league_id=? AND session_id=?`).bind(manifest.leagueId,manifest.sessionId).first();
  return {id:retained.id,generatedAt:retained.generated_at,reportHash:retained.report_hash};
}

function yearlyHandoff(manifest, captures) {
  const warnings = [], games = [];
  for (const capture of captures.filter(item=>item.routePath.endsWith('/schedules'))) {
    const result = parseYearlyScheduleCapture({...capture,seasonYear:manifest.seasonYear,observedAt:capture.receivedAt});
    games.push(...result.games); warnings.push(...result.warnings);
  }
  const selected = selectYearlyScheduleGames(games,warnings), coverage = yearlyScheduleCoverage(selected);
  const ready = coverage.complete && selected.length === 272;
  return {ready,games:selected,coverage,warnings};
}

export async function finalizeEaCapture({db,bucket,leagueId,sessionId,collectionId,mode,actorId,expectedRequests=[],publishReady=false}) {
  const manifest = await readManifest(bucket,leagueId,collectionId);
  if (manifest.sessionId !== sessionId || manifest.mode !== mode) fail('EA collection identity changed.');
  if (manifest.status === 'completed') return manifest.result;
  if (manifest.status !== 'collecting') fail('EA collection is not open.');
  const guardValues = [collectionId,leagueId,manifest.connectionId,mode,manifest.externalLeagueId,manifest.platform];
  const assertStillActive = async () => {
    if (!await db.prepare(ACTIVE_COLLECTION_SQL).bind(...guardValues).first()) fail('The EA collection or connection is no longer active. Start a new sync.');
  };
  await assertStillActive();
  const hub = {currentPeriod:manifest.currentPeriod,sourceSeasonId:manifest.sourceSeasonId,gameRelease:manifest.gameRelease,seasonYear:manifest.seasonYear};
  await scopedSeason(db,leagueId,normalizeEaHub(hub),manifest.externalLeagueId);
  const required = eaCapturePlan(hub,{mode,includeRosters:false}).map(item=>routeFor(manifest.platform,manifest.externalLeagueId,item.kind,item.args));
  const promised = expectedRequests.map(item=>routeFor(manifest.platform,manifest.externalLeagueId,item.kind,item.args));
  const outcomes = new Map(manifest.requests.map(item=>[item.routePath,item]));
  const missing = [...new Set([...required,...promised.filter(route=>!route.endsWith('/roster'))])]
    .filter(route=>outcomes.get(route)?.success !== true);
  const rosterRequests = expectedRequests.filter(item=>item.kind === 'roster');
  const rosterComplete = rosterRequests.length > 0 && rosterRequests.every(item=>outcomes.get(routeFor(manifest.platform,manifest.externalLeagueId,item.kind,item.args))?.success === true);
  const selected = manifest.requests.filter(item=>item.success && !['roster','free-agents'].includes(item.kind)
    || rosterComplete && (item.kind === 'roster' || item.kind === 'free-agents'));
  const captures = [];
  for (const item of selected) {
    const row = await db.prepare(`SELECT * FROM companion_route_captures WHERE league_id=? AND id=?`).bind(leagueId,item.captureId).first();
    const object = row?.r2_object_key ? await bucket.get(row.r2_object_key) : null;
    if (!object) fail('A retained EA payload is unavailable; publication is paused.');
    captures.push({captureId:row.id,routePath:row.route_path,byteLength:row.byte_length,payloadHash:row.payload_hash,
      receivedAt:item.receivedAt,payload:JSON.parse(await object.text())});
  }
  const report = buildMaddenDiscoveryReport(captures,{discoverySessionId:sessionId,expected:{
    gameRelease:manifest.gameRelease,platform:manifest.platform,sourceFranchiseId:manifest.externalLeagueId,
    season:manifest.sourceSeasonId,week:String(manifest.currentPeriod.week)
  }});
  report.sourceMarkers.eaCollection = {collectionId,mode,connectionId:manifest.connectionId,
    gameYearId:manifest.gameYearId,franchiseSeasonId:manifest.franchiseSeasonId,complete:missing.length === 0};
  const rosterCarryForward = await rosterCarryForwardEligibility(db,leagueId,report);
  const readiness = reportImportReadiness(report,{rosterCarryForward});
  readiness.ready = readiness.ready && missing.length === 0;
  readiness.missingRoutes = missing;
  const yearly = mode === 'yearly' ? yearlyHandoff(manifest,captures) : null;
  if (yearly) readiness.ready = yearly.ready && missing.length === 0 && report.sourceVerification.passed;
  const retained = await retainReport(db,manifest,report,readiness,actorId);
  const links = captures.map(item=>db.prepare(`INSERT OR IGNORE INTO madden_discovery_session_captures
    (league_id,session_id,capture_id,route_path,observed_at) VALUES (?,?,?,?,?)`)
    .bind(leagueId,sessionId,item.captureId,item.routePath,item.receivedAt));
  for (let offset=0;offset<links.length;offset+=75) await db.batch(links.slice(offset,offset+75));
  await db.prepare(`UPDATE madden_discovery_sessions SET status=?,capture_count=?,completed_at=?,updated_at=? WHERE league_id=? AND id=?`)
    .bind(readiness.ready?'passed':'review_required',captures.length,retained.generatedAt,retained.generatedAt,leagueId,sessionId).run();
  let readyPointerChanged = false, yearlyScheduleImportId = null;
  if (publishReady && readiness.ready && mode === 'weekly') {
    const changed = await db.prepare(`UPDATE companion_league_export_endpoints SET latest_session_id=?,latest_session_token_version=NULL,
      latest_report_id=?,latest_ready_report_id=?,last_received_at=?,last_analyzed_at=?,analysis_requested_at=NULL,updated_at=?
      WHERE league_id=? AND status='active' AND latest_session_id IS ? AND latest_report_id IS ? AND last_received_at IS ?
        AND EXISTS (${ACTIVE_COLLECTION_SQL})`)
      .bind(sessionId,retained.id,retained.id,retained.generatedAt,retained.generatedAt,retained.generatedAt,
        leagueId,manifest.exportPointer.latest_session_id || null,manifest.exportPointer.latest_report_id || null,
        manifest.exportPointer.last_received_at || null,...guardValues).run();
    readyPointerChanged = Number(changed?.meta?.changes || 0) > 0;
    if (!readyPointerChanged) {
      await assertStillActive();
      const current = await db.prepare(`SELECT latest_session_id,latest_ready_report_id
        FROM companion_league_export_endpoints WHERE league_id=?`).bind(leagueId).first();
      readyPointerChanged = current?.latest_session_id === sessionId && current?.latest_ready_report_id === retained.id;
    }
  }
  if (publishReady && readiness.ready && mode === 'yearly') {
    if (await db.prepare(`SELECT id FROM yearly_schedule_imports WHERE league_id=? AND status='collecting'`).bind(leagueId).first()) {
      fail('Finish the existing yearly schedule collection before publishing this EA schedule.');
    }
    yearlyScheduleImportId = `ea_yearly_catalog_${await sha256Hex(`${leagueId}:${collectionId}`)}`;
    const existing = await db.prepare(`SELECT id FROM yearly_schedule_imports WHERE league_id=? AND id=?`).bind(leagueId,yearlyScheduleImportId).first();
    if (!existing) {
      const serialized = JSON.stringify(yearly.games), digest = await sha256Hex(serialized);
      const changed = await db.prepare(`INSERT INTO yearly_schedule_imports
        (id,league_id,game_year_id,franchise_season_id,revision,status,captured_week_count,game_count,
         coverage_json,warnings_json,schedule_json,schedule_sha256,started_by_user_id,finished_by_user_id,finished_at)
        SELECT ?,?,?,?,COALESCE(MAX(revision),0)+1,'completed',18,272,?,?,?,?,?,?,?
        FROM yearly_schedule_imports WHERE league_id=? AND franchise_season_id=?
        HAVING EXISTS (${ACTIVE_COLLECTION_SQL})`)
        .bind(yearlyScheduleImportId,leagueId,manifest.gameYearId,manifest.franchiseSeasonId,
          JSON.stringify(yearly.coverage.weeks),JSON.stringify(yearly.warnings),serialized,digest,actorId,actorId,
          retained.generatedAt,leagueId,manifest.franchiseSeasonId,...guardValues).run();
      if (!Number(changed?.meta?.changes || 0)) { await assertStillActive(); fail('The EA yearly schedule was not published.'); }
    }
  }
  const result = {sessionId,reportId:retained.id,mode,readiness,currentPeriod:manifest.currentPeriod,
    sourceSeasonId:manifest.sourceSeasonId,gameYearId:manifest.gameYearId,franchiseSeasonId:manifest.franchiseSeasonId,
    retainedCaptureCount:manifest.requests.length,acceptedCaptureCount:captures.length,rosterComplete,readyPointerChanged,
    yearlyScheduleImportId,yearlyScheduleCoverage:yearly?.coverage || null,previewVerified:mode==='preview' && readiness.ready,
    message:mode==='weekly' && publishReady && readiness.ready && !readyPointerChanged
      ? 'Another export arrived during EA collection. The EA source is retained; start a new sync when the export finishes.' : null,
    activationPerformed:false,
    activeSnapshotChanged:false,discordScheduleSyncPerformed:false,freeAgentInterpretedAsZero:false};
  manifest.status = 'completed'; manifest.completedAt = retained.generatedAt; manifest.result = result;
  await writeManifest(bucket,manifest);
  return result;
}
