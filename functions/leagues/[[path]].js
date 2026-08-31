import { onRequestGet as renderLeagueSelector } from "./index.js";
import { AUTH_CONSTANTS, createSecureCookie, getCurrentSession, redirectResponse } from "../_lib/auth.js";
import { CANONICAL_APP_ORIGIN, isOwnerFallbackHost } from "../_lib/origin.js";
import { isOwnerFallbackIdentity } from "../_lib/owner-fallback.js";
import { resolveTenant } from "../_lib/tenant-context.js";

const RELEASE='7.3.6';

const STATIC_ROOTS=new Set([
  'styles.css','auth-client.js','auth-ui.js','dev-mode.js','trade-module.js',
  'platform','app','trade','league-engine','assets','images','fonts','favicon.ico'
]);

function pathParts(request){
  const url=new URL(request.url);
  return url.pathname.replace(/^\/leagues\/?/,'').split('/').filter(Boolean);
}

function isStaticAsset(parts){
  if(!parts.length)return false;
  const first=parts[0];
  if(STATIC_ROOTS.has(first))return true;
  return /\.(?:css|js|mjs|json|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|map)$/i.test(parts[parts.length-1]);
}

async function fetchStatic(context, request, pathname){
  const source=new URL(request.url);
  const target=new URL(pathname,source.origin);
  const assetRequest=new Request(target.toString(),{method:'GET',headers:{accept: request.headers.get('accept')||'*/*'}});
  // Cloudflare Pages exposes static deployment files through ASSETS. Using it
  // avoids recursively sending /index.html back through Functions routing.
  const response=context.env?.ASSETS?.fetch
    ? await context.env.ASSETS.fetch(assetRequest)
    : await fetch(assetRequest);
  return response;
}

async function fetchRootAsset(context,request,relativePath){
  const response=await fetchStatic(context,request,'/'+relativePath.replace(/^\/+/,''));
  const headers=new Headers(response.headers);
  headers.set('x-fhq-route-fix',RELEASE);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function fetchSpaShell(context,request,session=null){
  const response=await fetchStatic(context,request,'/index.html');
  let html=await response.text();
  // Force the legacy SPA's relative CSS/JS/image URLs to resolve from the
  // deployment root even while the browser remains at /leagues/{slug}.
  if(!/<base\s/i.test(html)) html=html.replace(/<head([^>]*)>/i,'<head$1><base href="/">');
  if(session){
    const bootstrap=JSON.stringify({
      authenticated:true,
      user:session.user||null,
      membership:session.membership||null,
      session:{expiresAt:session.expiresAt||null}
    }).replace(/</g,'\u003c');
    html=html.replace(/<\/head>/i,`<script>window.__FHQ_AUTH_BOOTSTRAP__=${bootstrap};</script></head>`);
  }
  const headers=new Headers(response.headers);
  headers.set('content-type','text/html; charset=UTF-8');
  headers.set('cache-control','no-store');
  headers.set('x-fhq-route-fix',RELEASE);
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

function escapeHtml(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function renderPendingPage(session,league){
  const name=escapeHtml(session?.user?.displayName||session?.user?.discordGlobalName||session?.user?.discordUsername||'Discord User');
  const leagueName=escapeHtml(league?.name||league?.slug||'this league');
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Membership Pending · FranchiseHQ</title><style>body{margin:0;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#070b14;color:#f7f9ff;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}.card{width:min(620px,100%);background:#101725;border:1px solid #27324a;border-radius:22px;padding:32px;box-shadow:0 24px 80px rgba(0,0,0,.35)}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.13em;color:#7da7ff;font-weight:800}.pill{display:inline-flex;margin-top:18px;padding:7px 11px;border-radius:999px;background:#342a12;color:#ffd36a;border:1px solid #6f5722;font-size:12px;font-weight:800}h1{font-size:30px;margin:10px 0 12px}p{color:#b6c1d5;line-height:1.6}.user{margin:24px 0;padding:16px;border-radius:14px;background:#0a101c;border:1px solid #202b40}.user strong{display:block}.user span{color:#8fa0bb;font-size:13px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}.actions form{margin:0}.btn{display:inline-flex;text-decoration:none;color:white;padding:11px 16px;border-radius:10px;border:1px solid #33425f;font:inherit;font-weight:700;background:transparent;cursor:pointer}.primary{background:#356df3;border-color:#356df3}</style></head><body><main class="card"><span class="eyebrow">${leagueName}</span><h1>Your Discord account is connected.</h1><span class="pill">Waiting for commissioner assignment</span><div class="user"><strong>${name}</strong><span>Pending league member</span></div><p>A commissioner now needs to assign your team and league role. Once they activate your membership, this same league link will take you directly into Franchise HQ.</p><div class="actions"><a class="btn primary" href="/leagues/${encodeURIComponent(league.slug)}">Check Again</a><a class="btn" href="/leagues">My Leagues</a><form method="post" action="/api/auth/logout"><button class="btn" type="submit">Log Out</button></form></div></main></body></html>`,{status:200,headers:{'content-type':'text/html; charset=UTF-8','cache-control':'no-store','x-fhq-membership-state':'pending'}});
}

function renderAuthenticationBridge(league,request){
  const requestedUrl=new URL(request.url);
  const canonicalBase=`/leagues/${encodeURIComponent(league.slug)}`;
  const requestedPath=`${requestedUrl.pathname}${requestedUrl.search}`;
  const basePath=requestedUrl.pathname===canonicalBase || requestedUrl.pathname.startsWith(`${canonicalBase}/`)
    ? requestedPath
    : canonicalBase;
  const nonce=crypto.randomUUID().replaceAll('-','');
  const script=`const base=${JSON.stringify(basePath)};const hash=/^#[A-Za-z0-9][A-Za-z0-9._~:/%+-]{0,255}$/.test(location.hash)?location.hash:'';location.replace('/api/auth/discord/login?returnTo='+encodeURIComponent(base+hash));`;
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Restoring session · FranchiseHQ</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#070b14;color:#f7f9ff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{width:min(520px,100%);padding:30px;border:1px solid #27324a;border-radius:20px;background:#101725;box-shadow:0 24px 80px rgba(0,0,0,.35)}h1{margin:0 0 10px;font-size:28px}p{margin:0;color:#b6c1d5;line-height:1.6}.btn{display:inline-flex;margin-top:20px;padding:11px 16px;border-radius:10px;background:#356df3;color:#fff;text-decoration:none;font-weight:800}</style></head><body><main class="card"><h1>Restoring your FranchiseHQ session…</h1><p>You will return to the exact league screen you refreshed.</p><a class="btn" href="/api/auth/discord/login?returnTo=${encodeURIComponent(basePath)}">Continue with Discord</a></main><script nonce="${nonce}">${script}</script></body></html>`;
  return new Response(html,{status:200,headers:{
    'content-type':'text/html; charset=UTF-8',
    'cache-control':'no-store',
    'referrer-policy':'no-referrer',
    'content-security-policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    'x-franchisehq-release':RELEASE,
    'x-franchisehq-auth-bridge':'exact-route'
  }});
}

export async function onRequest(context){
  const request=context.request;
  if(request.method!=='GET'&&request.method!=='HEAD')return context.next();
  const parts=pathParts(request);

  // 6.1.2.2: /leagues is the authenticated league selector.
  // This catch-all also matches the empty /leagues path on Cloudflare Pages,
  // so handle it explicitly before the SPA fallback.
  if(parts.length===0){
    return renderLeagueSelector(context);
  }

  // Existing index.html uses relative asset paths. On a nested league URL those
  // resolve under /leagues/. Map them back to their real root static paths.
  if(isStaticAsset(parts))return fetchRootAsset(context,request,parts.join('/'));

  const requestedSlug=decodeURIComponent(parts[0]||'');
  const league=await resolveTenant(context.env,requestedSlug);
  if(!league)return new Response('League not found.',{status:404,headers:{'cache-control':'no-store'}});

  const session=await getCurrentSession(context,{leagueId:league.id});
  if(!session)return renderAuthenticationBridge(league,request);
  if(isOwnerFallbackHost(new URL(request.url).hostname)
    && (session.membership?.role!=='commissioner' || !isOwnerFallbackIdentity(context.env,session.user))){
    const source=new URL(request.url);
    return redirectResponse(new URL(`${source.pathname}${source.search}`,CANONICAL_APP_ORIGIN).toString());
  }
  if(!session.membership?.active){
    if(session.membership?.role==='team_owner' && !session.membership?.teamId)return renderPendingPage(session,league);
    return redirectResponse('/leagues?access=denied');
  }

  // Every authorized league page/subpage is an SPA route. Serve the root shell
  // while preserving the browser URL so the tenant router resolves this league.
  // Renew both persistent cookies during the document request itself so a hard
  // refresh does not depend on a later /api/auth/me client request.
  const shell = await fetchSpaShell(context,request,session);
  const headers = new Headers(shell.headers);
  if (session.rawSessionToken) {
    headers.append("Set-Cookie", createSecureCookie(
      AUTH_CONSTANTS.SESSION_COOKIE_NAME, session.rawSessionToken,
      AUTH_CONSTANTS.SESSION_DURATION_SECONDS, "/"
    ));
    headers.append("Set-Cookie", createSecureCookie(
      AUTH_CONSTANTS.SESSION_RECOVERY_COOKIE_NAME, session.rawSessionToken,
      AUTH_CONSTANTS.SESSION_DURATION_SECONDS, "/"
    ));
  }
  return new Response(shell.body,{status:shell.status,statusText:shell.statusText,headers});
}
