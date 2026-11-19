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

test('season mismatch recovery explains schedule and update steps instead of retrying the old export',async()=>{
  const ui=harness(async()=>readiness());await ui.service.refresh();
  const outcome=ui.service.failureGuidance({code:'EA_SEASON_MISMATCH',message:'FHQ prepared 2029; EA reports 2028.'},'analyze-source');
  assert.equal(outcome.button,'refresh');
  assert.match(outcome.summary,/2029.*2028/);
  assert.match(outcome.action,/Import Season Schedule in Step 2/);
  assert.match(outcome.action,/If Madden has advanced but FHQ has not, verify the completed FHQ season and use Archive Season once/);
  assert.match(outcome.action,/If FHQ already prepared the new year, do not archive again/);
  assert.doesNotMatch(outcome.action,/Retry the retained export/);
});

test('archive cards distinguish prepared 2029 from imported 2028 and refresh after publication',async()=>{
  let service;
  let payload={gameYear:{id:'madden-27',displayName:'Madden NFL 27',status:'active'},preservedDomains:[],
    franchiseSeasons:[{id:'2029',seasonYear:2029,status:'preview'},{id:'2028',seasonYear:2028,status:'closed'}]};
  const events={};
  const window={FranchiseHQ:{leagueTenant:{getCurrentLeague:()=>({slug:'alpha'})},
    defineModuleService:(_scope,_id,value)=>{service=value;}},addEventListener:(name,callback)=>{events[name]=callback;}};
  vm.runInNewContext(await readFile(new URL('../../league-engine/game-year-transition.js',import.meta.url),'utf8'),{
    window,document:{querySelectorAll:()=>[],addEventListener(){}},setTimeout:()=>0,
    fetch:async()=>({ok:true,json:async()=>payload})
  });
  await service.refresh();
  for(const markup of [service.renderArchivePanel(),service.renderPanel()]){
    assert.match(markup,/2029 prepared/);
    assert.match(markup,/2028 is archived in History Books/);
    assert.match(markup,/previous imported data stays visible/);
    assert.match(markup,/Import Season Schedule in Step 2/);
    assert.match(markup,/data-game-year-archive-season disabled/);
    assert.match(markup,/Awaiting 2029 Import/);
  }
  payload={...payload,franchiseSeasons:[{id:'2029',seasonYear:2029,status:'active',displayName:'Season 2029'},payload.franchiseSeasons[1]]};
  await events['franchisehq:league-import-live']();
  assert.doesNotMatch(service.renderArchivePanel(),/Awaiting 2029 Import|data-game-year-archive-season disabled/);
  assert.match(service.renderArchivePanel(),/Freeze Season 2029/);
});

test('readiness failures offer another read, never retrying an import or collecting another export',async()=>{
  let interrupted=true;
  const ui=harness(async()=>interrupted?Response.json({ok:false,error:'Service unavailable'},{status:503}):readiness());
  await assert.rejects(ui.service.refreshWorkspace());
  assert.equal(ui.service.diagnostics().outcome.button,'refresh');
  assert.equal(ui.service.diagnostics().outcome.title,'Import readiness could not be checked');
  interrupted=false;await ui.service.recoverImport('refresh');
  assert.equal(ui.service.diagnostics().outcome,null);
  assert.ok(ui.requests.every(r=>r.options.method==='GET'));
});

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
