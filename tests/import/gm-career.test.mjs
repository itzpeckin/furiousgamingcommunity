import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { buildGmSeasonSummaries, careerTotals, periodOwnsGame } from '../../functions/_lib/gm-career.js';

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

test('7.3.7 client contracts cover instant cards, origin return, phone tables, and defensive roles',async()=>{
  const [app,styles,trade,endpoint]=await Promise.all([
    readFile(new URL('../../app.js',import.meta.url),'utf8'),
    readFile(new URL('../../styles.css',import.meta.url),'utf8'),
    readFile(new URL('../../trade-module.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/ownership-career.js',import.meta.url),'utf8')
  ]);
  for(const position of ['LEDGE','REDGE','EDGE','SAM','MIKE','WILL'])assert.match(app,new RegExp(`'${position}'`));
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
