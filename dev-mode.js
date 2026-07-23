(() => {
'use strict';
const modal=document.querySelector('[data-dev-modal]');
if(!modal)return;
const getTrade=()=>window.FGC_TRADE;
const app=window.FGC_APP;
function open(){populate();modal.classList.add('is-open');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}
function close(){modal.classList.remove('is-open');modal.setAttribute('aria-hidden','true');document.body.style.overflow='';}
function populate(){const t=getTrade();if(!t)return;const select=modal.querySelector('[data-dev-account]');const current=t.getCurrentAccount();select.innerHTML=t.accounts.map(a=>`<option value="${a.id}" ${a.id===current.id?'selected':''}>${a.handle} — ${a.role==='owner'?(app.teamById(a.teamId)?.abbr+' Owner'):a.role}</option>`).join('');modal.querySelector('[data-dev-commissioner]').checked=current.role==='commissioner';}
document.addEventListener('click',e=>{
 if(e.target.closest('[data-open-dev]')){e.preventDefault();open();return;}
 if(e.target.closest('[data-close-dev]')){e.preventDefault();close();return;}
 const r=e.target.closest('[data-dev-route]');if(r){close();app.setRoute(r.dataset.devRoute);return;}
 if(e.target.closest('[data-dev-open-login]')){close();getTrade()?.openLogin();return;}
 if(e.target.closest('[data-dev-seed]')){if(confirm('Restore the original seeded trade data?')){getTrade()?.resetDemo();app.showToast('Seed data restored','Trades, votes, and demo conversations were reset.');populate();}return;}
 if(e.target.closest('[data-dev-clear]')){if(confirm('Clear all Franchise HQ browser data and reload?')){Object.keys(localStorage).filter(k=>k.startsWith('fgc-')||k.startsWith('m1b-')).forEach(k=>localStorage.removeItem(k));location.reload();}return;}
});
modal.addEventListener('change',e=>{
 if(e.target.matches('[data-dev-account]')){getTrade()?.setUser(e.target.value);populate();return;}
 if(e.target.matches('[data-dev-commissioner]')){getTrade()?.setUser(e.target.checked?'commissioner':(getTrade()?.accounts.find(a=>a.role==='owner')?.id||'commissioner'));populate();}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('is-open'))close();if(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==='d'){e.preventDefault();open();}});
})();


/* TC-011.3.1 — Developer Mode account assumption */
document.addEventListener('click',event=>{
  const trigger=event.target.closest('[data-dev-assume-user]');
  if(!trigger) return;
  event.preventDefault();
  window.FHQ_ASSUME_USER?.(trigger.dataset.devAssumeUser);
});
