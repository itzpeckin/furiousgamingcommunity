import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';
import { requireDatabaseSchema } from '../../../../_lib/database-schema.js';

const RELEASE='5.9.10.6.3P.5f';
const DEFAULT_OWNER_ACCOUNT_ID='owner-tb';
const ownerAccountId=env=>String(env.PLATFORM_OWNER_ACCOUNT_ID||DEFAULT_OWNER_ACCOUNT_ID).trim();
const parse=(value,fallback={})=>{try{return JSON.parse(value||'')}catch{return fallback}};

async function requirePlatformOwner(context){
  const auth=await requireCommissioner(context);
  if(!auth.authorized)return auth;
  const presented=String(context.request.headers.get('x-franchisehq-platform-owner-account-id')||'').trim();
  if(!presented||presented!==ownerAccountId(context.env)){
    return{authorized:false,response:json({ok:false,error:'Not found.'},404)};
  }
  return auth;
}

async function state(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return{response:json({ok:false,error:'Invalid league slug.',release:RELEASE},400)};
  const auth=await requirePlatformOwner(context);
  if(!auth.authorized)return{response:auth.response};
  const db=database(context.env);
  const league=db?await resolveLeague(context.env,slug):null;
  if(!db||!league||auth.session.membership?.leagueId!==league.id){
    return{response:json({ok:false,error:'Not found.',release:RELEASE},404)};
  }
  await ensureSchema(db);
  return{db,league,slug};
}

async function tableExists(db,name){
  return Boolean(await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(name).first());
}

async function ensureSchema(db){
  return requireDatabaseSchema(db);
}

function check(id,label,passed,detail,severity='required'){
  return{id,label,passed:Boolean(passed),detail:String(detail||''),severity};
}

async function latestCertification(db,leagueId){
  return db.prepare(`SELECT * FROM import_performance_certifications
    WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();
}

function publicCertification(row){
  if(!row)return null;
  return{
    id:row.id,
    snapshotId:row.snapshot_id,
    previousSnapshotId:row.previous_snapshot_id||null,
    orchestratorRunId:row.orchestrator_run_id||null,
    mode:row.certification_mode,
    passed:Boolean(row.passed),
    score:Number(row.score||0),
    wallClockMs:row.wall_clock_ms==null?null:Number(row.wall_clock_ms),
    wallClockSeconds:row.wall_clock_ms==null?null:Number((Number(row.wall_clock_ms)/1000).toFixed(2)),
    report:parse(row.report_json,{}),
    createdAt:row.created_at
  };
}

async function certify(s,body){
  const snapshotId=String(body.snapshotId||'').trim();
  if(!snapshotId)return{error:'snapshotId is required.',status:400};

  const active=await s.db.prepare(`SELECT snapshot_id,previous_snapshot_id
    FROM league_active_snapshots WHERE league_id=?`).bind(s.league.id).first();
  const snapshot=await s.db.prepare(`SELECT * FROM league_snapshots
    WHERE league_id=? AND id=?`).bind(s.league.id,snapshotId).first();
  if(!snapshot)return{error:'Snapshot not found.',status:404};

  const previousSnapshotId=String(active?.previous_snapshot_id||'').trim()||null;
  const previousSnapshot=previousSnapshotId
    ? await s.db.prepare(`SELECT season_year,week_index,validation_status FROM league_snapshots WHERE league_id=? AND id=?`)
      .bind(s.league.id,previousSnapshotId).first()
    : null;
  const manifest=parse(snapshot.manifest_json,{});
  const statsRunId=String(manifest?.sources?.statisticsMappingRunId||'').trim();
  const delta=manifest?.deltaStatistics||{};

  let skippedRoutes=0,processedRoutes=0,failedRoutes=0,totalRoutes=0;
  if(statsRunId&&await tableExists(s.db,'companion_statistics_mapping_batches')){
    const rows=(await s.db.prepare(`SELECT status,COUNT(*) c
      FROM companion_statistics_mapping_batches
      WHERE league_id=? AND mapping_run_id=? GROUP BY status`)
      .bind(s.league.id,statsRunId).all()).results||[];
    for(const row of rows){
      const count=Number(row.c||0);
      totalRoutes+=count;
      if(row.status==='skipped')skippedRoutes+=count;
      if(row.status==='complete')processedRoutes+=count;
      if(row.status==='failed')failedRoutes+=count;
    }
  }

  let previousManifestRoutes=0,currentManifestRoutes=0,missingHistoricalRoutes=0;
  if(await tableExists(s.db,'canonical_statistics_snapshot_manifest')){
    currentManifestRoutes=Number((await s.db.prepare(`SELECT COUNT(*) c
      FROM canonical_statistics_snapshot_manifest WHERE league_id=? AND snapshot_id=?`)
      .bind(s.league.id,snapshotId).first())?.c||0);

    if(previousSnapshotId){
      previousManifestRoutes=Number((await s.db.prepare(`SELECT COUNT(*) c
        FROM canonical_statistics_snapshot_manifest WHERE league_id=? AND snapshot_id=?`)
        .bind(s.league.id,previousSnapshotId).first())?.c||0);

      missingHistoricalRoutes=Number((await s.db.prepare(`SELECT COUNT(*) c
        FROM canonical_statistics_snapshot_manifest p
        WHERE p.league_id=? AND p.snapshot_id=?
          AND NOT EXISTS (
            SELECT 1 FROM canonical_statistics_snapshot_manifest n
            WHERE n.league_id=p.league_id AND n.snapshot_id=? AND n.route_path=p.route_path
          )`)
        .bind(s.league.id,previousSnapshotId,snapshotId).first())?.c||0);
    }
  }

  let latestRegularStatWeek=null;
  if(await tableExists(s.db,'canonical_statistics_snapshot_manifest')){
    const latestWeek=await s.db.prepare(`SELECT MAX(week_index) max_week
      FROM canonical_statistics_snapshot_manifest
      WHERE league_id=? AND snapshot_id=? AND stage='regular-season' AND record_count>0`)
      .bind(s.league.id,snapshotId).first();
    if(latestWeek?.max_week!==null&&latestWeek?.max_week!==undefined)latestRegularStatWeek=Number(latestWeek.max_week);
  }

  const currentSeason=Number(snapshot.season_year);
  const currentWeek=Number(snapshot.week_index);
  const previousSeason=Number(previousSnapshot?.season_year);
  const previousWeek=Number(previousSnapshot?.week_index);
  const advancedLeagueState=Boolean(previousSnapshot)&&(
    (Number.isFinite(currentSeason)&&Number.isFinite(previousSeason)&&currentSeason>previousSeason) ||
    (currentSeason===previousSeason&&Number.isFinite(currentWeek)&&Number.isFinite(previousWeek)&&currentWeek>previousWeek)
  );
  const deltaStatisticRows=Number(delta?.deltaStatisticRows||0);
  const expectedLatestCompletedWeek=Number.isFinite(currentWeek)?Math.max(0,currentWeek-1):null;

  let detection=null;
  if(await tableExists(s.db,'forward_detection_jobs')){
    detection=await s.db.prepare(`SELECT * FROM forward_detection_jobs
      WHERE league_id=? AND current_snapshot_id=? ORDER BY created_at DESC LIMIT 1`)
      .bind(s.league.id,snapshotId).first();
  }

  let classificationCount=0;
  if(await tableExists(s.db,'transaction_movement_classifications')){
    classificationCount=Number((await s.db.prepare(`SELECT COUNT(*) c
      FROM transaction_movement_classifications WHERE league_id=? AND current_snapshot_id=?`)
      .bind(s.league.id,snapshotId).first())?.c||0);
  }

  const orchestrator=body.runId
    ? await s.db.prepare(`SELECT * FROM companion_import_orchestrator_runs WHERE league_id=? AND id=?`)
      .bind(s.league.id,String(body.runId)).first()
    : await s.db.prepare(`SELECT * FROM companion_import_orchestrator_runs
      WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(s.league.id).first();

  const timing=body.timing&&typeof body.timing==='object'?body.timing:{};
  const wallClockMs=Number(timing.wallClockDurationMs||0);
  const stageRows=Array.isArray(timing.stages)?timing.stages:[];
  const allStagesComplete=stageRows.length>=12&&stageRows.every(row=>row?.state==='complete');
  const playerSync=body.playerSync&&typeof body.playerSync==='object'?body.playerSync:null;
  const movements=Number(detection?.movement_count||0);

  const checks=[
    check('active-snapshot','New snapshot is LIVE',
      String(active?.snapshot_id||'')===snapshotId,
      String(active?.snapshot_id||'')===snapshotId?`Active pointer is ${snapshotId}.`:`Active pointer is ${active?.snapshot_id||'none'}.`),

    check('validation','Snapshot validation passed',
      String(snapshot.validation_status||'')==='ready'&&Number(snapshot.validation_error_count||0)===0,
      `Validation: ${snapshot.validation_status||'not-run'} · ${Number(snapshot.validation_error_count||0)} error(s).`),

    check('orchestrator','One-Click pipeline completed',
      String(orchestrator?.status||'')==='complete'||allStagesComplete,
      `${stageRows.filter(x=>x?.state==='complete').length}/${stageRows.length||12} measured stages complete.`),

    check('statistics-delta','Statistics delta mode active',
      Boolean(delta?.enabled),
      delta?.enabled?`${Number(delta.changedOrNewRoutes||0)} changed/new route(s); ${Number(delta.unchangedRoutes||0)} unchanged route(s).`:'Snapshot lacks delta-statistics metadata.'),

    check('historical-statistics','Historical statistics retained',
      !previousSnapshotId||previousManifestRoutes===0||missingHistoricalRoutes===0,
      previousSnapshotId
        ? `${previousManifestRoutes} prior manifest route(s); ${missingHistoricalRoutes} missing from new snapshot.`
        : 'No previous snapshot exists; baseline import.'),

    check('unchanged-skipped','Unchanged statistics routes skipped',
      skippedRoutes>0,
      `${skippedRoutes} skipped of ${totalRoutes} statistics route(s).`,
      'warning'),

    check('new-week-processed','New/changed statistics routes processed',
      !advancedLeagueState||processedRoutes>0,
      `${processedRoutes} new/changed statistics route(s) processed${advancedLeagueState?' for an advanced league state':''}.`,
      'required'),

    check('new-week-records','New/changed statistics produced records',
      !advancedLeagueState||deltaStatisticRows>0,
      `${deltaStatisticRows} new/changed statistic row(s) committed${advancedLeagueState?' for the advanced week':''}.`,
      'required'),

    check('statistics-freshness','Statistics are current with the league week',
      !advancedLeagueState||expectedLatestCompletedWeek===null||(
        latestRegularStatWeek!==null&&latestRegularStatWeek>=expectedLatestCompletedWeek
      ),
      expectedLatestCompletedWeek===null
        ? 'League week unavailable for freshness check.'
        : `Latest committed regular-season stats week index ${latestRegularStatWeek??'none'}; expected at least ${expectedLatestCompletedWeek}.`,
      'required'),

    check('statistics-errors','No statistics mapping failures',
      failedRoutes===0,
      `${failedRoutes} failed statistics route(s).`),

    check('forward-detection','Forward roster detection completed',
      Boolean(detection)&&['complete','baseline'].includes(String(detection.status||'')),
      detection?`${movements} movement(s) · status ${detection.status}.`:'No Forward Detection job found.'),

    check('classification','Movement classification reconciles with detection',
      Boolean(detection)&&classificationCount===movements,
      `${classificationCount} classification(s) for ${movements} detected movement(s).`),

    check('player-service','Player service synchronized to LIVE snapshot',
      playerSync?Boolean(playerSync.synchronized):true,
      playerSync
        ? `${Number(playerSync.playerServiceCount||0)} service players / ${Number(playerSync.livePlayerCount||0)} live players; missing ${Number(playerSync.missingFromService||0)}, stale ${Number(playerSync.staleInService||0)}.`
        : 'Client synchronization result was not supplied.',
      playerSync?'required':'warning'),

    check('performance','Weekly import runtime within production target',
      wallClockMs>0&&wallClockMs<=75000,
      wallClockMs?`${(wallClockMs/1000).toFixed(2)} seconds wall clock (target ≤ 75s).`:'No client timing supplied.'),

    check('performance-stretch','Weekly import runtime within stretch target',
      wallClockMs>0&&wallClockMs<=55000,
      wallClockMs?`${(wallClockMs/1000).toFixed(2)} seconds wall clock (stretch ≤ 55s).`:'No client timing supplied.',
      'warning')
  ];

  const required=checks.filter(c=>c.severity==='required');
  const requiredPassed=required.filter(c=>c.passed).length;
  const passed=required.every(c=>c.passed);
  const score=required.length?Math.round((requiredPassed/required.length)*100):0;

  const report={
    release:RELEASE,
    mode:'weekly-delta',
    generatedAt:new Date().toISOString(),
    snapshotId,
    previousSnapshotId,
    season:snapshot.season_year==null?null:Number(snapshot.season_year),
    week:snapshot.week_index==null?null:Number(snapshot.week_index),
    passed,
    score,
    checks,
    statistics:{
      mappingRunId:statsRunId||null,
      totalRoutes,
      skippedRoutes,
      processedRoutes,
      failedRoutes,
      previousManifestRoutes,
      currentManifestRoutes,
      missingHistoricalRoutes,
      deltaStatisticRows,
      latestRegularStatWeek,
      expectedLatestCompletedWeek,
      advancedLeagueState,
      delta
    },
    transactionPipeline:{
      status:detection?.status||null,
      movementCount:movements,
      classificationCount
    },
    timing,
    playerSync
  };

  const id=crypto.randomUUID();
  await s.db.prepare(`INSERT INTO import_performance_certifications
    (id,league_id,orchestrator_run_id,snapshot_id,previous_snapshot_id,certification_mode,passed,score,wall_clock_ms,report_json)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(league_id,snapshot_id) DO UPDATE SET
      orchestrator_run_id=excluded.orchestrator_run_id,
      previous_snapshot_id=excluded.previous_snapshot_id,
      certification_mode=excluded.certification_mode,
      passed=excluded.passed,
      score=excluded.score,
      wall_clock_ms=excluded.wall_clock_ms,
      report_json=excluded.report_json,
      created_at=CURRENT_TIMESTAMP`)
    .bind(id,s.league.id,String(orchestrator?.id||body.runId||'')||null,snapshotId,previousSnapshotId,
      'weekly-delta',passed?1:0,score,wallClockMs||null,JSON.stringify(report)).run();

  const stored=await s.db.prepare(`SELECT * FROM import_performance_certifications
    WHERE league_id=? AND snapshot_id=?`).bind(s.league.id,snapshotId).first();

  return{ok:true,release:RELEASE,certification:publicCertification(stored)};
}

export async function onRequestGet(context){
  const s=await state(context);if(s.response)return s.response;
  const latest=await latestCertification(s.db,s.league.id);
  return json({ok:true,release:RELEASE,certification:publicCertification(latest)});
}

export async function onRequestPost(context){
  const s=await state(context);if(s.response)return s.response;
  let body={};try{body=await context.request.json()}catch{}
  try{
    const result=await certify(s,body);
    if(result?.error)return json({ok:false,release:RELEASE,error:result.error},result.status||500);
    return json(result);
  }catch(error){
    return json({ok:false,release:RELEASE,error:'Import performance certification failed.',detail:error?.message||String(error)},500);
  }
}
