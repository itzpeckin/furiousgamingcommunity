# Franchise HQ v5.4.2a — LD-002 Data-State Alignment Hotfix

## Purpose
Align the League Data State Manager with the development/mock data already powering Home, Teams, Standings, Schedule, and player views.

## Changes
- Seeds the existing prototype dataset into League Data State as Development Data when no live or demo snapshot exists.
- Reports Development / Mock as the authority for that source.
- Reports Last Import as not applicable for development data.
- Preserves live Madden snapshots when one exists.
- Keeps the Current Data Source Card read-only.

## GitHub files
- `index.html`
- `trade-module.js`
