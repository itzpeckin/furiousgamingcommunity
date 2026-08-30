import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  deriveLeagueExportToken,
  leagueExportUrl,
  permanentExportPublicState,
  reportImportReadiness
} from '../../functions/_lib/permanent-league-export.js';

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

test('runtime wiring preserves immutable sources, snapshot isolation, and explicit rotation', async () => {
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
  assert.match(receiver,/generateMaddenDiscoveryReport/);
  assert.match(receiver,/analysis_requested_at IS NULL/);
  assert.match(receiver,/await hashToken\(`permanent:/);
  assert.doesNotMatch(receiver,/(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?league_active_snapshots/i);
  assert.match(management,/token_version=token_version\+1/);
  assert.match(management,/companion\.export_url\.rotate/);
  assert.match(candidate,/latest_ready_report_id/);
  assert.doesNotMatch(candidate,/(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?league_active_snapshots/i);
  assert.match(ui,/Copy League Export URL/);
  assert.match(ui,/Import Latest Export/);
  assert.match(ui,/Rotate Export URL/);
  assert.match(ui,/Free Agents remain blocked\/unknown/);
  assert.match(importer,/reuseExisting:true/);
  assert.match(transition,/companion_league_export_endpoints/);
});
