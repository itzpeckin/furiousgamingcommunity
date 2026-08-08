import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE = '5.9.3.5';
const DEFAULT_OWNER_ACCOUNT_ID = 'owner-tb';
const MAX_RAW_BYTES = 2_000_000;

function ownerAccountId(env){ return String(env.PLATFORM_OWNER_ACCOUNT_ID || DEFAULT_OWNER_ACCOUNT_ID).trim(); }
async function requirePlatformOwner(context){
  const auth = await requireCommissioner(context);
  if(!auth.authorized) return auth;
  const presented = String(context.request.headers.get('x-franchisehq-platform-owner-account-id') || '').trim();
  const expected = ownerAccountId(context.env);
  if(!presented || presented !== expected) return { authorized:false, response:json({ok:false,error:'Not found.'},404) };
  return auth;
}
function safeParse(value,fallback){ try{return value?JSON.parse(value):fallback;}catch{return fallback;} }
function labelFor(path,type){
  const p=String(path||'').toLowerCase();
  if(p.endsWith('/leagueteams')) return 'League Teams';
  if(p.endsWith('/standings')) return 'Standings';
  if(/\/team\/[^/]+\/roster\/?$/.test(p)) return 'Team Roster';
  if(p.endsWith('/schedules')) return 'Schedule';
  for(const name of ['passing','rushing','receiving','defense','kicking','punting']) if(p.endsWith('/'+name)) return name[0].toUpperCase()+name.slice(1);
  return type && type!=='unknown' ? String(type).replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) : 'Captured Dataset';
}
function inferType(v){ if(v===null)return 'null'; if(Array.isArray(v))return 'array'; if(Number.isInteger(v))return 'integer'; return typeof v; }
function collectArrays(value,path='$',depth=0,out=[]){
  if(depth>8||value==null)return out;
  if(Array.isArray(value)){ out.push({path,count:value.length,records:value}); for(let i=0;i<Math.min(2,value.length);i++)collectArrays(value[i],`${path}[${i}]`,depth+1,out); return out; }
  if(typeof value==='object') for(const [k,v] of Object.entries(value)) collectArrays(v,`${path}.${k}`,depth+1,out);
  return out;
}
function chooseCollection(payload){
  const arrays=collectArrays(payload).filter(x=>x.records.some(v=>v&&typeof v==='object'&&!Array.isArray(v)));
  arrays.sort((a,b)=>b.count-a.count);
  return arrays[0]||null;
}
function analyze(records){
  const rows=records.filter(v=>v&&typeof v==='object'&&!Array.isArray(v));
  const fields=new Map();
  for(const row of rows.slice(0,5000)){
    for(const [key,value] of Object.entries(row)){
      if(!fields.has(key))fields.set(key,{field:key,present:0,nulls:0,types:new Map(),samples:[],unique:new Set(),min:null,max:null});
      const f=fields.get(key);f.present++;
      if(value===null||value===undefined||value==='')f.nulls++;
      const t=inferType(value);f.types.set(t,(f.types.get(t)||0)+1);
      if(f.samples.length<5 && value!==null && value!==undefined && value!=='') f.samples.push(typeof value==='object'?JSON.stringify(value).slice(0,120):String(value).slice(0,120));
      if(f.unique.size<1000)f.unique.add(typeof value==='object'?JSON.stringify(value):String(value));
      if(typeof value==='number'&&Number.isFinite(value)){f.min=f.min===null?value:Math.min(f.min,value);f.max=f.max===null?value:Math.max(f.max,value);}
    }
  }
  return [...fields.values()].map(f=>({field:f.field,type:[...f.types.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'unknown',types:Object.fromEntries(f.types),presentCount:f.present,nullCount:f.nulls,nullPercent:rows.length?Number(((rows.length-f.present+f.nulls)/rows.length*100).toFixed(1)):0,uniqueCount:f.unique.size,minimum:f.min,maximum:f.max,samples:f.samples})).sort((a,b)=>a.field.localeCompare(b.field));
}
async function payloadFromR2(env,capture){
  if(!capture?.r2_object_key||!env.COMPANION_EXPORTS?.get)throw new Error('R2 payload storage is unavailable.');
  const object=await env.COMPANION_EXPORTS.get(capture.r2_object_key);if(!object)throw new Error('Captured payload was not found in R2.');
  const bytes=await object.arrayBuffer();
  if(bytes.byteLength>MAX_RAW_BYTES)throw new Error(`Payload exceeds the ${MAX_RAW_BYTES} byte inspector limit.`);
  const raw=new TextDecoder('utf-8',{fatal:false}).decode(bytes);
  let payload;try{payload=JSON.parse(raw);}catch{payload=raw;}
  return {raw,payload,byteLength:bytes.byteLength};
}
async function listDatasets(db,leagueId){
  const result=await db.prepare(`SELECT c.id capture_id,c.discovery_session_id,c.route_path,c.request_method,c.content_type,c.byte_length,c.r2_object_key,c.received_at,c.top_level_keys_json,c.collections_json,COALESCE(i.dataset_type,'unknown') dataset_type,COALESCE(i.dataset_label,'Unknown Dataset') dataset_label,COALESCE(i.confidence,'unknown') confidence,COALESCE(i.confidence_score,0) confidence_score,COALESCE(i.record_count,0) record_count,i.inspected_at FROM companion_route_captures c LEFT JOIN companion_dataset_inspections i ON i.capture_id=c.id WHERE c.league_id=? ORDER BY c.received_at DESC`).bind(leagueId).all();
  const latest=new Map();for(const row of result.results||[])if(!latest.has(row.route_path))latest.set(row.route_path,row);
  return [...latest.values()].map(row=>({captureId:row.capture_id,discoverySessionId:row.discovery_session_id,routePath:row.route_path,datasetType:row.dataset_type,datasetLabel:labelFor(row.route_path,row.dataset_type),classifierLabel:row.dataset_label,confidence:row.confidence,confidenceScore:row.confidence_score,recordCount:row.record_count,byteLength:row.byte_length,contentType:row.content_type,requestMethod:row.request_method,receivedAt:row.received_at,inspectedAt:row.inspected_at,topLevelKeys:safeParse(row.top_level_keys_json,[]),collections:safeParse(row.collections_json,[])}));
}
export async function onRequestGet(context){
  const slug=normalizeLeagueSlug(context);if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);
  const auth=await requirePlatformOwner(context);if(!auth.authorized)return auth.response;
  const db=database(context.env);if(!db)return json({ok:false,error:'Not found.'},404);
  const league=await resolveLeague(context.env,slug);if(!league)return json({ok:false,error:'Not found.'},404);
  if(auth.session.membership?.leagueId!==league.id)return json({ok:false,error:'Not found.'},404);
  const url=new URL(context.request.url),captureId=url.searchParams.get('captureId');
  try{
    if(!captureId){const datasets=await listDatasets(db,league.id);return json({ok:true,release:RELEASE,leagueSlug:slug,readOnly:true,datasetCount:datasets.length,datasets,activationPerformed:false});}
    const capture=await db.prepare(`SELECT c.*,COALESCE(i.dataset_type,'unknown') dataset_type,COALESCE(i.dataset_label,'Unknown Dataset') dataset_label,COALESCE(i.confidence,'unknown') confidence,COALESCE(i.confidence_score,0) confidence_score,COALESCE(i.record_count,0) record_count FROM companion_route_captures c LEFT JOIN companion_dataset_inspections i ON i.capture_id=c.id WHERE c.id=? AND c.league_id=? LIMIT 1`).bind(captureId,league.id).first();
    if(!capture)return json({ok:false,error:'Not found.'},404);
    const data=await payloadFromR2(context.env,capture),collection=chooseCollection(data.payload),records=collection?.records||[];
    const objectRows=records.filter(v=>v&&typeof v==='object'&&!Array.isArray(v));
    const fields=analyze(objectRows),duplicateFields=[];
    for(const candidate of ['playerId','teamId','id','gameId']){const values=objectRows.map(r=>r[candidate]).filter(v=>v!==null&&v!==undefined&&v!=='');if(values.length){const dup=values.length-new Set(values.map(String)).size;if(dup>0)duplicateFields.push({field:candidate,duplicateCount:dup});}}
    return json({ok:true,release:RELEASE,readOnly:true,dataset:{captureId:capture.id,routePath:capture.route_path,datasetType:capture.dataset_type,datasetLabel:labelFor(capture.route_path,capture.dataset_type),confidence:capture.confidence,confidenceScore:capture.confidence_score,recordCount:objectRows.length||capture.record_count,byteLength:data.byteLength,contentType:capture.content_type,receivedAt:capture.received_at,collectionPath:collection?.path||null,collectionCount:collection?.count||0,topLevelKeys:data.payload&&typeof data.payload==='object'&&!Array.isArray(data.payload)?Object.keys(data.payload):[],fields,duplicateFields,tableRows:objectRows.slice(0,250),rawJson:typeof data.payload==='string'?data.payload:JSON.stringify(data.payload,null,2)},activationPerformed:false});
  }catch(error){return json({ok:false,error:'Payload inspection failed.',detail:error?.message||String(error),release:RELEASE},500);}
}
