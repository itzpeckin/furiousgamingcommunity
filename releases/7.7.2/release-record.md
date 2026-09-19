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

The Production release was limited to additive migration 46 and code publication. It did not create an onboarding plan or another real league, activate a tenant, assign a commissioner membership, import Madden data, move a snapshot, retry Discord, rotate an export URL, change a season, reset/delete data, change credentials, or reinterpret Free Agents.

## Deployment status

Production is deployed from Main `c953eab187d91a86efa17cba911b89916fb11754` through PRs [#132](https://github.com/itzpeckin/furiousgamingcommunity/pull/132), [#133](https://github.com/itzpeckin/furiousgamingcommunity/pull/133), [#134](https://github.com/itzpeckin/furiousgamingcommunity/pull/134), and [#135](https://github.com/itzpeckin/furiousgamingcommunity/pull/135). Pull-request quality run `35419226733`, Main quality run `35419284746`, and Pages deployment run `35419284107` passed. The complete strict gate passes all 281 tests with a current 653-file / 80-route inventory.

Additive migration 46 is applied in Production after Time Travel bookmark `0000035e-00000b0a-000050eb-47c3c2ebb7135944514dbe35b7f77797`. Post-deployment read-only verification reports schema 46, zero foreign-key violations, zero onboarding plans, zero onboarding events, and the same one enabled/public FGC tenant. Protected counts remain 34 users, 34 memberships, 31 active team assignments, and one active-snapshot pointer. FGC still points to active snapshot `a21862ef-fc18-40d2-887a-14349f1cfa32` and previous snapshot `5cee59c2-1610-4e70-8a65-2707a40da95a`.

Signed-in Production acceptance confirms release 7.7.2 renders the owner-only Platform Workspace and its League Onboarding panel, shows an empty zero-plan queue, and exposes no activation control. The final route/cache corrections were code-only and changed no database or league data.

## Rollback

Redeploy the accepted 7.7.1 runtime. Migration 46 is additive and may remain in place unused; do not delete onboarding evidence or restore D1. Because no onboarding plan or second league is created during deployment, FGC and every retained snapshot, import, export, Discord record, audit, season record, and membership remain unchanged.
