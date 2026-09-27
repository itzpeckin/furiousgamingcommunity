import test from 'node:test';
import assert from 'node:assert/strict';
import { gameSummaryPerformers,summaryGameFinal,gamePreviewPlayers } from '../../league-engine/game-summary.js';
import { discordGameCardData,discordGameCardSvg,signedDiscordGameCardUrl,verifiedDiscordGameCard } from '../../functions/_lib/discord-game-card.js';
import { normalizeGame, normalizeStatisticCompact } from '../../functions/api/leagues/[leagueSlug]/snapshot/read-model.js';
const game={id:'g',season:2027,week:2,stage:'regular-season',awayTeamId:'a',homeTeamId:'h',status:'final',awayScore:21,homeScore:31};
const row=(overrides={})=>({category:'passing',teamId:'a',playerId:'p',season:2027,stage:'regular-season',week:2,metrics:{passYds:160,passComp:11,passAtt:17,passTDs:3,passInts:4},...overrides});
test('game performers exclude wrong weeks, seasons, stages, teams and explicit other game IDs',()=>{
 const statistics=[row(),...[
  {week:1},{season:2026},{stage:'preseason'},{teamId:'other'},{source:{gameId:'other'}},{week:null}
 ].map((other,i)=>row({playerId:`bad-${i}`,metrics:{passYds:999},...other}))];
 const result=gameSummaryPerformers(game,statistics,[{id:'p',displayName:'Bryce Young',teamId:'elsewhere'}]);
 assert.equal(result.a[0].name,'Bryce Young');assert.match(result.a[0].detail,/11\/17 · 160 YDS/);
 assert.equal(result.h[0].name,'Stats not available');assert.equal(result.a[1].playerId,null);
});
test('leaders use yards and deterministic defensive production, including fractional sacks',()=>{
 const statistics=[row({category:'defense',playerId:'tackles',metrics:{defTotalTackles:9,defSacks:0,defInts:0}}),
 row({category:'defense',playerId:'sacks',metrics:{defTotalTackles:3,defSacks:3.5,defInts:0}}),
 row({category:'rushing',metrics:{rushAtt:12,rushYds:110,rushTDs:1}}),
 row({category:'receiving',metrics:{recCatches:3,recYds:49,recTDs:1}})];
 const result=gameSummaryPerformers(game,statistics,[{id:'sacks',name:'Will Anderson Jr'}]);
 assert.equal(result.a[3].name,'Will Anderson Jr');assert.match(result.a[3].detail,/3.5 SACK/);
 assert.match(result.a[1].detail,/110 YDS/);assert.match(result.a[2].detail,/49 YDS/);
});
test('a retained canonical game ID still joins the renamed Madden schedule ID',()=>{
 const canonical=normalizeGame({external_id:'stable',source_game_external_id:'new-madden-id',week_index:2,stage:'regular-season',
   home_team_external_id:'h',away_team_external_id:'a',home_score:31,away_score:21,status:'completed'});
 const stat=normalizeStatisticCompact({category:'passing',player_external_id:'p',team_external_id:'a',week_index:2,stage:'regular-season',
   source_record_json:JSON.stringify({scheduleId:'new-madden-id',weekIndex:1}),metrics:{passYds:160}});
 assert.equal(gameSummaryPerformers(canonical,[stat],[{id:'p',name:'Player'}]).a[0].playerId,'p');
});
test('preview and final decisions handle scoreless games, pending and in-progress states',()=>{
 assert.equal(summaryGameFinal({...game,status:'scheduled'}),false);
 assert.equal(summaryGameFinal({...game,status:'in-progress'}),false);
 assert.equal(summaryGameFinal({...game,homeScore:0,awayScore:0}),true);
 assert.equal(summaryGameFinal({...game,status:'',homeScore:0,awayScore:0}),false);
 const rows=gamePreviewPlayers('a',[{id:'1',teamId:'a',position:'QB',overall:80,name:'QB'},
 {id:'2',teamId:'a',position:'WR',overall:99,name:'WR'},{id:'3',teamId:'h',position:'QB',overall:100,name:'Other'}]);
 assert.equal(rows[0].name,'WR');assert.ok(!rows.some(row=>row.name==='Other'));
});
test('game image has all eight categories, escapes text and rejects changed signed payloads',async()=>{
 const side={name:'Test & Team',abbreviation:'TST',gm:'Owner <one>',primary:'#15304D',secondary:'#547697',score:31,
  rows:gameSummaryPerformers(game,[row()],[{id:'p',name:'Bryce Young'}]).a};
 const card=discordGameCardData({league:'Test League',season:2027,week:2,stage:'Regular Season',final:true,away:side,home:side});
 const svg=discordGameCardSvg(card);assert.match(svg,/FINAL · TOP PERFORMERS/);assert.match(svg,/Owner &lt;one&gt;/);
 assert.equal((svg.match(/PASSING/g)||[]).length,2);assert.equal((svg.match(/DEFENSE/g)||[]).length,2);
 const env={DISCORD_BOT_TOKEN:'test-only-game-card'},url=new URL(await signedDiscordGameCardUrl(env,card));
 assert.deepEqual(await verifiedDiscordGameCard(env,url),card);url.searchParams.set('sig','x'.repeat(43));
 assert.equal(await verifiedDiscordGameCard(env,url),null);
 assert.equal(await verifiedDiscordGameCard({DISCORD_BOT_TOKEN:'other'},new URL(await signedDiscordGameCardUrl(env,card))),null);
});
