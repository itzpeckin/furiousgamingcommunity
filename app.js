(() => {
  const body = document.body;
  const navItems = [...document.querySelectorAll('[data-view]')];
  const panels = [...document.querySelectorAll('[data-view-panel]')];
  const placeholderPanel = document.querySelector('[data-view-panel="placeholder"]');
  const sidebar = document.querySelector('[data-sidebar]');
  const mobileOverlay = document.querySelector('[data-mobile-overlay]');
  const profileButton = document.querySelector('[data-profile-button]');
  const profileMenu = document.querySelector('[data-profile-menu]');
  const commandModal = document.querySelector('[data-command-modal]');
  const commandInput = document.querySelector('[data-command-input]');
  const stylePanel = document.querySelector('[data-style-panel]');
  const panelOverlay = document.querySelector('[data-panel-overlay]');
  const toastRegion = document.querySelector('[data-toast-region]');

  const pageMeta = {
    teams: { title: 'Teams', eyebrow: 'League directory', copy: 'Browse all 32 franchises, records, owners, ratings, cap space, and roster snapshots.', cardTitle: 'Team directory arrives in Milestone 1B', cardCopy: 'The shared shell is ready for searchable team cards and detailed franchise profiles.' },
    players: { title: 'Players', eyebrow: 'Mock Madden database', copy: 'Search by name, team, position, rating, age, development trait, contract, and trade status.', cardTitle: 'Player explorer arrives in Milestone 1B', cardCopy: 'This page will become the main searchable player database and launch point for trade building.' },
    standings: { title: 'Standings', eyebrow: 'Conference and division views', copy: 'Track records, scoring, streaks, tiebreakers, and the projected playoff picture.', cardTitle: 'Full standings arrive in Milestone 1B', cardCopy: 'The final page will support league, conference, division, and playoff-position views.' },
    stats: { title: 'Stats & Leaders', eyebrow: 'League performance', copy: 'Compare passing, rushing, receiving, defensive, kicking, and team performance.', cardTitle: 'Stat leaderboards arrive in Milestone 1B', cardCopy: 'Reusable tables and leader cards will use the component rules established in this milestone.' },
    schedule: { title: 'Schedule', eyebrow: 'Weekly matchups and results', copy: 'Move between weeks, preview upcoming games, and open completed game summaries.', cardTitle: 'Schedule views arrive in Milestone 1B', cardCopy: 'The responsive layout is ready for weekly scoreboards, matchup cards, and result details.' },
    news: { title: 'League News', eyebrow: 'Stories and announcements', copy: 'Approved trades, commissioner posts, game recaps, awards, and automated league activity.', cardTitle: 'News hub arrives in Milestone 1B', cardCopy: 'This section will combine public league announcements with automatically generated updates.' },
    'trade-center': { title: 'Trade Center', eyebrow: 'Private transaction workspace', copy: 'Manage saved drafts, private offers, active negotiations, committee reviews, and final decisions.', cardTitle: 'Private trade workflow arrives in Milestone 1C', cardCopy: 'Milestone 1A establishes the permission-aware navigation and reusable states the trade experience will use.' },
    'trade-block': { title: 'Trade Block', eyebrow: 'Available players and needs', copy: 'See which players are available and what each owner wants in return.', cardTitle: 'Trade block arrives in Milestone 1C', cardCopy: 'Owners will be able to advertise players, positions of need, and preferred return types.' },
    commissioner: { title: 'Commissioner Dashboard', eyebrow: 'League operations', copy: 'Manage members, teams, trade rules, committee roles, news, calculator settings, and sync health.', cardTitle: 'Commissioner controls arrive after core pages', cardCopy: 'Role-aware visibility is already working in this prototype so permissions can be tested early.' }
  };

  const accents = {
    blue: { hex: '#4f8cff', rgb: '79, 140, 255' },
    red: { hex: '#ff5b5f', rgb: '255, 91, 95' },
    green: { hex: '#32d583', rgb: '50, 213, 131' },
    purple: { hex: '#9b7cff', rgb: '155, 124, 255' }
  };

  function normalizeView(view) {
    return view || 'home';
  }

  function showView(view, updateHash = true) {
    const normalized = normalizeView(view);
    const dedicated = ['home', 'design-system'].includes(normalized);

    panels.forEach(panel => panel.classList.remove('is-active'));
    if (dedicated) {
      document.querySelector(`[data-view-panel="${normalized}"]`)?.classList.add('is-active');
    } else {
      placeholderPanel?.classList.add('is-active');
      const meta = pageMeta[normalized] || { title: 'Coming next', eyebrow: 'Milestone roadmap', copy: 'This shell is ready for the next page.', cardTitle: 'Page shell complete', cardCopy: 'The responsive structure is ready.' };
      document.querySelector('[data-placeholder-title]').textContent = meta.title;
      document.querySelector('[data-placeholder-eyebrow]').textContent = meta.eyebrow;
      document.querySelector('[data-placeholder-copy]').textContent = meta.copy;
      document.querySelector('[data-placeholder-card-title]').textContent = meta.cardTitle;
      document.querySelector('[data-placeholder-card-copy]').textContent = meta.cardCopy;
    }

    navItems.forEach(item => item.classList.toggle('is-active', item.dataset.view === normalized));
    document.title = `${dedicated && normalized === 'home' ? 'Franchise HQ' : (pageMeta[normalized]?.title || 'Design System')} — Milestone 1A`;
    if (updateHash) history.replaceState(null, '', `#${normalized}`);
    document.getElementById('main-content')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeSidebar();
  }

  function openSidebar() {
    sidebar?.classList.add('is-open');
    mobileOverlay?.classList.add('is-open');
    body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar?.classList.remove('is-open');
    mobileOverlay?.classList.remove('is-open');
    if (!stylePanel?.classList.contains('is-open') && !commandModal?.classList.contains('is-open')) body.style.overflow = '';
  }

  function openProfileMenu() {
    profileMenu?.classList.add('is-open');
    profileButton?.setAttribute('aria-expanded', 'true');
  }

  function closeProfileMenu() {
    profileMenu?.classList.remove('is-open');
    profileButton?.setAttribute('aria-expanded', 'false');
  }

  function openCommand() {
    commandModal?.classList.add('is-open');
    commandModal?.setAttribute('aria-hidden', 'false');
    body.style.overflow = 'hidden';
    setTimeout(() => commandInput?.focus(), 20);
  }

  function closeCommand() {
    commandModal?.classList.remove('is-open');
    commandModal?.setAttribute('aria-hidden', 'true');
    commandInput.value = '';
    filterCommands('');
    if (!stylePanel?.classList.contains('is-open') && !sidebar?.classList.contains('is-open')) body.style.overflow = '';
  }

  function filterCommands(query) {
    const term = query.trim().toLowerCase();
    document.querySelectorAll('[data-command-target]').forEach(button => {
      const text = button.textContent.toLowerCase();
      button.hidden = term && !text.includes(term);
      button.classList.toggle('is-match', Boolean(term && text.includes(term)));
    });
  }

  function openStylePanel() {
    stylePanel?.classList.add('is-open');
    panelOverlay?.classList.add('is-open');
    body.style.overflow = 'hidden';
  }

  function closeStylePanel() {
    stylePanel?.classList.remove('is-open');
    panelOverlay?.classList.remove('is-open');
    if (!commandModal?.classList.contains('is-open') && !sidebar?.classList.contains('is-open')) body.style.overflow = '';
  }

  function setAccent(name) {
    const accent = accents[name] || accents.blue;
    document.documentElement.style.setProperty('--accent', accent.hex);
    document.documentElement.style.setProperty('--accent-rgb', accent.rgb);
    document.querySelector('[data-accent-hex]').textContent = accent.hex.toUpperCase();
    document.querySelectorAll('[data-accent]').forEach(button => button.classList.toggle('is-active', button.dataset.accent === name));
    localStorage.setItem('m1a-accent', name);
    showToast(`${buttonLabel(name)} accent applied`, 'Your preference is saved in this browser.');
  }

  function buttonLabel(name) {
    return { blue: 'Electric blue', red: 'League red', green: 'Field green', purple: 'Prime purple' }[name] || 'Blue';
  }

  function setDensity(density) {
    body.dataset.density = density;
    document.querySelectorAll('[data-density]').forEach(button => button.classList.toggle('is-active', button.dataset.density === density));
    localStorage.setItem('m1a-density', density);
  }

  function setRole(role) {
    const labels = { commissioner: 'Commissioner', owner: 'Team Owner', committee: 'Trade Committee' };
    document.querySelector('[data-current-role]').textContent = labels[role] || labels.commissioner;
    document.querySelectorAll('[data-role]').forEach(button => button.classList.toggle('is-selected', button.dataset.role === role));
    document.querySelectorAll('[data-role-link="commissioner"]').forEach(link => {
      link.style.display = role === 'commissioner' ? '' : 'none';
    });
    localStorage.setItem('m1a-role', role);
    closeProfileMenu();
    showToast(`${labels[role]} preview active`, role === 'commissioner' ? 'All prototype navigation is visible.' : 'Commissioner-only navigation is now hidden.');
    if (role !== 'commissioner' && location.hash === '#commissioner') showView('home');
  }

  function showToast(title, copy) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span><svg><use href="#icon-info"></use></svg></span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></div>`;
    toastRegion.appendChild(toast);
    setTimeout(() => toast.remove(), 3600);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }

  navItems.forEach(item => item.addEventListener('click', event => {
    event.preventDefault();
    showView(item.dataset.view);
  }));

  document.querySelectorAll('[data-nav-target]').forEach(button => button.addEventListener('click', () => showView(button.dataset.navTarget)));
  document.querySelector('[data-open-sidebar]')?.addEventListener('click', openSidebar);
  document.querySelector('[data-close-sidebar]')?.addEventListener('click', closeSidebar);
  mobileOverlay?.addEventListener('click', closeSidebar);

  profileButton?.addEventListener('click', event => {
    event.stopPropagation();
    profileMenu?.classList.contains('is-open') ? closeProfileMenu() : openProfileMenu();
  });
  document.querySelectorAll('[data-role]').forEach(button => button.addEventListener('click', () => setRole(button.dataset.role)));

  document.querySelectorAll('[data-open-command]').forEach(button => button.addEventListener('click', openCommand));
  document.querySelectorAll('[data-close-command]').forEach(button => button.addEventListener('click', closeCommand));
  commandInput?.addEventListener('input', event => filterCommands(event.target.value));
  document.querySelectorAll('[data-command-target]').forEach(button => button.addEventListener('click', () => {
    showView(button.dataset.commandTarget);
    closeCommand();
  }));

  document.querySelectorAll('[data-open-style-panel]').forEach(button => button.addEventListener('click', openStylePanel));
  document.querySelector('[data-close-style-panel]')?.addEventListener('click', closeStylePanel);
  panelOverlay?.addEventListener('click', closeStylePanel);
  document.querySelectorAll('[data-accent]').forEach(button => button.addEventListener('click', () => setAccent(button.dataset.accent)));
  document.querySelectorAll('[data-density]').forEach(button => button.addEventListener('click', () => setDensity(button.dataset.density)));

  document.querySelectorAll('[data-demo-toast]').forEach(button => button.addEventListener('click', () => showToast('Milestone 1A foundation complete', button.dataset.demoToast)));

  document.addEventListener('click', event => {
    if (!profileMenu?.contains(event.target) && !profileButton?.contains(event.target)) closeProfileMenu();
  });

  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openCommand();
    }
    if (event.key === 'Escape') {
      closeProfileMenu();
      closeCommand();
      closeStylePanel();
      closeSidebar();
    }
  });

  window.addEventListener('hashchange', () => showView(location.hash.replace('#', ''), false));

  const savedAccent = localStorage.getItem('m1a-accent') || 'blue';
  const savedDensity = localStorage.getItem('m1a-density') || 'comfortable';
  const savedRole = localStorage.getItem('m1a-role') || 'commissioner';
  setAccentSilently(savedAccent);
  setDensity(savedDensity);
  setRoleSilently(savedRole);
  showView(location.hash.replace('#', '') || 'home', false);

  function setAccentSilently(name) {
    const accent = accents[name] || accents.blue;
    document.documentElement.style.setProperty('--accent', accent.hex);
    document.documentElement.style.setProperty('--accent-rgb', accent.rgb);
    document.querySelector('[data-accent-hex]').textContent = accent.hex.toUpperCase();
    document.querySelectorAll('[data-accent]').forEach(button => button.classList.toggle('is-active', button.dataset.accent === name));
  }

  function setRoleSilently(role) {
    const labels = { commissioner: 'Commissioner', owner: 'Team Owner', committee: 'Trade Committee' };
    document.querySelector('[data-current-role]').textContent = labels[role] || labels.commissioner;
    document.querySelectorAll('[data-role]').forEach(button => button.classList.toggle('is-selected', button.dataset.role === role));
    document.querySelectorAll('[data-role-link="commissioner"]').forEach(link => link.style.display = role === 'commissioner' ? '' : 'none');
  }
})();
