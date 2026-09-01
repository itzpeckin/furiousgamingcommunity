import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  deriveLeagueExportToken,
  leagueExportUrl,
  permanentExportPublicState,
  reportImportReadiness
} from '../../functions/_lib/permanent-league-export.js';
import {
  latestCapturePerRoute,
  partialCaptureRoutesCanStitch,
  partialReportsCanStitch,
  recoveryCohortSummary
} from '../../functions/_lib/madden-discovery-report.js';
import { automaticSessionFor } from '../../functions/api/leagues/[leagueSlug]/companion/export/[token]/[[datasetPath]].js';

function eligibleReport(freeAgentStatus='blocked') {
  const located = recordCount => ({status:'located',recordCount});
  return {
    id:'report-ready',
    sourceVerification:{passed:true},
    requirements:{
      teams:located(32),
      'team-rosters':located(32),
      players:{...located(2_044),assignmentEvidence:{canBuildRosteredPlayerPreview:true}},
      'free-agents':{status:freeAgentStatus,recordCount:0},
      standings:located(32),
      schedule:located(272),
      statistics:located(1_100)
    },
    freeAgentEvidence:{status:freeAgentStatus,recordCount:0}
  };
}

test('one league export credential is stable until its explicit version rotates', async () => {
  const first=await deriveLeagueExportToken('root-export-secret','league-1',1);
  const same=await deriveLeagueExportToken('root-export-secret','league-1',1);
  const rotated=await deriveLeagueExportToken('root-export-secret','league-1',2);
  const otherLeague=await deriveLeagueExportToken('root-export-secret','league-2',1);
  assert.equal(first,same);
  assert.notEqual(first,rotated);
  assert.notEqual(first,otherLeague);
  assert.equal(
    leagueExportUrl('https://franchisehq.app/other?query=1#hash','furious-gaming-community',first),
    `https://franchisehq.app/api/leagues/furious-gaming-community/companion/export/${first}`
  );
});

test('blocked Free Agents stay unknown while the 32-team roster source remains import-ready', () => {
  const blocked=reportImportReadiness(eligibleReport('blocked'));
  assert.deepEqual(blocked,{
    ready:true,
    completeness:'rostered-players-only',
    freeAgentStatus:'blocked',
    freeAgentCount:null
  });
  const partial=eligibleReport('blocked');
  partial.requirements.schedule={status:'missing',recordCount:0};
  assert.equal(reportImportReadiness(partial).ready,false);
  assert.equal(reportImportReadiness(partial).freeAgentCount,null);
});

test('explicit empty current-week statistics routes are ready but missing routes are not', () => {
  const advancedWeek=eligibleReport('blocked');
  advancedWeek.requirements.statistics={
    status:'empty',recordCount:0,routes:['xbsx/742482/week/reg/10/passing']
  };
  assert.equal(reportImportReadiness(advancedWeek).ready,true);
  advancedWeek.requirements.statistics.routes=[];
  assert.equal(reportImportReadiness(advancedWeek).ready,false);
});

test('repeated routes retain only the newest capture for one cohort', () => {
  const selected=latestCapturePerRoute([
    {id:'old-roster',route_path:'xbsx/742482/team/1/roster',session_observed_at:'2026-08-31T20:00:00.000Z'},
    {id:'schedule',route_path:'xbsx/742482/week/reg/10/schedules',session_observed_at:'2026-08-31T20:00:01.000Z'},
    {id:'new-roster',route_path:'XBSX/742482/team/1/roster',session_observed_at:'2026-08-31T20:00:02.000Z'}
  ]);
  assert.deepEqual(selected.map(row=>row.id),['schedule','new-roster']);
});

test('partial report stitching accepts one observed week and rejects cross-week mixing', () => {
  const markers=week=>JSON.stringify({
    sourceFranchiseId:{observed:['742482']},week:{observed:week===null?[]:[String(week)]},stage:{observed:week===null?[]:['reg']}
  });
  assert.equal(partialReportsCanStitch([
    {source_markers_json:markers(null)},
    {source_markers_json:markers(10)}
  ]),true);
  assert.equal(partialReportsCanStitch([
    {source_markers_json:markers(9)},
    {source_markers_json:markers(10)}
  ]),false);
  assert.equal(partialCaptureRoutesCanStitch([
    {route_path:'xbsx/742482/team/1/roster'},
    {route_path:'xbsx/742482/week/reg/10/passing'}
  ]),true);
  assert.equal(partialCaptureRoutesCanStitch([
    {route_path:'xbsx/742482/week/reg/9/passing'},
    {route_path:'xbsx/742482/week/reg/10/passing'}
  ]),false);
});

test('an incomplete newest report never replaces the retained ready source', () => {
  const receiving=permanentExportPublicState({
    endpoint:{status:'active'},latestSession:{capture_count:8},latestReport:null,readyReport:{id:'older-ready'}
  });
  assert.equal(receiving.status,'receiving');
  const review=permanentExportPublicState({
    endpoint:{status:'active'},latestSession:{capture_count:40},
    latestReport:{id:'new-partial'},readyReport:{id:'older-ready'}
  });
  assert.equal(review.status,'review-required');
  assert.equal(review.readyReportId,'older-ready');
  assert.equal(review.importAvailable,false);
});

test('a validated preview remains importable until its exact snapshot is live', () => {
  const validated=permanentExportPublicState({
    endpoint:{status:'active'},latestSession:{capture_count:43},
    latestReport:{id:'ready'},readyReport:{id:'ready'},
    candidateRun:{status:'preview-ready',candidate_snapshot_id:'week-9',active_snapshot_id_after:'week-7'}
  });
  assert.equal(validated.status,'ready');
  assert.equal(validated.importAvailable,true);
  assert.equal(validated.importLive,false);
  assert.equal(validated.importStatus,'preview-ready');

  const live=permanentExportPublicState({
    endpoint:{status:'active'},latestSession:{capture_count:43},
    latestReport:{id:'ready'},readyReport:{id:'ready'},
    candidateRun:{status:'preview-ready',candidate_snapshot_id:'week-9',active_snapshot_id_after:'week-9'}
  });
  assert.equal(live.importAvailable,false);
  assert.equal(live.importLive,true);
  assert.equal(live.importStatus,'live');
});

function concurrentCohortDatabase() {
  const endpoint = {
    league_id:'league-1',token_version:1,status:'active',latest_session_id:'previous-session',
    latest_session_token_version:1,last_received_at:'2026-08-30T20:00:00.000Z',
    updated_at:'2026-08-30T20:00:03.000Z',created_at:'2026-08-30T19:00:00.000Z'
  };
  const sessions = new Map([['previous-session',{
    id:'previous-session',league_id:'league-1',status:'review_required',
    last_capture_at:'2026-08-30T20:00:00.000Z',created_at:'2026-08-30T20:00:00.000Z'
  }]]);
  const prepare = sql => ({bind:(...args)=>({
    first:async()=>{
      if (sql.includes('FROM companion_league_export_endpoints')) return {...endpoint};
      if (sql.includes('FROM madden_discovery_sessions')) return {...(sessions.get(args.at(-1)) || null)};
      if (sql.includes('FROM league_game_years')) return {game_release:'Madden NFL 27'};
      if (sql.includes('FROM franchise_seasons')) return {source_season_id:'1'};
      throw new Error(`Unexpected first query: ${sql}`);
    },
    run:async()=>{
      if (sql.includes('INSERT OR IGNORE INTO madden_discovery_sessions')) {
        const [id,leagueId,tokenHash,gameRelease,leagueName,season,expiresAt,createdAt,updatedAt]=args;
        if (!sessions.has(id)) sessions.set(id,{
          id,league_id:leagueId,token_hash:tokenHash,status:'open',expected_game_release:gameRelease,
          expected_league_name:leagueName,expected_season:season,expires_at:expiresAt,created_at:createdAt,
          updated_at:updatedAt,capture_count:0
        });
        return {meta:{changes:1}};
      }
      if (sql.includes('UPDATE companion_league_export_endpoints SET')) {
        await Promise.resolve();
        const [id,tokenVersion,updatedAt,leagueId,expectedVersion,expectedSessionId]=args;
        const matches = endpoint.league_id === leagueId
          && endpoint.status === 'active'
          && Number(endpoint.token_version) === Number(expectedVersion)
          && (endpoint.latest_session_id || null) === (expectedSessionId || null);
        if (matches) Object.assign(endpoint,{
          latest_session_id:id,latest_session_token_version:tokenVersion,
          analysis_requested_at:null,updated_at:updatedAt
        });
        return {meta:{changes:matches ? 1 : 0}};
      }
      throw new Error(`Unexpected run query: ${sql}`);
    }
  })});
  return {prepare,endpoint,sessions};
}

test('43 concurrent Madden routes atomically claim one automatic cohort', async () => {
  const db=concurrentCohortDatabase();
  const league={id:'league-1',name:'Furious Gaming Community'};
  const supplied={...db.endpoint};
  const sessions=await Promise.all(Array.from({length:43},()=>automaticSessionFor(db,league,supplied)));
  assert.equal(new Set(sessions.map(session=>session.id)).size,1);
  assert.equal(db.sessions.size,2);
  assert.equal(db.endpoint.latest_session_id,sessions[0].id);
  assert.equal(sessions[0].status,'open');
});

test('a recent review-required cohort remains appendable across phased Madden exports', async () => {
  const db=concurrentCohortDatabase();
  const recent=new Date(Date.now()-5*60*1000).toISOString();
  Object.assign(db.sessions.get('previous-session'),{status:'review_required',last_capture_at:recent});
  Object.assign(db.endpoint,{last_received_at:recent,updated_at:recent});
  const session=await automaticSessionFor(db,{id:'league-1',name:'Furious Gaming Community'},{...db.endpoint});
  assert.equal(session.id,'previous-session');
  assert.equal(db.sessions.size,1);
});

test('the observed 43-route Production burst satisfies exact recovery structure', () => {
  const rows=[
    {id:'teams',route_path:'xbsx/742482/leagueteams'},
    {id:'free-agents',route_path:'xbsx/742482/freeagents/roster'},
    {id:'standings',route_path:'xbsx/742482/standings'},
    {id:'schedule',route_path:'xbsx/742482/week/reg/9/schedules'},
    ...Array.from({length:7},(_,index)=>({id:`stat-${index}`,route_path:`xbsx/742482/week/reg/9/stat-${index}`})),
    ...Array.from({length:32},(_,index)=>({id:`roster-${index}`,route_path:`xbsx/742482/team/${index+1}/roster`}))
  ];
  assert.deepEqual(recoveryCohortSummary(rows),{
    captures:43,teams:1,teamRosters:32,freeAgents:1,standings:1,schedule:1,statistics:7,other:0
  });
});

test('runtime wiring preserves immutable sources, atomic cohorts, snapshot isolation, and explicit recovery', async () => {
  const [migration,receiver,management,candidate,ui,importer,transition]=await Promise.all([
    readFile(new URL('../../migrations/0026_permanent_league_export_url.sql',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/export/[token]/[[datasetPath]].js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/export-url.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/companion/candidate-import.js',import.meta.url),'utf8'),
    readFile(new URL('../../league-engine/permanent-export-url.js',import.meta.url),'utf8'),
    readFile(new URL('../../league-engine/one-click-import.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/_lib/game-year-transition.js',import.meta.url),'utf8')
  ]);
  assert.match(migration,/CREATE TABLE companion_league_export_endpoints/);
  assert.match(migration,/AFTER INSERT ON leagues/);
  assert.match(migration,/latest_ready_report_id/);
  assert.match(migration,/latest_session_token_version/);
  assert.doesNotMatch(migration,/DELETE FROM/);
  assert.match(receiver,/deriveLeagueExportToken/);
  assert.match(receiver,/AUTOMATIC_ANALYSIS_IDLE_MS = 3_000/);
  assert.match(receiver,/afterPermanentCapture/);
  assert.match(receiver,/automaticCohortId/);
  assert.match(receiver,/latest_session_id IS \?/);
  assert.match(receiver,/generateMaddenDiscoveryReport/);
  assert.match(receiver,/analysis_requested_at IS NULL/);
  assert.match(receiver,/await hashToken\(`permanent:/);
  assert.doesNotMatch(receiver,/(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?league_active_snapshots/i);
  assert.match(management,/token_version=token_version\+1/);
  assert.match(management,/companion\.export_url\.rotate/);
  assert.match(management,/recover-cohort/);
  assert.match(management,/requirePlatformOwner/);
  assert.match(management,/expectedCaptureCount !== 43/);
  assert.doesNotMatch(management,/(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?league_active_snapshots/i);
  assert.match(candidate,/latest_ready_report_id/);
  assert.match(candidate,/INSERT INTO league_active_snapshots/);
  assert.match(candidate,/companion\.live_import\.activate/);
  assert.doesNotMatch(candidate,/DELETE\s+FROM/i);
  assert.match(ui,/Copy League Export URL/);
  assert.match(ui,/Import Latest Export/);
  assert.match(ui,/Latest Export Live/);
  assert.match(ui,/Rotate Export URL/);
  assert.match(ui,/routineWarning/);
  assert.match(ui,/counts\.freeAgentStatus\) \? count\(counts\.freeAgentCount\) : 'unknown'/);
  assert.match(importer,/reuseExisting:true/);
  assert.match(importer,/api\('classify','POST',\{discoverySessionId\}\)/);
  assert.doesNotMatch(importer,/api\('classify','POST',\{\}\)/);
  assert.match(transition,/companion_league_export_endpoints/);
});
