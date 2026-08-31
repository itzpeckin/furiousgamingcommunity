import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireActiveMembership } from '../../../../_lib/permissions.js';
import { freeAgentStateFromMappingRun, resolveSnapshotPlayerMappingRun } from '../../../../_lib/live-data-experience.js';
import { normalizePlayer } from '../snapshot/read-model.js';

const RELEASE='7.3.5';
const parse=value=>{try{return JSON.parse(value||'null')}catch{return null}};

async function activeSnapshot(db,leagueId){
  return db.prepare(`SELECT s.* FROM league_active_snapshots a
    JOIN league_snapshots s ON s.id=a.snapshot_id AND s.league_id=a.league_id
    WHERE a.league_id=? LIMIT 1`).bind(leagueId).first();
}

async function activeFreeAgents(db,leagueId,snapshotId){
  const result=await db.prepare(`SELECT data_json FROM league_snapshot_records
    WHERE league_id=? AND snapshot_id=? AND domain='players' ORDER BY external_id`).bind(leagueId,snapshotId).all();
  return (result.results||[])
    .map(row=>normalizePlayer(parse(row.data_json)||{}))
    .filter(player=>player.rosterStatus==='free-agent');
}

export async function onRequestGet(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.',release:RELEASE},400);
  const authorization=await requireActiveMembership(context);
  if(!authorization.authorized)return authorization.response;
  const db=database(context.env),league=db?await resolveLeague(context.env,slug):null;
  if(!db||!league||authorization.session.membership?.leagueId!==league.id)return json({ok:false,error:'Not found.',release:RELEASE},404);

  const snapshot=await activeSnapshot(db,league.id);
  if(!snapshot)return json({
    ok:true,release:RELEASE,mode:'active-snapshot',authoritative:true,snapshotId:null,
    status:'unavailable',count:null,players:[],reason:'No active snapshot is available.',interpretedAsZero:false
  });

  const mappingRun=await resolveSnapshotPlayerMappingRun(db,league.id,snapshot);
  let state=freeAgentStateFromMappingRun(mappingRun);
  let players=['ready','empty-confirmed'].includes(state.status)
    ?await activeFreeAgents(db,league.id,snapshot.id)
    :[];
  if((state.status==='ready'&&players.length!==Number(state.count))||(state.status==='empty-confirmed'&&players.length!==0)){
    state={status:'unavailable',count:null,reason:'The active snapshot Free Agent rows do not reconcile to its pinned player-mapping source.',interpretedAsZero:false};
    players=[];
  }
  const count=state.status==='ready'?players.length:state.count;

  return json({
    ok:true,release:RELEASE,mode:'active-snapshot',authoritative:true,
    snapshotId:snapshot.id,sourceSnapshotId:mappingRun?.sourceSnapshotId||snapshot.id,status:state.status,count,players,
    reason:state.reason,interpretedAsZero:false,
    sourceRoute:'active-snapshot-player-domain',rawPayloadReturned:false
  });
}
