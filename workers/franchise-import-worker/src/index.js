import { WorkflowEntrypoint } from 'cloudflare:workers';

const RELEASE='5.9.10.6.5.4g';
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
    const ctx={
      slug:text(payload.leagueSlug),
      owner:{
        id:text(payload.ownerAccountId),
        importAuthToken:text(payload.importAuthToken)
      },
      origin:text(payload.origin).replace(/\/+$/,''),
      runId:null,
      snapshotId:null,
      importAuthToken:text(payload.importAuthToken)
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
        runId:null
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
      for(const session of pending){
        await step.do(`lifecycle-${processed+1}`,{retries:{limit:2,delay:'2 seconds'},timeout:'15 minutes'},()=>call(
          ctx.origin,transactions(ctx.slug,'canonical'),ctx.owner,'POST',
          {action:'capture-lifecycle-session',sessionId:session.sessionId}
        ));
        processed++;
      }
      const finalized=await step.do('lifecycle-finalize',()=>call(
        ctx.origin,transactions(ctx.slug,'canonical'),ctx.owner,'POST',{action:'capture-lifecycle-finalize'}
      ));
      // Do not report reconstruct-player-lifecycle to the import orchestrator.
      // Its next expected stage is map-players.
      await simple(ctx,step,'map-players','map-players',p=>{
        const total=p.players?.length??p.mappingRun?.playerCount??'?';
        const fas=p.lifecycleFreeAgentCount??p.mappingRun?.freeAgentCount??0;
        return `${total} players mapped · ${fas} Free Agent(s)`;
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

    const built=await stage(ctx,step,'build-snapshot',()=>call(ctx.origin,companion(ctx.slug,'build-snapshot'),ctx.owner,'POST',{}));
    ctx.snapshotId=built?.snapshot?.snapshotId||built?.snapshotId||null;
    if(!ctx.snapshotId)throw new Error('Snapshot Builder completed without returning a Snapshot ID.');
    await report(ctx,'build-snapshot',true,{summary:`Snapshot ${ctx.snapshotId} built`,snapshotId:ctx.snapshotId});

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

    const reconciled=await stage(ctx,step,'reconcile-transactions',()=>call(
      ctx.origin,transactions(ctx.slug,'canonical'),ctx.owner,'POST',{action:'capture-lifecycle-finalize'}
    ));
    await report(ctx,'reconcile-transactions',true,{summary:`${Number(reconciled?.eventCount||0)} lifecycle event(s)`,snapshotId:ctx.snapshotId});

    const verified=await stage(ctx,step,'verify-active-snapshot',()=>call(
      ctx.origin,companion(ctx.slug,'snapshot-verification'),ctx.owner
    ));
    const active=verified?.snapshot?.id||verified?.snapshot?.snapshotId||verified?.activeSnapshotId||null;
    if(active&&String(active)!==String(ctx.snapshotId))throw new Error(`Verification returned different active snapshot (${active}).`);
    await report(ctx,'verify-active-snapshot',true,{summary:'LIVE snapshot verified',snapshotId:ctx.snapshotId});

    // Final canonical/free-agent confirmation happens after the orchestrator
    // has already completed at verify-active-snapshot. It is auxiliary work
    // and MUST NOT be reported as another orchestrator stage.
    const published=await step.do('publish-transactions',{
      retries:{limit:2,delay:'2 seconds',backoff:'exponential'},
      timeout:'15 minutes'
    },()=>call(
      ctx.origin,transactions(ctx.slug,'canonical'),ctx.owner,'POST',{action:'capture-lifecycle-finalize'}
    ));

    // Certification is server-side now as well. Failure here does not undo the already-verified LIVE snapshot.
    await step.do('certification',{retries:{limit:1,delay:'2 seconds'},timeout:'5 minutes'},()=>call(
      ctx.origin,companion(ctx.slug,'import-certification'),ctx.owner,'POST',
      {snapshotId:ctx.snapshotId,runId:ctx.runId,serverSide:true}
    )).catch(()=>null);

    return {ok:true,release:RELEASE,noChange:false,snapshotId:ctx.snapshotId,runId:ctx.runId};
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

      if(!slug||!owner||!origin||!token){
        return json({ok:false,release:RELEASE,error:'Missing workflow start parameters.'},400);
      }

      // IMPORTANT: /start must not synchronously call back into the Pages application.
      // That request can sit behind the originating Pages -> Service Binding request and
      // produce a Cloudflare 522 before a Workflow is even returned.
      //
      // Use a short-lived deterministic launch bucket instead. Repeated clicks/devices
      // inside the same import launch window converge on the same Workflow, while the
      // Workflow itself performs change-check asynchronously after it has been accepted.
      const launchBucket=Math.floor(Date.now()/30000);
      const exportKey=`launch-${launchBucket}`;

      const encoded=new TextEncoder().encode(`${slug}:${exportKey}`);
      const digest=await crypto.subtle.digest('SHA-256',encoded);
      const shortHash=Array.from(new Uint8Array(digest))
        .slice(0,12)
        .map(v=>v.toString(16).padStart(2,'0'))
        .join('');
      const id=`fhq-${shortHash}`;

      let instance=null;
      let reusedExisting=false;

      try{
        instance=await env.FRANCHISE_IMPORT_WORKFLOW.create({
          id,
          params:body
        });
      }catch(createError){
        try{
          instance=await env.FRANCHISE_IMPORT_WORKFLOW.get(id);
          reusedExisting=true;
        }catch(getError){
          console.error('[Import Workflow Create]',createError);
          console.error('[Import Workflow Recover]',getError);
          return json({
            ok:false,
            release:RELEASE,
            error:'Unable to create or recover the server-side import Workflow.',
            createError:createError?.message||String(createError),
            recoverError:getError?.message||String(getError)
          },500);
        }
      }

      let status=null;
      try{
        status=await instance.status();
      }catch(statusError){
        console.warn('[Import Workflow Status]',statusError);
      }

      return json({
        ok:true,
        release:RELEASE,
        id,
        reusedExisting,
        exportKey,
        status
      });
    }

    if(url.pathname==='/status'&&request.method==='GET'){
      const id=text(url.searchParams.get('id'));
      const slug=text(url.searchParams.get('leagueSlug'));
      const owner=text(url.searchParams.get('ownerAccountId'));
      const origin=text(url.searchParams.get('origin')).replace(/\/+$/,'');
      let workflowStatus=null;
      if(id){
        try{
          const instance=await env.FRANCHISE_IMPORT_WORKFLOW.get(id);
          try{
            workflowStatus=await instance.status();
          }catch(statusError){
            workflowStatus={status:'unknown',error:String(statusError?.message||statusError)};
          }
        }catch(getError){
          workflowStatus={status:'unknown',error:String(getError?.message||getError)};
        }
      }
      let orchestrator=null;
      if(slug&&owner&&origin){
        try{orchestrator=await call(origin,companion(slug,'import-orchestrator'),owner);}
        catch(_){}
      }
      return json({
        ok:true,
        release:RELEASE,
        id,
        workflowStatus,
        workflowState:String(workflowStatus?.status||'unknown').toLowerCase(),
        workflowOutput:workflowStatus?.output||null,
        orchestrator
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
