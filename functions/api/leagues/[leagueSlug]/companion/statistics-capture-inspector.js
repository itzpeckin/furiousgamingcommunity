import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE='5.9.10.6.3P.5e';
const DEFAULT_OWNER_ACCOUNT_ID='owner-tb';
const MAX_PREVIEW_CHARS=4000;

const ownerAccountId=env=>String(env.PLATFORM_OWNER_ACCOUNT_ID||DEFAULT_OWNER_ACCOUNT_ID).trim();
const text=v=>v==null?null:(String(v).trim()||null);
const parse=(value,fallback=null)=>{try{return JSON.parse(value||'')}catch{return fallback}};

async function state(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return{response:json({ok:false,error:'Invalid league slug.',release:RELEASE},400)};
  const auth=await requireCommissioner(context);
  if(!auth.authorized)return{response:auth.response};
  const presented=String(context.request.headers.get('x-franchisehq-platform-owner-account-id')||'').trim();
  if(!presented||presented!==ownerAccountId(context.env)){
    return{response:json({ok:false,error:'Not found.'},404)};
  }
  const db=database(context.env);
  const league=db?await resolveLeague(context.env,slug):null;
  if(!db||!league||auth.session.membership?.leagueId!==league.id){
    return{response:json({ok:false,error:'Not found.'},404)};
  }
  if(!context.env.COMPANION_EXPORTS){
    return{response:json({ok:false,error:'COMPANION_EXPORTS binding is unavailable.',release:RELEASE},503)};
  }
  return{db,league};
}

function summarize(value,depth=0){
  if(depth>4)return{type:'max-depth'};
  if(Array.isArray(value)){
    return{
      type:'array',
      length:value.length,
      sample:value.slice(0,3).map(item=>summarize(item,depth+1))
    };
  }
  if(value&&typeof value==='object'){
    const keys=Object.keys(value);
    const shape={};
    for(const key of keys.slice(0,20))shape[key]=summarize(value[key],depth+1);
    return{type:'object',keyCount:keys.length,keys:keys.slice(0,40),shape};
  }
  return{type:value===null?'null':typeof value,value:typeof value==='string'?value.slice(0,250):value};
}

async function resolveCapture(db,leagueId,{captureId,routePath}){
  if(captureId){
    return db.prepare(`SELECT * FROM companion_route_captures
      WHERE league_id=? AND id=? LIMIT 1`).bind(leagueId,captureId).first();
  }
  if(routePath){
    return db.prepare(`SELECT * FROM companion_route_captures
      WHERE league_id=? AND route_path=? ORDER BY received_at DESC LIMIT 1`)
      .bind(leagueId,routePath).first();
  }
  return null;
}

export async function onRequestGet(context){
  const s=await state(context);if(s.response)return s.response;

  const url=new URL(context.request.url);
  const captureId=text(url.searchParams.get('captureId'));
  const routePath=text(url.searchParams.get('routePath'));

  if(!captureId&&!routePath){
    return json({ok:false,release:RELEASE,error:'Provide captureId or routePath.'},400);
  }

  const capture=await resolveCapture(s.db,s.league.id,{captureId,routePath});
  if(!capture)return json({ok:false,release:RELEASE,error:'Capture not found.'},404);

  const obj=await context.env.COMPANION_EXPORTS.get(capture.r2_object_key);
  if(!obj){
    return json({
      ok:false,
      release:RELEASE,
      error:'R2 payload not found.',
      captureId:capture.id,
      routePath:capture.route_path,
      r2ObjectKey:capture.r2_object_key
    },404);
  }

  const rawBytes=await obj.arrayBuffer();
  const raw=new TextDecoder().decode(rawBytes);
  const trimmed=raw.trim();

  let parsed=null;
  let parseError=null;
  try{parsed=JSON.parse(trimmed)}catch(error){parseError=error?.message||String(error)}

  const headers=parse(capture.request_headers_json,{})||{};
  const collections=parse(capture.collections_json,[])||[];
  const topLevelKeys=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?Object.keys(parsed):[];

  return json({
    ok:true,
    release:RELEASE,
    capture:{
      id:capture.id,
      routePath:capture.route_path,
      discoverySessionId:capture.discovery_session_id,
      receivedAt:capture.received_at,
      byteLength:Number(capture.byte_length||rawBytes.byteLength||0),
      actualByteLength:rawBytes.byteLength,
      payloadHash:capture.payload_hash||null,
      r2ObjectKey:capture.r2_object_key,
      parseStatus:headers.parseStatus||null,
      collections,
      contentType:obj.httpMetadata?.contentType||null
    },
    payload:{
      empty:!trimmed,
      jsonParsed:Boolean(parsed!==null),
      parseError,
      rawPreview:trimmed.slice(0,MAX_PREVIEW_CHARS),
      rawPreviewTruncated:trimmed.length>MAX_PREVIEW_CHARS,
      characterLength:trimmed.length,
      topLevelKeys,
      shape:parsed!==null?summarize(parsed):null
    }
  });
}
