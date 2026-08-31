import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';
import { hashToken } from '../../functions/_lib/auth.js';
import { onRequestPost as candidateImport } from '../../functions/api/leagues/[leagueSlug]/companion/candidate-import.js';
import {
  CANDIDATE_IMPORT_PHASES,
  candidateCoverageWarnings,
  candidateCompleteness,
  candidateHistoryCarryForward,
  candidateProgress,
  candidateRetryGuidance,
  candidateSourceCoverage,
  nextCandidatePhase
} from '../../functions/_lib/candidate-import.js';

function d1(database) {
  const statement = (sql, values = []) => ({
    sql,
    values,
    bind(...next) { return statement(sql,next); },
    async first() { return database.prepare(sql).get(...values) || null; },
    async all() { return { results:database.prepare(sql).all(...values) }; },
    async run() {
      const result=database.prepare(sql).run(...values);
      return { meta:{ changes:Number(result.changes||0) } };
    }
  });
  return {
    prepare:sql=>statement(sql),
    async batch(statements) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const results=[];
        for(const item of statements)results.push(await item.run());
        database.exec('COMMIT');
        return results;
      } catch(error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

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

test('Week 9 source coverage is explicit and gaps after the active snapshot are never hidden', () => {
  const report={
    sourceMarkers:{week:{expected:'9',observed:['9']}},
    datasetInventory:[
      {datasetType:'schedule',routePath:'xbsx/742482/week/reg/9/schedules'},
      {datasetType:'statistics',routePath:'xbsx/742482/week/reg/9/passing'},
      {datasetType:'statistics',routePath:'xbsx/742482/week/reg/9/defense'}
    ]
  };
  const gap=candidateSourceCoverage(report,7);
  assert.equal(gap.currentWeek,9);
  assert.equal(gap.currentWeekStatus,'covered');
  assert.equal(gap.continuityStatus,'gap-detected');
  assert.deepEqual(gap.missingWeeks,[8]);
  assert.deepEqual(candidateCoverageWarnings(gap),[
    'Week coverage gap after active Week 7: missing Week 8.'
  ]);

  const continuous=candidateSourceCoverage({
    ...report,
    datasetInventory:[
      {datasetType:'schedule',routePath:'xbsx/742482/week/reg/8/schedules'},
      {datasetType:'statistics',routePath:'xbsx/742482/week/reg/8/passing'},
      ...report.datasetInventory
    ]
  },7);
  assert.equal(continuous.continuityStatus,'continuous');
  assert.deepEqual(continuous.missingWeeks,[]);
});

test('a Week 9 candidate carries older active history forward without overriding fresh records', () => {
  const fresh=[
    {external_id:'game-week-9',week_index:9,status:'completed'},
    {external_id:'game-week-7',week_index:7,status:'completed',home_score:31}
  ];
  const prior=[
    {external_id:'game-week-7',data_json:JSON.stringify({external_id:'game-week-7',week_index:7,status:'scheduled'})},
    {external_id:'game-week-6',data_json:JSON.stringify({external_id:'game-week-6',week_index:6,status:'completed'})},
    {external_id:'game-week-9-old',data_json:JSON.stringify({external_id:'game-week-9-old',week_index:9,status:'scheduled'})}
  ];
  const merged=candidateHistoryCarryForward(fresh,prior,{keyName:'external_id',currentWeek:9});
  assert.equal(merged.retained,1);
  assert.deepEqual(merged.retainedWeeks,[6]);
  assert.equal(merged.records.length,3);
  assert.equal(merged.records.find(row=>row.external_id==='game-week-7').home_score,31);
  assert.equal(merged.records.some(row=>row.external_id==='game-week-9-old'),false);
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
    run.run('candidate-3','league-1','destination-1','capture-1','new-report:identity:destination','running','commissioner-1');
    assert.equal(db.prepare(`SELECT COUNT(*) count FROM companion_candidate_import_runs`).get().count,2);
    assert.equal(db.prepare(`SELECT season_year FROM franchise_seasons WHERE id='season-2026'`).get().season_year,2026);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
    assert.throws(()=>db.prepare(`DELETE FROM franchise_seasons WHERE id='season-2026'`).run(),/FOREIGN KEY constraint failed/i);
  }finally{db.close()}
});

test('one finalize request atomically publishes the exact validated snapshot and is idempotent', async () => {
  const sqlite=await database();
  try{
    sqlite.prepare(`INSERT INTO league_memberships
      (id,league_id,user_id,role,active) VALUES (?,?,?,?,1)`)
      .run('membership-1','league-1','commissioner-1','commissioner');
    const token='candidate-live-session';
    sqlite.prepare(`INSERT INTO sessions
      (id,user_id,session_token_hash,expires_at) VALUES (?,?,?,?)`)
      .run('session-1','commissioner-1',await hashToken(token),'2099-01-01T00:00:00.000Z');
    sqlite.prepare(`INSERT INTO league_game_years
      (id,league_id,game_release,edition_year,display_name,status) VALUES (?,?,?,?,?,'active')`)
      .run('game-year-27','league-1','Madden NFL 27',27,'Madden NFL 27');
    sqlite.prepare(`INSERT INTO game_year_franchise_seasons
      (game_year_id,league_id,franchise_season_id) VALUES (?,?,?)`)
      .run('game-year-27','league-1','season-2026');
    sqlite.prepare(`INSERT INTO companion_import_destinations
      (id,league_id,franchise_season_id,label,status,created_by_user_id,game_year_id)
      VALUES (?,?,?,?,?,?,?)`)
      .run('destination-live','league-1','season-2026','Madden 27 live imports','active','commissioner-1','game-year-27');
    sqlite.prepare(`INSERT INTO madden_discovery_reports
      (id,league_id,session_id,status,route_count,capture_count,total_bytes,source_markers_json,
       source_verification_json,dataset_inventory_json,field_inventory_json,relationship_inventory_json,
       requirement_results_json,free_agent_evidence_json,sanitized_fixture_json,report_hash)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        'report-week-9','league-1','capture-1','passed',43,43,1000,'{"week":{"expected":"9","observed":["9"]}}',
        '{}','[]','{}','{}','{"teams":{"recordCount":32},"players":{"recordCount":2043}}',
        '{"status":"blocked","recordCount":null}','{}','week-9-report-hash'
      );
    const snapshot=sqlite.prepare(`INSERT INTO league_snapshots
      (id,league_id,status,season_year,week_index,team_count,player_count,game_count,statistic_count,
       standing_count,warnings_json,manifest_json,validation_status,validation_error_count)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    snapshot.run('snapshot-week-7','league-1','active',2026,7,32,2044,14,510,32,'[]','{}','ready',0);
    snapshot.run('snapshot-week-9','league-1','validated',2026,9,32,2043,20,900,32,'["Week 8 missing"]','{}','ready',0);
    sqlite.prepare(`INSERT INTO league_active_snapshots
      (league_id,snapshot_id,activated_by) VALUES (?,?,?)`).run('league-1','snapshot-week-7','commissioner-1');
    const gameYearSnapshot=sqlite.prepare(`INSERT INTO game_year_snapshots
      (game_year_id,league_id,snapshot_id,snapshot_status) VALUES (?,?,?,?)`);
    gameYearSnapshot.run('game-year-27','league-1','snapshot-week-7','active');
    gameYearSnapshot.run('game-year-27','league-1','snapshot-week-9','candidate');
    sqlite.prepare(`INSERT INTO companion_candidate_import_runs
      (id,league_id,destination_id,discovery_session_id,source_fingerprint,status,completeness_status,
       current_phase,phase_index,result_counts_json,warnings_json,candidate_snapshot_id,
       active_snapshot_id_before,created_by_user_id)
      VALUES (?,?,?,?,?,'preview-ready','rostered-players-only','preview-ready',8,?,?,?,?,?)`).run(
        'candidate-week-9','league-1','destination-live','capture-1','week-9-fingerprint','{}',
        '["Week coverage gap after active Week 7: missing Week 8."]','snapshot-week-9','snapshot-week-7','commissioner-1'
      );
    const binding=d1(sqlite);
    const invoke=()=>candidateImport({
      request:new Request('https://franchisehq.app/api/leagues/fgc/companion/candidate-import',{
        method:'POST',headers:{'content-type':'application/json',cookie:`franchise_hq_session=${token}`},
        body:JSON.stringify({action:'finalize',runId:'candidate-week-9',durationMs:45000})
      }),
      params:{leagueSlug:'fgc'},env:{DB:binding,FRANCHISE_HQ_DB:binding}
    });
    let response=await invoke();
    assert.equal(response.status,200);
    let payload=await response.json();
    assert.equal(payload.run.activationPerformed,true);
    assert.equal(payload.run.activeSnapshotChanged,true);
    assert.equal(sqlite.prepare(`SELECT snapshot_id FROM league_active_snapshots WHERE league_id='league-1'`).get().snapshot_id,'snapshot-week-9');
    assert.deepEqual(sqlite.prepare(`SELECT id,status FROM league_snapshots ORDER BY id`).all().map(row=>({...row})),[
      {id:'snapshot-week-7',status:'archived'},
      {id:'snapshot-week-9',status:'active'}
    ]);
    const counts=JSON.parse(sqlite.prepare(`SELECT result_counts_json FROM companion_candidate_import_runs WHERE id='candidate-week-9'`).get().result_counts_json);
    assert.equal(counts.freeAgentStatus,'blocked');
    assert.equal(counts.freeAgentCount,null);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM tenant_audit_events WHERE action='companion.live_import.activate'`).get().count,1);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM league_snapshot_lifecycle_events WHERE event_type='import-activated'`).get().count,1);
    response=await invoke();
    assert.equal(response.status,200);
    payload=await response.json();
    assert.equal(payload.run.activationPerformed,true);
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM tenant_audit_events WHERE action='companion.live_import.activate'`).get().count,1);
    assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{sqlite.close()}
});

test('commissioner live import activates only its validated candidate and never resets, prunes, or reinterprets Free Agents', async () => {
  const [candidate,builder,lifecycle,ui,worker,job,report,reportHelper,classifier,statistics]=await Promise.all([
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/candidate-import.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/build-snapshot.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/snapshot-lifecycle.js',import.meta.url),'utf8'),
    readFile(new URL('../../league-engine/one-click-import.js',import.meta.url),'utf8'),
    readFile(new URL('../../workers/franchise-import-worker/src/index.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/import-job.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/discovery-report.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/_lib/madden-discovery-report.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/classify.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/map-statistics.js',import.meta.url),'utf8')
  ]);
  assert.match(candidate,/requireCommissioner\(context\)/);
  assert.doesNotMatch(candidate,/requirePlatformOwner/);
  assert.match(candidate,/freeAgentCount:\['located','empty-confirmed'\]/);
  assert.match(candidate,/captureDigest/);
  assert.match(candidate,/payload_hash/);
  assert.match(candidate,/runForSource/);
  assert.match(candidate,/destination_id=\? AND source_fingerprint=\?/);
  assert.match(candidate,/selectionStatus:run \? 'existing-source' : 'new-source'/);
  assert.match(candidate,/reportForSession/);
  assert.match(candidate,/active snapshot changed during candidate import/i);
  assert.match(candidate,/INSERT INTO league_active_snapshots/);
  assert.match(candidate,/COALESCE\(\(SELECT snapshot_id FROM league_active_snapshots WHERE league_id=\?\),''\)=\?/);
  assert.match(candidate,/companion\.live_import\.activate/);
  assert.match(candidate,/freeAgentInterpretedAsZero:false/);
  assert.doesNotMatch(candidate,/DELETE\s+FROM/i);

  assert.match(builder,/mode:'non-destructive'/);
  assert.match(builder,/candidateImportRunId/);
  assert.match(builder,/exact analyzed discovery session/);
  assert.match(builder,/madden_discovery_session_captures/);
  assert.match(builder,/historyCarryForward/);
  assert.match(builder,/candidateCoverageWarnings/);
  assert.match(builder,/domain IN \('games','statistics'\)/);
  assert.doesNotMatch(builder,/DELETE\s+FROM/i);
  assert.doesNotMatch(builder,/(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?league_active_snapshots/i);

  assert.match(lifecycle,/\['activate','rollback'\]\.includes\(action\)/);
  assert.match(lifecycle,/requirePlatformOwner\(context\)/);
  for(const source of [ui,worker]){
    assert.doesNotMatch(source,/action\s*:\s*['"]activate['"]/);
    assert.doesNotMatch(source,/activate-snapshot|verify-active-snapshot/);
    assert.doesNotMatch(source,/storage-preflight|data-reset|demo fallback|local fallback/i);
    assert.match(source,/candidate-import/);
    assert.match(source,/activationPerformed:true/);
  }
  assert.doesNotMatch(ui,/Create Private Destination/);
  assert.match(ui,/One-Click Live Import/);
  assert.match(ui,/Atomic safety/);
  assert.match(ui,/Import Latest Export/);
  assert.match(ui,/Latest Export Live/);
  assert.match(ui,/Make Import Live/);
  assert.match(ui,/Active \/ captured week/);
  assert.match(ui,/under 60 seconds/);
  assert.match(ui,/Free Agent count is unknown, never zero/);
  assert.match(ui,/discoverySessionId/);
  assert.match(job,/15\*60\*1000/);
  assert.doesNotMatch(job,/x-franchisehq-platform-owner-account-id/);

  // Production cold-path remediation reuses only exact immutable source-lock
  // evidence, bounds R2 concurrency, and reduces D1/HTTP round trips.
  assert.match(report,/body\.reuseExisting === true/);
  assert.match(reportHelper,/retained\.generated_at/);
  assert.match(reportHelper,/newestObservedAt/);
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
