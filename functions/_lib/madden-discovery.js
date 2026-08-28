const DATASET_ORDER = Object.freeze([
  'league-info',
  'teams',
  'team-rosters',
  'players',
  'free-agents',
  'standings',
  'schedule',
  'statistics',
  'transactions',
  'unknown'
]);

const REQUIRED_DATASETS = Object.freeze([
  'teams',
  'team-rosters',
  'players',
  'free-agents',
  'standings',
  'schedule',
  'statistics'
]);

const MARKER_ALIASES = Object.freeze({
  gameRelease: ['gamerelease', 'gameversion', 'maddenversion', 'titleyear', 'gameyear', 'sku'],
  platform: ['platform', 'platformname', 'console', 'consoleplatform'],
  leagueName: ['leaguename', 'franchisename'],
  sourceLeagueId: ['leagueid', 'sourceleagueid'],
  sourceFranchiseId: ['franchiseid', 'sourcefranchiseid'],
  season: ['season', 'seasonindex', 'currentseason', 'seasonyear'],
  week: ['week', 'weekindex', 'currentweek'],
  stage: ['stage', 'seasontype', 'seasonstage']
});

function text(value) {
  return String(value ?? '').trim();
}

function normalizedKey(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function safeScalar(value) {
  if (!['string', 'number', 'boolean'].includes(typeof value)) return null;
  const candidate = text(value).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160);
  return candidate || null;
}

export function normalizeMaddenRoute(value) {
  const route = text(value).replace(/^\/+|\/+$/g, '').toLowerCase();
  return route || 'root';
}

function routeDataset(routeValue) {
  const route = normalizeMaddenRoute(routeValue);
  if (/(?:^|\/)free[-_]?agents?(?:\/|$)/i.test(route)) return 'free-agents';
  if (/(?:^|\/)team\/[^/]+\/roster(?:\/|$)/i.test(route)) return 'team-rosters';
  if (/(?:^|\/)(?:leagueteams|teams?|teaminfo)(?:\/|$)/i.test(route)) return 'teams';
  if (/(?:^|\/)(?:players?|playerinfo|rosters?)(?:\/|$)/i.test(route)) return 'players';
  if (/(?:^|\/)standings?(?:\/|$)/i.test(route)) return 'standings';
  if (/(?:^|\/)(?:schedules?|games?)(?:\/|$)/i.test(route)) return 'schedule';
  if (/(?:^|\/)(?:passing|rushing|receiving|defense|defensive|kicking|punting|offense|offensive|stats?|statistics)(?:\/|$)/i.test(route)) return 'statistics';
  if (/(?:^|\/)(?:transactions?|trades?)(?:\/|$)/i.test(route)) return 'transactions';
  if (route === 'root' || /(?:^|\/)(?:league|franchise|settings|info)(?:\/|$)/i.test(route)) return 'league-info';
  return 'unknown';
}

export function classifyMaddenRoute(routeValue) {
  return routeDataset(routeValue);
}

function arraysIn(value, path = '$', depth = 0, output = []) {
  if (depth > 8 || value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    output.push({ path, values: value });
    return output;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      arraysIn(child, `${path}.${key}`, depth + 1, output);
    }
  }
  return output;
}

function primaryCollection(payload) {
  const collections = arraysIn(payload)
    .map(collection => ({
      ...collection,
      objectRows: collection.values.filter(item => item && typeof item === 'object' && !Array.isArray(item))
    }))
    .filter(collection => collection.objectRows.length || collection.values.length === 0)
    .sort((left, right) => right.objectRows.length - left.objectRows.length || right.values.length - left.values.length);
  return collections[0] || null;
}

function fieldInventory(rows) {
  const fields = new Map();
  for (const row of rows.slice(0, 10_000)) {
    for (const [name, value] of Object.entries(row)) {
      const item = fields.get(name) || { name, presentCount: 0, nullCount: 0, types: new Map() };
      item.presentCount += 1;
      if (value === null || value === undefined || value === '') item.nullCount += 1;
      const type = valueType(value);
      item.types.set(type, (item.types.get(type) || 0) + 1);
      fields.set(name, item);
    }
  }
  return [...fields.values()]
    .map(item => ({
      name: item.name,
      presentCount: item.presentCount,
      nullCount: item.nullCount,
      types: Object.fromEntries([...item.types.entries()].sort(([left], [right]) => left.localeCompare(right)))
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function relationshipFields(fields) {
  const relationships = [];
  for (const field of fields) {
    const key = normalizedKey(field.name);
    let target = null;
    if (['teamid', 'currentteamid', 'originalteamid', 'clubid'].includes(key)) target = 'team';
    else if (['playerid', 'rosterid', 'assetname'].includes(key)) target = 'player';
    else if (['gameid', 'scheduleid'].includes(key)) target = 'game';
    else if (['leagueid'].includes(key)) target = 'league';
    else if (['franchiseid'].includes(key)) target = 'franchise';
    if (target) relationships.push({ field: field.name, target });
  }
  return relationships;
}

function markerCandidates(payload) {
  const found = Object.fromEntries(Object.keys(MARKER_ALIASES).map(key => [key, []]));
  const walk = (value, path = '$', depth = 0) => {
    if (depth > 6 || !value || typeof value !== 'object' || Array.isArray(value)) return;
    for (const [key, child] of Object.entries(value)) {
      const nextPath = `${path}.${key}`;
      const normalized = normalizedKey(key);
      const scalar = safeScalar(child);
      if (scalar !== null) {
        for (const [marker, aliases] of Object.entries(MARKER_ALIASES)) {
          if (aliases.includes(normalized)) found[marker].push({ value: scalar, path: nextPath });
        }
      } else {
        walk(child, nextPath, depth + 1);
      }
    }
  };
  walk(payload);
  return found;
}

function freeAgentCollection(payload) {
  if (!payload || typeof payload !== 'object') return null;
  for (const key of ['rosterInfoList', 'players', 'freeAgents', 'freeAgentList']) {
    if (Array.isArray(payload[key])) return { path: `$.${key}`, values: payload[key] };
  }
  return primaryCollection(payload);
}

export function analyzeMaddenCapture(capture) {
  const routePath = normalizeMaddenRoute(capture?.routePath);
  const datasetType = routeDataset(routePath);
  const payload = capture?.payload ?? null;
  const collection = datasetType === 'free-agents' ? freeAgentCollection(payload) : primaryCollection(payload);
  const rows = collection?.values?.filter(item => item && typeof item === 'object' && !Array.isArray(item)) || [];
  const fields = fieldInventory(rows);
  const payloadSuccess = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload.success ?? null
    : null;
  const explicitFreeAgentRoute = datasetType === 'free-agents';
  let freeAgentStatus = null;
  if (explicitFreeAgentRoute) {
    if (payloadSuccess === false || !collection) freeAgentStatus = 'blocked';
    else if (rows.length > 0) freeAgentStatus = 'located';
    else freeAgentStatus = 'empty-confirmed';
  }
  return {
    captureId: text(capture?.captureId),
    routePath,
    datasetType,
    byteLength: Number(capture?.byteLength || 0),
    receivedAt: capture?.receivedAt || null,
    payloadHash: capture?.payloadHash || null,
    parseStatus: payload === null ? 'unparsed' : 'parsed',
    collectionPath: collection?.path || null,
    recordCount: rows.length,
    fields,
    relationships: relationshipFields(fields),
    markers: markerCandidates(payload),
    freeAgentEvidence: explicitFreeAgentRoute ? {
      explicitRoute: true,
      status: freeAgentStatus,
      recordCount: rows.length,
      collectionPath: collection?.path || null,
      payloadSuccess,
      messagePresent: Boolean(payload && typeof payload === 'object' && safeScalar(payload.message))
    } : null
  };
}

function mergeMarkers(analyses, expected = {}) {
  const output = {};
  for (const marker of Object.keys(MARKER_ALIASES)) {
    const candidates = [];
    for (const analysis of analyses) {
      for (const item of analysis.markers[marker] || []) {
        candidates.push({ ...item, routePath: analysis.routePath });
      }
    }
    const uniqueValues = [...new Set(candidates.map(item => item.value))];
    const expectedValue = safeScalar(expected[marker]);
    const matched = expectedValue
      ? uniqueValues.some(value => markerMatches(marker, value, expectedValue))
      : false;
    output[marker] = {
      expected: expectedValue,
      observed: uniqueValues.slice(0, 20),
      evidence: candidates.slice(0, 40),
      status: expectedValue
        ? matched ? 'matched' : uniqueValues.length ? 'conflict' : 'commissioner-confirmed-only'
        : uniqueValues.length === 1 ? 'observed' : uniqueValues.length > 1 ? 'ambiguous' : 'missing'
    };
  }
  return output;
}

function markerMatches(marker, observedValue, expectedValue) {
  const observed = text(observedValue).toLowerCase();
  const expected = text(expectedValue).toLowerCase();
  if (observed === expected) return true;
  if (marker !== 'gameRelease') return false;
  const expectedYear = expected.match(/\d+/g)?.at(-1) || '';
  const observedYear = observed.match(/\d+/g)?.at(-1) || '';
  if (!expectedYear || !observedYear) return false;
  const shortExpected = expectedYear.slice(-2);
  return observedYear.slice(-2) === shortExpected;
}

function aggregateRequirements(analyses) {
  const byType = new Map();
  for (const type of DATASET_ORDER) byType.set(type, []);
  for (const analysis of analyses) byType.get(analysis.datasetType)?.push(analysis);

  const count = type => (byType.get(type) || []).reduce((total, item) => total + item.recordCount, 0);
  const routes = type => [...new Set((byType.get(type) || []).map(item => item.routePath))];
  const freeAgentAnalyses = byType.get('free-agents') || [];
  const freeAgentLocated = freeAgentAnalyses.find(item => item.freeAgentEvidence?.status === 'located');
  const freeAgentEmpty = freeAgentAnalyses.find(item => item.freeAgentEvidence?.status === 'empty-confirmed');
  const freeAgentBlocked = freeAgentAnalyses.find(item => item.freeAgentEvidence?.status === 'blocked');
  const freeAgentStatus = freeAgentLocated
    ? 'located'
    : freeAgentEmpty ? 'empty-confirmed'
      : freeAgentBlocked ? 'blocked' : 'missing';

  const result = {
    teams: { status: count('teams') > 0 ? 'located' : routes('teams').length ? 'empty' : 'missing', recordCount: count('teams'), routes: routes('teams') },
    'team-rosters': { status: count('team-rosters') > 0 ? 'located' : routes('team-rosters').length ? 'empty' : 'missing', recordCount: count('team-rosters'), routes: routes('team-rosters') },
    players: {
      status: count('players') + count('team-rosters') > 0 ? 'located' : routes('players').length ? 'empty' : 'missing',
      recordCount: count('players') + count('team-rosters'),
      routes: [...new Set([...routes('players'), ...routes('team-rosters')])]
    },
    'free-agents': { status: freeAgentStatus, recordCount: count('free-agents'), routes: routes('free-agents') },
    standings: { status: count('standings') > 0 ? 'located' : routes('standings').length ? 'empty' : 'missing', recordCount: count('standings'), routes: routes('standings') },
    schedule: { status: count('schedule') > 0 ? 'located' : routes('schedule').length ? 'empty' : 'missing', recordCount: count('schedule'), routes: routes('schedule') },
    statistics: { status: count('statistics') > 0 ? 'located' : routes('statistics').length ? 'empty' : 'missing', recordCount: count('statistics'), routes: routes('statistics') }
  };
  return result;
}

function sourceGate(markers) {
  const acceptable = new Set(['matched', 'observed']);
  const gameRelease = markers.gameRelease?.status === 'matched'
    || markers.gameRelease?.status === 'commissioner-confirmed-only';
  const league = acceptable.has(markers.sourceLeagueId?.status)
    || acceptable.has(markers.sourceFranchiseId?.status);
  const season = acceptable.has(markers.season?.status);
  const week = acceptable.has(markers.week?.status);
  return { gameRelease, league, season, week, passed: gameRelease && league && season && week };
}

function sanitizedRoutePattern(routeValue) {
  const segments = normalizeMaddenRoute(routeValue).split('/');
  if (
    /^(?:xbsx|xbox|ps5|ps4|pc)$/i.test(segments[0] || '')
    && segments[1]
    && segments[1] !== 'franchise'
  ) segments[1] = ':franchiseId';
  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index] === 'franchise' && segments[index + 1]) segments[index + 1] = ':franchiseId';
    if (segments[index] === 'team' && segments[index + 1]) segments[index + 1] = ':teamId';
    if (segments[index] === 'week' && segments[index + 2]) segments[index + 2] = ':week';
  }
  return segments.join('/');
}

function fixtureFor(analyses, requirements, markers) {
  return {
    schemaVersion: 1,
    product: 'FranchiseHQ',
    release: '7.3.0',
    rawValuesIncluded: false,
    sourceMarkerStatuses: Object.fromEntries(Object.entries(markers).map(([key, item]) => [key, item.status])),
    requirements: Object.fromEntries(Object.entries(requirements).map(([key, item]) => [key, { status: item.status, recordCount: item.recordCount }])),
    datasets: analyses.map(item => ({
      routePath: sanitizedRoutePattern(item.routePath),
      datasetType: item.datasetType,
      recordCount: item.recordCount,
      collectionPath: item.collectionPath,
      fields: item.fields.map(field => ({ name: field.name, types: field.types })),
      relationships: item.relationships
    }))
  };
}

export function buildMaddenDiscoveryReport(captures, options = {}) {
  const analyses = (captures || []).map(analyzeMaddenCapture);
  const requirements = aggregateRequirements(analyses);
  const markers = mergeMarkers(analyses, options.expected || {});
  const sourceVerification = sourceGate(markers);
  const datasetsPassed = REQUIRED_DATASETS.every(type => {
    const status = requirements[type]?.status;
    return status === 'located' || (type === 'free-agents' && status === 'empty-confirmed');
  });
  const timestamps = analyses.map(item => Date.parse(item.receivedAt)).filter(Number.isFinite).sort((left, right) => left - right);
  const firstCaptureAt = timestamps.length ? new Date(timestamps[0]).toISOString() : null;
  const lastCaptureAt = timestamps.length ? new Date(timestamps.at(-1)).toISOString() : null;
  const captureWindowMs = timestamps.length > 1 ? timestamps.at(-1) - timestamps[0] : timestamps.length ? 0 : null;
  const freeAgentEvidence = {
    status: requirements['free-agents'].status,
    recordCount: requirements['free-agents'].recordCount,
    explicitRouteCaptured: requirements['free-agents'].routes.length > 0,
    routes: analyses.filter(item => item.datasetType === 'free-agents').map(item => ({
      routePath: item.routePath,
      ...item.freeAgentEvidence
    }))
  };
  const datasetInventory = analyses.map(item => ({
    captureId: item.captureId,
    routePath: item.routePath,
    datasetType: item.datasetType,
    byteLength: item.byteLength,
    recordCount: item.recordCount,
    collectionPath: item.collectionPath,
    parseStatus: item.parseStatus,
    receivedAt: item.receivedAt
  }));
  const fieldInventory = analyses.map(item => ({ routePath: item.routePath, datasetType: item.datasetType, fields: item.fields }));
  const relationshipInventory = analyses.map(item => ({ routePath: item.routePath, datasetType: item.datasetType, relationships: item.relationships }));
  return {
    schemaVersion: 1,
    product: 'FranchiseHQ',
    release: '7.3.0',
    discoverySessionId: options.discoverySessionId || null,
    status: datasetsPassed && sourceVerification.passed ? 'passed' : 'review_required',
    routeCount: new Set(analyses.map(item => item.routePath)).size,
    captureCount: analyses.length,
    totalBytes: analyses.reduce((total, item) => total + item.byteLength, 0),
    firstCaptureAt,
    lastCaptureAt,
    captureWindowMs,
    sourceMarkers: markers,
    sourceVerification,
    requirements,
    freeAgentEvidence,
    datasetInventory,
    fieldInventory,
    relationshipInventory,
    sanitizedFixture: fixtureFor(analyses, requirements, markers),
    rawPayloadReturned: false,
    activationPerformed: false,
    activeSnapshotChanged: false
  };
}
