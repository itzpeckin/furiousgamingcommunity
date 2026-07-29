(() => {
  'use strict';
  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService || !HQ.leagueRepository) throw new Error('league-engine/repository.js must load before selectors.js.');
  const list = (name) => HQ.leagueRepository.current()?.[name] || [];
  const byId = (name, id) => list(name).find((item) => String(item.id) === String(id)) || null;
  const getLeague = () => HQ.leagueRepository.current()?.league || null;
  const getTeam = (id) => byId('teams', id);
  const getFranchise = (id) => byId('franchises', id);
  const getPlayer = (id) => byId('players', id);
  const getGame = (id) => byId('games', id);
  const getRoster = (teamId) => list('rosters').find((item) => String(item.teamId) === String(teamId)) || null;
  const getTeamPlayers = (teamId) => list('players').filter((item) => String(item.teamId) === String(teamId));
  const getGamesByWeek = (week) => list('games').filter((item) => Number(item.week) === Number(week));
  const getStandings = () => list('standings');
  const getAvailability = (field) => HQ.leagueRepository.current()?.availability?.[field] ?? null;
  const service = HQ.defineService('leagueSelectors', { getLeague, getTeam, getFranchise, getPlayer, getGame, getRoster, getTeamPlayers, getGamesByWeek, getStandings, getAvailability });
  HQ.manifest?.register?.({ id: 'league-selectors', service: 'leagueSelectors', script: 'league-engine/selectors.js', version: '1.0.0', dependencies: ['leagueRepository'], capabilities: ['read-model-selectors', 'safe-missing-data'] });
})();
