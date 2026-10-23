import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { teams,players,games } from '../../assets/public-demo.js';
import { onRequestGet as demo } from '../../functions/demo.js';
import { onRequestGet as application } from '../../functions/beta-apply.js';

test('public demo uses deterministic fictional players and records derived from sample finals',()=>{
  assert.equal(teams.length,32);assert.equal(new Set(players.map(p=>p.id)).size,players.length);
  for(const t of teams){const completed=games.filter(g=>g.played&&(g.away===t.id||g.home===t.id));assert.equal(t.wins+t.losses+t.ties,completed.length);assert.equal(t.pf,completed.reduce((sum,g)=>sum+(g.away===t.id?g.awayScore:g.homeScore),0));}
  assert.equal(games.filter(g=>g.week===8&&g.played).length,6);
});

test('demo is public, has no live data, session or mutation clients, and all commissioner actions are disabled',async()=>{
  const html=await(await demo()).text();assert.match(html,/Mock data · View only/);assert.doesNotMatch(html,/auth-client|trade-module|__FHQ_AUTH_BOOTSTRAP__/);
  const source=await readFile(new URL('../../assets/public-demo.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie/);
  assert.match(source,/fieldset disabled/);assert.match(source,/button class="button" disabled/);assert.match(source,/Commish HQ/);
});

test('beta application page clearly describes approval and posts through its dedicated application mode',async()=>{
  const html=await(await application({})).text();assert.match(html,/data-beta-application/);assert.match(html,/Submit for approval/);assert.match(html,/stays inactive until/);
  const script=await readFile(new URL('../../assets/league-registration.js',import.meta.url),'utf8');assert.match(script,/application\?'apply':'submit'/);assert.match(script,/Awaiting owner approval/);
});
