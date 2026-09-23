# FranchiseHQ 8.0.6 — Commissioner Command Center cleanup and GOTW persistence

Baseline: Main `276afc3cc457b21935de86b120d975c90a1a59eb` (8.0.5).

## Scope

League Data is consolidated into Command Center. The Data Source Selector is prominent, daily import actions remain in one compact workspace, latest-import details are available on demand, and Archive Season is retained in a separate season-management card. Old League Data routes resolve to Command Center rather than creating a second workflow.

Most Recent Import Source now emphasizes live week, captured week, receipt time, season, teams, rostered players, games, statistics, roster mode, Free Agent availability, and Discord thread readiness. Routine timing internals and permanent safety explanations no longer crowd the commissioner view. Actionable warnings and export URL security remain available.

League Controls no longer repeats Trade History & Allowances or the Discord Command Experience description. The saved server-authoritative Game of the Week is now preferred by the live League Home renderer after refresh; automatic selection is labeled Featured Matchup and is used only when no official matchup exists.

## Added during delivery

The supplied FGC rulebook was mapped separately for a tenant-only Rules Studio publication. Intentional TBD text is preserved, the accidental Madden Start Guide is excluded, and the kneel-down reference is retained as an image rather than being reinterpreted. That tenant data operation is not hard-coded into this application release.

## Known inherited blockers

EA's Madden Companion roster export remains outside FranchiseHQ control. This release does not change roster authority, import eligibility, retained snapshots, export URLs, or blocked/null Free Agent semantics.

## Validation evidence

Focused Commissioner HQ, competition, and live-data tests cover the five-tab command shell, old-route compatibility, source selector placement, compact import detail boundaries, redundant-control removal, official GOTW precedence, and blocked Free Agent preservation. The complete strict gate passed: 310 tests, 663 tracked files, and 86 routes.

## Deployment status

Production deployment is authorized but pending validation, pull-request publication, merge, and hosted deployment verification. No production application or tenant data has changed at this candidate checkpoint.

## Rollback

No D1 migration is included. Application rollback restores the prior Pages and Worker versions without modifying league rules, imports, snapshots, active pointers, schedules, Discord threads, credentials, export URLs, or audits. The FGC Rules Studio publication is independently revisioned and can be superseded by a later publication without deleting its history.
