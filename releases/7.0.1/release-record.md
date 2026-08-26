# FranchiseHQ 7.0.1 Release Record

**Status:** Validated local review candidate  
**Production authorized:** No  
**Production changed:** No

## Scope

Contain the known public data, credential, browser-origin, and session-handoff risks identified by the production-readiness audit. Repair the owner-reported refresh-session failure without expanding into database migration repair, Madden NFL 27 activation, league-data reset, or the planned player experience.

## Added during delivery

- Recorded the successful 7.0.0 phone acceptance check.
- Added the owner-reported refresh-session failure to 7.0.1 as a release blocker.
- Added the mobile player-card model/layout and awkward/nested scrolling findings to 7.0.3.
- Generalized the GitHub release-branch workflow trigger so future releases do not require another trigger-only commit.
- Added a controlled-beta disclosure for browser-local Trade Center, Trade Block, GOTW, and Confidence Pool state.
- Replaced raw snapshot payloads with an allowlisted compatibility projection after the final UI review found that inherited roster, player-card, schedule, and standings views still depended on approved fields inside the old raw object.
- Corrected the generated inventory to stamp the current package release instead of retaining a hard-coded 7.0.0 label, and added a regression test.
- Updated the page metadata and cache keys for the modified application/read-model assets so browsers cannot retain the pre-7.0.1 session and pagination code after deployment.

## Security containment implemented

- Added a fail-closed EA-direct directory boundary returning `404` before any credential-bearing experiment runs.
- Required active same-league membership for canonical league metadata, snapshots, Free Agents, and rules.
- Required commissioner access for Companion discovery, capture diagnostics, receiver status, and export history.
- Removed raw source objects from member snapshot and Free Agent DTOs while retaining only explicit, tested roster/schedule/standings fields needed by the current UI.
- Removed unbounded snapshot bulk reads and updated the client to use 500-record pages with hard page/record guards.
- Removed query-string Companion tokens and wildcard CORS.
- Replaced replayable URL session transfers with two-minute, hashed, audience-bound, one-time POST handoffs.
- Made logout and session claim POST-only.
- Repaired refresh recovery when one persistent cookie is stale and the other remains valid.
- Added cross-origin mutation rejection, browser security headers, safe API failures with request IDs, and bounded auth attempt handling.
- Removed runtime rule-table creation and added rules payload limits and structural validation.

## Known inherited blockers

- The seven registered migration defects remain assigned to 7.1.0; strict migration validation is expected to fail.
- The Companion route-discovery receiver retains its token-in-path compatibility URL until 7.0.2 can verify Madden NFL 27 exporter capabilities, rotate the token, and replace or formally constrain that mechanism.
- CSP remains report-only while the inherited inline-script/style architecture is refactored.
- Browser-local official-looking workflows remain non-authoritative and are now disclosed in the UI.
- The legacy `PLATFORM_OWNER_ACCOUNT_ID` client header remains a transitional UI/workflow selector, not a standalone authorization boundary. Every affected server route first requires an authenticated active same-league commissioner; replacement with canonical server-side role policy remains part of the planned authorization rebuild.

## Validation evidence

- Full baseline quality gate: passed with zero unregistered failures.
- Repository lint: 40 engineering files passed.
- JavaScript syntax: 170 modules passed.
- HTML assets: one entrypoint passed.
- Secret scan: 478 files passed with no high-confidence credential literals.
- Migration baseline: seven inherited issues, zero new issues; strict mode remains intentionally blocked until 7.1.0.
- Automated tests: 22 passed, including 16 focused negative security/session cases.
- System inventory: 480 tracked files and 58 Pages Function routes verified.
- GitHub and Cloudflare review checks: not yet published; one final candidate push is planned to limit redundant builds and credit use.

## Deployment status

- Local branch: `codex/franchisehq-7.0.1` from `v7.0.0` / `de01cff`.
- Staging: not deployed.
- Production: unchanged and not authorized.
- Database, league data, and credentials: unchanged.

## Rollback

- Source rollback target: immutable release `v7.0.0` at `de01cff5e8127e1123c7433fd14e5f3972eb032f`.
- 7.0.1 introduces no migration and changes no persistent league data.
- Reverting the application and Functions artifact to `v7.0.0` restores the prior route/session behavior.

## Owner acceptance

Implementation authorization was granted on August 26, 2026. Production approval has not been granted and will be requested only after the full local gate, one hosted review candidate, isolated staging validation, and a concise acceptance checklist are complete.
