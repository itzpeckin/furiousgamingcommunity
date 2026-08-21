import { requireCommissioner } from '../../../../_lib/permissions.js';
import { database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { createRandomToken, hashToken } from '../../../../_lib/auth.js';

const RELEASE='5.9.10.6.5.4b';
const json=(body,status=200)=>new Response(JSON.stringify(body,null,2),{
  status,
  headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
const text=v=>String(v??'').trim();

function ownerId(request){
  return text(request.headers.get('x-franchisehq-platform-owner-account-id'));
}
function worker(context){
  return context.env?.FRANCHISE_IMPORT_WORKER || null;
}
function origin(request){
  const url=new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

async function ensureDelegationSchema(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS server_import_delegations (
    token_hash TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    league_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_server_import_delegations_expiry
    ON server_import_delegations (expires_at)`).run();
}

async function createDelegation(db,session,leagueId){
  await ensureDelegationSchema(db);
  // Keep the table small and revoke expired workflow credentials opportunistically.
  await db.prepare(`DELETE FROM server_import_delegations WHERE expires_at <= CURRENT_TIMESTAMP`).run().catch(()=>{});
  const token=createRandomToken(32);
  const tokenHash=await hashToken(token);
  const expiresAt=new Date(Date.now()+2*60*60*1000).toISOString();
  await db.prepare(`INSERT INTO server_import_delegations
    (token_hash,session_id,league_id,expires_at)
    VALUES (?,?,?,?)`)
    .bind(tokenHash,session.sessionId,leagueId,expiresAt).run();
  return{token,expiresAt};
}

async function authorizedState(context){
  const leagueSlug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(leagueSlug))return{response:json({ok:false,release:RELEASE,error:'Invalid league slug.'},400)};
  const auth=await requireCommissioner(context);
  if(!auth.authorized)return{response:auth.response};
  const db=database(context.env);
  const league=db?await resolveLeague(context.env,leagueSlug):null;
  if(!db||!league||auth.session.membership?.leagueId!==league.id){
    return{response:json({ok:false,release:RELEASE,error:'Not found.'},404)};
  }
  return{leagueSlug,auth,db,league};
}

export async function onRequestPost(context){
  const state=await authorizedState(context);
  if(state.response)return state.response;

  const binding=worker(context);
  if(!binding)return json({ok:false,release:RELEASE,error:'FRANCHISE_IMPORT_WORKER service binding is not configured.'},503);

  const accountId=ownerId(context.request);
  if(!accountId)return json({ok:false,release:RELEASE,error:'Commissioner account is required.'},401);

  const delegation=await createDelegation(state.db,state.auth.session,state.league.id);

  const response=await binding.fetch('https://franchise-import.internal/start',{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify({
      leagueSlug:state.leagueSlug,
      ownerAccountId:accountId,
      origin:origin(context.request),
      importAuthToken:delegation.token,
      importAuthExpiresAt:delegation.expiresAt
    })
  });
  return new Response(response.body,{status:response.status,headers:response.headers});
}

export async function onRequestGet(context){
  const state=await authorizedState(context);
  if(state.response)return state.response;

  const binding=worker(context);
  if(!binding)return json({ok:false,release:RELEASE,error:'FRANCHISE_IMPORT_WORKER service binding is not configured.'},503);

  const accountId=ownerId(context.request);
  if(!accountId)return json({ok:false,release:RELEASE,error:'Commissioner account is required.'},401);

  const requestUrl=new URL(context.request.url);
  const id=text(requestUrl.searchParams.get('id'));

  const u=new URL('https://franchise-import.internal/status');
  u.searchParams.set('leagueSlug',state.leagueSlug);
  u.searchParams.set('ownerAccountId',accountId);
  u.searchParams.set('origin',origin(context.request));
  if(id)u.searchParams.set('id',id);

  const response=await binding.fetch(u.toString(),{headers:{accept:'application/json'}});
  return new Response(response.body,{status:response.status,headers:response.headers});
}

