/* FHQ_BUILD: 5.9.10.6.5.4h-p3a | lifecycle-throughput */
import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE='5.9.10.6.5.4h-p3a';
let schemaReady=false;
const parse=(value,fallback=null)=>{try{return JSON.parse(value??'')}catch{return fallback}};
const clean=value=>value==null?null:(String(value).trim()||null);
const now=()=>new Date().toISOString();
const uniq=values=>[...new Set((values||[]).filter(Boolean).map(String))];
const normalizedPair=values=>uniq(values).sort();
const overlap=(a=[],b=[])=>a.some(value=>b.includes(value));
const samePair=(a=[],b=[])=>{
  const aa=normalizedPair(a),bb=normalizedPair(b);
  return aa.length===bb.length && aa.every((value,index)=>value===bb[index]);
};
const freeAgentTeam=value=>!clean(value)||['0','fa','free-agent','free_agent','unassigned','none','null'].includes(String(value).toLowerCase());

async function ensureSchema(db){
  if(schemaReady)return;
  const statements=[
    `CREATE TABLE IF NOT EXISTS canonical_transactions (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'recorded',
      authority TEXT NOT NULL DEFAULT 'snapshot-inferred',
      execution_status TEXT NOT NULL DEFAULT 'observed',
      season INTEGER,
      week INTEGER,
      occurred_at TEXT,
      team_ids_json TEXT NOT NULL DEFAULT '[]',
      player_ids_json TEXT NOT NULL DEFAULT '[]',
      workflow_trade_id TEXT,
      first_snapshot_id TEXT,
      last_snapshot_id TEXT,
      confidence TEXT NOT NULL DEFAULT 'inferred',
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_canonical_transactions_league_created
      ON canonical_transactions (league_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_canonical_transactions_workflow
      ON canonical_transactions (league_id, workflow_trade_id)`,
    `CREATE TABLE IF NOT EXISTS canonical_transaction_evidence (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_key TEXT NOT NULL,
      snapshot_id TEXT,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (league_id, source_type, source_key),
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
      FOREIGN KEY (transaction_id) REFERENCES canonical_transactions(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_transaction_evidence_transaction
      ON canonical_transaction_evidence (transaction_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS canonical_roster_snapshots (
      league_id TEXT NOT NULL,
      snapshot_id TEXT NOT NULL,
      season INTEGER,
      week INTEGER,
      captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      player_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (league_id, snapshot_id),
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS canonical_roster_snapshot_players (
      league_id TEXT NOT NULL,
      snapshot_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      player_name TEXT,
      team_id TEXT,
      roster_status TEXT,
      position TEXT,
      PRIMARY KEY (league_id, snapshot_id, player_id),
      FOREIGN KEY (league_id, snapshot_id) REFERENCES canonical_roster_snapshots(league_id, snapshot_id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_roster_snapshot_players_league_player
      ON canonical_roster_snapshot_players (league_id, player_id, snapshot_id)`,
    `CREATE TABLE IF NOT EXISTS canonical_free_agents (
      league_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      player_name TEXT,
      position TEXT,
      overall INTEGER,
      age INTEGER,
      dev_trait TEXT,
      source_route TEXT,
      source_capture_id TEXT,
      raw_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (league_id, player_id),
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_canonical_free_agents_league_name
      ON canonical_free_agents (league_id, player_name)`,
    `CREATE TABLE IF NOT EXISTS canonical_historical_player_states (
      league_id TEXT NOT NULL,
      snapshot_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      player_name TEXT,
      team_id TEXT,
      roster_status TEXT,
      position TEXT,
      raw_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (league_id, snapshot_id, player_id),
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_historical_player_states_player
      ON canonical_historical_player_states (league_id, player_id, snapshot_id)`
,
    `CREATE TABLE IF NOT EXISTS canonical_capture_lifecycle_sessions (
      league_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      received_at TEXT,
      team_route_count INTEGER NOT NULL DEFAULT 0,
      player_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      processed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (league_id, session_id),
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_capture_lifecycle_sessions_order
      ON canonical_capture_lifecycle_sessions (league_id, received_at)`
  ];
  for(const sql of statements)await db.prepare(sql).run();
  schemaReady=true;
}

async function requestState(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return{response:json({ok:false,error:'Invalid league slug.'},400)};
  const auth=await requireCommissioner(context);
  if(!auth.authorized)return{response:auth.response};
  const db=database(context.env),league=await resolveLeague(context.env,slug);
  if(!db||!league||auth.session.membership?.leagueId!==league.id){
    return{response:json({ok:false,error:'Not found.'},404)};
  }
  await ensureSchema(db);
  return{db,league,slug,auth};
}

function publicTransaction(row,evidence=[]){
  if(!row)return null;
  return{
    id:row.id,
    eventType:row.event_type,
    status:row.status,
    authority:row.authority,
    executionStatus:row.execution_status,
    season:row.season==null?null:Number(row.season),
    week:row.week==null?null:Number(row.week),
    occurredAt:row.occurred_at||null,
    teamIds:parse(row.team_ids_json,[])||[],
    playerIds:parse(row.player_ids_json,[])||[],
    workflowTradeId:row.workflow_trade_id||null,
    firstSnapshotId:row.first_snapshot_id||null,
    lastSnapshotId:row.last_snapshot_id||null,
    confidence:row.confidence,
    details:parse(row.details_json,{})||{},
    evidence:evidence.map(item=>({
      sourceType:item.source_type,
      sourceKey:item.source_key,
      snapshotId:item.snapshot_id||null,
      evidence:parse(item.evidence_json,{})||{},
      createdAt:item.created_at
    })),
    createdAt:row.created_at,
    updatedAt:row.updated_at
  };
}

function evidenceFlags(evidence=[]){
  const types=new Set(evidence.map(row=>row.source_type));
  return{
    workflow:types.has('franchisehq-workflow'),
    madden:types.has('madden-explicit'),
    diff:types.has('snapshot-diff')
  };
}

function authorityFor(flags){
  if(flags.workflow&&flags.madden)return'franchisehq+madden';
  if(flags.madden)return'madden-explicit';
  if(flags.workflow&&flags.diff)return'franchisehq+snapshot-confirmed';
  if(flags.workflow)return'franchisehq-workflow';
  if(flags.diff)return'snapshot-inferred';
  return'unknown';
}

function executionFor(flags,eventType){
  if(flags.madden)return'confirmed-madden';
  if(flags.diff&&flags.workflow)return'confirmed-roster';
  if(flags.diff)return'observed-roster';
  if(flags.workflow&&eventType==='trade')return'pending-madden-execution';
  return'observed';
}

function normalizeIncomingEvent(event={},sourceType='snapshot-diff'){
  const teamIds=normalizedPair(event.teamIds||[event.fromTeamId,event.toTeamId]);
  const playerIds=uniq(event.playerIds||[event.playerId]);
  return{
    sourceType,
    sourceKey:clean(event.sourceKey)||`${sourceType}:${crypto.randomUUID()}`,
    eventType:clean(event.eventType)||'roster-move',
    teamIds,
    playerIds,
    workflowTradeId:clean(event.workflowTradeId),
    season:Number.isFinite(Number(event.season))?Number(event.season):null,
    week:Number.isFinite(Number(event.week))?Number(event.week):null,
    occurredAt:clean(event.occurredAt),
    confidence:clean(event.confidence)||(sourceType==='madden-explicit'?'explicit':sourceType==='franchisehq-workflow'?'workflow':'inferred'),
    raw:event
  };
}

async function evidenceBySource(db,leagueId,sourceType,sourceKey){
  return db.prepare(`SELECT * FROM canonical_transaction_evidence
    WHERE league_id=? AND source_type=? AND source_key=? LIMIT 1`)
    .bind(leagueId,sourceType,sourceKey).first();
}

async function evidenceForTransaction(db,transactionId){
  const result=await db.prepare(`SELECT * FROM canonical_transaction_evidence
    WHERE transaction_id=? ORDER BY created_at`).bind(transactionId).all();
  return result.results||[];
}

async function candidateTransactions(db,leagueId,event){
  let result;
  if(event.workflowTradeId){
    result=await db.prepare(`SELECT * FROM canonical_transactions
      WHERE league_id=? AND workflow_trade_id=? ORDER BY created_at DESC LIMIT 20`)
      .bind(leagueId,event.workflowTradeId).all();
    if((result.results||[]).length)return result.results;
  }
  result=await db.prepare(`SELECT * FROM canonical_transactions
    WHERE league_id=? ORDER BY created_at DESC LIMIT 250`).bind(leagueId).all();
  return result.results||[];
}

function compatibleEvent(existing,event){
  const existingTeams=parse(existing.team_ids_json,[])||[];
  const existingPlayers=parse(existing.player_ids_json,[])||[];
  const typeA=String(existing.event_type||'');
  const typeB=String(event.eventType||'');

  // An inferred team-change is allowed to confirm a Trade Center/Madden trade,
  // but it must never promote itself to a trade without stronger evidence.
  const compatibleTypes=typeA===typeB ||
    (['trade','team-change','roster-move'].includes(typeA)&&['trade','team-change','roster-move'].includes(typeB));
  if(!compatibleTypes)return false;

  const pairMatches=event.teamIds.length>=2 && existingTeams.length>=2 && samePair(existingTeams,event.teamIds);
  const playerMatches=event.playerIds.length>0 && existingPlayers.length>0 && overlap(existingPlayers,event.playerIds);

  if(event.workflowTradeId&&existing.workflow_trade_id===event.workflowTradeId)return true;
  if(pairMatches&&playerMatches)return true;

  // Madden can sometimes omit one side of a transaction. Player overlap is enough
  // only when one source is explicit/workflow and the other is a roster diff.
  if(playerMatches && (event.sourceType==='snapshot-diff' || existing.authority!=='snapshot-inferred'))return true;
  return false;
}

async function refreshCanonicalRow(db,transactionId){
  const row=await db.prepare(`SELECT * FROM canonical_transactions WHERE id=?`).bind(transactionId).first();
  const evidence=await evidenceForTransaction(db,transactionId);
  const flags=evidenceFlags(evidence);
  const authority=authorityFor(flags);
  const execution=executionFor(flags,row.event_type);

  let eventType=row.event_type;
  if(flags.madden){
    const explicit=evidence.find(item=>item.source_type==='madden-explicit');
    const explicitType=clean(parse(explicit?.evidence_json,{})?.eventType);
    if(explicitType)eventType=explicitType;
  }else if(flags.workflow){
    eventType='trade';
  }

  const playerIds=uniq([
    ...(parse(row.player_ids_json,[])||[]),
    ...evidence.flatMap(item=>parse(item.evidence_json,{})?.playerIds||[])
  ]);
  const teamIds=normalizedPair([
    ...(parse(row.team_ids_json,[])||[]),
    ...evidence.flatMap(item=>parse(item.evidence_json,{})?.teamIds||[])
  ]);

  await db.prepare(`UPDATE canonical_transactions
    SET event_type=?,authority=?,execution_status=?,team_ids_json=?,player_ids_json=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?`)
    .bind(eventType,authority,execution,JSON.stringify(teamIds),JSON.stringify(playerIds),transactionId).run();

  return db.prepare(`SELECT * FROM canonical_transactions WHERE id=?`).bind(transactionId).first();
}

async function mergeEvidence(db,leagueId,event,snapshotId=null){
  const existingEvidence=await evidenceBySource(db,leagueId,event.sourceType,event.sourceKey);
  if(existingEvidence){
    const row=await refreshCanonicalRow(db,existingEvidence.transaction_id);
    return{transactionId:existingEvidence.transaction_id,created:false,deduped:true,row};
  }

  const candidates=await candidateTransactions(db,leagueId,event);
  let target=candidates.find(row=>compatibleEvent(row,event))||null;

  if(!target){
    const id=crypto.randomUUID();
    const initialAuthority=event.sourceType==='madden-explicit'
      ?'madden-explicit'
      :event.sourceType==='franchisehq-workflow'
        ?'franchisehq-workflow'
        :'snapshot-inferred';
    const execution=event.sourceType==='madden-explicit'
      ?'confirmed-madden'
      :event.sourceType==='franchisehq-workflow'&&event.eventType==='trade'
        ?'pending-madden-execution'
        :'observed-roster';
    await db.prepare(`INSERT INTO canonical_transactions
      (id,league_id,event_type,status,authority,execution_status,season,week,occurred_at,
       team_ids_json,player_ids_json,workflow_trade_id,first_snapshot_id,last_snapshot_id,confidence,details_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(
        id,leagueId,event.eventType,'recorded',initialAuthority,execution,event.season,event.week,event.occurredAt,
        JSON.stringify(event.teamIds),JSON.stringify(event.playerIds),event.workflowTradeId,
        snapshotId,snapshotId,event.confidence,JSON.stringify({})
      ).run();
    target=await db.prepare(`SELECT * FROM canonical_transactions WHERE id=?`).bind(id).first();
  }else{
    const workflowId=target.workflow_trade_id||event.workflowTradeId;
    await db.prepare(`UPDATE canonical_transactions
      SET workflow_trade_id=?,last_snapshot_id=COALESCE(?,last_snapshot_id),
          season=COALESCE(season,?),week=COALESCE(week,?),occurred_at=COALESCE(occurred_at,?),
          updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(workflowId,snapshotId,event.season,event.week,event.occurredAt,target.id).run();
  }

  await db.prepare(`INSERT OR IGNORE INTO canonical_transaction_evidence
    (id,league_id,transaction_id,source_type,source_key,snapshot_id,evidence_json)
    VALUES (?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),leagueId,target.id,event.sourceType,event.sourceKey,snapshotId,JSON.stringify(event.raw)).run();

  const row=await refreshCanonicalRow(db,target.id);
  return{transactionId:target.id,created:target.id!==target?.id?true:!candidates.some(r=>r.id===target.id),deduped:Boolean(candidates.some(r=>r.id===target.id)),row};
}

async function previousRosterSnapshot(db,leagueId,currentSnapshotId){
  return db.prepare(`SELECT * FROM canonical_roster_snapshots
    WHERE league_id=? AND snapshot_id<>?
    ORDER BY captured_at DESC LIMIT 1`)
    .bind(leagueId,currentSnapshotId).first();
}

async function rosterRows(db,leagueId,snapshotId){
  const result=await db.prepare(`SELECT player_id,player_name,team_id,roster_status,position
    FROM canonical_roster_snapshot_players WHERE league_id=? AND snapshot_id=?`)
    .bind(leagueId,snapshotId).all();
  return result.results||[];
}

function buildDiffEvents(previous=[],current=[],previousSnapshotId,currentSnapshotId,season=null,week=null){
  const oldMap=new Map(previous.map(row=>[String(row.player_id),row]));
  const newMap=new Map(current.map(row=>[String(row.playerId),row]));
  const rawMoves=[];

  // Previously rostered, now absent = release evidence.
  for(const [playerId,oldRow] of oldMap){
    const next=newMap.get(playerId);
    if(!next){
      rawMoves.push({
        playerId,
        playerName:oldRow.player_name||'Unknown Player',
        fromTeamId:clean(oldRow.team_id),
        toTeamId:'FA',
        oldStatus:clean(oldRow.roster_status),
        newStatus:'free-agent',
        eventType:'release'
      });
      continue;
    }
    const from=clean(oldRow.team_id),to=clean(next.teamId);
    const oldStatus=clean(oldRow.roster_status),newStatus=clean(next.rosterStatus);
    if(from===to && oldStatus===newStatus)continue;

    let eventType='roster-move';
    if(from!==to){
      if(freeAgentTeam(from)&&!freeAgentTeam(to))eventType='signing';
      else if(!freeAgentTeam(from)&&freeAgentTeam(to))eventType='release';
      else eventType='team-change';
    }else if(oldStatus!==newStatus){
      eventType='roster-status-change';
    }
    rawMoves.push({
      playerId,
      playerName:next.playerName||oldRow.player_name||'Unknown Player',
      fromTeamId:from,
      toTeamId:to,
      oldStatus,
      newStatus,
      eventType
    });
  }

  // Newly rostered, absent from previous team roster = signing evidence.
  for(const [playerId,next] of newMap){
    if(oldMap.has(playerId))continue;
    rawMoves.push({
      playerId,
      playerName:next.playerName||'Unknown Player',
      fromTeamId:'FA',
      toTeamId:clean(next.teamId),
      oldStatus:'free-agent',
      newStatus:clean(next.rosterStatus)||'active',
      eventType:'signing'
    });
  }

  const grouped=new Map();
  rawMoves.forEach(move=>{
    const pair=normalizedPair([move.fromTeamId,move.toTeamId]).join('|');
    const groupable=move.eventType==='team-change';
    const key=groupable
      ? `diff:${previousSnapshotId}:${currentSnapshotId}:team-change:${pair}`
      : `diff:${previousSnapshotId}:${currentSnapshotId}:${move.eventType}:${move.playerId}`;
    const event=grouped.get(key)||{
      sourceKey:key,
      sourceType:'snapshot-diff',
      eventType:move.eventType,
      teamIds:normalizedPair([move.fromTeamId,move.toTeamId]),
      playerIds:[],
      season,week,
      confidence:'inferred',
      moves:[]
    };
    event.playerIds.push(move.playerId);
    event.moves.push(move);
    grouped.set(key,event);
  });

  return [...grouped.values()];
}

async function forwardMovementHistory(db,leagueId){
  const exists=await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='forward_roster_movements'`).first();
  if(!exists)return[];
  const result=await db.prepare(`SELECT * FROM forward_roster_movements
    WHERE league_id=? ORDER BY COALESCE(detected_at,'') ASC,id ASC`).bind(leagueId).all();
  return result.results||[];
}

function forwardMovementEvent(row){
  const detection=String(row.detection_type||'').toLowerCase();
  const eventType=detection==='roster-entry'?'signing'
    :detection==='roster-exit'?'release'
    :detection==='team-change'?'team-change'
    :detection==='roster-status-change'?'roster-status-change'
    :'roster-move';
  const from=clean(row.previous_team_id)||(eventType==='signing'?'FA':null);
  const to=clean(row.current_team_id)||(eventType==='release'?'FA':null);
  return normalizeIncomingEvent({
    sourceKey:`forward:${row.id}`,
    eventType,
    fromTeamId:from,
    toTeamId:to,
    teamIds:normalizedPair([from,to]),
    playerIds:[row.player_id],
    playerId:row.player_id,
    season:row.season,
    week:row.week,
    previousSnapshotId:row.previous_snapshot_id||null,
    currentSnapshotId:row.current_snapshot_id||null,
    occurredAt:row.detected_at||null,
    confidence:'snapshot-observed',
    moves:[{
      playerId:row.player_id,
      playerName:row.player_name||'Unknown Player',
      fromTeamId:from,
      toTeamId:to,
      oldStatus:row.previous_roster_status||null,
      newStatus:row.current_roster_status||null,
      eventType
    }]
  },'snapshot-diff');
}

async function snapshotPlayerRaw(db,leagueId,snapshotId,playerId){
  if(!snapshotId||!playerId)return null;
  const row=await db.prepare(`SELECT data_json FROM league_snapshot_records
    WHERE league_id=? AND snapshot_id=? AND domain='players' AND external_id=? LIMIT 1`)
    .bind(leagueId,snapshotId,String(playerId)).first();
  return parse(row?.data_json,{})||null;
}

function rawPlayerMeta(raw={},fallback={}){
  const nested=typeof raw?.source_record_json==='string'?parse(raw.source_record_json,{}):(raw?.source_record_json||raw?.source||{});
  const source={...(nested&&typeof nested==='object'?nested:{}),...(raw||{})};
  const num=value=>{const n=Number(value);return Number.isFinite(n)?n:null};
  return{
    playerName:clean(source.display_name??source.displayName??source.playerName??source.name) || clean(fallback.player_name) || 'Unknown Player',
    position:clean(source.position??source.position_name??source.positionName??source.pos) || clean(fallback.position),
    overall:num(source.overall??source.overall_rating??source.overallRating??source.ovrRating??source.playerBestOvr??source.playerOverall??source.ovr),
    age:num(source.age),
    devTrait:clean(source.dev_trait??source.devTrait??source.developmentTrait??source.development),
    raw:source
  };
}

async function rebuildFreeAgentLedger(db,leagueId,movements,currentRoster=[]){
  // Only rebuild snapshot-inferred Free Agents. Explicit Companion FA rows, if ever available, remain untouched.
  await db.prepare(`DELETE FROM canonical_free_agents WHERE league_id=? AND source_route='forward-detection'`).bind(leagueId).run();
  let releases=0,removed=0;
  for(const movement of movements){
    const detection=String(movement.detection_type||'').toLowerCase();
    const playerId=clean(movement.player_id);
    if(!playerId)continue;
    if(detection==='roster-exit'){
      const raw=await snapshotPlayerRaw(db,leagueId,movement.previous_snapshot_id,playerId);
      const meta=rawPlayerMeta(raw||{},movement);
      await db.prepare(`INSERT INTO canonical_free_agents
        (league_id,player_id,player_name,position,overall,age,dev_trait,source_route,source_capture_id,raw_json,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(league_id,player_id) DO UPDATE SET
          player_name=excluded.player_name,position=COALESCE(excluded.position,canonical_free_agents.position),
          overall=COALESCE(excluded.overall,canonical_free_agents.overall),age=COALESCE(excluded.age,canonical_free_agents.age),
          dev_trait=COALESCE(excluded.dev_trait,canonical_free_agents.dev_trait),source_route=excluded.source_route,
          source_capture_id=excluded.source_capture_id,raw_json=excluded.raw_json,updated_at=CURRENT_TIMESTAMP`)
        .bind(leagueId,playerId,meta.playerName,meta.position,meta.overall,meta.age,meta.devTrait,
          'forward-detection',movement.id,JSON.stringify({...meta.raw,teamId:'FA',rosterStatus:'free-agent',status:'free-agent'})).run();
      releases++;
    }else if(['roster-entry','team-change'].includes(detection)){
      const result=await db.prepare(`DELETE FROM canonical_free_agents WHERE league_id=? AND player_id=?`).bind(leagueId,playerId).run();
      removed+=Number(result?.meta?.changes||0);
    }
  }
  // Current team rosters always win over historical release evidence.
  for(let i=0;i<currentRoster.length;i+=75){
    const ids=currentRoster.slice(i,i+75).map(row=>clean(row.playerId)).filter(Boolean);
    if(!ids.length)continue;
    const marks=ids.map(()=>'?').join(',');
    await db.prepare(`DELETE FROM canonical_free_agents WHERE league_id=? AND player_id IN (${marks})`).bind(leagueId,...ids).run();
  }
  const count=Number((await db.prepare(`SELECT COUNT(*) c FROM canonical_free_agents WHERE league_id=?`).bind(leagueId).first())?.c||0);
  return{releasesObserved:releases,removedByAcquisition:removed,currentFreeAgents:count};
}

async function storeRosterSnapshot(db,leagueId,snapshotId,season,week,roster=[]){
  await db.prepare(`INSERT OR REPLACE INTO canonical_roster_snapshots
    (league_id,snapshot_id,season,week,captured_at,player_count)
    VALUES (?,?,?,?,CURRENT_TIMESTAMP,?)`)
    .bind(leagueId,snapshotId,season,week,roster.length).run();

  await db.prepare(`DELETE FROM canonical_roster_snapshot_players WHERE league_id=? AND snapshot_id=?`)
    .bind(leagueId,snapshotId).run();

  const statements=roster.map(row=>db.prepare(`INSERT INTO canonical_roster_snapshot_players
    (league_id,snapshot_id,player_id,player_name,team_id,roster_status,position)
    VALUES (?,?,?,?,?,?,?)`)
    .bind(leagueId,snapshotId,clean(row.playerId),clean(row.playerName),clean(row.teamId),clean(row.rosterStatus),clean(row.position)));

  for(let index=0;index<statements.length;index+=75){
    await db.batch(statements.slice(index,index+75));
  }
}

function syntheticDedupeTest(){
  const workflow={
    id:'canonical-1',event_type:'trade',authority:'franchisehq-workflow',
    workflow_trade_id:'trade-123',team_ids_json:'["TB","DAL"]',player_ids_json:'["player-1"]'
  };
  const explicit=normalizeIncomingEvent({
    sourceKey:'madden:event-99',eventType:'trade',teamIds:['DAL','TB'],playerIds:['player-1']
  },'madden-explicit');
  const diff=normalizeIncomingEvent({
    sourceKey:'diff:a:b',eventType:'team-change',teamIds:['TB','DAL'],playerIds:['player-1']
  },'snapshot-diff');
  const explicitMatches=compatibleEvent(workflow,explicit);
  const diffMatches=compatibleEvent(workflow,diff);
  const flags=evidenceFlags([
    {source_type:'franchisehq-workflow'},
    {source_type:'madden-explicit'},
    {source_type:'snapshot-diff'}
  ]);
  return{
    passed:explicitMatches&&diffMatches&&authorityFor(flags)==='franchisehq+madden'&&executionFor(flags,'trade')==='confirmed-madden',
    expectedCanonicalTransactions:1,
    simulatedEvidenceRecords:3,
    explicitMatchesWorkflow:explicitMatches,
    snapshotDiffMatchesWorkflow:diffMatches,
    finalAuthority:authorityFor(flags),
    finalExecutionStatus:executionFor(flags,'trade'),
    invariant:'one real-world trade = one canonical transaction'
  };
}

export async function onRequestGet(context){
  const state=await requestState(context);
  if(state.response)return state.response;

  const txResult=await state.db.prepare(`SELECT * FROM canonical_transactions
    WHERE league_id=? ORDER BY COALESCE(occurred_at,created_at) DESC,created_at DESC LIMIT 250`)
    .bind(state.league.id).all();

  const transactions=[];
  for(const row of txResult.results||[]){
    transactions.push(publicTransaction(row,await evidenceForTransaction(state.db,row.id)));
  }

  const snapshots=await state.db.prepare(`SELECT * FROM canonical_roster_snapshots
    WHERE league_id=? ORDER BY captured_at DESC LIMIT 20`).bind(state.league.id).all();

  return json({
    ok:true,
    release:RELEASE,
    invariant:'one real-world trade = one canonical transaction',
    transactions,
    rosterSnapshots:snapshots.results||[]
  });
}

const quoteIdentifier=value=>`"${String(value).replace(/"/g,'""')}"`;
const compactValue=(value,max=1200)=>{
  if(value===null||value===undefined)return value;
  if(typeof value==='number'||typeof value==='boolean')return value;
  const text=String(value);
  if(text.length<=max)return text;
  return `${text.slice(0,max)}… [${text.length} chars]`;
};
const summarizeRow=row=>Object.fromEntries(Object.entries(row||{}).map(([key,value])=>[key,compactValue(value)]));

function likelyStorageTable(name=''){
  return /(companion|snapshot|import|capture|export|fingerprint|player|roster|league.?data|payload|route)/i.test(name);
}

function weekSeasonFromText(text=''){
  const value=String(text||'');
  const seasonMatch=value.match(/(?:season|year|yr)[^0-9]{0,4}(20\d{2})/i)||value.match(/(?:^|[\/_-])(20\d{2})(?:[\/_-]|$)/);
  const weekMatch=value.match(/(?:week|wk)[^0-9]{0,4}(\d{1,2})/i);
  return{
    season:seasonMatch?Number(seasonMatch[1]):null,
    week:weekMatch?Number(weekMatch[1]):null
  };
}

async function discoverD1Storage(db,leagueId){
  let tables=[];
  try{
    const result=await db.prepare(`SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name`).all();
    tables=(result.results||[]).filter(row=>likelyStorageTable(row.name));
  }catch(error){
    return{error:error.message,tables:[]};
  }

  const inventory=[];
  for(const table of tables.slice(0,40)){
    const name=String(table.name);
    let columns=[],sampleRows=[],rowCount=null;
    try{
      const colResult=await db.prepare(`PRAGMA table_info(${quoteIdentifier(name)})`).all();
      columns=(colResult.results||[]).map(row=>({name:row.name,type:row.type,notnull:row.notnull,pk:row.pk}));
    }catch{}
    try{
      const countResult=await db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(name)}`).first();
      rowCount=Number(countResult?.count??0);
    }catch{}
    try{
      const sampleResult=await db.prepare(`SELECT * FROM ${quoteIdentifier(name)} LIMIT 20`).all();
      sampleRows=(sampleResult.results||[]).map(summarizeRow);
    }catch{}

    const leagueColumns=columns.filter(col=>/league(_id|id|slug)?$/i.test(col.name)).map(col=>col.name);
    let leagueRows=[];
    if(leagueColumns.length){
      for(const column of leagueColumns.slice(0,2)){
        try{
          const result=await db.prepare(`SELECT * FROM ${quoteIdentifier(name)} WHERE ${quoteIdentifier(column)}=? LIMIT 30`).bind(leagueId).all();
          if((result.results||[]).length){leagueRows=(result.results||[]).map(summarizeRow);break}
        }catch{}
      }
    }

    inventory.push({
      name,
      rowCount,
      columns,
      rowsForLeague:leagueRows,
      sampleRows:leagueRows.length?[]:sampleRows,
      schema:compactValue(table.sql,1800)
    });
  }
  return{tableCount:inventory.length,tables:inventory};
}

function isR2Binding(value){
  return value && typeof value==='object' && typeof value.list==='function' && typeof value.get==='function';
}

async function discoverR2Storage(env,league){
  const bindings=Object.entries(env||{}).filter(([,value])=>isR2Binding(value));
  const results=[];
  for(const [name,bucket] of bindings){
    let cursor=undefined,objects=[],truncated=false,error=null;
    try{
      for(let page=0;page<3;page++){
        const listing=await bucket.list({limit:500,...(cursor?{cursor}:{})});
        objects.push(...(listing.objects||[]));
        if(!listing.truncated){truncated=false;break}
        truncated=true;
        cursor=listing.cursor;
        if(!cursor)break;
      }
    }catch(err){
      error=err.message;
    }

    const candidates=objects.filter(object=>{
      const key=String(object.key||'');
      return /(companion|export|capture|player|roster|snapshot|league)/i.test(key)
        || key.toLowerCase().includes(String(league.slug||'').toLowerCase())
        || key.toLowerCase().includes(String(league.id||'').toLowerCase());
    });

    results.push({
      binding:name,
      scannedObjects:objects.length,
      truncated,
      error,
      candidateCount:candidates.length,
      candidates:candidates.slice(0,300).map(object=>({
        key:object.key,
        size:object.size,
        uploaded:object.uploaded||null,
        etag:object.etag||null,
        ...weekSeasonFromText(object.key)
      }))
    });
  }
  return{bindingCount:results.length,bindings:results};
}

function rawStorageSummary(d1Inventory,r2Inventory){
  const d1Tables=d1Inventory?.tables||[];
  const r2Bindings=r2Inventory?.bindings||[];
  const likelyHistoricalTables=d1Tables.filter(table=>/(companion|export|capture|snapshot|import)/i.test(table.name));
  const r2Candidates=r2Bindings.flatMap(binding=>(binding.candidates||[]).map(row=>({...row,binding:binding.binding})));
  const weeks=[...new Set(r2Candidates.map(row=>row.week).filter(value=>value!==null))].sort((a,b)=>a-b);
  const seasons=[...new Set(r2Candidates.map(row=>row.season).filter(value=>value!==null))].sort((a,b)=>a-b);

  return{
    likelyHistoricalD1Tables:likelyHistoricalTables.map(table=>({name:table.name,rowCount:table.rowCount})),
    r2CandidateObjects:r2Candidates.length,
    discoveredR2Weeks:weeks,
    discoveredR2Seasons:seasons,
    hasPotentialHistoricalStorage:Boolean(likelyHistoricalTables.length||r2Candidates.length),
    note:'R2 discovery inventories object metadata only; it does not download large historical payloads in this diagnostic.'
  };
}

async function discoveryPayload(db,leagueId,activeSnapshotId=null){
  const historical=await db.prepare(`SELECT league_id,snapshot_id,season,week,captured_at,player_count
    FROM canonical_roster_snapshots
    WHERE league_id=?
    ORDER BY captured_at ASC`).bind(leagueId).all();

  const snapshots=historical.results||[];
  const snapshotDetails=[];
  for(const snapshot of snapshots){
    const result=await db.prepare(`SELECT player_id,player_name,team_id,roster_status,position
      FROM canonical_roster_snapshot_players
      WHERE league_id=? AND snapshot_id=?`).bind(leagueId,snapshot.snapshot_id).all();
    const rows=result.results||[];
    const freeAgentLike=rows.filter(row=>freeAgentTeam(row.team_id));
    snapshotDetails.push({
      snapshotId:snapshot.snapshot_id,
      season:snapshot.season==null?null:Number(snapshot.season),
      week:snapshot.week==null?null:Number(snapshot.week),
      capturedAt:snapshot.captured_at,
      playerCount:Number(snapshot.player_count||rows.length),
      freeAgentLikeCount:freeAgentLike.length,
      freeAgentLikeSample:freeAgentLike.slice(0,20).map(row=>({
        playerId:row.player_id,playerName:row.player_name,teamId:row.team_id,rosterStatus:row.roster_status
      }))
    });
  }

  let movementPairs=0;
  let teamChanges=0;
  let signings=0;
  let releases=0;

  for(let i=1;i<snapshotDetails.length;i++){
    const prevId=snapshotDetails[i-1].snapshotId;
    const currId=snapshotDetails[i].snapshotId;
    const prevRows=await rosterRows(db,leagueId,prevId);
    const currResult=await db.prepare(`SELECT player_id AS playerId,player_name AS playerName,team_id AS teamId,roster_status AS rosterStatus,position
      FROM canonical_roster_snapshot_players WHERE league_id=? AND snapshot_id=?`).bind(leagueId,currId).all();
    const currRows=currResult.results||[];
    const events=buildDiffEvents(prevRows,currRows,prevId,currId,snapshotDetails[i].season,snapshotDetails[i].week);
    movementPairs+=events.length;
    events.forEach(event=>{
      if(event.eventType==='team-change')teamChanges+=1;
      if(event.eventType==='signing')signings+=1;
      if(event.eventType==='release')releases+=1;
    });
  }

  const sourcePlayerAudit={
    rosterSnapshotCount:snapshotDetails.length,
    snapshotsWithFreeAgentLikePlayers:snapshotDetails.filter(row=>row.freeAgentLikeCount>0).length,
    totalFreeAgentLikeRows:snapshotDetails.reduce((sum,row)=>sum+row.freeAgentLikeCount,0),
    activeSnapshotId:activeSnapshotId||null
  };

  const transactionBackfill={
    snapshotPairsCompared:Math.max(0,snapshotDetails.length-1),
    inferredMovementEvents:movementPairs,
    inferredTeamChanges:teamChanges,
    inferredSignings:signings,
    inferredReleases:releases,
    canBackfillFromStoredSnapshots:snapshotDetails.length>1
  };

  return{historicalSnapshots:snapshotDetails,sourcePlayerAudit,transactionBackfill};
}

async function safeTableColumns(db,table){
  try{return (await db.prepare(`PRAGMA table_info("${String(table).replace(/"/g,'""')}")`).all()).results||[]}
  catch{return[]}
}
function findColumn(columns,patterns=[]){
  const names=columns.map(c=>String(c.name));
  for(const pattern of patterns){const found=names.find(name=>pattern.test(name));if(found)return found}
  return null;
}
async function inspectLeagueSnapshots(db,leagueId){
  const columns=await safeTableColumns(db,'league_snapshots');
  if(!columns.length)return{available:false,rows:[],columns:[]};
  let rows=[];
  try{rows=(await db.prepare(`SELECT * FROM league_snapshots WHERE league_id=? LIMIT 50`).bind(leagueId).all()).results||[]}
  catch{rows=(await db.prepare(`SELECT * FROM league_snapshots LIMIT 50`).all()).results||[]}
  return{available:true,count:rows.length,columns:columns.map(c=>({name:c.name,type:c.type,pk:c.pk})),rows:rows.map(summarizeRow)};
}
async function inspectSnapshotRecords(db,leagueId){
  const table='league_snapshot_records',columns=await safeTableColumns(db,table);
  if(!columns.length)return{available:false};
  const snapshotCol=findColumn(columns,[/^snapshot_id$/i,/snapshot.*id/i]);
  const typeCol=findColumn(columns,[/^record_type$/i,/^type$/i,/entity.*type/i,/dataset.*type/i,/kind/i]);
  let rowCount=0,recordTypes=[],snapshotCounts=[],samples=[];
  try{rowCount=Number((await db.prepare(`SELECT COUNT(*) count FROM league_snapshot_records WHERE league_id=?`).bind(leagueId).first())?.count||0)}catch{}
  if(typeCol){try{recordTypes=(await db.prepare(`SELECT "${typeCol}" value,COUNT(*) count FROM league_snapshot_records WHERE league_id=? GROUP BY "${typeCol}" ORDER BY count DESC LIMIT 100`).bind(leagueId).all()).results||[]}catch{}}
  if(snapshotCol){try{snapshotCounts=(await db.prepare(`SELECT "${snapshotCol}" snapshotId,COUNT(*) count FROM league_snapshot_records WHERE league_id=? GROUP BY "${snapshotCol}" ORDER BY count DESC LIMIT 50`).bind(leagueId).all()).results||[]}catch{}}
  try{samples=((await db.prepare(`SELECT * FROM league_snapshot_records WHERE league_id=? LIMIT 40`).bind(leagueId).all()).results||[]).map(summarizeRow)}catch{}
  return{available:true,rowCount,columns:columns.map(c=>({name:c.name,type:c.type,pk:c.pk})),detectedColumns:{snapshotCol,typeCol},recordTypes:recordTypes.map(r=>({value:r.value,count:Number(r.count||0)})),snapshotCounts:snapshotCounts.map(r=>({snapshotId:r.snapshotId,count:Number(r.count||0)})),samples};
}
async function inspectPlayerPreview(db,leagueId){
  const table='companion_canonical_players_preview',columns=await safeTableColumns(db,table);
  if(!columns.length)return{available:false};
  const teamCol=findColumn(columns,[/^team_id$/i,/team.*id/i,/team/i]);
  const runCol=findColumn(columns,[/mapping.*run.*id/i,/run.*id/i,/import.*id/i,/export.*id/i,/snapshot.*id/i]);
  const playerCol=findColumn(columns,[/^player_id$/i,/player.*id/i]);
  const statusCol=findColumn(columns,[/roster.*status/i,/^status$/i]);
  let rowCount=0,teamDistribution=[],statusDistribution=[],runCounts=[],freeAgentCandidates=[],samples=[];
  try{rowCount=Number((await db.prepare(`SELECT COUNT(*) count FROM companion_canonical_players_preview WHERE league_id=?`).bind(leagueId).first())?.count||0)}catch{}
  if(teamCol){try{teamDistribution=(await db.prepare(`SELECT "${teamCol}" teamValue,COUNT(*) count FROM companion_canonical_players_preview WHERE league_id=? GROUP BY "${teamCol}" ORDER BY count DESC LIMIT 200`).bind(leagueId).all()).results||[]}catch{}}
  if(statusCol){try{statusDistribution=(await db.prepare(`SELECT "${statusCol}" statusValue,COUNT(*) count FROM companion_canonical_players_preview WHERE league_id=? GROUP BY "${statusCol}" ORDER BY count DESC LIMIT 100`).bind(leagueId).all()).results||[]}catch{}}
  if(runCol){try{runCounts=(await db.prepare(`SELECT "${runCol}" runId,COUNT(*) count FROM companion_canonical_players_preview WHERE league_id=? GROUP BY "${runCol}" ORDER BY count DESC LIMIT 50`).bind(leagueId).all()).results||[]}catch{}}
  if(teamCol){
    for(const v of ['0','-1','fa','free-agent','free_agent','unassigned','none','null']){
      try{freeAgentCandidates.push(...((await db.prepare(`SELECT * FROM companion_canonical_players_preview WHERE league_id=? AND LOWER(CAST("${teamCol}" AS TEXT))=? LIMIT 30`).bind(leagueId,v).all()).results||[]).map(summarizeRow))}catch{}
    }
    try{freeAgentCandidates.push(...((await db.prepare(`SELECT * FROM companion_canonical_players_preview WHERE league_id=? AND "${teamCol}" IS NULL LIMIT 30`).bind(leagueId).all()).results||[]).map(summarizeRow))}catch{}
  }
  try{samples=((await db.prepare(`SELECT * FROM companion_canonical_players_preview WHERE league_id=? LIMIT 40`).bind(leagueId).all()).results||[]).map(summarizeRow)}catch{}
  return{available:true,rowCount,columns:columns.map(c=>({name:c.name,type:c.type,pk:c.pk})),detectedColumns:{teamCol,runCol,playerCol,statusCol},teamDistribution:teamDistribution.map(r=>({teamValue:r.teamValue,count:Number(r.count||0)})),statusDistribution:statusDistribution.map(r=>({statusValue:r.statusValue,count:Number(r.count||0)})),runCounts:runCounts.map(r=>({runId:r.runId,count:Number(r.count||0)})),freeAgentCandidateCount:freeAgentCandidates.length,freeAgentCandidates:freeAgentCandidates.slice(0,50),samples};
}
async function inspectRouteCaptures(db,leagueId){
  const table='companion_route_captures',columns=await safeTableColumns(db,table);
  if(!columns.length)return{available:false};
  const routeCol=findColumn(columns,[/^route$/i,/route.*name/i,/path/i,/endpoint/i,/resource/i]);
  const typeCol=findColumn(columns,[/dataset.*type/i,/export.*type/i,/category/i,/kind/i,/type/i]);
  const seasonCol=findColumn(columns,[/^season$/i,/season.*year/i]);
  const weekCol=findColumn(columns,[/^week$/i,/week.*index/i]);
  let rowCount=0,routeDistribution=[],typeDistribution=[],seasonWeek=[],samples=[];
  try{rowCount=Number((await db.prepare(`SELECT COUNT(*) count FROM companion_route_captures WHERE league_id=?`).bind(leagueId).first())?.count||0)}catch{}
  if(routeCol){try{routeDistribution=(await db.prepare(`SELECT "${routeCol}" routeValue,COUNT(*) count FROM companion_route_captures WHERE league_id=? GROUP BY "${routeCol}" ORDER BY count DESC LIMIT 200`).bind(leagueId).all()).results||[]}catch{}}
  if(typeCol){try{typeDistribution=(await db.prepare(`SELECT "${typeCol}" typeValue,COUNT(*) count FROM companion_route_captures WHERE league_id=? GROUP BY "${typeCol}" ORDER BY count DESC LIMIT 100`).bind(leagueId).all()).results||[]}catch{}}
  if(seasonCol||weekCol){
    const se=seasonCol?`"${seasonCol}"`:'NULL',we=weekCol?`"${weekCol}"`:'NULL';
    try{seasonWeek=(await db.prepare(`SELECT ${se} seasonValue,${we} weekValue,COUNT(*) count FROM companion_route_captures WHERE league_id=? GROUP BY ${se},${we} ORDER BY seasonValue,weekValue`).bind(leagueId).all()).results||[]}catch{}
  }
  try{samples=((await db.prepare(`SELECT * FROM companion_route_captures WHERE league_id=? LIMIT 60`).bind(leagueId).all()).results||[]).map(summarizeRow)}catch{}
  return{available:true,rowCount,columns:columns.map(c=>({name:c.name,type:c.type,pk:c.pk})),detectedColumns:{routeCol,typeCol,seasonCol,weekCol},routeDistribution:routeDistribution.map(r=>({routeValue:r.routeValue,count:Number(r.count||0)})),typeDistribution:typeDistribution.map(r=>({typeValue:r.typeValue,count:Number(r.count||0)})),seasonWeek:seasonWeek.map(r=>({season:r.seasonValue==null?null:Number(r.seasonValue),week:r.weekValue==null?null:Number(r.weekValue),count:Number(r.count||0)})),samples};
}
function buildBackfillReadiness(ls,sr,pp,rc){
  const playerRoutes=(rc?.routeDistribution||[]).filter(r=>/player|roster|free.?agent/i.test(String(r.routeValue||'')));
  return{
    leagueSnapshotCount:Number(ls?.count||0),
    snapshotRecordSnapshotCount:(sr?.snapshotCounts||[]).length,
    playerPreviewRows:Number(pp?.rowCount||0),
    explicitFreeAgentCandidateRows:Number(pp?.freeAgentCandidateCount||0),
    playerOrRosterRouteCount:playerRoutes.reduce((sum,r)=>sum+Number(r.count||0),0),
    discoveredRouteWeeks:[...new Set((rc?.seasonWeek||[]).map(r=>r.week).filter(Number.isFinite))].sort((a,b)=>a-b),
    canCompareHistoricalLeagueSnapshots:Number(ls?.count||0)>1&&(sr?.snapshotCounts||[]).length>1,
    canInvestigateFreeAgents:Number(pp?.rowCount||0)>0,
    likelyReadyForIntegration:Boolean(Number(pp?.rowCount||0)>0&&(Number(ls?.count||0)>1||playerRoutes.length>0))
  };
}
function playerLikeObject(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const id=value.playerId??value.player_id??value.id??value.rosterId??value.roster_id;
  const name=value.displayName??value.fullName??value.playerName??value.player_name??
    [value.firstName??value.first_name,value.lastName??value.last_name].filter(Boolean).join(' ');
  const position=value.position??value.positionName??value.pos;
  const rating=value.overall??value.overallRating??value.ovrRating??value.playerBestOvr??value.playerOverall;
  return id!=null && Boolean(name) && (position!=null||rating!=null);
}

function collectPlayerObjects(value,rows=[],depth=0){
  if(value==null||depth>6)return rows;
  if(Array.isArray(value)){
    for(const child of value)collectPlayerObjects(child,rows,depth+1);
    return rows;
  }
  if(typeof value!=='object')return rows;
  if(playerLikeObject(value))rows.push(value);
  for(const child of Object.values(value)){
    if(child&&typeof child==='object')collectPlayerObjects(child,rows,depth+1);
  }
  return rows;
}

function playerIdentity(raw={}){
  const id=raw.playerId??raw.player_id??raw.id??raw.rosterId??raw.roster_id;
  const name=raw.displayName??raw.fullName??raw.playerName??raw.player_name??
    [raw.firstName??raw.first_name,raw.lastName??raw.last_name].filter(Boolean).join(' ');
  return{id:clean(id),name:clean(name)};
}

function playerTeamValue(raw={}){
  const value=raw.teamExternalId??raw.team_external_id??raw.teamId??raw.team_id??
    raw.rosterTeamId??raw.roster_team_id??raw.currentTeamId??raw.current_team_id??raw.team;
  return value==null?null:String(value);
}

function playerStatusValue(raw={}){
  const value=raw.rosterStatus??raw.roster_status??raw.status??raw.playerStatus??raw.player_status;
  return value==null?null:String(value);
}

function explicitFreeAgentValue(value){
  if(value==null)return false;
  const text=String(value).trim().toLowerCase();
  return ['0','-1','fa','free agent','free-agent','free_agent','unassigned','none','null','freeagent'].includes(text);
}

function routeImpliesFreeAgent(route=''){
  return /free.?agent|available.?player|unassigned/i.test(String(route||''));
}

async function knownTeamExternalIds(db,leagueId){
  const columns=await safeTableColumns(db,'companion_canonical_teams_preview');
  if(!columns.length)return new Set();
  const teamCol=findColumn(columns,[/^team_external_id$/i,/team.*external.*id/i,/^team_id$/i]);
  if(!teamCol)return new Set();
  try{
    const result=await db.prepare(`SELECT DISTINCT "${teamCol}" value FROM companion_canonical_teams_preview WHERE league_id=?`).bind(leagueId).all();
    return new Set((result.results||[]).map(row=>String(row.value)).filter(Boolean));
  }catch{return new Set()}
}

function normalizeFreeAgent(raw={},route='',captureId=''){
  const identity=playerIdentity(raw);
  if(!identity.id)return null;
  const overall=Number(raw.overall??raw.overallRating??raw.ovrRating??raw.playerBestOvr??raw.playerOverall);
  const age=Number(raw.age);
  return{
    playerId:identity.id,
    playerName:identity.name||'Unknown Player',
    position:clean(raw.position??raw.positionName??raw.pos),
    overall:Number.isFinite(overall)?overall:null,
    age:Number.isFinite(age)?age:null,
    devTrait:clean(raw.devTrait??raw.developmentTrait??raw.dev),
    sourceRoute:clean(route),
    sourceCaptureId:clean(captureId),
    raw
  };
}

async function candidateCaptureMeta(db,leagueId,offset=0,limit=3){
  const columns=await safeTableColumns(db,'companion_route_captures');
  if(!columns.length)return{rows:[],total:0,storageCol:null,routeCol:null,idCol:null};
  const routeCol=findColumn(columns,[/^route_path$/i,/^route$/i,/route.*name/i,/path/i]);
  const storageCol=findColumn(columns,[/storage.*key/i,/r2.*key/i,/object.*key/i,/payload.*key/i,/body.*key/i,/key/i]);
  const idCol=findColumn(columns,[/^id$/i,/capture.*id/i]);
  if(!routeCol)return{rows:[],total:0,storageCol,routeCol,idCol};

  let total=0,rows=[];
  try{
    total=Number((await db.prepare(`SELECT COUNT(*) count FROM companion_route_captures WHERE league_id=? AND LOWER("${routeCol}") LIKE '%player%' OR league_id=? AND LOWER("${routeCol}") LIKE '%roster%' OR league_id=? AND LOWER("${routeCol}") LIKE '%free%agent%'`)
      .bind(leagueId,leagueId,leagueId).first())?.count||0);
  }catch{}

  try{
    rows=(await db.prepare(`SELECT * FROM companion_route_captures
      WHERE league_id=? AND (
        LOWER("${routeCol}") LIKE '%player%' OR
        LOWER("${routeCol}") LIKE '%roster%' OR
        LOWER("${routeCol}") LIKE '%free%agent%'
      )
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?`).bind(leagueId,Math.max(1,Math.min(10,Number(limit)||3)),Math.max(0,Number(offset)||0)).all()).results||[];
  }catch{
    try{
      rows=(await db.prepare(`SELECT * FROM companion_route_captures
        WHERE league_id=? AND (
          LOWER("${routeCol}") LIKE '%player%' OR
          LOWER("${routeCol}") LIKE '%roster%' OR
          LOWER("${routeCol}") LIKE '%free%agent%'
        )
        LIMIT ? OFFSET ?`).bind(leagueId,Math.max(1,Math.min(10,Number(limit)||3)),Math.max(0,Number(offset)||0)).all()).results||[];
    }catch{}
  }
  return{rows,total,storageCol,routeCol,idCol};
}

async function readCapturePayload(env,row,storageCol){
  const key=storageCol?row?.[storageCol]:null;
  if(!key)return null;
  const bucket=env?.COMPANION_EXPORTS;
  if(!bucket||typeof bucket.get!=='function')return null;
  const object=await bucket.get(String(key));
  if(!object)return null;
  const text=await object.text();
  try{return JSON.parse(text)}catch{return null}
}

async function scanFreeAgentCaptureBatch(context,state,offset=0,limit=3){
  const meta=await candidateCaptureMeta(state.db,state.league.id,offset,limit);
  const knownTeams=await knownTeamExternalIds(state.db,state.league.id);
  let discovered=0,objectsRead=0;

  for(const row of meta.rows){
    const route=meta.routeCol?String(row?.[meta.routeCol]||''):'';
    const payload=await readCapturePayload(context.env,row,meta.storageCol);
    if(!payload)continue;
    objectsRead+=1;
    const playerObjects=collectPlayerObjects(payload,[]);
    const seen=new Set();

    for(const raw of playerObjects){
      const identity=playerIdentity(raw);
      if(!identity.id||seen.has(identity.id))continue;
      seen.add(identity.id);

      const teamValue=playerTeamValue(raw);
      const status=playerStatusValue(raw);
      const explicitStatus=explicitFreeAgentValue(status)||/free.?agent|unassigned/i.test(String(status||''));
      const explicitTeam=explicitFreeAgentValue(teamValue);
      const unknownTeam=teamValue!=null && !explicitTeam && knownTeams.size>0 && !knownTeams.has(String(teamValue));
      const freeAgent=routeImpliesFreeAgent(route)||explicitStatus||explicitTeam||unknownTeam;
      if(!freeAgent)continue;

      const normalized=normalizeFreeAgent(raw,route,meta.idCol?row?.[meta.idCol]:'');
      if(!normalized)continue;

      await state.db.prepare(`INSERT INTO canonical_free_agents
        (league_id,player_id,player_name,position,overall,age,dev_trait,source_route,source_capture_id,raw_json,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(league_id,player_id) DO UPDATE SET
          player_name=excluded.player_name,
          position=COALESCE(excluded.position,canonical_free_agents.position),
          overall=COALESCE(excluded.overall,canonical_free_agents.overall),
          age=COALESCE(excluded.age,canonical_free_agents.age),
          dev_trait=COALESCE(excluded.dev_trait,canonical_free_agents.dev_trait),
          source_route=excluded.source_route,
          source_capture_id=excluded.source_capture_id,
          raw_json=excluded.raw_json,
          updated_at=CURRENT_TIMESTAMP`)
        .bind(
          state.league.id,normalized.playerId,normalized.playerName,normalized.position,
          normalized.overall,normalized.age,normalized.devTrait,normalized.sourceRoute,
          normalized.sourceCaptureId,JSON.stringify(normalized.raw)
        ).run();
      discovered+=1;
    }
  }

  const count=await state.db.prepare(`SELECT COUNT(*) count FROM canonical_free_agents WHERE league_id=?`).bind(state.league.id).first();
  return{
    totalCaptures:meta.total,
    processedCaptures:meta.rows.length,
    objectsRead,
    discoveredThisBatch:discovered,
    canonicalFreeAgents:Number(count?.count||0)
  };
}

async function integrationPlan(db,leagueId){
  const snapshots=await inspectLeagueSnapshots(db,leagueId);
  const capture=await candidateCaptureMeta(db,leagueId,0,1);
  const snapshotRows=snapshots?.rows||[];
  const results=[];
  for(const row of snapshotRows){
    const snapshotId=clean(row.id??row.snapshot_id??row.snapshotId);
    if(!snapshotId)continue;
    let recordCount=0;
    try{
      recordCount=Number((await db.prepare(`SELECT COUNT(*) count FROM league_snapshot_records WHERE league_id=? AND snapshot_id=?`).bind(leagueId,snapshotId).first())?.count||0);
    }catch{}
    results.push({
      snapshotId,
      season:Number(row.season??row.season_year??row.current_season??0)||null,
      week:Number(row.week??row.current_week??0)||null,
      createdAt:row.created_at??row.createdAt??row.activated_at??null,
      recordCount
    });
  }
  return{snapshots:results,freeAgentCaptureCount:capture.total};
}

function recordJsonCandidates(row={}){
  const preferred=['record_json','payload_json','data_json','body_json','json','record','payload','data','body','value'];
  const values=[];
  preferred.forEach(key=>{if(row[key]!=null)values.push(row[key])});
  Object.entries(row).forEach(([key,value])=>{
    if(values.includes(value))return;
    if(/json|payload|record|data|body|value/i.test(key)&&value!=null)values.push(value);
  });
  return values;
}

function historicalPlayersFromRecord(row={}){
  const found=[];
  if(playerLikeObject(row))found.push(row);
  for(const candidate of recordJsonCandidates(row)){
    if(candidate&&typeof candidate==='object')collectPlayerObjects(candidate,found);
    else if(typeof candidate==='string'){
      try{collectPlayerObjects(JSON.parse(candidate),found)}catch{}
    }
  }
  const unique=new Map();
  found.forEach(raw=>{
    const id=playerIdentity(raw).id;
    if(id&&!unique.has(id))unique.set(id,raw);
  });
  return[...unique.values()];
}

async function normalizeHistoricalSnapshotBatch(state,snapshotId,offset=0,limit=400){
  const safeLimit=Math.max(25,Math.min(500,Number(limit)||400));
  const safeOffset=Math.max(0,Number(offset)||0);
  let rows=[];
  try{
    rows=(await state.db.prepare(`SELECT * FROM league_snapshot_records
      WHERE league_id=? AND snapshot_id=? LIMIT ? OFFSET ?`)
      .bind(state.league.id,snapshotId,safeLimit,safeOffset).all()).results||[];
  }catch{}

  let states=0;
  for(const row of rows){
    const playerRows=historicalPlayersFromRecord(row);
    for(const raw of playerRows){
      const identity=playerIdentity(raw);
      if(!identity.id)continue;
      const team=playerTeamValue(raw);
      const status=playerStatusValue(raw);
      await state.db.prepare(`INSERT INTO canonical_historical_player_states
        (league_id,snapshot_id,player_id,player_name,team_id,roster_status,position,raw_json)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(league_id,snapshot_id,player_id) DO UPDATE SET
          player_name=excluded.player_name,
          team_id=excluded.team_id,
          roster_status=excluded.roster_status,
          position=excluded.position,
          raw_json=excluded.raw_json`)
        .bind(
          state.league.id,snapshotId,identity.id,identity.name,
          clean(team),clean(status),clean(raw.position??raw.positionName??raw.pos),
          JSON.stringify(raw)
        ).run();
      states+=1;
    }
  }

  const totalStates=await state.db.prepare(`SELECT COUNT(*) count FROM canonical_historical_player_states WHERE league_id=? AND snapshot_id=?`)
    .bind(state.league.id,snapshotId).first();

  return{
    processedRecords:rows.length,
    normalizedStates:states,
    totalSnapshotStates:Number(totalStates?.count||0)
  };
}

function historicalEventType(fromTeam,toTeam,fromStatus,toStatus){
  const fromFA=freeAgentTeam(fromTeam)||/free.?agent|unassigned/i.test(String(fromStatus||''));
  const toFA=freeAgentTeam(toTeam)||/free.?agent|unassigned/i.test(String(toStatus||''));
  if(fromTeam!==toTeam){
    if(fromFA&&!toFA)return'signing';
    if(!fromFA&&toFA)return'release';
    return'team-change';
  }
  if(String(fromStatus||'')!==String(toStatus||''))return'roster-status-change';
  return null;
}

async function finalizeHistoricalBackfill(state){
  const plan=await integrationPlan(state.db,state.league.id);
  const snapshots=[...(plan.snapshots||[])].sort((a,b)=>{
    const at=new Date(a.createdAt||0).getTime()||0,bt=new Date(b.createdAt||0).getTime()||0;
    return at-bt;
  });

  let evidenceCreated=0,canonicalTouched=new Set(),signings=0,releases=0,teamChanges=0,statusChanges=0;

  for(let index=1;index<snapshots.length;index++){
    const prev=snapshots[index-1],curr=snapshots[index];
    let changed=[];
    try{
      changed=(await state.db.prepare(`SELECT
          p.player_id playerId,
          p.player_name previousName,
          p.team_id fromTeam,
          p.roster_status fromStatus,
          c.player_name currentName,
          c.team_id toTeam,
          c.roster_status toStatus
        FROM canonical_historical_player_states p
        JOIN canonical_historical_player_states c
          ON c.league_id=p.league_id AND c.player_id=p.player_id
        WHERE p.league_id=? AND p.snapshot_id=? AND c.snapshot_id=?
          AND (
            COALESCE(p.team_id,'')<>COALESCE(c.team_id,'') OR
            COALESCE(p.roster_status,'')<>COALESCE(c.roster_status,'')
          )
        LIMIT 5000`)
        .bind(state.league.id,prev.snapshotId,curr.snapshotId).all()).results||[];
    }catch{}

    const grouped=new Map();
    for(const row of changed){
      const type=historicalEventType(row.fromTeam,row.toTeam,row.fromStatus,row.toStatus);
      if(!type)continue;
      if(type==='signing')signings++;
      else if(type==='release')releases++;
      else if(type==='team-change')teamChanges++;
      else statusChanges++;

      const pair=normalizedPair([row.fromTeam,row.toTeam]).join('|');
      const groupable=type==='team-change';
      const sourceKey=groupable
        ?`historical:${prev.snapshotId}:${curr.snapshotId}:team-change:${pair}`
        :`historical:${prev.snapshotId}:${curr.snapshotId}:${type}:${row.playerId}`;
      const current=grouped.get(sourceKey)||{
        sourceKey,
        sourceType:'snapshot-diff',
        eventType:type,
        teamIds:normalizedPair([row.fromTeam,row.toTeam]),
        playerIds:[],
        season:curr.season,
        week:curr.week,
        confidence:'inferred',
        moves:[]
      };
      current.playerIds.push(String(row.playerId));
      current.moves.push({
        playerId:String(row.playerId),
        playerName:row.currentName||row.previousName||'Unknown Player',
        fromTeamId:row.fromTeam||null,
        toTeamId:row.toTeam||null,
        fromStatus:row.fromStatus||null,
        toStatus:row.toStatus||null
      });
      grouped.set(sourceKey,current);
    }

    for(const rawEvent of grouped.values()){
      const event=normalizeIncomingEvent(rawEvent,'snapshot-diff');
      const result=await mergeEvidence(state.db,state.league.id,event,curr.snapshotId);
      evidenceCreated+=1;
      canonicalTouched.add(result.transactionId);
    }
  }

  const faCount=await state.db.prepare(`SELECT COUNT(*) count FROM canonical_free_agents WHERE league_id=?`).bind(state.league.id).first();
  const stateCount=await state.db.prepare(`SELECT COUNT(*) count FROM canonical_historical_player_states WHERE league_id=?`).bind(state.league.id).first();

  return{
    snapshotsCompared:Math.max(0,snapshots.length-1),
    historicalStates:Number(stateCount?.count||0),
    canonicalFreeAgents:Number(faCount?.count||0),
    evidenceCreated,
    canonicalTransactionsTouched:canonicalTouched.size,
    inferred:{signings,releases,teamChanges,statusChanges}
  };
}

function safeJsonParse(value){
  if(value==null)return null;
  if(typeof value==='object')return value;
  if(typeof value!=='string')return null;
  try{return JSON.parse(value)}catch{return null}
}

function shapeOfValue(value,depth=0){
  if(depth>3)return typeof value;
  if(Array.isArray(value)){
    return{
      type:'array',
      length:value.length,
      itemTypes:[...new Set(value.slice(0,10).map(item=>Array.isArray(item)?'array':item===null?'null':typeof item))],
      sampleItem:value.length?shapeOfValue(value[0],depth+1):null
    };
  }
  if(value&&typeof value==='object'){
    const entries=Object.entries(value).slice(0,40);
    return{
      type:'object',
      keys:entries.map(([key])=>key),
      fields:Object.fromEntries(entries.map(([key,val])=>[key,
        Array.isArray(val)?`array(${val.length})`:val===null?'null':typeof val
      ]))
    };
  }
  return{type:value===null?'null':typeof value,value:compactValue(value,300)};
}

function collectCollections(value,path='root',rows=[],depth=0){
  if(value==null||depth>6)return rows;
  if(Array.isArray(value)){
    if(value.length){
      const objectCount=value.slice(0,50).filter(item=>item&&typeof item==='object'&&!Array.isArray(item)).length;
      const playerLikeCount=value.slice(0,50).filter(playerLikeObject).length;
      rows.push({
        path,
        length:value.length,
        objectSampleCount:objectCount,
        playerLikeSampleCount:playerLikeCount,
        sampleShape:shapeOfValue(value[0],1)
      });
    }
    value.slice(0,20).forEach((child,index)=>{
      if(child&&typeof child==='object')collectCollections(child,`${path}[${index}]`,rows,depth+1);
    });
    return rows;
  }
  if(typeof value==='object'){
    for(const [key,child] of Object.entries(value)){
      if(child&&typeof child==='object')collectCollections(child,`${path}.${key}`,rows,depth+1);
    }
  }
  return rows;
}

function collectFreeAgentFieldEvidence(value,path='root',rows=[],depth=0){
  if(value==null||depth>6)return rows;
  if(Array.isArray(value)){
    value.slice(0,100).forEach((child,index)=>collectFreeAgentFieldEvidence(child,`${path}[${index}]`,rows,depth+1));
    return rows;
  }
  if(typeof value!=='object')return rows;

  if(playerLikeObject(value)){
    const identity=playerIdentity(value);
    const candidates=[
      ['teamExternalId',value.teamExternalId],
      ['team_external_id',value.team_external_id],
      ['teamId',value.teamId],
      ['team_id',value.team_id],
      ['rosterTeamId',value.rosterTeamId],
      ['roster_team_id',value.roster_team_id],
      ['currentTeamId',value.currentTeamId],
      ['current_team_id',value.current_team_id],
      ['rosterStatus',value.rosterStatus],
      ['roster_status',value.roster_status],
      ['status',value.status]
    ].filter(([,v])=>v!==undefined&&v!==null);

    const suspicious=candidates.filter(([key,v])=>{
      const text=String(v).trim().toLowerCase();
      return ['0','-1','fa','free agent','free-agent','free_agent','unassigned','none','null','freeagent'].includes(text)
        || /free.?agent|unassigned/i.test(text);
    });

    if(suspicious.length){
      rows.push({
        path,
        playerId:identity.id,
        playerName:identity.name,
        evidence:suspicious.map(([field,v])=>({field,value:compactValue(v,200)}))
      });
    }
  }

  for(const [key,child] of Object.entries(value)){
    if(child&&typeof child==='object')collectFreeAgentFieldEvidence(child,`${path}.${key}`,rows,depth+1);
  }
  return rows;
}

async function inspectSnapshotRecordDecoder(db,leagueId){
  const columns=await safeTableColumns(db,'league_snapshot_records');
  let rows=[];
  try{
    rows=(await db.prepare(`SELECT * FROM league_snapshot_records WHERE league_id=? LIMIT 10`).bind(leagueId).all()).results||[];
  }catch{}

  const samples=rows.map(row=>{
    const parsedFields={};
    for(const [key,value] of Object.entries(row)){
      const parsed=safeJsonParse(value);
      if(parsed&&typeof parsed==='object'){
        parsedFields[key]={
          shape:shapeOfValue(parsed),
          preview:compactValue(JSON.stringify(parsed),1800)
        };
      }
    }
    return{
      raw:Object.fromEntries(Object.entries(row).map(([k,v])=>[k,compactValue(v,1800)])),
      parsedFields
    };
  });

  const distributions={};
  for(const column of columns){
    const name=String(column.name);
    if(/type|kind|key|entity|dataset|route|path|name|category|source/i.test(name)){
      try{
        const result=await db.prepare(`SELECT "${name}" value,COUNT(*) count
          FROM league_snapshot_records
          WHERE league_id=?
          GROUP BY "${name}"
          ORDER BY count DESC
          LIMIT 100`).bind(leagueId).all();
        distributions[name]=(result.results||[]).map(row=>({value:compactValue(row.value,500),count:Number(row.count||0)}));
      }catch{}
    }
  }

  return{
    schema:columns.map(c=>({name:c.name,type:c.type,pk:c.pk,notnull:c.notnull})),
    samples,
    distributions
  };
}

async function inspectR2RoutePayloads(context,state){
  const meta=await candidateCaptureMeta(state.db,state.league.id,0,25);
  const sampleRows=[];
  const collectionSummary=[];
  const freeAgentEvidence=[];

  for(const row of meta.rows.slice(0,12)){
    const route=meta.routeCol?String(row?.[meta.routeCol]||''):'';
    const payload=await readCapturePayload(context.env,row,meta.storageCol);
    if(!payload)continue;

    const collections=collectCollections(payload,'root',[],0)
      .filter(item=>item.length>0)
      .sort((a,b)=>(b.playerLikeSampleCount-a.playerLikeSampleCount)||(b.length-a.length))
      .slice(0,30);

    const evidence=collectFreeAgentFieldEvidence(payload,'root',[],0).slice(0,50);

    sampleRows.push({
      route,
      captureId:meta.idCol?row?.[meta.idCol]:null,
      storageKey:meta.storageCol?row?.[meta.storageCol]:null,
      topLevelShape:shapeOfValue(payload),
      payloadPreview:compactValue(JSON.stringify(payload),2600),
      collections
    });

    collections.forEach(item=>collectionSummary.push({route,...item}));
    evidence.forEach(item=>freeAgentEvidence.push({route,...item}));
  }

  const dedupCollections=[];
  const seen=new Set();
  collectionSummary
    .sort((a,b)=>(b.playerLikeSampleCount-a.playerLikeSampleCount)||(b.length-a.length))
    .forEach(row=>{
      const key=`${row.route}|${row.path}`;
      if(seen.has(key))return;
      seen.add(key);
      dedupCollections.push(row);
    });

  return{
    routePayloadSamples:sampleRows,
    routeStructureSummary:{
      inspectedCaptures:sampleRows.length,
      candidateCaptureCount:meta.total,
      topCollections:dedupCollections.slice(0,100)
    },
    candidatePlayerCollections:dedupCollections.filter(row=>row.playerLikeSampleCount>0).slice(0,100),
    freeAgentFieldEvidence:freeAgentEvidence.slice(0,100)
  };
}

function isTeamRosterRoute(route=''){
  return /\/team\/[^/]+\/roster(?:$|[/?])/i.test(String(route||''));
}
function routeLooksPlayerish(route=''){
  return /player|roster|free|agent|available|pool|transaction|sign|waiver|franchise/i.test(String(route||''));
}
async function allRouteInventory(db,leagueId){
  const columns=await safeTableColumns(db,'companion_route_captures');
  const routeCol=findColumn(columns,[/^route_path$/i,/^route$/i,/route.*name/i,/path/i]);
  const storageCol=findColumn(columns,[/storage.*key/i,/r2.*key/i,/object.*key/i,/payload.*key/i,/body.*key/i,/key/i]);
  const idCol=findColumn(columns,[/^id$/i,/capture.*id/i]);
  if(!routeCol)return{routeCol:null,storageCol,idCol,routes:[]};
  let routes=[];
  try{
    const result=await db.prepare(`SELECT "${routeCol}" routeValue,COUNT(*) count FROM companion_route_captures WHERE league_id=? GROUP BY "${routeCol}" ORDER BY count DESC`).bind(leagueId).all();
    routes=(result.results||[]).map(row=>({route:String(row.routeValue||''),count:Number(row.count||0),teamRoster:isTeamRosterRoute(row.routeValue),playerish:routeLooksPlayerish(row.routeValue)}));
  }catch{}
  return{routeCol,storageCol,idCol,routes};
}
async function routeRowsByExactPath(db,leagueId,routeCol,route,limit=1){
  try{
    const result=await db.prepare(`SELECT * FROM companion_route_captures WHERE league_id=? AND "${routeCol}"=? ORDER BY created_at DESC LIMIT ?`).bind(leagueId,route,Math.max(1,Math.min(3,Number(limit)||1))).all();
    return result.results||[];
  }catch{
    try{
      const result=await db.prepare(`SELECT * FROM companion_route_captures WHERE league_id=? AND "${routeCol}"=? LIMIT ?`).bind(leagueId,route,Math.max(1,Math.min(3,Number(limit)||1))).all();
      return result.results||[];
    }catch{return[]}
  }
}
function summarizeCandidatePayload(payload,route=''){
  const collections=collectCollections(payload,'root',[],0).filter(r=>r.length>0).sort((a,b)=>(b.playerLikeSampleCount-a.playerLikeSampleCount)||(b.length-a.length)).slice(0,40);
  const evidence=collectFreeAgentFieldEvidence(payload,'root',[],0).slice(0,60);
  const playerObjects=collectPlayerObjects(payload,[]);
  const teams=new Map(),statuses=new Map();
  for(const player of playerObjects.slice(0,4000)){
    const team=playerTeamValue(player),status=playerStatusValue(player);
    if(team!==null)teams.set(String(team),(teams.get(String(team))||0)+1);
    if(status!==null)statuses.set(String(status),(statuses.get(String(status))||0)+1);
  }
  return{
    route,
    topLevelShape:shapeOfValue(payload),
    playerLikeObjectCount:playerObjects.length,
    collections,
    freeAgentEvidence:evidence,
    teamValueDistribution:[...teams.entries()].sort((a,b)=>b[1]-a[1]).slice(0,100).map(([value,count])=>({value,count})),
    statusValueDistribution:[...statuses.entries()].sort((a,b)=>b[1]-a[1]).slice(0,100).map(([value,count])=>({value,count})),
    payloadPreview:compactValue(JSON.stringify(payload),3000)
  };
}
async function discoverNonTeamRosterPayloads(context,state){
  const inventory=await allRouteInventory(state.db,state.league.id);
  const nonTeam=inventory.routes.filter(r=>!r.teamRoster);
  const prioritized=[...nonTeam.filter(r=>r.playerish),...nonTeam.filter(r=>!r.playerish)].slice(0,60);
  const candidatePayloads=[];
  for(const routeRow of prioritized){
    const rows=await routeRowsByExactPath(state.db,state.league.id,inventory.routeCol,routeRow.route,1);
    if(!rows.length)continue;
    const payload=await readCapturePayload(context.env,rows[0],inventory.storageCol);
    if(!payload)continue;
    const summary=summarizeCandidatePayload(payload,routeRow.route);
    if(summary.playerLikeObjectCount>0||summary.collections.some(c=>c.playerLikeSampleCount>0)||/free|agent|player|roster/i.test(routeRow.route))candidatePayloads.push(summary);
    if(candidatePayloads.length>=25)break;
  }
  const candidateLeaguePlayerRoutes=candidatePayloads.filter(r=>r.playerLikeObjectCount>0).sort((a,b)=>b.playerLikeObjectCount-a.playerLikeObjectCount).map(r=>({
    route:r.route,playerLikeObjectCount:r.playerLikeObjectCount,topCollection:r.collections[0]||null,
    freeAgentEvidenceCount:r.freeAgentEvidence.length,teamValueDistribution:r.teamValueDistribution.slice(0,20),statusValueDistribution:r.statusValueDistribution.slice(0,20)
  }));
  return{
    routeInventory:{distinctRoutes:inventory.routes.length,teamRosterRouteCount:inventory.routes.filter(r=>r.teamRoster).length,nonTeamRosterRouteCount:nonTeam.length,playerishNonTeamRouteCount:nonTeam.filter(r=>r.playerish).length},
    nonTeamRosterRoutes:nonTeam.slice(0,120),candidateLeaguePlayerRoutes,candidatePayloads
  };
}
function normalizedHistoricalPlayerFromData(data={},externalId=null){
  if(!data||typeof data!=='object')return null;
  const sourceRecord=safeJsonParse(data.source_record_json)||data;
  const identity=playerIdentity({...sourceRecord,id:data.external_id??externalId??sourceRecord.id,playerId:data.external_id??externalId??sourceRecord.playerId});
  if(!identity.id)return null;
  return{
    playerId:identity.id,
    playerName:clean(data.player_name??data.display_name??identity.name),
    teamId:clean(data.team_external_id??data.team_id??sourceRecord.teamExternalId??sourceRecord.team_external_id??sourceRecord.teamId??sourceRecord.team_id??sourceRecord.rosterTeamId),
    rosterStatus:clean(data.roster_status??data.status??sourceRecord.rosterStatus??sourceRecord.roster_status??sourceRecord.status),
    position:clean(data.position??sourceRecord.position??sourceRecord.positionName??sourceRecord.pos)
  };
}
async function historicalPlayerDomainSummary(db,leagueId){
  let domains=[];
  try{
    const result=await db.prepare(`SELECT domain,COUNT(*) count FROM league_snapshot_records WHERE league_id=? GROUP BY domain ORDER BY count DESC`).bind(leagueId).all();
    domains=result.results||[];
  }catch{}
  const playerDomains=domains.filter(r=>/player|roster/i.test(String(r.domain||'')));
  const samples=[],snapshotCounts=[];
  for(const d of playerDomains){
    try{
      const result=await db.prepare(`SELECT snapshot_id,external_id,data_json,created_at FROM league_snapshot_records WHERE league_id=? AND domain=? LIMIT 20`).bind(leagueId,String(d.domain)).all();
      for(const row of result.results||[]){
        const parsed=safeJsonParse(row.data_json);
        samples.push({domain:d.domain,snapshotId:row.snapshot_id,externalId:row.external_id,createdAt:row.created_at,dataShape:shapeOfValue(parsed),dataPreview:compactValue(JSON.stringify(parsed),2200),parsed});
      }
    }catch{}
    try{
      const result=await db.prepare(`SELECT snapshot_id,COUNT(*) count FROM league_snapshot_records WHERE league_id=? AND domain=? GROUP BY snapshot_id`).bind(leagueId,String(d.domain)).all();
      for(const row of result.results||[])snapshotCounts.push({domain:d.domain,snapshotId:row.snapshot_id,count:Number(row.count||0)});
    }catch{}
  }
  return{domains:domains.map(r=>({domain:r.domain,count:Number(r.count||0)})),playerDomains:playerDomains.map(r=>({domain:r.domain,count:Number(r.count||0)})),samples,snapshotCounts};
}
async function historicalBackfillPreview(db,leagueId){
  const domainResult=await db.prepare(`SELECT DISTINCT domain FROM league_snapshot_records WHERE league_id=? AND (LOWER(domain) LIKE '%player%' OR LOWER(domain) LIKE '%roster%')`).bind(leagueId).all();
  const domains=(domainResult.results||[]).map(r=>String(r.domain||'')).filter(Boolean);
  const snapResult=await db.prepare(`SELECT id,created_at FROM league_snapshots WHERE league_id=? ORDER BY created_at ASC`).bind(leagueId).all();
  const snaps=(snapResult.results||[]).map(r=>({snapshotId:String(r.id),createdAt:r.created_at}));
  const statesBySnapshot=new Map(),normalizedCounts=[],sampleMoves=[];
  for(const snap of snaps){
    const states=new Map();
    for(const domain of domains){
      const result=await db.prepare(`SELECT external_id,data_json FROM league_snapshot_records WHERE league_id=? AND snapshot_id=? AND domain=?`).bind(leagueId,snap.snapshotId,domain).all();
      for(const row of result.results||[]){
        const normalized=normalizedHistoricalPlayerFromData(safeJsonParse(row.data_json),row.external_id);
        if(normalized)states.set(normalized.playerId,normalized);
      }
    }
    statesBySnapshot.set(snap.snapshotId,states); normalizedCounts.push({snapshotId:snap.snapshotId,count:states.size});
  }
  let totalMoves=0,signings=0,releases=0,teamChanges=0,statusChanges=0;
  for(let i=1;i<snaps.length;i++){
    const prev=statesBySnapshot.get(snaps[i-1].snapshotId)||new Map(),curr=statesBySnapshot.get(snaps[i].snapshotId)||new Map();
    for(const [playerId,oldRow] of prev){
      const next=curr.get(playerId); if(!next)continue;
      if(String(oldRow.teamId||'')===String(next.teamId||'')&&String(oldRow.rosterStatus||'')===String(next.rosterStatus||''))continue;
      const type=historicalEventType(oldRow.teamId,next.teamId,oldRow.rosterStatus,next.rosterStatus); if(!type)continue;
      totalMoves++; if(type==='signing')signings++; else if(type==='release')releases++; else if(type==='team-change')teamChanges++; else statusChanges++;
      if(sampleMoves.length<50)sampleMoves.push({playerId,playerName:next.playerName||oldRow.playerName,fromSnapshot:snaps[i-1].snapshotId,toSnapshot:snaps[i].snapshotId,fromTeam:oldRow.teamId,toTeam:next.teamId,fromStatus:oldRow.rosterStatus,toStatus:next.rosterStatus,eventType:type});
    }
  }
  return{playerDomains:domains,normalizedCounts,snapshotsCompared:Math.max(0,snaps.length-1),totalMoves,inferred:{signings,releases,teamChanges,statusChanges},sampleMoves};
}

function captureRosterPlayer(raw={},routeTeamId=null){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const playerId=clean(raw.rosterId??raw.playerId??raw.playerID??raw.player_id??raw.assetId??raw.id);
  if(!playerId)return null;
  const first=clean(raw.firstName??raw.first_name),last=clean(raw.lastName??raw.last_name);
  const playerName=clean(raw.displayName??raw.fullName??raw.playerName??raw.name)||[first,last].filter(Boolean).join(' ')||'Unknown Player';
  const teamId=clean(raw.teamId??raw.teamID??raw.team_id??routeTeamId);
  const rosterStatus=raw.isOnPracticeSquad===true?'practice-squad':raw.isOnIR===true?'ir':clean(raw.rosterStatus??raw.status)||'active';
  return{playerId,playerName,teamId,rosterStatus,position:clean(raw.position??raw.pos),raw};
}

async function captureLifecyclePlan(db,leagueId){
  const result=await db.prepare(`SELECT discovery_session_id session_id,
      MIN(received_at) received_at,COUNT(DISTINCT route_path) team_route_count
    FROM companion_route_captures
    WHERE league_id=? AND route_path LIKE '%/team/%/roster'
      AND discovery_session_id IS NOT NULL AND discovery_session_id<>''
    GROUP BY discovery_session_id
    HAVING COUNT(DISTINCT route_path)>=32
    ORDER BY MIN(received_at) ASC`).bind(leagueId).all();
  const sessions=[];
  for(const row of result.results||[]){
    const stored=await db.prepare(`SELECT * FROM canonical_capture_lifecycle_sessions WHERE league_id=? AND session_id=?`)
      .bind(leagueId,row.session_id).first();
    sessions.push({
      sessionId:String(row.session_id),receivedAt:row.received_at,
      teamRouteCount:Number(row.team_route_count||0),
      processed:Boolean(stored?.status==='complete'),playerCount:Number(stored?.player_count||0),status:stored?.status||'pending'
    });
  }
  return{sessions,pendingSessions:sessions.filter(x=>!x.processed).length,completeSessions:sessions.filter(x=>x.processed).length};
}

async function processCaptureLifecycleSession(context,state,sessionId){
  const rows=(await state.db.prepare(`SELECT id,route_path,r2_object_key,received_at
    FROM companion_route_captures WHERE league_id=? AND discovery_session_id=?
      AND route_path LIKE '%/team/%/roster' ORDER BY received_at DESC`)
    .bind(state.league.id,sessionId).all()).results||[];
  const byRoute=new Map();
  for(const row of rows)if(!byRoute.has(String(row.route_path)))byRoute.set(String(row.route_path),row);
  const captures=[...byRoute.values()];
  if(captures.length<32)throw new Error(`Lifecycle session ${sessionId} is incomplete (${captures.length}/32 team rosters).`);

  await state.db.prepare(`DELETE FROM canonical_historical_player_states WHERE league_id=? AND snapshot_id=?`)
    .bind(state.league.id,sessionId).run();

  const players=new Map();
  const capturePayloads=await Promise.all(captures.map(async capture=>{
    try{
      const object=await context.env.COMPANION_EXPORTS?.get?.(capture.r2_object_key);
      if(!object)return null;
      const payload=JSON.parse(await object.text());
      return {capture,payload};
    }catch{return null}
  }));

  for(const item of capturePayloads){
    if(!item)continue;
    const {capture,payload}=item;
    const list=Array.isArray(payload?.rosterInfoList)?payload.rosterInfoList:[];
    const routeTeamId=String(capture.route_path||'').match(/\/team\/([^/]+)\/roster/i)?.[1]||null;
    for(const raw of list){
      const player=captureRosterPlayer(raw,routeTeamId);
      if(player)players.set(player.playerId,player);
    }
  }

  const statements=[...players.values()].map(player=>state.db.prepare(`INSERT OR REPLACE INTO canonical_historical_player_states
    (league_id,snapshot_id,player_id,player_name,team_id,roster_status,position,raw_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
    .bind(state.league.id,sessionId,player.playerId,player.playerName,player.teamId,player.rosterStatus,player.position,JSON.stringify(player.raw||{})));
  for(let i=0;i<statements.length;i+=75)await state.db.batch(statements.slice(i,i+75));

  const receivedAt=captures.map(r=>r.received_at).filter(Boolean).sort()[0]||now();
  await state.db.prepare(`INSERT INTO canonical_capture_lifecycle_sessions
    (league_id,session_id,received_at,team_route_count,player_count,status,processed_at,updated_at)
    VALUES (?,?,?,?,?,'complete',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(league_id,session_id) DO UPDATE SET received_at=excluded.received_at,
      team_route_count=excluded.team_route_count,player_count=excluded.player_count,status='complete',
      processed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`)
    .bind(state.league.id,sessionId,receivedAt,captures.length,players.size).run();
  return{sessionId,teamRouteCount:captures.length,playerCount:players.size,receivedAt};
}

async function captureLifecycleRows(db,leagueId,sessionId){
  const result=await db.prepare(`SELECT player_id,player_name,team_id,roster_status,position,raw_json
    FROM canonical_historical_player_states WHERE league_id=? AND snapshot_id=?`).bind(leagueId,sessionId).all();
  return result.results||[];
}

function lifecycleDiffEvents(previous=[],current=[],previousSession,currentSession,occurredAt=null){
  const oldMap=new Map(previous.map(row=>[String(row.player_id),row]));
  const newMap=new Map(current.map(row=>[String(row.player_id),row]));
  const events=[];
  const add=(type,playerId,oldRow,newRow)=>{
    const from=type==='signing'?'FA':clean(oldRow?.team_id);
    const to=type==='release'?'FA':clean(newRow?.team_id);
    events.push(normalizeIncomingEvent({
      sourceKey:`capture-lifecycle:${previousSession}:${currentSession}:${type}:${playerId}`,
      eventType:type,playerIds:[playerId],playerId,
      teamIds:normalizedPair([from,to]),fromTeamId:from,toTeamId:to,
      occurredAt,confidence:'capture-history',previousSnapshotId:previousSession,currentSnapshotId:currentSession,
      moves:[{playerId,playerName:clean(newRow?.player_name)||clean(oldRow?.player_name)||'Unknown Player',
        fromTeamId:from,toTeamId:to,oldStatus:clean(oldRow?.roster_status),newStatus:clean(newRow?.roster_status),eventType:type}]
    },'snapshot-diff'));
  };
  for(const [playerId,oldRow] of oldMap){
    const next=newMap.get(playerId);
    if(!next){add('release',playerId,oldRow,null);continue}
    const from=clean(oldRow.team_id),to=clean(next.team_id),oldStatus=clean(oldRow.roster_status),newStatus=clean(next.roster_status);
    if(from!==to)add('team-change',playerId,oldRow,next);
    else if(oldStatus!==newStatus)add('roster-status-change',playerId,oldRow,next);
  }
  for(const [playerId,next] of newMap){
    if(!oldMap.has(playerId))add('signing',playerId,null,next);
  }
  return events;
}

async function rebuildCaptureFreeAgents(db,leagueId,sessions){
  if(!sessions.length)return{currentFreeAgents:0,latestSessionId:null};
  const latest=sessions[sessions.length-1];
  await db.prepare(`DELETE FROM canonical_free_agents WHERE league_id=? AND source_route IN ('capture-lifecycle','forward-detection')`)
    .bind(leagueId).run();

  const absent=(await db.prepare(`SELECT h.player_id,h.player_name,h.position,h.raw_json,h.snapshot_id,s.received_at
    FROM canonical_historical_player_states h
    JOIN canonical_capture_lifecycle_sessions s ON s.league_id=h.league_id AND s.session_id=h.snapshot_id
    WHERE h.league_id=?
      AND NOT EXISTS (SELECT 1 FROM canonical_historical_player_states cur
        WHERE cur.league_id=h.league_id AND cur.snapshot_id=? AND cur.player_id=h.player_id)
      AND NOT EXISTS (SELECT 1 FROM canonical_historical_player_states newer
        JOIN canonical_capture_lifecycle_sessions ns ON ns.league_id=newer.league_id AND ns.session_id=newer.snapshot_id
        WHERE newer.league_id=h.league_id AND newer.player_id=h.player_id AND ns.received_at>s.received_at)
    ORDER BY h.player_name`).bind(leagueId,latest.session_id).all()).results||[];

  const statements=absent.map(row=>{
    const raw=parse(row.raw_json,{})||{};
    const meta=rawPlayerMeta(raw,row);
    return db.prepare(`INSERT INTO canonical_free_agents
      (league_id,player_id,player_name,position,overall,age,dev_trait,source_route,source_capture_id,raw_json,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(league_id,player_id) DO UPDATE SET player_name=excluded.player_name,position=excluded.position,
        overall=excluded.overall,age=excluded.age,dev_trait=excluded.dev_trait,source_route=excluded.source_route,
        source_capture_id=excluded.source_capture_id,raw_json=excluded.raw_json,updated_at=CURRENT_TIMESTAMP`)
      .bind(leagueId,row.player_id,row.player_name||meta.playerName,row.position||meta.position,meta.overall,meta.age,meta.devTrait,
        'capture-lifecycle',row.snapshot_id,JSON.stringify({...raw,teamId:'FA',rosterStatus:'free-agent',status:'free-agent',isFreeAgent:true}));
  });
  for(let i=0;i<statements.length;i+=100)await db.batch(statements.slice(i,i+100));
  const inserted=statements.length;
  return{currentFreeAgents:inserted,latestSessionId:latest.session_id};
}

async function finalizeCaptureLifecycle(db,leagueId,sessionIds=[]){
  const sessions=(await db.prepare(`SELECT * FROM canonical_capture_lifecycle_sessions
    WHERE league_id=? AND status='complete' ORDER BY received_at ASC,session_id ASC`).bind(leagueId).all()).results||[];
  const targets=new Set((Array.isArray(sessionIds)?sessionIds:[]).map(String).filter(Boolean));
  let eventCount=0,signings=0,releases=0,teamChanges=0,statusChanges=0,comparisons=0;
  for(let i=1;i<sessions.length;i++){
    if(targets.size&&!targets.has(String(sessions[i].session_id)))continue;
    comparisons++;
    const previous=await captureLifecycleRows(db,leagueId,sessions[i-1].session_id);
    const current=await captureLifecycleRows(db,leagueId,sessions[i].session_id);
    const events=lifecycleDiffEvents(previous,current,sessions[i-1].session_id,sessions[i].session_id,sessions[i].received_at);
    for(const event of events){
      await mergeEvidence(db,leagueId,event,sessions[i].session_id);
      eventCount++;
      if(event.eventType==='signing')signings++;
      else if(event.eventType==='release')releases++;
      else if(event.eventType==='team-change')teamChanges++;
      else if(event.eventType==='roster-status-change')statusChanges++;
    }
  }
  const freeAgents=await rebuildCaptureFreeAgents(db,leagueId,sessions);
  return{
    sessionsCompared:comparisons,
    historicalSessionsAvailable:sessions.length,
    incremental:targets.size>0,
    eventCount,signings,releases,teamChanges,statusChanges,freeAgents
  };
}

export async function onRequestPost(context){
  const state=await requestState(context);
  if(state.response)return state.response;

  let body={};
  try{body=await context.request.json()}catch{}
  const action=String(body.action||'sync').toLowerCase();

  if(action==='dedupe-test'){
    return json({ok:true,release:RELEASE,test:syntheticDedupeTest()});
  }

  if(action==='discovery'){
    const payload=await discoveryPayload(state.db,state.league.id,clean(body.activeSnapshotId));
    return json({ok:true,release:RELEASE,...payload});
  }

  if(action==='raw-discovery'){
    const payload=await discoveryPayload(state.db,state.league.id,clean(body.activeSnapshotId));
    const d1StorageInventory=await discoverD1Storage(state.db,state.league.id);
    const r2StorageInventory=await discoverR2Storage(context.env,state.league);
    const rawStorageDiscovery=rawStorageSummary(d1StorageInventory,r2StorageInventory);
    return json({ok:true,release:RELEASE,...payload,rawStorageDiscovery,d1StorageInventory,r2StorageInventory});
  }

  if(action==='deep-inspection'){
    const leagueSnapshots=await inspectLeagueSnapshots(state.db,state.league.id);
    const snapshotRecordInventory=await inspectSnapshotRecords(state.db,state.league.id);
    const playerPreviewAudit=await inspectPlayerPreview(state.db,state.league.id);
    const routeCaptureAudit=await inspectRouteCaptures(state.db,state.league.id);
    const historicalBackfillReadiness=buildBackfillReadiness(leagueSnapshots,snapshotRecordInventory,playerPreviewAudit,routeCaptureAudit);
    return json({ok:true,release:RELEASE,leagueSnapshots,snapshotRecordInventory,playerPreviewAudit,routeCaptureAudit,historicalBackfillReadiness});
  }

  if(action==='integration-plan'){
    return json({ok:true,release:RELEASE,...(await integrationPlan(state.db,state.league.id))});
  }

  if(action==='scan-free-agents'){
    return json({ok:true,release:RELEASE,...(await scanFreeAgentCaptureBatch(context,state,body.offset,body.limit))});
  }

  if(action==='normalize-historical-snapshot'){
    const snapshotId=clean(body.snapshotId);
    if(!snapshotId)return json({ok:false,error:'snapshotId is required.'},400);
    return json({ok:true,release:RELEASE,snapshotId,...(await normalizeHistoricalSnapshotBatch(state,snapshotId,body.offset,body.limit))});
  }

  if(action==='finalize-historical-backfill'){
    return json({ok:true,release:RELEASE,...(await finalizeHistoricalBackfill(state))});
  }

  if(action==='decoder-inspection'){
    const snapshot=await inspectSnapshotRecordDecoder(state.db,state.league.id);
    const routes=await inspectR2RoutePayloads(context,state);
    return json({
      ok:true,
      release:RELEASE,
      snapshotRecordSchema:snapshot.schema,
      snapshotRecordSamples:snapshot.samples,
      snapshotRecordDistributions:snapshot.distributions,
      ...routes
    });
  }

  if(action==='route-and-history-discovery'){
    const routeData=await discoverNonTeamRosterPayloads(context,state);
    const historical=await historicalPlayerDomainSummary(state.db,state.league.id);
    const backfillPreview=await historicalBackfillPreview(state.db,state.league.id);
    return json({
      ok:true,
      release:RELEASE,
      ...routeData,
      historicalPlayerDomains:{domains:historical.domains,playerDomains:historical.playerDomains},
      historicalPlayerSamples:historical.samples.slice(0,40),
      historicalSnapshotCounts:historical.snapshotCounts,
      backfillPreview
    });
  }

  if(action==='capture-lifecycle-plan'){
    return json({ok:true,release:RELEASE,...(await captureLifecyclePlan(state.db,state.league.id))});
  }

  if(action==='capture-lifecycle-session'){
    const sessionId=clean(body.sessionId);
    if(!sessionId)return json({ok:false,release:RELEASE,error:'sessionId is required.'},400);
    try{return json({ok:true,release:RELEASE,...(await processCaptureLifecycleSession(context,state,sessionId))})}
    catch(error){return json({ok:false,release:RELEASE,error:'Capture lifecycle session failed.',detail:error?.message||String(error)},500)}
  }

  if(action==='capture-lifecycle-finalize'){
    try{return json({ok:true,release:RELEASE,...(await finalizeCaptureLifecycle(state.db,state.league.id,body.sessionIds))})}
    catch(error){return json({ok:false,release:RELEASE,error:'Capture lifecycle finalization failed.',detail:error?.message||String(error)},500)}
  }

  if(action!=='sync')return json({ok:false,error:`Unsupported action: ${action}`},400);

  const snapshotId=clean(body.snapshotId);
  const roster=Array.isArray(body.roster)?body.roster:[];
  if(!snapshotId)return json({ok:false,error:'snapshotId is required.'},400);
  if(!roster.length)return json({ok:false,error:'roster is required.'},400);
  if(roster.length>5000)return json({ok:false,error:'roster exceeds the 5,000-player safety limit.'},400);

  const season=Number.isFinite(Number(body.season))?Number(body.season):null;
  const week=Number.isFinite(Number(body.week))?Number(body.week):null;

  const previous=await previousRosterSnapshot(state.db,state.league.id,snapshotId);
  const previousRows=previous?await rosterRows(state.db,state.league.id,previous.snapshot_id):[];

  const workflowEvents=(Array.isArray(body.workflowEvents)?body.workflowEvents:[])
    .map(row=>normalizeIncomingEvent(row,'franchisehq-workflow'));
  const explicitEvents=(Array.isArray(body.explicitEvents)?body.explicitEvents:[])
    .map(row=>normalizeIncomingEvent(row,'madden-explicit'));
  const diffEvents=previous
    ? buildDiffEvents(previousRows,roster,previous.snapshot_id,snapshotId,season,week)
      .map(row=>normalizeIncomingEvent(row,'snapshot-diff'))
    : [];
  const forwardMovements=await forwardMovementHistory(state.db,state.league.id);
  const forwardEvents=forwardMovements.map(forwardMovementEvent);

  // Source priority is deliberate:
  // 1) existing canonical source-key match is checked inside mergeEvidence
  // 2) approved Franchise HQ workflow establishes the durable trade identity
  // 3) explicit Madden evidence confirms execution
  // 4) snapshot diff fills gaps but does not independently relabel team-change as a trade
  const results=[];
  for(const event of workflowEvents){
    results.push({source:'workflow',...(await mergeEvidence(state.db,state.league.id,event,snapshotId))});
  }
  for(const event of explicitEvents){
    results.push({source:'madden-explicit',...(await mergeEvidence(state.db,state.league.id,event,snapshotId))});
  }
  for(const event of forwardEvents){
    results.push({source:'forward-history',...(await mergeEvidence(state.db,state.league.id,event,event.raw?.currentSnapshotId||snapshotId))});
  }
  for(const event of diffEvents){
    results.push({source:'snapshot-diff',...(await mergeEvidence(state.db,state.league.id,event,snapshotId))});
  }

  await storeRosterSnapshot(state.db,state.league.id,snapshotId,season,week,roster);
  const freeAgentLedger=await rebuildFreeAgentLedger(state.db,state.league.id,forwardMovements,roster);

  const touchedIds=uniq(results.map(row=>row.transactionId));
  const touched=[];
  for(const id of touchedIds){
    const row=await state.db.prepare(`SELECT * FROM canonical_transactions WHERE id=?`).bind(id).first();
    touched.push(publicTransaction(row,await evidenceForTransaction(state.db,id)));
  }

  return json({
    ok:true,
    release:RELEASE,
    invariant:'one real-world trade = one canonical transaction',
    snapshotId,
    previousSnapshotId:previous?.snapshot_id||null,
    baselineEstablished:!previous,
    input:{
      rosterPlayers:roster.length,
      workflowEvents:workflowEvents.length,
      explicitMaddenEvents:explicitEvents.length,
      forwardMovementEvents:forwardEvents.length,
      snapshotDiffEvents:diffEvents.length
    },
    freeAgents:freeAgentLedger,
    canonical:{
      touchedTransactions:touched.length,
      transactions:touched
    },
    dedupe:{
      evidenceProcessed:results.length,
      uniqueCanonicalTransactions:touchedIds.length,
      evidenceMerged:Math.max(0,results.length-touchedIds.length)
    }
  });
}
