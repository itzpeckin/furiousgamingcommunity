/* FHQ_BUILD: 8.0.10 */
import { json } from '../../../../_lib/cloud-platform.js';
import { createRandomToken, hashToken } from '../../../../_lib/auth.js';
import { authorizedEaState, configured, readEaBody, fail, eaErrorResponse, activeEaConnection } from '../../../../_lib/ea-direct.js';

export function publicEaJob(row){
  if(!row)return null;
  let result={};try{result=JSON.parse(row.result_json||'{}');}catch{}
  return{id:row.id,mode:row.mode,status:row.status,step:row.step,progress:Number(row.progress||0),message:row.message,
    code:row.error_code,coverage:result.coverage||null,readyToImport:Boolean(result.readyToImport),
    previewVerified:Boolean(result.previewVerified),private:row.mode==='preview',activationPerformed:false,
    createdAt:row.created_at,completedAt:row.completed_at};
}
export async function onRequestGet(context){
  try{
    const state=await authorizedEaState(context);if(state.response)return state.response;
    const id=new URL(context.request.url).searchParams.get('id');
    const row=id?await state.db.prepare(`SELECT * FROM ea_direct_collection_jobs WHERE league_id=? AND id=?`).bind(state.league.id,id).first()
      :await state.db.prepare(`SELECT * FROM ea_direct_collection_jobs WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(state.league.id).first();
    if(id&&!row)return json({ok:false,error:'Not found.'},404);
    return json({ok:true,...publicEaJob(row),job:publicEaJob(row)});
  }catch(error){return eaErrorResponse(error);}
}
export async function onRequestPost(context){
  try{
    const state=await authorizedEaState(context);if(state.response)return state.response;
    if(!configured(state.env)||!state.env.FRANCHISE_IMPORT_WORKER)fail('NOT_CONFIGURED','EA Direct collection is not configured yet.');
    if(!state.env.COMPANION_EXPORTS)fail('STORAGE_UNAVAILABLE','Private export storage is unavailable. No league data was changed.');
    const body=await readEaBody(context.request),mode=String(body.mode||'');
    if(!['preview','weekly','yearly'].includes(mode))fail('INVALID_MODE','Choose Preview, Weekly Update, or Yearly Schedule.',400);
    const connection=await activeEaConnection(state.db,state.league.id);
    if(connection?.status!=='connected')fail('EA_RECONNECT_REQUIRED','Connect your EA account first.');
    if(mode!=='preview'&&!connection.preview_verified)fail('PREVIEW_REQUIRED','Complete a private preview before collecting data for import.');
    // Expired credentials cannot drive a job; release only that abandoned job's lock.
    await state.db.prepare(`UPDATE ea_direct_collection_jobs SET status='failed',state_cipher=NULL,error_code='COLLECTION_EXPIRED',message='The collection expired. Start a new collection.',updated_at=CURRENT_TIMESTAMP WHERE league_id=? AND status IN ('queued','running') AND julianday(expires_at)<=julianday('now')`).bind(state.league.id).run();
    const busy=await state.db.prepare(`SELECT * FROM ea_direct_collection_jobs WHERE league_id=? AND status IN ('queued','running') LIMIT 1`).bind(state.league.id).first();
    if(busy)return json({ok:true,...publicEaJob(busy),reusedExisting:true});
    const id=`eaj_${crypto.randomUUID()}`,token=createRandomToken(32),expiresAt=new Date(Date.now()+60*60*1000).toISOString();
    try{
      await state.db.prepare(`INSERT INTO ea_direct_collection_jobs(id,league_id,connection_id,actor_id,session_id,mode,status,token_hash,expires_at) VALUES(?,?,?,?,?,?,'queued',?,?)`)
        .bind(id,state.league.id,connection.id,state.session.user.id,state.session.sessionId,mode,await hashToken(token),expiresAt).run();
    }catch(error){
      const winner=await state.db.prepare(`SELECT * FROM ea_direct_collection_jobs WHERE league_id=? AND status IN ('queued','running') LIMIT 1`).bind(state.league.id).first();
      if(winner)return json({ok:true,...publicEaJob(winner),reusedExisting:true});throw error;
    }
    try{
      const response=await state.env.FRANCHISE_IMPORT_WORKER.fetch('https://franchise-import.internal/ea/start',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({jobId:id,leagueSlug:state.slug,origin:new URL(context.request.url).origin,collectionToken:token})
      });
      const launched=await response.json();
      if(!response.ok||!launched.ok)fail('WORKER_UNAVAILABLE','The collector could not start. Try again.');
      await state.db.prepare(`UPDATE ea_direct_collection_jobs SET workflow_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND league_id=?`).bind(launched.id,id,state.league.id).run();
    }catch(error){
      await state.db.prepare(`UPDATE ea_direct_collection_jobs SET status='failed',error_code='WORKER_UNAVAILABLE',message='The collector could not start. Try again.',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'`).bind(id).run();throw error;
    }
    const row=await state.db.prepare(`SELECT * FROM ea_direct_collection_jobs WHERE id=? AND league_id=?`).bind(id,state.league.id).first();
    return json({ok:true,...publicEaJob(row)});
  }catch(error){return eaErrorResponse(error);}
}
