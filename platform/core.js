(() => {
  'use strict';

  const existing = window.FranchiseHQ || {};
  const services = existing.__services instanceof Map
    ? existing.__services
    : new Map();
  const checkpoints = new Map();
  const lifecycleTarget = new EventTarget();

  const metadata = Object.freeze({
    name: 'Franchise HQ',
    architecture: 'Frontend Architecture v2',
    version: '4.14',
    release: 4,
    epic: 14,
    patch: 0,
    build: 'platform-contract-and-architecture-specification'
  });

  const REQUIRED_SERVICES = Object.freeze([
    'lifecycle',
    'contract',
    'events',
    'api',
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
    }
  });

  window.FranchiseHQ = platform;

  window.dispatchEvent(new CustomEvent('franchisehq:core-ready', {
    detail: metadata
  }));
})();
