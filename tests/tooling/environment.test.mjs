import assert from 'node:assert/strict';
import test from 'node:test';
import { readJson } from '../../tools/lib/project.mjs';
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
