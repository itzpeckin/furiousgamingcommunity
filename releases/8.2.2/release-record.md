# FranchiseHQ 8.2.2 — Weekly staff loadout rules

## Scope

Per-league staff ability bans, duplicate-ability rules, and automatic screenshot checks in current-week tracked Discord matchup threads. The approved 78-entry catalog uses compact bronze icon cards, position groups, search, category filters and four tier descriptions. Development and scouting abilities use the same position grouping. Multi-position cards share one setting.

## Added during delivery

Revision checks prevent stale commissioner saves. Screenshot evidence is treated as untrusted input; author/team identity comes from Discord and FHQ membership. Known shared glyphs cannot prove identity or duplication. Incomplete reads request clearer evidence. Reports are retried and updated in place; current league, configuration and week are rechecked before posting. `/loadout status` and `/loadout missing` distinguish pending scans from missing submissions. Existing archetype scanning remains independent.

Migration 52 adds three opt-in tables. No league is enabled by the migration. `LOADOUT_READER_VERSION=m27-2026-10-02` must only be provisioned after hosted image-reader acceptance. Without it, rules can be saved but automatic checks cannot be enabled. Reference sheets are versioned and integrity checked. User recordings and full personal screenshots are not published.

## Known inherited blockers

Cloudflare access was restored and verified against the FHQ Pages project and Madden 27 database. Publish the approved catalog and per-league rule settings with automatic screenshot checking disabled. Do not set `LOADOUT_READER_VERSION`: the candidate Qwen reader exhausted its 1,800-token response budget on the supplied console screenshot without returning a usable result. Alternate model/prompt experiments did not establish recognition acceptance. The first experimental request had a truncated reference image and is excluded from acceptance evidence. No screenshot was sent to Discord and no league was opted in.

## Validation evidence

See `validation-evidence.json`. The strict gate passed 494 tests. After adding explicit archive preservation, all 23 loadout/archive tests passed. The integrated commissioner component passed isolated desktop (1440px) and phone (390px) browser checks for layout, shared bans, filters, single-save behavior and league isolation, with no page errors or horizontal overflow. Candidate preview d99f38d7-23ca-4342-970b-864707066c0a passed 22 hosted checks, including both reference image hashes. Staging migration 52 preserved protected counts with no foreign-key violations. Automatic recognition acceptance has not passed; its activation gate remains closed.

## Deployment status

Owner authorized production publication. Release scope is the catalog and saved-rule controls; automatic checking is unavailable until a subsequent validated activation. Migration 52 has passed staging and production preservation checks. At this commit merge and production verification remain pending. No Discord post, thread mutation, import or export has been performed.

Before merging: apply migration 52 through the existing D1 release tooling to staging and production with preservation checks; validate candidate Pages, actual screenshot recognition and commissioner controls; preserve all existing bindings and secrets. Register the new command through the existing scanner registration path. Validate hosted production after publication.

## Rollback

Restore final 8.2.1 Main `8bd6563a2aa5d61dbd9c1eb83ee9dc72ca062b88` (immutable tag v8.2.1 points to its implementation baseline). Retain additive migration 52 and submission records. Disable loadout checking/remove only its activation version if image acceptance fails. Existing import, scheduling, archetype and email Workers are unchanged.
