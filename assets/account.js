(() => {
  const content = document.querySelector('[data-account-content]');
  const message = document.querySelector('[data-account-message]');
  const fragment = new URLSearchParams(location.hash.slice(1));
  const purpose = fragment.get('action');
  const token = fragment.get('token');
  if (token) history.replaceState(null,'',location.pathname);
  const esc = value => String(value || '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const csrf = () => decodeURIComponent(document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('franchise_hq_csrf='))?.split('=')[1] || '');
  const say = (text,error = false) => { message.textContent=text;message.classList.toggle('error',error); };
  async function request(body) {
    const response = await fetch('/api/auth/account',{ method:body ? 'POST':'GET',credentials:'same-origin',cache:'no-store',
      headers:{ accept:'application/json',...(body ? { 'content-type':'application/json','x-franchisehq-csrf':csrf() } : {}) },body:body ? JSON.stringify(body) : undefined });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw Object.assign(new Error(payload.error || 'The account request could not be completed.'),{ status:response.status });
    return payload;
  }
  const passwordField = '<label class="field">New password<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>';
  function resetForm() {
    content.innerHTML='<h2>Forgot your password?</h2><p>Enter your account email to request a reset link.</p><form data-action="request-reset"><label class="field">Email address<input type="email" name="email" autocomplete="email" required maxlength="254"></label><button>Send reset link</button></form><p class="small">Use Discord sign-in if you haven’t added an email and password.</p><a href="/auth">Back to sign in</a>';
  }
  async function load() {
    content.setAttribute('aria-busy','false');
    if (token) {
      const reset=purpose === 'reset-password';
      content.innerHTML='<h2>'+ (reset ? 'Choose a new password' : 'Confirm your email')+'</h2><p>'+(reset ? 'Other signed-in sessions will be signed out.' : 'Confirm to finish verifying this email address.')+'</p><form data-action="confirm">'+(reset ? passwordField : '')+'<button>'+(reset ? 'Reset password' : 'Confirm email')+'</button></form>';
      return;
    }
    if (new URLSearchParams(location.search).get('mode') === 'reset') return resetForm();
    try {
      const data = await request();
      content.innerHTML='<h2>'+esc(data.user.displayName)+'</h2>'+(data.user.email
        ? '<p>'+esc(data.user.email)+'</p><span class="status '+(data.account.emailVerified ? 'good':'')+'">'+(data.account.emailVerified ? 'Email verified':'Email verification needed')+'</span><div class="actions">'+(!data.account.emailVerified ? '<button data-action="verify-email">Send verification email</button>':'')+'<a href="/account?mode=reset">Reset password</a></div>'
        : '<p>Add email sign-in to this account. Your league memberships stay with the same account.</p><form data-action="link-email"><label class="field">Email address<input type="email" name="email" autocomplete="email" maxlength="254" required></label>'+passwordField+'<button>Add email sign-in</button></form>')
        +'<hr><h2>Discord</h2>'+(data.account.discordLinked ? '<span class="status good">Connected</span>' : '<p>Optional. Connect Discord to identify your team in league bot commands.</p><button data-action="link-discord">Connect Discord</button>');
    } catch (error) {
      if (error.status === 401) content.innerHTML='<h2>Sign in to manage your account</h2><div class="actions"><a class="button" href="/auth?returnTo=%2Faccount">Sign in</a><a href="/account?mode=reset">Forgot password?</a></div>';
      else say(error.message,true);
    }
  }
  async function run(action,fields,button) {
    button.disabled=true;say('');
    try {
      const data=await request({ action,...fields,...(action === 'confirm' ? { purpose,token } : {}) });
      if (data.redirectUrl) return location.assign(data.redirectUrl);
      if (action === 'confirm') {
        content.innerHTML=purpose === 'reset-password' ? '<h2>Password updated</h2><a class="button" href="/auth">Sign in</a>' : '<h2>Email verified</h2><div class="actions"><a class="button" href="/register-league">Continue league setup</a><a href="/account">Account Settings</a></div>';
      } else say(data.message || 'Account updated.');
    } catch(error) { say(error.message,true); }
    finally { button.disabled=false; }
  }
  content.addEventListener('submit',event=>{ const form=event.target.closest('form[data-action]');if(!form)return;event.preventDefault();if(form.reportValidity())run(form.dataset.action,Object.fromEntries(new FormData(form)),form.querySelector('button')); });
  content.addEventListener('click',event=>{ const button=event.target.closest('button[data-action]');if(button)run(button.dataset.action,{},button); });
  load();
})();
