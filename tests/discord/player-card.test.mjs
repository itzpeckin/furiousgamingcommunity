import test from 'node:test';
import assert from 'node:assert/strict';
import { discordPlayerCardData,discordPlayerCardSvg,playerCardRatings,playerCardRatingGroup,playerCardImageUrl,signedDiscordPlayerCardUrl,verifiedDiscordPlayerCard,discordPlayerCardEmbed } from '../../functions/_lib/discord-player-card.js';

test('Discord cards select exactly the requested attributes for every position',()=>{
  const expected={QB:'AWR SPD THP AGI DAC MAC SAC TOR',RB:'SPD ACC AGI CAR BCV BTK COD CTH',FB:'SPD ACC AGI CAR BCV BTK COD CTH',WR:'SPD ACC AGI COD CTH RLS JMP RTR',TE:'SPD ACC CTH RTR JMP RBK PBK LBK',
    LT:'STR SPD ACC AGI RBK PBK LBK IBK',LG:'STR SPD ACC AGI RBK PBK LBK IBK',C:'STR SPD ACC AGI RBK PBK LBK IBK',RG:'STR SPD ACC AGI RBK PBK LBK IBK',RT:'STR SPD ACC AGI RBK PBK LBK IBK',
    LEDGE:'SPD ACC STR AGI PMV FMV BSH TAK',REDG:'SPD ACC STR AGI PMV FMV BSH TAK',DT:'STR BSH PMV FMV TAK PRC POW IBK',SAM:'SPD ACC TAK POW PUR PRC ZCV MCV',MIKE:'SPD ACC TAK POW PUR PRC ZCV MCV',WILL:'SPD ACC TAK POW PUR PRC ZCV MCV',
    CB:'SPD ACC MCV ZCV PRS PRC JMP CTH',FS:'SPD ACC MCV ZCV PRS PRC JMP CTH',SS:'SPD ACC MCV ZCV JMP CTH TAK POW',K:'KPW KAC',P:'KPW KAC'};
  for(const [position,labels] of Object.entries(expected))assert.equal(playerCardRatings({position}).map(([key])=>key).join(' '),labels,position);
  assert.equal(playerCardRatingGroup('LE'),'EDGE');assert.equal(playerCardRatingGroup('MLB'),'LB');
});
test('route running is the rounded average of all three ratings, never a partial or zero-filled average',()=>{
  const player={position:'WR',ratings:{routeRunShortRating:90,routeRunMedRating:85,routeRunDeepRating:83,speedRating:96}};
  assert.deepEqual(playerCardRatings(player).at(-1),['RTR',86]);
  delete player.ratings.routeRunDeepRating;assert.deepEqual(playerCardRatings(player).at(-1),['RTR',null]);
  assert.deepEqual(playerCardRatings(player)[0],['SPD',96]);
  player.ratings.routeRunDeepRating=-1;assert.equal(playerCardRatings(player).at(-1)[1],null);
});
test('the shared graphic has eight cells, safe text, source measurements, portrait and optional trade-block note only',()=>{
  const player={displayName:'Kamari <Lassiter>',position:'CB',heightInches:72,weightLbs:186,overall:89,age:24,devTrait:'Star',ratings:{speedRating:93}};
  const options={leagueName:'League & One',portraitUrl:'https://ratings-images-prod.pulse.ea.com/madden-nfl-26/portraits/123.png'};
  const base=discordPlayerCardData(player,{displayName:'Texans',abbreviation:'HOU',primaryColor:'#03202F',secondaryColor:'#A71930'},options);
  assert.equal(base.h,'6′ 0″');assert.equal(base.w,'186 lb');assert.equal(base.r.length,8);
  const svg=discordPlayerCardSvg(base);assert.match(svg,/Kamari &lt;Lassiter&gt;/);assert.match(svg,/League &amp; One/);
  assert.doesNotMatch(svg,/Major Statistics|Tackles|Cap Hit|Salary|LOOKING FOR/);
  const block=discordPlayerCardData(player,{}, {...options,lookingFor:'Open to offers'});
  assert.match(discordPlayerCardSvg(block),/LOOKING FOR  ·  Open to offers/);
  const absent=discordPlayerCardData({position:'QB'},{});assert.equal(absent.o,null);assert.equal(absent.g,null);assert.equal(absent.h,'—');assert.equal(absent.w,'—');assert.equal(absent.d,'—');
});
test('card URLs are signed, immutable presentations, with no anonymous league database lookup',async()=>{
  const env={DISCORD_BOT_TOKEN:'test-only-card-signing'},card=discordPlayerCardData({displayName:'A Player',position:'QB',ratings:{}},{},{leagueName:'One'});
  const url=new URL(await signedDiscordPlayerCardUrl(env,card));assert.deepEqual(await verifiedDiscordPlayerCard(env,url),card);
  const changed={...card,f:'Another League'};url.searchParams.set('card',Buffer.from(JSON.stringify(changed)).toString('base64url'));
  assert.equal(await verifiedDiscordPlayerCard(env,url),null);
  assert.equal(await verifiedDiscordPlayerCard({DISCORD_BOT_TOKEN:'different'},new URL(await signedDiscordPlayerCardUrl(env,card))),null);
  const c={env,league:{id:'one',name:'One'}},embed=await discordPlayerCardEmbed(c,{displayName:'A Player',position:'QB'}, {},{url:'https://franchisehq.app/leagues/one#players/a'});
  assert.equal(embed.title,'A Player');assert.match(embed.url,/#players\/a/);assert.match(embed.image.url,/api\/discord\/player-card/);assert.equal(embed.fields,undefined);
});
test('raster images cannot fetch arbitrary URLs, local networks, API endpoints or redirects',()=>{
  for(const url of ['http://a.espncdn.com/a.png','https://127.0.0.1/a.png','https://evil.example/a.png','https://franchisehq.app/api/auth/me','https://user:a@a.espncdn.com/a.png','https://a.espncdn.com:8443/a.png'])assert.equal(playerCardImageUrl(url),null);
  assert.equal(playerCardImageUrl('https://a.espncdn.com/i/teamlogos/nfl/500/hou.png'),'https://a.espncdn.com/i/teamlogos/nfl/500/hou.png');
});
