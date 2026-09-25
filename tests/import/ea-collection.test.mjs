import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { EaClientError } from '../../functions/_lib/ea-client.js';
import { normalizeEaHub, eaCapturePlan, beginEaCapture, storeEaCapture } from '../../functions/_lib/ea-capture.js';
import { runEaCollectionStep } from '../../functions/_lib/ea-collection.js';
import { sealEa, openEa, connectionScope, jobScope } from '../../functions/_lib/ea-direct.js';
import { hashToken } from '../../functions/_lib/auth.js';
import { onRequestPost as collectStep } from '../../functions/api/leagues/[leagueSlug]/ea-direct/collect-step.js';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';

function hub(weekIndex = 4) {
  return {
    careerHubInfo: { seasonInfo: { seasonYear: 1, calendarYear: 2027, weekTitle: `Week ${weekIndex + 1}` } },
    availableWeekInfoList: [{ stageIndex: 1, weekIndex, weekTitle: `Week ${weekIndex + 1}` }],
    teamIdInfoList: Array.from({ length: 32 }, (_, index) => ({ teamId: index + 1 }))
  };
}

function fixture(mode = 'weekly') {
  const calls = [], stored = [], finalized = [];
  const options = {
    db: {}, bucket: {}, league: { id: 'league-a' },
    connection: { id: 'connection-a', league_id: 'league-a', external_league_id: '700', platform: 'ps5' },
    job: { id: 'job-a', league_id: 'league-a', connection_id: 'connection-a', actor_id: 'commissioner-a', mode },
    token: { accessToken: 'private-access' },
    client: {
      async login() { calls.push({ kind: 'login' }); return { sessionKey: 'private-session', requestId: 1, blazeId: 100 }; },
      async hub(_token, session, platform, leagueId) { session.requestId += 1; calls.push({ kind: 'hub', platform, leagueId }); return hub(); },
      async dataset(_token, _session, platform, leagueId, kind, args) { calls.push({ kind, platform, leagueId, args }); return { success: true, [kind]: [] }; }
    },
    capture: {
      normalizeEaHub, eaCapturePlan,
      async beginEaCapture(args) { assert.equal(args.collectionId, 'job-a'); return { sessionId: 'capture-session' }; },
      async storeEaCapture(args) { stored.push(args); return { success: args.payload.success !== false }; },
      async finalizeEaCapture(args) { finalized.push(args); return { readiness: { ready: true }, readyPointerChanged: args.publishReady && args.mode === 'weekly' }; }
    }
  };
  return { options, calls, stored, finalized };
}

async function finish(options, firstState = {}) {
  let state = firstState;
  for (let index = 0; index < 105; index += 1) {
    const result = await runEaCollectionStep({ ...options, state: JSON.parse(JSON.stringify(state)) });
    if (result.done) return result;
    state = result.state;
  }
  assert.fail('collection did not complete within its bounded request limit');
}

test('weekly collection retains both previous/current weeks and checks the hub before handoff', async () => {
  const { options, calls, stored, finalized } = fixture();
  const result = await finish(options);
  const schedules = calls.filter(call => call.kind === 'schedules');
  assert.deepEqual(schedules.map(call => call.args.weekIndex), [3, 4]);
  assert.equal(calls.filter(call => call.kind === 'passing').length, 2);
  assert.equal(calls.filter(call => call.kind === 'teamstats').length, 2);
  assert.equal(calls.filter(call => call.kind === 'roster').length, 32);
  assert.equal(calls.filter(call => call.kind === 'freeagents').length, 1);
  assert.equal(calls.filter(call => call.kind === 'hub').length, 2);
  assert.equal(calls.at(-1).kind, 'hub');
  assert.equal(stored.length, 52);
  assert.equal(finalized.length, 1);
  assert.equal(finalized[0].publishReady, true);
  assert.equal(result.result.readyPointerChanged, true);
  assert.equal(result.progress, 100);
  assert.equal(result.state.session.requestId, 3);
  assert.equal(result.state.hub.raw, undefined);
  const before = calls.length;
  await runEaCollectionStep({ ...options, state: result.state });
  assert.equal(calls.length, before, 'completed checkpoints must not issue more EA requests');
});

test('each resumed collection step makes at most one EA request', async () => {
  const { options, calls } = fixture();
  let result = await runEaCollectionStep(options);
  assert.equal(calls.length, 2, 'only initialization combines login with the first hub read');
  while (!result.done) {
    const before = calls.length;
    result = await runEaCollectionStep({ ...options, state: JSON.parse(JSON.stringify(result.state)) });
    assert.ok(calls.length - before <= 1);
  }
});

test('preview collects actual datasets but never requests ready-source publication', async () => {
  const { options, finalized } = fixture('preview');
  const result = await finish(options);
  assert.equal(finalized[0].publishReady, false);
  assert.equal(result.result.readyPointerChanged, false);
  assert.equal(result.result.previewVerified, true);
  assert.equal(result.result.readyToImport, false);
});

test('yearly collection requests all 18 regular schedules without roster or statistic calls', async () => {
  const { options, calls, finalized } = fixture('yearly');
  await finish(options);
  const schedules = calls.filter(call => call.kind === 'schedules');
  assert.deepEqual(schedules.map(call => call.args.weekIndex), Array.from({ length: 18 }, (_, index) => index));
  assert.ok(schedules.every(call => call.args.stageIndex === 1));
  assert.equal(calls.some(call => ['passing', 'roster', 'freeagents'].includes(call.kind)), false);
  assert.equal(finalized[0].mode, 'yearly');
});

test('unavailable rosters and Free Agents remain failed evidence while weekly data finishes', async () => {
  const { options, stored } = fixture();
  const original = options.client.dataset;
  options.client.dataset = async (...args) => {
    if (args[4] === 'freeagents' || args[4] === 'roster' && args[5].teamId === 7) {
      throw new EaClientError('EA_TEMPORARILY_UNAVAILABLE', 'EA is busy.', { retryable: true });
    }
    return original(...args);
  };
  const result = await finish(options);
  const failures = stored.filter(item => item.payload.success === false);
  assert.equal(failures.length, 2);
  assert.deepEqual(failures.map(item => item.kind), ['roster', 'free-agents']);
  assert.ok(failures.every(item => item.payload.rosterInfoList === undefined));
  assert.equal(result.result.datasetWarnings.length, 2);
  assert.equal(result.state.expectedRequests.filter(item => item.kind === 'roster').length, 32);
});

test('expired authorization cannot be swallowed as an optional roster outage', async () => {
  const { options, stored } = fixture();
  const initial = await runEaCollectionStep(options);
  initial.state.cursor = initial.state.expectedRequests.findIndex(item => item.kind === 'roster');
  options.client.dataset = async () => { throw new EaClientError('EA_RECONNECT_REQUIRED', 'Reconnect EA.', { status: 401 }); };
  await assert.rejects(runEaCollectionStep({ ...options, state: initial.state }), error => error.code === 'EA_RECONNECT_REQUIRED');
  assert.equal(stored.length, 1, 'only the initial hub should be retained');
});

test('required dataset failure preserves cursor for a retry', async () => {
  const { options } = fixture();
  const initial = await runEaCollectionStep(options);
  const before = initial.state.cursor;
  options.client.dataset = async () => { throw new EaClientError('EA_TIMEOUT', 'EA timed out.', { retryable: true }); };
  await assert.rejects(runEaCollectionStep({ ...options, state: initial.state }), error => error.code === 'EA_TIMEOUT');
  assert.equal(initial.state.cursor, before);
});

test('EA advance during collection prevents any publication handoff', async () => {
  const { options, finalized } = fixture();
  const initial = await runEaCollectionStep(options);
  initial.state.cursor = initial.state.expectedRequests.length;
  options.client.hub = async () => hub(5);
  await assert.rejects(runEaCollectionStep({ ...options, state: initial.state }), error => error.code === 'EA_ADVANCED_DURING_COLLECTION');
  assert.equal(finalized.length, 0);
});

test('tenant and connection changes cannot resume another collection', async () => {
  const { options, calls } = fixture();
  await assert.rejects(runEaCollectionStep({ ...options, league: { id: 'league-b' } }), error => error.code === 'EA_COLLECTION_SCOPE');
  assert.equal(calls.length, 0);
  const initial = await runEaCollectionStep(options);
  await assert.rejects(runEaCollectionStep({ ...options, connection: { ...options.connection, external_league_id: '800' }, state: initial.state }), error => error.code === 'EA_COLLECTION_SCOPE');
});

test('clearing the session after token refresh resumes without repeating retained datasets', async () => {
  const { options, calls } = fixture();
  const initial = await runEaCollectionStep(options);
  const cursor = initial.state.cursor;
  delete initial.state.session;
  const result = await runEaCollectionStep({ ...options, state: initial.state });
  assert.equal(calls.at(-1).kind, 'login');
  assert.equal(result.state.cursor, cursor);
  assert.ok(result.state.session.sessionKey);
});

test('partial roster indexes cannot masquerade as complete fresh rosters', async () => {
  const { options, calls } = fixture();
  options.client.hub = async () => ({ ...hub(), teamIdInfoList: [{ teamId: 1 }] });
  const result = await finish(options);
  assert.equal(calls.some(call => call.kind === 'roster'), false);
  assert.equal(result.result.datasetWarnings[0].code, 'EA_ROSTER_INDEX_INCOMPLETE');
});

test('controller persists rotated credentials, renews the session once and ignores stale step replays', async () => {
  const sqlite = new DatabaseSync(':memory:');
  const originalFetch = globalThis.fetch;
  try {
    for (const file of (await walkFiles()).filter(file => /^migrations\/\d+_.+\.sql$/.test(file)).sort()) sqlite.exec(await readFile(path.join(ROOT, file), 'utf8'));
    sqlite.exec(`INSERT INTO leagues(id,name,product_name,slug,public_status,tenant_status,timezone) VALUES('league-a','League A','FranchiseHQ','league-a','active','enabled','America/Chicago');
      INSERT INTO users(id,discord_user_id,discord_username,display_name) VALUES('actor-a','discord-a','actor-a','Actor');
      INSERT INTO league_memberships(id,league_id,user_id,role,active) VALUES('membership-a','league-a','actor-a','commissioner',1);
      INSERT INTO sessions(id,user_id,session_token_hash,expires_at,absolute_expires_at) VALUES('session-a','actor-a','unused','2099-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z');
      INSERT INTO franchise_seasons(id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status) VALUES('season-a','league-a','ea-madden-companion','700','1','Madden NFL 27','2027',2027,'preview');
      INSERT INTO league_game_years(id,league_id,game_release,edition_year,display_name,status) VALUES('year-a','league-a','Madden NFL 27',27,'Madden NFL 27','active');
      INSERT INTO game_year_franchise_seasons(game_year_id,league_id,franchise_season_id) VALUES('year-a','league-a','season-a');`);
    const statement = (sql, values = []) => ({
      bind(...next) { return statement(sql, next); },
      async first() { return sqlite.prepare(sql).get(...values) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }; }
    });
    const db = { prepare: sql => statement(sql), async batch(items) { sqlite.exec('BEGIN'); try { const result = []; for (const item of items) result.push(await item.run()); sqlite.exec('COMMIT'); return result; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
    const objects = new Map();
    const bucket = { async put(key, value) { objects.set(key, value); }, async get(key) { return objects.has(key) ? { text: async () => objects.get(key) } : null; } };
    const environment = { DB: db, FRANCHISE_HQ_DB: db, COMPANION_EXPORTS: bucket, EA_CLIENT_SECRET: 'test-secret', EA_CREDENTIAL_KEY: '12'.repeat(32) };
    const connection = { id: 'connection-a', league_id: 'league-a' };
    const job = { id: 'job-a', league_id: 'league-a' };
    const credential = await sealEa(environment, connectionScope(connection), { accessToken: 'expired-access', refreshToken: 'old-refresh', expiresAt: '2000-01-01T00:00:00.000Z' });
    sqlite.prepare(`INSERT INTO ea_direct_connections(id,league_id,connected_by,status,platform,persona_id,persona_name,external_league_id,external_league_name,credential_cipher) VALUES('connection-a','league-a','actor-a','connected','ps5','100','Coach','700','Franchise',?)`).run(credential);
    const manifest = await beginEaCapture({ db, bucket, league: { id: 'league-a', name: 'League A' }, actorId: 'actor-a', hub: hub(), platform: 'ps5', externalLeagueId: '700', mode: 'preview', connectionId: 'connection-a', collectionId: 'job-a' });
    await storeEaCapture({ db, bucket, leagueId: 'league-a', sessionId: manifest.sessionId, collectionId: 'job-a', kind: 'hub', args: {}, payload: hub(), platform: 'ps5', externalLeagueId: '700' });
    const state = { initialized: true, collectionId: 'job-a', connectionId: 'connection-a', externalLeagueId: '700', platform: 'ps5', mode: 'preview', sessionId: manifest.sessionId, session: { sessionKey: 'old-session', blazeId: 100, requestId: 2 }, hub: normalizeEaHub(hub()), expectedRequests: eaCapturePlan(hub()), cursor: 1, warnings: [] };
    const collectionToken = 'ab'.repeat(32);
    sqlite.prepare(`INSERT INTO ea_direct_collection_jobs(id,league_id,connection_id,actor_id,session_id,mode,status,token_hash,expires_at,cursor,state_cipher) VALUES('job-a','league-a','connection-a','actor-a','session-a','preview','running',?,'2099-01-01T00:00:00.000Z',5,?)`).run(await hashToken(collectionToken), await sealEa(environment, jobScope(job), state));
    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url: new URL(url), ...init });
      if (new URL(url).pathname === '/connect/token') return Response.json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 });
      if (new URL(url).pathname === '/wal/authentication/login') return Response.json({ userLoginInfo: { sessionKey: 'new-session', personaDetails: { personaId: 100 } } });
      assert.match(new URL(url).pathname, /CareerMode_GetLeagueTeamsExport\/new-session$/);
      return Response.json({ success: true, leagueTeamInfoList: [{ teamId: 1, displayName: 'One' }] });
    };
    const context = cursor => ({ env: environment, params: { leagueSlug: 'league-a' }, request: new Request('https://franchisehq.app/api/leagues/league-a/ea-direct/collect-step', { method: 'POST', headers: { 'content-type': 'application/json', 'x-franchisehq-ea-collection-token': collectionToken }, body: JSON.stringify({ id: 'job-a', cursor }) }) });
    const first = await collectStep(context(5));
    assert.equal(first.status, 200, await first.clone().text());
    assert.equal((await first.json()).cursor, 6);
    const refreshedConnection = sqlite.prepare('SELECT * FROM ea_direct_connections WHERE id=?').get('connection-a');
    assert.equal((await openEa(environment, connectionScope(connection), refreshedConnection.credential_cipher)).refreshToken, 'new-refresh');
    let saved = sqlite.prepare('SELECT * FROM ea_direct_collection_jobs WHERE id=?').get('job-a');
    const checkpoint = await openEa(environment, jobScope(job), saved.state_cipher);
    assert.equal(checkpoint.session.sessionKey, 'new-session');
    assert.equal(checkpoint.cursor, 1);
    assert.equal(requests.length, 2);
    const stale = await collectStep(context(5));
    assert.equal((await stale.json()).cursor, 6);
    assert.equal(requests.length, 2);
    const resumed = await collectStep(context(6));
    assert.equal(resumed.status, 200, await resumed.clone().text());
    saved = sqlite.prepare('SELECT * FROM ea_direct_collection_jobs WHERE id=?').get('job-a');
    assert.equal(saved.cursor, 7);
    assert.equal((await openEa(environment, jobScope(job), saved.state_cipher)).cursor, 2);
    assert.equal(requests.length, 3);
    assert.equal(requests.filter(request => request.url.pathname === '/connect/token').length, 1);
    assert.equal(JSON.parse(requests[1].body).accessToken, 'new-access');
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});
