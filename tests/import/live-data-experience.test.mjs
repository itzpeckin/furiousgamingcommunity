import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  MADDEN_RATING_FIELDS,
  freeAgentStateFromMappingRun,
  safeAbilityValues,
  safeRatingValues,
  sourceRosterStatus,
  sourceSupportedContract
} from '../../functions/_lib/live-data-experience.js';
import { normalizePlayer } from '../../functions/api/leagues/[leagueSlug]/snapshot/read-model.js';

test('all source-supported Madden ratings survive the member read model and unknown fields do not', () => {
  const source=Object.fromEntries(MADDEN_RATING_FIELDS.map((field,index)=>[field,45+(index%55)]));
  source.internalScoutingGrade=99;
  source.invalidRating=101;
  const ratings=safeRatingValues(source);
  assert.equal(Object.keys(ratings).length,MADDEN_RATING_FIELDS.length);
  assert.deepEqual(Object.keys(ratings),[...MADDEN_RATING_FIELDS]);
  assert.equal('internalScoutingGrade' in ratings,false);
});

test('public ability DTO retains display facts and excludes internal Madden identifiers', () => {
  const abilities=safeAbilityValues({signatureSlotList:[{
    isEmpty:false,locked:false,ovrThreshold:85,
    signatureAbility:{signatureTitle:'Deep Out Elite',signatureDescription:'Improved catching on deep outside passes.',rank:2,isUnlocked:true,abilityGUID:'private-guid',activationId:'private-id'}
  }]});
  assert.deepEqual(abilities,[{title:'Deep Out Elite',description:'Improved catching on deep outside passes.',rank:'2',threshold:85,unlocked:true}]);
  assert.equal(JSON.stringify(abilities).includes('private-guid'),false);
  assert.equal(JSON.stringify(abilities).includes('activationId'),false);
});

test('contract DTO uses documented Madden units and does not manufacture current-year splits', () => {
  const contract=sourceSupportedContract({contractYearsLeft:3,contractLength:5,contractSalary:72500000,contractBonus:18000000,sourceCapHit:14350,capReleaseNetSavings:5150,capReleasePenalty:9200});
  assert.equal(contract.yearsRemaining,3);
  assert.equal(contract.length,5);
  assert.equal(contract.totalSalary,72500000);
  assert.equal(contract.totalBonus,18000000);
  assert.equal(contract.capHit,14350000);
  assert.equal(contract.releaseNetSavings,5150000);
  assert.equal(contract.releasePenalty,9200000);
  assert.equal(contract.currentYearSalary,null);
  assert.equal(contract.currentYearBonus,null);
});

test('roster state is source-derived for active, injured reserve, practice squad, and Free Agents', () => {
  assert.equal(sourceRosterStatus({},'team-1'),'active');
  assert.equal(sourceRosterStatus({isOnIR:true},'team-1'),'injured-reserve');
  assert.equal(sourceRosterStatus({isOnPracticeSquad:true},'team-1'),'practice-squad');
  assert.equal(sourceRosterStatus({isFreeAgent:true},''),'free-agent');
});

test('blocked Free Agents remain unknown and only an unblocked explicit zero is empty-confirmed', () => {
  const blocked=freeAgentStateFromMappingRun({free_agent_count:0,warnings_json:JSON.stringify(['Player mapper reported 1 warning.','Free Agent roster was captured but is blocked: Export error: Failed to retrieve team roster.'])});
  assert.equal(blocked.status,'blocked');
  assert.equal(blocked.count,null);
  assert.equal(blocked.interpretedAsZero,false);
  assert.match(blocked.reason,/Free Agent roster/i);
  const empty=freeAgentStateFromMappingRun({free_agent_count:0,warnings_json:'[]'});
  assert.equal(empty.status,'empty-confirmed');
  assert.equal(empty.count,0);
});

test('normalized player exposes every approved rating, ability, contract, and source roster state without raw export fields', () => {
  const sourceRatings=Object.fromEntries(MADDEN_RATING_FIELDS.map(field=>[field,88]));
  const player=normalizePlayer({
    external_id:'player-27',team_external_id:'team-27',display_name:'Source Player',position:'WR',overall:91,
    source_record_json:JSON.stringify({...sourceRatings,contractYearsLeft:2,contractLength:4,contractSalary:48000000,contractBonus:12000000,capHit:8750,isOnIR:true,privateExportToken:'secret',signatureSlotList:[{isEmpty:false,locked:false,ovrThreshold:90,signatureAbility:{signatureTitle:'Route Technician',signatureDescription:'Sharper cuts.',rank:1,isUnlocked:true,abilityGUID:'hidden'}}]})
  });
  assert.equal(Object.keys(player.ratings).length,MADDEN_RATING_FIELDS.length);
  assert.equal(player.abilities[0].title,'Route Technician');
  assert.equal(player.contract.capHit,8750000);
  assert.equal(player.contract.currentYearSalary,null);
  assert.equal(player.rosterStatus,'injured-reserve');
  assert.equal(JSON.stringify(player).includes('privateExportToken'),false);
  assert.equal(JSON.stringify(player).includes('abilityGUID'),false);
});

test('browser and endpoint source contracts bind Free Agents and paging to the active snapshot', async () => {
  const [app,endpoint,readModel,styles]=await Promise.all([
    readFile(new URL('../../app.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/players/free-agents.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/snapshot/read-model.js',import.meta.url),'utf8'),
    readFile(new URL('../../styles.css',import.meta.url),'utf8')
  ]);
  assert.equal(app.includes('/players/free-agents'),false);
  assert.deepEqual(MADDEN_RATING_FIELDS.filter(field=>!app.includes(field)),[]);
  assert.equal(app.includes('filtered.slice(0,500)'),false);
  assert.ok(app.includes('data-player-pagination'));
  assert.ok(app.includes('This is not zero.'));
  assert.ok(app.includes("if(liveTeamDirectory?.snapshot) return null"));
  assert.ok(endpoint.includes("mode:'active-snapshot'"));
  assert.equal(endpoint.includes('COMPANION_EXPORTS'),false);
  assert.equal(endpoint.includes('companion_route_captures'),false);
  assert.ok(readModel.includes('freeAgents'));
  assert.ok(readModel.includes('integrity'));
  assert.ok(styles.includes('FranchiseHQ 7.3.5.1 — authoritative live-data experience'));
  assert.ok(styles.includes("wrapper.dataset.verticalScroll='page'")||app.includes("wrapper.dataset.verticalScroll='page'"));
});

test('Production player-card and Trade Center adapters preserve ratings and contract units', async () => {
  const appSource = await readFile(new URL('../../app.js',import.meta.url),'utf8');
  assert.match(appSource, /ratings:\{\.\.\.\(player\?\.ratings\|\|raw\.ratings\|\|\{\}\),\.\.\.corePlayerRatings\(raw,player\?\.ratings\|\|raw\.ratings\|\|\{\}\)\}/);
  assert.match(appSource, /function tradeCalculatorMillions\(value\)/);
  assert.match(appSource, /salary:tradeCalculatorMillions\(view\.salary\)/);
  assert.match(appSource, /capHit:tradeCalculatorMillions\(view\.capHit\)/);
  assert.match(appSource, /salary:tradeCalculatorMillions\(player\.salary\)/);
  assert.match(appSource, /capHit:tradeCalculatorMillions\(player\.capHit\)/);
  assert.match(appSource, /franchisehq:trade-live-cache:v2/);
});

test('global league shell is hydrated from the active snapshot instead of static mock context', async () => {
  const [appSource,indexSource] = await Promise.all([
    readFile(new URL('../../app.js',import.meta.url),'utf8'),
    readFile(new URL('../../index.html',import.meta.url),'utf8')
  ]);
  assert.match(indexSource, /data-active-league-context>Loading active Madden data/);
  assert.match(indexSource, /data-live-week-chip/);
  assert.doesNotMatch(indexSource, /Season 4 · Week 8 · Mock Data/);
  assert.match(appSource, /applyActiveSnapshotShell\(snapshotValue,currentContext\)/);
  assert.match(appSource, /Live Madden Data/);
});
