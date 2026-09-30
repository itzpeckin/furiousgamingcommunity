import { getCurrentSession,appendClearedBrowserSessionCookies } from '../_lib/auth.js';
export async function onRequestGet(context) {
  const headers=new Headers({ 'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer' });
  if (!await getCurrentSession(context)) appendClearedBrowserSessionCookies(headers);
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Account Settings | FranchiseHQ</title><link rel="stylesheet" href="/assets/account.css"></head><body><main class="account-shell"><nav><a href="/leagues">← Your leagues</a><a href="/register-league">Set up a league</a></nav><span class="eyebrow">FranchiseHQ</span><h1>Account Settings</h1><p>Manage your sign-in and account verification.</p><section class="card" data-account-content aria-busy="true">Loading your account…</section><p class="notice" role="status" aria-live="polite" data-account-message></p></main><script src="/assets/account.js" defer></script></body></html>`,{ headers });
}
