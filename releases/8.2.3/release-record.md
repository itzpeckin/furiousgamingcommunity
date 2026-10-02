# FranchiseHQ 8.2.3 - Screenshot recognition test lab

## Scope

A browser-local experimental page at `/support/loadout-lab/`, linked from inactive Weekly Loadout Rules, lets the owner test existing console screenshots and phone photos without posting Discord verdicts or changing league rules. It identifies a proposed staff row, compares the six cropped glyphs to all 78 existing catalog references, shows close alternatives, accepts optional expected-answer labels, and exports a JSON test report. Screenshots are not uploaded or published.

## Added during delivery

The deterministic matcher masks the equipped checkmark and card edges before comparing grayscale shapes. Known shared glyphs remain ambiguous; weak or closely competing matches remain uncertain. Manual corner adjustment helps isolate crop failures separately from glyph failures. Reports retain the automatic and corrected crop, provisional matches and user-supplied expected answers separately. Temporary banned/duplicate rules are simulations only. No production scanner code, bindings, queues, API routes or database migrations change.

## Known inherited blockers

Automatic Discord recognition remains disabled. This new experimental matcher is not connected to the production scanner. Locked/empty slots are not automatically classified. One supplied phone photo's automatic row starts at slot 2, requiring correction. Another phone photo confuses OL and DL; its score remains below the matching threshold. Trimmed Edges and All Hustle share a glyph. Public Xbox link resolution is not included in this browser-local test; download the screenshot first. Existing Qwen reader acceptance has not passed. Production activation requires representative unseen images, reliable complete-row/slot detection and conservative legality evaluation.

## Validation evidence

Initial browser fixtures at 1440px and 390px showed no page errors or horizontal overflow, and no image-upload requests. All six console slots ranked the correct ability first; four reached the provisional matching threshold and two stayed uncertain. Phone-photo limitations above remain visible, not hidden or treated as successful whole-loadout recognition. Original personal screenshots and generated reports stay outside the repository. Unit tests cover invalid crops, blank evidence, shared glyphs, close lettering and rule simulation uncertainty. Exact gate and hosted results are recorded when completed.

## Deployment status

User requested a usable recognition test build and granted standing release authorization. This candidate publishes only the diagnostic lab and its navigation link. Do not set LOADOUT_READER_VERSION or send live Discord test messages. Production publication and hosted verification are pending at this commit.

## Rollback

Restore main/tag v8.2.2 at `3674ad9313d3bf42fdf901a21bbc9dde6e882a58`. Migration 52 and existing Worker versions stay unchanged. No league state restoration is needed for this static diagnostic page.
