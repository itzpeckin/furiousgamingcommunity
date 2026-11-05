# FranchiseHQ 8.2.32

## Scope

Retry Schedule Sync after the opening-post upgrade was incorrectly reusing a completed pre-upgrade Workflow. FGC's retries at 13:59–14:02 UTC all returned the job completed at 13:40 UTC, so no message edits ran. Refresh Status correctly returned the retained old run, which made the action appear unresponsive.

## Added during delivery

The scheduling Workflow identity now includes the opening-post capability revision. Every connected league receives a fresh job for that upgrade, while repeated requests still reuse the same current job. The API forwards the Workflow's status, and the commissioner controls say when the job is already complete instead of falsely announcing newly requested work. No separate Worker or database change is needed.

## Known inherited blockers

The browser connection remains unavailable. The commissioner successfully triggered the live recovery from their browser; automated isolated controls tests cover the changed wording. No claim of browser inspection of actual Discord messages is made.

## Validation evidence

The new regression uses the real Worker start endpoint and retained Workflow state with the scheduling database fixture. It reproduced the pre-fix completed-job collision, then passed after repair. Four focused checks cover fresh dispatch, one edit to each existing post, idempotent completion, member/routing scope, throttled post retry, and accurate completion feedback. The full strict gate passed all 698 tests. CI and hosted checks are required before publication.

The explicitly authorized current FGC job restart failed authentication without changing posts. The user's fresh Retry Schedule Sync then updated all 14 current 2028 Week 13 opening posts, finishing at 14:09:42 UTC with no remaining errors. Existing thread/message IDs and names are retained by the update path. No collection, import, advance or archival was performed.

## Deployment status

Authorized candidate. Schema 56 and separate Workers unchanged. Live FGC recovery completed on deployed 8.2.31; this release prevents the completed-job collision platform-wide and fixes the completion wording.

## Rollback

Restore Pages 8.2.31 deployment 83110cad-77ea-439a-aad9-6d9aa835b52b. Preserve updated messages and presentation cache. No database or separate Worker rollback.
