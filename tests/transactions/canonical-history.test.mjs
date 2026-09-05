import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';
import { AUTH_CONSTANTS, hashToken } from '../../functions/_lib/auth.js';
import {
  onRequestGet as getCanonicalTransactions,
  onRequestPost as postCanonicalTransactions
} from '../../functions/api/leagues/[leagueSlug]/transactions/canonical.js';

async function migrate(database){
  const files=(await walkFiles()).filter(file=>/^migrations\/\d+_.+\.sql$/.test(file)).sort();
  for(const file of files)database.exec(await readFile(path.join(ROOT,file),'utf8'));
}

function d1(database){
  const statement=(sql,values=[])=>({
    bind(...next){return statement(sql,next)},
    async first(){return database.prepare(sql).get(...values)||null},
    async all(){return{results:database.prepare(sql).all(...values)}},
    async run(){const result=database.prepare(sql).run(...values);return{success:true,meta:{changes:Number(result.changes||0)}}}
  });
  return{
    prepare:sql=>statement(sql),
    async batch(statements){
      database.exec('BEGIN IMMEDIATE');
      try{const results=[];for(const item of statements)results.push(await item.run());database.exec('COMMIT');return results}
      catch(error){database.exec('ROLLBACK');throw error}
    }
  };
}

async function fixture(){
  const database=new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys=ON');
  await migrate(database);
  database.prepare(`INSERT INTO leagues (id,name,product_name,slug,public_status,tenant_status)
    VALUES ('league-1','League One','FranchiseHQ','league-one','active','enabled'),
           ('league-2','League Two','FranchiseHQ','league-two','active','enabled')`).run();
  for(const [id,role,token] of [['member','team_owner','member-token'],['commissioner','commissioner','commissioner-token']]){
    database.prepare(`INSERT INTO users (id,discord_user_id,discord_username,display_name) VALUES (?,?,?,?)`)
      .run(id,`discord-${id}`,id,id==='member'?'League Member':'Commissioner');
    database.prepare(`INSERT INTO league_memberships (id,league_id,user_id,role,team_id,active) VALUES (?,?,?,?,?,1)`)
      .run(`membership-${id}`,'league-1',id,role,role==='team_owner'?'tb':null);
    database.prepare(`INSERT INTO sessions (id,user_id,session_token_hash,expires_at) VALUES (?,?,?,?)`)
      .run(`session-${id}`,id,await hashToken(token),'2099-01-01T00:00:00.000Z');
  }
  const insertTransaction=(id,leagueId,eventType,authority,executionStatus,playerId='player-1')=>{
    database.prepare(`INSERT INTO canonical_transactions
      (id,league_id,event_type,authority,execution_status,season,week,team_ids_json,player_ids_json)
      VALUES (?,?,?,?,?,2026,11,'["tb","gb"]',?)`).run(id,leagueId,eventType,authority,executionStatus,JSON.stringify([playerId]));
  };
  insertTransaction('public-transaction','league-1','team-change','snapshot-inferred','observed-roster');
  insertTransaction('pending-trade','league-1','trade','franchisehq-workflow','pending-madden-execution','player-2');
  insertTransaction('private-status','league-1','roster-status-change','snapshot-inferred','observed-roster','player-3');
  insertTransaction('other-league','league-2','team-change','snapshot-inferred','observed-roster','player-4');
  database.prepare(`INSERT INTO canonical_transaction_evidence
    (id,league_id,transaction_id,source_type,source_key,evidence_json)
    VALUES (?,?,?,?,?,?)`).run('evidence-1','league-1','public-transaction','snapshot-diff','private-source-key',JSON.stringify({
      eventType:'team-change',moves:[{playerId:'player-1',playerName:'Test Player',position:'WR',overall:88,fromTeamId:'tb',toTeamId:'gb',rawSecret:'not-public'}]
    }));
  const db=d1(database);
  const context=(token,method='GET',body=null,suffix='')=>({
    params:{leagueSlug:'league-one'},env:{DB:db},
    request:new Request(`https://franchisehq.app/api/leagues/league-one/transactions/canonical${suffix}`,{
      method,headers:{Cookie:`${AUTH_CONSTANTS.SESSION_COOKIE_NAME}=${token}`,'content-type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})
    })
  });
  return{database,context};
}

test('active league members see only public executed tenant transactions',async()=>{
  const {database,context}=await fixture();
  try{
    const response=await getCanonicalTransactions(context('member-token'));
    const payload=await response.json();
    assert.equal(response.status,200);
    assert.equal(payload.permissions.canCorrect,false);
    assert.deepEqual(payload.transactions.map(item=>item.id),['public-transaction']);
    assert.equal(payload.transactions[0].permanentHref,'/leagues/league-one#transactions/public-transaction');
    assert.equal(payload.transactions[0].participants[0].name,'Test Player');
    assert.equal(payload.transactions[0].evidence[0].sourceKey,undefined);
    assert.equal(payload.transactions[0].evidence[0].evidence.moves[0].rawSecret,undefined);

    const denied=await postCanonicalTransactions(context('member-token','POST',{
      action:'correct',transactionId:'public-transaction',correctionRevision:0,eventType:'trade',reason:'Incorrect source classification.'
    }));
    assert.equal(denied.status,403);
  }finally{database.close()}
});

test('commissioner corrections are append-only, audited, permanent, and revision guarded',async()=>{
  const {database,context}=await fixture();
  try{
    const corrected=await postCanonicalTransactions(context('commissioner-token','POST',{
      action:'correct',transactionId:'public-transaction',correctionRevision:0,eventType:'trade',season:2026,week:10,
      occurredAt:'2026-09-04T12:00:00.000Z',reason:'Confirmed reciprocal league trade evidence.'
    }));
    const result=await corrected.json();
    assert.equal(corrected.status,200,JSON.stringify(result));
    assert.equal(result.evidenceChanged,false);
    assert.equal(database.prepare(`SELECT event_type FROM canonical_transactions WHERE id='public-transaction'`).get().event_type,'team-change');
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM canonical_transaction_corrections`).get().count,1);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM tenant_audit_events WHERE action='canonical-transaction.correct'`).get().count,1);

    const read=await getCanonicalTransactions(context('commissioner-token','GET',null,'?transactionId=public-transaction'));
    const payload=await read.json(),transaction=payload.transactions[0];
    assert.equal(payload.permissions.canCorrect,true);
    assert.equal(transaction.eventType,'trade');
    assert.equal(transaction.week,10);
    assert.equal(transaction.corrected,true);
    assert.equal(transaction.original.eventType,'team-change');
    assert.equal(transaction.corrections[0].reason,'Confirmed reciprocal league trade evidence.');

    database.prepare(`DELETE FROM canonical_transaction_evidence WHERE transaction_id='public-transaction'`).run();
    database.prepare(`DELETE FROM canonical_transactions WHERE id='public-transaction'`).run();
    const retained=await getCanonicalTransactions(context('commissioner-token','GET',null,'?transactionId=public-transaction'));
    const retainedPayload=await retained.json(),retainedTransaction=retainedPayload.transactions[0];
    assert.equal(retained.status,200);
    assert.equal(retainedTransaction.id,'public-transaction');
    assert.equal(retainedTransaction.eventType,'trade');
    assert.equal(retainedTransaction.participants[0].name,'Test Player');
    assert.equal(retainedTransaction.evidence[0].sourceType,'snapshot-diff');
    assert.equal(retainedTransaction.sourceCount,1);
    assert.deepEqual(retainedTransaction.sourceTypes,['snapshot-diff']);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM canonical_transaction_corrections`).get().count,1);

    const stale=await postCanonicalTransactions(context('commissioner-token','POST',{
      action:'correct',transactionId:'public-transaction',correctionRevision:0,eventType:'release',reason:'Stale edit must fail.'
    }));
    assert.equal(stale.status,409);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM canonical_transaction_corrections`).get().count,1);
  }finally{database.close()}
});

test('repeated workflow and roster evidence stays idempotent with before and after team states',async()=>{
  const {database,context}=await fixture();
  try{
    const baseline=await postCanonicalTransactions(context('commissioner-token','POST',{
      action:'sync',snapshotId:'roster-snapshot-10',season:2026,week:10,
      roster:[{playerId:'player-sync',playerName:'Synced Player',position:'HB',teamId:'tb',rosterStatus:'active'}]
    }));
    assert.equal(baseline.status,200,JSON.stringify(await baseline.clone().json()));

    const updateBody={
      action:'sync',snapshotId:'roster-snapshot-11',season:2026,week:11,
      roster:[{playerId:'player-sync',playerName:'Synced Player',position:'HB',teamId:'kc',rosterStatus:'active'}],
      workflowEvents:[{
        sourceKey:'workflow-sync:revision:1',eventType:'trade',workflowTradeId:'workflow-sync',
        teamIds:['tb','kc'],playerIds:['player-sync'],season:2026,week:11,
        moves:[{playerId:'player-sync',playerName:'Synced Player',position:'HB',fromTeamId:'tb',toTeamId:'kc'}]
      }]
    };
    const first=await postCanonicalTransactions(context('commissioner-token','POST',updateBody));
    const firstPayload=await first.clone().json();
    assert.equal(first.status,200,JSON.stringify(firstPayload));
    assert.equal(firstPayload.dedupe.uniqueCanonicalTransactions,1);
    assert.equal(firstPayload.dedupe.evidenceProcessed,2);
    assert.equal(firstPayload.canonical.transactions[0].evidence.length,2);

    const repeated=await postCanonicalTransactions(context('commissioner-token','POST',updateBody));
    const repeatedPayload=await repeated.clone().json();
    assert.equal(repeated.status,200,JSON.stringify(repeatedPayload));
    const transaction=database.prepare(`SELECT id FROM canonical_transactions WHERE workflow_trade_id='workflow-sync'`).get();
    assert.ok(transaction?.id);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM canonical_transactions WHERE workflow_trade_id='workflow-sync'`).get().count,1);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM canonical_transaction_evidence WHERE transaction_id=?`).get(transaction.id).count,2);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM league_transaction_history WHERE id=?`).get(transaction.id).count,1);

    const read=await getCanonicalTransactions(context('member-token','GET',null,`?transactionId=${transaction.id}`));
    const payload=await read.json(),record=payload.transactions[0];
    assert.equal(record.eventType,'trade');
    const moves=record.evidence.flatMap(item=>item.evidence.moves);
    assert.ok(moves.some(move=>move.playerId==='player-sync'&&move.fromTeamId==='tb'&&move.toTeamId==='kc'));
    assert.equal(repeatedPayload.dedupe.uniqueCanonicalTransactions,1);
  }finally{database.close()}
});
