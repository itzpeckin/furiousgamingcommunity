import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compareText, normalizeText, readJson, stableJson, walkFiles } from '../../tools/lib/project.mjs';
import { validateEnvironmentContract } from '../../tools/lib/environment.mjs';

test('the committed environment contract separates local, staging, and production', async () => {
  const contract = await readJson('config/environment-contract.json');
  assert.deepEqual(validateEnvironmentContract(contract), []);
});

test('shared staging and production resources are rejected', async () => {
  const contract = structuredClone(await readJson('config/environment-contract.json'));
  contract.environments.production.resources.COMPANION_EXPORTS =
    contract.environments.staging.resources.COMPANION_EXPORTS;
  assert.ok(
    validateEnvironmentContract(contract).includes('Staging and production share COMPANION_EXPORTS.')
  );
});

test('generated evidence is deterministic across operating systems', () => {
  assert.equal(normalizeText('first\r\nsecond\rthird'), 'first\nsecond\nthird');
  assert.deepEqual(['z', 'a', '_', 'A'].sort(compareText), ['A', '_', 'a', 'z']);
  assert.equal(stableJson({ z: 1, A: 2, a: 3 }), '{\n  "A": 2,\n  "a": 3,\n  "z": 1\n}\n');
});

test('generated system evidence is stamped with the current release', async () => {
  const [packageJson, inventory] = await Promise.all([
    readJson('package.json'),
    readJson('docs/generated/system-inventory.json')
  ]);
  assert.equal(inventory.release, packageJson.version);
});

test('inventory excludes Git metadata in ordinary checkouts and worktrees', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'franchisehq-inventory-'));
  try {
    await writeFile(path.join(fixture, '.git'), 'gitdir: C:/example/worktrees/release\n');
    await writeFile(path.join(fixture, 'visible.txt'), 'included\n');
    const files = await walkFiles(fixture);
    assert.equal(files.some(file => file.endsWith('/.git') || file === '.git'), false);
    assert.equal(files.some(file => file.endsWith('/visible.txt') || file === 'visible.txt'), true);
  } finally {
    await rm(fixture, { recursive:true, force:true });
  }
});
