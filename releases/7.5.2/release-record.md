# FranchiseHQ 7.5.2 Release Record

**Status:** Locally validated and Production-authorized candidate

**Production changed:** No. Production evidence remains FranchiseHQ 7.5.0 on migration 36. Current GitHub Main contains the Mac-authored 7.5.1 work and is the immutable source baseline for this correction.

## Scope

Correct the browser presentation boundary that could relabel a canonical Week 10 game as Week 1 when its retained Madden provenance still named the All Weeks sentinel route `/week/reg/0/`. The active snapshot's canonical week remains authoritative for that sentinel provenance, while ordinary nonzero routes retain their existing authority.

The accepted 7.4.0.2 server correction remains intact: non-empty All Weeks schedule and statistic payloads resolve their payload period, and empty Week 0 placeholders remain non-playable. The already-completed retained 43-route reanalysis, corrected candidate, and atomic activation are not repeated because subsequent owner-accepted imports have advanced Production beyond that historical snapshot.

## Added during delivery

- The shared browser week resolver treats only regular-season route Week 0 as sentinel provenance when a canonical one-based snapshot/game week is available.
- With no canonical week, route Week 0 remains Week 0 and is excluded as a placeholder instead of becoming Week 1.
- Every ordinary nonzero route continues to win over fallback metadata.
- The league shell now uses one shared active-snapshot season resolver, preventing standing-source Week 0 metadata from forcing the home, schedule, results, or statistic views to Week 1.
- Release asset keys advance to 7.5.2 so browsers fetch the corrected resolver and application shell.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is never interpreted as zero.

Current Main also includes the accepted 7.5.1 Discord trade implementation. Production is still recorded on migration 36, so cumulative Main deployment requires the additive migration 37 and the exact non-destructive `/trade` command upsert. Neither operation resets or deletes league data, rotates the Madden export URL, archives or transitions a season, changes the active snapshot, or modifies credentials.

## Validation evidence

Focused regression coverage proves canonical Week 10 wins over `/week/reg/0/` provenance, an unresolved Week 0 remains a placeholder, nonzero route authority is preserved, and standing sentinel metadata cannot override the active snapshot. The focused Week/import regression passes 48/48 tests. The complete strict gate passes 207/207 automated tests, 255 JavaScript syntax checks, 599 inventoried files, 76 routes, migration 37 schema validation, deterministic inventory, secret scanning, environment validation, and the release contract. Release tooling also proves an exact `/trade`-only upsert selects one command and retires no names.

## Deployment status

The owner authorized publication, merge, and Production deployment for the Week 10 reporting correction. No external operation has run yet. Deployment will use Git-integrated Cloudflare Pages from Main; direct uploads remain prohibited. No Madden export, candidate import, snapshot activation, reset, deletion, archive, transition, or URL rotation is required for this presentation correction.

## Rollback

Restore exact Main source baseline `5619b1e97edd5e75a03aaf72aa23a8a277d57e11` if runtime acceptance fails. Leave additive migration 37 in place if it has been applied. Do not roll back, delete, or mutate retained snapshots, imports, source captures, reports, audits, trades, memberships, assignments, Discord credentials, permanent export URLs, or blocked/null Free Agent state.
