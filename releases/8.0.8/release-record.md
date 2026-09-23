# FranchiseHQ 8.0.8 — Platform Admin

Baseline: Main `c161be61a2cff0e3cb3f4c406e469a021979bff3` (8.0.7).

## Scope

Platform-owner work now lives at `franchisehq.app/platform-admin`, outside every league. The server verifies the configured Platform Owner before serving the document or platform onboarding data. The console shows the retained league directory, each tenant's activation and Madden-data status, lightweight cross-league health, and the existing gated onboarding and activation workflow.

The league Commissioner sidebar no longer shows Platform Workspace. The owner can open Platform Admin from the signed-in account menu or the league selector. Advanced import and mapping tools are retained behind `/platform-admin/diagnostics`, where the owner must first select the affected league so diagnostics cannot silently assume FGC or another tenant.

## Added during delivery

The existing platform-owner authorization now supports a top-level request without borrowing a league URL while still requiring the configured owner identity and at least one active commissioner membership. The owner-only onboarding read response includes non-mutating league summaries for the directory and health cards.

## Known inherited blockers

EA's Madden Companion roster-export availability remains outside FranchiseHQ control. P2W still requires an approved roster baseline before its first complete live snapshot. The next authentic weekly advance remains the acceptance gate for automated Discord thread rollover.

## Validation evidence

Focused coverage verifies the server owner guard, top-level route, owner-only entry points, removed league-sidebar link, explicit tenant selection for diagnostics, CSRF-protected onboarding mutations, cross-league summaries, and desktop/phone composition. The complete strict repository gate passed all 310 tests, 667 tracked-file checks, and 87 route checks.

## Deployment status

Production deployment is authorized and fully validated, pending pull-request publication, merge, hosted checks, and live read-only acceptance. This release performs no migration or Production data operation.

## Rollback

No D1 migration is included. Application rollback restores the prior league-nested owner entry point without changing tenants, memberships, league data, snapshots, imports, Discord state, rules, audits, credentials, the permanent export URL, season state, or blocked Free Agent semantics.
