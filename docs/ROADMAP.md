# FranchiseHQ Production Roadmap

**Document owner:** FranchiseHQ

**First customer league:** Furious Gaming Community (FGC)

**Updated:** August 30, 2026

**Revision:** 1.49

**Current production:** 7.3.4.2 from exact Main commit `e95ad2f` (Pages deployment `0747aebd`); the recovered 43-route Week 9 source is latest-ready and accepted Madden 27 snapshot `841ce1b5` remains active

**Current work:** The 7.3.4.2 Production cohort remediation is complete and pending owner UI acceptance. Future concurrent Madden routes atomically claim one cohort. The exact retained Week 9 burst is selected as latest-ready with 32 teams, 2,043 rostered players, 15 schedule rows, 207 statistics rows, and 32 standings rows. Free Agents remain blocked/null, and no import or activation ran.

**Next gate:** Owner confirms Commissioner HQ shows **Ready to import**, 43 routes, 32 teams, 2,043 rostered players, captured Week 9, and Free Agents unknown. Running **Import Latest Export** remains a separate commissioner action and was not performed by this release.

## Product decisions

- The product is **FranchiseHQ**. FGC is configuration and the first league, never the application identity or a product-wide hard-code.
- FGC launches as the only enabled production tenant. League-owned data is tenant-scoped now so adding league two later is controlled activation, not a retrofit.
- Server data is authoritative for shared league features. Browser storage is limited to temporary UI preferences.
- Every release must work at phone and desktop widths. Mobile is an acceptance requirement, not a later port.
- Madden sources feed one canonical snapshot model. Companion, approved direct-EA access, and CSV/Excel must not create separate downstream products.
- A Madden **game year** (Madden 27, Madden 28, and so on) is independent from a franchise season year. Leagues, accounts, memberships, roles, settings, rules, and audit history persist across game years; Madden-derived data is partitioned by game year so a commissioner can archive it and remove it from the active application at the next edition transition.
- Free Agents are a required first-class dataset. A source must provide and reconcile them or explicitly prove their absence.
- Production publication, database migration, Discord configuration, membership edits, FGC reset, import, and snapshot activation are separate authorization decisions.
- Every validated release updates this roadmap with requested additions, unexpected work, defects, deferrals, evidence, and the next exact gate.
- The refresh/login inconvenience is accepted temporarily. Session redesign remains frozen until 7.5.0 unless evidence shows an authorization or data-exposure vulnerability.

## Current facts and accepted limitations

- 7.1.0 established a reproducible database, continuous migration ledger, preservation checks, and target-locked migration command.
- Refreshing Commissioner HQ or Trade Center can return a user to Account or require another login, especially on mobile. The owner accepted this as a temporary UX defect.
- Commissioner settings can remain browser-local and disagree between commissioners. The shared schema exists; 7.4.2 moves the feature to server authority.
- EA has restored Madden NFL 27 Companion data flow. After 7.2, discovery and a safe FGC teams/rosters/players activation are the immediate priority.
- The real FGC capture received 43 requests (10.17 MB) in 0.448 seconds. It contained 32 teams, all 32 team rosters, 2,044 unique rostered players, standings, 14 current-week games, and 510 statistics rows.
- All 2,044 captured team-roster players have a valid team assignment and `isFreeAgent: false`; 2,031 are active and 13 are inactive. No duplicate roster identifiers or unassigned players were found.
- Madden's explicit `xbsx/742482/freeagents/roster` response failed upstream with an empty `rosterInfoList`. This is recorded as **blocked**, not as proof of zero Free Agents. It does not block safe rostered-player preview work, but FranchiseHQ cannot claim a complete player pool until a successful or explicitly empty Free Agent response is received.
- The owner authorized the Madden 26-to-27 Production transition. Madden 26 is no longer attached to the live application: its D1 database is retained as a detached relational archive, a private 38-table/76,712-row archive was verified, and 1,295 obsolete raw R2 objects were permanently deleted. The clean Madden 27 Production database preserves the league and account plane while clearing all eight legacy team assignments. Accepted Madden 27 snapshot `841ce1b5` is now active.

## Release tracker

| Version | Status | Outcome |
| --- | --- | --- |
| 7.0.0–7.0.5 | Production history | Engineering baseline, security containment, onboarding, ownership, and Commissioner-management foundations |
| 7.1.0 | Production | Canonical database, target-locked migration, preservation, and recovery foundation |
| 7.2.0 | Staging validated | Tenant-ready core with FGC as the only enabled league; migration 21 and isolated Preview resources verified without production changes |
| 7.3.0 | Completion candidate | Real Madden 27 source captured; 2,044 rostered players certified as preview-ready; Free Agents honestly blocked upstream and deferred |
| 7.3.1 | Staging validated | One reviewed 2026 season, 32 teams, and 2,044 rostered-player identities are retained in a private preview; Free Agents remain blocked/unknown and no snapshot is active |
| 7.3.2 | Released; owner accepted and active | Exact repair `972bea6` completed the cold run in 43.763 seconds; the owner accepted and separately activated the validation-ready 32-team/2,044-player snapshot. Free Agents remain blocked/null. |
| 7.3.3 | Released; owner accepted | Exact `b373f66` and migration 25 are live; Production transition rows remain empty and active snapshot `841ce1b5` remains unchanged |
| 7.3.4 | Production | Source-scoped repeat imports, exact-export idempotency, visible Week coverage/gaps, and same-season history carry-forward without activation |
| 7.3.4.1 | Production; pending owner UI acceptance | Permanent revocable league export URL, automatic cohort analysis, readiness status, and one-click latest candidate import |
| 7.3.4.2 | Production; pending owner UI acceptance | Atomic concurrent cohort claim, exact real-payload parsing, and verified retained-burst recovery without candidate import or activation |
| 7.3.5 | Planned | Production team, roster, player, statistics, standings, and Free Agent experience |
| 7.3.6 | Planned | Stable shareable team and player URLs |
| 7.3.7 | Planned | Ownership reconciliation, My Team, GM career history, and trophy cases |
| 7.3.8 | Planned | Incremental Madden updates and freshness reporting |
| 7.3.9 | Research gate | Approved direct-EA and CSV/Excel adapters |
| 7.4.0–7.4.6 | Planned | Core platform features, mobile polish, consistency, and operations |
| 7.5.0 | Required before RC | Authentication and session framework |
| 7.6.0-rc.1 | Planned | Private FGC release candidate |
| 7.7.0 | Planned | FGC production launch |
| 8.0.0 | Planned | Multi-league activation |
| 8.1.0 | Planned | Multi-league administration and operations |

## 7.1.0 — Database Foundation

**Delivered**

- One active migration sequence initializes a clean database and upgrades production-shaped legacy data.
- Shared settings/revisions, import/snapshot, transaction, and runtime tables moved into migrations; request handlers no longer create schema.
- Runtime guards fail closed below the required schema version.
- Fresh install, legacy upgrade, identity preservation, foreign keys, backup/restore, and production target checks passed.
- Production reached a continuous ledger through version 20 with protected counts and ownership unchanged.

**Still deferred**

- Shared settings are schema only until 7.4.2.
- No Madden reset/import, membership edit, Discord change, or session redesign was included.

## 7.2.0 — Tenant-Ready Core

**What we build**

- One trusted server resolver for league routes, aliases, login joins, APIs, imports, and jobs.
- Explicit tenant identity with status, timezone, branding, configuration, domains, aliases, and feature controls.
- No fallback to FGC, a first database row, a product-coded league ID, or a browser-seeded tenant.
- Mandatory direct `league_id` scope on every league-owned table, including legacy validation and one-row-per-league tables.
- Tenant-ID namespaces for new KV/R2 Companion data while retained D1 object references keep existing stored captures readable.
- Tenant audit context with league, actor, request, action, resource, outcome, and details.
- Two-tenant regressions proving identical team IDs and membership assignments remain isolated.
- FGC remains the sole enabled production tenant; future league records default disabled.

**Explicit exclusions**

- No second production league, FGC reset/import, active-snapshot switch, team reassignment, shared-settings UI rewrite, trade rewrite, or session-refresh redesign.
- Building and testing migration 21 does not authorize applying it to staging or production.

**Release gate**

- Clean install and production-shaped upgrade reach version 21 with zero foreign-key violations.
- Existing rules, settings, active snapshot pointer, and validation-player rows survive the migration.
- Unknown tenants/features fail closed and disabled tenants cannot resolve publicly.
- Runtime scans find no hard-coded FGC/default tenant and no independent league resolver.
- One consolidated strict gate passes before review.

## 7.3.0 — Madden 27 Payload Discovery and Source Lock

- Create one short-lived discovery session URL whose token is returned once, retained only as a hash, expires after 30 minutes, and is cancelled when replaced.
- Keep one real Companion run under one durable session ID even when the export crosses a minute boundary.
- Link identical payloads into the current session without duplicating the same raw R2 object or losing route completeness.
- Privately inventory every route, dataset, field/type, identifier relationship, source marker, record count, and capture duration without returning raw player/team values.
- Prove Free Agents from an explicit route: populated, explicitly empty, missing, and Madden-failed responses remain distinct states.
- Generate a sanitized structural regression fixture and source-lock report without activating, resetting, or publishing Madden data.
- Independently certify rostered-player readiness from assignment evidence: team-route coverage, unique identifiers, valid team IDs, route/team agreement, active flags, and Free Agent flags.
- Treat a failed Free Agent route as an upstream limitation while preserving the successful team-roster data; never describe failure as an empty league and never blend a stale Free Agent response into a fresh roster cohort.
- Live result: the owner completed the real FGC export for Xbox Series X/S franchise `742482`; 32/32 team rosters and 2,044 unique assigned players are ready for canonical preview work. The explicit Free Agent request is blocked upstream and remains a required deferred dataset.
- Release gate: migration 22, security/privacy regressions, roster-assignment evidence, and the consolidated strict gate pass. This release remains non-activating: no live Madden data, reset, snapshot, ownership, or production behavior changes.

## 7.3.1 — Season, Player, and Ownership Identity Model

- Add permanent franchise seasons, stable player identities/source aliases, player season summaries, GM identities, and team ownership periods.
- Preserve player career totals while allowing prior-season gamelogs to expire after season close.
- Make GM history person-owned rather than team/name-owned so career results survive team changes.
- Map the 32 captured teams and 2,044 certified rostered players into a private FGC preview without waiting for the blocked Free Agent route; label the preview as rostered-player-only until Free Agents are accepted.
- Gate: players and owners survive new seasons, team changes, and later Madden editions without losing or merging identities incorrectly.
- Local candidate adds migration 23, permanent source aliases, person-owned GM records, non-overlapping ownership periods, and a Platform Workspace identity preview UI backed by a platform-owner-only endpoint.
- The preview requires an explicitly reviewed source-season key; it does not guess a season from the current capture.
- When Madden Free Agents are blocked, the preview records `rostered-players-only`, stores a null Free Agent count, and visibly states that the failure is not proof of zero Free Agents.
- No production, Main, reset, import, active-snapshot, or membership authority is included.
- Live staging result: migration 23 and Preview deployment `c8df85cf` are verified. An explicitly authorized simulated commissioner/platform-owner analyzed all 43 captures, mapped 32 teams and 2,044 rostered players, and created one private 2026 identity preview. The temporary membership is inactive, all temporary sessions are revoked, audit and identity rows are retained, foreign keys are clean, and active snapshots remain zero.
- The accepted preview is deliberately `rostered-players-only`: Madden Free Agents remain `blocked`, their count is null rather than zero, and no reset, import, activation, Production, or Main change occurred.

## 7.3.2 — Sub-60-Second Madden 27 Import Engine

- Map teams, players, rosters, Free Agents, standings, schedules, and statistics into one candidate snapshot using bounded parallel work.
- Preserve source IDs/provenance, reject duplicates/invalid assignments, and make repeated identical exports idempotent.
- Provide a commissioner-operated import workspace with one-time destination creation, live phase/progress display, elapsed time, source counts, validation warnings, retry guidance, and a clear preview-ready result.
- Commissioners review the candidate before any activation; the workspace must distinguish complete, rostered-player-only, explicitly empty, stale, and failed datasets without silently falling back to legacy/demo data.
- Measure source download, each mapping phase, validation, activation, record counts, bytes, cold runs, and warm runs.
- Gate: an authorized FGC commissioner can complete the real click-to-preview workflow without platform-owner assistance; repeated realistic imports finish under 60 seconds, FranchiseHQ processing targets under 45 seconds, and any failure leaves the last complete snapshot active.
- Authorized implementation adds migration 24, one private destination per reviewed season, durable/idempotent source-fingerprint runs, exact mapper-run pinning, append-only candidate snapshots, and commissioner validation.
- The browser and server Worker share the same non-activating boundary: both stop at `preview-ready`, report per-phase and wall-clock duration, and never call reset or activation.
- The 2026 reviewed season is the staging destination. Madden Free Agents remain `blocked` with a null/unknown count, so the candidate is explicitly `rostered-players-only`.
- Publication, hosted checks, Preview deployment, Production acceptance deployment, the Madden 26-to-27 data-plane transition, migrations 21–24, and one Production candidate rehearsal were explicitly authorized. Main and snapshot activation were not.
- Live staging result: exact runtime commit `a17801a` on Preview deployment `6d7f2591` completed the authenticated 2026 candidate in 23.456 seconds. The validated private snapshot contains 32 teams, 2,044 rostered players, 14 games, 510 statistics rows, and 32 standings rows.
- Candidate completeness remains `rostered-players-only`; blocked Madden Free Agents are null/unknown. The active snapshot pointer was null before and after, the temporary session is revoked, the retained membership is inactive, and foreign keys are clean.
- Live Production acceptance result: exact source commit `4f5e81b` is deployed with Functions and the 7.3.2 Worker. The authenticated 2026 candidate retained 32 teams, 2,044 rostered players, 14 games, 510 statistics, and 32 standings; validation is `ready`, Free Agents are blocked/null, and the active pointer stayed null. The 74.387-second cold duration did not meet the sub-60 Production target and is recorded as an open acceptance failure rather than rounded away or replaced by the warm idempotent result.
- Production performance remediation first deployed commit `7557730`, reusing the exact immutable report and capture classifications, bounding R2 work, increasing D1 write batches, and reducing validation round trips. Its one authorized cold rehearsal created run `candidate_import_ee1356d9`, completed source/classification/team/player/schedule phases, then stopped safely at statistics mapping after D1 rejected an oversized player-identity lookup. No candidate snapshot was built, the active pointer remained null, and Free Agents stayed blocked/null.
- Exact repair commit `972bea6` preserves the 200-record statistics work chunk while splitting player identity reads into complete 75-value D1 batches. It passed the 77-test strict gate and 4/4 hosted checks, then reached Production as Pages deployment `61165506` and Worker version `a772c7e7` at 100%.
- The separately authorized repaired cold rehearsal used the existing retry path exactly once and completed in 43.763 seconds. It produced validation-ready private snapshot `841ce1b5` with 32 teams, 2,044 rostered players, 14 games, 510 statistics, 32 standings, zero validation errors, and no activation. The short-lived session was revoked, the active pointer stayed null, and Free Agents remained blocked/null.
- After owner acceptance, a separate explicit activation authorization moved the single Production pointer to exact snapshot `841ce1b5`. Post-activation checks preserved the validated counts, blocked/null Free Agent state, clean foreign keys, eight users, eight memberships, zero team assignments, and six membership-audit rows; the activation session is revoked and forward-transaction detection remains a separate pending stage.

## 7.3.3 — Safe Reset and Season Transition

- Make game year a first-class boundary separate from franchise season year. A league can advance many franchise seasons within Madden 27 without triggering an edition transition.
- Provide separate Replace Current Import, Start New Franchise Season, and Archive/Remove Madden Game Year operations rather than one destructive button.
- At a Madden 27-to-28 transition, archive all Madden 27 league data under an immutable game-year manifest, verify its counts/checksums, detach it from the active data plane, and allow the commissioner to remove the archived copy under an explicit second confirmation.
- Preserve users, leagues, memberships, roles, sessions, settings, rules, and audits across every game-year transition. Clear edition-specific team assignments for reviewed remapping rather than carrying them into the next game by inference.
- Preview exact affected counts, record a recovery bookmark and durable audit event, and require typed confirmation scoped to one league and game year.
- At season close, freeze player season totals and GM/postseason summaries while allowing old gamelogs and live operational records to be removed.
- Gate: an isolated rehearsal completes inventory → archive → verify → detach/remove active data → import next game year → validate → optional activation → rollback. Failures never expose partial data or erase the persistent league/account plane.
- Implementation adds migration 25, first-class Madden game years, separate commissioner operation cards, immutable archive manifests/parts/events, raw-source and relational checksums, exact typed confirmations, recovery bookmarks, franchise-season closures, scoped active-data removal, resumable row/byte-bounded recovery, and exact boundary-state restoration. The legacy broad-reset endpoint is retired.
- Live isolated-staging result: migration 25 is applied only to `franchise-hq-staging-db`. One private immutable archive verified 7,455 scoped rows and 43 source objects (44 objects / 33,758,815 bytes), then the workflow detached and removed the staged Madden 27 active plane and restored it from the same archive. The archive copy remains retained.
- The cloud rehearsal exposed and closed three gaps: recovery now persists bounded cursors across requests; archive scope now includes identity-owned mapping parents; and rollback restores exact franchise-season, game-year snapshot, league-snapshot, and destination statuses. The first immutable archive required an audited two-parent compatibility repair, after which all 32 identity teams and 2,044 identity players were restored.
- Final staging state is intentionally non-active: the league snapshot is `validated`, its game-year link is `candidate`, the franchise season is `preview`, and active snapshot rows remain zero. Users/memberships remain 1/1, temporary access is inactive/revoked, foreign keys are clean, and Free Agents remain blocked/null rather than zero.
- Exact game-year implementation commit `061639d` passed 91/91 local tests and 4/4 hosted checks in PR #13. At that validation checkpoint, Production, Main, Production migration 25, Production archive/removal/recovery, data reset, and snapshot activation remained unchanged and unauthorized.
- The owner subsequently authorized one cumulative direct Production acceptance cycle. Exact acceptance candidate `b373f66` corrects the stale shell label to show its host-derived environment and release 7.3.3, passed 4/4 hosted checks, and is live as Pages deployment `e926a37f` with additive migration 25 applied.
- Production reconciliation retained one league, eight users, eight memberships, six active team assignments, exact active snapshot `841ce1b5`, 32 identity teams, and 2,044 rostered-player identities. Free Agents remain blocked/null, foreign keys are clean, and all Production transition/archive/recovery/removal row counts remain zero. Git Main remains unchanged.

## 7.3.4 — FGC Madden 27 Certification

- Select the candidate run by the newest analyzed report/capture fingerprint, not by the league's previously completed candidate. The same exact export remains idempotent; a new fingerprint can build a new private candidate.
- Show capture time, source fingerprint, active week, captured week, and schedule/statistics coverage before candidate work starts. Refuse a capture older than the active snapshot.
- Carry older game/statistic records forward only when the active snapshot belongs to the same Madden game year and franchise season. Fresh exact-ID records win; current/future prior-week rows are not copied.
- If active Week 7 is followed by a capture that supplies only Week 9, visibly report Week 8 as missing. Never imply that an unavailable week was imported or manufacture its games/statistics.
- Reconcile every source total, unknown route, duplicate, unassigned player, and Free Agent result before activation is considered. Blocked Free Agents remain unknown/null.
- Production-first gate: publish and deploy one exact candidate only after separate owner authorization, then let the commissioner run one real new capture-to-private-candidate cycle. The existing active snapshot stays live; activation remains a later explicit authorization. Staging is skipped unless explicitly requested.

## 7.3.4.1 — Permanent League Export Connection

- Create exactly one reusable Madden Companion export URL per league. Its credential is deterministically derived from a protected server root and a stored league token version; the credential itself is never stored in D1.
- Make rotation an explicit commissioner action that increments the token version and immediately invalidates the prior URL while preserving captures, reports, candidates, and the active snapshot.
- Automatically group each Madden request burst into a durable discovery cohort, retain duplicate payload links without duplicating raw R2 data, and analyze the cohort after a three-second quiet window. An interrupted cohort is still analyzed and shown as review-required.
- Advance `latest_ready_report_id` only when source identity, 32-team roster coverage, schedule, standings, statistics, and rostered-player assignment evidence pass. A failed or partial newest export remains visible but cannot displace the prior ready report.
- Treat Madden's blocked Free Agent response as rostered-player-only readiness with a null/unknown count. Never convert the upstream failure into an empty Free Agent pool.
- Expose the permanent connection and latest received/analyzed time, captured week, route count, counts, warnings, and private-candidate status in Commissioner HQ. The normal weekly workflow is: export to the same URL, wait for Ready, and select **Import Latest Export** once.
- The one-click action creates or reuses the private season destination and runs the existing non-activating candidate pipeline. Migration 26 is additive; no reset, game-year transition, Main change, real capture/import, Production deployment, or snapshot activation is included in the local implementation authorization.

## 7.3.5 — Team, Roster, Player, Statistics, Standings, and Free Agent Experience

- Serve team pages, roster groups, player profiles, Free Agent browsing, standings, and statistics from one active Madden 27 snapshot.
- Show source-supported ratings, contracts, abilities, positions, freshness, and honest unavailable/stale states.
- Build phone-first layouts without player-card overflow, horizontal page scrolling, or nested-scroll traps.
- Gate: phone and desktop counts/identities reconcile to the active FGC snapshot with no old-owner, logo, color, player, or demo fallback.

## 7.3.6 — Stable Team and Player URLs

- Add league-scoped `/teams/{teamSlug}` and `/players/{publicPlayerId}` routes.
- Link players from rosters, Free Agents, statistics, transactions, Trade Block, and proposals; link teams throughout the platform.
- Preserve valid links through trades, releases, season transitions, and display-name changes while exposing only safe social metadata.
- Gate: two users opening one URL see the same active identity and raw database row IDs are not the public contract.

## 7.3.7 — Ownership, My Team, GM History, and Trophy Cases

- Match imported teams to FranchiseHQ memberships without trusting owner names in Madden data.
- Record ownership periods and attribute each game to the owner controlling the team when that game occurred.
- Track regular-season and playoff records, teams managed, playoff appearances, conference championships, Super Bowl appearances, and Super Bowl championships across teams.
- Gate: Justin resolves to Buccaneers and Gas to Packers after reviewed assignment; no duplicate owner/cross-tenant inference is possible; career totals reconcile to season records.

## 7.3.8 — Incremental Madden Updates

- Build on the permanent 7.3.4.1 Companion intake to reconcile later ready candidates without a destructive full reset.
- Compare snapshots, report freshness/warnings, and activate teams, rosters, transactions, schedule, standings, and statistics atomically as supported.
- Gate: duplicate exports are idempotent, successful updates are coherent, and failure/rollback retains the previous complete experience.

## 7.3.9 — Additional Madden Source Adapters

- Investigate policy-compliant direct-EA connectivity using documented/authorized access only.
- Add CSV/Excel intake where commissioner exports are available.
- Make every adapter feed the same validator and snapshot activation contract.
- Gate: no undocumented credential exchange, prohibited scraping, or unstable private endpoint becomes a production dependency.

## 7.4.0 — Full Trade Center and Advanced Trade Block

- Server-backed listings, multi-asset offers, counters, decisions, review, status history, concurrency, notifications, and canonical links.
- Gate: two accounts see one lifecycle; unauthorized, stale, duplicate, replayed, and cross-tenant actions fail safely.

## 7.4.1 — Transactions and League History

- Canonical trades, signings, releases, movements, evidence, corrections, season history, and permanent links.
- Gate: repeated evidence is idempotent and each transaction reconciles to before/after roster states.

## 7.4.2 — Commissioner HQ and Rules

- Move settings to `league_settings` with revisions, validation, and optimistic concurrency.
- Consolidate member/team/role administration, feature controls, audit history, and Rules drafts/publication.
- Gate: Commissioner A's saved revision becomes authoritative for Commissioner B and conflicts cannot silently overwrite newer work.

## 7.4.3 — GOTW and Confidence Pool

- Build schedule-backed GOTW selection and Confidence Pool weeks, picks, locks, scoring, standings, corrections, and audit.
- Gate: incomplete/ambiguous schedules cannot open or score, and phone/desktop permission and timing tests pass.

## 7.4.4 — Mobile UX, Accessibility, Performance, and Legacy Removal

- Audit all routes at phone, tablet, and desktop widths; complete keyboard, focus, screen-reader, contrast, reduced-motion, and performance work.
- Remove nested-scroll traps, oversized cards, dead renderers, duplicate modules, stale local authorities, seeded identities, and unused styles behind regressions.
- Gate: critical journeys have no horizontal page scroll and pass automated plus manual accessibility/phone acceptance.

## 7.4.5 — Canonical League Consistency

- Use one server season/week/snapshot and shared team/player/game selectors across all features.
- Standardize loading, empty, unavailable, stale, and incomplete-import states.
- Gate: no feature silently falls back to demo/local data and all core pages report the same identities/context.

## 7.4.6 — Monitoring, Backups, Security, and Recovery

- Add tenant-safe logs, request/action IDs, useful alerts, retained backups, restore drills, rate limits, dependency/secret procedures, and incident communications.
- Gate: a simulated failure is detected, contained, restored, reconciled, and documented without exposing private data.

## 7.5.0 — Authentication and Session Framework

**Cost-control rule:** Capture the cookie/origin/callback/route evidence once, approve one design, implement once, run one consolidated automated gate, and perform one device acceptance cycle. No speculative patch loop.

- Establish one public-domain session model plus a controlled owner recovery path.
- Centralize Discord OAuth, issue/rotation/expiry/revocation, logout, CSRF, and capability checks.
- Preserve safe direct routes through refresh and authentication return; invalidate access after role/revoke changes.
- Gate: refresh, login, logout, expiry, replay, revoke, CSRF, cross-league, mobile Discord, mobile browser, and desktop tests pass.

## 7.6.0-rc.1 — Private FGC Release Candidate

- Freeze scope except release blockers and test a representative private cohort of commissioners, committee members, and owners.
- Validate onboarding, ownership, Madden data, URLs, trades, transactions, rules, GOTW, confidence, mobile, recovery, and sessions.
- Rehearse deployment/rollback from exact artifacts; publish privacy, terms, support, retention, incident, and help material.
- Gate: no unresolved critical/high blocker, recovery reconciles, monitoring/support are active, and the owner accepts one exact candidate.

## 7.7.0 — FGC Production Launch

- Deploy the accepted RC commit, execute only pre-authorized migrations/imports, invite FGC in waves, and observe key signals.
- Gate: owner acceptance passes on production and the observation window, release record, roadmap, support notes, and recovery evidence are complete.

## 8.0.0 — Multi-League Activation

- Enable controlled creation of additional leagues with isolated branding, domains, features, roles, imports, storage, jobs, rate limits, logs, backup/export, suspension, and deletion.
- Gate: two real leagues operate concurrently and every recovery/lifecycle exercise affects only its selected tenant while FGC stays unchanged.

## 8.1.0 — Multi-League Administration and Operations

- Support different roles/teams per account, safe league switching, platform-owner separation, lifecycle administration, quotas/billing readiness, support/audit tools, and custom-domain automation.
- Gate: role/team/domain/lifecycle changes cannot cross tenants and platform operations are separately authorized and audited.

## Delivery method for every version

1. Confirm scope, exclusions, and authorization boundary.
2. Start from the exact accepted production commit and create one version branch.
3. Implement related work together; do not publish partial patch chains.
4. Add regressions for each defect and contract tests for each new authority.
5. Run one consolidated strict gate and update this roadmap with discoveries.
6. Review the candidate, then request Production authorization. Staging is not used unless the owner explicitly requests it for that release.
7. Publish one exact commit, validate that exact build, observe it, and record owner acceptance.

## Change log

- **Revision 1.18:** Recorded 7.0.5 domain-specific authentication and Commissioner management work and its partial owner acceptance.
- **Revision 1.19:** Accepted refresh/login temporarily; elevated shared settings; adopted the 7.1–8.1 sequence; deferred authentication until after core platform work; retained Free Agents, multi-source import, and mobile requirements.
- **Revision 1.20:** Recorded authorization for one consolidated 7.1 commit, push, pull request, and hosted-check cycle.
- **Revision 1.21:** Completed staging recovery rehearsal and production migrations 18–20 with protected data reconciled; advanced to the 7.2 decision gate.
- **Revision 1.22:** Recorded the authorized 7.2 tenant-ready implementation; centralized tenant resolution, scoping, feature/domain configuration, storage namespaces, and audit context; moved verified Madden 27 discovery/import/activation directly after 7.2; retained session redesign at 7.5.0 before the private RC.
- **Revision 1.23:** Recorded the owner's consolidated authorization for one 7.2 commit, branch push, pull request, hosted checks, staging migration 21, and deployment of the exact candidate to the registered isolated staging environment. Production remains outside this authorization.
- **Revision 1.24:** Completed PR #9 publication and hosted checks; applied migration 21 only to `franchise-hq-staging-db`; provisioned isolated Preview D1, R2, and KV resources plus staging-only runtime secrets; redeployed exact commit `5799c35` successfully as Cloudflare Preview deployment `041c8c85-54e6-4927-b5bb-f8fc460e3be2`. Direct `pages.dev` browser smoke testing remains blocked by the owner's computer security, and production remains unchanged.
- **Revision 1.25:** Authorized and began 7.3.0 on the staging-validated 7.2 baseline; added the Madden 27 secure discovery-session/source-lock design, explicit Free Agent proof states, duplicate-payload session linking, sanitized structural fixture contract, and revised 7.3.1–7.3.9 roadmap for stable history, sub-60-second import, safe season transitions, FGC certification, production experiences, URLs, GM history/trophies, incremental updates, and additional adapters. No cloud publication, migration 22, live capture, reset, import, or activation is included in this implementation authorization.
- **Revision 1.26:** Published commit `d4362fa` to `codex/franchisehq-7.3.0`, confirmed 3/3 hosted checks, applied and verified migration 22 only on `franchise-hq-staging-db`, and confirmed successful Preview deployment `3dc10c9a-6c4a-48da-aaf9-9b3a2dbdb44b`. The stacked pull request is prepared, one isolated FGC discovery session is authorized, and live Madden source capture remains pending. Production, Main, reset, import, and snapshot activation remain unchanged and unauthorized.
- **Revision 1.27:** Reconciled the real FGC capture: 43 requests, 10.17 MB, 0.448-second source delivery, 32 teams/rosters, 2,044 unique assigned rostered players, standings, 14 current-week games, and 510 statistics rows. Added privacy-safe roster assignment certification, prevented stale Free Agent payload blending, accepted successful explicit zero-player responses, and kept the failed Free Agent route as a visible upstream blocker that does not discard the rostered-player dataset. 7.3.1 now begins with stable identity and a private 2,044-player roster preview; production remains unchanged.
- **Revision 1.28:** Made the commissioner-operated importer an explicit 7.3.2 deliverable: authorized commissioners create the destination, monitor sub-60-second phases, review counts/warnings/completeness, and reach a private candidate preview without platform-owner assistance. Activation, reset, and season transition remain separately protected by the 7.3.3–7.3.4 gates.
- **Revision 1.31:** Completed the authorized 7.3.1 isolated-staging acceptance against Preview deployment `c8df85cf`: analyzed 43 captures, mapped 32 teams and 2,044 rostered players, created the owner-reviewed 2026 private identity preview, retained audit/identity rows, revoked every temporary session, deactivated the simulated membership, preserved blocked Free Agents as unknown/null, and confirmed zero active snapshots and zero foreign-key violations. Production, Main, reset, import, and activation remain unchanged and unauthorized.
- **Revision 1.32:** Authorized 7.3.2 from exact commit `483c4b81`: a commissioner-only private candidate importer with one reviewed 2026 destination, durable idempotency, measured progress, exact mapping pins, append-only build, validation, and a hard stop at preview-ready. Authorized one consolidated branch/PR/check cycle and isolated-staging rehearsal while keeping Production, Main, resets, and activation excluded.
- **Revision 1.33:** Completed 7.3.2 isolated-staging acceptance against exact Preview runtime `a17801a`: migration 24 verified with protected counts unchanged, PR #12 passed 4/4 hosted checks, and the real 2026 candidate reached validation-ready in 23.456 seconds with 32 teams, 2,044 rostered players, 14 games, 510 statistics, and 32 standings. Blocked Free Agents remain unknown/null; the session is revoked, membership inactive, active snapshots zero, and Production/Main/reset/activation untouched.
- **Revision 1.34:** Completed the authorized Madden 26-to-27 Production transition and 7.3.2 acceptance deployment without moving Main or activating a snapshot. The clean Madden 27 plane retained the platform identities, the private candidate validated with 32 teams and 2,044 rostered players, and its 74.387-second cold result left Production performance acceptance open.
- **Revision 1.35:** Deployed the authorized 7.3.2 cold-path optimizations and used exactly one Production rehearsal. That run stopped safely at statistics mapping on D1's SQL-variable ceiling before candidate build. Repair `972bea6` now batches complete player lookups under the ceiling and is active in Pages deployment `61165506` and Worker version `a772c7e7`; 4/4 hosted checks pass, temporary sessions are revoked, users/memberships/team assignments are unchanged, foreign keys are clean, Free Agents remain blocked/null, and the active snapshot remains null. A new cold rehearsal requires separate authorization.
- **Revision 1.36:** Used the separately authorized repaired cold rehearsal exactly once against active commit `972bea6`. Run `candidate_import_ee1356d9` reached a private validation-ready preview in 43.763 seconds with 32 teams, 2,044 rostered players, 14 games, 510 statistics, and 32 standings. The session is revoked, foreign keys are clean, Main and the active snapshot pointer are unchanged, and Free Agents remain blocked with a null count. The next gate is owner acceptance; activation remains separately authorized.
- **Revision 1.37:** Recorded owner acceptance of the exact repaired 7.3.2 private candidate. This closes the release acceptance gate without activating the snapshot, changing Main, resetting data, creating another rehearsal, or changing the blocked/null Free Agent state. Snapshot activation and 7.3.3 implementation remain separate future authorizations.
- **Revision 1.38:** Used the separate snapshot-activation authorization exactly once for accepted snapshot `841ce1b5`. Production now has one active pointer with 32 teams, 2,044 rostered players, 14 games, 510 statistics, and 32 standings; validation remains ready with zero errors, Free Agents remain blocked/null, the activation session is revoked, foreign keys are clean, and Main/reset/memberships/credentials are unchanged. Forward-transaction detection remains a separate pending stage.
- **Revision 1.39:** Used the one-time Production forward-transaction authorization for exact active snapshot `841ce1b5`. One completed baseline job compared all 2,044 rostered players and one tenant audit row recorded the result; movements and classifications remain zero, the active pointer and counts are unchanged, Free Agents remain blocked/null rather than zero, foreign keys are clean, no temporary access was created, and Main/reset/activation remain unchanged.
- **Revision 1.40:** Completed the authorized 7.3.3 implementation from exact evidence commit `b6082b2`. Exact implementation commit `1076b498` is published in stacked PR #13 with 4/4 hosted checks passing. Migration 25 and local rehearsals cover separate import/season/game-year controls, immutable archive verification, detach/removal, archive-copy tombstoning, and recovery while preserving the league/account plane and blocked/null Free Agent semantics. Production, Main, cloud data, the active snapshot, and all live data remain unchanged; one isolated cloud rehearsal is the next separate gate.
- **Revision 1.41:** Completed the separately authorized 7.3.3 isolated-staging rehearsal. Migration 25, a 7,455-row/43-source immutable archive, staged detach/removal, resumable restoration, an audited two-parent identity dependency repair, and exact boundary-status reconciliation are verified with zero foreign-key violations. Exact implementation commit `061639d` passes 91/91 local tests and 4/4 hosted checks. The active staging pointer remains empty, Free Agents remain blocked/null, temporary access is revoked/inactive, and Production/Main/reset/activation remain unchanged and unauthorized.
- **Revision 1.42:** Adopted owner-directed Production-first acceptance for future releases; staging now requires separate explicit owner direction. Authorized one cumulative 7.3.3 Production acceptance cycle with additive migration 25 and exact candidate `67255af`, which replaces the stale 7.3.0 shell marker with accurate Production/7.3.3 identification. Transition execution, reset, Main, and active-snapshot changes remain excluded.
- **Revision 1.43:** Deployed exact 7.3.3 candidate `b373f66` to Production as Pages deployment `e926a37f` after 4/4 hosted checks, applied and reconciled additive migration 25, and immediately restored the Cloudflare Production branch setting to `main`. The active snapshot remains exact `841ce1b5`; protected counts are unchanged; Production transition/archive/recovery/removal rows remain zero; Free Agents remain blocked/null; and Git Main, reset, transition execution, and snapshot activation/change remain untouched. Owner UI acceptance is the next gate.
- **Revision 1.44:** Recorded owner acceptance of the visible 7.3.3 Production controls and completed the authorized consolidated 7.3.4 local build. The candidate scopes the importer to the newest analyzed export fingerprint, allows a different Week 9 source to proceed despite the prior preview-ready run, reuses identical exports, exposes skipped-week gaps, carries eligible older same-season games/statistics forward with fresh-record precedence, and refuses stale captures. The 94-test local suite passes; Production, staging, Git Main, the active snapshot, real capture/import, transitions, reset, activation, and blocked/null Free Agent semantics remain unchanged.
- **Revision 1.45:** Recorded Production 7.3.4 at exact Main commit `431583e` / Pages deployment `fafabfb2` and completed the authorized 7.3.4.1 local workflow redesign. One revocable URL now persists per league; automatic quiet-window cohorts analyze every full or partial export; only eligible reports advance the ready pointer; Commissioner HQ shows freshness/readiness and offers one **Import Latest Export** action. Migration 26 is additive and un-applied. Production, staging, Main, real capture/import, reset, transition, active snapshot `841ce1b5`, and blocked/null Free Agent semantics remain unchanged.
- **Revision 1.46:** Published 7.3.4.1 through PR #16 with 4/4 candidate checks passing, fast-forwarded exact commit `6de7c10` to Main, reconciled additive Production migration 26, and deployed exact Pages runtime `0eec0551`. One active league endpoint points to the existing eligible report without storing a raw credential. Public and authorization-boundary smoke checks pass; the active snapshot remains `841ce1b5`, protected counts are unchanged, and Free Agents remain blocked/null. No staging, real export/import, reset, transition, archive/removal/recovery operation, credential rotation, or activation ran.
- **Revision 1.47:** Diagnosed the first permanent-URL Production export. Madden successfully delivered one complete 43-route burst in 1.221 seconds—teams, 32 rosters with 2,043 current roster rows, standings, schedule, seven statistics routes, and the blocked Free Agent response—but concurrent receiver calls raced and split it across eight sessions. Authorized 7.3.4.2 adds a deterministic compare-and-swap cohort claim plus platform-owner-only exact-window recovery. No import, activation, reset, URL rotation, transition, or Free Agent reinterpretation is included.
- **Revision 1.48:** Published initial 7.3.4.2 candidate `90559f0` through PR #17 with 4/4 candidate checks and all Main deployment checks passing; Production Pages deployment `b0706bba` succeeded. Before recovery, a read-only reconstruction of all 43 retained R2 objects stopped safely on two parser gaps: Madden's weekly `/team` route was counted as league teams, and route-level franchise/week evidence was ignored. The corrected parser now proves 32 teams, 32 rosters/2,043 players, 15 schedule rows, seven statistics routes/207 rows, 32 standings rows, and blocked/null Free Agents as rostered-player-only ready. No recovery row, import, activation, reset, transition, credential rotation, or snapshot change has occurred yet.
- **Revision 1.49:** Corrective PR #18 passed 4/4 candidate checks and all Main checks; exact commit `e95ad2f` deployed as Production Pages `0747aebd`. The exact 43-route window was recovered into session `m27_recovered_8bf2666ce3393492ed580dac` and report `m27_report_8bf2666c-e339-3492-ed58-0dac09b696c9`; Commissioner HQ now shows Week 9, 43 routes, 32 teams, 2,043 rostered players, and **Ready to import**. One oversized administrative statement was atomically rejected with zero writes before the bounded successful application. Migration 26/79 tables, protected counts, token version 1, active snapshot `841ce1b5`, candidate/transition run counts, and zero foreign-key violations are unchanged. Free Agents remain blocked/null. No import, activation, reset, transition, archive, URL rotation, or new Madden export ran.
