(() => {
  const application=document.body.hasAttribute('data-beta-application');
  const access=document.querySelector('[data-access]'),registration=document.querySelector('[data-registration]'),form=document.querySelector('[data-league-form]'),message=document.querySelector('[data-message]'),plans=document.querySelector('[data-plans]');
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key='fhq-pending-beta-invitation';
  const fragment=new URLSearchParams(location.hash.slice(1));
  let pendingInvitation=fragment.get('invite');
  try { if(pendingInvitation) sessionStorage.setItem(key,pendingInvitation);else pendingInvitation=sessionStorage.getItem(key); } catch { /* The current page can still claim the invitation without browser storage. */ }
  if(fragment.get('invite')) history.replaceState(null,'',location.pathname);
  const recovery=window.FHQAccountRecovery;
  let loading=false, busy=false, needsStatus=false;
  const request=(path,body)=>recovery.request(path,body);
  function failure(error){const result=recovery.show(message,error,{kind:'onboarding',returnTo:application?'/beta-apply':'/register-league'},()=>load());if(result.checkBeforeSubmit)needsStatus=true;}
  function render(list) {
    plans.innerHTML=list.map(plan=>'<article class="card"><span class="eyebrow">'+esc(plan.slug)+'</span><h2>'+esc(plan.name)+'</h2><p>Madden '+esc(Number(plan.gameYear)%100)+' · Franchise season '+esc(plan.franchiseSeasonYear||'Not set')+'</p>'+(plan.activatedAt
      ? '<ol class="steps">'+(plan.readiness.checks||[]).map(check=>'<li><div><strong>'+esc(check.label)+'</strong>'+(check.detail?'<small>'+esc(check.detail)+'</small>':'')+'</div>'+(check.complete?'<span class="status good">Complete</span>':'<a href="'+esc(check.href)+'">'+esc(check.action)+' →</a>')+'</li>').join('')+'</ol><a class="button" href="'+esc(plan.leagueUrl)+'">Open league</a>'
      : plan.status==='cancelled' ? '<p>This application was declined. Contact FranchiseHQ if you have questions.</p>'
      : plan.configuration?.betaApplicationRequired ? '<h3>Awaiting owner approval</h3><p>Your application has been saved. Your league will become available here after approval.</p><button data-resume="'+esc(plan.id)+'">Check application status</button>'
      : '<p>Your setup can be resumed without creating another league.</p><button data-resume="'+esc(plan.id)+'">Continue setup</button>')+'</article>').join('');
  }
  async function load() {
    if(loading)return false;loading=true;message.textContent='';message.classList.remove('error');
    try {
      let data=await request('/api/beta-access');
      if(pendingInvitation) {
        try { await request('/api/beta-access',{token:pendingInvitation}); }
        catch(error) { if(error.status!==409)throw error;failure(error); }
        pendingInvitation=null;
        try { sessionStorage.removeItem(key); } catch { /* Optional browser storage. */ }
        data=await request('/api/beta-access');
      }
      registration.classList.toggle('hidden',(!application&&!data.invitationAvailable)||!data.account.verified);
      access.innerHTML=!data.account.verified
        ? '<h2>Verify your email</h2><p>Open the link in your verification email, then return here.</p><div class="actions"><a class="button" href="/account">Account Settings</a><button class="secondary" data-refresh>Check again</button></div>'
        : application ? '<h2>Request beta access</h2><p>Enter your league details below. FranchiseHQ will review your application before your league becomes operational.</p>'
        : data.invitationAvailable ? '<h2>You’re invited</h2><p>Your account is ready. This invitation lets you create one league.</p>'
        : '<h2>Beta access</h2><p>Open an invitation from FranchiseHQ to create a new league. Existing leagues are listed below.</p>';
      render((await request('/api/onboarding')).plans);
      needsStatus=false;return true;
    } catch(error) {
      if(error.status===401)access.innerHTML='<h2>Start with your account</h2><p>Create a free account or sign in to continue.</p><div class="actions"><a class="button" href="/auth?mode=register&returnTo='+encodeURIComponent(application?'/beta-apply':'/register-league')+'">Create account</a><a href="/auth?returnTo='+encodeURIComponent(application?'/beta-apply':'/register-league')+'">Sign in</a></div>';
      else {failure(error);access.textContent='Your access could not be checked. Use the recovery options below to continue.';}
      return false;
    } finally {loading=false;}
  }
  form.elements.name.addEventListener('input',()=>{if(!form.elements.slug.dataset.edited)form.elements.slug.value=form.elements.name.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,63);});
  form.elements.slug.addEventListener('input',()=>form.elements.slug.dataset.edited='1');
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy || loading || !form.reportValidity())return;
    if(needsStatus){failure({status:409});return;}busy=true;
    const button=form.querySelector('button');button.disabled=true;message.textContent='';
    try {
      const fields=Object.fromEntries(new FormData(form));
      await request('/api/onboarding',{action:application?'apply':'submit',plan:{...fields,gameYear:Number(fields.gameYear),franchiseSeasonYear:Number(fields.franchiseSeasonYear),branding:{primaryColor:fields.primaryColor,secondaryColor:fields.secondaryColor},desiredFeatures:{confidence_pool:fields.confidence_pool==='true',game_of_the_week:fields.game_of_the_week==='true'}}});
      needsStatus=true;await load();plans.scrollIntoView({behavior:'smooth'});
    }catch(error){failure(error);}finally{busy=false;button.disabled=false;}
  });
  document.addEventListener('click',async event=>{
    const refresh=event.target.closest('[data-refresh]');if(refresh){if(!busy)return load();return;}
    const button=event.target.closest('[data-resume]');if(!button || busy || loading)return;
    busy=true;button.disabled=true;
    try {await request('/api/onboarding',{action:'resume',planId:button.dataset.resume});await load();}
    catch(error){failure(error);}finally{busy=false;button.disabled=false;}
  });
  load();
})();
