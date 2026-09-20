import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';
import { onRequestPost as register } from '../../functions/api/auth/email/register.js';
import { onRequestPost as login } from '../../functions/api/auth/email/login.js';
import { onRequestGet as listRegistrations, onRequestPost as registerLeague } from '../../functions/api/onboarding.js';

const firstCredential='test-only registration credential 2028';
const ownerCredential='test-only owner credential 2028';
const wrongCredential='test-only incorrect credential 2028';

function d1(sqlite) {
  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let args = [];
      const prepared = {
        bind(...values) { args=values;return prepared; },
        async first() { return statement.get(...args) || null; },
        async all() { return { results:statement.all(...args) }; },
        async run() {
          if (/^\s*(?:SELECT|WITH|PRAGMA)\b/i.test(sql)) {
            return { success:true,results:statement.all(...args),meta:{ changes:0 } };
          }
          const result=statement.run(...args);
          return { success:true,meta:{ changes:Number(result.changes),last_row_id:result.lastInsertRowid } };
        }
      };
      return prepared;
    },
    async batch(statements) {
      const results=[];
      sqlite.exec('BEGIN');
      try {
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

async function database() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  const migrations=(await walkFiles()).filter(file=>/^migrations\/\d+_.+\.sql$/.test(file)).sort();
  for (const file of migrations) sqlite.exec(await readFile(path.join(ROOT,file),'utf8'));
  return { sqlite,db:d1(sqlite) };
}

function context(db,url,body,cookie='') {
  return {
    request:new Request(url,{
      method:'POST',headers:{ 'content-type':'application/json',origin:'https://franchisehq.app',...(cookie?{cookie}:{}) },
      body:JSON.stringify(body)
    }),
    env:{ DB:db,APP_ENV:'production' },params:{},data:{},waitUntil() {}
  };
}

function sessionCookie(response) {
  const value=response.headers.get('set-cookie') || '';
  const match=value.match(/franchise_hq_session=([^;,]+)/);
  assert.ok(match,'a browser session cookie must be issued');
  return `franchise_hq_session=${match[1]}`;
}

test('email registration creates a provider-neutral identity and secure session', async () => {
  const { sqlite,db }=await database();
  try {
    const response=await register(context(db,'https://franchisehq.app/api/auth/email/register',{
      displayName:'Second Commissioner',email:'Commissioner@Example.com',password:firstCredential
    }));
    assert.equal(response.status,201);
    const payload=await response.json();
    assert.equal(payload.user.authProvider,'email');
    assert.equal(payload.user.email,'commissioner@example.com');
    assert.match(sessionCookie(response),/^franchise_hq_session=/);
    const identity=sqlite.prepare(`SELECT identity.*,users.discord_user_id,users.discord_username
      FROM user_auth_identities identity JOIN users ON users.id=identity.user_id
      WHERE identity.provider='email'`).get();
    assert.equal(identity.normalized_email,'commissioner@example.com');
    assert.equal(identity.password_iterations,600000);
    assert.notEqual(identity.password_hash,firstCredential);
    assert.match(identity.discord_user_id,/^local_/);
    assert.equal(identity.discord_username,'email-account');
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM league_memberships').get().count,0);
  } finally { sqlite.close(); }
});

test('email sign-in rejects the wrong credential and accepts the stored credential', async () => {
  const { sqlite,db }=await database();
  try {
    await register(context(db,'https://franchisehq.app/api/auth/email/register',{
      displayName:'Email Commissioner',email:'owner@example.com',password:ownerCredential
    }));
    const rejected=await login(context(db,'https://franchisehq.app/api/auth/email/login',{
      email:'owner@example.com',password:wrongCredential
    }));
    assert.equal(rejected.status,401);
    const accepted=await login(context(db,'https://franchisehq.app/api/auth/email/login',{
      email:'OWNER@example.com',password:ownerCredential
    }));
    assert.equal(accepted.status,200);
    assert.equal((await accepted.json()).authenticated,true);
    assert.match(sessionCookie(accepted),/^franchise_hq_session=/);
  } finally { sqlite.close(); }
});

test('an email account can prepare only its own disabled league registration', async () => {
  const { sqlite,db }=await database();
  try {
    const account=await register(context(db,'https://franchisehq.app/api/auth/email/register',{
      displayName:'League Creator',email:'creator@example.com',password:firstCredential
    }));
    const cookie=sessionCookie(account);
    const created=await registerLeague(context(db,'https://franchisehq.app/api/onboarding',{
      action:'submit',plan:{ name:'Second Test League',slug:'second-test-league',timezone:'America/New_York',gameYear:2028 }
    },cookie));
    assert.equal(created.status,201);
    const payload=await created.json();
    assert.equal(payload.plan.status,'prepared');
    assert.equal(payload.plan.activatedAt,null);
    assert.equal(payload.plan.readiness.activationAvailable,true);
    const league=sqlite.prepare(`SELECT tenant_status,public_status FROM leagues WHERE id=?`).get(payload.plan.plannedLeagueId);
    assert.equal(league.tenant_status,'disabled');
    assert.equal(league.public_status,'inactive');
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM league_memberships WHERE league_id=?`).get(payload.plan.plannedLeagueId).count,0);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM platform_league_activations WHERE league_id=?`).get(payload.plan.plannedLeagueId).count,0);

    const listed=await listRegistrations({
      request:new Request('https://franchisehq.app/api/onboarding',{ headers:{ cookie } }),
      env:{ DB:db,APP_ENV:'production' },params:{},data:{}
    });
    const listPayload=await listed.json();
    assert.equal(listPayload.plans.length,1);
    assert.equal(listPayload.plans[0].slug,'second-test-league');
  } finally { sqlite.close(); }
});

test('public account and league-registration pages are provider-neutral and keep Discord optional', async () => {
  const [landing,authPage,registrationPage,selector,middleware]=await Promise.all([
    readFile(path.join(ROOT,'functions/index.js'),'utf8'),
    readFile(path.join(ROOT,'functions/auth/index.js'),'utf8'),
    readFile(path.join(ROOT,'functions/register-league/index.js'),'utf8'),
    readFile(path.join(ROOT,'functions/leagues/index.js'),'utf8'),
    readFile(path.join(ROOT,'functions/_middleware.js'),'utf8')
  ]);
  assert.match(landing,/A Discord account is not required/);
  assert.match(authPage,/Create your account/);
  assert.match(authPage,/Discord is optional/);
  assert.match(registrationPage,/Registration does not import data, create Discord threads/);
  assert.match(selector,/Register another league/);
  assert.match(middleware,/email-login/);
  assert.match(middleware,/email-register/);
  assert.match(middleware,/public-onboarding/);
});
