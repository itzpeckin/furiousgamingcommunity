# FranchiseHQ 7.0.5 Release Record

**Status:** Local validation passed; one consolidated production publication cycle authorized
**Production authorized:** Yes, only after green local and hosted gates
**Production changed:** No application, database, membership, league-data, credential, binding, or hosted configuration change has occurred at this candidate boundary.

## Scope

Complete the login/member-management foundation needed to invite FGC users: make Discord authentication origin-specific, preserve the exact protected screen across refresh and login, protect mobile browser-context handoff with an identity confirmation, and consolidate Commissioner membership controls into Teams & Owners without removing the new-player Pending queue.

## Added during delivery

- Added exact public and owner callback contracts. `franchisehq.app` and the owner-only `franchise-hq.pages.dev` fallback now use their own Discord redirect URL and their own host-scoped session.
- Carried a normalized league route plus safe hash through OAuth state so Commissioner HQ, Trade Center, and Trade Block can return to the initiating screen.
- Replaced the server's hash-losing unauthenticated redirect with a no-store authentication bridge that reads the browser hash before beginning login.
- Created the session directly on a matching callback origin when the OAuth state cookie is present.
- Added a one-time, origin-bound mobile handoff confirmation that shows the Discord identity before continuing when Discord changes browser context and the state cookie is unavailable.
- Preserved the configured identity plus active-commissioner gate for the exact Pages owner fallback. Preview Pages domains and ordinary members remain public-domain only.
- Removed standalone Active and Disabled Discord member panels; retained **New players awaiting assignment**.
- Made **Teams & Owners → Manage** the single workflow for team assignment, role assignment, access revocation, and explicit reactivation of revoked access.
- Required a canonical imported team for every active FGC role by secure default, while allowing a future league to deliberately opt out through a server-owned per-league policy.
- Added responsive Pending-row and Manage-action treatment for mobile browsers.
- Added focused regressions covering callback selection, same-origin session creation, route recovery, mobile confirmation, UI consolidation, team policy, and reactivation intent.

## Security and reliability controls

- Callback variables are accepted only when they exactly match the expected allowed origin and Discord callback path. HTTPS is mandatory outside localhost.
- OAuth state remains short-lived and single-use, and records the initiating origin, callback, and safe return route.
- A hash route must be one of the normalized league screens; protocol-relative URLs, foreign origins, and arbitrary paths fail closed to the league root.
- Missing state cookies never cause an invisible cross-context session swap. The returned Discord identity is displayed and a deliberate action is required.
- The Pages fallback remains restricted to the configured owner Discord identity plus active commissioner access; domain support does not weaken tenant or role authorization.
- Active membership requires a canonical imported team by default for all roles. Revoked membership additionally requires explicit `reactivate` intent.
- Duplicate-team, current-commissioner self-lockout, final-commissioner, cross-origin, cross-league, and audit protections remain enforced on the server.
- No Madden records, memberships, roles, teams, rules, imports, or database schema are mutated by publishing this application release.

## Known inherited blockers

- Seven registered migration-sequence defects remain assigned to 7.1.0; strict fresh-database validation is expected to fail.
- Protected hosted staging still lacks fully isolated D1, R2, KV, and OAuth resources.
- The Madden Companion App has not supplied the accepted representative Madden NFL 27 export; schema adaptation, Free Agent proof, and activation remain deferred.
- Trade Center, Trade Block, GOTW, and Confidence Pool workflow records remain controlled-beta/browser-local rather than authoritative shared workflows.
- The Pages fallback is an owner-only operational exception, not the final multi-tenant custom-domain model.
- Final phone and desktop acceptance depends on the production build being deployed; both exact callback URLs are registered and verified.

## Validation evidence

- JavaScript syntax passes across 176 modules.
- Forty-six automated checks cover repository policy, tooling, security, authentication, onboarding, authorization, database, environment, and release behavior; thirty-nine are focused security tests.
- Authentication regressions exercise both callback origins, direct same-origin cookies, route/hash normalization, owner fallback gating, one-time handoff, identity confirmation, and unsafe return rejection.
- Commissioner regressions prove the old Active/Disabled panels and legacy renderer are absent, the Pending queue remains, active roles require a team, revoked access requires explicit reactivation, and lockout protections remain.
- The complete baseline gate, deterministic inventory, and release contract are rerun immediately before publication.
- Device acceptance remains pending production publication and follows `docs/AUTH-ONBOARDING.md`.

## Deployment status

- Candidate branch: `codex/franchisehq-7.0.5` from exact production commit `60e8d46bf2c55894fff4f88c33d8b43ed2643bc4`.
- Owner authorization: one credit-conscious candidate commit/push, one pull request, required hosted checks, and one production merge/deployment.
- Discord callbacks: both exact URLs registered and verified by reloading the Discord Developer Portal.
- Pull request and Cloudflare deployment: not yet run at this candidate boundary.
- Production migrations: none.
- Production membership/team edits: none.
- FGC Madden/test-data reset: not authorized and not run.

## Rollback

- Application rollback target is production 7.0.4 at `60e8d46bf2c55894fff4f88c33d8b43ed2643bc4`.
- Immutable recovery tag remains `v7.0.0` until a later tag is authorized.
- 7.0.5 has no migration and performs no release-time data mutation, so rollback is an application-code rollback only.
- Existing cookies are host-scoped. If rollback is required, the 7.0.4 login behavior returns with no database restoration or membership reconstruction.

## Owner acceptance

The owner authorized 7.0.5 after confirming the Pages owner fallback and access-management foundations, then reporting exact-screen refresh loss, mobile re-login, a Pages-only Discord return, and duplicated Commissioner member panels. The accepted product decision is: retain the Pending queue; manage team, role, revoke, and reactivation inside Teams & Owners; require all active FGC members to own a team; preserve `franchisehq.app` as the public product domain; and keep the exact Pages hostname as the owner's restricted fallback. No data reset is included.
