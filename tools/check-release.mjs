import { fileExists, readJson, readText } from './lib/project.mjs';

const packageJson = await readJson('package.json');
const version = packageJson.version;
const versionParts = version.split('.').map(part => Number(part));
const isAtLeast = (major, minor) => (
  versionParts[0] > major
  || (versionParts[0] === major && versionParts[1] >= minor)
);
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
  'production-deployed-pending-owner-acceptance',
  'released'
]);
const isPostDeployment = new Set([
  'production-deployed-pending-owner-acceptance',
  'released'
]).has(manifest.status);
const isAuthorizedGameYearTransition = version === '7.3.2'
  && evidence.scopeBoundaries?.gameYearTransition === true;

if (manifest.product !== 'FranchiseHQ') errors.push('Release product must be FranchiseHQ.');
if (manifest.version !== version || evidence.version !== version) errors.push('Package, manifest, and evidence versions must match.');
if (!allowedStatuses.has(manifest.status)) errors.push(`Unsupported release status: ${manifest.status}.`);
if (!/^[a-f0-9]{40}$/i.test(manifest.sourceBaseline?.commit || '')) errors.push('Source baseline commit must be an exact Git SHA.');
if (!manifest.sourceBaseline?.tag) errors.push('Rollback baseline tag is missing.');
if (manifest.production?.deployed === true && manifest.production?.authorized !== true) {
  errors.push('A release cannot claim a production deployment without owner authorization.');
}
if (evidence.baselineGate?.unregisteredFailures !== 0) errors.push('Validation evidence must report zero unregistered failures.');
if (isAtLeast(7, 1)) {
  if (evidence.checks?.strictMigration?.expectedFailure !== false || evidence.checks?.strictMigration?.passed !== true) {
    errors.push(`${version} must prove that the strict migration gate passes.`);
  }
} else if (evidence.checks?.strictMigration?.expectedFailure !== true || evidence.checks?.strictMigration?.passed !== false) {
  errors.push('Pre-7.1.0 validation evidence must preserve the expected strict migration failure.');
}
if (!isPostDeployment && (evidence.productionChanged !== false || evidence.dataChanged !== false || evidence.credentialsChanged !== false)) {
  errors.push(`${version} evidence must accurately preserve unchanged production, data, and credentials during candidate work.`);
}
if (isPostDeployment && (
  evidence.productionChanged !== true
  || evidence.credentialsChanged !== false
  || (isAuthorizedGameYearTransition
    ? (evidence.dataChanged !== true || evidence.productionDataChanged !== true)
    : evidence.dataChanged !== false)
)) {
  errors.push(`${version} post-deployment evidence must accurately record the authorized production, data, and credential scope.`);
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
  if (isPostDeployment) {
    if (manifest.production?.authorized !== true || manifest.production?.deployed !== true || manifest.production?.status !== 'success-pending-owner-acceptance') {
      errors.push('Deployed 7.0.3 evidence must record the owner-authorized successful production publication.');
    }
    if (evidence.external?.githubPullRequest?.status !== 'merged' || evidence.external?.hostedChecks?.status !== 'passed') {
      errors.push('Deployed 7.0.3 evidence must record the merged pull request and passing hosted checks.');
    }
    if (evidence.external?.productionDeployment?.authorized !== true || evidence.external?.productionDeployment?.status !== 'success') {
      errors.push('Deployed 7.0.3 evidence must record the successful authorized Cloudflare deployment.');
    }
    if (evidence.external?.productionMigration?.authorized !== true || evidence.external?.productionMigration?.status !== 'applied-and-verified') {
      errors.push('Deployed 7.0.3 evidence must record the authorized and verified production migration.');
    }
    if (
      evidence.liveReadOnlyDiagnosis?.membershipRowsBefore !== evidence.liveReadOnlyDiagnosis?.membershipRowsAfter ||
      evidence.liveReadOnlyDiagnosis?.membershipRowsChanged !== 0 ||
      evidence.liveReadOnlyDiagnosis?.membershipAuditTablePresent !== true ||
      evidence.liveReadOnlyDiagnosis?.repairIndexesPresent !== 4
    ) {
      errors.push('Deployed 7.0.3 evidence must prove membership preservation and the completed audit-schema repair.');
    }
  } else {
    if (manifest.production?.authorized !== false || manifest.production?.deployed !== false) {
      errors.push('7.0.3 candidate work must not claim production authorization or deployment.');
    }
    if (evidence.external?.productionMigration?.authorized !== false || evidence.external?.productionMigration?.status !== 'not-run') {
      errors.push('7.0.3 candidate work must not claim an authorized or completed production migration.');
    }
  }
}
if (version === '7.0.4') {
  for (const check of [
    'securityTests',
    'sessionRefreshRecovery',
    'ownerFallbackGating',
    'canonicalTeamAuthority',
    'importedOwnerIgnored',
    'authenticatedMembershipOwnership',
    'staffTeamIndependence',
    'duplicateTeamAssignment',
    'legacyOwnerRetirement',
    'resetCommissionerBoundary',
    'resetAtomicRehearsal',
    'resetPreservation',
    'mobileOwnershipLayout'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.0.4 ownership/reset evidence is incomplete: ${check}.`);
  }
  if (!isPostDeployment) {
    if (manifest.production?.authorized !== false || manifest.production?.deployed !== false) {
      errors.push('Unpublished 7.0.4 candidate work must not claim production authorization or deployment.');
    }
    if (evidence.external?.productionMigrations?.authorized !== false || evidence.external?.productionMigrations?.status !== 'not-run') {
      errors.push('Unpublished 7.0.4 candidate work must not claim an authorized or completed production migration.');
    }
    if (evidence.external?.productionDataReset?.authorized !== false || evidence.external?.productionDataReset?.status !== 'not-run') {
      errors.push('Unpublished 7.0.4 candidate work must not claim an authorized or completed production data reset.');
    }
  }
}
if (version === '7.0.5') {
  for (const check of [
    'securityTests',
    'domainSpecificDiscordCallbacks',
    'sameOriginSessionEstablishment',
    'exactRouteRefreshBridge',
    'mobileIdentityConfirmation',
    'ownerFallbackGating',
    'commissionerManagementConsolidation',
    'pendingQueuePreserved',
    'membershipTeamPolicy',
    'membershipReactivation',
    'commissionerLockoutProtection',
    'mobileOwnershipLayout'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.0.5 authentication/onboarding evidence is incomplete: ${check}.`);
  }
  if (isPostDeployment) {
    if (manifest.production?.authorized !== true || manifest.production?.deployed !== true || manifest.production?.status !== 'success-pending-owner-acceptance') {
      errors.push('Deployed 7.0.5 evidence must record the owner-authorized successful production publication.');
    }
    if (evidence.external?.githubPullRequest?.status !== 'merged' || evidence.external?.hostedChecks?.status !== 'passed') {
      errors.push('Deployed 7.0.5 evidence must record the merged pull request and passing hosted checks.');
    }
    if (evidence.external?.productionDeployment?.authorized !== true || evidence.external?.productionDeployment?.status !== 'success') {
      errors.push('Deployed 7.0.5 evidence must record the successful authorized Cloudflare deployment.');
    }
  } else {
    if (manifest.production?.authorized !== true || manifest.production?.deployed !== false) {
      errors.push('The owner-authorized 7.0.5 candidate must record publication authorization without claiming deployment.');
    }
    if (evidence.external?.productionMigrations?.authorized !== false || evidence.external?.productionMigrations?.status !== 'not-run') {
      errors.push('7.0.5 must not claim an authorized or completed production migration.');
    }
    if (evidence.external?.productionDataReset?.authorized !== false || evidence.external?.productionDataReset?.status !== 'not-run') {
      errors.push('7.0.5 must not claim an authorized or completed production data reset.');
    }
    if (manifest.status === 'validated-production-authorized' && evidence.external?.discordOAuthConfiguration?.status !== 'registered-and-verified') {
      errors.push('The validated 7.0.5 production candidate requires both exact Discord callbacks to be registered and verified.');
    }
  }
}
if (version === '7.1.0') {
  for (const check of [
    'canonicalMigrationSequence',
    'freshDatabase',
    'legacyUpgrade',
    'identityPreservation',
    'foreignKeyIntegrity',
    'backupRestore',
    'requestTimeSchemaRemoval',
    'runtimeSchemaGuard',
    'sharedSettingsSchema',
    'strictMigration'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.1.0 database evidence is incomplete: ${check}.`);
  }
  if (manifest.production?.authorized !== false || manifest.production?.deployed !== false) {
    errors.push('7.1.0 candidate work must not claim production authorization or deployment.');
  }
  if (evidence.external?.productionMigrations?.authorized !== false || evidence.external?.productionMigrations?.status !== 'not-run') {
    errors.push('7.1.0 candidate work must not claim an authorized or completed production migration.');
  }
  if (evidence.external?.productionDataReset?.authorized !== false || evidence.external?.productionDataReset?.status !== 'not-run') {
    errors.push('7.1.0 candidate work must not claim an authorized or completed production data reset.');
  }
  if (evidence.scopeBoundaries?.authenticationChanged !== false) {
    errors.push('7.1.0 must preserve the owner-approved authentication freeze.');
  }
}
if (version === '7.2.0') {
  for (const check of [
    'tenantSchema',
    'explicitTenantResolution',
    'tenantAliasResolution',
    'disabledTenantDenial',
    'crossTenantIsolation',
    'tenantFeatureDefaults',
    'tenantScopedStorage',
    'tenantAuditContext',
    'hardCodedDefaultRemoval',
    'validationPlayerScope',
    'migrationPreservation',
    'strictMigration'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.2.0 tenant evidence is incomplete: ${check}.`);
  }
  if (manifest.production?.authorized !== false || manifest.production?.deployed !== false) {
    errors.push('7.2.0 candidate work must not claim production authorization or deployment.');
  }
  if (evidence.external?.productionMigrations?.authorized !== false || evidence.external?.productionMigrations?.status !== 'not-run') {
    errors.push('7.2.0 candidate work must not claim an authorized or completed production migration.');
  }
  if (evidence.external?.productionDataReset?.authorized !== false || evidence.external?.productionDataReset?.status !== 'not-run') {
    errors.push('7.2.0 candidate work must not claim an authorized or completed production data reset.');
  }
  if (evidence.scopeBoundaries?.sessionRefreshRedesignChanged !== false) {
    errors.push('7.2.0 must preserve the owner-approved session-refresh redesign freeze.');
  }
}
if (version === '7.3.0') {
  for (const check of [
    'shortLivedCaptureSessions',
    'captureTokenHashOnly',
    'crossMinuteSessionContinuity',
    'duplicatePayloadSessionLinking',
    'maddenDatasetInventory',
    'freeAgentProofContract',
    'rosteredPlayerAssignmentEvidence',
    'freeAgentCohortIsolation',
    'successfulEmptyFreeAgentResponse',
    'sanitizedFixturePrivacy',
    'sourceLockNoActivation',
    'strictMigration'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.3.0 Madden discovery evidence is incomplete: ${check}.`);
  }
  if (manifest.production?.authorized !== false || manifest.production?.deployed !== false) {
    errors.push('7.3.0 candidate work must not claim production authorization or deployment.');
  }
  if (evidence.external?.productionMigrations?.authorized !== false || evidence.external?.productionMigrations?.status !== 'not-run') {
    errors.push('7.3.0 candidate work must not claim an authorized or completed production migration.');
  }
  if (evidence.external?.productionDataReset?.authorized !== false || evidence.external?.productionDataReset?.status !== 'not-run') {
    errors.push('7.3.0 discovery must not claim an authorized or completed production data reset.');
  }
  if (evidence.external?.maddenImportActivation?.authorized !== false || evidence.external?.maddenImportActivation?.status !== 'not-run') {
    errors.push('7.3.0 discovery must not claim an authorized or completed Madden activation.');
  }
  if (evidence.scopeBoundaries?.activeSnapshotChanged !== false || evidence.scopeBoundaries?.rawPayloadReturned !== false) {
    errors.push('7.3.0 must preserve the no-activation and no-raw-payload boundaries.');
  }
}
if (version === '7.3.1') {
  for (const check of [
    'permanentSeasonIdentity',
    'stablePlayerIdentity',
    'playerSeasonHistory',
    'gmPersonIdentity',
    'ownershipPeriodIntegrity',
    'privateIdentityPreview',
    'rosteredPlayerOnlyState',
    'freeAgentBlockedPreserved',
    'sourceLockNoActivation',
    'strictMigration'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.3.1 identity evidence is incomplete: ${check}.`);
  }
  if (manifest.production?.authorized !== false || manifest.production?.deployed !== false) {
    errors.push('7.3.1 candidate work must not claim production authorization or deployment.');
  }
  if (evidence.external?.productionMigrations?.authorized !== false || evidence.external?.productionMigrations?.status !== 'not-run') {
    errors.push('7.3.1 candidate work must not claim an authorized or completed production migration.');
  }
  if (evidence.external?.productionDataReset?.authorized !== false || evidence.external?.productionDataReset?.status !== 'not-run') {
    errors.push('7.3.1 identity work must not claim an authorized or completed production data reset.');
  }
  if (evidence.external?.maddenImportActivation?.authorized !== false || evidence.external?.maddenImportActivation?.status !== 'not-run') {
    errors.push('7.3.1 identity work must not claim an authorized or completed Madden activation.');
  }
  if (evidence.scopeBoundaries?.activeSnapshotChanged !== false || evidence.scopeBoundaries?.freeAgentInterpretedAsZero !== false) {
    errors.push('7.3.1 must preserve no-activation and blocked-Free-Agent boundaries.');
  }
}
if (version === '7.3.2') {
  for (const check of [
    'commissionerCandidateAuthority',
    'privateSeasonDestination',
    'idempotentSourceFingerprint',
    'exactMappingRunPins',
    'appendOnlyCandidateBuild',
    'candidateValidation',
    'measuredPhaseProgress',
    'freeAgentBlockedPreserved',
    'sourceLockNoActivation',
    'strictMigration'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.3.2 candidate-import evidence is incomplete: ${check}.`);
  }
  if (isPostDeployment) {
    const expectedProductionStatus = manifest.status === 'released'
      ? 'success-owner-accepted'
      : 'success-pending-owner-acceptance';
    if (manifest.production?.authorized !== true || manifest.production?.deployed !== true || manifest.production?.status !== expectedProductionStatus) {
      errors.push('Deployed 7.3.2 evidence must record the owner-authorized Production acceptance publication.');
    }
    if (evidence.external?.productionDeployment?.authorized !== true || evidence.external?.productionDeployment?.status !== 'success') {
      errors.push('Deployed 7.3.2 evidence must record the successful authorized Pages deployment.');
    }
    if (evidence.external?.productionMigrations?.authorized !== true || evidence.external?.productionMigrations?.status !== 'applied-verified') {
      errors.push('Deployed 7.3.2 evidence must record migrations 21–24 as applied and verified.');
    }
    if (evidence.external?.productionGameYearTransition?.status !== 'archived-detached-clean-active-plane') {
      errors.push('Deployed 7.3.2 evidence must record the exact game-year archive/detach transition.');
    }
    const initialRehearsalStatus = evidence.external?.candidateImportRehearsal?.status;
    if (!['completed-verified-performance-pending','completed-verified-performance-failed'].includes(initialRehearsalStatus)) {
      errors.push('Deployed 7.3.2 evidence must retain the initial Production rehearsal and its measured performance result.');
    }
    if (['production-cold-performance-validated-pending-owner-acceptance','production-owner-accepted-no-activation','production-owner-accepted-active-snapshot'].includes(evidence.status)) {
      const repaired = evidence.external?.repairedColdCandidateRehearsal;
      const durationMs = Number(repaired?.durationMs || 0);
      const targetMs = Number(repaired?.targetMs || 60000);
      if (repaired?.authorized !== true || repaired?.status !== 'completed-verified'
        || repaired?.performanceTargetMet !== true || durationMs <= 0 || durationMs >= targetMs
        || evidence.checks?.productionColdPerformance?.passed !== true) {
        errors.push('Performance-validated 7.3.2 evidence must retain one authorized, completed, sub-target repaired cold rehearsal.');
      }
    }
    if (manifest.status === 'released' && (
      !['production-owner-accepted-no-activation','production-owner-accepted-active-snapshot'].includes(evidence.status)
      || evidence.manualAcceptance?.status !== 'owner-accepted'
      || evidence.manualAcceptance?.ownerAcceptanceRecorded !== true
    )) {
      errors.push('Released 7.3.2 evidence must record owner acceptance and its exact activation boundary.');
    }
  } else {
    if (manifest.production?.authorized !== false || manifest.production?.deployed !== false) {
      errors.push('Unpublished 7.3.2 candidate work must not claim production authorization or deployment.');
    }
    if (evidence.external?.productionMigrations?.authorized !== false || evidence.external?.productionMigrations?.status !== 'not-run') {
      errors.push('Unpublished 7.3.2 candidate work must not claim an authorized or completed production migration.');
    }
    if (evidence.external?.productionDataReset?.authorized !== false || evidence.external?.productionDataReset?.status !== 'not-run') {
      errors.push('Unpublished 7.3.2 candidate work must not claim an authorized or completed production data reset.');
    }
  }
  const activation = evidence.external?.maddenImportActivation;
  const activeRelease = evidence.status === 'production-owner-accepted-active-snapshot';
  if (activeRelease) {
    const repairedSnapshotId = evidence.external?.repairedColdCandidateRehearsal?.candidateSnapshotId;
    if (activation?.authorized !== true || activation?.status !== 'completed-verified'
      || activation?.snapshotId !== repairedSnapshotId || activation?.activeSnapshotRows !== 1
      || activation?.validationStatus !== 'ready' || Number(activation?.validationErrors) !== 0
      || activation?.freeAgentStatus !== 'blocked' || activation?.freeAgentCount !== null
      || activation?.activationSessionStatus !== 'revoked' || Number(activation?.activeActivationSessions) !== 0
      || Number(activation?.foreignKeyViolations) !== 0 || evidence.scopeBoundaries?.activeSnapshotChanged !== true) {
      errors.push('Active 7.3.2 evidence must prove exact accepted-snapshot activation, validation, cleanup, and blocked-Free-Agent preservation.');
    }
  } else if (activation?.authorized !== false || activation?.status !== 'not-run'
    || evidence.scopeBoundaries?.activeSnapshotChanged !== false) {
    errors.push('Non-active 7.3.2 evidence must preserve the separate no-activation boundary.');
  }
  if (evidence.scopeBoundaries?.freeAgentInterpretedAsZero !== false) {
    errors.push('7.3.2 must preserve the blocked-Free-Agent boundary.');
  }
}
if (version === '7.3.3') {
  for (const check of [
    'gameYearBoundary',
    'separateOperationControls',
    'immutableArchiveManifest',
    'archiveChecksumVerification',
    'typedLeagueGameYearConfirmation',
    'protectedPlatformPlane',
    'teamAssignmentRemapBoundary',
    'franchiseSeasonClosure',
    'activeDataDetachRemoval',
    'recoveryBookmarkRollback',
    'archiveCopyRemoval',
    'resumableRecovery',
    'identityMappingDependencies',
    'boundaryStatusRestoration',
    'isolatedStagingRehearsal',
    'legacyResetRetired',
    'freeAgentBlockedPreserved',
    'strictMigration'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.3.3 game-year transition evidence is incomplete: ${check}.`);
  }
  if (manifest.production?.authorized !== false || manifest.production?.deployed !== false) {
    errors.push('7.3.3 implementation work must not claim Production authorization or deployment.');
  }
  if (evidence.external?.productionMigrations?.authorized !== false || evidence.external?.productionMigrations?.status !== 'not-run') {
    errors.push('7.3.3 implementation work must not claim an authorized or completed Production migration.');
  }
  if (evidence.external?.productionDataRemoval?.authorized !== false || evidence.external?.productionDataRemoval?.status !== 'not-run') {
    errors.push('7.3.3 implementation work must not claim an authorized or completed Production removal.');
  }
  const stagingValidated=manifest.status==='staging-validated';
  if(stagingValidated){
    const rehearsal=evidence.external?.cloudRehearsal;
    if(
      manifest.staging?.authorized!==true
      || manifest.staging?.deployed!==true
      || rehearsal?.authorized!==true
      || rehearsal?.status!=='completed-restored'
      || rehearsal?.environment!=='isolated-staging'
      || Number(rehearsal?.migrationVersion)!==25
      || Number(rehearsal?.archive?.totalRows)!==7455
      || Number(rehearsal?.archive?.sourceObjects)!==43
      || rehearsal?.transitionStatus!=='restored'
      || rehearsal?.activeSnapshotId!==null
      || rehearsal?.freeAgentStatus!=='blocked'
      || rehearsal?.freeAgentCount!==null
      || Number(rehearsal?.foreignKeyViolations)!==0
      || rehearsal?.sessionStatus!=='revoked'
      || rehearsal?.membershipStatus!=='inactive'
    ){
      errors.push('7.3.3 staging evidence must prove the authorized isolated archive/remove/recovery rehearsal and cleanup.');
    }
  }else if(evidence.external?.cloudRehearsal?.authorized!==false||evidence.external?.cloudRehearsal?.status!=='not-run'){
    errors.push('7.3.3 implementation work must preserve the separate cloud-rehearsal boundary until staging is validated.');
  }
  if (
    evidence.scopeBoundaries?.activeSnapshotChanged !== false
    || evidence.scopeBoundaries?.productionDataChanged !== false
    || evidence.scopeBoundaries?.gitMainChanged !== false
    || evidence.scopeBoundaries?.freeAgentInterpretedAsZero !== false
  ) {
    errors.push('7.3.3 implementation must preserve Production, Main, active-snapshot, and blocked-Free-Agent boundaries.');
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
