import { getCurrentSession, redirectResponse } from '../_lib/auth.js';

const RELEASE = '8.0.1';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[character]));
}

function safeReturnTo(value,fallback = '/leagues') {
  const target = String(value || fallback);
  return target.startsWith('/') && !target.startsWith('//') ? target : fallback;
}

function page({ mode,returnTo }) {
  const register = mode === 'register';
  const encodedReturn = encodeURIComponent(returnTo);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#05080d"><title>${register ? 'Create account' : 'Sign in'} | FranchiseHQ</title>
  <style>
  :root{color-scheme:dark;--bg:#05080d;--panel:#0d151f;--line:rgba(116,155,214,.22);--text:#f7f9fc;--muted:#9cabc0;--blue:#0878ff;--danger:#ff8e9a}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}body{display:grid;place-items:center;padding:28px;background:radial-gradient(circle at 50% 15%,rgba(0,119,255,.18),transparent 34rem),#05080d}.shell{width:min(470px,100%)}.brand{display:block;text-align:center;margin-bottom:24px;color:white;text-decoration:none;font-weight:950;letter-spacing:.05em;font-size:20px}.brand span{color:#1698ff}.card{border:1px solid var(--line);border-radius:22px;background:rgba(13,21,31,.94);padding:30px;box-shadow:0 24px 80px rgba(0,0,0,.4)}.eyebrow{color:#75c6ff;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}h1{margin:9px 0 8px;font-size:32px;letter-spacing:-.035em}p{color:var(--muted);line-height:1.55;margin:0 0 22px}.tabs{display:grid;grid-template-columns:1fr 1fr;padding:4px;background:#070c13;border:1px solid var(--line);border-radius:12px;margin-bottom:22px}.tabs a{padding:10px;text-align:center;color:var(--muted);text-decoration:none;font-weight:850;border-radius:9px}.tabs a.active{background:#152234;color:white}.field{display:grid;gap:7px;margin:14px 0}.field span{font-size:12px;font-weight:800;color:#cbd7e8}.field input{width:100%;border:1px solid rgba(140,173,220,.24);border-radius:11px;background:#080e16;color:white;padding:13px 14px;font:inherit}.field input:focus{outline:2px solid rgba(8,120,255,.42);border-color:#258cff}.button{width:100%;min-height:49px;border:0;border-radius:11px;background:linear-gradient(135deg,#0878ff,#0062e8);color:white;font:inherit;font-weight:900;cursor:pointer;margin-top:10px}.button:disabled{opacity:.58;cursor:wait}.divider{display:flex;align-items:center;gap:12px;color:#65758b;font-size:11px;margin:22px 0}.divider:before,.divider:after{content:"";height:1px;background:var(--line);flex:1}.discord{display:flex;justify-content:center;align-items:center;min-height:47px;border:1px solid rgba(174,188,255,.22);border-radius:11px;color:#e9edff;text-decoration:none;font-weight:850;background:rgba(88,101,242,.13)}.notice{min-height:20px;margin-top:14px;color:var(--danger);font-size:13px;line-height:1.45}.fine{margin:18px 0 0;color:#718096;font-size:12px;text-align:center}.back{display:block;text-align:center;color:#8fa8c6;text-decoration:none;font-size:13px;margin-top:18px}@media(max-width:520px){body{padding:16px}.card{padding:23px 18px;border-radius:17px}h1{font-size:29px}}
  </style></head><body><main class="shell"><a class="brand" href="/">FRANCHISE<span>HQ</span></a><section class="card"><span class="eyebrow">FranchiseHQ account</span><h1>${register ? 'Create your account' : 'Welcome back'}</h1><p>${register ? 'Create a FranchiseHQ account with email. Discord is optional and can be connected later if your league uses the bot.' : 'Sign in with email, or continue with Discord if that is how your account was created.'}</p>
  <nav class="tabs"><a href="/auth?mode=login&returnTo=${encodedReturn}" class="${register ? '' : 'active'}">Sign in</a><a href="/auth?mode=register&returnTo=${encodedReturn}" class="${register ? 'active' : ''}">Create account</a></nav>
  <form data-auth-form data-mode="${register ? 'register' : 'login'}">
    ${register ? '<label class="field"><span>Display name</span><input name="displayName" autocomplete="name" minlength="2" maxlength="80" required></label>' : ''}
    <label class="field"><span>Email address</span><input type="email" name="email" autocomplete="email" maxlength="254" required></label>
    <label class="field"><span>Password</span><input type="password" name="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="12" maxlength="128" required></label>
    <button class="button" type="submit">${register ? 'Create account' : 'Sign in'}</button><div class="notice" role="alert" data-auth-error></div>
  </form><div class="divider">OR</div><a class="discord" href="/api/auth/discord/login?returnTo=${encodedReturn}${register ? '&intent=create-league' : ''}">Continue with Discord</a><p class="fine">Your league login is separate from any optional Discord server connection.</p></section><a class="back" href="/">← Back to FranchiseHQ</a></main>
  <script>
  (()=>{const form=document.querySelector('[data-auth-form]'),error=document.querySelector('[data-auth-error]'),returnTo=${JSON.stringify(returnTo)};const csrf=()=>{const item=document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('franchise_hq_csrf='));return item?decodeURIComponent(item.slice(item.indexOf('=')+1)):''};form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;const button=form.querySelector('button');button.disabled=true;error.textContent='';const data=Object.fromEntries(new FormData(form));try{const token=csrf();const response=await fetch('/api/auth/email/'+form.dataset.mode,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json',...(token?{'x-franchisehq-csrf':token}:{})},body:JSON.stringify(data)});const payload=await response.json().catch(()=>({}));if(!response.ok||!payload.ok)throw new Error((payload.errors||[]).join(' ')||payload.error||'The account request could not be completed.');location.assign(returnTo)}catch(reason){error.textContent=reason.message}finally{button.disabled=false}})})();
  </script></body></html>`;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'),'/leagues');
  const session = await getCurrentSession(context).catch(() => null);
  if (session) return redirectResponse(returnTo);
  const mode = url.searchParams.get('mode') === 'register' ? 'register' : 'login';
  return new Response(page({ mode,returnTo }),{ status:200,headers:{
    'content-type':'text/html; charset=utf-8','cache-control':'no-store',
    'x-franchisehq-release':RELEASE,'x-franchisehq-surface':'provider-authentication'
  }});
}
