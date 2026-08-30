# FranchiseHQ 7.3.4.2 Release Record

**Status:** Initial Production runtime deployed; corrected real-payload candidate validated and pending hosted checks

**Production changed:** Runtime only so far. Exact initial commit `90559f08295642cb35232309225df1e6c7f842ca` is on Main and Pages deployment `b0706bba-2c8c-4145-ab71-382b174c39d5` succeeded. The exact 43-object reconstruction was read-only; no recovery rows or candidate import were created, and active snapshot `841ce1b5-a4a6-4246-a53a-01cd1f189663` is unchanged.

## Scope

Repair the permanent Madden export receiver so concurrently delivered routes atomically join one automatic cohort. Recover only the exact already captured complete 43-route Production burst from `2026-08-30T21:33:47.826Z` through `2026-08-30T21:33:49.047Z`, analyze it, and make it the latest ready source without importing or activating a candidate.

## Added during delivery

- Derive one deterministic cohort ID from the league, token version, and prior endpoint generation.
- Use an endpoint compare-and-swap claim so every request that races on the same generation resolves to the same session.
- Add a platform-owner-only, typed-confirmation recovery action bounded to an exact window of at most ten seconds and exactly 43 structural routes.
- Refuse pointer advancement unless the rebuilt report passes latest-export readiness.
- Classify Madden's weekly `/team` route as statistics rather than league teams, and use the export URL's platform, franchise, stage, and week segments as source evidence while retaining the reviewed franchise-season expectation.
- Retain immutable raw captures and original fragmented session/report evidence.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. The recovered cohort may be rostered-player-only, but the Free Agent count must remain null/unknown.
- Session refresh inconvenience remains deferred to 7.5.0.
- Candidate import and snapshot activation remain separate actions after source recovery.

## Validation evidence

- The observed complete Production burst contains 43 routes delivered in 1.221 seconds but was fragmented across eight automatic sessions by the 7.3.4.1 race.
- Regression coverage drives 43 concurrent claims and receives one shared automatic session.
- An end-to-end local recovery reconstructs 32 roster routes plus teams, standings, schedule, statistics, and blocked Free Agent evidence, advances only a ready report pointer, and leaves the active snapshot table unchanged.
- A read-only reconstruction from all 43 retained Production R2 objects proves the exact current payload as 32 teams, 2,043 rostered players, 15 schedule rows, 207 statistics rows across seven routes, and 32 standings rows. Readiness is rostered-player-only; Free Agents remain blocked/null. The initial parser stopped safely before any recovery row was written, and the corrected parser passes the same immutable objects.
- The strict repository gate covers the continuous migration-26 schema, all routes, source guards, secrets, inventory, and the full automated suite.

## Deployment status

- The owner authorized branch publication, a pull request, hosted checks, exact Main/Production deployment, and the one-time exact cohort recovery.
- No staging cycle or migration is required.
- Initial candidate `90559f0` passed four candidate checks and all Main deployment checks, then deployed as `b0706bba`. Its fail-closed recovery reconstruction wrote no Production rows.
- The corrected real-payload parser candidate must pass a second exact hosted-check/Main deployment gate before the authorized recovery runs. Active snapshot, endpoint token version, imports, and transition state remain unchanged.

## Rollback

- Before corrected publication, retain exact initial 7.3.4.2 runtime `90559f08295642cb35232309225df1e6c7f842ca` / deployment `b0706bba-2c8c-4145-ab71-382b174c39d5`.
- After recovery, retain the immutable original sessions, captures, rebuilt recovery session/report, endpoint row, and audit event. Runtime rollback must not delete or repoint them.
- Do not restore D1, reset data, rotate the export URL, import a candidate, change the active snapshot, or reinterpret blocked Free Agents as a rollback shortcut.
