# FranchiseHQ 7.3.2 Release Record

**Status:** Isolated-staging validated; the commissioner-operated 2026 private candidate import completed in 23.456 seconds

**Production authorized:** No

**Production changed:** No. Production remains FranchiseHQ 7.1.0.

## Scope

Provide an authenticated commissioner with one explicit private 2026 season destination and a measured Madden 27 workflow that analyzes the captured export, pins exact mapper runs, builds an append-only candidate, validates it, and stops at preview-ready. The target is under 60 seconds for the real 32-team/2,044-rostered-player source.

## Added during delivery

- Added migration 24 with tenant-scoped private import destinations and durable candidate-run state keyed by a source fingerprint.
- Added a commissioner-only candidate API with bounded phases, counts, warnings, elapsed time, retry guidance, exact mapping IDs, and active-snapshot before/after verification.
- Rebuilt the Commissioner One-Click Import workspace around explicit destination creation and the non-activating candidate pipeline.
- Replaced the server Worker activation flow with the same delegated-commissioner candidate workflow and a 15-minute delegation.
- Made analysis, schedule mapping, statistics mapping, candidate building, and validation commissioner-operable while preserving platform-owner authorization for activation and rollback.
- Changed candidate building to append-only storage and pinned all four exact mapping runs. No prior snapshots or previews are pruned.
- Preserved blocked Madden Free Agents as unknown/null and labeled the candidate `rostered-players-only`.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. FranchiseHQ cannot claim a complete player pool and must not report zero Free Agents.
- The Madden payload did not provide source-franchise or season markers. The already reviewed permanent season identity fixes this candidate to season year 2026.
- The accepted refresh/login inconvenience remains frozen until 7.5.0.

## Validation evidence

- Migration and contract tests cover a fresh database, production-shaped upgrade, one destination per reviewed season, source-fingerprint idempotency, foreign-key integrity, and runtime schema version 24.
- Source guards prove commissioner authorization, append-only candidate building, exact mapping pins, protected activation/rollback, no active-pointer write, no reset, and no legacy/demo fallback.
- The UI and Worker report every bounded phase and duration, return retry guidance on failure, and explicitly stop at private preview-ready.
- The isolated-staging rehearsal verified the real 2026 source: 43 captures, 32 teams, 2,044 rostered players, 14 games, 510 canonical statistic rows, and 32 standings rows.
- The candidate reached `preview-ready` with validation `ready`, zero validation errors, `rostered-players-only`, blocked/null Free Agents, and a 23.456-second wall-clock duration.
- Active snapshot IDs were null before and after, the active-snapshot table remained empty, and foreign-key verification returned zero violations.

## Deployment status

- Baseline: exact commit `483c4b81ba55509c9ce9542827f307d6192585e1`.
- Branch: `codex/franchisehq-7.3.2`.
- The consolidated strict gate passes: 77/77 automated tests, 194 JavaScript modules, 544 secret-scanned text files, 522 inventory files, 63 routes, 68 required tables, and zero registered or unregistered failures.
- PR #12 is open from `codex/franchisehq-7.3.2` into `codex/franchisehq-7.3.1`. Exact implementation commit `a17801a8d749ea34a74f6a94db5432a40752cb4a` passed all four hosted checks.
- Cloudflare Pages Preview deployment `6d7f2591-944b-4060-b1e6-b1c9c562a521` succeeded from `a17801a` at `https://6d7f2591.franchise-hq.pages.dev`.
- The hosted Worker check built successfully but did not deploy a new Worker version; Worker deployment history remains unchanged since August 26, 2026.
- Migration 24 was applied only to `franchise-hq-staging-db` after bookmark `00000021-00000000-000050d6-9df61ce517ecc2bdce67316ce773ce34`. Post-migration bookmark: `00000021-00000008-000050d6-ddd53183152b9a536b0d09f6ead868f5`.
- Staging advanced from ledger 23/66 tables to ledger 24/68 tables. Protected counts were unchanged and foreign-key violations remained zero.
- Candidate destination `import_destination_39ba5a64-0bec-4641-9cd8-2d125b845abb`, run `candidate_import_8ed066b0-be0e-472d-8fa5-775da40aa22b`, and snapshot `555f89cb-eacd-438f-861a-be4621eadfac` are retained for review.
- One 15-minute simulated commissioner session was created for this rehearsal and then revoked. The retained membership is inactive; all four retained staging sessions are revoked, active sessions are zero, and all identity/candidate/audit rows remain.
- Production, Main, data reset, and snapshot activation were not run.
- Production, Main, data reset, and snapshot activation are not authorized and will not run.

## Rollback

- Before isolated-staging migration, discard only the 7.3.2 branch commit; all environments remain unchanged.
- After the authorized staging migration, migration 24 is additive and remains in the staging ledger during code rollback.
- Candidate, audit, and identity rows are retained. Any removal requires exact-target review and separate authorization.
