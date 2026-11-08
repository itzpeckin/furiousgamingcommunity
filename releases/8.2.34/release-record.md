# FranchiseHQ 8.2.34

## Scope

Existing links to all enabled, active leagues open without login. Visitors can view current teams, rosters, player details/career stats, standings, schedules, statistics, published news and rules. Shared team/player deep links preserve the destination. No membership is created by browsing.

## Added during delivery

Explicit public GET handlers resolve the requested enabled tenant and retain bounded snapshot pagination. The existing membership/capability guards remain unchanged for operational endpoints and all mutations. Guest metadata omits feature configuration, news omits account IDs, and public Rules images must be referenced by the current published document. Draft news/rules, member lists, trades, competition entries, imports and commissioner controls remain protected. Signed-in nonmembers and pending members can browse. An explicit Request to join link retains authentication and commissioner assignment. Public UI disables simulated permissions and hides management navigation.

## Known inherited blockers

None registered. Authenticated member/commissioner behavior is exercised using isolated database fixtures; no production account changes or customer imports are needed.

## Validation evidence

Six new fixture/behavior tests passed, covering anonymous and deep-link access, both tenants, all five snapshot domains, output redaction, draft-image restrictions, denied mutations, commissioner isolation, existing member access and pending/join flows. All 710 tests and the strict quality gate passed, including session/public-demo regressions, syntax, secret scanning, environment/migration checks, inventory and release contract. Browser production smoke checks follow deployment.

## Deployment status

User authorized public browsing for FranchiseHQ league sites. Deployed to production; no database migration, membership mutation, separate Worker change or import.

## Rollback

Restore production Pages deployment 3b79e24b-63d8-469a-9bce-ec6e7e344904 (8.2.33 / 23dabd9bf009e879b7c8cb90274aa65a3642e84c). No database rollback is required.

### Production verification

Production deployment a648ec53-1033-4cbf-b035-fcdf6b0cff4d (commit 9cd3028bb3916e5f3b7c415b75904c219c5ad560) succeeded. A fresh signed-out browser loaded the 2028 Week 14 FGC home, full standings, 32-team directory and Buccaneers roster with 62 players. The live check prompted a presentation follow-up: omit member-only GM history requests and hide remaining inline trade buttons/empty navigation dividers for visitors. No authorization or data changes in this follow-up. Hosted checks passed for the initial publication.

Follow-up deployment 87371187-128a-41a6-aca8-0a07025b4ca1 (commit 05a24276131067a93c2a70b91b43350eb77ae267) succeeded, including all hosted quality/build/deploy checks. Asset URL revisions ensure existing browser caches receive the visitor presentation cleanup. Signed-out membership-list access remained rejected with Authentication required.
