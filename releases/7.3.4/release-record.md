# FranchiseHQ 7.3.4 Release Record

**Status:** Consolidated local implementation and validation complete; publication and Production are not authorized

**Production changed:** No. Production remains on exact 7.3.3 runtime `b373f661101c33a2ee2bd17433cfe4001f166b3f` with active snapshot `841ce1b5-a4a6-4246-a53a-01cd1f189663`.

## Scope

Make repeated commissioner imports source-specific so a newly analyzed Madden export can create a new private candidate even when the previous export is already `Preview ready`. Certify the capture's Madden-week coverage, carry eligible same-season history forward, and keep activation separate.

## Added during delivery

- Scoped the visible candidate run to the newest analyzed export's exact report, capture digest, identity preview, and destination fingerprint instead of the league's most recently created run.
- Preserved idempotency: the exact same export reuses its existing private candidate, while a different fingerprint offers **Build New Candidate**.
- Added capture time, source fingerprint, active/captured week, and week-continuity status to the commissioner importer.
- Added explicit current-week schedule/statistics proof and visible warnings for unknown, partial, stale, or skipped week coverage. A stale capture is refused before candidate work begins.
- Added same-game-year, same-franchise-season history carry-forward for older game and statistic records. Fresh records win exact-ID conflicts, and current/future-week records are never copied from the prior snapshot.
- Recorded source coverage and retained-history counts in the immutable candidate manifest.
- Kept the active snapshot unchanged through analysis, mapping, build, validation, and finalization. Candidate creation remains append-only and non-activating.
- Kept blocked Madden Free Agents unknown with a null count.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. A 7.3.4 candidate remains rostered-player-only until Madden supplies a successful or explicitly empty response.
- If the active snapshot is Week 7 and the new export supplies only Week 9, Week 8 cannot be invented. 7.3.4 carries available older history forward and visibly reports Week 8 as missing.
- 7.3.4 is a commissioner-triggered clean forward candidate. Automated recurring weekly updates and freshness monitoring remain scheduled for 7.3.8.
- Authentication refresh, league-scoped shareable URLs, and expanded player ratings remain later roadmap work.

## Validation evidence

- 94/94 automated tests pass, including new Week 9 coverage, skipped-week disclosure, same-source reuse, different-source candidate allowance, history carry-forward, fresh-record precedence, and current-week stale-record exclusion.
- Source guards prove candidate APIs cannot activate/reset/prune, every mapper remains pinned to the exact analyzed discovery session, and finalization uses that run's exact report rather than whichever report became newest later.
- The schema remains at continuous migration version 25 with 78 required application tables; 7.3.4 adds no migration.
- The deterministic repository gate syntax-checks 198 JavaScript modules, retains 64 routes, and preserves the production environment/tenant contracts.

## Deployment status

- Local branch `codex/franchisehq-7.3.4` contains the validated review candidate.
- Branch publication, pull request creation, hosted checks, staging, and Production deployment are not authorized and have not run.
- No real Week 9 capture or candidate import has run. No snapshot was activated, reset, transitioned, archived, removed, or recovered.
- Git Main remains `4045e02980c93491b47910f17fcb2e48fae76c68`.

## Rollback

- Before publication, discard the 7.3.4 branch and return to exact evidence baseline `c5b87dbb46cb42841510538cbcb8bf4272ed772e`.
- After any future authorized deployment, runtime rollback restores exact 7.3.3 Production deployment `e926a37f-50b1-4b8c-af83-84364a7d4960`; migration 25 remains intact.
- Candidate rows are append-only and inactive. Do not delete a candidate, reset data, or change the active pointer as an improvised rollback.
