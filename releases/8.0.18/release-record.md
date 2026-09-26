# FranchiseHQ 8.0.18 — clearer imports, current draft picks and matchup navigation

## Scope

Commissioners see three explicit steps: export from EA Direct or Companion App, Refresh, then Import Latest Export. The completed weekly collection card and intermediate action are removed. Connection and yearly schedule options remain in expandable sections. The Data Source Selector sits below Quick Controls in the adjacent desktop column; mobile stacks without overflow.

Discord trade asset suggestions use the same current-season resolution and three-year draft window as the website. When a season is archived and its old snapshot is retained, the exact prepared successor for the same tenant, source franchise and Madden edition supplies the year. Unrelated previews cannot move the window. Old picks remain in the ledger; stale submitted picks are rejected before a workflow is created. No pick ownership is rewritten.

The shared matchup dialog has a visible persistent close button for league and team schedules. Closing during a directory fetch invalidates that pending open so it cannot reopen the dialog.

## Added during delivery

Regression coverage exercises signed Discord autocomplete and stale trade submissions, retained-snapshot season rollover, historical pick preservation, and close-during-load behavior. No Discord messages are sent by verification.

## Known inherited blockers

None for this release. Collection and import remain deliberate commissioner actions.

## Validation evidence

Targeted UI, Discord and Trade Center tests passed (94). Strict quality, CI, hosted checks and desktop/mobile acceptance are recorded on the PR and release receipt.

## Deployment status

Authorized Pages release, including Pages-hosted Discord interactions. Import Worker and migration 48 unchanged. No live collection, import, season archive, trade submission or ownership update is part of deployment.

## Rollback

Restore final 8.0.17 Main 130f02a9f0706e7610cd06ccd848eae410941043 and Pages 51f52d03-4b75-43c6-ad1c-e81dc4e12e76. The immutable v8.0.17 source tag stays at e11d8e9892f7af7558c8ac838b32616e12a1a1fe; PR #163 adds the desktop CSS correction after that tag. Preserve production data, Worker and migration 48.
