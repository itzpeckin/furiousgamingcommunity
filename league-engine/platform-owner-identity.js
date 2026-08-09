(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  const VERSION = '5.9.4.2';
  const OWNER_ACCOUNT_ID = String(document.querySelector('meta[name="franchise-hq-platform-owner-account-id"]')?.content || 'owner-tb').trim();
  const OWNER_DISCORD_ID = String(document.querySelector('meta[name="franchise-hq-platform-owner-discord-id"]')?.content || '').trim();

  const currentAccount = () => window.FGC_TRADE?.getCurrentAccount?.() || null;
  const authenticatedIdentity = () => {
    const auth = window.FGC_AUTH?.getCurrentUser?.()
      || window.FranchiseHQ?.auth?.getCurrentUser?.()
      || window.FranchiseHQ?.auth?.currentUser?.()
      || window.__FRANCHISE_HQ_AUTH_USER__
      || null;
    return auth && typeof auth === 'object' ? auth : null;
  };

  const readDiscordId = identity => String(
    identity?.discordUserId
    ?? identity?.discord_user_id
    ?? identity?.discordId
    ?? identity?.discord_id
    ?? identity?.providerAccountId
    ?? identity?.provider_account_id
    ?? ''
  ).trim();

  function resolution() {
    const authIdentity = authenticatedIdentity();
    const discordId = readDiscordId(authIdentity);

    if (OWNER_DISCORD_ID && discordId) {
      return Object.freeze({
        allowed: discordId === OWNER_DISCORD_ID,
        method: 'discord-user-id',
        configured: true,
        authenticated: true,
        accountId: currentAccount()?.id || null,
        discordId
      });
    }

    const account = currentAccount();
    return Object.freeze({
      allowed: Boolean(account && String(account.id) === OWNER_ACCOUNT_ID),
      method: 'prototype-account-id',
      configured: Boolean(OWNER_ACCOUNT_ID),
      authenticated: Boolean(account),
      accountId: account?.id || null,
      discordId: discordId || null
    });
  }

  function isPlatformOwner() {
    return resolution().allowed;
  }

  function syncWorkspace() {
    window.FranchiseHQ?.platformWorkspace?.syncVisibility?.();
  }

  document.addEventListener('franchisehq:identity-changed', () => setTimeout(syncWorkspace, 0));
  window.addEventListener('hashchange', () => setTimeout(syncWorkspace, 0));
  window.addEventListener('DOMContentLoaded', () => setTimeout(syncWorkspace, 0));
  setTimeout(syncWorkspace, 0);

  function diagnostics() {
    const result = resolution();
    return Object.freeze({
      service: 'platformOwnerIdentity',
      version: VERSION,
      platformOwner: result.allowed,
      resolutionMethod: result.method,
      configuredOwnerAccountId: OWNER_ACCOUNT_ID,
      discordOwnerConfigured: Boolean(OWNER_DISCORD_ID),
      authenticatedIdentityAvailable: result.authenticated,
      currentAccountId: result.accountId
    });
  }

  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before platform-owner-identity.js.');
  HQ.defineModuleService('platform', 'platformOwnerIdentity', {
    isPlatformOwner,
    resolution,
    diagnostics
  }, { replace: true, alias: 'platformOwnerIdentity' });
})();
