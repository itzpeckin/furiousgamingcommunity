import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';
import {
  applyRosterOverlays,
  normalizeTradeCenterSettings,
  normalizeTradeTransfers,
  reconciliationOutcome,
  stableDraftPickId,
  workflowDecision
} from '../../functions/_lib/trade-center.js';
import { reconcileTradeRosterOverlays } from '../../functions/_lib/trade-reconciliation.js';
import { hashToken, AUTH_CONSTANTS } from '../../functions/_lib/auth.js';
import { onRequestGet as getTradeCenter, onRequestPost as postTradeCenter } from '../../functions/api/leagues/[leagueSlug]/trade-center.js';

async function migrationFiles(){return(await walkFiles()).filter(file=>/^migrations\/\d+_.+\.sql$/.test(file)).sort()}
async function migrate(database){for(const file of await migrationFiles())database.exec(await readFile(path.join(ROOT,file),'utf8'))}
function d1(database){return{
  prepare(sql){let values=[];const statement=database.prepare(sql);const api={
    bind(...next){values=next;return api},
    async first(){return statement.get(...values)||null},
    async all(){return{results:statement.all(...values)}},
    async run(){const result=statement.run(...values);return{success:true,meta:{changes:Number(result.changes||0)}}}
  };return api},
  async batch(statements){const results=[];database.exec('BEGIN');try{for(const statement of statements)results.push(await statement.run());database.exec('COMMIT');return results}catch(error){database.exec('ROLLBACK');throw error}}
}}

test('trade settings and transfer limits are normalized server-side',()=>{
  const settings=normalizeTradeCenterSettings({seasonTradeLimit:0,maxPlayersPerTeam:2,maxPicksPerTeam:1,calculatorEnabled:false,reviewApprovalThreshold:3});
  assert.equal(settings.seasonTradeLimit,1);
  assert.equal(settings.calculatorEnabled,false);
  const valid=normalizeTradeTransfers([
    {type:'player',assetId:'player-a',fromTeamId:'TB',toTeamId:'GB'},
    {type:'pick',assetId:'pick-a',fromTeamId:'gb',toTeamId:'tb'}
  ],settings);
  assert.deepEqual(valid.participants.sort(),['gb','tb']);
  assert.throws(()=>normalizeTradeTransfers([
    {type:'player',assetId:'a',fromTeamId:'tb',toTeamId:'gb'},
    {type:'player',assetId:'b',fromTeamId:'tb',toTeamId:'gb'},
    {type:'player',assetId:'c',fromTeamId:'tb',toTeamId:'gb'},
    {type:'pick',assetId:'p',fromTeamId:'gb',toTeamId:'tb'}
  ],settings),/player limit/i);
  assert.equal(stableDraftPickId({leagueId:'league-1',franchiseSeasonId:'season-1',draftClass:2027,round:1,originalTeamKey:'TB'}),'pick:league-1:season-1:2027:1:tb');
});

test('three matching non-conflicted review decisions resolve the workflow',()=>{
  assert.deepEqual(workflowDecision([
    {reviewerUserId:'a',decision:'approve'},
    {reviewerUserId:'b',decision:'approve'},
    {reviewerUserId:'c',decision:'approve'},
    {reviewerUserId:'c',decision:'reject'}
  ],3),{approvals:2,rejections:1,abstentions:0,result:null,threshold:3});
  assert.equal(workflowDecision([
    {reviewerUserId:'a',decision:'reject'},
    {reviewerUserId:'b',decision:'reject'},
    {reviewerUserId:'c',decision:'reject'}
  ],3).result,'rejected');
});

test('draft picks can be re-traded by the ledger owner while stale ownership aborts atomically',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await migrate(database);
    database.prepare(`INSERT INTO leagues (id,name,product_name,slug,public_status,tenant_status) VALUES (?,?,?,?,?,?)`).run('league-1','League','FranchiseHQ','league','active','enabled');
    database.prepare(`INSERT INTO users (id,discord_user_id,discord_username,display_name) VALUES (?,?,?,?)`).run('user-1','discord-1','owner','Owner');
    database.prepare(`INSERT INTO franchise_seasons (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,status) VALUES (?,?,?,?,?,?,?,'active')`).run('season-1','league-1','madden-companion','franchise-1','2026','Madden NFL 27','2026');
    database.prepare(`INSERT INTO league_draft_picks (id,league_id,franchise_season_id,draft_class,round,original_team_key,current_team_key) VALUES (?,?,?,?,?,?,?)`).run('pick-1','league-1','season-1',2027,1,'tb','tb');
    const insertTrade=(tradeId,from,to)=>{
      database.prepare(`INSERT INTO trade_workflows (id,league_id,franchise_season_id,status,mutation_token,proposer_user_id,proposer_team_key) VALUES (?,?,?,'committee',?,?,?)`).run(tradeId,'league-1','season-1',`mutation-${tradeId}`,'user-1',from);
      database.prepare(`INSERT INTO trade_workflow_assets (id,trade_id,league_id,revision,asset_type,draft_pick_id,from_team_key,to_team_key) VALUES (?,?,?,1,'draft-pick',?,?,?)`).run(`asset-${tradeId}`,tradeId,'league-1','pick-1',from,to);
    };
    insertTrade('trade-1','tb','gb');
    database.prepare(`UPDATE trade_workflows SET status='approved' WHERE id='trade-1'`).run();
    database.prepare(`UPDATE league_draft_picks SET current_team_key='gb',revision=revision+1 WHERE id='pick-1'`).run();
    insertTrade('trade-2','gb','kc');
    database.prepare(`UPDATE trade_workflows SET status='approved' WHERE id='trade-2'`).run();
    database.prepare(`UPDATE league_draft_picks SET current_team_key='kc',revision=revision+1 WHERE id='pick-1'`).run();
    insertTrade('trade-stale','gb','tb');
    assert.throws(()=>database.prepare(`UPDATE trade_workflows SET status='approved' WHERE id='trade-stale'`).run(),/ownership changed/i);
    assert.equal(database.prepare(`SELECT status FROM trade_workflows WHERE id='trade-stale'`).get().status,'committee');
    assert.equal(database.prepare(`SELECT current_team_key AS teamKey FROM league_draft_picks WHERE id='pick-1'`).get().teamKey,'kc');
  }finally{database.close()}
});

test('approved player overlays change presentation without mutating Madden records',()=>{
  const source=[{id:'madden-player-1',teamId:'1',source:{teamId:'1'}}];
  const result=applyRosterOverlays(source,[{source_player_id:'madden-player-1',to_team_key:'gb',internal_status:'active'}],new Map([['gb','2']]));
  assert.equal(result[0].teamId,'2');
  assert.equal(source[0].teamId,'1');
  assert.equal(reconciliationOutcome('gb','gb','tb'),'matched');
  assert.equal(reconciliationOutcome('gb','tb','tb'),'reverted');
  assert.equal(reconciliationOutcome('gb','kc','tb'),'different-team');
});

test('a matching Madden roster publishes one detected transaction without public workflow labels',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await migrate(database);
    database.prepare(`INSERT INTO leagues (id,name,product_name,slug,public_status,tenant_status) VALUES (?,?,?,?,?,?)`).run('league-1','League','FranchiseHQ','league','active','enabled');
    database.prepare(`INSERT INTO users (id,discord_user_id,discord_username,display_name) VALUES (?,?,?,?)`).run('user-1','discord-1','owner','Owner');
    database.prepare(`INSERT INTO franchise_seasons (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,status) VALUES (?,?,?,?,?,?,?,'active')`).run('season-1','league-1','madden-companion','franchise-1','2026','Madden NFL 27','2026');
    database.prepare(`INSERT INTO player_identities (id,league_id,public_id,display_name) VALUES (?,?,?,?)`).run('identity-1','league-1','vita-vea','Vita Vea');
    for(const [id,status] of [['snapshot-old','archived'],['snapshot-new','active']])database.prepare(`INSERT INTO league_snapshots (id,league_id,status,manifest_json,validation_status) VALUES (?,?,?,'{}','ready')`).run(id,'league-1',status);
    database.prepare(`INSERT INTO league_active_snapshots (league_id,snapshot_id) VALUES ('league-1','snapshot-new')`).run();
    for(const [externalId,abbr] of [['1','TB'],['2','GB']])database.prepare(`INSERT INTO league_snapshot_records (snapshot_id,league_id,domain,external_id,data_json) VALUES ('snapshot-new','league-1','teams',?,?)`).run(externalId,JSON.stringify({external_id:externalId,abbreviation:abbr,display_name:abbr}));
    database.prepare(`INSERT INTO league_snapshot_records (snapshot_id,league_id,domain,external_id,data_json) VALUES ('snapshot-new','league-1','players','player-1',?)`).run(JSON.stringify({external_id:'player-1',team_external_id:'2'}));
    database.prepare(`INSERT INTO trade_workflows (id,league_id,franchise_season_id,status,mutation_token,proposer_user_id,proposer_team_key,approved_at) VALUES (?,?,?,'approved','test-mutation',?,?,CURRENT_TIMESTAMP)`).run('trade-1','league-1','season-1','user-1','tb');
    database.prepare(`INSERT INTO trade_roster_overlays (trade_id,league_id,player_identity_id,source_player_id,from_team_key,to_team_key,source_snapshot_id) VALUES (?,?,?,?,?,?,?)`).run('trade-1','league-1','identity-1','player-1','tb','gb','snapshot-old');
    database.prepare(`INSERT INTO canonical_transactions (id,league_id,event_type,authority,execution_status,workflow_trade_id) VALUES (?,?,'trade','trade-center','pending-madden-execution',?)`).run('transaction-1','league-1','trade-1');
    const result=await reconcileTradeRosterOverlays(d1(database),'league-1','snapshot-new');
    const transaction=database.prepare(`SELECT authority,execution_status AS executionStatus FROM canonical_transactions`).get();
    assert.equal(result.matched,1);
    assert.equal(transaction.authority,'snapshot-inferred');
    assert.equal(transaction.executionStatus,'observed-roster');
    assert.equal(database.prepare(`SELECT slot_released_at AS releasedAt FROM trade_workflows`).get().releasedAt,null);
  }finally{database.close()}
});

test('a later Madden snapshot wins once and retains internal reconciliation evidence',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await migrate(database);
    database.prepare(`INSERT INTO leagues (id,name,product_name,slug,public_status,tenant_status) VALUES (?,?,?,?,?,?)`).run('league-1','League','FranchiseHQ','league','active','enabled');
    database.prepare(`INSERT INTO users (id,discord_user_id,discord_username,display_name) VALUES (?,?,?,?)`).run('user-1','discord-1','owner','Owner');
    database.prepare(`INSERT INTO franchise_seasons (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,status) VALUES (?,?,?,?,?,?,?,'active')`).run('season-1','league-1','madden-companion','franchise-1','2026','Madden NFL 27','2026');
    database.prepare(`INSERT INTO player_identities (id,league_id,public_id,display_name) VALUES (?,?,?,?)`).run('identity-1','league-1','vita-vea','Vita Vea');
    database.prepare(`INSERT INTO player_source_aliases (league_id,source_system,source_franchise_id,source_player_id,player_identity_id,first_seen_season_id,last_seen_season_id) VALUES (?,?,?,?,?,?,?)`).run('league-1','madden-companion','franchise-1','player-1','identity-1','season-1','season-1');
    for(const [id,status] of [['snapshot-old','archived'],['snapshot-new','active']])database.prepare(`INSERT INTO league_snapshots (id,league_id,status,manifest_json,validation_status) VALUES (?,?,?,'{}','ready')`).run(id,'league-1',status);
    for(const [externalId,abbr] of [['1','TB'],['2','GB'],['3','KC']])database.prepare(`INSERT INTO league_snapshot_records (snapshot_id,league_id,domain,external_id,data_json) VALUES ('snapshot-new','league-1','teams',?,?)`).run(externalId,JSON.stringify({external_id:externalId,abbreviation:abbr,display_name:abbr}));
    database.prepare(`INSERT INTO league_snapshot_records (snapshot_id,league_id,domain,external_id,data_json) VALUES ('snapshot-new','league-1','players','player-1',?)`).run(JSON.stringify({external_id:'player-1',team_external_id:'3'}));
    database.prepare(`INSERT INTO league_active_snapshots (league_id,snapshot_id) VALUES ('league-1','snapshot-new')`).run();
    database.prepare(`INSERT INTO trade_workflows (id,league_id,franchise_season_id,status,mutation_token,proposer_user_id,proposer_team_key,approved_at) VALUES (?,?,?,'approved','test-mutation',?,?,CURRENT_TIMESTAMP)`).run('trade-1','league-1','season-1','user-1','tb');
    database.prepare(`INSERT INTO trade_roster_overlays (trade_id,league_id,player_identity_id,source_player_id,from_team_key,to_team_key,source_snapshot_id) VALUES (?,?,?,?,?,?,?)`).run('trade-1','league-1','identity-1','player-1','tb','gb','snapshot-old');
    database.prepare(`INSERT INTO canonical_transactions (id,league_id,event_type,workflow_trade_id) VALUES (?,?,?,?)`).run('transaction-1','league-1','trade','trade-1');
    const first=await reconcileTradeRosterOverlays(d1(database),'league-1','snapshot-new');
    const second=await reconcileTradeRosterOverlays(d1(database),'league-1','snapshot-new');
    assert.equal(first.differentTeam,1);
    assert.equal(second.checked,0);
    assert.equal(database.prepare(`SELECT internal_status FROM trade_roster_overlays`).get().internal_status,'superseded');
    assert.equal(database.prepare(`SELECT outcome FROM trade_reconciliation_events`).get().outcome,'different-team');
    assert.equal(database.prepare(`SELECT execution_status FROM canonical_transactions`).get().execution_status,'madden-overridden');
    assert.ok(database.prepare(`SELECT slot_released_at AS releasedAt FROM trade_workflows`).get().releasedAt);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM trade_reconciliation_events`).get().count,1);
  }finally{database.close()}
});

test('authenticated owners share proposals while commissioner-only controls stay protected',async()=>{
  const database=new DatabaseSync(':memory:');
  try{
    database.exec('PRAGMA foreign_keys=ON');await migrate(database);
    database.prepare(`INSERT INTO leagues (id,name,product_name,slug,public_status,tenant_status) VALUES (?,?,?,?,?,?)`).run('league-1','League','FranchiseHQ','league','active','enabled');
    for(const [id,discord,name,role,team] of [
      ['owner-tb','d-tb','TB Owner','team_owner','1'],
      ['owner-gb','d-gb','GB Owner','team_owner','2'],
      ['commissioner','d-c','Commissioner','commissioner',null],
      ['reviewer-2','d-r2','Reviewer Two','commissioner',null],
      ['reviewer-3','d-r3','Reviewer Three','commissioner',null]
    ]){
      database.prepare(`INSERT INTO users (id,discord_user_id,discord_username,display_name) VALUES (?,?,?,?)`).run(id,discord,id,name);
      database.prepare(`INSERT INTO league_memberships (id,league_id,user_id,role,team_id,active) VALUES (?,?,?,?,?,1)`).run(`membership-${id}`,'league-1',id,role,team);
    }
    const tokens={tb:'session-token-tb',gb:'session-token-gb',commissioner:'session-token-commissioner',reviewer2:'session-token-reviewer-2',reviewer3:'session-token-reviewer-3'};
    for(const [key,userId] of [['tb','owner-tb'],['gb','owner-gb'],['commissioner','commissioner'],['reviewer2','reviewer-2'],['reviewer3','reviewer-3']])database.prepare(`INSERT INTO sessions (id,user_id,session_token_hash,expires_at) VALUES (?,?,?,?)`).run(`session-${key}`,userId,await hashToken(tokens[key]),'2099-01-01T00:00:00.000Z');
    database.prepare(`INSERT INTO franchise_seasons (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status) VALUES (?,?,?,?,?,?,?,?,?)`).run('season-1','league-1','madden-companion','franchise-1','2026','Madden NFL 27','2026',2026,'active');
    database.prepare(`INSERT INTO league_snapshots (id,league_id,status,manifest_json,validation_status) VALUES (?,?,?,'{}','ready')`).run('snapshot-1','league-1','active');
    database.prepare(`INSERT INTO league_active_snapshots (league_id,snapshot_id) VALUES (?,?)`).run('league-1','snapshot-1');
    for(const [externalId,abbr] of [['1','TB'],['2','GB']])database.prepare(`INSERT INTO league_snapshot_records (snapshot_id,league_id,domain,external_id,data_json) VALUES ('snapshot-1','league-1','teams',?,?)`).run(externalId,JSON.stringify({external_id:externalId,abbreviation:abbr,display_name:abbr}));
    for(const [sourceId,teamId,identityId,publicId,name] of [['player-tb','1','identity-tb','player-tb-public','TB Player'],['player-gb','2','identity-gb','player-gb-public','GB Player']]){
      database.prepare(`INSERT INTO league_snapshot_records (snapshot_id,league_id,domain,external_id,data_json) VALUES ('snapshot-1','league-1','players',?,?)`).run(sourceId,JSON.stringify({external_id:sourceId,team_external_id:teamId,display_name:name}));
      database.prepare(`INSERT INTO player_identities (id,league_id,public_id,display_name) VALUES (?,?,?,?)`).run(identityId,'league-1',publicId,name);
      database.prepare(`INSERT INTO player_source_aliases (league_id,source_system,source_franchise_id,source_player_id,player_identity_id,first_seen_season_id,last_seen_season_id) VALUES (?,?,?,?,?,?,?)`).run('league-1','madden-companion','franchise-1',sourceId,identityId,'season-1','season-1');
    }
    const db=d1(database);
    const context=(token,method='GET',body=null)=>({
      params:{leagueSlug:'league'},env:{DB:db},
      request:new Request('https://franchisehq.app/api/leagues/league/trade-center',{method,headers:{Cookie:`${AUTH_CONSTANTS.SESSION_COOKIE_NAME}=${token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
    });
    const forbidden=await postTradeCenter(context(tokens.tb,'POST',{action:'seed-picks',draftClasses:[2027]}));
    assert.equal(forbidden.status,403);
    const proposed=await postTradeCenter(context(tokens.tb,'POST',{action:'propose',note:'Player swap',transfers:[
      {type:'player',assetId:'player-tb',fromTeamId:'tb',toTeamId:'gb'},
      {type:'player',assetId:'player-gb',fromTeamId:'gb',toTeamId:'tb'}
    ]}));
    const proposedPayload=await proposed.clone().json();
    assert.equal(proposed.status,200,JSON.stringify(proposedPayload));
    const recipient=await getTradeCenter(context(tokens.gb));
    const payload=await recipient.json();
    assert.equal(payload.workflows.length,1);
    assert.equal(payload.workflows[0].status,'negotiating');
    assert.equal(payload.notifications[0].type,'received');
    const tradeId=proposedPayload.tradeId;
    const stale=await postTradeCenter(context(tokens.gb,'POST',{action:'accept',tradeId,revision:0}));
    assert.equal(stale.status,409);
    const accepted=await postTradeCenter(context(tokens.gb,'POST',{action:'accept',tradeId,revision:1}));
    assert.equal(accepted.status,200);
    assert.equal((await accepted.clone().json()).workflows[0].status,'committee');
    for(const token of [tokens.commissioner,tokens.reviewer2,tokens.reviewer3]){
      const reviewed=await postTradeCenter(context(token,'POST',{action:'review',tradeId,revision:1,decision:'approve'}));
      assert.equal(reviewed.status,200,JSON.stringify(await reviewed.clone().json()));
    }
    assert.equal(database.prepare(`SELECT status FROM trade_workflows WHERE id=?`).get(tradeId).status,'approved');
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM trade_roster_overlays WHERE trade_id=? AND internal_status='active'`).get(tradeId).count,2);
    const duplicate=await postTradeCenter(context(tokens.tb,'POST',{action:'propose',note:'Duplicate player',transfers:[
      {type:'player',assetId:'player-gb',fromTeamId:'tb',toTeamId:'gb'},
      {type:'player',assetId:'player-tb',fromTeamId:'gb',toTeamId:'tb'}
    ]}));
    assert.equal(duplicate.status,409);
    const commissionerSeed=await postTradeCenter(context(tokens.commissioner,'POST',{action:'seed-picks',draftClasses:[2027]}));
    assert.equal(commissionerSeed.status,200);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM league_draft_picks`).get().count,14);
  }finally{database.close()}
});

test('7.4.0 client uses server state and contains no public reconciliation labels',async()=>{
  const [client,endpoint,readModel,qualityGate]=await Promise.all([
    readFile(new URL('../../league-engine/trade-center-live.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/trade-center.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/snapshot/read-model.js',import.meta.url),'utf8'),
    readFile(new URL('../../tools/run-quality.mjs',import.meta.url),'utf8')
  ]);
  assert.match(client,/\/trade-center`/);
  assert.match(client,/data-live-submit-trade/);
  assert.match(endpoint,/pending-madden-execution/);
  assert.match(readModel,/applyRosterOverlays/);
  assert.match(qualityGate,/tests\/trade\/full-trade-center\.test\.mjs/);
  assert.doesNotMatch(client,/pending madden|madden confirmed|reconciliation status/i);
});
