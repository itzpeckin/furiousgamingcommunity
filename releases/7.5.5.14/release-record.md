# FranchiseHQ 7.5.5.14 Release Record

Status: Validated UI candidate; authorized publication and Production deployment pending hosted checks.

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

Standing owner authorization covers branch publication, PR, hosted checks, Main merge, and Git-integrated Pages Production deployment. No migration or Discord registration is required. Live acceptance will only inspect existing data and UI; no import will run.

## Boundaries

No import, data reset/deletion, active snapshot change, draft ownership, trade/vote, trade reset, archive/transition, export URL rotation, credential, membership/assignment, or Discord behavior/configuration/command change. Runtime release-marker changes do not alter those services’ behavior.

## Rollback

Code-only baseline e43f1604249d6a2758d5f29a29fe292426518979, tree b6dbe912ee2984ddc8c83d76b91cf5e04bb28cd2. No database rollback is needed.
