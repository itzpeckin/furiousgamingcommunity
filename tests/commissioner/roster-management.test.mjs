import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT,walkFiles } from '../../tools/lib/project.mjs';
import { moveRosterAsset,onRequestGet,onRequestPost } from '../../functions/api/leagues/[leagueSlug]/roster-management.js';
import { issueBrowserSession } from '../../functions/_lib/auth.js';
import { effectiveRosterOverlays,playerOwnershipStatement } from '../../functions/_lib/roster-ownership.js';
import { applyRosterOverlays } from '../../functions/_lib/trade-center.js';

function d1(sqlite){return{prepare(sql){const statement=sqlite.prepare(sql);let args=[];const prepared={bind(...values){args=values;return prepared},async first(){return statement.get(...args) || null},async all(){return{results:statement.all(...args)}},async run(){return{success:true,meta:{changes:Number(statement.run(...args).changes)}}}};return prepared},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}};}
async function fixture(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const file of(await walkFiles()).filter(file=>/^migrations\/\d+_.+\.sql$/.test(file)).sort())sqlite.exec(await readFile(path.join(ROOT,file),'utf8'));
  for(const league of ['one','two']) {
    sqlite.prepare(`INSERT INTO leagues (id,name,slug,public_status,tenant_status) VALUES (?,?,?,'active','enabled')`).run(league,league,league);
    sqlite.prepare(`INSERT INTO users (id,discord_user_id,discord_username,display_name) VALUES (?,?,?,?)`).run(`commish-${league}`,`discord-${league}`,league,league);
    sqlite.prepare(`INSERT INTO league_memberships (id,league_id,user_id,role,active) VALUES (?,?,?,'commissioner',1)`).run(`member-${league}`,league,`commish-${league}`);
    sqlite.prepare(`INSERT INTO franchise_seasons (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES (?,?,'madden-companion',?,'2026','Madden NFL 27','2026',2026,'active')`).run(`season-${league}`,league,`franchise-${league}`);
    sqlite.prepare(`INSERT INTO league_snapshots (id,league_id,status,season_year,week_index,manifest_json,validation_status) VALUES (?,?,'active',2026,14,'{}','ready')`).run(`snapshot-${league}`,league);
    sqlite.prepare(`INSERT INTO league_active_snapshots (league_id,snapshot_id) VALUES (?,?)`).run(league,`snapshot-${league}`);
    for(const [externalId,abbreviation,displayName] of [['1','TB','Buccaneers'],['2','NE','Patriots'],['3','GB','Packers']])sqlite.prepare(`INSERT INTO league_snapshot_records
      (snapshot_id,league_id,domain,external_id,data_json) VALUES (?,?,'teams',?,?)`).run(`snapshot-${league}`,league,externalId,JSON.stringify({external_id:externalId,abbreviation,display_name:displayName}));
    sqlite.prepare(`INSERT INTO player_identities (id,league_id,public_id,display_name) VALUES (?,?,?,?)`).run(`identity-${league}`,league,`plr_${league==='one'?'a':'b'.repeat(1)}`.padEnd(36,league==='one'?'a':'b'),'Test Player');
    sqlite.prepare(`INSERT INTO player_source_aliases (league_id,source_system,source_franchise_id,source_player_id,player_identity_id,first_seen_season_id,last_seen_season_id)
      VALUES (?,'madden-companion',?,?,?,?,?)`).run(league,`franchise-${league}`,`player-${league}`,`identity-${league}`,`season-${league}`,`season-${league}`);
    sqlite.prepare(`INSERT INTO league_snapshot_records (snapshot_id,league_id,domain,external_id,data_json) VALUES (?,?,'players',?,?)`)
      .run(`snapshot-${league}`,league,`player-${league}`,JSON.stringify({external_id:`player-${league}`,team_external_id:'1',display_name:'Test Player',position:'CB',overall:89}));
    sqlite.prepare(`INSERT INTO league_draft_picks (id,league_id,franchise_season_id,draft_class,round,original_team_key,current_team_key,revision)
      VALUES (?,?,?,2027,1,'tb','tb',1)`).run(`pick-${league}`,league,`season-${league}`);
  }
  const db=d1(sqlite),teams=[{teamKey:'tb',externalId:'1',displayName:'Buccaneers'},{teamKey:'ne',externalId:'2',displayName:'Patriots'},{teamKey:'gb',externalId:'3',displayName:'Packers'}];
  const c={db,league:{id:'one',name:'One',slug:'one'},teams,session:{user:{id:'commish-one',displayName:'Commissioner One'},membership:{role:'commissioner'}},period:{snapshotId:'snapshot-one',franchiseSeasonId:'season-one',seasonYear:2026,week:14},request:new Request('https://franchisehq.app/api/leagues/one/roster-management',{method:'POST'})};
  const body=(type='draft-pick',id='pick-one',revision=1)=>({requestId:crypto.randomUUID(),assetType:type,assetId:id,fromTeamKey:'tb',toTeamKey:'ne',expectedRevision:revision,snapshotId:'snapshot-one',reason:'Ownership correction'});
  return{sqlite,db,c,body};
}
test('migration 41 starts empty and preserves pick ownership; commissioner transfers are atomic, audited and retry-safe',async()=>{
  const {sqlite,c,body}=await fixture();try{
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM league_player_ownership').get().count,0);
    const request=body(),result=await moveRosterAsset(c,request);assert.equal(result.replayed,false);
    assert.equal(sqlite.prepare(`SELECT current_team_key FROM league_draft_picks WHERE id='pick-one'`).get().current_team_key,'ne');
    assert.equal(sqlite.prepare(`SELECT current_team_key FROM league_draft_picks WHERE id='pick-two'`).get().current_team_key,'tb');
    assert.equal((await moveRosterAsset(c,request)).replayed,true);
    for(const table of ['commissioner_roster_movements','tenant_audit_events','draft_pick_ledger_events','canonical_transactions','league_transaction_history'])assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM ${table}`).get().count,1,table);
    assert.equal(sqlite.prepare(`SELECT snapshot_id FROM league_active_snapshots WHERE league_id='one'`).get().snapshot_id,'snapshot-one');
    assert.equal(sqlite.prepare(`SELECT COUNT(*) count FROM trade_workflows`).get().count,0);
    assert.throws(()=>sqlite.exec('DELETE FROM commissioner_roster_movements'),/append-only/);
    assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{sqlite.close()}
});

test('HTTP directory and writes require this league’s commissioner; audit activity is visible only to active league members',async()=>{
  const {sqlite,db,c,body}=await fixture();try{
    const env={DB:db};
    const issued=await issueBrowserSession({env,request:new Request('https://franchisehq.app/api/auth/discord/callback')},'commish-one',{leagueId:'one'});
    const context=(suffix='',method='GET',value)=>({env,params:{leagueSlug:'one'},request:new Request(`https://franchisehq.app/api/leagues/one/roster-management${suffix}`,{method,headers:{cookie:`franchise_hq_session=${issued.rawSessionToken}`,'content-type':'application/json'},body:value===undefined?undefined:JSON.stringify(value)})});
    let response=await onRequestGet(context());assert.equal(response.status,200);assert.equal((await response.json()).items[0].assetId,'pick-one');
    response=await onRequestPost(context('','POST',body()));assert.equal(response.status,200);
    response=await onRequestGet(context('?type=player&team=TB'));assert.equal(response.status,200);assert.equal((await response.json()).items[0].assetId,'identity-one');
    response=await onRequestPost(context('','POST',null));assert.equal(response.status,400);
    sqlite.exec(`UPDATE league_memberships SET role='team_owner' WHERE id='member-one'`);
    assert.equal((await onRequestGet(context())).status,403);
    assert.equal((await onRequestPost(context('','POST',body()))).status,403);
    response=await onRequestGet(context('?view=activity'));assert.equal(response.status,200);assert.equal((await response.json()).movements.length,1);
    const other=context('?view=activity');other.params.leagueSlug='two';other.request=new Request('https://franchisehq.app/api/leagues/two/roster-management?view=activity',{headers:{cookie:`franchise_hq_session=${issued.rawSessionToken}`}});
    assert.equal((await onRequestGet(other)).status,404);
    sqlite.exec(`UPDATE league_memberships SET active=0 WHERE id='member-one'`);
    assert.equal((await onRequestGet(context('?view=activity'))).status,404);
  }finally{sqlite.close()}
});
test('manual player ownership survives imports and later trades can move that player again',async()=>{
  const {sqlite,db,c,body}=await fixture();try{
    await moveRosterAsset(c,body('player','identity-one',0));
    let overlays=await effectiveRosterOverlays(db,'one');assert.equal(applyRosterOverlays([{id:'player-one',teamId:'1'}],overlays,new Map([['ne','2']]))[0].teamId,'2');
    // Imported source continues to say TB; FranchiseHQ ownership remains NE.
    sqlite.prepare(`UPDATE league_snapshot_records SET data_json=? WHERE league_id='one' AND domain='players'`).run(JSON.stringify({external_id:'player-one',team_external_id:'1',display_name:'Test Player'}));
    overlays=await effectiveRosterOverlays(db,'one');assert.equal(overlays.at(-1).to_team_key,'ne');
    await playerOwnershipStatement(db,{leagueId:'one',playerIdentityId:'identity-one',sourcePlayerId:'player-one',toTeamKey:'gb',snapshotId:'snapshot-one',actorUserId:'commish-one',sourceType:'trade'}).run();
    assert.equal((await effectiveRosterOverlays(db,'one')).at(-1).to_team_key,'gb');
    assert.equal(sqlite.prepare(`SELECT revision FROM league_player_ownership`).get().revision,2);
    assert.equal((await effectiveRosterOverlays(db,'two')).length,0);
  }finally{sqlite.close()}
});
test('cross-league, stale, unassigned and non-commissioner transfers cannot change ownership or create false audits',async()=>{
  const {sqlite,c,body}=await fixture();try{
    await assert.rejects(()=>moveRosterAsset(c,body('draft-pick','pick-two')),error=>error.status===404);
    await assert.rejects(()=>moveRosterAsset(c,{...body(),expectedRevision:0}),error=>error.status===409);
    await assert.rejects(()=>moveRosterAsset(c,{...body(),snapshotId:'old'}),error=>error.status===409);
    await assert.rejects(()=>moveRosterAsset({...c,session:{...c.session,membership:{role:'team_owner'}}},body()),error=>error.status===403);
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM tenant_audit_events').get().count,0);
    assert.equal(sqlite.prepare('SELECT current_team_key FROM league_draft_picks WHERE id=?').get('pick-one').current_team_key,'tb');
  }finally{sqlite.close()}
});
test('database guards roll back the complete movement if ownership changes between validation and commit',async()=>{
  const {sqlite,db,c,body}=await fixture();try{
    const batch=db.batch.bind(db);db.batch=async statements=>{sqlite.exec(`UPDATE league_draft_picks SET revision=2,current_team_key='gb' WHERE id='pick-one'`);return batch(statements)};
    await assert.rejects(()=>moveRosterAsset(c,body()),error=>error.status===409);
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM commissioner_roster_movements').get().count,0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM tenant_audit_events').get().count,0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM draft_pick_ledger_events').get().count,0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) count FROM canonical_transactions').get().count,0);
  }finally{sqlite.close()}
});
