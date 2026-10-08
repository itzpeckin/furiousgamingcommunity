# FHQ 8.2.7 — League gameplay rules

## Scope
Commissioners configure rushing and passing statistics, inclusive minimum/maximum limits, and enablement under League Controls → Gameplay Rules. Discord /rush rule and /pass rule audit completed regular-season games across the current season. Missing statistics remain unverified. Rushing retains its existing player/team yard reconciliation.

Roster ability allowances configure counted traits, equal or half-specialist weights, and strict cap or development-exempt benchmark. /abilities shares the settings; development exceptions require acquisition history before a violation can be confirmed. No automated roster edits or trade blocking is introduced.

League Rules Studio displays a generated saved-rule summary separately from editable publication drafts. Member rules API and /rules share that summary. Existing rush (minimum 10 carries) and ability (7.5 weighted SS/XF development-exempt) defaults are preserved until saved; passing defaults off.

## Added during delivery
User requested selectable statistics and minimum/maximum limits for both passing and rushing. Saving rejects stale revisions and invalid settings, preserves unrelated settings, records tenant audit and revision history, and does not install responses from a different league. Double-click saves are suppressed.

## Known inherited blockers
None registered. Earned-development policy cannot prove an acquisition violation from current roster counts alone. No automatic penalties are claimed.

## Validation evidence
Actual renderer/event-handler browser fixtures passed at 1440px and 390px: selections, values, single-save behavior, league switch isolation, no overflow or JavaScript errors. Full strict gate passed: 534 tests, syntax, environment contract, schema 53, security, inventory and release checks. Signed local Discord requests exercise /pass; scanner registration fixture proves the added command is upserted once.

## Deployment status
Released through PR #185 at Main/tag v8.2.7 33a2a9e1fcb2340e5a5a242a8a89df88a118177c. Production Pages ad27487d-c157-40c7-89a2-098def5b9ccb; preview 7422b239-48c7-4997-b942-27f7f0222ccd. CI 37711083885 passed. Each hosted environment passed 29 checks. Authenticated FGC desktop read-only acceptance confirmed controls and the generated Rules Studio summary. The scheduled scanner registered the new /pass command; its versioned registration flag was verified. No live Discord invocation or live save was performed. Existing league settings and both active snapshots remain unchanged. No migration, binding, Worker, provider, or credential changes were required.

## Rollback
Restore the prior Pages deployment 4c21acdf-2c55-4040-a186-d9526264fd13 (Main 6b8b669f9947262f05cf7962ac495cea5d264cb1). Schema stays 53. Saved gameplayRules JSON remains retained but the prior runtime uses its former defaults. Re-register the prior command catalog if rolling back /pass. Do not delete commissioner settings or any league data.
