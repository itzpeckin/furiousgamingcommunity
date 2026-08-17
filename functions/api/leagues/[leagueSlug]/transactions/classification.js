import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE='5.9.10.6.4.1';
const parse=value=>{try{return JSON.parse(value||'null')}catch{return null}};

async function ensureSchema(db){
  const sqls=[
    `CREATE TABLE IF NOT EXISTS transaction_movement_classifications (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      movement_id TEXT NOT NULL,
      previous_snapshot_id TEXT NOT NULL,
      current_snapshot_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      classification TEXT NOT NULL,
      transaction_family TEXT NOT NULL,
      confidence TEXT NOT NULL,
      candidate_trade INTEGER NOT NULL DEFAULT 0,
      candidate_trade_group_key TEXT,
      free_agent_confirmation_required INTEGER NOT NULL DEFAULT 0,
      source_type TEXT NOT NULL DEFAULT 'snapshot-diff',
      classification_json TEXT NOT NULL DEFAULT '{}',
      classified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (league_id,movement_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_movement_classifications_current
      ON transaction_movement_classifications (league_id,current_snapshot_id,classification)`,
    `CREATE INDEX IF NOT EXISTS idx_movement_classifications_player
      ON transaction_movement_classifications (league_id,player_id,classified_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_movement_classifications_trade_group
      ON transaction_movement_classifications (league_id,candidate_trade_group_key)`
  ];
  for(const sql of sqls)await db.prepare(sql).run();
}

async function requestState(context,write=false){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return{response:json({ok:false,error:'Invalid league slug.',release:RELEASE},400)};
  if(write){
    const auth=await requireCommissioner(context);
    if(!auth.authorized)return{response:auth.response};
  }
  const db=database(context.env);
  const league=db?await resolveLeague(context.env,slug):null;
  if(!db||!league)return{response:json({ok:false,error:'League not found.',release:RELEASE},404)};
  if(write)await ensureSchema(db);
  return{db,league,slug};
}

async function latestRun(db,leagueId){
  return db.prepare(`SELECT * FROM forward_detection_jobs
    WHERE league_id=? AND status IN ('complete','baseline')
    ORDER BY COALESCE(completed_at,updated_at,created_at) DESC LIMIT 1`)
    .bind(leagueId).first();
}

function publicRow(row){
  return{
    id:row.id,
    movementId:row.movement_id,
    previousSnapshotId:row.previous_snapshot_id,
    currentSnapshotId:row.current_snapshot_id,
    playerId:row.player_id,
    playerName:row.player_name||null,
    position:row.position||null,
    previousTeamId:row.previous_team_id||null,
    currentTeamId:row.current_team_id||null,
    detectionType:row.detection_type||null,
    classification:row.classification,
    transactionFamily:row.transaction_family,
    confidence:row.confidence,
    candidateTrade:Boolean(row.candidate_trade),
    candidateTradeGroupKey:row.candidate_trade_group_key||null,
    freeAgentConfirmationRequired:Boolean(row.free_agent_confirmation_required),
    sourceType:row.source_type,
    details:parse(row.classification_json)||{},
    classifiedAt:row.classified_at,
    updatedAt:row.updated_at
  };
}

async function classify(db,leagueId){
  await ensureSchema(db);
  const run=await latestRun(db,leagueId);
  if(!run)return{ok:false,status:422,error:'No completed Forward Detection run is available.'};
  if(run.status==='baseline')return{
    ok:true,baseline:true,currentSnapshotId:run.current_snapshot_id,classifiedCount:0,
    summary:{teamChanges:0,rosterEntries:0,rosterExits:0,statusChanges:0,candidateTradeMovements:0,freeAgentDeferred:0}
  };

  const previousId=String(run.previous_snapshot_id||'');
  const currentId=String(run.current_snapshot_id||'');

  await db.prepare(`
    INSERT INTO transaction_movement_classifications (
      id,league_id,movement_id,previous_snapshot_id,current_snapshot_id,player_id,
      classification,transaction_family,confidence,candidate_trade,candidate_trade_group_key,
      free_agent_confirmation_required,source_type,classification_json,classified_at,updated_at
    )
    SELECT
      lower(hex(randomblob(16))),m.league_id,m.id,m.previous_snapshot_id,m.current_snapshot_id,m.player_id,
      CASE
        WHEN m.detection_type='team-change' AND COALESCE(m.previous_team_id,'')<>'' AND COALESCE(m.current_team_id,'')='' THEN 'RELEASE'
        WHEN m.detection_type='team-change' AND COALESCE(m.previous_team_id,'')='' AND COALESCE(m.current_team_id,'')<>'' THEN 'SIGNING'
        WHEN m.detection_type='team-change' THEN 'TEAM_CHANGE'
        WHEN m.detection_type='roster-entry' THEN 'SIGNING'
        WHEN m.detection_type='roster-exit' THEN 'RELEASE'
        WHEN m.detection_type='roster-status-change' THEN 'ROSTER_STATUS_CHANGE'
        ELSE 'ROSTER_MOVEMENT'
      END,
      CASE m.detection_type
        WHEN 'team-change' THEN 'TEAM_TO_TEAM'
        WHEN 'roster-entry' THEN 'ROSTER_ACQUISITION_EVIDENCE'
        WHEN 'roster-exit' THEN 'ROSTER_DEPARTURE_EVIDENCE'
        WHEN 'roster-status-change' THEN 'ROSTER_STATUS'
        ELSE 'ROSTER_MOVEMENT'
      END,
      'snapshot-observed',
      CASE WHEN m.detection_type='team-change' THEN 1 ELSE 0 END,
      CASE WHEN m.detection_type='team-change' THEN
        m.previous_snapshot_id || ':' || m.current_snapshot_id || ':' ||
        CASE WHEN COALESCE(m.previous_team_id,'') <= COALESCE(m.current_team_id,'')
          THEN COALESCE(m.previous_team_id,'') || '|' || COALESCE(m.current_team_id,'')
          ELSE COALESCE(m.current_team_id,'') || '|' || COALESCE(m.previous_team_id,'') END
      ELSE NULL END,
      0,
      'snapshot-diff',
      json_object(
        'ruleVersion','5.9.10.6.4.1',
        'detectionType',m.detection_type,
        'fromTeamId',m.previous_team_id,
        'toTeamId',m.current_team_id,
        'freeAgentAuthoritative',0,
        'freeAgentLifecycleInferred',CASE WHEN m.detection_type IN ('roster-entry','roster-exit') THEN 1 ELSE 0 END,
        'promotionDeferred',0
      ),
      CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
    FROM forward_roster_movements m
    WHERE m.league_id=? AND m.previous_snapshot_id=? AND m.current_snapshot_id=?
    ON CONFLICT(league_id,movement_id) DO UPDATE SET
      classification=excluded.classification,
      transaction_family=excluded.transaction_family,
      confidence=excluded.confidence,
      candidate_trade=excluded.candidate_trade,
      candidate_trade_group_key=excluded.candidate_trade_group_key,
      free_agent_confirmation_required=excluded.free_agent_confirmation_required,
      source_type=excluded.source_type,
      classification_json=excluded.classification_json,
      updated_at=CURRENT_TIMESTAMP
  `).bind(leagueId,previousId,currentId).run();

  const counts=await db.prepare(`SELECT COUNT(*) total,
    SUM(CASE WHEN classification='TEAM_CHANGE' THEN 1 ELSE 0 END) team_changes,
    SUM(CASE WHEN classification='SIGNING' THEN 1 ELSE 0 END) signings,
    SUM(CASE WHEN classification='RELEASE' THEN 1 ELSE 0 END) releases,
    SUM(CASE WHEN classification='ROSTER_ENTRY' THEN 1 ELSE 0 END) roster_entries,
    SUM(CASE WHEN classification='ROSTER_EXIT' THEN 1 ELSE 0 END) roster_exits,
    SUM(CASE WHEN classification='ROSTER_STATUS_CHANGE' THEN 1 ELSE 0 END) status_changes,
    SUM(CASE WHEN candidate_trade=1 THEN 1 ELSE 0 END) candidate_trade_movements,
    SUM(CASE WHEN free_agent_confirmation_required=1 THEN 1 ELSE 0 END) free_agent_deferred
    FROM transaction_movement_classifications
    WHERE league_id=? AND previous_snapshot_id=? AND current_snapshot_id=?`)
    .bind(leagueId,previousId,currentId).first();

  return{
    ok:true,baseline:false,previousSnapshotId:previousId,currentSnapshotId:currentId,
    classifiedCount:Number(counts?.total||0),
    summary:{
      teamChanges:Number(counts?.team_changes||0),
      signings:Number(counts?.signings||0),
      releases:Number(counts?.releases||0),
      rosterEntries:Number(counts?.roster_entries||0),
      rosterExits:Number(counts?.roster_exits||0),
      statusChanges:Number(counts?.status_changes||0),
      candidateTradeMovements:Number(counts?.candidate_trade_movements||0),
      freeAgentDeferred:Number(counts?.free_agent_deferred||0)
    }
  };
}

export async function onRequestGet(context){
  const s=await requestState(context,false);if(s.response)return s.response;
  const exists=await s.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='transaction_movement_classifications'`).first();
  if(!exists)return json({ok:true,release:RELEASE,state:'not-initialized',classifications:[],summary:null,policy:{
    rosterEntry:'SIGNING inferred when a player enters the 32-team roster universe',
    rosterExit:'RELEASE inferred when a player leaves the 32-team roster universe',
    teamChange:'TEAM_CHANGE and candidate for 6.4 trade reconciliation'
  }});

  const run=await latestRun(s.db,s.league.id);
  const currentId=run?.current_snapshot_id||null;
  let rows=[];
  if(currentId){
    rows=(await s.db.prepare(`SELECT c.*,m.player_name,m.position,m.previous_team_id,m.current_team_id,m.detection_type
      FROM transaction_movement_classifications c
      LEFT JOIN forward_roster_movements m ON m.id=c.movement_id
      WHERE c.league_id=? AND c.current_snapshot_id=?
      ORDER BY c.classified_at DESC,c.player_id`).bind(s.league.id,currentId).all()).results||[];
  }
  const summary={
    total:rows.length,
    teamChanges:rows.filter(r=>r.classification==='TEAM_CHANGE').length,
    signings:rows.filter(r=>r.classification==='SIGNING').length,
    releases:rows.filter(r=>r.classification==='RELEASE').length,
    rosterEntries:rows.filter(r=>r.classification==='ROSTER_ENTRY').length,
    rosterExits:rows.filter(r=>r.classification==='ROSTER_EXIT').length,
    statusChanges:rows.filter(r=>r.classification==='ROSTER_STATUS_CHANGE').length,
    candidateTradeMovements:rows.filter(r=>Number(r.candidate_trade)===1).length,
    freeAgentDeferred:rows.filter(r=>Number(r.free_agent_confirmation_required)===1).length
  };
  return json({ok:true,release:RELEASE,state:run?'active':'initialized',
    latestDetectionRun:run?{previousSnapshotId:run.previous_snapshot_id||null,currentSnapshotId:run.current_snapshot_id,status:run.status,movementCount:Number(run.movement_count||0)}:null,
    summary,classifications:rows.map(publicRow),policy:{
      rosterEntry:'SIGNING inferred when a player enters the 32-team roster universe',
      rosterExit:'RELEASE inferred when a player leaves the 32-team roster universe',
      teamChange:'TEAM_CHANGE and candidate for 6.4 trade reconciliation'
    }});
}

export async function onRequestPost(context){
  const s=await requestState(context,true);if(s.response)return s.response;
  let body={};try{body=await context.request.json()}catch{}
  if(String(body.action||'classify').toLowerCase()!=='classify')return json({ok:false,release:RELEASE,error:'Unsupported action.'},400);
  try{
    const result=await classify(s.db,s.league.id);
    if(result.ok===false)return json({release:RELEASE,...result},result.status||500);
    return json({release:RELEASE,...result});
  }catch(error){
    return json({ok:false,release:RELEASE,error:'Transaction classification failed.',detail:error?.message||String(error)},500);
  }
}
