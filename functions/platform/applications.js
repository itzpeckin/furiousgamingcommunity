import { requirePlatformOwner } from '../_lib/permissions.js';
import { redirectResponse } from '../_lib/auth.js';

export async function onRequestGet(context) {
  const authorization = await requirePlatformOwner(context);
  if (!authorization.authorized) return authorization.response.status===401
    ? redirectResponse('/auth?returnTo=%2Fplatform%2Fapplications') : authorization.response;
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Beta applications | FranchiseHQ</title><link rel="stylesheet" href="/assets/account.css"></head><body><main class="account-shell"><nav><a href="/platform-admin">Platform administration</a><a href="/platform/invitations">Direct invitations</a></nav><span class="eyebrow">Platform owner</span><h1>Beta league applications</h1><p>Share the application link. Commissioners register their own details; only your approval makes a league operational.</p><section class="card"><label class="field">Shareable application link<input readonly value="https://franchisehq.app/beta-apply" aria-label="Beta application link"></label><button data-copy>Copy application link</button></section><div class="actions"><button data-refresh>Refresh applications</button></div><p role="status" data-message></p><section data-applications>Loading applications…</section></main><script src="/assets/beta-applications.js" defer></script></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'}});
}
