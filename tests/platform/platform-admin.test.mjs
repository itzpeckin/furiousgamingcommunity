import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read = file => readFile(path.join(ROOT,file),'utf8');

test('platform administration is a protected top-level surface instead of a league page', async () => {
  const [route,index,app,workspace,permissions] = await Promise.all([
    read('functions/platform-admin/[[path]].js'),
    read('index.html'),
    read('app.js'),
    read('league-engine/platform-workspace.js'),
    read('functions/_lib/permissions.js')
  ]);
  assert.match(route,/requirePlatformOwner\(context\)/);
  assert.match(route,/x-franchisehq-surface':'platform-admin'/);
  assert.match(route,/Platform Admin \| FranchiseHQ/);
  assert.match(route,/\/platform-admin\/diagnostics/);
  assert.doesNotMatch(index,/class="nav-item nav-item--platform"/);
  assert.match(index,/data-platform-admin-link data-platform-owner-only/);
  assert.match(app,/window\.location\.assign\('\/platform-admin'\)/);
  assert.match(workspace,/workspaceLink\.matches\('\[data-platform-admin-link\]'\)/);
  assert.match(permissions,/Platform administration is intentionally independent of a selected/);
  assert.match(permissions,/FROM league_memberships[\s\S]+role='commissioner' AND active=1/);
});

test('platform admin shows only league operations and keeps diagnostics behind an explicit route', async () => {
  const [client,css,onboarding,api] = await Promise.all([
    read('platform-admin.js'),
    read('platform-admin.css'),
    read('league-engine/platform-onboarding.js'),
    read('functions/api/platform/onboarding.js')
  ]);
  assert.match(client,/Run FranchiseHQ\./);
  assert.match(client,/All Leagues/);
  assert.match(client,/League Onboarding/);
  assert.match(client,/Platform Health/);
  assert.match(client,/section === 'diagnostics'/);
  assert.match(client,/Choose the affected league first/);
  assert.match(client,/commissioner\/platform-workspace/);
  assert.doesNotMatch(client,/one-click-import|payload-inspector|schedule-mapper|statistics-mapper/);
  assert.match(onboarding,/const endpoint = \(\) => '\/api\/platform\/onboarding'/);
  assert.doesNotMatch(onboarding,/currentSlug\(\)/);
  assert.match(onboarding,/x-franchisehq-csrf/);
  assert.match(api,/COUNT\(DISTINCT CASE WHEN membership\.active=1/);
  assert.match(api,/activeSnapshotId/);
  assert.match(api,/active_season_year \?\? league\.current_season/);
  assert.match(api,/active_week_index \?\? league\.current_week/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/\.admin-grid\{grid-template-columns:1fr\}/);
});
