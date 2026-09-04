# FranchiseHQ 7.4.0.4 Release Record

**Status:** Production deployed and read-only verified; owner UI acceptance pending

**Production changed:** Yes, within the authorized release boundary. Production now serves exact Main merge `7d69003` with migration 30.

## Scope

This FranchiseHQ-wide experience release implements the two owner-approved Trade Center and Trade Block visual concepts without changing trade authority. The Madden Import remains authoritative for player ownership after reconciliation, and FranchiseHQ remains authoritative for draft-pick ownership while Madden provides no supported pick source.

## Added during delivery

- A premium, package-first Trade Center dashboard with status counts, team-branded received packages, clear next actions, relevant activity, and Trade Block targets.
- Strict Trade Activity visibility: activity involving the signed-in owner's team plus completed commissioner-approved trades from other teams only.
- API enforcement that hides unrelated drafts, proposals, negotiations, and rejections. Authorized reviewers receive unrelated trades only after committee review is required.
- Team-branded Trade Block cards that open the canonical player card used elsewhere in FranchiseHQ.
- One-click roster and player-card stars that immediately add or remove owned players without a second confirmation dialog.
- A listed-player-only Manage My Trade Block workspace with inline optional notes and an on-demand roster drawer for adding players.
- Tenant-scoped, server-backed team needs through additive migration 30.
- Responsive layouts for the dashboard, packages, activity rail, Trade Block, manager rows, and roster drawer.

## Privacy contract

Unrelated live negotiations do not appear in Trade Activity, History, or the workflow response. A team owner sees their own sent, received, negotiated, rejected, and approved activity. Every league member may see a trade only after commissioner approval, with private notes, messages, reviews, and rejection detail removed for unrelated viewers. Committee members retain the separate access required to decide a trade after all participating teams accept it.

## Trade Block contract

Adding a player from the roster or player card is immediate. A requested-return note is optional and can be edited later. Manage My Trade Block contains only active listings; unlisted roster players appear only in the Add Players drawer. Team needs are stored once per league team and shared across users and devices.

## Authority and safety boundaries

The authorized release changed Git Main, deployed the application code, and applied additive migration 30. It did not seed a team-needs row, draft pick, or baseline; import data; change the active snapshot; reset or delete data; archive or transition a season; rotate the permanent export URL; change credentials; or change memberships. Blocked Madden Free Agents remain unknown/null and were never interpreted as zero.

## Known inherited blockers

None are registered in the current quality baseline.

## Validation evidence

The consolidated suite passes 150 of 150 tests. The strict repository gate passes 223 JavaScript modules, 559 inventoried files, 69 routes, 95 required database tables, environment separation, asset validation, repository lint, and secret scanning with zero registered or unregistered failures. PR #35 passed all four hosted checks. Exact Main merge `7d69003` passed all six Main, Pages, Worker, and GitHub deployment checks.

## Deployment status

Additive migration 30 was applied to exact Production database `franchise-hq-db-madden27` after recovery bookmark `000000f3-000002a8-000050dc-8ddbc6b9fd4e7c418ecdd010b221b723` was captured. The migration ledger, six columns, two foreign keys, required index, 95-table contract, unchanged protected counts, empty initial team-needs table, and zero foreign-key violations were verified. PR #35 then merged exact candidate `875f83e` into Main as `7d69003`. Cloudflare Pages deployment `f7e85bed-bb3b-45df-ab80-d65164165507` and Worker build `6b971ea4-5218-40b4-be9f-0441edd48c0a` succeeded. The live public marker reports FranchiseHQ 7.4.0.4.

## Rollback

The immutable rollback baseline is exact Main merge `5b9317266aa5b7b3019457078432f0aa11ca8d53`, tree `72bb64f4b7923aa3e8d7e1795e81cf4144a9f919`.
