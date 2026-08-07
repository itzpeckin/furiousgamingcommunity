import {
  json,
  database,
  normalizeLeagueSlug,
  validLeagueSlug,
  resolveLeague,
  summarizePayloadShape
} from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE = '5.9.3.1';

const RULES = [
  { type: 'teams', label: 'Teams', route: /(?:^|\/)(?:teams?|teaminfo)(?:\/|$)/i, fields: ['teamid','displayname','cityname','abbr','teamname'] },
  { type: 'players-rosters', label: 'Players / Rosters', route: /(?:^|\/)(?:rosters?|players?|playerinfo)(?:\/|$)/i, fields: ['playerid','firstname','lastname','position','overallrating','teamid'] },
  { type: 'standings', label: 'Standings', route: /(?:^|\/)standings?(?:\/|$)/i, fields: ['wins','losses','ties','rank','winpct','teamid'] },
  { type: 'schedule-games', label: 'Schedule / Games', route: /(?:^|\/)(?:schedule|games?)(?:\/|$)/i, fields: ['home','away','homescore','awayscore','week','season'] },
  { type: 'weekly-offense', label: 'Weekly Offense Statistics', route: /(?:^|\/)week\/[^/]+\/\d+\/(?:offense|offensive)(?:\/|$)/i, fields: ['passingyards','rushingyards','receivingyards','touchdowns'] },
  { type: 'weekly-defense', label: 'Weekly Defense Statistics', route: /(?:^|\/)week\/[^/]+\/\d+\/(?:defense|defensive)(?:\/|$)/i, fields: ['tackles','sacks','interceptions','forcedfumbles'] },
  { type: 'statistics', label: 'Statistics', route: /(?:^|\/)(?:stats?|statistics)(?:\/|$)/i, fields: ['yards','touchdowns','attempts','completions'] },
  { type: 'league-info', label: 'League Information', route: /(?:^|\/)(?:league|franchise|settings|info)(?:\/|$)/i, fields: ['season','week','leagueid','leaguename','salarycap'] },
  { type: 'draft-picks', label: 'Draft Picks', route: /(?:^|\/)(?:draftpicks?|picks?)(?:\/|$)/i, fields: ['round','pick','originalteamid','currentteamid'] },
  { type: 'transactions', label: 'Transactions', route: /(?:^|\/)(?:transactions?|trades?)(?:\/|$)/i, fields: ['transactionid','type','timestamp','teamid'] }
];

function flattenFieldNames(shape) {
  const names = new Set((shape.topLevelKeys || []).map(value => String(value).toLowerCase()));
  for (const collection of shape.collections || []) {
    for (const key of collection.sampleKeys || []) names.add(String(key).toLowerCase());
  }
  return names;
}

function classify(routePath, shape) {
  const fields = flattenFieldNames(shape);
  let best = null;
  for (const rule of RULES) {
    let score = 0;
    const routeMatch = rule.route.test(routePath);
    if (routeMatch) score += 70;
    const matchedFields = rule.fields.filter(field => fields.has(field));
    score += Math.min(25, matchedFields.length * 5);
    if (!best || score > best.score) best = { rule, score, routeMatch, matchedFields };
  }
  const score = best?.score || 0;
  const confidence = score >= 85 ? 'high' : score >= 70 ? 'medium' : score >= 25 ? 'low' : 'unknown';
  return {
    datasetType: score ? best.rule.type : 'unknown',
    datasetLabel: score ? best.rule.label : 'Unknown Dataset',
    confidence,
    confidenceScore: score,
    evidence: {
      routeMatched: Boolean(best?.routeMatch),
      matchedFields: best?.matchedFields || []
    }
  };
}

function parseRawObject(object, contentType) {
  if (!object) return { parsed: false, reason: 'missing-r2-object', payload: null, shape: { rootType: 'missing', topLevelKeys: [], collections: [] } };
  return object.arrayBuffer().then(buffer => {
    const bytes = new Uint8Array(buffer);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).trim();
    if (!text) return { parsed: false, reason: 'empty-body', payload: null, shape: { rootType: 'empty', topLevelKeys: [], collections: [] } };
    const shouldTry = String(contentType || '').toLowerCase().includes('json') || text.startsWith('{') || text.startsWith('[');
    if (!shouldTry) return { parsed: false, reason: 'non-json-body', payload: null, shape: { rootType: 'unknown', topLevelKeys: [], collections: [] } };
    try {
      const payload = JSON.parse(text);
      return { parsed: true, reason: null, payload, shape: summarizePayloadShape(payload) };
    } catch (error) {
      return { parsed: false, reason: 'invalid-json', payload: null, shape: { rootType: 'invalid-json', topLevelKeys: [], collections: [] } };
    }
  });
}

async function latestCaptures(db, leagueId) {
  const session = await db.prepare(`SELECT discovery_session_id, MAX(received_at) AS latest_received
    FROM companion_route_captures WHERE league_id = ? GROUP BY discovery_session_id
    ORDER BY latest_received DESC LIMIT 1`).bind(leagueId).first();
  if (!session) return { sessionId: null, captures: [] };
  const rows = await db.prepare(`SELECT id, discovery_session_id, route_path, request_method, content_type,
      byte_length, r2_object_key, received_at
    FROM companion_route_captures WHERE league_id = ? AND discovery_session_id = ?
    ORDER BY received_at ASC`).bind(leagueId, session.discovery_session_id).all();
  return { sessionId: session.discovery_session_id, captures: rows.results || [] };
}

async function inspectCapture(context, league, row) {
  const object = row.r2_object_key ? await context.env.COMPANION_EXPORTS.get(row.r2_object_key) : null;
  const parsed = await parseRawObject(object, row.content_type);
  const classification = classify(row.route_path, parsed.shape);
  const recordCount = (parsed.shape.collections || []).reduce((max, item) => Math.max(max, Number(item.count || 0)), 0);
  const report = {
    captureId: row.id,
    routePath: row.route_path,
    requestMethod: row.request_method,
    contentType: row.content_type,
    byteLength: row.byte_length,
    receivedAt: row.received_at,
    parsed: parsed.parsed,
    parseReason: parsed.reason,
    rootType: parsed.shape.rootType,
    topLevelKeys: parsed.shape.topLevelKeys || [],
    collections: parsed.shape.collections || [],
    recordCount,
    ...classification
  };
  await database(context.env).prepare(`INSERT INTO companion_dataset_inspections
      (id, capture_id, league_id, discovery_session_id, route_path, dataset_type, dataset_label,
       confidence, confidence_score, record_count, schema_json, inspected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(capture_id) DO UPDATE SET
       dataset_type=excluded.dataset_type, dataset_label=excluded.dataset_label,
       confidence=excluded.confidence, confidence_score=excluded.confidence_score,
       record_count=excluded.record_count, schema_json=excluded.schema_json, inspected_at=excluded.inspected_at`)
    .bind(
      crypto.randomUUID(), row.id, league.id, row.discovery_session_id, row.route_path,
      report.datasetType, report.datasetLabel, report.confidence, report.confidenceScore,
      report.recordCount, JSON.stringify(report), new Date().toISOString()
    ).run();
  return report;
}

async function reportForSession(db, leagueId, sessionId) {
  if (!sessionId) return [];
  const rows = await db.prepare(`SELECT schema_json FROM companion_dataset_inspections
    WHERE league_id = ? AND discovery_session_id = ? ORDER BY route_path ASC`)
    .bind(leagueId, sessionId).all();
  return (rows.results || []).map(row => {
    try { return JSON.parse(row.schema_json); } catch (_) { return null; }
  }).filter(Boolean);
}

function summarize(items) {
  const summary = {};
  for (const item of items) summary[item.datasetType] = (summary[item.datasetType] || 0) + 1;
  return summary;
}

export async function onRequestGet(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return json({ ok: false, error: 'Invalid league slug.' }, 400);
  const db = database(context.env);
  if (!db) return json({ ok: false, error: 'D1 is not configured.' }, 503);
  const league = await resolveLeague(context.env, slug);
  if (!league) return json({ ok: false, error: 'League not found.' }, 404);
  const latest = await latestCaptures(db, league.id);
  const datasets = await reportForSession(db, league.id, latest.sessionId);
  return json({
    ok: true,
    release: RELEASE,
    leagueId: league.id,
    leagueSlug: slug,
    discoverySessionId: latest.sessionId,
    capturedRouteCount: latest.captures.length,
    inspectedRouteCount: datasets.length,
    classificationSummary: summarize(datasets),
    datasets,
    rawPayloadReturned: false,
    activationPerformed: false
  });
}

export async function onRequestPost(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return json({ ok: false, error: 'Invalid league slug.' }, 400);
  const authorization = await requireCommissioner(context);
  if (!authorization.authorized) return authorization.response;
  const db = database(context.env);
  if (!db || !context.env.COMPANION_EXPORTS?.get) {
    return json({ ok: false, error: 'D1 and R2 must be configured before classifying datasets.' }, 503);
  }
  const league = await resolveLeague(context.env, slug);
  if (!league) return json({ ok: false, error: 'League not found.' }, 404);
  if (authorization.session.membership?.leagueId !== league.id) {
    return json({ ok: false, error: 'Your Commissioner membership does not match this league.' }, 403);
  }
  try {
    const latest = await latestCaptures(db, league.id);
    if (!latest.captures.length) return json({ ok: false, error: 'No captured Madden routes are available to inspect.' }, 404);
    const datasets = [];
    for (const row of latest.captures) datasets.push(await inspectCapture(context, league, row));
    return json({
      ok: true,
      release: RELEASE,
      leagueId: league.id,
      leagueSlug: slug,
      discoverySessionId: latest.sessionId,
      capturedRouteCount: latest.captures.length,
      inspectedRouteCount: datasets.length,
      classificationSummary: summarize(datasets),
      datasets,
      rawPayloadReturned: false,
      activationPerformed: false
    });
  } catch (error) {
    console.error('Dataset classification failed:', error);
    return json({ ok: false, error: 'Dataset classification failed.', detail: String(error?.message || error), release: RELEASE }, 500);
  }
}
