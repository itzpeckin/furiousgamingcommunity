import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../assets/account-recovery.js',import.meta.url),'utf8');
function runtime(fetch, timers={setTimeout,clearTimeout}){const window={};vm.runInNewContext(source,{window,document:{cookie:''},fetch,AbortController,...timers});return window.FHQAccountRecovery;}
test('account requests preserve recovery codes and never expose provider bodies',async()=>{
  const app=runtime(async()=>new Response(JSON.stringify({ok:false,code:'EMAIL_LIMIT',error:'private provider details',requestId:'ref-123'}),{status:429}));
  const error=await app.request('/api/auth/account',{action:'verify-email'}).catch(e=>e);
  assert.equal(error.code,'EMAIL_LIMIT');assert.equal(error.requestId,'ref-123');assert.ok(!error.message.includes('private'));assert.match(app.describe(error).text,/one hour/);
});
test('network and timeout mutations require status checks without automatically retrying',async()=>{
  let calls=0;const app=runtime(async()=>{calls++;throw new TypeError('secret provider URL');});
  const error=await app.request('/api/onboarding',{action:'apply'}).catch(e=>e);
  assert.equal(calls,1);assert.equal(error.uncertain,true);assert.equal(app.describe(error,{kind:'onboarding'}).checkBeforeSubmit,true);
  let timer,cleared=false;const timeout=runtime((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout')))),{setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{cleared=true;}});
  const pending=timeout.request('/api/onboarding',{action:'apply'});timer();const failure=await pending.catch(e=>e);assert.equal(failure.uncertain,true);assert.equal(cleared,true);
});
test('unreadable successful responses do not imply that a submission failed',async()=>{
  const app=runtime(async()=>new Response('<html>upstream</html>'));
  const error=await app.request('/api/onboarding',{action:'apply'}).catch(e=>e);
  assert.equal(error.uncertain,true);assert.equal(app.describe(error,{kind:'onboarding'}).checkBeforeSubmit,true);
});
test('sign-in rejection differs from expired session and retains the setup destination',()=>{
  const app=runtime();assert.match(app.describe({status:401},{kind:'login'}).text,/did not match/);
  const expired=app.describe({status:401},{kind:'onboarding',returnTo:'/beta-apply'});assert.match(expired.text,/expired/);assert.equal(expired.actions[0].href,'/auth?returnTo=%2Fbeta-apply');
});
test('expired reset links and wrong-account email links have different recovery',()=>{
  const app=runtime();const expired=app.describe({code:'ACCOUNT_LINK_INVALID'},{purpose:'reset-password'});assert.equal(expired.invalidLink,true);assert.equal(expired.actions[0].href,'/account?mode=reset');
  const wrong=app.describe({code:'ACCOUNT_LINK_SESSION'},{purpose:'link-email'});assert.match(wrong.text,/same FHQ account/);assert.equal(wrong.invalidLink,undefined);
});
test('onboarding recovery directs existing applications to status instead of new creation',()=>{
  const app=runtime();for(const code of ['ONBOARDING_PREPARATION_INCOMPLETE','ONBOARDING_CHANGED','ONBOARDING_LIMIT','LEAGUE_URL_RESERVED','ONBOARDING_CANCELLED'])assert.ok(app.describe({code},{kind:'onboarding'}).actions.some(a=>a.action==='refresh'),code);
  assert.equal(app.describe({code:'ACCOUNT_VERIFICATION_REQUIRED'}).actions[0].href,'/account');
});
