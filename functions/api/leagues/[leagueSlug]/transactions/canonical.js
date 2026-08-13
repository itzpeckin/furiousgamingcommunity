import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE='5.9.10.1';
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
      ON canonical_roster_snapshot_players (league_id, player_id, snapshot_id)`
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

  for(const [playerId,oldRow] of oldMap){
    const next=newMap.get(playerId);
    if(!next)continue;
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

  // Group team-to-team movement by team pair per snapshot. This makes a two-player swap
  // one inferred movement event, but it remains "team-change" until workflow/Madden evidence
  // proves it is a trade.
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

export async function onRequestPost(context){
  const state=await requestState(context);
  if(state.response)return state.response;

  let body={};
  try{body=await context.request.json()}catch{}
  const action=String(body.action||'sync').toLowerCase();

  if(action==='dedupe-test'){
    return json({ok:true,release:RELEASE,test:syntheticDedupeTest()});
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
  for(const event of diffEvents){
    results.push({source:'snapshot-diff',...(await mergeEvidence(state.db,state.league.id,event,snapshotId))});
  }

  await storeRosterSnapshot(state.db,state.league.id,snapshotId,season,week,roster);

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
      snapshotDiffEvents:diffEvents.length
    },
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
