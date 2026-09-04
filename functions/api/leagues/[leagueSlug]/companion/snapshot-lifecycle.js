/* FHQ_BUILD: 5.9.11.0 */
import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';
import { requireDatabaseSchema } from '../../../../_lib/database-schema.js';
import { reconcileTradeRosterOverlays } from '../../../../_lib/trade-reconciliation.js';
const RELEASE='7.4.0.5',DEFAULT_OWNER_ACCOUNT_ID='owner-tb';
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
 if(!by.statistics.length)warn('statistics','No statistic records exist yet; snapshot activation is allowed when statistics mapping completed without failed routes.');
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

async function ensureValidationSchema(db){return requireDatabaseSchema(db)}
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
  if(!Number(counts.statistics||0))addWarning('statistics','No statistic records exist yet; snapshot activation is allowed when statistics mapping completed without failed routes.');
  if(Number(counts.standings||0)!==32)addError('standings',`Expected 32 standings records; found ${Number(counts.standings||0)}.`);
  if(Number(snapshotWarningCount||0))addWarning('snapshot',`${Number(snapshotWarningCount)} warning(s) were inherited from source mappers.`);
  return{counts,teamIds:[],phaseCursor:null,errors,warnings,domains,orphanPlayers:0,invalidGames:0,unresolvedStats:0};
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

async function statisticsDeltaValidationPlan(db,leagueId,snapshot){
  const manifest=parse(snapshot?.manifest_json)||{};
  const delta=manifest?.deltaStatistics||{};
  const priorSnapshotId=String(delta?.priorSnapshotId||'').trim();
  const statisticsRunId=String(manifest?.sources?.statisticsMappingRunId||'').trim();

  if(!delta?.enabled||!priorSnapshotId||!statisticsRunId){
    return{
      mode:'full',
      priorSnapshotId:priorSnapshotId||null,
      priorSnapshotValidated:false,
      changedRoutes:[],
      statisticsRowsToValidate:Number(snapshot?.statistic_count||0),
      trustedStatisticsRows:0,
      reason:'delta-metadata-unavailable'
    };
  }

  const prior=await db.prepare(`SELECT validation_status,validation_error_count,statistic_count
    FROM league_snapshots WHERE league_id=? AND id=?`)
    .bind(leagueId,priorSnapshotId).first();

  const priorReady=String(prior?.validation_status||'')==='ready'&&Number(prior?.validation_error_count||0)===0;
  if(!priorReady){
    return{
      mode:'full',
      priorSnapshotId,
      priorSnapshotValidated:false,
      changedRoutes:[],
      statisticsRowsToValidate:Number(snapshot?.statistic_count||0),
      trustedStatisticsRows:0,
      reason:'prior-snapshot-not-validated'
    };
  }

  const routeRows=await db.prepare(`SELECT DISTINCT route_path
    FROM companion_statistics_mapping_batches
    WHERE league_id=? AND mapping_run_id=? AND status='complete'
    ORDER BY route_path`)
    .bind(leagueId,statisticsRunId).all();
  const changedRoutes=(routeRows.results||[]).map(row=>String(row.route_path||'')).filter(Boolean);

  let deltaCount=0;
  for(const route of changedRoutes){
    const row=await db.prepare(`SELECT COUNT(*) c FROM league_snapshot_records
      WHERE league_id=? AND snapshot_id=? AND domain='statistics'
        AND json_extract(data_json,'$.route')=?`)
      .bind(leagueId,snapshot.id,route).first();
    deltaCount+=Number(row?.c||0);
  }

  const totalStats=Number(snapshot?.statistic_count||0);
  return{
    mode:'delta',
    priorSnapshotId,
    priorSnapshotValidated:true,
    changedRoutes,
    statisticsRowsToValidate:deltaCount,
    trustedStatisticsRows:Math.max(0,totalStats-deltaCount),
    reason:changedRoutes.length?'validate-new-or-changed-statistics-only':'all-statistics-carried-forward-unchanged'
  };
}

async function startSnapshotValidation(db,leagueId,snapshot){
  await ensureValidationSchema(db);
  const counts=await validationCounts(db,leagueId,snapshot.id);
  const ctx=emptyValidationContext(counts,snapshot.warning_count);
  const plan=await statisticsDeltaValidationPlan(db,leagueId,snapshot);
  ctx.validationPlan=plan;

  const total=
    Number(counts.teams||0)+
    Number(counts.players||0)+
    Number(counts.games||0)+
    Number(counts.standings||0)+
    Number(plan.statisticsRowsToValidate||0);

  let job=await db.prepare(`SELECT * FROM snapshot_validation_jobs WHERE league_id=? AND snapshot_id=?`)
    .bind(leagueId,snapshot.id).first();

  if(job?.status==='completed'){
    return{job,complete:true,report:parse(job.report_json)||null};
  }

  if(job){
    await db.prepare(`UPDATE snapshot_validation_jobs
      SET status='running',phase='teams',phase_offset=0,processed_count=0,total_count=?,
          context_json=?,report_json=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE id=?`)
      .bind(total,JSON.stringify(ctx),job.id).run();
  }else{
    const jobId=crypto.randomUUID();
    await db.prepare(`INSERT INTO snapshot_validation_jobs
      (id,league_id,snapshot_id,status,phase,phase_offset,processed_count,total_count,context_json,report_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
      .bind(jobId,leagueId,snapshot.id,'running','teams',0,0,total,JSON.stringify(ctx)).run();
  }

  job=await db.prepare(`SELECT * FROM snapshot_validation_jobs WHERE league_id=? AND snapshot_id=?`)
    .bind(leagueId,snapshot.id).first();

  if(!job)throw new Error('Validation job could not be created.');
  return{job,complete:false,report:null};
}
async function validationBatchRows(db,leagueId,snapshotId,domain,cursor,limit){
  const safeDomain=String(domain||'');
  let select='external_id';
  if(safeDomain==='players'){
    select=`external_id,
      json_extract(data_json,'$.team_external_id') AS team_external_id,
      json_extract(data_json,'$.teamId') AS team_id`;
  }else if(safeDomain==='games'){
    select=`external_id,
      json_extract(data_json,'$.home_team_external_id') AS home_team_external_id,
      json_extract(data_json,'$.homeTeamId') AS home_team_id,
      json_extract(data_json,'$.away_team_external_id') AS away_team_external_id,
      json_extract(data_json,'$.awayTeamId') AS away_team_id`;
  }else if(safeDomain==='statistics'){
    select=`external_id,
      json_extract(data_json,'$.player_external_id') AS player_external_id,
      json_extract(data_json,'$.playerId') AS player_id`;
  }

  if(cursor){
    const result=await db.prepare(`SELECT ${select}
      FROM league_snapshot_records
      WHERE league_id=? AND snapshot_id=? AND domain=? AND external_id>?
      ORDER BY external_id
      LIMIT ?`)
      .bind(leagueId,snapshotId,safeDomain,String(cursor),limit).all();
    return result.results||[];
  }

  const result=await db.prepare(`SELECT ${select}
    FROM league_snapshot_records
    WHERE league_id=? AND snapshot_id=? AND domain=?
    ORDER BY external_id
    LIMIT ?`)
    .bind(leagueId,snapshotId,safeDomain,limit).all();
  return result.results||[];
}

async function validationDeltaStatisticRows(db,leagueId,snapshotId,routes,cursor,limit){
  const unique=[...new Set((routes||[]).filter(Boolean).map(String))];
  if(!unique.length)return[];
  const marks=unique.map(()=>'?').join(',');
  const args=[leagueId,snapshotId,...unique];
  let sql=`SELECT external_id,
      json_extract(data_json,'$.player_external_id') AS player_external_id,
      json_extract(data_json,'$.playerId') AS player_id
    FROM league_snapshot_records
    WHERE league_id=? AND snapshot_id=? AND domain='statistics'
      AND json_extract(data_json,'$.route') IN (${marks})`;
  if(cursor){
    sql+=` AND external_id>?`;
    args.push(String(cursor));
  }
  sql+=` ORDER BY external_id LIMIT ?`;
  args.push(limit);
  const result=await db.prepare(sql).bind(...args).all();
  return result.results||[];
}

async function existingSnapshotPlayerIds(db,leagueId,snapshotId,ids=[]){
  const unique=[...new Set(ids.filter(Boolean).map(String))];
  if(!unique.length)return new Set();
  const found=new Set();
  // Query against the league_snapshot_records PK (snapshot_id, domain, external_id)
  // instead of staging thousands of player IDs into a temporary D1 table.
  for(let i=0;i<unique.length;i+=75){
    const batch=unique.slice(i,i+75);
    const marks=batch.map(()=>'?').join(',');
    const result=await db.prepare(`SELECT external_id
      FROM league_snapshot_records
      WHERE league_id=? AND snapshot_id=? AND domain='players'
        AND external_id IN (${marks})`)
      .bind(leagueId,snapshotId,...batch).all();
    for(const row of result.results||[])found.add(String(row.external_id));
  }
  return found;
}
function validationProgress(job,ctx){
  const phaseTotals=ctx?.counts||{};
  const phase=job?.phase||'complete';
  const phaseTotal=phase==='statistics'
    ? Number(ctx?.validationPlan?.statisticsRowsToValidate??phaseTotals.statistics??0)
    : Number(phaseTotals[phase]||0);
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
    execution:ctx?.validationPlan?.mode==='delta'?'delta-batched':'batched',
    validationPlan:ctx?.validationPlan||{mode:'full'}
  };
}
async function nextSnapshotValidation(db,leagueId,snapshot,limit=100){
  await ensureValidationSchema(db);
  const safeLimit=Math.max(25,Math.min(500,Number(limit)||250));
  let job=await db.prepare(`SELECT * FROM snapshot_validation_jobs WHERE league_id=? AND snapshot_id=?`).bind(leagueId,snapshot.id).first();
  if(!job)return startSnapshotValidation(db,leagueId,snapshot);
  if(job.status==='completed')return{job,complete:true,report:parse(job.report_json)||null};

  const ctx=parse(job.context_json)||emptyValidationContext(await validationCounts(db,leagueId,snapshot.id),snapshot.warning_count);
  let phase=String(job.phase||'teams');
  let offset=Number(job.phase_offset||0);
  let processed=Number(job.processed_count||0);
  let cursor=ctx.phaseCursor||null;

  const advancePhase=next=>{
    phase=next;
    offset=0;
    cursor=null;
    ctx.phaseCursor=null;
  };

  if(phase==='teams'){
    const batch=await validationBatchRows(db,leagueId,snapshot.id,'teams',cursor,safeLimit);
    const teamIds=new Set(ctx.teamIds||[]);
    for(const row of batch){
      const id=String(row.external_id||'').trim();
      if(id)teamIds.add(id);
    }
    ctx.teamIds=[...teamIds];
    processed+=batch.length;
    offset+=batch.length;
    if(batch.length)cursor=String(batch[batch.length-1].external_id||'');
    ctx.phaseCursor=cursor;
    if(batch.length<safeLimit||offset>=Number(ctx.counts.teams||0))advancePhase('players');

  }else if(phase==='players'){
    const batch=await validationBatchRows(db,leagueId,snapshot.id,'players',cursor,safeLimit);
    const teamIds=new Set(ctx.teamIds||[]);
    for(const row of batch){
      const team=row.team_external_id??row.team_id;
      if(team!=null&&team!==''&&!teamIds.has(String(team)))ctx.orphanPlayers=Number(ctx.orphanPlayers||0)+1;
    }
    processed+=batch.length;
    offset+=batch.length;
    if(batch.length)cursor=String(batch[batch.length-1].external_id||'');
    ctx.phaseCursor=cursor;
    if(batch.length<safeLimit||offset>=Number(ctx.counts.players||0))advancePhase('games');

  }else if(phase==='games'){
    const batch=await validationBatchRows(db,leagueId,snapshot.id,'games',cursor,safeLimit);
    const teamIds=new Set(ctx.teamIds||[]);
    for(const row of batch){
      const home=row.home_team_external_id??row.home_team_id;
      const away=row.away_team_external_id??row.away_team_id;
      if((home!=null&&home!==''&&!teamIds.has(String(home)))||(away!=null&&away!==''&&!teamIds.has(String(away))))ctx.invalidGames=Number(ctx.invalidGames||0)+1;
    }
    processed+=batch.length;
    offset+=batch.length;
    if(batch.length)cursor=String(batch[batch.length-1].external_id||'');
    ctx.phaseCursor=cursor;
    if(batch.length<safeLimit||offset>=Number(ctx.counts.games||0))advancePhase('statistics');

  }else if(phase==='statistics'){
    const plan=ctx.validationPlan||{mode:'full',statisticsRowsToValidate:Number(ctx.counts.statistics||0),changedRoutes:[]};
    const target=Number(plan.statisticsRowsToValidate||0);

    if(plan.mode==='delta'&&target===0){
      advancePhase('standings');
    }else{
      const batch=plan.mode==='delta'
        ? await validationDeltaStatisticRows(db,leagueId,snapshot.id,plan.changedRoutes||[],cursor,safeLimit)
        : await validationBatchRows(db,leagueId,snapshot.id,'statistics',cursor,safeLimit);

      const ids=[];
      for(const row of batch){
        const player=row.player_external_id??row.player_id;
        if(player!=null&&player!=='')ids.push(String(player));
      }
      const known=await existingSnapshotPlayerIds(db,leagueId,snapshot.id,ids);
      for(const id of ids)if(!known.has(id))ctx.unresolvedStats=Number(ctx.unresolvedStats||0)+1;

      processed+=batch.length;
      offset+=batch.length;
      if(batch.length)cursor=String(batch[batch.length-1].external_id||'');
      ctx.phaseCursor=cursor;
      if(batch.length<safeLimit||offset>=target)advancePhase('standings');
    }

  }else if(phase==='standings'){
    const batch=await validationBatchRows(db,leagueId,snapshot.id,'standings',cursor,safeLimit);
    processed+=batch.length;
    offset+=batch.length;
    if(batch.length)cursor=String(batch[batch.length-1].external_id||'');
    ctx.phaseCursor=cursor;
    if(batch.length<safeLimit||offset>=Number(ctx.counts.standings||0))advancePhase('finalize');
  }

  if(phase==='finalize'){
    const report=finalizeValidationReport(ctx);
    await db.prepare(`UPDATE league_snapshots SET status=?,validation_status=?,validation_score=?,validation_error_count=?,validation_warning_count=?,validation_report_json=?,validated_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(report.status==='ready'?'validated':'validation-failed',report.status,report.score,report.errorCount,report.warningCount,JSON.stringify(report),report.validatedAt,snapshot.id).run();

    await db.prepare(`UPDATE snapshot_validation_jobs SET status='completed',phase='complete',phase_offset=0,processed_count=?,context_json=?,report_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(processed,JSON.stringify(ctx),JSON.stringify(report),job.id).run();

    job=await db.prepare(`SELECT * FROM snapshot_validation_jobs WHERE id=?`).bind(job.id).first();
    return{job,complete:true,report};
  }

  await db.prepare(`UPDATE snapshot_validation_jobs SET status='running',phase=?,phase_offset=?,processed_count=?,context_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(phase,offset,processed,JSON.stringify(ctx),job.id).run();

  job=await db.prepare(`SELECT * FROM snapshot_validation_jobs WHERE id=?`).bind(job.id).first();
  return{job,complete:false,report:null};
}

async function event(db,leagueId,snapshotId,type,actor,detail={}){await db.prepare(`INSERT INTO league_snapshot_lifecycle_events (id,league_id,snapshot_id,event_type,actor_id,detail_json) VALUES (?,?,?,?,?,?)`).bind(crypto.randomUUID(),leagueId,snapshotId,type,actor||null,JSON.stringify(detail)).run();}
async function ensureForwardSchema(db){return requireDatabaseSchema(db)}

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

async function contextData(context){const slug=normalizeLeagueSlug(context);if(!validLeagueSlug(slug))return{response:json({ok:false,error:'Invalid league slug.'},400)};const auth=await requireCommissioner(context);if(!auth.authorized)return{response:auth.response};const db=database(context.env),league=await resolveLeague(context.env,slug);if(!db||!league||auth.session.membership?.leagueId!==league.id)return{response:json({ok:false,error:'Not found.'},404)};return{db,league,auth};}
export async function onRequestGet(context){const c=await contextData(context);if(c.response)return c.response;await ensureForwardSchema(c.db);const data=await listSnapshots(c.db,c.league.id);const events=await rows(c.db,`SELECT * FROM league_snapshot_lifecycle_events WHERE league_id=? ORDER BY created_at DESC LIMIT 50`,c.league.id);return json({ok:true,release:RELEASE,activeSnapshotId:data.active?.snapshot_id||null,snapshots:data.snapshots,events:events.map(e=>({...e,detail:parse(e.detail_json)}))});}
export async function onRequestPost(context){const c=await contextData(context);if(c.response)return c.response;let body={};try{body=await context.request.json()}catch{}const action=String(body.action||'').trim(),snapshotId=String(body.snapshotId||'').trim();if(!['validate','validate-start','validate-next','activate','rollback'].includes(action)||!snapshotId)return json({ok:false,error:'A valid action and snapshotId are required.'},400);if(['activate','rollback'].includes(action)){const owner=await requirePlatformOwner(context);if(!owner.authorized)return owner.response;}const snapshot=await c.db.prepare(`SELECT * FROM league_snapshots WHERE id=? AND league_id=?`).bind(snapshotId,c.league.id).first();if(!snapshot)return json({ok:false,error:'Snapshot not found.'},404);const actor=['activate','rollback'].includes(action)?ownerAccountId(context.env):c.auth.session.user.id;
 if(action==='validate'||action==='validate-start'){
   try{
     const result=await startSnapshotValidation(c.db,c.league.id,snapshot);
     if(result.complete&&result.report)await event(c.db,c.league.id,snapshot.id,'validated',actor,result.report);
     return json({ok:true,release:RELEASE,action:'validate-start',complete:Boolean(result.complete),validationJob:validationProgress(result.job,parse(result.job?.context_json)||{}),report:result.report,...await listSnapshots(c.db,c.league.id)});
   }catch(error){
     return json({ok:false,release:RELEASE,error:'Snapshot validation could not start.',detail:error?.message||String(error),phase:'validate-start',snapshotId:snapshot.id},500);
   }
 }
 if(action==='validate-next'){
   try{
     const requestedBatches=Math.max(1,Math.min(4,Number(body.batches)||1));
     let result=null;
     for(let index=0;index<requestedBatches;index++){
       result=await nextSnapshotValidation(c.db,c.league.id,snapshot,body.limit);
       if(result.complete)break;
     }
     if(result.complete&&result.report)await event(c.db,c.league.id,snapshot.id,'validated',actor,result.report);
     return json({ok:true,release:RELEASE,action:'validate-next',complete:Boolean(result.complete),validationJob:validationProgress(result.job,parse(result.job?.context_json)||{}),report:result.report,...await listSnapshots(c.db,c.league.id)});
   }catch(error){
     return json({ok:false,release:RELEASE,error:'Snapshot validation batch failed.',detail:error?.message||String(error),phase:'validate-next',snapshotId:snapshot.id},500);
   }
 }
 if(snapshot.validation_status!=='ready'||Number(snapshot.validation_error_count||0)>0)return json({ok:false,error:'Snapshot must pass validation before activation.',validationStatus:snapshot.validation_status||'not-run'},422);
 const current=await active(c.db,c.league.id);if(current?.snapshot_id===snapshot.id)return json({ok:true,release:RELEASE,action,alreadyActive:true,...await listSnapshots(c.db,c.league.id)});
 const targetGameYear=await c.db.prepare(`SELECT gy.* FROM game_year_snapshots linked JOIN league_game_years gy ON gy.id=linked.game_year_id AND gy.league_id=linked.league_id WHERE linked.league_id=? AND linked.snapshot_id=?`).bind(c.league.id,snapshot.id).first();
 if(!targetGameYear)return json({ok:false,error:'Snapshot is not attached to a Madden game year.',release:RELEASE},409);
 if(current?.snapshot_id){
   const currentGameYear=await c.db.prepare(`SELECT game_year_id FROM game_year_snapshots WHERE league_id=? AND snapshot_id=?`).bind(c.league.id,current.snapshot_id).first();
   if(currentGameYear?.game_year_id&&currentGameYear.game_year_id!==targetGameYear.id)return json({ok:false,error:'Archive and detach the active Madden game year before activating a different edition.',release:RELEASE},409);
 }
 if(current?.snapshot_id){await c.db.prepare(`UPDATE league_snapshots SET status='archived',archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(current.snapshot_id).run();}
 await c.db.prepare(`INSERT INTO league_active_snapshots (league_id,snapshot_id,activated_at,activated_by,previous_snapshot_id) VALUES (?,?,CURRENT_TIMESTAMP,?,?) ON CONFLICT(league_id) DO UPDATE SET snapshot_id=excluded.snapshot_id,activated_at=CURRENT_TIMESTAMP,activated_by=excluded.activated_by,previous_snapshot_id=league_active_snapshots.snapshot_id`).bind(c.league.id,snapshot.id,actor,current?.snapshot_id||null).run();
 await c.db.prepare(`UPDATE league_snapshots SET status='active',activated_at=CURRENT_TIMESTAMP,archived_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(snapshot.id).run();
 await c.db.prepare(`UPDATE game_year_snapshots SET snapshot_status=CASE WHEN snapshot_id=? THEN 'active' WHEN snapshot_status='active' THEN 'archived' ELSE snapshot_status END,updated_at=CURRENT_TIMESTAMP WHERE league_id=? AND game_year_id=?`).bind(snapshot.id,c.league.id,targetGameYear.id).run();
 await c.db.prepare(`UPDATE league_game_years SET status='active',archived_at=NULL,removed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND league_id=?`).bind(targetGameYear.id,c.league.id).run();
 const tradeReconciliation=action==='activate'
   ?await reconcileTradeRosterOverlays(c.db,c.league.id,snapshot.id)
   :{checked:0,matched:0,reverted:0,differentTeam:0,notifications:0};
 const forwardDetection=action==='activate'
   ?{status:'pending-separate-stage',previousSnapshotId:current?.snapshot_id||null,currentSnapshotId:snapshot.id,note:'5.9.10.6.2e runs forward transaction detection in bounded requests after activation.'}
   :{status:'skipped',reason:'rollback-activation',previousSnapshotId:current?.snapshot_id||null,currentSnapshotId:snapshot.id};
 await event(c.db,c.league.id,snapshot.id,action==='rollback'?'rollback-activated':'activated',actor,{previousSnapshotId:current?.snapshot_id||null,forwardDetection,tradeReconciliation});
 return json({ok:true,release:RELEASE,action,activeSnapshotChanged:true,activationPerformed:true,forwardDetection,tradeReconciliation,...await listSnapshots(c.db,c.league.id)});
}
