import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../../league-engine/ea-direct.js', import.meta.url), 'utf8');

function harness() {
  let currentSlug = 'alpha';
  let service;
  let requestHandler = async () => ({ok: true, configured: true, status: 'not-connected'});
  let refreshed = 0;
  let published = 0;
  let scrolled = 0;
  const requests = [];
  const windowEvents = new Map();
  const documentEvents = new Map();
  const timers = new Map();
  const panel = {outerHTML: ''};
  let timerId = 0;
  const hq = {
    leagueTenant: {getCurrentLeague: () => ({slug: currentSlug})},
    defineModuleService: (_module, _name, value) => { service = value; },
    manifest: {register() {}},
    api: {request: async (path, options) => {
      requests.push({path, options});
      return requestHandler(path, options);
    }},
    oneClickImport: {
      refreshWorkspace: async () => { refreshed += 1; },
      importLatestExport: async () => { published += 1; }
    }
  };
  vm.runInNewContext(source, {
    window: {FranchiseHQ: hq, addEventListener: (name, listener) => windowEvents.set(name, listener)},
    document: {
      querySelectorAll: () => [panel],
      querySelector: () => ({scrollIntoView: () => { scrolled += 1; }}),
      addEventListener: (name, listener) => documentEvents.set(name, listener)
    },
    URL, AbortController, Date,
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, {fn, delay}); return id; },
    clearTimeout: id => timers.delete(id)
  });
  function click(attributes) {
    const button = {dataset: attributes, disabled: false};
    documentEvents.get('click')({target: {closest(selector) {
      if (selector === '[data-ea-direct-panel]') return {};
      if (selector === '[data-ea-path]' && attributes.eaPath) return button;
      if (selector === '[data-ea-collect]' && attributes.eaCollect) return button;
      if (selector === '[data-ea-action]' && attributes.eaAction) return button;
      return null;
    }}});
  }
  return {
    service, requests, timers, click, hq,
    dispatch(name,event){documentEvents.get(name)?.(event);},
    typeSeason(value) { documentEvents.get('input')({target:{value,closest:()=>({})}}); },
    respond(handler) { requestHandler = handler; },
    switchLeague(value) { currentSlug = value; windowEvents.get('franchisehq:league-tenant-changed')(); },
    changeAuth() { windowEvents.get('franchisehq:auth-changed')(); },
    change(kind, value) {
      const form = {dataset: {eaForm: kind}};
      documentEvents.get('change')({target: {value, closest: () => form}});
    },
    markup: () => panel.outerHTML,
    submit(kind, input) {
      const form = {dataset: {eaForm: kind}, querySelector: () => input};
      documentEvents.get('submit')({preventDefault() {}, target: {closest: () => form}});
    },
    effects: () => ({refreshed, published, scrolled})
  };
}

const connected = (overrides = {}) => ({
  ok: true, configured: true, status: 'connected',
  connection: {id: 'connection-a', leagueName: 'Alpha franchise', personaName: 'Owner', previewVerified: false, ...overrides}
});
const settle = () => new Promise(resolve => setImmediate(resolve));

for (const [status,code,title,action] of [
  [401,'HTTP_401','Sign back into FHQ','sign-in'],
  [403,'HTTP_403','Commissioner access required',null],
  [0,'NETWORK_ERROR','Checking collection progress','check-collection'],
  [409,'EA_RECONNECT_REQUIRED','Reconnect your EA account','begin']
]) test(`collection monitoring preserves ${code} and its distinct recovery action`,async()=>{
  const ui=harness();
  ui.respond(async path=>path.endsWith('/connection')?connected():{job:{id:'job-1',mode:'weekly',status:'running'}});
  await ui.service.refresh();
  ui.respond(async()=>{throw Object.assign(new Error('private-token https://secret.invalid'),{status,code});});
  await ui.service.pollCollection();
  const card=ui.markup().split('<section class="ea-direct-recovery"')[1].split('</section>')[0];
  assert.ok(card.includes(title));
  if(action)assert.ok(card.includes(`data-ea-action="${action}"`));
  else assert.doesNotMatch(card,/button--primary/);
  assert.doesNotMatch(card,/private-token|secret.invalid/);
  assert.equal(ui.requests.filter(r=>r.options.method==='POST').length,0);
  ui.respond(async()=>({id:'job-1',mode:'weekly',status:'running'}));
  if(action==='check-collection'){ui.click({eaAction:action});await settle();assert.doesNotMatch(ui.markup(),/ea-direct-recovery/);}
});

async function runningCollection(ui) {
  ui.respond(async path => path.endsWith('/connection') ? connected({previewVerified:true})
    : {job:{id:'job-recovery',mode:'weekly',status:'running',code:null}});
  await ui.service.refresh();
}

async function nextPoll(ui) {
  assert.equal(ui.timers.size,1,'one progress check should be scheduled');
  const [id,timer]=[...ui.timers][0];
  ui.timers.delete(id);
  await timer.fn();
  return timer.delay;
}

test('interrupted progress checks recover automatically to the completed export without writes',async()=>{
  const ui=harness();await runningCollection(ui);
  ui.respond(async()=>{throw Object.assign(new Error('network interrupted'),{code:'NETWORK_ERROR',status:0});});
  await nextPoll(ui);
  assert.match(ui.markup(),/Checking collection progress/);
  assert.match(ui.markup(),/role="status"><h4>Checking collection progress/);
  assert.match(ui.markup(),/automatically/);
  ui.respond(async path=>path.endsWith('/connection')?connected({previewVerified:true}):{job:{id:'job-recovery',mode:'weekly',status:'completed',code:null,readyToImport:true}});
  assert.equal(await nextPoll(ui),5000);
  assert.match(ui.markup(),/EA export complete/);
  assert.doesNotMatch(ui.markup(),/ea-direct-recovery/);
  assert.equal(ui.timers.size,0);
  assert.ok(ui.requests.every(r=>r.options.method==='GET'));
  assert.equal(ui.effects().published,0);
});

test('progress checks back off and stop after five retries; manual checking resumes safely',async()=>{
  const ui=harness();await runningCollection(ui);
  ui.respond(async()=>{throw Object.assign(new Error('unavailable'),{code:'HTTP_503',status:503});});
  for(const delay of [3000,5000,10000,20000,30000,30000]) assert.equal(await nextPoll(ui),delay);
  assert.equal(ui.timers.size,0);
  assert.match(ui.markup(),/Collection status is unavailable/);
  assert.doesNotMatch(ui.markup(),/Checking collection progress/);
  ui.respond(async()=>({job:{id:'job-recovery',mode:'weekly',status:'running',code:null}}));
  ui.click({eaAction:'check-collection'});await settle();
  assert.equal(ui.timers.size,1);
  assert.doesNotMatch(ui.markup(),/ea-direct-recovery/);
  ui.respond(async()=>{throw Object.assign(new Error('timeout'),{code:'REQUEST_TIMEOUT'});});
  await nextPoll(ui);
  assert.equal([...ui.timers.values()][0].delay,5000,'success resets the backoff');
  assert.ok(ui.requests.every(r=>r.options.method==='GET'));
});

for(const [status,code] of [[401,'HTTP_401'],[403,'HTTP_403'],[404,'HTTP_404'],[409,'EA_RECONNECT_REQUIRED'],[0,'REQUEST_CANCELLED']])
test(`progress checks do not automatically retry ${code}`,async()=>{
  const ui=harness();await runningCollection(ui);
  ui.respond(async()=>{throw Object.assign(new Error('blocked'),{status,code});});
  await nextPoll(ui);assert.equal(ui.timers.size,0);
  assert.doesNotMatch(ui.markup(),/Checking collection progress/);
});

test('progress retry is cancelled when the league or authentication changes',async()=>{
  for(const reset of [ui=>ui.switchLeague('beta'),ui=>ui.changeAuth()]){
    const ui=harness();await runningCollection(ui);
    let reject;ui.respond(()=>new Promise((_resolve,fail)=>{reject=fail}));
    const pending=ui.service.pollCollection();
    reset(ui);reject(Object.assign(new Error('network interrupted'),{code:'NETWORK_ERROR'}));
    await pending;assert.equal([...ui.timers.values()].filter(t=>t.delay>=3000).length,0);assert.doesNotMatch(ui.markup(),/Checking collection progress/);
  }
});

for(const code of ['EA_TEMPORARILY_UNAVAILABLE','EA_CONNECTION_FAILED','EA_TIMEOUT','EA_REQUEST_FAILED'])
test(`running ${code} reports a retry and clears on success`,async()=>{
  const ui=harness();
  ui.respond(async path=>path.endsWith('/connection')?connected():{job:{id:'job-recovery',mode:'weekly',status:'running',code}});
  await ui.service.refresh();
  assert.match(ui.markup(),/Collection is retrying this step/);
  assert.match(ui.markup(),/role="status"><h4>Collection is retrying/);
  assert.doesNotMatch(ui.markup(),/EA is temporarily unavailable|data-ea-action="retry-collection"/);
  ui.respond(async path=>path.endsWith('/connection')?connected():{job:{id:'job-recovery',mode:'weekly',status:'completed',code:null,readyToImport:true}});
  await nextPoll(ui);assert.match(ui.markup(),/EA export complete/);assert.doesNotMatch(ui.markup(),/ea-direct-recovery/);
});

for(const [code,title] of [['COLLECTION_BUSY','Collection already in progress'],['SETUP_BUSY','EA sign-in already in progress'],['WORKER_UNAVAILABLE','FHQ cannot start the EA collector']])
test(`${code} does not report an EA outage`,async()=>{
  const ui=harness();
  ui.respond(async path=>path.endsWith('/connection')?connected():{job:{id:'job-recovery',mode:'weekly',status:'failed',code}});
  await ui.service.refresh();assert.match(ui.markup(),new RegExp(title));assert.doesNotMatch(ui.markup(),/EA is temporarily unavailable|EA Direct service is unavailable/);
});

test('terminal EA auth error remains actionable after connection refresh and reconnect is one click',async()=>{
  const ui=harness();
  ui.respond(async path=>path.endsWith('/connection')?connected():{job:{id:'failed-job',mode:'weekly',status:'failed',code:'EA_RECONNECT_REQUIRED'}});
  await ui.service.refresh();await ui.service.pollCollection();
  assert.match(ui.markup(),/ea-direct-recovery.*Reconnect your EA account/s);
  ui.respond(async()=>({status:'signing-in',setup:{id:'new'},loginUrl:'https://accounts.ea.com/connect/auth'}));
  ui.click({eaAction:'begin'});ui.click({eaAction:'begin'});await settle();
  assert.equal(ui.requests.filter(r=>r.options.body?.action==='begin').length,1);
  assert.match(ui.markup(),/Sign in on EA/);
});

test('unconfirmed EA collection start discovers retained job with GET before allowing another collection',async()=>{
  const ui=harness();
  ui.respond(async path=>path.endsWith('/connection')?connected({previewVerified:true}):{});
  await ui.service.refresh();
  ui.respond(async()=>{throw new Error('network interrupted');});
  await ui.service.collect('weekly');
  assert.match(ui.markup(),/Collection status is unavailable/);
  ui.respond(async path=>path.endsWith('/connection')?connected({previewVerified:true}):{job:{id:'server-started',mode:'weekly',status:'running'}});
  ui.click({eaAction:'refresh'});await settle();
  await ui.service.collect('weekly');
  assert.equal(ui.requests.filter(r=>r.options.method==='POST').length,1);
  assert.match(ui.markup(),/Check Collection/);
});

test('renewed Madden session rejection and unverified week do not prescribe reconnect',async()=>{
  const ui=harness();
  for(const code of ['EA_MADDEN_SESSION_REJECTED','EA_CURRENT_PERIOD_UNAVAILABLE']){
    ui.respond(async path=>path.endsWith('/connection')?connected():{job:{id:'stopped',mode:'weekly',status:'failed',code}});
    await ui.service.refresh();
    const card=ui.markup().split('<section class="ea-direct-recovery"')[1].split('</section>')[0];
    assert.match(card,/Try Collection Again/);assert.doesNotMatch(card,/data-ea-action="begin"/);
  }
});

test('one disconnect wins over an older background refresh', async () => {
  const ui = harness();
  ui.respond(async () => connected({previewVerified:true}));
  await ui.service.refresh();
  let resolveRefresh;
  ui.respond(async (_path, options) => options.method === 'POST'
    ? {ok:true,configured:true,status:'not-connected',connection:null,setup:null}
    : new Promise(resolve => { resolveRefresh=resolve; }));
  const pending=ui.service.refresh();
  assert.doesNotMatch(ui.service.renderPanel(), /data-ea-action="disconnect" disabled/);
  ui.click({eaAction:'disconnect'});
  await settle();
  resolveRefresh(connected({previewVerified:true}));
  await pending;
  assert.match(ui.service.renderPanel(), /EA account disconnected/);
  assert.doesNotMatch(ui.service.renderPanel(), /Alpha franchise/);
  assert.equal(ui.requests.filter(r=>r.options.body?.action==='disconnect').length,1);
});

test('server-confirmed existing season schedule permits collection after reconnect', async () => {
  const ui=harness();
  ui.respond(async()=>({...connected(),weeklyReady:true}));
  await ui.service.refresh();
  assert.doesNotMatch(ui.service.renderPanel(), /data-ea-collect="weekly" disabled/);
  ui.respond(async()=>({id:'new-weekly',status:'running'}));
  await ui.service.collect('weekly');
  assert.equal(ui.requests.at(-1).options.body.mode,'weekly');
});

test('rendering EA Direct never starts sign-in or a collection', async () => {
  const ui = harness();
  ui.service.renderPanel();
  assert.equal(ui.requests.length, 0);
  await ui.service.refresh();
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.requests[0].options.method, 'GET');
  assert.match(ui.service.renderPanel(), /Connect EA Account/);
  assert.deepEqual(ui.effects(), {refreshed: 0, published: 0, scrolled: 0});
});

test('late EA connection responses cannot display data from a previous league', async () => {
  const ui = harness();
  let resolveFirst;
  ui.respond(path => path.includes('/alpha/') ? new Promise(resolve => { resolveFirst = resolve; }) : connected({leagueName: 'Beta franchise'}));
  const first = ui.service.refresh();
  ui.switchLeague('beta');
  assert.equal(ui.requests[0].options.signal.aborted, true);
  await ui.service.refresh();
  resolveFirst(connected({leagueName: 'Alpha private franchise'}));
  await first;
  const markup = ui.service.renderPanel();
  assert.match(markup, /Beta franchise/);
  assert.doesNotMatch(markup, /Alpha private/);
  assert.equal(ui.requests[1].path, '/api/leagues/beta/ea-direct/connection');
});

test('weekly collection requires verification; yearly setup can verify a new connection', async () => {
  const ui = harness();
  ui.respond(async () => connected());
  await ui.service.refresh();
  assert.match(ui.service.renderPanel(), /data-ea-collect="weekly" disabled/);
  await ui.service.collect('weekly');
  assert.equal(ui.requests.filter(request => request.options.method === 'POST').length, 0);
  ui.respond(async (_path, options) => options.method === 'POST'
    ? {ok: true, id: 'preview-1', status: 'complete', coverage: {freeAgents: {status: 'blocked', count: null}}}
    : connected());
  await ui.service.collect('preview');
  assert.equal(ui.requests.find(request => request.options.method === 'POST').options.body.mode, 'preview');
  assert.match(ui.service.renderPanel(), /blocked/);
  assert.doesNotMatch(ui.service.renderPanel(), /blocked · 0/);
  assert.match(ui.service.renderPanel(), /data-ea-collect="weekly" disabled/);
  ui.respond(async () => connected({previewVerified: true}));
  await ui.service.refresh();
  assert.match(ui.service.renderPanel(), /data-ea-collect="weekly"/);
});

test('collected EA data refreshes import controls and keeps a persistent completion action without publishing', async () => {
  const ui = harness();
  ui.respond(async (path, options) => path.endsWith('/connection') ? connected({previewVerified: true})
    : options.method === 'POST' ? {ok: true, id: 'collection-1', status: 'running'}
    : {ok: true, id: 'collection-1', status: 'complete', readyToImport: true, coverage: {weeks: [4, 5]}});
  await ui.service.refresh();
  await ui.service.collect('weekly');
  await ui.service.pollCollection();
  assert.deepEqual(ui.effects(), {refreshed: 1, published: 0, scrolled: 0});
  assert.match(ui.service.renderPanel(), /EA export complete/);
  assert.match(ui.service.renderPanel(), /Continue to Import/);
  assert.ok(ui.service.renderPanel().indexOf('ea-direct-complete') < ui.service.renderPanel().indexOf('2</span> Import season'));
  assert.doesNotMatch(ui.service.renderPanel(), /League data collection|Continue to Step 2|data-ea-action="review-import"/);
  await ui.service.refresh();
  assert.deepEqual(ui.effects(), {refreshed: 1, published: 0, scrolled: 0});
  ui.click({eaAction:'continue-import'});await settle();
  assert.deepEqual(ui.effects(), {refreshed: 2, published: 0, scrolled: 1});
});

test('opening a completed weekly export refreshes readiness; failures retain completion and allow manual recovery',async()=>{
  const ui=harness();
  ui.respond(async path=>path.endsWith('/connection')?connected():{job:{id:'finished',mode:'weekly',status:'completed',readyToImport:true,completedAt:'2026-10-23T16:10:18Z',coverage:{collectedDatasets:52}}});
  ui.hq.oneClickImport.refreshWorkspace=async()=>{throw Error('Readiness unavailable');};
  await ui.service.refresh();
  assert.match(ui.markup(),/52 datasets collected/);
  assert.match(ui.markup(),/Your export is saved/);
  assert.doesNotMatch(ui.markup(),/Collection status is unavailable|Collection stopped/);
  ui.hq.oneClickImport.refreshWorkspace=async()=>{};
  ui.click({eaAction:'continue-import'});await settle();
  assert.doesNotMatch(ui.markup(),/Your export is saved/);
  assert.equal(ui.effects().scrolled,1);
  assert.ok(ui.requests.every(r=>r.options.method==='GET'));
});

test('old-league completion refresh cannot install a failure or scroll the next league',async()=>{
  const ui=harness();
  ui.respond(async path=>path.endsWith('/connection')?connected():{job:{id:'finished',mode:'weekly',status:'completed',readyToImport:true}});
  let reject;ui.hq.oneClickImport.refreshWorkspace=()=>new Promise((_r,no)=>{reject=no;});
  const pending=ui.service.refresh();await settle();
  ui.switchLeague('beta');reject(Error('Old league unavailable'));await pending;
  assert.doesNotMatch(ui.markup(),/EA export complete|Your export is saved/);
  assert.equal(ui.effects().scrolled,0);
});

test('actual EA, export URL and import services replace the previous live export with the newly collected source',async()=>{
  const requests=[],events=new Map();let completed=false;
  const HQ={leagueTenant:{getCurrentLeague:()=>({slug:'alpha'})},manifest:{register(){}},defineModuleService(_scope,name,value){this[name]=value;}};
  const request=async(url,options={})=>{
    requests.push({url,method:options.method||'GET'});
    assert.equal(options.method||'GET','GET','handoff must never publish or collect');
    if(url.endsWith('/connection'))return connected({previewVerified:true});
    if(url.includes('/ea-direct/sync'))return {job:{id:'new-job',mode:'weekly',status:completed?'completed':'running',readyToImport:completed}};
    if(url.endsWith('/export-url'))return {leagueSlug:'alpha',latestExport:{status:'ready',sessionId:completed?'new-session':'old-session',importLive:!completed},endpoint:{}};
    if(url.endsWith('/yearly-schedule'))return {};
    if(url.endsWith('/candidate-import'))return {source:{discoverySessionId:completed?'new-session':'old-session'},run:completed?null:{activationPerformed:true}};
    assert.fail(url);
  };
  HQ.api={request};
  const window={FranchiseHQ:HQ,addEventListener(name,fn){events.set(name,[...(events.get(name)||[]),fn]);},dispatchEvent(event){for(const fn of events.get(event.type)||[])fn(event);}};
  const runtime=vm.createContext({window,console,URL,AbortController,Date,CustomEvent:class{constructor(type){this.type=type;}},setTimeout:()=>1,clearTimeout(){},fetch:async(url,options)=>Response.json(await request(url,options)),document:{querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}}});
  for(const file of ['permanent-export-url.js','one-click-import.js','ea-direct.js'])vm.runInContext(await readFile(new URL('../../league-engine/'+file,import.meta.url),'utf8'),runtime);
  await HQ.oneClickImport.refreshWorkspace();await HQ.eaDirect.refresh();
  assert.match(HQ.oneClickImport.renderCompactPanel(),/disabled>Latest Export Live/);
  completed=true;await HQ.eaDirect.pollCollection();
  assert.equal(HQ.oneClickImport.diagnostics().state.source.discoverySessionId,'new-session');
  assert.equal(HQ.leagueExportUrl.diagnostics().state.latestExport.sessionId,'new-session');
  assert.match(HQ.oneClickImport.renderCompactPanel(),/data-import-in-place >Import Latest Export/);
  assert.match(HQ.eaDirect.renderPanel(),/Continue to Import/);
  assert.ok(requests.every(r=>r.method==='GET'));
});

test('EA profile and league text is escaped and login links only allow EA HTTPS hosts', async () => {
  const ui = harness();
  ui.respond(async () => connected({leagueName: '<img src=x onerror=alert(1)>', personaName: 'A & B'}));
  await ui.service.refresh();
  assert.match(ui.service.renderPanel(), /&lt;img/);
  assert.match(ui.service.renderPanel(), /A &amp; B/);
  assert.doesNotMatch(ui.service.renderPanel(), /<img/);
  ui.respond(async () => ({ok: true, configured: true, status: 'not-connected', connection: null, setup: {id: 'setup-1'}, loginUrl: 'https://ea.com.evil.example/signin'}));
  await ui.service.refresh();
  assert.doesNotMatch(ui.service.renderPanel(), /href="https:\/\/ea\.com\.evil/);
});

test('EA return address clears immediately and never appears in rendered error text', async () => {
  const ui = harness();
  ui.respond(async (_path, options) => {
    if (options.method === 'GET') return {ok: true, configured: true, status: 'not-connected', setup: {id: 'setup-1'}, loginUrl: 'https://accounts.ea.com/connect/auth'};
    throw new Error('Request failed for http://localhost?code=private-signin-code');
  });
  await ui.service.refresh();
  const input = {value: 'http://localhost?code=private-signin-code'};
  ui.submit('exchange', input);
  assert.equal(input.value, '');
  await settle();
  assert.equal(ui.requests.at(-1).options.body.action, 'exchange');
  assert.doesNotMatch(ui.service.renderPanel(), /private-signin-code/);
});

test('choosing a franchise is not masked by profiles retained in the setup response', async () => {
  const ui = harness();
  ui.respond(async () => ({ok: true, configured: true, status: 'choosing-franchise', setup: {
    id: 'setup-1', personas: [{id: 'profile-1', name: 'Owner'}], leagues: [{id: 'league-1', name: 'Alpha franchise'}]
  }}));
  await ui.service.refresh();
  assert.match(ui.service.renderPanel(), /data-ea-form="franchise"/);
  assert.doesNotMatch(ui.service.renderPanel(), /data-ea-form="persona"/);
});

const choiceStages = [
  {kind: 'persona', status: 'choosing-profile', list: 'personas', id: 'ps5:123', action: 'select-persona', field: 'personaId'},
  {kind: 'franchise', status: 'choosing-franchise', list: 'leagues', id: '321', action: 'connect', field: 'externalLeagueId'}
];

for (const stage of choiceStages) {
  const setupState = (id = 'setup-1', choices = [{id: stage.id, name: 'Selected choice'}]) => ({
    ok: true, configured: true, status: stage.status, setup: {id, [stage.list]: choices}
  });
  const selectedOption = new RegExp(`<option value="${stage.id}" selected>`);

  test(`${stage.kind} selection survives busy, rejected request, and connection refresh`, async () => {
    const ui = harness();
    ui.respond(async () => setupState());
    await ui.service.refresh();
    let rejectAction;
    ui.respond((_path, options) => options.method === 'POST'
      ? new Promise((_resolve, reject) => { rejectAction = reject; }) : setupState());
    ui.submit(stage.kind, {value: stage.id});
    assert.match(ui.markup(), selectedOption);
    assert.match(ui.markup(), /aria-busy="true"/);
    assert.match(ui.markup(), /data-ea-action="begin" disabled>Restart EA sign-in/);
    assert.equal(ui.requests.at(-1).options.body.action, stage.action);
    assert.equal(ui.requests.at(-1).options.body[stage.field], stage.id);
    rejectAction(new Error('EA did not accept this request.'));
    await settle();
    assert.match(ui.markup(), selectedOption);
    assert.match(ui.markup(), /EA Direct needs attention/);
    await ui.service.refresh();
    assert.match(ui.markup(), selectedOption);
    assert.equal(ui.requests.filter(request => request.options.method === 'POST').length, 1);
  });

  test(`${stage.kind} choice is retained before submission when refreshing or switching connection methods`, async () => {
    const ui = harness();
    ui.respond(async () => setupState());
    await ui.service.refresh();
    ui.change(stage.kind, stage.id);
    ui.click({eaPath: 'companion'});
    ui.click({eaPath: 'ea-direct'});
    assert.match(ui.markup(), selectedOption);
    let resolveRefresh;
    ui.respond(() => new Promise(resolve => { resolveRefresh = resolve; }));
    const refreshing = ui.service.refresh();
    assert.match(ui.markup(), selectedOption);
    resolveRefresh(setupState());
    await refreshing;
    assert.match(ui.markup(), selectedOption);
    assert.equal(ui.requests.every(request => request.options.method === 'GET'), true);
  });

  test(`${stage.kind} selection is cleared after tenant, auth, setup, or available-choice changes`, async () => {
    const ui = harness();
    ui.respond(async () => setupState());
    await ui.service.refresh();
    ui.change(stage.kind, stage.id);
    ui.switchLeague('beta');
    await ui.service.refresh();
    assert.doesNotMatch(ui.markup(), selectedOption);
    ui.change(stage.kind, stage.id);
    ui.changeAuth();
    await ui.service.refresh();
    assert.doesNotMatch(ui.markup(), selectedOption);
    ui.change(stage.kind, stage.id);
    ui.respond(async () => setupState('setup-2'));
    await ui.service.refresh();
    assert.doesNotMatch(ui.markup(), selectedOption);
    ui.change(stage.kind, stage.id);
    ui.respond(async () => setupState('setup-2', [{id: 'replacement', name: 'Different choice'}]));
    await ui.service.refresh();
    assert.doesNotMatch(ui.markup(), /<option[^>]+ selected>/);
    ui.respond(async () => setupState('setup-2'));
    await ui.service.refresh();
    assert.doesNotMatch(ui.markup(), selectedOption);
  });

  test(`${stage.kind} stage offers an explicit restart that returns to a fresh EA sign-in`, async () => {
    const ui = harness();
    ui.respond(async (_path, options) => options.method === 'GET' ? setupState() : {
      ok: true, configured: true, status: 'not-connected', setup: {id: 'setup-new'},
      loginUrl: 'https://accounts.ea.com/connect/auth'
    });
    await ui.service.refresh();
    ui.change(stage.kind, stage.id);
    assert.match(ui.markup(), /data-ea-action="begin"[^>]*>Restart EA sign-in/);
    assert.equal(ui.requests.filter(request => request.options.method === 'POST').length, 0);
    ui.click({eaAction: 'begin'});
    await settle();
    assert.equal(ui.requests.at(-1).options.body.action, 'begin');
    assert.match(ui.markup(), /data-ea-form="exchange"/);
    assert.match(ui.markup(), /Sign in on EA/);
    assert.doesNotMatch(ui.markup(), /data-ea-form="(?:persona|franchise)"/);
    ui.respond(async () => setupState('setup-new'));
    await ui.service.refresh();
    assert.doesNotMatch(ui.markup(), selectedOption);
  });
}

test('refresh resumes a known collection using GET without creating another job', async () => {
  const ui = harness();
  ui.respond(async path => path.endsWith('/connection') ? connected({previewVerified: true})
    : {ok: true, job: {id: 'retained-sync', mode: 'weekly', status: 'running'}});
  await ui.service.refresh();
  assert.match(ui.service.renderPanel(), /Check Collection/);
  assert.equal(ui.requests.length, 2);
  assert.equal(ui.requests.every(request => request.options.method === 'GET'), true);
  assert.ok([...ui.timers.values()].some(timer => timer.delay === 3000));
});

test('completed yearly schedule is shown without a regular snapshot import action', async () => {
  const ui = harness();
  ui.respond(async path => path.endsWith('/connection') ? connected({previewVerified: true})
    : {ok: true, job: {id: 'yearly-sync', mode: 'yearly', status: 'completed', readyToImport: false,
      message: 'Yearly schedule is available. The current week has not changed.', coverage: {schedules: {status: 'Available', count: 272}}}});
  await ui.service.refresh();
  assert.match(ui.service.renderPanel(), /Yearly schedule is available/);
  assert.match(ui.service.renderPanel(), /272/);
  assert.doesNotMatch(ui.service.renderPanel(), /data-ea-action="review-import"/);
  assert.equal(ui.effects().published, 0);
});

test('Companion instructions lead directly to Refresh without an intermediate button',async()=>{const ui=harness();await ui.service.refresh();ui.click({eaPath:'companion'});assert.match(ui.service.renderPanel(),/League Info, Rosters, and your selected weeks/);assert.match(ui.service.renderPanel(),/Collect league data/);assert.doesNotMatch(ui.service.renderPanel(),/Open Companion Import|data-ea-action="companion-import"/);});

test('EA-first setup preserves the typed season through status refresh and requires an explicit collection action',async()=>{
  const ui=harness();
  ui.hq.leagueExportUrl={diagnostics:()=>({state:{leagueSlug:'alpha',endpoint:{exportUrl:'https://example.invalid/export'}}})};
  ui.respond(async(_path,options)=>options.method==='POST'?{ok:true,id:'yearly',mode:'yearly',status:'running'}:connected());
  await ui.service.refresh();ui.typeSeason('2');await ui.service.refresh();
  assert.match(ui.service.renderPanel(),/name="sourceSeasonId" value="2"/);
  assert.equal(ui.requests.filter(r=>r.options.method==='POST').length,0);
  await ui.service.collect('yearly',{sourceSeasonId:'2',confirmSeason:true});
  const request=ui.requests.find(r=>r.options.method==='POST');
  assert.equal(request.options.body.mode,'yearly');assert.equal(request.options.body.confirmSeason,true);assert.equal(request.options.body.sourceSeasonId,'2');
  ui.switchLeague('beta');ui.hq.leagueExportUrl={diagnostics:()=>({state:{leagueSlug:'beta'}})};
  await ui.service.refresh();assert.doesNotMatch(ui.service.renderPanel(),/name="sourceSeasonId" value="2"/);
});


test('EA recovery is available during a retained running collection and one click enters sign-in',async()=>{
 const ui=harness();
 ui.respond(async path=>path.endsWith('/connection')?connected():{job:{id:'old-job',status:'running'}});
 await ui.service.refresh();
 assert.doesNotMatch(ui.service.renderPanel(),/data-ea-action="(?:begin|disconnect)" disabled/);
 ui.respond(async()=>({ok:true,status:'signing-in',connection:null,setup:{id:'new-setup'},loginUrl:'https://accounts.ea.com/connect/auth'}));
 ui.click({eaAction:'begin'});ui.click({eaAction:'begin'});await settle();
 assert.equal(ui.requests.filter(r=>r.options.body?.action==='begin').length,1);
 assert.match(ui.markup(),/Sign in on EA/);assert.doesNotMatch(ui.markup(),/Check Collection/);
});

test('pointer gesture survives a status refresh and open settings survive parent renders',async()=>{
 const ui=harness();ui.respond(async()=>connected());await ui.service.refresh();
 ui.dispatch('toggle',{target:{matches:()=>true,open:true}});
 assert.match(ui.service.renderPanel(),/ea-direct-settings" open/);
 const before=ui.markup();
 ui.dispatch('pointerdown',{target:{closest:()=>({})}});
 await ui.service.refresh();assert.equal(ui.markup(),before);
 ui.dispatch('pointerup',{});
 ui.respond(async()=>({status:'not-connected',connection:null,setup:null}));
 ui.click({eaAction:'disconnect'});await settle();
 assert.equal(ui.requests.filter(r=>r.options.body?.action==='disconnect').length,1);
 assert.match(ui.markup(),/EA account disconnected/);
});


test('yearly completion monitors its server-created import without posting another import',async()=>{
  const ui=harness(),monitored=[];
  ui.hq.oneClickImport.runImport=async options=>monitored.push(options.workflowId);
  ui.respond(async path=>path.endsWith('/connection')?connected({previewVerified:true}):{ok:true,job:{id:'yearly',mode:'yearly',status:'running'}});
  await ui.service.refresh();
  ui.respond(async path=>path.endsWith('/connection')?connected({previewVerified:true}):{ok:true,job:{id:'yearly',mode:'yearly',status:'completed',previewVerified:true,readyToImport:true,importWorkflowId:'durable-import'}});
  await ui.service.pollCollection();
  assert.deepEqual(monitored,['durable-import']);assert.ok(ui.requests.every(r=>r.options.method==='GET'));
  assert.match(ui.service.renderPanel(),/Automatic import progress/);
});
