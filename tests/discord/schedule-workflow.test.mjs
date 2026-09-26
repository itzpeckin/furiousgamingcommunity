import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function workflowWith(fetchImpl,className='FranchiseScheduleWorkflow') {
  const original=await readFile(new URL('../../workers/franchise-import-worker/src/index.js',import.meta.url),'utf8');
  const script=original
    .replace("import { WorkflowEntrypoint } from 'cloudflare:workers';",'class WorkflowEntrypoint {}')
    .replace("import { NonRetryableError } from 'cloudflare:workflows';",'class NonRetryableError extends Error {}')
    .replaceAll('export class ','class ')
    .replace('export default{','const defaultWorker={');
  const context=vm.createContext({fetch:fetchImpl,Response,TextEncoder,crypto,console,URL,Date});
  vm.runInContext(`${script}\nglobalThis.ScheduleWorkflow=FranchiseScheduleWorkflow;
    globalThis.ImportWorkflow=FranchiseImportWorkflow;`,context);
  return new context[className==='FranchiseImportWorkflow'?'ImportWorkflow':'ScheduleWorkflow']();
}

const event={payload:{leagueSlug:'fgc',origin:'https://franchisehq.app',
  importAuthToken:'delegated-test-token',snapshotId:'snapshot-week-5',source:'candidate-import'}};
const step={do:async (_name,_options,work)=>typeof _options==='function'?_options():work()};

test('permanent statistics rejection reports failure without default Workflow retries or activation',async()=>{
  let attempts=0;const reports=[];
  const workflow=await workflowWith(async(url,options)=>{
    const body=JSON.parse(options.body||'{}'),path=new URL(url).pathname;
    if(path.endsWith('/map-statistics')){attempts++;return Response.json({ok:false,detail:'No weekly statistics datasets were captured.'},{status:422});}
    if(body.action==='report-phase')reports.push(body);
    assert.notEqual(body.action,'finalize');
    return Response.json(body.action==='start'?{ok:true,run:{id:'candidate-1'},source:{discoverySessionId:'capture-1'}}:{ok:true});
  },'FranchiseImportWorkflow');
  const retryStep={do:async(_name,options,work)=>{
    const action=typeof options==='function'?options:work;
    for(let attempt=0;;attempt++)try{return await action();}catch(error){
      if(error.constructor.name==='NonRetryableError'||attempt>=5)throw error;
    }
  }};
  await assert.rejects(workflow.run(event,retryStep),/No weekly statistics datasets/);
  assert.equal(attempts,1);
  assert.ok(reports.some(r=>r.phase==='map-statistics'&&r.ok===false));
});

test('Discord Workflow continues through nonterminal running checkpoints to completed rollover',async()=>{
  const requests=[];
  const workflow=await workflowWith(async (_url,options)=>{
    requests.push(JSON.parse(options.body));
    const complete=requests.length===4;
    return{ok:true,status:200,json:async()=>complete
      ?{ok:true,status:'completed',hasMore:false,threads:16,removedPriorThreads:16}
      :{ok:false,status:'running',hasMore:true,threads:requests.length}};
  });
  const result=await workflow.run(event,step);
  assert.equal(result.ok,true);
  assert.equal(result.result.threads,16);
  assert.equal(result.result.removedPriorThreads,16);
  assert.equal(requests.length,4);
  assert.equal(requests.some(request=>request.action==='fail'),false);
});

test('Discord Workflow records a terminal schedule failure instead of leaving a running audit',async()=>{
  const requests=[];
  const workflow=await workflowWith(async (_url,options)=>{
    const body=JSON.parse(options.body);
    requests.push(body);
    return{ok:body.action==='fail',status:body.action==='fail'?200:409,
      json:async()=>body.action==='fail'?{ok:true,status:'failed-recorded'}
        :{ok:false,status:'partial',errors:['Discord channel unavailable']}};
  });
  await assert.rejects(workflow.run(event,step),/Discord channel unavailable/);
  assert.equal(requests.at(-1).action,'fail');
  assert.equal(requests.at(-1).snapshotId,'snapshot-week-5');
});

test('background import retries a transient Map Schedule request and still publishes exactly one candidate',async()=>{
  let scheduleAttempts=0,finalizations=0;
  const workflow=await workflowWith(async (url,options)=>{
    const path=new URL(url).pathname,body=JSON.parse(options.body||'{}');
    if(path.endsWith('/map-schedule')&&++scheduleAttempts===1)throw new Error('transient edge disconnect');
    let payload={ok:true};
    if(path.endsWith('/candidate-import')&&body.action==='start')payload={ok:true,
      run:{id:'candidate-1'},source:{discoverySessionId:'capture-1'}};
    if(path.endsWith('/candidate-import')&&body.action==='finalize'){
      finalizations+=1;payload={ok:true,run:{activeSnapshotChanged:true}};
    }
    if(path.endsWith('/discovery-report'))payload={ok:true,report:{captureCount:10,routeCount:10}};
    if(path.endsWith('/classify'))payload={ok:true,inspectedRouteCount:10};
    if(path.endsWith('/map-teams'))payload={ok:true,mappingRun:{id:'teams-1',teamCount:32}};
    if(path.endsWith('/map-players'))payload={ok:true,mappingRun:{id:'players-1',playerCount:2000}};
    if(path.endsWith('/map-schedule'))payload={ok:true,mappingRun:{id:'schedule-1',gameCount:16}};
    if(path.endsWith('/map-statistics'))payload={ok:true,complete:true,
      mappingRun:{id:'statistics-1',recordCount:843},progress:{failed:0}};
    if(path.endsWith('/build-snapshot'))payload={ok:true,complete:true,
      snapshot:{snapshotId:'snapshot-1',counts:{}}};
    if(path.endsWith('/snapshot-lifecycle'))payload={ok:true,complete:true,
      snapshots:[{snapshotId:'snapshot-1',validationStatus:'ready',errorCount:0}]};
    return{ok:true,status:200,json:async()=>payload};
  },'FranchiseImportWorkflow');
  const retryStep={do:async (_name,options,work)=>{
    const action=typeof options==='function'?options:work;
    for(let attempt=0;;attempt+=1){
      try{return await action();}
      catch(error){if(attempt>=Number(options?.retries?.limit||0))throw error;}
    }
  }};
  const result=await workflow.run({payload:{leagueSlug:'fgc',origin:'https://franchisehq.app',
    importAuthToken:'delegated-test-token'}},retryStep);
  assert.equal(result.ok,true);
  assert.equal(scheduleAttempts,2);
  assert.equal(finalizations,1);
});
