(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService || !HQ.leagueSchema || !HQ.leagueEntities) throw new Error('League schema and entities must load before mock-data adapter.');

  function array(value) { return Array.isArray(value) ? value : []; }
  function normalizeCollection(type, values, source) {
    return array(values).map((raw, index) => HQ.leagueEntities.entity(type, { ...raw, id: raw?.id ?? raw?.teamId ?? raw?.playerId ?? raw?.gameId ?? `${type}-${index + 1}` }, source));
  }

  function fromLegacy(raw = {}, options = {}) {
    const source = HQ.leagueSchema.sourceMeta({ importedAt: options.importedAt, importId: options.importId || `mock-${Date.now()}`, rawSourceId: options.rawSourceId || 'legacy-prototype' });
    const snapshot = HQ.leagueSchema.emptySnapshot({ source });
    snapshot.source = source;
    snapshot.league = raw.league ? HQ.leagueEntities.entity('league', raw.league, source) : null;
    snapshot.teams = normalizeCollection('team', raw.teams, source);
    snapshot.franchises = normalizeCollection('franchise', raw.franchises, source);
    snapshot.owners = normalizeCollection('owner', raw.owners || raw.accounts, source);
    snapshot.players = normalizeCollection('player', raw.players, source);
    snapshot.rosters = normalizeCollection('roster', raw.rosters, source);
    snapshot.games = normalizeCollection('game', raw.games || raw.schedule, source);
    snapshot.standings = normalizeCollection('standing', raw.standings, source);
    snapshot.stats = normalizeCollection('stat', raw.stats, source);
    snapshot.contracts = normalizeCollection('contract', raw.contracts, source);
    snapshot.injuries = normalizeCollection('injury', raw.injuries, source);
    snapshot.draftPicks = normalizeCollection('draftPick', raw.draftPicks || raw.picks, source);
    snapshot.availability = { mockData: true, officialMaddenImport: false };
    snapshot.warnings = ['Temporary prototype normalization only. This snapshot is not a live Madden import.'];
    return snapshot;
  }

  const service = HQ.defineService('leagueMockAdapter', { fromLegacy });
  HQ.manifest?.register?.({ id: 'league-mock-adapter', service: 'leagueMockAdapter', script: 'league-engine/adapters/mock-data.js', version: '1.0.0', dependencies: ['leagueSchema','leagueEntities'], capabilities: ['legacy-normalization', 'prototype-only'] });
})();
