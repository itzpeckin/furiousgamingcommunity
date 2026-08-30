# FranchiseHQ 7.3.4.2 Release Record

**Status:** Production remediation authorized; consolidated local validation pending

**Production changed:** No during implementation. Production remains exact 7.3.4.1 commit `6de7c1018c89bc8fd6868fbde984f7a496e2a69d` / Pages deployment `0eec0551-216c-4f32-8aed-e8a7fbcb81ab`, with active snapshot `841ce1b5-a4a6-4246-a53a-01cd1f189663` unchanged.

## Scope

Repair the permanent Madden export receiver so concurrently delivered routes atomically join one automatic cohort. Recover only the exact already captured complete 43-route Production burst from `2026-08-30T21:33:47.826Z` through `2026-08-30T21:33:49.047Z`, analyze it, and make it the latest ready source without importing or activating a candidate.

## Added during delivery

- Derive one deterministic cohort ID from the league, token version, and prior endpoint generation.
- Use an endpoint compare-and-swap claim so every request that races on the same generation resolves to the same session.
- Add a platform-owner-only, typed-confirmation recovery action bounded to an exact window of at most ten seconds and exactly 43 structural routes.
- Refuse pointer advancement unless the rebuilt report passes latest-export readiness.
- Retain immutable raw captures and original fragmented session/report evidence.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. The recovered cohort may be rostered-player-only, but the Free Agent count must remain null/unknown.
- Session refresh inconvenience remains deferred to 7.5.0.
- Candidate import and snapshot activation remain separate actions after source recovery.

## Validation evidence

- The observed complete Production burst contains 43 routes delivered in 1.221 seconds but was fragmented across eight automatic sessions by the 7.3.4.1 race.
- Regression coverage drives 43 concurrent claims and receives one shared automatic session.
- An end-to-end local recovery reconstructs 32 roster routes plus teams, standings, schedule, statistics, and blocked Free Agent evidence, advances only a ready report pointer, and leaves the active snapshot table unchanged.
- The strict repository gate covers the continuous migration-26 schema, all routes, source guards, secrets, inventory, and the full automated suite.

## Deployment status

- The owner authorized branch publication, a pull request, hosted checks, exact Main/Production deployment, and the one-time exact cohort recovery.
- No staging cycle or migration is required.
- Before the authorized deployment/recovery runs, Production, Main, active snapshot, endpoint token version, imports, and transition state remain unchanged.

## Rollback

- Before publication, discard the 7.3.4.2 branch and retain exact 7.3.4.1 runtime `6de7c1018c89bc8fd6868fbde984f7a496e2a69d` / deployment `0eec0551-216c-4f32-8aed-e8a7fbcb81ab`.
- After recovery, retain the immutable original sessions, captures, rebuilt recovery session/report, endpoint row, and audit event. Runtime rollback must not delete or repoint them.
- Do not restore D1, reset data, rotate the export URL, import a candidate, change the active snapshot, or reinterpret blocked Free Agents as a rollback shortcut.
