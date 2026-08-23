/* FHQ_BUILD: 5.9.10.6.5.4h-p5e */
import { WorkflowEntrypoint } from 'cloudflare:workers';

const RELEASE='5.9.10.6.5.4h-p5e';
const json=(body,status=200)=>new Response(JSON.stringify(body,null,2),{
  status,
  headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
const text=v=>String(v??'').trim();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function apiHeaders(ownerAccountId,importAuthToken){
  const ownerId=ownerAccountId&&typeof ownerAccountId==='object'
    ? String(ownerAccountId.id||'')
    : String(ownerAccountId||'');
  const delegatedToken=importAuthToken||(
    ownerAccountId&&typeof ownerAccountId==='object'
      ? ownerAccountId.importAuthToken||''
      : ''
  );
  const headers={
    accept:'application/json',
    'content-type':'application/json',
    'x-franchisehq-platform-owner-account-id':ownerId
  };
  if(delegatedToken)headers['x-franchisehq-import-token']=String(delegatedToken);
  return headers;
}
async function call(origin,path,ownerAccountId,method='GET',body,importAuthToken=''){
  const response=await fetch(`${origin}${path}`,{
    method,
    headers:apiHeaders(ownerAccountId,importAuthToken),
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const payload=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
  if(!response.ok||payload?.ok===false){
    const err=new Error(payload?.detail||payload?.error||`Import request failed (${response.status}).`);
    err.payload=payload;
    throw err;
  }
  return payload;
}
const companion=(slug,path)=>`/api/leagues/${encodeURIComponent(slug)}/companion/${path}`;
const transactions=(slug,path)=>`/api/leagues/${encodeURIComponent(slug)}/transactions/${path}`;

async function report(ctx,stage,ok,extra={}){
  if(!ctx.runId)return null;
  const payload=await call(ctx.origin,companion(ctx.slug,'import-orchestrator'),ctx.owner,'POST',{
    action:'report',runId:ctx.runId,stage,ok,...extra
  });
  return payload;
}
async function stage(ctx,step,name,fn){
  try{
    const result=await step.do(name,{retries:{limit:2,delay:'2 seconds',backoff:'exponential'},timeout:'15 minutes'},fn);
    return result;
  }catch(error){
    await report(ctx,name,false,{error:{message:error.message,detail:error.payload||null}}).catch(()=>{});
    throw error;
  }
}
async function simple(ctx,step,name,path,summaryFn){
  const payload=await stage(ctx,step,name,()=>call(ctx.origin,companion(ctx.slug,path),ctx.owner,'POST',{}));
  const summary=summaryFn?summaryFn(payload):'Complete';
  await report(ctx,name,true,{summary});
  return payload;
}

export class FranchiseImportWorkflow extends WorkflowEntrypoint {
  async run(event,step){
    const payload=event.payload||{};
    const workflowStartedAt=Date.now();
    const ctx={
      slug:text(payload.leagueSlug),
      owner:{
        id:text(payload.ownerAccountId),
        importAuthToken:text(payload.importAuthToken)
      },
      origin:text(payload.origin).replace(/\/+$/,''),
      runId:null,
      snapshotId:null,
      playerMappingRunId:null,
      importAuthToken:text(payload.importAuthToken),
      lifecycleReconciliation:{processedSessions:0,eventCount:0,freeAgents:null,skipped:true}
    };
    if(!ctx.slug||!ctx.owner.id||!ctx.origin||!ctx.importAuthToken)throw new Error('Workflow payload is incomplete.');
    ctx.call=(path,method='GET',body)=>call(ctx.origin,path,ctx.owner,method,body,ctx.importAuthToken);

    // Discover and the no-new-export gate happen before an orchestrator run exists.
    // The original proven browser pipeline also performed storage preflight before
    // creating the orchestrator. Once the run starts, its first expected stage is map-teams.
    const delta=await step.do('discover',async()=>call(
      ctx.origin,companion(ctx.slug,'change-check'),ctx.owner
    ));

    if(delta?.unchanged&&delta?.activeSnapshot?.id){
      ctx.snapshotId=String(delta.activeSnapshot.id);
      return {
        ok:true,
        release:RELEASE,
        noChange:true,
        noNewExport:Boolean(delta.noNewExport),
        snapshotId:ctx.snapshotId,
        runId:null,
        durationMs:Date.now()-workflowStartedAt
      };
    }

    const reusePlayers=Boolean(delta?.canReusePlayers&&!delta?.rosterChanged);

    const storage=await step.do(
      'storage-preflight',
      {retries:{limit:2,delay:'2 seconds',backoff:'exponential'},timeout:'15 minutes'},
      ()=>call(
        ctx.origin,companion(ctx.slug,'storage-preflight'),ctx.owner,'POST',
        {preservePlayers:reusePlayers}
      )
    );

    const started=await step.do('create-import-run',async()=>call(
      ctx.origin,companion(ctx.slug,'import-orchestrator'),ctx.owner,'POST',{action:'start'}
    ));
    ctx.runId=started?.run?.id||null;
    if(!ctx.runId)throw new Error('Import orchestrator did not return a run ID.');

    await simple(ctx,step,'map-teams','map-teams',p=>`${p.teams?.length??p.mappingRun?.teamCount??'?'} teams mapped`);

    if(reusePlayers){
      ctx.lifecycleReconciliation={
        processedSessions:0,
        eventCount:0,
        freeAgents:null,
        skipped:true,
        reusedPlayers:true
      };
      // Lifecycle reconstruction is auxiliary work, not an orchestrator stage.
      // Only advance the orchestrator through its expected map-players stage.
      await report(ctx,'map-players',true,{
        summary:`${Number(delta?.reusablePlayerPreviewCount||0)} players reused · roster unchanged`,
        reused:true
      });
    }else{
      const plan=await stage(ctx,step,'reconstruct-player-lifecycle',()=>call(
        ctx.origin,transactions(ctx.slug,'canonical'),ctx.owner,'POST',{action:'capture-lifecycle-plan'}
      ));
      const pending=(plan?.sessions||[]).filter(row=>!row.processed);
      let processed=0;
      const processedSessionIds=[];
      for(const session of pending){
        await step.do(`lifecycle-${processed+1}`,{retries:{limit:2,delay:'2 seconds'},timeout:'15 minutes'},()=>call(
          ctx.origin,transactions(ctx.slug,'canonical'),ctx.owner,'POST',
          {action:'capture-lifecycle-session',sessionId:session.sessionId}
        ));
        processedSessionIds.push(session.sessionId);
        processed++;
      }
      const finalized=processedSessionIds.length
        ? await step.do('lifecycle-finalize',()=>call(
            ctx.origin,transactions(ctx.slug,'canonical'),ctx.owner,'POST',
            {action:'capture-lifecycle-finalize',sessionIds:processedSessionIds,incremental:true}
          ))
        : {eventCount:0,freeAgents:null,incremental:true,skipped:true};

      ctx.lifecycleReconciliation={
        ...finalized,
        processedSessions:processedSessionIds.length,
        skipped:processedSessionIds.length===0,
        planStrategy:plan?.strategy||null,
        planDurationMs:Number(plan?.durationMs||0),
        ignoredHistoricalCandidateCount:Number(plan?.ignoredHistoricalCandidateCount||0)
      };

      // Do not report reconstruct-player-lifecycle to the import orchestrator.
      // Its next expected stage is map-players.
      const mappedPlayers=await stage(ctx,step,'map-players',()=>call(
        ctx.origin,companion(ctx.slug,'map-players'),ctx.owner,'POST',{compact:true}
      ));
      ctx.playerMappingRunId=mappedPlayers?.mappingRun?.id||null;
      if(!ctx.playerMappingRunId)throw new Error('Map Players completed without returning its exact mapping run ID.');
      const total=mappedPlayers?.mappingRun?.playerCount??mappedPlayers?.playerCount??'?';
      const fas=mappedPlayers?.lifecycleFreeAgentCount??mappedPlayers?.mappingRun?.freeAgentCount??0;
      await report(ctx,'map-players',true,{
        summary:`${total} players mapped · ${fas} Free Agent(s)`,
        lifecycle:{
          strategy:ctx.lifecycleReconciliation?.strategy||ctx.lifecycleReconciliation?.planStrategy||null,
          processedSessions:Number(ctx.lifecycleReconciliation?.processedSessions||0),
          eventCount:Number(ctx.lifecycleReconciliation?.eventCount||0),
        drafted:Number(ctx.lifecycleReconciliation?.drafted||0),
          durationMs:Number(ctx.lifecycleReconciliation?.durationMs||0),
          ignoredHistoricalCandidateCount:Number(ctx.lifecycleReconciliation?.ignoredHistoricalCandidateCount||0),
          routeCount:Number(ctx.lifecycleReconciliation?.routeCount||0),
          spreadMs:Number(ctx.lifecycleReconciliation?.spreadMs||0)
        }
      });
    }

    await simple(ctx,step,'map-schedule','map-schedule',p=>`${p.games?.length??p.mappingRun?.gameCount??'?'} games mapped`);

    let stats=await step.do('statistics-start',{retries:{limit:2,delay:'2 seconds'},timeout:'15 minutes'},()=>call(
      ctx.origin,companion(ctx.slug,'map-statistics'),ctx.owner,'POST',{action:'start'}
    ));
    const statsRunId=stats?.mappingRun?.id;
    if(!statsRunId)throw new Error('Statistics mapper did not return a run ID.');
    let statsGuard=0;
    while(!stats.complete&&statsGuard<5000){
      stats=await step.do(`statistics-next-${statsGuard+1}`,{retries:{limit:2,delay:'2 seconds'},timeout:'15 minutes'},()=>call(
        ctx.origin,companion(ctx.slug,'map-statistics'),ctx.owner,'POST',{action:'next',runId:statsRunId}
      ));
      statsGuard++;
    }
    if(statsGuard>=5000)throw new Error('Statistics mapping stopped after 5000 chunks.');
    const statsFinal=await step.do('statistics-final',()=>call(ctx.origin,companion(ctx.slug,'map-statistics'),ctx.owner));
    const failed=Number(statsFinal?.progress?.failed??statsFinal?.delta?.failedRoutes??0);
    if(failed>0)throw new Error(`${failed} statistics route(s) failed mapping. Snapshot build blocked.`);
    await report(ctx,'map-statistics',true,{
      summary:`${statsFinal?.mappingRun?.recordCount??0} new/changed statistics records mapped`,
      statisticsMappingRunId:statsRunId
    });

    const built=await stage(ctx,step,'build-snapshot',()=>call(
      ctx.origin,companion(ctx.slug,'build-snapshot'),ctx.owner,'POST',
      {playerMappingRunId:ctx.playerMappingRunId}
    ));
    ctx.snapshotId=built?.snapshot?.snapshotId||built?.snapshotId||null;
    if(!ctx.snapshotId)throw new Error('Snapshot Builder completed without returning a Snapshot ID.');
    await report(ctx,'build-snapshot',true,{
      summary:`Snapshot ${ctx.snapshotId} built · players ${ctx.playerMappingRunId}`,
      snapshotId:ctx.snapshotId,
      playerMappingRunId:ctx.playerMappingRunId
    });

    let validation=await step.do('validation-start',{retries:{limit:2,delay:'2 seconds'},timeout:'15 minutes'},()=>call(
      ctx.origin,companion(ctx.slug,'snapshot-lifecycle'),ctx.owner,'POST',{action:'validate-start',snapshotId:ctx.snapshotId}
    ));
    let validationGuard=0;
    while(!validation.complete&&validationGuard<500){
      validation=await step.do(`validation-next-${validationGuard+1}`,{retries:{limit:2,delay:'2 seconds'},timeout:'15 minutes'},()=>call(
        ctx.origin,companion(ctx.slug,'snapshot-lifecycle'),ctx.owner,'POST',{action:'validate-next',snapshotId:ctx.snapshotId,limit:250}
      ));
      validationGuard++;
    }
    if(validationGuard>=500)throw new Error('Snapshot validation stopped after 500 batches.');
    await report(ctx,'validate-snapshot',true,{summary:'Validation ready',snapshotId:ctx.snapshotId});

    await stage(ctx,step,'activate-snapshot',()=>call(
      ctx.origin,companion(ctx.slug,'snapshot-lifecycle'),ctx.owner,'POST',{action:'activate',snapshotId:ctx.snapshotId}
    ));
    await report(ctx,'activate-snapshot',true,{summary:`LIVE · ${ctx.snapshotId}`,snapshotId:ctx.snapshotId});

    let detection=await step.do('transactions-detect-start',{retries:{limit:2,delay:'2 seconds'},timeout:'15 minutes'},()=>call(
      ctx.origin,transactions(ctx.slug,'forward-detection'),ctx.owner,'POST',{action:'start'}
    ));
    let detectGuard=0;
    while(!detection.complete&&detectGuard<20){
      detection=await step.do(`transactions-detect-next-${detectGuard+1}`,{retries:{limit:2,delay:'2 seconds'},timeout:'15 minutes'},()=>call(
        ctx.origin,transactions(ctx.slug,'forward-detection'),ctx.owner,'POST',{action:'next',limit:750}
      ));
      detectGuard++;
    }
    if(detectGuard>=20)throw new Error('Forward transaction detection stopped after 20 batches.');
    await report(ctx,'detect-transactions',true,{summary:`${Number(detection?.job?.movementCount||0)} movement(s) detected`,snapshotId:ctx.snapshotId});

    const classified=await stage(ctx,step,'classify-transactions',()=>call(
      ctx.origin,transactions(ctx.slug,'classification'),ctx.owner,'POST',{action:'classify'}
    ));
    await report(ctx,'classify-transactions',true,{summary:`${Number(classified?.classifiedCount||0)} classified`,snapshotId:ctx.snapshotId});

    // Lifecycle reconciliation already ran once, incrementally, before player mapping.
    // Do NOT rescan historical lifecycle sessions here.
    const reconciled=ctx.lifecycleReconciliation||{eventCount:0,processedSessions:0,skipped:true};
    await step.do('reconcile-transactions',async()=>({
      ok:true,
      incremental:true,
      reusedLifecycleResult:true,
      eventCount:Number(reconciled?.eventCount||0),
      processedSessions:Number(reconciled?.processedSessions||0)
    }));
    await report(ctx,'reconcile-transactions',true,{
      summary:`${Number(reconciled?.eventCount||0)} lifecycle event(s) · ${Number(reconciled?.processedSessions||0)} new session(s) reconciled`,
      snapshotId:ctx.snapshotId
    });

    const verified=await stage(ctx,step,'verify-active-snapshot',()=>call(
      ctx.origin,companion(ctx.slug,'snapshot-verification'),ctx.owner
    ));
    const active=verified?.snapshot?.id||verified?.snapshot?.snapshotId||verified?.activeSnapshotId||null;
    if(active&&String(active)!==String(ctx.snapshotId))throw new Error(`Verification returned different active snapshot (${active}).`);
    await report(ctx,'verify-active-snapshot',true,{summary:'LIVE snapshot verified',snapshotId:ctx.snapshotId});

    // Canonical lifecycle/free-agent state was already finalized incrementally.
    // Publishing is now a lightweight confirmation step rather than another historical rescan.
    const published=await step.do('publish-transactions',async()=>({
      ok:true,
      incremental:true,
      reusedLifecycleResult:true,
      eventCount:Number(ctx.lifecycleReconciliation?.eventCount||0),
      freeAgents:ctx.lifecycleReconciliation?.freeAgents||null
    }));

    // Certification is server-side now as well. Failure here does not undo the already-verified LIVE snapshot.
    await step.do('certification',{retries:{limit:1,delay:'2 seconds'},timeout:'5 minutes'},()=>call(
      ctx.origin,companion(ctx.slug,'import-certification'),ctx.owner,'POST',
      {snapshotId:ctx.snapshotId,runId:ctx.runId,serverSide:true}
    )).catch(()=>null);

    return {ok:true,release:RELEASE,noChange:false,snapshotId:ctx.snapshotId,runId:ctx.runId,durationMs:Date.now()-workflowStartedAt};
  }
}

export default {
  async fetch(request,env){
    try{
      const url=new URL(request.url);
    if(url.pathname==='/start'&&request.method==='POST'){
      const body=await request.json().catch(()=>({}));
      const slug=text(body.leagueSlug);
      const owner=text(body.ownerAccountId);
      const origin=text(body.origin).replace(/\/+$/,'');
      const token=text(body.importAuthToken);
      const workflowKey=text(body.workflowKey);

      if(!slug||!owner||!origin||!token||!workflowKey){
        return json({ok:false,release:RELEASE,error:'Missing workflow start parameters.'},400);
      }

      const encoded=new TextEncoder().encode(`${slug}:${workflowKey}`);
      const digest=await crypto.subtle.digest('SHA-256',encoded);
      const shortHash=Array.from(new Uint8Array(digest))
        .slice(0,12)
        .map(v=>v.toString(16).padStart(2,'0'))
        .join('');
      const baseId=`fhq-${shortHash}`;

      // Same Companion session = same Workflow while that Workflow is healthy/running/completed.
      // A FAILED Workflow must never be reused for a retry because its Cloudflare step state
      // contains the old failed statistics result.
      let baseStatus=null;
      let baseFailed=false;
      try{
        const existing=await env.FRANCHISE_IMPORT_WORKFLOW.get(baseId);
        baseStatus=await existing.status().catch(()=>null);
        const existingState=String(baseStatus?.status||'').toLowerCase();
        baseFailed=['failed','errored','error','terminated','cancelled','canceled'].includes(existingState);

        if(baseStatus&&!baseFailed){
          return json({
            ok:true,release:RELEASE,id:baseId,reusedExisting:true,
            workflowKey,status:baseStatus
          });
        }
      }catch(_){}

      // If the deterministic ID belongs to a failed run, create a fresh retry ID immediately.
      // Do not attempt to recreate or recover the failed base ID.
      let id=baseFailed
        ? `${baseId}-r${Date.now().toString(36)}`
        : baseId;
      let instance=null;

      try{
        instance=await env.FRANCHISE_IMPORT_WORKFLOW.create({id,params:body});
      }catch(createError){
        if(baseFailed){
          // Extremely unlikely retry-ID collision: create another unique retry instance.
          id=`${baseId}-r${Date.now().toString(36)}-${crypto.randomUUID().slice(0,6)}`;
          instance=await env.FRANCHISE_IMPORT_WORKFLOW.create({id,params:body});
        }else{
          // Healthy concurrent start race: another device may have created baseId first.
          const raced=await env.FRANCHISE_IMPORT_WORKFLOW.get(baseId);
          const racedStatus=await raced.status().catch(()=>null);
          const racedState=String(racedStatus?.status||'').toLowerCase();

          if(racedStatus&&!['failed','errored','error','terminated','cancelled','canceled'].includes(racedState)){
            return json({
              ok:true,release:RELEASE,id:baseId,reusedExisting:true,raced:true,
              workflowKey,status:racedStatus
            });
          }

          // The race target failed before recovery; start a clean retry instead.
          id=`${baseId}-r${Date.now().toString(36)}-${crypto.randomUUID().slice(0,6)}`;
          instance=await env.FRANCHISE_IMPORT_WORKFLOW.create({id,params:body});
        }
      }

      return json({
        ok:true,
        release:RELEASE,
        id,
        reusedExisting:false,
        retryOfFailedWorkflow:baseFailed,
        workflowKey,
        status:await instance.status().catch(()=>null)
      });
    }

    if(url.pathname==='/status'&&request.method==='GET'){
      const id=text(url.searchParams.get('id'));
      let workflowStatus=null;

      if(id){
        try{
          const instance=await env.FRANCHISE_IMPORT_WORKFLOW.get(id);
          workflowStatus=await instance.status().catch(error=>({
            status:'unknown',
            error:String(error?.message||error)
          }));
        }catch(error){
          workflowStatus={status:'unknown',error:String(error?.message||error)};
        }
      }

      return json({
        ok:true,
        release:RELEASE,
        id,
        workflowStatus,
        workflowState:String(workflowStatus?.status||'unknown').toLowerCase(),
        workflowOutput:workflowStatus?.output||null
      });
    }

      return json({ok:false,release:RELEASE,error:'Not found.'},404);
    }catch(error){
      console.error('[Franchise Import Worker]',error);
      return json({
        ok:false,
        release:RELEASE,
        error:error?.message||'Server-side import Worker failed.',
        stage:'worker-fetch',
        detail:error?.stack||null
      },500);
    }
  }
};
