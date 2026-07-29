(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before platform/manifest.js.');

  const entries = new Map();
  const requiredScripts = Object.freeze([
    'platform/core.js',
    'platform/manifest.js',
    'platform/storage.js',
    'platform/config.js',
    'platform/features.js',
    'platform/security.js',
    'platform/contract.js',
    'platform/events.js',
    'platform/state.js',
    'platform/ui.js',
    'platform/theme.js',
    'platform/ui-manager.js',
    'platform/errors.js',
    'platform/api.js',
    'platform/runtime.js',
    'platform/validate.js',
    'platform/release.js',
    'league-engine/schema.js',
    'league-engine/entities.js',
    'league-engine/import-contract.js',
    'league-engine/validate.js',
    'league-engine/import-validator.js',
    'league-engine/import-quarantine.js',
    'league-engine/adapters/madden-json.js',
    'league-engine/repository.js',
    'league-engine/selectors.js',
    'league-engine/migrations.js',
    'league-engine/adapters/mock-data.js',
    'league-engine/import-service.js',
    'league-engine/index.js'
  ]);

  function normalizeList(value) {
    return Object.freeze(Array.isArray(value)
      ? [...new Set(value.map((item) => String(item).trim()).filter(Boolean))]
      : []);
  }

  function register(definition, options = {}) {
    if (!definition || typeof definition !== 'object') {
      throw new TypeError('FranchiseHQ.manifest.register requires a definition.');
    }
    const id = String(definition.id || '').trim();
    if (!/^[a-z][a-z0-9.-]*$/.test(id)) throw new TypeError(`Invalid manifest id "${id}".`);
    if (entries.has(id) && options.replace !== true) return entries.get(id);

    const entry = Object.freeze({
      id,
      service: String(definition.service || id),
      script: String(definition.script || ''),
      scope: definition.scope === 'module' ? 'module' : 'platform',
      module: definition.scope === 'module' ? String(definition.module || '').trim() : null,
      version: String(definition.version || '0.0.0'),
      capabilities: normalizeList(definition.capabilities),
      dependencies: normalizeList(definition.dependencies),
      registeredAt: new Date().toISOString()
    });
    entries.set(id, entry);
    return entry;
  }

  function list() {
    return Object.freeze([...entries.values()]);
  }

  function scriptInventory() {
    const loaded = [...document.scripts]
      .map((script) => script.getAttribute('src'))
      .filter(Boolean)
      .map((src) => src.split('?')[0].replace(/^\.\//, ''));
    const missing = requiredScripts.filter((path) => !loaded.some((src) => src.endsWith(path)));
    return Object.freeze({
      required: requiredScripts,
      loaded: Object.freeze(loaded),
      missing: Object.freeze(missing),
      compliant: missing.length === 0
    });
  }

  function serviceInventory() {
    const registeredServices = HQ.listServices?.() || [];
    const platformEntries = [...entries.values()].filter((entry) => entry.scope !== 'module');
    const moduleEntries = [...entries.values()].filter((entry) => entry.scope === 'module');
    const declaredServices = platformEntries.map((entry) => entry.service);
    const missingPlatform = declaredServices.filter((name) => !registeredServices.includes(name));
    const missingModules = moduleEntries
      .filter((entry) => !entry.module || !HQ.hasModuleService?.(entry.module, entry.service))
      .map((entry) => `${entry.module || 'unknown'}.${entry.service}`);
    return Object.freeze({
      declared: Object.freeze(declaredServices),
      registered: Object.freeze(registeredServices),
      moduleDeclared: Object.freeze(moduleEntries.map((entry) => `${entry.module}.${entry.service}`)),
      moduleRegistered: Object.freeze(moduleEntries
        .filter((entry) => entry.module && HQ.hasModuleService?.(entry.module, entry.service))
        .map((entry) => `${entry.module}.${entry.service}`)),
      missing: Object.freeze([...missingPlatform, ...missingModules]),
      missingPlatform: Object.freeze(missingPlatform),
      missingModules: Object.freeze(missingModules),
      compliant: missingPlatform.length === 0 && missingModules.length === 0
    });
  }

  function diagnostics() {
    const scripts = scriptInventory();
    const services = serviceInventory();
    return Object.freeze({
      service: 'manifest',
      version: '1.4',
      release: HQ.metadata.version,
      entryCount: entries.size,
      entries: list(),
      scripts,
      services,
      compliant: scripts.compliant && services.compliant
    });
  }

  const service = HQ.defineService('manifest', {
    register,
    list,
    scriptInventory,
    serviceInventory,
    diagnostics,
    requiredScripts
  });

  register({
    id: 'platform',
    service: 'platform',
    script: 'platform/core.js',
    version: '1.0',
    capabilities: ['health-report', 'service-health', 'production-baseline']
  });

  register({
    id: 'manifest',
    service: 'manifest',
    script: 'platform/manifest.js',
    version: '1.4',
    capabilities: ['service-metadata', 'script-inventory', 'deployment-validation']
  });
})();
