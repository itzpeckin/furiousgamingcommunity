import {
  appendBrowserSessionCookies,
  issueBrowserSession,
  jsonResponse
} from '../../../_lib/auth.js';
import { requireDatabaseSchema } from '../../../_lib/database-schema.js';
import {
  EMAIL_AUTH_RELEASE,
  createEmailCredential,
  emailUserStatements,
  validateEmailRegistration
} from '../../../_lib/email-auth.js';

function response(body,status = 200,session = null) {
  const headers = new Headers({
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-franchisehq-auth-release':EMAIL_AUTH_RELEASE
  });
  if (session) appendBrowserSessionCookies(headers,session);
  return new Response(JSON.stringify(body),{ status,headers });
}

export async function onRequestPost(context) {
  if (!context.env?.DB) return jsonResponse({ ok:false,error:'Account storage is unavailable.' },503);
  try { await requireDatabaseSchema(context.env.DB); }
  catch { return jsonResponse({ ok:false,error:'Account registration is temporarily unavailable.' },503); }
  let body;
  try { body = await context.request.json(); }
  catch { return jsonResponse({ ok:false,error:'A valid registration form is required.' },400); }
  const registration = validateEmailRegistration(body);
  if (!registration.ok) {
    return response({ ok:false,error:'Please correct the highlighted account details.',errors:registration.errors },422);
  }
  const existing = await context.env.DB.prepare(`SELECT 1 AS found FROM user_auth_identities
    WHERE provider='email' AND normalized_email=? LIMIT 1`).bind(registration.email).first();
  if (existing) return response({ ok:false,error:'An account already uses that email address.' },409);
  try {
    const credential = await createEmailCredential(registration.password);
    const creation = emailUserStatements(context.env.DB,{
      email:registration.email,displayName:registration.displayName,credential
    });
    await context.env.DB.batch(creation.statements);
    const session = await issueBrowserSession(context,creation.userId,{ reason:'email-registration' });
    return response({
      ok:true,authenticated:true,release:EMAIL_AUTH_RELEASE,
      user:{ id:creation.userId,displayName:registration.displayName,email:registration.email,authProvider:'email' },
      next:'/register-league'
    },201,session);
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint')) {
      return response({ ok:false,error:'An account already uses that email address.' },409);
    }
    console.error('Email account registration failed',{ errorName:error?.name || 'Error' });
    return response({ ok:false,error:'The account could not be created.' },500);
  }
}
