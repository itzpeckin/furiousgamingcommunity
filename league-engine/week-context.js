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
      const routeWeek = Number(routeMatch[2]);
      const canonicalWeek = finiteNumber(fallbackWeek);
      // Madden's All Weeks aggregate retains /week/reg/0/ as source
      // provenance after the server has resolved its payload to a canonical
      // one-based week. Never let that sentinel overwrite the canonical
      // snapshot value in the browser. With no canonical value, Week 0 stays
      // a non-playable placeholder instead of becoming Week 1.
      const week = phase === 'regular' && routeWeek === 0
        && Number.isFinite(canonicalWeek) && canonicalWeek >= 1
        ? canonicalWeek
        : routeWeek;
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

  function resolveSeason(snapshot = {}, standings = []) {
    const canonicalWeek = finiteNumber(snapshot.weekIndex ?? snapshot.week);
    const candidates = (Array.isArray(standings) ? standings : []).map(row => {
      const source = row?.source || row || {};
      const stageIndex = finiteNumber(source.stageIndex);
      const sourceWeek = finiteNumber(source.weekIndex);
      if (!Number.isFinite(stageIndex) && !Number.isFinite(sourceWeek)) return null;
      return resolve(source,canonicalWeek,source.stage || source.stageName || 'regular-season');
    }).filter(item => item && Number.isFinite(item.week) && item.week >= 1);
    if (!candidates.length) return null;

    const keyCounts = new Map();
    candidates.forEach(item => {
      const key = `${item.phase}:${item.week}`;
      keyCounts.set(key,(keyCounts.get(key) || 0) + 1);
    });
    const [winningKey] = [...keyCounts.entries()].sort((left,right) => right[1] - left[1])[0];
    const selected = candidates.find(item => `${item.phase}:${item.week}` === winningKey);
    const round = selected.phase === 'playoffs' ? playoffRound(selected.week) : null;
    return {
      ...selected,
      stage:selected.phase,
      season:snapshot.seasonYear ?? snapshot.season ?? '—',
      round,
      displayLabel:round || `${selected.label} Week ${selected.week}`,
      authority:Number.isFinite(canonicalWeek) && canonicalWeek >= 1 ? 'active-snapshot' : 'standings'
    };
  }

  HQ.canonicalWeekContext = Object.freeze({resolve,resolveSeason});
})();
