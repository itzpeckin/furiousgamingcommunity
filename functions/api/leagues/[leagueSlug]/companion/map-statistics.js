import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE='5.9.5.1.6';
const DEFAULT_OWNER_ACCOUNT_ID='owner-tb';

// Madden Companion weekly export tables:
// schedules, defense, kicking, punting, passing, receiving, rushing, teamstats.
const WEEKLY_ROUTE=/\/week\/(pre|reg|post)\/(\d+)\/(defense|kicking|punting|passing|receiving|rushing|team)\/?$/i;
const PLAYER_CATEGORIES=new Set(['passing','rushing','receiving','defense','kicking','punting']);
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
  'position','positionAbbr','pos',
  'gameId','gameID','scheduleId','scheduleID','eventId','game_id','schedule_id'
]);

function ownerAccountId(env){return String(env.PLATFORM_OWNER_ACCOUNT_ID||DEFAULT_OWNER_ACCOUNT_ID).trim();}
async function requirePlatformOwner(context){
  const auth=await requireCommissioner(context);
  if(!auth.authorized)return auth;
  const presented=String(context.request.headers.get('x-franchisehq-platform-owner-account-id')||'').trim();
  if(!presented||presented!==ownerAccountId(context.env)){
    return{authorized:false,response:json({ok:false,error:'Not found.'},404)};
  }
  return auth;
}

function own(o,k){return o&&Object.prototype.hasOwnProperty.call(o,k);}
function first(r,a){
  for(const k of a){
    if(own(r,k)&&r[k]!==null&&r[k]!=='')return r[k];
  }
  const keys=new Map(Object.keys(r||{}).map(k=>[k.toLowerCase(),k]));
  for(const k of a){
    const hit=keys.get(k.toLowerCase());
    if(hit&&r[hit]!==null&&r[hit]!=='')return r[hit];
  }
  return null;
}

const text=v=>v==null?null:(String(v).trim()||null);
const int=v=>Number.isFinite(Number.parseInt(v,10))?Number.parseInt(v,10):null;

function collectArrays(value,path='$',depth=0,out=[]){
  if(depth>8||value==null)return out;
  if(Array.isArray(value)){
    out.push({path,records:value});
    return out;
  }
  if(typeof value==='object'){
    for(const[k,v]of Object.entries(value))collectArrays(v,`${path}.${k}`,depth+1,out);
  }
  return out;
}

function playerSignal(record={}){
  return first(record,IDS)!=null||first(record,NAME)!=null||first(record,FIRST)!=null;
}

function teamSignal(record={}){
  return first(record,TEAM)!=null;
}

function choose(payload,category){
  const collections=collectArrays(payload)
    .map(item=>({
      ...item,
      objects:item.records.filter(v=>v&&typeof v==='object'&&!Array.isArray(v))
    }))
    .filter(item=>item.objects.length);

  collections.sort((a,b)=>{
    const aRows=a.objects.slice(0,32);
    const bRows=b.objects.slice(0,32);
    const scorer=category===TEAMSTATS_CATEGORY ? teamSignal : playerSignal;
    const as=aRows.filter(scorer).length;
    const bs=bRows.filter(scorer).length;
    return bs-as||b.objects.length-a.objects.length;
  });

  return collections[0]||null;
}

async function payload(env,capture){
  const obj=await env.COMPANION_EXPORTS.get(capture.r2_object_key);
  if(!obj)throw new Error(`Payload missing in R2 for ${capture.route_path}.`);
  const raw=new TextDecoder().decode(await obj.arrayBuffer()).trim();
  if(!raw)throw new Error(`Payload empty for ${capture.route_path}.`);
  return JSON.parse(raw);
}

function routeMeta(path){
  const match=String(path||'').match(WEEKLY_ROUTE);
  if(!match)return null;
  return{
    stage:match[1].toLowerCase(),
    week:int(match[2]),
    category:match[3].toLowerCase()
  };
}

function stage(value){
  return value==='pre'?'preseason':value==='post'?'playoffs':'regular-season';
}

// Preserve every primitive Team Stats field. Also flatten nested objects so an
// EA schema change does not silently drop a useful team metric.
function flattenMetrics(record={},prefix='',out={}){
  for(const [key,value] of Object.entries(record||{})){
    if(META.has(key)&&!prefix)continue;
    const name=prefix?`${prefix}.${key}`:key;
    if(value===null||value===undefined)continue;

    if(Array.isArray(value)){
      continue;
    }

    if(typeof value==='object'){
      flattenMetrics(value,name,out);
      continue;
    }

    if(
      typeof value==='number'
      || typeof value==='boolean'
      || (typeof value==='string'&&value.trim()!=='')
    ){
      out[name]=value;
      // Also preserve the leaf key when it is not already present. This makes
      // app-side aliases resilient to nested source structures.
      if(prefix && !Object.prototype.hasOwnProperty.call(out,key)) out[key]=value;
    }
  }
  return out;
}

async function captures(db,leagueId){
  const result=await db.prepare(`
    SELECT id capture_id, discovery_session_id, route_path, r2_object_key, received_at
    FROM companion_route_captures
    WHERE league_id=? AND route_path LIKE '%/week/%'
    ORDER BY received_at DESC
  `).bind(leagueId).all();

  const latest=new Map();
  for(const row of result.results||[]){
    if(!WEEKLY_ROUTE.test(row.route_path))continue;
    if(!latest.has(row.route_path))latest.set(row.route_path,row);
  }
  return [...latest.values()].sort((a,b)=>a.route_path.localeCompare(b.route_path));
}

async function playerIndex(db,leagueId){
  const run=await db.prepare(`
    SELECT id FROM companion_player_mapping_runs
    WHERE league_id=? AND status='pending-preview'
    ORDER BY created_at DESC LIMIT 1
  `).bind(leagueId).first();

  const byId=new Map(),byName=new Map();
  if(!run)return{byId,byName};

  const result=await db.prepare(`
    SELECT external_id,team_external_id,display_name,first_name,last_name,position
    FROM companion_canonical_players_preview
    WHERE league_id=? AND mapping_run_id=?
  `).bind(leagueId,run.id).all();

  for(const player of result.results||[]){
    byId.set(String(player.external_id),player);
    const name=String(
      player.display_name||`${player.first_name||''} ${player.last_name||''}`
    ).trim().toLowerCase();
    if(name&&!byName.has(name))byName.set(name,player);
  }
  return{byId,byName};
}

async function latestRun(db,leagueId){
  const run=await db.prepare(`
    SELECT * FROM companion_statistics_mapping_runs
    WHERE league_id=?
    ORDER BY created_at DESC LIMIT 1
  `).bind(leagueId).first();

  if(!run)return null;

  const result=await db.prepare(`
    SELECT * FROM companion_canonical_statistics_preview
    WHERE league_id=? AND mapping_run_id=?
    ORDER BY category,stage,week_index,player_name,team_external_id,external_key
  `).bind(leagueId,run.id).all();

  return{
    mappingRun:{
      id:run.id,
      status:run.status,
      routeCount:run.route_count,
      recordCount:run.record_count,
      resolvedPlayerCount:run.resolved_player_count,
      unresolvedPlayerCount:run.unresolved_player_count,
      categorySummary:JSON.parse(run.category_summary_json||'{}'),
      warningCount:run.warning_count,
      warnings:JSON.parse(run.warnings_json||'[]'),
      createdAt:run.created_at
    },
    statistics:(result.results||[]).map(row=>({
      externalKey:row.external_key,
      category:row.category,
      seasonYear:row.season_year,
      stage:row.stage,
      weekIndex:row.week_index,
      playerExternalId:row.player_external_id,
      teamExternalId:row.team_external_id,
      playerName:row.player_name,
      position:row.position,
      metrics:JSON.parse(row.metrics_json||'{}'),
      sourceRoutePath:row.source_route_path
    }))
  };
}

export async function onRequestGet(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);

  const auth=await requirePlatformOwner(context);
  if(!auth.authorized)return auth.response;

  const db=database(context.env);
  const league=await resolveLeague(context.env,slug);
  if(!db||!league||auth.session.membership?.leagueId!==league.id){
    return json({ok:false,error:'Not found.'},404);
  }

  const preview=await latestRun(db,league.id);
  return json({
    ok:true,
    release:RELEASE,
    previewAvailable:Boolean(preview),
    ...(preview||{}),
    activeSnapshotChanged:false,
    activationPerformed:false
  });
}

export async function onRequestPost(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);

  const auth=await requirePlatformOwner(context);
  if(!auth.authorized)return auth.response;

  const db=database(context.env);
  const league=await resolveLeague(context.env,slug);
  if(!db||!league||auth.session.membership?.leagueId!==league.id){
    return json({ok:false,error:'Not found.'},404);
  }

  try{
    const rows=await captures(db,league.id);
    if(!rows.length){
      return json({ok:false,error:'No weekly statistics datasets were captured.'},422);
    }

    const players=await playerIndex(db,league.id);
    const output=[],warnings=[],summary={},routeDiagnostics=[];

    for(const capture of rows){
      const meta=routeMeta(capture.route_path);
      if(!meta)continue;

      const data=await payload(context.env,capture);
      const collection=choose(data,meta.category);
      if(!collection){
        warnings.push(`No ${meta.category} collection found in ${capture.route_path}`);
        continue;
      }

      if(meta.category===TEAMSTATS_CATEGORY){
        let mapped=0,ignored=0;

        for(let index=0;index<collection.objects.length;index++){
          const record=collection.objects[index];
          const teamId=text(first(record,TEAM));
          if(!teamId){
            ignored++;
            continue;
          }

          const year=int(first(record,['calendarYear','seasonYear','year']));
          const gameId=text(first(record,GAME_IDS));
          const values=flattenMetrics(record);

          // Explicitly retain identifying context inside metrics as well.
          if(gameId){values.__gameId=gameId;values.scheduleId=gameId;}
          values.__sourceCategory='team';

          output.push({
            externalKey:`team:${stage(meta.stage)}:${meta.week}:${teamId}:${gameId||index}`,
            category:'team-game',
            seasonYear:year,
            stage:stage(meta.stage),
            weekIndex:meta.week,
            playerExternalId:null,
            teamExternalId:teamId,
            playerName:null,
            position:null,
            metrics:values,
            route:capture.route_path,
            source:record,
            resolved:true
          });
          mapped++;
          summary['team-game']=(summary['team-game']||0)+1;
        }

        routeDiagnostics.push({
          route:capture.route_path,
          sourceCategory:'team',
          canonicalCategory:'team-game',
          collectionPath:collection.path,
          sourceRecords:collection.objects.length,
          mappedTeamRows:mapped,
          ignoredRows:ignored
        });
        continue;
      }

      // Existing player categories.
      let mappedPlayers=0,unresolvedPlayers=0;
      for(let index=0;index<collection.objects.length;index++){
        const record=collection.objects[index];
        const sourceId=text(first(record,IDS));
        const firstName=text(first(record,FIRST));
        const lastName=text(first(record,LAST));
        const sourceName=text(first(record,NAME))
          ||[firstName,lastName].filter(Boolean).join(' ')
          ||null;

        let player=sourceId?players.byId.get(sourceId):null;
        if(!player&&sourceName)player=players.byName.get(sourceName.toLowerCase());

        if(!player){
          unresolvedPlayers++;
          warnings.push(
            `Unresolved ${meta.category} player ${sourceId||sourceName||`record ${index+1}`} in ${capture.route_path}`
          );
        }

        const teamId=text(first(record,TEAM))||text(player?.team_external_id);
        const year=int(first(record,['calendarYear','seasonYear','year']));

        output.push({
          externalKey:`${meta.category}:${stage(meta.stage)}:${meta.week}:${player?.external_id||sourceId||sourceName||index}:${teamId||'none'}`,
          category:meta.category,
          seasonYear:year,
          stage:stage(meta.stage),
          weekIndex:meta.week,
          playerExternalId:text(player?.external_id)||sourceId,
          teamExternalId:teamId,
          playerName:text(player?.display_name)||sourceName,
          position:text(first(record,POS))||text(player?.position),
          metrics:flattenMetrics(record),
          route:capture.route_path,
          source:record,
          resolved:Boolean(player)
        });

        mappedPlayers++;
        summary[meta.category]=(summary[meta.category]||0)+1;
      }

      routeDiagnostics.push({
        route:capture.route_path,
        sourceCategory:meta.category,
        canonicalCategory:meta.category,
        collectionPath:collection.path,
        sourceRecords:collection.objects.length,
        mappedPlayerRows:mappedPlayers,
        unresolvedPlayerRows:unresolvedPlayers
      });
    }

    const unique=new Map();
    for(const row of output)unique.set(row.externalKey,row);
    const final=[...unique.values()];

    const playerRows=final.filter(row=>row.playerExternalId);
    const resolvedPlayers=playerRows.filter(row=>row.resolved).length;
    const unresolvedPlayers=playerRows.length-resolvedPlayers;
    const teamGameRows=final.filter(row=>row.category==='team-game');

    const runId=crypto.randomUUID();

    await db.prepare(`
      INSERT INTO companion_statistics_mapping_runs
      (id,league_id,discovery_session_id,status,route_count,record_count,
       resolved_player_count,unresolved_player_count,category_summary_json,
       warning_count,warnings_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      runId,
      league.id,
      rows[0]?.discovery_session_id||'aggregated-stat-routes',
      'pending-preview',
      rows.length,
      final.length,
      resolvedPlayers,
      unresolvedPlayers,
      JSON.stringify(summary),
      warnings.length,
      JSON.stringify(warnings)
    ).run();

    const sql=`
      INSERT INTO companion_canonical_statistics_preview
      (mapping_run_id,league_id,external_key,category,season_year,stage,week_index,
       player_external_id,team_external_id,player_name,position,metrics_json,
       source_route_path,source_record_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;

    const statements=final.map(row=>db.prepare(sql).bind(
      runId,
      league.id,
      row.externalKey,
      row.category,
      row.seasonYear,
      row.stage,
      row.weekIndex,
      row.playerExternalId,
      row.teamExternalId,
      row.playerName,
      row.position,
      JSON.stringify(row.metrics),
      row.route,
      JSON.stringify(row.source)
    ));

    for(let offset=0;offset<statements.length;offset+=75){
      await db.batch(statements.slice(offset,offset+75));
    }

    const preview=await latestRun(db,league.id);

    return json({
      ok:true,
      release:RELEASE,
      previewAvailable:true,
      ...preview,
      teamStats:{
        route:'/week/{stage}/{week}/team',
        capturedRouteCount:routeDiagnostics.filter(x=>x.sourceCategory==='team').length,
        recordCount:teamGameRows.length
      },
      routeDiagnostics,
      activeSnapshotChanged:false,
      activationPerformed:false
    });

  }catch(error){
    return json({
      ok:false,
      error:'Statistics mapping failed.',
      detail:error?.message||String(error),
      release:RELEASE
    },500);
  }
}
