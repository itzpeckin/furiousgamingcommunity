import assert from 'node:assert/strict';
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
