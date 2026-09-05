# FranchiseHQ 7.4.2 Release Record

**Status:** Locally validated review candidate; publication and Production are not authorized

**Production changed:** No. Production remains FranchiseHQ 7.4.1 on migration 31.

## Scope

This consolidated cycle replaces the fragmented Commissioner HQ with a purpose-built, responsive league control room and completes the roadmap's server-authoritative feature-settings and revisioned Rules work.

## Added during delivery

- A six-workspace Commissioner HQ: Command Center, League Data, People & Teams, League Controls, Rules Studio, and Audit & Revisions. The new visual system uses a polished navy command shell, live status metrics, a priority queue, compact operational launch cards, responsive tables, and phone-safe navigation.
- A commissioner-only consolidated endpoint for tenant metrics, active snapshot status, membership/assignment totals, managed feature state, Rules state, transactions, setting revisions, and recent audit activity.
- League-wide Trade Center, Trade Block, Confidence Pool, and Game of the Week switches backed by `league_features` and a matching `league_settings` revision. Every mutation is tenant-audited and rejects stale revisions rather than overwriting a second commissioner's newer change.
- A private Rules workspace with Save Draft, explicit Publish Rules, immutable publication history, immutable workspace revisions, bounded document validation, and optimistic conflict handling. Team owners receive only the published rulebook.
- A consolidated People & Teams presentation over the existing authenticated Discord membership, franchise assignment, role, and access controls. Existing commissioner-only permission checks remain the mutation authority.
- Member-facing feature enforcement so disabled Trade Center, Trade Block, Confidence Pool, and Game of the Week experiences disappear consistently, while deep links fail closed into the league shell.

## Known inherited blockers

Madden's explicit Free Agent route remains blocked upstream. Its count stays unknown/null and is not interpreted as zero. This release does not run or change an import.

## Validation evidence

Focused tests prove migration-32 preservation and backfill, private draft/public Rules separation, stale Rules rejection, commissioner-only feature mutations, league-wide settings revision authority, audit rows, and bounded Rules validation. Fresh and production-shaped schema tests reach migration 32 with zero foreign-key violations.

The full consolidated repository gate covers every existing import, transition, Trade Center, transaction, tenancy, authorization, and session regression in addition to the new Commissioner suite. The active snapshot context remains the Command Center's season/week authority, and responsive CSS includes compact desktop and single-column phone behavior.

## Deployment status

No branch publication, pull request, hosted check, cloud deployment, Production migration, or Production data operation is authorized or performed in this cycle. Production remains FranchiseHQ 7.4.1 with migration 31.

No import, snapshot activation, reset, deletion, Archive Season, game-year transition, export-URL rotation, credential change, membership change, or draft-pick ownership operation ran. Free Agents remain explicitly blocked/unknown.

## Rollback

The immutable rollback baseline is exact Main evidence commit `2b691a046aa6afdcaaa8ee453901b2743b94ff90`, tree `1f7ed57d41d821132450b1d19db08f2c010af666`, representing the recorded FranchiseHQ 7.4.1 Production state.

## Next gate

The exact local candidate passes the consolidated gate. Obtain explicit owner authorization before branch publication, pull request, hosted checks, Production migration 32, merge to Main, and Production deployment.
