# FranchiseHQ 7.5.5.15 Release Record

Status: Candidate validated; Production publication authorized in the same cycle.

## Scope

Remove the unused desktop area below Needs Your Attention. Madden Import fills the available left-column height and distributes its existing heading, actions, and progress vertically. The attention card ends exactly level with Quick Controls; the following Activity panel retains its previous position. Retain normal inter-card spacing, surrounding dimensions, and natural compact phone height.

## Added during delivery

- Desktop-only flex growth uses the existing contained left column rather than adding row height or another widget.
- The importer’s buttons, progress logic, busy/readiness guards, polling, and actions are unchanged.
- Long attention lists remain bounded and scroll within their existing card.

## Validation evidence

Focused import/mobile tests passed 36/36; Trade Center/mobile regression checks passed 16/16. Read-only synthetic browser comparison passed all 48 cases: before/after at 2114, 1920, 1440, 1280, 1101, 1024, 390, and 320px, each with zero, one, and twelve attention items. Desktop outside-column gap is zero; the inter-card gap remains 16px. Quick Controls dimensions, row height, and Activity position are unchanged. All buttons retain at least 44px touch height. No horizontal overflow; long queues scroll within their card. Phone import height is unchanged. The complete strict gate passed: 218 tests, 255 syntax modules, 76 routes, 23 canonical migrations, 116 required tables, and all release, inventory, environment, and security checks. Hosted/deployment results will be recorded after execution.

## Known inherited blockers

Blocked Madden Free Agents remain unknown/null, not zero.

## Deployment status

Pending branch publication, PR checks, Main merge, Git-integrated Pages Production deployment, and authenticated read-only acceptance. Standing owner authorization covers this cycle.

## Boundaries

No migration, import, reset, active snapshot change, ownership/trade/vote, archive/transition, export URL rotation, credential, membership/assignment, or Discord behavior/configuration/command operation. Runtime release markers are metadata only.

## Rollback

Code-only baseline 7e625b63e402a26d266cabaa1f353cf865fe88ae, tree 2798b92e83e897338182c6e1d2aacce4a013f04e. No database rollback is needed.
