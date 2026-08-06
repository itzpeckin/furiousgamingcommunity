(() => {
  'use strict';

  const existing = window.FranchiseHQ || {};
  const services = existing.__services instanceof Map
    ? existing.__services
    : new Map();
  const moduleRegistries = existing.__moduleRegistries instanceof Map
    ? existing.__moduleRegistries
    : new Map();
  const moduleFacades = existing.modules && typeof existing.modules === 'object'
    ? existing.modules
    : Object.create(null);
  const checkpoints = new Map();
  const lifecycleTarget = new EventTarget();

  const metadata = Object.freeze({
    name: 'Franchise HQ',
    architecture: 'Frontend Architecture v2',
    version: '5.9.0.2',
    release: 5,
    epic: 9,
    patch: 1,
    build: 'madden-companion-import-core-state'
  });

  const REQUIRED_SERVICES = Object.freeze([
    'lifecycle',
    'platform',
    'manifest',
    'storage',
    'config',
    'features',
    'security',
    'release',
    'contract',
    'events',
    'state',
    'errors',
    'api',
    'runtime',
    'validate',
    'theme',
    'store',
    'simulation',
    'navigation',
    'appRouter',
    'sidebar',
    'auth',
    'league',
    'permissions',
    'ui',
    'accountUI',
    'data',
    'teams',
    'players',
    'schedule',
    'standings',
    'news',
    'trade.state',
    'trade.events',
    'trade.diagnostics',
    'trade.negotiations',
    'trade'
  ]);

  const REQUIRED_CHECKPOINTS = Object.freeze([
    'auth:resolved',
    'ui:initialized'
  ]);

  const lifecycleState = {
    status: 'booting',
    startedAt: new Date().toISOString(),
    readyAt: null,
    error: null
  };

  let platform;
  let readyPromise = null;

  function emitLifecycle(name, detail) {
    const eventName = `franchisehq:${name}`;
    const event = new CustomEvent(eventName, { detail });
    lifecycleTarget.dispatchEvent(event);

    if (services.get('events')?.emit) {
      services.get('events').emit(name, detail);
    } else {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  }

  function defineService(name, service, options = {}) {
    if (!name || typeof name !== 'string') {
      throw new TypeError('FranchiseHQ.defineService requires a service name.');
    }

    if (!service || (typeof service !== 'object' && typeof service !== 'function')) {
      throw new TypeError(`FranchiseHQ service "${name}" must be an object or function.`);
    }

    const replace = options.replace === true;
    if (services.has(name) && !replace) {
      return services.get(name);
    }

    const value = options.freeze === false ? service : Object.freeze(service);
    services.set(name, value);

    Object.defineProperty(platform, name, {
      configurable: true,
      enumerable: true,
      get() {
        return services.get(name);
      }
    });

    emitLifecycle('service-registered', {
      name,
      replaced: replace,
      services: Array.from(services.keys())
    });

    return value;
  }

  function hasService(name) {
    return services.has(name);
  }

  function getService(name) {
    return services.get(name) || null;
  }

  function listServices() {
    return Array.from(services.keys());
  }

  function ensureModule(moduleName) {
    const id = String(moduleName || '').trim();
    if (!/^[a-z][a-z0-9.-]*$/.test(id)) {
      throw new TypeError(`Invalid Franchise HQ module name "${id}".`);
    }

    if (!moduleRegistries.has(id)) moduleRegistries.set(id, new Map());
    if (!moduleFacades[id]) {
      const facade = Object.create(null);
      Object.defineProperties(facade, {
        id: { enumerable: true, value: id },
        get: { enumerable: false, value: (name) => getModuleService(id, name) },
        has: { enumerable: false, value: (name) => hasModuleService(id, name) },
        list: { enumerable: false, value: () => listModuleServices(id) },
        diagnostics: {
          enumerable: false,
          value: () => Object.freeze({
            module: id,
            serviceCount: moduleRegistries.get(id)?.size || 0,
            services: Object.freeze(listModuleServices(id)),
            healthy: true
          })
        }
      });
      moduleFacades[id] = facade;
    }
    return moduleFacades[id];
  }

  function defineModuleService(moduleName, name, service, options = {}) {
    const module = ensureModule(moduleName);
    const serviceName = String(name || '').trim();
    if (!serviceName) throw new TypeError('A module service name is required.');
    if (!service || (typeof service !== 'object' && typeof service !== 'function')) {
      throw new TypeError(`Module service "${moduleName}.${serviceName}" must be an object or function.`);
    }

    const registry = moduleRegistries.get(module.id);
    if (registry.has(serviceName) && options.replace !== true) return registry.get(serviceName);
    const value = options.freeze === false ? service : Object.freeze(service);
    registry.set(serviceName, value);

    Object.defineProperty(module, serviceName, {
      configurable: true,
      enumerable: true,
      get: () => registry.get(serviceName)
    });

    // Compatibility alias: existing League Engine callers may continue using
    // FranchiseHQ.leagueSchema without adding it to the Platform service registry.
    const alias = options.alias === false ? null : String(options.alias || serviceName);
    if (alias) {
      const descriptor = Object.getOwnPropertyDescriptor(platform, alias);
      if (!descriptor || descriptor.configurable === true) {
        Object.defineProperty(platform, alias, {
          configurable: true,
          enumerable: false,
          get: () => registry.get(serviceName)
        });
      }
    }

    emitLifecycle('module-service-registered', {
      module: module.id,
      name: serviceName,
      services: listModuleServices(module.id)
    });
    return value;
  }

  function getModuleService(moduleName, name) {
    return moduleRegistries.get(String(moduleName || ''))?.get(String(name || '')) || null;
  }

  function hasModuleService(moduleName, name) {
    return moduleRegistries.get(String(moduleName || ''))?.has(String(name || '')) || false;
  }

  function listModuleServices(moduleName) {
    const registry = moduleRegistries.get(String(moduleName || ''));
    return registry ? Array.from(registry.keys()) : [];
  }

  function listModules() {
    return Array.from(moduleRegistries.keys());
  }

  function ready(callback) {
    if (typeof callback !== 'function') {
      return Promise.resolve(platform);
    }

    if (document.readyState === 'loading') {
      return new Promise((resolve) => {
        document.addEventListener('DOMContentLoaded', () => {
          resolve(callback(platform));
        }, { once: true });
      });
    }

    return Promise.resolve(callback(platform));
  }

  function markCheckpoint(name, detail = true) {
    const key = String(name || '').trim();
    if (!key) throw new TypeError('A lifecycle checkpoint name is required.');
    checkpoints.set(key, detail);
    emitLifecycle('lifecycle-checkpoint', { name: key, detail });
    return detail;
  }

  function hasCheckpoint(name) {
    return checkpoints.has(name);
  }

  function lifecycleSnapshot() {
    const missingServices = REQUIRED_SERVICES.filter((name) => !services.has(name));
    const missingCheckpoints = REQUIRED_CHECKPOINTS.filter((name) => !checkpoints.has(name));

    return Object.freeze({
      ...lifecycleState,
      version: metadata.version,
      services: Object.freeze(Array.from(services.keys())),
      checkpoints: Object.freeze(Object.fromEntries(checkpoints.entries())),
      requiredServices: REQUIRED_SERVICES,
      requiredCheckpoints: REQUIRED_CHECKPOINTS,
      missingServices: Object.freeze(missingServices),
      missingCheckpoints: Object.freeze(missingCheckpoints),
      ready: lifecycleState.status === 'ready'
    });
  }

  function isReady() {
    const snapshot = lifecycleSnapshot();
    return snapshot.missingServices.length === 0 &&
      snapshot.missingCheckpoints.length === 0 &&
      document.readyState !== 'loading';
  }

  function waitForSignal(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Franchise HQ application readiness timed out.'));
      }, timeoutMs);

      const handler = () => {
        if (!isReady()) return;
        cleanup();
        resolve(lifecycleSnapshot());
      };

      const cleanup = () => {
        window.clearTimeout(timeout);
        lifecycleTarget.removeEventListener('franchisehq:service-registered', handler);
        lifecycleTarget.removeEventListener('franchisehq:lifecycle-checkpoint', handler);
        document.removeEventListener('DOMContentLoaded', handler);
      };

      lifecycleTarget.addEventListener('franchisehq:service-registered', handler);
      lifecycleTarget.addEventListener('franchisehq:lifecycle-checkpoint', handler);
      document.addEventListener('DOMContentLoaded', handler);
      handler();
    });
  }

  function start(options = {}) {
    if (readyPromise) return readyPromise;

    lifecycleState.status = 'booting';
    lifecycleState.error = null;

    readyPromise = waitForSignal(options.timeoutMs || 10000)
      .then(() => {
        lifecycleState.status = 'ready';
        lifecycleState.readyAt = new Date().toISOString();
        const detail = lifecycleSnapshot();
        emitLifecycle('application-ready', detail);
        return detail;
      })
      .catch((error) => {
        lifecycleState.status = 'degraded';
        lifecycleState.error = error instanceof Error ? error.message : String(error);
        const detail = lifecycleSnapshot();
        emitLifecycle('application-degraded', detail);
        console.error('Franchise HQ startup did not fully complete.', detail);
        return detail;
      });

    return readyPromise;
  }

  function whenReady() {
    return start();
  }

  function diagnostics() {
    return lifecycleSnapshot();
  }

  platform = existing;

  const lifecycle = Object.freeze({
    requiredServices: REQUIRED_SERVICES,
    requiredCheckpoints: REQUIRED_CHECKPOINTS,
    markCheckpoint,
    hasCheckpoint,
    getSnapshot: lifecycleSnapshot,
    isReady,
    start,
    whenReady,
    diagnostics
  });

  services.set('lifecycle', lifecycle);

  Object.defineProperties(platform, {
    metadata: {
      configurable: false,
      enumerable: true,
      value: metadata
    },
    defineService: {
      configurable: false,
      enumerable: false,
      value: defineService
    },
    hasService: {
      configurable: false,
      enumerable: false,
      value: hasService
    },
    getService: {
      configurable: false,
      enumerable: false,
      value: getService
    },
    listServices: {
      configurable: false,
      enumerable: false,
      value: listServices
    },
    modules: {
      configurable: false,
      enumerable: true,
      value: moduleFacades
    },
    ensureModule: {
      configurable: false,
      enumerable: false,
      value: ensureModule
    },
    defineModuleService: {
      configurable: false,
      enumerable: false,
      value: defineModuleService
    },
    getModuleService: {
      configurable: false,
      enumerable: false,
      value: getModuleService
    },
    hasModuleService: {
      configurable: false,
      enumerable: false,
      value: hasModuleService
    },
    listModuleServices: {
      configurable: false,
      enumerable: false,
      value: listModuleServices
    },
    listModules: {
      configurable: false,
      enumerable: false,
      value: listModules
    },
    ready: {
      configurable: false,
      enumerable: false,
      value: ready
    },
    lifecycle: {
      configurable: false,
      enumerable: true,
      value: lifecycle
    },
    __services: {
      configurable: false,
      enumerable: false,
      value: services
    },
    __moduleRegistries: {
      configurable: false,
      enumerable: false,
      value: moduleRegistries
    }
  });

  window.FranchiseHQ = platform;


  function safeDiagnostics(name) {
    try {
      const service = services.get(name);
      if (!service) return Object.freeze({ name, available: false, healthy: false, diagnostics: null });
      const diagnostics = typeof service.diagnostics === 'function'
        ? service.diagnostics()
        : null;
      return Object.freeze({ name, available: true, healthy: true, diagnostics });
    } catch (error) {
      return Object.freeze({
        name,
        available: true,
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
        diagnostics: null
      });
    }
  }

  function platformHealth() {
    const lifecycle = lifecycleSnapshot();
    const serviceNames = Array.from(services.keys()).filter((name) => name !== 'platform');
    const serviceReports = serviceNames.map(safeDiagnostics);
    const manifest = services.get('manifest')?.diagnostics?.() || null;
    const runtime = services.get('runtime')?.diagnostics?.() || null;
    const validation = services.get('validate')?.getLastReport?.() || null;
    const security = services.get('security')?.audit?.() || null;
    const contract = services.get('contract')?.audit?.() || null;
    const modules = Object.freeze(Object.fromEntries(
      listModules().map((name) => [name, moduleFacades[name]?.diagnostics?.() || null])
    ));

    const checks = Object.freeze({
      lifecycleReady: lifecycle.status === 'ready',
      requiredServicesLoaded: lifecycle.missingServices.length === 0,
      requiredCheckpointsReached: lifecycle.missingCheckpoints.length === 0,
      manifestCompliant: manifest ? manifest.compliant === true : false,
      runtimeReady: runtime ? runtime.ready === true : false,
      contractCompliant: contract ? contract.compliant === true : false,
      securityCompliant: security ? security.compliant === true : false,
      validationCompliant: validation ? validation.compliant === true : null
    });

    const blockingChecks = Object.entries(checks)
      .filter(([name, value]) => name !== 'validationCompliant' || value !== null)
      .filter(([, value]) => value !== true)
      .map(([name]) => name);
    const unhealthyServices = serviceReports.filter((entry) => !entry.healthy).map((entry) => entry.name);
    const healthy = blockingChecks.length === 0 && unhealthyServices.length === 0;

    return Object.freeze({
      service: 'platform',
      platformVersion: '1.0',
      release: metadata.version,
      overall: healthy ? 'healthy' : 'degraded',
      healthy,
      generatedAt: new Date().toISOString(),
      checks,
      failures: Object.freeze([...blockingChecks, ...unhealthyServices.map((name) => `service:${name}`)]),
      services: Object.freeze(serviceReports),
      lifecycle,
      manifest,
      runtime,
      validation,
      security,
      contract,
      modules
    });
  }

  defineService('platform', {
    version: '1.0',
    health: platformHealth,
    diagnostics: platformHealth
  }, { freeze: true });

  window.dispatchEvent(new CustomEvent('franchisehq:core-ready', {
    detail: metadata
  }));
})();
