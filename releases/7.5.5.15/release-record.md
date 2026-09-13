# FranchiseHQ 7.5.5.15 Release Record

Status: Production deployed and authenticated read-only verified; owner visual acceptance pending.

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

Exact candidate 03def64fc37d3f6e9b301245fab04b36b4a9bf66 passed all four PR #92 checks and merged as Main 0b6d71ae0c5fabf376b0fc03fa84bfa0abd1d74b. All five Main checks passed. Git-integrated Pages Production deployment 0614586b-eb61-4467-a743-c6452ca2d52c serves 7.5.5.15. Main quality run: 34734286085; Pages workflow: 34734285554.

Authenticated read-only acceptance at 1280px confirms the outside-column gap changed from 144.359375px to zero. Madden Import now uses 319.1015625px rather than 174.7421875px. The clear attention card remains 162.359375px; Quick Controls remains 497.4609375px. Activity remains 521.4609375px below the row's top, with its normal 24px gap. The left cards retain their normal 16px gap, no horizontal overflow, and 44px action targets. Copy URL/Refresh remain enabled; Latest Export Live remains safely disabled with Make Import Live at 100%. The visible league period is Season 2026 / Week 20. Deployed app.js, styles.css, trade-module.js, and one-click-import.js hashes exactly match Main. Mobile acceptance is the synthetic browser matrix, not a claimed live-device test. No import or other live action was executed.

## Boundaries

No migration, import, reset, active snapshot change, ownership/trade/vote, archive/transition, export URL rotation, credential, membership/assignment, or Discord behavior/configuration/command operation. Runtime release markers are metadata only.

## Rollback

Code-only baseline 7e625b63e402a26d266cabaa1f353cf865fe88ae, tree 2798b92e83e897338182c6e1d2aacce4a013f04e. No database rollback is needed.
