import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {runInNewContext} from 'node:vm';
import {buildDemoLeagueData,DEMO_ID} from '../../functions/_lib/demo-league-data.js';
import {publicDemoResponse,isPublicDemoTenant} from '../../functions/_lib/public-demo.js';
import {onRequest as leaguePage} from '../../functions/leagues/[[path]].js';
import {onRequestGet as demo} from '../../functions/demo.js';
import {onRequestGet as application} from '../../functions/beta-apply.js';
const row={id:DEMO_ID,slug:'demo',name:'FHQ Demo League',tenant_status:'enabled',public_status:'active',configuration_json:'{"publicDemo":true}',branding_json:'{}'};
function context(path,method='GET',tenant=row){
  const queries=[];
  const DB={prepare(sql){queries.push(sql);return{bind(){return this},async first(){return sql.includes('FROM leagues')?tenant:null},async all(){return {results:[]}},async run(){throw new Error('Demo must not mutate the database')}}}};
  return {request:new Request('https://example.test'+path,{method}),env:{DB,ASSETS:{fetch:async()=>new Response(await readFile(new URL('../../index.html',import.meta.url),'utf8'))}},params:{},queries};
}
test('demo dataset contains 32 full rosters, a 17-game schedule and statistics derived from completed demo games',()=>{
  const {teams,players,games,statistics}=buildDemoLeagueData();
  assert.equal(teams.length,32);assert.equal(players.length,32*53);assert.equal(new Set(players.map(p=>p.external_id)).size,players.length);
  assert.equal(games.length,272);assert.equal(games.filter(g=>g.weekIndex===8).length,16);
  for(const t of teams){const completed=games.filter(g=>g.status==='final'&&(g.homeTeamId===t.teamId||g.awayTeamId===t.teamId));assert.equal(t.wins+t.losses+t.ties,completed.length);assert.equal(t.ptsFor,completed.reduce((sum,g)=>sum+(g.homeTeamId===t.teamId?g.homeScore:g.awayScore),0));assert.equal(players.filter(p=>p.teamId===t.teamId).length,53);assert.equal(games.filter(g=>g.homeTeamId===t.teamId||g.awayTeamId===t.teamId).length,17);}
  assert.ok(statistics.length>1000);assert.ok(statistics.every(s=>games.some(g=>g.external_id===s.gameId&&g.status==='final')));
});
test('public demo uses the exact platform shell, and the old entry link redirects to its league',async()=>{
  const redirect=await demo();assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'/leagues/demo');
  const c=context('/leagues/demo');const response=await leaguePage(c),html=await response.text();assert.equal(response.status,200);
  assert.match(html,/app.js\?v=/);assert.match(html,/trade-module.js/);assert.match(html,/__FHQ_PUBLIC_DEMO__/);assert.doesNotMatch(html,/public-demo.js|data-demo-content|__FHQ_AUTH_BOOTSTRAP__/);
  assert.ok(c.queries.every(q=>!q.includes('FROM sessions')));
});
test('anonymous readers get only demo data and no account or commissioner capabilities',async()=>{
  const c=context('/api/auth/me?league=demo'),auth=await(await publicDemoResponse(c)).json();assert.equal(auth.authenticated,false);assert.equal(auth.user,null);assert.deepEqual(auth.capabilities,[]);
  const page=await(await publicDemoResponse(context('/api/leagues/demo/snapshot/read-model?domain=players&limit=500'))).json();assert.equal(page.records.length,500);assert.equal(page.nextCursor,'500');assert.ok(page.records.every(p=>p.id.startsWith('demo-')));
  const next=await(await publicDemoResponse(context('/api/leagues/demo/snapshot/read-model?domain=players&cursor=500'))).json();assert.notEqual(page.records[0].id,next.records[0].id);
  const hq=await(await publicDemoResponse(context('/api/leagues/demo/commissioner-hq'))).json();assert.equal(hq.memberships.total,32);assert.equal(hq.readOnly,true);
  const roster=await(await publicDemoResponse(context('/api/leagues/demo/roster-management?type=player&team=dal'))).json();assert.equal(roster.items.length,53);assert.ok(roster.items.every(p=>p.teamKey==='dal'));assert.equal(roster.readOnly,true);
});

test('server-resolved demo tenant is ready before startup reads and never bootstraps a customer route',async()=>{
  const script=await readFile(new URL('../../league-engine/league-tenant.js',import.meta.url),'utf8');
  for(const slug of ['demo','customer']){
    let service,requests=0;
    const context={console,structuredClone,location:{pathname:'/leagues/'+slug},localStorage:{getItem:()=>null,setItem(){}},
      CustomEvent:class{constructor(type){this.type=type;}},fetch:async()=>{requests++;return{ok:false,status:401,json:async()=>({})};},
      window:{__FHQ_PUBLIC_DEMO__:{id:DEMO_ID,slug:'demo',tenant:{id:DEMO_ID,slug:'demo',name:'FHQ Demo League'}},dispatchEvent(){},
        FranchiseHQ:{defineModuleService(_module,_name,value){service=value;}}}};
    runInNewContext(script,context);
    assert.equal(service.current().slug,slug);
    assert.equal(service.current().serverResolved,slug==='demo');
    assert.equal(requests,slug==='demo'?0:1);
  }
});
test('demo mutation and operational routes are denied before any database or external effects',async()=>{
  for(const method of ['POST','PUT','PATCH','DELETE'])for(const resource of ['memberships','trade-center','discord','companion/candidate-import','ea-direct/connection','rules','roster-management']){
    const c=context('/api/leagues/demo/'+resource,method);const response=await publicDemoResponse(c);assert.equal(response.status,403);assert.equal(c.queries.length,0);
  }
  for(const resource of ['discord/connect','ea-direct/login','companion/export/private-key','companion/import-job?jobId=customer-job'])assert.equal((await publicDemoResponse(context('/api/leagues/demo/'+resource))).status,403);
  assert.equal((await publicDemoResponse(context('/api/leagues/%64emo/trade-center','POST'))).status,403);
});
test('public access cannot be applied to another tenant or enabled through a query string',async()=>{
  assert.equal(await publicDemoResponse(context('/api/leagues/fgc/snapshot/read-model?demo=1')),null);
  assert.equal(await publicDemoResponse(context('/api/auth/me?league=fgc&demo=1')),null);
  for(const tenant of [null,{...row,id:'customer-league'},{...row,configuration_json:'{}'},{...row,tenant_status:'disabled'}])assert.equal((await publicDemoResponse(context('/api/leagues/demo', 'GET',tenant))).status,404);
  assert.equal(isPublicDemoTenant({id:'customer-league',slug:'demo',enabled:true,configuration:{publicDemo:true}}),false);
});
test('demo provisioning adds only its dedicated tenant and refuses to convert an existing league',async()=>{
  const db=new DatabaseSync(':memory:');
  try{const dir=new URL('../../migrations/',import.meta.url);for(const f of (await readdir(dir)).filter(f=>/^\d+_.*\.sql$/.test(f)).sort())db.exec(await readFile(new URL(f,dir),'utf8'));
    db.exec("INSERT INTO leagues(id,name,slug) VALUES('customer','Customer League','customer')");
    const sql=await readFile(new URL('../../config/public-demo-league.sql',import.meta.url),'utf8');db.exec(sql);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM leagues').get().n,2);assert.equal(db.prepare("SELECT name FROM leagues WHERE id='customer'").get().name,'Customer League');
    assert.throws(()=>db.exec(sql),/UNIQUE/);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM league_memberships').get().n,0);
  }finally{db.close();}
});
test('beta application approval flow remains available',async()=>{
  const html=await(await application({})).text();assert.match(html,/data-beta-application/);assert.match(html,/Submit for approval/);assert.match(html,/stays inactive until/);
});
