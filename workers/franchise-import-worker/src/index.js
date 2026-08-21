import { WorkflowEntrypoint } from 'cloudflare:workers';

const RELEASE='5.9.10.6.5.4b';
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

    const started=await step.do('create-import-run',async()=>call(
      ctx.origin,companion(ctx.slug,'import-orchestrator'),ctx.owner,'POST',{action:'start'}
    ));
    ctx.runId=started?.run?.id||null;
    if(!ctx.runId)throw new Error('Import orchestrator did not return a run ID.');

    // The server performs the no-new-export test itself. The browser is not involved.
    const delta=await step.do('discover',async()=>call(ctx.origin,companion(ctx.slug,'change-check'),ctx.owner));
    await report(ctx,'discover',true,{summary:delta?.noNewExport?'No new Companion export':'New Companion export detected'});

    if(delta?.unchanged&&delta?.activeSnapshot?.id){
      ctx.snapshotId=String(delta.activeSnapshot.id);
      // Advance every remaining orchestrator stage as reused so the persisted run closes cleanly.
      const reusable=[
        'storage-preflight','map-teams','reconstruct-player-lifecycle','map-players','map-schedule',
        'map-statistics','build-snapshot','validate-snapshot','activate-snapshot','detect-transactions',
        'classify-transactions','reconcile-transactions','verify-active-snapshot','publish-transactions'
      ];
      for(const name of reusable){
        await report(ctx,name,true,{summary:'No new Companion export · current LIVE snapshot reused',snapshotId:ctx.snapshotId,reused:true});
      }
      return {ok:true,release:RELEASE,noChange:true,noNewExport:Boolean(delta.noNewExport),snapshotId:ctx.snapshotId,runId:ctx.runId};
    }

    const reusePlayers=Boolean(delta?.canReusePlayers&&!delta?.rosterChanged);

    const storage=await stage(ctx,step,'storage-preflight',()=>call(
      ctx.origin,companion(ctx.slug,'storage-preflight'),ctx.owner,'POST',{preservePlayers:reusePlayers}
    ));
    const reclaimed=Object.values(storage?.reclaimed||{}).reduce((sum,v)=>sum+Number(v||0),0);
    await report(ctx,'storage-preflight',true,{summary:`${reclaimed} obsolete D1 row(s) reclaimed`});

    await simple(ctx,step,'map-teams','map-teams',p=>`${p.teams?.length??p.mappingRun?.teamCount??'?'} teams mapped`);

    if(reusePlayers){
      await report(ctx,'reconstruct-player-lifecycle',true,{summary:'Roster unchanged · lifecycle reused',reused:true});
      await report(ctx,'map-players',true,{summary:`${Number(delta?.reusablePlayerPreviewCount||0)} players reused`,reused:true});
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
      await report(ctx,'reconstruct-player-lifecycle',true,{
        summary:`${Number(finalized?.eventCount||0)} lifecycle event(s) · ${processed} new roster session(s)`
      });
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

    const published=await stage(ctx,step,'publish-transactions',()=>call(
      ctx.origin,transactions(ctx.slug,'canonical'),ctx.owner,'POST',{action:'capture-lifecycle-finalize'}
    ));
    await report(ctx,'publish-transactions',true,{
      summary:`${Number(published?.eventCount||0)} lifecycle event(s) · ${Number(published?.freeAgents?.currentFreeAgents||0)} Free Agent(s)`,
      snapshotId:ctx.snapshotId
    });

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
    const url=new URL(request.url);
    if(url.pathname==='/start'&&request.method==='POST'){
      const body=await request.json().catch(()=>({}));
      const slug=text(body.leagueSlug);
      if(!slug||!text(body.ownerAccountId)||!text(body.origin))return json({ok:false,release:RELEASE,error:'Missing workflow start parameters.'},400);

      // Refuse a second running import for the same league.
      const activeId=`league-${slug}`;
      let existing=null;
      try{
        existing=await env.FRANCHISE_IMPORT_WORKFLOW.get(activeId);
        const status=await existing.status();
        if(['queued','running','waiting','waitingForPause'].includes(String(status?.status||''))){
          return json({ok:true,release:RELEASE,alreadyRunning:true,id:activeId,status});
        }
      }catch(_){}

      // A deterministic active ID cannot be reused after completion, so include an epoch suffix.
      const id=`${activeId}-${Date.now()}`;
      const instance=await env.FRANCHISE_IMPORT_WORKFLOW.create({id,params:body});
      return json({ok:true,release:RELEASE,id,status:await instance.status()});
    }

    if(url.pathname==='/status'&&request.method==='GET'){
      const id=text(url.searchParams.get('id'));
      const slug=text(url.searchParams.get('leagueSlug'));
      const owner=text(url.searchParams.get('ownerAccountId'));
      const origin=text(url.searchParams.get('origin')).replace(/\/+$/,'');
      let workflowStatus=null;
      if(id){
        try{workflowStatus=await (await env.FRANCHISE_IMPORT_WORKFLOW.get(id)).status();}
        catch(error){workflowStatus={status:'unknown',error:String(error?.message||error)};}
      }
      let orchestrator=null;
      if(slug&&owner&&origin){
        try{orchestrator=await call(origin,companion(slug,'import-orchestrator'),owner);}
        catch(_){}
      }
      return json({ok:true,release:RELEASE,id,workflowStatus,orchestrator});
    }

    return json({ok:false,release:RELEASE,error:'Not found.'},404);
  }
};
