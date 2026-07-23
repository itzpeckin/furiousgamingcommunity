# Franchise HQ — TC-011.1 Broadcast Recap Generator

Epic 1 begins with the first export-based Game Center intelligence feature.

## Accepted scope

### Automated broadcast recap
For every completed game, Franchise HQ now uses the imported final score and box-score data to generate:

- Broadcast-style recap graphic
- Game headline
- Full recap paragraph
- Social caption
- Ranked top-three performers
- Game MVP designation

### Export formats

- Broadcast: 1600 × 900, 16:9
- Social: 1200 × 1200, 1:1
- Story: 1080 × 1920, 9:16

The Download PNG button performs a real browser-side Canvas export. It does not require a paid screenshot service, external image API, or server process.

### Story Engine

The story generator evaluates:

- Winning team
- Final score
- Margin of victory
- Close-game and blowout thresholds
- Top statistical performer
- Week, date, time, and stadium

It then generates the headline, recap paragraph, social caption, and MVP presentation.

### Pregame behavior

Upcoming games retain a generated preview, but PNG recap export remains disabled until the final result is imported.

## Technical direction

This export-based approach fits Franchise HQ's integration model:

Madden export
→ structured team/player game data
→ Franchise HQ ranking and story engine
→ reusable broadcast design
→ downloadable PNG

No live drive tracker or real-time Madden connection is required.

Replace all six files together.

Suggested commit:
`Build TC-011.1 broadcast recap generator and story engine`
