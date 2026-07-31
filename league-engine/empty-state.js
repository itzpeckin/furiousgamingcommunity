(function initializeLeagueEmptyState(global) {
  'use strict';

  const FranchiseHQ = global.FranchiseHQ = global.FranchiseHQ || {};

  const DEFINITIONS = Object.freeze({
    league: Object.freeze({ title: 'No League Loaded', message: 'No league data is currently loaded.' }),
    'league data': Object.freeze({ title: 'No League Loaded', message: 'No league data is currently loaded.' }),
    activity: Object.freeze({ title: 'No League Activity', message: 'No league activity is available.' }),
    'league activity': Object.freeze({ title: 'No League Activity', message: 'No league activity is available.' }),
    teams: Object.freeze({ title: 'No Teams Available', message: 'No teams have been loaded.' }),
    roster: Object.freeze({ title: 'No Roster Loaded', message: 'No roster has been loaded.' }),
    rosters: Object.freeze({ title: 'No Rosters Loaded', message: 'No rosters have been loaded.' }),
    players: Object.freeze({ title: 'No Players Available', message: 'No players have been loaded.' }),
    standings: Object.freeze({ title: 'No Standings Available', message: 'No standings are available.' }),
    statistics: Object.freeze({ title: 'No Statistics Available', message: 'No player statistics are available.' }),
    stats: Object.freeze({ title: 'No Statistics Available', message: 'No player statistics are available.' }),
    schedule: Object.freeze({ title: 'No Schedule Available', message: 'No schedule is available.' })
  });

  function normalizeSubject(subject) {
    return String(subject || 'league data').trim().toLowerCase();
  }

  function isEmpty() {
    return FranchiseHQ.leagueData?.isEmpty?.() === true || FranchiseHQ.leagueData?.status?.().isEmpty === true;
  }

  function model(subject = 'league data', options = {}) {
    const key = normalizeSubject(subject);
    const definition = DEFINITIONS[key] || Object.freeze({
      title: `No ${key.replace(/\b\w/g, character => character.toUpperCase())} Available`,
      message: FranchiseHQ.leagueData?.emptyMessage?.(key) || `No ${key} is available.`
    });

    return Object.freeze({
      subject: key,
      title: options.title || definition.title,
      message: options.message || definition.message,
      guidance: options.guidance || 'Choose Development Data or publish a verified Madden Companion snapshot from Commissioner HQ to restore league content.',
      actionLabel: options.actionLabel || 'Open League Data',
      actionRoute: options.actionRoute || 'commissioner/league-data',
      showAction: options.showAction !== false,
      icon: options.icon || 'icon-info'
    });
  }

  function markup(subject = 'league data', options = {}) {
    const state = model(subject, options);
    const escape = value => String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');

    return `<section class="empty-state league-data-empty-state" data-league-empty-state="${escape(state.subject)}" role="status">
      <span class="empty-icon"><svg><use href="#${escape(state.icon)}"></use></svg></span>
      <strong>${escape(state.title)}</strong>
      <p>${escape(state.message)}</p>
      <p>${escape(state.guidance)}</p>
      ${state.showAction ? `<div class="heading-actions"><button class="button button--primary" data-route="${escape(state.actionRoute)}">${escape(state.actionLabel)}</button></div>` : ''}
    </section>`;
  }

  function render(host, subject = 'league data', options = {}) {
    const target = typeof host === 'string' ? global.document?.querySelector?.(host) : host;
    if (!target) return false;
    target.innerHTML = markup(subject, options);
    return true;
  }

  FranchiseHQ.leagueEmptyState = Object.freeze({
    definitions: DEFINITIONS,
    isEmpty,
    model,
    markup,
    render
  });

  // Roadmap-compatible alias for future League module consumers.
  FranchiseHQ.modules = FranchiseHQ.modules || {};
  FranchiseHQ.modules.league = FranchiseHQ.modules.league || {};
  FranchiseHQ.modules.league.emptyState = FranchiseHQ.leagueEmptyState;
})(window);
