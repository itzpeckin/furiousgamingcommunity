import { DatabaseSync } from 'node:sqlite';
import { readJson, readText, walkFiles } from './lib/project.mjs';

const strict = process.argv.includes('--strict');
const policy = await readJson('config/quality-baseline.json');
const contract = await readJson('config/database-schema-contract.json');
const known = new Map(policy.knownIssues.map(issue => [issue.id, issue]));
const projectFiles = await walkFiles();
const files = projectFiles
  .filter(file => /^migrations\/\d+_.+\.sql$/.test(file))
  .sort((left, right) => left.localeCompare(right));
const legacyFiles = projectFiles
  .filter(file => /^migrations\/legacy\/\d+_.+\.sql$/.test(file))
  .sort((left, right) => left.localeCompare(right));
const issues = [];

if (legacyFiles.length !== 19) {
  issues.push({
    id: 'migration.legacy-archive',
    detail: `Expected 19 preserved legacy migrations; found ${legacyFiles.length}.`
  });
}
const versions = new Map();
for (const file of files) {
  const version = Number(file.match(/^migrations\/(\d+)_/)?.[1]);
  if (!versions.has(version)) versions.set(version, []);
  versions.get(version).push(file);
}
for (const [version, matchingFiles] of versions) {
  if (matchingFiles.length > 1) {
    issues.push({
      id: `migration.duplicate-version.${String(version).padStart(4, '0')}`,
      detail: matchingFiles.join(', ')
    });
  }
}

const orderedVersions = [...versions.keys()].sort((left, right) => left - right);
const expectedVersions = [];
for (let version = contract.firstCanonicalVersion; version <= contract.currentVersion; version += 1) {
  expectedVersions.push(version);
}
if (JSON.stringify(orderedVersions) !== JSON.stringify(expectedVersions)) {
  issues.push({
    id: 'migration.canonical-sequence',
    detail: `Expected ${expectedVersions.join(', ')}; found ${orderedVersions.join(', ')}.`
  });
}

for (const file of files) {
  const sql = await readText(file);
  if (!/INSERT\s+(?:OR\s+(?:IGNORE|REPLACE)\s+)?INTO\s+schema_migrations/i.test(sql)) {
    issues.push({ id: `migration.missing-ledger-write.${file.split('/').pop()}`, detail: file });
  }
}

const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON;');
for (const file of files) {
  try {
    database.exec(await readText(file));
  } catch (error) {
    issues.push({ id: `migration.fresh-apply.${file.split('/').pop()}`, detail: String(error.message || error) });
    break;
  }
}

if (!issues.some(issue => issue.id.startsWith('migration.fresh-apply.'))) {
  const tables = new Set(database.prepare(
    `SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'`
  ).all().map(row => String(row.name)));
  for (const table of contract.requiredTables) {
    if (!tables.has(table)) {
      issues.push({ id: `migration.missing-table.${table}`, detail: table });
    }
  }

  for (const [table, requiredColumns] of Object.entries(contract.requiredCoreColumns)) {
    const safeTable = table.replaceAll('"', '""');
    const columns = new Set(database.prepare(`PRAGMA table_info("${safeTable}")`).all().map(row => String(row.name)));
    for (const column of requiredColumns) {
      if (!columns.has(column)) {
        issues.push({ id: `migration.missing-column.${table}.${column}`, detail: `${table}.${column}` });
      }
    }
  }

  const ledger = database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()
    .map(row => Number(row.version));
  const expectedLedger = [];
  for (let version = 1; version <= contract.currentVersion; version += 1) expectedLedger.push(version);
  if (JSON.stringify(ledger) !== JSON.stringify(expectedLedger)) {
    issues.push({
      id: 'migration.ledger-sequence',
      detail: `Expected ${expectedLedger.join(', ')}; found ${ledger.join(', ')}.`
    });
  }

  const foreignKeyViolations = database.prepare('PRAGMA foreign_key_check').all();
  if (foreignKeyViolations.length) {
    issues.push({
      id: 'migration.foreign-key-check',
      detail: `${foreignKeyViolations.length} violation(s) found on a fresh database.`
    });
  }
}
database.close();

const schemaMutationPattern = /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|TRIGGER|VIEW)\b/i;
for (const file of projectFiles.filter(file => /^functions\/.+\.js$/.test(file))) {
  const source = await readText(file);
  if (schemaMutationPattern.test(source)) {
    issues.push({ id: `migration.request-time-schema.${file}`, detail: file });
  }
}

const unexpected = issues.filter(issue => !known.has(issue.id));
const inherited = issues.filter(issue => known.has(issue.id));
const resolved = [...known.keys()].filter(id => !issues.some(issue => issue.id === id));

for (const issue of inherited) {
  const baseline = known.get(issue.id);
  console.warn(`KNOWN ${baseline.severity.toUpperCase()}: ${issue.id} -> ${baseline.targetRelease}`);
}
for (const id of resolved) console.warn(`RESOLVED BUT STILL REGISTERED: ${id}`);

if (unexpected.length) {
  console.error(`Migration check found ${unexpected.length} unregistered issue(s).`);
  for (const issue of unexpected) console.error(`- ${issue.id}: ${issue.detail}`);
  process.exit(1);
}
if (strict && issues.length) {
  console.error(`Strict migration check failed: ${issues.length} issue(s), including registered inherited debt.`);
  process.exit(1);
}

if (issues.length) {
  console.log(`Migration baseline matched: ${issues.length} inherited issue(s), 0 new issue(s). Strict mode remains blocked.`);
} else {
  console.log(
    `Migration check passed: ${files.length} canonical migration(s), ${legacyFiles.length} archived legacy file(s), ${contract.requiredTables.length} required table(s).`
  );
}
