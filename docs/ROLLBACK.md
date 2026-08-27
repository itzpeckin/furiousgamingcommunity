# FranchiseHQ Rollback and Recovery

## 7.1.0 candidate impact

The local 7.1.0 candidate adds canonical migration files, tests, runtime schema-version guards, and operations documentation. It has not run a cloud migration, deployed staging or production, changed authentication, deleted data, edited memberships, or rotated credentials.

The current production rollback target is:

- Version: 7.0.5
- Commit: `f3c7366048223c8baa188e5dbd98d4d0fb51c9e3`
- Git tree: `c5ca091d89fc2b83ca4a8af8796586bfa48b663e`
- Existing immutable recovery tag: `v7.0.0`

## Code rollback

1. Stop the release if the candidate commit, manifest, or deployment identity does not match the accepted record.
2. Prefer a normal rollback pull request created from the accepted baseline tag; do not force-push `main`.
3. If a Cloudflare deployment is already unhealthy, restore the last known-good deployment using Cloudflare's deployment rollback control while the Git rollback is reviewed.
4. Run the production smoke checks and record the restored deployment identity.

## Database recovery

The exact 7.1 migration and recovery procedure is `docs/DATABASE-OPERATIONS.md`. A future cloud execution record must include:

- Pre-change backup identifier and verification.
- Staging restore rehearsal evidence.
- Forward-fix or restore decision criteria.
- Record-count and relationship reconciliation.
- The exact point after which rollback is unsafe.

Never replay `migrations/legacy/`. Apply only the active immutable migration sequence and only after separate authorization. The normal application rollback retains additive 7.1 tables. Do not improvise a rollback by dropping tables; a database restore uses the recorded D1 Time Travel bookmark and its own authorization.

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
