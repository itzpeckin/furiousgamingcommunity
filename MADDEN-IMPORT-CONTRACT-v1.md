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
- games
- standings
- stats
- contracts
- injuries
- draftPicks

Missing optional collections remain unavailable. Franchise HQ does not invent replacement values.
