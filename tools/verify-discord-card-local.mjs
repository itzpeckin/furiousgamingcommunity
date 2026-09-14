import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { discordPlayerCardData,signedDiscordPlayerCardUrl } from '../functions/_lib/discord-player-card.js';

// Local-only acceptance: deliberately refuses a Production host or a real bot secret.
const origin=process.argv[2] || 'http://127.0.0.1:8789';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw new Error('Local worker only.');
const card=discordPlayerCardData({displayName:'Kamari Lassiter',position:'CB',heightInches:72,weightLbs:186,overall:89,age:24,devTrait:'Star',ratings:{speedRating:93,accelRating:94,manCoverRating:88,zoneCoverRating:91,pressRating:87,playRecRating:86,jumpRating:92,catchRating:76}},
  {displayName:'Texans',abbreviation:'HOU',primaryColor:'#03202F',secondaryColor:'#A71930',logoUrl:'https://a.espncdn.com/i/teamlogos/nfl/500/hou.png'},
  {leagueName:'FranchiseHQ · Illustrative preview',portraitUrl:'https://ratings-images-prod.pulse.ea.com/madden-nfl-26/portraits/10147.png',lookingFor:'Open to offers · Local acceptance'});
const signed=new URL(await signedDiscordPlayerCardUrl({DISCORD_BOT_TOKEN:'test-only-card-signing'},card));
const url=origin+signed.pathname+signed.search;
const started=performance.now();
const response=await fetch(url);assert.equal(response.status,200,await response.clone().text());
assert.match(response.headers.get('content-type'),/^image\/png/);
const bytes=new Uint8Array(await response.arrayBuffer());assert.deepEqual([...bytes.slice(0,8)],[137,80,78,71,13,10,26,10]);
if(process.argv[3])await writeFile(process.argv[3],bytes);
const cached=await fetch(url);assert.equal(cached.status,200);
const forged=await fetch(url.replace(/sig=./,'sig=x'));assert.equal(forged.status,404);
assert.equal((await fetch(origin+'/api/discord/player-card')).status,404);
console.log(JSON.stringify({passed:true,bytes:bytes.length,firstRenderMs:Math.round(performance.now()-started),signedPng:true,repeatPng:true,forgedRejected:true,unsignedRejected:true}));
