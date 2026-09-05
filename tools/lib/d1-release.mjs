import path from 'node:path';
import { readJson, readText, sha256 } from './project.mjs';

export const PROTECTED_COUNT_KEYS = Object.freeze([
  'leagues',
  'users',
  'memberships',
  'activeTeamAssignments',
  'teams',
  'players',
  'snapshots',
  'activeSnapshots'
]);

const PROTECTED_COUNTS_SQL = `
SELECT
  (SELECT COUNT(*) FROM leagues) AS leagues,
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM league_memberships) AS memberships,
  (SELECT COUNT(*) FROM league_memberships WHERE active = 1 AND team_id IS NOT NULL) AS activeTeamAssignments,
  (SELECT COUNT(*) FROM teams) AS teams,
  (SELECT COUNT(*) FROM players) AS players,
  (SELECT COUNT(*) FROM snapshots) AS snapshots,
  (SELECT COUNT(*) FROM league_active_snapshots) AS activeSnapshots;
`;

function apiError(payload, status) {
  const messages = (payload?.errors || [])
    .map(error => error?.message)
    .filter(Boolean)
    .join('; ');
  return new Error(messages || `Cloudflare API request failed with HTTP ${status}.`);
}

function firstQueryRows(payload) {
  const first = Array.isArray(payload?.result) ? payload.result[0] : null;
  return Array.isArray(first?.results) ? first.results : [];
}

export class CloudflareD1ReleaseClient {
  constructor({ accountId, databaseId, apiToken, fetchImpl = fetch }) {
    if (!accountId || !databaseId || !apiToken) {
      throw new Error('Cloudflare account, database, and API token are required.');
    }
    this.accountId = accountId;
    this.databaseId = databaseId;
    this.apiToken = apiToken;
    this.fetchImpl = fetchImpl;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}`;
  }

  async request(pathname = '', options = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}${pathname}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const payload = await response.json();
    if (!response.ok || payload?.success !== true) throw apiError(payload, response.status);
    return payload;
  }

  async databaseMetadata() {
    return (await this.request()).result;
  }

  async bookmark() {
    const payload = await this.request('/time_travel/bookmark');
    const bookmark = payload?.result?.bookmark;
    if (!bookmark) throw new Error('Cloudflare did not return a recovery bookmark.');
    return bookmark;
  }

  async query(sql) {
    const payload = await this.request('/query', {
      method: 'POST',
      body: JSON.stringify({ sql })
    });
    const failed = (payload.result || []).find(result => result?.success === false);
    if (failed) throw new Error('A D1 statement reported an unsuccessful result.');
    return payload;
  }

  async rows(sql) {
    return firstQueryRows(await this.query(sql));
  }
}

export function targetConfirmation(targetName, target) {
  return `${targetName}:${target.databaseName}:${target.databaseId}`;
}

export function assertExactTarget({ requestedTarget, target, metadata, confirmation, apply }) {
  if (!target || !metadata) throw new Error('The requested D1 target could not be resolved.');
  const metadataId = String(metadata.uuid || metadata.id || '');
  if (metadataId !== target.databaseId || String(metadata.name || '') !== target.databaseName) {
    throw new Error('Cloudflare target metadata does not match the committed database registry.');
  }
  if (apply) {
    const expected = targetConfirmation(requestedTarget, target);
    if (confirmation !== expected) {
      throw new Error(`Remote application requires --confirm-target ${expected}`);
    }
  }
}

export function migrationVersion(relativePath) {
  const match = path.basename(relativePath).match(/^(\d+)_/);
  if (!match) throw new Error(`Migration filename has no numeric version: ${relativePath}`);
  return Number(match[1]);
}

export async function loadCanonicalMigrations() {
  const contract = await readJson('config/database-schema-contract.json');
  const migrations = [];
  for (let version = contract.firstCanonicalVersion; version <= contract.currentVersion; version += 1) {
    const prefix = String(version).padStart(4, '0');
    const names = {
      18: 'canonical_core_foundation',
      19: 'canonical_import_snapshot_foundation',
      20: 'canonical_transaction_runtime_foundation',
      21: 'tenant_ready_core',
      22: 'madden_27_discovery_foundation',
      23: 'permanent_identity_preview',
      24: 'commissioner_candidate_import',
      25: 'safe_game_year_transition',
      26: 'permanent_league_export_url',
      27: 'gm_career_history',
      28: 'full_trade_center',
      29: 'draft_pick_baselines',
      30: 'trade_block_team_profiles',
      31: 'canonical_transaction_corrections'
    };
    const relativePath = `migrations/${prefix}_${names[version]}.sql`;
    const sql = await readText(relativePath);
    migrations.push({ version, relativePath, sql, sha256: sha256(sql) });
  }
  return { contract, migrations };
}

export function pendingMigrations(ledgerRows, migrations) {
  const applied = new Map(ledgerRows.map(row => [Number(row.version), String(row.name)]));
  return migrations.filter(migration => !applied.has(migration.version));
}

export function assertProtectedCountsPreserved(before, after) {
  for (const key of PROTECTED_COUNT_KEYS) {
    if (Number(before?.[key]) !== Number(after?.[key])) {
      throw new Error(`Protected count changed for ${key}: ${before?.[key]} -> ${after?.[key]}.`);
    }
  }
}

export function assertFinalState({ ledgerRows, tableRows, foreignKeyRows, contract }) {
  const versions = ledgerRows.map(row => Number(row.version)).sort((left, right) => left - right);
  const expectedVersions = Array.from({ length: contract.currentVersion }, (_, index) => index + 1);
  if (JSON.stringify(versions) !== JSON.stringify(expectedVersions)) {
    throw new Error(`Migration ledger is not continuous through version ${contract.currentVersion}.`);
  }
  const tables = new Set(tableRows.map(row => String(row.name)));
  const missing = contract.requiredTables.filter(table => !tables.has(table));
  if (missing.length) throw new Error(`Required tables are missing: ${missing.join(', ')}.`);
  if (foreignKeyRows.length) {
    throw new Error(`Foreign-key verification found ${foreignKeyRows.length} violation(s).`);
  }
}

export async function collectRemoteState(client) {
  const tableRows = await client.rows(
    "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_cf_KV' ORDER BY name;"
  );
  const tables = new Set(tableRows.map(row => String(row.name)));
  const ledgerRows = tables.has('schema_migrations')
    ? await client.rows('SELECT version, name, applied_at FROM schema_migrations ORDER BY version;')
    : [];
  const countTables = ['leagues', 'users', 'league_memberships', 'teams', 'players', 'snapshots', 'league_active_snapshots'];
  const countRows = countTables.every(table => tables.has(table))
    ? await client.rows(PROTECTED_COUNTS_SQL)
    : [Object.fromEntries(PROTECTED_COUNT_KEYS.map(key => [key, 0]))];
  const foreignKeyRows = await client.rows('PRAGMA foreign_key_check;');
  return {
    ledgerRows,
    protectedCounts: countRows[0] || {},
    tableRows,
    foreignKeyRows
  };
}

export async function executeRelease({ client, targetName, target, apply = false, confirmation = '' }) {
  const metadata = await client.databaseMetadata();
  assertExactTarget({ requestedTarget: targetName, target, metadata, confirmation, apply });
  const { contract, migrations } = await loadCanonicalMigrations();
  const before = await collectRemoteState(client);
  const pending = pendingMigrations(before.ledgerRows, migrations);
  const evidence = {
    target: targetName,
    databaseName: target.databaseName,
    databaseId: target.databaseId,
    mode: apply ? 'apply' : 'plan',
    candidateVersion: contract.currentVersion,
    pending: pending.map(({ version, relativePath, sha256 }) => ({ version, relativePath, sha256 })),
    before: {
      ledgerVersion: Math.max(0, ...before.ledgerRows.map(row => Number(row.version))),
      protectedCounts: before.protectedCounts,
      tableCount: before.tableRows.length,
      foreignKeyViolations: before.foreignKeyRows.length
    }
  };

  if (!apply) return evidence;

  evidence.preMigrationBookmark = await client.bookmark();
  evidence.applied = [];
  for (const migration of pending) {
    await client.query(migration.sql);
    const rows = await client.rows(`SELECT version, name FROM schema_migrations WHERE version = ${migration.version};`);
    if (rows.length !== 1) throw new Error(`Migration ${migration.version} did not record exactly one ledger row.`);
    evidence.applied.push({ version: migration.version, relativePath: migration.relativePath, sha256: migration.sha256 });
  }

  const after = await collectRemoteState(client);
  assertProtectedCountsPreserved(before.protectedCounts, after.protectedCounts);
  assertFinalState({ ...after, contract });
  evidence.after = {
    ledgerVersion: Math.max(0, ...after.ledgerRows.map(row => Number(row.version))),
    protectedCounts: after.protectedCounts,
    tableCount: after.tableRows.length,
    foreignKeyViolations: after.foreignKeyRows.length
  };
  evidence.postMigrationBookmark = await client.bookmark();
  return evidence;
}
