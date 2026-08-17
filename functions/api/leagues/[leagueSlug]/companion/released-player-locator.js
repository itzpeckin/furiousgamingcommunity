import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE='5.9.10.6.4.3';
const DEFAULT_NAMES=['Colby Wooden','Neville Gallimore','Logan Hall'];
const ID_KEYS=['playerId','playerID','player_id','rosterId','rosterID','roster_id','assetId','assetID','presentationId','id'];
const NAME_KEYS=['displayName','fullName','playerName','name'];
const TEAM_KEYS=['teamId','teamID','team_id','teamExternalId','team_external_id','teamAbbr','team'];
const STATUS_KEYS=['status','rosterStatus','roster_status','isFreeAgent','isActive','isOnPracticeSquad','isOnIR'];

const clean=v=>v==null?'':String(v).trim();
const lower=v=>clean(v).toLowerCase();
const parse=v=>{try{return JSON.parse(v||'')}catch{return null}};

async function state(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return{response:json({ok:false,error:'Invalid league slug.',release:RELEASE},400)};
  const auth=await requireCommissioner(context);
  if(!auth.authorized)return{response:auth.response};
  const db=database(context.env),league=db?await resolveLeague(context.env,slug):null;
  if(!db||!league||auth.session.membership?.leagueId!==league.id)return{response:json({ok:false,error:'Not found.',release:RELEASE},404)};
  if(!context.env.COMPANION_EXPORTS)return{response:json({ok:false,error:'COMPANION_EXPORTS binding unavailable.',release:RELEASE},503)};
  return{db,league,slug};
}

function playerName(raw={}){
  for(const key of NAME_KEYS){const value=clean(raw?.[key]);if(value)return value;}
  return [clean(raw?.firstName??raw?.first_name),clean(raw?.lastName??raw?.last_name)].filter(Boolean).join(' ');
}
function playerId(raw={},fallback=''){
  for(const key of ID_KEYS){const value=clean(raw?.[key]);if(value)return value;}
  return clean(fallback);
}
function fieldSubset(raw={}){
  const out={};
  for(const key of [...ID_KEYS,...NAME_KEYS,...TEAM_KEYS,...STATUS_KEYS,'firstName','lastName','first_name','last_name','position','overall','overallRating','playerBestOvr','age','devTrait','contractYearsLeft']){
    if(raw?.[key]!==undefined)out[key]=raw[key];
  }
  return out;
}

async function historicalCandidates(db,leagueId,names){
  const targets=new Map(names.map(name=>[lower(name),{name,ids:new Set(),states:[]}])) ;
  const clauses=names.map(()=>`LOWER(data_json) LIKE ?`).join(' OR ');
  const params=[leagueId,...names.map(name=>`%${lower(name)}%`)];
  const result=await db.prepare(`SELECT r.snapshot_id,r.external_id,r.data_json,s.season_year,s.week_index,s.created_at
    FROM league_snapshot_records r
    LEFT JOIN league_snapshots s ON s.id=r.snapshot_id AND s.league_id=r.league_id
    WHERE r.league_id=? AND r.domain='players' AND (${clauses})
    ORDER BY s.created_at DESC LIMIT 250`).bind(...params).all();

  for(const row of result.results||[]){
    const raw=parse(row.data_json)||{};
    const name=playerName(raw);
    const target=targets.get(lower(name));
    if(!target)continue;
    const id=playerId(raw,row.external_id);
    if(id)target.ids.add(id);
    target.states.push({
      snapshotId:row.snapshot_id,
      season:row.season_year==null?null:Number(row.season_year),
      week:row.week_index==null?null:Number(row.week_index),
      createdAt:row.created_at,
      playerId:id||null,
      teamId:clean(raw.team_external_id??raw.teamId??raw.team_id)||null,
      rosterStatus:clean(raw.roster_status??raw.rosterStatus??raw.status)||null,
      position:clean(raw.position)||null
    });
  }

  // Also consult the persistent historical-state table when 6.4.x has populated it.
  const table=await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='canonical_historical_player_states'`).first();
  if(table){
    const marks=names.map(()=>'?').join(',');
    const rows=await db.prepare(`SELECT * FROM canonical_historical_player_states
      WHERE league_id=? AND LOWER(player_name) IN (${marks}) ORDER BY created_at DESC`)
      .bind(leagueId,...names.map(lower)).all();
    for(const row of rows.results||[]){
      const target=targets.get(lower(row.player_name));if(!target)continue;
      if(row.player_id)target.ids.add(String(row.player_id));
      target.states.push({snapshotId:row.snapshot_id,season:null,week:null,createdAt:row.created_at,playerId:String(row.player_id),teamId:clean(row.team_id)||null,rosterStatus:clean(row.roster_status)||null,position:clean(row.position)||null});
    }
  }

  return [...targets.values()].map(target=>({
    name:target.name,
    playerIds:[...target.ids],
    lastKnownStates:target.states.slice(0,8)
  }));
}

function targetMatchesObject(raw,targets){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return[];
  const id=playerId(raw);
  const name=playerName(raw);
  const matched=[];
  for(const target of targets){
    if((id&&target.playerIds.includes(id)) || (name&&lower(name)===lower(target.name)))matched.push(target.name);
  }
  return matched;
}

function findObjects(value,targets,path='root',depth=0,out=[]){
  if(depth>9||out.length>50)return out;
  if(Array.isArray(value)){
    for(let i=0;i<value.length&&out.length<=50;i++)findObjects(value[i],targets,`${path}[${i}]`,depth+1,out);
    return out;
  }
  if(!value||typeof value!=='object')return out;
  const names=targetMatchesObject(value,targets);
  if(names.length)out.push({path,targets:names,player:fieldSubset(value)});
  for(const [key,child] of Object.entries(value)){
    if(child&&typeof child==='object')findObjects(child,targets,`${path}.${key}`,depth+1,out);
  }
  return out;
}

export async function onRequestGet(context){
  const s=await state(context);if(s.response)return s.response;
  const url=new URL(context.request.url);
  const names=(url.searchParams.get('names')||DEFAULT_NAMES.join('|')).split('|').map(clean).filter(Boolean).slice(0,10);
  const resolved=await historicalCandidates(s.db,s.league.id,names);
  const count=Number((await s.db.prepare(`SELECT COUNT(*) c FROM companion_route_captures WHERE league_id=?`).bind(s.league.id).first())?.c||0);
  return json({ok:true,release:RELEASE,names,resolved,captureCount:count,recommendedBatchSize:15});
}

export async function onRequestPost(context){
  const s=await state(context);if(s.response)return s.response;
  let body={};try{body=await context.request.json()}catch{}
  const names=Array.isArray(body.names)?body.names.map(clean).filter(Boolean).slice(0,10):DEFAULT_NAMES;
  const targets=Array.isArray(body.targets)&&body.targets.length?body.targets:await historicalCandidates(s.db,s.league.id,names);
  const offset=Math.max(0,Number(body.offset)||0),limit=Math.max(5,Math.min(25,Number(body.limit)||15));
  const rows=(await s.db.prepare(`SELECT id,route_path,r2_object_key,received_at,byte_length,discovery_session_id
    FROM companion_route_captures WHERE league_id=? ORDER BY received_at DESC LIMIT ? OFFSET ?`)
    .bind(s.league.id,limit,offset).all()).results||[];

  const needles=[];
  for(const target of targets){
    for(const id of target.playerIds||[])if(id)needles.push({target:target.name,value:String(id)});
    if(target.name)needles.push({target:target.name,value:String(target.name)});
  }

  const matches=[];
  for(const row of rows){
    const object=await context.env.COMPANION_EXPORTS.get(row.r2_object_key);
    if(!object)continue;
    const raw=await object.text();
    const rawLower=raw.toLowerCase();
    const hitTargets=[...new Set(needles.filter(n=>rawLower.includes(n.value.toLowerCase())).map(n=>n.target))];
    if(!hitTargets.length)continue;
    const payload=parse(raw);
    const objectMatches=payload?findObjects(payload,targets):[];
    matches.push({
      captureId:row.id,
      routePath:row.route_path,
      receivedAt:row.received_at,
      discoverySessionId:row.discovery_session_id,
      byteLength:Number(row.byte_length||0),
      rawHitTargets:hitTargets,
      objectMatches
    });
  }

  const total=Number((await s.db.prepare(`SELECT COUNT(*) c FROM companion_route_captures WHERE league_id=?`).bind(s.league.id).first())?.c||0);
  const nextOffset=offset+rows.length;
  return json({ok:true,release:RELEASE,offset,scanned:rows.length,total,nextOffset,complete:nextOffset>=total,matches});
}
