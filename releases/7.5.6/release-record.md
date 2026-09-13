# FranchiseHQ 7.5.6

Status: Production deployed and public read-only acceptance passed; commissioner annual-import and Discord server acceptance remain pending.

## Scope

Keep the full known season schedule without deriving the league clock from its highest week. Current-state metadata or captured playable statistic-period evidence controls the current period. Accept multi-period regular-season schedule aggregates with row-level payload periods, preserve normal route priority and empty placeholder handling, retain future matchups, and keep application matchup IDs stable across source renumbering.

## Added during delivery

Persist current-period proof, schedule horizon, and the exact prior-snapshot transition in immutable candidate manifests. Recompute transition eligibility against retained snapshots before Discord work. Automatic same-week and preload paths are read-only no-ops; ambiguous, initial, backward, skipped and cross-season transitions require review. Verified one-week advances create the whole current schedule before deleting previous FranchiseHQ threads. Creation failure and snapshot supersession preserve previous threads. The existing commissioner week command can retry a verified failed regular-season advance without another import.

Share recorded current context with the web shell, competition, ownership periods and Discord schedule/results. Expose commissioner-only sync review/retry information in the existing detailed import panel without changing compact Command Center sizing. Publish the annual commissioner runbook and correct the remaining roadmap's backward release numbering. Existing trade UI, command definitions, league controls and season-close mechanics remain intact.

## Known inherited blockers

No newly registered quality failure. Full-season availability depends on Madden supplying the matchups. Blocked Free Agents remain unknown/null. Real annual off-season import and Discord server behavior still require commissioner acceptance; this code-only deployment does not execute those operations or claim they happened.

## Validation evidence

Synthetic D1/R2 acceptance maps and builds 272 games over Weeks 1–18 with current Week 1, validates with no errors, opens all 18 Confidence weeks through existing controls, and preserves a saved pick's matchup identity on renumbering. Regression coverage includes exact-source atomic/idempotent activation, normal route precedence, unresolved aggregate rejection, conflicting current metadata, season-scoped initial import, preseason opening, same-week no-work, proved Week 2 only, failed replacement preservation, and commissioner-command retry. Strict gate passed 222/222 tests, 256 syntax modules, 76 routes, 23 canonical migrations and 116 required tables. Additional authentication/mobile checks passed 12/12. All four PR checks and five Main checks passed. Public read-only acceptance confirms healthy Production, release 7.5.6, the exact Main public landing template, and five exact Main asset hashes. No authenticated UI reload or live import was used for this acceptance.

## Deployment status

Exact candidate `650ba0896cc2bbd9cab6885ed1a4c5e8c7792a96` was published through PR #94 and merged as Main `01609a6fe38e0fe080a67abadf31abec877712b3`. Production Pages deployment `67546407-9ec0-46ec-a3be-4ff40f944c0e` succeeded. Main quality workflow `34739568774` and deployment workflow `34739568125` passed. Migration remains 40. No live import, active snapshot move, reset, season archive/transition, export URL rotation, ownership edit, Discord registration/configuration, credential or membership/assignment change was performed. Real commissioner off-season acceptance follows the annual runbook; it is not claimed by this code-only release.

## Rollback

Redeploy the exact 7.5.5.15 accepted source baseline `5f44b480e6581d5bab1cbe81a37b5df23590848f` if code acceptance fails. No reverse migration or data reset is required. Preserve all snapshots, capture evidence, pick ownership and thread audit rows. Do not automatically restore an old active snapshot or delete Discord resources during a code rollback.
