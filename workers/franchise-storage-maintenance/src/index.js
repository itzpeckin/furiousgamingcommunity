import {archivePreviewBatch,retentionCandidates,RETENTION_KINDS} from '../../../functions/_lib/storage-retention.js';

export default {
  async scheduled(_event,env){
    const started=Date.now();let deleted=0,completed=0,observedRows=0;
    // No public endpoint, user sessions, Discord requests or EA requests. All
    // deletions fail closed unless a private recovery copy reads back correctly.
    for(const kind of Object.keys(RETENTION_KINDS)){
      for(let batch=0;batch<20&&Date.now()-started<45000;batch++){
        const [candidate]=await retentionCandidates(env.DB,kind);
        if(!candidate)break;
        const result=await archivePreviewBatch(env.DB,env.COMPANION_EXPORTS,{kind,leagueId:candidate.league_id,mappingId:candidate.id,apply:env.STORAGE_RETENTION_MODE==='apply'});
        deleted+=result.deleted||0;if(result.complete)completed++;
        observedRows+=result.rows||0;
        if(env.STORAGE_RETENTION_MODE!=='apply'||!result.eligible)break;
      }
    }
    console.log(JSON.stringify({event:'storage-maintenance',mode:env.STORAGE_RETENTION_MODE==='apply'?'apply':'observe',observedRows,deleted,completed,durationMs:Date.now()-started}));
  },
  fetch(){return new Response('Not found',{status:404});}
};
