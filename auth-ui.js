(() => {
  'use strict';

  window.FranchiseHQ = window.FranchiseHQ || {};

  let isRendering = false;

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function initialsFromName(name) {
    const parts = String(name || 'Guest')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!parts.length) {
      return 'G';
    }

    return parts
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  function authenticatedRoleLabel() {
    const role = FranchiseHQ.auth?.getRole?.();

    if (role === 'commissioner') {
      return 'Commissioner';
    }

    if (role === 'trade_committee') {
      return 'Trade Committee';
    }

    if (role === 'team_owner') {
      return 'Team Owner';
    }

    return 'League Member';
  }

  function simulationRoleLabel(account) {
    if (!account) {
      return 'No simulation selected';
    }

    if (account.role === 'commissioner') {
      return 'Commissioner simulation';
    }

    if (account.role === 'committee') {
      return 'Trade Committee simulation';
    }

    if (account.role === 'owner') {
      return 'Team Owner simulation';
    }

    return 'Prototype simulation';
  }

  function simulationRoleTag(account) {
    if (!account) {
      return '';
    }

    if (account.role === 'commissioner') {
      return '[C]';
    }

    if (account.role === 'committee') {
      return '[TC]';
    }

    return '';
  }

  function getSimulationAccount() {
    return FranchiseHQ.ui?.getSimulationAccount?.() ||
      FranchiseHQ.simulation?.getPerspective?.() ||
      null;
  }

  function getSimulationTeam(account) {
    if (!account?.teamId) {
      return null;
    }

    return FranchiseHQ.ui?.getSimulationTeam?.() ||
      FranchiseHQ.ui?.getTeam?.(account.teamId) ||
      null;
  }

  function setText(element, value) {
    if (element && element.textContent !== value) {
      element.textContent = value;
    }
  }

  function renderAvatar(element, displayName, avatarUrl) {
    if (!element) {
      return;
    }

    const safeName = escapeHtml(displayName);
    const initials = initialsFromName(displayName);

    if (avatarUrl) {
      const nextHtml = `
        <img
          src="${escapeHtml(avatarUrl)}"
          alt="${safeName}"
          referrerpolicy="no-referrer"
        />
      `;

      if (element.innerHTML.trim() !== nextHtml.trim()) {
        element.innerHTML = nextHtml;
      }

      element.classList.add('avatar--image');
      return;
    }

    element.classList.remove('avatar--image');
    setText(element, initials);
  }

  function renderAuthenticatedAccount() {
    if (isRendering || !FranchiseHQ.auth) {
      return;
    }

    isRendering = true;

    try {
      const snapshot = FranchiseHQ.auth.getSnapshot();
      const authenticated = snapshot.authenticated === true;

      const displayName = authenticated
        ? FranchiseHQ.auth.getDisplayName()
        : 'Guest';

      const roleTag = authenticated
        ? FranchiseHQ.auth.getRoleTag()
        : '';

      const completeName = roleTag
        ? `${displayName} ${roleTag}`
        : displayName;

      const roleLabel = authenticated
        ? authenticatedRoleLabel()
        : 'Not signed in';

      const avatarUrl = authenticated
        ? FranchiseHQ.auth.getAvatarUrl()
        : null;

      setText(
        document.querySelector('[data-authenticated-user]'),
        completeName
      );

      setText(
        document.querySelector('[data-authenticated-role]'),
        roleLabel
      );

      renderAvatar(
        document.querySelector('[data-authenticated-avatar]'),
        displayName,
        avatarUrl
      );

      const headerName = document.querySelector(
        '[data-auth-menu-name]'
      );

      const headerRole = document.querySelector(
        '[data-auth-menu-role]'
      );

      setText(headerName, completeName);
      setText(headerRole, roleLabel);

      renderAvatar(
        document.querySelector('[data-auth-menu-avatar]'),
        displayName,
        avatarUrl
      );

      const loginButton = document.querySelector('[data-real-login]');
      const logoutButton = document.querySelector('[data-real-logout]');

      if (loginButton) {
        loginButton.hidden = authenticated;
      }

      if (logoutButton) {
        logoutButton.hidden = !authenticated;
      }

      renderSimulationIdentity();
    } finally {
      isRendering = false;
    }
  }

  function renderSimulationIdentity() {
    const account = getSimulationAccount();
    const team = getSimulationTeam(account);

    const roleTag = simulationRoleTag(account);

    const accountName = account
      ? account.handle || account.name || 'Prototype User'
      : 'No identity';

    const completeName = roleTag
      ? `${accountName} ${roleTag}`
      : accountName;

    const secondaryText = team
      ? team.fullName
      : simulationRoleLabel(account);

    setText(
      document.querySelector('[data-simulation-user]'),
      completeName
    );

    setText(
      document.querySelector('[data-simulation-role]'),
      secondaryText
    );
  }

  async function handleLogout() {
    const button = document.querySelector('[data-real-logout]');

    if (button) {
      button.disabled = true;
    }

    const result = await FranchiseHQ.auth.logout();

    if (button) {
      button.disabled = false;
    }

    if (!result.ok) {
      FranchiseHQ.ui?.toast?.(
        'Logout failed',
        result.error || 'Your account could not be logged out.'
      );

      return;
    }

    renderAuthenticatedAccount();

    FranchiseHQ.ui?.toast?.(
      'Signed out',
      'Your Discord session has been securely ended.'
    );
  }

  function handleDocumentClick(event) {
    const loginButton = event.target.closest('[data-real-login]');

    if (loginButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      FranchiseHQ.auth.login();
      return;
    }

    const logoutButton = event.target.closest('[data-real-logout]');

    if (logoutButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      handleLogout();
      return;
    }

    const simulationButton = event.target.closest(
      '[data-open-simulation]'
    );

    if (simulationButton) {
      event.preventDefault();
      event.stopImmediatePropagation();

      document
        .querySelector('[data-profile-menu]')
        ?.classList.remove('is-open');

      document
        .querySelector('[data-profile-button]')
        ?.setAttribute('aria-expanded', 'false');

      FranchiseHQ.ui?.openSimulationSelector?.({ source: 'authenticated-profile' });
      return;
    }

    if (
      event.target.closest('[data-login-account]') ||
      event.target.closest('[data-dev-account]') ||
      event.target.closest('[data-dev-commissioner]')
    ) {
      window.setTimeout(renderSimulationIdentity, 0);
    }
  }

  function initialize() {
    document.addEventListener(
      'click',
      handleDocumentClick,
      true
    );

    FranchiseHQ.events?.on?.(
      'auth-changed',
      renderAuthenticatedAccount
    );

    FranchiseHQ.events?.on?.(
      'simulation-changed',
      renderSimulationIdentity
    );

    renderAuthenticatedAccount();
    FranchiseHQ.lifecycle?.markCheckpoint?.('ui:initialized', true);
    FranchiseHQ.lifecycle?.start?.();
  }

  const accountUIService = {
    render: renderAuthenticatedAccount,
    renderSimulation: renderSimulationIdentity
  };

  if (window.FranchiseHQ.defineService) {
    window.FranchiseHQ.defineService('accountUI', accountUIService, { replace: true });
  } else {
    window.FranchiseHQ.accountUI = Object.freeze(accountUIService);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
