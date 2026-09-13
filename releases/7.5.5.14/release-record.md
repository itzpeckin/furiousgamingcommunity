# FranchiseHQ 7.5.5.14 Release Record

Status: Production deployed and authenticated read-only verified; owner visual acceptance pending.

## Scope

Add Copy URL, Refresh, and Import Latest Export above Needs Your Attention in the existing Command Center left column. Show current active step, its percentage, and a compact progress bar. No surrounding redesign or added desktop row height.

## Added during delivery

- Compact view shares the detailed importer’s readiness, busy, live-export, phase, percentage, and action logic. League Data retains its full workspace.
- Imports started from this shortcut stay in Command Center; the existing atomic import and live-refresh service is reused without adding a new operation.
- The compact panel receives readiness polling and import progress rerenders. Its actions immediately disable while busy.
- Desktop left-column sizing is contained to the existing Quick Controls row; long attention queues scroll inside their card. Phones use natural-height cards with bounded content and at least 44px action targets.

## Validation evidence

Focused import/mobile tests: 36/36. VM tests cover shared readiness, missing source, busy states, live guards, step percentage, rerenders, same-page navigation, duplicate-action prevention, and compact-panel polling.

Read-only synthetic browser matrix: 18 cases at 1440/1280/1101/1024/390/320px, comparing baseline, compact with clear queue, and compact with twelve attention items. Desktop Quick Controls dimensions and the following Activity position are unchanged. No panel or page horizontal overflow; all action targets are at least 44px; long queues remain contained. Desktop compact height is approximately 175–179px; phone height approximately 169–173px. Complete strict gate passed: 218/218 tests, 255 syntax modules, 76 routes, 23 canonical migrations, 116 required tables, and all inventory, environment, release, and security checks.

## Known inherited blockers

Blocked Madden Free Agents remain unknown/null, not zero.

## Deployment status

Exact candidate e1ff3d58bfd95e6a727939f45660fc87f91d1c06 passed all four PR #90 checks, merged Main as 778b8bb76ef7671f771735edfe7a738a2eda403e, and passed all five Main checks. Git-integrated Pages Production deployment d8113810-46ff-46df-84a0-c73c808146e6 serves 7.5.5.14. Main quality run: 34733274468; Pages workflow: 34733274049.

Authenticated read-only acceptance confirms the compact 175px panel above the queue, Copy URL and Refresh enabled, existing already-live import disabled, and current-step progress at 100%. At 1280px, Quick Controls retains exactly its previous 497.4609375px height; League Activity retains exactly its previous 1206.65625px top position; the clear attention queue retains exactly its previous 162.359375px height. No panel or page horizontal overflow. Season 2026 / Week 20 and the 8:02:04 PM activation time remain unchanged. Live app.js, styles.css, trade-module.js, and one-click-import.js SHA-256 hashes exactly match Main. Mobile acceptance is the synthetic browser matrix, not a claimed live-device test. No import or other live action was executed.

## Boundaries

No import, data reset/deletion, active snapshot change, draft ownership, trade/vote, trade reset, archive/transition, export URL rotation, credential, membership/assignment, or Discord behavior/configuration/command change. Runtime release-marker changes do not alter those services’ behavior.

## Rollback

Code-only baseline e43f1604249d6a2758d5f29a29fe292426518979, tree b6dbe912ee2984ddc8c83d76b91cf5e04bb28cd2. No database rollback is needed.
