import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';
import { onRequestPost as register } from '../../functions/api/auth/email/register.js';
import { createBetaInvitation,claimBetaInvitation } from '../../functions/_lib/beta-access.js';
import { consumeAccountAction,sendAccountAction } from '../../functions/_lib/account-actions.js';
import { onRequestPost as joinLeague } from '../../functions/api/leagues/[leagueSlug]/join.js';
import { onRequestPost as accountAction } from '../../functions/api/auth/account.js';
import { onRequestPost as inviteOwner } from '../../functions/api/platform/beta-invitations.js';
import mailWorker from '../../workers/account-email/index.mjs';
import { finishDiscordLink } from '../../functions/_lib/account-discord-link.js';
import { onRequestPost as login } from '../../functions/api/auth/email/login.js';
import { onRequestGet as listRegistrations, onRequestPost as registerLeague } from '../../functions/api/onboarding.js';
import { onRequestPost as reviewApplication } from '../../functions/api/platform/onboarding.js';
import { notifyBetaApplication } from '../../functions/_lib/beta-applications.js';
import { normalizeAccountReturnTo } from '../../functions/_lib/origin.js';

const firstCredential='test-only registration credential 2028';
const ownerCredential='test-only owner credential 2028';
const wrongCredential='test-only incorrect credential 2028';

test('account recovery preserves wrong-account email links and reports expired links and throttling safely',async()=>{
  const {sqlite,db}=await database();
  try {
    const response=await register(context(db,'https://franchisehq.app/api/auth/email/register',{displayName:'Recovery User',email:'recovery@example.com',password:firstCredential}));
    const cookie=sessionCookie(response),userId=(await response.json()).user.id;
    const invalid=await accountAction(context(db,'https://franchisehq.app/api/auth/account',{action:'confirm',purpose:'reset-password',token:'a'.repeat(64),password:ownerCredential}));
    assert.equal((await invalid.json()).code,'ACCOUNT_LINK_INVALID');
    const identity=sqlite.prepare("SELECT * FROM user_auth_identities WHERE user_id=? AND provider='email'").get(userId);
    const captured=[];const ctx=context(db,'https://franchisehq.app/api/auth/account',{},cookie);
    ctx.env.ACCOUNT_EMAIL={fetch:async req=>{captured.push(await req.json());return new Response(null,{status:204});}};
    await sendAccountAction(ctx,{userId,purpose:'link-email',email:'linked@example.com',payload:{}});
    const mismatch=await consumeAccountAction(db,{token:captured[0].token,purpose:'link-email',userId:'another-user'});
    assert.equal(mismatch.code,'ACCOUNT_LINK_SESSION');
    assert.equal(sqlite.prepare("SELECT used_at FROM account_action_tokens WHERE purpose='link-email'").get().used_at,null);
    for(let i=0;i<5;i++)await sendAccountAction(ctx,{userId,purpose:'verify-email',identity,email:identity.normalized_email});
    const limited=context(db,'https://franchisehq.app/api/auth/account',{action:'verify-email'},cookie);limited.env.ACCOUNT_EMAIL=ctx.env.ACCOUNT_EMAIL;
    const result=await accountAction(limited);assert.equal(result.status,429);assert.equal((await result.json()).code,'EMAIL_LIMIT');
  }finally{sqlite.close();}
});

test('beta applications require verification, cannot self-activate even with an invitation, and notify once',async()=>{
  const {sqlite,db}=await database();
  try {
    const registered=await register(context(db,'https://franchisehq.app/api/auth/email/register',{displayName:'Beta Applicant',email:'applicant@example.com',password:firstCredential}));
    const cookie=sessionCookie(registered),userId=(await registered.json()).user.id;
    const body={action:'apply',plan:{name:'Applicant League',slug:'applicant-league',gameYear:2027,franchiseSeasonYear:2028,configuration:{betaApplicationRequired:false},initialCommissionerUserId:'forged-owner'}};
    assert.equal((await registerLeague(context(db,'https://franchisehq.app/api/onboarding',body,cookie))).status,403);
    sqlite.prepare('UPDATE user_auth_identities SET email_verified=1 WHERE user_id=?').run(userId);
    let sends=0;
    const current=context(db,'https://franchisehq.app/api/onboarding',body,cookie);
    current.env.ACCOUNT_EMAIL={fetch:async request=>{const data=await request.json();assert.equal(data.purpose,'beta-application');sends++;return new Response(null,{status:204});}};
    const response=await registerLeague(current);assert.equal(response.status,201);
    const result=await response.json();assert.equal(result.pendingApproval,true);assert.equal(result.plan.leagueUrl,null);assert.equal(result.plan.initialCommissionerUserId,userId);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM leagues').get().n,0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM league_memberships').get().n,0);
    const invitation=await createBetaInvitation(db,userId,'Direct invitation');await claimBetaInvitation(db,userId,invitation.invitePath.split('invite=')[1]);
    for(const action of ['resume','submit']){
      const attempt=context(db,'https://franchisehq.app/api/onboarding',{...body,action,planId:result.plan.id},cookie);attempt.env.ACCOUNT_EMAIL=current.env.ACCOUNT_EMAIL;
      const replay=await(await registerLeague(attempt)).json();assert.equal(replay.pendingApproval,true);assert.equal(replay.plan.activatedAt,null);
    }
    await notifyBetaApplication(db,current.env,result.plan.id);assert.equal(sends,1);
    const denied=await reviewApplication(context(db,'https://franchisehq.app/api/platform/onboarding',{action:'activate',planId:result.plan.id,expectedRevision:1},cookie));assert.equal(denied.status,404);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM platform_league_activations').get().n,0);
  }finally{sqlite.close();}
});

test('owner alone can prepare and approve a beta application; failed email can retry without another plan',async()=>{
  const {sqlite,db}=await database();
  try{
    const registered=await register(context(db,'https://franchisehq.app/api/auth/email/register',{displayName:'Applicant',email:'approval@example.com',password:firstCredential}));
    const cookie=sessionCookie(registered),userId=(await registered.json()).user.id;
    sqlite.prepare('UPDATE user_auth_identities SET email_verified=1 WHERE user_id=?').run(userId);
    const response=await registerLeague(context(db,'https://franchisehq.app/api/onboarding',{action:'apply',plan:{name:'Approval League',slug:'approval-league',gameYear:2027,franchiseSeasonYear:2028}},cookie));
    let plan=(await response.json()).plan;assert.equal(plan.configuration.applicationAlert.state,'failed');
    let sends=0;await notifyBetaApplication(db,{ACCOUNT_EMAIL:{fetch:async()=>{sends++;return new Response(null,{status:204});}}},plan.id);assert.equal(sends,1);
    const ownerAccount=await register(context(db,'https://franchisehq.app/api/auth/email/register',{displayName:'Platform Owner',email:'fixture-owner@example.com',password:ownerCredential}));
    const ownerCookie=sessionCookie(ownerAccount),ownerId=(await ownerAccount.json()).user.id;
    sqlite.prepare("UPDATE users SET discord_user_id='100000000000000001' WHERE id=?").run(ownerId);
    sqlite.prepare("INSERT INTO leagues(id,name,slug,tenant_status,public_status) VALUES('owner-league','Owner League','owner-league','enabled','active')").run();
    sqlite.prepare("INSERT INTO league_memberships(id,league_id,user_id,role,active) VALUES('owner-membership','owner-league',?,'commissioner',1)").run(ownerId);
    const identity=sqlite.prepare('SELECT discord_user_id FROM users WHERE id=?').get(ownerId);
    const ownerRequest=body=>{const value=context(db,'https://franchisehq.app/api/platform/onboarding',body,ownerCookie);value.env.OWNER_FALLBACK_DISCORD_ID=identity.discord_user_id;return value;};
    const prepared=await reviewApplication(ownerRequest({action:'prepare',planId:plan.id,expectedRevision:plan.revision}));assert.equal(prepared.status,200);plan=(await prepared.json()).plan;
    assert.equal(sqlite.prepare('SELECT tenant_status FROM leagues WHERE id=?').get(plan.plannedLeagueId).tenant_status,'disabled');
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM league_memberships WHERE user_id=?').get(userId).n,0);
    const approved=await reviewApplication(ownerRequest({action:'activate',planId:plan.id,expectedRevision:plan.revision}));assert.equal(approved.status,200);assert.ok((await approved.json()).plan.activatedAt);
    assert.equal(sqlite.prepare('SELECT tenant_status FROM leagues WHERE id=?').get(plan.plannedLeagueId).tenant_status,'enabled');
    const resumed=await(await registerLeague(context(db,'https://franchisehq.app/api/onboarding',{action:'resume',planId:plan.id},cookie))).json();assert.equal(resumed.plan.leagueUrl,'/leagues/approval-league');
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM platform_league_activations WHERE plan_id=?').get(plan.id).n,1);
  }finally{sqlite.close();}
});

test('concurrent beta submissions enforce the pending limit at insertion and declined applications cannot resume',async()=>{
  const {sqlite,db}=await database();
  try {
    const registered=await register(context(db,'https://franchisehq.app/api/auth/email/register',{displayName:'Limit Applicant',email:'limit@example.com',password:firstCredential}));
    const cookie=sessionCookie(registered),userId=(await registered.json()).user.id;
    sqlite.prepare('UPDATE user_auth_identities SET email_verified=1 WHERE user_id=?').run(userId);
    const apply=slug=>registerLeague(context(db,'https://franchisehq.app/api/onboarding',{action:'apply',plan:{name:slug,slug,gameYear:2027,franchiseSeasonYear:2028}},cookie));
    for(const slug of ['first-pending','second-pending'])assert.equal((await apply(slug)).status,201);
    const originalBatch=db.batch;
    db.batch=async statements=>{
      db.batch=originalBatch;
      assert.equal((await apply('concurrent-third')).status,201);
      return originalBatch(statements);
    };
    const blocked=await apply('would-be-fourth');assert.equal(blocked.status,409);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM platform_league_onboarding_plans').get().n,3);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM leagues').get().n,0);
    const plan=sqlite.prepare("SELECT id FROM platform_league_onboarding_plans WHERE slug='first-pending'").get();
    sqlite.prepare("UPDATE platform_league_onboarding_plans SET status='cancelled' WHERE id=?").run(plan.id);
    const resumed=await registerLeague(context(db,'https://franchisehq.app/api/onboarding',{action:'resume',planId:plan.id},cookie));
    assert.equal(resumed.status,409);assert.match((await resumed.json()).error,/declined/);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM platform_league_activations').get().n,0);
  } finally {sqlite.close();}
});

test('beta alert has a fixed recipient and safe review destination; account redirects allow only exact application path',async()=>{
  let email;
  const response=await mailWorker.fetch(new Request('https://account-email/send',{method:'POST',body:JSON.stringify({purpose:'beta-application',planId:'onboarding_12345678-1234-1234-1234-123456789abc',name:'<img src=x>',applicant:'<b>Applicant</b>',email:'attacker@example.com'})}),{EMAIL:{send:async message=>{email=message;}}});
  assert.equal(response.status,204);assert.equal(email.to,'justinrmandaro@gmail.com');assert.ok(email.html.includes('&lt;img'));assert.ok(!email.html.includes('<img'));assert.match(email.text,/https:\/\/franchisehq.app\/platform\/applications#/);
  assert.equal(normalizeAccountReturnTo('/beta-apply'),'/beta-apply');assert.equal(normalizeAccountReturnTo('//attacker.example/beta-apply'),null);assert.equal(normalizeAccountReturnTo('/beta-apply?redirect=https://attacker.example'),null);
});

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

test('an invited verified email account activates only its own league and replays safely', async () => {
  const { sqlite,db }=await database();
  try {
    const account=await register(context(db,'https://franchisehq.app/api/auth/email/register',{
      displayName:'League Creator',email:'creator@example.com',password:firstCredential
    }));
    const cookie=sessionCookie(account);
    const userId=(await account.json()).user.id;
    const invitation=await createBetaInvitation(db,userId,'Fixture commissioner');
    assert.equal(await claimBetaInvitation(db,userId,invitation.invitePath.split('invite=')[1]),true);
    sqlite.prepare("UPDATE user_auth_identities SET email_verified=1 WHERE user_id=?").run(userId);
    const created=await registerLeague(context(db,'https://franchisehq.app/api/onboarding',{
      action:'submit',plan:{ name:'Second Test League',slug:'second-test-league',timezone:'America/New_York',gameYear:2028,franchiseSeasonYear:2030 }
    },cookie));
    assert.equal(created.status,201);
    const payload=await created.json();
    assert.equal(payload.plan.status,'prepared');
    assert.ok(payload.plan.activatedAt);
    assert.equal(payload.plan.readiness.ready,false);
    assert.equal(payload.plan.readiness.next,'season');
    const league=sqlite.prepare(`SELECT tenant_status,public_status FROM leagues WHERE id=?`).get(payload.plan.plannedLeagueId);
    assert.equal(league.tenant_status,'enabled');
    assert.equal(league.public_status,'active');
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM league_memberships WHERE league_id=?`).get(payload.plan.plannedLeagueId).count,1);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM platform_league_activations WHERE league_id=?`).get(payload.plan.plannedLeagueId).count,1);

    const listed=await listRegistrations({
      request:new Request('https://franchisehq.app/api/onboarding',{ headers:{ cookie } }),
      env:{ DB:db,APP_ENV:'production' },params:{},data:{}
    });
    const listPayload=await listed.json();
    assert.equal(listPayload.plans.length,1);
    assert.equal(listPayload.plans[0].slug,'second-test-league');
    const replay=await registerLeague(context(db,'https://franchisehq.app/api/onboarding',{action:'resume',planId:payload.plan.id},cookie));
    assert.equal(replay.status,200);
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM platform_beta_redemptions').get().count,1);
    const second=await registerLeague(context(db,'https://franchisehq.app/api/onboarding',{action:'submit',plan:{name:'Another League',slug:'another-league',gameYear:2028,franchiseSeasonYear:2030}},cookie));
    assert.equal(second.status,403);
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
  assert.match(registrationPage,/follow its setup checklist/);
  assert.match(selector,/Register another league/);
  assert.match(middleware,/email-login/);
  assert.match(middleware,/email-register/);
  assert.match(middleware,/public-onboarding/);
});

test('verification and reset links are single-use, expire, and invalidate previous credentials and sessions', async () => {
  const {sqlite,db}=await database();
  try {
    const captured=[];
    const current=context(db,'https://franchisehq.app/api/auth/email/register',{displayName:'Account Security',email:'security@example.com',password:firstCredential});
    current.env.ACCOUNT_EMAIL={fetch:async request=>{captured.push(await request.json());return new Response(null,{status:204});}};
    const account=await register(current);
    const userId=(await account.json()).user.id;
    const identity=()=>sqlite.prepare("SELECT * FROM user_auth_identities WHERE user_id=? AND provider='email'").get(userId);
    assert.equal(captured.length,1);
    assert.equal(identity().email_verified,0);
    assert.equal((await consumeAccountAction(db,{token:captured[0].token,purpose:'reset-password',password:ownerCredential})).ok,false,'purpose confusion is rejected');
    assert.equal((await consumeAccountAction(db,{token:captured[0].token,purpose:'verify-email'})).ok,true);
    assert.equal((await consumeAccountAction(db,{token:captured[0].token,purpose:'verify-email'})).ok,false);
    assert.equal(identity().email_verified,1);
    await sendAccountAction(current,{userId,purpose:'reset-password',identity:identity(),email:'security@example.com'});
    const reset=captured.at(-1).token;
    await sendAccountAction(current,{userId,purpose:'reset-password',identity:identity(),email:'security@example.com'});
    const olderVersion=captured.at(-1).token;
    assert.equal((await consumeAccountAction(db,{token:reset,purpose:'reset-password',password:ownerCredential})).ok,true);
    assert.equal(identity().credential_version,2);
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM sessions WHERE user_id=? AND revoked_at IS NULL').get(userId).count,0);
    assert.equal((await consumeAccountAction(db,{token:olderVersion,purpose:'reset-password',password:wrongCredential})).ok,false);
    assert.equal((await consumeAccountAction(db,{token:reset,purpose:'reset-password',password:wrongCredential})).ok,false);
    assert.equal((await login(context(db,'https://franchisehq.app/api/auth/email/login',{email:'security@example.com',password:firstCredential}))).status,401);
    assert.equal((await login(context(db,'https://franchisehq.app/api/auth/email/login',{email:'security@example.com',password:ownerCredential}))).status,200);
    await sendAccountAction(current,{userId,purpose:'reset-password',identity:identity(),email:'security@example.com'});
    sqlite.exec("UPDATE account_action_tokens SET expires_at='2000-01-01T00:00:00Z' WHERE used_at IS NULL");
    assert.equal((await consumeAccountAction(db,{token:captured.at(-1).token,purpose:'reset-password',password:wrongCredential})).ok,false);
  } finally {sqlite.close();}
});

test('beta invitations require verification, cannot be claimed by another account, and honor revocation', async () => {
  const {sqlite,db}=await database();
  try {
    const account=await register(context(db,'https://franchisehq.app/api/auth/email/register',{displayName:'Beta User',email:'beta@example.com',password:firstCredential}));
    const cookie=sessionCookie(account),userId=(await account.json()).user.id;
    const plan={name:'Beta League',slug:'beta-league',gameYear:2027,franchiseSeasonYear:2029};
    const submit=()=>registerLeague(context(db,'https://franchisehq.app/api/onboarding',{action:'submit',plan},cookie));
    const invite=await createBetaInvitation(db,userId,'test');
    const token=invite.invitePath.split('invite=')[1];
    assert.equal(await claimBetaInvitation(db,userId,token),true);
    assert.equal((await submit()).status,403);
    sqlite.prepare("UPDATE user_auth_identities SET email_verified=1 WHERE user_id=?").run(userId);
    sqlite.prepare('UPDATE platform_beta_invitations SET revoked_at=CURRENT_TIMESTAMP WHERE id=?').run(invite.id);
    assert.equal((await submit()).status,403);
    assert.equal(await claimBetaInvitation(db,userId,token),false);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM leagues WHERE slug='beta-league'").get().count,0);
    const fresh=await createBetaInvitation(db,userId,'test2');
    assert.equal(await claimBetaInvitation(db,userId,fresh.invitePath.split('invite=')[1]),true);
    assert.equal(await claimBetaInvitation(db,'different-user',fresh.invitePath.split('invite=')[1]),false);
  }finally{sqlite.close();}
});

test('Discord linking retains the account and refuses an identity owned by another account', async () => {
  const {sqlite,db}=await database();
  try {
    const account=await register(context(db,'https://franchisehq.app/api/auth/email/register',{displayName:'Linked User',email:'link@example.com',password:firstCredential}));
    const userId=(await account.json()).user.id;
    sqlite.prepare("INSERT INTO oauth_states(id,state_token_hash,expires_at) VALUES ('link-state','hash',datetime('now','+10 minutes'))").run();
    assert.equal(await finishDiscordLink(db,{userId,discordId:'123456789012345678',stateId:'link-state'}),true);
    assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM user_auth_identities WHERE user_id=?").get(userId).count,2);
    assert.equal(sqlite.prepare('SELECT discord_user_id FROM users WHERE id=?').get(userId).discord_user_id,'123456789012345678');
    assert.equal(await finishDiscordLink(db,{userId,discordId:'123456789012345678',stateId:'link-state'}),false);
    const second=await register(context(db,'https://franchisehq.app/api/auth/email/register',{displayName:'Other User',email:'otherlink@example.com',password:firstCredential}));
    const otherId=(await second.json()).user.id;
    sqlite.prepare("INSERT INTO oauth_states(id,state_token_hash,expires_at) VALUES ('other-state','other-hash',datetime('now','+10 minutes'))").run();
    assert.equal(await finishDiscordLink(db,{userId:otherId,discordId:'123456789012345678',stateId:'other-state'}),false);
    assert.match(sqlite.prepare('SELECT discord_user_id FROM users WHERE id=?').get(otherId).discord_user_id,/^local_/);
  }finally{sqlite.close();}
});


test('email league access requests remain pending, isolated, and cannot restore revoked access',async()=>{
  const {sqlite,db}=await database();
  try {
    const registered=await register(context(db,'https://franchisehq.app/api/auth/email/register',{displayName:'Joining User',email:'joining@example.com',password:firstCredential}));
    const cookie=sessionCookie(registered),userId=(await registered.json()).user.id;
    sqlite.exec("INSERT INTO leagues(id,name,slug,product_name,tenant_status,public_status,timezone) VALUES ('league-a','League A','league-a','FranchiseHQ','enabled','active','America/Chicago'),('league-b','League B','league-b','FranchiseHQ','enabled','active','America/Chicago')");
    const join=()=>{const ctx=context(db,'https://franchisehq.app/api/leagues/league-a/join',{},cookie);ctx.params.leagueSlug='league-a';return joinLeague(ctx);};
    assert.equal((await join()).status,403);
    sqlite.prepare('UPDATE user_auth_identities SET email_verified=1 WHERE user_id=?').run(userId);
    assert.equal((await join()).status,200);
    assert.equal((await join()).status,200);
    const rows=sqlite.prepare('SELECT league_id,role,team_id,active FROM league_memberships WHERE user_id=?').all(userId);
    assert.equal(rows.length,1);assert.equal(rows[0].league_id,'league-a');assert.equal(rows[0].active,0);assert.equal(rows[0].team_id,null);assert.equal(rows[0].role,'team_owner');
    assert.equal((await inviteOwner(context(db,'https://franchisehq.app/api/platform/beta-invitations',{action:'create'},cookie))).status,404,'league members cannot issue beta access');
  }finally{sqlite.close();}
});

test('mail failures preserve accounts, throttle repeated requests, and do not disclose reset account existence',async()=>{
  const {sqlite,db}=await database();
  try {
    let calls=0;const ctx=context(db,'https://franchisehq.app/api/auth/email/register',{displayName:'Mail Failure',email:'failure@example.com',password:firstCredential});
    ctx.env.ACCOUNT_EMAIL={fetch:async()=>{calls++;throw Error('provider unavailable');}};
    const response=await register(ctx);assert.equal(response.status,201);
    const userId=(await response.json()).user.id;
    const identity=sqlite.prepare('SELECT * FROM user_auth_identities WHERE user_id=?').get(userId);
    for(let i=0;i<6;i++)await sendAccountAction(ctx,{userId,identity,purpose:'verify-email',email:'failure@example.com'});
    assert.equal(calls,5);assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM account_action_tokens WHERE delivery_status='failed'").get().count,5);
    const requestReset=async email=>{const c=context(db,'https://franchisehq.app/api/auth/account',{action:'request-reset',email});c.env.ACCOUNT_EMAIL=ctx.env.ACCOUNT_EMAIL;const pending=[];c.waitUntil=p=>pending.push(p);const r=await accountAction(c);await Promise.all(pending);return {status:r.status,body:await r.json()};};
    assert.deepEqual(await requestReset('failure@example.com'),await requestReset('unknown@example.com'));
  }finally{sqlite.close();}
});

test('private account mail fixes sender and destination links and rejects malformed requests',async()=>{
  const sent=[];const env={EMAIL:{send:async value=>sent.push(value)}};
  assert.deepEqual(await (await mailWorker.fetch(new Request('https://private/health'),env)).json(),{ready:true});
  const send=body=>mailWorker.fetch(new Request('https://private/send',{method:'POST',body:JSON.stringify(body)}),env);
  assert.equal((await send(null)).status,400);
  assert.equal((await send({purpose:'anything',email:'a@example.com',token:'f'.repeat(64)})).status,400);
  assert.equal((await send({purpose:'verify-email',email:'a@example.com',token:'f'.repeat(64),from:'attacker@example.com',url:'https://attacker.example'})).status,204);
  assert.equal(sent.length,1);assert.equal(sent[0].from,'accounts@franchisehq.app');assert.ok(sent[0].text.includes('https://franchisehq.app/account#action=verify-email')); assert.ok(!sent[0].text.includes('attacker.example'));
});


test('reset confirmation clears browser cookies so the next sign-in is not blocked by a revoked session',async()=>{
  const {sqlite,db}=await database();
  try {
    const r=await register(context(db,'https://franchisehq.app/api/auth/email/register',{displayName:'Reset Browser',email:'resetbrowser@example.com',password:firstCredential}));
    const userId=(await r.json()).user.id;let token;
    const c=context(db,'https://franchisehq.app/api/auth/account',{});
    c.env.ACCOUNT_EMAIL={fetch:async request=>{token=(await request.json()).token;return new Response(null,{status:204});}};
    await sendAccountAction(c,{userId,purpose:'reset-password',email:'resetbrowser@example.com',identity:sqlite.prepare('SELECT * FROM user_auth_identities WHERE user_id=?').get(userId)});
    const result=await accountAction(context(db,'https://franchisehq.app/api/auth/account',{action:'confirm',purpose:'reset-password',token,password:ownerCredential}));
    assert.equal(result.status,200);const cookies=result.headers.getSetCookie();
    assert.ok(cookies.some(v=>v.startsWith('franchise_hq_session=') && v.includes('Max-Age=0')));
    assert.ok(cookies.some(v=>v.startsWith('franchise_hq_csrf=') && v.includes('Max-Age=0')));
  }finally{sqlite.close();}
});
