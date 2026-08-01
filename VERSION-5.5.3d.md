# Franchise HQ v5.5.3d — Team Tab Navigation & Player Image Readiness

## Scope

- Team-page tab changes scroll to the top of the team tab navigation rather than the top of the full page.
- Depth Chart starter tiles reserve a small top-left player-image area.
- Player images resolve from normalized Madden-compatible fields when supplied.
- Development records without images use a neutral silhouette placeholder.
- Existing depth-chart dimensions, development colors, backup rows, and two-click behavior remain unchanged.

## Supported image fields

The roster view checks common import fields including:

- `imageUrl`
- `playerImageUrl`
- `headshotUrl`
- `headshot`
- `photoUrl`
- `photo`
- `portraitUrl`
- `portrait`

The first usable URL populates the tile automatically.
