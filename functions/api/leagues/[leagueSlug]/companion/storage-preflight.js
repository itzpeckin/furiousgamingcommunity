import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE='5.9.10.6.5.3';

async function tableExists(db,name){
  const row=await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(name).first();
  return Boolean(row);
}
async function count(db,table,leagueId,extra='',...args){
  try{
    const row=await db.prepare(`SELECT COUNT(*) count FROM ${table} WHERE league_id=? ${extra}`).bind(leagueId,...args).first();
    return Number(row?.count||0);
  }catch{return 0}
}
async function deleteLeagueRows(db,table,leagueId){
  if(!(await tableExists(db,table)))return 0;
  const before=await count(db,table,leagueId);
  if(before)await db.prepare(`DELETE FROM ${table} WHERE league_id=?`).bind(leagueId).run();
  return before;
}

export async function onRequestPost(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.',release:RELEASE},400);

  const auth=await requireCommissioner(context);
  if(!auth.authorized)return auth.response;

  const db=database(context.env);
  const league=db?await resolveLeague(context.env,slug):null;
  if(!db||!league||auth.session.membership?.leagueId!==league.id)return json({ok:false,error:'Not found.',release:RELEASE},404);

  let body={};
  try{body=await context.request.json()}catch{}
  const preservePlayers=body?.preservePlayers===true;

  try{
    const active=await db.prepare(`SELECT snapshot_id FROM league_active_snapshots WHERE league_id=?`).bind(league.id).first();
    const activeId=active?.snapshot_id?String(active.snapshot_id):null;

    const reclaimed={
      snapshotRecords:0,
      snapshots:0,
      lifecycleEvents:0,
      validationJobs:0,
      previewTeams:0,
      previewPlayers:0,
      previewGames:0,
      previewStatistics:0
    };

    // Preserve the currently LIVE snapshot. Everything older is disposable Madden test-state.
    if(activeId){
      reclaimed.snapshotRecords=await count(db,'league_snapshot_records',league.id,'AND snapshot_id<>?',activeId);
      if(reclaimed.snapshotRecords){
        await db.prepare(`DELETE FROM league_snapshot_records WHERE league_id=? AND snapshot_id<>?`).bind(league.id,activeId).run();
      }

      if(await tableExists(db,'snapshot_validation_jobs')){
        reclaimed.validationJobs=await count(db,'snapshot_validation_jobs',league.id,'AND snapshot_id<>?',activeId);
        if(reclaimed.validationJobs){
          await db.prepare(`DELETE FROM snapshot_validation_jobs WHERE league_id=? AND snapshot_id<>?`).bind(league.id,activeId).run();
        }
      }

      if(await tableExists(db,'league_snapshot_lifecycle_events')){
        reclaimed.lifecycleEvents=await count(db,'league_snapshot_lifecycle_events',league.id,'AND snapshot_id<>?',activeId);
        if(reclaimed.lifecycleEvents){
          await db.prepare(`DELETE FROM league_snapshot_lifecycle_events WHERE league_id=? AND snapshot_id<>?`).bind(league.id,activeId).run();
        }
      }

      reclaimed.snapshots=await count(db,'league_snapshots',league.id,'AND id<>?',activeId);
      if(reclaimed.snapshots){
        await db.prepare(`DELETE FROM league_snapshots WHERE league_id=? AND id<>?`).bind(league.id,activeId).run();
      }

      // An intentionally pruned historical pointer must not point to a deleted snapshot.
      await db.prepare(`UPDATE league_active_snapshots SET previous_snapshot_id=NULL WHERE league_id=?`).bind(league.id).run();
    }

    // Preview tables are only working/staging data. The active site reads league_snapshot_records.
    reclaimed.previewTeams=await deleteLeagueRows(db,'companion_canonical_teams_preview',league.id);
    reclaimed.previewPlayers=preservePlayers
      ? 0
      : await deleteLeagueRows(db,'companion_canonical_players_preview',league.id);
    reclaimed.previewGames=await deleteLeagueRows(db,'companion_canonical_games_preview',league.id);
    reclaimed.previewStatistics=await deleteLeagueRows(db,'companion_canonical_statistics_preview',league.id);

    return json({
      ok:true,
      release:RELEASE,
      activeSnapshotPreserved:activeId,
      reclaimed,
      deltaReuse:{
        playerPreviewPreserved:preservePlayers
      },
      protected:{
        activeSnapshot:true,
        users:true,
        memberships:true,
        leagueSettings:true,
        tradeCenter:true,
        canonicalTransactions:true,
        forwardRosterMovements:true,
        companionRouteCaptures:true,
        r2Exports:true
      }
    });
  }catch(error){
    return json({
      ok:false,
      release:RELEASE,
      error:'Pre-import storage cleanup failed.',
      detail:error?.message||String(error)
    },500);
  }
}
