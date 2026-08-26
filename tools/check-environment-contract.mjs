import { readJson } from './lib/project.mjs';
import { validateEnvironmentContract } from './lib/environment.mjs';

const contract = await readJson('config/environment-contract.json');
const errors = validateEnvironmentContract(contract);

const inventory = await readJson('docs/generated/system-inventory.json');
const declaredBindings = new Set([
  ...(contract.pages?.bindings || []).map(binding => binding.name),
  ...(contract.pages?.variables || []),
  ...(contract.pages?.secrets || []),
  ...(contract.pages?.forbiddenUntilSecurityContainment || []),
  ...(contract.pages?.legacyUnprovisionedBindings || []),
  ...(contract.importWorker?.bindings || []).map(binding => binding.name),
  ...(contract.importWorker?.secrets || [])
]);
for (const binding of Object.keys(inventory.environmentBindings || {})) {
  if (!declaredBindings.has(binding)) errors.push(`Source references undeclared environment binding ${binding}.`);
}

if (errors.length) {
  console.error(`Environment contract failed with ${errors.length} issue(s).`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Environment contract passed: environments are separated and every discovered binding is classified.');
