import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';
import {
  CANDIDATE_IMPORT_PHASES,
  candidateCompleteness,
  candidateProgress,
  candidateRetryGuidance,
  nextCandidatePhase
} from '../../functions/_lib/candidate-import.js';

async function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  const files=(await walkFiles()).filter(file=>/^migrations\/\d+_.+\.sql$/.test(file)).sort();
  for(const file of files)db.exec(await readFile(path.join(ROOT,file),'utf8'));
  db.prepare(`INSERT INTO leagues (id,name,product_name,slug,public_status,tenant_status,timezone)
    VALUES (?,?,?,?,?,?,?)`).run('league-1','FGC','FranchiseHQ','fgc','active','enabled','America/Chicago');
  db.prepare(`INSERT INTO users (id,discord_user_id,discord_username,display_name)
    VALUES (?,?,?,?)`).run('commissioner-1','discord-1','commissioner','Commissioner');
  db.prepare(`INSERT INTO franchise_seasons
    (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year)
    VALUES (?,?,?,?,?,?,?,?)`).run(
      'season-2026','league-1','ea-madden-companion','742482','1','Madden NFL 27','FGC Madden 27 · Season 1',2026
    );
  db.prepare(`INSERT INTO madden_discovery_sessions
    (id,league_id,token_hash,status,expires_at,opened_by_user_id)
    VALUES (?,?,?,?,?,?)`).run(
      'capture-1','league-1','capture-token-hash','review_required','2099-01-01T00:00:00.000Z','commissioner-1'
    );
  return db;
}

test('candidate phase contract is bounded, measurable, and retryable', () => {
  assert.deepEqual(CANDIDATE_IMPORT_PHASES, [
    'analyze-source','classify-captures','map-teams','map-players','map-schedule',
    'map-statistics','build-candidate','validate-candidate','preview-ready'
  ]);
  assert.equal(nextCandidatePhase('map-players'),'map-schedule');
  assert.equal(nextCandidatePhase('preview-ready'),null);
  assert.equal(candidateProgress(0,'running'),0);
  assert.equal(candidateProgress(4,'running'),50);
  assert.equal(candidateProgress(8,'preview-ready'),100);
  assert.deepEqual(candidateRetryGuidance('map-statistics','Route failed'),{
    safeToRetry:true,resumeFromPhase:'map-statistics',message:'Route failed',activeSnapshotPreserved:true
  });
});

test('blocked or missing Free Agents remain rostered-player-only, never zero', () => {
  assert.equal(candidateCompleteness('blocked'),'rostered-players-only');
  assert.equal(candidateCompleteness('missing'),'rostered-players-only');
  assert.equal(candidateCompleteness('empty-confirmed'),'complete');
  assert.equal(candidateCompleteness('located'),'complete');
});

test('one private destination and one idempotent candidate run are enforced per source fingerprint', async () => {
  const db=await database();
  try{
    const destination=db.prepare(`INSERT INTO companion_import_destinations
      (id,league_id,franchise_season_id,label,created_by_user_id) VALUES (?,?,?,?,?)`);
    destination.run('destination-1','league-1','season-2026','2026 private candidate','commissioner-1');
    assert.throws(()=>destination.run(
      'destination-2','league-1','season-2026','Duplicate destination','commissioner-1'
    ),/UNIQUE constraint failed/i);

    const run=db.prepare(`INSERT INTO companion_candidate_import_runs
      (id,league_id,destination_id,discovery_session_id,source_fingerprint,status,created_by_user_id)
      VALUES (?,?,?,?,?,?,?)`);
    run.run('candidate-1','league-1','destination-1','capture-1','report:identity:destination','running','commissioner-1');
    assert.throws(()=>run.run(
      'candidate-2','league-1','destination-1','capture-1','report:identity:destination','running','commissioner-1'
    ),/UNIQUE constraint failed/i);
    assert.equal(db.prepare(`SELECT season_year FROM franchise_seasons WHERE id='season-2026'`).get().season_year,2026);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
    assert.throws(()=>db.prepare(`DELETE FROM franchise_seasons WHERE id='season-2026'`).run(),/FOREIGN KEY constraint failed/i);
  }finally{db.close()}
});

test('commissioner candidate paths cannot activate, reset, prune, or reinterpret Free Agents', async () => {
  const [candidate,builder,lifecycle,ui,worker,job,report,classifier,statistics]=await Promise.all([
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/candidate-import.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/build-snapshot.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/snapshot-lifecycle.js',import.meta.url),'utf8'),
    readFile(new URL('../../league-engine/one-click-import.js',import.meta.url),'utf8'),
    readFile(new URL('../../workers/franchise-import-worker/src/index.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/import-job.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/discovery-report.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/classify.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/map-statistics.js',import.meta.url),'utf8')
  ]);
  assert.match(candidate,/requireCommissioner\(context\)/);
  assert.doesNotMatch(candidate,/requirePlatformOwner/);
  assert.match(candidate,/freeAgentCount:\['located','empty-confirmed'\]/);
  assert.match(candidate,/captureDigest/);
  assert.match(candidate,/payload_hash/);
  assert.match(candidate,/active snapshot changed during candidate import/i);
  assert.doesNotMatch(candidate,/(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?league_active_snapshots/i);

  assert.match(builder,/mode:'non-destructive'/);
  assert.match(builder,/candidateImportRunId/);
  assert.match(builder,/exact analyzed discovery session/);
  assert.match(builder,/madden_discovery_session_captures/);
  assert.doesNotMatch(builder,/DELETE\s+FROM/i);
  assert.doesNotMatch(builder,/(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?league_active_snapshots/i);

  assert.match(lifecycle,/\['activate','rollback'\]\.includes\(action\)/);
  assert.match(lifecycle,/requirePlatformOwner\(context\)/);
  for(const source of [ui,worker]){
    assert.doesNotMatch(source,/action\s*:\s*['"]activate['"]/);
    assert.doesNotMatch(source,/activate-snapshot|verify-active-snapshot/);
    assert.doesNotMatch(source,/storage-preflight|data-reset|demo fallback|local fallback/i);
    assert.match(source,/candidate-import/);
    assert.match(source,/activationPerformed:false/);
  }
  assert.match(ui,/Create Private Destination/);
  assert.match(ui,/Analyze Captured Export/);
  assert.match(ui,/under 60 seconds/);
  assert.match(ui,/Free Agent count is unknown, never zero/);
  assert.match(ui,/discoverySessionId/);
  assert.match(job,/15\*60\*1000/);
  assert.doesNotMatch(job,/x-franchisehq-platform-owner-account-id/);

  // Production cold-path remediation reuses only exact immutable source-lock
  // evidence, bounds R2 concurrency, and reduces D1/HTTP round trips.
  assert.match(report,/body\.reuseExisting === true/);
  assert.match(report,/reportGeneratedAt >= newestObservedAt/);
  assert.match(classifier,/INSPECTION_CONCURRENCY = 8/);
  assert.match(classifier,/reusedInspectionCount/);
  assert.match(classifier,/madden_discovery_session_captures/);
  assert.match(worker,/classify'\),'POST',\{discoverySessionId:context\.discoverySessionId\}/);
  assert.match(statistics,/RECORD_CHUNK_SIZE=200/);
  assert.match(statistics,/D1_LOOKUP_CHUNK_SIZE=75/);
  assert.match(statistics,/await db\.batch\(lookups\)/);
  assert.doesNotMatch(statistics,/\.slice\(0,100\)/);
  assert.match(statistics,/ROUTE_INSPECTION_CONCURRENCY=4/);
  assert.match(lifecycle,/Math\.min\(4,Number\(body\.batches\)/);
  assert.match(worker,/limit:500,batches:4/);
  assert.match(worker,/reuseExisting:true/);
});
