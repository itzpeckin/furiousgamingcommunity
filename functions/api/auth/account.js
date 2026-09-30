import { getCurrentSession,jsonResponse,appendClearedBrowserSessionCookies } from '../../_lib/auth.js';
import { requireDatabaseSchema } from '../../_lib/database-schema.js';
import { createEmailCredential,normalizeEmail,validateEmailRegistration } from '../../_lib/email-auth.js';
import { consumeAccountAction,sendAccountAction,reserveAccountEmail } from '../../_lib/account-actions.js';
import { accountReadiness } from '../../_lib/beta-access.js';
import { beginDiscordLink } from '../../_lib/account-discord-link.js';

async function emailIdentity(db,userId) {
  return db.prepare(`SELECT * FROM user_auth_identities WHERE user_id=? AND provider='email'`).bind(userId).first();
}

export async function onRequestGet(context) {
  const session = await getCurrentSession(context);
  if (!session) return jsonResponse({ ok:false,error:'Sign in to manage your account.' },401);
  await requireDatabaseSchema(context.env.DB);
  const identity = await emailIdentity(context.env.DB,session.user.id);
  return jsonResponse({ ok:true,user:{ displayName:session.user.displayName,email:identity?.normalized_email || null },
    account:await accountReadiness(context.env.DB,session.user.id),emailAvailable:Boolean(context.env.ACCOUNT_EMAIL?.fetch) });
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  await requireDatabaseSchema(db);
  let body;
  try { body = await context.request.json(); }
  catch { return jsonResponse({ ok:false,error:'A valid account request is required.' },400); }
  const session = await getCurrentSession(context);
  const action = String(body.action || '');
  if (action === 'confirm') {
    const result = await consumeAccountAction(db,{ token:body.token,purpose:body.purpose,password:body.password,userId:session?.user.id });
    if (result.ok && body.purpose === 'reset-password') {
      const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
      appendClearedBrowserSessionCookies(headers);
      return new Response(JSON.stringify({ok:true}),{headers});
    }
    return jsonResponse(result.ok ? { ok:true } : { ok:false,error:result.error || 'This link has expired or has already been used. Request a new link.' },result.ok ? 200 : 400);
  }
  if (action === 'request-reset') {
    if (!context.env.ACCOUNT_EMAIL?.fetch) return jsonResponse({ ok:false,error:'Email recovery is temporarily unavailable. Please try again later.' },503);
    const email = normalizeEmail(body.email);
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}$/.test(email)) return jsonResponse({ ok:false,error:'Enter a valid email address.' },422);
    const identity = await db.prepare(`SELECT * FROM user_auth_identities WHERE normalized_email=? AND provider='email'`).bind(email).first();
    const delivery = (identity ? sendAccountAction(context,{ userId:identity.user_id,purpose:'reset-password',identity,email }) : reserveAccountEmail(db,email)).catch(()=>{});
    if (context.waitUntil) context.waitUntil(delivery);
    else await delivery;
    return jsonResponse({ ok:true,message:'If an email account matches that address, a password-reset link will arrive shortly. Check your spam folder too.' });
  }
  if (!session) return jsonResponse({ ok:false,error:'Sign in to manage your account.' },401);
  const userId = session.user.id;
  if (action === 'link-discord') {
    const link = await beginDiscordLink(context,userId);
    if (!link) return jsonResponse({ ok:false,error:'Discord sign-in is temporarily unavailable.' },503);
    return jsonResponse({ ok:true,redirectUrl:link.redirectUrl },200,{ 'set-cookie':link.cookie });
  }
  const identity = await emailIdentity(db,userId);
  if (action === 'verify-email') {
    if (!identity) return jsonResponse({ ok:false,error:'Add an email address first.' },409);
    if (Number(identity.email_verified)) return jsonResponse({ ok:true,message:'Your email is already verified.' });
    const result = await sendAccountAction(context,{ userId,purpose:'verify-email',identity,email:identity.normalized_email });
    return jsonResponse({ ok:result.sent,message:result.sent ? 'Check your inbox for a verification link.' : undefined,
      error:result.sent ? undefined : result.code === 'EMAIL_LIMIT' ? 'Too many email requests. Please try again in an hour.' : 'The email could not be sent. Please try again later.' },result.sent ? 200 : 503);
  }
  if (action === 'link-email') {
    if (identity) return jsonResponse({ ok:false,error:'This account already has an email sign-in.' },409);
    const validation = validateEmailRegistration({ email:body.email,password:body.password,displayName:session.user.displayName || 'FHQ Member' });
    if (!validation.ok) return jsonResponse({ ok:false,error:validation.errors.join(' ') },422);
    const existing = await db.prepare(`SELECT id FROM user_auth_identities WHERE provider='email' AND normalized_email=?`).bind(validation.email).first();
    if (existing) return jsonResponse({ ok:false,error:'That email is already linked to an account. Sign in to that account instead.' },409);
    const credential = await createEmailCredential(validation.password);
    const result = await sendAccountAction(context,{ userId,purpose:'link-email',email:validation.email,payload:{ email:validation.email,credential } });
    return jsonResponse({ ok:result.sent,message:result.sent ? 'Check your inbox and open the link while signed in to this account.' : undefined,
      error:result.sent ? undefined : 'The email could not be sent. Please try again later.' },result.sent ? 200 : 503);
  }
  return jsonResponse({ ok:false,error:'Unsupported account action.' },400);
}
