(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  const VERSION = '8.0.2';
  const FEATURE_LABELS = Object.freeze({
    core_browsing:'League pages',
    commissioner_hq:'Commissioner HQ',
    madden_import:'Madden imports',
    trade_center:'Trade Center',
    confidence_pool:'Confidence Pool',
    game_of_the_week:'Game of the Week',
    rules:'League Rules'
  });
  const DEFAULT_FEATURES = Object.freeze({
    core_browsing:true,commissioner_hq:true,madden_import:true,trade_center:true,
    confidence_pool:false,game_of_the_week:false,rules:true
  });
  let data = { plans:[],events:[],users:[] };
  let preview = null;
  let busy = false;
  let loaded = false;
  let lastError = null;
  let editingPlanId = null;

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[character]));
  const account = () => window.FGC_TRADE?.getCurrentAccount?.() || null;
  const currentSlug = () => HQ?.leagueTenant?.getCurrentLeague?.()?.slug || null;
  const endpoint = () => `/api/platform/onboarding?league=${encodeURIComponent(currentSlug() || '')}`;
  const headers = () => ({
    accept:'application/json',
    'content-type':'application/json',
    'x-franchisehq-platform-owner-account-id':String(account()?.id || '')
  });

  async function request(method = 'GET', body = null) {
    busy = true;
    lastError = null;
    rerender();
    try {
      const response = await fetch(endpoint(),{
        method,headers:headers(),credentials:'same-origin',cache:'no-store',
        body:body ? JSON.stringify(body) : undefined
      });
      const payload = await response.json().catch(() => ({ ok:false,error:`HTTP ${response.status}` }));
      if (!response.ok || payload.ok === false) {
        const detail = payload.validation?.errors?.join(' ') || payload.conflicts?.map(item => item.message).join(' ') || payload.error;
        throw Object.assign(new Error(detail || 'The onboarding request could not be completed.'),{ payload });
      }
      if (method === 'GET') data = payload;
      else if (payload.plan) {
        const index = data.plans.findIndex(item => item.id === payload.plan.id);
        if (index >= 0) data.plans.splice(index,1,payload.plan);
        else data.plans.unshift(payload.plan);
      }
      loaded = true;
      return payload;
    } catch (error) {
      lastError = error.message;
      console.error('[Platform Onboarding]',error.payload || error);
      throw error;
    } finally {
      busy = false;
      rerender();
    }
  }

  function formPlan(form) {
    const formData = new FormData(form);
    return {
      name:String(formData.get('name') || '').trim(),
      slug:String(formData.get('slug') || '').trim(),
      productName:'FranchiseHQ',
      timezone:String(formData.get('timezone') || 'America/Chicago'),
      gameYear:Number(formData.get('gameYear')),
      initialCommissionerUserId:String(formData.get('initialCommissionerUserId') || '').trim() || undefined,
      sourceMode:'companion',
      desiredDomain:String(formData.get('desiredDomain') || '').trim() || null,
      limits:{
        memberLimit:Number(formData.get('memberLimit')),
        importConcurrency:Number(formData.get('importConcurrency')),
        discordDeliveriesPerMinute:Number(formData.get('discordDeliveriesPerMinute'))
      },
      discord:{
        requested:formData.get('discordRequested') === 'on',
        guildId:String(formData.get('discordGuildId') || '').trim() || null
      },
      branding:{
        primaryColor:String(formData.get('primaryColor') || '#0878ff'),
        secondaryColor:String(formData.get('secondaryColor') || '#00b7ff'),
        logoUrl:String(formData.get('logoUrl') || '').trim() || null
      },
      desiredFeatures:Object.fromEntries(Object.keys(FEATURE_LABELS).map(key => [key,formData.get(`feature:${key}`) === 'on']))
    };
  }

  function currentDraft() {
    return data.plans.find(plan => plan.id === editingPlanId && plan.status === 'draft') || null;
  }

  function field(label,name,value,type = 'text',extra = '') {
    return `<label class="platform-onboarding-field"><span>${esc(label)}</span><input class="input" type="${type}" name="${esc(name)}" value="${esc(value)}" ${extra}></label>`;
  }

  function commissionerField(plan) {
    const selected = plan?.initialCommissionerUserId || '';
    return `<label class="platform-onboarding-field"><span>Initial commissioner</span><select class="select" name="initialCommissionerUserId"><option value="">Signed-in Platform Owner</option>${data.users.map(user => `<option value="${esc(user.id)}" ${user.id === selected ? 'selected' : ''}>${esc(user.displayName)}</option>`).join('')}</select></label>`;
  }

  function planForm() {
    const plan = currentDraft();
    const year = plan?.gameYear || new Date().getFullYear();
    const features = plan?.desiredFeatures || DEFAULT_FEATURES;
    return `<article class="card platform-onboarding-form-card">
      <div class="card-header"><div><span class="eyebrow">Owner-only activation · disabled by default</span><h3>${plan ? 'Edit onboarding draft' : 'Plan a new league'}</h3><p>Preview the league identity and settings before reserving anything. Preparation stays private until a separate activation confirmation.</p></div><span class="pill pill--neutral">Gated activation</span></div>
      <form data-platform-onboarding-form>
        <div class="platform-onboarding-form-grid">
          ${field('League name','name',plan?.name || '', 'text','required minlength="2" maxlength="80"')}
          ${field('League URL name','slug',plan?.slug || '', 'text','required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxlength="63" placeholder="example-football-league"')}
          ${field('Madden game year','gameYear',year,'number','required min="2020" max="2100"')}
          ${field('Timezone','timezone',plan?.timezone || 'America/Chicago','text','required placeholder="America/Chicago"')}
          ${commissionerField(plan)}
          ${field('Primary color','primaryColor',plan?.branding?.primaryColor || '#0878ff','color')}
          ${field('Secondary color','secondaryColor',plan?.branding?.secondaryColor || '#00b7ff','color')}
          ${field('Logo URL (optional)','logoUrl',plan?.branding?.logoUrl || '','url','placeholder="https://…"')}
          ${field('Custom domain (optional)','desiredDomain',plan?.desiredDomain || '','text','placeholder="league.example.com"')}
        </div>
        <fieldset class="platform-onboarding-options"><legend>Tenant limits</legend><div class="platform-onboarding-form-grid">${field('Member limit','memberLimit',plan?.limits?.memberLimit || 64,'number','required min="2" max="1000"')}${field('Concurrent imports','importConcurrency',plan?.limits?.importConcurrency || 1,'number','required min="1" max="10"')}${field('Discord deliveries per minute','discordDeliveriesPerMinute',plan?.limits?.discordDeliveriesPerMinute || 60,'number','required min="1" max="300"')}</div></fieldset>
        <fieldset class="platform-onboarding-options"><legend>Features to enable at a later activation</legend><div class="platform-onboarding-checks">${Object.entries(FEATURE_LABELS).map(([key,label]) => `<label><input type="checkbox" name="feature:${key}" ${features[key] ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div></fieldset>
        <fieldset class="platform-onboarding-options"><legend>Optional Discord request</legend><div class="platform-onboarding-checks"><label><input type="checkbox" name="discordRequested" ${plan?.discord?.requested ? 'checked' : ''}><span>Stage Discord setup for activation review</span></label></div>${field('Discord server ID (optional)','discordGuildId',plan?.discord?.guildId || '','text','inputmode="numeric" placeholder="123456789012345678"')}</fieldset>
        <div class="league-import-framework-actions">
          <button class="button button--secondary" type="button" data-onboarding-preview ${busy ? 'disabled' : ''}>Preview</button>
          <button class="button button--primary" type="button" data-onboarding-save ${busy ? 'disabled' : ''}>${plan ? 'Save changes' : 'Save draft'}</button>
          ${plan ? '<button class="button button--ghost" type="button" data-onboarding-new>Close draft</button>' : ''}
        </div>
      </form>
      ${preview ? previewCard() : ''}
    </article>`;
  }

  function previewCard() {
    const item = preview.preview;
    const valid = item?.validation?.ok && !(item?.conflicts?.length);
    return `<section class="platform-onboarding-preview" aria-live="polite"><div><span class="eyebrow">Plan preview</span><h4>${esc(item?.plan?.name || 'New league')}</h4><p><strong>/leagues/${esc(item?.plan?.slug || '')}</strong> · ${esc(item?.plan?.timezone || '')} · Madden ${esc(item?.plan?.gameYear || '')}</p></div><span class="pill pill--${valid ? 'success' : 'warning'}">${valid ? 'Ready to save' : 'Needs attention'}</span>${item?.validation?.errors?.length ? `<div class="validation-errors">${item.validation.errors.map(message => `<p>${esc(message)}</p>`).join('')}</div>` : ''}${item?.conflicts?.length ? `<div class="validation-errors">${item.conflicts.map(conflict => `<p>${esc(conflict.message)}</p>`).join('')}</div>` : ''}<p>${esc(item?.outcome || '')}</p></section>`;
  }

  function readiness(plan) {
    const checks = plan.readiness?.checks || [];
    return `<div class="platform-onboarding-readiness">${checks.map(item => `<div><span class="platform-onboarding-check platform-onboarding-check--${esc(item.status)}" aria-hidden="true"></span><span><strong>${esc(item.label)}</strong><small>${esc(item.detail)}</small></span></div>`).join('')}</div>`;
  }

  function statusLabel(plan) {
    if (plan.activatedAt) return 'Active';
    return ({ draft:'Draft',preparing:'Resume required',prepared:'Prepared and disabled',cancelled:'Cancelled and contained' })[plan.status] || plan.status;
  }

  function planCard(plan) {
    const active = !plan.activatedAt && (plan.status === 'draft' || plan.status === 'preparing' || plan.status === 'prepared');
    return `<article class="card platform-onboarding-plan" data-onboarding-plan="${esc(plan.id)}">
      <div class="card-header"><div><span class="eyebrow">${esc(plan.slug)}</span><h3>${esc(plan.name)}</h3><p>Madden ${esc(plan.gameYear)} · ${esc(plan.timezone)} · Initial commissioner: ${esc(plan.initialCommissionerDisplayName)}</p></div><span class="pill pill--${plan.activatedAt || plan.status === 'prepared' ? 'success' : plan.status === 'preparing' ? 'warning' : 'neutral'}">${esc(statusLabel(plan))}</span></div>
      <div class="league-import-framework-grid"><div><span>Tenant</span><strong>${plan.activatedAt ? 'Enabled' : plan.status === 'prepared' ? 'Disabled' : 'Not created'}</strong></div><div><span>Public route</span><strong>${plan.activatedAt ? 'Active' : 'Hidden'}</strong></div><div><span>Memberships</span><strong>${esc(plan.readiness?.counts?.memberships || 0)}</strong></div><div><span>Snapshots</span><strong>${esc(plan.readiness?.counts?.snapshots || 0)}</strong></div><div><span>Activation</span><strong>${plan.activatedAt ? 'Recorded' : plan.readiness?.activationAvailable ? 'Owner ready' : 'Waiting'}</strong></div><div><span>Revision</span><strong>${esc(plan.revision)}</strong></div></div>
      ${readiness(plan)}
      ${active ? `<div class="league-import-framework-actions">${plan.status === 'draft' ? `<button class="button button--ghost" data-onboarding-edit="${esc(plan.id)}" ${busy ? 'disabled' : ''}>Edit draft</button><button class="button button--primary" data-onboarding-prepare="${esc(plan.id)}" ${busy ? 'disabled' : ''}>Prepare disabled league</button>` : ''}${plan.status === 'preparing' ? `<button class="button button--primary" data-onboarding-resume="${esc(plan.id)}" ${busy ? 'disabled' : ''}>Resume preparation</button>` : ''}${plan.status === 'prepared' && plan.readiness?.activationAvailable ? `<button class="button button--primary" data-onboarding-activate="${esc(plan.id)}" ${busy ? 'disabled' : ''}>Activate league</button>` : ''}<button class="button button--ghost" data-onboarding-cancel="${esc(plan.id)}" ${busy ? 'disabled' : ''}>Cancel plan</button></div>` : plan.activatedAt ? `<div class="league-import-framework-actions"><a class="button button--primary" href="/leagues/${encodeURIComponent(plan.slug)}">Open active league</a></div>` : ''}
    </article>`;
  }

  function renderPanel() {
    if (!loaded && !busy) queueMicrotask(() => refresh().catch(() => {}));
    return `<section data-platform-onboarding-panel class="platform-onboarding">
      <article class="card platform-onboarding-safety"><div class="card-header"><div><span class="eyebrow">FranchiseHQ ${VERSION}</span><h3>League Onboarding</h3><p>Review registrations and activate the next league without changing FGC or exposing an unfinished tenant.</p></div><button class="button button--ghost" data-onboarding-refresh ${busy ? 'disabled' : ''}>${busy ? 'Working…' : 'Refresh'}</button></div><div class="league-import-framework-note"><svg><use href="#icon-lock"></use></svg><span>Registration and preparation remain disabled by default. Only this owner workspace can grant the first commissioner membership and activate the exact reviewed tenant.</span></div></article>
      ${lastError ? `<div class="validation-errors" role="alert"><p>${esc(lastError)}</p></div>` : ''}
      ${planForm()}
      <section class="platform-onboarding-plans"><div class="section-heading"><div><span class="eyebrow">Durable plans</span><h2>Onboarding queue</h2></div><span class="pill pill--neutral">${data.plans.length} plan${data.plans.length === 1 ? '' : 's'}</span></div>${data.plans.length ? data.plans.map(planCard).join('') : `<article class="card"><p>No onboarding plans have been saved. Existing leagues and production data are unchanged.</p></article>`}</section>
    </section>`;
  }

  function rerender() {
    const panel = document.querySelector('[data-platform-onboarding-panel]');
    if (panel) panel.outerHTML = renderPanel();
  }

  async function refresh() { return request('GET'); }

  async function submitForm(action) {
    const form = document.querySelector('[data-platform-onboarding-form]');
    if (!form?.reportValidity()) return;
    const draft = currentDraft();
    const payload = await request('POST',{
      action,plan:formPlan(form),planId:draft?.id || null,expectedRevision:draft?.revision || null
    });
    if (action === 'preview') preview = payload;
    else {
      preview = null;
      editingPlanId = payload.plan?.status === 'draft' ? payload.plan.id : null;
      await refresh();
    }
    rerender();
  }

  async function planAction(action,planId) {
    const plan = data.plans.find(item => item.id === planId);
    if (!plan) return;
    if (action === 'cancel' && !window.confirm('Cancel this onboarding plan? Its audit and any disabled tenant shell will be retained, and no data will be deleted.')) return;
    if (action === 'activate' && !window.confirm('Activate this exact league and grant its selected account commissioner access? This will not import data, connect Discord, create schedule threads, or change any existing league.')) return;
    await request('POST',{ action,planId,expectedRevision:plan.revision });
    if (editingPlanId === planId) editingPlanId = null;
    preview = null;
    await refresh();
  }

  document.addEventListener('click',event => {
    const action = event.target.closest('[data-onboarding-preview],[data-onboarding-save],[data-onboarding-refresh],[data-onboarding-new],[data-onboarding-edit],[data-onboarding-prepare],[data-onboarding-resume],[data-onboarding-activate],[data-onboarding-cancel]');
    if (!action) return;
    event.preventDefault();
    if (action.matches('[data-onboarding-preview]')) submitForm('preview').catch(() => {});
    else if (action.matches('[data-onboarding-save]')) submitForm('save').catch(() => {});
    else if (action.matches('[data-onboarding-refresh]')) refresh().catch(() => {});
    else if (action.matches('[data-onboarding-new]')) { editingPlanId = null;preview = null;rerender(); }
    else if (action.matches('[data-onboarding-edit]')) { editingPlanId = action.dataset.onboardingEdit;preview = null;rerender(); }
    else if (action.matches('[data-onboarding-prepare]')) planAction('prepare',action.dataset.onboardingPrepare).catch(() => {});
    else if (action.matches('[data-onboarding-resume]')) planAction('resume',action.dataset.onboardingResume).catch(() => {});
    else if (action.matches('[data-onboarding-activate]')) planAction('activate',action.dataset.onboardingActivate).catch(() => {});
    else if (action.matches('[data-onboarding-cancel]')) planAction('cancel',action.dataset.onboardingCancel).catch(() => {});
  });

  function diagnostics() {
    return Object.freeze({
      service:'platformOnboarding',version:VERSION,ownerOnly:true,activationAvailable:true,
      planCount:data.plans.length,preparedCount:data.plans.filter(plan => plan.status === 'prepared').length,
      busy,lastError
    });
  }

  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before platform-onboarding.js.');
  HQ.defineModuleService('platform','platformOnboarding',{
    refresh,renderPanel,diagnostics
  },{ replace:true,alias:'platformOnboarding' });
})();
