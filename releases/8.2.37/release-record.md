# FranchiseHQ 8.2.37 — Loadout check delivery

## Scope

Xbox screenshot shares using HTTP or no scheme now normalize to HTTPS before fetching. The live listener and history scanner use the same evidence parser. Insecure direct image hosts, lookalike domains, credentials, ports and unsupported Xbox paths remain rejected.

The background scanner previously ingested four threads concurrently. All four requested the same application route, whose pacing coordinator permits one in-flight request. Three were rejected and aborted the batch before image processing. Serialize thread intake and run coaching/loadout scans sequentially; image processing remains bounded and concurrent. Discord cooldowns and permission checks remain enforced.

## Validation evidence

59 focused tests and all 719 automated tests pass. New regressions cover all Xbox share formats, secure fetching, both live and recovery processing, archived route exclusion, and a combined coaching/four-thread scan using the real pacing coordinator. The supplied screenshot remains covered by the 8.2.36 recognition regression. All strict gate checks passed after correcting the required release-record headings and rerunning the release contract. Hosted gates are pending.

## Added during delivery

The provided Discord message is in the archived week-19 SF/TB matchup. The active snapshot is week 20, with no active Tampa Bay matchup. Current-week checks deliberately exclude archived threads; deployment does not reactivate an old matchup or claim that this repost was checked. No manual Discord messages, scan invocations or database writes are used for verification.

## Known inherited blockers

None for this delivery repair. Archived matchups are intentionally excluded. The affected owner has no active matchup in the current schedule, so no new live verdict for that owner is claimed.

## Deployment status

Publish the accepted Pages candidate and matching scanner Worker modules. Reader version remains m27-glyph-reader-4. No migrations, credentials, league rules or active-snapshot changes are required. Verify public health, private endpoint authentication, preserved Worker bindings and successful automatic recovery scans. Stop if hosted checks, preview isolation or production health fail.

## Rollback

Restore Pages deployment e8a609b7-3e22-49d6-abb2-51cbc3bf366c (source 67145a3d977239ddcfbfde44248d778360c3cf71) and scanner Worker version e5f2fa79-d9f5-43ca-b3fe-d716f1c49424. Restore APP_VERSION=8.2.36; retain reader version 4. No database rollback is necessary.
