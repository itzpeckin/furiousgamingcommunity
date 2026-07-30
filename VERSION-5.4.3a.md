# Franchise HQ v5.4.3a — LD-003 Empty-State Integration Hotfix

## Purpose
Corrects LD-003 so the selected Empty State controls the visible league-data screens, not only the Commissioner status card.

## Changes
- Empty State now replaces Home, League Activity, Teams, My Team, Players, Standings, Statistics, and Schedule with source-aware empty messages.
- Development Data restores those existing prototype screens.
- Source choice is persisted through both the platform store and browser localStorage fallback.
- Direct detail routes cannot expose legacy mock records while Empty State is active.
