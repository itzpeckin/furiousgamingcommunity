import { spawnSync } from 'node:child_process';
import { readJson } from './lib/project.mjs';

const strict = process.argv.includes('--strict');
const packageJson = await readJson('package.json');
const checks = [
  ['Repository lint', 'tools/check-repository.mjs', []],
  ['JavaScript syntax', 'tools/check-syntax.mjs', []],
  ['HTML asset references', 'tools/check-html-assets.mjs', []],
  ['Secret scan', 'tools/check-secrets.mjs', []],
  ['Environment contract', 'tools/check-environment-contract.mjs', []],
  ['Migration baseline', 'tools/check-migrations.mjs', strict ? ['--strict'] : []],
  ['Automated tests', null, [
    '--test',
    '--test-isolation=none',
    'tests/tooling/environment.test.mjs',
    'tests/tooling/routes.test.mjs',
    'tests/tooling/d1-release.test.mjs',
    'tests/database/migrations.test.mjs',
    'tests/import/madden-discovery.test.mjs',
    'tests/import/permanent-identity.test.mjs',
    'tests/import/candidate-import.test.mjs',
    'tests/import/game-year-transition.test.mjs',
    'tests/security/containment.test.mjs',
    'tests/security/session.test.mjs',
    'tests/security/onboarding.test.mjs',
    'tests/security/ownership.test.mjs',
    'tests/security/tenancy.test.mjs'
  ]],
  ['System inventory', 'tools/generate-inventory.mjs', ['--verify']],
  ['Release contract', 'tools/check-release.mjs', []]
];

for (const [label, script, argumentsList] of checks) {
  console.log(`\n[FranchiseHQ quality] ${label}`);
  const args = script ? [script, ...argumentsList] : argumentsList;
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    console.error(`\nQuality gate failed: ${label}.`);
    process.exit(result.status || 1);
  }
}

console.log(`\nFranchiseHQ ${packageJson.version} ${strict ? 'strict' : 'baseline'} quality gate passed.`);
