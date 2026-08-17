import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE='5.9.10.6.3P.5f';
const DEFAULT_OWNER_ACCOUNT_ID='owner-tb';

const ownerAccountId=env=>String(env.PLATFORM_OWNER_ACCOUNT_ID||DEFAULT_OWNER_ACCOUNT_ID).trim();
const parse=(value,fallback=null)=>{try{return JSON.parse(value||'')}catch{return fallback}};
const text=v=>v==null?null:(String(v).trim()||null);
const WEEKLY=/\/week\/(pre|reg|post)\/(\d+)\/(defense|kicking|passing|punting|receiving|rushing|team)$/i;

async function state(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return{response:json({ok:false,error:'Invalid league slug.',release:RELEASE},400)};
  const auth=await requireCommissioner(context);
  if(!auth.authorized)return{response:auth.response};
  const presented=String(context.request.headers.get('x-franchisehq-platform-owner-account-id')||'').trim();
  if(!presented||presented!==ownerAccountId(context.env))return{response:json({ok:false,error:'Not found.'},404)};
  const db=database(context.env);
  const league=db?await resolveLeague(context.env,slug):null;
  if(!db||!league||auth.session.membership?.leagueId!==league.id)return{response:json({ok:false,error:'Not found.'},404)};
  if(!context.env.COMPANION_EXPORTS)return{response:json({ok:false,error:'COMPANION_EXPORTS binding unavailable.',release:RELEASE},503)};
  return{db,league};
}

function collectionCount(meta){
  const list=parse(meta?.collections_json,[])||[];
  return list.reduce((max,item)=>Math.max(max,Number(item?.count||0)),0);
}

async function payloadSummary(env,row){
  const obj=await env.COMPANION_EXPORTS.get(row.r2_object_key);
  if(!obj)return{exists:false,actualByteLength:0,jsonParsed:false,topLevelKeys:[],arrayFields:[]};
  const raw=new TextDecoder().decode(await obj.arrayBuffer()).trim();
  let parsed=null;
  try{parsed=JSON.parse(raw)}catch{}
  const arrayFields=[];
  if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){
    for(const [key,value] of Object.entries(parsed)){
      if(Array.isArray(value))arrayFields.push({key,count:value.length});
    }
  }
  return{
    exists:true,
    actualByteLength:raw.length,
    jsonParsed:parsed!==null,
    success:parsed?.success??null,
    message:parsed?.message??null,
    topLevelKeys:parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?Object.keys(parsed):[],
    arrayFields
  };
}

export async function onRequestGet(context){
  const s=await state(context);if(s.response)return s.response;
  const url=new URL(context.request.url);
  const category=text(url.searchParams.get('category'))||'passing';
  const stage=text(url.searchParams.get('stage'))||'reg';
  const from=Math.max(1,Number(url.searchParams.get('from')||1));
  const to=Math.min(30,Math.max(from,Number(url.searchParams.get('to')||18)));

  const rows=(await s.db.prepare(`SELECT id,route_path,discovery_session_id,r2_object_key,payload_hash,
      byte_length,collections_json,request_headers_json,received_at
    FROM companion_route_captures
    WHERE league_id=? AND route_path LIKE ?
    ORDER BY received_at DESC`)
    .bind(s.league.id,`%/week/${stage}/%/${category}`).all()).results||[];

  const grouped=new Map();
  for(const row of rows){
    const m=String(row.route_path||'').match(WEEKLY);
    if(!m)continue;
    const week=Number(m[2]);
    if(week<from||week>to||String(m[3]).toLowerCase()!==category.toLowerCase())continue;
    if(!grouped.has(week))grouped.set(week,[]);
    grouped.get(week).push(row);
  }

  const weeks=[];
  for(let week=from;week<=to;week++){
    const candidates=grouped.get(week)||[];
    const summaries=[];
    for(const row of candidates.slice(0,5)){
      const payload=await payloadSummary(context.env,row);
      summaries.push({
        captureId:row.id,
        routePath:row.route_path,
        receivedAt:row.received_at,
        discoverySessionId:row.discovery_session_id,
        byteLength:Number(row.byte_length||0),
        metadataCollectionCount:collectionCount(row),
        payloadHash:row.payload_hash||null,
        ...payload
      });
    }
    weeks.push({
      week,
      captureCount:candidates.length,
      newest:summaries[0]||null,
      candidates:summaries,
      hasNonEmptyCapture:summaries.some(x=>x.arrayFields.some(a=>a.count>0))
    });
  }

  const firstEmptyAfterData=(()=>{
    let sawData=false;
    for(const item of weeks){
      if(item.hasNonEmptyCapture)sawData=true;
      else if(sawData&&item.captureCount)return item.week;
    }
    return null;
  })();

  return json({
    ok:true,
    release:RELEASE,
    stage,
    category,
    from,
    to,
    firstEmptyAfterData,
    weeks
  });
}
