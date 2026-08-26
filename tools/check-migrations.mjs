import { DatabaseSync } from 'node:sqlite';
import { readJson, readText, walkFiles } from './lib/project.mjs';

const strict = process.argv.includes('--strict');
const policy = await readJson('config/quality-baseline.json');
const known = new Map(policy.knownIssues.map(issue => [issue.id, issue]));
const files = (await walkFiles())
  .filter(file => /^migrations\/\d+_.+\.sql$/.test(file))
  .sort((left, right) => left.localeCompare(right));
const issues = [];

const versions = new Map();
for (const file of files) {
  const version = file.match(/^migrations\/(\d+)_/)?.[1];
  if (!versions.has(version)) versions.set(version, []);
  versions.get(version).push(file);
}
for (const [version, matchingFiles] of versions) {
  if (matchingFiles.length > 1) {
    issues.push({
      id: `migration.duplicate-version.${version}`,
      detail: matchingFiles.join(', ')
    });
  }
}

for (const file of files) {
  if (file === 'migrations/0001_cloud_platform_foundation.sql') continue;
  const sql = await readText(file);
  if (!/INSERT\s+OR\s+REPLACE\s+INTO\s+schema_migrations|INSERT\s+INTO\s+schema_migrations/i.test(sql)) {
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
database.close();

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
  console.log(`Migration check passed: ${files.length} migration(s) applied cleanly.`);
}
