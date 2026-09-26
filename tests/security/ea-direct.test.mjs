import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';
import { hashToken } from '../../functions/_lib/auth.js';
import { sealEa, openEa, parseEaRedirect, safeEaError, eaErrorResponse, readEaBody, createEaSetup, loadEaSetup, lockEaSetup, setupScope } from '../../functions/_lib/ea-direct.js';
import { createEaClient } from '../../functions/_lib/ea-client.js';
import { onRequest as middleware } from '../../functions/api/leagues/[leagueSlug]/ea-direct/_middleware.js';
import { onRequestGet as connectionGet, onRequestPost as connectionPost } from '../../functions/api/leagues/[leagueSlug]/ea-direct/connection.js';
import { onRequestPost as syncPost } from '../../functions/api/leagues/[leagueSlug]/ea-direct/sync.js';
import { onRequestPost as stepPost } from '../../functions/api/leagues/[leagueSlug]/ea-direct/collect-step.js';

const envKey={EA_CREDENTIAL_KEY:'ab'.repeat(32),EA_CLIENT_SECRET:'test-only-ea-client-secret'};
function d1(sqlite){return{prepare(sql){let args=[];const stmt=sqlite.prepare(sql),p={bind(...v){args=v;return p;},async first(){return stmt.get(...args)||null;},async all(){return{results:stmt.all(...args)};},async run(){const r=stmt.run(...args);return{meta:{changes:Number(r.changes)}};}};return p;},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};}
async function fixture(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const file of(await walkFiles()).filter(f=>/^migrations\/\d+_.*\.sql$/.test(f)).sort())sqlite.exec(await readFile(path.join(ROOT,file),'utf8'));
  for(const id of['a','b'])sqlite.prepare(`INSERT INTO leagues(id,name,slug,public_status,tenant_status) VALUES(?,?,?,'active','enabled')`).run(id,`League ${id}`,`league-${id}`);
  sqlite.prepare(`INSERT INTO users(id,discord_user_id,discord_username,display_name) VALUES('user-a','100000000000000001','tester','Tester')`).run();
  sqlite.prepare(`INSERT INTO league_memberships(id,league_id,user_id,role,active) VALUES('member-a','a','user-a','commissioner',1)`).run();
  sqlite.prepare(`INSERT INTO sessions(id,user_id,session_token_hash,expires_at) VALUES('session-a','user-a','session-hash','2099-01-01')`).run();
  const delegated='test-only-delegated-credential';
  sqlite.prepare(`INSERT INTO server_import_delegations(token_hash,session_id,league_id,expires_at) VALUES(?,'session-a','a','2099-01-01')`).run(await hashToken(delegated));
  const db=d1(sqlite),env={...envKey,DB:db};
  const context=(slug,body,token=delegated,route='connection')=>({params:{leagueSlug:slug},env,request:new Request(`https://franchisehq.app/api/leagues/${slug}/ea-direct/${route}`,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{'x-franchisehq-import-token':token}:{})},...(body?{body:JSON.stringify(body)}:{})})});
  return{sqlite,db,env,context,state:{db,env,league:{id:'a'},session:{user:{id:'user-a'},sessionId:'session-a'}}};
}

test('EA credentials are authenticated ciphertext bound to exact league/record',async()=>{
  const secret={accessToken:'test-only-personal-token',refreshToken:'test-only-refresh'};
  const sealed=await sealEa(envKey,'league:a:connection:1',secret);
  assert.equal(sealed.includes(secret.accessToken),false);
  assert.deepEqual(await openEa(envKey,'league:a:connection:1',sealed),secret);
  await assert.rejects(openEa(envKey,'league:b:connection:1',sealed),/Reconnect|reconnect/);
  await assert.rejects(openEa({...envKey,EA_CREDENTIAL_KEY:'cd'.repeat(32)},'league:a:connection:1',sealed),/Reconnect|reconnect/);
  await assert.rejects(openEa(envKey,'league:a:connection:1',`${sealed.slice(0,-2)}00`),/Reconnect|reconnect/);
});
test('EA callback only accepts exact loopback, code, and this setup state',()=>{
  assert.equal(parseEaRedirect('http://127.0.0.1/success?code=valid&state=ours','ours'),'valid');
  for(const value of['https://evil.test/success?code=x&state=ours','http://localhost/success?code=x&state=ours','http://127.0.0.1/success?code=x&state=other','http://127.0.0.1/success?code=x','http://127.0.0.1/success?code=x&code=y&state=ours','http://user:pass@127.0.0.1/success?code=x&state=ours'])assert.throws(()=>parseEaRedirect(value,'ours'));
});
test('EA errors and oversized requests cannot leak upstream secrets',async()=>{
  const safe=safeEaError(new Error('upstream https://example.test/secret-token'));
  assert.equal(JSON.stringify(safe).includes('secret-token'),false);
  await assert.rejects(readEaBody(new Request('https://test.invalid',{method:'POST',body:'x'.repeat(17000)})),/large/);
});

test('EA failure responses and support logs expose only reconstructed diagnostics',async()=>{
  const logs=[],originalWarn=console.warn;
  const client=createEaClient(envKey,{fetchImpl:async()=>Response.json({error:'invalid_grant',error_description:'private-access private-refresh private-code https://private.invalid'},{status:400})});
  console.warn=value=>logs.push(value);
  try{
    let failure;
    try{await client.exchangeCode('private-code');}catch(error){failure=error;}
    failure.diagnostic.rawBody='private-access';
    const response=eaErrorResponse(failure),body=await response.json();
    assert.equal(response.status,409);
    assert.match(body.message,/Failed step: EA sign-in token \(EA HTTP 400\); INVALID_GRANT/);
    assert.equal(body.diagnostic.step,'account-token');
    assert.ok(body.referenceId);
    assert.equal(logs.length,1);
    assert.equal(JSON.parse(logs[0]).referenceId,body.referenceId);
    assert.deepEqual(Object.keys(JSON.parse(logs[0])).sort(),['event','httpStatus','providerCode','referenceId','step','stepLabel']);
    assert.doesNotMatch(JSON.stringify(body)+logs.join(''),/private-access|private-refresh|private-code|private\.invalid|rawBody/);
    const unknown=await eaErrorResponse(Object.assign(new Error('private-access'),{name:'EaClientError',diagnostic:{step:'account-token'}})).json();
    assert.equal(unknown.diagnostic,undefined);
    assert.equal(logs.length,1);
    assert.doesNotMatch(JSON.stringify(unknown),/private-access/);
  }finally{console.warn=originalWarn;}
});
test('legacy EA probes stay closed while only reviewed routes continue',async()=>{
  for(const suffix of['oauth','discovery','probe','connection/extra']){const r=await middleware({request:new Request(`https://franchisehq.app/api/leagues/a/ea-direct/${suffix}`),next(){throw new Error('Legacy route reached');}});assert.equal(r.status,404);}
  assert.equal(await middleware({request:new Request('https://franchisehq.app/api/leagues/a/ea-direct/connection'),next:()=>42}),42);
});
test('EA setup is tenant, commissioner, session scoped and no token reaches browser',async()=>{
  const f=await fixture();try{
    assert.equal((await connectionGet(f.context('league-a',null,null))).status,401);
    assert.equal((await connectionGet(f.context('league-b'))).status,404);
    const response=await connectionPost(f.context('league-a',{action:'begin'}));assert.equal(response.status,200);
    const body=await response.json();assert.match(body.loginUrl,/accounts\.ea\.com/);assert.ok(body.setup.id);
    assert.equal(JSON.stringify(body).includes('test-only-ea-client-secret'),false);
    assert.equal(JSON.stringify(body).includes('credential_cipher'),false);
    const setup=await loadEaSetup(f.state,body.setup.id);
    await assert.rejects(loadEaSetup({...f.state,league:{id:'b'}},setup.id),/expired/);
    await assert.rejects(loadEaSetup({...f.state,session:{...f.state.session,sessionId:'other'}},setup.id),/expired/);
    await lockEaSetup(f.db,setup);await assert.rejects(lockEaSetup(f.db,setup),/already running/);
    f.sqlite.prepare(`UPDATE ea_direct_setups SET expires_at='2000-01-01' WHERE id=?`).run(setup.id);
    await assert.rejects(loadEaSetup(f.state,setup.id),/expired/);
  }finally{f.sqlite.close();}
});

test('failed profile connection returns Madden step diagnostics and releases the setup lock without importing',async()=>{
  const f=await fixture(),originalFetch=globalThis.fetch,originalWarn=console.warn;
  try{
    const setup=await createEaSetup(f.state);
    const payload={token:{accessToken:'private-account',refreshToken:'private-refresh',expiresAt:'2099-01-01'},personas:[{id:'123',platform:'ps5',namespace:'ps3',entitlement:'MADDEN_27PS5',name:'Coach'}]};
    f.sqlite.prepare(`UPDATE ea_direct_setups SET stage='persona',payload_cipher=? WHERE id=?`).run(await sealEa(f.env,setupScope(setup),payload),setup.id);
    const responses=[new Response(null,{status:302,headers:{location:'http://127.0.0.1/success?code=private-code'}}),Response.json({access_token:'private-profile',refresh_token:'private-refresh',expires_in:3600}),Response.json({error:'invalid_token',error_description:'private-profile private-account'},{status:401})];
    globalThis.fetch=async()=>{assert.ok(responses.length);return responses.shift();};
    console.warn=()=>{};
    const response=await connectionPost(f.context('league-a',{action:'select-persona',setupId:setup.id,personaId:'ps5:123'}));
    const body=await response.json();
    assert.equal(response.status,409);
    assert.equal(body.diagnostic.step,'madden-login');
    assert.equal(body.diagnostic.httpStatus,401);
    assert.match(body.message,/Madden service sign-in/);
    assert.doesNotMatch(JSON.stringify(body),/private-profile|private-account|private-refresh|private-code/);
    assert.equal(responses.length,0);
    const retained=await loadEaSetup(f.state,setup.id);
    assert.equal(retained.stage,'persona');assert.equal(retained.lock_until,null);
    const status=await (await connectionGet(f.context('league-a'))).json();
    assert.equal(status.setup.personas[0].id,'ps5:123');
    for(const table of ['ea_direct_connections','ea_direct_collection_jobs','league_snapshots'])assert.equal(f.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n,0);
  }finally{globalThis.fetch=originalFetch;console.warn=originalWarn;f.sqlite.close();}
});
test('beginning EA setup supersedes only that user/session and disconnect does not touch snapshots',async()=>{
  const f=await fixture();try{
    const first=await createEaSetup(f.state),second=await createEaSetup(f.state);
    assert.notEqual(first.id,second.id);await assert.rejects(loadEaSetup(f.state,first.id));
    const before=f.sqlite.prepare(`SELECT * FROM companion_league_export_endpoints ORDER BY league_id`).all();
    assert.equal((await connectionPost(f.context('league-a',{action:'disconnect'}))).status,200);
    assert.deepEqual(f.sqlite.prepare(`SELECT * FROM companion_league_export_endpoints ORDER BY league_id`).all(),before);
    assert.equal(f.sqlite.prepare(`SELECT count(*) n FROM league_snapshots`).get().n,0);
  }finally{f.sqlite.close();}
});
test('collection cannot start without configuration/connection and internal steps reject browser sessions',async()=>{
  const f=await fixture();try{
    assert.equal((await syncPost(f.context('league-b',{mode:'preview'}))).status,404);
    const result=await syncPost(f.context('league-a',{mode:'preview'}));assert.equal(result.status,409);
    assert.equal((await stepPost(f.context('league-a',{id:'unknown'},undefined,'collect-step'))).status,404);
    assert.equal(f.sqlite.prepare(`SELECT count(*) n FROM ea_direct_collection_jobs`).get().n,0);
  }finally{f.sqlite.close();}
});

async function franchiseSetup(f){
  const setup=await createEaSetup(f.state);
  const payload={token:{accessToken:'test-only-token',refreshToken:'test-only-refresh',expiresAt:'2099-01-01'},
    persona:{id:'123',platform:'ps5',name:'EA player'},leagues:[{leagueId:321,leagueName:'Selected franchise'}]};
  f.sqlite.prepare(`UPDATE ea_direct_setups SET stage='franchise',payload_cipher=? WHERE id=?`).run(await sealEa(f.env,setupScope(setup),payload),setup.id);
  f.sqlite.prepare(`INSERT INTO ea_direct_connections(id,league_id,connected_by,status,platform,persona_id,persona_name,external_league_id,external_league_name,credential_cipher) VALUES('old','a','user-a','connected','ps5','123','EA player','321','Existing franchise','retained-cipher')`).run();
  return setup;
}
test('EA connection replacement atomically completes an authorized current setup',async()=>{
  const f=await fixture();try{
    const setup=await franchiseSetup(f);
    const response=await connectionPost(f.context('league-a',{action:'connect',setupId:setup.id,externalLeagueId:321}));
    assert.equal(response.status,200);const body=await response.json();
    assert.equal(body.connection.externalLeagueId,'321');assert.notEqual(body.connection.id,'old');
    assert.equal(f.sqlite.prepare(`SELECT stage FROM ea_direct_setups WHERE id=?`).get(setup.id).stage,'complete');
    assert.equal(f.sqlite.prepare(`SELECT credential_cipher FROM ea_direct_connections WHERE id='old'`).get().credential_cipher,null);
    assert.equal(f.sqlite.prepare(`SELECT count(*) n FROM ea_direct_connections WHERE status='connected'`).get().n,1);
  }finally{f.sqlite.close();}
});
for(const race of ['disconnect','new-setup','logout','membership-revoked','session-expired','setup-expired','lock-expired','collection-started']){
  test(`in-flight EA connect cannot replace a connection after ${race}`,async()=>{
    const f=await fixture();try{
      const setup=await franchiseSetup(f),originalBatch=f.db.batch.bind(f.db);let raced=false;
      f.db.batch=async statements=>{
        if(!raced){
          raced=true;
          if(race==='disconnect')assert.equal((await connectionPost(f.context('league-a',{action:'disconnect'}))).status,200);
          if(race==='new-setup')await createEaSetup(f.state);
          if(race==='logout')f.sqlite.exec(`UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='session-a'`);
          if(race==='membership-revoked')f.sqlite.exec(`UPDATE league_memberships SET active=0 WHERE id='member-a'`);
          if(race==='session-expired')f.sqlite.exec(`UPDATE sessions SET absolute_expires_at='2000-01-01' WHERE id='session-a'`);
          if(race==='setup-expired')f.sqlite.prepare(`UPDATE ea_direct_setups SET expires_at='2000-01-01' WHERE id=?`).run(setup.id);
          if(race==='lock-expired')f.sqlite.prepare(`UPDATE ea_direct_setups SET lock_until='2000-01-01' WHERE id=?`).run(setup.id);
          if(race==='collection-started')f.sqlite.exec(`INSERT INTO ea_direct_collection_jobs(id,league_id,connection_id,actor_id,session_id,mode,status,token_hash,expires_at) VALUES('racing-job','a','old','user-a','session-a','preview','queued','test-hash','2099-01-01')`);
        }
        return originalBatch(statements);
      };
      const response=await connectionPost(f.context('league-a',{action:'connect',setupId:setup.id,externalLeagueId:321}));
      assert.equal(raced,true);assert.equal(response.status,409);assert.equal((await response.json()).code,'SETUP_EXPIRED');
      assert.equal(f.sqlite.prepare(`SELECT count(*) n FROM ea_direct_connections`).get().n,1);
      const old=f.sqlite.prepare(`SELECT status,credential_cipher FROM ea_direct_connections WHERE id='old'`).get();
      assert.equal(old.status,race==='disconnect'?'disconnected':'connected');
      assert.equal(old.credential_cipher,race==='disconnect'?null:'retained-cipher');
      assert.notEqual(f.sqlite.prepare(`SELECT stage FROM ea_direct_setups WHERE id=?`).get(setup.id).stage,'complete');
      assert.equal(f.sqlite.prepare(`SELECT count(*) n FROM league_snapshots`).get().n,0);
    }finally{f.sqlite.close();}
  });
}
test('disconnect during EA code exchange cannot restore encrypted setup credentials',async()=>{
  const f=await fixture(),originalFetch=globalThis.fetch;try{
    const setup=await createEaSetup(f.state);let requests=0;
    globalThis.fetch=async()=>{
      requests++;
      if(requests===1)return Response.json({access_token:'test-only-token',refresh_token:'test-only-refresh',expires_in:3600});
      if(requests===2)return Response.json({pid_id:123});
      if(requests===3)return Response.json({entitlements:{entitlement:[{groupName:'MADDEN_27PS5',entitlementTag:'ONLINE_ACCESS',pidUri:'/pids/123'}]}});
      assert.equal((await connectionPost(f.context('league-a',{action:'disconnect'}))).status,200);
      return Response.json({personas:{persona:[{personaId:123,namespaceName:'ps3',displayName:'EA player'}]}});
    };
    const response=await connectionPost(f.context('league-a',{action:'exchange',setupId:setup.id,redirectUrl:`http://127.0.0.1/success?code=test-only-code&state=${setup.oauth_state}`}));
    assert.equal(requests,4);assert.equal(response.status,409);assert.equal((await response.json()).code,'SETUP_EXPIRED');
    const row=f.sqlite.prepare(`SELECT stage,payload_cipher FROM ea_direct_setups WHERE id=?`).get(setup.id);
    assert.equal(row.stage,'expired');assert.equal(row.payload_cipher,null);
  }finally{globalThis.fetch=originalFetch;f.sqlite.close();}
});
