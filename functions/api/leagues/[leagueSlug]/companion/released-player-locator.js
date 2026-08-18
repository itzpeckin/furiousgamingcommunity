import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE='5.9.10.6.4.6';
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
  return{db,league};
}

function playerName(raw={}){
  for(const key of NAME_KEYS){const v=clean(raw?.[key]);if(v)return v;}
  return [clean(raw?.firstName??raw?.first_name),clean(raw?.lastName??raw?.last_name)].filter(Boolean).join(' ');
}
function playerIds(raw={},fallback=''){
  const ids=[];
  for(const key of ID_KEYS){const v=clean(raw?.[key]);if(v&&!ids.includes(v))ids.push(v);}
  const f=clean(fallback);if(f&&!ids.includes(f))ids.push(f);
  return ids;
}
function fieldSubset(raw={}){
  const out={};
  for(const key of [...ID_KEYS,...NAME_KEYS,...TEAM_KEYS,...STATUS_KEYS,'firstName','lastName','first_name','last_name','position','overall','overallRating','playerBestOvr','age','devTrait','contractYearsLeft']){
    if(raw?.[key]!==undefined)out[key]=raw[key];
  }
  return out;
}
function targetMatches(raw,targets){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return[];
  const name=lower(playerName(raw));
  const ids=playerIds(raw);
  const matched=[];
  for(const target of targets){
    if(name&&name===lower(target.name)){matched.push(target.name);continue;}
    if(ids.some(id=>(target.playerIds||[]).includes(id)))matched.push(target.name);
  }
  return matched;
}
function walk(value,targets,path='root',depth=0,out=[]){
  if(depth>10||out.length>100)return out;
  if(Array.isArray(value)){
    for(let i=0;i<value.length&&out.length<100;i++)walk(value[i],targets,`${path}[${i}]`,depth+1,out);
    return out;
  }
  if(!value||typeof value!=='object')return out;
  const matched=targetMatches(value,targets);
  if(matched.length)out.push({path,targets:matched,player:fieldSubset(value)});
  for(const [k,v] of Object.entries(value))if(v&&typeof v==='object')walk(v,targets,`${path}.${k}`,depth+1,out);
  return out;
}
function mergeResolved(names,matches){
  const map=new Map(names.map(name=>[name,{name,playerIds:new Set(),historicalRosterHits:[]}]));
  for(const match of matches){
    for(const obj of match.objectMatches||[]){
      for(const name of obj.targets||[]){
        const target=map.get(name);if(!target)continue;
        for(const id of playerIds(obj.player))target.playerIds.add(id);
        target.historicalRosterHits.push({
          captureId:match.captureId,routePath:match.routePath,receivedAt:match.receivedAt,path:obj.path,player:obj.player
        });
      }
    }
  }
  return [...map.values()].map(x=>({
    name:x.name,playerIds:[...x.playerIds],historicalRosterHits:x.historicalRosterHits.slice(0,12)
  }));
}

export async function onRequestGet(context){
  const s=await state(context);if(s.response)return s.response;
  const url=new URL(context.request.url);
  const names=(url.searchParams.get('names')||DEFAULT_NAMES.join('|')).split('|').map(clean).filter(Boolean).slice(0,10);
  const rosterCount=Number((await s.db.prepare(`SELECT COUNT(*) c FROM companion_route_captures
    WHERE league_id=? AND route_path LIKE '%/team/%/roster'`).bind(s.league.id).first())?.c||0);
  const allCount=Number((await s.db.prepare(`SELECT COUNT(*) c FROM companion_route_captures WHERE league_id=?`)
    .bind(s.league.id).first())?.c||0);
  return json({ok:true,release:RELEASE,names,rosterCaptureCount:rosterCount,captureCount:allCount,recommendedBatchSize:20});
}

export async function onRequestPost(context){
  const s=await state(context);if(s.response)return s.response;
  let body={};try{body=await context.request.json()}catch{}
  const names=Array.isArray(body.names)?body.names.map(clean).filter(Boolean).slice(0,10):DEFAULT_NAMES;
  const phase=body.phase==='locate'?'locate':'resolve';
  const offset=Math.max(0,Number(body.offset)||0);
  const limit=Math.max(5,Math.min(30,Number(body.limit)||20));
  const targets=Array.isArray(body.targets)&&body.targets.length
    ? body.targets
    : names.map(name=>({name,playerIds:[]}));

  let query,args;
  if(phase==='resolve'){
    query=`SELECT id,route_path,r2_object_key,received_at,byte_length,discovery_session_id
      FROM companion_route_captures WHERE league_id=? AND route_path LIKE '%/team/%/roster'
      ORDER BY received_at DESC LIMIT ? OFFSET ?`;
    args=[s.league.id,limit,offset];
  }else{
    query=`SELECT id,route_path,r2_object_key,received_at,byte_length,discovery_session_id
      FROM companion_route_captures WHERE league_id=? ORDER BY received_at DESC LIMIT ? OFFSET ?`;
    args=[s.league.id,limit,offset];
  }
  const rows=(await s.db.prepare(query).bind(...args).all()).results||[];
  const matches=[];

  const needles=[];
  for(const target of targets){
    if(target.name)needles.push({target:target.name,value:target.name});
    for(const id of target.playerIds||[])if(id)needles.push({target:target.name,value:id});
  }

  for(const row of rows){
    const object=await context.env.COMPANION_EXPORTS.get(row.r2_object_key);
    if(!object)continue;
    const raw=await object.text();
    const hay=raw.toLowerCase();

    if(phase==='resolve'){
      const payload=parse(raw);
      const objectMatches=payload?walk(payload,targets):[];
      if(!objectMatches.length)continue;
      matches.push({
        captureId:row.id,routePath:row.route_path,receivedAt:row.received_at,
        discoverySessionId:row.discovery_session_id,byteLength:Number(row.byte_length||0),
        rawHitTargets:[...new Set(objectMatches.flatMap(x=>x.targets||[]))],
        objectMatches
      });
      continue;
    }

    const rawHitTargets=[...new Set(needles.filter(n=>hay.includes(String(n.value).toLowerCase())).map(n=>n.target))];
    if(!rawHitTargets.length)continue;
    const payload=parse(raw);
    const objectMatches=payload?walk(payload,targets):[];
    matches.push({
      captureId:row.id,routePath:row.route_path,receivedAt:row.received_at,
      discoverySessionId:row.discovery_session_id,byteLength:Number(row.byte_length||0),
      rawHitTargets,objectMatches
    });
  }

  const total=phase==='resolve'
    ? Number((await s.db.prepare(`SELECT COUNT(*) c FROM companion_route_captures
        WHERE league_id=? AND route_path LIKE '%/team/%/roster'`).bind(s.league.id).first())?.c||0)
    : Number((await s.db.prepare(`SELECT COUNT(*) c FROM companion_route_captures WHERE league_id=?`)
        .bind(s.league.id).first())?.c||0);
  const nextOffset=offset+rows.length;
  return json({
    ok:true,release:RELEASE,phase,offset,scanned:rows.length,total,nextOffset,
    complete:nextOffset>=total,matches,
    resolved:phase==='resolve'?mergeResolved(names,matches):undefined
  });
}
