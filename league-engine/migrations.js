(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService || !HQ.leagueSchema) throw new Error('league-engine/schema.js must load before migrations.js.');
  const migrations = new Map();
  function register(fromVersion, migrate) {
    if (typeof migrate !== 'function') throw new TypeError('Migration must be a function.');
    migrations.set(String(fromVersion), migrate);
  }
  function migrate(snapshot) {
    if (!snapshot) throw new TypeError('Snapshot is required.');
    if (snapshot.schemaVersion === HQ.leagueSchema.version) return structuredClone(snapshot);
    const fn = migrations.get(String(snapshot.schemaVersion));
    if (!fn) throw new Error(`No migration path from ${snapshot.schemaVersion} to ${HQ.leagueSchema.version}.`);
    return fn(structuredClone(snapshot));
  }
  const service = HQ.defineModuleService('league', 'leagueMigrations', { register, migrate, list: () => Object.freeze([...migrations.keys()]) });
  HQ.manifest?.register?.({ scope: 'module', module: 'league', id: 'league-migrations', service: 'leagueMigrations', script: 'league-engine/migrations.js', version: '1.0.0', dependencies: ['leagueSchema'], capabilities: ['schema-evolution', 'explicit-migrations'] });
})();
