import {archivePreviewBatch,retentionCandidates,RETENTION_KINDS} from '../../../functions/_lib/storage-retention.js';

export default {
  async scheduled(_event,env){
    const started=Date.now();let deleted=0,completed=0,observedRows=0;
    // No public endpoint, user sessions, Discord requests or EA requests. All
    // deletions fail closed unless a private recovery copy reads back correctly.
    // Four independent datasets share the same wall-time budget. Retain the
    // selected mapping between chunks to avoid repeated full eligibility scans.
    const results=await Promise.allSettled(Object.keys(RETENTION_KINDS).map(async kind=>{
      let candidate;
      for(let batch=0;batch<20&&Date.now()-started<45000;batch++){
        if(!candidate)[candidate]=await retentionCandidates(env.DB,kind);
        if(!candidate)break;
        const result=await archivePreviewBatch(env.DB,env.COMPANION_EXPORTS,{kind,leagueId:candidate.league_id,mappingId:candidate.id,apply:env.STORAGE_RETENTION_MODE==='apply'});
        deleted+=result.deleted||0;if(result.complete)completed++;
        observedRows+=result.rows||0;
        if(result.complete)candidate=null;
        if(env.STORAGE_RETENTION_MODE!=='apply'||!result.eligible)break;
      }
    }));
    const failures=results.filter(r=>r.status==='rejected').length;
    console.log(JSON.stringify({event:'storage-maintenance',mode:env.STORAGE_RETENTION_MODE==='apply'?'apply':'observe',observedRows,deleted,completed,failures,durationMs:Date.now()-started}));
    if(failures)throw new Error('Storage maintenance could not finish every dataset; protected recovery checks will retry next schedule.');
  },
  fetch(){return new Response('Not found',{status:404});}
};
