(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService || !HQ.leagueSchema) throw new Error('league-engine/schema.js must load before validate.js.');

  const arrays = ['teams','franchises','owners','players','rosters','games','standings','stats','contracts','injuries','draftPicks'];
  function validate(snapshot) {
    const errors = [], warnings = [];
    if (!snapshot || typeof snapshot !== 'object') errors.push('Snapshot must be an object.');
    if (snapshot?.schemaVersion !== HQ.leagueSchema.version) errors.push(`Unsupported schemaVersion: ${snapshot?.schemaVersion ?? 'missing'}.`);
    if (snapshot?.source?.source !== 'madden') errors.push('Snapshot authority must be Madden.');
    if (!snapshot?.source?.importId) errors.push('source.importId is required.');
    if (!snapshot?.source?.importedAt) errors.push('source.importedAt is required.');
    arrays.forEach((key) => { if (!Array.isArray(snapshot?.[key])) errors.push(`${key} must be an array.`); });

    arrays.forEach((key) => {
      const ids = new Set();
      (snapshot?.[key] || []).forEach((item, index) => {
        if (!item?.id) errors.push(`${key}[${index}] is missing id.`);
        else if (ids.has(String(item.id))) errors.push(`${key} contains duplicate id ${item.id}.`);
        else ids.add(String(item.id));
      });
    });

    const teamIds = new Set((snapshot?.teams || []).map((item) => String(item.id)));
    (snapshot?.players || []).forEach((player) => {
      if (player.teamId != null && !teamIds.has(String(player.teamId))) warnings.push(`Player ${player.id} references unknown team ${player.teamId}.`);
    });
    (snapshot?.games || []).forEach((game) => {
      ['homeTeamId','awayTeamId'].forEach((key) => { if (game[key] != null && !teamIds.has(String(game[key]))) warnings.push(`Game ${game.id} references unknown ${key} ${game[key]}.`); });
    });

    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), warnings: Object.freeze(warnings), checkedAt: new Date().toISOString() });
  }

  function assert(snapshot) {
    const result = validate(snapshot);
    if (!result.valid) throw new Error(`Invalid Madden snapshot: ${result.errors.join(' ')}`);
    return result;
  }

  const service = HQ.defineModuleService('league', 'leagueValidation', { validate, assert });
  HQ.manifest?.register?.({ scope: 'module', module: 'league', id: 'league-validation', service: 'leagueValidation', script: 'league-engine/validate.js', version: '1.0.0', dependencies: ['leagueSchema'], capabilities: ['schema-validation', 'duplicate-detection', 'referential-warnings'] });
})();
