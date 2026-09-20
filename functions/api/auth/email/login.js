import {
  appendBrowserSessionCookies,
  issueBrowserSession,
  jsonResponse
} from '../../../_lib/auth.js';
import { requireDatabaseSchema } from '../../../_lib/database-schema.js';
import {
  EMAIL_AUTH_RELEASE,
  normalizeEmail,
  verifyEmailCredential
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
  catch { return jsonResponse({ ok:false,error:'Email sign-in is temporarily unavailable.' },503); }
  let body;
  try { body = await context.request.json(); }
  catch { return response({ ok:false,error:'A valid sign-in form is required.' },400); }
  const email = normalizeEmail(body?.email);
  const password = String(body?.password || '');
  const identity = email && password ? await context.env.DB.prepare(`SELECT
      identity.user_id,identity.password_hash,identity.password_salt,identity.password_iterations,
      users.display_name
    FROM user_auth_identities identity
    INNER JOIN users ON users.id=identity.user_id
    WHERE identity.provider='email' AND identity.normalized_email=? LIMIT 1`).bind(email).first() : null;
  // Run the same password work even when the address is unknown so the route
  // does not reveal registered accounts through response timing.
  const verified = await verifyEmailCredential(password,identity || {
    password_iterations:600000,
    password_salt:'000102030405060708090a0b0c0d0e0f',
    password_hash:'0000000000000000000000000000000000000000000000000000000000000000'
  });
  const valid = Boolean(identity) && verified;
  if (!valid) return response({ ok:false,error:'The email address or password is incorrect.' },401);
  try {
    const session = await issueBrowserSession(context,identity.user_id,{ reason:'email-login' });
    await context.env.DB.batch([
      context.env.DB.prepare(`UPDATE user_auth_identities
        SET last_authenticated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
        WHERE provider='email' AND user_id=?`).bind(identity.user_id),
      context.env.DB.prepare(`UPDATE users SET last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
        WHERE id=?`).bind(identity.user_id)
    ]);
    return response({
      ok:true,authenticated:true,release:EMAIL_AUTH_RELEASE,
      user:{ id:identity.user_id,displayName:identity.display_name,email,authProvider:'email' },
      next:'/leagues'
    },200,session);
  } catch (error) {
    console.error('Email account sign-in failed',{ errorName:error?.name || 'Error' });
    return response({ ok:false,error:'The account could not be signed in.' },500);
  }
}
