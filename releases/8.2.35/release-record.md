# FranchiseHQ 8.2.35

## Scope

Repair the visitor startup failure that can leave a signed-out person with only the “Explore this league” banner and a blank league page. Public visitors must be able to reach the requested league and inspect teams and rosters without a membership.

## Added during delivery

The public shell now provides safe, server-resolved tenant metadata synchronously. Tenant resolution emits one event after the canonical URL is established, avoiding duplicate invalidation of the visitor’s first roster read. League Home shows an explicit loading state, and the visitor banner includes a Browse rosters action. Regression coverage includes a delayed first-time roster read, mismatched bootstrap metadata and alias isolation. Updated asset revisions deliver the startup repair to cached browsers.

## Known inherited blockers

None registered. Local signed-out phone and desktop acceptance no longer reproduces the submitted blank-page failure. Hosted preview HTTP checks passed, but existing canonical-host middleware redirects browser navigation to production, so hosted preview roster-browser acceptance is not complete. Production deployment and signed-out desktop/mobile public-browsing acceptance passed. Owner confirmation from the affected visitor remains pending. The player card still requests protected canonical transaction history and logs Authentication required; its public ratings and contracts render.

## Validation evidence

The strict migration gate passed locally: 39 canonical migrations, 19 archived legacy files and 142 required tables. Migration 56 remains the current schema; this candidate requires no migration. All 38 focused startup/public-access tests passed. The initial full suite passed 711 of 713 tests; its only failures were obsolete 8.2.34 release-marker assertions, which were corrected and verified by rerunning their 10 tests. The final strict quality gate passed all 714 tests with zero failures, including syntax, assets, secret scanning, environment/migration contracts, inventory and release checks.

Local signed-out browser acceptance passed at 393 × 852 and desktop widths using an anonymous read-only production-data proxy. Checks covered the 2028 Week 16 home, Browse rosters with 32 teams, the Buccaneers’ 62-player roster, a direct `/teams/tb` refresh and Tristan Wirfs player details. No final-code error was reproduced. This remains local browser evidence, separate from hosted preview checks and production acceptance.

All three hosted checks passed for PR [#219](https://github.com/itzpeckin/furiousgamingcommunity/pull/219) at source `edbdb94bd3b9ced758fae847de05d6142ace34c5`: two quality workflows and Cloudflare Pages. Preview deployment `3485bca6-5d09-41dc-b1f8-626bacb3e5db` uses the same source and verified isolated staging bindings. Anonymous HTTP checks returned the 8.2.35 guest shell with sanitized tenant `stg_fgc_m27_discovery`; its snapshot GET succeeded with no staging snapshot. Browser navigations redirect to production through existing canonical-host middleware, so these results do not establish hosted preview roster-browser acceptance.

## Deployment status

The explicitly authorized PR #219 merged as `597dd8d56ebdc358fb1bdbbb2e3fe2d14fda56ee`. Pages production deployment `85b856a2-96e6-455b-8ce2-d7a81507b1e1` succeeded and serves 8.2.35. Main quality run `43082722766` (job `130739156719`) and build/deploy run `43082721234` both passed.

A fresh signed-out desktop browser loaded the live 2028 Week 16 home. At 393 × 852, Browse rosters opened the team directory with all 32 teams; opening the Buccaneers showed 62 players. Reloading `/leagues/furious-gaming-community/teams/tb` preserved that 62-player roster. Tristan Wirfs’s card showed 96 OVR, full ratings and contracts. No startup console error was observed before opening the player card. The card’s existing protected canonical transaction-history request logs Authentication required while the public card renders; this is not a claim of zero total browser errors. Owner confirmation from the affected visitor remains pending. No database migration, membership change, import or separate Worker change ran.

## Rollback

Restore Pages production deployment `3153ba4d-c456-403c-9f00-f1b6f918dfb2`, release 8.2.34 at exact source commit `c808083d51c766417af2e7881adb41215821b336`. No database rollback is required. The baseline retains public league access but also retains the visitor startup defect addressed here.
