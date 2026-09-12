# FranchiseHQ 7.5.5.13 Release Record

Status: Production publication authorized under standing release authorization; hosted checks and read-only live acceptance follow local validation.

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

One consolidated branch/PR/hosted-check/Main/Production cycle is authorized. No migration or Discord registration is required. Exact publication and live-read-only results are reported with the completed release handoff.

## Boundaries

Platform display only. No league data, trades/votes, draft-pick ownership, imports, snapshots, resets, archives/transitions, export URL, credentials, memberships/assignments, or Discord behavior/configuration/commands change.

## Rollback

Code-only baseline 1298ad11498ce2b1cc10526dfb0e0449646861ad, tree 099e675488cff7ca4d9a721fc594e3f703099097. No database rollback is needed.
