# FranchiseHQ 8.2.0

## Scope

Commissioner reliability and recovery before billing. Background import and scheduling retries reuse deterministic workflow instances after interrupted responses or concurrent requests. Discord scheduling failure is reported separately from a successfully published import. League Controls exposes Retry Schedule Sync with progress and permission guidance. Import and Discord controls reject stale cross-league responses. Coaching controls distinguish history scanning, image checks and report delivery.

## Added during delivery

Provider-neutral FHQ sign-in guidance and a separate commissioner-role error. Background calls reject redirects instead of forwarding delegated credentials. The support document includes non-destructive recovery steps. Billing implementation is deferred at the owner's request.

## Known inherited blockers

No registered strict-gate exemptions. Actual account-email inbox confirmation and authenticated production onboarding acceptance remain outstanding from 8.1. Live EA/Discord behavior requires ordinary-use verification; no live league mutation is part of this release's tests. Broader operating acceptance is tracked in docs/8.2-reliability-review.md.

## Validation evidence

Nine focused recovery tests pass. Five Worker cases fail against 8.1.0 and pass with the repair. The real finalize handler retains atomic, idempotent publication when the scheduling service throws. Existing scheduling and coaching tests pass. Actual control rendering and action functions pass isolated desktop/phone acceptance at 1440px and 390px with one retry request per double click, queue visibility, no overflow and no JavaScript errors. The strict gate passed 478 tests and all lint, syntax, environment, asset, secret, migration, inventory and release checks. Isolated real-handler account/onboarding browser flows also passed at both widths. Hosted checks follow publication.

## Deployment status

Candidate work only. Production deployment pending the required quality gates. No migration, billing setup, credential changes, live imports, Discord posts or thread deletions have been performed.

## Rollback

Restore Pages to main/tag v8.1.0 ae8809ab730f7345eb8c758a0bc613ed2e6bcd10. Restore the Import Worker to version 239d366e-f0e0-46e8-97a3-bf371a55c793 if necessary, retaining all workflow bindings and private URL settings. Before deploying or rolling back Worker code, inspect active jobs and avoid interrupting in-flight imports. Migration 51 remains unchanged. Do not delete retained exports, snapshots, workflow instances or audit records to roll back this code release.
