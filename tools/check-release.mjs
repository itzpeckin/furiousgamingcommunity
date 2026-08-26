import { fileExists, readJson, readText } from './lib/project.mjs';

const manifest = await readJson('releases/7.0.0/manifest.json');
const baseline = await readJson('config/quality-baseline.json');
const evidence = await readJson('releases/7.0.0/validation-evidence.json');
const errors = [];

if (manifest.product !== 'FranchiseHQ') errors.push('Release product must be FranchiseHQ.');
if (manifest.version !== '7.0.0') errors.push('Release version must be 7.0.0.');
if (manifest.status !== 'validated-production-authorized') {
  errors.push('Release status must record the owner-authorized production baseline.');
}
if (manifest.sourceBaseline?.commit !== '4d0a4e979f98a99a8faea7c53fdd7366edc975f9') {
  errors.push('Source baseline commit does not match the audited 6.3.2 commit.');
}
if (manifest.sourceBaseline?.tag !== 'v6.3.2-baseline') errors.push('Rollback baseline tag is missing.');
if (manifest.production?.authorized !== true || manifest.production?.deployed !== false) {
  errors.push('7.0.0 must record the narrow production authorization without claiming deployment.');
}
if (evidence.external?.productionDeployment?.authorized !== true ||
    evidence.external?.productionDeployment?.scope !== 'controlled-7.0.0-squash-merge') {
  errors.push('Validation evidence must record the controlled 7.0.0 production authorization.');
}
if (manifest.staging?.deployed !== false) errors.push('Staging must remain undeployed until external bindings are verified.');
if (evidence.baselineGate?.passed !== true || evidence.baselineGate?.unregisteredFailures !== 0) {
  errors.push('Validation evidence must show a passing baseline with zero unregistered failures.');
}
if (evidence.checks?.strictMigration?.expectedFailure !== true || evidence.checks?.strictMigration?.passed !== false) {
  errors.push('Validation evidence must preserve the expected strict migration failure until 7.1.0.');
}
if (evidence.productionChanged !== false || evidence.dataChanged !== false || evidence.credentialsChanged !== false) {
  errors.push('7.0.0 evidence must confirm production, data, and credentials were unchanged.');
}

const registered = new Set(baseline.knownIssues.map(issue => issue.id));
for (const issue of manifest.knownInheritedIssues || []) {
  if (!registered.has(issue)) errors.push(`Manifest references unknown inherited issue ${issue}.`);
}
if ((manifest.knownInheritedIssues || []).length !== registered.size) {
  errors.push('Manifest known-issue list does not match the quality baseline.');
}

for (const file of manifest.requiredArtifacts || []) {
  if (!(await fileExists(file))) errors.push(`Required release artifact is missing: ${file}.`);
}

const record = await readText('releases/7.0.0/release-record.md');
for (const heading of ['Scope', 'Added during delivery', 'Known inherited blockers', 'Validation evidence', 'Deployment status', 'Rollback']) {
  if (!record.includes(`## ${heading}`)) errors.push(`Release record is missing heading: ${heading}.`);
}

if (errors.length) {
  console.error(`Release contract failed with ${errors.length} issue(s).`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Release contract passed: 7.0.0 is tied to the audited baseline and records only the controlled production authorization.');
