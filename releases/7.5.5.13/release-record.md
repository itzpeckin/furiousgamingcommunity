# FranchiseHQ 7.5.5.13 Release Record

Status: Production deployed and authenticated read-only verified; owner visual acceptance pending.

## Scope

Fit the existing Trade Review metric box and other columns inside each compact asset row. Keep player POS/OVR/DEV/AGE and draft-pick CLASS/ROUND/PROJECTED. No new asset-card design, colors, fonts, row padding, or gaps.

## Added during delivery

- Removed rigid 300px/360px metric-track minimums from desktop review rows and allowed metric cells to shrink.
- Reserved more of the metric box for Development and Projected Pick labels while narrowing numerical columns and their horizontal padding.
- Constrained long labels to their own cell instead of allowing them to cross borders.
- At the narrowest desktop widths, constrained the movement and calculator columns too; their existing text can wrap without changing font sizes.
- Retained all logos, portraits, player links, calculator explanation actions, gradients, removed fields, and intentional phone row placement.

## Validation evidence

Focused Trade Center/mobile suite: 15/15. Synthetic browser matrix passed 16 combinations and 48 measured assets at 1280/1024/900/390px, covering detail/dashboard and calculator on/off. No asset, metric box, child column, or page overflow. Wide desktop detail rows remain 72.109375px in both calculator modes. Fonts, row padding, gaps, colors, and phone placement remain unchanged. The complete strict gate passed 216/216 tests, 255 syntax modules, 76 routes, 23 canonical migrations, 116 required tables, and all inventory, release, environment, and security checks.

## Known inherited blockers

Blocked Madden Free Agents remain unknown/null, not zero.

## Deployment status

Exact candidate 922c1017bbc0c71ebc3e9159ee90557071ac3dfd passed all four PR #88 checks, merged into Main as 0f740bbdd25baaf623ccf605d273cba92371c83d, and passed all five Main quality/build/deployment checks. Git-integrated Pages Production deployment 8a49f5dd-bffe-4574-aa81-440f6788b915 serves 7.5.5.13. Main quality run: 34725691531; Pages workflow: 34725691030.

Authenticated read-only acceptance measured all four assets in the existing approved NE/TB trade. Every asset, metric box, and child column fits inside its 924px row; each retains the original 72.109375px desktop height. Player fields are POS/OVR/DEV/AGE and pick fields are CLASS/ROUND/PROJECTED, without Contract or Record. No live trade, setting, snapshot, or data operation was exercised. Browser screenshot capture timed out after the successful DOM/style measurements; it is not claimed as separate live screenshot evidence.

## Boundaries

Platform display only. No league data, trades/votes, draft-pick ownership, imports, snapshots, resets, archives/transitions, export URL, credentials, memberships/assignments, or Discord behavior/configuration/commands change.

## Rollback

Code-only baseline 1298ad11498ce2b1cc10526dfb0e0449646861ad, tree 099e675488cff7ca4d9a721fc594e3f703099097. No database rollback is needed.
