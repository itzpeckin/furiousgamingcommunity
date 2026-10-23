# FranchiseHQ 8.2.24

## Scope

Replace the standalone public mockup with FHQ Demo League at /leagues/demo. The /demo link redirects to this normal league route, serving the production index, styles, application renderer, player cards, Trade Center, and Commish HQ. Visitors can browse without an account.

## Added during delivery

The dedicated tenant uses a versioned fictional dataset: 32 teams, 53 players per roster, 272 scheduled games, seven completed weeks, individual statistics, demo GMs, news, trades, transactions and commissioner settings. Its data provider implements the existing application read contracts. Public requests never reach customer data or operational handlers. Visitors receive no authentication session or commissioner capability. All demo mutations and non-allowlisted operational reads are denied; navigation, filtering, player cards and commissioner tabs remain usable.

## Known inherited blockers

No publication blocker is currently known. This is an immutable fictional season; imports, Discord connections and operational changes are unavailable by design. It does not exercise live EA or Discord services. Existing beta-application email delivery limitations are unchanged.

## Validation evidence

658 automated tests passed, including public access, exact platform-shell rendering, tenant isolation, denied mutations, safe provisioning and beta-application regression coverage. Desktop and phone browser acceptance and hosted preview checks are recorded with release evidence before publication. The release metadata headings were corrected after the first complete test pass.

## Deployment status

Implementation and publication are authorized. This candidate is not deployed to production. Staging has the dedicated tenant. Provision config/public-demo-league.sql once in production after verifying the exact ID and slug are unused. It creates no users, memberships, customer snapshots, imports or integrations. Database schema remains 56 and separate Workers remain unchanged. Customer league data and the beta application flow are preserved.

## Rollback

Restore the preceding 8.2.23 Pages deployment, preserving the existing beta-application approval guards and private mail Worker. To close demo access independently, disable only tenant league_fhq_public_demo with slug demo. Keep the row for inspection. No database restore, customer snapshot rollback or recreation of OTL is required. See recovery-plan.md.
