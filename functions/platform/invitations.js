import { requirePlatformOwner } from '../_lib/permissions.js';

export async function onRequestGet(context) {
  const auth = await requirePlatformOwner(context);
  if (!auth.authorized) return auth.response;
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Beta invitations | FranchiseHQ</title><link rel="stylesheet" href="/assets/account.css"></head><body><main class="account-shell"><nav><a href="/leagues">← Your leagues</a><a href="/account">Account Settings</a></nav><span class="eyebrow">Platform owner</span><h1>Beta invitations</h1><p>Give a commissioner access to create one league. Each invitation expires after 14 days.</p><section class="card"><form data-invite-form><label class="field">Invitation label<input name="label" maxlength="100" placeholder="Commissioner or league name" required></label><button>Create invitation</button></form><div data-created></div></section><p class="notice" role="status" data-message></p><section data-invitations>Loading invitations…</section></main><script src="/assets/beta-invitations.js" defer></script></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'}});
}
