import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';

const RELEASE='5.9.10.6.2';

async function tableExists(db,name){
  const row=await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(name).first();
  return Boolean(row);
}

const parse=v=>{try{return JSON.parse(v||'null')}catch{return null}};

export async function onRequestGet(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.',release:RELEASE},400);
  const db=database(context.env),league=db?await resolveLeague(context.env,slug):null;
  if(!db||!league)return json({ok:false,error:'League not found.',release:RELEASE},404);

  if(!(await tableExists(db,'forward_detection_runs'))){
    return json({
      ok:true,release:RELEASE,state:'not-initialized',
      baselineEstablished:false,runCount:0,movementCount:0,runs:[],movements:[]
    });
  }

  const runResult=await db.prepare(`SELECT * FROM forward_detection_runs
    WHERE league_id=? ORDER BY created_at DESC LIMIT 20`).bind(league.id).all();

  const moveResult=await db.prepare(`SELECT * FROM forward_roster_movements
    WHERE league_id=? ORDER BY detected_at DESC LIMIT 100`).bind(league.id).all();

  const runs=(runResult.results||[]).map(row=>({
    runId:row.id,
    previousSnapshotId:row.previous_snapshot_id||null,
    currentSnapshotId:row.current_snapshot_id,
    status:row.status,
    previousPlayerCount:Number(row.previous_player_count||0),
    currentPlayerCount:Number(row.current_player_count||0),
    movementCount:Number(row.movement_count||0),
    teamChanges:Number(row.team_change_count||0),
    rosterEntries:Number(row.roster_entry_count||0),
    rosterExits:Number(row.roster_exit_count||0),
    statusChanges:Number(row.status_change_count||0),
    note:row.note||null,
    createdAt:row.created_at
  }));

  const movements=(moveResult.results||[]).map(row=>({
    id:row.id,
    previousSnapshotId:row.previous_snapshot_id,
    currentSnapshotId:row.current_snapshot_id,
    playerId:row.player_id,
    playerName:row.player_name,
    previousTeamId:row.previous_team_id||null,
    currentTeamId:row.current_team_id||null,
    previousRosterStatus:row.previous_roster_status||null,
    currentRosterStatus:row.current_roster_status||null,
    position:row.position||null,
    detectionType:row.detection_type,
    season:row.season==null?null:Number(row.season),
    week:row.week==null?null:Number(row.week),
    evidence:parse(row.evidence_json)||{},
    detectedAt:row.detected_at
  }));

  return json({
    ok:true,
    release:RELEASE,
    state:runs.length?'active':'initialized',
    baselineEstablished:runs.some(run=>run.status==='baseline')||runs.length>0,
    runCount:runs.length,
    movementCount:movements.length,
    latestRun:runs[0]||null,
    runs,
    movements,
    deferred:{
      freeAgentAcquisition:true,
      note:'Roster entry/exit is captured as movement evidence but is not classified as Signing/Release until authoritative Free Agent acquisition is available.'
    }
  });
}
