/* Shared account recovery. Never display raw network/provider errors or account tokens. */
(() => {
  const csrf = () => decodeURIComponent(document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('franchise_hq_csrf='))?.split('=')[1] || '');
  async function request(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(path, {method:body ? 'POST':'GET', credentials:'same-origin', cache:'no-store', signal:controller.signal,
        headers:{accept:'application/json', ...(body ? {'content-type':'application/json','x-franchisehq-csrf':csrf()} : {})}, body:body ? JSON.stringify(body):undefined});
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw Object.assign(new Error('Account request failed'), {
        status:response.status, code:payload?.code, details:response.status===422 ? (payload?.errors || [payload?.error]).filter(v=>typeof v==='string').join(' '):'',
        requestId:/^[a-zA-Z0-9_-]{1,100}$/.test(payload?.requestId || '') ? payload.requestId : null,
        uncertain:Boolean(body) && (response.status>=500 || response.ok), retryAfter:payload?.retryAfterSeconds
      });
      return payload;
    } catch(error) {
      if (error.status) throw error;
      throw Object.assign(new Error('Connection interrupted'), {code:'CONNECTION_INTERRUPTED', uncertain:Boolean(body)});
    } finally { clearTimeout(timer); }
  }
  function describe(error, {kind='account', returnTo='/account', purpose, action} = {}) {
    const signIn={label:'Sign in',href:'/auth?returnTo='+encodeURIComponent(returnTo)};
    const account={label:'Account Settings',href:'/account'};
    const reset={label:'Request a new reset link',href:'/account?mode=reset'};
    const status={label:'Check application status',action:'refresh'};
    const result=(text,actions=[],extra={})=>({text,actions,...extra});
    if (error.code==='ACCOUNT_EMAIL_REQUIRED') return result('Add an email address in Account Settings first, then open the confirmation email while signed in to this account.',[account]);
    if (error.code==='ACCOUNT_EMAIL_EXISTS') return result('This account already has email sign-in. Open Account Settings to see the current address. Use Reset password if you cannot sign in with it.',[account,reset]);
    if (error.code==='DISCORD_LINK_UNAVAILABLE') return result('FHQ cannot start the Discord connection right now. Your FHQ account is still available. Return to Account Settings and try Connect Discord later.',[account]);
    if (error.code==='ACCOUNT_LINK_SESSION') return result('Open this email link again after signing in to the same FHQ account that requested the email connection. If another account is signed in, sign out from Your leagues first.',[signIn,{label:'Your leagues',href:'/leagues'}]);
    if (error.code==='ACCOUNT_LINK_INVALID') return result(purpose==='reset-password' ? 'This reset link has expired, was already used, or was replaced by a password change. Sign in with your current password or request a new link.' : 'This email link is no longer valid. Open Account Settings to check whether your email is already verified or request a new email.',purpose==='reset-password' ? [reset,signIn]:[account],{invalidLink:true});
    if (error.code==='EMAIL_LIMIT') return result('Too many email requests. Check your inbox and spam folder for an existing link. Wait up to one hour before requesting another.',[account]);
    if (error.status===429) return result('FHQ has temporarily limited repeated requests. Wait a few minutes before trying again. Your entered details are still on this page.');
    if (error.code==='EMAIL_UNAVAILABLE') return result('FHQ could not confirm email delivery. Check your inbox and spam folder first. If no email arrives, return here and try again later. You do not need to create another account.',[{label:'Back to sign in',href:'/auth'},account]);
    if (error.code==='ACCOUNT_VERIFICATION_REQUIRED') return result('Verify your email before continuing. Open Account Settings, select Send verification email, and follow the link. Then return here and check your access again.',[account,status]);
    if (error.code==='BETA_INVITATION_REQUIRED' || error.code==='BETA_INVITATION_INVALID') return result('This invitation cannot be used by this account. Check that you signed in with the invited account, or ask the person who invited you for a new link. Existing applications can still be checked below.',[status,{label:'Apply for beta access',href:'/beta-apply'}]);
    if (error.code==='LEAGUE_URL_RESERVED') return result('That league URL is already reserved. Check your applications below first. If this is a different league, choose another League URL name and submit again.',[status]);
    if (error.code==='ONBOARDING_LIMIT') return result('You already have three applications awaiting review. Check their status below and continue an existing application.',[status]);
    if (error.code==='ONBOARDING_CANCELLED') return result('This application was declined or cancelled. Contact the person who invited you before applying again.',[status]);
    if (error.code==='ONBOARDING_PREPARATION_INCOMPLETE' || error.code==='ONBOARDING_CHANGED') return result('Your league setup is saved but is not finished. Check application status, then select Continue setup on the existing league. Do not create another league.',[status]);
    if (error.status===401 && kind==='login') return result('The email address or password did not match. Check both and try again, or reset your password. If you joined using Discord, use Continue with Discord.',[reset]);
    if (error.status===401) return result('Your FHQ sign-in has expired. Sign in again with the same account, then return here to continue.',[signIn]);
    if (error.status===403) return result('FHQ could not verify this session or its access. Sign in again with the account that started this setup. Your saved application will remain available.',[signIn]);
    if (error.code==='EMAIL_ALREADY_LINKED' || (kind==='register' && error.status===409)) return result('That email already has an FHQ account. Sign in to that account or reset its password.',[signIn,reset]);
    if (error.status===422) return result(error.details || 'Check the required fields and correct the highlighted information, then try again.');
    if (kind==='onboarding' && (error.uncertain || error.status===409 || error.status===404)) return result('FHQ could not confirm the last setup step. Your application may already be saved. Check application status before submitting again, then continue the existing league if it appears.',[status],{checkBeforeSubmit:true});
    if (kind==='register' && error.uncertain) return result('FHQ could not confirm account creation. Your account may already exist. Try signing in with the email and password you just entered before creating it again.',[signIn,reset]);
    if (action==='confirm' && error.uncertain) return result('FHQ could not confirm the update. It may have completed. Check Account Settings or try signing in with your new password before requesting another link.',[account,signIn]);
    if (error.uncertain && ['verify-email','request-reset','link-email'].includes(action)) return result('FHQ could not confirm the email request. Check your inbox and spam folder before requesting another link.',[account]);
    return result(error.code==='CONNECTION_INTERRUPTED' ? 'The connection to FHQ was interrupted. Check your internet connection, then try again. Your entered details are still on this page.' : 'FHQ is temporarily unable to complete this request. Try again shortly. If it continues, share this message and the time with FranchiseHQ support.',kind==='onboarding' || kind==='account' && !action ? [{label:kind==='onboarding' ? 'Check application status':'Reload account',action:'refresh'}]:[]);
  }
  function show(target,error,context,onAction) {
    const recovery=describe(error,context);
    target.replaceChildren(); target.classList.add('error');
    const text=document.createElement('span');text.textContent=recovery.text;target.append(text);
    if(error.requestId){const ref=document.createElement('small');ref.textContent=' Support reference: '+error.requestId;target.append(ref);}
    const actions=document.createElement('div');actions.className='actions';
    for(const item of recovery.actions){const el=document.createElement(item.href?'a':'button');el.textContent=item.label;if(item.href)el.href=item.href;else{el.type='button';el.addEventListener('click',()=>onAction?.(item.action));}actions.append(el);}
    target.append(actions);return recovery;
  }
  window.FHQAccountRecovery={request,describe,show};
})();
