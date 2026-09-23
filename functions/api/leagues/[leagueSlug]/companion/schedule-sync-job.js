/* FHQ_BUILD: 8.0.8.1 */
import { requireCommissioner } from '../../../../_lib/permissions.js';
import { database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { syncDiscordScheduleThreads } from '../../../../_lib/discord-schedule.js';

const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});

export async function onRequestPost(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);
  const auth=await requireCommissioner(context);
  if(!auth.authorized)return auth.response;
  const db=database(context.env),league=db?await resolveLeague(context.env,slug):null;
  if(!db||!league||auth.session.membership?.leagueId!==league.id){
    return json({ok:false,error:'Not found.'},404);
  }
  const body=await context.request.json().catch(()=>({}));
  const snapshotId=String(body.snapshotId||'').trim();
  const source=String(body.source||'').trim();
  if(!snapshotId||!['candidate-import','rollover-recovery'].includes(source)){
    return json({ok:false,error:'Schedule checkpoint request is invalid.'},400);
  }
  if(body.action==='fail'){
    const message=String(body.error||'Schedule workflow stopped before completing.').slice(0,500);
    await db.prepare(`UPDATE discord_schedule_sync_runs
      SET status='failed',error_count=CASE WHEN error_count>0 THEN error_count ELSE 1 END,
        last_error=?,updated_at=CURRENT_TIMESTAMP
      WHERE league_id=? AND snapshot_id=? AND status='running'`)
      .bind(message,league.id,snapshotId).run();
    return json({ok:true,status:'failed-recorded'});
  }
  const result=await syncDiscordScheduleThreads(context.env,db,{
    league,snapshotId,source,requestedByUserId:auth.session.user.id,
    maxOperations:Math.min(2,Math.max(1,Number(body.maxOperations)||1))
  });
  if(result.skipped||result.errors?.length)return json({ok:false,...result},409);
  return json(result);
}
