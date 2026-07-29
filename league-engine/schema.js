(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before league-engine/schema.js.');

  const SCHEMA_VERSION = '1.0.0';
  const SOURCE = 'madden';
  const ENTITY_TYPES = Object.freeze(['league', 'team', 'franchise', 'owner', 'player', 'roster', 'game', 'standing', 'stat', 'contract', 'injury', 'draftPick']);

  function iso(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) throw new TypeError('Invalid import timestamp.');
    return date.toISOString();
  }

  function sourceMeta(input = {}) {
    return Object.freeze({
      source: SOURCE,
      importedAt: iso(input.importedAt),
      importId: String(input.importId || crypto?.randomUUID?.() || `import-${Date.now()}`),
      rawSourceId: input.rawSourceId == null ? null : String(input.rawSourceId)
    });
  }

  function emptySnapshot(input = {}) {
    const source = sourceMeta(input.source || input);
    return {
      schemaVersion: SCHEMA_VERSION,
      source,
      league: null,
      teams: [],
      franchises: [],
      owners: [],
      players: [],
      rosters: [],
      games: [],
      standings: [],
      stats: [],
      contracts: [],
      injuries: [],
      draftPicks: [],
      availability: {},
      warnings: []
    };
  }

  const service = HQ.defineService('leagueSchema', {
    version: SCHEMA_VERSION,
    source: SOURCE,
    entityTypes: ENTITY_TYPES,
    sourceMeta,
    emptySnapshot
  });

  HQ.manifest?.register?.({
    id: 'league-schema', service: 'leagueSchema', script: 'league-engine/schema.js', version: SCHEMA_VERSION,
    capabilities: ['read-only-schema', 'source-provenance', 'madden-authority']
  });
})();
