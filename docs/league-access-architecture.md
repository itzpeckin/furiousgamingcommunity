# Commissioner setup and league access

## Current access

The public `/beta-apply` route accepts a verified account's league application. The application creates no operational tenant or membership. The platform owner prepares and approves it at `/platform/applications`; the applicant cannot approve it, even with a separate invitation or forged payment fields. Existing direct beta invitations remain supported.

Both activation paths use `authorizeLeagueActivation` with a server-selected source. It authorizes the owner or validates the applicant's verified account and scoped invitation. `activatedLeagueStatements` receives a scoped grant, then commits the activation ledger, commissioner membership, tenant enablement, features and audit records in one database batch. The first statement rechecks the plan's prepared status, revision, hash, commissioner, tenant ID and disabled tenant state. A cancellation or revision change after preflight rolls back activation. Unique plan, league and request constraints prevent duplicate activation; handlers reconcile retries to the existing result.

New grants explicitly record `kind: complimentary`, `source: owner-approval | beta-invitation`, the authorizing reference, plan, league and account IDs, and no expiration. The ledger is authoritative historical evidence; the league configuration also carries the grant. Existing league rows are not rewritten and existing complimentary access is unchanged. These records do not implement recurring subscriptions or expiration enforcement.

## Future paid access integration

Billing is disabled. No price, paid flag, success URL or request-body grant can activate a league. A future provider integration must add all of the following before paid access is enabled:

1. Create checkout on the server for an authenticated, verified account and a stored plan. Persist the provider's checkout/customer reference, expected product, price and currency. Do not accept these from a browser as proof of payment.
2. Verify the provider webhook signature and event freshness; retrieve authoritative payment/subscription state where needed. Validate the expected account, plan, amount, currency and successful payment status.
3. Persist a unique provider event and entitlement with account/plan/league scope. A server-only paid authorization adapter must require this durable verified entitlement. Returning from checkout is a status display, never authorization.
4. Use the same atomic activation transaction, with a paid grant type and entitlement guard added deliberately. Record consumption of the entitlement in that transaction. Duplicate events, concurrent deliveries and retry after a lost response must resolve to one league and one initial commissioner membership. Failed preparation remains resumable without another charge.
5. Keep billing ownership separate from team/GM history and league memberships. Commissioner turnover must not transfer or erase payment history. Renewal, cancellation, refund, failed-payment grace and suspension behavior require explicit policy and tests before enabling billing.
6. Preserve existing complimentary grants, including legacy leagues without new grant metadata. Do not infer a payment requirement from missing metadata, or silently convert beta leagues to paid plans. Provider and currency remain undecided.

## Verification boundaries for 8.2.29

- Real registration, email confirmation, beta application, owner approval, applicant status and account middleware run in isolated SQLite-backed desktop/phone browser journeys. The real private mail Worker handles fixture mail with a simulated delivery binding.
- The actual sender `accounts@franchisehq.app` sent one authorized delivery-test email through Cloudflare; the owner confirmed inbox receipt. This does not claim a live application notification traversed the private Worker.
- Readiness transitions use explicitly seeded season/export/roster/team-assignment results; they verify checklist behavior, not a live Madden import. The strict suite separately covers real import handlers. EA account authentication, a first export from a new customer's franchise, and their optional Discord installation still require customer/provider acceptance.
- Checklist destinations now pass their requested commissioner section to the renderer. `Assign teams` opens Teams & Owners; `Connect Discord` opens League Controls; import actions open Command Center. Discord is optional for overall setup readiness.
- No customer league, account, membership, snapshot, Discord message or billing record is created by these fixture tests. No production FGC export is run.
