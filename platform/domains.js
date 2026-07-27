(() => {
  'use strict';

  const platform = window.FranchiseHQ;
  const legacy = window.FGC_APP;

  if (!platform?.defineService) {
    console.error('FranchiseHQ core must load before platform/domains.js.');
    return;
  }

  if (!legacy) {
    console.error('FGC_APP must load before platform/domains.js.');
    return;
  }

  const source = Object.freeze({
    teams: Array.isArray(legacy.teams) ? legacy.teams : [],
    players: Array.isArray(legacy.players) ? legacy.players : [],
    schedule: Array.isArray(legacy.schedule) ? legacy.schedule : [],
    news: Array.isArray(legacy.newsArticles) ? legacy.newsArticles : []
  });

  const clone = (value) => {
    if (value == null) return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  };

  const text = (value) => String(value ?? '').trim().toLowerCase();
  const byId = (items, id) => items.find((item) => String(item.id) === String(id)) || null;
  const copyList = (items) => items.map((item) => clone(item));

  const teams = {
    getAll() {
      return copyList(source.teams);
    },
    getById(id) {
      return clone(byId(source.teams, id));
    },
    getByAbbreviation(abbreviation) {
      const wanted = text(abbreviation);
      return clone(source.teams.find((team) => text(team.abbr) === wanted) || null);
    },
    search(query = '') {
      const wanted = text(query);
      if (!wanted) return this.getAll();
      return copyList(source.teams.filter((team) => [team.fullName, team.city, team.name, team.abbr, team.owner]
        .some((value) => text(value).includes(wanted))));
    },
    getByConference(conference) {
      const wanted = text(conference);
      return copyList(source.teams.filter((team) => text(team.conference) === wanted));
    },
    getByDivision(conference, division) {
      const wantedConference = text(conference);
      const wantedDivision = text(division);
      return copyList(source.teams.filter((team) => text(team.conference) === wantedConference && text(team.division) === wantedDivision));
    },
    count() {
      return source.teams.length;
    }
  };

  const players = {
    getAll() {
      return copyList(source.players);
    },
    getById(id) {
      return clone(byId(source.players, id));
    },
    getByTeam(teamId) {
      return copyList(source.players.filter((player) => String(player.teamId) === String(teamId)));
    },
    getByPosition(position) {
      const wanted = text(position);
      return copyList(source.players.filter((player) => text(player.position) === wanted));
    },
    search(query = '', options = {}) {
      const wanted = text(query);
      const teamId = options.teamId == null ? null : String(options.teamId);
      const position = options.position ? text(options.position) : null;
      const minimumOverall = Number.isFinite(Number(options.minimumOverall)) ? Number(options.minimumOverall) : 0;
      const maximumOverall = Number.isFinite(Number(options.maximumOverall)) ? Number(options.maximumOverall) : 99;

      return copyList(source.players.filter((player) => {
        if (teamId && String(player.teamId) !== teamId) return false;
        if (position && text(player.position) !== position) return false;
        if (Number(player.overall) < minimumOverall || Number(player.overall) > maximumOverall) return false;
        if (!wanted) return true;
        return [player.name, player.first, player.last, player.position, player.teamName, player.teamAbbr, player.college]
          .some((value) => text(value).includes(wanted));
      }));
    },
    getLeaders(metric, limit = 10) {
      const key = String(metric || '').trim();
      const size = Math.max(1, Number(limit) || 10);
      return copyList(source.players
        .filter((player) => Number.isFinite(Number(player.stats?.[key])))
        .sort((a, b) => Number(b.stats?.[key] || 0) - Number(a.stats?.[key] || 0))
        .slice(0, size));
    },
    count() {
      return source.players.length;
    }
  };

  const schedule = {
    getAll() {
      return copyList(source.schedule);
    },
    getById(id) {
      return clone(byId(source.schedule, id));
    },
    getByWeek(week) {
      return copyList(source.schedule.filter((game) => Number(game.week) === Number(week)));
    },
    getByTeam(teamId) {
      const wanted = String(teamId);
      return copyList(source.schedule.filter((game) => [game.homeTeamId, game.awayTeamId, game.homeId, game.awayId]
        .some((value) => String(value) === wanted)));
    },
    getWeeks() {
      return [...new Set(source.schedule.map((game) => Number(game.week)).filter(Number.isFinite))].sort((a, b) => a - b);
    },
    count() {
      return source.schedule.length;
    }
  };

  const standings = {
    getAll() {
      return copyList([...source.teams].sort((a, b) => {
        const aPct = Number(a.wins || 0) / Math.max(1, Number(a.wins || 0) + Number(a.losses || 0) + Number(a.ties || 0));
        const bPct = Number(b.wins || 0) / Math.max(1, Number(b.wins || 0) + Number(b.losses || 0) + Number(b.ties || 0));
        return bPct - aPct || Number(b.pf || 0) - Number(a.pf || 0);
      }));
    },
    getConference(conference) {
      const wanted = text(conference);
      return this.getAll().filter((team) => text(team.conference) === wanted);
    },
    getDivision(conference, division) {
      const wantedConference = text(conference);
      const wantedDivision = text(division);
      return this.getAll().filter((team) => text(team.conference) === wantedConference && text(team.division) === wantedDivision);
    },
    getTeam(teamId) {
      return teams.getById(teamId);
    }
  };

  const news = {
    getAll() {
      return copyList(source.news);
    },
    getById(id) {
      return clone(byId(source.news, id));
    },
    getByCategory(category) {
      const wanted = text(category);
      if (!wanted || wanted === 'all') return this.getAll();
      return copyList(source.news.filter((article) => text(article.category) === wanted));
    },
    search(query = '') {
      const wanted = text(query);
      if (!wanted) return this.getAll();
      return copyList(source.news.filter((article) => [article.title, article.headline, article.summary, article.body, article.category]
        .some((value) => text(value).includes(wanted))));
    },
    count() {
      return source.news.length;
    }
  };

  const data = {
    getSource() {
      return 'legacy-fixtures';
    },
    diagnostics() {
      return Object.freeze({
        source: 'legacy-fixtures',
        teams: source.teams.length,
        players: source.players.length,
        games: source.schedule.length,
        news: source.news.length,
        services: Object.freeze(['teams', 'players', 'schedule', 'standings', 'news'])
      });
    }
  };

  platform.defineService('data', data);
  platform.defineService('teams', teams);
  platform.defineService('players', players);
  platform.defineService('schedule', schedule);
  platform.defineService('standings', standings);
  platform.defineService('news', news);

  platform.events?.emit?.('domain-services-ready', data.diagnostics());
})();
