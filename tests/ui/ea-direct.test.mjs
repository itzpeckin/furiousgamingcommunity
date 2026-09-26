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
    service, requests, timers, click,
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

test('weekly and yearly collection require a server-verified preview', async () => {
  const ui = harness();
  ui.respond(async () => connected());
  await ui.service.refresh();
  assert.doesNotMatch(ui.service.renderPanel(), /data-ea-collect="weekly"/);
  await ui.service.collect('weekly');
  await ui.service.collect('yearly');
  assert.equal(ui.requests.filter(request => request.options.method === 'POST').length, 0);
  ui.respond(async (_path, options) => options.method === 'POST'
    ? {ok: true, id: 'preview-1', status: 'complete', coverage: {freeAgents: {status: 'blocked', count: null}}}
    : connected());
  await ui.service.collect('preview');
  assert.equal(ui.requests.find(request => request.options.method === 'POST').options.body.mode, 'preview');
  assert.match(ui.service.renderPanel(), /blocked/);
  assert.doesNotMatch(ui.service.renderPanel(), /blocked · 0|data-ea-collect="weekly"/);
  ui.respond(async () => connected({previewVerified: true}));
  await ui.service.refresh();
  assert.match(ui.service.renderPanel(), /data-ea-collect="weekly"/);
});

test('collected EA data directs the commissioner to Refresh and Import without a redundant collection card', async () => {
  const ui = harness();
  ui.respond(async (path, options) => path.endsWith('/connection') ? connected({previewVerified: true})
    : options.method === 'POST' ? {ok: true, id: 'collection-1', status: 'running'}
    : {ok: true, id: 'collection-1', status: 'complete', readyToImport: true, coverage: {weeks: [4, 5]}});
  await ui.service.refresh();
  await ui.service.collect('weekly');
  await ui.service.pollCollection();
  assert.deepEqual(ui.effects(), {refreshed: 0, published: 0, scrolled: 0});
  assert.match(ui.service.renderPanel(), /Use Refresh below, then Import Latest Export/);
  assert.doesNotMatch(ui.service.renderPanel(), /League data collection|Continue to Step 2|data-ea-action="review-import"/);
  assert.deepEqual(ui.effects(), {refreshed: 0, published: 0, scrolled: 0});
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
    assert.match(ui.markup(), /EA did not accept this request/);
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

test('Companion instructions lead directly to Refresh without an intermediate button',async()=>{const ui=harness();await ui.service.refresh();ui.click({eaPath:'companion'});assert.match(ui.service.renderPanel(),/League Info, Rosters, and Weekly Stats/);assert.match(ui.service.renderPanel(),/Refresh in Step 2/);assert.doesNotMatch(ui.service.renderPanel(),/Open Companion Import|data-ea-action="companion-import"/);});
