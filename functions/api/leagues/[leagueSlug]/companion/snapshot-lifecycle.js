import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';
const RELEASE='5.9.10.6.2c',DEFAULT_OWNER_ACCOUNT_ID='owner-tb';
const ownerAccountId=env=>String(env.PLATFORM_OWNER_ACCOUNT_ID||DEFAULT_OWNER_ACCOUNT_ID).trim();
async function requirePlatformOwner(context){const auth=await requireCommissioner(context);if(!auth.authorized)return auth;const presented=String(context.request.headers.get('x-franchisehq-platform-owner-account-id')||'').trim();if(!presented||presented!==ownerAccountId(context.env))return{authorized:false,response:json({ok:false,error:'Not found.'},404)};return auth;}
const parse=v=>{try{return JSON.parse(v||'null')}catch{return null}};
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
function publicSnapshot(s,activeId){if(!s)return null;return{snapshotId:s.id,status:s.status,validationStatus:s.validation_status||'not-run',validationScore:s.validation_score,errorCount:Number(s.validation_error_count||0),validationWarningCount:Number(s.validation_warning_count||0),validationReport:parse(s.validation_report_json)||null,seasonYear:s.season_year,weekIndex:s.week_index,counts:{teams:s.team_count,players:s.player_count,games:s.game_count,statistics:s.statistic_count,standings:s.standing_count},warningCount:s.warning_count,warnings:parse(s.warnings_json)||[],manifest:parse(s.manifest_json)||{},createdAt:s.created_at,validatedAt:s.validated_at,activatedAt:s.activated_at,archivedAt:s.archived_at,isActive:s.id===activeId};}
async function active(db,leagueId){return db.prepare(`SELECT * FROM league_active_snapshots WHERE league_id=?`).bind(leagueId).first();}
async function listSnapshots(db,leagueId){const a=await active(db,leagueId);const list=await rows(db,`SELECT * FROM league_snapshots WHERE league_id=? ORDER BY created_at DESC LIMIT 25`,leagueId);return{active:a,snapshots:list.map(s=>publicSnapshot(s,a?.snapshot_id||null))};}
function key(record,...names){for(const n of names)if(record?.[n]!==undefined&&record[n]!==null&&record[n]!=='')return String(record[n]);return null;}
async function validateSnapshot(db,leagueId,snapshot){const records=await rows(db,`SELECT domain,external_id,data_json FROM league_snapshot_records WHERE league_id=? AND snapshot_id=?`,leagueId,snapshot.id);const by={teams:[],players:[],games:[],statistics:[],standings:[]};for(const r of records){if(by[r.domain])by[r.domain].push(parse(r.data_json)||{});}const errors=[],warnings=[],domains={};
 for(const d of Object.keys(by))domains[d]={count:by[d].length,score:100,errors:[],warnings:[]};
 domains.snapshot={count:1,score:100,errors:[],warnings:[]};
 const err=(d,m)=>{errors.push(`${d}: ${m}`);domains[d].errors.push(m);};const warn=(d,m)=>{warnings.push(`${d}: ${m}`);domains[d].warnings.push(m);};
 if(by.teams.length!==32)err('teams',`Expected 32 teams; found ${by.teams.length}.`);
 if(!by.players.length)err('players','No player records exist.');
 if(!by.games.length)err('games','No game records exist.');
 if(!by.statistics.length)err('statistics','No statistic records exist.');
 if(by.standings.length!==32)err('standings',`Expected 32 standings records; found ${by.standings.length}.`);
 const teamIds=new Set(by.teams.map(x=>key(x,'external_id','teamId','team_id')).filter(Boolean));
 const playerIds=new Set(by.players.map(x=>key(x,'external_id','playerId','player_id')).filter(Boolean));
 let orphanPlayers=0;for(const p of by.players){const t=key(p,'team_external_id','teamId','team_id');if(t&&!teamIds.has(t))orphanPlayers++;}if(orphanPlayers)err('players',`${orphanPlayers} player(s) reference unknown teams.`);
 let invalidGames=0;for(const g of by.games){const h=key(g,'home_team_external_id','homeTeamId','home_team_id'),a=key(g,'away_team_external_id','awayTeamId','away_team_id');if((h&&!teamIds.has(h))||(a&&!teamIds.has(a)))invalidGames++;}if(invalidGames)err('games',`${invalidGames} game(s) reference unknown teams.`);
 let unresolvedStats=0;for(const s of by.statistics){const p=key(s,'player_external_id','playerId','player_id');if(p&&!playerIds.has(p))unresolvedStats++;}if(unresolvedStats)warn('statistics',`${unresolvedStats} statistic record(s) could not be matched to snapshot players.`);
 if(snapshot.warning_count)warn('snapshot',`${snapshot.warning_count} warning(s) were inherited from source mappers.`);
 for(const d of Object.keys(domains)){const issueWeight=domains[d].errors.length*25+domains[d].warnings.length*5;domains[d].score=Math.max(0,100-issueWeight);}
 const scores=Object.values(domains).map(x=>x.score);const score=scores.length?Math.round((scores.reduce((a,b)=>a+b,0)/scores.length)*10)/10:0;
 const status=errors.length?'failed':'ready';return{release:RELEASE,status,score,errorCount:errors.length,warningCount:warnings.length,errors,warnings,domains,validatedAt:new Date().toISOString()};}

async function ensureValidationSchema(db){
  const statements=[
    `CREATE TABLE IF NOT EXISTS snapshot_validation_jobs (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      snapshot_id TEXT NOT NULL,
      status TEXT NOT NULL,
      phase TEXT NOT NULL,
      phase_offset INTEGER NOT NULL DEFAULT 0,
      processed_count INTEGER NOT NULL DEFAULT 0,
      total_count INTEGER NOT NULL DEFAULT 0,
      context_json TEXT NOT NULL DEFAULT '{}',
      report_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (league_id, snapshot_id),
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS snapshot_validation_player_ids (
      job_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      PRIMARY KEY (job_id, player_id)
    )`
  ];
  for(const sql of statements)await db.prepare(sql).run();
}
function emptyValidationContext(counts={},snapshotWarningCount=0){
  const domains={};
  for(const d of ['teams','players','games','statistics','standings'])domains[d]={count:Number(counts[d]||0),score:100,errors:[],warnings:[]};
  domains.snapshot={count:1,score:100,errors:[],warnings:[]};
  const errors=[],warnings=[];
  const addError=(domain,message)=>{errors.push(`${domain}: ${message}`);domains[domain].errors.push(message);};
  const addWarning=(domain,message)=>{warnings.push(`${domain}: ${message}`);domains[domain].warnings.push(message);};
  if(Number(counts.teams||0)!==32)addError('teams',`Expected 32 teams; found ${Number(counts.teams||0)}.`);
  if(!Number(counts.players||0))addError('players','No player records exist.');
  if(!Number(counts.games||0))addError('games','No game records exist.');
  if(!Number(counts.statistics||0))addError('statistics','No statistic records exist.');
  if(Number(counts.standings||0)!==32)addError('standings',`Expected 32 standings records; found ${Number(counts.standings||0)}.`);
  if(Number(snapshotWarningCount||0))addWarning('snapshot',`${Number(snapshotWarningCount)} warning(s) were inherited from source mappers.`);
  return{counts,teamIds:[],errors,warnings,domains,orphanPlayers:0,invalidGames:0,unresolvedStats:0};
}
function pushValidationIssue(ctx,kind,domain,message){
  const key=kind==='error'?'errors':'warnings';
  const prefix=`${domain}: ${message}`;
  if(!ctx[key].includes(prefix))ctx[key].push(prefix);
  const bucket=ctx.domains?.[domain];
  if(bucket){
    const list=kind==='error'?bucket.errors:bucket.warnings;
    if(!list.includes(message))list.push(message);
  }
}
async function validationCounts(db,leagueId,snapshotId){
  const result=await db.prepare(`SELECT domain,COUNT(*) count FROM league_snapshot_records WHERE league_id=? AND snapshot_id=? GROUP BY domain`).bind(leagueId,snapshotId).all();
  const counts={teams:0,players:0,games:0,statistics:0,standings:0};
  for(const row of result.results||[])if(Object.prototype.hasOwnProperty.call(counts,row.domain))counts[row.domain]=Number(row.count||0);
  return counts;
}
async function startSnapshotValidation(db,leagueId,snapshot){
  await ensureValidationSchema(db);
  const counts=await validationCounts(db,leagueId,snapshot.id);
  const ctx=emptyValidationContext(counts,snapshot.warning_count);
  let job=await db.prepare(`SELECT * FROM snapshot_validation_jobs WHERE league_id=? AND snapshot_id=?`).bind(leagueId,snapshot.id).first();
  if(job?.status==='completed'){
    return{job,complete:true,report:parse(job.report_json)||null};
  }
  const jobId=job?.id||crypto.randomUUID();
  await db.prepare(`DELETE FROM snapshot_validation_player_ids WHERE job_id=?`).bind(jobId).run();
  await db.prepare(`INSERT INTO snapshot_validation_jobs
    (id,league_id,snapshot_id,status,phase,phase_offset,processed_count,total_count,context_json,report_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(league_id,snapshot_id) DO UPDATE SET
      status='running',phase='teams',phase_offset=0,processed_count=0,total_count=excluded.total_count,
      context_json=excluded.context_json,report_json=NULL,updated_at=CURRENT_TIMESTAMP`)
    .bind(
      jobId,
      leagueId,
      snapshot.id,
      'running',
      'teams',
      0,
      0,
      Object.values(counts).reduce((a,b)=>a+Number(b||0),0),
      JSON.stringify(ctx)
    ).run();
  job=await db.prepare(`SELECT * FROM snapshot_validation_jobs WHERE league_id=? AND snapshot_id=?`).bind(leagueId,snapshot.id).first();
  return{job,complete:false,report:null};
}
async function validationBatchRows(db,leagueId,snapshotId,domain,offset,limit){
  const result=await db.prepare(`SELECT external_id,data_json FROM league_snapshot_records
    WHERE league_id=? AND snapshot_id=? AND domain=?
    ORDER BY external_id LIMIT ? OFFSET ?`)
    .bind(leagueId,snapshotId,domain,limit,offset).all();
  return result.results||[];
}
async function storeValidationPlayerIds(db,jobId,ids=[]){
  const unique=[...new Set(ids.filter(Boolean).map(String))];
  const statements=unique.map(id=>db.prepare(`INSERT OR IGNORE INTO snapshot_validation_player_ids (job_id,player_id) VALUES (?,?)`).bind(jobId,id));
  for(let i=0;i<statements.length;i+=75)await db.batch(statements.slice(i,i+75));
}
async function knownValidationPlayerIds(db,jobId,ids=[]){
  const unique=[...new Set(ids.filter(Boolean).map(String))];
  if(!unique.length)return new Set();
  const found=new Set();
  for(let i=0;i<unique.length;i+=200){
    const batch=unique.slice(i,i+200);
    const marks=batch.map(()=>'?').join(',');
    const result=await db.prepare(`SELECT player_id FROM snapshot_validation_player_ids WHERE job_id=? AND player_id IN (${marks})`).bind(jobId,...batch).all();
    for(const row of result.results||[])found.add(String(row.player_id));
  }
  return found;
}
function validationProgress(job,ctx){
  const phaseTotals=ctx?.counts||{};
  const phase=job?.phase||'complete';
  const phaseTotal=Number(phaseTotals[phase]||0);
  return{
    jobId:job?.id||null,
    status:job?.status||null,
    phase,
    phaseOffset:Number(job?.phase_offset||0),
    phaseTotal,
    processedCount:Number(job?.processed_count||0),
    totalCount:Number(job?.total_count||0)
  };
}
function finalizeValidationReport(ctx){
  if(ctx.orphanPlayers>0)pushValidationIssue(ctx,'error','players',`${ctx.orphanPlayers} player(s) reference unknown teams.`);
  if(ctx.invalidGames>0)pushValidationIssue(ctx,'error','games',`${ctx.invalidGames} game(s) reference unknown teams.`);
  if(ctx.unresolvedStats>0)pushValidationIssue(ctx,'warning','statistics',`${ctx.unresolvedStats} statistic record(s) could not be matched to snapshot players.`);
  for(const d of Object.keys(ctx.domains||{})){
    const issueWeight=(ctx.domains[d].errors?.length||0)*25+(ctx.domains[d].warnings?.length||0)*5;
    ctx.domains[d].score=Math.max(0,100-issueWeight);
  }
  const scores=Object.values(ctx.domains||{}).map(x=>Number(x.score||0));
  const score=scores.length?Math.round((scores.reduce((a,b)=>a+b,0)/scores.length)*10)/10:0;
  return{
    release:RELEASE,
    status:ctx.errors.length?'failed':'ready',
    score,
    errorCount:ctx.errors.length,
    warningCount:ctx.warnings.length,
    errors:ctx.errors,
    warnings:ctx.warnings,
    domains:ctx.domains,
    validatedAt:new Date().toISOString(),
    execution:'batched'
  };
}
async function nextSnapshotValidation(db,leagueId,snapshot,limit=250){
  await ensureValidationSchema(db);
  const safeLimit=Math.max(50,Math.min(400,Number(limit)||250));
  let job=await db.prepare(`SELECT * FROM snapshot_validation_jobs WHERE league_id=? AND snapshot_id=?`).bind(leagueId,snapshot.id).first();
  if(!job)return startSnapshotValidation(db,leagueId,snapshot);
  if(job.status==='completed')return{job,complete:true,report:parse(job.report_json)||null};
  const ctx=parse(job.context_json)||emptyValidationContext(await validationCounts(db,leagueId,snapshot.id),snapshot.warning_count);
  let phase=String(job.phase||'teams'),offset=Number(job.phase_offset||0),processed=Number(job.processed_count||0);

  if(phase==='teams'){
    const batch=await validationBatchRows(db,leagueId,snapshot.id,'teams',offset,safeLimit);
    const teamIds=new Set(ctx.teamIds||[]);
    for(const row of batch){
      const data=parse(row.data_json)||{};
      const id=key(data,'external_id','teamId','team_id')||String(row.external_id||'');
      if(id)teamIds.add(String(id));
    }
    ctx.teamIds=[...teamIds];
    processed+=batch.length;
    offset+=batch.length;
    if(batch.length<safeLimit||offset>=Number(ctx.counts.teams||0)){phase='players';offset=0;}
  }else if(phase==='players'){
    const batch=await validationBatchRows(db,leagueId,snapshot.id,'players',offset,safeLimit);
    const teamIds=new Set(ctx.teamIds||[]);
    const playerIds=[];
    for(const row of batch){
      const data=parse(row.data_json)||{};
      const id=key(data,'external_id','playerId','player_id')||String(row.external_id||'');
      if(id)playerIds.push(String(id));
      const team=key(data,'team_external_id','teamId','team_id');
      if(team&&!teamIds.has(String(team)))ctx.orphanPlayers=Number(ctx.orphanPlayers||0)+1;
    }
    await storeValidationPlayerIds(db,job.id,playerIds);
    processed+=batch.length;offset+=batch.length;
    if(batch.length<safeLimit||offset>=Number(ctx.counts.players||0)){phase='games';offset=0;}
  }else if(phase==='games'){
    const batch=await validationBatchRows(db,leagueId,snapshot.id,'games',offset,safeLimit);
    const teamIds=new Set(ctx.teamIds||[]);
    for(const row of batch){
      const data=parse(row.data_json)||{};
      const home=key(data,'home_team_external_id','homeTeamId','home_team_id');
      const away=key(data,'away_team_external_id','awayTeamId','away_team_id');
      if((home&&!teamIds.has(String(home)))||(away&&!teamIds.has(String(away))))ctx.invalidGames=Number(ctx.invalidGames||0)+1;
    }
    processed+=batch.length;offset+=batch.length;
    if(batch.length<safeLimit||offset>=Number(ctx.counts.games||0)){phase='statistics';offset=0;}
  }else if(phase==='statistics'){
    const batch=await validationBatchRows(db,leagueId,snapshot.id,'statistics',offset,safeLimit);
    const ids=[];
    for(const row of batch){
      const data=parse(row.data_json)||{};
      const player=key(data,'player_external_id','playerId','player_id');
      if(player)ids.push(String(player));
    }
    const known=await knownValidationPlayerIds(db,job.id,ids);
    for(const id of ids)if(!known.has(id))ctx.unresolvedStats=Number(ctx.unresolvedStats||0)+1;
    processed+=batch.length;offset+=batch.length;
    if(batch.length<safeLimit||offset>=Number(ctx.counts.statistics||0)){phase='standings';offset=0;}
  }else if(phase==='standings'){
    const batch=await validationBatchRows(db,leagueId,snapshot.id,'standings',offset,safeLimit);
    processed+=batch.length;offset+=batch.length;
    if(batch.length<safeLimit||offset>=Number(ctx.counts.standings||0)){phase='finalize';offset=0;}
  }

  if(phase==='finalize'){
    const report=finalizeValidationReport(ctx);
    await db.prepare(`UPDATE league_snapshots SET status=?,validation_status=?,validation_score=?,validation_error_count=?,validation_warning_count=?,validation_report_json=?,validated_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(report.status==='ready'?'validated':'validation-failed',report.status,report.score,report.errorCount,report.warningCount,JSON.stringify(report),report.validatedAt,snapshot.id).run();
    await db.prepare(`UPDATE snapshot_validation_jobs SET status='completed',phase='complete',phase_offset=0,processed_count=?,context_json=?,report_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(processed,JSON.stringify(ctx),JSON.stringify(report),job.id).run();
    await db.prepare(`DELETE FROM snapshot_validation_player_ids WHERE job_id=?`).bind(job.id).run();
    job=await db.prepare(`SELECT * FROM snapshot_validation_jobs WHERE id=?`).bind(job.id).first();
    return{job,complete:true,report};
  }

  await db.prepare(`UPDATE snapshot_validation_jobs SET status='running',phase=?,phase_offset=?,processed_count=?,context_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(phase,offset,processed,JSON.stringify(ctx),job.id).run();
  job=await db.prepare(`SELECT * FROM snapshot_validation_jobs WHERE id=?`).bind(job.id).first();
  return{job,complete:false,report:null};
}
async function event(db,leagueId,snapshotId,type,actor,detail={}){await db.prepare(`INSERT INTO league_snapshot_lifecycle_events (id,league_id,snapshot_id,event_type,actor_id,detail_json) VALUES (?,?,?,?,?,?)`).bind(crypto.randomUUID(),leagueId,snapshotId,type,actor||null,JSON.stringify(detail)).run();}
async function ensureForwardSchema(db){
  const statements=[
    `CREATE TABLE IF NOT EXISTS forward_roster_movements (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      previous_snapshot_id TEXT NOT NULL,
      current_snapshot_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      player_name TEXT,
      previous_team_id TEXT,
      current_team_id TEXT,
      previous_roster_status TEXT,
      current_roster_status TEXT,
      position TEXT,
      detection_type TEXT NOT NULL,
      season INTEGER,
      week INTEGER,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (league_id, previous_snapshot_id, current_snapshot_id, player_id),
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_forward_roster_movements_pair
      ON forward_roster_movements (league_id, previous_snapshot_id, current_snapshot_id)`,
    `CREATE INDEX IF NOT EXISTS idx_forward_roster_movements_player
      ON forward_roster_movements (league_id, player_id, detected_at DESC)`,
    `CREATE TABLE IF NOT EXISTS forward_detection_runs (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      previous_snapshot_id TEXT,
      current_snapshot_id TEXT NOT NULL,
      status TEXT NOT NULL,
      previous_player_count INTEGER NOT NULL DEFAULT 0,
      current_player_count INTEGER NOT NULL DEFAULT 0,
      movement_count INTEGER NOT NULL DEFAULT 0,
      team_change_count INTEGER NOT NULL DEFAULT 0,
      roster_entry_count INTEGER NOT NULL DEFAULT 0,
      roster_exit_count INTEGER NOT NULL DEFAULT 0,
      status_change_count INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (league_id, current_snapshot_id),
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
    )`
  ];
  for(const sql of statements)await db.prepare(sql).run();
}

function canonicalPlayerState(row){
  const data=parse(row?.data_json)||{};
  const source=parse(data.source_record_json)||{};
  const id=key(data,'external_id','playerId','player_id')||key(source,'rosterId','playerId','player_id','id')||String(row?.external_id||'');
  if(!id)return null;
  const first=key(data,'first_name','firstName')||key(source,'firstName','first_name')||'';
  const last=key(data,'last_name','lastName')||key(source,'lastName','last_name')||'';
  const name=key(data,'display_name','displayName','player_name','playerName')||`${first} ${last}`.trim()||id;
  const team=key(data,'team_external_id','teamId','team_id')||key(source,'teamId','team_id','teamExternalId','team_external_id');
  const status=key(data,'roster_status','status')||key(source,'rosterStatus','roster_status','status');
  const position=key(data,'position')||key(source,'position','positionName','pos');
  return{
    playerId:String(id),
    playerName:name,
    teamId:team?String(team):null,
    rosterStatus:status?String(status):null,
    position:position?String(position):null
  };
}

async function snapshotPlayerStates(db,leagueId,snapshotId){
  const result=await db.prepare(`SELECT external_id,data_json
    FROM league_snapshot_records
    WHERE league_id=? AND snapshot_id=? AND domain='players'`)
    .bind(leagueId,snapshotId).all();
  const map=new Map();
  for(const row of result.results||[]){
    const state=canonicalPlayerState(row);
    if(state)map.set(state.playerId,state);
  }
  return map;
}

function movementType(previous,current){
  if(previous&&current){
    if(String(previous.teamId||'')!==String(current.teamId||''))return'team-change';
    if(String(previous.rosterStatus||'')!==String(current.rosterStatus||''))return'roster-status-change';
    return null;
  }
  if(previous&&!current)return'roster-exit';
  if(!previous&&current)return'roster-entry';
  return null;
}

async function detectForwardMovements(db,leagueId,previousSnapshot,currentSnapshot){
  await ensureForwardSchema(db);
  const currentId=String(currentSnapshot?.id||'');
  const previousId=previousSnapshot?.id?String(previousSnapshot.id):null;

  if(!previousId){
    await db.prepare(`INSERT OR REPLACE INTO forward_detection_runs
      (id,league_id,previous_snapshot_id,current_snapshot_id,status,current_player_count,note)
      VALUES (?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),leagueId,null,currentId,'baseline',
        Number(currentSnapshot?.player_count||0),
        'First active snapshot establishes the forward transaction baseline; no movement comparison is performed.')
      .run();
    return{
      status:'baseline',
      baselineEstablished:true,
      previousSnapshotId:null,
      currentSnapshotId:currentId,
      movementCount:0,
      teamChanges:0,
      rosterEntries:0,
      rosterExits:0,
      statusChanges:0
    };
  }

  const prior=await snapshotPlayerStates(db,leagueId,previousId);
  const current=await snapshotPlayerStates(db,leagueId,currentId);
  const ids=new Set([...prior.keys(),...current.keys()]);
  const movements=[];

  for(const playerId of ids){
    const before=prior.get(playerId)||null;
    const after=current.get(playerId)||null;
    const type=movementType(before,after);
    if(!type)continue;
    movements.push({
      playerId,
      playerName:after?.playerName||before?.playerName||playerId,
      previousTeamId:before?.teamId||null,
      currentTeamId:after?.teamId||null,
      previousRosterStatus:before?.rosterStatus||null,
      currentRosterStatus:after?.rosterStatus||null,
      position:after?.position||before?.position||null,
      detectionType:type
    });
  }

  const season=Number.isFinite(Number(currentSnapshot?.season_year))?Number(currentSnapshot.season_year):null;
  const week=Number.isFinite(Number(currentSnapshot?.week_index))?Number(currentSnapshot.week_index):null;

  const statements=movements.map(move=>db.prepare(`INSERT INTO forward_roster_movements
    (id,league_id,previous_snapshot_id,current_snapshot_id,player_id,player_name,
     previous_team_id,current_team_id,previous_roster_status,current_roster_status,
     position,detection_type,season,week,evidence_json,detected_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(league_id,previous_snapshot_id,current_snapshot_id,player_id)
    DO UPDATE SET
      player_name=excluded.player_name,
      previous_team_id=excluded.previous_team_id,
      current_team_id=excluded.current_team_id,
      previous_roster_status=excluded.previous_roster_status,
      current_roster_status=excluded.current_roster_status,
      position=excluded.position,
      detection_type=excluded.detection_type,
      season=excluded.season,
      week=excluded.week,
      evidence_json=excluded.evidence_json`)
    .bind(
      crypto.randomUUID(),leagueId,previousId,currentId,move.playerId,move.playerName,
      move.previousTeamId,move.currentTeamId,move.previousRosterStatus,move.currentRosterStatus,
      move.position,move.detectionType,season,week,
      JSON.stringify({
        source:'snapshot-diff',
        previousSnapshotId:previousId,
        currentSnapshotId:currentId,
        playerId:move.playerId,
        fromTeamId:move.previousTeamId,
        toTeamId:move.currentTeamId,
        previousRosterStatus:move.previousRosterStatus,
        currentRosterStatus:move.currentRosterStatus
      })
    ));

  for(let i=0;i<statements.length;i+=75){
    await db.batch(statements.slice(i,i+75));
  }

  const teamChanges=movements.filter(x=>x.detectionType==='team-change').length;
  const rosterEntries=movements.filter(x=>x.detectionType==='roster-entry').length;
  const rosterExits=movements.filter(x=>x.detectionType==='roster-exit').length;
  const statusChanges=movements.filter(x=>x.detectionType==='roster-status-change').length;

  await db.prepare(`INSERT INTO forward_detection_runs
    (id,league_id,previous_snapshot_id,current_snapshot_id,status,previous_player_count,current_player_count,
     movement_count,team_change_count,roster_entry_count,roster_exit_count,status_change_count,note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(league_id,current_snapshot_id)
    DO UPDATE SET
      previous_snapshot_id=excluded.previous_snapshot_id,
      status=excluded.status,
      previous_player_count=excluded.previous_player_count,
      current_player_count=excluded.current_player_count,
      movement_count=excluded.movement_count,
      team_change_count=excluded.team_change_count,
      roster_entry_count=excluded.roster_entry_count,
      roster_exit_count=excluded.roster_exit_count,
      status_change_count=excluded.status_change_count,
      note=excluded.note`)
    .bind(
      crypto.randomUUID(),leagueId,previousId,currentId,'completed',prior.size,current.size,
      movements.length,teamChanges,rosterEntries,rosterExits,statusChanges,
      'Forward movement evidence captured automatically on snapshot activation. Classification occurs in 5.9.10.6.3.'
    ).run();

  return{
    status:'completed',
    baselineEstablished:false,
    previousSnapshotId:previousId,
    currentSnapshotId:currentId,
    previousPlayerCount:prior.size,
    currentPlayerCount:current.size,
    movementCount:movements.length,
    teamChanges,
    rosterEntries,
    rosterExits,
    statusChanges,
    sample:movements.slice(0,25)
  };
}

async function contextData(context){const slug=normalizeLeagueSlug(context);if(!validLeagueSlug(slug))return{response:json({ok:false,error:'Invalid league slug.'},400)};const auth=await requirePlatformOwner(context);if(!auth.authorized)return{response:auth.response};const db=database(context.env),league=await resolveLeague(context.env,slug);if(!db||!league||auth.session.membership?.leagueId!==league.id)return{response:json({ok:false,error:'Not found.'},404)};return{db,league,auth};}
export async function onRequestGet(context){const c=await contextData(context);if(c.response)return c.response;await ensureForwardSchema(c.db);const data=await listSnapshots(c.db,c.league.id);const events=await rows(c.db,`SELECT * FROM league_snapshot_lifecycle_events WHERE league_id=? ORDER BY created_at DESC LIMIT 50`,c.league.id);return json({ok:true,release:RELEASE,activeSnapshotId:data.active?.snapshot_id||null,snapshots:data.snapshots,events:events.map(e=>({...e,detail:parse(e.detail_json)}))});}
export async function onRequestPost(context){const c=await contextData(context);if(c.response)return c.response;let body={};try{body=await context.request.json()}catch{}const action=String(body.action||'').trim(),snapshotId=String(body.snapshotId||'').trim();if(!['validate','validate-start','validate-next','activate','rollback'].includes(action)||!snapshotId)return json({ok:false,error:'A valid action and snapshotId are required.'},400);const snapshot=await c.db.prepare(`SELECT * FROM league_snapshots WHERE id=? AND league_id=?`).bind(snapshotId,c.league.id).first();if(!snapshot)return json({ok:false,error:'Snapshot not found.'},404);const actor=ownerAccountId(context.env);
 if(action==='validate'||action==='validate-start'){
   const result=await startSnapshotValidation(c.db,c.league.id,snapshot);
   if(result.complete&&result.report)await event(c.db,c.league.id,snapshot.id,'validated',actor,result.report);
   return json({ok:true,release:RELEASE,action:'validate-start',complete:Boolean(result.complete),validationJob:validationProgress(result.job,parse(result.job?.context_json)||{}),report:result.report,...await listSnapshots(c.db,c.league.id)});
 }
 if(action==='validate-next'){
   const result=await nextSnapshotValidation(c.db,c.league.id,snapshot,body.limit);
   if(result.complete&&result.report)await event(c.db,c.league.id,snapshot.id,'validated',actor,result.report);
   return json({ok:true,release:RELEASE,action:'validate-next',complete:Boolean(result.complete),validationJob:validationProgress(result.job,parse(result.job?.context_json)||{}),report:result.report,...await listSnapshots(c.db,c.league.id)});
 }
 if(snapshot.validation_status!=='ready'||Number(snapshot.validation_error_count||0)>0)return json({ok:false,error:'Snapshot must pass validation before activation.',validationStatus:snapshot.validation_status||'not-run'},422);
 const current=await active(c.db,c.league.id);if(current?.snapshot_id===snapshot.id)return json({ok:true,release:RELEASE,action,alreadyActive:true,...await listSnapshots(c.db,c.league.id)});
 if(current?.snapshot_id){await c.db.prepare(`UPDATE league_snapshots SET status='archived',archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(current.snapshot_id).run();}
 await c.db.prepare(`INSERT INTO league_active_snapshots (league_id,snapshot_id,activated_at,activated_by,previous_snapshot_id) VALUES (?,?,CURRENT_TIMESTAMP,?,?) ON CONFLICT(league_id) DO UPDATE SET snapshot_id=excluded.snapshot_id,activated_at=CURRENT_TIMESTAMP,activated_by=excluded.activated_by,previous_snapshot_id=league_active_snapshots.snapshot_id`).bind(c.league.id,snapshot.id,actor,current?.snapshot_id||null).run();
 await c.db.prepare(`UPDATE league_snapshots SET status='active',activated_at=CURRENT_TIMESTAMP,archived_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(snapshot.id).run();
 const forwardDetection=action==='activate'
   ?{status:'pending-separate-stage',previousSnapshotId:current?.snapshot_id||null,currentSnapshotId:snapshot.id,note:'5.9.10.6.2c runs forward transaction detection in bounded requests after activation.'}
   :{status:'skipped',reason:'rollback-activation',previousSnapshotId:current?.snapshot_id||null,currentSnapshotId:snapshot.id};
 await event(c.db,c.league.id,snapshot.id,action==='rollback'?'rollback-activated':'activated',actor,{previousSnapshotId:current?.snapshot_id||null,forwardDetection});
 return json({ok:true,release:RELEASE,action,activeSnapshotChanged:true,activationPerformed:true,forwardDetection,...await listSnapshots(c.db,c.league.id)});
}
