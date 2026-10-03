# FranchiseHQ 8.2.4 - Automatic Discord weekly loadout checks

## Scope

Members submit screenshots or supported public Xbox screenshot links in current tracked Discord scheduling threads. The bot reads staff abilities, applies the league's saved bans and duplicate rule, and replies in that thread. Commissioners manage opt-in and rules in League Controls. No website screenshot workflow is introduced.

## Added during delivery

A bounded server raster reader isolates the six staff slots, masks equipped checkmarks, and compares grayscale glyphs with 78 bundled, hash-bound catalog templates. Position-letter matching separates visually similar Practician abilities. An image model verifies layout and slot states; rejected phone layouts receive a bounded independent second read. Neither model names abilities or judges legality. Ambiguous glyphs never become a legal pass. Existing tenant, author/team, tracked-thread, history, retry and idempotent-report protections remain intact. Shared image rendering initializes its compiled module once for both Discord cards and screenshot decoding.

## Known inherited blockers

Trimmed Edges and All Hustle share a visible glyph, so overview screenshots cannot prove which one is equipped. Blurry, clipped, strongly angled or low-contrast screenshots can require resubmission. The supplied angled photo remains uncertain for DL/OL in slot 5. Localization currently requires three visible equipped checkmarks; unsupported layouts receive an unreadable result, never an assumed pass. Console share-page formats beyond the existing Xbox resolver require a direct Discord image attachment. Live Discord end-to-end delivery is not claimed by isolated preview acceptance. Each league remains opt-in with its own commissioner-selected bans.

## Validation evidence

The actual preview runtime decoded original console/phone screenshots and used the Cloudflare AI binding. Six console abilities, four phone-photo abilities and five further phone-photo abilities were correctly identified. Camp Counselor correctly failed a test ban; a synthetic duplicate correctly failed the duplicate rule. The angled photo requested a clearer slot 5. A clipped image received no legality decision, and archetype-only images were ignored. The supplied Xbox URL resolved successfully; its coaching-archetype image was correctly ignored by the loadout reader. Original screenshots remain private and are not committed. Backend regressions cover actual-author mapping, cross-league rules, current-week guards, pagination, retries, idempotent replies and status/missing reports. Final strict and hosted gates are recorded in validation-evidence.json.

## Deployment status

Standing owner authorization covers this release. Recognition is activated only after hosted acceptance. No league is opted in automatically and no rule, snapshot, import, scheduling thread or account is modified. The temporary authenticated preview-only acceptance adapter was removed before production; its preview deployment and temporary token are retired after testing. There is no public lab, screenshot uploader or new member setup step.

## Rollback

Unset LOADOUT_READER_VERSION to stop weekly loadout recognition without changing saved league rules or coaching-archetype checks. Restore final 8.2.3 Main 5950f8b885b0fb5b4aae92ab35bf64e200344d4d if application rollback is needed. Immutable tag v8.2.3 remains at its original release commit. Migration 52 and all separate Worker deployments remain unchanged.
