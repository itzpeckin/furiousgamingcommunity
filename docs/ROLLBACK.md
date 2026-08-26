# FranchiseHQ Rollback and Recovery

## 7.0.0 impact

Version 7.0.0 adds repository controls, checks, environment contracts, inventories, and documentation. It does not change application behavior, run a database migration, deploy staging, deploy production, delete data, or rotate credentials.

The pre-7.0 source baseline is:

- Commit: `4d0a4e979f98a99a8faea7c53fdd7366edc975f9`
- Local preservation tag: `v6.3.2-baseline`
- Git tree: `e92b84054af2c9b58c7859b176bd2c7709f97917`

## Code rollback

1. Stop the release if the candidate commit, manifest, or deployment identity does not match the accepted record.
2. Prefer a normal rollback pull request created from the accepted baseline tag; do not force-push `main`.
3. If a Cloudflare deployment is already unhealthy, restore the last known-good deployment using Cloudflare's deployment rollback control while the Git rollback is reviewed.
4. Run the production smoke checks and record the restored deployment identity.

## Database recovery

7.0.0 has no database change. Future releases that change data must add:

- Pre-change backup identifier and verification.
- Staging restore rehearsal evidence.
- Forward-fix or restore decision criteria.
- Record-count and relationship reconciliation.
- The exact point after which rollback is unsafe.

Do not apply the current 6.3.x migrations to a new or production database as a release step; the registered migration blockers are assigned to 7.1.0.

## Object storage and cache recovery

- Source import artifacts are evidence and are not deleted as part of code rollback.
- Cache pointers may be restored only to a verified active snapshot.
- A reset/import release must list every R2/KV key family it will modify and preserve its recovery reference.

## Stop conditions

Stop or roll back when any of the following occurs:

- Authentication or authorization boundaries fail.
- Staging or production points at the wrong environment resource.
- Migration/data reconciliation differs from the accepted report.
- The active snapshot becomes incomplete or unavailable.
- Critical user flows fail after deployment.
- Monitoring cannot determine whether the release is healthy.
