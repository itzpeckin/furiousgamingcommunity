// This policy only retires published import WORKING copies. No snapshot/history
// table is modified. Every deleted row has a verified, content-addressed R2 copy.
export const RETENTION_DAYS=7;
export const RETENTION_KINDS=Object.freeze({
  teams:{run:'companion_team_mapping_runs',table:'companion_canonical_teams_preview',field:'team_mapping_run_id',key:'external_id'},
  players:{run:'companion_player_mapping_runs',table:'companion_canonical_players_preview',field:'player_mapping_run_id',key:'external_id'},
  games:{run:'companion_schedule_mapping_runs',table:'companion_canonical_games_preview',field:'schedule_mapping_run_id',key:'external_id'},
  statistics:{run:'companion_statistics_mapping_runs',table:'companion_canonical_statistics_preview',field:'statistics_mapping_run_id',key:'external_key'}
});
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
function config(kind){const c=RETENTION_KINDS[kind];if(!c)throw new Error('Unknown retention dataset');return c;}
async function unpack(object){
  if(!object||Number(object.size)>2000000)throw new Error('Recovery copy unavailable');
  const reader=object.body.pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000)throw new Error('Recovery batch exceeds limit');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}

// Reused verbatim in selection AND deletion. A new import, recovery pointer,
// unfinished candidate or season operation can disqualify a batch before commit.
export function eligibility(kind,alias='m'){
  const c=config(kind);
  const manifestField={teams:'teamMappingRunId',players:'playerMappingRunId',games:'scheduleMappingRunId',statistics:'statisticsMappingRunId'}[kind];
  return `${alias}.status IN('pending-preview','superseded','retention-archiving')
    AND ${alias}.created_at < datetime('now','-7 days')
    AND ${alias}.updated_at < datetime('now','-7 days')
    AND EXISTS(SELECT 1 FROM leagues l WHERE l.id=${alias}.league_id AND l.tenant_status='enabled')
    AND NOT EXISTS(SELECT 1 FROM league_snapshots s WHERE s.league_id=${alias}.league_id
      AND json_extract(s.manifest_json,'$.sources.${manifestField}')=${alias}.id AND (s.status<>'archived'
      OR EXISTS(SELECT 1 FROM league_active_snapshots a WHERE a.league_id=s.league_id AND (a.snapshot_id=s.id OR a.previous_snapshot_id=s.id))))
    AND ${alias}.id NOT IN(SELECT n.id FROM ${c.run} n WHERE n.league_id=${alias}.league_id ORDER BY n.created_at DESC,n.id DESC LIMIT 3)
    AND EXISTS(SELECT 1 FROM companion_candidate_import_runs r JOIN league_snapshots s ON s.id=r.candidate_snapshot_id AND s.league_id=r.league_id
      WHERE r.league_id=${alias}.league_id AND r.${c.field}=${alias}.id AND r.active_snapshot_id_after=s.id AND s.activated_at IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM companion_candidate_import_runs r LEFT JOIN league_snapshots s ON s.id=r.candidate_snapshot_id AND s.league_id=r.league_id
      WHERE r.league_id=${alias}.league_id AND r.${c.field}=${alias}.id AND
      (r.status<>'preview-ready' OR r.completed_at IS NULL OR r.completed_at>=datetime('now','-7 days') OR s.id IS NULL
       OR r.active_snapshot_id_after IS NULL OR r.active_snapshot_id_after<>s.id OR s.status<>'archived'
       OR EXISTS(SELECT 1 FROM league_active_snapshots a WHERE a.league_id=r.league_id AND (a.snapshot_id=s.id OR a.previous_snapshot_id=s.id))
       OR r.id IN(SELECT n.id FROM companion_candidate_import_runs n WHERE n.league_id=r.league_id AND n.active_snapshot_id_after IS NOT NULL ORDER BY n.created_at DESC,n.id DESC LIMIT 3)))
    AND NOT EXISTS(SELECT 1 FROM companion_candidate_import_runs r WHERE r.league_id=${alias}.league_id AND r.status NOT IN('preview-ready','failed','cancelled'))
    AND NOT EXISTS(SELECT 1 FROM ea_direct_collection_jobs j WHERE j.league_id=${alias}.league_id AND j.status NOT IN('completed','failed','cancelled'))
    AND NOT EXISTS(SELECT 1 FROM game_year_transition_runs t WHERE t.league_id=${alias}.league_id AND t.status NOT IN('completed','failed','cancelled','restored','archive-removed'))`;
}

export async function retentionCandidates(db,kind,limit=1){
  const c=config(kind);
  return rows(db,`SELECT m.id,m.league_id FROM ${c.run} m
    WHERE ${eligibility(kind)}
    AND NOT EXISTS(SELECT 1 FROM storage_retention_runs a WHERE a.league_id=m.league_id AND a.kind=? AND a.mapping_run_id=m.id AND a.status='complete')
    ORDER BY m.created_at,m.id LIMIT ?`,kind,Math.min(20,Math.max(1,limit)));
}

export async function archivePreviewBatch(db,bucket,{kind,leagueId,mappingId,apply=false}){
  const c=config(kind);
  const eligible=()=>db.prepare(`SELECT m.id FROM ${c.run} m WHERE m.id=? AND m.league_id=? AND ${eligibility(kind)}`).bind(mappingId,leagueId).first();
  if(!await eligible())return {eligible:false,deleted:0};
  const data=await rows(db,`SELECT * FROM ${c.table} WHERE league_id=? AND mapping_run_id=? ORDER BY ${c.key} LIMIT 100`,leagueId,mappingId);
  if(!apply)return {eligible:true,rows:data.length,deleted:0};
  if(!bucket?.put||!bucket?.get)throw new Error('Verified recovery storage is required');
  // Prevent explicit replay of partially archived working data. New mappings use
  // new IDs; the latest three mappings and all unfinished candidates are protected.
  await db.prepare(`UPDATE ${c.run} AS m SET status='retention-archiving' WHERE id=? AND league_id=? AND ${eligibility(kind)}`).bind(mappingId,leagueId).run();
  if(!await eligible())return {eligible:false,deleted:0};
  if(!data.length){
    await db.batch([
      db.prepare(`INSERT INTO storage_retention_runs(league_id,kind,mapping_run_id,status,completed_at)
        SELECT ?,?,?,'complete',CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM ${c.run} m WHERE m.id=? AND m.league_id=? AND ${eligibility(kind)})
        AND NOT EXISTS(SELECT 1 FROM ${c.table} WHERE mapping_run_id=? AND league_id=?)
        ON CONFLICT(league_id,kind,mapping_run_id) DO UPDATE SET status='complete',completed_at=CURRENT_TIMESTAMP,last_checked_at=CURRENT_TIMESTAMP`).bind(leagueId,kind,mappingId,mappingId,leagueId,mappingId,leagueId),
      db.prepare(`UPDATE ${c.run} AS m SET status='retained-archive' WHERE id=? AND league_id=? AND status='retention-archiving' AND ${eligibility(kind)}
        AND NOT EXISTS(SELECT 1 FROM ${c.table} p WHERE p.mapping_run_id=m.id AND p.league_id=m.league_id)`).bind(mappingId,leagueId)
    ]);
    return {eligible:true,complete:true,deleted:0};
  }
  const serialized=JSON.stringify({version:1,leagueId,kind,mappingId,rows:data});
  const bytes=new TextEncoder().encode(serialized);
  if(bytes.byteLength>2000000)throw new Error('Recovery batch exceeds limit');
  const digest=await hash(bytes);
  const key=`import-working-archives/v1/${encodeURIComponent(leagueId)}/${kind}/${encodeURIComponent(mappingId)}/${digest}.json.gz`;
  const compressed=await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  await bucket.put(key,compressed,{httpMetadata:{contentType:'application/gzip'},customMetadata:{sha256:digest,rows:String(data.length)}});
  const restored=await unpack(await bucket.get(key));
  if(await hash(restored)!==digest)throw new Error('Recovery copy verification failed');
  // Compare every column against backed-up values, not just IDs. Concurrent
  // changes are retained. DELETE and audit increment execute atomically in D1.
  const columns=Object.keys(data[0]);
  if(columns.some(x=>!/^\w+$/.test(x)))throw new Error('Invalid recovery schema');
  const match=columns.map(col=>`p."${col}" IS json_extract(j.value,'$.${col}')`).join(' AND ');
  const result=await db.batch([
    db.prepare(`DELETE FROM ${c.table} AS p WHERE p.league_id=? AND p.mapping_run_id=?
      AND p.${c.key} IN(SELECT json_extract(value,'$.${c.key}') FROM json_each(?))
      AND EXISTS(SELECT 1 FROM ${c.run} m WHERE m.id=p.mapping_run_id AND m.league_id=p.league_id AND m.status='retention-archiving' AND ${eligibility(kind)})
      AND EXISTS(SELECT 1 FROM json_each(?) j WHERE ${match})`).bind(leagueId,mappingId,JSON.stringify(data),JSON.stringify(data)),
    db.prepare(`INSERT INTO storage_retention_runs(league_id,kind,mapping_run_id,archived_rows,archived_bytes)
      VALUES(?,?,?,changes(),CASE WHEN changes()>0 THEN ? ELSE 0 END) ON CONFLICT(league_id,kind,mapping_run_id) DO UPDATE SET
      archived_rows=archived_rows+excluded.archived_rows,archived_bytes=archived_bytes+excluded.archived_bytes,last_checked_at=CURRENT_TIMESTAMP`)
      .bind(leagueId,kind,mappingId,compressed.byteLength)
  ]);
  return {eligible:true,deleted:Number(result[0].meta?.changes||0),backupKey:key,backupBytes:compressed.byteLength};
}

// Operator recovery is explicit and tenant-bound. Never overwrite an existing
// row or silently return a partially restored mapping to the import pipeline.
export async function restorePreviewChunk(db,bucket,{key,leagueId,kind,mappingId}){
  const c=config(kind),prefix=`import-working-archives/v1/${encodeURIComponent(leagueId)}/${kind}/${encodeURIComponent(mappingId)}/`;
  if(!key.startsWith(prefix)||!/\/[a-f0-9]{64}\.json\.gz$/.test(key))throw new Error('Recovery scope mismatch');
  const bytes=await unpack(await bucket.get(key));
  if(!key.endsWith(`/${await hash(bytes)}.json.gz`))throw new Error('Recovery copy verification failed');
  const payload=JSON.parse(new TextDecoder().decode(bytes));
  if(payload.version!==1||payload.leagueId!==leagueId||payload.kind!==kind||payload.mappingId!==mappingId||!Array.isArray(payload.rows)||payload.rows.length>100)throw new Error('Recovery scope mismatch');
  const parent=await db.prepare(`SELECT id FROM ${c.run} WHERE id=? AND league_id=?`).bind(mappingId,leagueId).first();
  if(!parent)throw new Error('Recovery parent unavailable');
  const schema=await rows(db,`PRAGMA table_info(${c.table})`),allowed=new Set(schema.map(x=>x.name));
  const statements=payload.rows.map(row=>{
    if(row.league_id!==leagueId||row.mapping_run_id!==mappingId||Object.keys(row).some(x=>!allowed.has(x)))throw new Error('Recovery row scope mismatch');
    const columns=Object.keys(row);
    return db.prepare(`INSERT OR IGNORE INTO ${c.table} (${columns.map(x=>`"${x}"`).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).bind(...columns.map(x=>row[x]));
  });
  const result=statements.length?await db.batch(statements):[];
  return {restored:result.reduce((n,r)=>n+Number(r.meta?.changes||0),0)};
}
