/* FHQ_BUILD: 5.9.10.6.5.4h-p3d */
import { requireCommissioner } from '../../../../_lib/permissions.js';
import { database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { createRandomToken, hashToken } from '../../../../_lib/auth.js';
import { requireDatabaseSchema } from '../../../../_lib/database-schema.js';

const RELEASE='7.4.0.5';
const json=(body,status=200)=>new Response(JSON.stringify(body,null,2),{
  status,
  headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
const text=v=>String(v??'').trim();

function worker(context){
  return context.env?.FRANCHISE_IMPORT_WORKER || null;
}
function origin(request){
  const url=new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

async function ensureDelegationSchema(db){
  return requireDatabaseSchema(db);
}

async function createDelegation(db,session,leagueId){
  await ensureDelegationSchema(db);
  // Keep the table small and revoke expired workflow credentials opportunistically.
  await db.prepare(`DELETE FROM server_import_delegations WHERE expires_at <= CURRENT_TIMESTAMP`).run().catch(()=>{});
  const token=createRandomToken(32);
  const tokenHash=await hashToken(token);
  const expiresAt=new Date(Date.now()+15*60*1000).toISOString();
  await db.prepare(`INSERT INTO server_import_delegations
    (token_hash,session_id,league_id,expires_at)
    VALUES (?,?,?,?)`)
    .bind(tokenHash,session.sessionId,leagueId,expiresAt).run();
  return{token,expiresAt};
}

async function authorizedState(context){
  const leagueSlug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(leagueSlug))return{response:json({ok:false,release:RELEASE,error:'Invalid league slug.'},400)};
  const auth=await requireCommissioner(context);
  if(!auth.authorized)return{response:auth.response};
  const db=database(context.env);
  const league=db?await resolveLeague(context.env,leagueSlug):null;
  if(!db||!league||auth.session.membership?.leagueId!==league.id){
    return{response:json({ok:false,release:RELEASE,error:'Not found.'},404)};
  }
  return{leagueSlug,auth,db,league};
}

function parseJson(value,fallback={}){
  try{return JSON.parse(value||'')}catch{return fallback}
}

async function latestCaptureSession(db,leagueId){
  return db.prepare(`SELECT discovery_session_id session_id,MAX(received_at) received_at
    FROM companion_route_captures
    WHERE league_id=? AND discovery_session_id IS NOT NULL AND discovery_session_id<>''
    GROUP BY discovery_session_id
    ORDER BY MAX(received_at) DESC LIMIT 1`).bind(leagueId).first();
}

async function latestImportRun(db,leagueId){
  const row=await db.prepare(`SELECT * FROM companion_candidate_import_runs
    WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first().catch(()=>null);
  if(!row)return null;
  const activationPerformed=Boolean(row.candidate_snapshot_id&&row.active_snapshot_id_after
    &&String(row.candidate_snapshot_id)===String(row.active_snapshot_id_after));
  return{
    id:row.id,
    status:row.status,
    currentStage:row.current_phase,
    stageIndex:Number(row.phase_index||0),
    stageState:parseJson(row.phase_state_json,{}),
    completenessStatus:row.completeness_status,
    teamMappingRunId:row.team_mapping_run_id||null,
    playerMappingRunId:row.player_mapping_run_id||null,
    scheduleMappingRunId:row.schedule_mapping_run_id||null,
    statisticsMappingRunId:row.statistics_mapping_run_id||null,
    snapshotId:row.candidate_snapshot_id||null,
    warnings:parseJson(row.warnings_json,[]),
    retry:parseJson(row.retry_json,{}),
    durationMs:row.duration_ms===null?null:Number(row.duration_ms),
    private:!activationPerformed,
    activationPerformed,
    activeSnapshotChanged:activationPerformed
      &&String(row.active_snapshot_id_before||'')!==String(row.active_snapshot_id_after||''),
    createdAt:row.created_at,
    updatedAt:row.updated_at,
    completedAt:row.completed_at||null
  };
}

export async function onRequestPost(context){
  const state=await authorizedState(context);
  if(state.response)return state.response;

  const binding=worker(context);
  if(!binding)return json({ok:false,release:RELEASE,error:'FRANCHISE_IMPORT_WORKER service binding is not configured.'},503);

  const latest=await latestCaptureSession(state.db,state.league.id);
  if(!latest?.session_id){
    return json({ok:false,release:RELEASE,error:'No Madden Companion export is available.'},400);
  }

  const delegation=await createDelegation(state.db,state.auth.session,state.league.id);

  const response=await binding.fetch('https://franchise-import.internal/start',{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify({
      leagueSlug:state.leagueSlug,
      origin:origin(context.request),
      workflowKey:String(latest.session_id),
      importAuthToken:delegation.token,
      importAuthExpiresAt:delegation.expiresAt
    })
  });
  return new Response(response.body,{status:response.status,headers:response.headers});
}

export async function onRequestGet(context){
  const state=await authorizedState(context);
  if(state.response)return state.response;

  const binding=worker(context);
  if(!binding)return json({ok:false,release:RELEASE,error:'FRANCHISE_IMPORT_WORKER service binding is not configured.'},503);

  const requestUrl=new URL(context.request.url);
  const id=text(requestUrl.searchParams.get('id'));

  let workerStatus={ok:true,id,workflowStatus:null,workflowState:'unknown',workflowOutput:null};
  if(id){
    const u=new URL('https://franchise-import.internal/status');
    u.searchParams.set('id',id);
    const response=await binding.fetch(u.toString(),{headers:{accept:'application/json'}});
    workerStatus=await response.json().catch(()=>workerStatus);
  }

  // Read persisted progress locally from D1. This avoids the old
  // Pages -> Worker -> Pages status round trip.
  const run=await latestImportRun(state.db,state.league.id);

  return json({
    ok:true,
    release:RELEASE,
    id,
    workflowStatus:workerStatus?.workflowStatus||null,
    workflowState:workerStatus?.workflowState||'unknown',
    workflowOutput:workerStatus?.workflowOutput||null,
    candidate:{run},
    private:!run?.activationPerformed,
    activationPerformed:Boolean(run?.activationPerformed),
    activeSnapshotChanged:Boolean(run?.activeSnapshotChanged)
  });
}
