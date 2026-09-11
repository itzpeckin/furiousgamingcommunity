import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

async function source(file) {
  return readFile(new URL(file, root), 'utf8');
}

function releaseBlock(styles) {
  const marker = '/* FranchiseHQ 7.4.4.2 — intentional phone/tablet composition */';
  const index = styles.lastIndexOf(marker);
  assert.notEqual(index, -1, '7.4.4.2 mobile composition block is registered');
  return styles.slice(index);
}

test('active routes share an intentional phone composition without page-wide horizontal scrolling', async () => {
  const [html, app, trade, styles] = await Promise.all([
    source('index.html'),
    source('app.js'),
    source('trade-module.js'),
    source('styles.css')
  ]);
  const mobile = releaseBlock(styles);

  assert.match(html, /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1(?:\.0)?"/i);
  assert.match(mobile, /@media\(max-width:900px\)/);
  assert.match(mobile, /\.page-content\s*\{[^}]*overflow-x:clip/s);
  assert.match(mobile, /\.table-wrap[\s\S]*overflow-x:auto!important/);
  assert.match(mobile, /\.page-heading\s*\{[^}]*flex-direction:column/s);
  assert.match(mobile, /\.filter-bar\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/s);

  for (const route of [
    'home', 'teams', 'players', 'stats', 'schedule', 'standings',
    'transactions', 'trade-center', 'trade-block', 'history', 'rules', 'commissioner'
  ]) {
    assert.ok(
      app.includes(`'${route}'`) || app.includes(`\`${route}`) || trade.includes(`'${route}'`) || trade.includes(`\`${route}`),
      `${route} remains registered in an active renderer or navigation flow`
    );
  }
  for (const layout of ['leader-grid', 'schedule-grid', 'division-grid', 'playoff-grid', 'content-grid', 'news-grid']) {
    assert.ok(mobile.includes(`.${layout}`), `${layout} has an explicit phone composition`);
  }
});

test('Player Card phone layout separates portrait, overall, identity, tabs, and scrollable data', async () => {
  const [app, styles] = await Promise.all([source('app.js'), source('styles.css')]);
  const mobile = releaseBlock(styles);

  assert.match(app, /canonical-player-hero canonical-player-hero--approved/);
  assert.match(app, /canonical-player-hero__image/);
  assert.match(app, /canonical-player-hero__identity/);
  assert.match(app, /canonical-player-hero__overall/);
  assert.match(mobile, /grid-template-areas:"portrait overall" "identity identity"!important/);
  assert.match(mobile, /\.canonical-player-hero--approved \.canonical-player-hero__image\s*\{[^}]*position:relative!important[^}]*inset:auto!important/s);
  assert.match(mobile, /\.canonical-player-hero--approved \.canonical-player-hero__identity\s*\{[^}]*grid-area:identity[^}]*padding:0!important/s);
  assert.match(mobile, /\.canonical-player-tabs--approved\s*\{[^}]*overflow-x:auto/s);
  assert.match(mobile, /\.canonical-game-log-table table,[\s\S]*width:max-content/s);
  assert.match(mobile, /\[data-value-card-modal\] \.value-card-dialog\s*\{[^}]*height:100dvh/s);
  assert.match(app, /canonical-dashboard-card canonical-dashboard-card--abilities/);
  assert.match(app, /class="canonical-ability-list" role="list" tabindex="0"/);
  assert.match(mobile, /\.canonical-dashboard-card--abilities \.canonical-ability-list\{[^}]*max-height:[^;]+;[^}]*overflow-y:auto/s);
  assert.match(mobile, /grid-template-rows:minmax\(0,auto\) auto minmax\(0,1fr\)!important/);

  const marker = styles.lastIndexOf('/* FranchiseHQ 7.4.4.2 — intentional phone/tablet composition */');
  const legacyAbsolute = styles.slice(0, marker).lastIndexOf('.canonical-player-hero__image{');
  const mobileRelative = styles.lastIndexOf('.canonical-player-hero--approved .canonical-player-hero__image');
  assert.ok(mobileRelative > marker && marker > legacyAbsolute, 'phone portrait override follows every legacy absolute-position rule');
});

test('Teams & Owners exposes complete touch management on every phone card', async () => {
  const [trade, styles] = await Promise.all([source('trade-module.js'), source('styles.css')]);
  const mobile = releaseBlock(styles);

  assert.match(trade, /class="button button--ghost button--small commissioner-team-manage"[^>]*data-open-ownership=/);
  assert.match(trade, /aria-label="Manage \$\{escapeHtml\(team\.fullName\)\} owner assignment"/);
  assert.match(trade, /Save Assignment/);
  assert.match(trade, /Remove from Team/);
  assert.match(trade, /Revoke Access/);
  assert.match(mobile, /\.commissioner-directory-panel \.ownership-team-row>\.commissioner-team-manage\s*\{[^}]*display:inline-flex!important[^}]*visibility:visible!important/s);
  assert.match(mobile, /grid-template-areas:"franchise" "owner" "role" "status" "manage"!important/);
  assert.match(mobile, /\.commissioner-directory-panel \.ownership-team-row>\.commissioner-team-manage\s*\{[^}]*width:100%[^}]*min-height:46px/s);

  const legacyHide = styles.lastIndexOf('.commissioner-team-row > button { display: none; }');
  const mobileShow = styles.lastIndexOf('display:inline-flex!important');
  assert.ok(mobileShow > legacyHide, 'mobile Manage visibility overrides the legacy tablet hide rule');
});

test('League Home rushing leaders include Madden halfbacks', async () => {
  const app=await source('app.js');
  assert.match(app,/rushing:\s*\{\s*positions:\['RB','HB','FB','QB'\]/);
});
