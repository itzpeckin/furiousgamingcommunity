import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

import {
  analyzeMaddenCapture,
  buildMaddenDiscoveryReport,
  normalizeMaddenRoute
} from '../../functions/_lib/madden-discovery.js';
import {
  assessFreeAgentPayload,
  captureBelongsToRosterCohort
} from '../../functions/api/leagues/[leagueSlug]/companion/map-players.js';
import { hashToken } from '../../functions/_lib/auth.js';
import { deriveLeagueExportToken } from '../../functions/_lib/permanent-league-export.js';
import { recoverMaddenDiscoveryCohort } from '../../functions/_lib/madden-discovery-report.js';
import { onRequestPost as startDiscoverySession } from '../../functions/api/leagues/[leagueSlug]/companion/discovery-session.js';
import { onRequestPost as generateDiscoveryReport } from '../../functions/api/leagues/[leagueSlug]/companion/discovery-report.js';
import { onRequest as receiveDiscoveryCapture } from '../../functions/api/leagues/[leagueSlug]/companion/export/[token]/[[datasetPath]].js';

const MIGRATIONS = [
  '../../migrations/0018_canonical_core_foundation.sql',
  '../../migrations/0019_canonical_import_snapshot_foundation.sql',
  '../../migrations/0020_canonical_transaction_runtime_foundation.sql',
  '../../migrations/0021_tenant_ready_core.sql',
  '../../migrations/0022_madden_27_discovery_foundation.sql',
  '../../migrations/0023_permanent_identity_preview.sql',
  '../../migrations/0024_commissioner_candidate_import.sql',
  '../../migrations/0025_safe_game_year_transition.sql',
  '../../migrations/0026_permanent_league_export_url.sql'
];

function d1(database) {
  return {
    prepare(sql) {
      let values = [];
      const statement = database.prepare(sql);
      const api = {
        bind(...next) { values = next; return api; },
        async first() { return statement.get(...values) || null; },
        async all() { return { results: statement.all(...values) }; },
        async run() {
          const result = statement.run(...values);
          return { success: true, meta: { changes: Number(result.changes || 0) } };
        }
      };
      return api;
    },
    async batch(statements) {
      database.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

function memoryR2() {
  const objects = new Map();
  return {
    objects,
    async put(key, value) {
      const bytes = value instanceof ArrayBuffer
        ? new Uint8Array(value).slice()
        : new TextEncoder().encode(String(value));
      objects.set(key, bytes);
    },
    async get(key) {
      const bytes = objects.get(key);
      if (!bytes) return null;
      return {
        async arrayBuffer() { return bytes.slice().buffer; },
        async text() { return new TextDecoder().decode(bytes); }
      };
    },
    async delete(key) { objects.delete(key); }
  };
}

function memoryKv() {
  const values = new Map();
  return {
    async get(key) { return values.get(key) || null; },
    async put(key, value) { values.set(key, value); }
  };
}

function capture(routePath, payload, receivedOffset = 0) {
  return {
    captureId: `capture-${routePath}-${receivedOffset}`,
    routePath,
    byteLength: JSON.stringify(payload).length,
    receivedAt: new Date(Date.UTC(2026, 7, 28, 12, 0, 0) + receivedOffset).toISOString(),
    payloadHash: `hash-${routePath}`,
    payload
  };
}

function completeCaptureSet(freeAgents = [{ playerId: 'fa-1', firstName: 'Sensitive', lastName: 'UnsignedPerson', position: 'QB' }]) {
  return [
    capture('xbsx/franchise/fr-1/league', {
      success: true,
      gameVersion: 'Madden NFL 27',
      platform: 'xbsx',
      franchiseId: 'fr-1',
      leagueName: 'Furious Gaming Community',
      season: 1,
      week: 3
    }, 0),
    capture('xbsx/fr-1/leagueteams', {
      leagueTeamInfoList: [{ teamId: 'team-1', displayName: 'Private Team' }]
    }, 2_000),
    capture('xbsx/fr-1/team/team-1/roster', {
      success: true,
      rosterInfoList: [{ playerId: 'player-1', teamId: 'team-1', firstName: 'Secret', lastName: 'ConfidentialSurname', position: 'QB' }]
    }, 4_000),
    capture('xbsx/fr-1/freeagents/roster', {
      success: true,
      rosterInfoList: freeAgents
    }, 6_000),
    capture('xbsx/fr-1/standings', {
      teamStandingInfoList: [{ teamId: 'team-1', wins: 2, losses: 1 }]
    }, 8_000),
    capture('xbsx/fr-1/schedules', {
      gameScheduleInfoList: [{ gameId: 'game-1', homeTeamId: 'team-1', awayTeamId: 'team-2', week: 3 }]
    }, 10_000),
    capture('xbsx/fr-1/week/reg/3/passing', {
      playerPassingStatInfoList: [{ playerId: 'player-1', teamId: 'team-1', passingYards: 250 }]
    }, 12_000)
  ];
}

function liveLikeRosterCaptureSet() {
  const teams = Array.from({ length: 32 }, (_, index) => ({
    teamId: `team-${index + 1}`,
    displayName: `Private Team ${index + 1}`
  }));
  let playerNumber = 0;
  const rosters = teams.map((team, teamIndex) => {
    const rosterSize = teamIndex < 28 ? 64 : 63;
    const rows = Array.from({ length: rosterSize }, () => {
      playerNumber += 1;
      return {
        rosterId: `player-${playerNumber}`,
        teamId: team.teamId,
        firstName: 'Private',
        lastName: `Player ${playerNumber}`,
        position: playerNumber % 2 ? 'QB' : 'WR',
        isFreeAgent: false,
        isActive: playerNumber > 13
      };
    });
    return capture(`xbsx/742482/team/${team.teamId}/roster`, {
      success: true,
      rosterInfoList: rows
    }, 3_000 + teamIndex * 10);
  });
  return [
    capture('xbsx/742482/league', {
      success: true,
      gameVersion: 'Madden NFL 27',
      platform: 'xbsx',
      franchiseId: '742482',
      leagueName: 'Furious Gaming Community',
      season: 1,
      week: 1
    }, 0),
    capture('xbsx/742482/leagueteams', { leagueTeamInfoList: teams }, 2_000),
    ...rosters,
    capture('xbsx/742482/freeagents/roster', {
      success: false,
      message: 'Export error: Failed to retrieve team roster.',
      rosterInfoList: []
    }, 3_500),
    capture('xbsx/742482/standings', {
      teamStandingInfoList: teams.map(team => ({ teamId: team.teamId, wins: 0, losses: 0 }))
    }, 3_600),
    capture('xbsx/742482/schedules', {
      gameScheduleInfoList: [{ gameId: 'game-1', homeTeamId: 'team-1', awayTeamId: 'team-2', week: 1 }]
    }, 3_700),
    capture('xbsx/742482/week/reg/1/passing', {
      playerPassingStatInfoList: [{ playerId: 'player-1', teamId: 'team-1', passingYards: 0 }]
    }, 3_800)
  ];
}

const expected = {
  gameRelease: 'Madden NFL 27',
  platform: 'xbsx',
  leagueName: 'Furious Gaming Community',
  season: '1',
  week: '3'
};

test('normalizes Companion paths and recognizes explicit Madden Free Agent payloads', () => {
  assert.equal(normalizeMaddenRoute('/XBSX/fr-1/freeagents/roster/'), 'xbsx/fr-1/freeagents/roster');
  const analysis = analyzeMaddenCapture(completeCaptureSet()[3]);
  assert.equal(analysis.datasetType, 'free-agents');
  assert.equal(analysis.freeAgentEvidence.status, 'located');
  assert.equal(analysis.freeAgentEvidence.recordCount, 1);
});

test('builds a passing structural source-lock report without exposing player or team values', () => {
  const report = buildMaddenDiscoveryReport(completeCaptureSet(), {
    discoverySessionId: 'm27-test-session',
    expected
  });
  assert.equal(report.status, 'passed');
  assert.equal(report.requirements.teams.status, 'located');
  assert.equal(report.requirements['team-rosters'].status, 'located');
  assert.equal(report.requirements.players.status, 'located');
  assert.equal(report.requirements['free-agents'].status, 'located');
  assert.equal(report.requirements.standings.status, 'located');
  assert.equal(report.requirements.schedule.status, 'located');
  assert.equal(report.requirements.statistics.status, 'located');
  assert.equal(report.sourceVerification.passed, true);
  assert.equal(report.captureWindowMs, 12_000);
  assert.equal(report.rawPayloadReturned, false);
  assert.equal(report.activationPerformed, false);
  assert.equal(report.sanitizedFixture.rawValuesIncluded, false);
  assert.match(report.sanitizedFixture.datasets[2].routePath, /team\/:teamId\/roster/);
  assert.equal(JSON.stringify(report.sanitizedFixture).includes('fr-1'), false);
  assert.equal(JSON.stringify(report.sanitizedFixture).includes('team-1'), false);
  const serialized = JSON.stringify(report);
  for (const secretValue of ['Private Team', 'Secret', 'ConfidentialSurname', 'Sensitive', 'UnsignedPerson']) {
    assert.equal(serialized.includes(secretValue), false);
  }
});

test('recognizes a four-digit title year as Madden NFL 27 source evidence', () => {
  const captures = completeCaptureSet();
  captures[0].payload.gameVersion = undefined;
  captures[0].payload.gameYear = 2027;
  const report = buildMaddenDiscoveryReport(captures, { expected });
  assert.equal(report.sourceMarkers.gameRelease.status, 'matched');
  assert.equal(report.sourceVerification.passed, true);
});

test('does not pass source lock when a Free Agent route was not captured', () => {
  const withoutFreeAgents = completeCaptureSet().filter(item => !item.routePath.includes('freeagents'));
  const report = buildMaddenDiscoveryReport(withoutFreeAgents, { expected });
  assert.equal(report.status, 'review_required');
  assert.equal(report.requirements['free-agents'].status, 'missing');
  assert.equal(report.freeAgentEvidence.explicitRouteCaptured, false);
});

test('records a successful explicit zero-player Free Agent response as precisely empty', () => {
  const report = buildMaddenDiscoveryReport(completeCaptureSet([]), { expected });
  assert.equal(report.status, 'passed');
  assert.equal(report.requirements['free-agents'].status, 'empty-confirmed');
  assert.equal(report.freeAgentEvidence.recordCount, 0);
  assert.equal(report.freeAgentEvidence.explicitRouteCaptured, true);
});

test('does not accept an unsuccessful Free Agent response as an empty league', () => {
  const captures = completeCaptureSet();
  captures[3] = capture('xbsx/fr-1/freeagents/roster', {
    success: false,
    message: 'Source request failed',
    rosterInfoList: []
  }, 6_000);
  const report = buildMaddenDiscoveryReport(captures, { expected });
  assert.equal(report.status, 'review_required');
  assert.equal(report.requirements['free-agents'].status, 'blocked');
});

test('certifies rostered-player readiness independently when the Madden Free Agent request fails upstream', () => {
  const report = buildMaddenDiscoveryReport(liveLikeRosterCaptureSet(), { expected });
  assert.equal(report.status, 'review_required');
  assert.equal(report.requirements['free-agents'].status, 'blocked');
  assert.equal(report.playerImportReadiness.status, 'ready');
  assert.equal(report.playerImportReadiness.scope, 'rostered-players');
  assert.equal(report.playerImportReadiness.canBuildRosteredPlayerPreview, true);
  assert.equal(report.playerImportReadiness.canClaimCompletePlayerPool, false);
  assert.equal(report.playerImportReadiness.expectedTeamCount, 32);
  assert.equal(report.playerImportReadiness.routeCount, 32);
  assert.equal(report.playerImportReadiness.successfulRoutes, 32);
  assert.equal(report.playerImportReadiness.recordCount, 2_044);
  assert.equal(report.playerImportReadiness.uniquePlayerIds, 2_044);
  assert.equal(report.playerImportReadiness.duplicatePlayerIds, 0);
  assert.equal(report.playerImportReadiness.missingTeamIds, 0);
  assert.equal(report.playerImportReadiness.zeroTeamIds, 0);
  assert.equal(report.playerImportReadiness.routeTeamMismatches, 0);
  assert.deepEqual(report.playerImportReadiness.freeAgentFlags, { true: 0, false: 2_044, missing: 0, invalid: 0 });
  assert.deepEqual(report.playerImportReadiness.activeFlags, { true: 2_031, false: 13, missing: 0, invalid: 0 });
  assert.equal(report.requirements.players.assignmentEvidence.status, 'ready');
});

test('player mapping accepts a successful empty Free Agent response but blocks a failed one', () => {
  assert.deepEqual(assessFreeAgentPayload({ success: true, rosterInfoList: [] }), {
    status: 'empty-confirmed',
    accepted: true,
    objects: [],
    collectionPath: '$.rosterInfoList',
    payloadSuccess: true,
    message: null
  });
  const failed = assessFreeAgentPayload({
    success: false,
    message: 'Export error: Failed to retrieve team roster.',
    rosterInfoList: []
  });
  assert.equal(failed.status, 'blocked');
  assert.equal(failed.accepted, false);
  assert.equal(failed.objects.length, 0);
});

test('player mapping refuses a stale Free Agent capture from an older roster cohort', () => {
  const source = {
    sessionDiagnostics: ['current-session'],
    cohort: {
      latestReceivedAt: '2026-08-28T12:00:00.000Z',
      windowMs: 20 * 60 * 1_000
    }
  };
  assert.equal(captureBelongsToRosterCohort({
    discovery_session_id: 'current-session',
    received_at: '2026-08-28T11:00:00.000Z'
  }, source), true);
  assert.equal(captureBelongsToRosterCohort({
    discovery_session_id: 'older-session',
    received_at: '2026-08-28T11:50:00.000Z'
  }, source), false);
  assert.equal(captureBelongsToRosterCohort({
    discovery_session_id: 'older-session',
    received_at: '2026-08-28T11:00:00.000Z'
  }, source), false);
});

test('short-lived capture sessions store only token hashes and own the export session identity', async () => {
  const [migration, sessionRoute, receiver] = await Promise.all([
    readFile(new URL('../../migrations/0022_madden_27_discovery_foundation.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/discovery-session.js', import.meta.url), 'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/export/[token]/[[datasetPath]].js', import.meta.url), 'utf8')
  ]);
  assert.match(migration, /token_hash TEXT NOT NULL UNIQUE/);
  assert.equal(/\btoken\s+TEXT\b/i.test(migration), false);
  assert.match(migration, /madden_discovery_session_captures/);
  assert.match(sessionRoute, /SESSION_DURATION_SECONDS = 30 \* 60/);
  assert.match(sessionRoute, /const tokenHash = await hashToken\(token\)/);
  assert.match(sessionRoute, /captureUrlReturnedOnce: true/);
  assert.match(receiver, /const discoverySessionId = discoverySession\?\.id \|\| sessionId/);
  assert.match(receiver, /linkSessionCapture\(db, league\.id, discoverySession\.id, duplicate\.id/);
});

test('one authenticated discovery session captures, deduplicates, reports, and never activates Madden data', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA foreign_keys = ON;');
    for (const migration of MIGRATIONS) database.exec(await readFile(new URL(migration, import.meta.url), 'utf8'));
    database.prepare(`INSERT INTO leagues
      (id,name,product_name,slug,public_status,tenant_status,timezone)
      VALUES (?,?,?,?,?,?,?)`).run(
        'league-test', 'Furious Gaming Community', 'FranchiseHQ', 'test-league',
        'active', 'enabled', 'America/Chicago'
      );
    database.prepare(`INSERT INTO users
      (id,discord_user_id,discord_username,display_name) VALUES (?,?,?,?)`)
      .run('owner-user', '100000000000000001', 'owner', 'Owner');
    database.prepare(`INSERT INTO league_memberships
      (id,league_id,user_id,role,active) VALUES (?,?,?,?,1)`)
      .run('owner-membership', 'league-test', 'owner-user', 'commissioner');
    const rawSessionToken = 'local-discovery-session-token';
    database.prepare(`INSERT INTO sessions
      (id,user_id,session_token_hash,expires_at) VALUES (?,?,?,?)`)
      .run('owner-session', 'owner-user', await hashToken(rawSessionToken), '2099-01-01T00:00:00.000Z');

    const binding = d1(database);
    const r2 = memoryR2();
    const kv = memoryKv();
    const credentialRoot = ['test','permanent','export','root'].join('-');
    const env = {
      DB: binding,
      FRANCHISE_HQ_DB: binding,
      COMPANION_EXPORTS: r2,
      COMPANION_EXPORT_META: kv,
      LEAGUE_CONFIG: memoryKv(),
      COMPANION_EXPORT_TOKEN: credentialRoot,
      APP_ENV: 'production',
      OWNER_FALLBACK_DISCORD_ID: '100000000000000001'
    };
    const cookie = `franchise_hq_session=${rawSessionToken}`;
    const startResponse = await startDiscoverySession({
      env,
      params: { leagueSlug: 'test-league' },
      request: new Request('https://franchisehq.app/api/leagues/test-league/companion/discovery-session', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ expected })
      })
    });
    assert.equal(startResponse.status, 201);
    const started = await startResponse.json();
    assert.equal(started.captureUrlReturnedOnce, true);
    assert.equal(started.tokenStoredAsHashOnly, true);
    const token = decodeURIComponent(new URL(started.captureBaseUrl).pathname.split('/').at(-1));
    assert.ok(token.length >= 32);
    const sessionRow = database.prepare(`SELECT * FROM madden_discovery_sessions WHERE id=?`).get(started.session.id);
    assert.notEqual(sessionRow.token_hash, token);
    assert.equal(sessionRow.token_hash, await hashToken(token));

    for (const item of completeCaptureSet()) {
      const response = await receiveDiscoveryCapture({
        env,
        params: { leagueSlug: 'test-league', token, datasetPath: item.routePath },
        request: new Request(`${started.captureBaseUrl}/${item.routePath}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(item.payload)
        })
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).discoverySessionId, started.session.id);
    }

    const duplicate = completeCaptureSet()[1];
    const duplicateResponse = await receiveDiscoveryCapture({
      env,
      params: { leagueSlug: 'test-league', token, datasetPath: duplicate.routePath },
      request: new Request(`${started.captureBaseUrl}/${duplicate.routePath}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(duplicate.payload)
      })
    });
    assert.equal((await duplicateResponse.json()).duplicate, true);
    assert.equal(database.prepare(`SELECT capture_count FROM madden_discovery_sessions WHERE id=?`).get(started.session.id).capture_count, 7);
    assert.equal(r2.objects.size, 7);

    const reportResponse = await generateDiscoveryReport({
      env,
      params: { leagueSlug: 'test-league' },
      request: new Request('https://franchisehq.app/api/leagues/test-league/companion/discovery-report', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: started.session.id })
      })
    });
    assert.equal(reportResponse.status, 200);
    const generated = await reportResponse.json();
    assert.equal(generated.report.status, 'passed');
    assert.equal(generated.report.freeAgentEvidence.status, 'located');
    assert.equal(generated.report.rawPayloadReturned, false);
    assert.equal(generated.report.activationPerformed, false);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM madden_discovery_reports`).get().count, 1);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM league_active_snapshots`).get().count, 0);

    database.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
        'season-test','league-test','ea-madden-companion','fr-1','1','Madden NFL 27','Test Season',2026,'active'
      );
    database.prepare(`INSERT INTO league_game_years
      (id,league_id,game_release,edition_year,display_name,status)
      VALUES (?,?,?,?,?,'active')`).run(
        'game-year-test','league-test','Madden NFL 27',27,'Madden NFL 27'
      );
    database.prepare(`UPDATE companion_league_export_endpoints SET
      latest_session_id=NULL,latest_report_id=NULL,latest_ready_report_id=NULL,
      last_received_at=NULL,last_analyzed_at=NULL,analysis_requested_at=NULL
      WHERE league_id='league-test'`).run();
    const permanentToken = await deriveLeagueExportToken(
      env.COMPANION_EXPORT_TOKEN,'league-test',1
    );
    const pendingAnalysis=[];
    for (const item of completeCaptureSet()) {
      const response = await receiveDiscoveryCapture({
        env,
        params:{leagueSlug:'test-league',token:permanentToken,datasetPath:item.routePath},
        request:new Request(`https://franchisehq.app/api/leagues/test-league/companion/export/${permanentToken}/${item.routePath}`,{
          method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(item.payload)
        }),
        waitUntil(promise){ pendingAnalysis.push(promise); }
      });
      assert.equal(response.status,200);
      assert.equal((await response.json()).mode,'permanent-league-export');
    }
    await Promise.all(pendingAnalysis);
    const endpoint=database.prepare(`SELECT * FROM companion_league_export_endpoints
      WHERE league_id='league-test'`).get();
    const automaticSession=database.prepare(`SELECT * FROM madden_discovery_sessions
      WHERE id=?`).get(endpoint.latest_session_id);
    assert.match(automaticSession.id,/^m27_auto_/);
    assert.equal(automaticSession.capture_count,7);
    assert.ok(endpoint.latest_report_id);
    assert.equal(endpoint.latest_ready_report_id,endpoint.latest_report_id);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM madden_discovery_reports`).get().count,2);
    assert.equal(r2.objects.size,7,'duplicate payloads are linked into the new cohort without copying raw objects');
    assert.equal(database.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {
    database.close();
  }
});

test('an existing shattered 43-route burst is recovered without importing or activating data', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA foreign_keys = ON;');
    for (const migration of MIGRATIONS) database.exec(await readFile(new URL(migration, import.meta.url),'utf8'));
    database.prepare(`INSERT INTO leagues
      (id,name,product_name,slug,public_status,tenant_status,timezone)
      VALUES (?,?,?,?,?,?,?)`).run(
        'league-recovery','Furious Gaming Community','FranchiseHQ','recovery-league',
        'active','enabled','America/Chicago'
      );
    database.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
        'season-recovery','league-recovery','ea-madden-companion','742482','1',
        'Madden NFL 27','Recovery Season',2026,'active'
      );
    database.prepare(`INSERT INTO league_game_years
      (id,league_id,game_release,edition_year,display_name,status)
      VALUES (?,?,?,?,?,'active')`).run(
        'game-year-recovery','league-recovery','Madden NFL 27',27,'Madden NFL 27'
      );
    database.prepare(`INSERT INTO madden_discovery_sessions
      (id,league_id,token_hash,status,expires_at,created_at,updated_at)
      VALUES (?,?,?,'review_required',?,?,?)`).run(
        'shattered-source','league-recovery','shattered-source-token',
        '2099-01-01T00:00:00.000Z','2026-08-30T21:33:47.800Z','2026-08-30T21:33:50.000Z'
      );

    const captures=liveLikeRosterCaptureSet().filter(item=>!item.routePath.endsWith('/league'));
    const firstRoster=captures.find(item=>/\/team\/[^/]+\/roster$/.test(item.routePath));
    firstRoster.payload.rosterInfoList.pop();
    const scheduleCapture=captures.find(item=>item.routePath.endsWith('/schedules'));
    scheduleCapture.routePath='xbsx/742482/week/reg/9/schedules';
    const passingCapture=captures.find(item=>item.routePath.endsWith('/passing'));
    passingCapture.routePath='xbsx/742482/week/reg/9/passing';
    const weeklyStatistics=['receiving','defense','punting','rushing','kicking','team'];
    for (let index=0; index<weeklyStatistics.length; index+=1) captures.push(capture(
      `xbsx/742482/week/reg/9/${weeklyStatistics[index]}`,
      {playerReceivingStatInfoList:[{rosterId:`player-${index+1}`,teamId:`team-${index+1}`,weekIndex:8}]},
      3_810+index
    ));
    assert.equal(captures.length,43);
    const binding=d1(database),r2=memoryR2();
    for (let index=0; index<captures.length; index+=1) {
      const item=captures[index];
      const id=`recovery-capture-${index}`;
      const key=`recovery/${id}.json`;
      const encoded=new TextEncoder().encode(JSON.stringify(item.payload));
      await r2.put(key,encoded.buffer);
      database.prepare(`INSERT INTO companion_route_captures
        (id,league_id,discovery_session_id,route_path,request_method,content_type,byte_length,
         payload_hash,r2_object_key,top_level_keys_json,collections_json,request_headers_json,received_at)
        VALUES (?,?,?,?,'POST','application/json',?,?,?,?,?,?,?)`).run(
          id,'league-recovery','shattered-source',item.routePath,encoded.byteLength,
          `recovery-hash-${index}`,key,'[]','[]','{}',item.receivedAt
        );
      database.prepare(`INSERT INTO madden_discovery_session_captures
        (league_id,session_id,capture_id,route_path,observed_at) VALUES (?,?,?,?,?)`).run(
          'league-recovery','shattered-source',id,item.routePath,item.receivedAt
        );
    }
    const first=captures.map(item=>item.receivedAt).sort()[0];
    const last=captures.map(item=>item.receivedAt).sort().at(-1);
    const recovered=await recoverMaddenDiscoveryCohort({
      db:binding,env:{COMPANION_EXPORTS:r2},leagueId:'league-recovery',
      leagueName:'Furious Gaming Community',firstReceivedAt:first,lastReceivedAt:last,
      expectedCaptureCount:43
    });
    assert.equal(recovered.summary.captures,43);
    assert.equal(recovered.summary.teamRosters,32);
    assert.equal(recovered.readiness.ready,true);
    assert.equal(recovered.readiness.freeAgentStatus,'blocked');
    assert.equal(recovered.readiness.freeAgentCount,null);
    const report=database.prepare(`SELECT requirement_results_json,source_verification_json
      FROM madden_discovery_reports WHERE id=?`).get(recovered.reportId);
    const requirements=JSON.parse(report.requirement_results_json);
    assert.equal(requirements.teams.recordCount,32);
    assert.equal(requirements.players.recordCount,2043);
    assert.equal(requirements.statistics.routes.length,7);
    assert.equal(JSON.parse(report.source_verification_json).passed,true);
    const endpoint=database.prepare(`SELECT * FROM companion_league_export_endpoints
      WHERE league_id='league-recovery'`).get();
    assert.equal(endpoint.latest_session_id,recovered.sessionId);
    assert.equal(endpoint.latest_report_id,recovered.reportId);
    assert.equal(endpoint.latest_ready_report_id,recovered.reportId);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM madden_discovery_session_captures
      WHERE session_id=?`).get(recovered.sessionId).count,43);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM league_active_snapshots`).get().count,0);
    assert.equal(database.prepare('PRAGMA foreign_key_check').all().length,0);
  } finally {
    database.close();
  }
});
