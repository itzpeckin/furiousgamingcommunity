# Madden Import Contract v1

An import may be supplied as a JSON object or JSON string.

## Envelope

```json
{
  "format": "franchise-hq-madden-import",
  "contractVersion": "1.0.0",
  "channel": "manual-upload",
  "importId": "unique-import-id",
  "importedAt": "2026-07-29T00:00:00.000Z",
  "sourceLeagueId": "madden-league-id",
  "payload": {}
}
```

Accepted channels are `manual-upload`, `companion-export`, and `connector`.

## Required publishable payload

A publishable import must contain:

- `league`
- at least one `team`
- at least one `player`

Supported optional collections are:

- franchises
- owners
- rosters
- freeAgents
- games
- standings
- stats
- contracts
- injuries
- draftPicks

Missing optional collections remain unavailable. Franchise HQ does not invent replacement values.

## Madden NFL 27 source-lock requirement

Before a Madden NFL 27 adapter can publish, its discovery report must explicitly locate teams, team rosters, players, Free Agents, standings, schedule, and statistics. Free Agents may be reported as empty only when a successful explicit source route returns an empty collection. A missing or failed Free Agent response is not equivalent to an empty league and blocks source lock.
