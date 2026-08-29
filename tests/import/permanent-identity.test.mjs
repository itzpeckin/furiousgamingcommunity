import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';
import {
  freeAgentPreviewCount,
  previewCompleteness,
  validateSeasonInput
} from '../../functions/_lib/permanent-identity.js';

async function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  const files = (await walkFiles()).filter(file => /^migrations\/\d+_.+\.sql$/.test(file)).sort();
  for (const file of files) db.exec(await readFile(path.join(ROOT, file), 'utf8'));
  db.prepare(`INSERT INTO leagues
    (id,name,product_name,slug,public_status,tenant_status,timezone)
    VALUES (?,?,?,?,?,?,?)`).run('league-1','FGC','FranchiseHQ','fgc','active','enabled','America/Chicago');
  return db;
}

test('reviewed season identity rejects inference and remains stable across mappings', async () => {
  assert.equal(validateSeasonInput({ sourceFranchiseId:'742482' }).ok, false);
  const reviewed = validateSeasonInput({
    sourceFranchiseId:'742482', sourceSeasonId:'m27-season-1',
    gameRelease:'Madden NFL 27', displayName:'FGC Madden 27 Season 1', seasonYear:2026
  });
  assert.equal(reviewed.ok, true);

  const db = await database();
  try {
    const insert = db.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name)
      VALUES (?,?,?,?,?,?,?)`);
    insert.run('season-1','league-1','ea-madden-companion','742482','m27-season-1','Madden NFL 27','Season 1');
    assert.throws(() => insert.run(
      'season-duplicate','league-1','ea-madden-companion','742482','m27-season-1','Madden NFL 27','Renamed Season 1'
    ), /UNIQUE constraint failed/i);
  } finally { db.close(); }
});

test('player aliases preserve one permanent identity across season and team changes', async () => {
  const db = await database();
  try {
    const season = db.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name)
      VALUES (?,?,?,?,?,?,?)`);
    season.run('season-1','league-1','ea-madden-companion','742482','s1','Madden NFL 27','Season 1');
    season.run('season-2','league-1','ea-madden-companion','742482','s2','Madden NFL 28','Season 2');
    db.prepare(`INSERT INTO player_identities (id,league_id,public_id,display_name)
      VALUES (?,?,?,?)`).run('player-1','league-1','plr_stable','Stable Player');
    db.prepare(`INSERT INTO player_source_aliases
      (league_id,source_system,source_franchise_id,source_player_id,player_identity_id,first_seen_season_id,last_seen_season_id)
      VALUES (?,?,?,?,?,?,?)`).run('league-1','ea-madden-companion','742482','ea-player-9','player-1','season-1','season-1');
    const summary = db.prepare(`INSERT INTO player_season_summaries
      (league_id,franchise_season_id,player_identity_id,current_team_external_id,career_totals_json,season_totals_json)
      VALUES (?,?,?,?,?,?)`);
    summary.run('league-1','season-1','player-1','tb','{"games":17}','{"games":17}');
    summary.run('league-1','season-2','player-1','gb','{"games":34}','{"games":17}');
    db.prepare(`UPDATE player_source_aliases SET last_seen_season_id='season-2'
      WHERE league_id='league-1' AND source_player_id='ea-player-9'`).run();
    const rows = db.prepare(`SELECT s.source_season_id,p.current_team_external_id,p.career_totals_json
      FROM player_season_summaries p JOIN franchise_seasons s ON s.id=p.franchise_season_id
      WHERE p.player_identity_id='player-1' ORDER BY s.source_season_id`).all();
    assert.deepEqual(rows.map(row => row.current_team_external_id), ['tb','gb']);
    assert.equal(db.prepare(`SELECT COUNT(*) count FROM player_identities`).get().count, 1);
    assert.equal(db.prepare(`SELECT last_seen_season_id FROM player_source_aliases`).get().last_seen_season_id, 'season-2');
  } finally { db.close(); }
});

test('GM identity is person-owned and open ownership periods cannot overlap', async () => {
  const db = await database();
  try {
    db.prepare(`INSERT INTO gm_identities (id,league_id,public_id,display_name)
      VALUES (?,?,?,?)`).run('gm-1','league-1','gm_stable','Commissioner');
    const period = db.prepare(`INSERT INTO team_ownership_periods
      (id,league_id,gm_identity_id,team_key,started_at) VALUES (?,?,?,?,?)`);
    period.run('period-1','league-1','gm-1','tb','2026-08-01T00:00:00.000Z');
    assert.throws(() => period.run(
      'period-2','league-1','gm-1','gb','2026-08-29T00:00:00.000Z'
    ), /UNIQUE constraint failed/i);
    db.prepare(`UPDATE team_ownership_periods SET ended_at='2026-08-28T23:59:59.000Z'
      WHERE id='period-1'`).run();
    period.run('period-2','league-1','gm-1','gb','2026-08-29T00:00:00.000Z');
    assert.equal(db.prepare(`SELECT COUNT(*) count FROM gm_identities`).get().count, 1);
  } finally { db.close(); }
});

test('blocked Free Agents remain unknown and force rostered-player-only preview', () => {
  assert.equal(previewCompleteness('blocked'), 'rostered-players-only');
  assert.equal(freeAgentPreviewCount('blocked', 0), null);
  assert.equal(previewCompleteness('empty-confirmed'), 'complete');
  assert.equal(freeAgentPreviewCount('empty-confirmed', 0), 0);
});

test('private identity preview preserves authorization and activation boundaries', async () => {
  const [source, ui, workspace, html] = await Promise.all([
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/identity-preview.js', import.meta.url), 'utf8'),
    readFile(new URL('../../league-engine/identity-preview.js', import.meta.url), 'utf8'),
    readFile(new URL('../../league-engine/platform-workspace.js', import.meta.url), 'utf8'),
    readFile(new URL('../../index.html', import.meta.url), 'utf8')
  ]);
  assert.match(source, /requirePlatformOwner\(context\)/);
  assert.match(source, /status='pending-preview'/);
  assert.match(source, /activationPerformed:false/);
  assert.match(source, /activeSnapshotChanged:false/);
  assert.match(source, /not proof of zero Free Agents/);
  assert.doesNotMatch(source, /UPDATE league_active_snapshots|INSERT INTO league_active_snapshots|DELETE FROM league_active_snapshots/);
  assert.match(ui, /Free Agents blocked upstream/);
  assert.match(ui, /data-identity-source-season/);
  assert.match(ui, /activeSnapshotChanged:false/);
  assert.match(workspace, /identity-preview/);
  assert.match(html, /league-engine\/identity-preview\.js\?v=7\.3\.1/);
});
