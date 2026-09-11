# FranchiseHQ 7.5.5.5 Release Record

**Status:** Locally validated and authorized for Production publication

**Production changed:** No. Production remains on 7.5.5.4 and migration 39 until the authorized migration and protected GitHub delivery complete.

## Scope

Make the Discord Trade Submit decision surface an exact presentation match for the private trade thread, restore league-configured Trades Available to Teams & Owners, and provide audited commissioner trade-history and allowance controls without changing Madden-authoritative team ownership.

## Added during delivery

- Trade Submit posts one team-colored, logo-backed set of the same player, contract, draft-pick, and status cards used by the private trade thread, with Approve/Deny controls on that message.
- Discord no longer posts a second plain or differently formatted asset breakdown. If Discord strips the cards, the incomplete post is removed and its durable event stays retryable with an actionable Embed Links error.
- Teams & Owners displays each team's available trades from the editable league setting and opens a polished approved-trade ledger with the actual assets sent and received.
- Commissioners can restore season allowances, remove one approved trade from visible history, or clear all visible Trade Center history through distinct confirmed actions.
- Additive migration 40 records tenant-scoped, season-scoped, actor-scoped management events while retaining every protected workflow, roster overlay, draft-pick owner, canonical transaction, and audit row.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero.

## Validation evidence

Focused Discord, Trade Center, Teams & Owners, mobile, migration, and tooling regressions pass. The complete strict repository gate covers 214 tests, 255 JavaScript modules, 23 canonical migrations, 116 required tables, and 76 Pages routes.

The reset/removal regressions prove commissioner-only authorization, configured allowance restoration, visible-history removal, retention of canonical transaction and roster evidence, append-only management/audit rows, and no Free Agent reinterpretation.

## Deployment status

The owner authorized branch publication, pull request, hosted checks, additive Production migration 40, merge to Main, and Production deployment in one consolidated cycle. These external operations are not yet claimed in this candidate record. No Discord command definition changes are required.

Production acceptance will be read-only. It will verify the exact release and schema without invoking Reset Season Trades, Reset ALL Trades, or Remove Trade against live league data.

## Rollback

The exact rollback baseline is Main commit `516f01d723d04a589b11692b94d272912d78b97f` with tree `afd746a00fb9afbb7b50d0956698c439c2c43151`. Migration 40 is additive and may remain safely in place during a code rollback; it does not mutate existing league or trade rows.
