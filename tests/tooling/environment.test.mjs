import assert from 'node:assert/strict';
import test from 'node:test';
import { compareText, normalizeText, readJson, stableJson } from '../../tools/lib/project.mjs';
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
