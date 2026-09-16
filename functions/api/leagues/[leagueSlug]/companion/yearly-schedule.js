import {
  database,
  json,
  normalizeLeagueSlug,
  resolveLeague,
  sha256Hex,
  validLeagueSlug
} from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';
import { normalizeGameRelease } from '../../../../_lib/game-year-transition.js';
import {
  parseYearlyScheduleCapture,
  selectYearlyScheduleGames,
  yearlyScheduleCoverage
} from '../../../../_lib/yearly-schedule.js';

const RELEASE='7.5.6.7';
const EXPECTED_GAME_COUNT=272;
const text=value=>String(value??'').trim();
const parse=(value,fallback)=>{try{return JSON.parse(value||'')}catch{return fallback}};

async function requestState(context) {
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return{response:json({ok:false,error:'Invalid league slug.',release:RELEASE},400)};
  const authorization=await requireCommissioner(context);
  if(!authorization.authorized)return{response:authorization.response};
  const db=database(context.env),league=db?await resolveLeague(context.env,slug):null;
  if(!db||!league||authorization.session.membership?.leagueId!==league.id){
    return{response:json({ok:false,error:'Not found.',release:RELEASE},404)};
  }
  return{db,league,slug,authorization,env:context.env};
}

async function preparedSeason(db,leagueId) {
  return db.prepare(`SELECT season.*,destination.id destination_id,destination.game_year_id,
      linked.game_year_id linked_game_year_id,game_year.status game_year_status
    FROM franchise_seasons season
    LEFT JOIN companion_import_destinations destination
      ON destination.league_id=season.league_id AND destination.franchise_season_id=season.id
      AND destination.status='active'
    LEFT JOIN game_year_franchise_seasons linked
      ON linked.league_id=season.league_id AND linked.franchise_season_id=season.id
    LEFT JOIN league_game_years game_year
      ON game_year.league_id=season.league_id AND game_year.id=COALESCE(destination.game_year_id,linked.game_year_id)
    WHERE season.league_id=? AND season.status IN ('preview','active')
    ORDER BY CASE season.status WHEN 'preview' THEN 0 ELSE 1 END,season.created_at DESC,season.rowid DESC
    LIMIT 1`).bind(leagueId).first();
}

async function ensureDestination(current,season) {
  if(!season)return{response:json({ok:false,error:'Prepare the next franchise season before importing its yearly schedule.',release:RELEASE},409)};
  if(season.destination_id&&season.game_year_id&&['preparing','active','restored'].includes(String(season.game_year_status||''))){
    return{destinationId:season.destination_id,gameYearId:season.game_year_id};
  }
  const normalized=normalizeGameRelease(season.game_release);
  if(!normalized.ok)return{response:json({ok:false,error:normalized.error,release:RELEASE},409)};
  let gameYear=await current.db.prepare(`SELECT * FROM league_game_years
    WHERE league_id=? AND game_release=? AND status IN ('preparing','active','restored')
    ORDER BY updated_at DESC LIMIT 1`).bind(current.league.id,normalized.gameRelease).first();
  if(!gameYear){
    const id=`game_year_${crypto.randomUUID()}`;
    await current.db.prepare(`INSERT INTO league_game_years
      (id,league_id,game_release,edition_year,display_name,status)
      VALUES (?,?,?,?,?,'preparing')`).bind(
        id,current.league.id,normalized.gameRelease,normalized.editionYear,normalized.gameRelease
      ).run();
    gameYear=await current.db.prepare(`SELECT * FROM league_game_years WHERE id=?`).bind(id).first();
  }
  await current.db.prepare(`INSERT OR IGNORE INTO game_year_franchise_seasons
    (game_year_id,league_id,franchise_season_id) VALUES (?,?,?)`)
    .bind(gameYear.id,current.league.id,season.id).run();
  let destination=await current.db.prepare(`SELECT * FROM companion_import_destinations
    WHERE league_id=? AND franchise_season_id=? AND status='active' LIMIT 1`)
    .bind(current.league.id,season.id).first();
  if(!destination){
    const id=`import_destination_${crypto.randomUUID()}`;
    await current.db.prepare(`INSERT INTO companion_import_destinations
      (id,league_id,franchise_season_id,label,status,created_by_user_id,game_year_id)
      VALUES (?,?,?,?, 'active',?,?)`).bind(
        id,current.league.id,season.id,`${season.display_name} live imports`,
        current.authorization.session.user.id,gameYear.id
      ).run();
    destination=await current.db.prepare(`SELECT * FROM companion_import_destinations WHERE id=?`).bind(id).first();
  }else if(!destination.game_year_id){
    await current.db.prepare(`UPDATE companion_import_destinations SET game_year_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND league_id=?`).bind(gameYear.id,destination.id,current.league.id).run();
  }
  return{destinationId:destination.id,gameYearId:gameYear.id};
}

async function importRow(db,leagueId,seasonId) {
  const collecting=await db.prepare(`SELECT * FROM yearly_schedule_imports
    WHERE league_id=? AND status='collecting' ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();
  if(collecting)return collecting;
  if(!seasonId)return null;
  return db.prepare(`SELECT * FROM yearly_schedule_imports
    WHERE league_id=? AND franchise_season_id=? AND status='completed'
    ORDER BY revision DESC,finished_at DESC LIMIT 1`).bind(leagueId,seasonId).first();
}

async function captureRows(db,leagueId,importId) {
  const result=await db.prepare(`SELECT capture.id capture_id,capture.route_path,capture.r2_object_key,
      link.observed_at,capture.received_at
    FROM yearly_schedule_import_captures link
    JOIN companion_route_captures capture
      ON capture.id=link.capture_id AND capture.league_id=link.league_id
    WHERE link.league_id=? AND link.import_id=?
    ORDER BY link.observed_at,link.capture_id`).bind(leagueId,importId).all();
  return result.results||[];
}

export async function projectYearlySchedule(env,db,row) {
  if(!row)return{games:[],warnings:[],captureCount:0,...yearlyScheduleCoverage([])};
  if(row.status==='completed'){
    const games=parse(row.schedule_json,[]),coverage=yearlyScheduleCoverage(games);
    return{games,warnings:parse(row.warnings_json,[]),captureCount:null,...coverage};
  }
  const captures=await captureRows(db,row.league_id,row.id);
  const games=[],warnings=[];
  for(const capture of captures){
    try{
      const object=await env.COMPANION_EXPORTS.get(capture.r2_object_key);
      if(!object){warnings.push(`Schedule capture ${capture.capture_id} is retained in D1 but its R2 payload is unavailable.`);continue;}
      const raw=new TextDecoder('utf-8',{fatal:false}).decode(await object.arrayBuffer()).trim();
      if(!raw){warnings.push(`Schedule capture ${capture.capture_id} is empty.`);continue;}
      const projected=parseYearlyScheduleCapture({
        routePath:capture.route_path,payload:JSON.parse(raw),captureId:capture.capture_id,
        observedAt:capture.observed_at||capture.received_at,seasonYear:row.season_year
      });
      games.push(...projected.games);warnings.push(...projected.warnings);
    }catch(error){warnings.push(`Schedule capture ${capture.capture_id} could not be read: ${error?.message||error}`);}
  }
  const selected=selectYearlyScheduleGames(games,warnings),coverage=yearlyScheduleCoverage(selected);
  return{games:selected,warnings:[...new Set(warnings)],captureCount:captures.length,...coverage};
}

async function refreshProjection(current,row) {
  const projection=await projectYearlySchedule(current.env,current.db,row);
  if(row?.status==='collecting'){
    await current.db.prepare(`UPDATE yearly_schedule_imports SET captured_week_count=?,game_count=?,
      coverage_json=?,warnings_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND league_id=? AND status='collecting'`)
      .bind(projection.capturedWeekCount,projection.games.length,JSON.stringify(projection.weeks),
        JSON.stringify(projection.warnings),row.id,current.league.id).run();
  }
  return projection;
}

function publicImport(row,projection) {
  if(!row)return null;
  const completeCoverage=projection.complete;
  const completeSchedule=completeCoverage&&projection.games.length===EXPECTED_GAME_COUNT;
  return{
    id:row.id,
    status:row.status==='completed'?'completed':completeSchedule?'ready':'collecting',
    franchiseSeasonId:row.franchise_season_id,
    gameYearId:row.game_year_id,
    seasonYear:row.season_year===null||row.season_year===undefined?null:Number(row.season_year),
    seasonName:row.display_name||null,
    revision:Number(row.revision||1),
    expectedWeekCount:18,
    capturedWeekCount:projection.capturedWeekCount,
    capturedWeeks:projection.weeks,
    missingWeeks:projection.missingWeeks,
    expectedGameCount:EXPECTED_GAME_COUNT,
    gameCount:projection.games.length,
    captureCount:projection.captureCount,
    readyToFinish:row.status==='collecting'&&completeSchedule,
    warnings:projection.warnings,
    createdAt:row.created_at,
    updatedAt:row.updated_at,
    finishedAt:row.finished_at||null,
    permanentExportUrlPreserved:true,
    activationPerformed:false,
    activeSnapshotChanged:false,
    discordScheduleSyncPerformed:false
  };
}

async function statePayload(current) {
  const season=await preparedSeason(current.db,current.league.id);
  const row=await importRow(current.db,current.league.id,season?.id);
  let detailed=row;
  if(row)detailed=await current.db.prepare(`SELECT annual.*,season.season_year,season.display_name
    FROM yearly_schedule_imports annual
    JOIN franchise_seasons season ON season.id=annual.franchise_season_id AND season.league_id=annual.league_id
    WHERE annual.id=? AND annual.league_id=?`).bind(row.id,current.league.id).first();
  const projection=await refreshProjection(current,detailed);
  return{
    ok:true,release:RELEASE,leagueSlug:current.slug,
    preparedSeason:season?{id:season.id,seasonYear:season.season_year===null?null:Number(season.season_year),displayName:season.display_name}:null,
    yearlyScheduleImport:publicImport(detailed,projection),
    activationPerformed:false,activeSnapshotChanged:false,discordScheduleSyncPerformed:false
  };
}

function auditStatement(current,action,resourceId,detail) {
  return current.db.prepare(`INSERT INTO tenant_audit_events
    (id,league_id,actor_user_id,request_id,action_id,action,resource_type,resource_id,outcome,detail_json)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
      `tenant_audit_${crypto.randomUUID()}`,current.league.id,current.authorization.session.user.id,
      `request_${crypto.randomUUID()}`,`action_${crypto.randomUUID()}`,action,'yearly_schedule_import',
      resourceId,'success',JSON.stringify(detail)
    );
}

async function start(current) {
  const season=await preparedSeason(current.db,current.league.id);
  const destination=await ensureDestination(current,season);
  if(destination.response)return destination.response;
  const existing=await importRow(current.db,current.league.id,season.id);
  if(existing)return json({...await statePayload(current),reused:true},200);
  const running=await current.db.prepare(`SELECT id FROM companion_candidate_import_runs
    WHERE league_id=? AND status='running' LIMIT 1`).bind(current.league.id).first();
  if(running)return json({ok:false,error:'Finish or safely stop the running weekly import before starting Import Yearly Schedule.',release:RELEASE},409);
  const revisionRow=await current.db.prepare(`SELECT COALESCE(MAX(revision),0)+1 revision
    FROM yearly_schedule_imports WHERE league_id=? AND franchise_season_id=?`)
    .bind(current.league.id,season.id).first();
  const id=`yearly_schedule_${crypto.randomUUID()}`,revision=Number(revisionRow?.revision||1);
  await current.db.batch([
    current.db.prepare(`INSERT INTO yearly_schedule_imports
      (id,league_id,game_year_id,franchise_season_id,revision,status,started_by_user_id)
      VALUES (?,?,?,?,?,'collecting',?)`).bind(
        id,current.league.id,destination.gameYearId,season.id,revision,current.authorization.session.user.id
      ),
    current.db.prepare(`UPDATE companion_league_export_endpoints SET latest_session_id=NULL,
      latest_session_token_version=NULL,latest_report_id=NULL,latest_ready_report_id=NULL,
      analysis_requested_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE league_id=?`).bind(current.league.id),
    auditStatement(current,'companion.yearly_schedule.start',id,{
      franchiseSeasonId:season.id,gameYearId:destination.gameYearId,revision,
      expectedWeeks:18,expectedGames:EXPECTED_GAME_COUNT,exportUrlRotated:false,
      activationPerformed:false,activeSnapshotChanged:false,discordScheduleSyncPerformed:false,
      freeAgentDataChanged:false
    })
  ]);
  return json({...await statePayload(current),started:true},201);
}

async function finish(current) {
  const season=await preparedSeason(current.db,current.league.id);
  const row=await importRow(current.db,current.league.id,season?.id);
  if(!row||row.status!=='collecting')return json({ok:false,error:'No yearly schedule import is currently collecting.',release:RELEASE},409);
  const detailed={...row,season_year:season?.season_year,display_name:season?.display_name};
  const projection=await projectYearlySchedule(current.env,current.db,detailed);
  if(!projection.complete||projection.games.length!==EXPECTED_GAME_COUNT){
    return json({
      ok:false,
      error:`Yearly schedule validation requires Regular Season Weeks 1–18 and ${EXPECTED_GAME_COUNT} unique games before finishing.`,
      release:RELEASE,
      yearlyScheduleImport:publicImport(detailed,projection),
      activationPerformed:false,activeSnapshotChanged:false,discordScheduleSyncPerformed:false
    },409);
  }
  const serialized=JSON.stringify(projection.games);
  const digest=await sha256Hex(new TextEncoder().encode(serialized));
  await current.db.batch([
    current.db.prepare(`UPDATE yearly_schedule_imports SET status='completed',captured_week_count=18,
      game_count=?,coverage_json=?,warnings_json=?,schedule_json=?,schedule_sha256=?,
      finished_by_user_id=?,finished_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND league_id=? AND status='collecting'`).bind(
        projection.games.length,JSON.stringify(projection.weeks),JSON.stringify(projection.warnings),
        serialized,digest,current.authorization.session.user.id,row.id,current.league.id
      ),
    current.db.prepare(`UPDATE companion_league_export_endpoints SET latest_session_id=NULL,
      latest_session_token_version=NULL,latest_report_id=NULL,latest_ready_report_id=NULL,
      analysis_requested_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE league_id=?`).bind(current.league.id),
    auditStatement(current,'companion.yearly_schedule.finish',row.id,{
      franchiseSeasonId:row.franchise_season_id,gameYearId:row.game_year_id,revision:row.revision,
      scheduleSha256:digest,weeks:projection.weeks,gameCount:projection.games.length,
      retainedCaptureCount:projection.captureCount,exportUrlRotated:false,
      nextWeeklyExportRequired:true,activationPerformed:false,activeSnapshotChanged:false,
      discordScheduleSyncPerformed:false,freeAgentDataChanged:false
    })
  ]);
  const completed=await current.db.prepare(`SELECT status FROM yearly_schedule_imports
    WHERE id=? AND league_id=?`).bind(row.id,current.league.id).first();
  if(completed?.status!=='completed')return json({ok:false,error:'The yearly schedule changed while it was being finished.',release:RELEASE},409);
  return json({...await statePayload(current),finished:true},200);
}

export async function onRequestGet(context) {
  const current=await requestState(context);
  if(current.response)return current.response;
  return json(await statePayload(current));
}

export async function onRequestPost(context) {
  const current=await requestState(context);
  if(current.response)return current.response;
  let body={};try{body=await context.request.json()}catch{}
  const action=text(body.action).toLowerCase();
  if(action==='start')return start(current);
  if(action==='finish')return finish(current);
  if(action==='refresh')return json(await statePayload(current));
  return json({ok:false,error:`Unsupported action: ${action||'none'}.`,release:RELEASE},400);
}
