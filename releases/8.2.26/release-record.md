# FranchiseHQ 8.2.26

## Scope

EA Direct collections could recover from a late retry and finish, then appear to reset: the progress card disappeared, leaving a small sentence and an enabled Collect button. Weekly completion did not refresh the saved-export and import services. Production review found both reported attempts completed at 16:08:20 and 16:10:18 UTC with all 52 datasets, complete rosters and 591 free agents. Authenticated read-only inspection confirmed the newer export available with Import Latest Export enabled. The exact historical retry causes were not retained; this release does not claim an EA outage or repair an identified provider failure.

## Added during delivery

A persistent completion card replaces the retry warning in the same visible position. It includes completion time, dataset count, collection details and Continue to Import. Completed weekly collections refresh import readiness on completion or reopening, once per collection, without starting any import or export. The action refreshes and scrolls to the real import controls. Readiness interruptions retain completion and offer another read instead of Retry Import. Context guards discard old-league handoff results. The collector preserves the last eight safe retry diagnostics through successful checkpoints and final completion, under the existing lock and tenant guards. Raw errors, credentials, provider response bodies and URLs are not retained.

## Known inherited blockers

No publication blocker is known. The precise causes of historical checkpoint retries are unavailable. New diagnostics apply to subsequent attempts; provider requests, workflow retries and pacing are unchanged.

## Validation evidence

100 focused tests pass, including all three actual frontend services, prior-live-export replacement, no automatic writes, failed-readiness recovery, stale-league rejection, bounded diagnostic persistence, safe provider metadata, credential rotation and replay. The full strict gate passes all 681 tests. Real-browser isolated acceptance passes automatic completion, replacement of the previous live export, readiness interruption and recovery, zero writes, zero browser errors, and a completion card without overflow at 900px and 358px container widths. These are container checks, not mobile viewport emulation. Authenticated production acceptance follows deployment.

## Deployment status

Implementation and publication are authorized. Local candidate validation is complete; hosted preview and final CI verification precede merge. Schema stays at 56 and separate Workers are unchanged. No live export, import, snapshot activation, Discord action or credential change is used for acceptance.

## Rollback

Restore Pages 8.2.25 deployment 0f0e5f52-180d-4579-a362-fc72e99428b3. No database restore or separate Worker rollback is required. Retained diagnostic fields are backward compatible. Retain public demo, beta approval guards and the private account email Worker. See recovery-plan.md.
