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

User authorized public browsing for FranchiseHQ league sites. Candidate release; no database migration, membership mutation, separate Worker change or import.

## Rollback

Restore production Pages deployment 3b79e24b-63d8-469a-9bce-ec6e7e344904 (8.2.33 / 23dabd9bf009e879b7c8cb90274aa65a3642e84c). No database rollback is required.
