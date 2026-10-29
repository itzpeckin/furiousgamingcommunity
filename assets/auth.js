(() => {
  const form=document.querySelector('[data-auth-form]'),message=document.querySelector('[data-auth-error]');
  const recovery=window.FHQAccountRecovery;
  let busy=false;
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy || !form.reportValidity())return;
    busy=true;const button=form.querySelector('button');button.disabled=true;message.textContent='';
    try {
      await recovery.request('/api/auth/email/'+form.dataset.mode,Object.fromEntries(new FormData(form)));
      location.assign(form.dataset.returnTo);
    } catch(error) {recovery.show(message,error,{kind:form.dataset.mode,returnTo:form.dataset.returnTo});}
    finally {busy=false;button.disabled=false;}
  });
})();
