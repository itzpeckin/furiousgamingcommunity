# FranchiseHQ 8.2.22

## Scope

Discord and screenshot failures previously directed commissioners to check permissions regardless of the cause. Recovery now distinguishes Discord access, unavailable channels, Message Content access, bot configuration, provider pacing/outages, image-service failures and unknown interruptions. Guidance identifies the responsible party and navigation to the relevant settings.

## Added during delivery

Screenshot controls show history discovery, pending image checks, report delivery, unreadable evidence and missing team links separately. Refresh Check Status retrieves the current state. Retry Pending Checks schedules only retained pending work, preserving completed analysis, history cursors, rules, active leases and cooldowns. Coaching progress is scoped to the configured source channel. Scanner and live loadout errors retain safe category/stage details without provider payloads. FHQ authentication errors remain separate from Discord permissions. Scheduling retains thread-readiness and member-update progress with cause-specific guidance.

## Known inherited blockers

This patch does not change recognition accuracy, promise a response time, or repair external provider outages. Unknown legacy errors remain explicitly unknown. Commissioners cannot repair missing platform credentials or a stopped scanner service; those cases identify FHQ support. Unreadable evidence still requires a clearer original submission. A corrected team link requires resubmission in the appropriate Discord thread. Billing remains deferred.

## Validation evidence

Real-handler fixtures exercise permission failures, image outages, delivery retries without repeated AI work, preserved leases/cooldowns and league isolation. UI checks cover repeated clicks, authentication distinctions, desktop1440 and phone390 layouts. Strict CI and hosted checks are required before publication. No live fault injection, import, screenshot submission, rules update or Discord post was used for acceptance.

## Deployment status

Owner authorized implementation and production publication. No migration or separate Worker release is required. Final publication and checks are recorded in the external release evidence after deployment.

## Rollback

Redeploy Pages from Main2d64c9d3fd11c0a2e45acd7ed261907f52c52b61. Keep schema56 and existing Workers. Retained error details contain safe JSON; older UI may display that JSON until a subsequent successful check. No database restore, credential reset or league reconnect is required.
