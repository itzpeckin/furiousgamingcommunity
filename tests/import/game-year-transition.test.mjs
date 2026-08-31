import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { hashToken } from '../../functions/_lib/auth.js';
import {
  archiveDigest,
  canTransition,
  normalizeFreeAgentEvidence,
  normalizeGameRelease,
  rootArchiveDigest,
  transitionConfirmations
} from '../../functions/_lib/game-year-transition.js';
import {
  onRequestGet,
  onRequestPost
} from '../../functions/api/leagues/[leagueSlug]/game-year-transition.js';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';

function d1(database) {
  const statement = (sql, values = []) => ({
    sql,
    values,
    bind(...next) { return statement(sql,next); },
    async first() { return database.prepare(sql).get(...values) || null; },
    async all() { return { results:database.prepare(sql).all(...values) }; },
    async run() {
      const result=database.prepare(sql).run(...values);
      return { meta:{ changes:Number(result.changes||0) } };
    }
  });
  return {
    prepare:sql=>statement(sql),
    async batch(statements) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const results=[];
        for(const item of statements)results.push(await item.run());
        database.exec('COMMIT');
        return results;
      } catch(error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

function bucket(initial={}) {
  const objects=new Map(Object.entries(initial).map(([key,value])=>[key,value instanceof Uint8Array?value:new TextEncoder().encode(String(value))]));
  return {
    objects,
    async get(key) {
      const value=objects.get(key);
      if(!value)return null;
      return { async arrayBuffer(){return value.slice().buffer;} };
    },
    async put(key,value) {
      const bytes=value instanceof Uint8Array?value:new Uint8Array(value);
      objects.set(key,bytes.slice());
    },
    async delete(key){objects.delete(key);}
  };
}

async function createDatabase(maxVersion=26) {
  const database=new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys=ON');
  const files=(await walkFiles())
    .filter(file=>/^migrations\/\d+_.+\.sql$/.test(file))
    .filter(file=>Number(path.basename(file).slice(0,4))<=maxVersion)
    .sort();
  for(const file of files)database.exec(await readFile(path.join(ROOT,file),'utf8'));
  return database;
}

async function fixture({activeSnapshot=true}={}) {
  const database=await createDatabase();
  database.prepare(`INSERT INTO leagues
    (id,name,product_name,slug,public_status,tenant_status,timezone)
    VALUES (?,?,?,?,?,?,?)`).run('league-1','FGC','FranchiseHQ','fgc','active','enabled','America/Chicago');
  database.prepare(`INSERT INTO users (id,discord_user_id,discord_username,display_name)
    VALUES (?,?,?,?)`).run('commissioner-1','discord-1','commissioner','Commissioner');
  database.prepare(`INSERT INTO league_memberships
    (id,league_id,user_id,role,team_id,active) VALUES (?,?,?,?,?,1)`)
    .run('membership-1','league-1','commissioner-1','commissioner','tb');
  const token='game-year-test-session';
  database.prepare(`INSERT INTO sessions
    (id,user_id,session_token_hash,expires_at) VALUES (?,?,?,?)`)
    .run('session-1','commissioner-1',await hashToken(token),'2099-01-01T00:00:00.000Z');
  database.prepare(`INSERT INTO franchise_seasons
    (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
    VALUES (?,?,?,?,?,?,?,?,?)`).run('season-1','league-1','ea-madden-companion','742482','1','Madden NFL 27','FGC Season 1',2026,'active');
  database.prepare(`INSERT INTO league_game_years
    (id,league_id,game_release,edition_year,display_name,status) VALUES (?,?,?,?,?,'active')`)
    .run('game-year-27','league-1','Madden NFL 27',27,'Madden NFL 27');
  database.prepare(`INSERT INTO game_year_franchise_seasons
    (game_year_id,league_id,franchise_season_id) VALUES (?,?,?)`).run('game-year-27','league-1','season-1');
  database.prepare(`INSERT INTO madden_discovery_sessions
    (id,league_id,token_hash,status,expires_at,opened_by_user_id)
    VALUES (?,?,?,?,?,?)`).run('capture-session-1','league-1','capture-token-hash','passed','2099-01-01T00:00:00.000Z','commissioner-1');
  database.prepare(`INSERT INTO companion_route_captures
    (id,league_id,discovery_session_id,route_path,request_method,byte_length,payload_hash,r2_object_key)
    VALUES (?,?,?,?,?,?,?,?)`).run('capture-1','league-1','capture-session-1','xbsx/742482/teams','GET',13,'payload-hash','source/capture-1.json');
  database.prepare(`INSERT INTO madden_discovery_session_captures
    (league_id,session_id,capture_id,route_path) VALUES (?,?,?,?)`).run('league-1','capture-session-1','capture-1','xbsx/742482/teams');
  database.prepare(`INSERT INTO companion_import_destinations
    (id,league_id,franchise_season_id,label,status,created_by_user_id,game_year_id)
    VALUES (?,?,?,?,?,?,?)`).run('destination-1','league-1','season-1','Madden 27 candidate','active','commissioner-1','game-year-27');
  database.prepare(`INSERT INTO league_snapshots
    (id,league_id,status,season_year,team_count,player_count,game_count,statistic_count,standing_count,warnings_json,manifest_json,validation_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run('snapshot-1','league-1',activeSnapshot?'active':'validated',2026,1,2,1,1,1,'["Free Agents blocked"]','{"freeAgentStatus":"blocked"}','ready');
  const record=database.prepare(`INSERT INTO league_snapshot_records
    (snapshot_id,league_id,domain,external_id,data_json) VALUES (?,?,?,?,?)`);
  record.run('snapshot-1','league-1','teams','tb','{"name":"Buccaneers"}');
  record.run('snapshot-1','league-1','players','p1','{"team_external_id":"tb"}');
  record.run('snapshot-1','league-1','players','p2','{"team_external_id":"tb"}');
  if(activeSnapshot)database.prepare(`INSERT INTO league_active_snapshots
    (league_id,snapshot_id,activated_by) VALUES (?,?,?)`).run('league-1','snapshot-1','commissioner-1');
  database.prepare(`INSERT INTO game_year_snapshots
    (game_year_id,league_id,snapshot_id,snapshot_status) VALUES (?,?,?,?)`).run('game-year-27','league-1','snapshot-1',activeSnapshot?'active':'candidate');
  database.prepare(`INSERT INTO companion_candidate_import_runs
    (id,league_id,destination_id,discovery_session_id,source_fingerprint,status,completeness_status,current_phase,
     result_counts_json,candidate_snapshot_id,active_snapshot_id_after,created_by_user_id,completed_at)
    VALUES (?,?,?,?,?,'preview-ready','rostered-players-only','preview-ready',?,?,?,?,CURRENT_TIMESTAMP)`)
    .run('candidate-1','league-1','destination-1','capture-session-1','fingerprint-1','{"players":2,"freeAgentStatus":"blocked","freeAgentCount":null}','snapshot-1',activeSnapshot?'snapshot-1':null,'commissioner-1');
  database.prepare(`INSERT INTO canonical_roster_snapshots
    (league_id,snapshot_id,player_count) VALUES (?,?,?)`).run('league-1','snapshot-1',2);
  database.prepare(`INSERT INTO canonical_roster_snapshot_players
    (league_id,snapshot_id,player_id,team_id,roster_status) VALUES (?,?,?,?,?)`).run('league-1','snapshot-1','p1','tb','active');
  return {database,token};
}

function context({db,token,archives,sources,method='GET',body,query=''}) {
  return {
    request:new Request(`https://franchisehq.app/api/leagues/fgc/game-year-transition${query}`,{
      method,
      headers:{'content-type':'application/json',cookie:`franchise_hq_session=${token}`},
      body:body===undefined?undefined:JSON.stringify(body)
    }),
    params:{leagueSlug:'fgc'},
    env:{DB:db,FRANCHISE_HQ_DB:db,GAME_YEAR_ARCHIVES:archives,COMPANION_EXPORTS:sources}
  };
}

async function completeRollback(post, body, maxAttempts=100) {
  let payload=null;
  for(let attempt=1;attempt<=maxAttempts;attempt+=1){
    const response=await post(body);
    assert.equal(response.status,200,'rollback batch should complete or remain safely resumable');
    payload=await response.json();
    if(payload.rollback?.restored)return {payload,attempts:attempt};
    assert.equal(payload.rollback?.pending,true);
    assert.equal(payload.transition?.status,'restoring');
  }
  assert.fail(`rollback did not complete within ${maxAttempts} bounded requests`);
}

test('game-year helpers preserve edition and blocked-Free-Agent semantics', async () => {
  assert.deepEqual(normalizeGameRelease('Madden NFL 27'),{ok:true,gameRelease:'Madden NFL 27',editionYear:27});
  assert.equal(normalizeGameRelease('2026').ok,false);
  assert.deepEqual(normalizeFreeAgentEvidence({status:'blocked',count:0}),{status:'blocked',count:null,interpretedAsZero:false});
  assert.equal(await archiveDigest(new TextEncoder().encode('a')),await archiveDigest('a'));
  const confirmations=transitionConfirmations('fgc','Madden NFL 27');
  assert.equal(confirmations.archive,'ARCHIVE Madden NFL 27 FOR fgc');
  assert.equal(canTransition('planned','archive'),true);
  assert.equal(canTransition('planned','detach'),false);
  const first={objectKey:'b',sha256:await archiveDigest('b'),byteLength:1};
  const second={objectKey:'a',sha256:await archiveDigest('a'),byteLength:1};
  assert.equal(await rootArchiveDigest([first,second]),await rootArchiveDigest([second,first]));
});

test('one Archive Season action freezes History Books and prepares the next season without deletion', async () => {
  const {database,token}=await fixture();
  const db=d1(database),archives=bucket(),sources=bucket();
  try{
    database.prepare(`UPDATE companion_league_export_endpoints SET
      latest_session_id='capture-session-1',latest_session_token_version=1 WHERE league_id='league-1'`).run();
    const before={
      users:database.prepare(`SELECT COUNT(*) count FROM users`).get().count,
      memberships:database.prepare(`SELECT COUNT(*) count FROM league_memberships`).get().count,
      snapshots:database.prepare(`SELECT COUNT(*) count FROM league_snapshots`).get().count,
      active:database.prepare(`SELECT snapshot_id FROM league_active_snapshots WHERE league_id='league-1'`).get().snapshot_id,
      tokenVersion:database.prepare(`SELECT token_version FROM companion_league_export_endpoints WHERE league_id='league-1'`).get().token_version
    };
    let response=await onRequestPost(context({db,token,archives,sources,method:'POST',body:{
      action:'archive-franchise-season',gameYearId:'game-year-27'
    }}));
    let payload=await response.json();
    assert.equal(response.status,200,JSON.stringify(payload));
    assert.equal(payload.result.completed,true);
    assert.equal(payload.result.historyPermanentlyDeleted,false);
    assert.equal(database.prepare(`SELECT status FROM franchise_seasons WHERE id='season-1'`).get().status,'closed');
    const prepared=database.prepare(`SELECT id,source_season_id,season_year,status FROM franchise_seasons
      WHERE league_id='league-1' AND id<>'season-1'`).get();
    assert.deepEqual({sourceSeasonId:prepared.source_season_id,seasonYear:prepared.season_year,status:prepared.status},
      {sourceSeasonId:'2',seasonYear:2027,status:'preview'});
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM franchise_season_closures`).get().count,1);
    assert.equal(database.prepare(`SELECT status FROM companion_import_destinations WHERE id='destination-1'`).get().status,'archived');
    const endpoint=database.prepare(`SELECT token_version,latest_session_id,latest_ready_report_id
      FROM companion_league_export_endpoints WHERE league_id='league-1'`).get();
    assert.equal(endpoint.token_version,before.tokenVersion);
    assert.equal(endpoint.latest_session_id,null);
    assert.equal(endpoint.latest_ready_report_id,null);
    assert.deepEqual({
      users:database.prepare(`SELECT COUNT(*) count FROM users`).get().count,
      memberships:database.prepare(`SELECT COUNT(*) count FROM league_memberships`).get().count,
      snapshots:database.prepare(`SELECT COUNT(*) count FROM league_snapshots`).get().count,
      active:database.prepare(`SELECT snapshot_id FROM league_active_snapshots WHERE league_id='league-1'`).get().snapshot_id
    },{users:before.users,memberships:before.memberships,snapshots:before.snapshots,active:before.active});
    assert.equal(database.prepare(`SELECT action FROM tenant_audit_events
      WHERE action='franchise_season.archive_and_prepare'`).get().action,'franchise_season.archive_and_prepare');
    assert.equal(database.prepare('PRAGMA foreign_key_check').all().length,0);

    response=await onRequestPost(context({db,token,archives,sources,method:'POST',body:{
      action:'archive-franchise-season',gameYearId:'game-year-27'
    }}));
    payload=await response.json();
    assert.equal(payload.result.alreadyPrepared,true);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM franchise_season_closures`).get().count,1);
  }finally{database.close();}
});

test('migration 25 makes game year first-class and immutable archive rows cannot be rewritten', async () => {
  const db=await createDatabase();
  try{
    const tables=db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'game_year_%' ORDER BY name`).all().map(row=>row.name);
    assert.deepEqual(tables,[
      'game_year_archive_manifests','game_year_archive_parts','game_year_archive_removals',
      'game_year_franchise_seasons','game_year_recovery_bookmarks','game_year_snapshots',
      'game_year_transition_events','game_year_transition_runs'
    ]);
    assert.equal(db.prepare(`SELECT name FROM schema_migrations WHERE version=25`).get().name,'safe_game_year_transition');
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{db.close();}
});

test('migration 25 links a version-24 active candidate without replacing protected rows or the active pointer', async () => {
  const database=await createDatabase(24);
  try{
    database.prepare(`INSERT INTO leagues
      (id,name,product_name,slug,public_status,tenant_status,timezone)
      VALUES (?,?,?,?,?,?,?)`).run('upgrade-league','FGC','FranchiseHQ','upgrade-fgc','active','enabled','America/Chicago');
    database.prepare(`INSERT INTO users (id,discord_user_id,discord_username,display_name)
      VALUES (?,?,?,?)`).run('upgrade-user','upgrade-discord','commissioner','Commissioner');
    database.prepare(`INSERT INTO league_memberships
      (id,league_id,user_id,role,team_id,active) VALUES (?,?,?,?,?,1)`)
      .run('upgrade-membership','upgrade-league','upgrade-user','commissioner','tb');
    database.prepare(`INSERT INTO sessions
      (id,user_id,session_token_hash,expires_at) VALUES (?,?,?,?)`)
      .run('upgrade-session','upgrade-user','upgrade-hash','2099-01-01T00:00:00.000Z');
    database.prepare(`INSERT INTO franchise_seasons
      (id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,season_year,status)
      VALUES (?,?,?,?,?,?,?,?,?)`).run('upgrade-season','upgrade-league','ea-madden-companion','742482','1','Madden NFL 27','FGC Season 1',2026,'active');
    database.prepare(`INSERT INTO companion_import_destinations
      (id,league_id,franchise_season_id,label,status,created_by_user_id)
      VALUES (?,?,?,?,?,?)`).run('upgrade-destination','upgrade-league','upgrade-season','Madden 27 candidate','active','upgrade-user');
    database.prepare(`INSERT INTO madden_discovery_sessions
      (id,league_id,token_hash,status,expires_at,opened_by_user_id)
      VALUES (?,?,?,?,?,?)`).run('upgrade-discovery','upgrade-league','upgrade-discovery-hash','passed','2099-01-01T00:00:00.000Z','upgrade-user');
    database.prepare(`INSERT INTO league_snapshots
      (id,league_id,status,season_year,manifest_json,validation_status)
      VALUES (?,?,?,?,?,?)`).run('upgrade-snapshot','upgrade-league','active',2026,'{"freeAgentStatus":"blocked"}','ready');
    database.prepare(`INSERT INTO league_active_snapshots
      (league_id,snapshot_id,activated_by) VALUES (?,?,?)`).run('upgrade-league','upgrade-snapshot','upgrade-user');
    database.prepare(`INSERT INTO companion_candidate_import_runs
      (id,league_id,destination_id,discovery_session_id,source_fingerprint,status,completeness_status,current_phase,
       result_counts_json,candidate_snapshot_id,active_snapshot_id_after,created_by_user_id,completed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
      .run('upgrade-candidate','upgrade-league','upgrade-destination','upgrade-discovery','upgrade-fingerprint','preview-ready','rostered-players-only','preview-ready','{"players":2044,"freeAgentStatus":"blocked","freeAgentCount":null}','upgrade-snapshot','upgrade-snapshot','upgrade-user');

    const protectedBefore={
      leagues:database.prepare('SELECT COUNT(*) count FROM leagues').get().count,
      users:database.prepare('SELECT COUNT(*) count FROM users').get().count,
      memberships:database.prepare('SELECT COUNT(*) count FROM league_memberships').get().count,
      sessions:database.prepare('SELECT COUNT(*) count FROM sessions').get().count,
      snapshots:database.prepare('SELECT COUNT(*) count FROM league_snapshots').get().count,
      activeSnapshot:database.prepare(`SELECT snapshot_id FROM league_active_snapshots WHERE league_id='upgrade-league'`).get().snapshot_id
    };
    database.exec(await readFile(path.join(ROOT,'migrations/0025_safe_game_year_transition.sql'),'utf8'));

    const gameYear=database.prepare(`SELECT id,game_release,edition_year,status
      FROM league_game_years WHERE league_id='upgrade-league'`).get();
    assert.equal(gameYear.game_release,'Madden NFL 27');
    assert.equal(gameYear.edition_year,27);
    assert.equal(gameYear.status,'active');
    assert.equal(database.prepare(`SELECT game_year_id FROM companion_import_destinations
      WHERE id='upgrade-destination'`).get().game_year_id,gameYear.id);
    assert.deepEqual({...database.prepare(`SELECT snapshot_id,snapshot_status FROM game_year_snapshots
      WHERE game_year_id=?`).get(gameYear.id)},{snapshot_id:'upgrade-snapshot',snapshot_status:'active'});
    assert.deepEqual({
      leagues:database.prepare('SELECT COUNT(*) count FROM leagues').get().count,
      users:database.prepare('SELECT COUNT(*) count FROM users').get().count,
      memberships:database.prepare('SELECT COUNT(*) count FROM league_memberships').get().count,
      sessions:database.prepare('SELECT COUNT(*) count FROM sessions').get().count,
      snapshots:database.prepare('SELECT COUNT(*) count FROM league_snapshots').get().count,
      activeSnapshot:database.prepare(`SELECT snapshot_id FROM league_active_snapshots WHERE league_id='upgrade-league'`).get().snapshot_id
    },protectedBefore);
    assert.equal(database.prepare(`SELECT team_id FROM league_memberships WHERE id='upgrade-membership'`).get().team_id,'tb');
    assert.equal(database.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{database.close();}
});

test('archive scope includes mapping dependencies owned by the identity preview', async () => {
  const {database,token}=await fixture({activeSnapshot:false});
  const db=d1(database),archives=bucket(),sources=bucket({'source/capture-1.json':'{"teams":[]}'});
  try{
    database.prepare(`INSERT INTO companion_team_mapping_runs
      (id,league_id,discovery_session_id,source_capture_id,source_route_path,status,team_count)
      VALUES (?,?,?,?,?,?,?)`).run('identity-team-run','league-1','capture-session-1','capture-1','teams','preview-ready',1);
    database.prepare(`INSERT INTO companion_player_mapping_runs
      (id,league_id,discovery_session_id,source_capture_id,source_route_path,status,player_count,rostered_count,free_agent_count)
      VALUES (?,?,?,?,?,?,?,?,?)`).run('identity-player-run','league-1','capture-session-1','capture-1','rosters','rostered-players-only',2,2,0);
    database.prepare(`INSERT INTO companion_canonical_teams_preview
      (mapping_run_id,league_id,external_id,display_name,source_record_json)
      VALUES (?,?,?,?,?)`).run('identity-team-run','league-1','tb','Buccaneers','{}');
    database.prepare(`INSERT INTO companion_canonical_players_preview
      (mapping_run_id,league_id,external_id,team_external_id,display_name,source_record_json)
      VALUES (?,?,?,?,?,?)`).run('identity-player-run','league-1','p1','tb','Player One','{}');
    database.prepare(`INSERT INTO identity_preview_runs
      (id,league_id,franchise_season_id,team_mapping_run_id,player_mapping_run_id,status,
       free_agent_status,team_count,rostered_player_count,free_agent_count,created_by_user_id)
      VALUES (?,?,?,?,?,'rostered-players-only','blocked',1,2,NULL,?)`)
      .run('identity-run','league-1','season-1','identity-team-run','identity-player-run','commissioner-1');
    let response=await onRequestGet(context({db,token,archives,sources,query:'?preview=1'}));
    const initial=await response.json(),confirmations=initial.confirmations,gameYearId=initial.gameYear.id;
    for(const [action,confirmation] of [
      ['plan-archive',confirmations.plan],
      ['archive',confirmations.archive]
    ]){
      response=await onRequestPost(context({db,token,archives,sources,method:'POST',body:{action,gameYearId,confirmation}}));
      assert.equal(response.status,200);
    }
    const relational=[...archives.objects.entries()].find(([key])=>key.endsWith('/relational.json'))?.[1];
    assert.ok(relational);
    const bundle=JSON.parse(new TextDecoder().decode(relational));
    assert.deepEqual(bundle.datasets.companion_team_mapping_runs.map(row=>row.id),['identity-team-run']);
    assert.deepEqual(bundle.datasets.companion_player_mapping_runs.map(row=>row.id),['identity-player-run']);
    assert.equal(bundle.datasets.companion_canonical_teams_preview.length,1);
    assert.equal(bundle.datasets.companion_canonical_players_preview.length,1);
    assert.equal(bundle.datasets.identity_preview_runs.length,1);
  }finally{database.close();}
});

test('commissioner workflow archives, verifies, detaches, removes, and restores without changing the platform plane', async () => {
  const {database,token}=await fixture();
  const db=d1(database),archives=bucket(),sources=bucket({'source/capture-1.json':'{"teams":[]}'});
  try{
    let response=await onRequestGet(context({db,token,archives,sources,query:'?preview=1'}));
    assert.equal(response.status,200);
    let payload=await response.json();
    assert.equal(payload.gameYear.gameRelease,'Madden NFL 27');
    assert.equal(payload.gameYear.activeSnapshotId,'snapshot-1');
    assert.equal(payload.freeAgents.status,'blocked');
    assert.equal(payload.freeAgents.count,null);
    assert.equal(payload.affectedCounts.league_snapshot_records,3);

    const confirmations=payload.confirmations;
    response=await onRequestPost(context({db,token,archives,sources,method:'POST',body:{
      action:'plan-archive',gameYearId:'game-year-27',confirmation:confirmations.plan
    }}));
    assert.equal(response.status,200);
    payload=await response.json();
    assert.equal(payload.transition.status,'planned');

    response=await onRequestPost(context({db,token,archives,sources,method:'POST',body:{
      action:'archive',gameYearId:'game-year-27',confirmation:confirmations.archive
    }}));
    assert.equal(response.status,200);
    payload=await response.json();
    assert.equal(payload.transition.status,'archive-verified');
    assert.ok(payload.transition.manifestId);
    assert.ok(payload.transition.recoveryBookmarkId);
    assert.equal(database.prepare(`SELECT free_agent_status FROM game_year_archive_manifests`).get().free_agent_status,'blocked');
    assert.equal(database.prepare(`SELECT free_agent_count FROM game_year_archive_manifests`).get().free_agent_count,null);
    assert.throws(()=>database.prepare(`UPDATE game_year_archive_manifests SET total_rows=0`).run(),/immutable/i);

    response=await onRequestPost(context({db,token,archives,sources,method:'POST',body:{
      action:'detach',gameYearId:'game-year-27',confirmation:confirmations.detach
    }}));
    assert.equal(response.status,200);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM league_active_snapshots`).get().count,0);
    assert.equal(database.prepare(`SELECT active FROM league_memberships WHERE id='membership-1'`).get().active,1);
    assert.equal(database.prepare(`SELECT team_id FROM league_memberships WHERE id='membership-1'`).get().team_id,null);

    response=await onRequestPost(context({db,token,archives,sources,method:'POST',body:{
      action:'remove-active-data',gameYearId:'game-year-27',confirmation:confirmations.removeActive
    }}));
    assert.equal(response.status,200);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM league_snapshots`).get().count,0);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM users`).get().count,1);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM league_memberships`).get().count,1);
    assert.equal(sources.objects.has('source/capture-1.json'),false);

    const recovered=await completeRollback(body=>onRequestPost(context({db,token,archives,sources,method:'POST',body})),{
      action:'rollback',gameYearId:'game-year-27',confirmation:confirmations.rollback
    });
    payload=recovered.payload;
    assert.ok(recovered.attempts>=3);
    assert.equal(payload.rollback.restored,true);
    assert.equal(database.prepare(`SELECT snapshot_id FROM league_active_snapshots`).get().snapshot_id,'snapshot-1');
    assert.equal(database.prepare(`SELECT team_id FROM league_memberships WHERE id='membership-1'`).get().team_id,'tb');
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM league_snapshot_records`).get().count,3);
    assert.equal(sources.objects.has('source/capture-1.json'),true);
    assert.equal(database.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{database.close();}
});

test('rollback preserves an intentionally empty active-snapshot pointer', async () => {
  const {database,token}=await fixture({activeSnapshot:false});
  const db=d1(database),archives=bucket(),sources=bucket({'source/capture-1.json':'{"teams":[]}'});
  const post=body=>onRequestPost(context({db,token,archives,sources,method:'POST',body}));
  try{
    let response=await onRequestGet(context({db,token,archives,sources,query:'?preview=1'}));
    const initial=await response.json(),confirmations=initial.confirmations,gameYearId=initial.gameYear.id;
    assert.equal(initial.gameYear.activeSnapshotId,null);
    for(const [action,confirmation] of [
      ['plan-archive',confirmations.plan],
      ['archive',confirmations.archive],
      ['detach',confirmations.detach],
      ['remove-active-data',confirmations.removeActive]
    ]){
      response=await post({action,gameYearId,confirmation});
      assert.equal(response.status,200,`${action} should preserve an empty active pointer`);
    }
    const {payload}=await completeRollback(post,{
      action:'rollback',gameYearId,confirmation:confirmations.rollback
    });
    assert.equal(payload.rollback.activeSnapshotId,null);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM league_active_snapshots`).get().count,0);
    assert.equal(database.prepare(`SELECT status FROM league_game_years WHERE id=?`).get(gameYearId).status,'restored');
    assert.equal(database.prepare(`SELECT status FROM league_snapshots WHERE id='snapshot-1'`).get().status,'validated');
    assert.equal(database.prepare(`SELECT snapshot_status FROM game_year_snapshots WHERE game_year_id=?`).get(gameYearId).snapshot_status,'candidate');
    assert.equal(database.prepare(`SELECT status FROM franchise_seasons WHERE id='season-1'`).get().status,'active');
    assert.equal(database.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{database.close();}
});

test('large recovery advances through durable bounded cursors and resumes idempotently', async () => {
  const {database,token}=await fixture({activeSnapshot:false});
  const db=d1(database),archives=bucket(),sources=bucket({'source/capture-1.json':'{"teams":[]}'});
  const post=body=>onRequestPost(context({db,token,archives,sources,method:'POST',body}));
  try{
    const insert=database.prepare(`INSERT INTO league_snapshot_records
      (snapshot_id,league_id,domain,external_id,data_json) VALUES (?,?,?,?,?)`);
    for(let index=0;index<400;index+=1){
      insert.run('snapshot-1','league-1','players',`bulk-${index}`,JSON.stringify({player:index}));
    }
    let response=await onRequestGet(context({db,token,archives,sources,query:'?preview=1'}));
    const initial=await response.json(),confirmations=initial.confirmations,gameYearId=initial.gameYear.id;
    for(const [action,confirmation] of [
      ['plan-archive',confirmations.plan],
      ['archive',confirmations.archive],
      ['detach',confirmations.detach],
      ['remove-active-data',confirmations.removeActive]
    ]){
      response=await post({action,gameYearId,confirmation});
      assert.equal(response.status,200);
    }
    response=await post({action:'rollback',gameYearId,confirmation:confirmations.rollback});
    assert.equal(response.status,200);
    let payload=await response.json();
    assert.equal(payload.rollback.pending,true);
    assert.match(payload.rollback.phase,/^restore-copy:/);
    assert.equal(database.prepare(`SELECT status FROM game_year_transition_runs`).get().status,'restoring');
    const recovered=await completeRollback(post,{
      action:'rollback',gameYearId,confirmation:confirmations.rollback
    });
    payload=recovered.payload;
    assert.equal(payload.rollback.restored,true);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM league_snapshot_records`).get().count,403);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM league_active_snapshots`).get().count,0);
    assert.equal(database.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{database.close();}
});

test('recovery cursor also bounds large archived row payloads by byte size', async () => {
  const {database,token}=await fixture({activeSnapshot:false});
  const db=d1(database),archives=bucket(),sources=bucket({'source/capture-1.json':'{"teams":[]}'});
  const post=body=>onRequestPost(context({db,token,archives,sources,method:'POST',body}));
  try{
    const insert=database.prepare(`INSERT INTO league_snapshot_records
      (snapshot_id,league_id,domain,external_id,data_json) VALUES (?,?,?,?,?)`);
    const largeValue='x'.repeat(150000);
    for(let index=0;index<4;index+=1){
      insert.run('snapshot-1','league-1','statistics',`large-${index}`,JSON.stringify({value:largeValue,index}));
    }
    let response=await onRequestGet(context({db,token,archives,sources,query:'?preview=1'}));
    const initial=await response.json(),confirmations=initial.confirmations,gameYearId=initial.gameYear.id;
    for(const [action,confirmation] of [
      ['plan-archive',confirmations.plan],
      ['archive',confirmations.archive],
      ['detach',confirmations.detach],
      ['remove-active-data',confirmations.removeActive]
    ]){
      response=await post({action,gameYearId,confirmation});
      assert.equal(response.status,200);
    }
    response=await post({action:'rollback',gameYearId,confirmation:confirmations.rollback});
    let payload=await response.json();
    assert.equal(payload.rollback.pending,true);
    assert.match(payload.rollback.phase,/^restore-copy:/);
    const recovered=await completeRollback(post,{
      action:'rollback',gameYearId,confirmation:confirmations.rollback
    });
    payload=recovered.payload;
    assert.equal(payload.rollback.restored,true);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM league_snapshot_records`).get().count,7);
    assert.equal(database.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{database.close();}
});

test('archive-copy removal is separately confirmed, verified, and tombstoned before recovery is disabled', async () => {
  const {database,token}=await fixture();
  const db=d1(database),archives=bucket(),sources=bucket({'source/capture-1.json':'{"teams":[]}'});
  const post=body=>onRequestPost(context({db,token,archives,sources,method:'POST',body}));
  try{
    let response=await onRequestGet(context({db,token,archives,sources,query:'?preview=1'}));
    const initial=await response.json();
    const confirmations=initial.confirmations,gameYearId=initial.gameYear.id;
    for(const [action,confirmation] of [
      ['plan-archive',confirmations.plan],
      ['archive',confirmations.archive],
      ['detach',confirmations.detach],
      ['remove-active-data',confirmations.removeActive],
      ['remove-archive',confirmations.removeArchive]
    ]){
      response=await post({action,gameYearId,confirmation});
      assert.equal(response.status,200,`${action} should complete in the isolated local fixture`);
    }
    assert.equal(archives.objects.size,0);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM game_year_archive_manifests`).get().count,1);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM game_year_archive_parts`).get().count,2);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM game_year_archive_removals`).get().count,1);
    assert.equal(database.prepare(`SELECT status FROM game_year_transition_runs`).get().status,'archive-removed');
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM users`).get().count,1);
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM league_memberships`).get().count,1);
    response=await post({action:'rollback',gameYearId,confirmation:confirmations.rollback});
    assert.equal(response.status,409);
    assert.equal(sources.objects.has('source/capture-1.json'),false);
    assert.equal(database.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{database.close();}
});

test('legacy broad reset is retired and source guards retain separate authorities', async () => {
  const [legacy,endpoint,ui,html,commissioner]=await Promise.all([
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/reset-data.js',import.meta.url),'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/game-year-transition.js',import.meta.url),'utf8'),
    readFile(new URL('../../league-engine/game-year-transition.js',import.meta.url),'utf8'),
    readFile(new URL('../../index.html',import.meta.url),'utf8'),
    readFile(new URL('../../trade-module.js',import.meta.url),'utf8')
  ]);
  assert.match(legacy,/LEGACY_RESET_RETIRED/);
  assert.doesNotMatch(legacy,/DELETE FROM|UPDATE league_memberships/);
  assert.match(endpoint,/requireCommissioner\(context\)/);
  assert.match(endpoint,/transitionConfirmations/);
  assert.match(endpoint,/archive-verified/);
  assert.match(endpoint,/freeAgentInterpretedAsZero:false/);
  assert.match(endpoint,/platformPlanePreserved:true/);
  assert.match(ui,/Latest League Export/);
  assert.match(ui,/Open Import/);
  assert.match(ui,/Archive Season/);
  assert.match(ui,/data-game-year-archive-season/);
  assert.doesNotMatch(ui,/data-game-year-season-confirmation/);
  assert.match(ui,/Archive \/ Remove Madden Game Year/);
  assert.match(ui,/Free Agents remain blocked\/unknown/);
  assert.match(html,/league-engine\/game-year-transition\.js\?v=7\.3\.4\.4/);
  assert.doesNotMatch(commissioner,/\/reset-data/);
});
