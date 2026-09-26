/* FHQ_BUILD: 8.0.12 */
import { WorkflowEntrypoint } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';

const RELEASE='8.0.12';
const text=value=>String(value??'').trim();
const json=(body,status=200)=>new Response(JSON.stringify(body,null,2),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
const companion=(slug,path)=>`/api/leagues/${encodeURIComponent(slug)}/companion/${path}`;

async function call(context,path,method='GET',body,{acceptProgress=false}={}){
  const response=await fetch(`${context.origin}${path}`,{
    method,
    headers:{
      accept:'application/json',
      'content-type':'application/json',
      'x-franchisehq-import-token':context.token
    },
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const payload=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
  const checkpoint=acceptProgress&&response.ok&&payload?.ok===false
    &&payload?.status==='running'&&payload?.hasMore===true&&!payload?.errors?.length;
  if(!response.ok||(payload?.ok===false&&!checkpoint)){
    // Repeating a rejected request cannot repair missing input or authorization.
    // Keep retries for timeouts, throttling and server failures.
    const Failure=response.status>=400&&response.status<500&&![408,429].includes(response.status)
      ?NonRetryableError:Error;
    const error=new Failure(payload?.detail||payload?.error||payload?.errors?.[0]
      ||`Candidate import request failed (${response.status}).`);
    error.payload=payload;
    throw error;
  }
  return payload;
}

async function report(context,phase,startedAt,summary={}){
  return call(context,companion(context.slug,'candidate-import'),'POST',{
    action:'report-phase',runId:context.runId,phase,ok:true,
    durationMs:Math.max(0,Date.now()-startedAt),
    totalDurationMs:Math.max(0,Date.now()-context.wallStartedAt),
    summary:summary.summary||'Complete',counts:summary.counts||{},warnings:summary.warnings||[],
    teamMappingRunId:summary.teamMappingRunId,
    playerMappingRunId:summary.playerMappingRunId,
    scheduleMappingRunId:summary.scheduleMappingRunId,
    statisticsMappingRunId:summary.statisticsMappingRunId,
    candidateSnapshotId:summary.candidateSnapshotId
  });
}

async function phase(context,step,id,work,summarize){
  const startedAt=Date.now();
  try{
    const result=await step.do(id,{retries:{limit:2,delay:'1 second',backoff:'exponential'},timeout:'2 minutes'},work);
    await step.do(`${id}-report`,()=>report(context,id,startedAt,summarize(result)||{}));
    return result;
  }catch(error){
    await call(context,companion(context.slug,'candidate-import'),'POST',{
      action:'report-phase',runId:context.runId,phase:id,ok:false,
      durationMs:Math.max(0,Date.now()-startedAt),
      totalDurationMs:Math.max(0,Date.now()-context.wallStartedAt),
      summary:error.message,error:{message:error.message}
    }).catch(()=>{});
    throw error;
  }
}

async function mapStatistics(context,step){
  let result=await step.do('map-statistics-start',()=>call(
    context,companion(context.slug,'map-statistics'),'POST',{action:'start',discoverySessionId:context.discoverySessionId,candidateImportRunId:context.runId}
  ));
  const runId=result?.mappingRun?.id;
  if(!runId)throw new Error('Statistics mapper did not return its exact run ID.');
  let guard=0;
  while(!result.complete&&guard<5000){
    result=await step.do(`map-statistics-next-${guard+1}`,()=>call(
      context,companion(context.slug,'map-statistics'),'POST',{action:'next',runId,batches:4}
    ));
    guard+=1;
  }
  if(!result.complete)throw new Error('Statistics mapping exceeded the 5,000-batch safety limit.');
  const final=result;
  const failed=Number(final?.progress?.failed??final?.delta?.failedRoutes??0);
  if(failed)throw new Error(`${failed} statistics route(s) failed; candidate build stopped safely.`);
  return{...final,mappingRun:{...(final.mappingRun||{}),id:runId}};
}

async function checkpointedPhase(context,step,id,work,summarize){
  const startedAt=Date.now();
  try{
    const result=await work();
    await step.do(`${id}-report`,()=>report(context,id,startedAt,summarize(result)||{}));
    return result;
  }catch(error){
    await step.do(`${id}-failure-report`,()=>call(context,companion(context.slug,'candidate-import'),'POST',{
      action:'report-phase',runId:context.runId,phase:id,ok:false,
      durationMs:Math.max(0,Date.now()-startedAt),
      totalDurationMs:Math.max(0,Date.now()-context.wallStartedAt),
      summary:error.message,error:{message:error.message}
    })).catch(()=>{});
    throw error;
  }
}

async function buildCandidate(context,step,mappingRunIds){
  let result=await step.do('build-candidate-start',()=>call(
    context,companion(context.slug,'build-snapshot'),'POST',{
      action:'start',candidateImportRunId:context.runId,...mappingRunIds
    }
  ));
  const snapshotId=result?.snapshot?.snapshotId;
  if(!snapshotId)throw new Error('Candidate builder did not return a snapshot ID.');
  let iteration=0,stalled=0,priorCheckpoint=String(result?.buildJob?.checkpointToken||'');
  while(!result.complete){
    iteration+=1;
    result=await step.do(`build-candidate-next-${iteration}`,()=>call(
      context,companion(context.slug,'build-snapshot'),'POST',{
        action:'next',candidateImportRunId:context.runId,snapshotId,limit:500
      }
    ));
    const job=result.buildJob||{};
    const checkpoint=String(job.checkpointToken||`${job.phase||''}:${Number(job.processedCount||0)}`);
    if(checkpoint===priorCheckpoint)stalled+=1;
    else stalled=0;
    if(stalled>=3)throw new Error('Candidate snapshot build stopped making progress at its durable checkpoint.');
    priorCheckpoint=checkpoint;
  }
  return result;
}

async function validateCandidate(context,step,snapshotId){
  let result=await step.do('validate-candidate-start',()=>call(
    context,companion(context.slug,'snapshot-lifecycle'),'POST',{action:'validate-start',snapshotId}
  ));
  let guard=0;
  while(!result.complete&&guard<500){
    result=await step.do(`validate-candidate-next-${guard+1}`,()=>call(
      context,companion(context.slug,'snapshot-lifecycle'),'POST',{action:'validate-next',snapshotId,limit:500,batches:4}
    ));
    guard+=1;
  }
  if(!result.complete)throw new Error('Candidate validation exceeded the 500-batch safety limit.');
  const snapshot=(result.snapshots||[]).find(item=>item.snapshotId===snapshotId);
  const validation=result.report||snapshot?.validationReport||{};
  const status=String(snapshot?.validationStatus||validation.status||'').toLowerCase();
  if(status!=='ready'||Number(snapshot?.errorCount||validation.errorCount||0)){
    throw new Error(`Candidate validation failed: ${(validation.errors||[]).slice(0,5).join(' | ')||status||'not ready'}`);
  }
  return{...result,snapshot};
}

export class FranchiseImportWorkflow extends WorkflowEntrypoint{
  async run(event,step){
    const input=event.payload||{};
    const context={
      slug:text(input.leagueSlug),
      origin:text(input.origin).replace(/\/+$/,''),
      token:text(input.importAuthToken),
      wallStartedAt:Date.now(),
      runId:null
    };
    if(!context.slug||!context.origin||!context.token)throw new Error('Candidate workflow payload is incomplete.');

    await step.do('prepare-season-destination',()=>call(
      context,companion(context.slug,'candidate-import'),'POST',{action:'create-destination'}
    ));
    const started=await step.do('start-candidate-import',()=>call(
      context,companion(context.slug,'candidate-import'),'POST',{action:'start',retry:Boolean(input.retry)}
    ));
    context.runId=started?.run?.id||null;
    context.discoverySessionId=started?.source?.discoverySessionId||null;
    if(!context.runId)throw new Error('Candidate importer did not return a durable run ID.');
    if(started.warm&&started.run?.status==='preview-ready'){
      const durationMs=Date.now()-context.wallStartedAt;
      const finalized=await step.do('publish-existing-validated-import',()=>call(
        context,companion(context.slug,'candidate-import'),'POST',{action:'finalize',runId:context.runId,durationMs}
      ));
      return{
        ok:true,release:RELEASE,reusedExisting:true,run:finalized.run,
        candidateSnapshotId:started.run.candidateSnapshotId,durationMs,
        private:false,activationPerformed:true,activeSnapshotChanged:Boolean(finalized.run?.activeSnapshotChanged)
      };
    }

    const analyzed=await phase(context,step,'analyze-source',()=>call(
      context,companion(context.slug,'discovery-report'),'POST',{
        sessionId:started.source?.discoverySessionId,reuseExisting:true
      }
    ),payload=>({
      summary:`${Number(payload.report?.captureCount||0)} captures analyzed`,
      counts:{captures:Number(payload.report?.captureCount||0),routes:Number(payload.report?.routeCount||0)}
    }));

    await phase(context,step,'classify-captures',()=>call(
      context,companion(context.slug,'classify'),'POST',{discoverySessionId:context.discoverySessionId}
    ),payload=>({
      summary:`${Number(payload.inspectedRouteCount||0)} captures classified`,
      counts:{classifiedCaptures:Number(payload.inspectedRouteCount||0)}
    }));

    const teams=await phase(context,step,'map-teams',()=>call(
      context,companion(context.slug,'map-teams'),'POST',{discoverySessionId:context.discoverySessionId}
    ),payload=>({
      summary:`${Number(payload.mappingRun?.teamCount??payload.teams?.length??0)} teams mapped`,
      counts:{teams:Number(payload.mappingRun?.teamCount??payload.teams?.length??0)},
      teamMappingRunId:payload.mappingRun?.id
    }));

    const players=await phase(context,step,'map-players',()=>call(
      context,companion(context.slug,'map-players'),'POST',{
        compact:true,discoverySessionId:context.discoverySessionId,candidateImportRunId:context.runId
      }
    ),payload=>{
      const count=Number(payload.mappingRun?.playerCount??payload.playerCount??0);
      const freeAgentStatus=payload.mappingCompleteness==='complete'
        ?'located':String(analyzed.report?.freeAgentEvidence?.status||'missing');
      const warnings=[...(payload.mappingRun?.warnings||[])];
      if(freeAgentStatus==='blocked')warnings.push('Madden Free Agents are blocked upstream; count remains unknown.');
      return{
        summary:`${count} rostered players mapped`,
        counts:{players:count,rosteredPlayers:Number(payload.mappingRun?.rosteredCount??count),freeAgentStatus,
          freeAgentCount:['located','empty-confirmed'].includes(freeAgentStatus)?Number(payload.mappingRun?.freeAgentCount||0):null},
        warnings,playerMappingRunId:payload.mappingRun?.id
      };
    });

    const schedule=await phase(context,step,'map-schedule',()=>call(
      context,companion(context.slug,'map-schedule'),'POST',{discoverySessionId:context.discoverySessionId,candidateImportRunId:context.runId}
    ),payload=>({
      summary:`${Number(payload.mappingRun?.gameCount??payload.games?.length??0)} games mapped`,
      counts:{games:Number(payload.mappingRun?.gameCount??payload.games?.length??0)},
      warnings:payload.mappingRun?.warnings||[],scheduleMappingRunId:payload.mappingRun?.id
    }));

    const statistics=await checkpointedPhase(context,step,'map-statistics',()=>mapStatistics(context,step),payload=>({
      summary:`${Number(payload.mappingRun?.recordCount||0)} statistics mapped`,
      counts:{statistics:Number(payload.mappingRun?.recordCount||0)},
      warnings:payload.mappingRun?.warnings||[],statisticsMappingRunId:payload.mappingRun?.id
    }));

    const mappingRunIds={
      teamMappingRunId:teams.mappingRun?.id,
      playerMappingRunId:players.mappingRun?.id,
      scheduleMappingRunId:schedule.mappingRun?.id,
      statisticsMappingRunId:statistics.mappingRun?.id
    };
    const built=await checkpointedPhase(context,step,'build-candidate',()=>buildCandidate(context,step,mappingRunIds),payload=>({
      summary:`Import snapshot ${payload.snapshot?.snapshotId||'built'}`,
      counts:payload.snapshot?.counts||{},candidateSnapshotId:payload.snapshot?.snapshotId
    }));
    const snapshotId=built.snapshot?.snapshotId;
    if(!snapshotId)throw new Error('Candidate builder did not return a snapshot ID.');

    await checkpointedPhase(context,step,'validate-candidate',()=>validateCandidate(context,step,snapshotId),payload=>({
      summary:'Import validation ready',counts:payload.snapshot?.counts||{},candidateSnapshotId:snapshotId
    }));

    const durationMs=Date.now()-context.wallStartedAt;
    const finalized=await step.do('validate-and-publish-live',()=>call(
      context,companion(context.slug,'candidate-import'),'POST',{action:'finalize',runId:context.runId,durationMs}
    ));
    return{
      ok:true,release:RELEASE,run:finalized.run,candidateSnapshotId:snapshotId,durationMs,
      performanceTargetMet:durationMs<60000,private:false,activationPerformed:true,
      activeSnapshotChanged:Boolean(finalized.run?.activeSnapshotChanged)
    };
  }
}

export class FranchiseScheduleWorkflow extends WorkflowEntrypoint{
  async run(event,step){
    const input=event.payload||{};
    const context={slug:text(input.leagueSlug),origin:text(input.origin).replace(/\/+$/,''),
      token:text(input.importAuthToken)};
    const snapshotId=text(input.snapshotId),source=text(input.source);
    if(!context.slug||!context.origin||!context.token||!snapshotId
      ||!['candidate-import','rollover-recovery'].includes(source)){
      throw new Error('Schedule workflow payload is incomplete.');
    }
    try{
      let result;
      for(let index=0;index<80;index+=1){
        result=await step.do(`schedule-batch-${index+1}`,{
          retries:{limit:2,delay:'2 seconds',backoff:'exponential'},timeout:'2 minutes'
        },()=>call(context,companion(context.slug,'schedule-sync-job'),'POST',{
          snapshotId,source,maxOperations:1
        },{acceptProgress:true}));
        if(result.status==='completed')return{ok:true,release:RELEASE,source,snapshotId,result};
        if(result.status!=='running'||!result.hasMore){
          throw new Error(`Schedule sync stopped: ${result.reason||result.errors?.[0]||result.status||'unknown state'}`);
        }
      }
      throw new Error('Schedule sync exceeded the 80-batch safety limit.');
    }catch(error){
      await call(context,companion(context.slug,'schedule-sync-job'),'POST',{
        action:'fail',snapshotId,source,error:String(error?.message||error).slice(0,500)
      }).catch(()=>{});
      throw error;
    }
  }
}

export class FranchiseEaCollectionWorkflow extends WorkflowEntrypoint{
  async run(event,step){
    const input=event.payload||{},slug=text(input.leagueSlug),id=text(input.jobId);
    const origin=text(input.origin),token=text(input.collectionToken);
    if(!validEaOrigin(origin)||!/^eaj_[a-f0-9-]{36}$/.test(id)||!slug||!token)throw new Error('EA collection parameters are invalid.');
    const endpoint=`${origin}/api/leagues/${encodeURIComponent(slug)}/ea-direct/collect-step`;
    const invoke=async(body)=>{
      const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','x-franchisehq-ea-collection-token':token},body:JSON.stringify({id,...body}),signal:AbortSignal.timeout(120000)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok)throw new Error('EA collection step could not finish. Details are retained in the league connection panel.');
      return result;
    };
    let cursor=0;
    try{
      for(let index=0;index<140;index+=1){
        const result=await step.do(`ea-collect-${index}`,{retries:{limit:3,delay:'5 seconds',backoff:'exponential'},timeout:'3 minutes'},()=>invoke({cursor}));
        if(result.done)return{ok:true,id,activationPerformed:false};
        cursor=Number(result.cursor);
        if(!Number.isSafeInteger(cursor)||cursor<0)throw new Error('EA collection checkpoint is invalid.');
      }
      throw new Error('EA collection exceeded its bounded request plan.');
    }catch(error){
      await step.do('ea-collection-failed',()=>invoke({action:'fail'})).catch(()=>{});
      throw error;
    }
  }
}

function validEaOrigin(value){
  try{const url=new URL(value);return url.origin===value&&url.protocol==='https:'
    &&(url.hostname==='franchisehq.app'||url.hostname==='franchise-hq.pages.dev'||/^[a-z0-9-]+\.franchise-hq\.pages\.dev$/.test(url.hostname));}catch{return false;}
}

async function workflowId(slug,workflowKey){
  const encoded=new TextEncoder().encode(`${slug}:${workflowKey}`);
  const digest=await crypto.subtle.digest('SHA-256',encoded);
  return`fhq-${Array.from(new Uint8Array(digest)).slice(0,12).map(value=>value.toString(16).padStart(2,'0')).join('')}`;
}

export default{
  async fetch(request,env){
    try{
      const url=new URL(request.url);
      if(url.pathname==='/ea/start'&&request.method==='POST'){
        const body=await request.json().catch(()=>({}));
        if(!validEaOrigin(body.origin)||!/^eaj_[a-f0-9-]{36}$/.test(body.jobId||'')
          ||!/^\w{64}$/.test(body.collectionToken||'')||!text(body.leagueSlug)){
          return json({ok:false,error:'Invalid EA collection start.'},400);
        }
        if(!env.FRANCHISE_EA_COLLECTION_WORKFLOW)return json({ok:false,error:'EA collector unavailable.'},503);
        const id=body.jobId.replace('eaj_','ea-');
        try{await env.FRANCHISE_EA_COLLECTION_WORKFLOW.create({id,params:body});}
        catch{const existing=await(await env.FRANCHISE_EA_COLLECTION_WORKFLOW.get(id)).status();if(!existing)throw new Error('EA collector could not start.');}
        return json({ok:true,id});
      }
      if(url.pathname==='/start'&&request.method==='POST'){
        const body=await request.json().catch(()=>({}));
        const slug=text(body.leagueSlug),origin=text(body.origin).replace(/\/+$/,''),token=text(body.importAuthToken);
        const workflowKey=text(body.workflowKey);
        if(!slug||!origin||!token||!workflowKey)return json({ok:false,release:RELEASE,error:'Missing workflow start parameters.'},400);
        const baseId=await workflowId(slug,workflowKey);
        let status=null;
        try{status=await (await env.FRANCHISE_IMPORT_WORKFLOW.get(baseId)).status();}catch{}
        const failed=['failed','errored','error','terminated','cancelled','canceled'].includes(String(status?.status||'').toLowerCase());
        if(status&&!failed)return json({ok:true,release:RELEASE,id:baseId,reusedExisting:true,workflowKey,status});
        let id=failed?`${baseId}-r${Date.now().toString(36)}`:baseId;
        let instance;
        try{instance=await env.FRANCHISE_IMPORT_WORKFLOW.create({id,params:{...body,retry:failed||Boolean(body.retry)}});}
        catch(error){
          id=`${baseId}-r${Date.now().toString(36)}-${crypto.randomUUID().slice(0,6)}`;
          instance=await env.FRANCHISE_IMPORT_WORKFLOW.create({id,params:{...body,retry:true}});
        }
        return json({ok:true,release:RELEASE,id,reusedExisting:false,retryOfFailedWorkflow:failed,workflowKey,status:await instance.status().catch(()=>null)});
      }
      if(url.pathname==='/schedule/start'&&request.method==='POST'){
        const body=await request.json().catch(()=>({}));
        const slug=text(body.leagueSlug),origin=text(body.origin).replace(/\/+$/,''),token=text(body.importAuthToken);
        const workflowKey=text(body.workflowKey),source=text(body.source),snapshotId=text(body.snapshotId);
        if(!slug||!origin||!token||!workflowKey||!snapshotId
          ||!['candidate-import','rollover-recovery'].includes(source)){
          return json({ok:false,release:RELEASE,error:'Missing schedule workflow parameters.'},400);
        }
        const baseId=await workflowId(slug,`schedule:${workflowKey}`);
        let status=null;
        try{status=await(await env.FRANCHISE_SCHEDULE_WORKFLOW.get(baseId)).status();}catch{}
        const state=String(status?.status||'').toLowerCase();
        if(status&&!['failed','errored','error','terminated','cancelled','canceled'].includes(state)){
          return json({ok:true,release:RELEASE,id:baseId,reusedExisting:true,workflowKey,status});
        }
        const id=status?`${baseId}-r${Date.now().toString(36)}`:baseId;
        const instance=await env.FRANCHISE_SCHEDULE_WORKFLOW.create({id,params:body});
        return json({ok:true,release:RELEASE,id,reusedExisting:false,workflowKey,status:await instance.status().catch(()=>null)});
      }
      if(url.pathname==='/status'&&request.method==='GET'){
        const id=text(url.searchParams.get('id'));
        let status=null;
        if(id)try{status=await (await env.FRANCHISE_IMPORT_WORKFLOW.get(id)).status();}catch(error){status={status:'unknown',error:String(error?.message||error)}}
        return json({ok:true,release:RELEASE,id,workflowStatus:status,workflowState:String(status?.status||'unknown').toLowerCase(),workflowOutput:status?.output||null});
      }
      if(url.pathname==='/schedule/status'&&request.method==='GET'){
        const id=text(url.searchParams.get('id'));
        let status=null;
        if(id)try{status=await(await env.FRANCHISE_SCHEDULE_WORKFLOW.get(id)).status();}catch(error){status={status:'unknown',error:String(error?.message||error)}}
        return json({ok:true,release:RELEASE,id,workflowStatus:status});
      }
      return json({ok:false,release:RELEASE,error:'Not found.'},404);
    }catch(error){
      console.error('[Franchise Candidate Import Worker]',error);
      return json({ok:false,release:RELEASE,error:error?.message||'Candidate import Worker failed.'},500);
    }
  }
};
