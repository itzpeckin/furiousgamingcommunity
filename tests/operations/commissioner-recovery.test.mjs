import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function worker(){
  const source=(await readFile(new URL('../../workers/franchise-import-worker/src/index.js',import.meta.url),'utf8'))
    .replace("import { WorkflowEntrypoint } from 'cloudflare:workers';",'class WorkflowEntrypoint {}')
    .replace("import { NonRetryableError } from 'cloudflare:workflows';",'class NonRetryableError extends Error {}')
    .replaceAll('export class ','class ').replace('export default{','globalThis.worker={');
  const context=vm.createContext({Response,TextEncoder,crypto,console:{error(){}},URL,Date});
  vm.runInContext(source,context);return context.worker;
}
function binding({lostResponse=false,unavailable=false}={}){
  const instances=new Map(),created=[];
  return {instances,created,
    async get(id){if(!instances.has(id))throw Error('Instance not found');return{status:async()=>instances.get(id)};},
    async create({id,params}){
      created.push({id,params});
      if(unavailable)throw Error('Service unavailable');
      if(instances.has(id))throw Error('Instance already exists');
      instances.set(id,{status:'running'});
      if(lostResponse)throw Error('Response interrupted after creation');
      return{status:async()=>instances.get(id)};
    }
  };
}
async function start(w,b,path='/start'){
  const response=await w.fetch(new Request('https://franchise-import.internal'+path,{
    method:'POST',body:JSON.stringify({leagueSlug:'alpha',origin:'https://franchisehq.app',
      importAuthToken:'delegation',workflowKey:'captured-export',snapshotId:'snapshot',source:'candidate-import'})
  }),{FRANCHISE_IMPORT_WORKFLOW:b,FRANCHISE_SCHEDULE_WORKFLOW:b});
  return{status:response.status,...await response.json()};
}
for(const path of ['/start','/schedule/start']){
  test(path+' reconciles creation after a lost response instead of creating duplicate work',async()=>{
    const w=await worker(),b=binding({lostResponse:true});
    const first=await start(w,b,path),second=await start(w,b,path);
    assert.equal(first.ok,true);assert.equal(second.id,first.id);
    assert.equal(b.instances.size,1);assert.equal(b.created.length,1);
  });
  test(path+' reconnects to a retained retry and concurrent requests create only one successor',async()=>{
    const w=await worker(),b=binding();
    const initial=await start(w,b,path);b.instances.set(initial.id,{status:'errored'});
    const [a,c]=await Promise.all([start(w,b,path),start(w,b,path)]);
    assert.equal(a.ok,true);assert.equal(c.ok,true);assert.equal(a.id,c.id);
    assert.notEqual(a.id,initial.id);assert.equal(b.instances.size,2);
    const refresh=await start(w,b,path);assert.equal(refresh.id,a.id);
    b.instances.set(a.id,{status:'complete'});
    assert.equal((await start(w,b,path)).id,a.id);
    assert.equal(b.instances.size,2);
  });
  test(path+' does not invent another ID during a service outage',async()=>{
    const w=await worker(),b=binding({unavailable:true});
    const first=await start(w,b,path),second=await start(w,b,path);
    assert.equal(first.status,500);assert.equal(second.status,500);
    assert.equal(b.created.length,2);
    assert.equal(b.created[0].id,b.created[1].id);
  });
}

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
async function discordUI(fetchImpl){
  const full=await readFile(new URL('../../trade-module.js',import.meta.url),'utf8');
  const source=full.slice(full.indexOf('let commissionerDiscordRevision=0'),full.indexOf('async function updateCommissionerFeature('));
  let slug='alpha';const buttons=[{disabled:false}];
  const context=vm.createContext({fetch:fetchImpl,encodeURIComponent,document:{querySelectorAll:()=>buttons},
    commissionerLeagueSlug:()=>slug,showToast:()=>{},renderCommissioner:()=>{}});
  vm.runInContext('let commissionerDiscordCache=null,commissionerDiscordLoading=null;'+source+`
    globalThis.api={load:loadCommissionerDiscord,update:updateCommissionerDiscord,
      cache:()=>commissionerDiscordCache,change:()=>{commissionerDiscordRevision++;commissionerDiscordCache=null;commissionerDiscordLoading=null;commissionerDiscordSaving=false;}};`,context);
  return{...context.api,buttons,change(){slug='bravo';context.api.change();}};
}
test('Discord controls discard a late settings response after changing leagues',async()=>{
  const a=deferred();let calls=0;
  const ui=await discordUI(async()=>++calls===1?a.promise:Response.json({ok:true,league:{slug:'bravo'}}));
  const old=ui.load();ui.change();await ui.load();
  a.resolve(Response.json({ok:true,league:{slug:'alpha'}}));await old;
  assert.equal(ui.cache().league.slug,'bravo');
});
test('Discord retry is one click and a pending old-league save cannot overwrite the new league',async()=>{
  const a=deferred();const requests=[];
  const ui=await discordUI(async(url,options)=>{requests.push({url,options});return options.method==='POST'?a.promise:Response.json({ok:true,league:{slug:'bravo'}});});
  const old=ui.update('retry-schedule-sync');await ui.update('retry-schedule-sync');
  assert.equal(requests.length,1);assert.equal(ui.buttons[0].disabled,true);
  ui.change();await ui.load();
  a.resolve(Response.json({ok:true,league:{slug:'alpha'}}));await old;
  assert.equal(ui.cache().league.slug,'bravo');
});

test('importer discards an old-league readiness response after switching leagues',async()=>{
  const a=deferred();let calls=0,service,slug='alpha';const events={};
  const context=vm.createContext({console,setTimeout:()=>0,clearTimeout:()=>{},
    fetch:async()=>++calls===1?a.promise:Response.json({run:{id:'bravo-run'}}),
    document:{addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null},
    window:{FranchiseHQ:{leagueTenant:{getCurrentLeague:()=>({slug})},
      defineModuleService:(_scope,_name,value)=>{service=value;}},
      addEventListener:(name,callback)=>{events[name]=callback;}}});
  vm.runInContext(await readFile(new URL('../../league-engine/one-click-import.js',import.meta.url),'utf8'),context);
  const old=service.refresh();slug='bravo';events['franchisehq:league-tenant-changed']();
  a.resolve(Response.json({run:{id:'alpha-run'}}));
  await assert.rejects(old,/selected league changed/);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(service.diagnostics().state.run.id,'bravo-run');
  assert.doesNotMatch(service.failureGuidance({status:401}).action,/with Discord/);
  assert.match(service.failureGuidance({status:403}).title,/access/);
});
