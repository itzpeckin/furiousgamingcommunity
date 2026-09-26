# FranchiseHQ 8.0.15 — Exact calendar-season binding

## Scope

Resolve the proven remaining EA Direct private-preview rejection. Standing owner authorization includes PR, merge and production publication after validation.

## Added during delivery

Live bounded evidence from job eaj_9ca2271d-e22b-4718-a2fa-e7b84397861a reports calendarYear=2027, seasonWeek=7, seasonWeekType=1 and displayWeek=8, with matching available Week 8 export indices. The separate source season ID is absent; the failure category is season-unidentified.

Accept calendar-only evidence only by resolving exactly one prepared season for the authenticated tenant, selected franchise, Madden edition and exact calendar year. Use that existing season's source identifier in private capture metadata. Explicit source identifiers keep their exact-match requirement. Ambiguous, missing, changed and foreign seasons fail closed. No calendar subtraction or latest-week inference is used. Recheck calendar evidence during hub retention and final collection verification.

## Known inherited blockers

Live collection completion and dataset availability remain subject to EA acceptance. 8.0.13 fixed stale post-import statistics caches; production already holds Week 7/8 records. No additional Companion export or snapshot repair is needed.

## Validation evidence

Full private preview fixture using omitted season ID completes without source publication. Negative tests cover missing years, foreign franchises/editions, duplicate prepared seasons and calendar changes. Strict release and authentication/collection checks required; exact results on the PR.

## Deployment status

Authorized Pages-only candidate. Migration 48 and import Worker unchanged. Live validation uses private preview only; no import, source activation or Discord action.

## Rollback

Restore 8.0.14 Main 43bb0b04d6ae562964c2877e08ef6fec6a9adff0, Pages bdffa66c-85e6-4259-861e-310f46f537cf. Preserve Worker version 239d366e-f0e0-46e8-97a3-bf371a55c793 and all stored data.
