# FranchiseHQ 8.0.0

## Scope

Remove Discord as a requirement for creating a FranchiseHQ league while preserving Discord as an optional identity and league integration. An authenticated person can create a FranchiseHQ email account and register a league, but self-service registration prepares only a disabled, non-public tenant. A Platform Owner must separately review and activate that exact retained plan.

## Added during delivery

- Provider-neutral identity records retain every existing Discord identity and add email/password identities without changing league membership authority.
- Email passwords are stored only as uniquely salted PBKDF2-HMAC-SHA256 derivations using 600,000 iterations; login uses constant-time verification and the existing secure, rotating, revocable, CSRF-protected browser session framework.
- A provider-neutral `/auth` page supports email registration and login while keeping Discord available as an optional button.
- The public **Register Your League** flow belongs to the signed-in user, limits pending registrations, and prepares only a disabled/non-public tenant shell with no membership or live-league authority.
- Platform Owner activation is revision guarded, idempotent, and atomic. It records one unique activation, enables only the reviewed tenant and desired features, grants exactly one initial commissioner membership, and appends onboarding and tenant audits.
- Activation never imports Madden data, creates a snapshot, connects Discord, creates scheduling threads, rotates an export URL, transitions a season, deletes data, or treats blocked Free Agents as zero.
- Slack, GroupMe, and Facebook integrations remain explicitly deferred until later in the development cycle.

## Intentional limits

8.0.0 does not send email-verification or password-recovery messages because no outbound transactional-email provider is configured. It does not link an existing Discord identity to an email identity from the UI. Those account-recovery and linking controls remain later operational hardening; they do not make Discord necessary for creating or operating the initial commissioned league.

## Known inherited blockers

None are registered in the repository quality baseline. Madden Free Agents remain unknown whenever their source is blocked or absent; this release does not reinterpret that state.

## Validation evidence

Fresh-schema and legacy-upgrade coverage verifies additive migration 47 and retention of legacy Discord identities. Authentication regressions cover registration, password derivation, failed and successful login, provider-neutral sessions, and throttled routes. Onboarding regressions prove that self-service can prepare only the requesting user's disabled tenant and that only the Platform Owner can atomically activate the exact reviewed plan. The activation rehearsal grants one commissioner membership and creates zero snapshots, imports, Discord installations, or Discord threads while preserving the existing FGC tenant exactly.

The complete local repository gate passes all 301 tests. Deployment publication itself creates no account, registration plan, second league, membership, import, snapshot, Discord state, export URL, season transition, or Free Agent interpretation.

## Deployment status

The exact candidate is locally validated and authorized for additive migration 47, pull-request publication, Main merge, hosted validation, and Production deployment. External identifiers and read-only Production reconciliation will be recorded after publication.

## Rollback

Redeploy the accepted 7.7.2 runtime. Migration 47 is additive and may remain in place unused; do not delete identity, onboarding, activation, or audit evidence and do not restore D1. Because deployment does not create an account, plan, or league, the existing FGC tenant and every retained snapshot, import, export, Discord record, audit, season record, and membership remain unchanged.
