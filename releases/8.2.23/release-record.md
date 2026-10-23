# FranchiseHQ 8.2.23

## Scope

The homepage links to a public mock-data demonstration and a reusable beta league application. Visitors can browse sample players, teams, standings, schedules, statistics, Trade Center and Commish HQ without signing in. Operational controls are disabled and the demo loads no live league or account clients.

## Added during delivery

Verified applicants submit a pending plan at /beta-apply. Submission does not create an operational league or commissioner membership. Only the platform owner can prepare and activate it through /platform/applications. Existing single-use beta invitations retain their original workflow. The private account email Worker sends application alerts from accounts@franchisehq.app to the owner-approved address. Notification leases prevent ordinary duplicate sends; failures remain retryable without losing the application. Account navigation and sign-in return paths retain access to application status.

## Known inherited blockers

Cloudflare connector authentication is currently unavailable. Do not merge or deploy Pages until the updated private account email Worker is published and its bindings are verified. Email tests use a simulated provider; delivery of an actual application alert is not yet production-verified. Ambiguous provider timeouts can lead to a duplicate alert on retry. Failed alerts retry on applicant status checks or the owner's Retry Email action, not a new background scheduler. The demo is an illustrative presentation with fictional data, not a live tenant. Billing remains deferred.

## Validation evidence

Real-handler SQLite tests cover verified-account requirements, owner-only approval, invitation bypass prevention, notification retry and deduplication, and safe email destinations. Isolated desktop and phone browsers exercise the public tour, player cards, filters, disabled commissioner controls, application submission, owner approval and the applicant's resulting league link. No demo API requests or page overflow were observed. Full strict checks and CI must pass before publication; hosted acceptance remains pending.

## Deployment status

Implementation and publication are authorized. This candidate is not deployed. Schema remains 56; no database migration is required. Deploy the private mail Worker before Pages. Keep its service binding, sender restrictions and private URLs unchanged. No real application, email, league import or Discord action was performed during local acceptance.

## Rollback

Restore Pages from Main c4c3823425d622ef6c5c99a80d24e377af00507b. Keep schema 56 and saved application plans. Retain the backward-compatible updated mail Worker while rolling back Pages; never restore deleted OTL records. Before restoring the prior application code, review pending application plans because the old self-service flow does not enforce the new approval flag. Disable registration/resume access until those pending plans have been safely cancelled or an approval-guard hotfix is deployed.
