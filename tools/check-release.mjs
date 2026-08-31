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
const isAuthorizedProductionDataChange = (
  version === '7.3.2' && evidence.scopeBoundaries?.gameYearTransition === true
) || (
  version === '7.3.4.4' && evidence.scopeBoundaries?.activationPerformed === true
) || (
  version === '7.3.4.6' && evidence.scopeBoundaries?.activationPerformed === true
);

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
  || (isAuthorizedProductionDataChange
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
    'productionReleaseIndicator',
    'strictMigration'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.3.3 game-year transition evidence is incomplete: ${check}.`);
  }
  const productionAuthorized=manifest.status==='validated-production-authorized';
  const productionDeployed=isPostDeployment;
  if(productionDeployed){
    if(manifest.production?.authorized!==true||manifest.production?.deployed!==true||manifest.production?.status!=='success-pending-owner-acceptance'){
      errors.push('Deployed 7.3.3 evidence must record the owner-authorized Production acceptance publication.');
    }
    if(evidence.external?.productionDeployment?.authorized!==true||evidence.external?.productionDeployment?.status!=='success'){
      errors.push('Deployed 7.3.3 evidence must record the successful authorized Production deployment.');
    }
    if(evidence.external?.productionMigrations?.authorized!==true||evidence.external?.productionMigrations?.status!=='applied-verified'||Number(evidence.external?.productionMigrations?.migration)!==25){
      errors.push('Deployed 7.3.3 evidence must record additive Production migration 25 as applied and verified.');
    }
  }else if(productionAuthorized){
    if(manifest.production?.authorized!==true||manifest.production?.deployed!==false||manifest.production?.status!=='authorized-not-run'){
      errors.push('Authorized 7.3.3 evidence must record Production publication authorization without claiming deployment.');
    }
    if(evidence.external?.productionDeployment?.authorized!==true||evidence.external?.productionDeployment?.status!=='not-run'){
      errors.push('Authorized 7.3.3 evidence must retain a pending Production deployment.');
    }
    if(evidence.external?.productionMigrations?.authorized!==true||evidence.external?.productionMigrations?.status!=='not-run'||Number(evidence.external?.productionMigrations?.migration)!==25){
      errors.push('Authorized 7.3.3 evidence must retain pending additive Production migration 25.');
    }
  }else{
    if(manifest.production?.authorized!==false||manifest.production?.deployed!==false){
      errors.push('Unpublished 7.3.3 work must not claim Production authorization or deployment.');
    }
    if(evidence.external?.productionMigrations?.authorized!==false||evidence.external?.productionMigrations?.status!=='not-run'){
      errors.push('Unpublished 7.3.3 work must not claim an authorized or completed Production migration.');
    }
  }
  if (evidence.external?.productionDataRemoval?.authorized !== false || evidence.external?.productionDataRemoval?.status !== 'not-run') {
    errors.push('7.3.3 implementation work must not claim an authorized or completed Production removal.');
  }
  const stagingValidated=['staging-validated','validated-production-authorized','production-deployed-pending-owner-acceptance','released'].includes(manifest.status);
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
    || (!productionDeployed && evidence.scopeBoundaries?.productionDataChanged !== false)
    || (productionDeployed && evidence.scopeBoundaries?.productionDataChanged !== true)
    || evidence.scopeBoundaries?.gitMainChanged !== false
    || evidence.scopeBoundaries?.freeAgentInterpretedAsZero !== false
  ) {
    errors.push('7.3.3 implementation must preserve Production, Main, active-snapshot, and blocked-Free-Agent boundaries.');
  }
}
if (version === '7.3.4') {
  for (const check of [
    'sourceScopedRepeatImport',
    'exactSourceIdempotency',
    'weekCoverageCertification',
    'sameSeasonHistoryCarryForward',
    'staleCaptureRejected',
    'activeSnapshotIsolation',
    'freeAgentBlockedPreserved',
    'strictMigration',
    'automatedTests',
    'strictRepositoryGate'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.3.4 repeat-import evidence is incomplete: ${check}.`);
  }
  if (
    manifest.repositoryPublication?.authorized !== false
    || manifest.repositoryPublication?.status !== 'not-run'
    || evidence.external?.githubPublication?.authorized !== false
    || evidence.external?.githubPublication?.status !== 'not-run'
    || evidence.external?.hostedChecks?.authorized !== false
    || evidence.external?.hostedChecks?.status !== 'not-run'
  ) {
    errors.push('7.3.4 local build authorization must not claim repository publication or hosted checks.');
  }
  if (
    manifest.staging?.authorized !== false
    || manifest.staging?.deployed !== false
    || evidence.external?.stagingDeployment?.authorized !== false
    || evidence.external?.stagingDeployment?.status !== 'not-run'
  ) {
    errors.push('7.3.4 follows Production-first policy and must not claim an unrequested staging cycle.');
  }
  if (
    manifest.production?.authorized !== false
    || manifest.production?.deployed !== false
    || evidence.external?.productionDeployment?.authorized !== false
    || evidence.external?.productionDeployment?.status !== 'not-run'
    || evidence.external?.productionCandidateImport?.authorized !== false
    || evidence.external?.productionCandidateImport?.status !== 'not-run'
    || evidence.external?.maddenImportActivation?.authorized !== false
    || evidence.external?.maddenImportActivation?.status !== 'not-run'
  ) {
    errors.push('7.3.4 local work must preserve separate Production, real-import, and activation gates.');
  }
  if (
    evidence.checks?.weekCoverageCertification?.gapVisible !== true
    || evidence.checks?.sameSeasonHistoryCarryForward?.freshExactIdWins !== true
    || evidence.checks?.staleCaptureRejected?.candidateWorkStarted !== false
    || evidence.checks?.activeSnapshotIsolation?.activeSnapshotChanged === true
    || evidence.checks?.freeAgentBlockedPreserved?.status !== 'blocked'
    || evidence.checks?.freeAgentBlockedPreserved?.count !== null
  ) {
    errors.push('7.3.4 must prove source-scoped Week coverage, history precedence, stale-source refusal, snapshot isolation, and blocked-Free-Agent preservation.');
  }
  if (
    evidence.scopeBoundaries?.productionChanged !== false
    || evidence.scopeBoundaries?.productionDataChanged !== false
    || evidence.scopeBoundaries?.stagingChanged !== false
    || evidence.scopeBoundaries?.activeSnapshotChanged !== false
    || evidence.scopeBoundaries?.gitMainChanged !== false
    || evidence.scopeBoundaries?.resetPerformed !== false
    || evidence.scopeBoundaries?.transitionOperationExecuted !== false
    || evidence.scopeBoundaries?.captureExecuted !== false
    || evidence.scopeBoundaries?.candidateImportExecuted !== false
    || evidence.scopeBoundaries?.activationPerformed !== false
    || evidence.scopeBoundaries?.freeAgentInterpretedAsZero !== false
  ) {
    errors.push('7.3.4 implementation must preserve every Production, data, Main, transition, import, activation, and Free Agent boundary.');
  }
}
if (version === '7.3.4.1') {
  const productionDeployed = isPostDeployment;
  for (const check of [
    'permanentLeagueExportUrl',
    'explicitRevocation',
    'automaticCohortAnalysis',
    'latestReadyIsolation',
    'commissionerOneAction',
    'activeSnapshotIsolation',
    'freeAgentBlockedPreserved',
    'strictMigration',
    'automatedTests',
    'strictRepositoryGate'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.3.4.1 permanent-export evidence is incomplete: ${check}.`);
  }
  if (productionDeployed) {
    if (
      manifest.repositoryPublication?.authorized !== true
      || manifest.repositoryPublication?.status !== 'published-hosted-checks-passed-main'
      || evidence.external?.githubPublication?.authorized !== true
      || evidence.external?.githubPublication?.status !== 'published-main'
      || evidence.external?.hostedChecks?.authorized !== true
      || evidence.external?.hostedChecks?.status !== 'passed'
      || Number(evidence.external?.hostedChecks?.passed) < 4
    ) errors.push('Deployed 7.3.4.1 evidence must record Main publication and passed hosted checks.');
  } else if (
    manifest.repositoryPublication?.authorized !== false
    || manifest.repositoryPublication?.status !== 'not-run'
    || evidence.external?.githubPublication?.authorized !== false
    || evidence.external?.githubPublication?.status !== 'not-run'
    || evidence.external?.hostedChecks?.authorized !== false
    || evidence.external?.hostedChecks?.status !== 'not-run'
  ) errors.push('7.3.4.1 local implementation must not claim repository publication or hosted checks.');
  if (
    manifest.staging?.authorized !== false
    || manifest.staging?.deployed !== false
    || evidence.external?.stagingDeployment?.authorized !== false
    || evidence.external?.stagingDeployment?.status !== 'not-run'
  ) {
    errors.push('7.3.4.1 follows Production-first policy and must not claim an unrequested staging cycle.');
  }
  if (productionDeployed) {
    if (
      manifest.production?.authorized !== true
      || manifest.production?.deployed !== true
      || manifest.production?.status !== 'success-pending-owner-acceptance'
      || evidence.external?.productionDeployment?.authorized !== true
      || evidence.external?.productionDeployment?.status !== 'success'
      || evidence.external?.productionMigration?.authorized !== true
      || evidence.external?.productionMigration?.status !== 'applied-verified'
      || Number(evidence.external?.productionMigration?.migration) !== 26
      || Number(evidence.external?.productionMigration?.after?.foreignKeyViolations) !== 0
    ) errors.push('Deployed 7.3.4.1 evidence must record the exact Production deployment and reconciled migration 26.');
  } else if (
    manifest.production?.authorized !== false
    || manifest.production?.deployed !== false
    || evidence.external?.productionDeployment?.authorized !== false
    || evidence.external?.productionDeployment?.status !== 'not-run'
    || evidence.external?.productionMigration?.authorized !== false
    || evidence.external?.productionMigration?.status !== 'not-run'
  ) errors.push('Unpublished 7.3.4.1 work must not claim Production deployment or migration.');
  if (
    evidence.external?.productionMaddenExport?.authorized !== false
    || evidence.external?.productionMaddenExport?.status !== 'not-run'
    || evidence.external?.productionCandidateImport?.authorized !== false
    || evidence.external?.productionCandidateImport?.status !== 'not-run'
    || evidence.external?.maddenImportActivation?.authorized !== false
    || evidence.external?.maddenImportActivation?.status !== 'not-run'
  ) {
    errors.push('7.3.4.1 must preserve separate real-export, candidate-import, and activation gates.');
  }
  if (
    evidence.checks?.permanentLeagueExportUrl?.onePerLeague !== true
    || evidence.checks?.permanentLeagueExportUrl?.rawTokenStored !== false
    || evidence.checks?.explicitRevocation?.previousUrlInvalidated !== true
    || evidence.checks?.automaticCohortAnalysis?.completeAndPartialAnalyzed !== true
    || evidence.checks?.latestReadyIsolation?.partialNewestDisplacesReady !== false
    || evidence.checks?.latestReadyIsolation?.candidateReadsReadyPointerOnly !== true
    || evidence.checks?.commissionerOneAction?.actionLabel !== 'Import Latest Export'
    || evidence.checks?.activeSnapshotIsolation?.activeSnapshotChanged !== false
    || evidence.checks?.freeAgentBlockedPreserved?.status !== 'blocked'
    || evidence.checks?.freeAgentBlockedPreserved?.count !== null
  ) {
    errors.push('7.3.4.1 must prove stable/rotatable credentials, automatic analysis, ready-source isolation, one-action import, snapshot isolation, and blocked Free Agents.');
  }
  if (
    evidence.scopeBoundaries?.productionChanged !== productionDeployed
    || evidence.scopeBoundaries?.productionDataChanged !== false
    || evidence.scopeBoundaries?.stagingChanged !== false
    || evidence.scopeBoundaries?.activeSnapshotChanged !== false
    || evidence.scopeBoundaries?.gitMainChanged !== productionDeployed
    || evidence.scopeBoundaries?.resetPerformed !== false
    || evidence.scopeBoundaries?.transitionOperationExecuted !== false
    || evidence.scopeBoundaries?.archiveOperationExecuted !== false
    || evidence.scopeBoundaries?.captureExecuted !== false
    || evidence.scopeBoundaries?.candidateImportExecuted !== false
    || evidence.scopeBoundaries?.activationPerformed !== false
    || evidence.scopeBoundaries?.freeAgentInterpretedAsZero !== false
  ) {
    errors.push('7.3.4.1 evidence must accurately preserve every Production, data, Main, transition, import, activation, and Free Agent boundary.');
  }
}
if (version === '7.3.4.2') {
  const productionDeployed = isPostDeployment;
  for (const check of [
    'productionIncidentDiagnosis',
    'atomicCohortClaim',
    'exactBurstRecovery',
    'productionPayloadReconstruction',
    'activeSnapshotIsolation',
    'freeAgentBlockedPreserved',
    'strictMigration',
    'automatedTests',
    'strictRepositoryGate'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.3.4.2 cohort-remediation evidence is incomplete: ${check}.`);
  }
  if (
    Number(evidence.checks?.productionIncidentDiagnosis?.firstCompleteBurstRoutes) !== 43
    || Number(evidence.checks?.productionIncidentDiagnosis?.firstCompleteBurstSessionsBeforeRepair) !== 8
    || Number(evidence.checks?.productionIncidentDiagnosis?.teamRosterRoutes) !== 32
    || Number(evidence.checks?.productionIncidentDiagnosis?.rosteredPlayerRows) !== 2043
    || evidence.checks?.atomicCohortClaim?.resultingSessionCount !== 1
    || evidence.checks?.atomicCohortClaim?.compareAndSwapPointer !== true
    || evidence.checks?.exactBurstRecovery?.platformOwnerRequired !== true
    || evidence.checks?.exactBurstRecovery?.typedConfirmationRequired !== true
    || evidence.checks?.exactBurstRecovery?.readyReportRequiredBeforePointerAdvance !== true
    || Number(evidence.checks?.productionPayloadReconstruction?.retainedObjectsRead) !== 43
    || Number(evidence.checks?.productionPayloadReconstruction?.teamCount) !== 32
    || Number(evidence.checks?.productionPayloadReconstruction?.rosteredPlayerRows) !== 2043
    || Number(evidence.checks?.productionPayloadReconstruction?.statisticsRoutes) !== 7
    || Number(evidence.checks?.productionPayloadReconstruction?.statisticsRows) !== 207
    || evidence.checks?.productionPayloadReconstruction?.routeDerivedFranchiseAndWeekMarkers !== true
    || evidence.checks?.productionPayloadReconstruction?.weeklyTeamRouteClassifiedAsStatistics !== true
    || evidence.checks?.productionPayloadReconstruction?.ready !== true
    || evidence.checks?.productionPayloadReconstruction?.freeAgentStatus !== 'blocked'
    || evidence.checks?.productionPayloadReconstruction?.freeAgentCount !== null
  ) errors.push('7.3.4.2 must prove the observed incident, atomic claim, and fail-closed exact recovery.');
  if (productionDeployed) {
    if (
      manifest.repositoryPublication?.authorized !== true
      || manifest.repositoryPublication?.status !== 'published-hosted-checks-passed-main'
      || evidence.external?.githubPublication?.status !== 'published-main'
      || evidence.external?.hostedChecks?.status !== 'passed'
      || Number(evidence.external?.hostedChecks?.passed) < 4
    ) errors.push('Deployed 7.3.4.2 evidence must record Main publication and passed hosted checks.');
    if (
      manifest.production?.authorized !== true
      || manifest.production?.deployed !== true
      || manifest.production?.status !== 'success-pending-owner-acceptance'
      || evidence.external?.productionDeployment?.authorized !== true
      || evidence.external?.productionDeployment?.status !== 'success'
      || evidence.external?.productionCohortRecovery?.authorized !== true
      || evidence.external?.productionCohortRecovery?.status !== 'completed-verified'
      || Number(evidence.external?.productionCohortRecovery?.captureCount) !== 43
      || Number(evidence.external?.productionCohortRecovery?.teamRosterRoutes) !== 32
      || evidence.external?.productionCohortRecovery?.ready !== true
      || evidence.external?.productionCohortRecovery?.freeAgentStatus !== 'blocked'
      || evidence.external?.productionCohortRecovery?.freeAgentCount !== null
      || evidence.external?.productionCohortRecovery?.activeSnapshotChanged !== false
    ) errors.push('Deployed 7.3.4.2 evidence must record the exact Production deployment and verified 43-route recovery.');
  } else {
    if (
      manifest.status !== 'validated-production-authorized'
      || manifest.repositoryPublication?.authorized !== true
      || manifest.repositoryPublication?.status !== 'authorized-not-run'
      || evidence.external?.githubPublication?.authorized !== true
      || evidence.external?.githubPublication?.status !== 'not-run'
      || manifest.production?.authorized !== true
      || manifest.production?.deployed !== false
      || manifest.production?.status !== 'authorized-not-run'
      || evidence.external?.productionDeployment?.authorized !== true
      || evidence.external?.productionDeployment?.status !== 'not-run'
      || evidence.external?.productionCohortRecovery?.authorized !== true
      || evidence.external?.productionCohortRecovery?.status !== 'not-run'
    ) errors.push('Authorized 7.3.4.2 evidence must retain pending publication, deployment, and recovery gates.');
  }
  if (
    manifest.staging?.authorized !== false
    || manifest.staging?.deployed !== false
    || evidence.external?.stagingDeployment?.authorized !== false
    || evidence.external?.stagingDeployment?.status !== 'not-run'
    || evidence.external?.productionMigration?.authorized !== false
    || evidence.external?.productionMigration?.status !== 'not-required'
    || Number(evidence.external?.productionMigration?.currentMigration) !== 26
    || evidence.external?.productionMaddenExport?.authorized !== false
    || evidence.external?.productionMaddenExport?.status !== 'not-run'
    || evidence.external?.productionCandidateImport?.authorized !== false
    || evidence.external?.productionCandidateImport?.status !== 'not-run'
    || evidence.external?.maddenImportActivation?.authorized !== false
    || evidence.external?.maddenImportActivation?.status !== 'not-run'
  ) errors.push('7.3.4.2 must preserve the staging, migration, new-export, candidate-import, and activation boundaries.');
  if (
    evidence.scopeBoundaries?.productionChanged !== productionDeployed
    || evidence.scopeBoundaries?.productionDataChanged !== false
    || evidence.scopeBoundaries?.stagingChanged !== false
    || evidence.scopeBoundaries?.activeSnapshotChanged !== false
    || evidence.scopeBoundaries?.gitMainChanged !== productionDeployed
    || evidence.scopeBoundaries?.resetPerformed !== false
    || evidence.scopeBoundaries?.transitionOperationExecuted !== false
    || evidence.scopeBoundaries?.archiveOperationExecuted !== false
    || evidence.scopeBoundaries?.captureExecuted !== false
    || evidence.scopeBoundaries?.cohortRecoveryExecuted !== productionDeployed
    || evidence.scopeBoundaries?.candidateImportExecuted !== false
    || evidence.scopeBoundaries?.activationPerformed !== false
    || evidence.scopeBoundaries?.exportUrlRotated !== false
    || evidence.scopeBoundaries?.freeAgentInterpretedAsZero !== false
  ) errors.push('7.3.4.2 evidence must preserve every Production remediation boundary.');
}
if (version === '7.3.4.3') {
  const productionDeployed = isPostDeployment;
  for (const check of [
    'productionFailureDiagnosis',
    'exactSessionPropagation',
    'sharedTeamsRouteAuthority',
    'recoveredCohortEndToEnd',
    'weekCoverageWarningPreserved',
    'activeSnapshotIsolation',
    'freeAgentBlockedPreserved',
    'strictMigration',
    'automatedTests',
    'strictRepositoryGate'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.3.4.3 exact-session remediation evidence is incomplete: ${check}.`);
  }
  if (
    evidence.checks?.productionFailureDiagnosis?.selectedReadySessionId !== 'm27_recovered_8bf2666ce3393492ed580dac'
    || Number(evidence.checks?.productionFailureDiagnosis?.selectedReadyRoutes) !== 43
    || Number(evidence.checks?.productionFailureDiagnosis?.originalFragmentedSessions) !== 8
    || evidence.checks?.productionFailureDiagnosis?.candidateBuildReached !== false
    || evidence.checks?.productionFailureDiagnosis?.activationReached !== false
    || evidence.checks?.exactSessionPropagation?.classificationUsesSelectedSession !== true
    || evidence.checks?.exactSessionPropagation?.emptyClassificationRequestRemoved !== true
    || evidence.checks?.sharedTeamsRouteAuthority?.sourceRoute !== 'xbsx/742482/leagueteams'
    || Number(evidence.checks?.sharedTeamsRouteAuthority?.mappedTeams) !== 32
    || evidence.checks?.sharedTeamsRouteAuthority?.legacyInspectionRequired !== false
    || evidence.checks?.sharedTeamsRouteAuthority?.weeklyTeamRouteClassifiedAsStatistics !== true
    || Number(evidence.checks?.recoveredCohortEndToEnd?.recoveredRoutes) !== 43
    || Number(evidence.checks?.recoveredCohortEndToEnd?.classifiedRoutes) !== 43
    || Number(evidence.checks?.recoveredCohortEndToEnd?.classifiedStatisticsRoutes) !== 7
    || Number(evidence.checks?.weekCoverageWarningPreserved?.activeWeek) !== 7
    || Number(evidence.checks?.weekCoverageWarningPreserved?.capturedWeek) !== 9
    || JSON.stringify(evidence.checks?.weekCoverageWarningPreserved?.missingWeeks) !== '[8]'
    || evidence.checks?.weekCoverageWarningPreserved?.silentlyFilled !== false
    || evidence.checks?.freeAgentBlockedPreserved?.status !== 'blocked'
    || evidence.checks?.freeAgentBlockedPreserved?.count !== null
  ) errors.push('7.3.4.3 must prove exact-session propagation, shared 32-team authority, the retained Week 8 warning, and blocked/null Free Agents.');
  if (productionDeployed) {
    if (
      manifest.repositoryPublication?.authorized !== true
      || manifest.repositoryPublication?.status !== 'published-hosted-checks-passed-main'
      || evidence.external?.githubPublication?.status !== 'published-main'
      || evidence.external?.hostedChecks?.status !== 'passed'
      || Number(evidence.external?.hostedChecks?.passed) < 4
      || manifest.production?.authorized !== true
      || manifest.production?.deployed !== true
      || manifest.production?.status !== 'success-pending-owner-acceptance'
      || evidence.external?.productionDeployment?.authorized !== true
      || evidence.external?.productionDeployment?.status !== 'success'
    ) errors.push('Deployed 7.3.4.3 evidence must record exact Main publication, hosted checks, and Production deployment.');
  } else if (
    manifest.status !== 'validated-production-authorized'
    || manifest.repositoryPublication?.authorized !== true
    || manifest.repositoryPublication?.status !== 'authorized-not-run'
    || evidence.external?.githubPublication?.authorized !== true
    || evidence.external?.githubPublication?.status !== 'not-run'
    || manifest.production?.authorized !== true
    || manifest.production?.deployed !== false
    || manifest.production?.status !== 'authorized-not-run'
    || evidence.external?.productionDeployment?.authorized !== true
    || evidence.external?.productionDeployment?.status !== 'not-run'
  ) errors.push('Authorized 7.3.4.3 evidence must retain pending publication and deployment gates.');
  if (
    manifest.staging?.authorized !== false
    || manifest.staging?.deployed !== false
    || evidence.external?.stagingDeployment?.authorized !== false
    || evidence.external?.stagingDeployment?.status !== 'not-run'
    || evidence.external?.productionMigration?.authorized !== false
    || evidence.external?.productionMigration?.status !== 'not-required'
    || Number(evidence.external?.productionMigration?.currentMigration) !== 26
    || evidence.external?.productionMaddenExport?.authorized !== false
    || evidence.external?.productionMaddenExport?.status !== 'not-run'
    || evidence.external?.productionCandidateImportRetry?.authorized !== false
    || evidence.external?.productionCandidateImportRetry?.status !== 'not-run'
    || evidence.external?.maddenImportActivation?.authorized !== false
    || evidence.external?.maddenImportActivation?.status !== 'not-run'
  ) errors.push('7.3.4.3 must preserve the staging, migration, new-export, import-retry, and activation boundaries.');
  if (
    evidence.scopeBoundaries?.productionChanged !== productionDeployed
    || evidence.scopeBoundaries?.productionDataChanged !== false
    || evidence.scopeBoundaries?.stagingChanged !== false
    || evidence.scopeBoundaries?.activeSnapshotChanged !== false
    || evidence.scopeBoundaries?.gitMainChanged !== productionDeployed
    || evidence.scopeBoundaries?.resetPerformed !== false
    || evidence.scopeBoundaries?.transitionOperationExecuted !== false
    || evidence.scopeBoundaries?.archiveOperationExecuted !== false
    || evidence.scopeBoundaries?.captureExecuted !== false
    || evidence.scopeBoundaries?.candidateImportExecuted !== false
    || evidence.scopeBoundaries?.activationPerformed !== false
    || evidence.scopeBoundaries?.exportUrlRotated !== false
    || evidence.scopeBoundaries?.freeAgentInterpretedAsZero !== false
  ) errors.push('7.3.4.3 evidence must preserve every Production remediation boundary.');
}
if (version === '7.3.4.4') {
  const productionDeployed = isPostDeployment;
  for (const check of [
    'oneActionLiveImport',
    'atomicActivation',
    'oneActionArchiveSeason',
    'week9CandidateReadiness',
    'freeAgentBlockedPreserved',
    'strictMigration',
    'automatedTests',
    'strictRepositoryGate'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.3.4.4 one-action workflow evidence is incomplete: ${check}.`);
  }
  if (
    evidence.checks?.oneActionLiveImport?.destinationAutomaticallyCreatedOrReused !== true
    || evidence.checks?.oneActionLiveImport?.validationRequiredBeforeActivation !== true
    || evidence.checks?.oneActionLiveImport?.activationIncludedInImportAction !== true
    || evidence.checks?.oneActionLiveImport?.separateRoutineActivationButton !== false
    || evidence.checks?.atomicActivation?.expectedPriorPointerGuarded !== true
    || evidence.checks?.atomicActivation?.activePointerAndStatusesOneBatch !== true
    || evidence.checks?.atomicActivation?.idempotentFinalize !== true
    || evidence.checks?.atomicActivation?.failurePreservesPriorSnapshot !== true
    || evidence.checks?.oneActionArchiveSeason?.historyBooksFrozen !== true
    || evidence.checks?.oneActionArchiveSeason?.nextFranchiseSeasonPrepared !== true
    || evidence.checks?.oneActionArchiveSeason?.latestExportSelectionCleared !== true
    || evidence.checks?.oneActionArchiveSeason?.newWeekOneExportRequired !== true
    || evidence.checks?.oneActionArchiveSeason?.historyPermanentlyDeleted !== false
    || evidence.checks?.oneActionArchiveSeason?.activeSnapshotChanged !== false
    || evidence.checks?.oneActionArchiveSeason?.exportUrlRotated !== false
  ) errors.push('7.3.4.4 must prove the exact one-action live-import and archive-season contracts.');
  if (
    evidence.checks?.week9CandidateReadiness?.sourceSessionId !== 'm27_recovered_8bf2666ce3393492ed580dac'
    || evidence.checks?.week9CandidateReadiness?.sourceReportId !== 'm27_report_8bf2666c-e339-3492-ed58-0dac09b696c9'
    || Number(evidence.checks?.week9CandidateReadiness?.capturedWeek) !== 9
    || Number(evidence.checks?.week9CandidateReadiness?.routes) !== 43
    || Number(evidence.checks?.week9CandidateReadiness?.teams) !== 32
    || Number(evidence.checks?.week9CandidateReadiness?.rosteredPlayers) !== 2043
    || JSON.stringify(evidence.checks?.week9CandidateReadiness?.missingWeeks) !== '[8]'
    || evidence.checks?.freeAgentBlockedPreserved?.status !== 'blocked'
    || evidence.checks?.freeAgentBlockedPreserved?.count !== null
    || evidence.checks?.freeAgentBlockedPreserved?.interpretedAsZero !== false
  ) errors.push('7.3.4.4 must retain exact Week 9 source evidence, the Week 8 gap, and blocked/null Free Agents.');
  if (productionDeployed) {
    if (
      manifest.repositoryPublication?.authorized !== true
      || manifest.repositoryPublication?.status !== 'published-hosted-checks-passed-main'
      || evidence.external?.githubPublication?.status !== 'published-main'
      || evidence.external?.hostedChecks?.status !== 'passed'
      || Number(evidence.external?.hostedChecks?.passed) < 4
      || manifest.production?.authorized !== true
      || manifest.production?.deployed !== true
      || manifest.production?.status !== 'success-pending-owner-acceptance'
      || evidence.external?.productionDeployment?.status !== 'success'
      || evidence.external?.productionWeek9Activation?.status !== 'completed-verified'
      || evidence.checks?.week9CandidateReadiness?.activationPerformed !== true
      || !evidence.checks?.week9CandidateReadiness?.candidateSnapshotId
      || evidence.checks?.week9CandidateReadiness?.candidateSnapshotId !== evidence.external?.productionWeek9Activation?.activeSnapshot
    ) errors.push('Deployed 7.3.4.4 evidence must record exact Main publication, Production deployment, and verified Week 9 activation.');
  } else if (
    manifest.status !== 'validated-production-authorized'
    || manifest.repositoryPublication?.authorized !== true
    || manifest.repositoryPublication?.status !== 'authorized-not-run'
    || evidence.external?.githubPublication?.status !== 'not-run'
    || evidence.external?.hostedChecks?.status !== 'not-run'
    || manifest.production?.authorized !== true
    || manifest.production?.deployed !== false
    || manifest.production?.status !== 'authorized-not-run'
    || evidence.external?.productionDeployment?.status !== 'not-run'
    || evidence.external?.productionWeek9Activation?.authorized !== true
    || evidence.external?.productionWeek9Activation?.status !== 'not-run'
    || evidence.checks?.week9CandidateReadiness?.activationPerformed !== false
  ) errors.push('Authorized 7.3.4.4 evidence must retain pending publication, deployment, and Week 9 activation gates.');
  if (
    manifest.staging?.authorized !== false
    || manifest.staging?.deployed !== false
    || evidence.external?.stagingDeployment?.status !== 'not-run'
    || evidence.external?.productionMigration?.authorized !== false
    || evidence.external?.productionMigration?.status !== 'not-required'
    || Number(evidence.external?.productionMigration?.currentMigration) !== 26
    || evidence.external?.productionMaddenExport?.authorized !== false
    || evidence.external?.productionMaddenExport?.status !== 'not-run'
    || evidence.external?.archiveSeason?.authorized !== false
    || evidence.external?.archiveSeason?.status !== 'not-run'
    || evidence.external?.gameYearTransition?.authorized !== false
    || evidence.external?.gameYearTransition?.status !== 'not-run'
  ) errors.push('7.3.4.4 must preserve staging, migration, new-export, archive-season, and game-year transition boundaries.');
  if (
    evidence.scopeBoundaries?.productionChanged !== productionDeployed
    || evidence.scopeBoundaries?.productionDataChanged !== productionDeployed
    || evidence.scopeBoundaries?.stagingChanged !== false
    || evidence.scopeBoundaries?.activeSnapshotChanged !== productionDeployed
    || evidence.scopeBoundaries?.gitMainChanged !== productionDeployed
    || evidence.scopeBoundaries?.resetPerformed !== false
    || evidence.scopeBoundaries?.transitionOperationExecuted !== false
    || evidence.scopeBoundaries?.archiveSeasonExecuted !== false
    || evidence.scopeBoundaries?.archiveGameYearExecuted !== false
    || evidence.scopeBoundaries?.captureExecuted !== false
    || evidence.scopeBoundaries?.candidateImportExecuted !== productionDeployed
    || evidence.scopeBoundaries?.activationPerformed !== productionDeployed
    || evidence.scopeBoundaries?.historyPermanentlyDeleted !== false
    || evidence.scopeBoundaries?.exportUrlRotated !== false
    || evidence.scopeBoundaries?.freeAgentInterpretedAsZero !== false
  ) errors.push('7.3.4.4 evidence must preserve every authorized Production boundary.');
}
if (version === '7.3.4.5') {
  const productionDeployed = isPostDeployment;
  for (const check of [
    'historicalBackfill',
    'liveApplicationRefresh',
    'activeSnapshotBaseline',
    'freeAgentBlockedPreserved',
    'strictMigration',
    'automatedTests',
    'strictRepositoryGate'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.3.4.5 remediation evidence is incomplete: ${check}.`);
  }
  if (
    evidence.checks?.historicalBackfill?.olderSourceClassifiedAsBackfill !== true
    || evidence.checks?.historicalBackfill?.exactGameYearRequired !== true
    || evidence.checks?.historicalBackfill?.exactFranchiseSeasonRequired !== true
    || evidence.checks?.historicalBackfill?.scheduleAndStatisticsCoverageRequired !== true
    || evidence.checks?.historicalBackfill?.activeTeamsPreserved !== true
    || evidence.checks?.historicalBackfill?.activePlayersAndRostersPreserved !== true
    || evidence.checks?.historicalBackfill?.activeStandingsPreserved !== true
    || evidence.checks?.historicalBackfill?.liveWeekPreserved !== true
    || evidence.checks?.historicalBackfill?.onlyCapturedEarlierWeekOverlaid !== true
    || evidence.checks?.historicalBackfill?.partialOrIncompatibleSourceStopped !== true
    || evidence.checks?.liveApplicationRefresh?.liveReadModelInvalidated !== true
    || evidence.checks?.liveApplicationRefresh?.applicationCompletionEventEmitted !== true
    || evidence.checks?.liveApplicationRefresh?.currentRouteRerendered !== true
    || evidence.checks?.liveApplicationRefresh?.browserReloadRequired !== false
    || evidence.checks?.liveApplicationRefresh?.locationReloadUsed !== false
  ) errors.push('7.3.4.5 must prove safe historical overlay and in-place live refresh contracts.');
  if (
    evidence.checks?.activeSnapshotBaseline?.snapshotId !== '518236e4-1cac-41f5-b8c8-757b7150dcd8'
    || evidence.checks?.activeSnapshotBaseline?.previousSnapshotId !== '8b47ec76-7369-495e-913f-edc0310b49e1'
    || Number(evidence.checks?.activeSnapshotBaseline?.week) !== 9
    || Number(evidence.checks?.activeSnapshotBaseline?.teams) !== 32
    || Number(evidence.checks?.activeSnapshotBaseline?.rosteredPlayers) !== 2042
    || Number(evidence.checks?.activeSnapshotBaseline?.games) !== 29
    || Number(evidence.checks?.activeSnapshotBaseline?.statistics) !== 910
    || Number(evidence.checks?.activeSnapshotBaseline?.standings) !== 32
    || evidence.checks?.activeSnapshotBaseline?.validationStatus !== 'ready'
    || Number(evidence.checks?.activeSnapshotBaseline?.validationErrors) !== 0
    || evidence.checks?.activeSnapshotBaseline?.activationRuntimeRelease !== '7.3.4.4'
    || evidence.checks?.activeSnapshotBaseline?.activationPredatesCandidateCommit !== true
    || evidence.checks?.activeSnapshotBaseline?.changedByDeployment !== false
    || evidence.checks?.freeAgentBlockedPreserved?.status !== 'blocked'
    || evidence.checks?.freeAgentBlockedPreserved?.count !== null
    || evidence.checks?.freeAgentBlockedPreserved?.interpretedAsZero !== false
  ) errors.push('7.3.4.5 must retain the exact active Week 9 baseline and blocked/null Free Agent state.');
  if (productionDeployed) {
    if (
      manifest.repositoryPublication?.status !== 'published-hosted-checks-passed-main'
      || evidence.external?.githubPublication?.status !== 'published-main'
      || evidence.external?.hostedChecks?.status !== 'passed'
      || Number(evidence.external?.hostedChecks?.passed) < 4
      || manifest.production?.authorized !== true
      || manifest.production?.deployed !== true
      || manifest.production?.status !== 'success-pending-owner-acceptance'
      || evidence.external?.productionDeployment?.status !== 'success'
    ) errors.push('Deployed 7.3.4.5 evidence must record exact Main publication, hosted checks, and Production deployment.');
  } else if (
    manifest.status !== 'validated-production-authorized'
    || manifest.repositoryPublication?.authorized !== true
    || manifest.repositoryPublication?.status !== 'authorized-not-run'
    || evidence.external?.githubPublication?.status !== 'not-run'
    || evidence.external?.hostedChecks?.status !== 'not-run'
    || manifest.production?.authorized !== true
    || manifest.production?.deployed !== false
    || manifest.production?.status !== 'authorized-not-run'
    || evidence.external?.productionDeployment?.status !== 'not-run'
  ) errors.push('Authorized 7.3.4.5 evidence must retain pending publication and deployment gates.');
  if (
    manifest.staging?.authorized !== false
    || manifest.staging?.deployed !== false
    || evidence.external?.stagingDeployment?.status !== 'not-run'
    || evidence.external?.productionMigration?.authorized !== false
    || evidence.external?.productionMigration?.status !== 'not-required'
    || Number(evidence.external?.productionMigration?.currentMigration) !== 26
    || evidence.external?.productionMaddenExport?.status !== 'not-run'
    || evidence.external?.productionCandidateImport?.status !== 'not-run'
    || evidence.external?.archiveSeason?.status !== 'not-run'
    || evidence.external?.gameYearTransition?.status !== 'not-run'
  ) errors.push('7.3.4.5 must preserve staging, migration, export, import, archive-season, and transition boundaries.');
  if (
    evidence.scopeBoundaries?.productionChanged !== productionDeployed
    || evidence.scopeBoundaries?.productionDataChanged !== false
    || evidence.scopeBoundaries?.stagingChanged !== false
    || evidence.scopeBoundaries?.activeSnapshotChanged !== false
    || evidence.scopeBoundaries?.gitMainChanged !== productionDeployed
    || evidence.scopeBoundaries?.resetPerformed !== false
    || evidence.scopeBoundaries?.transitionOperationExecuted !== false
    || evidence.scopeBoundaries?.archiveSeasonExecuted !== false
    || evidence.scopeBoundaries?.archiveGameYearExecuted !== false
    || evidence.scopeBoundaries?.captureExecuted !== false
    || evidence.scopeBoundaries?.candidateImportExecuted !== false
    || evidence.scopeBoundaries?.activationPerformed !== false
    || evidence.scopeBoundaries?.historyPermanentlyDeleted !== false
    || evidence.scopeBoundaries?.exportUrlRotated !== false
    || evidence.scopeBoundaries?.freeAgentInterpretedAsZero !== false
  ) errors.push('7.3.4.5 evidence must preserve every authorized Production remediation boundary.');
}
if (version === '7.3.4.6') {
  const productionDeployed = isPostDeployment;
  for (const check of [
    'routeAuthority',
    'retainedMultiPeriodImport',
    'historicalBackfillSafety',
    'activeSnapshotBaseline',
    'freeAgentBlockedPreserved',
    'strictMigration',
    'automatedTests',
    'strictRepositoryGate'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.3.4.6 remediation evidence is incomplete: ${check}.`);
  }
  if (
    evidence.checks?.routeAuthority?.scheduleRouteStageAuthoritative !== true
    || evidence.checks?.routeAuthority?.scheduleRouteWeekAuthoritative !== true
    || evidence.checks?.routeAuthority?.zeroBasedPayloadWeekCorrected !== true
    || evidence.checks?.routeAuthority?.statisticsRouteAuthorityPreserved !== true
    || evidence.checks?.retainedMultiPeriodImport?.preseasonAndRegularSeasonDistinct !== true
    || evidence.checks?.retainedMultiPeriodImport?.allCompleteRetainedPeriodsComposed !== true
    || evidence.checks?.retainedMultiPeriodImport?.latestCapturePerExactRoutePinned !== true
    || evidence.checks?.retainedMultiPeriodImport?.partialPeriodsExcluded !== true
    || evidence.checks?.retainedMultiPeriodImport?.anotherExportRequired !== false
    || Number(evidence.checks?.retainedMultiPeriodImport?.expectedPeriodCount) !== 11
    || JSON.stringify(evidence.checks?.retainedMultiPeriodImport?.expectedPreseasonWeeks) !== '[1,2,3]'
    || JSON.stringify(evidence.checks?.retainedMultiPeriodImport?.expectedRegularSeasonWeeks) !== '[1,2,3,4,5,6,7,8]'
    || evidence.checks?.historicalBackfillSafety?.activeTeamsPreserved !== true
    || evidence.checks?.historicalBackfillSafety?.activePlayersAndRostersPreserved !== true
    || evidence.checks?.historicalBackfillSafety?.activeStandingsPreserved !== true
    || evidence.checks?.historicalBackfillSafety?.liveWeekPreserved !== true
    || evidence.checks?.historicalBackfillSafety?.eachRetainedPeriodRequiresGamesAndStatistics !== true
    || evidence.checks?.historicalBackfillSafety?.atomicExpectedPointerActivation !== true
  ) errors.push('7.3.4.6 must prove route-authoritative, stage-aware, complete retained-period composition and atomic live-state preservation.');
  if (
    evidence.checks?.activeSnapshotBaseline?.snapshotId !== '518236e4-1cac-41f5-b8c8-757b7150dcd8'
    || evidence.checks?.activeSnapshotBaseline?.previousSnapshotId !== '8b47ec76-7369-495e-913f-edc0310b49e1'
    || Number(evidence.checks?.activeSnapshotBaseline?.week) !== 9
    || Number(evidence.checks?.activeSnapshotBaseline?.teams) !== 32
    || Number(evidence.checks?.activeSnapshotBaseline?.rosteredPlayers) !== 2042
    || Number(evidence.checks?.activeSnapshotBaseline?.games) !== 29
    || Number(evidence.checks?.activeSnapshotBaseline?.statistics) !== 910
    || Number(evidence.checks?.activeSnapshotBaseline?.standings) !== 32
    || evidence.checks?.activeSnapshotBaseline?.validationStatus !== 'ready'
    || Number(evidence.checks?.activeSnapshotBaseline?.validationErrors) !== 0
    || evidence.checks?.freeAgentBlockedPreserved?.status !== 'blocked'
    || evidence.checks?.freeAgentBlockedPreserved?.count !== null
    || evidence.checks?.freeAgentBlockedPreserved?.interpretedAsZero !== false
  ) errors.push('7.3.4.6 must retain the exact pre-remediation Week 9 baseline and blocked/null Free Agent evidence.');
  if (productionDeployed) {
    if (
      manifest.status !== 'released'
      || manifest.repositoryPublication?.status !== 'published-hosted-checks-passed-main'
      || evidence.external?.githubPublication?.status !== 'published-main'
      || evidence.external?.hostedChecks?.status !== 'passed'
      || Number(evidence.external?.hostedChecks?.candidatePassed) < 4
      || manifest.production?.authorized !== true
      || manifest.production?.deployed !== true
      || manifest.production?.status !== 'success-owner-accepted'
      || evidence.external?.productionDeployment?.status !== 'success'
      || evidence.external?.productionCandidateImport?.status !== 'activated'
      || Number(evidence.external?.productionCandidateImport?.retryCount) !== 1
      || Number(evidence.external?.productionCandidateImport?.maximumRetryCount) !== 1
      || evidence.scopeBoundaries?.candidateImportExecuted !== true
      || evidence.scopeBoundaries?.activationPerformed !== true
      || evidence.scopeBoundaries?.activeSnapshotChanged !== true
    ) errors.push('Released 7.3.4.6 evidence must record exact publication, deployment, one retained-source retry, and atomic activation.');
  } else if (
    manifest.status !== 'validated-production-authorized'
    || manifest.repositoryPublication?.authorized !== true
    || manifest.repositoryPublication?.status !== 'authorized-not-run'
    || evidence.external?.githubPublication?.status !== 'not-run'
    || evidence.external?.hostedChecks?.status !== 'not-run'
    || manifest.production?.authorized !== true
    || manifest.production?.deployed !== false
    || manifest.production?.status !== 'authorized-not-run'
    || evidence.external?.productionDeployment?.status !== 'not-run'
    || evidence.external?.productionCandidateImport?.status !== 'authorized-not-run'
    || Number(evidence.external?.productionCandidateImport?.retryCount) !== 0
  ) errors.push('Authorized 7.3.4.6 evidence must retain pending publication, deployment, and exact-once retry gates.');
  if (
    manifest.staging?.authorized !== false
    || manifest.staging?.deployed !== false
    || evidence.external?.stagingDeployment?.status !== 'not-run'
    || evidence.external?.productionMigration?.authorized !== false
    || evidence.external?.productionMigration?.status !== 'not-required'
    || Number(evidence.external?.productionMigration?.currentMigration) !== 26
    || evidence.external?.productionMaddenExport?.authorized !== false
    || evidence.external?.productionMaddenExport?.status !== 'not-run'
    || evidence.external?.productionMaddenExport?.anotherExportRequired !== false
    || evidence.external?.archiveSeason?.status !== 'not-run'
    || evidence.external?.gameYearTransition?.status !== 'not-run'
  ) errors.push('7.3.4.6 must preserve staging, migration, new-export, archive-season, and transition boundaries.');
  if (
    evidence.scopeBoundaries?.productionChanged !== productionDeployed
    || evidence.scopeBoundaries?.productionDataChanged !== productionDeployed
    || evidence.scopeBoundaries?.stagingChanged !== false
    || evidence.scopeBoundaries?.gitMainChanged !== productionDeployed
    || evidence.scopeBoundaries?.resetPerformed !== false
    || evidence.scopeBoundaries?.transitionOperationExecuted !== false
    || evidence.scopeBoundaries?.archiveSeasonExecuted !== false
    || evidence.scopeBoundaries?.archiveGameYearExecuted !== false
    || evidence.scopeBoundaries?.captureExecuted !== false
    || evidence.scopeBoundaries?.historyPermanentlyDeleted !== false
    || evidence.scopeBoundaries?.exportUrlRotated !== false
    || evidence.scopeBoundaries?.freeAgentInterpretedAsZero !== false
  ) errors.push('7.3.4.6 evidence must preserve every authorized Production remediation boundary.');
}
if (version === '7.3.4.7') {
  const productionDeployed = isPostDeployment;
  for (const check of [
    'weekLabelNormalization',
    'routeProvenance',
    'activeSnapshotBaseline',
    'freeAgentBlockedPreserved',
    'strictMigration',
    'automatedTests',
    'strictRepositoryGate'
  ]) {
    if (evidence.checks?.[check]?.passed !== true) errors.push(`7.3.4.7 remediation evidence is incomplete: ${check}.`);
  }
  if (
    evidence.checks?.weekLabelNormalization?.canonicalOneBasedWeekPreferred !== true
    || evidence.checks?.weekLabelNormalization?.doubleIncrementRemoved !== true
    || evidence.checks?.weekLabelNormalization?.legacyZeroBasedFallbackPreserved !== true
    || JSON.stringify(evidence.checks?.weekLabelNormalization?.preseasonWeeksDisplay) !== '[1,2,3]'
    || JSON.stringify(evidence.checks?.weekLabelNormalization?.regularSeasonWeeksDisplay) !== '[1,2,3,4,5,6,7,8,9]'
    || evidence.checks?.routeProvenance?.authoritativeRoutePreferred !== true
    || evidence.checks?.routeProvenance?.approvedRouteRetainedInReadModel !== true
    || evidence.checks?.routeProvenance?.rawSourceRecordReturned !== false
    || evidence.checks?.routeProvenance?.privateSourceFieldsReturned !== false
  ) errors.push('7.3.4.7 must prove canonical one-based display, route precedence, legacy fallback, and contained route provenance.');
  if (
    evidence.checks?.activeSnapshotBaseline?.snapshotId !== 'b00edb25-ac65-40d4-9969-431f94dd1e3e'
    || evidence.checks?.activeSnapshotBaseline?.previousSnapshotId !== '518236e4-1cac-41f5-b8c8-757b7150dcd8'
    || Number(evidence.checks?.activeSnapshotBaseline?.week) !== 9
    || Number(evidence.checks?.activeSnapshotBaseline?.teams) !== 32
    || Number(evidence.checks?.activeSnapshotBaseline?.rosteredPlayers) !== 2042
    || Number(evidence.checks?.activeSnapshotBaseline?.games) !== 184
    || Number(evidence.checks?.activeSnapshotBaseline?.statistics) !== 6966
    || Number(evidence.checks?.activeSnapshotBaseline?.standings) !== 32
    || evidence.checks?.activeSnapshotBaseline?.validationStatus !== 'ready'
    || Number(evidence.checks?.activeSnapshotBaseline?.validationErrors) !== 0
    || JSON.stringify(evidence.checks?.activeSnapshotBaseline?.preseasonWeeks) !== '[1,2,3]'
    || JSON.stringify(evidence.checks?.activeSnapshotBaseline?.regularSeasonWeeks) !== '[1,2,3,4,5,6,7,8,9]'
    || evidence.checks?.freeAgentBlockedPreserved?.status !== 'blocked'
    || evidence.checks?.freeAgentBlockedPreserved?.count !== null
    || evidence.checks?.freeAgentBlockedPreserved?.interpretedAsZero !== false
  ) errors.push('7.3.4.7 must retain the exact Week 9 snapshot baseline and blocked/null Free Agent evidence.');
  if (productionDeployed) {
    if (
      manifest.status !== 'released'
      || manifest.repositoryPublication?.status !== 'published-hosted-checks-passed-main'
      || evidence.external?.githubPublication?.status !== 'published-main'
      || evidence.external?.hostedChecks?.status !== 'passed'
      || Number(evidence.external?.hostedChecks?.candidatePassed) < 4
      || manifest.production?.authorized !== true
      || manifest.production?.deployed !== true
      || manifest.production?.status !== 'success-owner-authorized'
      || evidence.external?.productionDeployment?.status !== 'success'
  ) errors.push('Released 7.3.4.7 evidence must record exact publication, hosted checks, and the owner-authorized Production deployment.');
  } else if (
    manifest.status !== 'validated-production-authorized'
    || manifest.repositoryPublication?.authorized !== true
    || manifest.repositoryPublication?.status !== 'authorized-not-run'
    || evidence.external?.githubPublication?.status !== 'not-run'
    || evidence.external?.hostedChecks?.status !== 'not-run'
    || manifest.production?.authorized !== true
    || manifest.production?.deployed !== false
    || manifest.production?.status !== 'authorized-not-run'
    || evidence.external?.productionDeployment?.status !== 'not-run'
  ) errors.push('Authorized 7.3.4.7 evidence must retain pending publication and deployment gates.');
  if (
    manifest.staging?.authorized !== false
    || manifest.staging?.deployed !== false
    || evidence.external?.stagingDeployment?.status !== 'not-run'
    || evidence.external?.productionMigration?.authorized !== false
    || evidence.external?.productionMigration?.status !== 'not-required'
    || Number(evidence.external?.productionMigration?.currentMigration) !== 26
    || evidence.external?.productionMaddenExport?.authorized !== false
    || evidence.external?.productionMaddenExport?.status !== 'not-run'
    || evidence.external?.productionMaddenExport?.anotherExportRequired !== false
    || evidence.external?.productionCandidateImport?.authorized !== false
    || evidence.external?.productionCandidateImport?.status !== 'not-run'
    || evidence.external?.archiveSeason?.status !== 'not-run'
    || evidence.external?.gameYearTransition?.status !== 'not-run'
  ) errors.push('7.3.4.7 must preserve staging, migration, export/import, archive-season, and transition boundaries.');
  if (
    evidence.scopeBoundaries?.productionChanged !== productionDeployed
    || evidence.scopeBoundaries?.productionDataChanged !== false
    || evidence.scopeBoundaries?.stagingChanged !== false
    || evidence.scopeBoundaries?.activeSnapshotChanged !== false
    || evidence.scopeBoundaries?.gitMainChanged !== productionDeployed
    || evidence.scopeBoundaries?.resetPerformed !== false
    || evidence.scopeBoundaries?.transitionOperationExecuted !== false
    || evidence.scopeBoundaries?.archiveSeasonExecuted !== false
    || evidence.scopeBoundaries?.archiveGameYearExecuted !== false
    || evidence.scopeBoundaries?.captureExecuted !== false
    || evidence.scopeBoundaries?.candidateImportExecuted !== false
    || evidence.scopeBoundaries?.activationPerformed !== false
    || evidence.scopeBoundaries?.historyPermanentlyDeleted !== false
    || evidence.scopeBoundaries?.exportUrlRotated !== false
    || evidence.scopeBoundaries?.freeAgentInterpretedAsZero !== false
  ) errors.push('7.3.4.7 evidence must preserve every authorized Production display-remediation boundary.');
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
