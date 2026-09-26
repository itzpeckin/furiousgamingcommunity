# FranchiseHQ 8.0.12 — EA session and Companion import repair

## Scope

Repair Find Franchises after successful EA sign-in and the Companion import failure at 67%. Standing owner authorization includes the pull request, Main merge and production deployment after validation.

## Added during delivery

Production candidate `candidate_import_e4b7bf49-dfc9-4d71-a316-85db2e4123a0` failed Map Statistics with “No weekly statistics datasets were captured” despite seven selected Week 7 statistics captures containing 722 records. The retained-bundle grouping key includes a capture ID; the mapper incorrectly parsed that composite identity as a route. Parse the capture's actual route instead. A real endpoint regression maps all seven categories across multiple bounded batches, excludes newer unselected empty captures and verifies no activation. Bump the mapping revision so failed cached work is recomputed.

The Workflow previously retried this deterministic HTTP 422 for over five minutes. Permanent HTTP 4xx errors now stop retries and report the failed phase immediately; timeouts, throttling and server failures remain retryable.

EA's HTTP 200 ERR_AUTHENTICATION_REQUIRED came from the franchise RPC after successful account and Madden sign-in. Preserve safe literal session-key path punctuation instead of percent-encoding it, while prohibiting URL structure and traversal. Renew a rejected Madden session once with the existing persona token; simultaneous requests share the renewal. A persistent Madden rejection gets distinct guidance instead of claiming the account token must be reconnected. OAuth rejection still requires reconnect. No raw provider responses, keys or account credentials are logged.

## Known inherited blockers

The exact live EA cause remains unproven. Protocol source: https://github.com/snallabot/snallabot-service/blob/main/docs/madden/ea_api.md and its current client transport contract. Regression tests establish request construction and bounded recovery, not EA acceptance for the owner's account. Fresh owner sign-in and private collection preview remain the live gate.

## Validation evidence

See validation-evidence.json and the release pull request for exact gate and hosted deployment results. Deploy both Pages and the import Worker from the accepted Main merge. Migration baseline remains 48. No database migration, snapshot activation, export URL rotation, season change or Discord action is part of this release operation. The saved Companion export remains available for retry.

## Deployment status

Candidate implementation and release are authorized; hosted acceptance and deployment evidence will be recorded on the release pull request. Preview D1 and R2 are isolated. Preview currently shares the production import service binding, so no hosted preview import is triggered; Workflow failure behavior is tested with an isolated request harness.

## Rollback

Restore Pages to 8.0.11 Main `0deb44daf4c35211298b9e328a14b3d8a6c75ce0` (deployment `4b09ee39-c065-429b-a035-18f9e521b62c`) and restore the import Worker to its prior version recorded on the PR. Retain migration 48, saved captures, snapshots, accounts and audit history. Do not restore or clear the database.
