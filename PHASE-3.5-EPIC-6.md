# Phase 3.5 — Epic 6: League Context Service

## Purpose
Creates `FranchiseHQ.league` as the browser's central, league-aware context service.

## Changes
- Adds `platform/league.js`.
- Removes the temporary league object from `auth-client.js`.
- Loads the league service after authentication and before permissions.
- Hydrates the active league from the authenticated membership.
- Preserves `setActiveLeague()` and `getActiveLeague()` compatibility.
- Adds membership, role, settings, season, and salary-cap accessors.

## Current scope
The backend currently returns one membership for `franchise-hq-primary`. The service is structured for multiple memberships, but multi-league retrieval will be added when the backend exposes that list.
