# FranchiseHQ 8.2.31

## Scope

Retry Schedule Sync now refreshes existing current-week scheduling opening posts with the records and playoff indicators introduced in 8.2.30. A new Madden collection is unnecessary. This supports the user's authorized FGC Week 13 refresh and applies to the shared platform.

## Added during delivery

The presentation cache retains the opening content. Existing current-week posts are edited at their tracked starter message IDs only when content differs. New threads cache their initial content immediately, so they do not require a redundant edit. Updated records on later imports refresh the same post. Edits suppress mention notifications. Existing pacing, bounded batches, active-snapshot guards and transient-error retries apply; successful edits are retained through partial failures. Archived history is never refreshed.

## Known inherited blockers

The chat browser connection is unavailable, so the user's authenticated Retry Schedule Sync action is needed to start the live FGC refresh. Do not claim existing live posts were updated until tracked completion is verified.

## Validation evidence

Four focused tests passed: message-ID preservation, no thread creation/name change during post refresh, no repeated edits when unchanged, changed records, throttled edit recovery, archived history and active-snapshot guards. The full strict gate passed with 696 tests. Hosted checks are required before publication.

## Deployment status

Authorized candidate. Schema 56 and separate Workers unchanged. No live collection, import or Discord mutation performed during candidate testing.

## Rollback

Restore Pages 8.2.30 deployment 9ac82683-5d64-4574-89af-5684603d1f34. Preserve existing messages and cached opening content; no database or separate Worker rollback.
