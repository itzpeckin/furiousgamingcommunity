# FranchiseHQ 8.2.29

## Scope

Verify commissioner setup and preserve owner-approved beta access while defining the integration boundary for future paid access. Billing remains disabled.

## Added during delivery

Owner approvals and beta invitations now issue explicit, scoped complimentary access grants through server-only authorization. The activation ledger and league configuration retain the grant's source and account/league identity. Activation rechecks the prepared plan, revision, hash and disabled tenant inside the database transaction so stale requests cannot enable a changed or cancelled application. Existing complimentary leagues are unchanged.

The setup checklist's section links previously lost their destination at the league router. The router now forwards that destination to both commissioner renderer paths, so import, assignment and Discord actions open the intended section.

## Known inherited blockers

No payment checkout or paid entitlement adapter is enabled. Provider/currency and billing lifecycle policy remain undecided. A real new customer's EA authentication, first export/import and optional Discord installation remain external-provider acceptance steps; no such production account/franchise is used by this release.

## Validation evidence

30 focused checks passed. Real-handler and middleware browser journeys passed at 1440px and 390px: registration, confirmation, application, owner approval, denied applicant activation and readiness display. The actual mail Worker ran with a simulated sender; import readiness used seeded fictional season/roster/assignment data. The full strict quality gate passed all 694 tests, migration checks, inventory, syntax, asset and release checks.

One authorized email from accounts@franchisehq.app was sent through Cloudflare Email Sending REST. The owner confirmed it arrived in the inbox. This proves sender delivery, not live application notification delivery through the private Worker.

## Deployment status

Authorized candidate; schema 56 and separate Workers unchanged. No customer account, league, import, membership, Discord or billing mutation. See docs/league-access-architecture.md for the future payment contract and acceptance boundaries.

## Rollback

Restore Pages 8.2.28 deployment d824d1db-ebae-4f14-80e1-9954194aa444. No database or Worker rollback. Retain any subsequently created complimentary grants. Deleted OTL must remain deleted.
