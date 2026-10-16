# FranchiseHQ 8.2.15

## Scope

EA Direct season schedule collection now starts a durable, validated import automatically. It collects all 18 regular-season weeks plus current league information, rosters and Free Agents; regular/playoff updates also retain current/previous statistics. Preseason weekly updates collect only league information and rosters. Published schedules/statistics exclude preseason, including carried-forward records. Existing preseason schedules are hidden immediately by the live reader.

Discord scheduling runs four independent thread operations concurrently, serializes requests to a shared parent channel, honors rate-limit headers, skips redundant thread renames and persists member progress once per thread. Workflow checkpoints allow up to 16 games. New-week membership setup still completes before prior threads are archived and locked. Preseason sync only archives existing active matchup threads; it never creates new ones or posts recaps.

Automatic schedule publication pins the discovery session at preparation/start and reuses a deterministic workflow identity. A newer export cannot silently replace the selected schedule. Failed dispatch leaves the collected export available for Refresh and Import Latest Export.

No database migration. Deploy the compatible import Worker before Pages. Local and hosted validation results are recorded separately; fixture performance is not a production timing guarantee.

## Added during delivery

Pinned automatic import handoff, progress monitoring, and preseason cleanup of previously created threads.

## Known inherited blockers

None registered. EA and Discord response times remain provider-dependent.

## Validation evidence

Regression tests cover preseason weeks 1-4, 18-week collection from preseason, full build/validation with preseason history excluded, dispatch replay/source pinning, no preseason threads, and request rate limiting. The strict gate passed 581 tests with no failures; the targeted handoff suite passed 59 tests. Hosted checks remain a publication gate.

## Deployment status

Candidate only. No production application or data changes at this checkpoint.

## Rollback

See recovery-plan.md. Preserve migration 54 and league history.
