(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService || !HQ.leagueSchema || !HQ.leagueEntities || !HQ.leagueImportContract) throw new Error('League schema, entities, and import contract must load before Madden JSON adapter.');

  const arrays = HQ.leagueImportContract.collections;
  const singularTypes = { teams:'team', franchises:'franchise', owners:'owner', players:'player', rosters:'roster', games:'game', standings:'standing', stats:'stat', contracts:'contract', injuries:'injury', draftPicks:'draftPick' };
  const parse = (input) => {
    if (typeof input === 'string') {
      try { return JSON.parse(input); } catch (error) { throw new TypeError(`Madden import JSON could not be parsed: ${error.message}`); }
    }
    if (!input || typeof input !== 'object') throw new TypeError('Madden import must be a JSON object or JSON string.');
    return structuredClone(input);
  };

  function toSnapshot(envelope) {
    const raw = parse(envelope.payload);
    const source = HQ.leagueSchema.sourceMeta({ importId: envelope.importId, importedAt: envelope.importedAt, rawSourceId: envelope.sourceLeagueId || raw.league?.id || null });
    const snapshot = HQ.leagueSchema.emptySnapshot({ source });
    snapshot.source = source;
    snapshot.league = raw.league ? HQ.leagueEntities.entity('league', raw.league, source) : null;
    arrays.forEach((key) => {
      const type = singularTypes[key];
      const values = Array.isArray(raw[key]) ? raw[key] : [];
      snapshot[key] = values.map((item, index) => HQ.leagueEntities.entity(type, { ...item, id: item?.id ?? item?.[`${type}Id`] ?? `${type}-${index + 1}` }, source));
    });
    snapshot.availability = Object.fromEntries(['league', ...arrays].map((key) => [key, key === 'league' ? Boolean(snapshot.league) : snapshot[key].length > 0]));
    snapshot.warnings = Array.isArray(raw.warnings) ? [...raw.warnings] : [];
    return snapshot;
  }

  function from(input, metadata = {}) {
    const parsed = parse(input);
    const hasEnvelope = parsed.format === HQ.leagueImportContract.format;
    const envelope = hasEnvelope ? parsed : HQ.leagueImportContract.createEnvelope({ ...metadata, payload: parsed });
    return Object.freeze({ envelope, snapshot: toSnapshot(envelope) });
  }

  const service = HQ.defineModuleService('league', 'leagueMaddenJsonAdapter', { parse, from, toSnapshot });
  HQ.manifest?.register?.({ scope: 'module', module: 'league', id: 'league-madden-json-adapter', service: 'leagueMaddenJsonAdapter', script: 'league-engine/adapters/madden-json.js', version: '1.0.0', dependencies: ['leagueSchema','leagueEntities','leagueImportContract'], capabilities: ['json-parse', 'normalized-madden-import', 'provenance-mapping'] });
})();
