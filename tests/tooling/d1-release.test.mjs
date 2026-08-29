import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertExactTarget,
  assertFinalState,
  assertProtectedCountsPreserved,
  loadCanonicalMigrations,
  pendingMigrations,
  targetConfirmation
} from '../../tools/lib/d1-release.mjs';

const target = {
  databaseName: 'franchise-hq-db',
  databaseId: 'production-database-id'
};

test('production application requires an exact target confirmation', () => {
  const metadata = { name: target.databaseName, uuid: target.databaseId };
  assert.doesNotThrow(() => assertExactTarget({
    requestedTarget: 'production',
    target,
    metadata,
    apply: true,
    confirmation: targetConfirmation('production', target)
  }));
  assert.throws(() => assertExactTarget({
    requestedTarget: 'production',
    target,
    metadata,
    apply: true,
    confirmation: 'production:wrong-target'
  }), /requires --confirm-target/);
  assert.throws(() => assertExactTarget({
    requestedTarget: 'production',
    target,
    metadata: { name: 'other', uuid: target.databaseId },
    apply: false
  }), /does not match/);
});

test('only missing canonical migrations are planned', () => {
  const migrations = [18, 19, 20].map(version => ({ version }));
  const ledger = Array.from({ length: 18 }, (_, index) => ({ version: index + 1 }));
  assert.deepEqual(pendingMigrations(ledger, migrations).map(item => item.version), [19, 20]);
});

test('canonical migration loading includes the permanent identity preview foundation', async () => {
  const { contract, migrations } = await loadCanonicalMigrations();
  assert.equal(contract.currentVersion, 23);
  assert.equal(migrations.at(-1)?.version, 23);
  assert.equal(migrations.at(-1)?.relativePath, 'migrations/0023_permanent_identity_preview.sql');
  const tenantMigration = migrations.find(item => item.version === 21);
  assert.equal(
    tenantMigration?.sql.match(/INSERT OR IGNORE INTO league_features/g)?.length,
    7,
    'D1-compatible feature seeds must remain separate statements'
  );
});

test('protected identity and league-data counts must remain unchanged', () => {
  const before = {
    leagues: 1,
    users: 2,
    memberships: 2,
    activeTeamAssignments: 2,
    teams: 32,
    players: 1700,
    snapshots: 1,
    activeSnapshots: 1
  };
  assert.doesNotThrow(() => assertProtectedCountsPreserved(before, { ...before }));
  assert.throws(
    () => assertProtectedCountsPreserved(before, { ...before, memberships: 1 }),
    /Protected count changed for memberships/
  );
});

test('final verification requires a continuous ledger, contract tables, and clean foreign keys', () => {
  const contract = { currentVersion: 3, requiredTables: ['leagues', 'users'] };
  const valid = {
    ledgerRows: [{ version: 1 }, { version: 2 }, { version: 3 }],
    tableRows: [{ name: 'leagues' }, { name: 'users' }],
    foreignKeyRows: [],
    contract
  };
  assert.doesNotThrow(() => assertFinalState(valid));
  assert.throws(() => assertFinalState({ ...valid, ledgerRows: [{ version: 1 }, { version: 3 }] }), /not continuous/);
  assert.throws(() => assertFinalState({ ...valid, tableRows: [{ name: 'leagues' }] }), /Required tables are missing/);
  assert.throws(() => assertFinalState({ ...valid, foreignKeyRows: [{ table: 'users' }] }), /Foreign-key verification/);
});
