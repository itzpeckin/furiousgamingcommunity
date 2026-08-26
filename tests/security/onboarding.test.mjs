import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  normalizeMembershipInput,
  onRequestDelete as deactivateMembership,
  onRequestPost as saveMembership
} from '../../functions/api/leagues/[leagueSlug]/memberships.js';

function membershipDatabase({ targetMembership = null, occupied = null } = {}) {
  return {
    prepare(sql) {
      return {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes('SELECT id FROM leagues WHERE lower(replace')) return { id:'league-1' };
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
    { ok:true, role:'trade_committee', teamId:null, userId:'user-1', discordUserId:'' }
  );
});
test('commissioner cannot activate a global user who did not accept the league invite', async () => {
  const response = await saveMembership(requestContext(
    { userId:'invitee-user', role:'team_owner', teamId:'dal' },
    membershipDatabase({ targetMembership:null })
  ));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /invite link/i);
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
  assert.ok(authClient.includes('restoreLoginRoute()'));
  assert.ok(authClient.includes('franchisehq:auth:return-route:v1'));
  assert.ok(app.includes("['commissioner','trade-center','trade-block'].includes(activeBase)"));
  assert.ok(callback.includes("'membership_restored_pending'"));
  assert.ok(callback.includes("latestAccessAction?.action === 'membership_deactivated'"));
});
