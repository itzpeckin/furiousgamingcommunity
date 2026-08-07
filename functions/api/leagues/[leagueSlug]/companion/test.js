import {
  json, database, normalizeLeagueSlug, validLeagueSlug,
  companionMetadataKey, companionObjectKey, sha256Hex,
  resolveLeague, publicExport, bindingStatus
} from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE = '5.9.2.1a';
const TEST_EVENT = 'development-test-created';

function testPayload() {
  const createdAt = new Date().toISOString();
  return {
    franchiseHqDevelopmentTest: true,
    testVersion: RELEASE,
    createdAt,
    season: 2027,
    week: 4,
    teams: [{ id: 'fhq-test-team-1', name: 'Franchise HQ Test Team', abbreviation: 'TST' }],
    players: []
  };
}

async function latestTestExport(db, leagueId) {
  return db.prepare(`SELECT ce.* FROM companion_exports ce
    INNER JOIN companion_export_events ev ON ev.export_id = ce.id
    WHERE ce.league_id = ? AND ev.event_type = ?
    ORDER BY ce.received_at DESC LIMIT 1`).bind(leagueId, TEST_EVENT).first();
}

async function refreshKvPointer(env, slug, leagueId) {
  const latest = await database(env).prepare(`SELECT * FROM companion_exports
    WHERE league_id = ? AND status IN ('pending','inspected','mapped')
    ORDER BY received_at DESC LIMIT 1`).bind(leagueId).first();
  const key = companionMetadataKey(slug);
  if (!latest) {
    await env.COMPANION_EXPORT_META.delete(key);
    return null;
  }
  const pointer = {
    exportId: latest.id,
    leagueId,
    leagueSlug: slug,
    receivedAt: latest.received_at,
    updatedAt: new Date().toISOString(),
    status: latest.status,
    byteLength: latest.byte_length,
    contentType: latest.content_type,
    r2ObjectKey: latest.r2_object_key,
    payloadStored: Boolean(latest.r2_object_key),
    season: latest.season,
    week: latest.week,
    teamCount: latest.team_count,
    playerCount: latest.player_count
  };
  await env.COMPANION_EXPORT_META.put(key, JSON.stringify(pointer));
  return pointer;
}

async function createTest(context, league, slug) {
  const db = database(context.env);
  const payload = testPayload();
  const raw = JSON.stringify(payload);
  const receivedAt = new Date().toISOString();
  const exportId = crypto.randomUUID();
  const payloadHash = await sha256Hex(raw);
  const byteLength = new TextEncoder().encode(raw).byteLength;
  const key = companionObjectKey(slug, exportId, receivedAt, payload.season, payload.week);

  await context.env.COMPANION_EXPORTS.put(key, raw, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: {
      leagueId: league.id,
      leagueSlug: slug,
      exportId,
      receivedAt,
      payloadHash,
      developmentTest: 'true'
    }
  });

  try {
    await db.batch([
      db.prepare(`INSERT INTO companion_exports
        (id, league_id, received_at, status, r2_object_key, byte_length, content_type, season, week, team_count, player_count, inspection_json, created_at)
        VALUES (?, ?, ?, 'pending', ?, ?, 'application/json', ?, ?, ?, ?, ?, ?)`)
        .bind(exportId, league.id, receivedAt, key, byteLength, payload.season, payload.week, payload.teams.length, payload.players.length,
          JSON.stringify({ developmentTest: true, release: RELEASE, verificationStatus: 'not-run' }), receivedAt),
      db.prepare(`INSERT INTO companion_export_fingerprints (league_id, payload_hash, export_id, created_at) VALUES (?, ?, ?, ?)`)
        .bind(league.id, payloadHash, exportId, receivedAt),
      db.prepare(`INSERT INTO companion_export_events (id, export_id, league_id, event_type, detail_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), exportId, league.id, TEST_EVENT,
          JSON.stringify({ developmentTest: true, release: RELEASE, byteLength, r2ObjectKey: key }), receivedAt)
    ]);
  } catch (error) {
    await context.env.COMPANION_EXPORTS.delete(key).catch(() => {});
    throw error;
  }

  const pointer = await refreshKvPointer(context.env, slug, league.id);
  return {
    action: 'create',
    message: 'Test export created. No live league snapshot was changed.',
    export: publicExport({
      id: exportId, league_id: league.id, received_at: receivedAt, status: 'pending',
      r2_object_key: key, byte_length: byteLength, content_type: 'application/json',
      season: payload.season, week: payload.week, team_count: payload.teams.length,
      player_count: payload.players.length, inspection_json: JSON.stringify({ developmentTest: true })
    }),
    checks: { d1Record: true, r2Object: true, kvPointer: pointer?.exportId === exportId, activeSnapshotChanged: false }
  };
}

async function verifyTest(context, league) {
  const db = database(context.env);
  const row = await latestTestExport(db, league.id);
  if (!row) return { action: 'verify', found: false, message: 'No development test export exists yet.' };
  const r2 = row.r2_object_key ? await context.env.COMPANION_EXPORTS.head(row.r2_object_key) : null;
  const pointer = await context.env.COMPANION_EXPORT_META.get(companionMetadataKey(league.slug), { type: 'json' });
  const checks = {
    d1Record: true,
    r2Object: Boolean(r2),
    kvPointer: pointer?.exportId === row.id,
    markedAsDevelopmentTest: true,
    activeSnapshotChanged: false
  };
  const passed = checks.d1Record && checks.r2Object && checks.markedAsDevelopmentTest;
  await db.prepare(`UPDATE companion_exports SET inspection_json = ? WHERE id = ? AND league_id = ?`)
    .bind(JSON.stringify({ developmentTest: true, release: RELEASE, verificationStatus: passed ? 'passed' : 'failed', checks, verifiedAt: new Date().toISOString() }), row.id, league.id).run();
  await db.prepare(`INSERT INTO companion_export_events (id, export_id, league_id, event_type, detail_json, created_at)
    VALUES (?, ?, ?, 'development-test-verified', ?, ?)`)
    .bind(crypto.randomUUID(), row.id, league.id, JSON.stringify({ passed, checks }), new Date().toISOString()).run();
  return { action: 'verify', found: true, passed, export: publicExport(row), checks, message: passed ? 'D1, R2, and the development-test marker passed verification.' : 'One or more storage checks failed.' };
}

async function cleanupTest(context, league, slug) {
  const db = database(context.env);
  const row = await latestTestExport(db, league.id);
  if (!row) return { action: 'cleanup', cleaned: false, message: 'No development test export exists to clean up.' };
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE companion_exports SET status = 'rejected', processed_at = ? WHERE id = ? AND league_id = ?`)
      .bind(now, row.id, league.id),
    db.prepare(`INSERT INTO companion_export_events (id, export_id, league_id, event_type, detail_json, created_at)
      VALUES (?, ?, ?, 'development-test-cleaned', ?, ?)`)
      .bind(crypto.randomUUID(), row.id, league.id, JSON.stringify({ rawR2PayloadRetained: true }), now)
  ]);
  const pointer = await refreshKvPointer(context.env, slug, league.id);
  return {
    action: 'cleanup', cleaned: true, exportId: row.id,
    rawR2PayloadRetained: true,
    kvPointerMoved: pointer?.exportId || null,
    activeSnapshotChanged: false,
    message: 'The test record was removed from the pending queue. Its private R2 archive was retained.'
  };
}

export async function onRequestPost(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return json({ ok: false, error: 'Invalid league slug.' }, 400);

  const authorization = await requireCommissioner(context);
  if (!authorization.authorized) return authorization.response;

  const bindings = bindingStatus(context.env);
  const db = database(context.env);
  if (!db || !bindings.r2 || !bindings.kv) {
    return json({ ok: false, error: 'D1, R2, and KV must be configured before using Developer Mode storage tests.' }, 503);
  }

  const league = await resolveLeague(context.env, slug);
  if (!league) return json({ ok: false, error: 'League not found.' }, 404);
  if (authorization.session.membership?.leagueId !== league.id) {
    return json({ ok: false, error: 'Your Commissioner membership does not match this league.' }, 403);
  }

  const body = await context.request.json().catch(() => ({}));
  const action = String(body.action || 'create').toLowerCase();
  try {
    let result;
    if (action === 'create') result = await createTest(context, league, slug);
    else if (action === 'verify') result = await verifyTest(context, league);
    else if (action === 'cleanup') result = await cleanupTest(context, league, slug);
    else return json({ ok: false, error: 'Unsupported Developer Mode action.' }, 400);
    return json({ ok: true, release: RELEASE, leagueId: league.id, leagueSlug: slug, developmentTest: true, ...result });
  } catch (error) {
    console.error('Developer Mode storage test failed:', error);
    return json({ ok: false, error: 'Developer Mode storage test failed.', detail: String(error?.message || error) }, 500);
  }
}
