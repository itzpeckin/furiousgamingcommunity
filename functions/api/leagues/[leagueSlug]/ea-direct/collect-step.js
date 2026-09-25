/* FHQ_BUILD: 8.0.10 */
import { database, normalizeLeagueSlug, resolveLeague, json } from '../../../../_lib/cloud-platform.js';
import { hashToken } from '../../../../_lib/auth.js';
import { createEaClient } from '../../../../_lib/ea-client.js';
import { runEaCollectionStep } from '../../../../_lib/ea-collection.js';
import { readEaBody, fail, eaErrorResponse, safeEaError, connectionScope, jobScope, openEa, sealEa } from '../../../../_lib/ea-direct.js';

// This is a job-scoped server endpoint, not a browser import or general credential proxy.
export async function onRequestPost(context){
  let job,db,lock;
  try{
    db=database(context.env);
    const token=context.request.headers.get('x-franchisehq-ea-collection-token');
    if(!db||!token||!/^\w{64}$/.test(token))return json({ok:false,error:'Not found.'},404);
    const body=await readEaBody(context.request),league=await resolveLeague(context.env,normalizeLeagueSlug(context));
    if(!league)return json({ok:false,error:'Not found.'},404);
    job=await db.prepare(`SELECT j.* FROM ea_direct_collection_jobs j
      JOIN sessions s ON s.id=j.session_id AND s.user_id=j.actor_id
      JOIN league_memberships m ON m.user_id=j.actor_id AND m.league_id=j.league_id
      WHERE j.id=? AND j.league_id=? AND j.token_hash=? AND julianday(j.expires_at)>julianday('now')
        AND s.revoked_at IS NULL AND julianday(s.expires_at)>julianday('now')
        AND (s.absolute_expires_at IS NULL OR julianday(s.absolute_expires_at)>julianday('now'))
        AND m.active=1 AND m.role='commissioner' LIMIT 1`)
      .bind(String(body.id||''),league.id,await hashToken(token)).first();
    if(!job)return json({ok:false,error:'Not found.'},404);
    if(body.action==='fail'){
      await db.prepare(`UPDATE ea_direct_collection_jobs SET status='failed',message=COALESCE(message,'EA collection could not finish. Retry the collection; live data is unchanged.'),state_cipher=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('queued','running')`).bind(job.id).run();
      return json({ok:true,done:true});
    }
    if(job.status==='completed')return json({ok:true,done:true,status:job.status});
    if(!['queued','running'].includes(job.status))fail('COLLECTION_STOPPED','This collection has stopped.');
    // Workflow retries use the same cursor; stale replay is a no-op.
    if(Number(body.cursor)!==Number(job.cursor))return json({ok:true,done:false,cursor:Number(job.cursor),progress:job.progress});
    lock=new Date(Date.now()+180000).toISOString();
    const claimed=await db.prepare(`UPDATE ea_direct_collection_jobs SET status='running',lock_until=? WHERE id=? AND status IN ('queued','running') AND cursor=? AND (lock_until IS NULL OR julianday(lock_until)<julianday('now'))`)
      .bind(lock,job.id,job.cursor).run();
    if(!Number(claimed.meta?.changes))fail('COLLECTION_BUSY','This collection step is still running.',429);
    const connection=await db.prepare(`SELECT * FROM ea_direct_connections WHERE id=? AND league_id=? AND status='connected'`).bind(job.connection_id,job.league_id).first();
    if(!connection)fail('EA_RECONNECT_REQUIRED','The EA connection changed. Reconnect and start a new collection.');
    const client=createEaClient(context.env);
    let credential=await openEa(context.env,connectionScope(connection),connection.credential_cipher);
    const state=job.state_cipher?await openEa(context.env,jobScope(job),job.state_cipher):{};
    if(Date.parse(credential.expiresAt)-Date.now()<5*60*1000){
      credential=await client.refresh(credential);
      const updated=await db.prepare(`UPDATE ea_direct_connections SET credential_cipher=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND league_id=? AND status='connected'`)
        .bind(await sealEa(context.env,connectionScope(connection),credential),connection.id,league.id).run();
      if(!Number(updated.meta?.changes))fail('EA_RECONNECT_REQUIRED','The EA connection changed.');
      state.session=null;
    }
    const result=await runEaCollectionStep({db,bucket:context.env.COMPANION_EXPORTS,league,connection,job,client,token:credential,state});
    const done=Boolean(result.done),summary=result.result||{},cursor=Number(job.cursor)+1;
    const statements=[db.prepare(`UPDATE ea_direct_collection_jobs SET status=?,cursor=?,step=?,progress=?,state_cipher=?,result_json=?,message=?,error_code=NULL,lock_until=NULL,updated_at=CURRENT_TIMESTAMP,completed_at=? WHERE id=? AND league_id=? AND lock_until=? AND status='running'`)
      .bind(done?'completed':'running',cursor,String(result.step||'Collecting EA data').slice(0,120),Math.max(0,Math.min(100,Number(result.progress)||0)),
        done?null:await sealEa(context.env,jobScope(job),result.state),JSON.stringify(summary),summary.message||null,done?new Date().toISOString():null,job.id,league.id,lock)];
    if(done)statements.push(db.prepare(`UPDATE ea_direct_connections SET preview_verified=CASE WHEN ?=1 THEN 1 ELSE preview_verified END,last_synced_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND league_id=? AND status='connected'
        AND EXISTS(SELECT 1 FROM ea_direct_collection_jobs WHERE id=? AND status='completed' AND cursor=?)`)
      .bind(job.mode==='preview'&&summary.previewVerified?1:0,connection.id,league.id,job.id,cursor));
    await db.batch(statements);
    return json({ok:true,done,cursor,progress:result.progress,status:done?'completed':'running'});
  }catch(error){
    const safe=safeEaError(error);
    if(job&&db){
      await db.prepare(`UPDATE ea_direct_collection_jobs SET message=?,error_code=?,lock_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND lock_until=?`).bind(safe.message,safe.code,job.id,lock||'').run();
      if(safe.code==='EA_RECONNECT_REQUIRED')await db.prepare(`UPDATE ea_direct_connections SET status='reconnect-required',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='connected'`).bind(job.connection_id).run();
    }
    return eaErrorResponse(error);
  }
}
