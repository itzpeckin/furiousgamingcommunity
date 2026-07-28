(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) {
    throw new Error('platform/core.js must load before platform/contract.js.');
  }

  const freezeList = (values) => Object.freeze([...values]);
  const freezeObject = (value) => Object.freeze({ ...value });

  const layers = Object.freeze({
    platform: freezeObject({
      purpose: 'Shared application infrastructure used by every Franchise HQ capability.',
      owns: freezeList([
        'application lifecycle',
        'service registry',
        'routing and navigation',
        'global event transport',
        'shared state conventions',
        'API transport',
        'error handling',
        'logging and diagnostics',
        'UI shell infrastructure',
        'storage abstraction',
        'module runtime',
        'configuration and feature flags',
        'security baseline',
        'testing and release conventions'
      ]),
      mustNotOwn: freezeList([
        'league rules',
        'trade valuation rules',
        'roster rules',
        'draft rules',
        'salary-cap rules',
        'feature-specific presentation state'
      ])
    }),
    identity: freezeObject({
      purpose: 'Authentication, membership, role, team, and active-user context.',
      owns: freezeList([
        'authenticated user',
        'session',
        'league membership',
        'active role',
        'active team',
        'permission context'
      ])
    }),
    leagueEngine: freezeObject({
      purpose: 'Authoritative league rules, season state, transactions, and simulation behavior.',
      owns: freezeList([
        'league lifecycle',
        'season and week state',
        'team ownership rules',
        'transaction rules',
        'draft rules',
        'waiver rules',
        'salary-cap and contract rules',
        'simulation rules'
      ])
    }),
    dataServices: freezeObject({
      purpose: 'Stable domain APIs that hide whether data comes from memory, mocks, D1, imports, or remote services.',
      owns: freezeList([
        'teams data access',
        'players data access',
        'schedule data access',
        'standings data access',
        'news data access',
        'statistics data access',
        'transaction data access'
      ])
    }),
    moduleFramework: freezeObject({
      purpose: 'A common lifecycle and contract for every user-facing Franchise HQ module.',
      owns: freezeList([
        'module registration',
        'route declaration',
        'permission declaration',
        'mount and unmount lifecycle',
        'module state boundary',
        'module events',
        'module diagnostics',
        'listener cleanup'
      ])
    }),
    featureModules: freezeObject({
      purpose: 'User-facing capabilities built on the platform, identity, league engine, and data services.',
      examples: freezeList([
        'home',
        'commissioner HQ',
        'teams',
        'players',
        'schedule',
        'standings',
        'league news',
        'trade center',
        'draft center',
        'scouting',
        'salary cap',
        'contracts',
        'waivers',
        'free agency'
      ])
    })
  });

  const sourcesOfTruth = Object.freeze({
    currentRoute: 'appRouter',
    navigationState: 'navigation',
    sidebarState: 'sidebar',
    applicationReadiness: 'lifecycle',
    authenticatedUser: 'auth',
    activeLeague: 'league',
    permissions: 'permissions',
    applicationEvents: 'events',
    APITransport: 'api',
    errorHandling: 'errors',
    sharedStorage: 'store',
    sharedApplicationState: 'state',
    tradeState: 'trade.state',
    tradeNegotiations: 'trade.negotiations'
  });

  const serviceOwnership = Object.freeze({
    lifecycle: 'platform',
    contract: 'platform',
    events: 'platform',
    state: 'platform',
    errors: 'platform',
    api: 'platform',
    store: 'platform',
    simulation: 'leagueEngine',
    navigation: 'platform',
    appRouter: 'platform',
    sidebar: 'platform',
    ui: 'platform',
    auth: 'identity',
    league: 'identity',
    permissions: 'identity',
    accountUI: 'featureModules',
    data: 'dataServices',
    teams: 'dataServices',
    players: 'dataServices',
    schedule: 'dataServices',
    standings: 'dataServices',
    news: 'dataServices',
    'trade.state': 'featureModules',
    'trade.events': 'featureModules',
    'trade.diagnostics': 'featureModules',
    'trade.negotiations': 'featureModules',
    trade: 'featureModules'
  });

  const conventions = Object.freeze({
    serviceNames: 'lower camelCase for platform services; dot notation only for sub-services owned by a module',
    eventNames: 'namespace:past-tense-action, for example route:changed or trade:offer-submitted; legacy namespace-action callers are normalized during migration',
    routeNames: 'lowercase kebab-case, for example trade-center and my-team',
    diagnostics: 'diagnostic fields must describe their scope explicitly and must not impersonate platform-wide state',
    state: 'cross-module context lives in registered platform state namespaces; feature state remains in a namespace owned by its module',
    dependencies: 'feature modules may depend on platform, identity, league engine, and data services; platform may not depend on feature modules',
    persistence: 'feature modules must use the shared store or API services rather than directly choosing a persistence mechanism',
    DOM: 'feature modules may render inside their assigned mount point but must not own the global application shell',
    compatibility: 'legacy globals are temporary adapters and may not become new sources of truth'
  });

  const forbiddenPatterns = freezeList([
    'Reading the current route from a feature-specific diagnostic service.',
    'Calling fetch directly from feature modules when the shared API client is available.',
    'Writing un-namespaced feature data directly to localStorage or sessionStorage.',
    'Creating a second source of truth for the active user, league, role, team, or route.',
    'Allowing platform services to depend on Trade Center or another feature module.',
    'Adding new behavior directly to FGC_APP or FGC_TRADE instead of a FranchiseHQ service.',
    'Using UI visibility as the only authorization control for protected actions.',
    'Registering listeners without an unsubscribe or module cleanup path.',
    'Using ambiguous diagnostic fields such as lastRenderRoute without a defined scope.'
  ]);

  const moduleContract = Object.freeze({
    requiredMetadata: freezeList(['id', 'name', 'version', 'routes', 'permissions']),
    lifecycle: freezeList(['register', 'mount', 'unmount']),
    optionalCapabilities: freezeList(['state', 'events', 'diagnostics', 'commands', 'featureFlags']),
    rules: freezeList([
      'A module must declare every route it owns.',
      'A module must clean up listeners and transient UI during unmount.',
      'A module must not mutate another module\'s state directly.',
      'A module must expose diagnostics that are scoped to that module.',
      'A module must use platform permission guards for protected routes and actions.'
    ])
  });

  function describe() {
    return Object.freeze({
      version: '1.2-draft',
      release: '4.16',
      layers,
      sourcesOfTruth,
      serviceOwnership,
      conventions,
      forbiddenPatterns,
      moduleContract
    });
  }

  function ownerOf(serviceName) {
    return serviceOwnership[String(serviceName || '')] || null;
  }

  function sourceFor(concern) {
    return sourcesOfTruth[String(concern || '')] || null;
  }

  function audit() {
    const registered = new Set(HQ.listServices?.() || []);
    const declaredServices = Object.keys(serviceOwnership);
    const undeclaredRegisteredServices = [...registered]
      .filter((name) => !declaredServices.includes(name))
      .sort();
    const declaredButMissingServices = declaredServices
      .filter((name) => !registered.has(name))
      .sort();

    const legacyGlobals = ['FGC_APP', 'FGC_TRADE']
      .filter((name) => Boolean(window[name]));

    return Object.freeze({
      contractVersion: '1.1-draft',
      release: '4.16',
      registeredServices: Object.freeze([...registered].sort()),
      undeclaredRegisteredServices: Object.freeze(undeclaredRegisteredServices),
      declaredButMissingServices: Object.freeze(declaredButMissingServices),
      legacyGlobals: Object.freeze(legacyGlobals),
      sourceOfTruthCount: Object.keys(sourcesOfTruth).length,
      forbiddenPatternCount: forbiddenPatterns.length,
      compliant: undeclaredRegisteredServices.length === 0,
      note: 'Legacy globals and legacy event-name callers are tracked migration concerns and do not fail the 4.15 contract audit.'
    });
  }

  HQ.defineService('contract', {
    describe,
    audit,
    ownerOf,
    sourceFor,
    layers,
    sourcesOfTruth,
    serviceOwnership,
    conventions,
    forbiddenPatterns,
    moduleContract
  });
})();
