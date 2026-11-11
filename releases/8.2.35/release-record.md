# FranchiseHQ 8.2.35

## Scope

Repair the visitor startup failure that can leave a signed-out person with only the “Explore this league” banner and a blank league page. Public visitors must be able to reach the requested league and inspect teams and rosters without a membership.

## Added during delivery

The public shell now provides safe, server-resolved tenant metadata synchronously. Tenant resolution emits one event after the canonical URL is established, avoiding duplicate invalidation of the visitor’s first roster read. League Home shows an explicit loading state, and the visitor banner includes a Browse rosters action. Regression coverage includes a delayed first-time roster read, mismatched bootstrap metadata and alias isolation. Updated asset revisions deliver the startup repair to cached browsers.

## Known inherited blockers

None registered. The submitted phone screenshot shows the guest banner with no league content. Local signed-out phone and desktop acceptance no longer reproduces the failure; deployed preview and production acceptance remain pending.

## Validation evidence

The strict migration gate passed locally: 39 canonical migrations, 19 archived legacy files and 142 required tables. Migration 56 remains the current schema; this candidate requires no migration. All 38 focused startup/public-access tests passed. The initial full suite passed 711 of 713 tests; its only failures were obsolete 8.2.34 release-marker assertions, which were corrected and verified by rerunning their 10 tests. The final strict quality gate passed all 714 tests with zero failures, including syntax, assets, secret scanning, environment/migration contracts, inventory and release checks.

Local signed-out browser acceptance passed at 393 × 852 and desktop widths using an anonymous read-only production-data proxy. Checks covered the 2028 Week 16 home, Browse rosters with 32 teams, the Buccaneers’ 62-player roster, a direct `/teams/tb` refresh and Tristan Wirfs player details. No final-code error was reproduced. This is local browser evidence; Cloudflare preview and production acceptance have not run.

## Deployment status

Locally validated, production-authorized candidate. The owner’s standing release authorization covers publication and a code-only production deployment after preview validation. No publication or deployment has run for 8.2.35. No database migration, membership change, import or separate Worker change is required.

## Rollback

Restore Pages production deployment `3153ba4d-c456-403c-9f00-f1b6f918dfb2`, release 8.2.34 at exact source commit `c808083d51c766417af2e7881adb41215821b336`. No database rollback is required. The baseline retains public league access but also retains the visitor startup defect addressed here.
