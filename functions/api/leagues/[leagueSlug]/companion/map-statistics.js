/* FHQ_BUILD: 5.9.10.6.5.4h-p3d */
import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';
import { requireDatabaseSchema } from '../../../../_lib/database-schema.js';
import { resolveMaddenPeriod } from '../../../../_lib/madden-period.js';

const RELEASE='7.4.0.8';
const RECORD_CHUNK_SIZE=200;
const D1_LOOKUP_CHUNK_SIZE=75;
const ROUTE_INSPECTION_CONCURRENCY=4;
const MAX_STORED_WARNINGS_PER_BATCH=25;
const WEEKLY_ROUTE=/\/week\/(pre|reg|post)\/(\d+)\/(defense|kicking|punting|passing|receiving|rushing|team)\/?$/i;
// Madden can emit empty /week/reg/0/* routes as lifecycle placeholders.
// Week 0 is not a playable regular-season statistics week and must never block snapshot activation.
const TEAMSTATS_CATEGORY='team';
const IDS=['playerId','playerID','rosterId','player_id','id'];
const TEAM=['teamId','teamID','team_id','teamExternalId','team_external_id'];
const FIRST=['firstName','first_name'];
const LAST=['lastName','last_name'];
const NAME=['playerName','displayName','fullName','name'];
const POS=['position','positionAbbr','pos'];
const GAME_IDS=['gameId','gameID','scheduleId','scheduleID','eventId','game_id','schedule_id'];
const META=new Set([
  'message','success','calendarYear','seasonYear','seasonIndex','stageIndex','weekIndex','week',
  'teamId','teamID','team_id','teamExternalId','team_external_id',
  'playerId','playerID','rosterId','player_id',
  'firstName','lastName','playerName','displayName','fullName','name',
  'position','positionAbbr','pos','gameId','gameID','scheduleId','scheduleID','eventId','game_id','schedule_id'
]);

const text=v=>v==null?null:(String(v).trim()||null);
const int=v=>Number.isFinite(Number.parseInt(v,10))?Number.parseInt(v,10):null;
const safeParse=(value,fallback)=>{try{return JSON.parse(value??'')}catch{return fallback}};
async function ensureStatisticsSchema(db){
  return requireDatabaseSchema(db);
}

function own(o,k){return o&&Object.prototype.hasOwnProperty.call(o,k)}
function first(record,aliases){
  for(const key of aliases)if(own(record,key)&&record[key]!==null&&record[key]!=='')return record[key];
  const keys=new Map(Object.keys(record||{}).map(k=>[k.toLowerCase(),k]));
  for(const key of aliases){const hit=keys.get(key.toLowerCase());if(hit&&record[hit]!==null&&record[hit]!=='')return record[hit]}
  return null;
}
function collectArrays(value,path='$',depth=0,out=[]){
  if(depth>8||value==null)return out;
  if(Array.isArray(value)){out.push({path,records:value});return out}
  if(typeof value==='object')for(const[k,v]of Object.entries(value))collectArrays(v,`${path}.${k}`,depth+1,out);
  return out;
}
function playerSignal(record={}){return first(record,IDS)!=null||first(record,NAME)!=null||first(record,FIRST)!=null}
function teamSignal(record={}){return first(record,TEAM)!=null}
function choose(payload,category){
  const collections=collectArrays(payload).map(item=>({...item,objects:item.records.filter(v=>v&&typeof v==='object'&&!Array.isArray(v))})).filter(item=>item.objects.length);
  collections.sort((a,b)=>{const score=category===TEAMSTATS_CATEGORY?teamSignal:playerSignal;const as=a.objects.slice(0,32).filter(score).length;const bs=b.objects.slice(0,32).filter(score).length;return bs-as||b.objects.length-a.objects.length});
  return collections[0]||null;
}
function routeMeta(path){const m=String(path||'').match(WEEKLY_ROUTE);return m?{stage:m[1].toLowerCase(),week:int(m[2]),category:m[3].toLowerCase()}:null}
function canonicalStage(value){return value==='pre'?'preseason':value==='post'?'playoffs':'regular-season'}
function flattenMetrics(record={},prefix='',out={}){
  for(const[key,value]of Object.entries(record||{})){
    if(META.has(key)&&!prefix)continue;
    const name=prefix?`${prefix}.${key}`:key;
    if(value==null||Array.isArray(value))continue;
    if(typeof value==='object'){flattenMetrics(value,name,out);continue}
    if(typeof value==='number'||typeof value==='boolean'||(typeof value==='string'&&value.trim()!=='')){
      out[name]=value;
      if(prefix&&!Object.prototype.hasOwnProperty.call(out,key))out[key]=value;
    }
  }
  return out;
}
async function readBody(request){if(request.method!=='POST')return{};try{return await request.json()}catch{return{}}}
async function readPayload(env,batch){
  const obj=await env.COMPANION_EXPORTS.get(batch.r2_object_key);
  if(!obj)throw new Error(`Payload missing in R2 for ${batch.route_path}.`);
  const raw=new TextDecoder().decode(await obj.arrayBuffer()).trim();
  if(!raw)throw new Error(`Payload empty for ${batch.route_path}.`);
  return JSON.parse(raw);
}
function captureCollectionCount(row){
  const collections=safeParse(row?.collections_json,[]);
  return (collections||[]).reduce((max,item)=>Math.max(max,Number(item?.count||0)),0);
}
function captureParseStatus(row){
  const headers=safeParse(row?.request_headers_json,{});
  return text(headers?.parseStatus);
}
async function capturedRouteCandidates(db,leagueId,discoverySessionId,captureIds=[]){
  let selectedRows=null;
  if(captureIds.length){
    selectedRows=[];
    for(let offset=0;offset<captureIds.length;offset+=75){
      const ids=captureIds.slice(offset,offset+75),marks=ids.map(()=>'?').join(',');
      const result=await db.prepare(`SELECT id capture_id,discovery_session_id,route_path,r2_object_key,payload_hash,
        byte_length,collections_json,request_headers_json,received_at
        FROM companion_route_captures WHERE league_id=? AND id IN (${marks}) ORDER BY received_at DESC`)
        .bind(leagueId,...ids).all();
      selectedRows.push(...(result.results||[]));
    }
  }
  const result=selectedRows?{results:selectedRows}:discoverySessionId
    ? await db.prepare(`SELECT c.id capture_id,link.session_id discovery_session_id,c.route_path,c.r2_object_key,c.payload_hash,
      c.byte_length,c.collections_json,c.request_headers_json,c.received_at
    FROM madden_discovery_session_captures link
    JOIN companion_route_captures c ON c.id=link.capture_id AND c.league_id=link.league_id
    WHERE link.league_id=? AND link.session_id=? AND c.route_path LIKE '%/week/%'
    ORDER BY link.observed_at DESC`).bind(leagueId,discoverySessionId).all()
    : await db.prepare(`SELECT id capture_id,discovery_session_id,route_path,r2_object_key,payload_hash,
      byte_length,collections_json,request_headers_json,received_at
    FROM companion_route_captures
    WHERE league_id=? AND route_path LIKE '%/week/%'
    ORDER BY received_at DESC`).bind(leagueId).all();

  const grouped=new Map();
  for(const row of result.results||[]){
    if(!WEEKLY_ROUTE.test(row.route_path))continue;
    const key=String(row.route_path);
    if(!grouped.has(key))grouped.set(key,[]);
    grouped.get(key).push(row);
  }
  return grouped;
}

function obviousCaptureCandidate(row){
  const status=String(captureParseStatus(row)||'').toLowerCase();
  return Number(row?.byte_length||0)>2 && (!status || status.startsWith('parsed'));
}

async function inspectCaptureShape(env,capture,meta){
  try{
    const payload=await readPayload(env,capture);
    const collection=choose(payload,meta.category);
    const objects=collection?.objects||[];
    if(!objects.length)return{usable:false,recordCount:0,reason:'no-stat-object-collection',collectionPath:collection?.path||null};

    const sample=objects.slice(0,Math.min(25,objects.length));
    if(meta.category===TEAMSTATS_CATEGORY){
      const teamSignalCount=sample.filter(row=>text(first(row,TEAM))).length;
      if(!teamSignalCount)return{usable:false,recordCount:objects.length,reason:'teamstats-collection-has-no-team-identifiers',collectionPath:collection?.path||null};
      const period=resolveMaddenPeriod(capture.route_path,objects);
      if(period?.sentinel&&!period.playable)return{usable:false,recordCount:objects.length,reason:'aggregate-route-payload-period-unresolved',collectionPath:collection?.path||null,period};
      return{usable:true,recordCount:objects.length,reason:null,collectionPath:collection?.path||null,period};
    }

    const statSignalCount=sample.filter(row=>{
      if(!row||typeof row!=='object'||Array.isArray(row))return false;
      const hasPlayer=playerSignal(row);
      const metricCount=Object.entries(flattenMetrics(row)).filter(([key])=>!META.has(key)).length;
      return hasPlayer && metricCount>0;
    }).length;

    if(!statSignalCount)return{usable:false,recordCount:objects.length,reason:'collection-does-not-look-like-player-statistics',collectionPath:collection?.path||null};
    const period=resolveMaddenPeriod(capture.route_path,objects);
    if(period?.sentinel&&!period.playable)return{usable:false,recordCount:objects.length,reason:'aggregate-route-payload-period-unresolved',collectionPath:collection?.path||null,period};
    return{usable:true,recordCount:objects.length,reason:null,collectionPath:collection?.path||null,period};
  }catch(error){
    return{usable:false,recordCount:0,reason:`payload-read-failed: ${error?.message||String(error)}`,collectionPath:null};
  }
}

async function capturedRoutes(db,env,leagueId,discoverySessionId,captureIds=[]){
  const grouped=await capturedRouteCandidates(db,leagueId,discoverySessionId,captureIds);
  const selected=[];

  const inspectRoute=async([routePath,rows])=>{
    const meta=routeMeta(routePath);
    if(!meta)return null;
    let chosen=null;
    const audit=[];
    // Candidate inspection remains ordered within a route while independent
    // routes use bounded R2 concurrency.
    const candidates=rows.filter(obviousCaptureCandidate).slice(0,12);
    for(const candidate of candidates){
      const shape=await inspectCaptureShape(env,candidate,meta);
      audit.push({
        captureId:candidate.capture_id,
        receivedAt:candidate.received_at,
        discoverySessionId:candidate.discovery_session_id,
        byteLength:Number(candidate.byte_length||0),
        payloadHash:candidate.payload_hash,
        ...shape
      });
      if(shape.usable){
        chosen={...candidate,discoveredRecordCount:shape.recordCount,collectionPath:shape.collectionPath,resolvedPeriod:shape.period};
        break;
      }
    }
    if(!chosen){
      return{
        ...rows[0],captureUsable:false,candidateAudit:audit,
        selectionError:`No usable statistics capture found for ${routePath}.`
      };
    }
    return{...chosen,captureUsable:true,candidateAudit:audit,selectionError:null};
  };

  const entries=[...grouped.entries()];
  for(let offset=0;offset<entries.length;offset+=ROUTE_INSPECTION_CONCURRENCY){
    const batch=await Promise.all(entries.slice(offset,offset+ROUTE_INSPECTION_CONCURRENCY).map(inspectRoute));
    selected.push(...batch.filter(Boolean));
  }

  return selected.sort((a,b)=>a.route_path.localeCompare(b.route_path));
}

async function latestCompletedRegularWeek(db,leagueId){
  const active=await db.prepare(`SELECT s.week_index
    FROM league_active_snapshots a
    JOIN league_snapshots s ON s.id=a.snapshot_id AND s.league_id=a.league_id
    WHERE a.league_id=?`).bind(leagueId).first();
  const week=Number(active?.week_index);
  return Number.isFinite(week)?week:null;
}

async function activeSnapshotId(db,leagueId){
  const row=await db.prepare(`SELECT snapshot_id FROM league_active_snapshots WHERE league_id=?`).bind(leagueId).first();
  return text(row?.snapshot_id);
}

async function bootstrapActiveStatisticsManifest(db,leagueId){
  const snapshotId=await activeSnapshotId(db,leagueId);
  if(!snapshotId)return{snapshotId:null,bootstrapped:0};

  const existing=Number((await db.prepare(`SELECT COUNT(*) c FROM canonical_statistics_snapshot_manifest
    WHERE league_id=? AND snapshot_id=?`).bind(leagueId,snapshotId).first())?.c||0);
  if(existing)return{snapshotId,bootstrapped:0,existing};

  const snapshot=await db.prepare(`SELECT manifest_json FROM league_snapshots WHERE league_id=? AND id=?`)
    .bind(leagueId,snapshotId).first();
  const manifest=safeParse(snapshot?.manifest_json,{});
  const priorRunId=text(manifest?.sources?.statisticsMappingRunId);
  if(!priorRunId)return{snapshotId,bootstrapped:0,existing:0};

  const batches=await db.prepare(`SELECT b.route_path,b.source_category,b.stage,b.week_index,b.record_count,
      c.payload_hash
    FROM companion_statistics_mapping_batches b
    LEFT JOIN companion_route_captures c ON c.id=b.capture_id
    WHERE b.league_id=? AND b.mapping_run_id=? AND b.status IN ('complete','skipped')
    ORDER BY b.route_path`)
    .bind(leagueId,priorRunId).all();

  let inserted=0;
  for(const row of batches.results||[]){
    if(!row.payload_hash)continue;
    await db.prepare(`INSERT OR IGNORE INTO canonical_statistics_snapshot_manifest
      (league_id,snapshot_id,route_path,payload_hash,season_year,stage,week_index,source_category,record_count,mapping_run_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(leagueId,snapshotId,row.route_path,row.payload_hash,null,row.stage,Number(row.week_index||0),
        row.source_category,Number(row.record_count||0),priorRunId).run();
    inserted++;
  }
  return{snapshotId,bootstrapped:inserted,existing:0};
}

async function activeManifestByRoute(db,leagueId,snapshotId){
  const map=new Map();
  if(!snapshotId)return map;
  const rows=await db.prepare(`SELECT * FROM canonical_statistics_snapshot_manifest
    WHERE league_id=? AND snapshot_id=?`).bind(leagueId,snapshotId).all();
  for(const row of rows.results||[])map.set(String(row.route_path),row);
  return map;
}

async function playerIndexForRecords(db,leagueId,records){
  const run=await db.prepare(`SELECT id FROM companion_player_mapping_runs WHERE league_id=? AND status='pending-preview' ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();
  const byId=new Map(),byName=new Map();if(!run)return{byId,byName};
  const ids=[...new Set((records||[]).map(record=>text(first(record,IDS))).filter(Boolean))];
  const names=[...new Set((records||[]).map(record=>{const f=text(first(record,FIRST)),l=text(first(record,LAST));return (text(first(record,NAME))||[f,l].filter(Boolean).join(' ')||'').trim().toLowerCase()}).filter(Boolean))];
  const lookups=[];
  for(let offset=0;offset<ids.length;offset+=D1_LOOKUP_CHUNK_SIZE){
    const chunk=ids.slice(offset,offset+D1_LOOKUP_CHUNK_SIZE),marks=chunk.map(()=>'?').join(',');
    lookups.push(db.prepare(`SELECT external_id,team_external_id,display_name,first_name,last_name,position FROM companion_canonical_players_preview WHERE league_id=? AND mapping_run_id=? AND external_id IN (${marks})`).bind(leagueId,run.id,...chunk));
  }
  for(let offset=0;offset<names.length;offset+=D1_LOOKUP_CHUNK_SIZE){
    const chunk=names.slice(offset,offset+D1_LOOKUP_CHUNK_SIZE),marks=chunk.map(()=>'?').join(',');
    lookups.push(db.prepare(`SELECT external_id,team_external_id,display_name,first_name,last_name,position FROM companion_canonical_players_preview WHERE league_id=? AND mapping_run_id=? AND lower(COALESCE(display_name, trim(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')))) IN (${marks})`).bind(leagueId,run.id,...chunk));
  }
  const rows=[];
  for(const result of lookups.length?await db.batch(lookups):[])rows.push(...(result.results||[]));
  for(const p of rows){byId.set(String(p.external_id),p);const n=String(p.display_name||`${p.first_name||''} ${p.last_name||''}`).trim().toLowerCase();if(n&&!byName.has(n))byName.set(n,p)}
  return{byId,byName};
}
async function progress(db,runId){
  const result=await db.prepare(`SELECT status,COUNT(*) count FROM companion_statistics_mapping_batches WHERE mapping_run_id=? GROUP BY status`).bind(runId).all();
  const counts={pending:0,processing:0,complete:0,skipped:0,failed:0};for(const row of result.results||[])counts[row.status]=Number(row.count||0);
  const total=Object.values(counts).reduce((a,b)=>a+b,0),done=counts.complete+counts.skipped+counts.failed;
  const next=await db.prepare(`SELECT route_path,source_category,stage,week_index,record_offset,record_total,status FROM companion_statistics_mapping_batches WHERE mapping_run_id=? AND status IN ('pending','processing') ORDER BY CASE status WHEN 'processing' THEN 0 ELSE 1 END,route_path LIMIT 1`).bind(runId).first();
  return{...counts,total,done,percent:total?Math.round((done/total)*100):0,next:next?{routePath:next.route_path,category:next.source_category,stage:next.stage,weekIndex:next.week_index,recordOffset:Number(next.record_offset||0),recordTotal:next.record_total==null?null:Number(next.record_total),status:next.status}:null};
}
async function runPublic(db,run){
  if(!run)return null;
  const p=await progress(db,run.id);
  const failed=(await db.prepare(`SELECT route_path,capture_id,error_json,warnings_json
    FROM companion_statistics_mapping_batches WHERE mapping_run_id=? AND status='failed' ORDER BY route_path`)
    .bind(run.id).all()).results||[];
  return{mappingRun:{id:run.id,status:run.status,routeCount:Number(run.route_count||0),recordCount:Number(run.record_count||0),resolvedPlayerCount:Number(run.resolved_player_count||0),unresolvedPlayerCount:Number(run.unresolved_player_count||0),categorySummary:safeParse(run.category_summary_json,{}),warningCount:Number(run.warning_count||0),warnings:safeParse(run.warnings_json,[]),createdAt:run.created_at,updatedAt:run.updated_at},
    progress:p,
    failedRoutes:failed.map(row=>({routePath:row.route_path,captureId:row.capture_id,error:safeParse(row.error_json,null),warnings:safeParse(row.warnings_json,[])})),
    delta:{totalRoutes:p.total,skippedRoutes:p.skipped,processedRoutes:p.complete,changedOrNewRoutes:p.pending+p.processing+p.complete,failedRoutes:p.failed}
  };
}
async function latestRun(db,leagueId,includeRows=false){
  const run=await db.prepare(`SELECT * FROM companion_statistics_mapping_runs WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();
  if(!run)return null;
  const pub=await runPublic(db,run);
  if(!includeRows)return pub;
  const result=await db.prepare(`SELECT * FROM companion_canonical_statistics_preview WHERE league_id=? AND mapping_run_id=? ORDER BY category,stage,week_index,player_name,team_external_id,external_key LIMIT 500`).bind(leagueId,run.id).all();
  return{...pub,statistics:(result.results||[]).map(row=>({externalKey:row.external_key,category:row.category,seasonYear:row.season_year,stage:row.stage,weekIndex:row.week_index,playerExternalId:row.player_external_id,teamExternalId:row.team_external_id,playerName:row.player_name,position:row.position,metrics:safeParse(row.metrics_json,{}),sourceRoutePath:row.source_route_path}))};
}
async function startRun(db,env,leagueId,discoverySessionId,captureIds=[]){
  const routes=await capturedRoutes(db,env,leagueId,discoverySessionId,captureIds);
  if(!routes.length)throw Object.assign(new Error('No weekly statistics datasets were captured.'),{status:422});
  // A retained-period candidate is an exact, auditable re-composition. Process
  // every selected route even if its payload hash is already in the live
  // manifest; skipped routes would otherwise contribute no rows to this run.
  const forceProcessRetainedBundle=Boolean(captureIds.length);

  const bootstrap=await bootstrapActiveStatisticsManifest(db,leagueId);
  const activeId=bootstrap.snapshotId||await activeSnapshotId(db,leagueId);
  const committed=await activeManifestByRoute(db,leagueId,activeId);
  const completedRegularWeek=await latestCompletedRegularWeek(db,leagueId);

  const runId=crypto.randomUUID();
  let skipped=0,pending=0;

  for(const capture of routes){
    const meta=routeMeta(capture.route_path);
    if(!meta)continue;
    const prior=committed.get(String(capture.route_path));
    const optionalEmpty=Boolean(!capture.captureUsable && (
      meta?.stage==='pre' ||
      (meta?.stage==='reg' && Number(meta.week)===0) ||
      (meta?.stage==='reg' && completedRegularWeek!==null && Number(meta.week)>completedRegularWeek)
    ));
    const unchanged=Boolean(!forceProcessRetainedBundle && capture.captureUsable && Number(prior?.record_count||0)>0 && prior?.payload_hash && capture.payload_hash && String(prior.payload_hash)===String(capture.payload_hash));
    if(unchanged||optionalEmpty)skipped++;else pending++;
  }

  await db.prepare(`INSERT INTO companion_statistics_mapping_runs
    (id,league_id,discovery_session_id,status,route_count,record_count,resolved_player_count,
     unresolved_player_count,category_summary_json,warning_count,warnings_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(runId,leagueId,discoverySessionId||routes[0]?.discovery_session_id||'aggregated-stat-routes',
      pending?'processing':'pending-preview',routes.length,0,0,0,'{}',0,'[]').run();

  const sql=`INSERT INTO companion_statistics_mapping_batches
    (id,mapping_run_id,league_id,capture_id,discovery_session_id,route_path,r2_object_key,
     payload_hash,source_category,stage,week_index,season_year,status,record_count,record_offset,record_total,
     completed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

  const statements=[];
  for(const capture of routes){
    const meta=routeMeta(capture.route_path);if(!meta)continue;
    const prior=committed.get(String(capture.route_path));
    const optionalEmpty=Boolean(!capture.captureUsable && (
      meta.stage==='pre' ||
      (meta.stage==='reg' && Number(meta.week)===0) ||
      (meta.stage==='reg' && completedRegularWeek!==null && Number(meta.week)>completedRegularWeek)
    ));
    const unchanged=Boolean(!forceProcessRetainedBundle && capture.captureUsable && Number(prior?.record_count||0)>0 && prior?.payload_hash && capture.payload_hash && String(prior.payload_hash)===String(capture.payload_hash));
    statements.push(db.prepare(sql).bind(
      crypto.randomUUID(),runId,leagueId,capture.capture_id,capture.discovery_session_id,capture.route_path,
      capture.r2_object_key,capture.payload_hash||'',meta.category,capture.resolvedPeriod?.playable?capture.resolvedPeriod.stage:canonicalStage(meta.stage),capture.resolvedPeriod?.playable?capture.resolvedPeriod.week:meta.week,
      prior?.season_year==null?null:Number(prior.season_year),
      (unchanged||optionalEmpty)?'skipped':capture.captureUsable?'pending':'failed',
      unchanged?Number(prior?.record_count||0):0,
      0,
      unchanged?Number(prior?.record_count||0):null,
      (unchanged||optionalEmpty||!capture.captureUsable)?new Date().toISOString():null
    ));
  }
  for(let i=0;i<statements.length;i+=75)await db.batch(statements.slice(i,i+75));

  for(const capture of routes.filter(row=>{
    if(row.captureUsable)return false;
    const meta=routeMeta(row.route_path);
    if(meta?.stage==='pre')return false;
    if(meta?.stage==='reg' && Number(meta.week)===0)return false;
    if(meta?.stage==='reg' && completedRegularWeek!==null && Number(meta.week)>completedRegularWeek)return false;
    return true;
  })){
    const diagnostic={
      error:capture.selectionError||'No usable statistics capture found.',
      routePath:capture.route_path,
      selectedCaptureId:capture.capture_id||null,
      candidates:capture.candidateAudit||[]
    };
    await db.prepare(`UPDATE companion_statistics_mapping_batches
      SET error_json=?,warning_count=1,warnings_json=?,updated_at=CURRENT_TIMESTAMP
      WHERE mapping_run_id=? AND route_path=?`)
      .bind(JSON.stringify(diagnostic),JSON.stringify([diagnostic.error]),runId,capture.route_path).run();
  }

  return{
    runId,activeSnapshotId:activeId,bootstrap,skippedRoutes:skipped,pendingRoutes:pending,totalRoutes:routes.length,
    completedRegularWeek,
    unusableRoutes:routes.filter(row=>{
      if(row.captureUsable)return false;
      const meta=routeMeta(row.route_path);
      if(meta?.stage==='pre')return false;
      if(meta?.stage==='reg' && Number(meta.week)===0)return false;
      if(meta?.stage==='reg' && completedRegularWeek!==null && Number(meta.week)>completedRegularWeek)return false;
      return true;
    }).map(row=>({
      routePath:row.route_path,
      error:row.selectionError,
      candidates:row.candidateAudit||[]
    }))
  };
}
async function insertRows(db,runId,leagueId,rows){
  if(!rows.length)return;
  const sql=`INSERT OR REPLACE INTO companion_canonical_statistics_preview (mapping_run_id,league_id,external_key,category,season_year,stage,week_index,player_external_id,team_external_id,player_name,position,metrics_json,source_route_path,source_record_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  for(let offset=0;offset<rows.length;offset+=60){
    const statements=rows.slice(offset,offset+60).map(row=>db.prepare(sql).bind(runId,leagueId,row.externalKey,row.category,row.seasonYear,row.stage,row.weekIndex,row.playerExternalId,row.teamExternalId,row.playerName,row.position,JSON.stringify(row.metrics),row.route,JSON.stringify(row.source)));
    await db.batch(statements);
  }
}
async function rebuildRunSummary(db,runId){
  const categories=await db.prepare(`SELECT category,COUNT(*) count FROM companion_canonical_statistics_preview WHERE mapping_run_id=? GROUP BY category`).bind(runId).all();
  const summary={};for(const row of categories.results||[])summary[row.category]=Number(row.count||0);
  const counts=await db.prepare(`SELECT COUNT(*) record_count,SUM(CASE WHEN player_external_id IS NOT NULL THEN 1 ELSE 0 END) player_rows FROM companion_canonical_statistics_preview WHERE mapping_run_id=?`).bind(runId).first();
  const batchCounts=await db.prepare(`SELECT COALESCE(SUM(resolved_player_count),0) resolved,COALESCE(SUM(unresolved_player_count),0) unresolved,COALESCE(SUM(warning_count),0) warnings FROM companion_statistics_mapping_batches WHERE mapping_run_id=?`).bind(runId).first();
  const warningRows=await db.prepare(`SELECT warnings_json FROM companion_statistics_mapping_batches WHERE mapping_run_id=? AND warning_count>0 ORDER BY route_path`).bind(runId).all();
  const warnings=[];for(const row of warningRows.results||[])warnings.push(...safeParse(row.warnings_json,[]));
  await db.prepare(`UPDATE companion_statistics_mapping_runs SET record_count=?,resolved_player_count=?,unresolved_player_count=?,category_summary_json=?,warning_count=?,warnings_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(Number(counts?.record_count||0),Number(batchCounts?.resolved||0),Number(batchCounts?.unresolved||0),JSON.stringify(summary),Number(batchCounts?.warnings||0),JSON.stringify(warnings),runId).run();
}
async function processNext(db,env,leagueId,runId){
  const run=await db.prepare(`SELECT * FROM companion_statistics_mapping_runs WHERE id=? AND league_id=?`).bind(runId,leagueId).first();
  if(!run)throw Object.assign(new Error('Statistics mapping run not found.'),{status:404});
  if(run.status==='pending-preview'||run.status==='partial-preview')return{complete:true};
  const batch=await db.prepare(`SELECT * FROM companion_statistics_mapping_batches WHERE mapping_run_id=? AND status IN ('processing','pending') ORDER BY CASE status WHEN 'processing' THEN 0 ELSE 1 END,route_path LIMIT 1`).bind(runId).first();
  if(!batch){
    const failed=Number((await db.prepare(`SELECT COUNT(*) c FROM companion_statistics_mapping_batches WHERE mapping_run_id=? AND status='failed'`).bind(runId).first())?.c||0);
    await rebuildRunSummary(db,runId);
    await db.prepare(`UPDATE companion_statistics_mapping_runs SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(failed?'partial-preview':'pending-preview',runId).run();
    return{complete:true,failed};
  }
  if(batch.status==='pending')await db.prepare(`UPDATE companion_statistics_mapping_batches SET status='processing',started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(batch.id).run();
  try{
    const meta=routeMeta(batch.route_path),payload=await readPayload(env,batch),collection=choose(payload,meta.category),allRecords=collection?.objects||[],warnings=[];
    if(!collection||!allRecords.length){
      throw new Error(`No usable ${meta.category} statistic records found in ${batch.route_path}. The route will not be committed as a successful weekly statistics import.`);
    }
    const offset=Number(batch.record_offset||0),chunk=allRecords.slice(offset,offset+RECORD_CHUNK_SIZE),output=[];
    const players=meta.category===TEAMSTATS_CATEGORY?{byId:new Map(),byName:new Map()}:await playerIndexForRecords(db,leagueId,chunk);
    let resolved=0,unresolved=0;
    for(let localIndex=0;localIndex<chunk.length;localIndex++){
      const index=offset+localIndex,record=chunk[localIndex];
      if(meta.category===TEAMSTATS_CATEGORY){
        const teamId=text(first(record,TEAM));if(!teamId)continue;
        const values=flattenMetrics(record),gameId=text(first(record,GAME_IDS)),seasonYear=int(first(record,['calendarYear','seasonYear','year']));
        if(gameId){values.__gameId=gameId;values.scheduleId=gameId}values.__sourceCategory='team';
        output.push({externalKey:`team:${seasonYear??'unknown'}:${batch.stage}:${batch.week_index}:${teamId}:${gameId||index}`,category:'team-game',seasonYear,stage:batch.stage,weekIndex:Number(batch.week_index),playerExternalId:null,teamExternalId:teamId,playerName:null,position:null,metrics:values,route:batch.route_path,source:record});
        continue;
      }
      const sourceId=text(first(record,IDS)),firstName=text(first(record,FIRST)),lastName=text(first(record,LAST)),sourceName=text(first(record,NAME))||[firstName,lastName].filter(Boolean).join(' ')||null;
      let player=sourceId?players.byId.get(sourceId):null;if(!player&&sourceName)player=players.byName.get(sourceName.toLowerCase());
      if(player)resolved++;else{unresolved++;if(warnings.length<MAX_STORED_WARNINGS_PER_BATCH)warnings.push(`Unresolved ${meta.category} player ${sourceId||sourceName||`record ${index+1}`} in ${batch.route_path}`)}
      const teamId=text(first(record,TEAM))||text(player?.team_external_id),seasonYear=int(first(record,['calendarYear','seasonYear','year']));
      output.push({externalKey:`${meta.category}:${seasonYear??'unknown'}:${batch.stage}:${batch.week_index}:${player?.external_id||sourceId||sourceName||index}:${teamId||'none'}`,category:meta.category,seasonYear,stage:batch.stage,weekIndex:Number(batch.week_index),playerExternalId:text(player?.external_id)||sourceId,teamExternalId:teamId,playerName:text(player?.display_name)||sourceName,position:text(first(record,POS))||text(player?.position),metrics:flattenMetrics(record),route:batch.route_path,source:record});
    }
    const unique=[...new Map(output.map(row=>[row.externalKey,row])).values()];
    await insertRows(db,runId,leagueId,unique);
    const nextOffset=Math.min(offset+chunk.length,allRecords.length),routeComplete=nextOffset>=allRecords.length;
    const existingWarnings=safeParse(batch.warnings_json,[]),mergedWarnings=[...existingWarnings,...warnings].slice(0,MAX_STORED_WARNINGS_PER_BATCH);
    const detectedSeason=unique.map(row=>Number(row.seasonYear)).find(Number.isFinite)??null;
    await db.prepare(`UPDATE companion_statistics_mapping_batches SET status=?,record_offset=?,record_total=?,
      record_count=record_count+?,resolved_player_count=resolved_player_count+?,unresolved_player_count=unresolved_player_count+?,
      warning_count=warning_count+?,warnings_json=?,season_year=COALESCE(season_year,?),completed_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(routeComplete?'complete':'processing',nextOffset,allRecords.length,unique.length,resolved,unresolved,
        warnings.length,JSON.stringify(mergedWarnings),detectedSeason,routeComplete?new Date().toISOString():null,batch.id).run();
    if(routeComplete){
      const remaining=Number((await db.prepare(`SELECT COUNT(*) c FROM companion_statistics_mapping_batches WHERE mapping_run_id=? AND status IN ('pending','processing')`).bind(runId).first())?.c||0);
      if(!remaining){const failed=Number((await db.prepare(`SELECT COUNT(*) c FROM companion_statistics_mapping_batches WHERE mapping_run_id=? AND status='failed'`).bind(runId).first())?.c||0);await rebuildRunSummary(db,runId);await db.prepare(`UPDATE companion_statistics_mapping_runs SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(failed?'partial-preview':'pending-preview',runId).run();return{complete:true,processed:{routePath:batch.route_path,category:meta.category,records:unique.length,routeComplete:true,recordOffset:nextOffset,recordTotal:allRecords.length}}}
    }
    return{complete:false,processed:{routePath:batch.route_path,category:meta.category,records:unique.length,routeComplete,recordOffset:nextOffset,recordTotal:allRecords.length}};
  }catch(error){
    await db.prepare(`UPDATE companion_statistics_mapping_batches SET status='failed',warning_count=warning_count+1,warnings_json=?,error_json=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify([`Failed ${batch.route_path}: ${error?.message||String(error)}`]),JSON.stringify({message:error?.message||String(error)}),batch.id).run();
    throw error;
  }
}

async function authorizedContext(context){
  const slug=normalizeLeagueSlug(context);if(!validLeagueSlug(slug))return{response:json({ok:false,error:'Invalid league slug.'},400)};
  const auth=await requireCommissioner(context);if(!auth.authorized)return{response:auth.response};
  const db=database(context.env),league=await resolveLeague(context.env,slug);if(!db||!league||auth.session.membership?.leagueId!==league.id)return{response:json({ok:false,error:'Not found.'},404)};
  await ensureStatisticsSchema(db);
  return{db,league};
}
export async function onRequestGet(context){
  const state=await authorizedContext(context);if(state.response)return state.response;
  const preview=await latestRun(state.db,state.league.id,false);
  const requestedCategory=String(new URL(context.request.url).searchParams.get('category')||'').trim().toLowerCase();
  let statistics;
  if(requestedCategory&&preview?.mappingRun?.id){
    const result=await state.db.prepare(`SELECT * FROM companion_canonical_statistics_preview WHERE league_id=? AND mapping_run_id=? AND category=? ORDER BY stage,week_index,player_name,team_external_id,external_key LIMIT 1000`).bind(state.league.id,preview.mappingRun.id,requestedCategory).all();
    statistics=(result.results||[]).map(row=>({externalKey:row.external_key,category:row.category,seasonYear:row.season_year,stage:row.stage,weekIndex:row.week_index,playerExternalId:row.player_external_id,teamExternalId:row.team_external_id,playerName:row.player_name,position:row.position,metrics:safeParse(row.metrics_json,{}),sourceRoutePath:row.source_route_path}));
  }
  return json({ok:true,release:RELEASE,previewAvailable:Boolean(preview?.mappingRun?.recordCount),...(preview||{}),...(statistics?{statistics}:{}),activeSnapshotChanged:false,activationPerformed:false});
}
export async function onRequestPost(context){
  const state=await authorizedContext(context);if(state.response)return state.response;
  try{
    const body=await readBody(context.request),action=String(body.action||'start').toLowerCase();
    if(action==='start'){
      const candidateRunId=text(body.candidateImportRunId);
      const candidateRun=candidateRunId?await state.db.prepare(`SELECT discovery_session_id,source_counts_json FROM companion_candidate_import_runs WHERE id=? AND league_id=? AND status='running' LIMIT 1`).bind(candidateRunId,state.league.id).first():null;
      if(candidateRunId&&!candidateRun)return json({ok:false,error:'A running candidate import is required for retained-period statistics mapping.',release:RELEASE},409);
      const sourceCounts=candidateRun?safeParse(candidateRun.source_counts_json,{}):{};
      const sourceCaptureIds=Array.isArray(sourceCounts.sourceCaptureIds)?sourceCounts.sourceCaptureIds.map(String):[];
      const started=await startRun(state.db,context.env,state.league.id,candidateRun?.discovery_session_id||text(body.discoverySessionId),sourceCaptureIds);
      const run=await state.db.prepare(`SELECT * FROM companion_statistics_mapping_runs WHERE id=?`).bind(started.runId).first();
      const pub=await runPublic(state.db,run);
      return json({ok:true,release:RELEASE,action:'start',...pub,
        complete:run.status!=='processing',
        deltaPlan:{activeSnapshotId:started.activeSnapshotId,totalRoutes:started.totalRoutes,
          skippedRoutes:started.skippedRoutes,changedOrNewRoutes:started.pendingRoutes,
          bootstrappedRoutes:started.bootstrap?.bootstrapped||0,
          unusableRoutes:started.unusableRoutes||[]},
        activeSnapshotChanged:false,activationPerformed:false});
    }
    if(action==='next'){
      const runId=text(body.runId);if(!runId)return json({ok:false,error:'runId is required.'},400);
      const result=await processNext(state.db,context.env,state.league.id,runId),run=await state.db.prepare(`SELECT * FROM companion_statistics_mapping_runs WHERE id=?`).bind(runId).first();
      return json({ok:true,release:RELEASE,action:'next',...result,...(await runPublic(state.db,run)),activeSnapshotChanged:false,activationPerformed:false});
    }
    if(action==='resume'){
      const run=await state.db.prepare(`SELECT * FROM companion_statistics_mapping_runs WHERE league_id=? AND status='processing' ORDER BY created_at DESC LIMIT 1`).bind(state.league.id).first();
      if(!run)return json({ok:false,error:'No resumable statistics mapping run exists.'},404);
      return json({ok:true,release:RELEASE,action:'resume',...(await runPublic(state.db,run)),complete:false});
    }
    return json({ok:false,error:`Unsupported action: ${action}`},400);
  }catch(error){
    return json({ok:false,error:'Statistics mapping failed.',detail:error?.message||String(error),release:RELEASE},error?.status||500);
  }
}
