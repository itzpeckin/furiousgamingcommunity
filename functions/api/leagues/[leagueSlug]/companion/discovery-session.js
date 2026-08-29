import {
  json,
  database,
  normalizeLeagueSlug,
  validLeagueSlug,
  resolveLeague
} from '../../../../_lib/cloud-platform.js';
import { createRandomToken, hashToken } from '../../../../_lib/auth.js';
import { requirePlatformOwner } from '../../../../_lib/permissions.js';

const RELEASE = '7.3.0';
const SESSION_DURATION_SECONDS = 30 * 60;

function shortText(value, maximum = 120) {
  return String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maximum) || null;
}

async function state(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return { response: json({ ok: false, error: 'Invalid league slug.', release: RELEASE }, 400) };
  const authorization = await requirePlatformOwner(context);
  if (!authorization.authorized) return { response: authorization.response };
  const db = database(context.env);
  const league = db ? await resolveLeague(context.env, slug) : null;
  if (!db || !league || authorization.session.membership?.leagueId !== league.id) {
    return { response: json({ ok: false, error: 'Not found.' }, 404) };
  }
  return { db, league, slug, authorization };
}

function publicSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    expected: {
      gameRelease: row.expected_game_release,
      platform: row.expected_platform,
      leagueName: row.expected_league_name,
      season: row.expected_season,
      week: row.expected_week
    },
    captureCount: Number(row.capture_count || 0),
    expiresAt: row.expires_at,
    lastCaptureAt: row.last_capture_at,
    completedAt: row.completed_at,
    createdAt: row.created_at
  };
}

async function expireOldSessions(db, leagueId) {
  await db.prepare(`UPDATE madden_discovery_sessions
    SET status='expired', updated_at=CURRENT_TIMESTAMP
    WHERE league_id=? AND status='open' AND datetime(expires_at)<=CURRENT_TIMESTAMP`)
    .bind(leagueId).run();
}

export async function onRequestGet(context) {
  const current = await state(context);
  if (current.response) return current.response;
  await expireOldSessions(current.db, current.league.id);
  const rows = await current.db.prepare(`SELECT * FROM madden_discovery_sessions
    WHERE league_id=? ORDER BY created_at DESC LIMIT 10`).bind(current.league.id).all();
  return json({
    ok: true,
    release: RELEASE,
    sessions: (rows.results || []).map(publicSession),
    rawCaptureTokenReturned: false,
    activationPerformed: false
  });
}

export async function onRequestPost(context) {
  const current = await state(context);
  if (current.response) return current.response;
  let body = {};
  try { body = await context.request.json(); } catch { body = {}; }
  const expected = body && typeof body.expected === 'object' ? body.expected : {};
  const token = createRandomToken(32);
  const tokenHash = await hashToken(token);
  const sessionId = `m27_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000).toISOString();
  const expectedGameRelease = shortText(expected.gameRelease) || 'Madden NFL 27';
  const expectedPlatform = shortText(expected.platform);
  const expectedLeagueName = shortText(expected.leagueName) || current.league.name;
  const expectedSeason = shortText(expected.season, 40);
  const expectedWeek = shortText(expected.week, 40);

  await expireOldSessions(current.db, current.league.id);
  await current.db.batch([
    current.db.prepare(`UPDATE madden_discovery_sessions
      SET status='cancelled', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
      WHERE league_id=? AND status='open'`).bind(current.league.id),
    current.db.prepare(`INSERT INTO madden_discovery_sessions
      (id,league_id,token_hash,status,expected_game_release,expected_platform,expected_league_name,
       expected_season,expected_week,opened_by_user_id,expires_at)
      VALUES (?,?,?,'open',?,?,?,?,?,?,?)`).bind(
        sessionId,
        current.league.id,
        tokenHash,
        expectedGameRelease,
        expectedPlatform,
        expectedLeagueName,
        expectedSeason,
        expectedWeek,
        current.authorization.session.user.id,
        expiresAt
      )
  ]);

  const origin = new URL(context.request.url).origin;
  const captureBaseUrl = `${origin}/api/leagues/${encodeURIComponent(current.slug)}/companion/export/${encodeURIComponent(token)}`;
  return json({
    ok: true,
    release: RELEASE,
    session: publicSession({
      id: sessionId,
      status: 'open',
      expected_game_release: expectedGameRelease,
      expected_platform: expectedPlatform,
      expected_league_name: expectedLeagueName,
      expected_season: expectedSeason,
      expected_week: expectedWeek,
      capture_count: 0,
      expires_at: expiresAt,
      created_at: new Date().toISOString()
    }),
    captureBaseUrl,
    captureUrlReturnedOnce: true,
    tokenStoredAsHashOnly: true,
    activationPerformed: false
  }, 201);
}
