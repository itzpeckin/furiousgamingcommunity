(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService || !HQ.leagueImportContract || !HQ.leagueValidation) throw new Error('Import contract and league validation must load before import-validator.js.');

  const receiptKey = Symbol('franchisehq.import.validation.receipt');
  const requiredForPublish = Object.freeze(['league', 'teams', 'players']);

  function availability(snapshot) {
    const result = {};
    HQ.leagueImportContract.collections.forEach((key) => {
      result[key] = Array.isArray(snapshot?.[key]) && snapshot[key].length > 0;
    });
    result.league = Boolean(snapshot?.league);
    return Object.freeze(result);
  }

  function validate(envelope, snapshot) {
    const contract = HQ.leagueImportContract.inspect(envelope);
    const schema = HQ.leagueValidation.validate(snapshot);
    const errors = [...contract.errors, ...schema.errors];
    const warnings = [...schema.warnings];
    const fields = availability(snapshot);

    if (snapshot?.source?.importId !== envelope?.importId) errors.push('Snapshot source.importId must match envelope importId.');
    if (snapshot?.source?.source !== 'madden') errors.push('Snapshot must identify Madden as its authority.');
    requiredForPublish.forEach((field) => {
      if (!fields[field]) errors.push(`Import cannot be published because ${field} is missing or empty.`);
    });
    HQ.leagueImportContract.collections.forEach((field) => {
      if (!fields[field] && !requiredForPublish.includes(field)) warnings.push(`${field} is unavailable in this import and will remain unavailable in Franchise HQ.`);
    });

    const valid = errors.length === 0;
    const report = {
      valid,
      publishable: valid,
      importId: envelope?.importId || null,
      contract,
      schema,
      availability: fields,
      errors: Object.freeze(errors),
      warnings: Object.freeze(warnings),
      checkedAt: new Date().toISOString()
    };
    if (valid) Object.defineProperty(report, receiptKey, { value: true, enumerable: false });
    return Object.freeze(report);
  }

  function assert(envelope, snapshot) {
    const report = validate(envelope, snapshot);
    if (!report.valid) throw new Error(`Madden import rejected: ${report.errors.join(' ')}`);
    return report;
  }

  function isReceipt(value) { return Boolean(value?.[receiptKey] === true && value.valid === true); }

  const service = HQ.defineModuleService('league', 'leagueImportValidator', { validate, assert, isReceipt, requiredForPublish });
  HQ.manifest?.register?.({ scope: 'module', module: 'league', id: 'league-import-validator', service: 'leagueImportValidator', script: 'league-engine/import-validator.js', version: '1.0.0', dependencies: ['leagueImportContract','leagueValidation'], capabilities: ['publish-gate', 'availability-report', 'validation-receipts'] });
})();
