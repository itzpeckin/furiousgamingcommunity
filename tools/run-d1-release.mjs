import { CloudflareD1ReleaseClient, executeRelease, targetConfirmation } from './lib/d1-release.mjs';
import { readJson, stableJson } from './lib/project.mjs';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage() {
  return [
    'Usage:',
    '  node tools/run-d1-release.mjs --target staging --plan',
    '  node tools/run-d1-release.mjs --target production --apply --confirm-target production:franchise-hq-db:<database-id>',
    '',
    'CLOUDFLARE_API_TOKEN must contain D1 Read for plans and D1 Write for application.'
  ].join('\n');
}

if (process.argv.includes('--help')) {
  console.log(usage());
  process.exit(0);
}

const targetName = option('--target');
const apply = process.argv.includes('--apply');
const plan = process.argv.includes('--plan');
if (!targetName || apply === plan) throw new Error(usage());

const registry = await readJson('config/d1-database-targets.json');
const target = registry.targets?.[targetName];
if (!target) throw new Error(`Unknown D1 target: ${targetName}.`);

const apiToken = process.env.CLOUDFLARE_API_TOKEN;
if (!apiToken) throw new Error('CLOUDFLARE_API_TOKEN is required and must never be committed.');

const client = new CloudflareD1ReleaseClient({
  accountId: registry.accountId,
  databaseId: target.databaseId,
  apiToken
});

try {
  const evidence = await executeRelease({
    client,
    targetName,
    target,
    apply,
    confirmation: option('--confirm-target')
  });
  console.log(stableJson(evidence));
} catch (error) {
  console.error(`D1 ${apply ? 'application' : 'plan'} failed for ${targetName}.`);
  console.error(String(error?.message || error));
  if (apply) {
    console.error(`Stop deployment. Use the recorded pre-migration bookmark only after owner-approved recovery.`);
  } else {
    console.error(`Expected confirmation for application: ${targetConfirmation(targetName, target)}`);
  }
  process.exitCode = 1;
}
