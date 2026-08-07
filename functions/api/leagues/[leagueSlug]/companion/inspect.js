import {
  JSON_HEADERS,
  companionMetadataKey,
  configuredExportToken,
  json,
  normalizeLeagueSlug,
  safeEqual,
  suppliedExportToken,
  validLeagueSlug
} from '../../../../_lib/cloud-platform.js';

function kind(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}
function summarizeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    keys: Object.keys(value).slice(0, 100),
    fieldTypes: Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [key, kind(item)]))
  };
}
function collectionCandidates(root) {
  const found = [];
  const walk = (object, path, depth) => {
    if (depth > 3 || !object || typeof object !== 'object') return;
    for (const [key, value] of Object.entries(object)) {
      const next = path ? `${path}.${key}` : key;
      if (Array.isArray(value)) {
        const first = value.find(item => item && typeof item === 'object' && !Array.isArray(item));
        found.push({ path: next, count: value.length, item: summarizeObject(first) });
      } else if (value && typeof value === 'object') walk(value, next, depth + 1);
    }
  };
  walk(root, '', 0);
  return found.slice(0, 60);
}
function likelyFields(keys = []) {
  const match = terms => keys.filter(key => terms.some(term => key.toLowerCase().includes(term))).slice(0, 20);
  return {
    ids: match(['id', 'assetname']), teamAssignments: match(['team', 'club', 'roster']),
    names: match(['name', 'first', 'last']), positions: match(['position', 'pos']),
    ratings: match(['overall', 'ovr', 'rating']), development: match(['dev', 'trait']),
    status: match(['injury', 'status', 'reserve'])
  };
}
function analyze(payload, metadata) {
  const topLevel = summarizeObject(payload) || { keys: [], fieldTypes: {} };
  const collections = collectionCandidates(payload).map(collection => ({
    ...collection,
    likelyFields: likelyFields(collection.item?.keys || [])
  }));
  return {
    exportId: metadata.exportId, receivedAt: metadata.receivedAt,
    byteLength: metadata.byteLength, season: metadata.season, week: metadata.week,
    topLevel, collections, rawPayloadReturned: false, activationPerformed: false
  };
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { ...JSON_HEADERS, 'access-control-allow-methods': 'GET,OPTIONS', 'access-control-allow-headers': 'authorization,x-franchisehq-export-token' }
  });
}

export async function onRequestGet(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return json({ ok: false, error: 'Invalid league slug.' }, 400);
  if (!context.env.COMPANION_EXPORTS?.get || !context.env.COMPANION_EXPORT_META?.get) {
    return json({ ok: false, error: 'Companion receiver storage is not configured.' }, 503);
  }
  const token = await configuredExportToken(context.env, slug);
  if (!token) return json({ ok: false, error: 'No export token is configured for this league.' }, 503);
  if (!safeEqual(suppliedExportToken(context.request), token)) {
    return json({ ok: false, error: 'Unauthorized inspection request.' }, 401);
  }

  const metadata = await context.env.COMPANION_EXPORT_META.get(companionMetadataKey(slug), { type: 'json' });
  if (!metadata?.r2ObjectKey) return json({ ok: false, error: 'No pending Companion export is available.' }, 404);
  const object = await context.env.COMPANION_EXPORTS.get(metadata.r2ObjectKey);
  if (!object) return json({ ok: false, error: 'The pending export payload could not be found.' }, 404);

  let payload;
  try { payload = JSON.parse(await object.text()); }
  catch (_) { return json({ ok: false, error: 'Stored export is not valid JSON.' }, 422); }

  const inspection = analyze(payload, metadata);
  if (context.env.FRANCHISE_HQ_DB?.prepare && metadata.exportId) {
    try {
      await context.env.FRANCHISE_HQ_DB
        .prepare('UPDATE companion_exports SET inspection_json = ? WHERE id = ?')
        .bind(JSON.stringify(inspection), metadata.exportId)
        .run();
    } catch (_) {}
  }
  return json({ ok: true, leagueSlug: slug, inspection });
}
