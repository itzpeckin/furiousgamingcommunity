# FranchiseHQ 8.2.25

## Scope

Correct misleading EA Direct collection status and recover interrupted browser progress checks. Production evidence shows the reported weekly export completed with all 52 datasets after two automatic checkpoint retries. The historical causes of those retries were not retained; this release does not claim an EA outage or change provider behavior.

## Added during delivery

Temporary progress-read failures retry with delays of 5, 10, 20, 30 and 30 seconds, then retain a manual Check Collection action. Authentication, authorization, cancellation and permanent HTTP errors stop automatic checking. Reads stay scoped to the same league, authentication generation, collection and action revision. No retry starts an export or import. Running collection retries, FHQ setup/collection locks, FHQ collector availability, individual EA request failures and stopped collections receive distinct guidance. Recovering states use a polite status announcement and neutral accent instead of an alert. Completed weekly exports continue to require Refresh and Import Latest Export.

## Known inherited blockers

No publication blocker is known. Real provider interruptions remain possible. The precise cause of the two observed historical retries is unavailable; production collection completed before this repair. Backend credentials, provider requests, workflow retries and publication behavior are unchanged.

## Validation evidence

89 focused UI, collection and security tests pass. New automatic-recovery and classification regressions fail against the preceding implementation. The strict run passed 675 of 677 tests; its only failures were two release-marker assertions still expecting 8.2.24. After updating those assertions, all 10 tests in the affected files passed. Product code was unchanged after that run. Desktop 1440px and phone 390px browser checks passed automatic recovery, completion, distinct stopped/busy states, zero writes, no page errors and no horizontal overflow. Final CI must pass before merge. Browser interruptions use isolated fictional responses rather than live EA requests.

## Deployment status

Implementation and publication are authorized. Local candidate validation is complete; hosted preview and final CI verification precede merge. Schema stays at 56 and separate Workers are unchanged. This release performs no live export, import, snapshot activation, Discord action or credential change.

## Rollback

Restore Pages 8.2.24 deployment 81262a4e-d794-4f83-8835-d45c0e757352. No database restore or Worker change is required. Retain the public demo, beta approval guard and private account email Worker. See recovery-plan.md.
