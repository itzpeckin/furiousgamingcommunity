# FranchiseHQ 7.0.3 Release Record

**Status:** Production deployed and database repair verified; owner phone/desktop acceptance pending
**Production authorized:** Yes — owner authorized migration 0015 and the conditional squash merge on August 26, 2026
**Production changed:** Yes — application commit `9c5401a` is live and additive migration 0015 is applied. No user, membership, team, league, imported Madden, credential, or binding value changed.

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
- Pull request #5 passed all four checks and squash-merged to `main` as `9c5401a6c09a27275573115ebcd09e4b0e61fb21`.
- Production GitHub quality run #36 and GitHub Pages run #1214 completed successfully.
- Cloudflare Pages deployment `f00a1839-ad9c-4458-b772-6b013bf39840` completed successfully in 20 seconds from `main` commit `9c5401a`; Cloudflare lists `franchisehq.app` as its production alias.
- A current D1 Time Travel recovery bookmark was recorded before mutation.
- The production precheck found three membership rows, no audit table, and no migration-15 ledger entry.
- The production postcheck found the same three membership rows, zero audit rows, the audit table, migration-15 ledger entry, and all four required indexes.
- Final phone/desktop session and onboarding acceptance remains an owner-operated check.

## Deployment status

- Pull request: #5, merged.
- Candidate branch: `codex/franchisehq-7.0.3`.
- Source baseline: production 7.0.2 at `1418d0bba1074f5ab9f4e50453d6837d72dde809`.
- Production commit: `9c5401a6c09a27275573115ebcd09e4b0e61fb21`.
- Cloudflare deployment: `f00a1839-ad9c-4458-b772-6b013bf39840` (`success`).
- Public URL: `https://franchisehq.app/`.
- D1 migration 0015: applied and verified; three membership rows preserved.
- League data, credentials, and Cloudflare binding values: unchanged.

## Rollback

- Application rollback target: production 7.0.2 at `1418d0bba1074f5ab9f4e50453d6837d72dde809`.
- Immutable recovery tag: `v7.0.0`.
- Migration 0015 creates an empty additive audit table and indexes; application rollback does not require dropping them.
- If the migration itself fails, stop before publication and use D1 Time Travel only if Cloudflare reports a partial database change. Do not delete or rewrite membership rows.

## Owner acceptance

The owner reported the failed refresh behavior, requested canonical `franchisehq.app` invite links, supplied the Commish HQ error screenshot, authorized pull request #5, and then explicitly authorized migration 0015 followed by the squash merge only if the database postcheck passed. Those actions completed successfully. Final owner acceptance remains the phone/desktop checklist in `docs/AUTH-ONBOARDING.md`.
