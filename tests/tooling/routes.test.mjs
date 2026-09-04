import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { functionRoutePath, requestHandlers } from '../../tools/lib/routes.mjs';

test('maps Pages Function file names to stable route patterns', () => {
  assert.equal(functionRoutePath('functions/index.js'), '/');
  assert.equal(functionRoutePath('functions/api/health.js'), '/api/health');
  assert.equal(
    functionRoutePath('functions/api/leagues/[leagueSlug]/players/free-agents.js'),
    '/api/leagues/:leagueSlug/players/free-agents'
  );
  assert.equal(
    functionRoutePath('functions/api/leagues/[leagueSlug]/players/[publicPlayerId].js'),
    '/api/leagues/:leagueSlug/players/:publicPlayerId'
  );
  assert.equal(
    functionRoutePath('functions/api/leagues/[leagueSlug]/teams/[teamSlug].js'),
    '/api/leagues/:leagueSlug/teams/:teamSlug'
  );
  assert.equal(
    functionRoutePath('functions/api/leagues/[leagueSlug]/companion/discovery-report.js'),
    '/api/leagues/:leagueSlug/companion/discovery-report'
  );
  assert.equal(
    functionRoutePath('functions/api/leagues/[leagueSlug]/companion/identity-preview.js'),
    '/api/leagues/:leagueSlug/companion/identity-preview'
  );
  assert.equal(
    functionRoutePath('functions/api/leagues/[leagueSlug]/companion/candidate-import.js'),
    '/api/leagues/:leagueSlug/companion/candidate-import'
  );
  assert.equal(
    functionRoutePath('functions/api/leagues/[leagueSlug]/companion/export-url.js'),
    '/api/leagues/:leagueSlug/companion/export-url'
  );
  assert.equal(
    functionRoutePath('functions/api/leagues/[leagueSlug]/game-year-transition.js'),
    '/api/leagues/:leagueSlug/game-year-transition'
  );
  assert.equal(
    functionRoutePath('functions/api/leagues/[leagueSlug]/trade-center.js'),
    '/api/leagues/:leagueSlug/trade-center'
  );
  assert.equal(functionRoutePath('functions/leagues/[[path]].js'), '/leagues/*path');
  assert.equal(functionRoutePath('functions/_lib/auth.js'), null);
  assert.equal(functionRoutePath('functions/api/example/_common.js'), null);
});

test('extracts named Pages request handlers', () => {
  const source = `
    export async function onRequestGet() {}
    export const onRequestPost = async () => {};
  `;
  assert.deepEqual(requestHandlers(source), ['onRequestGet', 'onRequestPost']);
});

test('production shell exposes the exact release and environment', async () => {
  const [index, app, landing, selector, leagueRoute] = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../../functions/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../../functions/leagues/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../../functions/leagues/[[path]].js', import.meta.url), 'utf8')
  ]);
  assert.match(index, /franchise-hq-platform-version" content="7\.4\.0\.5"/);
  assert.match(index, /Candidate · Release 7\.4\.0\.5/);
  assert.match(index, /app\.js\?v=7\.4\.0\.5/);
  assert.match(index, /trade-module\.js\?v=7\.4\.0\.5/);
  assert.match(app, /const VISIBLE_RELEASE = '7\.4\.0\.5'/);
  assert.match(app, /hostname==='franchisehq\.app'.*return 'Production'/);
  for (const source of [landing, selector, leagueRoute]) {
    assert.match(source, /const RELEASE ?= ?["']7\.4\.0\.5["']/);
  }
});
