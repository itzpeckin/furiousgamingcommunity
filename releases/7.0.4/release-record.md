# FranchiseHQ 7.0.4 Release Record

**Status:** Local implementation authorized; production unchanged  
**Production authorized:** No  
**Production changed:** No application, database, membership, league-data, credential, binding, or hosted configuration change has been made.

## Scope

Resolve the failed 7.0.3 owner acceptance and legacy ownership precedence as one credit-conscious release: make refresh authentication durable on the public domain and the owner's exact Pages fallback, establish imported Madden teams plus authenticated FranchiseHQ memberships as the only team/owner authority, and prepare an auditable old-data reset without executing it.

## Added during delivery

- Preserved `franchisehq.app` as the public and invitation domain while allowing `franchise-hq.pages.dev` only for the configured owner Discord identity when that account is also an authenticated active commissioner. Ordinary users and preview subdomains continue to the canonical domain.
- Preserved the initiating allowed host through Discord OAuth; the callback gates Pages fallback completion on active commissioner membership.
- Added one canonical team resolver for EA external IDs, abbreviations, nicknames, full franchise names, and stable lowercase team keys.
- Removed imported `ownerName`/`userName` and browser-local legacy assignment precedence from active team, My Team, Trade Center, Trade Block, reviewer-role, and Commissioner HQ paths.
- Made staff role and team assignment independent: a commissioner or Trade Committee member may own a team, while a Team Owner must have one.
- Added an additive database uniqueness boundary for one active controller per case-insensitive canonical team key.
- Rebuilt Teams & Owners around the active Madden team directory and authenticated Discord memberships; names, logos, colors, and roster identifiers remain import authority, while owner identity and role remain membership authority.
- Added a one-time retirement of old browser-local owner, committee, trade-test, and stale ownership cache records.
- Added a commissioner-only reset preview and typed-confirmation endpoint. The allowlisted D1 deletes and membership disablements execute in one batch; the actor is always preserved; selected users can also be preserved; an audit record is written; R2 deletion failures are reported after the database commit.
- Added responsive Teams & Owners and reset controls for desktop and mobile browser widths.
- Added a production-neutral configuration intent: Justin/Peckin → Buccaneers + Commissioner; Gas → Packers + Team Owner; Saluki → Disabled. These values are not hard-coded and have not been applied to production.

## Security and reliability controls

- No legacy browser value may grant commissioner or Trade Committee presentation privileges.
- The exact Pages fallback fails closed unless `OWNER_FALLBACK_DISCORD_ID` matches the signed-in Discord account and that account has an active commissioner membership; arbitrary Pages preview subdomains remain canonicalized.
- Imported Madden owner labels are retained only inside private source-ingestion records; the public read model explicitly nulls them before applying server membership ownership.
- Team choices must resolve to the active Madden snapshot before a membership can be activated.
- The API rejects duplicate active assignment before update, and migration 0016 adds case-insensitive database enforcement against races.
- Reset access requires the normal server-backed commissioner boundary and same-league membership.
- The reset target is a fixed source allowlist; no request-provided table name or storage key becomes executable SQL.
- Reset confirmation must exactly match the league slug, and the acting commissioner cannot be omitted from preservation.
- Database reset changes execute atomically; object-storage cleanup is separately reported because D1 and R2 cannot share a transaction.

## Known inherited blockers

- Seven registered migration-sequence defects remain assigned to 7.1.0; strict fresh-database validation is expected to fail.
- Protected hosted staging still lacks isolated D1, R2, KV, and OAuth resources.
- The Madden Companion App has not yet supplied a representative stable Madden NFL 27 export, so schema adaptation, Free Agent proof, import reconciliation, and real activation remain deferred.
- Trade Center, Trade Block, GOTW, and Confidence Pool workflow records remain browser-local controlled-beta data and are not yet authoritative shared workflows.
- Production still needs a read-only duplicate-team preflight before migration 0016 and a Time Travel recovery point before either migration or any data reset.
- Production must receive Justin's numeric Discord ID in the non-secret `OWNER_FALLBACK_DISCORD_ID` Pages variable before owner fallback acceptance; the value has not been configured by this local build.

## Validation evidence

- Existing security, onboarding, session, authorization, database, import, and environment checks remain green.
- Focused ownership tests prove imported owner labels are ignored, franchise aliases resolve to a stable team key, case-insensitive duplicate active ownership is rejected by SQLite, and browser-local ownership cannot influence reviewer role.
- An isolated database rehearsal removed one active Madden snapshot and its records atomically, preserved the acting commissioner and one selected member, disabled one unselected member, preserved the live session/account rows, and wrote one reset audit record.
- JavaScript syntax, repository policy, assets, secrets, environment separation, migration baseline, generated inventory, and release-contract checks are part of the full candidate gate.
- Phone and desktop owner acceptance remains pending until a later authorized hosted candidate exists.

## Deployment status

- Candidate branch: planned `codex/franchisehq-7.0.4`; work is currently local.
- Source baseline: production 7.0.3 at `9c5401a6c09a27275573115ebcd09e4b0e61fb21`.
- Pull request: not created.
- Cloudflare deployment: not run.
- Migrations 0016 and 0017: not applied outside isolated tests.
- Justin/Gas team assignment and Saluki disablement: not applied.
- FGC Madden/test-data reset: not run.

## Rollback

- Application rollback target remains production 7.0.3 at `9c5401a6c09a27275573115ebcd09e4b0e61fb21`.
- Immutable recovery tag remains `v7.0.0` until a later release tag is authorized.
- Migration 0016 adds indexes only; migration 0017 adds an empty audit table and index. Neither migration may be applied until duplicate-assignment preflight and a current D1 Time Travel recovery point exist.
- Any real reset requires a separately recorded recovery bookmark and count manifest. If its D1 batch fails, no batch statement should commit. R2 cleanup failures are returned for explicit follow-up and must not be hidden.

## Owner acceptance

The owner authorized the 7.0.4 build after specifying that FranchiseHQ is the product, FGC is its first league, mobile and desktop must both be first-class, the exact Pages domain must remain available only to the owner, imported team data must be separated from authenticated ownership, staff may also own teams, and the intended first configuration is Peckin/Buccaneers, Gas/Packers, Saluki/Disabled. This authorization covers local implementation and validation only.
