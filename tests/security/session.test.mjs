import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTH_CONSTANTS,
  decodeOpaqueContext,
  encodeOpaqueContext,
  getCurrentSession,
  hashToken
} from '../../functions/_lib/auth.js';
import { onRequestPost as claimSession } from '../../functions/api/auth/session/claim.js';
import { onRequestGet as startDiscordLogin } from '../../functions/api/auth/discord/login.js';
import { createDirectSession } from '../../functions/api/auth/discord/callback.js';
import { onRequest as protectedLeagueDocument } from '../../functions/leagues/[[path]].js';
import { requireCommissioner } from '../../functions/_lib/permissions.js';
import {
  OWNER_DISCORD_REDIRECT_URI,
  PUBLIC_DISCORD_REDIRECT_URI,
  canonicalAuthenticationOrigin,
  discordRedirectUriForOrigin,
  normalizeLeagueReturnTo
} from '../../functions/_lib/origin.js';
import { isOwnerFallbackIdentity, ownerFallbackDiscordId } from '../../functions/_lib/owner-fallback.js';

function sessionDatabase(validHash) {
  return {
    prepare(sql) {
      return {
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (!sql.includes('FROM sessions')) return null;
          if (this.values[1] !== validHash) return null;
          return {
            session_id: 'session-valid',
            expires_at: '2099-01-01T00:00:00.000Z',
            user_id: 'user-1',
            discord_user_id: 'discord-1',
            discord_username: 'owner',
            discord_global_name: 'Owner',
            display_name: 'Owner',
            avatar_url: null,
            membership_id: 'member-1',
            league_id: 'league-1',
            league_slug: 'fgc',
            league_name: 'FGC',
            role: 'commissioner',
            team_id: null,
            membership_active: 1
          };
        },
        async run() { return { meta: { changes: 1 } }; }
      };
    }
  };
}

test('refresh recovers from a stale primary cookie when the recovery cookie is valid', async () => {
  const validToken = 'valid-recovery-token';
  const validHash = await hashToken(validToken);
  const request = new Request('https://franchisehq.app/api/auth/me?league=fgc', {
    headers: {
      Cookie: `${AUTH_CONSTANTS.SESSION_COOKIE_NAME}=stale-primary; ${AUTH_CONSTANTS.SESSION_RECOVERY_COOKIE_NAME}=${validToken}`
    }
  });
  const session = await getCurrentSession({ request, env: { DB: sessionDatabase(validHash) } }, { leagueId: 'league-1' });
  assert.equal(session.rawSessionToken, validToken);
  assert.equal(session.user.id, 'user-1');
  assert.equal(session.membership.role, 'commissioner');
});

test('ordinary members cannot use commissioner operations', async () => {
  const validToken = 'member-session-token';
  const validHash = await hashToken(validToken);
  const db = sessionDatabase(validHash);
  const originalPrepare = db.prepare.bind(db);
  db.prepare = sql => {
    if (sql.includes('SELECT id FROM leagues')) {
      return { bind() { return this; }, async first() { return { id: 'league-1' }; } };
    }
    const statement = originalPrepare(sql);
    const originalFirst = statement.first;
    statement.first = async function first() {
      const row = await originalFirst.call(this);
      return row ? { ...row, role: 'team_owner' } : row;
    };
    return statement;
  };
  const request = new Request('https://franchisehq.app/api/leagues/fgc/companion/discovery', {
    headers: { Cookie: `${AUTH_CONSTANTS.SESSION_COOKIE_NAME}=${validToken}` }
  });
  const result = await requireCommissioner({ request, params: { leagueSlug: 'fgc' }, env: { DB: db } });
  assert.equal(result.authorized, false);
  assert.equal(result.response.status, 403);
});

test('an active commissioner in the requested league passes the role boundary', async () => {
  const validToken = 'commissioner-session-token';
  const validHash = await hashToken(validToken);
  const db = sessionDatabase(validHash);
  const originalPrepare = db.prepare.bind(db);
  db.prepare = sql => {
    if (sql.includes('SELECT id FROM leagues')) {
      return { bind() { return this; }, async first() { return { id: 'league-1' }; } };
    }
    return originalPrepare(sql);
  };
  const request = new Request('https://franchisehq.app/api/leagues/fgc/companion/discovery', {
    headers: { Cookie: `${AUTH_CONSTANTS.SESSION_COOKIE_NAME}=${validToken}` }
  });
  const result = await requireCommissioner({ request, params: { leagueSlug: 'fgc' }, env: { DB: db } });
  assert.equal(result.authorized, true);
  assert.equal(result.session.membership.leagueId, 'league-1');
});

test('a signed-in user receives not-found for a league without membership', async () => {
  const validToken = 'cross-tenant-session-token';
  const validHash = await hashToken(validToken);
  const db = sessionDatabase(validHash);
  const originalPrepare = db.prepare.bind(db);
  db.prepare = sql => {
    if (sql.includes('SELECT id FROM leagues')) {
      return { bind() { return this; }, async first() { return { id: 'league-2' }; } };
    }
    const statement = originalPrepare(sql);
    const originalFirst = statement.first;
    statement.first = async function first() {
      const row = await originalFirst.call(this);
      return row ? { ...row, membership_id: null, league_id: null, membership_active: null } : row;
    };
    return statement;
  };
  const request = new Request('https://franchisehq.app/api/leagues/other/companion/discovery', {
    headers: { Cookie: `${AUTH_CONSTANTS.SESSION_COOKIE_NAME}=${validToken}` }
  });
  const result = await requireCommissioner({ request, params: { leagueSlug: 'other' }, env: { DB: db } });
  assert.equal(result.authorized, false);
  assert.equal(result.response.status, 404);
});

function handoffDatabase({ codeHash, handoffId }) {
  let used = false;
  const sessions = [];
  return {
    sessions,
    prepare(sql) {
      return {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes('FROM oauth_states')) {
            return !used && this.values[0] === codeHash ? { id: handoffId } : null;
          }
          if (sql.includes('FROM users')) return this.values[0] === 'user-1' ? { id: 'user-1' } : null;
          return null;
        }
      };
    },
    async batch(statements) {
      if (used) return [{ meta: { changes: 0 } }, { meta: { changes: 0 } }];
      used = true;
      sessions.push({ id: statements[0].values[0], userId: statements[0].values[1] });
      return [{ meta: { changes: 1 } }, { meta: { changes: 1 } }];
    }
  };
}

test('session handoff is origin-bound, one-time, and never accepted from a URL', async () => {
  const code = 'a'.repeat(64);
  const codeHash = await hashToken(code);
  const contextPayload = encodeOpaqueContext({
    userId: 'user-1',
    destination: '/leagues/fgc',
    audience: 'https://franchisehq.app'
  });
  const db = handoffDatabase({ codeHash, handoffId: `handoff.${contextPayload}.record-1` });
  const makeContext = () => ({
    request: new Request('https://franchisehq.app/api/auth/session/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code })
    }),
    env: { DB: db }
  });

  const first = await claimSession(makeContext());
  assert.equal(first.status, 303);
  assert.equal(first.headers.get('location'), '/leagues/fgc');
  assert.match(first.headers.get('set-cookie') || '', /franchise_hq_session/);
  assert.equal(db.sessions.length, 1);

  const replay = await claimSession(makeContext());
  assert.equal(replay.status, 400);
  assert.equal(db.sessions.length, 1);
});

test('same-origin Discord completion creates a durable session without a cross-domain handoff', async () => {
  const inserted = [];
  const db = {
    prepare(sql) {
      return {
        values:[],
        bind(...values) { this.values=values; return this; },
        async run() { inserted.push({ sql, values:this.values }); return { meta:{ changes:1 } }; }
      };
    }
  };
  const response = await createDirectSession({ env:{ DB:db } }, 'user-1', '/leagues/fgc#commissioner');
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/leagues/fgc#commissioner');
  assert.match(response.headers.get('set-cookie') || '', /franchise_hq_session/);
  assert.equal(response.headers.get('x-franchisehq-session-establishment'), 'same-origin');
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].values[1], 'user-1');
});

test('a missing league session uses the exact-route browser bridge instead of losing the hash', async () => {
  const response = await protectedLeagueDocument({
    request:new Request('https://franchisehq.app/leagues/fgc#commissioner'),
    env:{
      DB:{
        prepare() {
          return { bind() { return this; }, async first() { return { id:'league-1', slug:'fgc', name:'FGC' }; } };
        }
      }
    }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-franchisehq-auth-bridge'), 'exact-route');
  const html = await response.text();
  assert.match(html, /location\.hash/);
  assert.match(html, /returnTo/);
  assert.match(html, /exact league screen you refreshed/i);
});

test('public Discord login returns to franchisehq.app and preserves the exact protected route', async () => {
  let storedStateId = '';
  const db = {
    prepare(sql) {
      return {
        values:[],
        bind(...values) { this.values=values; return this; },
        async first() {
          if (sql.includes('SELECT id, slug FROM leagues')) return { id:'league-1', slug:'fgc' };
          return null;
        },
        async run() {
          if (sql.includes('INSERT INTO oauth_states')) storedStateId=this.values[0];
          return { meta:{ changes:1 } };
        }
      };
    }
  };
  const response = await startDiscordLogin({
    request:new Request('https://franchisehq.app/api/auth/discord/login?returnTo=%2Fleagues%2Ffgc%23trade-center%2Fnew'),
    env:{ DB:db, DISCORD_CLIENT_ID:'client-id', DISCORD_REDIRECT_URI:'https://franchise-hq.pages.dev/api/auth/discord/callback' }
  });
  const discordUrl = new URL(response.headers.get('location'));
  assert.equal(discordUrl.searchParams.get('redirect_uri'), PUBLIC_DISCORD_REDIRECT_URI);
  const context = decodeOpaqueContext(storedStateId.split('.')[1]);
  assert.equal(context.origin, 'https://franchisehq.app');
  assert.equal(context.redirectUri, PUBLIC_DISCORD_REDIRECT_URI);
  assert.equal(context.returnTo, '/leagues/fgc#trade-center/new');
});

test('Discord login begun on the owner fallback preserves that origin for commissioner gating', async () => {
  let storedStateId = '';
  const db = {
    prepare(sql) {
      return {
        values:[],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes('SELECT id, slug FROM leagues')) return { id:'league-1', slug:'fgc' };
          return null;
        },
        async run() {
          if (sql.includes('INSERT INTO oauth_states')) storedStateId = this.values[0];
          return { meta:{ changes:1 } };
        }
      };
    }
  };
  const response = await startDiscordLogin({
    request:new Request('https://franchise-hq.pages.dev/api/auth/discord/login?returnTo=%2Fleagues%2Ffgc'),
    env:{
      DB:db,
      DISCORD_CLIENT_ID:'client-id',
      DISCORD_REDIRECT_URI:'https://franchise-hq.pages.dev/api/auth/discord/callback'
    }
  });
  assert.equal(response.status, 302);
  const encoded = storedStateId.split('.')[1];
  const context = decodeOpaqueContext(encoded);
  assert.equal(context.origin, 'https://franchise-hq.pages.dev');
  assert.equal(context.joinLeagueSlug, 'fgc');
  assert.equal(context.redirectUri, OWNER_DISCORD_REDIRECT_URI);
  assert.equal(new URL(response.headers.get('location')).searchParams.get('redirect_uri'), OWNER_DISCORD_REDIRECT_URI);
});

test('only the configured Discord identity can qualify for the exact owner fallback', () => {
  const env = { OWNER_FALLBACK_DISCORD_ID:'100000000000000001' };
  assert.equal(ownerFallbackDiscordId(env), '100000000000000001');
  assert.equal(isOwnerFallbackIdentity(env, { discordUserId:'100000000000000001' }), true);
  assert.equal(isOwnerFallbackIdentity(env, { discordUserId:'100000000000000002' }), false);
  assert.equal(isOwnerFallbackIdentity({}, { discordUserId:'100000000000000001' }), false);
});

test('preview authentication is canonical while the exact owner fallback is preserved', () => {
  assert.equal(
    canonicalAuthenticationOrigin('https://feature-branch.franchise-hq.pages.dev/leagues/fgc'),
    'https://franchisehq.app'
  );
  assert.equal(
    canonicalAuthenticationOrigin('https://franchise-hq.pages.dev/leagues/fgc'),
    'https://franchise-hq.pages.dev'
  );
});

test('Discord callback selection and protected return routes fail closed', () => {
  assert.equal(discordRedirectUriForOrigin({}, 'https://franchisehq.app'), PUBLIC_DISCORD_REDIRECT_URI);
  assert.equal(discordRedirectUriForOrigin({}, 'https://franchise-hq.pages.dev'), OWNER_DISCORD_REDIRECT_URI);
  assert.equal(normalizeLeagueReturnTo('/leagues/fgc#commissioner/league-data'), '/leagues/fgc#commissioner/league-data');
  assert.equal(normalizeLeagueReturnTo('/leagues/fgc#trade-block'), '/leagues/fgc#trade-block');
  assert.equal(normalizeLeagueReturnTo('https://attacker.example/leagues/fgc'), null);
  assert.equal(normalizeLeagueReturnTo('//attacker.example/leagues/fgc'), null);
  assert.equal(normalizeLeagueReturnTo('/leagues/fgc?next=https://attacker.example'), null);
});
