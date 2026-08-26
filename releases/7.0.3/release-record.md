# FranchiseHQ 7.0.3 Release Record

**Status:** Validated local review candidate; production authorization pending
**Production authorized:** No
**Production changed:** No — no deployment, migration, league-data, credential, binding, or import-Worker mutation has occurred

## Scope

Correct the failed 7.0.2 owner-acceptance findings as one credit-conscious batch: keep every public user and session on `franchisehq.app`, restore Commish HQ membership loading against the actual production schema, remove duplicate load-error notices, and prepare the missing membership-audit table as a narrowly scoped, idempotent migration.

## Added during delivery

- Confirmed through read-only Cloudflare inspection that production contains `league_memberships` but not `league_membership_audit`; the migration ledger currently records versions 1 through 10.
- Made the membership API detect audit-schema availability and use a conservative existing-field fallback during rollout or recovery.
- Added migration 0015 to create only the missing audit table, membership indexes, audit index, and version-15 ledger entry.
- Made all commissioner invite links use `https://franchisehq.app`.
- Redirected only Cloudflare Pages document navigations to the equivalent canonical application URL while leaving API callbacks reachable.
- Bound new Discord session handoffs begun on a Pages hostname to `franchisehq.app`.
- Deduplicated simultaneous Teams & Owners member loads so a single failure cannot emit repeated notices.
- Shifted Madden NFL 27 intake/reset to 7.0.4 and mobile roster/player-permalink/Trade Block Lite to 7.0.5.

## Security and reliability controls

- The Discord callback stays available at the registered Pages API URL; only document navigation is canonicalized.
- Session handoff remains one-time, hashed, origin-bound, and POST-only.
- The membership fallback grants no new role or team permission. Inactive `team_owner` rows without a team are Pending; other inactive rows remain Disabled.
- The repair migration is additive and idempotent. Its regression test runs it twice and proves existing membership row counts remain unchanged.
- Membership audit writes remain best-effort until migration 0015 is applied; after application they persist normally.
- Production migration requires a current D1 Time Travel recovery point and separate owner authorization.

## Known inherited blockers

- Seven registered migration-sequence defects remain assigned to 7.1.0; strict migration validation is expected to fail.
- The protected preview environment still lacks isolated D1, R2, KV, and OAuth resources, so authenticated hosted staging cannot be claimed.
- The production Discord application still returns OAuth to the Pages callback URL. This is intentionally supported by 7.0.3 while user-facing documents and final sessions remain canonical; changing the registered callback is a later credential/configuration operation.
- Trade Center, Trade Block, GOTW, and Confidence Pool records remain browser-local controlled-beta workflows.
- Madden NFL 27 export discovery, Free Agent verification, controlled league-data reset, mobile player-card layout, and scrolling work remain deferred to their recorded releases.

## Validation evidence

- Read-only production inspection found the precise table mismatch without reading or changing authentication tokens, cookies, credentials, or member data.
- Focused security/onboarding validation passed for canonical routing, callback reachability, canonical OAuth audience, session recovery, missing-audit compatibility, migration idempotence, access controls, and invite-source guards.
- The complete local baseline gate passed with zero unregistered failures and the seven expected migration blockers.
- No hosted check, pull request, production deployment, or production migration is claimed yet.

## Deployment status

- Candidate branch: `codex/franchisehq-7.0.3`.
- Source baseline: production 7.0.2 at `1418d0bba1074f5ab9f4e50453d6837d72dde809`.
- Intended public URL: `https://franchisehq.app/`.
- Production application, D1, league data, credentials, Cloudflare bindings, and import Worker: unchanged.

## Rollback

- Application rollback target: production 7.0.2 at `1418d0bba1074f5ab9f4e50453d6837d72dde809`.
- Immutable recovery tag: `v7.0.0`.
- Migration 0015 creates an empty additive audit table and indexes; application rollback does not require dropping them.
- If the migration itself fails, stop before publication and use D1 Time Travel only if Cloudflare reports a partial database change. Do not delete or rewrite membership rows.

## Owner acceptance

The owner reported the failed refresh behavior, requested canonical `franchisehq.app` invite links, supplied the Commish HQ error screenshot, and asked to continue the corrective work. This authorizes local diagnosis and candidate construction. It does not yet authorize the production migration, push/pull request, merge, or publication. The final phone/desktop checklist is in `docs/AUTH-ONBOARDING.md`.
