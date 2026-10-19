import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';
import { hashToken } from '../../functions/_lib/auth.js';

export async function createHistoryFixture(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const file of (await walkFiles()).filter(file=>/^migrations\/\d+_.+\.sql$/.test(file)).sort())sqlite.exec(await readFile(path.join(ROOT,file),'utf8'));
  const statement=(sql,values=[])=>({bind(...next){return statement(sql,next)},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return{results:sqlite.prepare(sql).all(...values)}},async run(){return{meta:sqlite.prepare(sql).run(...values)}}});
  const db={prepare:sql=>statement(sql),async batch(rows){return Promise.all(rows.map(row=>row.run()))}};
  for(const id of ['alpha','beta'])sqlite.prepare(`INSERT INTO leagues (id,name,product_name,slug,public_status,tenant_status) VALUES (?,?, 'FranchiseHQ',?,'active','enabled')`).run(id,`League ${id}`,id);
  for(const [id,name] of [['a','Alex'],['b','Blair'],['c','Casey'],['foreign','Other League GM']]){
    sqlite.prepare(`INSERT INTO users (id,discord_user_id,discord_username,display_name) VALUES (?,?,?,?)`).run(id,`discord-${id}`,id,name);
    sqlite.prepare(`INSERT INTO gm_identities (id,league_id,user_id,public_id,display_name) VALUES (?,?,?,?,?)`).run(`identity-${id}`,id==='foreign'?'beta':'alpha',id,`gm-${id}`,name);
  }
  sqlite.exec(`INSERT INTO league_memberships (id,league_id,user_id,role,team_id,active) VALUES ('member-a','alpha','a','team_owner','gb',1)`);
  const token='gm-history-test';
  sqlite.prepare(`INSERT INTO sessions (id,user_id,session_token_hash,expires_at) VALUES ('session-a','a',?,'2099-01-01')`).run(await hashToken(token));
  for(const [id,year,status] of [['old',2026,'closed'],['new',2027,'active']]){
    sqlite.prepare(`INSERT INTO franchise_seasons (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status) VALUES (?,'alpha','ea-madden-companion','123',?,'Madden NFL 27',?,?,?)`).run(id,id,`Season ${year}`,year,status);
    sqlite.prepare(`INSERT INTO league_snapshots (id,league_id,status,season_year,week_index,validation_status,manifest_json) VALUES (?,'alpha',?,?,2,'ready','{}')`).run(`snap-${id}`,id==='old'?'archived':'active',year);
  }
  sqlite.exec(`INSERT INTO league_active_snapshots (league_id,snapshot_id,activated_by) VALUES ('alpha','snap-new','a')`);
  const period=sqlite.prepare(`INSERT INTO team_ownership_periods (id,league_id,gm_identity_id,team_key,franchise_season_id,started_at,started_stage,started_week,ended_at,ended_stage,ended_week,assignment_source) VALUES (?,'alpha',?,?,?,'2026-01-01','regular-season',?,?,?,?, 'fixture')`);
  period.run('old-a','identity-a','tb','old',1,'2026-12-31',null,null);
  period.run('old-b','identity-b','gb','old',1,'2026-12-31',null,null);
  period.run('new-a','identity-a','tb','new',1,'2027-01-02','regular-season',2);
  period.run('new-c','identity-c','tb','new',2,null,null,null);
  period.run('new-b','identity-b','gb','new',1,null,null,null);
  const insert=sqlite.prepare(`INSERT INTO league_snapshot_records (league_id,snapshot_id,domain,external_id,data_json) VALUES ('alpha',?,?,?,?)`);
  const record=(season,domain,id,data)=>insert.run(`snap-${season}`,domain,id,JSON.stringify(data));
  for(const season of ['old','new'])for(const [key,suffix,name] of [['tb',1,'Tampa Bay Buccaneers'],['gb',2,'Green Bay Packers']])record(season,'teams',`${season}-${suffix}`,{abbreviation:key.toUpperCase(),display_name:name});
  const game=(season,id,week,home,away)=>record(season,'games',id,{stage:'regular-season',week_index:week,status:'completed',home_team_external_id:`${season}-1`,away_team_external_id:`${season}-2`,home_score:home,away_score:away});
  game('old','reg1',1,24,17);game('old','final',22,21,27);game('new','reg1',1,14,14);game('new','reg2',2,30,10);
  const stats=(season,id,week,team,metrics)=>record(season,'statistics',`${id}-${team}`,{category:'team-game',stage:'regular-season',week_index:week,team_external_id:`${season}-${team}`,metrics_json:JSON.stringify({__gameId:id,...metrics})});
  stats('old','reg1',1,1,{offIntsLost:2,offFumLost:1,defIntsRec:1,defFumRec:0});
  stats('new','reg1',1,1,{offIntsLost:0,offFumLost:0,defIntsRec:0,defFumRec:0});
  stats('new','reg2',2,1,{offIntsLost:0,offFumLost:1,defIntsRec:2,defFumRec:1});
  for(const id of ['a','b'])sqlite.prepare(`INSERT INTO gm_season_summaries (league_id,franchise_season_id,gm_identity_id,teams_json,regular_wins,source_snapshot_id) VALUES ('alpha','old',?, ?,99,'snap-old')`).run(`identity-${id}`,JSON.stringify([id==='a'?'tb':'gb']));
  const context=(slug='alpha',signedIn=true)=>({request:new Request(`https://franchisehq.test/api/leagues/${slug}/ownership-career?view=league`,{headers:signedIn?{cookie:`franchise_hq_session=${token}`}:{}}),params:{leagueSlug:slug},env:{DB:db,FRANCHISE_HQ_DB:db}});
  return{sqlite,db,context,record};
}
