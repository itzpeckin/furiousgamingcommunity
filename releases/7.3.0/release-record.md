# FranchiseHQ 7.3.0 Release Record

**Status:** Local completion candidate; real Madden 27 capture reconciled and 2,044 rostered players certified for private preview work

**Production authorized:** No

**Production changed:** No. Production remains on FranchiseHQ 7.1.0. Only the isolated Preview deployment and staging database were changed.

## Scope

Create the private, non-activating Madden NFL 27 discovery layer needed to inspect one real FGC Companion export, identify every required source, prove Free Agent behavior, and safely separate usable rostered-player data from an upstream Free Agent failure before canonical mapping begins.

## Added during delivery

- Added migration 22 for tenant-scoped discovery sessions, session/capture links, and structural discovery reports.
- Replaced minute-bucket grouping with a 30-minute server-issued discovery session so one export remains one unit across minute boundaries.
- Return each capture URL once, persist only its SHA-256 token hash, cancel the prior open URL when replaced, and fail closed after expiry.
- Link repeated identical payloads to the current session without duplicating the same raw R2 object.
- Added structural route/dataset/field/type/relationship/source-marker inventory without returning raw team/player values.
- Added explicit Free Agent states for populated, explicitly empty, missing, and Madden-failed responses.
- Added privacy-safe roster assignment evidence covering team-route completeness, player-ID uniqueness, team assignment, route/team agreement, `isFreeAgent`, and active/inactive counts.
- Updated the player mapper so a failed Free Agent request cannot discard successful team rosters, while the response clearly reports `rostered-players-only` completeness.
- Prevented an older successful Free Agent payload from being blended into a newer roster export cohort.
- Corrected successful explicit zero-player Free Agent responses so they are accepted as `empty-confirmed` rather than mislabeled as unusable.
- Added a sanitized regression fixture and source-lock contract covering teams, rosters, players, Free Agents, standings, schedules, and statistics.
- Added the private Platform Workspace workflow for starting a capture, copying the one-time URL, inspecting the latest session, and viewing pass/review results.
- Revised the roadmap through 7.3.9 to include permanent season/player/GM identity, sub-60-second certification, safe reset/season transition, FGC certification, GM history/trophies, and incremental updates.
- Made the 7.3.2 importer explicitly commissioner-operated, including one-time destination creation, live progress and timing, completeness states, validation warnings, and a private review result before protected activation.

## Known inherited blockers

- The accepted refresh/login inconvenience remains frozen until 7.5.0.
- 7.2.0 is staging validated but production is still 7.1.0; 7.3.0 must not be deployed to production ahead of its migration baseline.
- Madden's explicit `xbsx/742482/freeagents/roster` request returned `success: false` with an empty `rosterInfoList`. This is an upstream blocker for a complete player pool, not evidence that FGC has zero Free Agents.
- The under-60-second end-to-end performance gate belongs to 7.3.2 and requires a realistic FGC payload after 7.3.0 locks the source shape.
- No FGC reset, mapping, import, active-snapshot switch, historical archive, or ownership reassignment is included.

## Validation evidence

- Synthetic Madden 27 fixtures prove populated, explicitly empty, missing, and failed Free Agent outcomes remain distinct.
- A complete synthetic capture proves teams, rosters, players, Free Agents, standings, schedule, statistics, source identity, season, and week can pass one structural report.
- The real FGC source delivered 43 requests totaling 10.17 MB in 0.448 seconds: 32 teams, 32 team-roster payloads, 2,044 rostered players, standings, 14 current-week games, and 510 statistics rows.
- All 2,044 rostered-player rows have unique identifiers, valid team assignments, matching team routes, and `isFreeAgent: false`; 2,031 are active and 13 inactive. No duplicate or unassigned roster rows were found.
- A realistic 32-team/2,044-player regression proves the rostered-player source remains preview-ready when the explicit Free Agent request fails, while the full report correctly remains `review_required`.
- Privacy regression proves player/team sample values do not appear in the report or sanitized fixture.
- Migration 22 creates three mandatory tenant-scoped tables and a continuous ledger through version 22 with zero foreign-key violations.
- Short-lived token, hash-only storage, cross-minute session continuity, duplicate-payload linking, and no-activation boundaries are contract-tested.
- Local validation passes 72 automated tests, 187 JavaScript modules, 529-file secret scan, 513-file deterministic inventory, 61 Pages routes, 57 required database tables, and the complete strict release gate.

## Deployment status

- Local branch: `codex/franchisehq-7.3.0`.
- Source baseline: staging-validated 7.2.0 commit `5799c35675c85695194234119fbe28f8dda76ed1`.
- Repository commit `d4362fabcc44142de59ca96d5f7a6e7c8d740a43` was pushed to `codex/franchisehq-7.3.0`; GitHub reports 3/3 hosted checks passing. The live-capture reconciliation and completion changes described here are local and have not yet been committed, pushed, or deployed.
- Migration 22 was applied only to `franchise-hq-staging-db` (`3d74929a-3bf1-49e8-a7ef-8ba28ed66816`) after recording a private recovery bookmark. Verification shows schema version 22, 22 ledger entries, 58 application tables, all three discovery tables, all five discovery indexes, zero foreign-key violations, and zero staging leagues, users, memberships, or active snapshots before discovery setup.
- Cloudflare Preview deployment `3dc10c9a-6c4a-48da-aaf9-9b3a2dbdb44b` succeeded from exact commit `d4362fa` in 18 seconds at `https://3dc10c9a.franchise-hq.pages.dev` with branch alias `https://codex-franchisehq-7-3-0.franchise-hq.pages.dev`.
- The owner's network cannot resolve the canonical `franchisehq.app` redirect reached by Preview document requests. This does not affect the non-document `/api/...` Companion destination, which will be verified with the short-lived discovery session before source lock is accepted.
- One isolated FGC Madden 27 capture was completed under discovery session `m27_ad4c07b8-0725-4329-9a07-9d8ac0f97a3c`. The previously deployed Preview build received the source; the updated assignment-certification report requires redeploying this exact completion candidate to isolated staging.
- FGC reset/import/activation: not authorized and not run.

## Rollback

- Before publication, rollback is simply abandoning the local 7.3.0 branch; production remains unchanged.
- After an authorized migration, normal code rollback retains the additive discovery tables. Do not drop or reverse migration 22.
- Discovery-session tokens expire and are unrecoverable from their hashes. Starting a new session cancels the previous open session.
- Captured R2 objects are private and inactive. Deletion or database Time Travel recovery requires an exact target review and separate owner authorization.
- Full recovery instructions remain in `docs/ROLLBACK.md` and `docs/DATABASE-OPERATIONS.md`.

## Owner input required for the next gate

Review the exact completion candidate, then separately authorize one consolidated commit/push and isolated-staging redeployment. The updated report can then certify the stored 2,044-player source without rerunning the Companion export. Production reset, import, activation, and ownership changes remain separate decisions.
