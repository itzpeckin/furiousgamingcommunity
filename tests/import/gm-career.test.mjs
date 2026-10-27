import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { buildGmSeasonSummaries, careerTotals, canonicalOwnershipStage, periodOwnsGame } from '../../functions/_lib/gm-career.js';
import { rehydrateFrozenGmSeasonRows } from '../../functions/_lib/gm-career-history.js';
import { normalizePosition } from '../../functions/api/leagues/[leagueSlug]/companion/map-players.js';
import { normalizePlayer } from '../../functions/api/leagues/[leagueSlug]/snapshot/read-model.js';
import { buildSeasonGameHistory } from '../../functions/_lib/gm-matchup-history.js';
import { onRequestGet as readCareers } from '../../functions/api/leagues/[leagueSlug]/ownership-career.js';
import { createHistoryFixture } from '../fixtures/gm-history.mjs';
import vm from 'node:vm';
import { ownershipChangeStatements, currentFranchiseContext } from '../../functions/_lib/ownership-periods.js';

const season='season-2026';
const periods=[
  {gmIdentityId:'gm-justin',teamKey:'tb',franchiseSeasonId:season,startedStage:'preseason',startedWeek:1,endedStage:null,endedWeek:null},
  {gmIdentityId:'gm-gas',teamKey:'gb',franchiseSeasonId:season,startedStage:'preseason',startedWeek:1,endedStage:null,endedWeek:null}
];

test('real ownership writes preserve completed handoff-week results and close deactivated membership',async()=>{
  const f=await createHistoryFixture();
  try{
    // The outgoing owner has already played Week 2 before the website handoff.
    f.sqlite.exec(`DELETE FROM team_ownership_periods WHERE id='new-c';
      UPDATE team_ownership_periods SET ended_at=NULL,ended_stage=NULL,ended_week=NULL WHERE id='new-a';
      UPDATE league_memberships SET team_id='tb' WHERE id='member-a'`);
    const removal=await ownershipChangeStatements(f.db,{leagueId:'alpha',userId:'a',nextTeamKey:null,expectedMembershipActive:0});
    await f.db.batch([f.db.prepare(`UPDATE league_memberships SET active=0 WHERE id='member-a'`),...removal.statements]);
    const ended=f.sqlite.prepare(`SELECT ended_at,ended_week FROM team_ownership_periods WHERE id='new-a'`).get();
    assert.ok(ended.ended_at);assert.equal(ended.ended_week,3);
    f.sqlite.exec(`INSERT INTO league_memberships (id,league_id,user_id,role,team_id,active) VALUES ('member-c','alpha','c','team_owner',NULL,1)`);
    const incoming=await ownershipChangeStatements(f.db,{leagueId:'alpha',userId:'c',nextTeamKey:'tb'});
    await f.db.batch([f.db.prepare(`UPDATE league_memberships SET team_id='tb' WHERE id='member-c'`),...incoming.statements]);
    const start=f.sqlite.prepare(`SELECT started_stage,started_week FROM team_ownership_periods WHERE gm_identity_id='identity-c' AND ended_at IS NULL`).get();
    assert.equal(start.started_stage,'regular-season');assert.equal(start.started_week,3);
    const payload=await (await readCareers({...f.context(),request:new Request(f.context().request.url,{headers:{}})})).json();
    assert.equal(payload.ok,false,'deactivated membership cannot read history');
  }finally{f.sqlite.close();}
});

test('new midseason GM starts at unplayed current week; offseason stays after postseason',async()=>{
  const f=await createHistoryFixture();
  try{
    f.sqlite.exec(`DELETE FROM team_ownership_periods WHERE id='new-c';
      UPDATE league_snapshot_records SET data_json=json_set(data_json,'$.status','scheduled','$.home_score',0,'$.away_score',0) WHERE snapshot_id='snap-new' AND external_id='reg2';
      INSERT INTO league_memberships (id,league_id,user_id,role,team_id,active) VALUES ('member-c','alpha','c','team_owner','tb',1)`);
    const plan=await ownershipChangeStatements(f.db,{leagueId:'alpha',userId:'c',nextTeamKey:'tb'});
    await f.db.batch(plan.statements);
    assert.equal(f.sqlite.prepare(`SELECT started_week FROM team_ownership_periods WHERE gm_identity_id='identity-c'`).get().started_week,2);
    f.sqlite.exec(`UPDATE league_snapshots SET week_index=2,manifest_json='{"currentPeriod":{"stage":"offseason","week":2,"key":"offseason:2"}}' WHERE id='snap-new'`);
    assert.equal((await currentFranchiseContext(f.db,'alpha')).stage,'offseason');
    assert.equal(canonicalOwnershipStage('off-season',2),'offseason');
    const former={gmIdentityId:'former',teamKey:'tb',franchiseSeasonId:season,startedStage:'preseason',startedWeek:1,endedStage:'offseason',endedWeek:2};
    const replacement={...former,gmIdentityId:'replacement',startedStage:'offseason',startedWeek:2,endedStage:null};
    const game={id:'final',franchiseSeasonId:season,stage:'regular-season',week:20,status:'completed',homeTeamKey:'tb',awayTeamKey:'gb',homeScore:22,awayScore:45};
    const built=buildGmSeasonSummaries({games:[game],periods:[former,replacement],franchiseSeasonId:season});
    assert.equal(built.attributedGames[0].gmIdentityId,'former');assert.equal(built.summaries.length,1);
  }finally{f.sqlite.close();}
});

test('overlapping GM periods cannot arbitrarily assign results by row order',()=>{
  const overlap=[periods[0],{...periods[0],gmIdentityId:'replacement'}];
  const game={id:'g',stage:'regular-season',week:1,status:'completed',homeTeamKey:'tb',awayTeamKey:'gb',homeScore:21,awayScore:7};
  for(const order of [overlap,[...overlap].reverse()]){
    const built=buildGmSeasonSummaries({games:[game],periods:order,franchiseSeasonId:season});
    assert.equal(built.attributedGames.length,0);assert.equal(built.ambiguousGames.length,1);
  }
});

test('history rebuild restores missing former-GM summaries and clears stale replacement credits',async()=>{
  const f=await createHistoryFixture();
  try{
    f.sqlite.exec(`UPDATE gm_season_summaries SET gm_identity_id='identity-c' WHERE gm_identity_id='identity-a' AND franchise_season_id='old'`);
    const league=await (await readCareers(f.context())).json();
    assert.equal(league.owners.find(row=>row.owner.publicId==='gm-c').seasons.find(row=>row.seasonYear===2026).gameCount,0);
    assert.equal(league.owners.find(row=>row.owner.publicId==='gm-a').seasons.find(row=>row.seasonYear===2026).gameCount,2);
    f.sqlite.exec(`UPDATE league_memberships SET team_id='tb' WHERE id='member-a'`);
    const c=f.context();c.request=new Request(c.request.url.replace('?view=league','?teamKey=tb'),{headers:c.request.headers});
    const team=await (await readCareers(c)).json();
    assert.equal(team.career.seasons.find(row=>row.seasonYear===2026).gameCount,2);
    assert.equal(team.career.seasons.length,2,'another GM history must not leak into My Team');
  }finally{f.sqlite.close();}
});

test('reviewed ownership periods attribute games without Madden owner names',()=>{
  const games=[
    {id:'reg-1',franchiseSeasonId:season,stage:'regular-season',week:1,status:'final',homeTeamKey:'tb',awayTeamKey:'gb',homeScore:24,awayScore:17},
    {id:'playoff-1',franchiseSeasonId:season,stage:'playoffs',week:4,status:'final',homeTeamKey:'gb',awayTeamKey:'tb',homeScore:20,awayScore:27}
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
  assert.match(app,/\['history','GM History'\]/);
  assert.match(app,/ownership\.requestLeague\(\)/);
  assert.match(client,/function renderLeague\(payload=\{\}\)/);
  for(const label of ['Wins','Losses','Playoff Berths','Super Bowl Appearances','Super Bowl Wins','Giveaways','Takeaways'])assert.match(client,new RegExp(label));
  assert.match(endpoint,/view==='league'/);
  assert.match(endpoint,/FROM gm_identities identity WHERE identity\.league_id=\?/);
  assert.match(endpoint,/crossTenantInference:false/);
  assert.match(styles,/league-wide membership-authoritative History Books/);
});

test('an incomplete playoff bracket never awards Super Bowl appearances or wins',()=>{
  for(const week of [1,2,3,19,20,21]){
    const built=buildGmSeasonSummaries({franchiseSeasonId:season,periods,games:[{id:'p',stage:'playoffs',week,status:'completed',homeTeamKey:'tb',awayTeamKey:'gb',homeScore:21,awayScore:7}]});
    assert.equal(built.summaries[0].superBowlAppearances,0,`week ${week}`);
    assert.equal(built.summaries[0].superBowlChampionships,0);
    assert.equal(built.summaries[0].playoffAppearance,1);
  }
});

test('absent scores and unplayed zero-zero schedules are never recorded as ties',()=>{
  for(const scores of [[null,null],['',''],[NaN,7]]){
    const built=buildGmSeasonSummaries({franchiseSeasonId:season,periods,games:[{id:'missing',stage:'regular-season',week:1,status:'completed',homeTeamKey:'tb',awayTeamKey:'gb',homeScore:scores[0],awayScore:scores[1]}]});
    assert.equal(built.attributedGames.length,0);
  }
  const built=buildGmSeasonSummaries({franchiseSeasonId:season,periods,games:[{id:'unplayed',stage:'regular-season',week:1,status:'unplayed',homeTeamKey:'tb',awayTeamKey:'gb',homeScore:0,awayScore:0}]});
  assert.equal(built.attributedGames.length,0);
});

test('real history endpoint combines archived and current seasons with game-time ownership and turnover coverage',async()=>{
  const f=await createHistoryFixture();
  try{
    const response=await readCareers(f.context());assert.equal(response.status,200);
    const payload=await response.json();assert.equal(payload.ok,true);
    const alex=payload.owners.find(row=>row.owner.publicId==='gm-a');
    assert.deepEqual([alex.totals.wins,alex.totals.losses,alex.totals.ties],[1,1,1]);
    assert.equal(alex.totals.winPercentage,.5);
    assert.deepEqual([alex.totals.pointsFor,alex.totals.pointsAgainst,alex.totals.scoredGames],[59,58,3]);
    assert.deepEqual([alex.totals.giveaways,alex.totals.takeaways,alex.totals.giveawayGames],[3,1,2]);
    assert.deepEqual([alex.totals.playoffAppearances,alex.totals.superBowlAppearances,alex.totals.superBowlChampionships],[1,1,0]);
    assert.equal(payload.games.length,4);assert.equal(new Set(payload.games.map(row=>row.id)).size,4);
    assert.equal(payload.games.find(row=>row.id==='new:reg2').home.owner.publicId,'gm-c');
    assert.equal(payload.games.find(row=>row.id==='old:reg1').home.owner.publicId,'gm-a');
    assert.equal(payload.games[0].id,'new:reg2');
    assert.equal(JSON.stringify(payload).includes('identity-'),false);
    assert.equal(JSON.stringify(payload).includes('Other League GM'),false);
    assert.equal(f.sqlite.prepare(`SELECT regular_wins FROM gm_season_summaries LIMIT 1`).get().regular_wins,99,'reading cannot overwrite frozen records');
  }finally{f.sqlite.close();}
});

test('career and game history require membership in the requested league',async()=>{
  const f=await createHistoryFixture();
  try{
    assert.equal((await readCareers(f.context('alpha',false))).status,401);
    assert.equal((await readCareers(f.context('beta'))).status,404);
  }finally{f.sqlite.close();}
});

test('missing archived snapshots preserve frozen records but never invent scores or turnovers',async()=>{
  const f=await createHistoryFixture();
  try{
    f.sqlite.exec(`DELETE FROM league_snapshot_records WHERE snapshot_id='snap-old'`);
    const p=await (await readCareers(f.context())).json();
    const a=p.owners.find(row=>row.owner.publicId==='gm-a').totals;
    assert.equal(a.regularWins,99);assert.equal(a.scoredGames,1);assert.equal(a.pointsFor,14);
    assert.equal(p.games.length,2);assert.deepEqual(p.coverage,{retainedSeasons:1,totalSeasons:2,includesPreseason:false});
  }finally{f.sqlite.close();}
});

test('game totals ignore player stats, duplicate captures, conflicting totals, and preseason games',()=>{
  const record=(domain,id,data)=>({domain,external_id:id,data_json:JSON.stringify(data)});
  const teams=[{teamKey:'tb',externalId:'1'},{teamKey:'gb',externalId:'2'}];
  const game={stage:'regular-season',week_index:1,status:'final',home_team_external_id:'1',away_team_external_id:'2',home_score:21,away_score:10};
  const stat={category:'team-game',stage:'regular-season',week_index:1,team_external_id:'1',metrics_json:JSON.stringify({scheduleId:'g',offIntsLost:1,offFumLost:2,defIntsRec:0,defFumRec:0})};
  const records=[record('games','g',game),record('games','pre',{...game,stage:'preseason'}),record('statistics','s',stat),record('statistics','s-copy',stat),record('statistics','player',{...stat,category:'passing',metrics_json:'{"offIntsLost":50}'})];
  let built=buildSeasonGameHistory({records,teams,periods,franchiseSeasonId:season});
  assert.equal(built.games.length,1);assert.equal(built.summaries[0].giveaways,3);assert.equal(built.summaries[0].giveawayGames,1);assert.equal(built.summaries[0].takeaways,0);
  records.push(record('statistics','conflict',{...stat,metrics_json:'{"scheduleId":"g","offIntsLost":2,"offFumLost":2,"defIntsRec":0,"defFumRec":0}'}));
  built=buildSeasonGameHistory({records,teams,periods,franchiseSeasonId:season});
  assert.equal(built.summaries[0].giveawayGames,0);
});

async function historyClient(fetch=async()=>{}){
  let service;const listeners={};
  const HQ={leagueTenant:{getCurrentLeague:()=>({slug:'alpha'})},defineModuleService:(_a,_b,value)=>service=value};
  const sandbox={window:{FranchiseHQ:HQ,addEventListener:(type,fn)=>listeners[type]=fn},document:{addEventListener(){}},location:{pathname:'/leagues/alpha',origin:'https://franchisehq.test'},fetch,URL,console};
  vm.runInNewContext(await readFile(new URL('../../league-engine/ownership-career.js',import.meta.url),'utf8'),sandbox);
  return{service,HQ,listeners,sandbox};
}

test('head-to-head reverses wins and points correctly and renders safe, complete matchup history',async()=>{
  const f=await createHistoryFixture();
  try{
    const payload=await (await readCareers(f.context())).json();const{service}=await historyClient();
    const games=service.filterHistory(payload,'gm-a','gm-b');assert.equal(games.length,3);
    const a=service.historySummary(games,'gm-a'),b=service.historySummary(games,'gm-b');
    assert.deepEqual([a.wins,a.losses,a.ties,a.pointsFor,a.pointsAgainst],[1,1,1,59,58]);
    assert.deepEqual([b.wins,b.losses,b.ties,b.pointsFor,b.pointsAgainst],[1,1,1,58,59]);
    assert.equal(service.filterHistory(payload,'gm-a','gm-a').length,0);
    assert.equal(service.filterHistory(payload,'gm-a','gm-c').length,0);
    payload.owners[0].owner.displayName='<script>alert(1)</script>';
    assert.doesNotMatch(service.renderLeague(payload),/<script>/);
    assert.match(service.renderGames(payload),/data-history-gm="first"/);
    assert.match(service.renderLeague(payload),/2\/3 games/);
  }finally{f.sqlite.close();}
});

test('history requests share work, invalidate after import, and never reuse another league cache',async()=>{
  let calls=0;const c=await historyClient(async()=>{calls++;return{ok:true,json:async()=>({ok:true,owners:[],call:calls})}});
  await Promise.all([c.service.requestLeague(),c.service.requestLeague()]);assert.equal(calls,1);
  c.listeners['franchisehq:live-read-refreshed']({detail:{leagueSlug:'alpha',snapshotId:'new'}});
  await c.service.requestLeague();assert.equal(calls,2);
  c.HQ.leagueTenant.getCurrentLeague=()=>({slug:'beta'});
  await c.service.requestLeague();assert.equal(calls,3);
  c.service.clear();
  let resolve;c.sandbox.fetch=()=>new Promise(done=>resolve=done);
  const pending=c.service.requestLeague();
  c.HQ.leagueTenant.getCurrentLeague=()=>({slug:'alpha'});
  resolve({ok:true,json:async()=>({ok:true})});
  await assert.rejects(pending,/league changed/);
});
