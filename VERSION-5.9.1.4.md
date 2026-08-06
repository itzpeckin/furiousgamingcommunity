# Franchise HQ v5.9.1.4 — Madden Companion Export Receiver

This release adds a league-scoped Cloudflare Pages Function that accepts Madden Companion JSON exports and stores them as pending data without activating a league snapshot.

## Cloudflare bindings required

- R2 bucket binding: `COMPANION_EXPORTS`
- KV namespace binding: `COMPANION_EXPORT_META`
- Secret environment variable: `COMPANION_EXPORT_TOKEN`
- Optional KV namespace binding for per-league tokens: `LEAGUE_CONFIG`

When `LEAGUE_CONFIG` is present, the receiver first looks for `league:<league-slug>:companion:export-token` and then falls back to `COMPANION_EXPORT_TOKEN`.
