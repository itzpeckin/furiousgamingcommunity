(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService || !HQ.leagueSchema) throw new Error('league-engine/schema.js must load before import-contract.js.');

  const CONTRACT_VERSION = '1.0.0';
  const FORMAT = 'franchise-hq-madden-import';
  const ACCEPTED_CHANNELS = Object.freeze(['manual-upload', 'companion-export', 'connector']);
  const COLLECTIONS = Object.freeze(['teams','franchises','owners','players','rosters','games','standings','stats','contracts','injuries','draftPicks']);

  function createEnvelope(input = {}) {
    const importedAt = new Date(input.importedAt || Date.now());
    if (Number.isNaN(importedAt.getTime())) throw new TypeError('Import envelope importedAt must be a valid date.');
    const channel = String(input.channel || 'manual-upload');
    if (!ACCEPTED_CHANNELS.includes(channel)) throw new TypeError(`Unsupported import channel: ${channel}`);
    return {
      format: FORMAT,
      contractVersion: CONTRACT_VERSION,
      channel,
      fileName: input.fileName == null ? null : String(input.fileName),
      receivedAt: new Date().toISOString(),
      importedAt: importedAt.toISOString(),
      importId: String(input.importId || crypto?.randomUUID?.() || `madden-${Date.now()}`),
      sourceLeagueId: input.sourceLeagueId == null ? null : String(input.sourceLeagueId),
      payload: input.payload ?? null
    };
  }

  function inspect(envelope) {
    const errors = [];
    if (!envelope || typeof envelope !== 'object') errors.push('Import envelope must be an object.');
    if (envelope?.format !== FORMAT) errors.push(`format must equal "${FORMAT}".`);
    if (envelope?.contractVersion !== CONTRACT_VERSION) errors.push(`contractVersion must equal "${CONTRACT_VERSION}".`);
    if (!ACCEPTED_CHANNELS.includes(envelope?.channel)) errors.push('channel is unsupported.');
    if (!envelope?.importId) errors.push('importId is required.');
    if (!envelope?.importedAt || Number.isNaN(new Date(envelope.importedAt).getTime())) errors.push('importedAt must be a valid timestamp.');
    if (!envelope?.payload || typeof envelope.payload !== 'object') errors.push('payload must be an object.');
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), format: FORMAT, contractVersion: CONTRACT_VERSION });
  }

  const service = HQ.defineService('leagueImportContract', {
    version: CONTRACT_VERSION,
    format: FORMAT,
    acceptedChannels: ACCEPTED_CHANNELS,
    collections: COLLECTIONS,
    createEnvelope,
    inspect
  });
  HQ.manifest?.register?.({ id: 'league-import-contract', service: 'leagueImportContract', script: 'league-engine/import-contract.js', version: CONTRACT_VERSION, dependencies: ['leagueSchema'], capabilities: ['import-envelope', 'versioned-contract', 'channel-validation'] });
})();
