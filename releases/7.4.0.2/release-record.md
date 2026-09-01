# FranchiseHQ 7.4.0.2 Release Record

**Status:** Locally validated and Production-authorized candidate

**Production changed:** Not yet. Production remains on 7.4.0.1 with malformed Week 0 snapshot `ab083570-091a-4583-a8f7-54b99087e87a` active and prior Week 9 snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e` retained.

## Scope

Correct Madden Companion All Weeks aggregate routes. A non-empty `/week/reg/0/` schedule or statistics route resolves its canonical period from the payload's zero-based `stageIndex` and `weekIndex`. The observed Production payload resolves `stageIndex: 1, weekIndex: 9` to Regular Season Week 10.

Normal nonzero route authority remains unchanged. Empty `/week/reg/0/` routes remain harmless lifecycle placeholders and do not create Week 0 data.

## Added during delivery

Canonical period evidence is now shared by discovery, coverage analysis, schedule mapping, statistics mapping, and malformed-snapshot carry-forward filtering. The evidence is also included in the sanitized source fingerprint so the corrected retained source cannot reuse the malformed candidate.

## Candidate and snapshot behavior

- The corrected canonical period is recorded in source markers, dataset inventory, and sanitized release evidence.
- The corrected report fingerprint differs from the malformed report, forcing a new isolated candidate instead of reusing the already-live malformed candidate.
- Schedule and statistics mappers use the resolved canonical Week 10 period.
- Malformed Week 0 rows resolve from their retained source-record provenance and are not carried into the corrected Week 10 snapshot.
- Activation remains atomic and retains the malformed and prior Week 9 snapshots plus every audit row.
- Blocked Madden Free Agents remain unknown/null and are never interpreted as zero.

## Authorized Production sequence

1. Publish the exact validated branch, pass hosted checks, merge to Main, and deploy Production.
2. Reanalyze the exact retained 43-route source without requesting another Madden export.
3. Stop unless the report resolves Regular Season Week 10 with schedule and statistics coverage.
4. Build and validate one new candidate from that corrected fingerprint.
5. Stop unless the candidate is validation-ready, contains 32 teams, preserves rostered-player integrity, and reports Week 10.
6. Atomically activate the corrected candidate and verify the live Week 10 schedule and snapshot pointer.

## Boundaries

Do not request another export, reset or delete data, rotate the export URL, archive or transition a season, apply a migration, or reinterpret blocked Free Agents as zero. No existing snapshot or audit record may be deleted.

## Known inherited blockers

Madden's explicit Free Agent source remains blocked upstream. Its count remains unknown/null, never zero.

## Validation evidence

The consolidated gate passes 149/149 automated tests, 222 JavaScript modules, 554 inventoried files, 69 routes, 90 required tables, and zero strict failures.

## Deployment status

Production deployment, retained-source reanalysis, corrected candidate construction, and atomic activation are owner-authorized but not yet run. Production remains on 7.4.0.1 with snapshot `ab083570-091a-4583-a8f7-54b99087e87a` active.

## Rollback

Restore the accepted 7.4.0.1 runtime at Main `f04a41529fa901836ef7d49adf8789a281b7626f`. If activation has occurred, use the existing atomic snapshot lifecycle rollback to the retained malformed snapshot or prior Week 9 snapshot selected by the validation evidence. Do not delete the corrected, malformed, or prior snapshots, source captures, reports, candidates, or audits.
