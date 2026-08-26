import { fileExists, readJson, readText } from './lib/project.mjs';

const packageJson = await readJson('package.json');
const version = packageJson.version;
const releaseRoot = `releases/${version}`;
const manifest = await readJson(`${releaseRoot}/manifest.json`);
const baseline = await readJson('config/quality-baseline.json');
const evidence = await readJson(`${releaseRoot}/validation-evidence.json`);
const errors = [];
const allowedStatuses = new Set([
  'implementation-authorized',
  'validated-review-candidate',
  'staging-validated',
  'validated-production-authorized',
  'released'
]);

if (manifest.product !== 'FranchiseHQ') errors.push('Release product must be FranchiseHQ.');
if (manifest.version !== version || evidence.version !== version) errors.push('Package, manifest, and evidence versions must match.');
if (!allowedStatuses.has(manifest.status)) errors.push(`Unsupported release status: ${manifest.status}.`);
if (!/^[a-f0-9]{40}$/i.test(manifest.sourceBaseline?.commit || '')) errors.push('Source baseline commit must be an exact Git SHA.');
if (!manifest.sourceBaseline?.tag) errors.push('Rollback baseline tag is missing.');
if (manifest.production?.deployed === true && manifest.production?.authorized !== true) {
  errors.push('A release cannot claim a production deployment without owner authorization.');
}
if (evidence.baselineGate?.unregisteredFailures !== 0) errors.push('Validation evidence must report zero unregistered failures.');
if (evidence.checks?.strictMigration?.expectedFailure !== true || evidence.checks?.strictMigration?.passed !== false) {
  errors.push('Validation evidence must preserve the expected strict migration failure until 7.1.0.');
}
if (evidence.productionChanged !== false || evidence.dataChanged !== false || evidence.credentialsChanged !== false) {
  errors.push(`${version} evidence must accurately preserve unchanged production, data, and credentials during candidate work.`);
}
if (version === '7.0.1') {
  for (const check of [
    'securityTests',
    'guestAuthorization',
    'memberAuthorization',
    'commissionerAuthorization',
    'sessionRefreshRecovery',
    'sessionHandoffReplay',
    'corsAndCsrf',
    'safeErrorsAndHeaders'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.0.1 security evidence is incomplete: ${check}.`);
  }
  if (manifest.production?.authorized !== false || manifest.production?.deployed !== false) {
    errors.push('7.0.1 candidate work must not claim production authorization or deployment.');
  }
}
if (version === '7.0.2') {
  for (const check of [
    'securityTests',
    'sessionRefreshRecovery',
    'specialRouteRefreshRegression',
    'inviteOnlyActivation',
    'membershipRoleBoundary',
    'duplicateTeamAssignment',
    'commissionerLockoutProtection',
    'restoreAfterDisable'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.0.2 onboarding evidence is incomplete: ${check}.`);
  }
  if (manifest.status === 'validated-production-authorized') {
    if (manifest.production?.authorized !== true || manifest.production?.deployed !== false) {
      errors.push('Authorized 7.0.2 candidate must record authorization without claiming deployment.');
    }
  } else if (manifest.production?.authorized !== false || manifest.production?.deployed !== false) {
    errors.push('Unauthorized 7.0.2 candidate work must not claim production authorization or deployment.');
  }
}
if (version === '7.0.3') {
  for (const check of [
    'securityTests',
    'sessionRefreshRecovery',
    'specialRouteRefreshRegression',
    'canonicalDocumentRedirect',
    'discordCallbackAvailability',
    'canonicalOauthAudience',
    'canonicalInviteOrigin',
    'membershipSchemaFallback',
    'membershipAuditRepair',
    'membershipRequestDeduplication'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.0.3 corrective evidence is incomplete: ${check}.`);
  }
  if (manifest.production?.authorized !== false || manifest.production?.deployed !== false) {
    errors.push('7.0.3 candidate work must not claim production authorization or deployment.');
  }
  if (evidence.external?.productionMigration?.authorized !== false || evidence.external?.productionMigration?.status !== 'not-run') {
    errors.push('7.0.3 candidate work must not claim an authorized or completed production migration.');
  }
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

const record = await readText(`${releaseRoot}/release-record.md`);
for (const heading of ['Scope', 'Added during delivery', 'Known inherited blockers', 'Validation evidence', 'Deployment status', 'Rollback']) {
  if (!record.includes(`## ${heading}`)) errors.push(`Release record is missing heading: ${heading}.`);
}

if (errors.length) {
  console.error(`Release contract failed with ${errors.length} issue(s).`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Release contract passed: ${version} is tied to its immutable rollback baseline and current authorization boundary.`);
