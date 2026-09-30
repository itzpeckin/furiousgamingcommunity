# FranchiseHQ 8.1.0

## Scope

Invitation-only beta access with commissioner self-service setup. The platform owner creates a single-league invitation; a verified account claims it and creates its league. The setup checklist links to season preparation, EA Direct or Companion export, first roster import and team assignments. Discord remains optional.

Account Settings supports verification, password recovery and explicit email/Discord linking without merging different users. Account emails use accounts@franchisehq.app through a private Cloudflare email Worker. Reset links expire after 30 minutes and revoke prior sessions; verification links expire after 24 hours. Tokens are hashed in storage and used once. Billing and weekly loadout recognition remain deferred.

## Added during delivery

Separated Madden edition from the franchise calendar year. Added email-only pending membership requests, recovery-cookie cleanup, and invitation replacement for interrupted setup. Existing league permissions and imported data remain unchanged.

## Known inherited blockers

None registered in the strict quality baseline. Cloudflare's current email quota is 200 messages per day. The authorized test was reported delivered by the provider; inbox placement awaits recipient confirmation. Preview does not send account emails.

## Validation evidence

The existing 466-test suite passed before supplemental cases. Local browser acceptance uses the real Pages handlers, middleware and a migrated isolated SQLite database: registration, invitation claim, email confirmation, league activation, password reset and subsequent sign-in passed at 1440px and 390px, with no page errors or horizontal overflow. Test emails were captured locally. The strict gate passed 465 tests plus lint, syntax, secret, asset, environment, migration, inventory and release checks. Twenty-two targeted account/season tests passed. Owner invitation creation and revocation also passed in both browsers. Staging migration 51 preserved existing counts and passed foreign-key checks. Hosted acceptance follows publication.

## Deployment status

Implementation authorized; application publication pending. Sender-domain DNS has been provisioned and verified; previews are disabled to prevent account-link previews. Exactly one authorized email test was sent. No live league imports, Discord posts or team assignments were performed.

## Rollback

Restore Pages to main commit 609efeaa6cb4b3ca664fa014e2cb87e3027e29bb (the final 8.0.23 scanner recovery, newer than immutable v8.0.23). Migration 51 is additive; retain its tables and audit records. Remove the ACCOUNT_EMAIL service binding to disable outbound account actions if needed. Do not rotate existing EA/Discord/export credentials or alter snapshots. Keep the email Worker private with workers.dev and preview URLs disabled.
