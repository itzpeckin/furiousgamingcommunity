# Franchise HQ v5.7.0t — Trade Builder Interaction Hotfix

## Scope

- Restores the player and draft-pick **+** controls in the unified Private Trade Builder.
- Restores trade submission after assets are added and each participating team sends and receives at least one asset.
- Removes the duplicated **Clear Trade** button from the bottom action area.
- Keeps exactly one action row at the top and one at the bottom:
  - Clear Trade
  - Save Trade Offer
  - Send Trade Offer

## Root cause

The asset rows stored a compact asset token such as `player:123` or `pick:buf:2027:1`, but the click handler attempted to parse that token as JSON. The handler now uses the existing trade-asset token parser.

This release does not yet redesign the Trade Block or AI matching model. Those changes belong to the planned v5.7.1 feature release.
