# FranchiseHQ 7.7.2

## Scope

Restore the original 7.7 multi-league milestone as an owner-only onboarding foundation. A Platform Owner can preview and save a league plan, resume an interrupted preparation, inspect readiness, and cancel the plan. Preparation creates only a disabled, non-public tenant shell; 7.7.2 contains no activation operation.

## Added during delivery

- Additive migration 46 retains normalized onboarding plans and append-only plan events.
- The private Platform Workspace captures league name and slug, Madden game year, timezone, branding, initial commissioner, desired features, tenant limits, optional custom domain, optional Discord request, and the Madden Companion source contract.
- Preparation reserves the permanent export identity and empty rules/settings records while leaving all runtime features disabled.
- Guarded revisions, integrity hashes, idempotent inserts, and durable `preparing` checkpoints make the workflow safe to repeat or resume.
- Readiness proves that the shell is disabled and contains no membership, snapshot, import, Discord installation, or schedule thread.
- Cancellation retains the audit and disabled shell as contained evidence. It deletes no data and grants no authority.

## Known inherited blockers

None are registered in the repository quality baseline. Madden Free Agents remain unknown when their source is blocked or absent; onboarding does not reinterpret that state.

## Validation evidence

Fresh-schema, legacy-upgrade, source-validation, identity-conflict, full owner API, idempotent replay, disabled-route denial, two-tenant preservation, readiness, and cancellation tests cover the new authority. The full repository and strict release gate must pass before publication.

The Production release is limited to additive migration 46 and code publication. It does not create an onboarding plan or another real league, activate a tenant, assign a commissioner membership, import Madden data, move a snapshot, retry Discord, rotate an export URL, change a season, reset/delete data, change credentials, or reinterpret Free Agents.

## Deployment status

The exact local candidate from Main `da9c1e9feddb1d25f17b7eaab19ffc00e314dd14` passes all 281 repository and strict-gate tests. Publication, migration 46, Main merge, Production deployment, and read-only acceptance will be recorded after completion.

## Rollback

Redeploy the accepted 7.7.1 runtime. Migration 46 is additive and may remain in place unused; do not delete onboarding evidence or restore D1. Because no onboarding plan or second league is created during deployment, FGC and every retained snapshot, import, export, Discord record, audit, season record, and membership remain unchanged.
