# FranchiseHQ 7.4.0.4 Release Record

**Status:** Validated local review candidate; publication, migration, Main, and Production are not authorized

**Production changed:** No. Production remains on 7.4.0.3 and migration 29.

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

No Production or Main change, database migration, draft-pick seed or baseline, import, active-snapshot change, reset, deletion, archive, season transition, permanent export URL rotation, credential change, or membership change is included in this local cycle. Blocked Madden Free Agents remain unknown/null and are never interpreted as zero.

## Known inherited blockers

None are registered in the current quality baseline.

## Validation evidence

The consolidated suite passes 150 of 150 tests. The strict repository gate passes 223 JavaScript modules, 559 inventoried files, 69 routes, 95 required database tables, environment separation, asset validation, repository lint, and secret scanning with zero registered or unregistered failures. Exact results are recorded in `validation-evidence.json`.

## Deployment status

Not run and not authorized. Production remains on FranchiseHQ 7.4.0.3 with migration 29.

## Rollback

The immutable rollback baseline is exact Main merge `5b9317266aa5b7b3019457078432f0aa11ca8d53`, tree `72bb64f4b7923aa3e8d7e1795e81cf4144a9f919`.
