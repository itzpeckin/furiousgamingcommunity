import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE='5.9.5.1.4',DEFAULT_OWNER_ACCOUNT_ID='owner-tb';

// Madden Companion posts weekly data to /week/{stage}/{week}/{stat}.  Do not
// hard-code only the known player categories: team/game summary stats can be
// delivered as an additional weekly stat dataset.
const WEEKLY_ROUTE=/\/week\/(pre|reg|post)\/(\d+)\/([^/]+)\/?$/i;
const PLAYER_CATEGORIES=new Set(['passing','rushing','receiving','defense','kicking','punting']);
const EXCLUDED_CATEGORIES=new Set(['schedules','schedule']);

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

const TEAM_STAT_KEY=/first.?down|third.?down|red.?zone|turnover|giveaway|possess|penalt|total.?off|offen.*yard|pass.*yard|rush.*yard|total.?yard/i;

function ownerAccountId(env){return String(env.PLATFORM_OWNER_ACCOUNT_ID||DEFAULT_OWNER_ACCOUNT_ID).trim();}
async function requirePlatformOwner(context){
  const auth=await requireCommissioner(context);
  if(!auth.authorized)return auth;
  const presented=String(context.request.headers.get('x-franchisehq-platform-owner-account-id')||'').trim();
  if(!presented||presented!==ownerAccountId(context.env))return{authorized:false,response:json({ok:false,error:'Not found.'},404)};
  return auth;
}
function own(o,k){return o&&Object.prototype.hasOwnProperty.call(o,k);}
function first(r,a){
  for(const k of a)if(own(r,k)&&r[k]!==null&&r[k]!=='')return r[k];
  const keys=new Map(Object.keys(r||{}).map(k=>[k.toLowerCase(),k]));
  for(const k of a){const hit=keys.get(k.toLowerCase());if(hit&&r[hit]!==null&&r[hit]!=='')return r[hit];}
  return null;
}
const text=v=>v==null?null:(String(v).trim()||null);
const int=v=>Number.isFinite(Number.parseInt(v,10))?Number.parseInt(v,10):null;

function collectArrays(v,path='$',depth=0,out=[]){
  if(depth>7||v==null)return out;
  if(Array.isArray(v)){out.push({path,records:v});return out;}
  if(typeof v==='object')for(const[k,x]of Object.entries(v))collectArrays(x,`${path}.${k}`,depth+1,out);
  return out;
}
function teamStatSignal(record={}){
  return Object.keys(record).filter(k=>TEAM_STAT_KEY.test(k)).length;
}
function playerSignal(record={}){
  return first(record,IDS)!=null||first(record,NAME)!=null||first(record,FIRST)!=null;
}
function teamSignal(record={}){
  return first(record,TEAM)!=null && teamStatSignal(record)>0;
}
function choose(payload,category){
  const collections=collectArrays(payload)
    .map(x=>({...x,objects:x.records.filter(v=>v&&typeof v==='object'&&!Array.isArray(v))}))
    .filter(x=>x.objects.length);

  collections.sort((a,b)=>{
    const aRows=a.objects.slice(0,16),bRows=b.objects.slice(0,16);
    const playerMode=PLAYER_CATEGORIES.has(category);
    const as=aRows.filter(r=>playerMode?playerSignal(r):teamSignal(r)||playerSignal(r)).length;
    const bs=bRows.filter(r=>playerMode?playerSignal(r):teamSignal(r)||playerSignal(r)).length;
    const aTeam=aRows.reduce((n,r)=>n+teamStatSignal(r),0);
    const bTeam=bRows.reduce((n,r)=>n+teamStatSignal(r),0);
    return bs-as||bTeam-aTeam||b.objects.length-a.objects.length;
  });
  return collections[0]||null;
}
async function payload(env,c){
  const obj=await env.COMPANION_EXPORTS.get(c.r2_object_key);
  if(!obj)throw new Error(`Payload missing in R2 for ${c.route_path}.`);
  const raw=new TextDecoder().decode(await obj.arrayBuffer()).trim();
  if(!raw)throw new Error(`Payload empty for ${c.route_path}.`);
  return JSON.parse(raw);
}
function routeMeta(path){
  const m=String(path).match(WEEKLY_ROUTE);
  if(!m)return null;
  return{stage:m[1].toLowerCase(),week:int(m[2]),category:m[3].toLowerCase()};
}
function stage(v){return v==='pre'?'preseason':v==='post'?'playoffs':'regular-season';}
function metrics(record){
  const out={};
  for(const[k,v]of Object.entries(record||{})){
    if(META.has(k)||v==null||typeof v==='object')continue;
    if(typeof v==='number'||typeof v==='boolean'||(typeof v==='string'&&v.trim()!==''))out[k]=v;
  }
  return out;
}
function isTeamSummary(record,category){
  if(PLAYER_CATEGORIES.has(category))return false;
  return teamSignal(record) && !playerSignal(record);
}
async function captures(db,leagueId){
  const r=await db.prepare(`SELECT id capture_id,discovery_session_id,route_path,r2_object_key,received_at
    FROM companion_route_captures
    WHERE league_id=? AND route_path LIKE '%/week/%'
    ORDER BY received_at DESC`).bind(leagueId).all();

  const latest=new Map();
  for(const row of r.results||[]){
    const meta=routeMeta(row.route_path);
    if(!meta||EXCLUDED_CATEGORIES.has(meta.category))continue;
    if(!latest.has(row.route_path))latest.set(row.route_path,row);
  }
  return[...latest.values()].sort((a,b)=>a.route_path.localeCompare(b.route_path));
}
async function playerIndex(db,leagueId){
  const run=await db.prepare(`SELECT id FROM companion_player_mapping_runs WHERE league_id=? AND status='pending-preview' ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();
  const byId=new Map(),byName=new Map();
  if(!run)return{byId,byName};
  const r=await db.prepare(`SELECT external_id,team_external_id,display_name,first_name,last_name,position
    FROM companion_canonical_players_preview WHERE league_id=? AND mapping_run_id=?`).bind(leagueId,run.id).all();
  for(const p of r.results||[]){
    byId.set(String(p.external_id),p);
    const n=String(p.display_name||`${p.first_name||''} ${p.last_name||''}`).trim().toLowerCase();
    if(n&&!byName.has(n))byName.set(n,p);
  }
  return{byId,byName};
}
async function latestRun(db,leagueId){
  const run=await db.prepare(`SELECT * FROM companion_statistics_mapping_runs WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();
  if(!run)return null;
  const r=await db.prepare(`SELECT * FROM companion_canonical_statistics_preview WHERE league_id=? AND mapping_run_id=? ORDER BY category,stage,week_index,player_name,external_key`).bind(leagueId,run.id).all();
  return{
    mappingRun:{
      id:run.id,status:run.status,routeCount:run.route_count,recordCount:run.record_count,
      resolvedPlayerCount:run.resolved_player_count,unresolvedPlayerCount:run.unresolved_player_count,
      categorySummary:JSON.parse(run.category_summary_json||'{}'),
      warningCount:run.warning_count,warnings:JSON.parse(run.warnings_json||'[]'),createdAt:run.created_at
    },
    statistics:(r.results||[]).map(x=>({
      externalKey:x.external_key,category:x.category,seasonYear:x.season_year,stage:x.stage,weekIndex:x.week_index,
      playerExternalId:x.player_external_id,teamExternalId:x.team_external_id,playerName:x.player_name,position:x.position,
      metrics:JSON.parse(x.metrics_json||'{}'),sourceRoutePath:x.source_route_path
    }))
  };
}

export async function onRequestGet(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);
  const auth=await requirePlatformOwner(context);if(!auth.authorized)return auth.response;
  const db=database(context.env),league=await resolveLeague(context.env,slug);
  if(!db||!league||auth.session.membership?.leagueId!==league.id)return json({ok:false,error:'Not found.'},404);
  const preview=await latestRun(db,league.id);
  return json({ok:true,release:RELEASE,previewAvailable:Boolean(preview),...(preview||{}),activeSnapshotChanged:false,activationPerformed:false});
}

export async function onRequestPost(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);
  const auth=await requirePlatformOwner(context);if(!auth.authorized)return auth.response;
  const db=database(context.env),league=await resolveLeague(context.env,slug);
  if(!db||!league||auth.session.membership?.leagueId!==league.id)return json({ok:false,error:'Not found.'},404);

  try{
    const rows=await captures(db,league.id);
    if(!rows.length)return json({ok:false,error:'No weekly statistics datasets were captured.'},422);

    const players=await playerIndex(db,league.id);
    if(!players.byId.size)return json({ok:false,error:'Map players before mapping statistics.'},422);

    const output=[],warnings=[],summary={},routeDiagnostics=[];

    for(const c of rows){
      const meta=routeMeta(c.route_path);
      const data=await payload(context.env,c);
      const collection=choose(data,meta.category);
      if(!collection){
        warnings.push(`No statistic collection found in ${c.route_path}`);
        continue;
      }

      let playerRows=0,teamRows=0,ignoredRows=0;
      for(let i=0;i<collection.objects.length;i++){
        const record=collection.objects[i];
        const teamSummary=isTeamSummary(record,meta.category);

        if(teamSummary){
          const teamId=text(first(record,TEAM));
          if(!teamId){ignoredRows++;continue;}
          const year=int(first(record,['calendarYear','seasonYear','year']));
          const gameId=text(first(record,GAME_IDS));
          const metricValues=metrics(record);
          const externalKey=`team:${stage(meta.stage)}:${meta.week}:${teamId}:${meta.category}:${gameId||i}`;
          output.push({
            externalKey,
            category:'team-game',
            seasonYear:year,
            stage:stage(meta.stage),
            weekIndex:meta.week,
            playerExternalId:null,
            teamExternalId:teamId,
            playerName:null,
            position:null,
            metrics:{...metricValues,__sourceCategory:meta.category,__gameId:gameId},
            route:c.route_path,
            source:record,
            resolved:true
          });
          teamRows++;
          summary['team-game']=(summary['team-game']||0)+1;
          continue;
        }

        // Existing player-stat mapping remains intact.
        const sourceId=text(first(record,IDS));
        const fname=text(first(record,FIRST)),lname=text(first(record,LAST));
        const sourceName=text(first(record,NAME))||[fname,lname].filter(Boolean).join(' ')||null;
        let player=sourceId?players.byId.get(sourceId):null;
        if(!player&&sourceName)player=players.byName.get(sourceName.toLowerCase());

        // Unknown non-player datasets are ignored instead of generating hundreds of false unresolved-player warnings.
        if(!PLAYER_CATEGORIES.has(meta.category) && !player && !sourceName){
          ignoredRows++;
          continue;
        }

        if(!player)warnings.push(`Unresolved ${meta.category} player ${sourceId||sourceName||`record ${i+1}`} in ${c.route_path}`);
        const teamId=text(first(record,TEAM))||text(player?.team_external_id);
        const year=int(first(record,['calendarYear','seasonYear','year']));
        const externalKey=`${meta.category}:${stage(meta.stage)}:${meta.week}:${player?.external_id||sourceId||sourceName||i}:${teamId||'none'}`;

        output.push({
          externalKey,category:meta.category,seasonYear:year,stage:stage(meta.stage),weekIndex:meta.week,
          playerExternalId:text(player?.external_id)||sourceId,teamExternalId:teamId,
          playerName:text(player?.display_name)||sourceName,position:text(first(record,POS))||text(player?.position),
          metrics:metrics(record),route:c.route_path,source:record,resolved:Boolean(player)
        });
        playerRows++;
        summary[meta.category]=(summary[meta.category]||0)+1;
      }

      routeDiagnostics.push({
        route:c.route_path,category:meta.category,collectionPath:collection.path,
        recordCount:collection.objects.length,playerRows,teamRows,ignoredRows
      });
    }

    const unique=new Map();
    for(const x of output)unique.set(x.externalKey,x);
    const final=[...unique.values()];
    const runId=crypto.randomUUID();
    const playerRecords=final.filter(x=>x.playerExternalId);
    const resolved=playerRecords.filter(x=>x.resolved).length;
    const unresolved=playerRecords.length-resolved;

    await db.prepare(`INSERT INTO companion_statistics_mapping_runs
      (id,league_id,discovery_session_id,status,route_count,record_count,resolved_player_count,unresolved_player_count,category_summary_json,warning_count,warnings_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(runId,league.id,rows[0]?.discovery_session_id||'aggregated-stat-routes','pending-preview',
        rows.length,final.length,resolved,unresolved,JSON.stringify(summary),warnings.length,JSON.stringify(warnings)).run();

    const sql=`INSERT INTO companion_canonical_statistics_preview
      (mapping_run_id,league_id,external_key,category,season_year,stage,week_index,player_external_id,team_external_id,player_name,position,metrics_json,source_route_path,source_record_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

    const stmts=final.map(x=>db.prepare(sql).bind(
      runId,league.id,x.externalKey,x.category,x.seasonYear,x.stage,x.weekIndex,
      x.playerExternalId,x.teamExternalId,x.playerName,x.position,
      JSON.stringify(x.metrics),x.route,JSON.stringify(x.source)
    ));

    for(let i=0;i<stmts.length;i+=75)await db.batch(stmts.slice(i,i+75));

    const preview=await latestRun(db,league.id);
    return json({
      ok:true,release:RELEASE,previewAvailable:true,...preview,
      teamGameRecordCount:final.filter(x=>x.category==='team-game').length,
      routeDiagnostics,
      activeSnapshotChanged:false,activationPerformed:false
    });
  }catch(error){
    return json({ok:false,error:'Statistics mapping failed.',detail:error?.message||String(error),release:RELEASE},500);
  }
}
