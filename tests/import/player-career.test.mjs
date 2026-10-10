import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile,readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { archivedPlayerCareer,onRequestGet } from '../../functions/api/leagues/[leagueSlug]/player-career.js';

async function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  const root=new URL('../../migrations/',import.meta.url);
  for(const file of (await readdir(root)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())sqlite.exec(await readFile(new URL(file,root),'utf8'));
  sqlite.exec('PRAGMA foreign_keys=OFF');
  const season=(id,league,year,status,franchise='franchise-a',edition='Madden NFL 27')=>sqlite.prepare(`INSERT INTO franchise_seasons
    (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
    VALUES (?,?, 'madden',?,?,?,'Season',?,?)`).run(id,league,franchise,id,edition,year,status);
  season('current','league-a',2027,'active');season('old','league-a',2026,'closed');
  sqlite.exec(`INSERT INTO league_snapshots (id,league_id,status,season_year,manifest_json) VALUES ('live','league-a','active',2027,'{}');
    INSERT INTO league_active_snapshots (league_id,snapshot_id) VALUES ('league-a','live');
    INSERT INTO league_snapshot_records (snapshot_id,league_id,domain,external_id,data_json) VALUES ('live','league-a','players','p1','{}');
    INSERT INTO player_source_aliases (league_id,source_system,source_franchise_id,source_player_id,player_identity_id,first_seen_season_id,last_seen_season_id)
      VALUES ('league-a','madden','franchise-a','p1','identity-a','old','current');`);
  const summary=(id,league='league-a',identity='identity-a',year=2026)=>{
    sqlite.prepare(`INSERT INTO player_season_summaries (league_id,franchise_season_id,player_identity_id,season_totals_json) VALUES (?,?,?,?)`)
      .run(league,id,identity,JSON.stringify({seasonYear:year,categories:{passing:{passAtt:554,passComp:311,passYds:4569,passTDs:42,passInts:34,passLongest:79},defense:{defSacks:2.5}}}));
    sqlite.prepare(`INSERT INTO franchise_season_closures (id,league_id,game_year_id,franchise_season_id,frozen_totals_sha256,closed_by_user_id) VALUES (?,?, 'edition',?,'hash','user')`).run('closure-'+id,league,id);
  };summary('old');
  const db={prepare(sql){const stmt=sqlite.prepare(sql);let args=[];const q={bind(...values){args=values;return q;},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};}};return q;}};
  return {sqlite,db,season,summary};
}

test('career reader restores frozen totals through stable identity without writing or mixing tenant/franchise/edition/current seasons',async()=>{
  const f=await fixture();
  try{
    f.season('other-tenant','league-b',2026,'closed');f.summary('other-tenant','league-b');
    f.season('other-franchise','league-a',2025,'closed','franchise-b');f.summary('other-franchise');
    f.season('other-edition','league-a',2024,'closed','franchise-a','Madden NFL 26');f.summary('other-edition');
    f.season('future','league-a',2028,'closed');f.summary('future');
    f.season('unclosed','league-a',2025,'active');f.summary('unclosed');
    const before=f.sqlite.prepare('SELECT total_changes() n').get().n;
    const result=await archivedPlayerCareer(f.db,'league-a','p1','live');
    assert.equal(result.status,200);assert.equal(result.seasons.length,1);
    assert.equal(result.seasons[0].year,2026);assert.equal(result.seasons[0].categories.passing.passYds,4569);
    assert.equal(result.seasons[0].categories.defense.defSacks,2.5);
    assert.equal(f.sqlite.prepare('SELECT total_changes() n').get().n,before);
    assert.equal((await archivedPlayerCareer(f.db,'league-a','missing','live')).status,404);
    assert.equal((await archivedPlayerCareer(f.db,'league-a','p1','stale')).status,409);
    assert.equal((await archivedPlayerCareer(f.db,'league-b','p1','live')).status,409);
    f.sqlite.exec("DELETE FROM player_source_aliases WHERE league_id='league-a'");
    assert.deepEqual((await archivedPlayerCareer(f.db,'league-a','p1','live')).seasons,[],'new players have no invented history');
  }finally{f.sqlite.close();}
});

test('career reader rejects a snapshot changing during history retrieval',async()=>{
  const f=await fixture();
  try{
    const db={prepare(sql){if(sql==='SELECT snapshot_id FROM league_active_snapshots WHERE league_id=?')return {bind(){return {async first(){return {snapshot_id:'new'};}};}};return f.db.prepare(sql);}};
    assert.equal((await archivedPlayerCareer(db,'league-a','p1','live')).status,409);
  }finally{f.sqlite.close();}
});

test('career endpoint requires authentication before reading player archives',async()=>{
  const response=await onRequestGet({request:new Request('https://franchisehq.app/api/leagues/example/player-career?playerId=p1&snapshotId=live'),env:{},params:{leagueSlug:'example'},data:{}});
  assert.equal(response.status,401);
});

const app=await readFile(new URL('../../app.js',import.meta.url),'utf8');
function functionSource(name){const start=app.indexOf(`function ${name}(`);assert.ok(start>=0,name);const end=app.indexOf('\n  }',start)+4;return app.slice(start,end);}
function browserFixture(){
  let slug='league-a';
  const current=[{category:'passing',seasonYear:2027,stage:'regular-season',metrics:{passComp:10,passAtt:20,passYds:200,passTDs:2,passInts:0,passLongest:35}}];
  const context={Map,Set,Number,JSON,URL,Promise,console,location:{origin:'https://example.test'},liveTeamDirectory:{snapshot:{id:'live'}},
    playerStatisticsState:{revision:0,loaded:true},playerCareerCache:new Map(),PLAYER_STAT_CATEGORIES:['passing','defense'],
    window:{FranchiseHQ:{leagueTenant:{getCurrentLeague:()=>({slug})},playerStatistics:{get:()=>({rows:current})}}},
    canonicalCurrentSeasonYear:()=>2027,canonicalStatStage:row=>row.stage,hydratePlayerStatistics:async()=>{},renderCanonicalHistoricalStatistics:()=> 'rendered'};
  const code=['playerStatValue','playerStatNum','playerStatSum','playerStatCategoryTotals','playerCareerScope','playerCareerCategoryTotals','canonicalPlayerSeasonHistory'].map(functionSource).join('\n');
  runInNewContext(code,context);
  const start=app.indexOf('  async function refreshPlayerCareerStatistics('),end=app.indexOf('\n  function playerCareerCategoryTotals',start);
  runInNewContext(app.slice(start,end),context);
  return {context,current,switchTenant:value=>{slug=value;}};
}

test('only Statistics combines archived seasons; current player model stays untouched and rates use combined attempts',()=>{
  const {context:c,current}=browserFixture(),before=JSON.stringify(current);
  c.playerCareerCache.set(c.playerCareerScope('p1').key,{loaded:true,seasons:[{year:2026,categories:{passing:{passComp:90,passAtt:100,passYds:800,passTDs:8,passInts:2,passLongest:79,passerRating:1}}},{year:2027,categories:{passing:{passYds:999999}}}]});
  const seasons=c.canonicalPlayerSeasonHistory('p1');assert.deepEqual(Array.from(seasons,s=>s.year),[2027,2026]);
  const total=c.playerCareerCategoryTotals(seasons.flatMap(s=>s.categories.passing),'passing');
  assert.equal(total.YDS,1000);assert.equal(total.ATT,120);assert.equal(total.LONG,79);
  assert.equal(total['CMP%'],100/120*100);assert.ok(total.RTG>100,'recomputed from attempts, not averaged supplied ratings');
  assert.equal(JSON.stringify(current),before);assert.equal(c.window.FranchiseHQ.playerStatistics.get().rows.length,1);
  assert.equal(c.playerStatCategoryTotals(current,'passing').YDS,200,'Details and game logs retain current data');
  assert.match(app,/if\(target==='statistics'\)[\s\S]*?refreshPlayerCareerStatistics/);
  assert.doesNotMatch(functionSource('canonicalPlayerDashboardStats'),/playerCareerCache|canonicalPlayerSeasonHistory/);
});

test('career loading shares requests and discards responses after tenant switches or card closure',async()=>{
  const f=browserFixture(),c=f.context;let resolve,calls=0;
  c.fetch=()=>{calls++;return new Promise(done=>{resolve=done;});};
  const host={isConnected:true,dataset:{playerCareerHost:'p1'},innerHTML:''};
  const first=c.refreshPlayerCareerStatistics('p1',host),second=c.refreshPlayerCareerStatistics('p1',host);
  assert.equal(calls,1);f.switchTenant('league-b');host.innerHTML='new league';
  resolve({ok:true,json:async()=>({ok:true,snapshotId:'live',playerId:'p1',seasons:[{year:2026,categories:{passing:{passYds:4569}}}]})});
  await Promise.all([first,second]);assert.equal(host.innerHTML,'new league');
  assert.equal(c.canonicalPlayerSeasonHistory('p1').length,1,'another tenant never sees cached archives');
  c.fetch=async()=>({ok:false,json:async()=>({error:'Temporarily unavailable'})});
  host.isConnected=false;await c.refreshPlayerCareerStatistics('p1',host);
  assert.equal(c.playerCareerCache.get(c.playerCareerScope('p1').key).error,'Temporarily unavailable');
  c.fetch=async()=>({ok:true,json:async()=>({ok:true,snapshotId:'live',playerId:'p1',seasons:[]})});host.isConnected=true;
  await c.refreshPlayerCareerStatistics('p1',host,true);
  assert.equal(c.playerCareerCache.get(c.playerCareerScope('p1').key).loaded,true);
});
