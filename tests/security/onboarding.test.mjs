import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

import {
  normalizeMembershipInput,
  onRequestGet as listMemberships,
  onRequestDelete as deactivateMembership,
  onRequestPost as saveMembership
} from '../../functions/api/leagues/[leagueSlug]/memberships.js';

function membershipDatabase({ targetMembership = null, occupied = null, membershipRows = [], teamRows = null } = {}) {
  const preparedSql = [];
  const canonicalTeamRows = teamRows || [
    { external_id:'dal-live', data_json:JSON.stringify({ external_id:'dal-live', abbreviation:'DAL', display_name:'Dallas Cowboys' }) },
    { external_id:'tb-live', data_json:JSON.stringify({ external_id:'tb-live', abbreviation:'TB', display_name:'Tampa Bay Buccaneers' }) }
  ];
  return {
    preparedSql,
    prepare(sql) {
      preparedSql.push(sql);
      return {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes('FROM leagues') && sql.includes('WHERE lower(slug)')) return {
            id:'league-1', slug:'fgc', name:'FGC', product_name:'Franchise HQ',
            public_status:'active', tenant_status:'enabled', timezone:'America/Chicago',
            branding_json:'{}', configuration_json:'{}'
          };
          if (sql.includes('FROM league_slug_aliases')) return null;
          if (sql.includes('FROM sessions')) {
            return {
              session_id:'session-1',
              expires_at:'2099-01-01T00:00:00.000Z',
              user_id:'commissioner-user',
              discord_user_id:'100000000000000001',
              discord_username:'commissioner',
              discord_global_name:'Commissioner',
              display_name:'Commissioner',
              avatar_url:null,
              membership_id:'commissioner-membership',
              league_id:'league-1',
              league_slug:'fgc',
              league_name:'FGC',
              role:'commissioner',
              team_id:'tb',
              membership_active:1
            };
          }
          if (sql.includes('SELECT id, slug, name FROM leagues')) {
            return { id:'league-1', slug:'fgc', name:'FGC' };
          }
          if (sql.includes('FROM users WHERE id=')) {
            return { id:this.values[0], discord_user_id:'100000000000000002', display_name:'Invitee' };
          }
          if (sql.includes('FROM users WHERE discord_user_id=')) {
            return { id:'invitee-user', discord_user_id:this.values[0], display_name:'Invitee' };
          }
          if (sql.includes('SELECT lm.id')) return targetMembership;
          if (sql.includes('SELECT u.display_name AS displayName')) return occupied;
          if (sql.includes('SELECT COUNT(*) AS count')) return { count:1 };
          return null;
        },
        async all() {
          if (sql.includes('FROM league_features') || sql.includes('FROM league_domains')) return { results:[] };
          if (sql.includes("r.domain='teams'")) return { results:canonicalTeamRows };
          if (sql.includes('AS storedTeamId')) return { results:occupied ? [{
            membershipId:'existing-membership', userId:'existing-user', role:'team_owner',
            storedTeamId:'dal', displayName:occupied.displayName
          }] : [] };
          return { results:membershipRows };
        },
        async run() { return { meta:{ changes:1 } }; }
      };
    }
  };
}

function requestContext(body, db, method = 'POST') {
  return {
    request:new Request('https://franchisehq.app/api/leagues/fgc/memberships', {
      method,
      headers:{
        'content-type':'application/json',
        cookie:'franchise_hq_session=valid-session-token'
      },
      body:JSON.stringify(body)
    }),
    params:{ leagueSlug:'fgc' },
    env:{ DB:db }
  };
}

test('membership input requires a safe role, user, and owner team', () => {
  assert.equal(normalizeMembershipInput({ userId:'user-1', role:'team_owner' }).ok, false);
  assert.equal(normalizeMembershipInput({ userId:'user-1', role:'platform_owner', teamId:'tb' }).ok, false);
  assert.equal(normalizeMembershipInput({ userId:'../user', role:'team_owner', teamId:'tb' }).ok, false);
  assert.deepEqual(
    normalizeMembershipInput({ userId:'user-1', role:'trade_committee', teamId:'' }),
    { ok:true, role:'trade_committee', teamId:null, userId:'user-1', discordUserId:'', reactivate:false }
  );
});

test('the FGC membership policy requires a team for every active league role', async () => {
  const response = await saveMembership(requestContext(
    { userId:'invitee-user', role:'trade_committee', teamId:null },
    membershipDatabase({ targetMembership:{ id:'pending-1', active:0, lastAccessAction:null } })
  ));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /every active league member requires a team/i);
});
test('commissioner cannot activate a global user who did not accept the league invite', async () => {
  const response = await saveMembership(requestContext(
    { userId:'invitee-user', role:'team_owner', teamId:'dal' },
    membershipDatabase({ targetMembership:null })
  ));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /invite link/i);
});

test('member listing remains available before the membership audit repair is applied', async () => {
  const db = membershipDatabase({
    membershipRows:[{
      id:'pending-1', userId:'invitee-user', role:'team_owner', teamId:null,
      active:0, status:'pending', displayName:'Invitee'
    }]
  });
  const response = await listMemberships({
    request:new Request('https://franchisehq.app/api/leagues/fgc/memberships', {
      headers:{ cookie:'franchise_hq_session=valid-session-token' }
    }),
    params:{ leagueSlug:'fgc' },
    env:{ DB:db }
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).memberships[0].status, 'pending');
  const listSql = db.preparedSql.find(sql => sql.includes('ORDER BY CASE WHEN lm.active=0')) || '';
  assert.ok(listSql.includes("lm.active=0 AND lm.role='team_owner' AND lm.team_id IS NULL"));
  assert.equal(listSql.includes('FROM league_membership_audit a'), false);
});

test('membership audit repair is idempotent and preserves existing membership rows', async () => {
  const migration = await readFile(new URL('../../migrations/legacy/0015_membership_audit_repair.sql', import.meta.url), 'utf8');
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE leagues (id TEXT PRIMARY KEY);
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE league_memberships (
      id TEXT PRIMARY KEY, league_id TEXT NOT NULL, user_id TEXT NOT NULL,
      role TEXT NOT NULL, team_id TEXT, active INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO leagues (id) VALUES ('league-1');
    INSERT INTO users (id) VALUES ('user-1');
    INSERT INTO league_memberships (id, league_id, user_id, role, team_id, active)
    VALUES ('membership-1', 'league-1', 'user-1', 'commissioner', NULL, 1);
  `);
  db.exec(migration);
  db.exec(migration);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM league_memberships`).get().count, 1);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM league_membership_audit`).get().count, 0);
  assert.equal(db.prepare(`SELECT name FROM schema_migrations WHERE version=15`).get().name, 'membership_audit_repair');
  db.close();
});

test('commissioner cannot assign two active users to the same team', async () => {
  const response = await saveMembership(requestContext(
    { userId:'invitee-user', role:'team_owner', teamId:'dal' },
    membershipDatabase({
      targetMembership:{
        id:'pending-1',
        userId:'invitee-user',
        role:'team_owner',
        teamId:null,
        active:0,
        lastAccessAction:null
      },
      occupied:{ displayName:'Existing Owner' }
    })
  ));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Existing Owner/);
});

test('revoked access requires an explicit secure reactivation from Teams & Owners', async () => {
  const targetMembership = {
    id:'disabled-1', userId:'invitee-user', role:'team_owner', teamId:'dal',
    active:0, lastAccessAction:'membership_deactivated'
  };
  const blocked = await saveMembership(requestContext(
    { userId:'invitee-user', role:'team_owner', teamId:'dal' },
    membershipDatabase({ targetMembership })
  ));
  assert.equal(blocked.status, 409);
  assert.match((await blocked.json()).error, /explicitly reactivate this revoked member/i);

  const restored = await saveMembership(requestContext(
    { userId:'invitee-user', role:'team_owner', teamId:'dal', reactivate:true },
    membershipDatabase({ targetMembership })
  ));
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).membership.active, true);
});

test('commissioner cannot demote or deactivate their own account', async () => {
  const db = membershipDatabase({
    targetMembership:{
      id:'commissioner-membership',
      userId:'commissioner-user',
      role:'commissioner',
      teamId:'tb',
      active:1,
      lastAccessAction:null
    }
  });
  const demotion = await saveMembership(requestContext(
    { userId:'commissioner-user', role:'team_owner', teamId:'tb' },
    db
  ));
  assert.equal(demotion.status, 409);
  assert.match((await demotion.json()).error, /own commissioner role/i);

  const deactivation = await deactivateMembership(requestContext(
    { userId:'commissioner-user' },
    db,
    'DELETE'
  ));
  assert.equal(deactivation.status, 409);
  assert.match((await deactivation.json()).error, /own membership/i);
});

test('refresh and onboarding source guards remain wired to the real Discord session', async () => {
  const [authClient, tradeModule, app, callback] = await Promise.all([
    readFile(new URL('../../auth-client.js', import.meta.url), 'utf8'),
    readFile(new URL('../../trade-module.js', import.meta.url), 'utf8'),
    readFile(new URL('../../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../../functions/api/auth/discord/callback.js', import.meta.url), 'utf8')
  ]);
  assert.equal(tradeModule.includes('if(!userId)openLogin()'), false);
  assert.ok(tradeModule.includes('function commissionerMembershipRows()'));
  assert.ok(tradeModule.includes('data-copy-league-invite'));
  assert.ok(tradeModule.includes("FRANCHISEHQ_PUBLIC_ORIGIN='https://franchisehq.app'"));
  assert.ok(tradeModule.includes('commissionerMembersPromise'));
  assert.ok(tradeModule.includes('Revoke Platform Access'));
  assert.equal(tradeModule.includes('Active Discord Members'), false);
  assert.equal(tradeModule.includes('Disabled Discord Members'), false);
  assert.equal(tradeModule.includes('renderCommissionerTeamsLegacy'), false);
  assert.ok(tradeModule.includes('New players awaiting assignment'));
  assert.ok(authClient.includes('restoreLoginRoute()'));
  assert.ok(authClient.includes('franchisehq:auth:return-route:v1'));
  assert.ok(app.includes("['commissioner','trade-center','trade-block'].includes(activeBase)"));
  assert.ok(callback.includes("'membership_restored_pending'"));
  assert.ok(callback.includes("latestAccessAction?.action === 'membership_deactivated'"));
});
