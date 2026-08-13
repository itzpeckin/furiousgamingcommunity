import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE='5.9.7.0a';
const DEFAULT_OWNER_ACCOUNT_ID='owner-tb';
const WEEKLY_ROUTE=/\/week\/(pre|reg|post)\/(\d+)\/(defense|kicking|punting|passing|receiving|rushing|team)\/?$/i;
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
const ownerAccountId=env=>String(env.PLATFORM_OWNER_ACCOUNT_ID||DEFAULT_OWNER_ACCOUNT_ID).trim();
let statisticsSchemaReady=false;
async function ensureStatisticsSchema(db){
  if(statisticsSchemaReady)return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS companion_statistics_mapping_batches (
    id TEXT PRIMARY KEY,
    mapping_run_id TEXT NOT NULL,
    league_id TEXT NOT NULL,
    capture_id TEXT NOT NULL,
    discovery_session_id TEXT,
    route_path TEXT NOT NULL,
    r2_object_key TEXT NOT NULL,
    source_category TEXT NOT NULL,
    stage TEXT NOT NULL,
    week_index INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    record_count INTEGER NOT NULL DEFAULT 0,
    resolved_player_count INTEGER NOT NULL DEFAULT 0,
    unresolved_player_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    warnings_json TEXT NOT NULL DEFAULT '[]',
    error_json TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (mapping_run_id, route_path),
    FOREIGN KEY (mapping_run_id) REFERENCES companion_statistics_mapping_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_statistics_batches_run_status ON companion_statistics_mapping_batches (mapping_run_id, status, route_path)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_statistics_batches_league_created ON companion_statistics_mapping_batches (league_id, created_at DESC)`).run();
  statisticsSchemaReady=true;
}

async function requirePlatformOwner(context){
  const auth=await requireCommissioner(context);
  if(!auth.authorized)return auth;
  const presented=String(context.request.headers.get('x-franchisehq-platform-owner-account-id')||'').trim();
  if(!presented||presented!==ownerAccountId(context.env))return{authorized:false,response:json({ok:false,error:'Not found.'},404)};
  return auth;
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
async function capturedRoutes(db,leagueId){
  const result=await db.prepare(`SELECT id capture_id,discovery_session_id,route_path,r2_object_key,received_at FROM companion_route_captures WHERE league_id=? AND route_path LIKE '%/week/%' ORDER BY received_at DESC`).bind(leagueId).all();
  const latest=new Map();
  for(const row of result.results||[]){if(!WEEKLY_ROUTE.test(row.route_path))continue;if(!latest.has(row.route_path))latest.set(row.route_path,row)}
  return[...latest.values()].sort((a,b)=>a.route_path.localeCompare(b.route_path));
}
async function playerIndex(db,leagueId){
  const run=await db.prepare(`SELECT id FROM companion_player_mapping_runs WHERE league_id=? AND status='pending-preview' ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();
  const byId=new Map(),byName=new Map();if(!run)return{byId,byName};
  const result=await db.prepare(`SELECT external_id,team_external_id,display_name,first_name,last_name,position FROM companion_canonical_players_preview WHERE league_id=? AND mapping_run_id=?`).bind(leagueId,run.id).all();
  for(const p of result.results||[]){byId.set(String(p.external_id),p);const n=String(p.display_name||`${p.first_name||''} ${p.last_name||''}`).trim().toLowerCase();if(n&&!byName.has(n))byName.set(n,p)}
  return{byId,byName};
}
async function progress(db,runId){
  const result=await db.prepare(`SELECT status,COUNT(*) count FROM companion_statistics_mapping_batches WHERE mapping_run_id=? GROUP BY status`).bind(runId).all();
  const counts={pending:0,processing:0,complete:0,failed:0};for(const row of result.results||[])counts[row.status]=Number(row.count||0);
  const total=Object.values(counts).reduce((a,b)=>a+b,0),done=counts.complete+counts.failed;
  const next=await db.prepare(`SELECT route_path,source_category,stage,week_index FROM companion_statistics_mapping_batches WHERE mapping_run_id=? AND status='pending' ORDER BY route_path LIMIT 1`).bind(runId).first();
  return{...counts,total,done,percent:total?Math.round((done/total)*100):0,next:next?{routePath:next.route_path,category:next.source_category,stage:next.stage,weekIndex:next.week_index}:null};
}
async function runPublic(db,run){
  if(!run)return null;
  return{mappingRun:{id:run.id,status:run.status,routeCount:Number(run.route_count||0),recordCount:Number(run.record_count||0),resolvedPlayerCount:Number(run.resolved_player_count||0),unresolvedPlayerCount:Number(run.unresolved_player_count||0),categorySummary:safeParse(run.category_summary_json,{}),warningCount:Number(run.warning_count||0),warnings:safeParse(run.warnings_json,[]),createdAt:run.created_at,updatedAt:run.updated_at},progress:await progress(db,run.id)};
}
async function latestRun(db,leagueId,includeRows=true){
  const run=await db.prepare(`SELECT * FROM companion_statistics_mapping_runs WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();
  if(!run)return null;
  const pub=await runPublic(db,run);
  if(!includeRows)return pub;
  const result=await db.prepare(`SELECT * FROM companion_canonical_statistics_preview WHERE league_id=? AND mapping_run_id=? ORDER BY category,stage,week_index,player_name,team_external_id,external_key`).bind(leagueId,run.id).all();
  return{...pub,statistics:(result.results||[]).map(row=>({externalKey:row.external_key,category:row.category,seasonYear:row.season_year,stage:row.stage,weekIndex:row.week_index,playerExternalId:row.player_external_id,teamExternalId:row.team_external_id,playerName:row.player_name,position:row.position,metrics:safeParse(row.metrics_json,{}),sourceRoutePath:row.source_route_path}))};
}
async function startRun(db,leagueId){
  const routes=await capturedRoutes(db,leagueId);if(!routes.length)throw Object.assign(new Error('No weekly statistics datasets were captured.'),{status:422});
  const runId=crypto.randomUUID();
  await db.prepare(`INSERT INTO companion_statistics_mapping_runs (id,league_id,discovery_session_id,status,route_count,record_count,resolved_player_count,unresolved_player_count,category_summary_json,warning_count,warnings_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(runId,leagueId,routes[0]?.discovery_session_id||'aggregated-stat-routes','processing',routes.length,0,0,0,'{}',0,'[]').run();
  const sql=`INSERT INTO companion_statistics_mapping_batches (id,mapping_run_id,league_id,capture_id,discovery_session_id,route_path,r2_object_key,source_category,stage,week_index,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
  const statements=[];
  for(const capture of routes){const meta=routeMeta(capture.route_path);if(!meta)continue;statements.push(db.prepare(sql).bind(crypto.randomUUID(),runId,leagueId,capture.capture_id,capture.discovery_session_id,capture.route_path,capture.r2_object_key,meta.category,canonicalStage(meta.stage),meta.week,'pending'))}
  for(let i=0;i<statements.length;i+=75)await db.batch(statements.slice(i,i+75));
  return runId;
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
  if(run.status==='pending-preview')return{complete:true};
  // A previous Worker may have been terminated after marking a route processing.
  // Because the browser sends these sequentially, any leftover processing batch is stale and safe to retry.
  await db.prepare(`UPDATE companion_statistics_mapping_batches SET status='pending',started_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE mapping_run_id=? AND status='processing'`).bind(runId).run();
  const batch=await db.prepare(`SELECT * FROM companion_statistics_mapping_batches WHERE mapping_run_id=? AND status='pending' ORDER BY route_path LIMIT 1`).bind(runId).first();
  if(!batch){
    const failed=Number((await db.prepare(`SELECT COUNT(*) c FROM companion_statistics_mapping_batches WHERE mapping_run_id=? AND status='failed'`).bind(runId).first())?.c||0);
    await rebuildRunSummary(db,runId);
    await db.prepare(`UPDATE companion_statistics_mapping_runs SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(failed?'partial-preview':'pending-preview',runId).run();
    return{complete:true,failed};
  }
  await db.prepare(`UPDATE companion_statistics_mapping_batches SET status='processing',started_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(batch.id).run();
  try{
    const meta=routeMeta(batch.route_path),payload=await readPayload(env,batch),collection=choose(payload,meta.category),warnings=[],output=[];
    if(!collection)warnings.push(`No ${meta.category} collection found in ${batch.route_path}`);
    const players=meta.category===TEAMSTATS_CATEGORY?{byId:new Map(),byName:new Map()}:await playerIndex(db,leagueId);
    let resolved=0,unresolved=0;
    for(let index=0;index<(collection?.objects||[]).length;index++){
      const record=collection.objects[index];
      if(meta.category===TEAMSTATS_CATEGORY){
        const teamId=text(first(record,TEAM));if(!teamId)continue;
        const values=flattenMetrics(record),gameId=text(first(record,GAME_IDS));if(gameId){values.__gameId=gameId;values.scheduleId=gameId}values.__sourceCategory='team';
        output.push({externalKey:`team:${canonicalStage(meta.stage)}:${meta.week}:${teamId}:${gameId||index}`,category:'team-game',seasonYear:int(first(record,['calendarYear','seasonYear','year'])),stage:canonicalStage(meta.stage),weekIndex:meta.week,playerExternalId:null,teamExternalId:teamId,playerName:null,position:null,metrics:values,route:batch.route_path,source:record});
        continue;
      }
      const sourceId=text(first(record,IDS)),firstName=text(first(record,FIRST)),lastName=text(first(record,LAST)),sourceName=text(first(record,NAME))||[firstName,lastName].filter(Boolean).join(' ')||null;
      let player=sourceId?players.byId.get(sourceId):null;if(!player&&sourceName)player=players.byName.get(sourceName.toLowerCase());
      if(player)resolved++;else{unresolved++;warnings.push(`Unresolved ${meta.category} player ${sourceId||sourceName||`record ${index+1}`} in ${batch.route_path}`)}
      const teamId=text(first(record,TEAM))||text(player?.team_external_id);
      output.push({externalKey:`${meta.category}:${canonicalStage(meta.stage)}:${meta.week}:${player?.external_id||sourceId||sourceName||index}:${teamId||'none'}`,category:meta.category,seasonYear:int(first(record,['calendarYear','seasonYear','year'])),stage:canonicalStage(meta.stage),weekIndex:meta.week,playerExternalId:text(player?.external_id)||sourceId,teamExternalId:teamId,playerName:text(player?.display_name)||sourceName,position:text(first(record,POS))||text(player?.position),metrics:flattenMetrics(record),route:batch.route_path,source:record});
    }
    const unique=[...new Map(output.map(row=>[row.externalKey,row])).values()];
    await insertRows(db,runId,leagueId,unique);
    await db.prepare(`UPDATE companion_statistics_mapping_batches SET status='complete',record_count=?,resolved_player_count=?,unresolved_player_count=?,warning_count=?,warnings_json=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(unique.length,resolved,unresolved,warnings.length,JSON.stringify(warnings),batch.id).run();
    await rebuildRunSummary(db,runId);
    const remaining=Number((await db.prepare(`SELECT COUNT(*) c FROM companion_statistics_mapping_batches WHERE mapping_run_id=? AND status='pending'`).bind(runId).first())?.c||0);
    if(!remaining){
      const failed=Number((await db.prepare(`SELECT COUNT(*) c FROM companion_statistics_mapping_batches WHERE mapping_run_id=? AND status='failed'`).bind(runId).first())?.c||0);
      await db.prepare(`UPDATE companion_statistics_mapping_runs SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(failed?'partial-preview':'pending-preview',runId).run();
    }
    return{complete:remaining===0,processed:{routePath:batch.route_path,category:meta.category,records:unique.length,warnings:warnings.length}};
  }catch(error){
    await db.prepare(`UPDATE companion_statistics_mapping_batches SET status='failed',warning_count=1,warnings_json=?,error_json=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify([`Failed ${batch.route_path}: ${error?.message||String(error)}`]),JSON.stringify({message:error?.message||String(error)}),batch.id).run();
    await rebuildRunSummary(db,runId);
    throw error;
  }
}

async function authorizedContext(context){
  const slug=normalizeLeagueSlug(context);if(!validLeagueSlug(slug))return{response:json({ok:false,error:'Invalid league slug.'},400)};
  const auth=await requirePlatformOwner(context);if(!auth.authorized)return{response:auth.response};
  const db=database(context.env),league=await resolveLeague(context.env,slug);if(!db||!league||auth.session.membership?.leagueId!==league.id)return{response:json({ok:false,error:'Not found.'},404)};
  await ensureStatisticsSchema(db);
  return{db,league};
}
export async function onRequestGet(context){
  const state=await authorizedContext(context);if(state.response)return state.response;
  const preview=await latestRun(state.db,state.league.id,true);
  return json({ok:true,release:RELEASE,previewAvailable:Boolean(preview?.mappingRun?.recordCount),...(preview||{}),activeSnapshotChanged:false,activationPerformed:false});
}
export async function onRequestPost(context){
  const state=await authorizedContext(context);if(state.response)return state.response;
  try{
    const body=await readBody(context.request),action=String(body.action||'start').toLowerCase();
    if(action==='start'){
      const runId=await startRun(state.db,state.league.id),run=await state.db.prepare(`SELECT * FROM companion_statistics_mapping_runs WHERE id=?`).bind(runId).first();
      return json({ok:true,release:RELEASE,action:'start',...(await runPublic(state.db,run)),complete:false,activeSnapshotChanged:false,activationPerformed:false});
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
