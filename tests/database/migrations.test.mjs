import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ROOT, readJson, walkFiles } from '../../tools/lib/project.mjs';
import { requireDatabaseSchema } from '../../functions/_lib/database-schema.js';

async function migrationFiles() {
  return (await walkFiles())
    .filter(file => /^migrations\/\d+_.+\.sql$/.test(file))
    .sort((left, right) => left.localeCompare(right));
}

async function applyFiles(database, files) {
  for (const file of files) {
    database.exec(await readFile(path.join(ROOT, file), 'utf8'));
  }
}

function rows(database, sql) {
  return database.prepare(sql).all();
}

function tableNames(database) {
  return new Set(rows(database,
    `SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'`
  ).map(row => String(row.name)));
}

function seedProtectedData(database) {
  database.prepare(`INSERT OR IGNORE INTO leagues (
    id,name,product_name,slug,current_season,current_week,trade_start_week,
    trade_deadline_week,discord_connected,public_status
  ) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    'league-upgrade-test', 'Upgrade League', 'Franchise HQ', 'upgrade-league',
    4, 8, 1, 9, 1, 'active'
  );
  database.prepare(`INSERT INTO users (
    id,discord_user_id,discord_username,display_name
  ) VALUES (?,?,?,?)`).run('user-upgrade-test', 'discord-upgrade-test', 'upgrade-user', 'Upgrade User');
  database.prepare(`INSERT INTO league_memberships (
    id,league_id,user_id,role,team_id,active
  ) VALUES (?,?,?,?,?,?)`).run(
    'membership-upgrade-test', 'league-upgrade-test', 'user-upgrade-test',
    'commissioner', 'tb', 1
  );
  database.prepare(`INSERT INTO sessions (
    id,user_id,session_token_hash,expires_at
  ) VALUES (?,?,?,?)`).run(
    'session-upgrade-test', 'user-upgrade-test', 'hash-upgrade-test', '2099-01-01T00:00:00.000Z'
  );
}

test('canonical migrations build a complete fresh database', async () => {
  const contract = await readJson('config/database-schema-contract.json');
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA foreign_keys = ON;');
    await applyFiles(database, await migrationFiles());

    const tables = tableNames(database);
    assert.deepEqual([...contract.requiredTables].filter(table => !tables.has(table)), []);
    assert.equal(database.prepare('PRAGMA foreign_key_check').all().length, 0);
    assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');

    const ledger = rows(database, 'SELECT version FROM schema_migrations ORDER BY version')
      .map(row => Number(row.version));
    assert.deepEqual(ledger, Array.from({ length: contract.currentVersion }, (_, index) => index + 1));
  } finally {
    database.close();
  }
});

test('the production-like legacy upgrade preserves identities and relationships', async () => {
  const database = new DatabaseSync(':memory:');
  const legacyOrder = [
    'migrations/legacy/0001_create_leagues.sql',
    'migrations/legacy/0002_create_authentication.sql',
    'migrations/legacy/0001_cloud_platform_foundation.sql',
    'migrations/legacy/0002_companion_storage_layer.sql',
    'migrations/legacy/0003_madden_companion_route_discovery.sql',
    'migrations/legacy/0004_dataset_classification.sql',
    'migrations/legacy/0005_canonical_team_mapper_preview.sql',
    'migrations/legacy/0006_canonical_player_mapper_preview.sql',
    'migrations/legacy/0007_canonical_schedule_mapper_preview.sql',
    'migrations/legacy/0008_canonical_statistics_engine_preview.sql',
    'migrations/legacy/0009_complete_pending_snapshot_builder.sql',
    'migrations/legacy/0010_snapshot_validation_activation.sql',
    'migrations/legacy/0015_membership_audit_repair.sql',
    'migrations/legacy/0016_canonical_team_ownership.sql',
    'migrations/legacy/0017_league_data_reset_audit.sql'
  ];
  try {
    database.exec('PRAGMA foreign_keys = ON;');
    await applyFiles(database, legacyOrder);
    seedProtectedData(database);

    const before = {
      leagues: database.prepare('SELECT COUNT(*) count FROM leagues').get().count,
      users: database.prepare('SELECT COUNT(*) count FROM users').get().count,
      memberships: database.prepare('SELECT COUNT(*) count FROM league_memberships').get().count,
      sessions: database.prepare('SELECT COUNT(*) count FROM sessions').get().count
    };

    await applyFiles(database, await migrationFiles());

    const after = {
      leagues: database.prepare('SELECT COUNT(*) count FROM leagues').get().count,
      users: database.prepare('SELECT COUNT(*) count FROM users').get().count,
      memberships: database.prepare('SELECT COUNT(*) count FROM league_memberships').get().count,
      sessions: database.prepare('SELECT COUNT(*) count FROM sessions').get().count
    };
    assert.deepEqual(after, before);
    assert.equal(database.prepare(
      `SELECT role FROM league_memberships WHERE id='membership-upgrade-test'`
    ).get().role, 'commissioner');
    assert.equal(database.prepare(
      `SELECT user_id FROM sessions WHERE id='session-upgrade-test'`
    ).get().user_id, 'user-upgrade-test');
    assert.equal(database.prepare('SELECT COUNT(*) count FROM schema_migrations').get().count, 24);
    assert.equal(database.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {
    database.close();
  }
});

test('tenant migration preserves shared documents and snapshot validation rows', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA foreign_keys = ON;');
    const files = await migrationFiles();
    await applyFiles(database, files.filter(file => /^migrations\/(?:0018|0019|0020)_/.test(file)));
    seedProtectedData(database);
    database.prepare(`INSERT INTO league_rules_documents
      (league_id,rules_json,updated_by_user_id) VALUES (?,?,?)`
    ).run('league-upgrade-test','{"categories":[{"id":"preserved"}]}','user-upgrade-test');
    database.prepare(`INSERT INTO league_settings
      (league_id,revision,settings_json,updated_by_user_id) VALUES (?,?,?,?)`
    ).run('league-upgrade-test',7,'{"tradeLimit":4}','user-upgrade-test');
    database.prepare(`INSERT INTO league_snapshots
      (id,league_id,status,manifest_json) VALUES (?,?,?,?)`
    ).run('snapshot-upgrade-test','league-upgrade-test','active','{}');
    database.prepare(`INSERT INTO league_active_snapshots
      (league_id,snapshot_id) VALUES (?,?)`
    ).run('league-upgrade-test','snapshot-upgrade-test');
    database.prepare(`INSERT INTO snapshot_validation_jobs
      (id,league_id,snapshot_id,status,phase) VALUES (?,?,?,?,?)`
    ).run('validation-upgrade-test','league-upgrade-test','snapshot-upgrade-test','pending','players');
    database.prepare(`INSERT INTO snapshot_validation_player_ids
      (job_id,player_id) VALUES (?,?)`
    ).run('validation-upgrade-test','player-upgrade-test');

    await applyFiles(database, files.filter(file => /^migrations\/(?:0021|0022)_/.test(file)));

    assert.equal(database.prepare(`SELECT rules_json value FROM league_rules_documents
      WHERE league_id='league-upgrade-test'`).get().value, '{"categories":[{"id":"preserved"}]}');
    assert.equal(database.prepare(`SELECT revision FROM league_settings
      WHERE league_id='league-upgrade-test'`).get().revision, 7);
    assert.equal(database.prepare(`SELECT snapshot_id FROM league_active_snapshots
      WHERE league_id='league-upgrade-test'`).get().snapshot_id, 'snapshot-upgrade-test');
    assert.deepEqual({...database.prepare(`SELECT league_id,job_id,player_id
      FROM snapshot_validation_player_ids`).get()}, {
      league_id:'league-upgrade-test',
      job_id:'validation-upgrade-test',
      player_id:'player-upgrade-test'
    });
    assert.deepEqual(database.prepare(`SELECT hostname FROM league_domains
      WHERE league_id='league-upgrade-test' ORDER BY hostname`).all().map(row=>row.hostname), [
      'franchise-hq.pages.dev',
      'franchisehq.app'
    ]);
    assert.equal(database.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {
    database.close();
  }
});

test('a closed database file can be backed up and restored without data loss', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'franchisehq-db-recovery-'));
  const currentPath = path.join(directory, 'current.sqlite');
  const backupPath = path.join(directory, 'backup.sqlite');
  const restorePath = path.join(directory, 'restored.sqlite');
  try {
    let database = new DatabaseSync(currentPath);
    database.exec('PRAGMA foreign_keys = ON;');
    await applyFiles(database, await migrationFiles());
    seedProtectedData(database);
    database.close();

    await copyFile(currentPath, backupPath);

    database = new DatabaseSync(currentPath);
    database.prepare(`UPDATE leagues SET name='Changed After Backup' WHERE id='league-upgrade-test'`).run();
    database.close();

    await copyFile(backupPath, restorePath);
    const restored = new DatabaseSync(restorePath, { readOnly: true });
    try {
      assert.equal(restored.prepare(
        `SELECT name FROM leagues WHERE id='league-upgrade-test'`
      ).get().name, 'Upgrade League');
      assert.equal(restored.prepare(
        `SELECT COUNT(*) count FROM league_memberships WHERE league_id='league-upgrade-test'`
      ).get().count, 1);
      assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      assert.equal(restored.prepare('PRAGMA foreign_key_check').all().length, 0);
    } finally {
      restored.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('request handlers do not create or alter database schema', async () => {
  const pattern = /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|TRIGGER|VIEW)\b/i;
  const offenders = [];
  for (const file of (await walkFiles()).filter(file => /^functions\/.+\.js$/.test(file))) {
    const source = await readFile(path.join(ROOT, file), 'utf8');
    if (pattern.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test('runtime schema verification fails closed before version 24', async () => {
  let observedVersion = 17;
  const outdated = {
    prepare() {
      return { first: async () => ({ version: observedVersion, name: 'migration-under-test' }) };
    }
  };
  await assert.rejects(
    () => requireDatabaseSchema(outdated),
    error => error?.code === 'DATABASE_MIGRATION_REQUIRED' && error?.currentVersion === 17
  );
  observedVersion = 24;
  assert.equal((await requireDatabaseSchema(outdated)).version, 24);

  const current = {
    prepare() {
      return { first: async () => ({ version: 24, name: 'commissioner_candidate_import' }) };
    }
  };
  assert.equal((await requireDatabaseSchema(current)).version, 24);
});
