(() => {
  'use strict';

  const root = typeof window === 'object' ? window : globalThis;
  const HQ = root.FranchiseHQ;
  if (!HQ) throw new Error('platform/core.js must load before league-engine/week-context.js.');

  const playoffRound = week => ({
    1:'Wild Card',
    2:'Divisional Round',
    3:'Conference Championship',
    4:'Super Bowl'
  })[week] || `Playoff Week ${week}`;

  const finiteNumber = value => {
    if (value === null || value === undefined || value === '') return Number.NaN;
    const number = Number(value);
    return Number.isFinite(number) ? number : Number.NaN;
  };

  function resolve(source = {}, fallbackWeek = 0, fallbackStage = 'reg') {
    const route = String(source.routePath || source.route_path || source.sourceRoutePath || source.source_route_path || '');
    const routeMatch = route.match(/\/week\/(pre|reg|post|playoffs?)\/(\d+)/i);
    if (routeMatch) {
      const token = routeMatch[1].toLowerCase();
      const phase = token === 'pre' ? 'preseason' : token === 'reg' ? 'regular' : 'playoffs';
      const week = Number(routeMatch[2]);
      const round = phase === 'playoffs' ? playoffRound(week) : null;
      return {phase,week,round,label:phase === 'preseason' ? 'Preseason' : phase === 'regular' ? 'Regular Season' : 'Playoffs'};
    }

    const stageIndex = finiteNumber(source.stageIndex);
    const rawWeek = finiteNumber(source.weekIndex);
    const canonicalWeek = finiteNumber(fallbackWeek);
    const stageText = String(source.stage || source.stageName || fallbackStage || 'reg').toLowerCase();
    const phase = Number.isFinite(stageIndex)
      ? (stageIndex === 0 ? 'preseason' : stageIndex === 1 ? 'regular' : 'playoffs')
      : (stageText.includes('pre') ? 'preseason' : stageText.includes('post') || stageText.includes('playoff') ? 'playoffs' : 'regular');
    const week = Number.isFinite(canonicalWeek) && canonicalWeek >= 1
      ? canonicalWeek
      : Number.isFinite(rawWeek) ? rawWeek + 1 : 1;
    const round = phase === 'playoffs' ? playoffRound(week) : null;
    return {phase,week:Math.max(1,week || 1),round,label:phase === 'preseason' ? 'Preseason' : phase === 'regular' ? 'Regular Season' : 'Playoffs'};
  }

  HQ.canonicalWeekContext = Object.freeze({resolve});
})();
