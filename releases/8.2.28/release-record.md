# FranchiseHQ 8.2.28

## Scope

Account and league-setup failures lacked actionable recovery. Expired email links looked like retryable forms, account loading failures could leave a loading message indefinitely, and an interrupted application could encourage duplicate submissions.

## Added during delivery

Sign-in, registration, Account Settings and beta/invited league setup now share safe recovery messages and relevant actions. Requests have a bounded wait, reject repeated in-flight actions, preserve form values, and never automatically replay mutations. An uncertain application requires a status check before resubmission; existing saved plans retain their original identity. Verification and invitation errors have stable codes. Expired links offer a new link; linking email under the wrong account does not consume the token. Email throttles have different guidance from generic request limits. Password reset responses continue to hide whether an email account exists.

## Known inherited blockers

Live email delivery and authenticated customer setup are not exercised by this patch. Discord OAuth callback-specific screens, trades, league controls and season-transition recovery are outside this account/onboarding pass. Billing remains deferred.

## Validation evidence

22 focused account/security tests, the full strict gate with 693 tests, and 12 desktop/phone fault checks passed. Fixtures use fictional accounts and simulated email/network results; no customer account or live email is used. Preview and production assets and public recovery pages are verified after deployment.

## Deployment status

Authorized candidate. Schema 56, separate Workers, league data and Discord state are unchanged.

## Rollback

Restore Pages 8.2.27 deployment 00dd618b-43fd-489c-8273-05d1e90c0b4a. No database or Worker rollback. Never restore deleted OTL. See recovery-plan.md.
