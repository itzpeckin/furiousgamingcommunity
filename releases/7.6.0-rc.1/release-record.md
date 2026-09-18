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

Exact candidate `39afd1404379131db92051a08be55a96d9c4533f` passed all four pull-request checks in [PR #125](https://github.com/itzpeckin/furiousgamingcommunity/pull/125) and merged to Main as `a6fe3c486f2ba0f0e6e464e477ce2f1ad76e63ec`. Main quality run `35393363265` and Pages run `35393362470` passed. Production Pages deployment `88165072-ce60-4607-9880-f5d38a237697` and import Worker build `83c71925-e492-4095-98f0-c6686eb77aa0` / version `2299b1d3` serve the exact merge.

Migration 45 was applied only to `franchise-hq-db-madden27` between Time Travel bookmarks `00000350-00000100-000050ea-fd1a13c813396cb84f3170522dbcd07c` and `00000350-00000118-000050ea-db91a677e4c14c3b0bb8c4d53e6f56d2`. It added one empty diagnostics table, two indexes, and one migration-ledger row. Protected counts remained exactly 1 league, 34 users, 34 memberships, 32 active team assignments, and 1 active-snapshot pointer; relational team/player/snapshot tables remained empty by design because canonical Madden domains stay inside the retained snapshot model. Foreign-key violations are zero.

Signed-in commissioner acceptance confirms release 7.6.0-rc.1, Season 2027 Regular Season Week 2, active snapshot `5cee59c2-1610-4e70-8a65-2707a40da95a`, Free Agents unknown, the four retained Discord failures, and two commissioner-safe retry controls. No retry was selected. Privacy, terms, retention, and incident pages are live. Human trade-committee and team-owner acceptance remain the private RC follow-up before 7.7.0 promotion. No Madden export/import, snapshot activation, reset/delete, export-URL rotation, season archive/transition, scheduling-thread action, roster/ownership change, credential change, Discord command registration, or Free Agent reinterpretation ran during release.

## Rollback

Redeploy the previous accepted 7.5.9 application commit while retaining additive migration 45. Older code ignores the new diagnostics table. Do not restore D1, delete delivery evidence, reset data, rotate the export URL, archive/transition the season, request a new Madden export, or reinterpret Free Agents as rollback actions.
