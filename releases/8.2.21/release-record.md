# FranchiseHQ 8.2.21

## Scope

EA Direct previously replaced status-check failures with one generic progress message, and importer monitoring discarded FHQ authentication errors. Recovery cards now distinguish FHQ sign-in, EA reconnect, unknown collection/import status, Madden session rejection, season/week uncertainty, service configuration and validation failures. Direct actions lead to the existing safe controls.

## Added during delivery

Check Import Status resumes the retained workflow using GET, without a new import POST. A prior published run cannot be mistaken for success of an unconfirmed new attempt. EA collection start uncertainty blocks another collection until status is checked. Full safe job/workflow identifiers can be copied for support without copying API payloads, credentials or return addresses. Repeated import clicks and late league/auth responses are guarded. No database migration or separate Worker deployment.

## Known inherited blockers

This patch does not repair every underlying provider failure or implement all 117 audit scenarios. Discord, screenshot, account and trade recovery remain separate follow-up work. Automatic retry timing is not promised when no next-attempt timestamp is available. Existing provider limits and retention policy remain unchanged.

## Validation evidence

Targeted tests exercise authentication, network interruption, exact workflow monitoring, already-published follow-up failures, privacy, tenant isolation and preserved selections. Real-renderer desktop and phone fixtures verify recovery buttons and layout. Strict CI and hosted checks are required before publication; simulated failures do not claim live EA acceptance.

## Deployment status

Owner authorized implementation and production publication under standing release authorization. Candidate work changes no live data, credentials or Discord state. Final deployment evidence will be recorded after verification.

## Rollback

Redeploy the prior Main fe6da82ba603a351b617b675f59321a496a2a23c. Keep schema 56, all existing Workers, retained exports and histories. No database restore or EA reconnect is required for rollback.
