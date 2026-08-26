# FranchiseHQ Platform Roadmap: FGC First-League Launch

**Roadmap baseline:** August 26, 2026  
**Roadmap revision:** 1.13
**Starting point:** FranchiseHQ 6.3.x  
**Target:** A secure, polished FranchiseHQ platform with FGC as its first production league and with application/data boundaries ready for future multi-tenant operation.  
**Current status:** FranchiseHQ 7.0.1 is released on `main` as squash commit `af9d12573e29ec1cbf4e9a14024f8e7bcb39ebca`. The complete 7.0.2 local gate passed 28 tests with zero new migration issues. On August 26, 2026, the owner authorized one controlled 7.0.2 GitHub pull-request/production cycle. Production remains unchanged until that cycle completes.
**Next gate:** Commit and push the validated candidate once, open one pull request, require every hosted check to pass, then squash-merge to `main` and observe production. Madden NFL 27 intake remains paused until the Companion App can provide a representative stable export.

## 1. The commitment

This roadmap is designed so the owner does not need to write code. The owner supplies product decisions, test accounts, credentials through secure platform settings, and release approval. The implementation work consists of code changes, database migrations, automated tests, staging deployments, release evidence, and rollback instructions.

No software can honestly be promised to have zero defects. The production standard will instead be evidence-based: a release cannot advance unless its security, data, role, migration, recovery, and user-flow gates pass.

The current 6.3.x work is not discarded. Useful components will be retained where they meet the new contracts; unsafe, duplicated, or local-only paths will be replaced behind controlled release boundaries.

### Roadmap change log

- **Revision 1.0:** Established the production-hardening, tenant-isolation, import, feature-rebuild, testing, and launch sequence.
- **Revision 1.1:** Clarified that FranchiseHQ is the product and FGC is its first league; made mobile/browser and future mobile-application readiness a permanent release contract; added future Free Agent, Companion App, approved direct-EA, and CSV/Excel import tracks; prioritized Madden NFL 27 intake, a reversible FGC league-data reset, stable player permalinks, and a server-backed Trade Block Lite as releases 7.0.2 and 7.0.3.
- **Revision 1.2:** Began 7.0.0 against the real audited Git commit; added the version-controlled release record, automated baseline/strict quality gates, generated system inventory, environment separation contract, branch policy, mobile matrix, and rollback controls. Aligned the 7.0.0 gate with the planned 7.1.0 database repair: 7.0.0 must detect and register inherited migration blockers without hiding new failures; 7.1.0 must make the strict fresh-database gate pass.
- **Revision 1.3:** Published pull request #2, verified the review branch against the local candidate, validated the Cloudflare Pages preview, and registered two legacy Worker Git-root configuration failures discovered by hosted checks. Added a release-branch workflow trigger so the first FranchiseHQ quality workflow can validate before any merge to `main`.
- **Revision 1.4:** Disabled non-production builds for the redundant assets-only Worker, saved the import Worker's monorepo build root, and added a review-only command that enters the Worker folder after Cloudflare's separate preview trigger continued to report `/`. Verified passing Pages and import-Worker preview checks at commit `16210a1`, and recorded GitHub's failure to index the repository's first custom workflow from the non-default review branch. No deployed runtime or production resource changed.
- **Revision 1.5:** GitHub activated the first custom workflow and exposed a cross-platform inventory mismatch on Linux. Normalized text input, replaced locale-dependent ordering, added a deterministic-evidence regression test, regenerated the inventory, and passed all three hosted checks at `47bbf36`. Recorded owner authorization for a controlled 7.0.0 squash merge; 7.0.1 and all data work remain separately gated.
- **Revision 1.6:** Squash-merged pull request #2 into `main` as `de01cff`, passed production GitHub and Cloudflare checks, activated import-Worker version `fa6c2d38`, published `v7.0.0`, and disconnected the redundant assets-only Worker's Git automation.
- **Revision 1.7:** Limited the import Worker's Cloudflare build watch path to `workers/franchise-import-worker/*`, preventing unrelated repository changes from rebuilding that service.
- **Revision 1.8:** Recorded successful owner phone acceptance of 7.0.0 plus three mobile findings: session loss after refresh, player-card model/layout problems, and awkward scrolling. Absorbed refresh persistence into 7.0.1 as a release blocker; retained player-card and scroll remediation in the mobile-first 7.0.3 scope. Began 7.0.1 security containment after explicit owner authorization.
- **Revision 1.9:** Completed the local 7.0.1 security/session implementation and passed the full baseline gate with 23 automated tests. The final compatibility pass found inherited UI dependence on raw snapshot objects, so those objects were replaced with an explicit allowlisted projection that preserves approved roster, player-card, schedule, and standings fields without returning private export data. Corrected a hard-coded release label in generated inventory evidence. The first GitHub run then exposed a `.git` file-versus-directory difference between Windows worktrees and Linux checkouts; both are now excluded with a regression check. Production remains unchanged pending hosted review, isolated staging, and owner approval.
- **Revision 1.10:** Passed the hosted GitHub quality, Cloudflare Pages, and import-Worker builds for 7.0.1. Public preview and security-header smoke checks passed. Protected league smoke exposed the expected environment gap: the preview has no isolated D1, R2, KV, or OAuth resources, and the seven inherited migration defects prevent safely creating a clean staging database before 7.1.0. Production bindings were not used. Corrected the public landing page's inherited 6.3.2 release label. Production remains unchanged.
- **Revision 1.11:** Squash-merged pull request #3 into `main` as `af9d125`; production GitHub quality, GitHub Pages, and Cloudflare Pages checks passed. Owner validation confirmed persistent refresh on Homepage, Teams, My Team, Standings, and Stats & Leaders, then isolated repeated login to the three legacy trade-module routes.
- **Revision 1.12:** Reprioritized 7.0.2 after the owner reported upstream Madden Companion App instability. Paused Madden NFL 27 intake and made 7.0.2 the controlled-member-onboarding release: repaired special-route refresh, preserved deep routes through Discord login, removed the legacy automatic login redirect, added invite/Pending/Active/Disabled controls, enforced invite acceptance before activation, blocked duplicate team control and commissioner self-lockout, corrected restore-after-disable behavior, and added focused security tests. Moved Madden NFL 27 intake/reset to 7.0.3 and the dependent mobile roster/player-link/Trade Block work to 7.0.4.
- **Revision 1.13:** Recorded owner authorization for one controlled 7.0.2 publication cycle: one candidate commit/push, one pull request, mandatory green hosted checks, then a squash merge to `main` and production observation. The authorization does not include database migrations, league-data changes, credential changes, Companion import work, or unrelated feature expansion.

The change log is append-only. Later discoveries, owner decisions, bugs, and scope changes will be recorded here and in the affected release record rather than silently changing the plan.

### Current release tracker

| Version | Status | Primary outcome |
|---|---|---|
| 7.0.0 | Released — `main` commit `de01cff`, tag `v7.0.0`; production quality, Pages, import-Worker, and phone acceptance passed | Controlled engineering and deployment baseline |
| 7.0.1 | Released — `main` commit `af9d125`; production quality, GitHub Pages, Cloudflare Pages, and owner refresh validation passed | Immediate security containment and general refresh-session reliability |
| 7.0.2 | Local gate passed; one publication cycle authorized; production unchanged until merge | Persistent Discord login plus secure member onboarding and team access management |
| 7.0.3 | Paused pending stable Companion App export | Madden NFL 27 intake and controlled FGC data reset |
| 7.0.4 | Planned after 7.0.3 | Mobile roster preview, player permalinks, and Trade Block Lite |
| 7.1.0–7.3.0 | Planned | Canonical database, tenant boundaries, and authentication |
| 7.4.0–7.8.0 | Planned | Full import platform and authoritative league workflows |
| 7.9.0 | Planned | Full Trade Center and advanced Trade Block workflow |
| 7.10.0–7.11.0 | Planned | UX, accessibility, performance, operations, and security |
| 7.12.0-rc.1 | Planned | FranchiseHQ release candidate for FGC |
| 7.12.0 | Planned | FranchiseHQ production launch for FGC |
| 8.0.0 | Deferred until FGC is stable | Multi-tenant product activation |

## 2. Product strategy: single tenant now, tenant-ready internally

**FranchiseHQ is the application and product. FGC is a customer league using FranchiseHQ.** FranchiseHQ naming, application shell, APIs, database design, release artifacts, and operational tools must remain product-neutral. FGC branding, rules, users, teams, and settings are tenant configuration.

FGC will be the only enabled league at launch. Internally, however, every league-owned record and every protected request will resolve an explicit `league_id` (and, where useful, a stable `tenant_id`). Nothing in the domain layer will silently assume FGC, `owner-tb`, or a default league.

This means we will build the foundation for multiple leagues without prematurely building tenant billing, self-service onboarding, custom domains, or a fleet-wide administration console.

The core request path will be:

```text
Web or future mobile client
  -> route and league resolver
  -> session authentication
  -> league membership and role authorization
  -> domain service
  -> validated database/object-storage operation
  -> public or member-safe response model
  -> audit/operational event
```

The intended source-of-truth hierarchy is:

```text
Supported Madden source artifact -> validated immutable snapshot -> atomic activation
                                                |
                                                +-> teams / rosters / standings / stats / schedule
                                                +-> GOTW selection
                                                +-> confidence pool games and locks
                                                +-> transaction evidence

League configuration -> rules / permissions / deadlines / branding
Member actions       -> picks / trade negotiations / trade block / approvals
```

The browser will not be an authoritative database for league operations.

### Mobile and future application contract

Every release is mobile-first, not merely made responsive at the end. FranchiseHQ will use versioned APIs and server-authoritative data so the same business operations can later support a native mobile application without recreating the product logic.

- Critical workflows must work at narrow mobile, standard phone, tablet, and desktop widths.
- Navigation, tables, forms, dialogs, charts, and touch targets must have deliberate mobile behavior.
- Direct links must survive refresh, sign-in redirects, and opening from Discord or another mobile application.
- No official data may exist only in browser local storage.
- API response models, pagination, payload sizes, caching, authentication boundaries, and error contracts must be suitable for constrained mobile connections.
- Each release gate includes real-device or representative mobile-browser verification plus desktop-browser verification.

## 3. Recommended launch scope

### Rapid Madden NFL 27 Roster Preview

The first user-facing baseline is now a narrow, invite-only FranchiseHQ experience for FGC. It will allow a controlled first Madden NFL 27 import, clean removal of old active league-season data, mobile/desktop roster review, stable player links, and a basic official Trade Block.

This preview does not imply that unfinished commissioner, confidence, negotiation, or multi-tenant features are production-ready. Those features remain disabled until their own release gates pass.

### FranchiseHQ Core Launch for FGC

The fastest responsible launch includes:

- Discord sign-in, memberships, and commissioner/member permissions.
- FGC branding and configuration.
- Madden NFL 27 Companion App import with validation, atomic activation, and rollback.
- Teams, rosters, players, standings, statistics, and schedule.
- Free Agents whenever present in the verified source export, with an explicit import warning if the source section is absent.
- Stable player profile links that can be shared and opened directly on mobile or desktop.
- A server-backed Trade Block where an authorized team controller can list or remove a player from their own roster.
- Server-backed GOTW, rules, confidence pool, and transaction history.
- Commissioner HQ for the supported workflows.
- Responsive, accessible navigation and consistent empty/error/loading states.
- Monitoring, audit history, backups, staging, CI, and a documented rollback process.

Full trade offers, counters, voting, commissioner decisions, and negotiation messages stay disabled until the 7.9.0 rebuild. Trade Block Lite is intentionally smaller: it publishes eligible players and their profile links but does not pretend to be the complete Trade Center.

### Full Feature Launch

The full launch adds the rebuilt Trade Center and advanced Trade Block workflow before public release. This is the longer route because negotiation state, concurrency, permissions, voting, commissioner decisions, and evidence must all be reliable.

## 4. Release roadmap

Each release is completed in its own reviewable change set. It receives a version, migration record, test evidence, staging verification, rollback plan, and owner acceptance before the next release begins.

### 7.0.0 — Controlled Engineering Baseline

**Purpose:** Make every later change reviewable, reproducible, and recoverable.

**Build:**

- Record the exact 6.3.x production baseline and preserve a rollback tag.
- Establish protected development, staging, and production flows.
- Create separate staging and production bindings for database, object storage, KV/cache, OAuth settings, and secrets.
- Add automated checks for syntax, linting, unit tests, clean database migration, production build, and secret scanning.
- Add a release manifest that records app version, commit, migration level, and compatible snapshot schema.
- Inventory all routes, tables, storage keys, environment variables, feature flags, and legacy modules.
- Establish the living release record that tracks original scope, conversation-added scope, bugs found, fixes, evidence, deferred work, deployment identity, and owner acceptance.
- Establish the phone/tablet/desktop viewport matrix that every later user-facing release must pass.
- Freeze undocumented direct production uploads as a release method.

**Why:** A fast build is only safe when a failed release can be identified and reversed without guessing which files were uploaded.

**Release gate:** A clean checkout can run the documented baseline gate, reproduce the generated system inventory, and report zero unregistered failures. Inherited migration defects must be visible in the quality baseline and fail strict mode until 7.1.0. The isolated staging resource contract and deployment procedure must be documented; production remains unchanged.

### 7.0.1 — Immediate Security Containment

**Purpose:** Close the known high-risk paths before adding features.

**Build:**

- Remove or strictly protect the unauthenticated EA diagnostic/exchange routes.
- Prevent public routes from returning raw import artifacts, private roster payloads, internal metadata, or credentials-derived previews.
- Replace wildcard CORS on sensitive endpoints with an explicit origin policy.
- Replace replayable session-transfer links with short-lived, one-time, hashed handoff codes delivered in the URL fragment or a secure POST flow.
- Define route-level rate limits and safe, structured error responses.
- Add automated negative tests proving guests and ordinary members cannot call protected operations.
- Repair session recovery so a stale primary cookie cannot mask a still-valid persistent session after refresh.
- Add enforced browser security headers, cross-origin mutation rejection, POST-only logout, and bounded authentication attempt handling.
- Label Trade Center, Trade Block, GOTW, and Confidence Pool as device-local controlled-beta workflows until their server-backed releases.

**Why:** These are launch blockers, not polish items.

**Release gate:** Security regression tests pass for guest, member, commissioner, and invalid/replayed session cases; no protected raw data is available from public endpoints.

### 7.0.2 — Persistent Login and Controlled League Onboarding

**Purpose:** Let FGC begin joining FranchiseHQ safely while Madden NFL 27 export work is paused.

**Build:**

- Stop Commissioner HQ, Trade Center, and Trade Block from invoking a legacy browser-local login redirect after refresh.
- Re-render all three special routes only after the real server-backed Discord session resolves.
- Preserve a safe league hash route through an explicit Discord login without putting session credentials in a URL.
- Provide a commissioner-copyable league invite URL. Opening the URL creates only an inactive Pending membership; the link grants no active league permission.
- Require invite acceptance before a commissioner can activate a user.
- Let commissioners review Pending, Active, and Disabled Discord members, assign league roles and teams, deactivate access, and restore a member to Pending.
- Prevent duplicate active team assignments, invalid roles/identifiers, oversized membership requests, commissioner self-demotion/deactivation, and removal of the league's last active commissioner.
- Correct access-state history so a restored member is not permanently treated as disabled on the next Discord login.
- Keep Madden imports, league data, credentials, and database schema unchanged.

**Why:** League invitations are useful only if refresh is reliable and no shared link, stale simulation identity, or unsafe team assignment can grant unintended access.

**Release gate:** Existing session/security tests and new onboarding tests pass; commissioner and invited-member phone checks complete the Pending → Active → refresh → Disabled → restored flow; production publication requires explicit owner approval.

### 7.0.3 — Madden NFL 27 Intake and Controlled FGC Data Reset

**Purpose:** Safely replace the currently active imported league-season data with the first verified Madden NFL 27 Companion App export.

**Build:**

- Preserve the first representative Madden NFL 27 export as a private, sanitized regression fixture and record its source, creation time, integrity hash, game version, league identity, season, and week/stage.
- Inventory every top-level export section and compare its fields, identifiers, relationships, and record counts to the currently supported import format.
- Detect the source/game schema explicitly; do not silently process Madden NFL 27 as Madden NFL 26 when required fields or meanings differ.
- Confirm and import teams, rosters, players, Free Agents, league metadata, standings, schedule, statistics, and transactions when those datasets are present.
- Produce a clear validation report showing imported, skipped, missing, duplicate, and invalid records before activation.
- Introduce an import-source adapter boundary so Companion App, future approved direct-EA, and CSV/Excel inputs can feed one canonical FranchiseHQ snapshot rather than creating separate downstream systems.
- Build a commissioner-only **Reset League Season Data** operation with a preview, typed confirmation, reason, audit event, backup reference, and two-step execution.
- Reset imported snapshots/artifacts, derived teams/rosters/players/Free Agents/standings/schedule/statistics/transactions, caches, and old-season feature records selected in the reset manifest.
- Preserve FranchiseHQ platform configuration, FGC tenant identity, user accounts, and protected audit/recovery evidence. Rules, memberships/team assignments, GOTW, confidence entries, and trade data must be explicitly marked preserve/reset/remap in the preview; none may be guessed.
- Ensure the application shows an intentional no-active-season state between reset and successful activation; old demo/cache data may not reappear.
- Rehearse backup, reset, Madden NFL 27 import, validation, activation, and rollback in staging before any production authorization is requested.

**Why:** “Wipe the current data” must remove obsolete league content completely without deleting the FranchiseHQ installation, user identity, tenant configuration, or the only recovery copy.

**Release gate:** The staging reset manifest reconciles to the pre-reset backup; no old active league-season records or caches appear afterward; the Madden NFL 27 import counts reconcile to the source; Free Agents are either imported and counted or explicitly proven absent from that export; rollback restores the prior state.

### 7.0.4 — Mobile Roster Preview, Player Permalinks, and Trade Block Lite

**Purpose:** Give FGC members an immediately useful, trustworthy first FranchiseHQ experience while the broader production roadmap continues.

**Build:**

- Provide mobile-first and desktop views for teams, rosters, players, and Free Agents from the active Madden NFL 27 snapshot.
- Assign every imported player a league-scoped FranchiseHQ public identity that remains stable across later imports of the same Madden NFL 27 league/season whenever the source identity remains valid.
- Add a canonical direct route such as `/leagues/{leagueSlug}/players/{publicPlayerId}`; do not expose a raw database row ID as the public contract.
- Make player names clickable from rosters, Free Agents, search, team pages, and Trade Block entries.
- Make direct player links survive refresh, Discord/mobile-app opening, authentication return, and later snapshot activation.
- Show a consistent player profile using fields verified in the export, such as team or Free Agent status, position, overall, age, contract, abilities/development, ratings, and season statistics. Unavailable fields are omitted or labeled unavailable rather than fabricated.
- Replace the current mobile player-card model/layout with a deliberately sized phone presentation that keeps the player image, identity, ratings, and actions inside the viewport.
- Remove nested or competing scroll regions from roster/player interactions, preserve the user's page position when cards open and close, and verify touch scrolling on representative iOS and Android browsers.
- Add a server-backed Trade Block Lite. An authenticated controller may list or remove only an eligible player on their assigned team; the server revalidates membership and current ownership.
- Publish Trade Block entries with team, player summary, profile permalink, listed-by actor, timestamp, and optional league-approved note/interest fields.
- Automatically flag or resolve stale entries after a new import changes player ownership, eligibility, or identity.
- Keep offers, counters, messages, voting, and commissioner trade decisions disabled until 7.9.0.

**Why:** Shareable player profiles and an official roster-sourced Trade Block provide immediate league value without treating the existing browser-local Trade Center prototype as production data.

**Release gate:** On representative phone and desktop browsers, two separate users can open the same shared player URL and see the same active player; an authorized controller can list/remove an owned player; another team cannot mutate that listing; a later import preserves valid links and safely handles traded/released/missing players.

### 7.1.0 — Canonical Database and Migration Baseline

**Purpose:** Guarantee that a new environment can be created and an existing environment can be upgraded predictably.

**Build:**

- Replace conflicting or duplicated migration numbering with a single immutable sequence.
- Define canonical schemas for tenants/leagues, users, memberships, seasons, snapshots, games, rules, GOTW, confidence pools, transactions, trades, audit events, and idempotency records.
- Add foreign keys, checks, timestamps, status enums, and uniqueness constraints.
- Enforce one active controlling membership per team per league and prevent invalid owner demotion/removal.
- Separate schema migration from request handling; normal API requests may not create tables.
- Add migration verification against both an empty database and a production-like 6.3.x copy.
- Build backup, restore, and migration rollback/recovery procedures.

**Why:** The current migration set cannot reliably build a clean database. All later reliability depends on fixing this first.

**Release gate:** Fresh install, 6.3.x upgrade rehearsal, backup, and restore all pass without manual SQL repair; row counts and key relationships reconcile.

### 7.2.0 — Tenant-Ready Core and FGC Bootstrap

**Purpose:** Launch one league without hard-coding the application to that league.

**Build:**

- Introduce a single trusted tenant/league resolution service.
- Require every league-owned API query and write to include resolved league scope.
- Store FGC as the first league record with its branding, domain/slug, product name, timezone, and feature configuration.
- Remove `owner-tb`, fixed FGC strings, and default-league assumptions from authorization and domain logic.
- Add a centralized feature flag/configuration system with server-side enforcement.
- Add cross-league isolation tests using an internal test tenant that is never exposed to users.

**Why:** Multi-tenant readiness comes from enforced data boundaries now, not from trying to retrofit them after FGC data is live.

**Release gate:** Automated tests prove that identical IDs in two test leagues cannot read, update, or infer one another's data. FGC remains the only enabled production tenant.

### 7.3.0 — Authentication, Sessions, and Authorization

**Purpose:** Make identity and permissions predictable across every screen and API.

**Build:**

- Consolidate Discord OAuth, session creation, renewal, logout, and revocation.
- Use secure, HTTP-only, same-site cookies with an explicit lifetime and rotation strategy.
- Implement centralized roles and capabilities for guest, member, team controller, commissioner, and league owner.
- Resolve permissions from active league membership on the server for every protected request.
- Add CSRF protection for cookie-authenticated state changes.
- Add owner-protection rules, membership acceptance/assignment rules, and explicit session invalidation after role changes.
- Add a safe member-facing transactions/data route instead of calling commissioner-only endpoints from public navigation.

**Why:** Hiding a button is not authorization. The server must make the same decision everywhere.

**Release gate:** End-to-end tests pass for sign-in, logout, expiry, role change, revoked membership, replay, cross-league access, and every protected navigation entry.

### 7.4.0 — Multi-Source Madden Import and Atomic Snapshot Pipeline

**Purpose:** Make imported league data trustworthy and recoverable.

**Build:**

- Define and version a canonical import/snapshot schema.
- Promote the Madden NFL 27 adapter proven in 7.0.3 into the canonical import pipeline.
- Support versioned source adapters for Companion App exports and approved CSV/Excel formats without changing downstream league features.
- Investigate a policy-compliant direct-EA connector using authorized league/commissioner credentials only if EA exposes or permits the required mechanism. Undocumented credential-exchange routes are not an acceptable production dependency.
- Treat Free Agents as a first-class canonical player state, with source-section discovery and record reconciliation for every supported input.
- Upload source artifacts to private object storage and retain integrity hashes and provenance.
- Validate required sections, identifiers, relationships, duplicates, season/week compatibility, and record counts before database mutation.
- Separate import into stages: received, parsed, validated, built, activated, rejected, and rolled back.
- Make build idempotent and activation atomic: readers see either the old complete snapshot or the new complete snapshot.
- Keep sufficient activation history for rollback and audit; do not delete evidence during normal activation.
- Record validation warnings separately from blocking errors.
- Add synthetic fixtures plus sanitized real FGC fixtures for each supported Madden/source schema.

**Why:** Schedule, standings, GOTW, confidence, rosters, statistics, and transactions all depend on this source.

**Release gate:** Re-upload, duplicate request, malformed file, partial failure, conflicting week, activation failure, Free Agent reconciliation, source-adapter equivalence, and rollback tests all preserve the last good active snapshot.

### 7.5.0 — Canonical League Experience

**Purpose:** Give real users one coherent, accurate view of FGC.

**Build:**

- Move Home, teams, rosters, players, standings, statistics, and schedule to versioned canonical read APIs.
- Stabilize the player permalink and player-profile contracts introduced in 7.0.4 as product-wide FranchiseHQ APIs.
- Create deliberately limited public response models and richer member response models.
- Remove silent mock-data and stale-cache fallbacks from production; show clear empty, stale, and unavailable states.
- Normalize team identity, season, week, time zone, score, opponent, and game status formatting.
- Add cache invalidation tied to snapshot activation.
- Establish performance budgets for first page load, API latency, and payload size.

**Why:** Users must never wonder whether a number came from the current import, a browser cache, or a demo array.

**Release gate:** Each displayed league fact can be traced to the active snapshot or explicit league configuration; responsive, empty, error, and stale states pass review.

### 7.6.0 — Commissioner HQ, Rules, and GOTW

**Purpose:** Turn commissioner operations into durable, auditable server workflows.

**Build:**

- Rebuild Commissioner HQ around centralized capabilities rather than page-specific role checks.
- Add a validated, versioned rules schema with draft, publish, effective date, author, and revision history.
- Make the public rules view read only the published revision.
- Store GOTW selection on the server, linked to the canonical schedule game and week.
- Prevent Home from silently auto-labeling a game as commissioner-selected GOTW.
- Add membership management with database invariants, protected owner actions, and audit events.
- Give every commissioner mutation a confirmation, idempotency key where needed, and auditable outcome.

**Why:** The current GOTW paths and local rules/settings paths do not share one source of truth.

**Release gate:** A commissioner action appears consistently for a separate signed-in member browser, survives cache clearing, and is recorded in audit history.

### 7.7.0 — Confidence Pool

**Purpose:** Make picks and scoring authoritative, fair, and understandable.

**Build:**

- Generate pool games from the canonical schedule and the league's configured week.
- Store picks server-side per league, season, week, member, game, selected team, and confidence value.
- Enforce uniqueness, complete ranking, eligibility, deadlines, and post-lock immutability on the server.
- Define cancellation, tie, reschedule, missing-result, and correction behavior.
- Calculate standings from canonical final results with a reproducible scoring job.
- Add commissioner correction tools that require a reason and create an audit event.
- Add member views for draft state, submitted state, locked state, results, and scoring explanation.

**Why:** Browser-only picks can be lost, changed, duplicated, or scored against a different schedule source.

**Release gate:** Two-device submission, race, deadline, reschedule, correction, and score-recalculation tests pass with no duplicate or mutable locked picks.

### 7.8.0 — Transactions and League History

**Purpose:** Provide a safe, reliable member-facing record of league events.

**Build:**

- Add a member-safe transaction ledger derived from canonical import data and approved app workflows.
- Keep raw source/evidence restricted to authorized commissioner review.
- Normalize transaction types, teams, players, timestamps, status, and source references.
- Add filtering, pagination, empty/error states, and reconciliation checks.
- Remove the public navigation dependency on commissioner-only canonical endpoints.

**Why:** Transactions should be transparent to members without exposing internal evidence or privileged APIs.

**Release gate:** Members can read the intended league ledger; only commissioners can access protected evidence; imported totals reconcile to the source fixture.

### 7.9.0 — Trade Center and Advanced Trade Block

**Purpose:** Replace browser-local prototypes with an official negotiation workflow.

**Build:**

- Extend the server-backed Trade Block Lite from 7.0.4 and store offers, versions, messages, votes/approvals, commissioner decisions, and status history server-side.
- Validate player/team ownership and asset eligibility against the active snapshot.
- Define a formal state machine: draft, sent, countered, accepted, rejected, withdrawn, expired, commissioner review, approved, denied, completed.
- Add optimistic concurrency/version checks so two devices cannot silently overwrite each other.
- Define who can see offers and messages at each state.
- Add deadlines, idempotent actions, evidence retention, notifications, and commissioner override rules.
- Provide migration or explicit retirement of old browser-local data; never silently treat it as official.

**Why:** This is the most stateful user workflow and needs stronger guarantees than local storage can provide.

**Release gate:** Multi-user/two-device tests cover simultaneous counters, double acceptance, stale ownership, revoked membership, deadline crossing, commissioner decision, and recovery from retries.

### 7.10.0 — Frontend Consolidation and UX Polish

**Purpose:** Make the application feel intentional, fast, and consistent.

**Build:**

- Split oversized application and trade modules into cohesive, testable features.
- Remove duplicate and unreachable 6.3.x/legacy implementations after replacement evidence is complete.
- Establish one design system for typography, spacing, color, status, forms, tables, dialogs, and responsive layouts.
- Treat mobile layouts as primary designs and progressively enhance them for tablet and desktop rather than shrinking desktop-only screens.
- Standardize loading, empty, stale, success, validation, permission, and failure feedback.
- Complete keyboard, focus, labeling, contrast, reduced-motion, and screen-size reviews.
- Add error boundaries, route recovery, safe client logging, and asset/version cache behavior.
- Add performance checks and browser compatibility tests.

**Why:** Reliability includes users understanding what happened and recovering without commissioner assistance.

**Release gate:** Critical flows pass mobile and desktop usability review, keyboard navigation, automated accessibility checks, and performance budgets.

### 7.11.0 — Production Operations and Security Hardening

**Purpose:** Prepare the team to detect, contain, and recover from real failures.

**Build:**

- Add structured logs with request, league, actor, action, outcome, and redacted error context.
- Add error and availability alerts for authentication, import, snapshot activation, database failures, and critical workflows.
- Add scheduled backups and routine restore drills with documented recovery objectives.
- Add dependency, secret, static security, and authorization regression scans.
- Add rate limiting and abuse controls by route risk.
- Add security headers, content security policy, privacy/data retention rules, and log redaction.
- Write incident, credential rotation, failed deployment, bad import, and rollback runbooks.

**Why:** Production readiness is the ability to recover, not merely the ability to deploy.

**Release gate:** A staging game-day exercise demonstrates detection and recovery from a bad deployment, bad import, expired secret, and database restore scenario.

### 7.12.0-rc.1 — FranchiseHQ Release Candidate for FGC

**Purpose:** Prove the complete release with representative FGC users and data.

**Build:**

- Rehearse production data migration and reconcile users, memberships, teams, schedule, rules, and active snapshot.
- Run commissioner/member/guest acceptance scripts on mobile and desktop.
- Run a private FGC beta through at least one representative weekly cycle.
- Complete load, failure, permissions, cross-league isolation, accessibility, and recovery tests.
- Freeze features; fix release blockers only.
- Publish user help, commissioner operating guide, privacy/support information, and known limitations.

**Why:** Staging tests find technical defects; a representative league cycle finds operational and usability defects.

**Release gate:** Zero open critical/high release blockers, no unexplained data differences, successful rollback rehearsal, owner acceptance, and a signed go-live checklist.

### 7.12.0 — FranchiseHQ Production Launch for FGC

**Purpose:** Launch deliberately and watch the system closely.

**Build/operate:**

- Take and verify the pre-launch backup.
- Apply the approved migration and deploy the exact accepted release candidate.
- Run production smoke tests for guest, member, commissioner, import, schedule, and enabled interactive features.
- Monitor errors, authentication, data freshness, and critical workflow success during a defined launch window.
- Keep the previous release and database recovery steps immediately available.
- Hold a short post-launch review and place non-critical feedback into the next version.

**Release gate:** Production health and data checks remain green through the observation window; any stop condition triggers the rehearsed rollback.

### 8.0.0 — Multi-Tenant Activation (after FGC is stable)

**Purpose:** Turn the tenant-ready core into an operated multi-league product.

**Build:**

- Tenant provisioning and lifecycle management.
- Per-tenant domains/slugs, branding, configuration, quotas, and feature entitlements.
- Platform administration separated from league commissioner administration.
- Per-tenant operational metrics, backup/export, retention, and incident isolation.
- Tenant invitation/onboarding and support workflows.
- Expanded isolation and noisy-neighbor tests.
- Billing/subscriptions only if the business model requires them.

**Why:** These are product-fleet concerns. Building them after FGC validates the core avoids slowing the first launch while preserving the correct data boundary from day one.

**Release gate:** A second test tenant can be provisioned, operated, exported, suspended, and deleted without exposing or affecting FGC.

## 5. Release rules that apply to every version

A version is not complete because the code compiles. It is complete only when all applicable checks pass:

1. **Scope:** The version has an explicit included/excluded feature list.
2. **Code review:** Changes are small enough to understand and are linked to the risk they resolve.
3. **Migration:** Fresh install and upgrade paths pass; destructive data changes have a backup and rehearsal.
4. **Tests:** Unit, API/integration, authorization, and critical browser-flow tests pass.
5. **Security:** Guest/member/commissioner boundaries and cross-league isolation are tested negatively, not assumed.
6. **Data:** Counts, identities, relationships, and source provenance reconcile.
7. **UX:** Loading, empty, error, stale, denied, success, and retry states are intentional.
8. **Mobile/application readiness:** The feature passes phone, tablet, and desktop behavior; its official state is accessible through a versioned server API rather than browser-only storage.
9. **Staging:** The exact release candidate is exercised with production-like bindings and sanitized FGC data.
10. **Observability:** Failures can be detected without waiting for a user report.
11. **Recovery:** Rollback or forward recovery is written and tested.
12. **Evidence:** A release note lists changes, test results, migration level, known limitations, and the exact commit/deployment.
13. **Roadmap update:** The master tracker records unplanned work discovered during delivery, owner-requested additions, bugs found/fixed/deferred, remaining risks, and changes to later versions.
14. **Approval:** The owner accepts the behavior before production deployment.

### Required release record

Every validated version appends one record containing:

- Planned scope and explicit exclusions.
- Work added after planning and the conversation/decision that added it.
- Bugs discovered, severity, disposition, and regression-test reference.
- Database and data-contract changes.
- Mobile, desktop, API, security, migration, and recovery evidence.
- Staging and production deployment identifiers.
- Known limitations and deferred work with a target version.
- Rollback/restore reference.
- Owner acceptance status and date.

This roadmap and its release records are the single source of truth. A feature is not treated as shipped merely because code for it exists.

## 6. Testing matrix

The permanent regression suite will cover at least:

- **Roles:** guest, unaffiliated signed-in user, member, team controller, commissioner, owner, revoked member.
- **Tenants:** FGC plus an internal isolation tenant.
- **Devices:** two simultaneous browsers, representative 360/390/430-pixel phone widths, tablet, desktop, touch and keyboard input, refreshed/cleared storage, and shared deep links opened from outside FranchiseHQ.
- **Data states:** no import, valid Madden NFL 27 import, stale import, malformed import, active build, controlled season reset, rollback, Free Agents present/absent, and missing optional sections.
- **Time states:** before deadline, at deadline, after deadline, rescheduled game, season/week rollover.
- **Failures:** request retry, database rejection, object-storage failure, OAuth failure, stale version, network interruption.
- **Operations:** fresh database, upgrade rehearsal, backup, restore, rollback, secret rotation.

## 7. Realistic launch sequence and timing

Calendar estimates are planning ranges, not guarantees; they depend on access to the repository and Cloudflare configuration, representative Madden files, Discord test accounts, and prompt product decisions.

### Rapid Madden NFL 27 Roster Preview

Versions 7.0.0 through 7.0.4: approximately **1–3 focused weeks** after access and a representative Companion App export are available. This is an invite-only usable baseline, not the declaration that every FranchiseHQ production feature is complete.

### Recommended FranchiseHQ Core Launch for FGC

Versions 7.0.0 through 7.8.0, followed by 7.10.0 through 7.12.0, with full offers/negotiations disabled: approximately **6–9 focused weeks**.

### Full Feature Launch

Include 7.9.0 before release candidate: approximately **9–13 focused weeks**.

The schedule should not be shortened by combining database, authentication, import, and interactive league workflows into one large deployment. Speed comes from narrow versions, automatic checks, fast owner decisions, and reusing sound 6.3.x work—not from skipping release gates.

## 8. Owner decisions needed during the roadmap

The owner does not need to make technical implementation decisions. The owner will approve:

1. The exact first-reset manifest: which imported/season records are removed, which configuration is preserved, and whether team assignments or old feature records are reset or remapped.
2. Which verified Madden NFL 27 player fields appear publicly, to signed-in members, or only to commissioners.
3. Trade Block Lite visibility, optional listing fields, and who may add/remove a player.
4. Core launch first, or full Trade Center launch.
5. FGC roles and which actions each role may perform.
6. FGC season/week, time zone, rules publication, and data-retention policies.
7. Confidence deadline, scoring, ties, cancellations, corrections, and visibility rules.
8. Full trade workflow, voting/approval, deadlines, commissioner powers, and privacy rules.
9. Branding, support contact, privacy language, and launch audience.
10. Release acceptance and final go-live.

Credentials and secrets will be entered only through secure environment settings, never pasted into source files or release notes.

## 9. How each implementation cycle will work

For every version:

1. Confirm the version's scope and decisions.
2. Inspect the affected code and production contract without changing production.
3. Implement in a controlled branch/worktree.
4. Run the automated suite and targeted adversarial tests.
5. Deploy to staging and provide a simple acceptance checklist plus evidence.
6. Fix anything that fails the release gate.
7. Ask for explicit production approval.
8. Deploy, verify, document, and preserve rollback information.
9. Update this master roadmap with scope additions, bugs, evidence, decisions, deferred work, and the next release gate.

The owner receives a plain-language release summary: what changed, why it matters, what was tested, what remains disabled, and exactly what to try.

## 10. The first authorization

The first safe authorization is:

> **Approve FranchiseHQ 7.0.0 — Controlled Engineering Baseline. Do not deploy or modify production. Build the release workflow, staging separation, inventory, automated checks, and rollback baseline, then return with evidence for my review.**

This permission does not authorize production deployment, data deletion, credential rotation, or later releases. Those remain explicit checkpoints. In particular, 7.0.3 will require separate approval after the exact reset manifest and verified backup/restore evidence are presented.
