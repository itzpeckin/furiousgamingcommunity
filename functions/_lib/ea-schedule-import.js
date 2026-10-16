import { createRandomToken, hashToken } from './auth.js';
import { EaClientError } from './ea-client.js';

// Called only after the collection endpoint has authenticated this exact job
// and its still-active commissioner session. Replays reuse the durable ID.
export async function publishEaSeasonSchedule(context,{db,league,job,result}){
  if(job.mode!=='yearly'||!result.readyToImport||!result.yearlyScheduleImportId)return result;
  if(result.importWorkflowId)return result;
  const report=await db.prepare(`SELECT report.session_id,report.report_hash
    FROM companion_league_export_endpoints endpoint JOIN madden_discovery_reports report
      ON report.id=endpoint.latest_ready_report_id AND report.league_id=endpoint.league_id
    WHERE endpoint.league_id=? AND report.id=? AND report.status='passed'`)
    .bind(league.id,result.reportId).first();
  if(report?.session_id!==result.sessionId)throw new EaClientError('EA_SCHEDULE_IMPORT_FAILED','A newer export replaced this schedule before publication. Refresh and import the latest export.',{status:409});
  const token=createRandomToken(32),expiresAt=new Date(Date.now()+3600000).toISOString();
  await db.prepare(`INSERT INTO server_import_delegations(token_hash,session_id,league_id,expires_at) VALUES(?,?,?,?)`)
    .bind(await hashToken(token),job.session_id,league.id,expiresAt).run();
  const response=await context.env.FRANCHISE_IMPORT_WORKER.fetch('https://franchise-import.internal/start',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      leagueSlug:league.slug,origin:new URL(context.request.url).origin,
      workflowKey:`${result.sessionId}:${report.report_hash}`,expectedSessionId:result.sessionId,
      importAuthToken:token,importAuthExpiresAt:expiresAt
    })
  });
  const started=await response.json();
  if(!response.ok||!started.ok||!started.id)throw new EaClientError('EA_SCHEDULE_IMPORT_FAILED','The season schedule was collected but publication could not start. Refresh and select Import Latest Export.',{status:409});
  const updated={...result,importWorkflowId:started.id,message:'Season schedule collected. Publishing the validated league update automatically.'};
  await db.prepare(`UPDATE ea_direct_collection_jobs SET result_json=?,message=?,error_code=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND league_id=? AND status='completed'`).bind(JSON.stringify(updated),updated.message,job.id,league.id).run();
  return updated;
}
