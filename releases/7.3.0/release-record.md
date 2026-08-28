# FranchiseHQ 7.3.0 Release Record

**Status:** Local candidate validated; live Madden 27 source lock pending

**Production authorized:** No

**Production changed:** No application, database, Madden data, active snapshot, membership, Discord configuration, credential, or hosted resource has been changed.

## Scope

Create the private, non-activating Madden NFL 27 discovery layer needed to inspect one real FGC Companion export, identify every required source, prove Free Agent behavior, and produce a sanitized source-lock report before canonical mapping begins.

## Added during delivery

- Added migration 22 for tenant-scoped discovery sessions, session/capture links, and structural discovery reports.
- Replaced minute-bucket grouping with a 30-minute server-issued discovery session so one export remains one unit across minute boundaries.
- Return each capture URL once, persist only its SHA-256 token hash, cancel the prior open URL when replaced, and fail closed after expiry.
- Link repeated identical payloads to the current session without duplicating the same raw R2 object.
- Added structural route/dataset/field/type/relationship/source-marker inventory without returning raw team/player values.
- Added explicit Free Agent states for populated, explicitly empty, missing, and Madden-failed responses.
- Added a sanitized regression fixture and source-lock contract covering teams, rosters, players, Free Agents, standings, schedules, and statistics.
- Added the private Platform Workspace workflow for starting a capture, copying the one-time URL, inspecting the latest session, and viewing pass/review results.
- Revised the roadmap through 7.3.9 to include permanent season/player/GM identity, sub-60-second certification, safe reset/season transition, FGC certification, GM history/trophies, and incremental updates.

## Known inherited blockers

- The accepted refresh/login inconvenience remains frozen until 7.5.0.
- 7.2.0 is staging validated but PR #9 remains open and production is still 7.1.0; 7.3.0 must not be deployed ahead of its migration baseline.
- No real Madden NFL 27 export has been captured yet, so the source league/franchise ID, season/week markers, exact routes, source counts, and Free Agent count remain unverified.
- The under-60-second end-to-end performance gate belongs to 7.3.2 and requires a realistic FGC payload after 7.3.0 locks the source shape.
- No FGC reset, mapping, import, active-snapshot switch, historical archive, or ownership reassignment is included.

## Validation evidence

- Synthetic Madden 27 fixtures prove populated, explicitly empty, missing, and failed Free Agent outcomes remain distinct.
- A complete synthetic capture proves teams, rosters, players, Free Agents, standings, schedule, statistics, source identity, season, and week can pass one structural report.
- Privacy regression proves player/team sample values do not appear in the report or sanitized fixture.
- Migration 22 creates three mandatory tenant-scoped tables and a continuous ledger through version 22 with zero foreign-key violations.
- Short-lived token, hash-only storage, cross-minute session continuity, duplicate-payload linking, and no-activation boundaries are contract-tested.
- Local validation passes 69 automated tests, 187 JavaScript modules, 529-file secret scan, 513-file deterministic inventory, 61 Pages routes, 57 required database tables, and the complete strict release gate.

## Deployment status

- Local branch: `codex/franchisehq-7.3.0`.
- Source baseline: staging-validated 7.2.0 commit `5799c35675c85695194234119fbe28f8dda76ed1`.
- Repository commit/push/pull request: not authorized and not run.
- Migration 22 on staging or production: not authorized and not run.
- Preview/production deployment: not authorized and not run.
- Real FGC Madden 27 capture/source lock: not authorized and not run.
- FGC reset/import/activation: not authorized and not run.

## Rollback

- Before publication, rollback is simply abandoning the local 7.3.0 branch; production remains unchanged.
- After an authorized migration, normal code rollback retains the additive discovery tables. Do not drop or reverse migration 22.
- Discovery-session tokens expire and are unrecoverable from their hashes. Starting a new session cancels the previous open session.
- Captured R2 objects are private and inactive. Deletion or database Time Travel recovery requires an exact target review and separate owner authorization.
- Full recovery instructions remain in `docs/ROLLBACK.md` and `docs/DATABASE-OPERATIONS.md`.

## Owner input required for the live gate

After separate staging publication authorization, the owner will enter the platform, franchise season, and current week; start one secure capture; copy the one-time URL into the Madden Companion export destination; run League Info, Rosters, and Weekly Stats; and then select **Analyze Captured Export**. The report must locate every required dataset and explicitly prove Free Agent status before 7.3.0 is considered source-locked.
