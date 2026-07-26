(() => {
  'use strict';

  const existing = window.FranchiseHQ || {};
  const services = existing.__services instanceof Map
    ? existing.__services
    : new Map();

  const metadata = Object.freeze({
    name: 'Franchise HQ',
    architecture: 'Frontend Architecture v2',
    version: '3.5.0-epic2',
    build: 'authenticated-commissioner-access'
  });

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

  const platform = existing;

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
