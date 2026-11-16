# FranchiseHQ 8.2.36 — Console loadout recognition

## Scope

Fix the clear Xbox capture yBYtANeDZK being rejected by weekly Coach Ability checks. Five unchecked icons and one checked icon cannot form the fallback reader's checkmark group. The fast reader recognized screen labels but discarded that geometry when a glyph needed independent confirmation. Reuse label-verified console coordinates in the slower reader, retaining independent six-slot state verification, reference matching and focused position-letter checks. Thresholds and league rules are unchanged.

Reader version 4 lets the existing scanner recheck older observations for current-week threads and update its existing reports. No manual Discord message or scan invocation is part of release verification.

## Added during delivery

An anonymized regression fixture retains only staff and playsheet pixels. The public health release marker is aligned with the candidate version.

## Known inherited blockers

None for this fix. Unfamiliar layouts, genuinely ambiguous glyphs and shared icons still require independent confirmation or more evidence. This release does not claim universal screenshot recognition.

## Validation evidence

The original Xbox page resolves to a 3840 × 2160 PNG. Original checkmark detection returns no row. With corrected crops, live Workers AI verified six equipped slots, literal QB lettering and four playsheet names. The unchanged matcher identifies Island Kings, Inside Stuffed, Sideline 2 Sideline, Sheddables, Mano A Mano and Practician QB. Playsheets: Dollar, Run Stop, Nickel and Air Raid Gun. Evaluation against the active saved no-duplicates rule is legal. Sixteen focused tests pass, including missing labels, cropped/blank slots, ability bans and playsheet bans. The strict gate passed all 715 tests with zero failures; final focused tests and inventory verification passed after the final geometry guard and log cleanup. Hosted checks are pending.

## Deployment status

Implementation authorized under the standing release authorization. Candidate not yet published. Preview must use isolated staging bindings; production requires passing strict and hosted checks. Set LOADOUT_READER_VERSION to m27-glyph-reader-4 in each environment when activating this release. No migrations, credentials, rules or league snapshot changes are required.

## Rollback

Restore the prior Pages deployment at source 9103c9217ed701016fcaa2937995ee16446151f8 and restore LOADOUT_READER_VERSION=m27-glyph-reader-3. Database rollback is unnecessary. Existing report history is preserved; old code can recheck version-4 observations through its normal version mismatch path.
