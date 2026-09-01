import {
  json,
  database,
  normalizeLeagueSlug,
  validLeagueSlug,
  resolveLeague
} from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';
import { enrichTeamBranding, findTeamBranding } from '../../../../_lib/team-branding.js';
import { classifyMaddenRoute } from '../../../../_lib/madden-discovery.js';

const RELEASE = '7.4.0.2';

const ALIASES = Object.freeze({
  id: ['teamId', 'teamID', 'id', 'team_id', 'clubId', 'franchiseId'],
  displayName: ['displayName', 'fullName', 'teamName', 'name', 'display_name'],
  city: ['cityName', 'city', 'location', 'market', 'teamCity'],
  nickname: ['nickName', 'nickname', 'mascot', 'shortName'],
  abbreviation: ['abbrName', 'abbreviation', 'abbr', 'teamAbbr', 'shortName'],
  conference: ['conferenceName', 'conference', 'confName', 'conferenceId'],
  division: ['divisionName', 'division', 'divName', 'divisionId'],
  primaryColor: ['primaryColor', 'primary_color', 'color1', 'teamColor1'],
  secondaryColor: ['secondaryColor', 'secondary_color', 'color2', 'teamColor2'],
  logoUrl: ['logoUrl', 'logoURL', 'logo', 'teamLogoUrl', 'imageUrl'],
  userControlled: ['userControlled', 'isUserControlled', 'humanControlled', 'userTeam', 'isUser'],
  ownerName: ['ownerName', 'userName', 'username', 'coachName'],
  wins: ['wins', 'win'],
  losses: ['losses', 'loss'],
  ties: ['ties', 'tie']
});

function own(obj, key) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function first(record, aliases) {
  for (const key of aliases) {
    if (own(record, key) && record[key] !== null && record[key] !== '') return record[key];
  }
  const lower = new Map(Object.keys(record || {}).map(key => [key.toLowerCase(), key]));
  for (const key of aliases) {
    const actual = lower.get(String(key).toLowerCase());
    if (actual && record[actual] !== null && record[actual] !== '') return record[actual];
  }
  return null;
}

function cleanString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function integer(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanInt(value) {
  if (value === true || value === 1 || value === '1') return 1;
  const text = String(value ?? '').trim().toLowerCase();
  return ['true', 'yes', 'user', 'human'].includes(text) ? 1 : 0;
}

function normalizeColor(value) {
  const text = cleanString(value);
  if (!text) return null;
  const stripped = text.replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(stripped)) return `#${stripped.toUpperCase()}`;
  if (/^[0-9a-f]{8}$/i.test(stripped)) return `#${stripped.slice(-6).toUpperCase()}`;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return `#${(numeric >>> 0).toString(16).slice(-6).padStart(6, '0').toUpperCase()}`;
  return text;
}

const PLAYER_SHAPED_FIELDS = Object.freeze([
  'playerid', 'player_id', 'firstname', 'first_name', 'lastname', 'last_name',
  'position', 'overall', 'overallrating', 'jerseynumber', 'jersey_number',
  'passattempts', 'passyards', 'passingyards', 'rushyards', 'receivingyards'
]);

function recordShape(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { teamScore: 0, playerSignals: 0, teamSignals: 0 };
  const keys = new Set(Object.keys(record).map(key => key.toLowerCase()));
  let teamSignals = 0;
  for (const name of ['teamid', 'team_id', 'displayname', 'teamname', 'abbrname', 'abbreviation', 'cityname', 'divisionname', 'conferenceid']) {
    if (keys.has(name)) teamSignals += name.includes('teamid') ? 3 : 1;
  }
  let playerSignals = 0;
  for (const name of PLAYER_SHAPED_FIELDS) if (keys.has(name)) playerSignals += 1;
  let teamScore = teamSignals;
  if (first(record, ALIASES.id) !== null) teamScore += 4;
  if (first(record, ALIASES.displayName) !== null) teamScore += 3;
  if (first(record, ALIASES.abbreviation) !== null) teamScore += 2;
  return { teamScore, playerSignals, teamSignals };
}

function teamScore(record) {
  const shape = recordShape(record);
  if (shape.playerSignals >= 2) return -20;
  return shape.teamScore;
}

function collectArrays(value, path = '$', depth = 0, out = []) {
  if (depth > 6 || value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    out.push({ path, records: value });
    for (let i = 0; i < Math.min(value.length, 3); i += 1) collectArrays(value[i], `${path}[${i}]`, depth + 1, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) collectArrays(child, `${path}.${key}`, depth + 1, out);
  }
  return out;
}

function chooseTeamCollection(payload) {
  const candidates = collectArrays(payload).map(candidate => {
    const objects = candidate.records.filter(item => item && typeof item === 'object' && !Array.isArray(item));
    const sample = objects.slice(0, 12);
    const shapes = sample.map(recordShape);
    const playerLikeCount = shapes.filter(shape => shape.playerSignals >= 2).length;
    const teamLikeCount = shapes.filter(shape => shape.teamScore >= 7 && shape.playerSignals < 2).length;
    const average = sample.length ? sample.reduce((sum, item) => sum + teamScore(item), 0) / sample.length : 0;
    const pathBonus = /(?:^|\.)(?:league)?teams?(?:$|\[)/i.test(candidate.path) ? 12 : /teaminfo/i.test(candidate.path) ? 8 : 0;
    const rejected = sample.length > 0 && (playerLikeCount >= Math.ceil(sample.length / 3) || teamLikeCount < Math.min(3, sample.length));
    return { ...candidate, objects, score: average + pathBonus, playerLikeCount, teamLikeCount, rejected };
  }).filter(candidate => candidate.objects.length && !candidate.rejected);
  candidates.sort((a, b) => b.score - a.score || b.teamLikeCount - a.teamLikeCount || b.objects.length - a.objects.length);
  return candidates[0] || null;
}

function canonicalTeam(record, index) {
  const city = cleanString(first(record, ALIASES.city));
  const nickname = cleanString(first(record, ALIASES.nickname));
  const suppliedName = cleanString(first(record, ALIASES.displayName));
  const displayName = suppliedName || [city, nickname].filter(Boolean).join(' ') || `Team ${index + 1}`;
  const externalId = cleanString(first(record, ALIASES.id)) || `generated-team-${index + 1}`;
  return enrichTeamBranding({
    externalId,
    displayName,
    cityName: city,
    nickname,
    abbreviation: cleanString(first(record, ALIASES.abbreviation)),
    conferenceName: cleanString(first(record, ALIASES.conference)),
    divisionName: cleanString(first(record, ALIASES.division)),
    primaryColor: normalizeColor(first(record, ALIASES.primaryColor)),
    secondaryColor: normalizeColor(first(record, ALIASES.secondaryColor)),
    logoUrl: cleanString(first(record, ALIASES.logoUrl)),
    userControlled: booleanInt(first(record, ALIASES.userControlled)),
    ownerName: cleanString(first(record, ALIASES.ownerName)),
    wins: integer(first(record, ALIASES.wins)),
    losses: integer(first(record, ALIASES.losses)),
    ties: integer(first(record, ALIASES.ties)),
    sourceRecord: record
  });
}

function routePriority(routePath) {
  const path = String(routePath || '').toLowerCase().replace(/\/+$/, '');
  if (path.endsWith('/leagueteams')) return 0;
  if (path.endsWith('/teams')) return 1;
  if (/\/week\/(?:pre|reg|post)\/\d+\/team$/.test(path)) return 2;
  return 99;
}

function routeIsForbidden(routePath) {
  return /\/(?:passing|rushing|receiving|kicking|punting|defense|schedules|standings)$/.test(String(routePath || '').toLowerCase().replace(/\/+$/, ''));
}

async function latestTeamCapture(db, leagueId, discoverySessionId) {
  const result = discoverySessionId
    ? await db.prepare(`SELECT c.id capture_id, link.session_id discovery_session_id, c.route_path,
      COALESCE(i.confidence_score,0) confidence_score,COALESCE(i.dataset_type,'unknown') dataset_type,
      c.r2_object_key, c.content_type, c.received_at
    FROM madden_discovery_session_captures link
    JOIN companion_route_captures c ON c.id=link.capture_id AND c.league_id=link.league_id
    LEFT JOIN companion_dataset_inspections i ON i.capture_id=c.id AND i.league_id=c.league_id
    WHERE link.league_id=? AND link.session_id=?
    ORDER BY link.observed_at DESC,c.received_at DESC`).bind(leagueId,discoverySessionId).all()
    : await db.prepare(`SELECT c.id capture_id,c.discovery_session_id,c.route_path,
      COALESCE(i.confidence_score,0) confidence_score,COALESCE(i.dataset_type,'unknown') dataset_type,
      c.r2_object_key,c.content_type,c.received_at
    FROM companion_route_captures c
    LEFT JOIN companion_dataset_inspections i ON i.capture_id=c.id AND i.league_id=c.league_id
    WHERE c.league_id=?
    ORDER BY c.received_at DESC`).bind(leagueId).all();
  const candidates = (result.results || [])
    .filter(row => classifyMaddenRoute(row.route_path) === 'teams'
      && !routeIsForbidden(row.route_path) && routePriority(row.route_path) < 99)
    .sort((a, b) => routePriority(a.route_path) - routePriority(b.route_path)
      || Number(b.confidence_score || 0) - Number(a.confidence_score || 0)
      || String(b.received_at || '').localeCompare(String(a.received_at || '')));
  return candidates[0] || null;
}

async function parseObject(env, capture) {
  if (!capture?.r2_object_key) throw new Error('The classified team route does not have an R2 object key.');
  const object = await env.COMPANION_EXPORTS.get(capture.r2_object_key);
  if (!object) throw new Error('The private team payload could not be found in R2.');
  const text = new TextDecoder('utf-8', { fatal: false }).decode(await object.arrayBuffer()).trim();
  if (!text) throw new Error('The captured team payload is empty.');
  try { return JSON.parse(text); }
  catch (_) { throw new Error('The captured team payload is not valid JSON and cannot be mapped yet.'); }
}

async function latestRun(db, leagueId) {
  return db.prepare(`SELECT * FROM companion_team_mapping_runs
    WHERE league_id = ? ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();
}

async function previewTeams(db, leagueId, runId) {
  if (!runId) return [];
  const result = await db.prepare(`SELECT external_id, display_name, city_name, nickname, abbreviation,
      conference_name, division_name, primary_color, secondary_color, logo_url, user_controlled,
      owner_name, wins, losses, ties
    FROM companion_canonical_teams_preview
    WHERE league_id = ? AND mapping_run_id = ? ORDER BY display_name ASC`).bind(leagueId, runId).all();
  return (result.results || []).map(row => {
    const team = {
      externalId: row.external_id,
      displayName: row.display_name,
      cityName: row.city_name,
      nickname: row.nickname,
      abbreviation: row.abbreviation,
      conferenceName: row.conference_name,
      divisionName: row.division_name,
      primaryColor: row.primary_color,
      secondaryColor: row.secondary_color,
      logoUrl: row.logo_url,
      userControlled: Boolean(row.user_controlled),
      ownerName: row.owner_name,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties
    };
    const branding = findTeamBranding(team);
    return {
      ...team,
      brandingKey: branding?.key || null,
      brandingSource: branding ? 'canonical-registry' : 'export-fallback',
      logoProvider: branding?.logoProvider || (team.logoUrl ? 'Madden export' : null)
    };
  });
}

function response(run, teams, slug, leagueId) {
  return {
    ok: true,
    release: RELEASE,
    leagueId,
    leagueSlug: slug,
    previewAvailable: Boolean(run),
    mappingRun: run ? {
      id: run.id,
      discoverySessionId: run.discovery_session_id,
      sourceCaptureId: run.source_capture_id,
      sourceRoutePath: run.source_route_path,
      status: run.status,
      teamCount: run.team_count,
      warningCount: run.warning_count,
      warnings: (() => { try { return JSON.parse(run.warnings_json || '[]'); } catch (_) { return []; } })(),
      createdAt: run.created_at,
      updatedAt: run.updated_at
    } : null,
    teams,
    activeSnapshotChanged: false,
    activationPerformed: false,
    rawPayloadReturned: false
  };
}

export async function onRequestGet(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return json({ ok: false, error: 'Invalid league slug.' }, 400);
  const db = database(context.env);
  if (!db) return json({ ok: false, error: 'D1 is not configured.' }, 503);
  const league = await resolveLeague(context.env, slug);
  if (!league) return json({ ok: false, error: 'League not found.' }, 404);
  const run = await latestRun(db, league.id);
  const teams = await previewTeams(db, league.id, run?.id);
  return json(response(run, teams, slug, league.id));
}

export async function onRequestPost(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return json({ ok: false, error: 'Invalid league slug.' }, 400);
  const authorization = await requireCommissioner(context);
  if (!authorization.authorized) return authorization.response;
  const db = database(context.env);
  if (!db || !context.env.COMPANION_EXPORTS?.get) return json({ ok: false, error: 'D1 and R2 must be configured.' }, 503);
  const league = await resolveLeague(context.env, slug);
  if (!league) return json({ ok: false, error: 'League not found.' }, 404);
  if (authorization.session.membership?.leagueId !== league.id) return json({ ok: false, error: 'Commissioner membership does not match this league.' }, 403);

  try {
    let body={};try{body=await context.request.json()}catch{}
    const discoverySessionId=String(body.discoverySessionId||'').trim();
    const capture = await latestTeamCapture(db, league.id, discoverySessionId);
    if (!capture) return json({ ok: false, error: 'The selected analyzed export does not contain a recognized Teams dataset.' }, 404);
    const payload = await parseObject(context.env, capture);
    const collection = chooseTeamCollection(payload);
    if (!collection || collection.score < 10) return json({ ok: false, error: 'A team-like record collection could not be identified in the classified payload.' }, 422);

    const warnings = [];
    const canonical = [];
    const seen = new Set();
    for (let index = 0; index < collection.objects.length; index += 1) {
      const team = canonicalTeam(collection.objects[index], index);
      if (seen.has(team.externalId)) {
        warnings.push(`Duplicate team ID skipped: ${team.externalId}`);
        continue;
      }
      seen.add(team.externalId);
      if (team.externalId.startsWith('generated-team-')) warnings.push(`Generated missing team ID for ${team.displayName}.`);
      if (!team.abbreviation) warnings.push(`Missing abbreviation for ${team.displayName}.`);
      if (team.brandingSource !== 'canonical-registry') warnings.push(`Canonical branding was not found for ${team.displayName}; exported branding or neutral fallbacks will be used.`);
      canonical.push(team);
    }
    if (!canonical.length) return json({ ok: false, error: 'No canonical teams were produced from the payload.' }, 422);

    await db.prepare(`UPDATE companion_team_mapping_runs
      SET status = 'superseded-invalid-source', updated_at = ?
      WHERE league_id = ? AND status = 'pending-preview'
        AND LOWER(source_route_path) NOT LIKE '%/leagueteams'
        AND LOWER(source_route_path) NOT LIKE '%/teams'`)
      .bind(new Date().toISOString(), league.id).run();

    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO companion_team_mapping_runs
      (id, league_id, discovery_session_id, source_capture_id, source_route_path, status,
       team_count, warning_count, warnings_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending-preview', ?, ?, ?, ?, ?)`)
      .bind(runId, league.id, capture.discovery_session_id, capture.capture_id, capture.route_path,
        canonical.length, warnings.length, JSON.stringify(warnings), now, now).run();

    const statements = canonical.map(team => db.prepare(`INSERT INTO companion_canonical_teams_preview
      (mapping_run_id, league_id, external_id, display_name, city_name, nickname, abbreviation,
       conference_name, division_name, primary_color, secondary_color, logo_url, user_controlled,
       owner_name, wins, losses, ties, source_record_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(runId, league.id, team.externalId, team.displayName, team.cityName, team.nickname,
        team.abbreviation, team.conferenceName, team.divisionName, team.primaryColor,
        team.secondaryColor, team.logoUrl, team.userControlled, team.ownerName, team.wins,
        team.losses, team.ties, JSON.stringify({ record: team.sourceRecord, branding: { key: team.brandingKey, source: team.brandingSource, logoProvider: team.logoProvider } })));
    for (let offset = 0; offset < statements.length; offset += 50) await db.batch(statements.slice(offset, offset + 50));

    const run = await latestRun(db, league.id);
    const teams = await previewTeams(db, league.id, runId);
    return json({ ...response(run, teams, slug, league.id), collectionPath: collection.path, collectionScore: collection.score, selectionPolicy: 'leagueteams-first-player-records-rejected', brandingPolicy: 'canonical-nfl-registry-with-export-fallback' });
  } catch (error) {
    console.error('Team mapping failed:', error);
    return json({ ok: false, error: 'Team mapping failed.', detail: String(error?.message || error), release: RELEASE }, 500);
  }
}
