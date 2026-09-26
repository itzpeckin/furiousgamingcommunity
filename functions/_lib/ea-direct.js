/* FHQ_BUILD: 8.0.11 */
import { requireCommissioner } from './permissions.js';
import { database, normalizeLeagueSlug, validLeagueSlug, resolveLeague, json } from './cloud-platform.js';
import { createRandomToken } from './auth.js';
import { EaClientError, safeEaClientDiagnostic } from './ea-client.js';

export class EaDirectError extends Error {
  constructor(code,message,status=409){super(message);this.name='EaDirectError';this.code=code;this.status=status;}
}
export const fail=(code,message,status)=>{throw new EaDirectError(code,message,status);};
export function configured(env){return Boolean(env?.EA_CLIENT_SECRET&&/^[a-f0-9]{64}$/i.test(env?.EA_CREDENTIAL_KEY||''));}
export async function authorizedEaState(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return{response:json({ok:false,error:'Not found.'},404)};
  const auth=await requireCommissioner(context);
  if(!auth.authorized)return{response:auth.response};
  const db=database(context.env),league=db?await resolveLeague(context.env,slug):null;
  if(!league||auth.session.membership?.leagueId!==league.id)return{response:json({ok:false,error:'Not found.'},404)};
  return{db,league,slug,session:auth.session,env:context.env};
}
export async function readEaBody(request){
  if(Number(request.headers.get('content-length')||0)>16384)fail('BODY_TOO_LARGE','Request is too large.',413);
  const reader=request.body?.getReader();
  if(!reader) return{};
  const chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>16384){await reader.cancel();fail('BODY_TOO_LARGE','Request is too large.',413);}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{const body=JSON.parse(new TextDecoder().decode(bytes));if(body&&typeof body==='object'&&!Array.isArray(body))return body;}catch{}
  fail('INVALID_REQUEST','A valid request is required.',400);
}
function hex(bytes){return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');}
function unhex(value){if(!/^(?:[a-f0-9]{2})+$/i.test(value))fail('CREDENTIAL_UNAVAILABLE','Reconnect your EA account.');return Uint8Array.from(value.match(/../g),value=>parseInt(value,16));}
async function encryptionKey(env){
  if(!/^[a-f0-9]{64}$/i.test(env?.EA_CREDENTIAL_KEY||''))fail('NOT_CONFIGURED','EA Direct is not configured yet.');
  return crypto.subtle.importKey('raw',unhex(env.EA_CREDENTIAL_KEY),'AES-GCM',false,['encrypt','decrypt']);
}
// AAD binds credentials to this exact tenant and record, preventing ciphertext swaps.
export async function sealEa(env,scope,payload){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(scope)},await encryptionKey(env),new TextEncoder().encode(JSON.stringify(payload)));
  return`v1.${hex(iv)}.${hex(new Uint8Array(ciphertext))}`;
}
export async function openEa(env,scope,value){
  try{const [version,iv,body]=String(value||'').split('.');if(version!=='v1')throw new Error('version');
    const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:unhex(iv),additionalData:new TextEncoder().encode(scope)},await encryptionKey(env),unhex(body));
    return JSON.parse(new TextDecoder().decode(plaintext));
  }catch{fail('CREDENTIAL_UNAVAILABLE','The saved EA connection cannot be opened. Reconnect your EA account.');}
}
export function safeEaError(error){
  if(error instanceof EaDirectError || error instanceof EaClientError){
    const diagnostic=safeEaClientDiagnostic(error);
    const detail=diagnostic ? ` Failed step: ${diagnostic.stepLabel}${diagnostic.httpStatus ? ` (EA HTTP ${diagnostic.httpStatus})` : ''}${diagnostic.providerCode ? `; ${diagnostic.providerCode}` : ''}.` : '';
    return{code:error.code||'EA_UNAVAILABLE',message:error.message+detail,status:error.status===401?409:Math.min(499,Math.max(400,Number(error.status)||424)),retryable:Boolean(error.retryable),...(diagnostic?{diagnostic}:{})};
  }
  return{code:'EA_CONNECTION_FAILED',message:'EA Direct could not finish this step. Your live league data has not changed. Try again or reconnect your EA account.',status:424,retryable:true};
}
export function eaErrorResponse(error){
  const safe=safeEaError(error);
  const referenceId=safe.diagnostic?crypto.randomUUID():null;
  // Log only reconstructed, allowlisted diagnostics. Never log the error,
  // request/response, URLs, account identifiers, headers, or credentials.
  if(referenceId)console.warn(JSON.stringify({event:'ea-direct-request-failed',referenceId,...safe.diagnostic}));
  const message=safe.message+(referenceId?` Support reference: ${referenceId}.`:'');
  return json({ok:false,error:message,message,code:safe.code,retryable:safe.retryable,...(referenceId?{diagnostic:safe.diagnostic,referenceId}:{})},safe.status);
}
export function publicConnection(row){return row?{id:row.id,platform:row.platform,personaName:row.persona_name,leagueName:row.external_league_name,externalLeagueId:row.external_league_id,lastSyncedAt:row.last_synced_at,previewVerified:Boolean(row.preview_verified)}:null;}
export async function activeEaConnection(db,leagueId){return db.prepare(`SELECT * FROM ea_direct_connections WHERE league_id=? AND status!='disconnected' LIMIT 1`).bind(leagueId).first();}
export function setupScope(row){return`ea-setup:${row.league_id}:${row.id}:${row.user_id}:${row.session_id}`;}
export function connectionScope(row){return`ea-connection:${row.league_id}:${row.id}`;}
export function jobScope(row){return`ea-job:${row.league_id}:${row.id}`;}
export async function createEaSetup(state){
  const row={id:`eas_${crypto.randomUUID()}`,league_id:state.league.id,user_id:state.session.user.id,session_id:state.session.sessionId,oauth_state:createRandomToken(24)};
  await state.db.prepare(`UPDATE ea_direct_setups SET stage='expired',payload_cipher=NULL WHERE league_id=? AND user_id=? AND session_id=?`).bind(row.league_id,row.user_id,row.session_id).run();
  await state.db.prepare(`INSERT INTO ea_direct_setups(id,league_id,user_id,session_id,oauth_state,stage,expires_at) VALUES(?,?,?,?,?,'code',?)`)
    .bind(row.id,row.league_id,row.user_id,row.session_id,row.oauth_state,new Date(Date.now()+20*60*1000).toISOString()).run();
  return row;
}
export async function loadEaSetup(state,id){
  const row=await state.db.prepare(`SELECT * FROM ea_direct_setups WHERE id=? AND league_id=? AND user_id=? AND session_id=? AND julianday(expires_at)>julianday('now') AND stage NOT IN ('expired','complete')`)
    .bind(String(id||''),state.league.id,state.session.user.id,state.session.sessionId).first();
  if(!row)fail('SETUP_EXPIRED','This EA setup expired. Start Connect EA Account again.');
  return row;
}
export async function lockEaSetup(db,row){
  const lock=new Date(Date.now()+90000).toISOString();
  const result=await db.prepare(`UPDATE ea_direct_setups SET lock_until=? WHERE id=? AND league_id=? AND stage=? AND (lock_until IS NULL OR julianday(lock_until)<julianday('now'))`)
    .bind(lock,row.id,row.league_id,row.stage).run();
  if(!Number(result.meta?.changes))fail('SETUP_BUSY','This EA sign-in step is already running. Please wait.');
  return lock;
}
export function parseEaRedirect(value,state){
  let url;try{url=new URL(String(value||''));}catch{fail('INVALID_REDIRECT','Paste the complete localhost success address from EA sign-in.',400);}
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.port||url.pathname!=='/success'||url.username||url.password||url.hash||url.searchParams.getAll('code').length!==1){
    fail('INVALID_REDIRECT','Use only the http://127.0.0.1/success address shown after EA sign-in.',400);
  }
  if(url.searchParams.get('state')!==state)fail('INVALID_STATE','This sign-in belongs to another setup. Start Connect EA Account again.',400);
  const code=url.searchParams.get('code');if(!code||code.length>4096)fail('INVALID_CODE','The EA sign-in code is missing.',400);
  return code;
}
