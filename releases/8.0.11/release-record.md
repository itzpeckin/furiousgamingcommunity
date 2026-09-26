# FranchiseHQ 8.0.11 — EA Sign-In Correction

## Scope

Correct the first EA token exchange to use EA's default account-token format. Preserve JWS for the second, persona-scoped token and refresh. Retain profile/franchise selections across busy and failure renders, with explicit restart sign-in and safe step-specific diagnostics.

## Added during delivery

Regression tests distinguish both token formats and verify redaction, failed-step identification, selection retention, and tenant/auth/setup resets. Existing EA request allowlists, bounded response handling, timeouts, credential encryption, and authorization remain intact.

## Known inherited blockers

The owner reached profile discovery in 8.0.10 but franchise lookup failed. The format mismatch is verified against the reference protocol; it is not proven to be the sole cause of that real rejection. Authenticated franchise selection and collection still require fresh owner sign-in and a private preview. EA roster availability is not guaranteed, and unknown Free Agents remain unknown.

## Validation evidence

See validation-evidence.json for local results. Hosted and Production evidence will be recorded on the release pull request. Mock tests do not certify live EA acceptance.

## Deployment status

Standing owner authorization covers build, pull request, Main merge, and Production deployment. Candidate work changes no live data or credentials. No migration or new configuration is required. The existing import Worker is unchanged; this fix deploys through Pages Functions and the web application.

## Rollback

Redeploy Main baseline `3bec0e3d6423d31aca0ec59275743bae80680c10` (8.0.10), retaining migration 48 and all captures, snapshots, accounts, setup records, and audits. Do not restore the database, rotate export URLs, or clear tokens as part of application rollback.
