import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';
import {
  ONBOARDING_FEATURE_KEYS,
  activatedLeagueStatements,
  inspectOnboardingConflicts,
  normalizeOnboardingInput,
  onboardingPlanHash,
  onboardingReadiness,
  preparedLeagueStatements,
  validateOnboardingInput
} from '../../functions/_lib/platform-onboarding.js';
import { resolveTenant } from '../../functions/_lib/tenant-context.js';
import { hashToken } from '../../functions/_lib/auth.js';
import { onRequestGet, onRequestPost } from '../../functions/api/platform/onboarding.js';

function d1(sqlite) {
  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let args = [];
      const prepared = {
        bind(...values) { args = values;return prepared; },
        async first() { return statement.get(...args) || null; },
        async all() { return { results:statement.all(...args) }; },
        async run() {
          if (/^\s*(?:SELECT|WITH|PRAGMA)\b/i.test(sql)) {
            return { success:true,results:statement.all(...args),meta:{ changes:0 } };
          }
          const result = statement.run(...args);
          return { success:true,meta:{ changes:Number(result.changes),last_row_id:result.lastInsertRowid } };
        }
      };
      return prepared;
    },
    async batch(statements) {
      const results = [];
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
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  const migrations = (await walkFiles())
    .filter(file => /^migrations\/\d+_.+\.sql$/.test(file))
    .sort((left,right) => left.localeCompare(right));
  for (const file of migrations) sqlite.exec(await readFile(path.join(ROOT,file),'utf8'));
  return { sqlite,db:d1(sqlite) };
}

function insertUser(sqlite,id = 'owner-user') {
  sqlite.prepare(`INSERT INTO users (id,discord_user_id,discord_username,display_name)
    VALUES (?,?,?,?)`).run(id,`discord-${id}`,id,'Platform Owner');
}

async function ownerContext(sqlite,db,method = 'GET',body = null) {
  const token = 'platform-owner-delegation';
  const tokenHash = await hashToken(token);
  sqlite.prepare(`INSERT OR IGNORE INTO leagues
    (id,name,product_name,slug,current_season,current_week,trade_start_week,trade_deadline_week,
     discord_connected,public_status,tenant_status,timezone,branding_json,configuration_json)
    VALUES ('league-fgc','Furious Gaming Community','FranchiseHQ','furious-gaming-community',2027,2,1,9,
     0,'active','enabled','America/Chicago','{}','{}')`).run();
  sqlite.prepare(`INSERT OR IGNORE INTO league_memberships
    (id,league_id,user_id,role,team_id,active) VALUES (?,?,?,?,?,1)`).run(
    'membership-owner','league-fgc','owner-user','commissioner',null
  );
  sqlite.prepare(`INSERT OR IGNORE INTO sessions
    (id,user_id,session_token_hash,expires_at,absolute_expires_at,last_seen_at,last_rotated_at)
    VALUES (?,?,?,?,?,?,?)`).run(
    'session-owner','owner-user','unused-browser-hash','2099-01-01T00:00:00.000Z',
    '2099-01-01T00:00:00.000Z','2026-09-18T00:00:00.000Z','2026-09-18T00:00:00.000Z'
  );
  sqlite.prepare(`INSERT OR IGNORE INTO server_import_delegations
    (token_hash,session_id,league_id,expires_at) VALUES (?,?,?,?)`).run(
    tokenHash,'session-owner','league-fgc','2099-01-01T00:00:00.000Z'
  );
  return {
    request:new Request('https://franchisehq.app/api/platform/onboarding?league=furious-gaming-community',{
      method,
      headers:{
        'content-type':'application/json',
        'x-franchisehq-import-token':token,
        'x-request-id':'request_platform_onboarding_test'
      },
      body:body ? JSON.stringify(body) : undefined
    }),
    env:{ DB:db,APP_ENV:'production',OWNER_FALLBACK_DISCORD_ID:'discord-owner-user' },
    params:{},
    data:{},
    waitUntil() {}
  };
}

async function plan(overrides = {}) {
  const normalized = normalizeOnboardingInput({
    name:'Example Football League',slug:'example-football-league',timezone:'America/Chicago',
    gameYear:2028,initialCommissionerUserId:'owner-user',sourceMode:'companion',
    branding:{ primaryColor:'#112233',secondaryColor:'#445566' },
    desiredFeatures:{ confidence_pool:true },...overrides
  });
  return Object.freeze({
    ...normalized,id:'onboarding-example',plannedLeagueId:'league-example',status:'draft',revision:1,
    planHash:await onboardingPlanHash(normalized)
  });
}

test('8.0.0 adds provider identities and a durable activation ledger without a live tenant', async () => {
  const { sqlite } = await database();
  try {
    assert.equal(sqlite.prepare('SELECT MAX(version) version FROM schema_migrations').get().version,48);
    assert.ok(sqlite.prepare(`SELECT name FROM sqlite_schema WHERE type='table' AND name='platform_league_onboarding_plans'`).get());
    assert.ok(sqlite.prepare(`SELECT name FROM sqlite_schema WHERE type='table' AND name='platform_league_onboarding_events'`).get());
    assert.ok(sqlite.prepare(`SELECT name FROM sqlite_schema WHERE type='table' AND name='platform_league_activations'`).get());
    assert.ok(sqlite.prepare(`SELECT name FROM sqlite_schema WHERE type='table' AND name='user_auth_identities'`).get());
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM platform_league_onboarding_plans').get().count,0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM leagues').get().count,0);
  } finally { sqlite.close(); }
});

test('onboarding validation allows only the Companion source in 8.0.0', async () => {
  const valid = await plan();
  assert.deepEqual(validateOnboardingInput(valid),{ ok:true,errors:[] });
  const direct = normalizeOnboardingInput({
    ...valid,sourceMode:'direct-ea',initialCommissionerUserId:'owner-user'
  });
  assert.equal(validateOnboardingInput(direct).ok,false);
  assert.match(validateOnboardingInput(direct).errors.join(' '),/Only the Madden Companion/);
});

test('preparation is idempotent, tenant-isolated, disabled, and empty', async () => {
  const { sqlite,db } = await database();
  try {
    insertUser(sqlite);
    sqlite.prepare(`INSERT INTO leagues
      (id,name,product_name,slug,current_season,current_week,trade_start_week,trade_deadline_week,
       discord_connected,public_status,tenant_status,timezone,branding_json,configuration_json)
      VALUES ('league-fgc','Furious Gaming Community','FranchiseHQ','furious-gaming-community',2027,2,1,9,
       0,'active','enabled','America/Chicago','{}','{}')`).run();
    const existingBefore = sqlite.prepare(`SELECT * FROM leagues WHERE id='league-fgc'`).get();
    const candidate = await plan();
    sqlite.prepare(`INSERT INTO platform_league_onboarding_plans
      (id,planned_league_id,slug,name,product_name,timezone,game_year,initial_commissioner_user_id,
       source_mode,branding_json,desired_features_json,plan_hash,status,revision,
       created_by_user_id,updated_by_user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      candidate.id,candidate.plannedLeagueId,candidate.slug,candidate.name,candidate.productName,
      candidate.timezone,candidate.gameYear,candidate.initialCommissionerUserId,candidate.sourceMode,
      JSON.stringify(candidate.branding),JSON.stringify(candidate.desiredFeatures),candidate.planHash,
      'preparing',2,'owner-user','owner-user'
    );
    const preparing = Object.freeze({ ...candidate,status:'preparing',revision:2 });
    await db.batch(preparedLeagueStatements(db,preparing,'owner-user'));
    await db.batch(preparedLeagueStatements(db,preparing,'owner-user'));

    const tenant = sqlite.prepare(`SELECT tenant_status,public_status,current_week,configuration_json
      FROM leagues WHERE id='league-example'`).get();
    assert.equal(tenant.tenant_status,'disabled');
    assert.equal(tenant.public_status,'inactive');
    assert.equal(tenant.current_week,1);
    assert.equal(JSON.parse(tenant.configuration_json).onboarding.activationAvailable,false);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM leagues WHERE id='league-example'`).get().count,1);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM league_features WHERE league_id='league-example'`).get().count,ONBOARDING_FEATURE_KEYS.length);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM league_features WHERE league_id='league-example' AND enabled=1`).get().count,0);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM companion_league_export_endpoints WHERE league_id='league-example'`).get().count,1);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM league_memberships WHERE league_id='league-example'`).get().count,0);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM league_snapshots WHERE league_id='league-example'`).get().count,0);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM discord_league_installations WHERE league_id='league-example'`).get().count,0);
    assert.deepEqual(sqlite.prepare(`SELECT * FROM leagues WHERE id='league-fgc'`).get(),existingBefore);

    assert.equal(await resolveTenant({ DB:db },candidate.slug),null);
    const privateTenant = await resolveTenant({ DB:db },candidate.slug,{ requireEnabled:false });
    assert.equal(privateTenant.id,candidate.plannedLeagueId);
    assert.equal(privateTenant.enabled,false);

    const readiness = await onboardingReadiness(db,Object.freeze({ ...preparing,status:'prepared' }));
    assert.equal(readiness.readyForActivationReview,true);
    assert.equal(readiness.activationAvailable,true);
    assert.ok(readiness.checks.every(item => item.status === 'pass'));
  } finally { sqlite.close(); }
});

test('slug, domain, and commissioner conflicts are detected before a plan is saved', async () => {
  const { sqlite,db } = await database();
  try {
    insertUser(sqlite);
    const candidate = await plan({ desiredDomain:'league.example.com' });
    sqlite.prepare(`INSERT INTO leagues
      (id,name,product_name,slug,current_season,current_week,trade_start_week,trade_deadline_week,
       discord_connected,public_status,tenant_status,timezone,branding_json,configuration_json)
      VALUES ('taken','Taken','FranchiseHQ',?,1,1,1,9,0,'inactive','disabled','UTC','{}','{}')`).run(candidate.slug);
    const conflict = await inspectOnboardingConflicts(db,candidate);
    assert.equal(conflict.ok,false);
    assert.ok(conflict.conflicts.some(item => item.code === 'slug-in-use'));

    const missingCommissioner = await plan({ slug:'another-league',initialCommissionerUserId:'missing-user' });
    const missing = await inspectOnboardingConflicts(db,missingCommissioner);
    assert.ok(missing.conflicts.some(item => item.code === 'commissioner-missing'));
  } finally { sqlite.close(); }
});

test('owner API saves, prepares, lists, and safely cancels one disabled plan', async () => {
  const { sqlite,db } = await database();
  try {
    insertUser(sqlite);
    const planInput = {
      name:'API Test League',slug:'api-test-league',timezone:'America/Chicago',gameYear:2028,
      sourceMode:'companion',limits:{ memberLimit:80,importConcurrency:2,discordDeliveriesPerMinute:45 },
      branding:{ primaryColor:'#112233',secondaryColor:'#445566' },
      desiredFeatures:{ confidence_pool:true }
    };
    const saveResponse = await onRequestPost(await ownerContext(sqlite,db,'POST',{ action:'save',plan:planInput }));
    assert.equal(saveResponse.status,201);
    const saved = await saveResponse.json();
    assert.equal(saved.plan.status,'draft');
    assert.equal(saved.plan.limits.memberLimit,80);

    const prepareResponse = await onRequestPost({
      ...(await ownerContext(sqlite,db,'POST',{ action:'prepare',planId:saved.plan.id,expectedRevision:saved.plan.revision }))
    });
    assert.equal(prepareResponse.status,200);
    const prepared = await prepareResponse.json();
    assert.equal(prepared.plan.status,'prepared');
    assert.equal(prepared.plan.readiness.readyForActivationReview,true);
    assert.equal(prepared.plan.readiness.activationAvailable,true);

    sqlite.prepare(`INSERT INTO league_snapshots
      (id,league_id,status,season_year,week_index,manifest_json,validation_status,activated_at)
      VALUES ('snapshot-fgc','league-fgc','active',2027,5,'{}','ready',CURRENT_TIMESTAMP)`).run();
    sqlite.prepare(`INSERT INTO league_active_snapshots (league_id,snapshot_id)
      VALUES ('league-fgc','snapshot-fgc')`).run();

    const getResponse = await onRequestGet(await ownerContext(sqlite,db));
    const listed = await getResponse.json();
    assert.equal(listed.plans.length,1);
    assert.equal(listed.users.length,1);
    assert.equal(listed.leagues.find(league => league.slug === 'furious-gaming-community').currentSeason,2027);
    assert.equal(listed.leagues.find(league => league.slug === 'furious-gaming-community').currentWeek,5);

    const cancelResponse = await onRequestPost(await ownerContext(sqlite,db,'POST',{
      action:'cancel',planId:prepared.plan.id,expectedRevision:prepared.plan.revision
    }));
    assert.equal(cancelResponse.status,200);
    const cancelled = await cancelResponse.json();
    assert.equal(cancelled.plan.status,'cancelled');
    assert.equal(cancelled.contained,true);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM leagues WHERE id=?`).get(prepared.plan.plannedLeagueId).count,1);
    assert.equal(sqlite.prepare(`SELECT tenant_status FROM leagues WHERE id=?`).get(prepared.plan.plannedLeagueId).tenant_status,'disabled');
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM platform_league_onboarding_events WHERE plan_id=?`).get(prepared.plan.id).count,4);
  } finally { sqlite.close(); }
});

test('activation is atomic, isolated, and grants only the reviewed commissioner', async () => {
  const { sqlite,db } = await database();
  try {
    insertUser(sqlite);
    sqlite.prepare(`INSERT INTO leagues
      (id,name,product_name,slug,current_season,current_week,trade_start_week,trade_deadline_week,
       discord_connected,public_status,tenant_status,timezone,branding_json,configuration_json)
      VALUES ('league-fgc','Furious Gaming Community','FranchiseHQ','furious-gaming-community',2027,2,1,9,
       0,'active','enabled','America/Chicago','{}','{}')`).run();
    const existingBefore = sqlite.prepare(`SELECT * FROM leagues WHERE id='league-fgc'`).get();
    const candidate = await plan();
    sqlite.prepare(`INSERT INTO platform_league_onboarding_plans
      (id,planned_league_id,slug,name,product_name,timezone,game_year,initial_commissioner_user_id,
       source_mode,branding_json,desired_features_json,plan_hash,status,revision,
       created_by_user_id,updated_by_user_id,prepared_by_user_id,prepared_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(
      candidate.id,candidate.plannedLeagueId,candidate.slug,candidate.name,candidate.productName,
      candidate.timezone,candidate.gameYear,candidate.initialCommissionerUserId,candidate.sourceMode,
      JSON.stringify(candidate.branding),JSON.stringify(candidate.desiredFeatures),candidate.planHash,
      'prepared',3,'owner-user','owner-user','owner-user'
    );
    const prepared = Object.freeze({ ...candidate,status:'prepared',revision:3,preparedAt:new Date().toISOString() });
    await db.batch(preparedLeagueStatements(db,prepared,'owner-user'));
    assert.equal((await onboardingReadiness(db,prepared)).activationAvailable,true);
    await db.batch(activatedLeagueStatements(db,prepared,'owner-user','request_activation_test'));
    const row = sqlite.prepare(`SELECT revision,activated_at FROM platform_league_onboarding_plans WHERE id=?`).get(prepared.id);
    const activated = { ...prepared,revision:row.revision,activatedAt:row.activated_at };
    const after = await onboardingReadiness(db,activated);
    assert.equal(after.activated,true);
    assert.equal(after.activationAvailable,false);
    assert.ok(after.checks.every(item => item.status === 'pass'));
    assert.equal(sqlite.prepare(`SELECT tenant_status FROM leagues WHERE id=?`).get(prepared.plannedLeagueId).tenant_status,'enabled');
    assert.equal(sqlite.prepare(`SELECT public_status FROM leagues WHERE id=?`).get(prepared.plannedLeagueId).public_status,'active');
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM league_memberships WHERE league_id=? AND user_id='owner-user' AND role='commissioner' AND active=1`).get(prepared.plannedLeagueId).count,1);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM platform_league_activations WHERE plan_id=?`).get(prepared.id).count,1);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM league_snapshots WHERE league_id=?`).get(prepared.plannedLeagueId).count,0);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM discord_schedule_threads WHERE league_id=?`).get(prepared.plannedLeagueId).count,0);
    assert.deepEqual(sqlite.prepare(`SELECT * FROM leagues WHERE id='league-fgc'`).get(),existingBefore);
  } finally { sqlite.close(); }
});

test('the owner console is responsive and exposes only owner-gated activation', async () => {
  const [html,ui,admin,adminCss,identity,middleware] = await Promise.all([
    readFile(path.join(ROOT,'index.html'),'utf8'),
    readFile(path.join(ROOT,'league-engine/platform-onboarding.js'),'utf8'),
    readFile(path.join(ROOT,'platform-admin.js'),'utf8'),
    readFile(path.join(ROOT,'platform-admin.css'),'utf8'),
    readFile(path.join(ROOT,'league-engine/platform-owner-identity.js'),'utf8'),
    readFile(path.join(ROOT,'functions/_middleware.js'),'utf8')
  ]);
  assert.match(adminCss,/platform-onboarding-form-grid[^}]+grid-template-columns:repeat\(2/);
  assert.match(adminCss,/@media\(max-width:700px\)[\s\S]+platform-onboarding-form-grid/);
  assert.match(html,/data-platform-admin-link data-platform-owner-only/);
  assert.match(html,/platform-owner-identity\.js\?v=8\.0\.3\.1/);
  assert.match(html,/trade-module\.js\?v=8\.0\.18/);
  assert.match(identity,/VERSION = '8\.0\.3\.1'/);
  assert.match(identity,/SERVER_PLATFORM_OWNER/);
  assert.match(admin,/data-platform-onboarding-host/);
  assert.match(admin,/Advanced Diagnostics/);
  assert.match(ui,/activationAvailable:true/);
  assert.match(ui,/data-onboarding-activate/);
  assert.match(ui,/planAction\('activate'/);
  assert.match(middleware,/platform-mutation/);
});
