import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { onRequest as eaContainment } from '../../functions/api/leagues/[leagueSlug]/ea-direct/_middleware.js';
import { onRequest as securityMiddleware } from '../../functions/_middleware.js';
import {
  normalizeGame,
  normalizePlayer,
  normalizeStanding,
  normalizeTeam,
  onRequestGet as readSnapshot
} from '../../functions/api/leagues/[leagueSlug]/snapshot/read-model.js';
import { normalizeRulesDocument, onRequestGet as readRules } from '../../functions/api/leagues/[leagueSlug]/rules.js';
import { onRequestGet as readDiscovery } from '../../functions/api/leagues/[leagueSlug]/companion/discovery.js';
import { onRequestGet as logoutWithGet } from '../../functions/api/auth/logout.js';
import { onRequestGet as claimWithGet } from '../../functions/api/auth/session/claim.js';
import { JSON_HEADERS, suppliedExportToken } from '../../functions/_lib/cloud-platform.js';

test('EA-direct routes are fail-closed before any experimental handler runs', async () => {
  const response = await eaContainment();
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { ok: false, error: 'Not found.', release: '7.0.1' });
});

test('shared JSON responses do not grant wildcard cross-origin access', () => {
  assert.equal(Object.hasOwn(JSON_HEADERS, 'access-control-allow-origin'), false);
});

test('Companion credentials are accepted from headers but never from query strings', () => {
  const queryOnly = new Request('https://franchisehq.app/api/export?token=leaked');
  assert.equal(suppliedExportToken(queryOnly), '');
  const headerToken = new Request('https://franchisehq.app/api/export?token=ignored', {
    headers: { 'x-franchisehq-export-token': 'header-secret' }
  });
  assert.equal(suppliedExportToken(headerToken), 'header-secret');
});

test('protected league data rejects guests before touching storage', async () => {
  const context = {
    request: new Request('https://franchisehq.app/api/leagues/fgc/snapshot/read-model'),
    params: { leagueSlug: 'fgc' },
    env: {}
  };
  for (const handler of [readSnapshot, readRules, readDiscovery]) {
    const response = await handler(context);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'Authentication required.');
  }
});

test('state-changing auth endpoints reject GET', async () => {
  const context = { request: new Request('https://franchisehq.app/api/auth/logout'), env: {} };
  assert.equal((await logoutWithGet(context)).status, 405);
  assert.equal((await claimWithGet(context)).status, 405);
});

test('edge middleware adds browser protections and redacts server failures', async () => {
  const request = new Request('https://franchisehq.app/api/private');
  const response = await securityMiddleware({
    request,
    next: async () => new Response(JSON.stringify({ ok: false, details: 'database internals' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    })
  });
  const payload = await response.json();
  assert.equal(response.status, 500);
  assert.equal(payload.details, undefined);
  assert.match(payload.requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.ok(response.headers.get('content-security-policy-report-only'));
});

test('pages.dev document requests are sent to the canonical FranchiseHQ domain', async () => {
  let reachedHandler = false;
  const response = await securityMiddleware({
    request:new Request('https://preview.franchise-hq.pages.dev/leagues/fgc?source=invite', {
      headers:{ accept:'text/html', 'sec-fetch-dest':'document' }
    }),
    next:async () => { reachedHandler = true; return new Response(null, { status:204 }); }
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://franchisehq.app/leagues/fgc?source=invite');
  assert.equal(response.headers.get('x-franchisehq-canonical-host'), 'franchisehq.app');
  assert.equal(reachedHandler, false);
});

test('pages.dev API callbacks remain reachable for the configured Discord handoff', async () => {
  let reachedHandler = false;
  const response = await securityMiddleware({
    request:new Request('https://franchise-hq.pages.dev/api/auth/discord/callback?code=test'),
    next:async () => { reachedHandler = true; return new Response(null, { status:204 }); }
  });
  assert.equal(response.status, 204);
  assert.equal(reachedHandler, true);
});

test('edge middleware rejects cross-origin state changes', async () => {
  let reachedHandler = false;
  const response = await securityMiddleware({
    request: new Request('https://franchisehq.app/api/leagues/fgc/rules', {
      method: 'PUT',
      headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
      body: '{}'
    }),
    next: async () => { reachedHandler = true; return new Response(null, { status: 204 }); }
  });
  assert.equal(response.status, 403);
  assert.equal(reachedHandler, false);
});

test('authentication entry points have a bounded per-client request budget', async () => {
  let finalResponse;
  for (let attempt = 0; attempt < 31; attempt += 1) {
    finalResponse = await securityMiddleware({
      request: new Request('https://franchisehq.app/api/auth/discord/login', {
        headers: { 'cf-connecting-ip': '203.0.113.7' }
      }),
      next: async () => new Response(null, { status: 204 })
    });
  }
  assert.equal(finalResponse.status, 429);
  assert.ok(Number(finalResponse.headers.get('retry-after')) > 0);
});

test('security-sensitive source cannot regress to URL tokens, raw DTOs, or unbounded reads', async () => {
  const [callback, claim, cloud, readModel] = await Promise.all([
    readFile(new URL('../../functions/api/auth/discord/callback.js', import.meta.url), 'utf8'),
    readFile(new URL('../../functions/api/auth/session/claim.js', import.meta.url), 'utf8'),
    readFile(new URL('../../functions/_lib/cloud-platform.js', import.meta.url), 'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/snapshot/read-model.js', import.meta.url), 'utf8')
  ]);
  assert.equal(callback.includes('searchParams.set("token"'), false);
  assert.ok(callback.includes('confirmed-mobile-handoff'));
  assert.ok(callback.includes('Confirm your FranchiseHQ sign in'));
  assert.ok(callback.includes('callbackOrigin === new URL(loginOrigin).origin && stateCookieMatched'));
  assert.equal(claim.includes('searchParams.get("token"'), false);
  assert.equal(cloud.includes("searchParams.get('token')"), false);
  assert.equal(readModel.includes('source: raw'), false);
  assert.equal(readModel.includes('bulkDomainRows'), false);
});

test('member DTOs preserve approved UI fields without returning the raw export', () => {
  const privateFields = { exportToken:'secret', discordId:'private', internalNote:'do not return' };
  const player = normalizePlayer({
    external_id:'p-1', team_external_id:'t-1', display_name:'Test Player',
    ratings_json:JSON.stringify({ speedRating:94, internalRatingNote:'not numeric' }),
    source_record_json:JSON.stringify({ ...privateFields, external_id:'attacker-value', college:'Test U', contractYearsRemaining:2 })
  });
  const team = normalizeTeam({ external_id:'t-1', display_name:'Test Team', source_record_json:JSON.stringify(privateFields) });
  const game = normalizeGame({ external_id:'g-1', home_team_external_id:'t-1', source_record_json:JSON.stringify(privateFields) });
  const standing = normalizeStanding({ teamId:'t-1', source_record_json:JSON.stringify(privateFields) });

  assert.equal(player.college, 'Test U');
  assert.equal(player.id, 'p-1');
  assert.equal(player.contract.yearsRemaining, 2);
  assert.equal(player.ratings.speedRating, 94);
  for (const record of [player, team, game, standing]) {
    assert.equal(JSON.stringify(record).includes('secret'), false);
    assert.equal(JSON.stringify(record).includes('do not return'), false);
    assert.equal(JSON.stringify(record).includes('discordId'), false);
  }
});

test('rules validation preserves the commissioner editor category-section-rule shape', () => {
  const input = {
    categories: [{
      id: 'gameplay',
      title: 'Gameplay',
      sections: [{
        id: 'fourth-down',
        title: 'Fourth Down',
        rules: [{ id: 'fd-1', title: 'Attempts', text: 'Follow the league limits.' }]
      }]
    }]
  };
  assert.deepEqual(normalizeRulesDocument(input), input);
  assert.throws(() => normalizeRulesDocument({
    categories: [{ ...input.categories[0], sections: [input.categories[0].sections[0], input.categories[0].sections[0]] }]
  }), /Duplicate section id/);
});
