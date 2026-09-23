import {
  appendBrowserSessionCookies,
  redirectResponse,
  rotateBrowserSession
} from '../_lib/auth.js';
import { requirePlatformOwner } from '../_lib/permissions.js';

const RELEASE = '8.0.8.1';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function routeSection(request) {
  const path = new URL(request.url).pathname.replace(/\/+$/,'').toLowerCase();
  return path.endsWith('/diagnostics') ? 'diagnostics' : 'overview';
}

function page(session, section) {
  const user = session.user || {};
  const displayName = user.displayName || user.discordGlobalName || user.discordUsername || 'Platform Owner';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#080b12">
  <meta name="description" content="FranchiseHQ owner administration for league onboarding and cross-league health.">
  <title>Platform Admin | FranchiseHQ</title>
  <link rel="stylesheet" href="/platform-admin.css?v=${RELEASE}">
</head>
<body data-platform-admin-section="${esc(section)}">
  <header class="admin-topbar">
    <a class="admin-brand" href="/platform-admin" aria-label="FranchiseHQ Platform Admin">FRANCHISE<span>HQ</span><small>Platform Admin</small></a>
    <nav class="admin-topnav" aria-label="Platform administration">
      <a href="/platform-admin" ${section === 'overview' ? 'aria-current="page"' : ''}>Leagues</a>
      <a href="/platform-admin/diagnostics" ${section === 'diagnostics' ? 'aria-current="page"' : ''}>Advanced Diagnostics</a>
    </nav>
    <div class="admin-account">
      <span><strong>${esc(displayName)}</strong><small>Platform Owner</small></span>
      <a href="/leagues">My Leagues</a>
      <form method="post" action="/api/auth/logout"><input type="hidden" name="csrfToken" value="${esc(session.rawCsrfToken || '')}"><button type="submit">Log out</button></form>
    </div>
  </header>
  <main class="admin-shell">
    <div class="admin-loading" data-platform-admin-loading><span></span><span></span><span></span><p>Loading platform operations…</p></div>
    <div data-platform-admin-root></div>
  </main>
  <footer class="admin-footer"><span>FranchiseHQ Platform Administration</span><span>Release ${RELEASE}</span></footer>
  <script src="/platform/core.js?v=${RELEASE}"></script>
  <script src="/league-engine/platform-onboarding.js?v=${RELEASE}"></script>
  <script src="/platform-admin.js?v=${RELEASE}"></script>
</body>
</html>`;
}

export async function onRequest(context) {
  if (!['GET','HEAD'].includes(context.request.method)) return context.next();
  const authorization = await requirePlatformOwner(context);
  if (!authorization.authorized) {
    if (authorization.response?.status === 401) {
      const returnTo = new URL(context.request.url).pathname;
      return redirectResponse(`/auth?returnTo=${encodeURIComponent(returnTo)}`);
    }
    return new Response('Not found.',{ status:404,headers:{ 'cache-control':'no-store' } });
  }

  let session = authorization.session;
  if (session.kind === 'browser') session = await rotateBrowserSession(context,session);
  const headers = new Headers({
    'content-type':'text/html; charset=UTF-8',
    'cache-control':'no-store',
    'x-franchisehq-release':RELEASE,
    'x-franchisehq-surface':'platform-admin',
    'x-frame-options':'DENY',
    'referrer-policy':'same-origin'
  });
  if (session.kind === 'browser') appendBrowserSessionCookies(headers,session);
  return new Response(context.request.method === 'HEAD' ? null : page(session,routeSection(context.request)),{
    status:200,
    headers
  });
}
