(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineModuleService) throw new Error('platform/core.js must load before companion-json-mapper.js.');

  const VERSION = '5.9.1.1';
  const CONTRACT_VERSION = '1.0';
  const SUPPORTED_POSITIONS = new Set(['QB','HB','RB','FB','WR','TE','LT','LG','C','RG','RT','LE','RE','EDGE','DT','LOLB','MLB','ROLB','LB','CB','FS','SS','S','K','P','LS']);
  let lastPreview = null;

  const freeze = (value) => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  };
  const text = (value, fallback = '') => value == null ? fallback : String(value).trim();
  const numberOrNull = (value) => {
    if (value === '' || value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const first = (object, keys, fallback = undefined) => {
    for (const key of keys) if (object && object[key] != null) return object[key];
    return fallback;
  };
  const arrayFrom = (payload, paths) => {
    for (const path of paths) {
      const value = path.split('.').reduce((current, key) => current?.[key], payload);
      if (Array.isArray(value)) return value;
    }
    return [];
  };
  const normalizeDev = (value) => {
    const raw = text(value, 'Normal').toLowerCase().replace(/[^a-z]/g, '');
    if (raw.includes('xfactor') || raw === 'x') return 'X-Factor';
    if (raw.includes('superstar')) return 'Superstar';
    if (raw === 'star') return 'Star';
    return 'Normal';
  };
  const normalizePosition = (value) => {
    const raw = text(value).toUpperCase();
    const aliases = {HALFBACK:'HB',RUNNINGBACK:'RB',LEFTEND:'LE',RIGHTEND:'RE',DEFENSIVETACKLE:'DT',MIDDLELINEBACKER:'MLB',FREE_SAFETY:'FS',STRONG_SAFETY:'SS'};
    return aliases[raw.replace(/\s+/g,'')] || raw;
  };

  function parse(input) {
    if (input && typeof File !== 'undefined' && input instanceof File) {
      return input.text().then(parse);
    }
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!trimmed) throw new Error('The Companion JSON payload is empty.');
      try { return JSON.parse(trimmed); }
      catch (error) { throw new Error(`The selected file is not valid JSON: ${error.message}`); }
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('The Companion payload must be a JSON object.');
    return input;
  }

  function describePayload(payload) {
    const league = payload.league || payload.leagueInfo || payload.franchise || payload.metadata || {};
    const teams = arrayFrom(payload, ['teams','teamInfoList','league.teams','data.teams','franchise.teams']);
    const players = arrayFrom(payload, ['players','rosters','rosterInfoList','league.players','data.players','franchise.players']);
    return freeze({
      contractVersion: text(first(payload,['contractVersion','schemaVersion','version'], CONTRACT_VERSION)),
      source: text(first(payload,['source','provider'], first(league,['source','provider'],'Madden Companion'))),
      leagueId: text(first(league,['id','leagueId','franchiseId'], first(payload,['leagueId','franchiseId'],''))),
      leagueName: text(first(league,['name','leagueName'], first(payload,['leagueName'],''))),
      season: numberOrNull(first(payload,['season','seasonYear','currentSeason'], first(league,['season','seasonYear','currentSeason'],null))),
      week: numberOrNull(first(payload,['week','currentWeek','seasonWeek'], first(league,['week','currentWeek','seasonWeek'],null))),
      rawTeamCount: teams.length,
      rawPlayerCount: players.length
    });
  }

  function mapTeam(team, index) {
    const id = text(first(team,['id','teamId','teamID','rosterId','maddenTeamId']));
    const city = text(first(team,['city','location','teamCity']));
    const nickname = text(first(team,['nickname','mascot','teamName']));
    const fullName = text(first(team,['fullName','displayName','name'], [city,nickname].filter(Boolean).join(' ')));
    return freeze({
      id,
      name: fullName || nickname || `Team ${index + 1}`,
      city,
      nickname,
      abbreviation: text(first(team,['abbreviation','abbr','shortName','teamAbbr'])).toUpperCase(),
      conference: text(first(team,['conference','confName'])),
      division: text(first(team,['division','divName'])),
      userId: text(first(team,['userId','ownerId','memberId'])),
      sourceIndex: index
    });
  }

  function mapPlayer(player, index) {
    const firstName = text(first(player,['firstName','first']));
    const lastName = text(first(player,['lastName','last']));
    const name = text(first(player,['fullName','displayName','name'], [firstName,lastName].filter(Boolean).join(' ')));
    const position = normalizePosition(first(player,['position','positionAbbr','pos']));
    return freeze({
      id: text(first(player,['id','playerId','playerID','rosterId','maddenId'])),
      name: name || `Player ${index + 1}`,
      firstName,
      lastName,
      teamId: text(first(player,['teamId','teamID','team','rosterTeamId'])),
      position,
      overall: numberOrNull(first(player,['overall','overallRating','ovr'])),
      age: numberOrNull(first(player,['age','playerAge'])),
      developmentTrait: normalizeDev(first(player,['developmentTrait','devTrait','development','dev'])),
      injuryStatus: text(first(player,['injuryStatus','injury','status'],'Healthy')),
      jerseyNumber: numberOrNull(first(player,['jerseyNumber','jersey','number'])),
      college: text(first(player,['college','collegeName','school'])),
      sourceIndex: index
    });
  }

  function validateContract(payload, mapped) {
    const errors = [];
    const warnings = [];
    if (!mapped.metadata.season) errors.push({code:'MISSING_SEASON',message:'The payload does not include a season.'});
    if (mapped.metadata.week == null) errors.push({code:'MISSING_WEEK',message:'The payload does not include a week.'});
    if (!mapped.teams.length) errors.push({code:'NO_TEAMS',message:'No team collection was found in the payload.'});
    if (!mapped.players.length) warnings.push({code:'NO_PLAYERS',message:'No player collection was found. Team mapping can still be previewed.'});

    const teamIds = new Set();
    mapped.teams.forEach((team, index) => {
      if (!team.id) errors.push({code:'TEAM_ID_MISSING',message:`Team row ${index + 1} is missing an ID.`});
      else if (teamIds.has(team.id)) errors.push({code:'TEAM_ID_DUPLICATE',message:`Duplicate team ID: ${team.id}`});
      else teamIds.add(team.id);
      if (!team.abbreviation) warnings.push({code:'TEAM_ABBR_MISSING',message:`${team.name} is missing an abbreviation.`});
    });

    const playerIds = new Set();
    mapped.players.forEach((player, index) => {
      if (!player.id) errors.push({code:'PLAYER_ID_MISSING',message:`Player row ${index + 1} is missing an ID.`});
      else if (playerIds.has(player.id)) errors.push({code:'PLAYER_ID_DUPLICATE',message:`Duplicate player ID: ${player.id}`});
      else playerIds.add(player.id);
      if (player.teamId && !teamIds.has(player.teamId)) errors.push({code:'PLAYER_TEAM_INVALID',message:`${player.name} references unknown team ID ${player.teamId}.`});
      if (!player.position) warnings.push({code:'PLAYER_POSITION_MISSING',message:`${player.name} is missing a position.`});
      else if (!SUPPORTED_POSITIONS.has(player.position)) warnings.push({code:'PLAYER_POSITION_UNKNOWN',message:`${player.name} uses unrecognized position ${player.position}.`});
    });

    if (!text(first(payload,['contractVersion','schemaVersion','version']))) warnings.push({code:'CONTRACT_VERSION_INFERRED',message:`No contract version was supplied; Franchise HQ assumed ${CONTRACT_VERSION}.`});
    return freeze({valid:errors.length===0,status:errors.length?'invalid':'ready',errorCount:errors.length,warningCount:warnings.length,errors,warnings});
  }

  async function preview(input, options = {}) {
    const payload = await parse(input);
    const metadata = describePayload(payload);
    const rawTeams = arrayFrom(payload, ['teams','teamInfoList','league.teams','data.teams','franchise.teams']);
    const rawPlayers = arrayFrom(payload, ['players','rosters','rosterInfoList','league.players','data.players','franchise.players']);
    const mapped = freeze({
      contract: freeze({name:'Franchise HQ Companion JSON',version:CONTRACT_VERSION,release:VERSION}),
      metadata,
      teams: rawTeams.map(mapTeam),
      players: rawPlayers.map(mapPlayer)
    });
    const validation = validateContract(payload, mapped);
    lastPreview = freeze({
      previewId: `companion-preview-${Date.now()}`,
      createdAt: new Date().toISOString(),
      filename: text(options.filename),
      activateSnapshot: false,
      mapped,
      validation
    });
    HQ.events?.emit?.('import:preview-created', {previewId:lastPreview.previewId,valid:validation.valid,teamCount:mapped.teams.length,playerCount:mapped.players.length});
    return lastPreview;
  }

  function clearPreview() { lastPreview = null; return null; }
  function samplePayload() {
    return freeze({
      contractVersion:'1.0',source:'Madden Companion',league:{leagueId:'sample-franchise',name:'FGC Sample',season:2027,week:4},
      teams:[{teamId:'1',city:'Dallas',nickname:'Cowboys',abbr:'DAL'},{teamId:'2',city:'Philadelphia',nickname:'Eagles',abbr:'PHI'}],
      players:[{playerId:'1001',firstName:'Sample',lastName:'Quarterback',teamId:'1',position:'QB',overallRating:88,age:25,devTrait:'Star'},{playerId:'1002',fullName:'Sample Cornerback',teamId:'2',position:'CB',overall:84,age:24,developmentTrait:'Superstar'}]
    });
  }
  function diagnostics() { return freeze({service:'leagueCompanionJsonMapper',version:VERSION,contractVersion:CONTRACT_VERSION,lastPreviewId:lastPreview?.previewId||null,previewOnly:true,snapshotActivation:false,supportedPositions:SUPPORTED_POSITIONS.size}); }

  HQ.defineModuleService('league','leagueCompanionJsonMapper',{parse,preview,clearPreview,getLastPreview:()=>lastPreview,samplePayload,diagnostics},{replace:true,alias:'leagueCompanionJsonMapper'});
  HQ.manifest?.register?.({scope:'module',module:'league',id:'league-companion-json-mapper',service:'leagueCompanionJsonMapper',script:'league-engine/companion-json-mapper.js',version:VERSION,dependencies:['events'],capabilities:['json-file-parsing','payload-contract','team-mapping','player-mapping','preview-only','contract-validation']});
})();
