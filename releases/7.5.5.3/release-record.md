# FranchiseHQ 7.5.5.3 Release Record

**Status:** Locally validated review candidate; publication and Production are not authorized

**Production changed:** No. Production remains FranchiseHQ 7.5.5.2 on migration 38.

## Scope

Complete the Discord trade workflow without changing the canonical Trade Center authority. Private owner threads and the configured Trade Committee channel render the same structured trade package, with player and contract facts visibly separated, draft picks promoted, and the current workflow status always explicit.

Each league can select one existing mentionable, non-managed Discord role for committee review. The delivery mentions only that exact role and retains the existing Approve and Deny controls. A missing configured role produces no broad mention.

Final owner rejection, proposer cancellation, or committee approval posts the result and then archives and locks the private trade thread. Committee denial leaves the thread open for revision. Revising or countering reopens the archived thread when needed and reuses its existing Discord thread rather than creating a second negotiation.

The canonical Player Card Contract panel removes unsupported Current Salary and promotes the source-backed Total Release Penalty alongside Cap Hit, Net Release Savings, Total Contract, Total Bonus, and term.

## Added during delivery

- Additive migration 39 adds only `discord_league_installations.trade_committee_role_id`.
- Commissioner Discord routing exposes one verified Trade Committee role selector alongside the existing channel selectors.
- Owner and committee destinations share the exact detailed trade formatter and decision-state labels.
- Discord allowed-mention payloads are restricted to the configured committee role.
- Thread close is retry-safe: the final message and archive/lock operation are tracked independently if Discord accepts one but not the other.
- Revision reopens and reuses the same verified private thread.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero.

## Validation target

- Current Salary is absent and Total Release Penalty remains visible on the Player Card.
- Player identity and contract facts are separate; draft picks are visually prominent.
- Committee review carries the same assets and details as the owners' private thread, plus Approve/Deny buttons and only the configured role mention.
- Final approval/rejection/cancellation removes the negotiation from active threads through archive and lock while retaining Discord history.
- Committee denial remains open, and revision continues in the same thread.
- Migration 39 is additive, the canonical ledger remains continuous, and protected league/account/data counts are unchanged in migration fixtures.

## Validation evidence

The focused migration, Discord, Player Card, and release-tooling suite passes 55/55. The complete strict repository gate is recorded in `validation-evidence.json` after its final consolidated run.

## Deployment status

Not run and not authorized. Production remains FranchiseHQ 7.5.5.2 on migration 38; migration 39 has been validated only in local fresh-install and upgrade fixtures.

## Boundaries

No branch publication, pull request, hosted check, Main change, Production deployment, Production migration, Discord command registration, Discord configuration change, live trade action, import, reset, snapshot operation, archive-season operation, transition, export-URL rotation, credential change, membership/assignment change, or league-data write is authorized or performed by this local build. Blocked Madden Free Agents remain unknown/null and are never interpreted as zero.

## Rollback

The exact rollback baseline is Main commit `39bb93a9451150e947616c82879424ad465634a0` with tree `1abdea74852d9ff6faebf079fde2417b5eac3855`. Migration 39 is additive and has not been applied to Production.
