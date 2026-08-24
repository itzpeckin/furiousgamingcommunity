import { onRequestGet as renderLeagueSelector } from "./index.js";

const RELEASE='6.1.0f';

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

async function fetchRootAsset(request,relativePath){
  const source=new URL(request.url);
  const target=new URL('/'+relativePath.replace(/^\/+/,''),source.origin);
  const init={method:'GET',headers:new Headers(request.headers),redirect:'follow'};
  // Prevent accidental auth/session header forwarding to a static self-fetch.
  init.headers.delete('authorization');
  init.headers.delete('cookie');
  const response=await fetch(target.toString(),init);
  const headers=new Headers(response.headers);
  headers.set('x-fhq-route-fix',RELEASE);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function fetchSpaShell(request){
  const source=new URL(request.url);
  const target=new URL('/index.html',source.origin);
  const response=await fetch(target.toString(),{method:'GET',headers:{accept:'text/html'},redirect:'follow'});
  const headers=new Headers(response.headers);
  headers.set('content-type','text/html; charset=UTF-8');
  headers.set('cache-control','no-store');
  headers.set('x-fhq-route-fix',RELEASE);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export async function onRequest(context){
  const request=context.request;
  if(request.method!=='GET'&&request.method!=='HEAD')return context.next();
  const parts=pathParts(request);

  // 6.1.0f: /leagues is the authenticated league selector.
  // This catch-all also matches the empty /leagues path on Cloudflare Pages,
  // so handle it explicitly before the SPA fallback.
  if(parts.length===0){
    return renderLeagueSelector(context);
  }

  // Existing index.html uses relative asset paths. On a nested league URL those
  // resolve under /leagues/. Map them back to their real root static paths.
  if(isStaticAsset(parts))return fetchRootAsset(request,parts.join('/'));

  // Every league page/subpage is an SPA route. Serve the root shell while
  // preserving the browser URL so the tenant router can resolve the league.
  return fetchSpaShell(request);
}
