# FHQ 8.2.6

## Scope
Discord Gateway event intake for opted-in current matchup threads, durable retries, per-submission claims, edit invalidation and elapsed-time evidence. The minute scanner remains recovery. Read four playsheet names and apply commissioner bans independently per league. Use transparent green check and red X application emoji.

## Added during delivery
A conservative console-capture recognition path bypasses AI only when labels, six staff slots and four playsheet slots are verified. Unknown layouts use the existing independent reader plus playsheet text extraction. Five captures supply isolated label/text templates; this is not independent acceptance data. Trainers are excluded; duplicates apply to staff only. Catalog contains 64 names from Madden Tools and three legacy names observed in supplied screenshots.

## Known inherited blockers
No registered quality exceptions. Under-five-second production completion is not proven and AI fallback can take longer. Gateway is enabled and Discord READY was confirmed. A newly posted live screenshot has not been independently exercised.

## Validation evidence
See validation-evidence.json. Local tests exercise canonical author lookup, concurrent claims, edited screenshots, rules, tenant scope, auth, bounded bodies, durable event ordering, heartbeat/resume, retry and polling recovery. Strict gate passed 531 tests; final focused suite passed 41. Desktop 1440px and phone 390px rule controls passed. Hosted acceptance identified 7 of 8 unique supplied screenshots on the first pass; the remaining phone photo identified on retry. An actual banned Dollar playsheet was rejected; blank/clipped images received no legality verdict. Recognition is not universally reliable or consistently under five seconds. Production Discord READY confirmed at 08:27:23 UTC; custom application emoji provisioned. A fresh live Discord upload-to-result acceptance remains pending.

## Deployment status
PR183 merged at 730bfde248cd6f28bafed70ca366f3b2da1d47c3; immutable tag v8.2.6. Production Pages 46f5c84a-d74d-4aaf-ab63-a19e3317e771 passed 27 hosted checks. Migration 53 is applied to staging and production; active snapshots and saved rules verified unchanged, foreign keys clean. Scanner Worker e5f2fa79-d9f5-43ca-b3fe-d716f1c49424 and SQLite Gateway namespace are active; Discord READY confirmed. Existing background recovery is retained. No league rules changed. Custom emoji provisioning creates only two app-owned assets. The private scanner credential authorizes fixed-origin HTTPS retrieval of the existing bot token; that token stays only in Gateway memory and is never logged or stored in jobs. No new provider credential is required.

## Rollback
Disable LOADOUT_GATEWAY_ENABLED in Pages and scanner Worker, deploy v8.2.5 and restore reader variable m27-glyph-reader-2. Retain additive migration 53 and all evidence; never drop submission history. Preserve the minute scanner.
