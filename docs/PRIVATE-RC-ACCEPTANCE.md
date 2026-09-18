# FranchiseHQ 7.6.0-rc.1 private acceptance

## Purpose

This is the role-based acceptance contract for the private FGC release candidate. Automated evidence can prove authorization, tenancy, state transitions, layout contracts, migration safety, and deterministic calculations. It cannot impersonate a real commissioner, committee member, or owner. Human acceptance is recorded only after those members use the exact deployed candidate.

## Exact candidate

- Baseline: Main `7e9f6f49d08514dcf838740877e7b42f12ceb836` / FranchiseHQ 7.5.9.
- Candidate: one immutable 7.6.0-rc.1 commit published through its pull request.
- Database change: additive migration 45 only.
- Environments: local validation, pull-request preview, then the owner-authorized Production deployment. No separate staging deployment.

## Automated acceptance matrix

| Area | Commissioner | Committee | Owner/member | Evidence |
| --- | --- | --- | --- | --- |
| Sign-in, session, refresh, logout, revocation | Full | Member | Member | Authentication/session/security suites |
| Membership, team authority, cross-tenant isolation | Manage | Scoped role | Own team | Onboarding, ownership, tenancy suites |
| Madden export URL and import | Manage | No write | Read live state | Export, candidate import, yearly schedule, transition suites |
| Canonical season/week and league pages | Review | Read | Read | Live-data and week-context suites |
| Trades, counters, voting, denial, revision | Manage | Vote | Own trades | Trade Center and Discord suites |
| Discord delivery diagnostics and retry | Retry exhausted sync | No retry | No retry | Commissioner HQ and Discord destination tests |
| Transactions, Rules, GOTW, Confidence Pool | Manage | Read/use | Read/use | Canonical history and competition suites |
| Mobile schedule, depth chart, cards, Commissioner HQ | Review | Use | Use | Mobile/UI contracts |
| Recovery, schema, monitoring, retention | Manage | No access | No access | Migration, recovery, Operations, policy checks |

## Human cohort

Use at least one real member in each role on the exact deployed candidate:

1. **Commissioner:** refreshes Commissioner HQ, confirms active season/week and Platform Health, opens League Data without running an import, reviews Rules/Controls/Teams, and verifies an exhausted Discord sync offers **Retry Failed Copies**.
2. **Trade Committee:** opens the current Trade Center and Discord commands, confirms only current-revision decisions are actionable, and verifies no commissioner-only retry or league-management action is exposed.
3. **Team owner/member:** refreshes desktop or mobile, opens team/schedule/standings/player/depth-chart pages, views published rules and confidence information, and verifies another team's private trade or unfinished picks are not accessible.

The cohort does not need to create a trade, vote, import, retry a live Discord failure, advance the week, or change league data merely to complete acceptance. Any such mutation requires its normal explicit in-product action and is recorded separately.

## Release blocker policy

- **Critical:** cross-tenant access, unauthorized write, active snapshot corruption, credential exposure, destructive or broad retry behavior, or inability to recover. Stop publication.
- **High:** a core role cannot sign in or use its primary flow, current season/week disagrees across core pages, an import can partially publish, or an unresolved Discord failure is hidden. Stop promotion.
- **Medium/low:** record with owner-visible impact and workaround; promotion requires explicit owner acceptance.

No issue is closed by deleting evidence, requesting a replacement Madden export, resetting league data, rotating the permanent export URL, archiving/transitioning a season, or converting unknown Free Agents to zero.

## Sign-off record

Record the exact deployed commit, Pages deployment, Worker build, migration/bookmarks, role used, timestamp, surface checked, outcome, and any issue ID in `releases/7.6.0-rc.1/validation-evidence.json`. Promotion to 7.7.0 requires zero unresolved critical/high blockers and the owner's acceptance of that exact candidate.
