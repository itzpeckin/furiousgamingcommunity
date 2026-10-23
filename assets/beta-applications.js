(() => {
  'use strict';
  const host=document.querySelector('[data-applications]'),message=document.querySelector('[data-message]');
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let plans=[],busy=false;
  async function request(body) {
    const csrf=decodeURIComponent(document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('franchise_hq_csrf='))?.split('=')[1]||'');
    const response=await fetch('/api/platform/onboarding',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{accept:'application/json',...(body?{'content-type':'application/json','x-franchisehq-csrf':csrf}:{})},body:body?JSON.stringify(body):undefined});
    const result=await response.json();
    if(!response.ok||!result.ok)throw new Error(result.error||'Unable to load applications. Sign in as the platform owner, then try again.');
    return result;
  }
  async function load() {
    plans=(await request()).plans.filter(plan=>plan.configuration?.betaApplicationRequired);
    host.innerHTML=plans.map(plan=>`<article class="card" id="${esc(plan.id)}"><span class="status">${plan.activatedAt?'Approved':plan.status==='cancelled'?'Declined':'Awaiting your approval'}</span><h2>${esc(plan.name)}</h2><p>${esc(plan.initialCommissionerDisplayName)} · /leagues/${esc(plan.slug)}<br>Madden ${Number(plan.gameYear)%100} · Season ${esc(plan.franchiseSeasonYear)} · ${esc(plan.timezone)}<br>Export: ${plan.preferredExportMethod==='ea-direct'?'EA Direct':'Companion App'}</p>${!plan.activatedAt&&plan.status!=='cancelled'?`<p>Email alert: ${esc(plan.configuration.applicationAlert?.state||'pending')}</p><div class="actions"><button data-action="approve" data-id="${esc(plan.id)}">Approve &amp; activate</button><button class="secondary" data-action="cancel" data-id="${esc(plan.id)}">Decline</button>${plan.configuration.applicationAlert?.state!=='sent'?`<button class="secondary" data-action="retry-application-alert" data-id="${esc(plan.id)}">Retry email alert</button>`:''}</div>`:plan.activatedAt?`<a href="/leagues/${esc(plan.slug)}">Open league</a>`:''}</article>`).join('')||'<p>No beta applications yet.</p>';
  }
  document.addEventListener('click',async event=>{
    if(event.target.closest('[data-copy]')) {try{await navigator.clipboard.writeText('https://franchisehq.app/beta-apply');message.textContent='Application link copied.';}catch{message.textContent='Select and copy the link above.';}return;}
    const button=event.target.closest('[data-action],[data-refresh]');if(!button||busy)return;
    busy=true;button.disabled=true;message.textContent='';
    try {
      if(button.dataset.action) {
        let plan=plans.find(p=>p.id===button.dataset.id);if(!plan)throw new Error('Refresh the application list and try again.');
        if(button.dataset.action==='approve') {
          if(!confirm(`Approve ${plan.name} and give ${plan.initialCommissionerDisplayName} commissioner access?`))return;
          plan=(await request({action:'prepare',planId:plan.id,expectedRevision:plan.revision})).plan;
          await request({action:'activate',planId:plan.id,expectedRevision:plan.revision});
          message.textContent='Approved. The commissioner can now open their league from the application page.';
        } else {
          if(button.dataset.action==='cancel'&&!confirm(`Decline ${plan.name}?`))return;
          await request({action:button.dataset.action,planId:plan.id,expectedRevision:plan.revision});
        }
      }
      await load();
    } catch(error){message.textContent=error.message;}finally{busy=false;button.disabled=false;}
  });
  load().then(()=>document.getElementById(location.hash.slice(1))?.scrollIntoView()).catch(error=>message.textContent=error.message);
})();
