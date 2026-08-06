(() => {
  'use strict';

  const HQ = window.FranchiseHQ = window.FranchiseHQ || {};
  const VERSION = '5.9.0.3b';

  function snapshotManager() {
    return HQ.leagueSnapshotManager || HQ.modules?.league?.leagueSnapshotManager || null;
  }

  function requireSnapshotManager() {
    const manager = snapshotManager();
    if (!manager) throw new Error('Snapshot Manager is not available. Confirm snapshot-manager.js loaded before using validation APIs.');
    return manager;
  }
  const validators = new Map();
  const results = new Map();
  let latestResult = null;

  const VALID_POSITIONS = new Set([
    'QB','HB','RB','FB','WR','TE','LT','LG','C','RG','RT','OL',
    'LE','RE','EDGE','DT','DL','LOLB','MLB','ROLB','LB','CB','FS','SS','S',
    'K','P','LS','KR','PR'
  ]);

  const clone = (value) => {
    if (value == null) return value;
    return typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  };

  const freeze = (value, seen = new WeakSet()) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.getOwnPropertyNames(value).forEach((key) => freeze(value[key], seen));
    return Object.freeze(value);
  };

  const issue = (code, message, details = {}) => freeze({
    code,
    message,
    ...clone(details)
  });

  function normalizeCollection(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return [];
  }

  function entityId(entity) {
    return entity?.id ?? entity?.playerId ?? entity?.teamId ?? entity?.rosterId ?? null;
  }

  function registerValidator(name, validator, options = {}) {
    if (!name || typeof name !== 'string') throw new TypeError('Validator name must be a non-empty string.');
    if (typeof validator !== 'function') throw new TypeError(`Validator ${name} must be a function.`);
    if (validators.has(name) && options.replace !== true) throw new Error(`Validator already registered: ${name}`);
    validators.set(name, freeze({
      name,
      severity: options.severity === 'warning' ? 'warning' : 'error',
      description: options.description || name,
      validate: validator
    }));
    return describeValidator(name);
  }

  function describeValidator(name) {
    const item = validators.get(name);
    if (!item) return null;
    return freeze({ name: item.name, severity: item.severity, description: item.description });
  }

  function listValidators() {
    return freeze(Array.from(validators.keys()).map(describeValidator));
  }

  function resolveSnapshot(target) {
    if (typeof target === 'string') {
      const record = requireSnapshotManager().getSnapshot(target, { includeData: true });
      if (!record) throw new Error(`Snapshot not found: ${target}`);
      return { id: target, record, snapshot: record.snapshot, candidate: record.status === 'candidate' };
    }
    if (target?.snapshot && typeof target.snapshot === 'object') {
      return { id: target.id || null, record: target, snapshot: target.snapshot, candidate: target.status === 'candidate' };
    }
    if (target && typeof target === 'object') {
      return { id: null, record: null, snapshot: target, candidate: false };
    }
    throw new TypeError('Validation requires a snapshot object or snapshot ID.');
  }

  function validateSnapshot(target, options = {}) {
    const resolved = resolveSnapshot(target);
    const context = freeze({
      snapshotId: resolved.id,
      source: resolved.record?.source || resolved.snapshot?.source?.provider || resolved.snapshot?.source?.source || null,
      season: resolved.record?.season ?? resolved.snapshot?.season ?? resolved.snapshot?.meta?.season ?? null,
      week: resolved.record?.week ?? resolved.snapshot?.week ?? resolved.snapshot?.meta?.week ?? null,
      validPositions: VALID_POSITIONS
    });
    const errors = [];
    const warnings = [];
    const checks = [];

    validators.forEach((validator) => {
      const started = performance.now();
      try {
        const output = validator.validate(resolved.snapshot, context);
        const issues = output == null ? [] : Array.isArray(output) ? output : [output];
        const normalized = issues.filter(Boolean).map((entry) => {
          if (typeof entry === 'string') return issue(validator.name, entry);
          return issue(entry.code || validator.name, entry.message || validator.description, entry.details || {});
        });
        const targetList = validator.severity === 'warning' ? warnings : errors;
        targetList.push(...normalized);
        checks.push(freeze({
          name: validator.name,
          severity: validator.severity,
          passed: normalized.length === 0,
          issueCount: normalized.length,
          durationMs: Math.round((performance.now() - started) * 100) / 100
        }));
      } catch (error) {
        errors.push(issue('validator-execution-failed', `${validator.name}: ${error.message}`));
        checks.push(freeze({ name: validator.name, severity: 'error', passed: false, issueCount: 1, executionFailed: true }));
      }
    });

    const valid = errors.length === 0;
    const result = freeze({
      snapshotId: resolved.id,
      valid,
      publishable: valid,
      status: valid ? (warnings.length ? 'passed-with-warnings' : 'passed') : 'failed',
      checkedAt: new Date().toISOString(),
      validatorVersion: VERSION,
      validatorCount: validators.size,
      errors: freeze(errors),
      warnings: freeze(warnings),
      checks: freeze(checks)
    });

    latestResult = result;
    if (resolved.id) results.set(resolved.id, result);

    HQ.events?.emit?.('snapshot:validated', result, { source: 'leagueValidationEngine' });
    window.dispatchEvent(new CustomEvent('franchisehq:snapshot-validated', { detail: result }));

    if (!valid && resolved.id && resolved.candidate && options.rejectOnFailure !== false) {
      requireSnapshotManager().rejectSnapshot(
        resolved.id,
        errors.map((entry) => entry.message).join('; ') || 'Snapshot failed validation.'
      );
    }
    return result;
  }

  function getValidationResult(snapshotId) {
    return snapshotId ? results.get(snapshotId) || null : latestResult;
  }

  function resetValidationResults() {
    results.clear();
    latestResult = null;
    return diagnostics();
  }

  function diagnostics() {
    return freeze({
      service: 'leagueValidationEngine',
      version: VERSION,
      validatorCount: validators.size,
      validators: listValidators(),
      latestStatus: latestResult?.status || 'not-run',
      latestSnapshotId: latestResult?.snapshotId || null,
      automaticCandidateRejection: true,
      warningSupport: true,
      modularRegistration: true
    });
  }

  registerValidator('snapshot-structure', (snapshot) => {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return issue('corrupted-snapshot', 'Snapshot must be a valid object.');
    }
    return null;
  }, { description: 'Snapshot contains a readable object structure.' });

  registerValidator('season-required', (_snapshot, context) => {
    const season = Number(context.season);
    return Number.isInteger(season) && season >= 2000
      ? null
      : issue('missing-season', 'Snapshot is missing a valid season.');
  }, { description: 'Season is present and valid.' });

  registerValidator('week-required', (_snapshot, context) => {
    const week = Number(context.week);
    return Number.isInteger(week) && week >= 0 && week <= 30
      ? null
      : issue('missing-week', 'Snapshot is missing a valid week.');
  }, { description: 'Week is present and valid.' });

  registerValidator('league-not-empty', (snapshot) => {
    const teams = normalizeCollection(snapshot.teams);
    const players = normalizeCollection(snapshot.players);
    return teams.length || players.length
      ? null
      : issue('empty-league', 'Snapshot contains no teams or players.');
  }, { description: 'League contains team or player records.' });

  registerValidator('team-ids', (snapshot) => {
    const teams = normalizeCollection(snapshot.teams);
    const missing = teams.filter((team) => entityId(team) == null);
    const ids = teams.map(entityId).filter((id) => id != null).map(String);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const issues = [];
    if (missing.length) issues.push(issue('missing-team-id', `${missing.length} team record(s) are missing IDs.`, { count: missing.length }));
    if (duplicates.length) issues.push(issue('duplicate-team-id', `Duplicate team IDs found: ${duplicates.join(', ')}.`, { ids: duplicates }));
    return issues;
  }, { description: 'Every team has one unique ID.' });

  registerValidator('player-ids', (snapshot) => {
    const players = normalizeCollection(snapshot.players);
    const missing = players.filter((player) => entityId(player) == null);
    const ids = players.map(entityId).filter((id) => id != null).map(String);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const issues = [];
    if (missing.length) issues.push(issue('missing-player-id', `${missing.length} player record(s) are missing IDs.`, { count: missing.length }));
    if (duplicates.length) issues.push(issue('duplicate-player-id', `Duplicate player IDs found: ${duplicates.join(', ')}.`, { ids: duplicates }));
    return issues;
  }, { description: 'Every player has one unique ID.' });

  registerValidator('team-assignments', (snapshot) => {
    const teams = normalizeCollection(snapshot.teams);
    const players = normalizeCollection(snapshot.players);
    if (!players.length || !teams.length) return null;
    const teamIds = new Set(teams.map(entityId).filter((id) => id != null).map(String));
    const invalid = players.filter((player) => {
      const teamId = player.teamId ?? player.team?.id ?? player.rosterId ?? null;
      return teamId != null && !teamIds.has(String(teamId));
    });
    return invalid.length
      ? issue('invalid-team-assignment', `${invalid.length} player(s) reference unknown team IDs.`, { count: invalid.length })
      : null;
  }, { description: 'Player team assignments reference known teams.' });

  registerValidator('player-positions', (snapshot, context) => {
    const players = normalizeCollection(snapshot.players);
    const invalid = players.filter((player) => {
      const position = String(player.position || player.pos || '').trim().toUpperCase();
      return position && !context.validPositions.has(position);
    });
    return invalid.length
      ? issue('invalid-position', `${invalid.length} player(s) contain unsupported positions.`, { count: invalid.length })
      : null;
  }, { description: 'Player positions use supported Madden position codes.' });

  registerValidator('source-recommended', (snapshot, context) => {
    return context.source || snapshot.source
      ? null
      : issue('missing-source', 'Snapshot source metadata is missing.');
  }, { severity: 'warning', description: 'Source metadata is recorded for provenance.' });

  async function simulate(options = {}) {
    const invalid = options.invalid === true;
    const snapshot = invalid ? {
      source: { source: 'development-validation' },
      season: null,
      week: null,
      teams: [{ id: 'TEAM-1' }, { id: 'TEAM-1' }],
      players: [{ id: 'PLAYER-1', teamId: 'UNKNOWN', position: 'INVALID' }]
    } : {
      source: { source: 'development-validation' },
      season: options.season ?? 2027,
      week: options.week ?? 4,
      teams: [{ id: 'TEAM-1', name: 'Development Team' }],
      players: [{ id: 'PLAYER-1', teamId: 'TEAM-1', position: 'QB' }]
    };
    const candidate = requireSnapshotManager().createSnapshot(snapshot, {
      source: 'development-validation',
      season: snapshot.season,
      week: snapshot.week
    });
    const result = validateSnapshot(candidate.id, { rejectOnFailure: true });
    if (result.valid && options.activate === true) {
      requireSnapshotManager().activateSnapshot(candidate.id, { validated: true, validation: result });
    } else if (result.valid && options.retainCandidate !== true) {
      requireSnapshotManager().rejectSnapshot(candidate.id, 'Development validation simulation completed.');
    }
    return result;
  }

  const service = Object.freeze({
    registerValidator,
    listValidators,
    validateSnapshot,
    getValidationResult,
    resetValidationResults,
    simulate,
    diagnostics
  });

  if (typeof HQ.defineModuleService === 'function') {
    HQ.defineModuleService('league', 'leagueValidationEngine', service, { replace: true, alias: 'leagueValidationEngine' });
  }

  // Explicit compatibility registration. This guarantees the public API even
  // when an older cached Platform core does not create module aliases.
  const descriptor = Object.getOwnPropertyDescriptor(HQ, 'leagueValidationEngine');
  if (!descriptor || descriptor.configurable === true) {
    Object.defineProperty(HQ, 'leagueValidationEngine', {
      configurable: true,
      enumerable: true,
      value: service,
      writable: false
    });
  }
  if (HQ.modules?.league && !HQ.modules.league.leagueValidationEngine) {
    try { HQ.modules.league.leagueValidationEngine = service; } catch (_) {}
  }

  HQ.manifest?.register?.({
    scope: 'module',
    module: 'league',
    id: 'league-validation-engine',
    service: 'leagueValidationEngine',
    script: 'league-engine/validation-engine.js',
    version: VERSION,
    dependencies: ['leagueSnapshotManager'],
    capabilities: [
      'modular-validator-registration',
      'duplicate-id-validation',
      'required-field-validation',
      'team-assignment-validation',
      'position-validation',
      'warning-and-error-severity',
      'automatic-candidate-rejection'
    ]
  });
})();
