# FranchiseHQ 8.2.2 — Weekly staff loadout rules

## Scope

Per-league staff ability bans, duplicate-ability rules, and automatic screenshot checks in current-week tracked Discord matchup threads. The approved 78-entry catalog uses compact bronze icon cards, position groups, search, category filters and four tier descriptions. Development and scouting abilities use the same position grouping. Multi-position cards share one setting.

## Added during delivery

Revision checks prevent stale commissioner saves. Screenshot evidence is treated as untrusted input; author/team identity comes from Discord and FHQ membership. Known shared glyphs cannot prove identity or duplication. Incomplete reads request clearer evidence. Reports are retried and updated in place; current league, configuration and week are rechecked before posting. `/loadout status` and `/loadout missing` distinguish pending scans from missing submissions. Existing archetype scanning remains independent.

Migration 52 adds three opt-in tables. No league is enabled by the migration. `LOADOUT_READER_VERSION=m27-2026-10-02` must only be provisioned after hosted image-reader acceptance. Without it, rules can be saved but automatic checks cannot be enabled. Reference sheets are versioned and integrity checked. User recordings and full personal screenshots are not published.

## Known inherited blockers

No registered inherited quality failures. This session lacks Cloudflare deployment/database/AI access. Real screenshot recognition, hosted migration and release acceptance remain pending; fixture AI responses are not evidence of recognition accuracy.

## Validation evidence

See `validation-evidence.json`. The strict gate passed 494 tests. After adding explicit archive preservation, all 23 loadout/archive tests passed. The integrated commissioner component passed isolated desktop (1440px) and phone (390px) browser checks for layout, shared bans, filters, single-save behavior and league isolation, with no page errors or horizontal overflow. Actual image recognition and hosted acceptance remain pending.

## Deployment status

Owner authorized production publication. Candidate only: not merged, tagged or deployed. No production database change, Discord post, thread mutation, import or export has been performed.

Before merging: apply migration 52 through the existing D1 release tooling to staging and production with preservation checks; validate candidate Pages, actual screenshot recognition and commissioner controls; preserve all existing bindings and secrets. Register the new command through the existing scanner registration path. Validate hosted production after publication.

## Rollback

Restore final 8.2.1 Main `8bd6563a2aa5d61dbd9c1eb83ee9dc72ca062b88` (immutable tag v8.2.1 points to its implementation baseline). Retain additive migration 52 and submission records. Disable loadout checking/remove only its activation version if image acceptance fails. Existing import, scheduling, archetype and email Workers are unchanged.
