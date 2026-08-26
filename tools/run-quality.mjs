import { spawnSync } from 'node:child_process';

const strict = process.argv.includes('--strict');
const checks = [
  ['Repository lint', 'tools/check-repository.mjs', []],
  ['JavaScript syntax', 'tools/check-syntax.mjs', []],
  ['HTML asset references', 'tools/check-html-assets.mjs', []],
  ['Secret scan', 'tools/check-secrets.mjs', []],
  ['Environment contract', 'tools/check-environment-contract.mjs', []],
  ['Migration baseline', 'tools/check-migrations.mjs', strict ? ['--strict'] : []],
  ['Tooling tests', null, ['--test', 'tests/tooling/environment.test.mjs', 'tests/tooling/routes.test.mjs']],
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

console.log(`\nFranchiseHQ 7.0.0 ${strict ? 'strict' : 'baseline'} quality gate passed.`);
