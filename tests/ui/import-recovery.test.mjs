import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source=await readFile(new URL('../../league-engine/one-click-import.js',import.meta.url),'utf8');
function harness(handler){
  let service,slug='alpha',loginCount=0;const requests=[],events={};
  const node={dataset:{},setAttribute(){},remove(){},innerHTML:''};
  const window={performance:{now:()=>0},setTimeout:fn=>{fn();return 1;},
    addEventListener:(name,fn)=>{events[name]=fn;},dispatchEvent(){},
    FranchiseHQ:{leagueTenant:{getCurrentLeague:()=>({slug})},auth:{login:()=>loginCount++},
      defineModuleService:(_scope,_name,value)=>{service=value;},
      leagueExportUrl:{refresh:async()=>{},diagnostics:()=>({})}}};
  vm.runInNewContext(source,{window,console,Date,CustomEvent:class{},setTimeout:()=>0,clearTimeout(){},
    fetch:async(url,options)=>{requests.push({url,options});return handler(url,options);},
    document:{querySelector:()=>node,querySelectorAll:()=>[],addEventListener(){},body:{append(){}},createElement:()=>node}});
  return{service,requests,node,loginCount:()=>loginCount,switchLeague(){slug='beta';events['franchisehq:league-tenant-changed']();}};
}
const readiness=()=>Response.json({source:{sourceFingerprint:'source-1'},destination:{id:'destination-1'},run:null});

test('import progress HTTP 401 keeps sign-in guidance and never retries the export',async()=>{
  const ui=harness(async(url,options)=>url.endsWith('candidate-import')?readiness():options.method==='POST'
    ?Response.json({id:'workflow-1'}):Response.json({ok:false,error:'Session expired'},{status:401}));
  await ui.service.refresh();await ui.service.runImport();
  assert.equal(ui.service.diagnostics().outcome.button,'sign-in');
  assert.equal(ui.requests.filter(r=>r.options.method==='POST').length,1);
  await ui.service.recoverImport('sign-in');assert.equal(ui.loginCount(),1);
});

test('lost import monitoring resumes exact workflow with GET and no new import POST',async()=>{
  let outage=true;
  const ui=harness(async(url,options)=>{
    if(url.endsWith('candidate-import'))return readiness();
    if(options.method==='POST')return Response.json({id:'workflow-1'});
    if(outage)throw Error('network');
    return Response.json({workflowState:'errored',workflowStatus:{error:'validation failed'}});
  });
  await ui.service.refresh();await ui.service.runImport();
  assert.equal(ui.service.diagnostics().outcome.button,'status');
  assert.match(ui.service.renderCompactPanel(),/Check Import Status/);
  outage=false;await ui.service.recoverImport('status');
  assert.equal(ui.requests.filter(r=>r.options.method==='POST').length,1);
  assert.equal(ui.requests.at(-2).url.endsWith('import-job?id=workflow-1'),true);
  assert.equal(ui.service.diagnostics().outcome.button,'retry');
});

test('unknown start outcome cannot be described as failed or as previous publication success',async()=>{
  const ui=harness(async(url)=>url.endsWith('candidate-import')
    ?Response.json({source:{},run:{id:'previous-run',activationPerformed:true}}):Promise.reject(Error('network')));
  await ui.service.refresh();await ui.service.runImport();
  const outcome=ui.service.diagnostics().outcome;
  assert.equal(outcome.code,'IMPORT_START_UNCONFIRMED');
  assert.equal(outcome.button,'status');assert.match(outcome.summary,/may still be running/);
  assert.doesNotMatch(outcome.title,/Import live/);
});

test('published current attempt reports follow-up failure without telling commissioner to re-import',async()=>{
  let polls=0;
  const ui=harness(async(url,options)=>{
    if(url.endsWith('candidate-import'))return readiness();
    if(options.method==='POST')return Response.json({id:'workflow-1'});
    polls++;return Response.json({workflowState:'errored',candidate:{run:{id:'new-run',activationPerformed:true}},workflowStatus:{error:'Follow-up failed'}});
  });
  await ui.service.refresh();await ui.service.runImport();
  assert.equal(polls,1);assert.equal(ui.service.diagnostics().outcome.title,'Import live; follow-up needs attention');
  assert.equal(ui.service.diagnostics().outcome.button,'refresh');
});

test('validation and statistics mapper failures retain export rather than prescribing another export',async()=>{
  const ui=harness(async()=>readiness());await ui.service.refresh();
  for(const message of ['Candidate validation failed: duplicate key','3 statistics routes failed','Unknown parser failure']){
    const outcome=ui.service.failureGuidance({message},'validate-candidate');
    assert.equal(outcome.button,'retry');assert.match(outcome.action,/retained export/);
    assert.doesNotMatch(outcome.action,/Export League Info|Export the missing week/);
    assert.equal(outcome.preserved,false);
  }
});

test('a late old-league import error cannot install its recovery controls in another league',async()=>{
  let reject;
  const ui=harness(async(url)=>url.endsWith('candidate-import')?readiness():new Promise((_r,no)=>{reject=no;}));
  await ui.service.refresh();const pending=ui.service.runImport();await new Promise(r=>setImmediate(r));
  ui.switchLeague();reject(Error('old league failure'));await pending;
  assert.equal(ui.service.diagnostics().outcome,null);
});

test('double clicking Retry while readiness loads starts only one import',async()=>{
  let release;
  const ui=harness(async(url,options)=>{
    if(url.endsWith('candidate-import'))return new Promise(done=>{release=()=>done(readiness());});
    if(options.method==='POST')return Response.json({id:'one-workflow'});
    return Response.json({workflowState:'errored',workflowStatus:{error:'validation failed'}});
  });
  const first=ui.service.importLatestExport(),second=ui.service.importLatestExport();
  assert.equal(ui.requests.length,1);release();
  await new Promise(r=>setImmediate(r));
  release();await Promise.all([first,second]);
  assert.equal(ui.requests.filter(r=>r.options.method==='POST').length,1);
});
