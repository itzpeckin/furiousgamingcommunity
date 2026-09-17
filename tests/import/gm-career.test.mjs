import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { buildGmSeasonSummaries, careerTotals, canonicalOwnershipStage, periodOwnsGame } from '../../functions/_lib/gm-career.js';
import { rehydrateFrozenGmSeasonRows } from '../../functions/_lib/gm-career-history.js';
import { normalizePosition } from '../../functions/api/leagues/[leagueSlug]/companion/map-players.js';
import { normalizePlayer } from '../../functions/api/leagues/[leagueSlug]/snapshot/read-model.js';

const season='season-2026';
const periods=[
  {gmIdentityId:'gm-justin',teamKey:'tb',franchiseSeasonId:season,startedStage:'preseason',startedWeek:1,endedStage:null,endedWeek:null},
  {gmIdentityId:'gm-gas',teamKey:'gb',franchiseSeasonId:season,startedStage:'preseason',startedWeek:1,endedStage:null,endedWeek:null}
];

test('reviewed ownership periods attribute games without Madden owner names',()=>{
  const games=[
    {id:'reg-1',franchiseSeasonId:season,stage:'regular-season',week:1,status:'final',homeTeamKey:'tb',awayTeamKey:'gb',homeScore:24,awayScore:17},
    {id:'playoff-1',franchiseSeasonId:season,stage:'playoffs',week:1,status:'final',homeTeamKey:'gb',awayTeamKey:'tb',homeScore:20,awayScore:27}
  ];
  const result=buildGmSeasonSummaries({games,periods,franchiseSeasonId:season});
  const justin=result.summaries.find(row=>row.gmIdentityId==='gm-justin');
  const gas=result.summaries.find(row=>row.gmIdentityId==='gm-gas');
  assert.deepEqual({wins:justin.regularWins,playoffWins:justin.playoffWins,titles:justin.superBowlChampionships,team:justin.teams[0]}, {wins:1,playoffWins:1,titles:1,team:'tb'});
  assert.deepEqual({losses:gas.regularLosses,playoffLosses:gas.playoffLosses,team:gas.teams[0]}, {losses:1,playoffLosses:1,team:'gb'});
  assert.equal(result.attributedGames.length,4);
  const totals=careerTotals([justin]);
  assert.equal(totals.playoffAppearances,1);
  assert.equal(totals.conferenceChampionships,1);
});

test('season and week scope prevents cross-season and post-transfer inference',()=>{
  const period={gmIdentityId:'gm-1',teamKey:'tb',franchiseSeasonId:season,startedStage:'regular-season',startedWeek:4,endedStage:'regular-season',endedWeek:7};
  assert.equal(periodOwnsGame(period,{franchiseSeasonId:season,stage:'regular-season',week:4}),true);
  assert.equal(periodOwnsGame(period,{franchiseSeasonId:season,stage:'regular-season',week:7}),false);
  assert.equal(periodOwnsGame(period,{franchiseSeasonId:'season-other',stage:'regular-season',week:5}),false);
});

test('Madden weeks after Week 18 are postseason for GM history even when retained as regular-season rows',()=>{
  assert.equal(canonicalOwnershipStage('regular-season',18),'regular-season');
  assert.equal(canonicalOwnershipStage('regular-season',19),'playoffs');
  const period={gmIdentityId:'gm-1',teamKey:'tb',franchiseSeasonId:season,startedStage:'preseason',startedWeek:1,endedStage:'regular-season',endedWeek:20};
  assert.equal(periodOwnsGame(period,{franchiseSeasonId:season,stage:'regular-season',week:19}),true);
  assert.equal(periodOwnsGame(period,{franchiseSeasonId:season,stage:'regular-season',week:20}),false);
});

test('postseason appearances do not require a completed score and playoff results stay out of the regular record',()=>{
  const games=[
    {id:'reg-18',franchiseSeasonId:season,stage:'regular-season',week:18,status:'final',homeTeamKey:'tb',awayTeamKey:'gb',homeScore:24,awayScore:17},
    {id:'wild-card',franchiseSeasonId:season,stage:'regular-season',week:19,status:'1',homeTeamKey:'tb',awayTeamKey:'gb',homeScore:0,awayScore:0},
    {id:'super-bowl',franchiseSeasonId:season,stage:'regular-season',week:23,status:'final',homeTeamKey:'tb',awayTeamKey:'gb',homeScore:27,awayScore:21}
  ];
  const result=buildGmSeasonSummaries({games,periods,franchiseSeasonId:season});
  const justin=result.summaries.find(row=>row.gmIdentityId==='gm-justin');
  const gas=result.summaries.find(row=>row.gmIdentityId==='gm-gas');
  assert.deepEqual({regular:[justin.regularWins,justin.regularLosses],playoffs:[justin.playoffWins,justin.playoffLosses],appearances:justin.playoffAppearance,superBowls:justin.superBowlAppearances,titles:justin.superBowlChampionships},
    {regular:[1,0],playoffs:[1,0],appearances:1,superBowls:1,titles:1});
  assert.deepEqual({regular:[gas.regularWins,gas.regularLosses],playoffs:[gas.playoffWins,gas.playoffLosses],appearances:gas.playoffAppearance},
    {regular:[0,1],playoffs:[0,1],appearances:1});
});

test('later-round participation proves an otherwise missing playoff result without inventing a score',()=>{
  const games=[
    {id:'wild-card',franchiseSeasonId:season,stage:'regular-season',week:19,status:'1',homeTeamKey:'tb',awayTeamKey:'gb',homeScore:0,awayScore:0},
    {id:'divisional',franchiseSeasonId:season,stage:'regular-season',week:20,status:'1',homeTeamKey:'tb',awayTeamKey:'sf',homeScore:0,awayScore:0}
  ];
  const result=buildGmSeasonSummaries({games,periods,franchiseSeasonId:season});
  const justin=result.summaries.find(row=>row.gmIdentityId==='gm-justin');
  const gas=result.summaries.find(row=>row.gmIdentityId==='gm-gas');
  assert.equal(justin.playoffWins,1);
  assert.equal(gas.playoffLosses,1);
  assert.equal(result.attributedGames.find(row=>row.gameId==='wild-card'&&row.teamKey==='tb').resultProof,'bracket-advancement');
  assert.equal(result.attributedGames.some(row=>row.gameId==='divisional'),false);
});

test('frozen GM rows are rebuilt from their retained immutable snapshot without mutating storage',async()=>{
  const archived={
    gm_identity_id:'gm-justin',franchise_season_id:season,source_snapshot_id:'snapshot-2026',teams_json:'["tb"]',
    regular_wins:2,regular_losses:0,regular_ties:0,playoff_wins:0,playoff_losses:0,playoff_ties:0,
    playoff_appearance:0,conference_championships:0,super_bowl_appearances:0,super_bowl_championships:0,game_count:2
  };
  const records=[
    {external_id:'reg-18',data_json:JSON.stringify({stage:'regular-season',week_index:18,status:'completed',home_team_external_id:'1001',away_team_external_id:'1002',home_score:24,away_score:17})},
    {external_id:'post-23',data_json:JSON.stringify({stage:'regular-season',week_index:23,status:'completed',home_team_external_id:'1001',away_team_external_id:'1002',home_score:27,away_score:21,source_route_path:'xbsx/1/week/reg/23/schedules'})}
  ];
  const db={prepare:()=>({bind:()=>({all:async()=>({results:records})})})};
  const teams=[{teamKey:'tb',id:'tb',externalId:'1001',abbreviation:'TB',displayName:'Buccaneers'},{teamKey:'gb',id:'gb',externalId:'1002',abbreviation:'GB',displayName:'Packers'}];
  const rebuilt=await rehydrateFrozenGmSeasonRows(db,{leagueId:'league-a',teams,periods,rows:[archived]});
  assert.deepEqual({regularWins:rebuilt[0].regular_wins,playoffWins:rebuilt[0].playoff_wins,appearances:rebuilt[0].playoff_appearance,titles:rebuilt[0].super_bowl_championships},
    {regularWins:1,playoffWins:1,appearances:1,titles:1});
  assert.equal(archived.regular_wins,2);
  assert.equal(archived.playoff_wins,0);
});

test('7.3.7.1 normalizes Madden edge aliases across every shared player surface',async()=>{
  assert.equal(normalizePosition('REDG'),'REDGE');
  assert.equal(normalizePosition('LEDG'),'LEDGE');
  assert.equal(normalizePosition('RDE'),'REDGE');
  assert.equal(normalizePosition('LDE'),'LEDGE');
  assert.equal(normalizePlayer({external_id:'edge-1',position:'REDG',depthPosition:'LEDG'}).position,'REDGE');
  assert.equal(normalizePlayer({external_id:'edge-1',position:'REDG',depthPosition:'LEDG'}).depthPosition,'LEDGE');
  const [app,styles,trade,endpoint,rosters,statistics,jsonMapper]=await Promise.all([
    readFile(new URL('../../app.js',import.meta.url),'utf8'),
    readFile(new URL('../../styles.css',import.meta.url),'utf8'),
    readFile(new URL('../../trade-module.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/ownership-career.js',import.meta.url),'utf8'),
    readFile(new URL('../../league-engine/rosters.js',import.meta.url),'utf8'),
    readFile(new URL('../../league-engine/statistics.js',import.meta.url),'utf8'),
    readFile(new URL('../../league-engine/companion-json-mapper.js',import.meta.url),'utf8')
  ]);
  for(const source of [app,rosters,statistics,jsonMapper]){
    assert.match(source,/REDG:'REDGE'/);
    assert.match(source,/LEDG:'LEDGE'/);
  }
  assert.match(app,/const pos=canonicalFilterPosition\(position\)/);
  assert.match(app,/REDGE:\['REDGE','REDG'/);
  assert.match(app,/LEDGE:\['LEDGE','LEDG'/);
  assert.match(app,/\['TFL',\['defTacklesForLoss'/);
  assert.match(app,/if\(liveRosterPlayers\.has\(String\(playerId\)\)\)/);
  assert.match(app,/playerReturnRoute/);
  assert.match(trade,/franchisehq:player-card-closed/);
  assert.match(styles,/FranchiseHQ 7\.3\.7 — phone tables/);
  assert.match(styles,/display:table!important/);
  assert.match(styles,/canonical-game-log-tab \[data-player-game-log-content\]/);
  assert.match(styles,/data-team-abbr="NYJ"/);
  assert.doesNotMatch(endpoint,/rawOwnerName|madden_owner_name/i);
  assert.match(endpoint,/maddenOwnerNamesUsed:false/);
});

test('7.3.7.1 exposes a league-wide membership-authoritative History Books view',async()=>{
  const [app,client,endpoint,styles]=await Promise.all([
    readFile(new URL('../../app.js',import.meta.url),'utf8'),
    readFile(new URL('../../league-engine/ownership-career.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/ownership-career.js',import.meta.url),'utf8'),
    readFile(new URL('../../styles.css',import.meta.url),'utf8')
  ]);
  assert.match(app,/\['history','League History'\]/);
  assert.match(app,/ownership\.requestLeague\(\)/);
  assert.match(client,/function renderLeague\(payload=\{\}\)/);
  for(const label of ['Career Record','Playoff Appearances','Super Bowl Appearances','Super Bowl Wins'])assert.match(client,new RegExp(label));
  assert.match(endpoint,/view==='league'/);
  assert.match(endpoint,/FROM gm_identities identity WHERE identity\.league_id=\?/);
  assert.match(endpoint,/crossTenantInference:false/);
  assert.match(styles,/league-wide membership-authoritative History Books/);
});
