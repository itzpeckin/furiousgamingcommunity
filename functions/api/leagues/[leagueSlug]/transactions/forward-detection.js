import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';
import { requireDatabaseSchema } from '../../../../_lib/database-schema.js';

const RELEASE='5.9.10.6.3P.4',DEFAULT_OWNER_ACCOUNT_ID='owner-tb',DEFAULT_BATCH=750;
const parse=v=>{try{return JSON.parse(v||'null')}catch{return null}};
const text=v=>v==null?null:(String(v).trim()||null);
const ownerAccountId=env=>String(env.PLATFORM_OWNER_ACCOUNT_ID||DEFAULT_OWNER_ACCOUNT_ID).trim();

async function requirePlatformOwner(context){
  const auth=await requireCommissioner(context);if(!auth.authorized)return auth;
  const presented=String(context.request.headers.get('x-franchisehq-platform-owner-account-id')||'').trim();
  if(!presented||presented!==ownerAccountId(context.env))return{authorized:false,response:json({ok:false,error:'Not found.'},404)};
  return auth;
}
async function state(context,write=false){
  const slug=normalizeLeagueSlug(context);if(!validLeagueSlug(slug))return{response:json({ok:false,error:'Invalid league slug.',release:RELEASE},400)};
  if(write){const auth=await requirePlatformOwner(context);if(!auth.authorized)return{response:auth.response};}
  const db=database(context.env),league=await resolveLeague(context.env,slug);
  if(!db||!league)return{response:json({ok:false,error:'League not found.',release:RELEASE},404)};
  if(write)await ensureSchema(db);
  return{db,league,slug};
}
async function ensureSchema(db){
  return requireDatabaseSchema(db);
}
function canonicalState(externalId,dataJson){
  const data=parse(dataJson)||{},source=parse(data.source_record_json)||{};
  const id=text(data.external_id??data.playerId??data.player_id??externalId??source.rosterId??source.playerId??source.id);if(!id)return null;
  const first=text(data.first_name??data.firstName??source.firstName??source.first_name)||'';
  const last=text(data.last_name??data.lastName??source.lastName??source.last_name)||'';
  return{
    playerId:id,
    playerName:text(data.display_name??data.displayName??data.player_name??data.playerName??source.displayName??source.fullName??source.playerName)||`${first} ${last}`.trim()||id,
    teamId:text(data.team_external_id??data.teamId??data.team_id??source.teamExternalId??source.team_external_id??source.teamId??source.team_id??source.rosterTeamId),
    rosterStatus:text(data.roster_status??data.status??source.rosterStatus??source.roster_status??source.status),
    position:text(data.position??source.position??source.positionName??source.pos)
  };
}
function movementType(before,after){
  if(before&&after){
    if(String(before.teamId||'')!==String(after.teamId||''))return'team-change';
    if(String(before.rosterStatus||'')!==String(after.rosterStatus||''))return'roster-status-change';
    return null;
  }
  if(!before&&after)return'roster-entry';
  if(before&&!after)return'roster-exit';
  return null;
}
async function activePair(db,leagueId){
  const active=await db.prepare(`SELECT snapshot_id,previous_snapshot_id FROM league_active_snapshots WHERE league_id=?`).bind(leagueId).first();
  if(!active?.snapshot_id)return null;
  const current=await db.prepare(`SELECT * FROM league_snapshots WHERE id=? AND league_id=?`).bind(active.snapshot_id,leagueId).first();
  const previous=active.previous_snapshot_id?await db.prepare(`SELECT * FROM league_snapshots WHERE id=? AND league_id=?`).bind(active.previous_snapshot_id,leagueId).first():null;
  return{active,current,previous};
}
async function counts(db,leagueId,previousId,currentId){
  const current=Number((await db.prepare(`SELECT COUNT(*) count FROM league_snapshot_records WHERE league_id=? AND snapshot_id=? AND domain='players'`).bind(leagueId,currentId).first())?.count||0);
  if(!previousId)return{current,previous:0,exits:0};
  const previous=Number((await db.prepare(`SELECT COUNT(*) count FROM league_snapshot_records WHERE league_id=? AND snapshot_id=? AND domain='players'`).bind(leagueId,previousId).first())?.count||0);
  const exits=Number((await db.prepare(`SELECT COUNT(*) count FROM league_snapshot_records p LEFT JOIN league_snapshot_records c ON c.league_id=p.league_id AND c.snapshot_id=? AND c.domain='players' AND c.external_id=p.external_id WHERE p.league_id=? AND p.snapshot_id=? AND p.domain='players' AND c.external_id IS NULL`).bind(currentId,leagueId,previousId).first())?.count||0);
  return{current,previous,exits};
}
async function getJob(db,leagueId,currentId){return db.prepare(`SELECT * FROM forward_detection_jobs WHERE league_id=? AND current_snapshot_id=?`).bind(leagueId,currentId).first();}
function publicJob(j){if(!j)return null;return{jobId:j.id,status:j.status,phase:j.phase,previousSnapshotId:j.previous_snapshot_id||null,currentSnapshotId:j.current_snapshot_id,currentOffset:Number(j.current_offset||0),exitOffset:Number(j.exit_offset||0),currentCursor:j.current_cursor||null,exitCursor:j.exit_cursor||null,currentTotal:Number(j.current_total||0),exitTotal:Number(j.exit_total||0),comparedCount:Number(j.compared_count||0),movementCount:Number(j.movement_count||0),teamChanges:Number(j.team_change_count||0),rosterEntries:Number(j.roster_entry_count||0),rosterExits:Number(j.roster_exit_count||0),statusChanges:Number(j.status_change_count||0),error:parse(j.error_json),createdAt:j.created_at,updatedAt:j.updated_at,completedAt:j.completed_at||null};}

function stateFromCompact(row,prefix='current'){
  const externalId=text(row?.[`${prefix}_external_id`]);
  if(!externalId)return null;
  const first=text(row?.[`${prefix}_first_name`])||'';
  const last=text(row?.[`${prefix}_last_name`])||'';
  return{
    playerId:externalId,
    playerName:text(row?.[`${prefix}_display_name`])||`${first} ${last}`.trim()||externalId,
    teamId:text(row?.[`${prefix}_team_id`]),
    rosterStatus:text(row?.[`${prefix}_roster_status`]),
    position:text(row?.[`${prefix}_position`])
  };
}

function compactSelect(alias,prefix){
  return `
    ${alias}.external_id AS ${prefix}_external_id,
    COALESCE(
      json_extract(${alias}.data_json,'$.display_name'),
      json_extract(${alias}.data_json,'$.displayName'),
      json_extract(${alias}.data_json,'$.player_name'),
      json_extract(${alias}.data_json,'$.playerName')
    ) AS ${prefix}_display_name,
    COALESCE(json_extract(${alias}.data_json,'$.first_name'),json_extract(${alias}.data_json,'$.firstName')) AS ${prefix}_first_name,
    COALESCE(json_extract(${alias}.data_json,'$.last_name'),json_extract(${alias}.data_json,'$.lastName')) AS ${prefix}_last_name,
    COALESCE(
      json_extract(${alias}.data_json,'$.team_external_id'),
      json_extract(${alias}.data_json,'$.teamId'),
      json_extract(${alias}.data_json,'$.team_id')
    ) AS ${prefix}_team_id,
    COALESCE(json_extract(${alias}.data_json,'$.roster_status'),json_extract(${alias}.data_json,'$.status')) AS ${prefix}_roster_status,
    json_extract(${alias}.data_json,'$.position') AS ${prefix}_position
  `;
}

async function storeMovesBatch(db,job,moves,currentSnapshot){
  if(!moves.length)return{movementCount:0,teamChanges:0,rosterEntries:0,rosterExits:0,statusChanges:0};

  const sql=`INSERT INTO forward_roster_movements
    (id,league_id,previous_snapshot_id,current_snapshot_id,player_id,player_name,previous_team_id,current_team_id,
     previous_roster_status,current_roster_status,position,detection_type,season,week,evidence_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(league_id,previous_snapshot_id,current_snapshot_id,player_id) DO UPDATE SET
      player_name=excluded.player_name,previous_team_id=excluded.previous_team_id,current_team_id=excluded.current_team_id,
      previous_roster_status=excluded.previous_roster_status,current_roster_status=excluded.current_roster_status,
      position=excluded.position,detection_type=excluded.detection_type,season=excluded.season,week=excluded.week,
      evidence_json=excluded.evidence_json`;

  const statements=moves.map(move=>{
    const before=move.before,after=move.after,p=after||before;
    return db.prepare(sql).bind(
      crypto.randomUUID(),job.league_id,job.previous_snapshot_id,job.current_snapshot_id,p.playerId,p.playerName,
      before?.teamId||null,after?.teamId||null,before?.rosterStatus||null,after?.rosterStatus||null,
      p.position||null,move.type,currentSnapshot?.season_year??null,currentSnapshot?.week_index??null,
      JSON.stringify({
        source:'snapshot-diff',
        previousSnapshotId:job.previous_snapshot_id,
        currentSnapshotId:job.current_snapshot_id,
        playerId:p.playerId,
        fromTeamId:before?.teamId||null,
        toTeamId:after?.teamId||null,
        previousRosterStatus:before?.rosterStatus||null,
        currentRosterStatus:after?.rosterStatus||null
      })
    );
  });
  for(let i=0;i<statements.length;i+=75)await db.batch(statements.slice(i,i+75));

  return{
    movementCount:moves.length,
    teamChanges:moves.filter(x=>x.type==='team-change').length,
    rosterEntries:moves.filter(x=>x.type==='roster-entry').length,
    rosterExits:moves.filter(x=>x.type==='roster-exit').length,
    statusChanges:moves.filter(x=>x.type==='roster-status-change').length
  };
}

async function startJob(s){
  const pair=await activePair(s.db,s.league.id);if(!pair?.current)return json({ok:false,error:'No active snapshot is available.',release:RELEASE},422);
  const currentId=String(pair.current.id),previousId=pair.previous?.id?String(pair.previous.id):null;
  let job=await getJob(s.db,s.league.id,currentId);
  if(job?.status==='complete'||job?.status==='baseline')return json({ok:true,release:RELEASE,action:'start',complete:true,job:publicJob(job)});
  const c=await counts(s.db,s.league.id,previousId,currentId);
  if(!previousId){
    if(!job){await s.db.prepare(`INSERT INTO forward_detection_jobs (id,league_id,previous_snapshot_id,current_snapshot_id,status,phase,current_total,compared_count,completed_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),s.league.id,null,currentId,'baseline','complete',c.current,c.current).run();}
    else await s.db.prepare(`UPDATE forward_detection_jobs SET status='baseline',phase='complete',current_total=?,compared_count=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(c.current,c.current,job.id).run();
    job=await getJob(s.db,s.league.id,currentId);
    return json({ok:true,release:RELEASE,action:'start',complete:true,baselineEstablished:true,job:publicJob(job)});
  }
  if(!job){
    await s.db.prepare(`INSERT INTO forward_detection_jobs (id,league_id,previous_snapshot_id,current_snapshot_id,status,phase,current_total,exit_total) VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),s.league.id,previousId,currentId,'running','current',c.current,c.exits).run();
  }else{
    await s.db.prepare(`UPDATE forward_detection_jobs SET previous_snapshot_id=?,status='running',
      phase=CASE WHEN phase='complete' THEN 'current' ELSE phase END,current_total=?,exit_total=?,error_json=NULL,
      current_cursor=CASE WHEN phase='complete' THEN NULL ELSE current_cursor END,
      exit_cursor=CASE WHEN phase='complete' THEN NULL ELSE exit_cursor END,
      updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(previousId,c.current,c.exits,job.id).run();
  }
  job=await getJob(s.db,s.league.id,currentId);
  return json({ok:true,release:RELEASE,action:'start',complete:false,job:publicJob(job)});
}
async function processCurrent(s,job,limit,currentSnapshot){
  const cursor=text(job.current_cursor);
  const cursorClause=cursor?`AND c.external_id>?`:'';
  const args=[job.previous_snapshot_id,job.league_id,job.current_snapshot_id];
  if(cursor)args.push(cursor);
  args.push(limit);

  const result=await s.db.prepare(`SELECT
      ${compactSelect('c','current')},
      ${compactSelect('p','previous')}
    FROM league_snapshot_records c
    LEFT JOIN league_snapshot_records p
      ON p.league_id=c.league_id AND p.snapshot_id=? AND p.domain='players' AND p.external_id=c.external_id
    WHERE c.league_id=? AND c.snapshot_id=? AND c.domain='players' ${cursorClause}
    ORDER BY c.external_id LIMIT ?`).bind(...args).all();

  const rows=result.results||[];
  const moves=[];
  for(const row of rows){
    const after=stateFromCompact(row,'current');
    const before=row.previous_external_id?stateFromCompact(row,'previous'):null;
    const type=movementType(before,after);
    if(type)moves.push({before,after,type});
  }
  const delta=await storeMovesBatch(s.db,job,moves,currentSnapshot);
  const next=Number(job.current_offset||0)+rows.length;
  const lastCursor=rows.length?String(rows[rows.length-1].current_external_id||''):cursor;
  const phase=rows.length<limit||next>=Number(job.current_total||0)?'exits':'current';

  await s.db.prepare(`UPDATE forward_detection_jobs SET
      current_offset=?,current_cursor=?,compared_count=compared_count+?,phase=?,
      movement_count=movement_count+?,team_change_count=team_change_count+?,
      roster_entry_count=roster_entry_count+?,roster_exit_count=roster_exit_count+?,
      status_change_count=status_change_count+?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(next,lastCursor||null,rows.length,phase,delta.movementCount,delta.teamChanges,delta.rosterEntries,
      delta.rosterExits,delta.statusChanges,job.id).run();
}

async function processExits(s,job,limit,currentSnapshot){
  const cursor=text(job.exit_cursor);
  const cursorClause=cursor?`AND p.external_id>?`:'';
  const args=[job.current_snapshot_id,job.league_id,job.previous_snapshot_id];
  if(cursor)args.push(cursor);
  args.push(limit);

  const result=await s.db.prepare(`SELECT ${compactSelect('p','previous')}
    FROM league_snapshot_records p
    LEFT JOIN league_snapshot_records c
      ON c.league_id=p.league_id AND c.snapshot_id=? AND c.domain='players' AND c.external_id=p.external_id
    WHERE p.league_id=? AND p.snapshot_id=? AND p.domain='players' AND c.external_id IS NULL ${cursorClause}
    ORDER BY p.external_id LIMIT ?`).bind(...args).all();

  const rows=result.results||[];
  const moves=[];
  for(const row of rows){
    const before=stateFromCompact(row,'previous');
    if(before)moves.push({before,after:null,type:'roster-exit'});
  }
  const delta=await storeMovesBatch(s.db,job,moves,currentSnapshot);
  const next=Number(job.exit_offset||0)+rows.length;
  const lastCursor=rows.length?String(rows[rows.length-1].previous_external_id||''):cursor;
  const done=rows.length<limit||next>=Number(job.exit_total||0);

  await s.db.prepare(`UPDATE forward_detection_jobs SET
      exit_offset=?,exit_cursor=?,compared_count=compared_count+?,phase=?,status=?,completed_at=?,
      movement_count=movement_count+?,team_change_count=team_change_count+?,
      roster_entry_count=roster_entry_count+?,roster_exit_count=roster_exit_count+?,
      status_change_count=status_change_count+?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(next,lastCursor||null,rows.length,done?'complete':'exits',done?'complete':'running',
      done?new Date().toISOString():null,delta.movementCount,delta.teamChanges,delta.rosterEntries,
      delta.rosterExits,delta.statusChanges,job.id).run();
}

async function nextBatch(s,body){
  const pair=await activePair(s.db,s.league.id);if(!pair?.current)return json({ok:false,error:'No active snapshot.',release:RELEASE},422);
  let job=await getJob(s.db,s.league.id,String(pair.current.id));if(!job)return startJob(s);
  if(['complete','baseline'].includes(job.status))return json({ok:true,release:RELEASE,action:'next',complete:true,job:publicJob(job)});
  const limit=Math.max(100,Math.min(1000,Number(body.limit)||DEFAULT_BATCH));
  try{
    if(job.phase==='current')await processCurrent(s,job,limit,pair.current);
    job=await getJob(s.db,s.league.id,String(pair.current.id));
    if(job.phase==='exits'&&Number(job.current_offset||0)>=Number(job.current_total||0))await processExits(s,job,limit,pair.current);
    job=await getJob(s.db,s.league.id,String(pair.current.id));
    return json({ok:true,release:RELEASE,action:'next',complete:['complete','baseline'].includes(job.status),job:publicJob(job)});
  }catch(error){
    await s.db.prepare(`UPDATE forward_detection_jobs SET status='failed',error_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify({message:error?.message||String(error)}),job.id).run();
    return json({ok:false,release:RELEASE,error:'Forward transaction batch failed.',detail:error?.message||String(error),job:publicJob(await getJob(s.db,s.league.id,String(pair.current.id)))},500);
  }
}
export async function onRequestGet(context){
  const s=await state(context,false);if(s.response)return s.response;
  const exists=await s.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='forward_detection_jobs'`).first();
  if(!exists)return json({ok:true,release:RELEASE,state:'not-initialized',latestRun:null,runs:[],movements:[],deferred:{freeAgentAcquisition:true}});
  const jobs=(await s.db.prepare(`SELECT * FROM forward_detection_jobs WHERE league_id=? ORDER BY created_at DESC LIMIT 20`).bind(s.league.id).all()).results||[];
  let movements=[];
  const moveExists=await s.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='forward_roster_movements'`).first();
  if(moveExists)movements=(await s.db.prepare(`SELECT * FROM forward_roster_movements WHERE league_id=? ORDER BY detected_at DESC LIMIT 100`).bind(s.league.id).all()).results||[];
  return json({ok:true,release:RELEASE,state:jobs.length?'active':'initialized',latestRun:publicJob(jobs[0]),runs:jobs.map(publicJob),movements:movements.map(r=>({id:r.id,previousSnapshotId:r.previous_snapshot_id,currentSnapshotId:r.current_snapshot_id,playerId:r.player_id,playerName:r.player_name,previousTeamId:r.previous_team_id||null,currentTeamId:r.current_team_id||null,previousRosterStatus:r.previous_roster_status||null,currentRosterStatus:r.current_roster_status||null,position:r.position||null,detectionType:r.detection_type,season:r.season==null?null:Number(r.season),week:r.week==null?null:Number(r.week),evidence:parse(r.evidence_json)||{},detectedAt:r.detected_at})),deferred:{freeAgentAcquisition:true,note:'Roster entries/exits are evidence only until authoritative Free Agent acquisition exists.'}});
}
export async function onRequestPost(context){
  const s=await state(context,true);if(s.response)return s.response;
  let body={};try{body=await context.request.json()}catch{}
  const action=String(body.action||'start').toLowerCase();
  if(action==='start')return startJob(s);
  if(action==='next')return nextBatch(s,body);
  return json({ok:false,release:RELEASE,error:`Unsupported action: ${action}`},400);
}
