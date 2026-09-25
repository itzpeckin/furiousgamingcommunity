import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createEaClient, EaClientError, makeEaLoginUrl } from '../../functions/_lib/ea-client.js';

const env = { EA_CLIENT_SECRET: 'test-client-secret' };
const token = { accessToken: 'test-access', refreshToken: 'test-refresh', expiresAt: '2026-09-25T12:00:00.000Z' };
const session = () => ({ sessionKey: 'test-session', blazeId: 12345, requestId: 1 });
const persona = { id: '12345', name: 'Coach', namespace: 'ps3', platform: 'ps5', entitlement: 'MADDEN_27PS5' };
// Workers extends Web Crypto with MD5. Node's digest adapter verifies interoperability without changing runtime code.
const cryptoImpl = {
  getRandomValues(bytes) { bytes.set([1, 2, 3, 4]); return bytes; },
  subtle: { async digest(algorithm, bytes) { return createHash(algorithm.toLowerCase()).update(bytes).digest(); } }
};

function fixture(responses, options = {}) {
  const requests = [];
  const client = createEaClient(env, { cryptoImpl, ...options, fetchImpl: async (url, init) => {
    requests.push({ url: new URL(url), ...init });
    const response = responses.shift();
    assert.ok(response, 'unexpected EA request');
    if (typeof response === 'function') return response(url, init);
    return Response.json(response);
  } });
  return { client, requests };
}

test('EA login and code exchange use the Madden 27 client and fixed callback', async () => {
  const login = new URL(makeEaLoginUrl({}, 'test-state'));
  assert.equal(login.origin, 'https://accounts.ea.com');
  assert.equal(login.searchParams.get('redirect_uri'), 'http://127.0.0.1/success');
  assert.equal(login.searchParams.get('client_id'), 'MCA_27_COMP_APP');
  assert.equal(login.searchParams.get('state'), 'test-state');
  assert.equal(login.searchParams.has('client_secret'), false);
  const { client, requests } = fixture([{ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }]);
  const result = await client.exchangeCode('a&b=code');
  const parameters = new URLSearchParams(requests[0].body);
  assert.equal(parameters.get('code'), 'a&b=code');
  assert.equal(parameters.get('redirect_uri'), 'http://127.0.0.1/success');
  assert.equal(parameters.get('client_secret'), 'test-client-secret');
  assert.equal(result.accessToken, 'access');
  assert.ok(Date.parse(result.expiresAt) > Date.now());
  assert.equal(requests[0].redirect, 'manual');
});

test('EA exchange requires a configured client secret and does not call a provider', async () => {
  const client = createEaClient({}, { fetchImpl: () => { throw new Error('must not fetch'); } });
  await assert.rejects(client.exchangeCode('code'), error => error.code === 'EA_NOT_CONFIGURED');
});

test('EA profiles are restricted to current active entitlements and matching console namespaces', async () => {
  const { client, requests } = fixture([
    { pid_id: '987' },
    { entitlements: { entitlement: [
      { entitlementTag: 'ONLINE_ACCESS', groupName: 'MADDEN_27PS5', pidUri: '/pids/987' },
      { entitlementTag: 'ONLINE_ACCESS', groupName: 'MADDEN_26PS5', pidUri: '/pids/987' },
      { entitlementTag: 'OTHER', groupName: 'MADDEN_27PS5', pidUri: '/pids/987' }
    ] } },
    { personas: { persona: [
      { personaId: 12345, displayName: 'Coach', namespaceName: 'ps3', status: 'ACTIVE' },
      { personaId: 12345, displayName: 'Coach duplicate', namespaceName: 'ps3', status: 'ACTIVE' },
      { personaId: 67890, displayName: 'Xbox', namespaceName: 'xbox', status: 'ACTIVE' },
      { personaId: 45678, displayName: 'Old', namespaceName: 'ps3', status: 'DISABLED' }
    ] } }
  ]);
  assert.deepEqual(await client.personas(token.accessToken), [persona]);
  assert.equal(requests.length, 3);
  assert.equal(requests[1].url.pathname, '/proxy/identity/pids/987/entitlements/');
  assert.equal(requests[2].headers.Authorization, 'Bearer test-access');
});

test('EA-supplied identity references cannot become arbitrary outbound URLs', async () => {
  const { client, requests } = fixture([
    { pid_id: '987' },
    { entitlements: { entitlement: [{ entitlementTag: 'ONLINE_ACCESS', groupName: 'MADDEN_27PS5', pidUri: 'https://attacker.invalid/pids/987' }] } }
  ]);
  await assert.rejects(client.personas(token.accessToken), error => error.code === 'EA_INVALID_RESPONSE');
  assert.equal(requests.length, 2);
});

test('persona authorization reads only the fixed loopback redirect and exchanges its code server-side', async () => {
  const { client, requests } = fixture([
    () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/success?code=persona-code' } }),
    { access_token: 'persona-access', refresh_token: 'persona-refresh', expires_in: 3600 }
  ]);
  const result = await client.personaToken(token.accessToken, persona);
  assert.equal(requests[0].url.searchParams.get('persona_id'), '12345');
  assert.equal(requests[0].url.searchParams.get('persona_namespace'), 'ps3');
  assert.equal(new URLSearchParams(requests[1].body).get('code'), 'persona-code');
  assert.equal(result.accessToken, 'persona-access');
  assert.equal(requests.some(request => request.url.hostname === '127.0.0.1'), false);
});

test('redirects cannot forward tokens or convert an unexpected callback into a connection', async () => {
  const { client, requests } = fixture([() => new Response(null, { status: 302, headers: { location: 'https://attacker.invalid/success?code=stolen' } })]);
  await assert.rejects(client.personaToken(token.accessToken, persona), error => error.code === 'EA_INVALID_REQUEST');
  assert.equal(requests.length, 1);
  const { client: denied } = fixture([() => new Response(null, { status: 302, headers: { location: 'https://attacker.invalid/' } })]);
  await assert.rejects(denied.exchangeCode('code'), error => error.code === 'EA_UNEXPECTED_REDIRECT');
});

test('refresh rotates tokens and login returns the selected Madden session', async () => {
  const { client, requests } = fixture([
    { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 },
    { userLoginInfo: { sessionKey: 'new-session', personaDetails: { personaId: 12345 } } }
  ]);
  const refreshed = await client.refresh(token);
  assert.equal(refreshed.refreshToken, 'new-refresh');
  assert.equal(new URLSearchParams(requests[0].body).get('refresh_token'), 'test-refresh');
  assert.deepEqual(await client.login(refreshed, 'ps5'), { sessionKey: 'new-session', blazeId: 12345, requestId: 1 });
  assert.equal(JSON.parse(requests[1].body).productName, 'madden-2027-ps5-mca');
  assert.equal(requests[1].headers['X-BLAZE-ID'], 'madden-2027-ps5');
});

test('league commands sign the exact protocol payload and reserve distinct request ids', async () => {
  const { client, requests } = fixture([
    { responseInfo: { value: { leagues: [{ leagueId: 700, leagueName: 'FGC' }], success: true } } },
    { responseInfo: { value: { careerHubInfo: { seasonInfo: { seasonWeek: 4 } } } } }
  ]);
  const currentSession = session();
  const [leagues, hub] = await Promise.all([
    client.leagues(token, currentSession, 'ps5'), client.hub(token, currentSession, 'ps5', 700)
  ]);
  assert.equal(leagues[0].leagueId, 700);
  assert.equal(hub.careerHubInfo.seasonInfo.seasonWeek, 4);
  assert.equal(currentSession.requestId, 3);
  for (const [index, request] of requests.entries()) {
    const outer = JSON.parse(request.body);
    const info = JSON.parse(outer.requestInfo);
    assert.equal(outer.apiVersion, 2);
    assert.equal(info.commandId, index === 0 ? 801 : 811);
    const auth = info.messageAuthData;
    const bytes = Buffer.from(auth.authData, 'base64');
    const expectedSignature = createHash('md5').update(Buffer.from('3a53413521464c3b6531326530705b70203a2900', 'hex')).update(bytes).digest('base64');
    assert.equal(auth.authCode, expectedSignature);
    const mask = createHash('md5').update(bytes.subarray(0, 4)).update(Buffer.from('634203362017bf72f70ba900c0aa4e6b', 'hex')).digest();
    const decoded = Buffer.from(bytes.subarray(4).map((byte, offset) => byte ^ mask[offset % 16])).toString();
    assert.deepEqual(JSON.parse(decoded), { staticData: '05e6a7ead5584ab4', requestId: index + 1, blazeId: 12345 });
  }
});

test('dataset selection preserves previous/current zero-based periods and explicit Free Agent mode', async () => {
  const { client, requests } = fixture([
    { success: true, playerPassingStatInfoList: [{ weekIndex: 3 }] },
    { success: true, gameScheduleInfoList: [{ weekIndex: 4 }] },
    { success: true, rosterInfoList: [] },
    { success: true, rosterInfoList: [{ rosterId: 10 }] }
  ]);
  await client.dataset(token, session(), 'ps5', 700, 'passing', { stageIndex: 1, weekIndex: 3 });
  await client.dataset(token, session(), 'ps5', 700, 'schedules', { stageIndex: 1, weekIndex: 4 });
  await client.dataset(token, session(), 'ps5', 700, 'freeagents');
  await client.dataset(token, session(), 'ps5', 700, 'roster', { teamId: 9, listIndex: 0 });
  assert.deepEqual(requests.map(request => JSON.parse(request.body)), [
    { leagueId: 700, stageIndex: 1, weekIndex: 3 },
    { leagueId: 700, stageIndex: 1, weekIndex: 4 },
    { leagueId: 700, listIndex: -1, returnFreeAgents: true, teamId: 0 },
    { leagueId: 700, listIndex: 0, returnFreeAgents: false, teamId: 9 }
  ]);
});

test('invalid dataset names, platforms, indexes and team references never reach EA', async () => {
  const { client, requests } = fixture([]);
  const invalid = [
    () => client.dataset(token, session(), 'ps5', 700, 'https://attacker.invalid'),
    () => client.dataset(token, session(), 'unknown', 700, 'teams'),
    () => client.dataset(token, session(), 'ps5', 700, 'schedules', { stageIndex: 0, weekIndex: 4 }),
    () => client.dataset(token, session(), 'ps5', 700, 'schedules', { stageIndex: 1, weekIndex: 23 }),
    () => client.dataset(token, session(), 'ps5', 700, 'roster', { teamId: 0, listIndex: -1 }),
    () => client.dataset(token, session(), 'ps5', '700/../1', 'teams')
  ];
  for (const operation of invalid) await assert.rejects(operation(), error => error.code === 'EA_INVALID_REQUEST');
  assert.equal(requests.length, 0);
});

test('blocked and incomplete Free Agents remain errors while explicit successful empty lists are valid', async () => {
  for (const data of [{ success: false, message: 'Due to unusually high server load this mode is disabled', rosterInfoList: [] }, { success: true }, {}]) {
    const { client } = fixture([data]);
    await assert.rejects(client.dataset(token, session(), 'ps5', 700, 'freeagents'), error => error instanceof EaClientError);
  }
  const { client } = fixture([{ success: true, rosterInfoList: [] }]);
  assert.deepEqual(await client.dataset(token, session(), 'ps5', 700, 'freeagents'), { success: true, rosterInfoList: [] });
});

test('provider failures and network errors cannot expose credentials or raw response bodies', async () => {
  const responses = [
    () => new Response('test-access test-client-secret https://ea.invalid/?token=test-refresh', { status: 401 }),
    () => { throw new Error('test-access test-client-secret https://ea.invalid/?token=test-refresh'); },
    { error: { errorname: 'ERR_TIMEOUT', errordf: { errorString: 'test-access test-client-secret' } } },
    () => new Response('not JSON test-access test-client-secret')
  ];
  for (const response of responses) {
    const { client } = fixture([response]);
    await assert.rejects(client.exchangeCode('code'), error => {
      assert.ok(error instanceof EaClientError);
      assert.doesNotMatch(JSON.stringify(error) + error.message, /test-access|test-refresh|test-client-secret|https:/);
      return true;
    });
  }
});

test('expired refresh grants return reconnect guidance from a sanitized OAuth error', async () => {
  const { client } = fixture([() => Response.json({ error: 'invalid_grant', error_description: 'Expired test-refresh' }, { status: 400 })]);
  await assert.rejects(client.refresh(token), error => error.code === 'EA_RECONNECT_REQUIRED' && !error.message.includes('test-refresh'));
});

test('EA responses are bounded both with and without a content-length header', async () => {
  let cancelled = false;
  const { client: knownLength } = fixture([() => new Response('too big', { headers: { 'content-length': String(8 * 1024 * 1024 + 1) } })]);
  await assert.rejects(knownLength.exchangeCode('code'), error => error.code === 'EA_RESPONSE_TOO_LARGE');
  const { client: streamed } = fixture([() => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { cancelled = true; }
  }))]);
  await assert.rejects(streamed.exchangeCode('code'), error => error.code === 'EA_RESPONSE_TOO_LARGE');
  assert.equal(cancelled, true);
});

test('EA requests abort on a bounded deadline with a sanitized retryable timeout', async () => {
  const client = createEaClient(env, { timeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('raw credential url')), { once: true });
  }) });
  await assert.rejects(client.exchangeCode('code'), error => error.code === 'EA_TIMEOUT' && error.retryable);
});
