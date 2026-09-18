import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileSnapshotCounts, recoveryEvidenceInsert } from '../../tools/run-recovery-drill.mjs';
import { canonicalDataStatus, canonicalLeagueContext } from '../../functions/_lib/league-context.js';

test('the active snapshot is the canonical season and week authority', () => {
  const context=canonicalLeagueContext(
    {id:'league-test',current_season:2027,current_week:1},
    {id:'snapshot-week-2',season_year:2027,manifest_json:JSON.stringify({currentPeriod:{stage:'regular-season',week:2}})}
  );
  assert.equal(context.snapshotId,'snapshot-week-2');
  assert.equal(context.seasonYear,2027);
  assert.equal(context.week,2);
  assert.equal(context.state,'stale');
  assert.equal(context.configurationAligned,false);
  assert.equal(canonicalDataStatus(context,{}, {teams:32,players:2046,games:272,statistics:100,standings:32}).code,'stale');
});

test('empty and incomplete canonical status remain explicit', () => {
  const empty=canonicalLeagueContext({id:'league-test'},null);
  assert.equal(canonicalDataStatus(empty).code,'empty');
  const live=canonicalLeagueContext(
    {id:'league-test',current_season:2027,current_week:2},
    {id:'snapshot-week-2',season_year:2027,manifest_json:JSON.stringify({currentPeriod:{stage:'regular-season',week:2}})}
  );
  assert.equal(canonicalDataStatus(live,{status:'failed'}, {teams:32,players:2046,games:272,statistics:100,standings:32}).code,'incomplete');
});

test('recovery reconciliation detects a snapshot-domain failure before restore authority is considered', () => {
  const expected={teams:32,players:2046,games:272,statistics:100,standings:32};
  assert.deepEqual(reconcileSnapshotCounts(expected,{...expected}),{verified:true,mismatches:[]});
  assert.deepEqual(reconcileSnapshotCounts(expected,{...expected,games:271}),{
    verified:false,mismatches:[{domain:'games',expected:272,actual:271}]
  });
});

test('recovery evidence is tenant-scoped and contains no restore statement', () => {
  const sql=recoveryEvidenceInsert({
    id:'recovery-test',leagueId:'league-test',release:'7.5.9',environment:'production',
    evidenceType:'reconciliation',status:'verified',databaseBookmark:'bookmark-test',schemaVersion:44,
    activeSnapshotId:'snapshot-test',protectedCounts:{leagues:1},reconciliation:{verified:true,mismatches:[]},
    requestId:'req-test',actionId:'act-test',verifiedAt:'2026-09-18T00:00:00.000Z'
  });
  assert.match(sql,/INSERT INTO league_recovery_evidence/);
  assert.match(sql,/league-test/);
  assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE|RESTORE|DROP)\b/i);
});
