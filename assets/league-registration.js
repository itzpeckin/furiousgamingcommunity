(() => {
  const access=document.querySelector('[data-access]'),registration=document.querySelector('[data-registration]'),form=document.querySelector('[data-league-form]'),message=document.querySelector('[data-message]'),plans=document.querySelector('[data-plans]');
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key='fhq-pending-beta-invitation';
  const fragment=new URLSearchParams(location.hash.slice(1));
  let pendingInvitation=fragment.get('invite');
  try { if(pendingInvitation) sessionStorage.setItem(key,pendingInvitation);else pendingInvitation=sessionStorage.getItem(key); } catch { /* The current page can still claim the invitation without browser storage. */ }
  if(fragment.get('invite')) history.replaceState(null,'',location.pathname);
  const csrf=()=>decodeURIComponent(document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('franchise_hq_csrf='))?.split('=')[1]||'');
  async function request(path,body) {
    const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{accept:'application/json',...(body?{'content-type':'application/json','x-franchisehq-csrf':csrf()}:{})},body:body?JSON.stringify(body):undefined});
    const payload=await response.json();
    if(!response.ok||!payload.ok)throw Object.assign(new Error((payload.errors||[]).join(' ')||payload.error||'The request could not be completed.'),{status:response.status});
    return payload;
  }
  function render(list) {
    plans.innerHTML=list.map(plan=>'<article class="card"><span class="eyebrow">'+esc(plan.slug)+'</span><h2>'+esc(plan.name)+'</h2><p>Madden '+esc(Number(plan.gameYear)%100)+' · Franchise season '+esc(plan.franchiseSeasonYear||'Not set')+'</p>'+(plan.activatedAt
      ? '<ol class="steps">'+(plan.readiness.checks||[]).map(check=>'<li><div><strong>'+esc(check.label)+'</strong>'+(check.detail?'<small>'+esc(check.detail)+'</small>':'')+'</div>'+(check.complete?'<span class="status good">Complete</span>':'<a href="'+esc(check.href)+'">'+esc(check.action)+' →</a>')+'</li>').join('')+'</ol><a class="button" href="'+esc(plan.leagueUrl)+'">Open league</a>'
      : '<p>Your setup can be resumed without creating another league.</p><button data-resume="'+esc(plan.id)+'">Continue setup</button>')+'</article>').join('');
  }
  async function load() {
    try {
      let data=await request('/api/beta-access');
      if(pendingInvitation) {
        try { await request('/api/beta-access',{token:pendingInvitation}); }
        catch(error) { if(error.status>=500)throw error;message.textContent=error.message; }
        pendingInvitation=null;
        try { sessionStorage.removeItem(key); } catch { /* Optional browser storage. */ }
        data=await request('/api/beta-access');
      }
      registration.classList.toggle('hidden',!data.invitationAvailable||!data.account.verified);
      access.innerHTML=!data.account.verified
        ? '<h2>Verify your email</h2><p>Open the link in your verification email, then return here.</p><div class="actions"><a class="button" href="/account">Account Settings</a><button class="secondary" data-refresh>Check again</button></div>'
        : data.invitationAvailable ? '<h2>You’re invited</h2><p>Your account is ready. This invitation lets you create one league.</p>'
        : '<h2>Beta access</h2><p>Open an invitation from FranchiseHQ to create a new league. Existing leagues are listed below.</p>';
      render((await request('/api/onboarding')).plans);
    } catch(error) {
      if(error.status===401)access.innerHTML='<h2>Start with your account</h2><p>Your invitation will stay here while you sign in.</p><div class="actions"><a class="button" href="/auth?mode=register&returnTo=%2Fregister-league">Create account</a><a href="/auth?returnTo=%2Fregister-league">Sign in</a></div>';
      else {message.textContent=error.message;message.classList.add('error');access.innerHTML='<button data-refresh>Try again</button>';}
    }
  }
  form.elements.name.addEventListener('input',()=>{if(!form.elements.slug.dataset.edited)form.elements.slug.value=form.elements.name.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,63);});
  form.elements.slug.addEventListener('input',()=>form.elements.slug.dataset.edited='1');
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!form.reportValidity())return;
    const button=form.querySelector('button');button.disabled=true;message.textContent='';
    try {
      const fields=Object.fromEntries(new FormData(form));
      await request('/api/onboarding',{action:'submit',plan:{...fields,gameYear:Number(fields.gameYear),franchiseSeasonYear:Number(fields.franchiseSeasonYear),branding:{primaryColor:fields.primaryColor,secondaryColor:fields.secondaryColor},desiredFeatures:{confidence_pool:fields.confidence_pool==='true',game_of_the_week:fields.game_of_the_week==='true'}}});
      await load();plans.scrollIntoView({behavior:'smooth'});
    }catch(error){message.textContent=error.message;message.classList.add('error');}finally{button.disabled=false;}
  });
  document.addEventListener('click',async event=>{
    const refresh=event.target.closest('[data-refresh]');if(refresh)return load();
    const button=event.target.closest('[data-resume]');if(!button)return;
    button.disabled=true;
    try {await request('/api/onboarding',{action:'resume',planId:button.dataset.resume});await load();}
    catch(error){message.textContent=error.message;}finally{button.disabled=false;}
  });
  load();
})();
