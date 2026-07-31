(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService || !HQ.leagueData?.current || !HQ.validate?.register) {
    throw new Error('League Data State and Platform validation must load before league-engine/rosters.js.');
  }

  const VERSION = '5.5.0';
  const POSITION_GROUPS = Object.freeze({
    offense: Object.freeze(['QB','RB','FB','WR','TE','LT','LG','C','RG','RT','OL']),
    defense: Object.freeze(['LE','RE','DE','DT','NT','LOLB','MLB','ROLB','LB','EDGE','CB','FS','SS','S']),
    specialTeams: Object.freeze(['K','P','LS','KR','PR'])
  });
  const STATUS_ORDER = Object.freeze(['active','injured-reserve','practice-squad','free-agent','unassigned','other']);
  const DEV_RANK = Object.freeze({ 'X-FACTOR': 5, XFACTOR: 5, SUPERSTAR: 4, STAR: 3, NORMAL: 2, HIDDEN: 1 });

  const clone = (value) => value == null ? value : structuredClone(value);
  const freeze = (value, seen = new WeakSet()) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.getOwnPropertyNames(value).forEach((key) => freeze(value[key], seen));
    return Object.freeze(value);
  };
  const array = (value) => Array.isArray(value) ? value : [];
  const text = (value) => String(value ?? '').trim();
  const upper = (value) => text(value).toUpperCase();
  const key = (value) => text(value).toLowerCase();
  const numberOrNull = (value) => value === '' || value == null || Number.isNaN(Number(value)) ? null : Number(value);

  function snapshot() {
    return HQ.leagueData.current();
  }

  function sourceProvenance(current) {
    const state = HQ.leagueData.getStatus?.() || HQ.leagueData.status();
    const source = current?.source || {};
    return freeze({
      mode: state.activeMode,
      authority: state.authority,
      authoritative: state.isLive === true,
      sourceType: state.isLive ? (source.type || source.sourceType || 'madden') : state.isDemo ? 'development' : 'none',
      importId: source.importId || state.importId || null,
      importedAt: source.importedAt || state.importedAt || null,
      snapshotId: source.snapshotId || source.importId || state.importId || null,
      rawSourceId: source.rawSourceId || null
    });
  }

  function positionGroup(position) {
    const pos = upper(position);
    if (POSITION_GROUPS.offense.includes(pos)) return 'offense';
    if (POSITION_GROUPS.defense.includes(pos)) return 'defense';
    if (POSITION_GROUPS.specialTeams.includes(pos)) return 'specialTeams';
    return 'other';
  }

  function normalizedStatus(player, roster, injury, assignedTeamId) {
    const raw = key(player.rosterStatus || player.status || roster?.status || roster?.rosterStatus);
    const injuryStatus = key(injury?.status || player.injuryStatus || player.injury);
    if (['ir','injured reserve','injured-reserve','reserve/injured'].includes(raw) || ['ir','injured reserve','injured-reserve'].includes(injuryStatus)) return 'injured-reserve';
    if (['practice squad','practice-squad','ps'].includes(raw)) return 'practice-squad';
    if (['free agent','free-agent','fa'].includes(raw)) return 'free-agent';
    if (!assignedTeamId) return raw === 'free-agent' ? 'free-agent' : 'unassigned';
    if (!raw || ['active','roster','53-man','53 man'].includes(raw)) return 'active';
    return 'other';
  }

  function rosterAssignments(current) {
    const assignments = new Map();
    array(current?.rosters).forEach((roster) => {
      const teamId = text(roster.teamId || roster.franchiseId || roster.ownerTeamId);
      const ids = array(roster.playerIds || roster.players).map((item) => text(item?.id ?? item)).filter(Boolean);
      ids.forEach((playerId) => {
        if (!assignments.has(playerId)) assignments.set(playerId, []);
        assignments.get(playerId).push({ teamId, roster });
      });
    });
    return assignments;
  }

  function normalizeModel() {
    const current = snapshot();
    const provenance = sourceProvenance(current);
    const teams = array(current?.teams);
    const teamIds = new Set(teams.map((team) => text(team.id)).filter(Boolean));
    const contracts = new Map(array(current?.contracts).map((item) => [text(item.playerId || item.player?.id || item.id), item]));
    const injuries = new Map(array(current?.injuries).map((item) => [text(item.playerId || item.player?.id || item.id), item]));
    const assignments = rosterAssignments(current);
    const issues = [];
    const seenIds = new Map();

    const players = array(current?.players).map((raw, index) => {
      const playerId = text(raw.id || raw.playerId || raw.maddenId);
      if (!playerId) issues.push({ type: 'missing-player-id', severity: 'error', index, message: `Player record ${index + 1} is missing a stable ID.` });
      if (playerId) {
        const count = (seenIds.get(playerId) || 0) + 1;
        seenIds.set(playerId, count);
        if (count > 1) issues.push({ type: 'duplicate-player-id', severity: 'error', playerId, message: `Player ID ${playerId} appears more than once.` });
      }

      const assignmentList = playerId ? (assignments.get(playerId) || []) : [];
      if (assignmentList.length > 1) issues.push({ type: 'duplicate-team-assignment', severity: 'error', playerId, teamIds: assignmentList.map((item) => item.teamId), message: `Player ${playerId} is assigned to multiple rosters.` });

      const playerTeamId = text(raw.teamId || raw.team?.id || raw.franchiseId);
      const rosterTeamId = text(assignmentList[0]?.teamId);
      const assignedTeamId = playerTeamId || rosterTeamId || null;
      if (assignedTeamId && !teamIds.has(assignedTeamId)) issues.push({ type: 'invalid-team-reference', severity: 'error', playerId, teamId: assignedTeamId, message: `Player ${playerId || index + 1} references unknown team ${assignedTeamId}.` });
      if (playerTeamId && rosterTeamId && playerTeamId !== rosterTeamId) issues.push({ type: 'assignment-mismatch', severity: 'error', playerId, playerTeamId, rosterTeamId, message: `Player ${playerId} team and roster assignments disagree.` });

      const contract = playerId ? contracts.get(playerId) || null : null;
      const injury = playerId ? injuries.get(playerId) || null : null;
      const roster = assignmentList[0]?.roster || null;
      const position = upper(raw.position || raw.pos || raw.positionAbbr);
      if (!position) issues.push({ type: 'missing-position', severity: 'warning', playerId, message: `Player ${playerId || index + 1} has no position.` });
      if (position && positionGroup(position) === 'other') issues.push({ type: 'unsupported-position', severity: 'warning', playerId, position, message: `Player ${playerId} uses unsupported position ${position}.` });

      const developmentTrait = text(raw.developmentTrait || raw.devTrait || raw.dev || raw.development || 'Normal');
      const depthOrder = numberOrNull(raw.depthOrder ?? raw.depthChartOrder ?? raw.depth ?? roster?.depthOrder);
      const status = normalizedStatus(raw, roster, injury, assignedTeamId);
      const fullName = text(raw.name || raw.fullName || [raw.firstName || raw.first, raw.lastName || raw.last].filter(Boolean).join(' ')) || `Unknown Player ${index + 1}`;

      return freeze({
        id: playerId || null,
        name: fullName,
        firstName: text(raw.firstName || raw.first),
        lastName: text(raw.lastName || raw.last),
        teamId: assignedTeamId,
        position,
        positionGroup: positionGroup(position),
        rosterStatus: status,
        depthOrder,
        overall: numberOrNull(raw.overall ?? raw.ovr ?? raw.rating),
        age: numberOrNull(raw.age),
        yearsPro: numberOrNull(raw.yearsPro ?? raw.years ?? raw.experience),
        developmentTrait,
        injuryStatus: text(injury?.status || raw.injuryStatus || raw.injury || 'Healthy'),
        contract: contract ? freeze(clone(contract)) : null,
        injury: injury ? freeze(clone(injury)) : null,
        ratings: raw.ratings ? freeze(clone(raw.ratings)) : null,
        raw: freeze(clone(raw)),
        provenance
      });
    });

    const playerIds = new Set(players.map((player) => player.id).filter(Boolean));
    assignments.forEach((list, playerId) => {
      if (!playerIds.has(playerId)) issues.push({ type: 'orphaned-roster-reference', severity: 'error', playerId, teamIds: list.map((item) => item.teamId), message: `Roster references missing player ${playerId}.` });
    });
    contracts.forEach((_, playerId) => {
      if (playerId && !playerIds.has(playerId)) issues.push({ type: 'orphaned-contract', severity: 'warning', playerId, message: `Contract references missing player ${playerId}.` });
    });
    injuries.forEach((_, playerId) => {
      if (playerId && !playerIds.has(playerId)) issues.push({ type: 'orphaned-injury', severity: 'warning', playerId, message: `Injury references missing player ${playerId}.` });
    });

    const byId = new Map();
    const byTeam = new Map();
    const byPosition = new Map();
    players.forEach((player) => {
      if (player.id && !byId.has(player.id)) byId.set(player.id, player);
      const teamKey = player.teamId || '__unassigned__';
      if (!byTeam.has(teamKey)) byTeam.set(teamKey, []);
      byTeam.get(teamKey).push(player);
      if (!byPosition.has(player.position)) byPosition.set(player.position, []);
      byPosition.get(player.position).push(player);
    });

    return { current, provenance, teams, teamIds, players, issues, byId, byTeam, byPosition };
  }

  function playerSort(a, b) {
    const aDepth = a.depthOrder ?? Number.MAX_SAFE_INTEGER;
    const bDepth = b.depthOrder ?? Number.MAX_SAFE_INTEGER;
    return aDepth - bDepth
      || (b.overall ?? -1) - (a.overall ?? -1)
      || (DEV_RANK[upper(b.developmentTrait)] || 0) - (DEV_RANK[upper(a.developmentTrait)] || 0)
      || a.name.localeCompare(b.name);
  }

  function sorted(values) {
    return freeze([...values].sort(playerSort));
  }

  function groupRoster(players) {
    const groups = {
      offense: [], defense: [], specialTeams: [], injuredReserve: [], practiceSquad: [], other: []
    };
    players.forEach((player) => {
      if (player.rosterStatus === 'injured-reserve') groups.injuredReserve.push(player);
      else if (player.rosterStatus === 'practice-squad') groups.practiceSquad.push(player);
      else if (player.positionGroup === 'offense') groups.offense.push(player);
      else if (player.positionGroup === 'defense') groups.defense.push(player);
      else if (player.positionGroup === 'specialTeams') groups.specialTeams.push(player);
      else groups.other.push(player);
    });
    Object.keys(groups).forEach((name) => { groups[name] = sorted(groups[name]); });
    return freeze(groups);
  }

  function getTeamRoster(teamId) {
    const model = normalizeModel();
    const id = text(teamId);
    const team = model.teams.find((item) => text(item.id) === id) || null;
    const players = sorted(model.byTeam.get(id) || []);
    return freeze({
      teamId: id,
      team: team ? freeze(clone(team)) : null,
      found: Boolean(team),
      players,
      groups: groupRoster(players),
      summary: freeze({
        total: players.length,
        active: players.filter((player) => player.rosterStatus === 'active').length,
        injuredReserve: players.filter((player) => player.rosterStatus === 'injured-reserve').length,
        practiceSquad: players.filter((player) => player.rosterStatus === 'practice-squad').length,
        other: players.filter((player) => !['active','injured-reserve','practice-squad'].includes(player.rosterStatus)).length
      }),
      health: getRosterHealth(id, model),
      provenance: model.provenance
    });
  }

  function getPlayersByPosition(teamId, position) {
    const id = text(teamId);
    const pos = upper(position);
    const model = normalizeModel();
    return sorted((model.byTeam.get(id) || []).filter((player) => player.position === pos));
  }

  function findPlayer(playerId) {
    const model = normalizeModel();
    return model.byId.get(text(playerId)) || null;
  }

  function searchPlayers(query) {
    const model = normalizeModel();
    const filters = typeof query === 'object' && query !== null ? query : { query };
    const term = key(filters.query ?? filters.name ?? '');
    const teamId = text(filters.teamId);
    const position = upper(filters.position);
    const status = key(filters.rosterStatus || filters.status);
    const results = model.players.filter((player) => {
      if (term && ![player.name, player.id, player.teamId, player.position].some((value) => key(value).includes(term))) return false;
      if (teamId && player.teamId !== teamId) return false;
      if (position && player.position !== position) return false;
      if (status && player.rosterStatus !== status) return false;
      return true;
    });
    return sorted(results);
  }

  function getFreeAgents() {
    const model = normalizeModel();
    return sorted(model.players.filter((player) => player.rosterStatus === 'free-agent' || player.rosterStatus === 'unassigned'));
  }

  function getRosterHealth(teamId, providedModel = null) {
    const model = providedModel || normalizeModel();
    const id = text(teamId);
    const teamIssues = model.issues.filter((issue) => issue.teamId === id || issue.playerTeamId === id || issue.rosterTeamId === id || array(issue.teamIds).includes(id));
    const teamPlayers = model.byTeam.get(id) || [];
    return freeze({
      teamId: id,
      healthy: !teamIssues.some((issue) => issue.severity === 'error'),
      playerCount: teamPlayers.length,
      errorCount: teamIssues.filter((issue) => issue.severity === 'error').length,
      warningCount: teamIssues.filter((issue) => issue.severity === 'warning').length,
      issues: freeze(teamIssues.map((issue) => freeze(clone(issue))))
    });
  }

  function diagnostics() {
    const model = normalizeModel();
    const errors = model.issues.filter((issue) => issue.severity === 'error');
    const warnings = model.issues.filter((issue) => issue.severity === 'warning');
    return freeze({
      service: 'rosters',
      version: VERSION,
      readOnly: true,
      sourceMode: model.provenance.mode,
      playerCount: model.players.length,
      teamCount: model.teams.length,
      freeAgentCount: getFreeAgents().length,
      issueCount: model.issues.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      healthy: errors.length === 0,
      issues: freeze(model.issues.map((issue) => freeze(clone(issue)))),
      provenance: model.provenance
    });
  }

  const service = HQ.defineModuleService('league', 'rosters', {
    version: VERSION,
    readOnly: true,
    positionGroups: POSITION_GROUPS,
    getTeamRoster,
    getPlayersByPosition,
    findPlayer,
    searchPlayers,
    getFreeAgents,
    getRosterHealth,
    diagnostics
  }, { alias: 'leagueRosters', replace: true });

  HQ.validate.register({
    id: 'roster-read-model',
    name: 'Roster Read Model Foundation',
    version: VERSION,
    tests: [
      { id: 'service', name: 'Roster service registered', run: ({ assert }) => { assert(HQ.hasModuleService('league', 'rosters'), 'Roster service is not registered.'); return { details: { version: service.version } }; } },
      { id: 'readonly', name: 'Roster service read-only contract', run: ({ assert }) => { assert(service.readOnly === true, 'Roster service is not marked read-only.'); assert(Object.isFrozen(service), 'Roster service is mutable.'); return { details: { readOnly: service.readOnly } }; } },
      { id: 'empty-safe', name: 'Empty mode safe results', run: ({ assert }) => { if (!HQ.leagueData.isEmpty()) return { status: 'skip', message: 'Activate Empty mode to run this behavioral check.' }; const result = service.getTeamRoster('missing-team'); assert(result.players.length === 0, 'Empty mode returned players.'); assert(service.searchPlayers('').length === 0, 'Empty mode player search returned records.'); return { details: result.summary }; } },
      { id: 'stable-ids', name: 'Player IDs unique and present', run: ({ assert }) => { const d = service.diagnostics(); const failures = d.issues.filter((issue) => ['missing-player-id','duplicate-player-id'].includes(issue.type)); assert(failures.length === 0, 'Player IDs are missing or duplicated.', failures); return { details: { players: d.playerCount } }; } },
      { id: 'team-assignments', name: 'No duplicate team assignments', run: ({ assert }) => { const failures = service.diagnostics().issues.filter((issue) => ['duplicate-team-assignment','assignment-mismatch'].includes(issue.type)); assert(failures.length === 0, 'Duplicate or mismatched player assignments detected.', failures); return { details: { failures: 0 } }; } },
      { id: 'team-references', name: 'No invalid team references', run: ({ assert }) => { const failures = service.diagnostics().issues.filter((issue) => issue.type === 'invalid-team-reference'); assert(failures.length === 0, 'Invalid team references detected.', failures); return { details: { failures: 0 } }; } },
      { id: 'provenance', name: 'Snapshot provenance exposed', run: ({ assert }) => { const d = service.diagnostics(); assert(d.provenance && Object.prototype.hasOwnProperty.call(d.provenance, 'mode'), 'Roster provenance is unavailable.', d.provenance); return { details: d.provenance }; } },
      { id: 'api', name: 'Roster public API complete', run: ({ assert }) => { ['getTeamRoster','getPlayersByPosition','findPlayer','searchPlayers','getFreeAgents','getRosterHealth','diagnostics'].forEach((name) => assert(typeof service[name] === 'function', `Roster API method ${name} is missing.`)); return { details: Object.keys(service) }; } }
    ]
  });

  HQ.manifest?.register?.({
    scope: 'module', module: 'league', id: 'league-rosters', service: 'rosters', script: 'league-engine/rosters.js', version: VERSION,
    dependencies: ['leagueDataState'],
    capabilities: ['roster-normalization','player-indexes','position-groups','depth-ordering','free-agent-handling','snapshot-provenance','roster-diagnostics','read-only']
  });
})();
