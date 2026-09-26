# FranchiseHQ 8.0.14 — EA period evidence

## Scope

Complete the ongoing owner-requested EA Direct investigation after private preview still failed on 8.0.13. Standing release authorization applies.

## Added during delivery

Retain the parser failure reason as a fixed category and only bounded numeric season/week fields, presence flags and available export indices in the existing private commissioner job result. No raw provider strings, tokens, account IDs or response bodies are retained. The UI keeps concise guidance. This evidence allows a precise repair instead of another unverified period assumption.

## Known inherited blockers

8.0.13 fixed stale game statistics and supports the documented native hub fields, but job eaj_5bd0ba7c-e2ca-4301-ad5c-959504dbdf2e still failed live season/week verification. The exact mismatch needs the bounded evidence from a fresh private preview.

## Validation evidence

Strict gate, diagnostic redaction, collection and authentication regressions required. Results and live evidence recorded on the PR. Migration 48 unchanged.

## Deployment status

Pages-only follow-up candidate, production authorized. Worker remains 8.0.12. Validation uses private preview only; no import or active snapshot mutation.

## Rollback

Restore 8.0.13 Main 1d64bea94d7b2abe2e2e067f66c7988967dc1f65, Pages d2001fad-6390-4436-aeb4-fa5189a47976. Retain all saved data and Worker version 239d366e-f0e0-46e8-97a3-bf371a55c793.
