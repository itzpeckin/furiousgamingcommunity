# FranchiseHQ 7.3.4.3 Release Record

**Status:** Deployed to Production; pending owner import-retry acceptance

**Production changed:** Yes, application runtime only. Production now runs exact Main commit `0a5dc06b90fbf2fe718482106c5c7a037f2d6dfa` / Pages deployment `3d667ec0-73f8-4188-9e5b-76f154634dfe`, with matching import Worker build `8fa92466-efe6-438f-8811-3cae1c4f6138`. No Production data operation ran. The failed commissioner import remains stopped before candidate construction or activation, and active snapshot `841ce1b5-a4a6-4246-a53a-01cd1f189663` remains unchanged.

## Scope

Repair the mismatch between the recovered latest-ready Madden session and the older browser-side classification call. The exact selected discovery-session ID must be carried through analysis, classification, Teams mapping, and all later candidate phases. Teams mapping must recognize the same safe route evidence used by the analyzed structural report even when legacy inspection metadata is absent or belongs to an original fragmented session.

## Added during delivery

- Pass the selected latest-ready discovery-session ID into browser-side classification instead of asking the API to choose an arbitrary latest underlying capture session.
- Select the Teams capture from the exact linked session using the shared Madden route classifier, with legacy inspection confidence used only as ranking evidence.
- Align legacy classification so `/leagueteams` is Teams and weekly `/team` is Statistics.
- Resolve retained classification rows through canonical session-capture links, making recovered cohorts idempotent across original fragmented session ownership.
- Replace the stale instruction to run v5.9.3.1 manually with an exact selected-export error.

## Known inherited blockers

- The source jumps from active Week 7 to captured Week 9. Missing Week 8 remains visible and must not be silently filled or hidden.
- Madden's explicit Free Agent route remains blocked upstream. The rostered-player candidate may proceed only with Free Agents unknown/null.
- Session refresh inconvenience remains deferred to 7.5.0.

## Validation evidence

- The realistic regression begins with 43 retained routes fragmented across eight sessions, reconstructs the exact ready cohort, and proves an unspecified legacy classifier sees only one fragment.
- The Teams mapper safely resolves the exact recovered session to `/leagueteams` and maps all 32 teams even before a compatible legacy inspection row exists.
- Exact-session classification then covers all 43 routes as one Teams dataset, 32 roster datasets, seven Statistics routes, standings, schedule, and blocked Free Agent evidence.
- The browser source regression requires `{discoverySessionId}` on classification and forbids the former empty request body.
- No test writes an active snapshot pointer or interprets blocked Free Agents as zero.

## Deployment status

- The owner authorized the consolidated implementation, hosted-check, Main, and Production deployment cycle.
- No migration, staging cycle, new Madden export, import retry, snapshot activation, reset, transition, or URL rotation is included.
- PR #19 published exact candidate `0a5dc06b90fbf2fe718482106c5c7a037f2d6dfa`; all four candidate checks passed and all seven Main/deployment checks passed.
- Main was fast-forwarded to that exact candidate. Cloudflare Pages Production deployment `3d667ec0-73f8-4188-9e5b-76f154634dfe` and import Worker build `8fa92466-efe6-438f-8811-3cae1c4f6138` succeeded.
- A direct `https://franchisehq.app` smoke check visibly reports release 7.3.4.3. The existing import was not retried and the existing snapshot was not activated or changed.

## Rollback

- Runtime rollback may restore exact 7.3.4.2 commit `e95ad2f4a6989433a05f9bf7ea605caa0e83b165` / deployment `0747aebd-5f6a-4852-b3c4-98aaffb20ad0` without restoring or modifying Production data.
- Runtime rollback must retain recovery session `m27_recovered_8bf2666ce3393492ed580dac`, report `m27_report_8bf2666c-e339-3492-ed58-0dac09b696c9`, all raw captures, classification/audit rows, the endpoint token version, and the active snapshot pointer.
- Do not retry or activate the candidate, reset data, rotate the export URL, run a transition, restore D1, or reinterpret blocked Free Agents as a rollback shortcut.
