import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE='5.9.10.6.2e',DEFAULT_OWNER_ACCOUNT_ID='owner-tb';
const STAGES=['map-teams','map-players','map-schedule','map-statistics','build-snapshot','validate-snapshot','activate-snapshot','detect-transactions','verify-active-snapshot'];
const ownerAccountId=env=>String(env.PLATFORM_OWNER_ACCOUNT_ID||DEFAULT_OWNER_ACCOUNT_ID).trim();
const parse=(v,f={})=>{try{return JSON.parse(v||'')}catch{return f}};
const text=v=>v==null?null:(String(v).trim()||null);
let orchestratorSchemaReady=false;
async function ensureOrchestratorSchema(db){
  if(orchestratorSchemaReady)return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS companion_import_orchestrator_runs (
    id TEXT PRIMARY KEY,
    league_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    current_stage TEXT NOT NULL DEFAULT 'map-teams',
    stage_index INTEGER NOT NULL DEFAULT 0,
    stage_state_json TEXT NOT NULL DEFAULT '{}',
    statistics_mapping_run_id TEXT,
    snapshot_id TEXT,
    error_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_import_orchestrator_league_created ON companion_import_orchestrator_runs (league_id, created_at DESC)`).run();
  orchestratorSchemaReady=true;
}
async function requirePlatformOwner(context){const auth=await requireCommissioner(context);if(!auth.authorized)return auth;const presented=String(context.request.headers.get('x-franchisehq-platform-owner-account-id')||'').trim();if(!presented||presented!==ownerAccountId(context.env))return{authorized:false,response:json({ok:false,error:'Not found.'},404)};return auth}
async function state(context){const slug=normalizeLeagueSlug(context);if(!validLeagueSlug(slug))return{response:json({ok:false,error:'Invalid league slug.'},400)};const auth=await requirePlatformOwner(context);if(!auth.authorized)return{response:auth.response};const db=database(context.env),league=await resolveLeague(context.env,slug);if(!db||!league||auth.session.membership?.leagueId!==league.id)return{response:json({ok:false,error:'Not found.'},404)};await ensureOrchestratorSchema(db);return{db,league,slug}}
function publicRun(run){if(!run)return null;return{id:run.id,status:run.status,currentStage:run.current_stage,stageIndex:Number(run.stage_index||0),stages:STAGES,stageState:parse(run.stage_state_json,{}),statisticsMappingRunId:run.statistics_mapping_run_id||null,snapshotId:run.snapshot_id||null,error:parse(run.error_json,null),createdAt:run.created_at,updatedAt:run.updated_at,completedAt:run.completed_at||null}}
function instruction(slug,run){
  if(!run||run.status!=='running')return null;
  const base=`/api/leagues/${encodeURIComponent(slug)}/companion/`;
  switch(run.current_stage){
    case'map-teams':return{method:'POST',url:`${base}map-teams`,body:{}};
    case'map-players':return{method:'POST',url:`${base}map-players`,body:{}};
    case'map-schedule':return{method:'POST',url:`${base}map-schedule`,body:{}};
    case'map-statistics':return{mode:'incremental',method:'POST',url:`${base}map-statistics`,startBody:{action:'start'},nextBody:{action:'next',runId:'<statisticsMappingRunId>'},repeatUntil:'complete=true'};
    case'build-snapshot':return{method:'POST',url:`${base}build-snapshot`,body:{}};
    case'validate-snapshot':return{method:'POST',url:`${base}snapshot-lifecycle`,body:{action:'validate',snapshotId:run.snapshot_id||'<snapshotId>'}};
    case'activate-snapshot':return{method:'POST',url:`${base}snapshot-lifecycle`,body:{action:'activate',snapshotId:run.snapshot_id||'<snapshotId>'}};
    case'detect-transactions':return{mode:'incremental',method:'POST',url:`/api/leagues/${encodeURIComponent(slug)}/transactions/forward-detection`,startBody:{action:'start'},nextBody:{action:'next',limit:250},repeatUntil:'complete=true'};
    case'verify-active-snapshot':return{method:'GET',url:`${base}snapshot-verification`};
    default:return null;
  }
}
async function latest(db,leagueId){return db.prepare(`SELECT * FROM companion_import_orchestrator_runs WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first()}
export async function onRequestGet(context){const s=await state(context);if(s.response)return s.response;const run=await latest(s.db,s.league.id);return json({ok:true,release:RELEASE,orchestratorAvailable:true,run:publicRun(run),nextRequest:instruction(s.slug,run),stages:STAGES})}
export async function onRequestPost(context){
  const s=await state(context);if(s.response)return s.response;
  let body={};try{body=await context.request.json()}catch{}
  const action=String(body.action||'start').toLowerCase();
  if(action==='start'){
    const id=crypto.randomUUID();
    await s.db.prepare(`UPDATE companion_import_orchestrator_runs SET status='superseded',updated_at=CURRENT_TIMESTAMP WHERE league_id=? AND status='running'`).bind(s.league.id).run();
    await s.db.prepare(`INSERT INTO companion_import_orchestrator_runs (id,league_id,status,current_stage,stage_index,stage_state_json) VALUES (?,?,?,?,?,?)`).bind(id,s.league.id,'running',STAGES[0],0,'{}').run();
    const run=await s.db.prepare(`SELECT * FROM companion_import_orchestrator_runs WHERE id=?`).bind(id).first();
    return json({ok:true,release:RELEASE,action:'start',run:publicRun(run),nextRequest:instruction(s.slug,run)});
  }
  const runId=text(body.runId);if(!runId)return json({ok:false,error:'runId is required.'},400);
  const run=await s.db.prepare(`SELECT * FROM companion_import_orchestrator_runs WHERE id=? AND league_id=?`).bind(runId,s.league.id).first();if(!run)return json({ok:false,error:'Import orchestrator run not found.'},404);
  if(action==='report'){
    const stage=text(body.stage);if(stage!==run.current_stage)return json({ok:false,error:`Expected stage ${run.current_stage}; received ${stage||'none'}.`},409);
    const ok=body.ok!==false,stateJson=parse(run.stage_state_json,{});stateJson[stage]={ok,at:new Date().toISOString(),summary:body.summary||null};
    if(!ok){await s.db.prepare(`UPDATE companion_import_orchestrator_runs SET status='failed',stage_state_json=?,error_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify(stateJson),JSON.stringify(body.error||{message:`${stage} failed`}),run.id).run()}
    else{
      const nextIndex=Number(run.stage_index||0)+1,next=STAGES[nextIndex];
      const finished=!next;
      await s.db.prepare(`UPDATE companion_import_orchestrator_runs SET status=?,current_stage=?,stage_index=?,stage_state_json=?,statistics_mapping_run_id=COALESCE(?,statistics_mapping_run_id),snapshot_id=COALESCE(?,snapshot_id),updated_at=CURRENT_TIMESTAMP,completed_at=? WHERE id=?`).bind(finished?'complete':'running',finished?'complete':next,nextIndex,JSON.stringify(stateJson),text(body.statisticsMappingRunId),text(body.snapshotId),finished?new Date().toISOString():null,run.id).run();
    }
    const updated=await s.db.prepare(`SELECT * FROM companion_import_orchestrator_runs WHERE id=?`).bind(run.id).first();
    return json({ok:true,release:RELEASE,action:'report',run:publicRun(updated),nextRequest:instruction(s.slug,updated)});
  }
  if(action==='cancel'){
    await s.db.prepare(`UPDATE companion_import_orchestrator_runs SET status='cancelled',updated_at=CURRENT_TIMESTAMP,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(run.id).run();
    return json({ok:true,release:RELEASE,action:'cancel',run:publicRun(await s.db.prepare(`SELECT * FROM companion_import_orchestrator_runs WHERE id=?`).bind(run.id).first())});
  }
  return json({ok:false,error:`Unsupported action: ${action}`},400);
}
