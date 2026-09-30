(() => {
  const form=document.querySelector('[data-invite-form]'),message=document.querySelector('[data-message]'),list=document.querySelector('[data-invitations]'),created=document.querySelector('[data-created]');
  const esc=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const csrf=()=>decodeURIComponent(document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('franchise_hq_csrf='))?.split('=')[1]||'');
  let inviteUrl='';
  async function request(body) {
    const response=await fetch('/api/platform/beta-invitations',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{accept:'application/json',...(body?{'content-type':'application/json','x-franchisehq-csrf':csrf()}:{})},body:body?JSON.stringify(body):undefined});
    const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'The invitation request failed.');return data;
  }
  async function load() {
    const data=await request();
    list.innerHTML=data.invitations.map(item=>'<article class="card"><h2>'+esc(item.label||'Beta invitation')+'</h2><p>'+esc(item.revoked_at?'Revoked':item.activated_at?'League active':item.plan_id?'League reserved':item.claimed_at?'Claimed by '+item.claimed_by_name:Date.parse(item.expires_at)<Date.now()?'Expired':'Available')+' · Expires '+esc(new Date(item.expires_at).toLocaleDateString())+'</p>'+(!item.revoked_at&&!item.activated_at?'<button class="secondary" data-revoke="'+esc(item.id)+'">Revoke unused access</button>':'')+'</article>').join('')||'<p>No invitations yet.</p>';
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!form.reportValidity())return;const button=form.querySelector('button');button.disabled=true;message.textContent='';
    try {const data=await request({action:'create',label:form.elements.label.value});inviteUrl='https://franchisehq.app'+data.invitation.invitePath;created.innerHTML='<label class="field">Invitation link<input readonly data-invite-url></label><button class="secondary" data-copy>Copy invitation</button><p class="small">Copy this link now and share it with your commissioner. It is only shown once.</p>';created.querySelector('input').value=inviteUrl;await load();}
    catch(error){message.textContent=error.message;}finally{button.disabled=false;}
  });
  document.addEventListener('click',async event=>{
    const copy=event.target.closest('[data-copy]');if(copy){try{await navigator.clipboard.writeText(inviteUrl);message.textContent='Invitation copied.';}catch{created.querySelector('input').select();message.textContent='Select and copy the invitation link.';}return;}
    const button=event.target.closest('[data-revoke]');if(!button)return;button.disabled=true;
    try{await request({action:'revoke',id:button.dataset.revoke});await load();message.textContent='Unused access revoked. Active leagues keep their access.';}
    catch(error){message.textContent=error.message;}finally{button.disabled=false;}
  });
  load().catch(error=>message.textContent=error.message);
})();
