# FranchiseHQ 7.6.0-rc.1

## Scope

Build the private FGC release candidate from exact Production Main, freeze feature scope, close the Discord delivery observability blocker, define representative role acceptance, rehearse exact deployment and rollback, and publish privacy, terms, retention, incident, and help material.

## Added during delivery

- Additive migration 45 retains sanitized, tenant-scoped results for each Discord trade-message destination and attempt.
- Commissioner Operations keeps unresolved failures visible regardless of age and shows safe destination evidence without raw Discord IDs.
- **Retry Failed Copies** is commissioner-only, applies only to exhausted trade-message synchronization, creates a new audited intent, and targets the retained failed destinations without deleting the old failure. A pre-migration aggregate failure has no destination evidence, so its first safe retry reconciles the retained message inventory and records exact destination results for any later retry.
- A successful retry edits retained messages using current workflow authority and preserves the old attempts, aggregate error, destination diagnostics, and resolution link.
- Public privacy, terms, retention, and incident/help pages plus an exact commissioner/committee/owner acceptance matrix and deployment/rollback rehearsal.

## Known inherited blockers

None are registered in the repository quality baseline. The two retained Production Discord failures are not changed or retried by the release deployment. After migration 45, their pre-migration aggregate errors remain visible and a commissioner can explicitly request a safe retry; that first retry records destination-level evidence.

## Validation evidence

Focused migration, Commissioner HQ, and Discord coverage passes 64/64 tests. The complete repository and strict release gate passes 269/269 tests, 279 JavaScript modules, 124 required tables, the environment/secret/asset checks, and the release contract. Production acceptance will verify the exact deployed release, migration, protected state, active snapshot, policy pages, and Operations view without importing data or invoking a live Discord retry.

## Deployment status

Implementation and Production publication are owner-authorized. Publication, migration 45, hosted checks, Main merge, Pages/Worker deployment, and read-only Production verification are pending the exact candidate commit. Staging is not used.

## Rollback

Redeploy the previous accepted 7.5.9 application commit while retaining additive migration 45. Older code ignores the new diagnostics table. Do not restore D1, delete delivery evidence, reset data, rotate the export URL, archive/transition the season, request a new Madden export, or reinterpret Free Agents as rollback actions.
