import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {retentionCandidates,archivePreviewBatch,restorePreviewChunk,RETENTION_KINDS} from '../../functions/_lib/storage-retention.js';
import worker from '../../workers/franchise-storage-maintenance/src/index.js';
import {onRequestPost} from '../../functions/api/leagues/[leagueSlug]/companion/storage-preflight.js';

async function fixture(){
 const s=new DatabaseSync(':memory:');const root=new URL('../../migrations/',import.meta.url);
 for(const f of (await readdir(root)).filter(x=>/^\d+.*\.sql$/.test(x)).sort())s.exec(await readFile(new URL(f,root),'utf8'));
 s.exec('PRAGMA foreign_keys=OFF');
 s.exec(`INSERT INTO leagues(id,name,product_name,slug,tenant_status) VALUES('a','A','FHQ','a','enabled'),('b','B','FHQ','b','enabled');
 INSERT INTO league_snapshots(id,league_id,status,activated_at,manifest_json) VALUES('old','a','archived','2000-01-01','{}'),('live','a','active',CURRENT_TIMESTAMP,'{}');
 INSERT INTO league_active_snapshots(league_id,snapshot_id) VALUES('a','live');`);
 for(let i=0;i<5;i++){
  s.prepare(`INSERT INTO companion_player_mapping_runs(id,league_id,discovery_session_id,source_capture_id,source_route_path,created_at,updated_at)
   VALUES(?,'a','session','capture','route',?,?)`).run('m'+i,`2000-01-0${i+1}`,`2000-01-0${i+1}`);
  s.prepare(`INSERT INTO companion_candidate_import_runs(id,league_id,destination_id,discovery_session_id,source_fingerprint,status,player_mapping_run_id,candidate_snapshot_id,active_snapshot_id_after,completed_at,created_at,created_by_user_id)
   VALUES(?,'a','destination','session',?,'preview-ready',?,'old','old','2000-01-01',?,'test')`).run('c'+i,'fingerprint'+i,'m'+i,`2000-01-0${i+1}`);
 }
 s.exec(`INSERT INTO companion_canonical_players_preview(mapping_run_id,league_id,external_id,display_name,ratings_json,source_record_json) VALUES
 ('m0','a','p1','First','{"speed":99}','{"valuable":"original"}'),('m0','a','p2','Second','{}','{"rating":65}'),
 ('m1','a','p1','Older','{}','{}'),('m4','a','p1','Latest','{}','{}');
 INSERT INTO league_snapshot_records(snapshot_id,league_id,domain,external_id,data_json) VALUES('old','a','players','p1','{"history":true}'),('live','a','players','p1','{"live":true}');`);
 s.exec("UPDATE companion_player_mapping_runs SET status='superseded' WHERE id<>'m4'");
 const db={prepare(sql){const st=s.prepare(sql);let args=[];return {bind(...a){args=a;return this;},async first(){return st.get(...args)||null;},async all(){return {results:st.all(...args)};},async run(){const r=st.run(...args);return {meta:{changes:r.changes}};}};},async batch(stmts){s.exec('BEGIN');try{const results=[];for(const st of stmts)results.push(await st.run());s.exec('COMMIT');return results;}catch(e){s.exec('ROLLBACK');throw e;}}};
 const objects=new Map();const bucket={async put(key,value){objects.set(key,new Uint8Array(value));},async get(key){const value=objects.get(key);return value?{size:value.length,body:new Blob([value]).stream()}:null;}};
 return {s,db,bucket,objects,args:{kind:'players',leagueId:'a',mappingId:'m0',apply:true}};
}
test('retention archives exact working rows, preserves published history, and restores idempotently',async()=>{
 const f=await fixture();try{
  const before=f.s.prepare('SELECT * FROM companion_canonical_players_preview WHERE mapping_run_id=? ORDER BY external_id').all('m0');
  const history=JSON.stringify(f.s.prepare('SELECT * FROM league_snapshot_records').all());
  assert.deepEqual((await retentionCandidates(f.db,'players',20)).map(x=>x.id),['m0','m1']);
  const result=await archivePreviewBatch(f.db,f.bucket,f.args);assert.equal(result.deleted,2);
  assert.equal(f.s.prepare('SELECT archived_rows n FROM storage_retention_runs').get().n,2);
  assert.equal(JSON.stringify(f.s.prepare('SELECT * FROM league_snapshot_records').all()),history);
  assert.equal((await archivePreviewBatch(f.db,f.bucket,f.args)).complete,true);
  assert.equal((await restorePreviewChunk(f.db,f.bucket,{...f.args,key:result.backupKey})).restored,2);
  assert.equal((await restorePreviewChunk(f.db,f.bucket,{...f.args,key:result.backupKey})).restored,0);
  assert.deepEqual(f.s.prepare('SELECT * FROM companion_canonical_players_preview WHERE mapping_run_id=? ORDER BY external_id').all('m0'),before);
 }finally{f.s.close();}
});
test('active, previous, recent, unpublished, reused and in-progress data are protected',async()=>{
 for(const sql of [
  "UPDATE league_active_snapshots SET previous_snapshot_id='old'",
  "UPDATE league_active_snapshots SET snapshot_id='old'",
  "UPDATE companion_player_mapping_runs SET updated_at=CURRENT_TIMESTAMP WHERE id='m0'",
  "UPDATE companion_candidate_import_runs SET status='failed' WHERE id='c0'",
  "UPDATE companion_candidate_import_runs SET status='running' WHERE id='c4'",
  "UPDATE companion_candidate_import_runs SET completed_at=CURRENT_TIMESTAMP WHERE id='c0'",
  "UPDATE companion_candidate_import_runs SET player_mapping_run_id='m0' WHERE id='c4'",
  "UPDATE companion_candidate_import_runs SET active_snapshot_id_after=NULL WHERE id='c0'",
  "UPDATE league_snapshots SET manifest_json='{\"sources\":{\"playerMappingRunId\":\"m0\"}}' WHERE id='live'",
  "UPDATE leagues SET tenant_status='disabled' WHERE id='a'"
 ]){const f=await fixture();try{f.s.exec(sql);const r=await archivePreviewBatch(f.db,f.bucket,f.args);assert.equal(r.deleted,0,sql);assert.equal(f.objects.size,0,sql);}finally{f.s.close();}}
});
test('dry run and cross-tenant calls cannot delete or archive',async()=>{
 const f=await fixture();try{
  assert.equal((await archivePreviewBatch(f.db,f.bucket,{...f.args,apply:false})).rows,2);
  assert.equal((await archivePreviewBatch(f.db,f.bucket,{...f.args,leagueId:'b'})).deleted,0);
  assert.equal(f.objects.size,0);
 }finally{f.s.close();}
});
test('backup write/read/corruption failures never delete rows and can retry',async()=>{
 for(const failure of ['write','read','corrupt']){const f=await fixture();try{
  const broken={put:failure==='write'?async()=>{throw new Error('storage down');}:f.bucket.put,
   get:failure==='read'?async()=>null:failure==='corrupt'?async()=>({size:3,body:new Blob(['bad']).stream()}):f.bucket.get};
  await assert.rejects(archivePreviewBatch(f.db,broken,f.args));
  assert.equal(f.s.prepare("SELECT count(*) n FROM companion_canonical_players_preview WHERE mapping_run_id='m0'").get().n,2);
  assert.equal((await archivePreviewBatch(f.db,f.bucket,f.args)).deleted,2);
 }finally{f.s.close();}}
});
test('concurrent activation or row edits during backup are guarded at deletion',async()=>{
 for(const sql of ["UPDATE league_active_snapshots SET previous_snapshot_id='old'","UPDATE companion_canonical_players_preview SET source_record_json='changed' WHERE mapping_run_id='m0'"]){
 const f=await fixture();try{const b={...f.bucket,async get(key){f.s.exec(sql);return f.bucket.get(key);}};
  assert.equal((await archivePreviewBatch(f.db,b,f.args)).deleted,0);
 }finally{f.s.close();}}
});
test('restore rejects cross-tenant and tampered recovery copies',async()=>{
 const f=await fixture();try{const r=await archivePreviewBatch(f.db,f.bucket,f.args);
  await assert.rejects(restorePreviewChunk(f.db,f.bucket,{...f.args,key:r.backupKey,leagueId:'b'}),/scope/);
  f.objects.set(r.backupKey,new Uint8Array([1,2,3]));await assert.rejects(restorePreviewChunk(f.db,f.bucket,{...f.args,key:r.backupKey}));
 }finally{f.s.close();}
});
test('maintenance has no public mutation endpoint and legacy cleanup requires authentication',async()=>{
 assert.equal(worker.fetch().status,404);
 assert.equal((await onRequestPost({request:new Request('https://franchisehq.app/api/leagues/a/companion/storage-preflight',{method:'POST'}),env:{},params:{leagueSlug:'a'},data:{}})).status,401);
});

test('all four datasets recover exact original rows, including decimal metrics and null fields',async()=>{
 const f=await fixture();try{
  for(let i=0;i<5;i++){
   const date=`2000-01-0${i+1}`;
   f.s.prepare(`INSERT INTO companion_team_mapping_runs(id,league_id,discovery_session_id,source_capture_id,source_route_path,created_at,updated_at) VALUES(?,'a','s','c','r',?,?)`).run('t'+i,date,date);
   f.s.prepare(`INSERT INTO companion_schedule_mapping_runs(id,league_id,discovery_session_id,source_route_summary,created_at,updated_at) VALUES(?,'a','s','r',?,?)`).run('g'+i,date,date);
   f.s.prepare(`INSERT INTO companion_statistics_mapping_runs(id,league_id,discovery_session_id,created_at,updated_at) VALUES(?,'a','s',?,?)`).run('s'+i,date,date);
   f.s.prepare('UPDATE companion_candidate_import_runs SET team_mapping_run_id=?,schedule_mapping_run_id=?,statistics_mapping_run_id=? WHERE id=?').run('t'+i,'g'+i,'s'+i,'c'+i);
  }
  f.s.exec(`INSERT INTO companion_canonical_teams_preview(mapping_run_id,league_id,external_id,display_name,source_record_json) VALUES('t0','a','miami','Miami','{}');
   INSERT INTO companion_canonical_games_preview(mapping_run_id,league_id,external_id,stage,home_team_external_id,away_team_external_id,status,source_route_path,source_record_json) VALUES('g0','a','game','regular','miami','ny','completed','r','{}');
   INSERT INTO companion_canonical_statistics_preview(mapping_run_id,league_id,external_key,category,stage,week_index,metrics_json,source_route_path,source_record_json) VALUES('s0','a','stat','defense','regular',1,'{"sacks":1.5}','r','{}');`);
  for(const [kind,id] of [['teams','t0'],['games','g0'],['statistics','s0']]){
   const table=RETENTION_KINDS[kind].table,before=f.s.prepare(`SELECT * FROM ${table} WHERE mapping_run_id=?`).all(id);
   const r=await archivePreviewBatch(f.db,f.bucket,{...f.args,kind,mappingId:id});assert.equal(r.deleted,1);
   await restorePreviewChunk(f.db,f.bucket,{...f.args,kind,mappingId:id,key:r.backupKey});assert.deepEqual(f.s.prepare(`SELECT * FROM ${table} WHERE mapping_run_id=?`).all(id),before);
  }
 }finally{f.s.close();}
});

test('scheduled maintenance resumes bounded chunks and repeated schedules do not duplicate accounting',async()=>{
 const f=await fixture();try{
  for(let i=0;i<205;i++)f.s.prepare(`INSERT INTO companion_canonical_players_preview(mapping_run_id,league_id,external_id,display_name,source_record_json) VALUES('m0','a',?,'Name','{}')`).run('extra'+i);
  await worker.scheduled({}, {DB:f.db,COMPANION_EXPORTS:f.bucket,STORAGE_RETENTION_MODE:'observe'});
  assert.equal(f.objects.size,0);
  const env={DB:f.db,COMPANION_EXPORTS:f.bucket,STORAGE_RETENTION_MODE:'apply'};
  await worker.scheduled({},env);
  assert.equal(f.s.prepare('SELECT SUM(archived_rows) n FROM storage_retention_runs').get().n,208);
  const before=f.objects.size;await worker.scheduled({},env);assert.equal(f.objects.size,before);
  assert.equal(f.s.prepare("SELECT COUNT(*) n FROM companion_canonical_players_preview WHERE mapping_run_id='m4'").get().n,1);
 }finally{f.s.close();}
});
