(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before import-quarantine.js.');

  const records = [];
  const clone = (value) => value == null ? value : structuredClone(value);

  function add({ envelope, report, reason } = {}) {
    const record = Object.freeze({
      id: `quarantine-${Date.now()}-${records.length + 1}`,
      importId: envelope?.importId || report?.importId || null,
      fileName: envelope?.fileName || null,
      reason: String(reason || 'Import validation failed.'),
      errors: Object.freeze([...(report?.errors || [])]),
      warnings: Object.freeze([...(report?.warnings || [])]),
      quarantinedAt: new Date().toISOString()
    });
    records.unshift(record);
    if (records.length > 25) records.length = 25;
    return record;
  }
  function list() { return Object.freeze(records.map(clone)); }
  function clear() { records.length = 0; }
  function diagnostics() { return Object.freeze({ service: 'leagueImportQuarantine', count: records.length, latestImportId: records[0]?.importId || null }); }

  const service = HQ.defineService('leagueImportQuarantine', { add, list, clear, diagnostics });
  HQ.manifest?.register?.({ id: 'league-import-quarantine', service: 'leagueImportQuarantine', script: 'league-engine/import-quarantine.js', version: '1.0.0', capabilities: ['failed-import-history', 'non-destructive-rejection'] });
})();
