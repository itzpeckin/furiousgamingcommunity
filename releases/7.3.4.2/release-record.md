# FranchiseHQ 7.3.4.2 Release Record

**Status:** Production deployed; retained 43-route cohort recovered and verified; pending owner UI acceptance

**Production changed:** Exact corrected commit `e95ad2f4a6989433a05f9bf7ea605caa0e83b165` is on Main and Pages deployment `0747aebd-5f6a-4852-b3c4-98aaffb20ad0` succeeded. The exact retained 43-object window was recovered as the latest ready source. No candidate import or activation ran, and active snapshot `841ce1b5-a4a6-4246-a53a-01cd1f189663` is unchanged.

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
- Production recovery created one recovery session, 43 links to the retained captures, one ready report, and one audit row. It advanced only the endpoint's latest/latest-ready report references; the token version, active snapshot, candidate runs, transition runs, protected application data, and foreign-key state remained unchanged.
- Commissioner HQ visibly reports release 7.3.4.2, captured Week 9, 43 routes, 32 teams, 2,043 rostered players, Free Agents unknown, **Ready to import**, and import status `not-started`.
- The strict repository gate covers the continuous migration-26 schema, all routes, source guards, secrets, inventory, and the full automated suite.

## Deployment status

- The owner authorized branch publication, a pull request, hosted checks, exact Main/Production deployment, and the one-time exact cohort recovery.
- No staging cycle or migration is required.
- Initial candidate `90559f0` passed four candidate checks and all Main deployment checks, then deployed as `b0706bba`. Its fail-closed recovery reconstruction wrote no Production rows.
- Corrective PR #18 passed 4/4 candidate checks and all Main deployment checks. Exact commit `e95ad2f4a6989433a05f9bf7ea605caa0e83b165` deployed as Pages `0747aebd-5f6a-4852-b3c4-98aaffb20ad0`.
- Recovery session `m27_recovered_8bf2666ce3393492ed580dac` and report `m27_report_8bf2666c-e339-3492-ed58-0dac09b696c9` are complete and verified. The pre/post D1 bookmarks are `00000033-000002da-000050d7-045330f7b66ceda9d6eab234f120a1fe` and `00000034-0000004a-000050d7-185ac0b6bf799c1657dc4d353c8390e2`.
- The first oversized administrative statement was atomically rejected with zero writes. The bounded retry completed and reconciliation found migration 26, 79 tables, zero foreign-key violations, and unchanged protected counts.
- Active snapshot, endpoint token version, imports, candidate/transition run counts, and transition state remain unchanged. Owner UI acceptance is the only remaining release gate.

## Rollback

- Exact active runtime is `e95ad2f4a6989433a05f9bf7ea605caa0e83b165` / deployment `0747aebd-5f6a-4852-b3c4-98aaffb20ad0`. A runtime-only rollback may restore initial 7.3.4.2 deployment `b0706bba-2c8c-4145-ab71-382b174c39d5` while retaining all recovery evidence.
- After recovery, retain the immutable original sessions, captures, rebuilt recovery session/report, endpoint row, and audit event. Runtime rollback must not delete or repoint them.
- Do not restore D1, reset data, rotate the export URL, import a candidate, change the active snapshot, or reinterpret blocked Free Agents as a rollback shortcut.
