# FranchiseHQ 7.0.1 Release Record

**Status:** Hosted review passed; isolated staging blocked
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
- The first hosted GitHub run passed all 22 application/security/tooling tests but exposed a worktree-only inventory mismatch: Windows represented `.git` as a pointer file while GitHub represented it as a directory. Repository metadata is now excluded in both forms and a 23rd regression test prevents recurrence.
- Updated the server-rendered public landing page release label and response header from the inherited 6.3.2 value to 7.0.1.

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
- Automated tests: 23 passed, including 16 focused negative security/session cases.
- System inventory: 479 tracked files and 58 Pages Function routes verified.
- GitHub quality workflow: passed on the hosted review branch.
- Cloudflare Pages preview build: passed; the public landing page returned `200` with the expected security headers.
- Cloudflare import-Worker build: passed.
- Protected league staging smoke: blocked because the preview has no isolated D1, R2, KV, or OAuth resources. The protected route fails before application validation because no preview D1 binding exists.

## Deployment status

- Local branch: `codex/franchisehq-7.0.1` from `v7.0.0` / `de01cff`.
- Staging preview: deployed at `https://codex-franchisehq-7-0-1.franchise-hq.pages.dev/`; public smoke passed, but the environment is not a valid isolated application staging environment because its data/auth bindings are absent.
- Production: unchanged and not authorized.
- Database, league data, and credentials: unchanged.
- Production resources were deliberately not connected to the preview.

## Rollback

- Source rollback target: immutable release `v7.0.0` at `de01cff5e8127e1123c7433fd14e5f3972eb032f`.
- 7.0.1 introduces no migration and changes no persistent league data.
- Reverting the application and Functions artifact to `v7.0.0` restores the prior route/session behavior.

## Owner acceptance

Implementation authorization was granted on August 26, 2026. The full local gate and hosted review checks have passed. Production approval has not been granted. Protected staging validation remains blocked until isolated Cloudflare resources can be created safely; the inherited fresh-database migration defects that prevent that are assigned to 7.1.0.
