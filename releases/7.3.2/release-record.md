# FranchiseHQ 7.3.2 Release Record

**Status:** Local candidate validated; publication, hosted checks, and isolated-staging candidate rehearsal pending

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
- The isolated-staging rehearsal will verify the real 2026 source counts, wall-clock duration, validation result, blocked-Free-Agent state, and an unchanged active-snapshot count.

## Deployment status

- Baseline: exact commit `483c4b81ba55509c9ce9542827f307d6192585e1`.
- Branch: `codex/franchisehq-7.3.2`.
- The consolidated strict gate passes: 77/77 automated tests, 194 JavaScript modules, 544 secret-scanned text files, 522 inventory files, 63 routes, 68 required tables, and zero registered or unregistered failures.
- Publication, hosted checks, Preview deployment, migration 24 application, and authenticated candidate rehearsal are authorized and pending.
- Production, Main, data reset, and snapshot activation are not authorized and will not run.

## Rollback

- Before isolated-staging migration, discard only the 7.3.2 branch commit; all environments remain unchanged.
- After the authorized staging migration, migration 24 is additive and remains in the staging ledger during code rollback.
- Candidate, audit, and identity rows are retained. Any removal requires exact-target review and separate authorization.
