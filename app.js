(() => {
  'use strict';

  const pageContent = document.querySelector('[data-page-content]');
  const mainContent = document.getElementById('main-content');
  const sidebar = document.querySelector('[data-sidebar]');
  const mobileOverlay = document.querySelector('[data-mobile-overlay]');
  const profileButton = document.querySelector('[data-profile-button]');
  const profileMenu = document.querySelector('[data-profile-menu]');
  const commandModal = document.querySelector('[data-command-modal]');
  const commandInput = document.querySelector('[data-command-input]');
  const commandResults = document.querySelector('[data-command-results]');
  const stylePanel = document.querySelector('[data-style-panel]');
  const panelOverlay = document.querySelector('[data-panel-overlay]');
  const detailModal = document.querySelector('[data-detail-modal]');
  const detailContent = document.querySelector('[data-detail-content]');
  const toastRegion = document.querySelector('[data-toast-region]');
  const body = document.body;

  const FHQ_P4_STYLE_ID='fhq-p4-transactions-rookie-style';
  if(!document.getElementById(FHQ_P4_STYLE_ID)){
    const style=document.createElement('style');
    style.id=FHQ_P4_STYLE_ID;
    style.textContent=`
      .checkbox-filter{display:flex;align-items:center;gap:8px;min-height:38px;white-space:nowrap}
      .checkbox-filter input{width:18px;height:18px;margin:0}
      .player-rookie-filter{min-width:118px}
      .transaction-table-card{padding:0}
      .transaction-table-wrap{margin:0;max-height:620px;overflow:auto}
      .league-transactions-table{width:100%;border-collapse:collapse}
      .league-transactions-table th{position:sticky;top:0;z-index:2;white-space:nowrap}
      .league-transactions-table th,
      .league-transactions-table td{vertical-align:middle}
      .league-transactions-table td:nth-child(3),
      .league-transactions-table td:nth-child(4),
      .league-transactions-table td:nth-child(6){white-space:nowrap}
      .transaction-table-loading{min-height:300px}
      .transaction-skeleton-row span{display:block;height:14px;width:72%;max-width:150px;border-radius:5px;background:rgba(127,127,127,.16)}
      .transaction-skeleton-row td:nth-child(2) span{width:85%}
      .transaction-skeleton-row td:nth-child(4) span{width:36px}
      @media (max-width:720px){
        .transaction-table-wrap{max-height:70vh}
        .league-transactions-table{min-width:760px}
      }
    `;
    document.head.appendChild(style);
  }

  const accents = {
    blue: { hex: '#4f8cff', rgb: '79, 140, 255', label: 'Electric blue' },
    red: { hex: '#ff5b5f', rgb: '255, 91, 95', label: 'League red' },
    green: { hex: '#32d583', rgb: '50, 213, 131', label: 'Field green' },
    purple: { hex: '#9b7cff', rgb: '155, 124, 255', label: 'Prime purple' }
  };

  const state = {
    role: window.FranchiseHQ?.simulation?.getRole?.() || window.FranchiseHQ?.store?.getString?.('m1b-role', 'commissioner') || 'commissioner',
    accent: window.FranchiseHQ?.store?.getString?.('m1b-accent', 'blue') || 'blue',
    density: window.FranchiseHQ?.store?.getString?.('m1b-density', 'comfortable') || 'comfortable',
    teamSearch: '',
    teamConference: 'All',
    teamDivision: 'All',
    playerSearch: '',
    playerPosition: 'All',
    playerTeam: 'All',
    playerStatus: 'All',
    playerDev: 'All',
    playerRookiesOnly: false,
    playerMinOvr: 0,
    playerMaxOvr: 99,
    playerMinAge: 18,
    playerMaxAge: 60,
    playerSort: 'overall-desc',
    playerPage: 1,
    playerPageSize: 100,
    standingsView: 'division',
    confidenceStandingsView: 'season',
    confidenceStandingsWeek: 1,
    statsCategory: 'passing',
    statsScope: 'season',
    statsWeek: 1,
    statsTeam: 'All',
    statsMinimumGames: 0,
    statsSortKey: null,
    statsSortDirection: 'desc',
    statsTeamCategory: 'scoringOffense',
    scheduleWeek: 8,
    scheduleTeam: 'All',
    scheduleSection: 'schedule',
    confidenceWeek: 1,
    newsCategory: 'All',
    teamTab: 'roster',
    rosterGroup: 'All',
    rosterPosition: 'All',
    rosterDev: 'All',
    depthSelectedPlayer: null,
    teamSchedulePhase: 'regular',
    capPosition: 'All',
    capSortKey: 'capHit',
    capSortDirection: 'desc',
    transactionSearch: '',
    transactionType: 'all',
    transactionTeam: 'all',
    activityFilter: 'all',
    featuredGameId: null,
    homeLeaderMetrics: {
      passing: 'passingYards',
      rushing: 'rushingYards',
      receiving: 'receptions',
      defense: 'tackles'
    },
    gameCenterTab: 'team',
    recapFormat: 'landscape',
    recapStyle: 'broadcast'
  };

  const rawTeams = [
    ['BUF','Buffalo','Bills','AFC','East','#1565c0','#d50000'], ['MIA','Miami','Dolphins','AFC','East','#008e97','#fc4c02'],
    ['NE','New England','Patriots','AFC','East','#002244','#c60c30'], ['NYJ','New York','Jets','AFC','East','#125740','#ffffff'],
    ['BAL','Baltimore','Ravens','AFC','North','#241773','#000000'], ['CIN','Cincinnati','Bengals','AFC','North','#fb4f14','#000000'],
    ['CLE','Cleveland','Browns','AFC','North','#311d00','#ff3c00'], ['PIT','Pittsburgh','Steelers','AFC','North','#ffb612','#101820'],
    ['HOU','Houston','Texans','AFC','South','#03202f','#a71930'], ['IND','Indianapolis','Colts','AFC','South','#002c5f','#a2aaad'],
    ['JAX','Jacksonville','Jaguars','AFC','South','#006778','#d7a22a'], ['TEN','Tennessee','Titans','AFC','South','#0c2340','#4b92db'],
    ['DEN','Denver','Broncos','AFC','West','#fb4f14','#002244'], ['KC','Kansas City','Chiefs','AFC','West','#e31837','#ffb81c'],
    ['LV','Las Vegas','Raiders','AFC','West','#000000','#a5acaf'], ['LAC','Los Angeles','Chargers','AFC','West','#0080c6','#ffc20e'],
    ['DAL','Dallas','Cowboys','NFC','East','#003594','#869397'], ['NYG','New York','Giants','NFC','East','#0b2265','#a71930'],
    ['PHI','Philadelphia','Eagles','NFC','East','#004c54','#a5acaf'], ['WAS','Washington','Commanders','NFC','East','#5a1414','#ffb612'],
    ['CHI','Chicago','Bears','NFC','North','#0b162a','#c83803'], ['DET','Detroit','Lions','NFC','North','#0076b6','#b0b7bc'],
    ['GB','Green Bay','Packers','NFC','North','#203731','#ffb612'], ['MIN','Minnesota','Vikings','NFC','North','#4f2683','#ffc62f'],
    ['ATL','Atlanta','Falcons','NFC','South','#a71930','#000000'], ['CAR','Carolina','Panthers','NFC','South','#0085ca','#101820'],
    ['NO','New Orleans','Saints','NFC','South','#d3bc8d','#101820'], ['TB','Tampa Bay','Buccaneers','NFC','South','#d50a0a','#34302b'],
    ['ARI','Arizona','Cardinals','NFC','West','#97233f','#000000'], ['LAR','Los Angeles','Rams','NFC','West','#003594','#ffa300'],
    ['SF','San Francisco','49ers','NFC','West','#aa0000','#b3995d'], ['SEA','Seattle','Seahawks','NFC','West','#002244','#69be28']
  ];

  const owners = ["Strike", "Benny", "Blevins", "Devo", "Yankee", "Dr Malice", "Saluki", "Term", "Carter B", "Domino", "TP", "Antwan", "Broncos", "Turbo", "Casp", "Eddie", "Joey", "Nola", "L1nkin", "Cokills", "Big Red", "Chop", "Gas", "Potato", "Kobe", "Burning Pulse", "Ry", "Peckin", "Big June", "Kpmr", "Mcghee", "Wayneo"];
  const records = [[6,1],[4,3],[3,4],[2,5],[6,1],[4,3],[3,4],[5,2],[5,2],[3,4],[4,3],[2,5],[4,3],[7,0],[3,4],[5,2],[6,1],[3,4],[5,2],[2,5],[3,4],[6,1],[5,2],[4,3],[4,3],[2,5],[3,4],[5,2],[2,5],[4,3],[6,1],[3,4]];

  const teams = rawTeams.map((item, index) => {
    const [abbr, city, name, conference, division, primary, secondary] = item;
    const [wins, losses] = records[index];
    const ovr = seededNumber(`${abbr}-ovr`, 78, 91);
    const off = clamp(ovr + seededNumber(`${abbr}-off`, -4, 4), 75, 94);
    const def = clamp(ovr + seededNumber(`${abbr}-def`, -4, 4), 75, 94);
    const pf = wins * seededNumber(`${abbr}-pfw`, 25, 32) + losses * seededNumber(`${abbr}-pfl`, 17, 24);
    const pa = losses * seededNumber(`${abbr}-paw`, 27, 34) + wins * seededNumber(`${abbr}-pal`, 14, 23);
    return {
      id: abbr.toLowerCase(), abbr, city, name, fullName: `${city} ${name}`, conference, division, primary, secondary,
      owner: owners[index], wins, losses, ties: 0, record: `${wins}-${losses}`, ovr, off, def, pf, pa,
      streak: wins >= 5 ? `W${seededNumber(abbr,2,5)}` : losses >= 5 ? `L${seededNumber(abbr,1,3)}` : seededNumber(abbr,0,1) ? 'W2' : 'L1',
      cap: seededNumber(`${abbr}-cap`, 4, 48) + seededNumber(`${abbr}-capdec`,0,9)/10,
      rank: index + 1,
      divisionRank: 0,
      stadium: `${name} Stadium`,
      coach: `${firstNames()[index % firstNames().length]} ${lastNames()[(index * 3 + 7) % lastNames().length]}`
    };
  });

  [...new Set(teams.map(t => `${t.conference}-${t.division}`))].forEach(key => {
    teams.filter(t => `${t.conference}-${t.division}` === key).sort(sortStandings).forEach((team, index) => { team.divisionRank = index + 1; });
  });

  const positionBlueprint = [
    ['QB',2],['RB',3],['FB',1],['WR',5],['TE',3],['LT',2],['LG',2],['C',2],['RG',2],['RT',2],
    ['LE',2],['RE',2],['DT',3],['LOLB',2],['MLB',3],['ROLB',2],['CB',5],['FS',2],['SS',2],['K',1],['P',1]
  ];
  const offensePositions = ['QB','HB','RB','FB','WR','TE','LT','LG','C','RG','RT'];
  const defensePositions = ['LE','RE','REDG','LEDG','REDGE','LEDGE','EDGE','DT','LOLB','MLB','ROLB','SAM','MIKE','WILL','CB','FS','SS'];
  const specialPositions = ['K','P'];
  const colleges = ['Oklahoma','Ohio State','Alabama','Georgia','Texas','LSU','Michigan','Oregon','Clemson','Penn State','Florida State','USC','Notre Dame','Tennessee','Washington','Miami'];

  const players = [];
  teams.forEach((team, teamIndex) => {
    let rosterIndex = 0;
    positionBlueprint.forEach(([position, count]) => {
      for (let depth = 1; depth <= count; depth += 1) {
        const first = firstNames()[(teamIndex * 5 + rosterIndex * 3 + depth) % firstNames().length];
        const last = lastNames()[(teamIndex * 7 + rosterIndex * 5 + depth * 2) % lastNames().length];
        const positionalBase = position === 'QB' && depth === 1 ? 84 : depth === 1 ? 80 : depth === 2 ? 74 : 69;
        const overall = clamp(positionalBase + seededNumber(`${team.abbr}-${position}-${depth}`, -4, 12), 62, 99);
        const ageBase = depth === 1 ? 25 : depth === 2 ? 24 : 23;
        const age = clamp(ageBase + seededNumber(`${team.abbr}-${position}-${depth}-age`, -2, 8), 21, 36);
        const dev = overall >= 94 ? 'X-Factor' : overall >= 89 ? 'Superstar' : overall >= 83 ? 'Star' : 'Normal';
        const years = clamp(seededNumber(`${team.abbr}-${position}-${depth}-years`, 1, 5), 1, 5);
        const salary = Math.max(0.8, Math.round(((overall - 60) * .72 + seededNumber(`${team.abbr}-${position}-salary`, 0, 8)) * 10) / 10);
        const name = `${first} ${last}`;
        const player = {
          id: `${team.id}-${position.toLowerCase()}-${depth}`,
          name, first, last, initials: `${first[0]}${last[0]}`, teamId: team.id, teamAbbr: team.abbr, teamName: team.fullName,
          position, depth, overall, age, dev, years, salary, capHit: Math.round((salary * .86) * 10) / 10,
          number: playerNumber(position, teamIndex, depth), college: colleges[(teamIndex + rosterIndex + depth) % colleges.length],
          height: playerHeight(position, teamIndex, depth), weight: playerWeight(position, teamIndex, depth),
          tradeBlock: seededNumber(`${team.abbr}-${position}-${depth}-block`,0,9) === 0,
          injury: seededNumber(`${team.abbr}-${position}-${depth}-inj`,0,24) === 0 ? 'Questionable' : 'Healthy'
        };
        player.ratings = createRatings(player);
        player.stats = createPlayerStats(player);
        players.push(player);
        rosterIndex += 1;
      }
    });
  });

  const schedule = buildSchedule();
  const newsArticles = buildNews();
  const pageNames = {
    home: 'League Home', teams: 'Teams', players: 'Players', standings: 'Standings', stats: 'Stats & Leaders',
    schedule: 'Schedule', news: 'News', transactions: 'Transactions', 'trade-center': 'Trade Center', 'trade-block': 'Trade Block',
    commissioner: 'Commissioner HQ', 'player-stats-certification': 'Player Statistics Certification',
  };

  function firstNames() {
    return ['Jalen','Marcus','Devin','Trevor','Cameron','Malik','Jordan','Darius','Xavier','Caleb','Tyler','Brandon','Jayden','Andre','Micah','Justin','Trey','Aiden','Chris','Evan','Noah','Isaiah','Elijah','Bryce','Derrick','Keenan','Rome','Zay','Rashawn','Cole','Mason','Logan','Nico','Jared','Quinn','Kyler','Tanner','Emmett','Dante','Kobe','DeShawn','Amari','Sterling','Jaxon','Cam','Lamar','Troy','Reed'];
  }

  function lastNames() {
    return ['Carter','Mitchell','Brooks','Harris','Johnson','Williams','Anderson','Thomas','Robinson','Lewis','Walker','Young','Hill','Moore','Brown','Taylor','Wilson','Davis','Clark','Allen','King','Wright','Turner','Campbell','Parker','Collins','Reed','Bennett','Foster','Ward','Jenkins','Price','Morris','Cook','Bailey','Cooper','Richardson','Bell','Murphy','Howard','Evans','Stewart','Miller','Adams','Jackson','Thompson','Nelson','James'];
  }

  function seededNumber(seed, min, max) {
    let hash = 2166136261;
    for (let i = 0; i < String(seed).length; i += 1) {
      hash ^= String(seed).charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return min + (Math.abs(hash) % (max - min + 1));
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function sortStandings(a, b) { return b.wins - a.wins || a.losses - b.losses || (b.pf - b.pa) - (a.pf - a.pa); }
  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[ch])); }
  function teamById(id) { return teams.find(team => team.id === id || team.abbr.toLowerCase() === String(id).toLowerCase()); }
  function playerById(id) { return players.find(player => player.id === id); }
  function teamStyle(team) { return `--team:${team.primary};--team2:${team.secondary}`; }
  function formatMoney(value) { return `$${Number(value).toFixed(1)}M`; }
  function percent(value) { return `${Number(value).toFixed(1)}%`; }
  function routeBase(route) { return route.split('/')[0] || 'home'; }

  const PUBLIC_PLAYER_ID_PATTERN=/^plr_[a-f0-9]{32}$/;

  function leagueBasePath(locationValue=window.location) {
    const match=String(locationValue.pathname||'').match(/^\/leagues\/([^/]+)/i);
    return match?`/leagues/${encodeURIComponent(decodeURIComponent(match[1]))}`:'';
  }

  function routeFromPublicLocation(locationValue=window.location) {
    const match=String(locationValue.pathname||'').match(/^\/leagues\/[^/]+\/(teams|players)\/([^/]+)\/?$/i);
    if(!match)return null;
    try{return `${match[1].toLowerCase()}/${decodeURIComponent(match[2])}`}
    catch{return null}
  }

  function currentAppRoute() {
    return window.FranchiseHQ?.navigation?.currentRoute?.()
      || routeFromPublicLocation(window.location)
      || String(window.location.hash||'').replace(/^#\/?/,'')
      || 'home';
  }

  function safeTeamSlug(value='') {
    const slug=String(value||'').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-|-$/g,'');
    return /^[a-z0-9][a-z0-9._-]{0,31}$/.test(slug)?slug:null;
  }

  function teamForPublicRoute(value='') {
    const wanted=String(value||'').toLowerCase();
    const collection=liveTeamDirectory?.teams||teams;
    return collection.find(team=>[team.id,team.slug,team.teamKey,team.abbr,team.abbreviation]
      .some(candidate=>String(candidate||'').toLowerCase()===wanted))||null;
  }

  function playerForPublicRoute(value='') {
    const wanted=String(value||'').toLowerCase();
    const collection=liveTeamDirectory?.players||players;
    return collection.find(player=>[player.id,player.publicId]
      .some(candidate=>String(candidate||'').toLowerCase()===wanted))||null;
  }

  function publicUrlForRoute(route='home') {
    const basePath=leagueBasePath();
    if(!basePath)return null;
    const normalized=String(route||'home').replace(/^#\/?/,'').replace(/^\/+|\/+$/g,'')||'home';
    const [base,id]=normalized.split('/');
    if(base==='teams'&&id){
      const team=teamForPublicRoute(id);
      const teamSlug=safeTeamSlug(team?.slug||team?.teamKey||team?.abbr||(safeTeamSlug(id)&&id));
      if(teamSlug)return `${basePath}/teams/${encodeURIComponent(teamSlug)}`;
      return `${basePath}#${normalized}`;
    }
    if(base==='players'&&id){
      const player=playerForPublicRoute(id);
      const publicId=String(player?.publicId||id).toLowerCase();
      if(PUBLIC_PLAYER_ID_PATTERN.test(publicId))return `${basePath}/players/${encodeURIComponent(publicId)}`;
      return `${basePath}#${normalized}`;
    }
    return `${basePath}#${normalized}`;
  }

  function replaceCurrentPublicUrl(route) {
    const url=publicUrlForRoute(route);
    if(!url)return false;
    const current=`${location.pathname}${location.search}${location.hash}`;
    if(current!==url)history.replaceState({franchiseHqRoute:route},'',url);
    return true;
  }

  let publicPlayerReturnRoute=null;

  const GOTW_STORAGE_KEY = 'franchisehq:home.gotw.v1';
  function readGotwSelections() {
    try { return JSON.parse(localStorage.getItem(GOTW_STORAGE_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function currentHomeWeek() {
    return schedule.find(week => Number(week.week) === Number(state.scheduleWeek || 8)) || schedule.find(week => Number(week.week) === 8) || schedule[0];
  }
  function officialGotwId(weekNumber = currentHomeWeek()?.week) {
    const selections = readGotwSelections();
    return selections[String(weekNumber)] || null;
  }
  function saveOfficialGotw(weekNumber, gameId) {
    const week = schedule.find(item => Number(item.week) === Number(weekNumber));
    if (!week || !week.games.some(game => String(game.id) === String(gameId))) return { ok:false, error:'The selected matchup is not available for this week.' };
    const selections = readGotwSelections();
    selections[String(weekNumber)] = String(gameId);
    localStorage.setItem(GOTW_STORAGE_KEY, JSON.stringify(selections));
    window.dispatchEvent(new CustomEvent('franchisehq:gotw-changed', { detail:{ week:Number(weekNumber), gameId:String(gameId) } }));
    return { ok:true, gameId:String(gameId) };
  }
  function allTimeTeamProfile(team) {
    const games = seededNumber(`${team.abbr}-all-time-games`, 210, 430);
    const wins = seededNumber(`${team.abbr}-all-time-wins`, Math.floor(games * .38), Math.floor(games * .67));
    const titles = seededNumber(`${team.abbr}-sb-titles`, 0, 6);
    return { games, wins, winPct: games ? wins / games : 0, superBowlTitles: titles };
  }
  function gotwWeekModel(weekNumber = currentHomeWeek()?.week) {
    const week = schedule.find(item => Number(item.week) === Number(weekNumber)) || currentHomeWeek();
    return {
      week: Number(week?.week || weekNumber || 1),
      officialGameId: officialGotwId(week?.week),
      games: (week?.games || []).map(game => {
        const away = teamById(game.awayId), home = teamById(game.homeId);
        const mapTeam = team => ({
          id:team.id, abbr:team.abbr, fullName:team.fullName, owner:team.owner, record:team.record,
          seasonWinPct:(Number(team.wins)||0) / Math.max(1,(Number(team.wins)||0)+(Number(team.losses)||0)+(Number(team.ties)||0)),
          ...allTimeTeamProfile(team)
        });
        return { ...game, away:mapTeam(away), home:mapTeam(home) };
      })
    };
  }

  function playerNumber(position, teamIndex, depth) {
    const ranges = { QB:[1,19], RB:[20,39], FB:[30,49], WR:[1,19], TE:[80,89], LT:[60,79], LG:[60,79], C:[50,69], RG:[60,79], RT:[60,79], LE:[90,99], RE:[90,99], DT:[90,99], LOLB:[40,59], MLB:[40,59], ROLB:[40,59], CB:[20,39], FS:[20,39], SS:[20,39], K:[1,19], P:[1,19] };
    const [min,max] = ranges[position] || [1,99];
    return min + ((teamIndex * 3 + depth * 7) % (max - min + 1));
  }

  function playerHeight(position, teamIndex, depth) {
    const base = ['LT','LG','C','RG','RT','DT'].includes(position) ? 76 : ['WR','CB','FS','SS'].includes(position) ? 72 : 73;
    const inches = base + seededNumber(`${position}-${teamIndex}-${depth}-h`, -2, 3);
    return `${Math.floor(inches / 12)}'${inches % 12}\"`;
  }

  function playerWeight(position, teamIndex, depth) {
    const bases = { QB:222,RB:212,FB:242,WR:198,TE:248,LT:315,LG:310,C:305,RG:310,RT:318,LE:270,RE:266,DT:310,LOLB:245,MLB:242,ROLB:244,CB:194,FS:202,SS:210,K:198,P:205 };
    return (bases[position] || 220) + seededNumber(`${position}-${teamIndex}-${depth}-w`, -12, 14);
  }

  function createRatings(player) {
    const common = {
      Speed: clamp(player.overall + seededNumber(`${player.id}-spd`,-8,8),55,99),
      Acceleration: clamp(player.overall + seededNumber(`${player.id}-acc`,-7,8),55,99),
      Awareness: clamp(player.overall + seededNumber(`${player.id}-awr`,-10,7),50,99),
      Strength: clamp(player.overall + seededNumber(`${player.id}-str`,-12,10),45,99),
      Agility: clamp(player.overall + seededNumber(`${player.id}-agi`,-9,9),48,99)
    };
    const specific = offensePositions.includes(player.position)
      ? { 'Ball Carrier Vision': clamp(player.overall + seededNumber(`${player.id}-bcv`,-9,8),45,99), 'Catch / Block': clamp(player.overall + seededNumber(`${player.id}-skill`,-7,8),45,99) }
      : defensePositions.includes(player.position)
        ? { Tackling: clamp(player.overall + seededNumber(`${player.id}-tak`,-8,9),45,99), Coverage: clamp(player.overall + seededNumber(`${player.id}-cov`,-10,9),40,99) }
        : { KickPower: clamp(player.overall + seededNumber(`${player.id}-kp`,-4,8),65,99), Accuracy: clamp(player.overall + seededNumber(`${player.id}-ka`,-6,7),60,99) };
    if (player.position === 'QB') specific['Throw Power'] = clamp(player.overall + seededNumber(`${player.id}-tp`,-4,8),70,99);
    if (['WR','TE','RB'].includes(player.position)) specific.Catching = clamp(player.overall + seededNumber(`${player.id}-cth`,-4,8),60,99);
    if (['CB','FS','SS'].includes(player.position)) specific['Man Coverage'] = clamp(player.overall + seededNumber(`${player.id}-man`,-5,8),55,99);
    return { ...common, ...specific };
  }

  function createPlayerStats(player) {
    const games = 7;
    const s = seed => seededNumber(`${player.id}-${seed}`,0,9999);
    if (player.position === 'QB') {
      const attempts = 170 + (s('att') % 115); const completions = Math.round(attempts * (.57 + (s('pct') % 120)/1000));
      return { games, passingYards: 1250 + (s('py') % 1350), passingTD: 8 + (s('ptd') % 18), interceptions: 2 + (s('int') % 10), attempts, completions, compPct: completions/attempts*100, rushingYards: s('qry') % 420, rushingTD: s('qrtd') % 6, fumbles: s('qfum') % 5, fantasy: 105 + (s('fp') % 900)/10 };
    }
    if (['RB','FB'].includes(player.position)) {
      return { games, carries: 45 + (s('car') % 115), rushingYards: 220 + (s('ry') % 770), rushingTD: 1 + (s('rtd') % 10), receptions: 8 + (s('rec') % 35), receivingYards: 55 + (s('rey') % 360), receivingTD: s('retd') % 5, fumbles: s('fum') % 5, fantasy: 55 + (s('fp') % 950)/10 };
    }
    if (['WR','TE'].includes(player.position)) {
      return { games, receptions: 14 + (s('rec') % 55), targets: 25 + (s('tgt') % 70), receivingYards: 180 + (s('rey') % 850), receivingTD: 1 + (s('retd') % 9), yardsPerCatch: 9 + (s('ypc') % 95)/10, fantasy: 45 + (s('fp') % 970)/10 };
    }
    if (defensePositions.includes(player.position)) {
      return { games, tackles: 16 + (s('tak') % 60), sacks: (s('sck') % 95)/10, interceptions: s('di') % 6, forcedFumbles: s('ff') % 4, passDeflections: 1 + (s('pd') % 11), defensiveTD: s('dtd') % 3, fantasy: 28 + (s('fp') % 760)/10 };
    }
    if (player.position === 'K') {
      const fga = 9 + (s('fga') % 14); const fgm = Math.max(0, fga - (s('miss') % 4));
      return { games, fgm, fga, fgPct: fgm/fga*100, long: 43 + (s('long') % 18), points: fgm*3 + 16 + (s('xp') % 14), fantasy: fgm*3 + (s('fp') % 120)/10 };
    }
    return { games, punts: 22 + (s('punts') % 18), average: 42 + (s('avg') % 80)/10, inside20: 5 + (s('i20') % 14), long: 52 + (s('long') % 18), fantasy: 0 };
  }

  function buildSchedule() {
    const weeks = [];
    const rotation = [...teams];
    for (let week = 1; week <= 9; week += 1) {
      const games = [];
      for (let i = 0; i < rotation.length / 2; i += 1) {
        const first = rotation[i];
        const second = rotation[rotation.length - 1 - i];
        const home = (week + i) % 2 === 0 ? first : second;
        const away = home === first ? second : first;
        let status = week < 8 ? 'final' : week === 8 && i < 5 ? 'final' : week === 8 && i === 5 ? 'live' : 'scheduled';
        const awayScore = status === 'scheduled' ? null : seededNumber(`${week}-${away.abbr}-${home.abbr}-a`, 13, 38);
        const homeScore = status === 'scheduled' ? null : seededNumber(`${week}-${away.abbr}-${home.abbr}-h`, 14, 41);
        games.push({
          id: `w${week}-${away.id}-${home.id}`, week, awayId: away.id, homeId: home.id, awayScore, homeScore, status,
          day: week === 8 && i === 0 ? 'THU' : i === 15 ? 'MON' : 'SUN',
          time: week === 8 && i === 5 ? 'Q3 · 4:12' : i === 15 ? '8:15 PM' : i % 5 === 0 ? '4:25 PM' : '1:00 PM',
          network: i === 0 ? 'PRIME' : i === 15 ? 'MNF' : i % 5 === 0 ? 'FOX' : 'CBS',
          stadium: home.stadium,
          headline: `${away.city} travels to ${home.city} for a Week ${week} matchup.`
        });
      }
      weeks.push({ week, games });
      const fixed = rotation[0];
      const rest = rotation.slice(1);
      rest.unshift(rest.pop());
      rotation.splice(0, rotation.length, fixed, ...rest);
    }
    return weeks;
  }

  function buildNews() {
    return [
      { id:'power-rankings-8', category:'Power Rankings', mark:'01', title:'Week 8 Power Rankings: Chiefs hold the top spot as Cowboys surge', excerpt:'Kansas City remains unbeaten, but Dallas and Baltimore are closing the gap as the playoff race starts to take shape.', author:'League Media', time:'18 minutes ago', read:'5 min read', featured:true },
      { id:'trade-approved-miami', category:'Trades', mark:'TR', title:'Miami and Las Vegas complete the season’s biggest defensive trade', excerpt:'The Dolphins add a veteran corner while Las Vegas secures a young starter and a future selection.', author:'Transaction Desk', time:'42 minutes ago', read:'3 min read' },
      { id:'week-eight-advance', category:'Commissioner', mark:'FGC', title:'Commissioner confirms Thursday night Week 8 advance', excerpt:'All remaining games must be completed and submitted before the scheduled advance window.', author:'Justin · Commissioner', time:'2 hours ago', read:'2 min read' },
      { id:'ravens-bengals-recap', category:'Game Recap', mark:'31', title:'Baltimore survives late Cincinnati rally in 31–24 division win', excerpt:'A fourth-quarter interception sealed the result after Cincinnati cut a 17-point lead to one possession.', author:'GameWire', time:'4 hours ago', read:'4 min read' },
      { id:'players-of-week', category:'Awards', mark:'MVP', title:'Players of the Week announced after a record-setting slate', excerpt:'A 412-yard quarterback performance and a four-sack defensive effort headline this week’s winners.', author:'League Media', time:'Yesterday', read:'3 min read' },
      { id:'trade-block-watch', category:'Trade Block', mark:'TB', title:'Five names to monitor before the committee deadline', excerpt:'Several contending teams have added veterans to the block as owners look to reshape their rosters.', author:'Transaction Desk', time:'Yesterday', read:'6 min read' },
      { id:'playoff-picture', category:'Analysis', mark:'7', title:'Playoff picture: three division races separated by one game', excerpt:'The NFC East, AFC South, and NFC West remain wide open entering the second half of the season.', author:'League Media', time:'2 days ago', read:'5 min read' }
    ];
  }

  function renderTeamMark(team, className = 'mini-team') {
    const logo=team?.logo||team?.logoUrl||team?.source?.logo_url||team?.source?.logoUrl||null;
    const label=escapeHtml(team?.abbr||team?.abbreviation||'—');
    return `<span class="${className}" style="${teamStyle(team||{})}">${logo?`<img src="${escapeHtml(logo)}" alt="${escapeHtml(team?.fullName||team?.displayName||label)} logo" loading="lazy" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:contain" onerror="this.remove();this.parentElement.querySelector('[data-team-mark-fallback]').style.display='grid'">`:''}<span data-team-mark-fallback style="${logo?'display:none;':'display:grid;'}width:100%;height:100%;place-items:center">${label}</span></span>`;
  }

  function renderPlayerIdentity(player, includeTeam = true) {
    const team = teamById(player.teamId);
    return `<div class="table-player"><span class="player-avatar" style="${teamStyle(team)}">${player.initials}</span><div><strong>${escapeHtml(player.name)}</strong><small>${includeTeam ? `${player.position} · ${team.abbr}` : `${player.position} · #${player.number}`}</small></div></div>`;
  }

  function devClass(dev) {
    const raw=dev===null||dev===undefined?'Normal':dev;
    const n=Number(raw);
    const label=Number.isFinite(n)&&String(raw).trim()!==''
      ? (n>=3?'X-Factor':n===2?'Superstar':n===1?'Star':'Normal')
      : String(raw);
    return `dev-badge--${label.toLowerCase().replace(/[^a-z]/g,'')}`;
  }

  function depthDevelopmentClass(dev) {
    const value=String(dev || 'Normal').toLowerCase().replace(/[^a-z]/g,'');
    if (value.includes('xfactor')) return 'formation-dev--xfactor';
    if (value.includes('superstar')) return 'formation-dev--superstar';
    if (value === 'star') return 'formation-dev--star';
    return 'formation-dev--normal';
  }


  function gameForTeamWeek(teamId, weekNumber) {
    return schedule.find(w=>w.week===weekNumber)?.games.find(g=>g.homeId===teamId||g.awayId===teamId) || null;
  }

  function opponentForGame(game, teamId) {
    if (!game) return null;
    return teamById(game.homeId===teamId ? game.awayId : game.homeId);
  }

  function previousGameCopy(teamId, weekNumber) {
    const game=gameForTeamWeek(teamId, Math.max(1,weekNumber-1));
    if (!game) return 'No previous result';
    const opponent=opponentForGame(game,teamId);
    if (game.status!=='final') return `vs ${opponent.abbr} · Scheduled`;
    const teamScore=game.homeId===teamId?game.homeScore:game.awayScore;
    const oppScore=game.homeId===teamId?game.awayScore:game.homeScore;
    return `${teamScore>oppScore?'W':'L'} ${teamScore}-${oppScore} vs ${opponent.abbr}`;
  }

  function topUnitPlayers(teamId, unit) {
    const positions=unit==='offense'?offensePositions:defensePositions;
    return players.filter(p=>p.teamId===teamId&&positions.includes(p.position))
      .sort((a,b)=>b.overall-a.overall||a.name.localeCompare(b.name)).slice(0,3);
  }

  function renderFeaturedPlayerRow(player) {
    return `<button type="button" class="featured-player-row" data-player-id="${player.id}">
      <span><strong>${escapeHtml(player.name)}</strong><small>${player.position}</small></span>
      <span class="rating-chip ${player.overall>=90?'rating-chip--elite':player.overall>=84?'rating-chip--high':''}">${player.overall}</span>
      <span class="dev-badge ${devClass(player.dev)}">${player.dev}</span>
    </button>`;
  }

  function playoffHuntRows(conference) {
    const conferenceTeams=teams.filter(team=>team.conference===conference);
    const divisions=[...new Set(conferenceTeams.map(team=>team.division))];
    const divisionLeaders=divisions
      .map(division=>conferenceTeams.filter(team=>team.division===division).sort(sortStandings)[0])
      .filter(Boolean)
      .sort(sortStandings);
    const leaderIds=new Set(divisionLeaders.map(team=>team.id));
    const remaining=conferenceTeams.filter(team=>!leaderIds.has(team.id)).sort(sortStandings);
    const wildCards=remaining.slice(0,3);
    const inHunt=remaining.slice(3,6);
    const rows=[
      ...divisionLeaders.map(team=>({team,type:'Division leader'})),
      ...wildCards.map(team=>({team,type:'Wild card'})),
      ...inHunt.map(team=>({team,type:'In the hunt'}))
    ];
    const conferenceLeader=[...conferenceTeams].sort(sortStandings)[0];
    return rows.slice(0,10).map((row,index)=>{
      const team=row.team;
      const gamesPlayed=(Number(team.wins)||0)+(Number(team.losses)||0)+(Number(team.ties)||0);
      const winPct=gamesPlayed?((Number(team.wins)||0)+((Number(team.ties)||0)*0.5))/gamesPlayed:0;
      const gamesBehind=conferenceLeader
        ? (((Number(conferenceLeader.wins)||0)-(Number(team.wins)||0))+((Number(team.losses)||0)-(Number(conferenceLeader.losses)||0)))/2
        : 0;
      return {...row,seed:index+1,winPct,gamesBehind:Math.max(0,gamesBehind)};
    });
  }

  function renderConferenceSnapshot(conference) {
    const ranked=playoffHuntRows(conference);
    return `<article class="card home-standings-card">
      <div class="card-header"><div><span class="eyebrow">Playoff picture</span><h3>${conference} Standings</h3></div><button class="text-button" data-route="standings">View all <svg><use href="#icon-arrow"></use></svg></button></div>
      <div class="home-standings-columns" aria-hidden="true"><span>Rank</span><span>Team</span><span>Record</span></div>
      <div class="home-standings-list">
        ${ranked.map(({team,type,seed})=>`<button type="button" data-team-id="${team.id}" data-route="teams/${team.id}" class="${seed===8?'wildcard-cutline':''}">
          <span class="seed">${seed}</span>${renderTeamMark(team)}
          <span class="home-standings-team"><strong>${team.fullName}</strong><small>${type}</small></span>
          <strong class="home-standings-record">${team.record}${team.ties?`-${team.ties}`:''}</strong>
        </button>`).join('')}
      </div>
    </article>`;
  }

  function leaderMetricConfig(category) {
    const metric=state.homeLeaderMetrics[category];
    const configs={
      passing:{
        positions:['QB'],
        tabs:[['passingYards','Yards'],['passingTD','TDs'],['interceptions','INTs']]
      },
      rushing:{
        positions:['RB','FB','QB'],
        tabs:[['rushingYards','Yards'],['rushingTD','TDs'],['fumbles','Fumbles']]
      },
      receiving:{
        positions:['WR','TE','RB','FB'],
        tabs:[['receptions','Rec'],['receivingYards','Yards'],['receivingTD','TDs']]
      },
      defense:{
        positions:defensePositions,
        tabs:[['tackles','TKLs'],['sacks','Sacks'],['interceptions','INTs']]
      }
    };
    return {...configs[category],metric};
  }

  function renderHomeLeaderCard(category,title) {
    const cfg=leaderMetricConfig(category);
    const eligible=players.filter(p=>cfg.positions.includes(p.position)&&p.stats[cfg.metric]!==undefined)
      .sort((a,b)=>Number(b.stats[cfg.metric]||0)-Number(a.stats[cfg.metric]||0)||a.name.localeCompare(b.name)).slice(0,10);
    return `<article class="card home-leader-card home-leader-card--${category}">
      <div class="card-header home-leader-card__header">
        <div><h3>${title}</h3></div>
        <div class="mini-toggle" role="group" aria-label="${title} leaderboard statistic">
          ${cfg.tabs.map(([key,label])=>`<button type="button" data-home-leader-category="${category}" data-home-leader-metric="${key}" class="${cfg.metric===key?'is-active':''}">${label}</button>`).join('')}
        </div>
      </div>
      <div class="home-leader-columns"><span>#</span><span>Player</span><span>${escapeHtml(cfg.tabs.find(([key])=>key===cfg.metric)?.[1]||'Value')}</span></div>
      <div class="home-leader-list">${eligible.map((player,index)=>`<button type="button" data-player-id="${player.id}">
        <span class="leader-rank">${index+1}</span>
        <span class="home-leader-player"><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.position)} · ${escapeHtml(teamById(player.teamId)?.abbr||'FA')}</small></span>
        <strong class="home-leader-value">${formatStatValue(cfg.metric,player.stats[cfg.metric])}</strong>
      </button>`).join('')||`<div class="home-leader-empty">No statistics available.</div>`}</div>
    </article>`;
  }

  function renderLeagueNewsTicker() {
    const approvedNews = window.FGC_TRADE?.getApprovedNews?.() || [];
    const items = [...approvedNews, ...newsArticles]
      .filter(item => item && item.id && item.title)
      .slice(0, 12);
    if (!items.length) return '';
    const tickerItems = items.map((item,index)=>{
      const summary = item.excerpt || item.summary || item.story || item.detail || 'Open the full story for the latest league update.';
      return `<button type="button" class="league-news-ticker__item" data-news-id="${escapeHtml(item.id)}" aria-label="Open headline: ${escapeHtml(item.title)}">
        <span class="league-news-ticker__category">${escapeHtml(item.category || 'League News')}</span>
        <span class="league-news-ticker__copy">
          <span class="league-news-ticker__headline">${escapeHtml(item.title)}</span>
          <span class="league-news-ticker__summary">${escapeHtml(summary)}</span>
        </span>
        <span class="league-news-ticker__separator" aria-hidden="true">•</span>
      </button>`;
    }).join('');
    return `<section class="league-news-ticker" aria-label="League headlines">
      <div class="league-news-ticker__label"><svg><use href="#icon-news"></use></svg><span>League Headlines</span></div>
      <div class="league-news-ticker__viewport">
        <div class="league-news-ticker__track">
          <div class="league-news-ticker__group">${tickerItems}</div>
          <div class="league-news-ticker__group" aria-hidden="true">${tickerItems}</div>
        </div>
      </div>
    </section>`;
  }

  function renderLeagueHomeLegacy() {
    const currentWeek=currentHomeWeek();
    const availableGames=currentWeek.games;
    const officialGameId=officialGotwId(currentWeek.week);
    if(!state.featuredGameId||!availableGames.some(g=>g.id===state.featuredGameId)){
      const ranked=[...availableGames].sort((a,b)=>{
        const ar=teamById(a.awayId).wins+teamById(a.homeId).wins;
        const br=teamById(b.awayId).wins+teamById(b.homeId).wins;
        return br-ar;
      });
      state.featuredGameId=availableGames.some(game=>String(game.id)===String(officialGameId))?officialGameId:ranked[0]?.id;
    }
    const featured=availableGames.find(g=>g.id===state.featuredGameId)||availableGames[0];
    const isOfficialGotw=String(featured.id)===String(officialGameId);
    const away=teamById(featured.awayId),home=teamById(featured.homeId);
    const awayOff=topUnitPlayers(away.id,'offense'),homeOff=topUnitPlayers(home.id,'offense');
    const awayDef=topUnitPlayers(away.id,'defense'),homeDef=topUnitPlayers(home.id,'defense');
    const recentNews=newsArticles.slice(0,3);

    pageContent.innerHTML=`
      <div class="page-heading league-home-heading">
        <div><span class="eyebrow">Season 4 · Week ${currentWeek.week}</span><h1>League Home</h1></div>
        <div class="heading-actions"><button class="button button--ghost" data-route="league-activity"><svg><use href="#icon-activity"></use></svg>League Activity</button><button class="button button--primary" data-route="schedule"><svg><use href="#icon-calendar"></use></svg>Full Schedule</button></div>
      </div>

      ${renderLeagueNewsTicker()}

      <section class="week-ribbon-wrap">
        <div class="week-ribbon">
          ${availableGames.map(game=>{
            const a=teamById(game.awayId),h=teamById(game.homeId),done=game.status==='final';
            return `<button type="button" class="week-matchup-card ${game.id===featured.id?'is-active':''}" data-feature-game="${game.id}">
              <span class="week-matchup-time">${game.day} · ${done?'Final':game.time}</span>
              <span class="week-matchup-team">${renderTeamMark(a)}<strong>${a.abbr}</strong><small>${done?game.awayScore:a.record}</small></span>
              <span class="week-matchup-team">${renderTeamMark(h)}<strong>${h.abbr}</strong><small>${done?game.homeScore:h.record}</small></span>
              <span class="week-matchup-network">${game.network}</span>
            </button>`;
          }).join('')}
        </div>
      </section>

      <div class="league-home-main">
        <div class="league-home-primary">
          <section class="featured-game featured-game--opens-matchup card" data-game-id="${featured.id}" role="button" tabindex="0" aria-label="Open matchup card" style="--away-primary:${away.primary};--away-secondary:${away.secondary||away.primary};--home-primary:${home.primary};--home-secondary:${home.secondary||home.primary};background:linear-gradient(90deg, ${away.primary} 0%, ${away.secondary||away.primary} 49.9%, ${home.primary} 50.1%, ${home.secondary||home.primary} 100%) !important;background-image:linear-gradient(90deg, ${away.primary} 0%, ${away.secondary||away.primary} 49.9%, ${home.primary} 50.1%, ${home.secondary||home.primary} 100%) !important;">
          <div class="featured-game-label" style="background:linear-gradient(90deg, ${away.primary} 0%, ${away.secondary||away.primary} 49.9%, ${home.primary} 50.1%, ${home.secondary||home.primary} 100%) !important;background-image:linear-gradient(90deg, ${away.primary} 0%, ${away.secondary||away.primary} 49.9%, ${home.primary} 50.1%, ${home.secondary||home.primary} 100%) !important;position:relative;z-index:5;">
            <span>${isOfficialGotw?'★ Game of the Week':'Selected Matchup'}</span>
            <small>${featured.day} · ${featured.time} · ${featured.network} · ${featured.stadium}</small>
          </div>

          <div class="featured-split featured-split--clickable" aria-label="Open Game Center">
            <div class="featured-half featured-half--away team-gradient-card" style="--team-primary:${away.primary};--team-secondary:${away.secondary||away.primary};background:linear-gradient(135deg, ${away.primary}, ${away.secondary||away.primary}) !important;background-image:linear-gradient(135deg, ${away.primary}, ${away.secondary||away.primary}) !important;">
              <div class="featured-half-hero">
                ${renderTeamMark(away,'featured-team-logo')}
                <div class="featured-half-copy">
                  <span class="eyebrow">${away.city}</span>
                  <h2>${away.name}</h2>
                  <p>${away.record} · Owner: ${escapeHtml(away.owner)}</p>
                  <div class="previous-result"><span>Previous game</span><strong>${previousGameCopy(away.id,currentWeek.week)}</strong></div>
                </div>
              </div>
              <div class="featured-unit-stack">
                <div class="featured-unit">
                  <span class="eyebrow">Top Offense</span>
                  ${awayOff.map(renderFeaturedPlayerRow).join('')}
                </div>
                <div class="featured-unit">
                  <span class="eyebrow">Top Defense</span>
                  ${awayDef.map(renderFeaturedPlayerRow).join('')}
                </div>
              </div>
            </div>
<div class="featured-half featured-half--home team-gradient-card team-gradient-card--home" style="--team-primary:${home.primary};--team-secondary:${home.secondary||home.primary};background:linear-gradient(225deg, ${home.primary}, ${home.secondary||home.primary}) !important;background-image:linear-gradient(225deg, ${home.primary}, ${home.secondary||home.primary}) !important;">
              <div class="featured-half-hero featured-half-hero--home">
                <div class="featured-half-copy">
                  <span class="eyebrow">${home.city}</span>
                  <h2>${home.name}</h2>
                  <p>${home.record} · Owner: ${escapeHtml(home.owner)}</p>
                  <div class="previous-result"><span>Previous game</span><strong>${previousGameCopy(home.id,currentWeek.week)}</strong></div>
                </div>
                ${renderTeamMark(home,'featured-team-logo')}
              </div>
              <div class="featured-unit-stack">
                <div class="featured-unit">
                  <span class="eyebrow">Top Offense</span>
                  ${homeOff.map(renderFeaturedPlayerRow).join('')}
                </div>
                <div class="featured-unit">
                  <span class="eyebrow">Top Defense</span>
                  ${homeDef.map(renderFeaturedPlayerRow).join('')}
                </div>
              </div>
            </div>
          </div>
        </section>

        </div>

        <aside class="league-home-standings">
          ${renderConferenceSnapshot('AFC')}
          ${renderConferenceSnapshot('NFC')}
        </aside>

        <section class="home-leaders-section home-leaders-section--embedded">
          <div class="section-heading home-leaders-heading"><div><span class="section-number">02</span><h2>Stat Leaders</h2></div><button class="text-button" data-route="stats">View Full Leaderboard <svg><use href="#icon-arrow"></use></svg></button></div>
          <div class="home-leaders-grid home-leaders-grid--embedded">
            ${renderHomeLeaderCard('passing','Passing')}
            ${renderHomeLeaderCard('rushing','Rushing')}
            ${renderHomeLeaderCard('receiving','Receiving')}
            ${renderHomeLeaderCard('defense','Defense')}
          </div>
        </section>
      </div>
`;
  }


  function liveReadModel() { return window.FranchiseHQ?.liveData || null; }
  function liveTeamShape(team={}) {
    const source=team.source||{};
    const wins=Number(team.record?.wins ?? source.totalWins ?? source.wins ?? 0);
    const losses=Number(team.record?.losses ?? source.totalLosses ?? source.losses ?? 0);
    const ties=Number(team.record?.ties ?? source.totalTies ?? source.ties ?? 0);
    return {
      id:String(team.id||''),
      fullName:team.displayName||[team.city,team.nickname].filter(Boolean).join(' ')||team.abbreviation||'Unknown Team',
      city:team.city||source.cityName||'',
      name:team.nickname||source.nickName||team.displayName||'',
      abbr:team.abbreviation||source.abbrName||String(team.id||'').slice(0,3).toUpperCase(),
      conference:team.conference||source.conferenceName||source.confName||'',
      division:team.division||source.divisionName||source.divName||'',
      primary:team.primaryColor||source.primaryColor||'#242a36',
      secondary:team.secondaryColor||source.secondaryColor||'#ffffff',
      logo:team.logo||source.logoUrl||source.logo||null,
      owner:team.owner||'Unassigned',
      wins,losses,ties,record:`${wins}-${losses}${ties?`-${ties}`:''}`
    };
  }
  function liveStandingShape(row={},teamMap=new Map()) {
    const source=row.source||{};
    const team=teamMap.get(String(row.teamId))||{};
    const wins=Number(row.wins??source.totalWins??0),losses=Number(row.losses??source.totalLosses??0),ties=Number(row.ties??source.totalTies??0);
    const games=wins+losses+ties;
    const pct=Number(row.winPct??source.winPct??(games?(wins+ties*.5)/games:0));
    const pf=Number(source.ptsFor??source.pointsFor??0),pa=Number(source.ptsAgainst??source.pointsAgainst??0);
    return {
      teamId:String(row.teamId||team.id||''),team:row.teamName||team.fullName||'Unknown Team',
      conference:row.conference||source.conferenceName||team.conference||'',division:row.division||source.divisionName||team.division||'',
      wins,losses,ties,record:`${wins}-${losses}${ties?`-${ties}`:''}`,winPct:Number.isFinite(pct)?pct:0,
      divisionRecord:`${Number(source.divWins||0)}-${Number(source.divLosses||0)}${Number(source.divTies||0)?`-${Number(source.divTies)}`:''}`,
      conferenceRecord:`${Number(source.confWins||0)}-${Number(source.confLosses||0)}${Number(source.confTies||0)?`-${Number(source.confTies)}`:''}`,
      pointsFor:pf,pointsAgainst:pa,pointDifferential:Number(source.netPts??(pf-pa)),streak:source.winLossStreak||'—',
      rank:Number(row.rank??source.rank??999),seed:Number(row.seed??source.seed??0)
    };
  }
  function firstDefined(source={},keys=[]) {
    for(const key of keys){
      const value=source?.[key];
      if(value!==undefined&&value!==null&&value!=='') return value;
    }
    return null;
  }

  function resolvedGameScore(game={},side='home') {
    const source=game.source||{};
    const keys=side==='home'
      ? ['homeScore','homeTeamScore','home_score','homePts','homePoints','scoreHome','home_score_total']
      : ['awayScore','awayTeamScore','away_score','awayPts','awayPoints','scoreAway','away_score_total'];
    const value=firstDefined({...source,...game},keys);
    const number=Number(value);
    return Number.isFinite(number)?number:null;
  }

  function resolvedGameStatus(game={},currentContext=null) {
    const source=game.source||{};
    const homeScore=resolvedGameScore(game,'home');
    const awayScore=resolvedGameScore(game,'away');
    const raw=String(firstDefined({...source,...game},['status','gameStatus','scheduleStatus','state','statusText'])??'').toLowerCase();
    const numeric=Number(firstDefined({...source,...game},['status','gameStatus','scheduleStatus','state']));
    if(['final','completed','complete','played'].includes(raw)) return 'final';
    if(['live','in-progress','in_progress','playing'].includes(raw)) return 'live';
    if(homeScore!==null&&awayScore!==null&&(homeScore>0||awayScore>0)) return 'final';
    if(currentContext){
      const context=stageWeekContext(source,game.week,game.stage);
      const order={preseason:0,regular:1,playoffs:2};
      if(order[context.phase]<order[currentContext.phase] || (context.phase===currentContext.phase&&context.week<currentContext.week)) return 'final';
    }
    if(Number.isFinite(numeric)&&numeric===2) return 'live';
    return 'scheduled';
  }

  function authoritativeSeasonContext(snapshot,standings=[],games=[]) {
    const candidates=standings.map(row=>{
      const source=row.source||{};
      const stageIndex=Number(source.stageIndex);
      const weekIndex=Number(source.weekIndex);
      if(!Number.isFinite(stageIndex)||!Number.isFinite(weekIndex)) return null;
      const phase=stageIndex===0?'preseason':stageIndex===1?'regular':'playoffs';
      const week=weekIndex+1;
      return {phase,week,label:phase==='preseason'?'Preseason':phase==='regular'?'Regular Season':'Playoffs'};
    }).filter(Boolean);
    if(candidates.length){
      const keyCounts=new Map();
      candidates.forEach(item=>{
        const key=`${item.phase}:${item.week}`;
        keyCounts.set(key,(keyCounts.get(key)||0)+1);
      });
      const [winningKey]=[...keyCounts.entries()].sort((a,b)=>b[1]-a[1])[0];
      const selected=candidates.find(item=>`${item.phase}:${item.week}`===winningKey);
      const round=selected.phase==='playoffs'?({1:'Wild Card',2:'Divisional Round',3:'Conference Championship',4:'Super Bowl'}[selected.week]||`Playoff Week ${selected.week}`):null;
      return {...selected,stage:selected.phase,season:snapshot?.seasonYear??'—',round,displayLabel:round||`${selected.label} Week ${selected.week}`,authority:'standings'};
    }
    return publicSeasonContext(snapshot,games);
  }

  function liveGameShape(game={},teamMap=new Map(),currentContext=null) {
    const source=game.source||{};
    const home=teamMap.get(String(game.homeTeamId)),away=teamMap.get(String(game.awayTeamId));
    const context=stageWeekContext(source,game.week,game.stage);
    const homeScore=resolvedGameScore(game,'home');
    const awayScore=resolvedGameScore(game,'away');
    const status=resolvedGameStatus(game,currentContext);
    const completed=status==='final';
    return {...game,home,away,homeScore,awayScore,completed,status,week:context.week,stage:context.phase,stageLabel:context.label,round:context.round};
  }

  function liveMetricValue(stat={},category='') {
    const m=stat.metrics||{};
    const candidates={passing:['passYds','passingYards','passYards','yards'],rushing:['rushYds','rushingYards','yards'],receiving:['recYds','receivingYards','yards'],defense:['defTotalTackles','tackles','sacks']}[category]||[];
    for(const key of candidates){const value=Number(m[key]);if(Number.isFinite(value))return {key,value};}
    const first=Object.entries(m).find(([,v])=>Number.isFinite(Number(v)));
    return first?{key:first[0],value:Number(first[1])}:{key:'value',value:0};
  }

  const LIVE_METRIC_ALIASES={
    passing:{
      passingYards:['passYds','passingYards','passYards','pass_yds'],
      passingTD:['passTDs','passingTDs','passTds','pass_td'],
      interceptions:['passInts','interceptions','ints','passInt']
    },
    rushing:{
      rushingYards:['rushYds','rushingYards','rushYards','rush_yds'],
      rushingTD:['rushTDs','rushingTDs','rushTds','rush_td'],
      fumbles:['fumbles','rushFumbles','fumblesLost']
    },
    receiving:{
      receptions:['receptions','recCatches','catches'],
      receivingYards:['recYds','receivingYards','receiveYards','rec_yds'],
      receivingTD:['recTDs','receivingTDs','recTds','rec_td']
    },
    defense:{
      tackles:['defTotalTackles','totalTackles','tackles'],
      sacks:['defSacks','sacks'],
      interceptions:['defInts','interceptions','ints']
    }
  };
  function liveStatMetric(row,category,metric) {
    const values=row?.metrics||{};
    const aliases=LIVE_METRIC_ALIASES[category]?.[metric]||[metric];
    for(const key of aliases){
      const value=Number(values[key]);
      if(Number.isFinite(value)) return value;
    }
    return 0;
  }
  function livePlayerShape(player={},stats=[]) {
    const source=player.source||{};
    const playerId=String(player.id||source.external_id||source.playerId||source.player_id||'');
    const teamId=String(player.teamId||source.teamId||source.team_id||source.teamID||source.rosterTeamId||source.roster_team_id||source.currentTeamId||'');
    const relevant=stats.filter(row=>String(row.playerId||row.source?.playerId||row.source?.player_id)===playerId);
    const totals={};
    Object.values(LIVE_METRIC_ALIASES).forEach(group=>Object.entries(group).forEach(([metric,aliases])=>{
      totals[metric]=relevant.reduce((sum,row)=>{
        for(const key of aliases){const value=Number(row.metrics?.[key]);if(Number.isFinite(value))return sum+value;}
        return sum;
      },0);
    }));
    return {
      id:playerId,teamId,
      name:player.displayName||source.displayName||source.fullName||[player.firstName||source.firstName,player.lastName||source.lastName].filter(Boolean).join(' ')||'Unknown Player',
      position:canonicalFilterPosition(player.position||source.position||source.positionName||source.pos||''),
      overall:Number(player.overall||source.overallRating||source.playerBestOvr||source.overall||0),
      dev:player.devTrait||source.devTrait||source.developmentTrait||source.dev||'Normal',
      stats:totals
    };
  }
  function livePreviousGameCopy(teamId,week,games,teamMap) {
    const previous=games.filter(g=>g.completed&&g.week<week&&(String(g.homeTeamId)===String(teamId)||String(g.awayTeamId)===String(teamId))).sort((a,b)=>b.week-a.week)[0];
    if(!previous)return 'No previous result captured';
    const home=String(previous.homeTeamId)===String(teamId),opponent=teamMap.get(String(home?previous.awayTeamId:previous.homeTeamId));
    const scored=Number(home?previous.homeScore:previous.awayScore),allowed=Number(home?previous.awayScore:previous.homeScore);
    return `${scored>allowed?'W':scored<allowed?'L':'T'} ${scored}-${allowed} ${home?'vs':'@'} ${opponent?.abbr||'OPP'}`;
  }
  function liveStandingsSort(a,b) {
    return (b.winPct-a.winPct)
      || (Number(b.source?.confWins||0)-Number(a.source?.confWins||0))
      || (Number(b.source?.divWins||0)-Number(a.source?.divWins||0))
      || (b.pointDifferential-a.pointDifferential)
      || (b.pointsFor-a.pointsFor)
      || String(a.team).localeCompare(String(b.team));
  }
  function buildConferencePicture(conference,standings) {
    const conferenceRows=standings.filter(row=>String(row.conference).toUpperCase().includes(conference));
    const divisionNames=[...new Set(conferenceRows.map(row=>String(row.division||'').trim()).filter(Boolean))];
    const leaders=divisionNames.map(division=>conferenceRows.filter(row=>String(row.division)===division).sort(liveStandingsSort)[0]).filter(Boolean).sort(liveStandingsSort);
    const leaderIds=new Set(leaders.map(row=>String(row.teamId)));
    const remaining=conferenceRows.filter(row=>!leaderIds.has(String(row.teamId))).sort(liveStandingsSort);
    return {
      seeds:[
        ...leaders.map((row,index)=>({...row,playoffSeed:index+1,qualification:'Division leader'})),
        ...remaining.slice(0,3).map((row,index)=>({...row,playoffSeed:index+5,qualification:'Wild card'}))
      ],
      inHunt:remaining.slice(3,6).map(row=>({...row,qualification:'In the hunt'}))
    };
  }
  function publicSeasonContext(snapshot,games) {
    const normalized=games.filter(game=>Number(game.week)>0);
    const priority=stage=>{const value=String(stage||'').toLowerCase();return value.includes('post')||value.includes('playoff')?3:value.includes('reg')?2:value.includes('pre')?1:0};
    const latest=[...normalized].sort((a,b)=>priority(b.stage)-priority(a.stage)||Number(b.week)-Number(a.week)||String(b.id||'').localeCompare(String(a.id||'')))[0];
    const stage=String(latest?.stage||'reg').toLowerCase();
    const label=stage.includes('pre')?'Preseason':stage.includes('post')||stage.includes('playoff')?'Playoffs':'Regular Season';
    const week=Number(latest?.week||1);
    const displayLabel=latest?.round||`${label} Week ${week}`;
    return {season:snapshot?.seasonYear??latest?.season??'—',stage,label,week,displayLabel};
  }
  function renderLiveConferenceSnapshot(conference,standings,teamMap) {
    const picture=buildConferencePicture(conference,standings);
    const rows=[...picture.seeds,...picture.inHunt];
    return `<article class="card home-standings-card">
      <div class="card-header"><div><span class="eyebrow">Playoff picture</span><h3>${conference} Standings</h3></div><button class="text-button" data-route="standings">View all <svg><use href="#icon-arrow"></use></svg></button></div>
      <div class="home-standings-columns" aria-hidden="true"><span>Seed</span><span>Team</span><span>Record</span></div>
      <div class="home-standings-list">${rows.map((row,index)=>{const team=teamMap.get(String(row.teamId))||{};const seed=row.playoffSeed||index+1;return `<button type="button" data-team-id="${escapeHtml(row.teamId)}" data-route="teams/${escapeHtml(row.teamId)}">
        <span class="seed">${seed}</span>${renderTeamMark(team)}
        <span class="home-standings-team"><strong>${escapeHtml(team.fullName||row.team)}</strong><small>${escapeHtml(row.qualification||row.division||'')}</small></span>
        <strong class="home-standings-record">${escapeHtml(row.record)}</strong>
      </button>`}).join('')||'<div class="home-leader-empty">No conference standings available.</div>'}</div>
    </article>`;
  }
  function renderLiveHomeLeaderCard(category,title,livePlayers,teamMap) {
    const cfg=leaderMetricConfig(category);
    const eligible=livePlayers.filter(player=>cfg.positions.includes(player.position))
      .sort((a,b)=>Number(b.stats[cfg.metric]||0)-Number(a.stats[cfg.metric]||0)||a.name.localeCompare(b.name)).slice(0,10);
    return `<article class="card home-leader-card home-leader-card--${category}">
      <div class="card-header home-leader-card__header">
        <div><h3>${title}</h3></div>
        <div class="mini-toggle" role="group" aria-label="${title} leaderboard statistic">
          ${cfg.tabs.map(([key,label])=>`<button type="button" data-home-leader-category="${category}" data-home-leader-metric="${key}" class="${cfg.metric===key?'is-active':''}">${label}</button>`).join('')}
        </div>
      </div>
      <div class="home-leader-columns"><span>#</span><span>Player</span><span>${escapeHtml(cfg.tabs.find(([key])=>key===cfg.metric)?.[1]||'Value')}</span></div>
      <div class="home-leader-list">${eligible.map((player,index)=>`<button type="button" data-player-id="${escapeHtml(player.id)}">
        <span class="leader-rank">${index+1}</span>
        <span class="home-leader-player"><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.position)} · ${escapeHtml(teamMap.get(String(player.teamId))?.abbr||'FA')}</small></span>
        <strong class="home-leader-value">${formatStatValue(cfg.metric,player.stats[cfg.metric])}</strong>
      </button>`).join('')||'<div class="home-leader-empty">No statistics available.</div>'}</div>
    </article>`;
  }

  function renderLiveState(title,copy,tone='neutral') {
    pageContent.innerHTML=`<article class="card empty-state"><span class="pill pill--${tone}">${escapeHtml(title)}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(copy)}</p></article>`;
  }
  async function renderLeagueHomeLive() {
    const service=liveReadModel();
    if(!service){renderLeagueHomeLegacy();return;}
    pageContent.setAttribute('aria-busy','true');
    try{
      // 6.5.1a — Home critical render path.
      // Teams / standings / schedule paint immediately. The large player/statistics
      // domains hydrate after first paint and never block a hard-refresh render.
      const leagueSlug=location.pathname.match(/\/leagues\/([^/]+)/i)?.[1]||'';
      const criticalCacheKey=`fhq:home-critical:v6.5.1a:${leagueSlug}`;
      let cachedCritical=null;
      try{
        const stored=JSON.parse(localStorage.getItem(criticalCacheKey)||'null');
        if(stored?.payload)cachedCritical=stored;
      }catch{}

      const criticalRequest=Promise.all([
        service.getState(),service.getSnapshot(),service.getTeams(),service.getStandings(),service.getSchedule()
      ]);

      let criticalPayload;
      if(cachedCritical?.payload){
        criticalPayload=cachedCritical.payload;
        // Refresh cached shell data behind the already-visible page.
        criticalRequest.then(fresh=>{
          try{localStorage.setItem(criticalCacheKey,JSON.stringify({savedAt:Date.now(),payload:fresh}));}catch{}
          const oldSnapshot=String(cachedCritical?.payload?.[1]?.id||'');
          const newSnapshot=String(fresh?.[1]?.id||'');
          if(newSnapshot&&newSnapshot!==oldSnapshot&&routeBase(currentAppRoute())==='home'){
            window.__FHQ_HOME_DEEP_CACHE__=null;
            renderLeagueHomeLive();
          }
        }).catch(error=>console.warn('[Home Critical Refresh]',error));
      }else{
        criticalPayload=await criticalRequest;
        try{localStorage.setItem(criticalCacheKey,JSON.stringify({savedAt:Date.now(),payload:criticalPayload}));}catch{}
      }

      const [stateValue,snapshot,teamRows,standingRows,gameRows]=criticalPayload;
      const deepCache=window.__FHQ_HOME_DEEP_CACHE__;
      const sameDeepSnapshot=deepCache&&String(deepCache.snapshotId||'')===String(snapshot?.id||'');
      const statRows=sameDeepSnapshot&&Array.isArray(deepCache.statistics)?deepCache.statistics:[];
      const playerRows=sameDeepSnapshot&&Array.isArray(deepCache.players)?deepCache.players:[];
      pageContent.removeAttribute('aria-busy');
      if(routeBase(currentAppRoute())!=='home')return;
      if(stateValue!=='live'||!snapshot){renderLiveState('League data unavailable','League Home will appear after the first successful import.');return;}

      const liveTeams=teamRows.map(liveTeamShape),teamMap=new Map(liveTeams.map(team=>[String(team.id),team]));
      const standings=standingRows.map(row=>liveStandingShape(row,teamMap)).sort((a,b)=>(a.rank-b.rank)||(b.winPct-a.winPct)||(b.pointDifferential-a.pointDifferential));
      const standingForTeam=team=>{
        const id=String(team?.id||'');
        const abbr=String(team?.abbr||team?.abbreviation||'').toUpperCase();
        const fullName=String(team?.fullName||team?.displayName||'').toLowerCase();
        return standings.find(row=>String(row.teamId)===id)
          || standings.find(row=>String(row.source?.teamId||row.source?.team_id||'')===id)
          || standings.find(row=>abbr&&String(row.source?.abbrName||row.source?.teamAbbr||'').toUpperCase()===abbr)
          || standings.find(row=>fullName&&String(row.team||row.source?.teamName||'').toLowerCase()===fullName)
          || null;
      };
      const recordForTeam=team=>{
        const row=standingForTeam(team);
        return row?.record || ((Number(row?.wins)||0)+'-'+(Number(row?.losses)||0)+(Number(row?.ties)?'-'+Number(row.ties):'')) || '0-0';
      };
      liveTeams.forEach(team=>{const row=standingForTeam(team);if(row)Object.assign(team,{wins:row.wins,losses:row.losses,ties:row.ties,record:recordForTeam(team)});});
      liveTeams.forEach(team=>liveMatchupTeams.set(String(team.id),team));
      const provisionalGames=gameRows.map(game=>liveGameShape(game,teamMap));
      const seasonContext=authoritativeSeasonContext(snapshot,standingRows,provisionalGames);
      window.FranchiseHQ=window.FranchiseHQ||{};
      window.FranchiseHQ.currentSeasonContext=seasonContext;
      const games=gameRows.map(game=>liveGameShape(game,teamMap,seasonContext));
      games.forEach(game=>liveMatchupGames.set(String(game.id||''),game));
      const currentWeek=seasonContext.week;
      const availableGames=games.filter(game=>{
        const sameWeek=Number(game.week)===Number(currentWeek);
        const gameStage=String(game.stage||'').toLowerCase();
        const sameStage=!gameStage||gameStage===seasonContext.stage
          || (String(seasonContext.stage||seasonContext.phase||'').includes('reg')&&gameStage.includes('reg'))
          || (String(seasonContext.stage||seasonContext.phase||'').includes('pre')&&gameStage.includes('pre'))
          || ((String(seasonContext.stage||seasonContext.phase||'').includes('post')||String(seasonContext.stage||seasonContext.phase||'').includes('playoff'))&&(gameStage.includes('post')||gameStage.includes('playoff')));
        return sameWeek&&sameStage;
      });
      const regularSeasonStatRows=statRows.filter(row=>canonicalStatStage(row)==='regular-season');
      const playerModels=playerRows.map(player=>livePlayerShape(player,regularSeasonStatRows));
      const playerMap=new Map(playerModels.map(player=>[String(player.id),player]));

      if(!availableGames.length){
        pageContent.innerHTML=`
          <div class="page-heading league-home-heading"><div><span class="eyebrow">${escapeHtml(seasonContext.season)} ${escapeHtml(seasonContext.label)} · Week ${escapeHtml(currentWeek)}</span><h1>League Home</h1></div><div class="heading-actions"><button class="button button--ghost" data-route="league-activity"><svg><use href="#icon-activity"></use></svg>League Activity</button><button class="button button--primary" data-route="schedule"><svg><use href="#icon-calendar"></use></svg>Full Schedule</button></div></div>
          ${renderLeagueNewsTicker()}
          <article class="card empty-state"><h2>No schedule captured for Week ${escapeHtml(currentWeek)}</h2><p>Export this week's schedule to restore the matchup ribbon and Game of the Week.</p></article>
          <div class="league-home-main"><aside class="league-home-standings">${renderLiveConferenceSnapshot('AFC',standings,teamMap)}${renderLiveConferenceSnapshot('NFC',standings,teamMap)}</aside></div>`;
        return;
      }

      if(!state.featuredGameId||!availableGames.some(game=>String(game.id)===String(state.featuredGameId))){
        state.featuredGameId=[...availableGames].sort((a,b)=>{
          const ar=Number(a.away?.wins||0)+Number(a.home?.wins||0);
          const br=Number(b.away?.wins||0)+Number(b.home?.wins||0);
          return br-ar;
        })[0]?.id;
      }
      const featured=availableGames.find(game=>String(game.id)===String(state.featuredGameId))||availableGames[0];
      const away=featured.away||{},home=featured.home||{};
      const teamPlayers=teamId=>playerModels.filter(player=>String(player.teamId)===String(teamId)).sort((a,b)=>b.overall-a.overall);
      const offensePositions=['QB','HB','RB','FB','WR','TE','LT','LG','C','RG','RT','OL'];
      const defenseSet=new Set([...defensePositions,'LE','RE','DT','LOLB','MLB','ROLB','LB','CB','FS','SS','S','EDGE']);
      const topUnit=(teamId,type)=>teamPlayers(teamId).filter(player=>type==='offense'?offensePositions.includes(player.position):defenseSet.has(player.position)).slice(0,3);
      const featuredPlayerRow=player=>`<button type="button" class="featured-player-row" data-player-id="${escapeHtml(player.id)}"><span><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.position)} · ${player.overall} OVR</small></span><strong>${player.overall}</strong></button>`;

      pageContent.innerHTML=`
        <div class="page-heading league-home-heading">
          <div><span class="eyebrow">${escapeHtml(seasonContext.season)} ${escapeHtml(seasonContext.label)} · Week ${escapeHtml(currentWeek)}</span><h1>League Home</h1></div>
          <div class="heading-actions"><button class="button button--ghost" data-route="league-activity"><svg><use href="#icon-activity"></use></svg>League Activity</button><button class="button button--primary" data-route="schedule"><svg><use href="#icon-calendar"></use></svg>Full Schedule</button></div>
        </div>

        ${renderLeagueNewsTicker()}

        <section class="week-ribbon-wrap">
          <div class="week-ribbon">
            ${availableGames.map(game=>`<button type="button" class="week-matchup-card ${String(game.id)===String(featured.id)?'is-active':''}" data-feature-game="${escapeHtml(game.id)}">
              <span class="week-matchup-time">${escapeHtml(canonicalScheduleLabel(game))} · ${game.completed?'Final':'Scheduled'}</span>
              <span class="week-matchup-team">${renderTeamMark(game.away||{})}<strong>${escapeHtml(game.away?.abbr||'AWY')}</strong><small>${game.completed?Number(game.awayScore||0):escapeHtml(recordForTeam(game.away))}</small></span>
              <span class="week-matchup-team">${renderTeamMark(game.home||{})}<strong>${escapeHtml(game.home?.abbr||'HME')}</strong><small>${game.completed?Number(game.homeScore||0):escapeHtml(recordForTeam(game.home))}</small></span>
              <span class="week-matchup-network">${game.completed?'Final':'Upcoming'}</span>
            </button>`).join('')}
          </div>
        </section>

        <div class="league-home-main">
          <div class="league-home-primary">
            <section class="featured-game featured-game--live-gotw card" data-game-id="${escapeHtml(featured.id)}" style="--away:${escapeHtml(away.primary||'#333')};--home:${escapeHtml(home.primary||'#555')};--away-secondary:${escapeHtml(away.secondary||away.primary||'#333')};--home-secondary:${escapeHtml(home.secondary||home.primary||'#555')};background:linear-gradient(135deg, ${escapeHtml(away.primary||'#333')}, ${escapeHtml(away.secondary||away.primary||'#333')}) left / 50% 100% no-repeat, linear-gradient(225deg, ${escapeHtml(home.primary||'#555')}, ${escapeHtml(home.secondary||home.primary||'#555')}) right / 50% 100% no-repeat !important;">
              <div class="featured-game-label">
                <span>★ Game of the Week</span>
                <small>${escapeHtml(canonicalScheduleLabel(featured))} · ${featured.completed?'Final':'Upcoming'}</small>
              </div>
              <div class="featured-split featured-split--clickable" aria-label="Open Game Center">
                <div class="featured-half featured-half--away" style="background:linear-gradient(135deg, ${away.primary}, ${away.secondary||away.primary}) !important;">
                  <div class="featured-half-hero">
                    ${renderTeamMark(away,'featured-team-logo')}
                    <div class="featured-half-copy">
                      <span class="eyebrow">${escapeHtml(away.city||'')}</span>
                      <h2>${escapeHtml(away.name||away.fullName||'Away')}</h2>
                      <p>${escapeHtml(recordForTeam(away))} · Owner: ${escapeHtml(liveTeamOwnerName(away))}</p>
                      <div class="previous-result"><span>${featured.completed?'Final score':'Previous game'}</span><strong>${featured.completed?`${Number(featured.awayScore||0)} points`:escapeHtml(livePreviousGameCopy(away.id,currentWeek,games,teamMap))}</strong></div>
                    </div>
                  </div>
                  <div class="featured-unit-stack">
                    <div class="featured-unit"><span class="eyebrow">Top Offense</span>${topUnit(away.id,'offense').map(featuredPlayerRow).join('')||'<p>No offensive players available.</p>'}</div>
                    <div class="featured-unit"><span class="eyebrow">Top Defense</span>${topUnit(away.id,'defense').map(featuredPlayerRow).join('')||'<p>No defensive players available.</p>'}</div>
                  </div>
                </div>
                <div class="featured-half featured-half--home" style="background:linear-gradient(225deg, ${home.primary}, ${home.secondary||home.primary}) !important;">
                  <div class="featured-half-hero featured-half-hero--home">
                    <div class="featured-half-copy">
                      <span class="eyebrow">${escapeHtml(home.city||'')}</span>
                      <h2>${escapeHtml(home.name||home.fullName||'Home')}</h2>
                      <p>${escapeHtml(recordForTeam(home))} · Owner: ${escapeHtml(liveTeamOwnerName(home))}</p>
                      <div class="previous-result"><span>${featured.completed?'Final score':'Previous game'}</span><strong>${featured.completed?`${Number(featured.homeScore||0)} points`:escapeHtml(livePreviousGameCopy(home.id,currentWeek,games,teamMap))}</strong></div>
                    </div>
                    ${renderTeamMark(home,'featured-team-logo')}
                  </div>
                  <div class="featured-unit-stack">
                    <div class="featured-unit"><span class="eyebrow">Top Offense</span>${topUnit(home.id,'offense').map(featuredPlayerRow).join('')||'<p>No offensive players available.</p>'}</div>
                    <div class="featured-unit"><span class="eyebrow">Top Defense</span>${topUnit(home.id,'defense').map(featuredPlayerRow).join('')||'<p>No defensive players available.</p>'}</div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside class="league-home-standings">
            ${renderLiveConferenceSnapshot('AFC',standings,teamMap)}
            ${renderLiveConferenceSnapshot('NFC',standings,teamMap)}
          </aside>

          <section class="home-leaders-section home-leaders-section--embedded">
            <div class="section-heading home-leaders-heading"><div><span class="section-number">02</span><h2>Stat Leaders</h2></div><button class="text-button" data-route="stats">View Full Leaderboard <svg><use href="#icon-arrow"></use></svg></button></div>
            <div class="home-leaders-grid home-leaders-grid--embedded">
              ${renderLiveHomeLeaderCard('passing','Passing',playerModels,teamMap)}
              ${renderLiveHomeLeaderCard('rushing','Rushing',playerModels,teamMap)}
              ${renderLiveHomeLeaderCard('receiving','Receiving',playerModels,teamMap)}
              ${renderLiveHomeLeaderCard('defense','Defense',playerModels,teamMap)}
            </div>
          </section>
        </div>`;

      // Player cards / stat leaders are secondary content. Hydrate after the
      // League Home shell, schedule, Game of the Week, and standings are visible.
      if(snapshot?.id && (!sameDeepSnapshot || !deepCache?.complete) && !deepCache?.loading){
        window.__FHQ_HOME_DEEP_CACHE__={
          snapshotId:String(snapshot.id),
          loading:true,
          complete:false,
          statistics:statRows,
          players:playerRows
        };
        setTimeout(()=>{
          Promise.all([service.getStatistics(),service.getPlayers()])
            .then(([statistics,players])=>{
              window.__FHQ_HOME_DEEP_CACHE__={
                snapshotId:String(snapshot.id),
                loading:false,
                complete:true,
                statistics:Array.isArray(statistics)?statistics:[],
                players:Array.isArray(players)?players:[]
              };
              if(routeBase(currentAppRoute())==='home')renderLeagueHomeLive();
            })
            .catch(error=>{
              console.warn('[Home Secondary Data]',error);
              window.__FHQ_HOME_DEEP_CACHE__={
                snapshotId:String(snapshot.id),
                loading:false,
                complete:false,
                statistics:[],
                players:[]
              };
            });
        },0);
      }
    }catch(error){
      console.error('[Home Live Integration]',error);
      if(routeBase(currentAppRoute())==='home')renderLiveState('League data unavailable',error.message||'League data could not be loaded.','warning');
    }
  }
  function renderLeagueHome() {
    const service=liveReadModel();
    if(service){renderLeagueHomeLive();return;}
    renderLeagueHomeLegacy();
  }

  function renderActivity() {
    const account = window.FGC_TRADE?.getCurrentAccount?.();
    const myTeamId = account?.teamId || null;
    const snapshot = window.FGC_TRADE?.getActivitySnapshot?.() || { approvedTrades:[], blockPlayers:[], blockPicks:[] };
    const filters = [
      ['all','All'],['transactions','Transactions'],['games','Games'],['news','News'],['my-franchise','My Franchise']
    ];

    const finalGames = schedule
      .flatMap(week => week.games.map(game => ({...game, week:week.week})))
      .filter(game => game.status === 'final')
      .slice(-8)
      .reverse();

    const activity = [];

    snapshot.approvedTrades.forEach((trade,index) => {
      activity.push({
        id:`trade-${trade.id}`, type:'transactions', kind:'Approved trade', icon:'icon-swap',
        title:`${trade.teamAName} and ${trade.teamBName} complete an approved trade`,
        copy:trade.summary || 'The committee review is complete and the transaction is now public.',
        time:trade.time || `${index+1} day ago`, teamIds:[trade.teamAId,trade.teamBId],
        route:`trade-center/history`, accent:'success'
      });
    });

    snapshot.blockPlayers.slice(0,6).forEach((listing,index) => {
      activity.push({
        id:`block-${listing.playerId}`, type:'transactions', kind:'Trade Block', icon:'icon-tag',
        title:`${listing.playerName} added to the Trade Block`,
        copy:`${listing.position} · ${listing.overall} OVR · ${listing.dev} development · ${listing.teamAbbr}`,
        time:index < 2 ? `${18 + index*11} minutes ago` : `${index} hours ago`,
        teamIds:[listing.teamId], playerId:listing.playerId, accent:'warning'
      });
    });

    finalGames.slice(0,5).forEach((game,index) => {
      const away=teamById(game.awayId), home=teamById(game.homeId);
      const winner=game.awayScore>game.homeScore?away:home;
      activity.push({
        id:`game-${game.id}`, type:'games', kind:'Final score', icon:'icon-trophy',
        title:`${winner.fullName} earn a Week ${game.week} victory`,
        copy:`${away.abbr} ${game.awayScore} · ${home.abbr} ${game.homeScore}`,
        time:index===0?'34 minutes ago':`${index+1} hours ago`,
        teamIds:[game.awayId,game.homeId], gameId:game.id, accent:'score'
      });
    });

    newsArticles.filter(article=>['Commissioner','Awards','Power Rankings','Analysis'].includes(article.category)).slice(0,5).forEach(article => {
      activity.push({
        id:`news-${article.id}`, type:'news', kind:article.category, icon:article.category==='Commissioner'?'icon-gavel':'icon-news',
        title:article.title, copy:article.excerpt, time:article.time,
        teamIds:[], newsId:article.id, accent:article.category==='Commissioner'?'accent':'neutral'
      });
    });

    const milestonePlayers = [...players].filter(p=>p.overall>=91).slice(0,3);
    milestonePlayers.forEach((player,index)=>{
      const team=teamById(player.teamId);
      activity.push({
        id:`milestone-${player.id}`, type:'news', kind:'Player milestone', icon:'icon-star',
        title:`${player.name} reaches a new franchise milestone`,
        copy:`${team.abbr} · ${player.position} · ${player.overall} OVR · ${player.dev}`,
        time:`${index+2} days ago`, teamIds:[player.teamId], playerId:player.id, accent:'player'
      });
    });

    const advanceArticle = newsArticles.find(article=>article.category==='Commissioner');
    if(advanceArticle){
      activity.unshift({
        id:'league-advance', type:'news', kind:'League advance', icon:'icon-clock',
        title:'Week 8 advance scheduled for Thursday night',
        copy:'Complete remaining games and submit results before the commissioner advance window.',
        time:'2 hours ago', teamIds:[], newsId:advanceArticle.id, accent:'accent'
      });
    }

    const filtered = activity.filter(item => {
      if(state.activityFilter==='all') return true;
      if(state.activityFilter==='my-franchise') return myTeamId && item.teamIds.includes(myTeamId);
      return item.type===state.activityFilter;
    });

    const ranked=[...teams].sort(sortStandings);
    const trending=[...players].sort((a,b)=>(b.overall+b.stats?.touchdowns)-(a.overall+a.stats?.touchdowns)).slice(0,5);
    const currentWeek=schedule.find(w=>w.week===8);
    const upcoming=(currentWeek?.games||[]).filter(g=>g.status!=='final').slice(0,3);

    pageContent.innerHTML = `
      <div class="page-heading activity-heading">
        <div><h1>League Activity</h1></div>
        <div class="heading-actions"><button class="button button--ghost" data-route="news"><svg><use href="#icon-news"></use></svg>League News</button><button class="button button--primary" data-route="trade-center"><svg><use href="#icon-swap"></use></svg>Start a Trade</button></div>
      </div>

      <div class="activity-filter-bar">
        <div class="segmented-tabs">${filters.map(([key,label])=>`<button type="button" data-activity-filter="${key}" class="${state.activityFilter===key?'is-active':''}">${label}</button>`).join('')}</div>
        <span class="result-count">${filtered.length} updates</span>
      </div>

      <div class="league-feed-layout">
        <section class="league-feed">
          ${filtered.length ? filtered.map(item=>`
            <article class="league-feed-item ${item.accent?`league-feed-item--${item.accent}`:''}" ${item.playerId?`data-player-id="${item.playerId}"`:item.gameId?`data-game-id="${item.gameId}"`:item.newsId?`data-news-id="${item.newsId}"`:item.route?`data-route="${item.route}"`:''}>
              <span class="league-feed-icon"><svg><use href="#${item.icon}"></use></svg></span>
              <div class="league-feed-content">
                <div class="league-feed-meta"><span>${escapeHtml(item.kind)}</span><time>${escapeHtml(item.time)}</time></div>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.copy)}</p>
                ${item.teamIds.length?`<div class="league-feed-teams">${item.teamIds.map(id=>renderTeamMark(teamById(id))).join('')}</div>`:''}
              </div>
              <svg class="league-feed-arrow"><use href="#icon-arrow"></use></svg>
            </article>`).join('') : `
            <article class="empty-state card"><span class="empty-icon"><svg><use href="#icon-activity"></use></svg></span><h2>No franchise activity yet</h2><p>Your team-specific feed will populate when your franchise appears in games, transactions, Trade Block listings, or league news.</p></article>`}
        </section>

        <aside class="league-feed-sidebar">
          <article class="card feed-side-card">
            <div class="card-header"><div><span class="eyebrow">League leaders</span><h3>Power snapshot</h3></div><button class="text-button" data-route="standings">Full standings <svg><use href="#icon-arrow"></use></svg></button></div>
            <div class="power-snapshot">${ranked.slice(0,5).map((team,index)=>`<button data-team-id="${team.id}"><span class="power-rank">${index+1}</span>${renderTeamMark(team)}<span><strong>${team.fullName}</strong><small>${team.record} · ${team.pf-team.pa>=0?'+':''}${team.pf-team.pa} point diff</small></span></button>`).join('')}</div>
          </article>

          <article class="card feed-side-card">
            <div class="card-header"><div><span class="eyebrow">Most active</span><h3>Trending players</h3></div><button class="text-button" data-route="players">All players <svg><use href="#icon-arrow"></use></svg></button></div>
            <div class="trending-player-list">${trending.map((player,index)=>`<button data-player-id="${player.id}"><span class="trend-number">${index+1}</span>${renderPlayerIdentity(player)}<span class="trend-score">${player.overall}</span></button>`).join('')}</div>
          </article>

          <article class="card feed-side-card">
            <div class="card-header"><div><span class="eyebrow">Week 8</span><h3>Upcoming events</h3></div><button class="text-button" data-route="schedule">Schedule <svg><use href="#icon-arrow"></use></svg></button></div>
            <div class="upcoming-event-list">
              ${upcoming.map(game=>{const away=teamById(game.awayId),home=teamById(game.homeId);return`<button data-game-id="${game.id}"><span class="upcoming-date">${game.day}<strong>${game.time}</strong></span><span>${away.abbr} at ${home.abbr}<small>${game.network} · ${game.stadium}</small></span></button>`}).join('')}
              <div class="upcoming-league-event"><span class="league-feed-icon"><svg><use href="#icon-clock"></use></svg></span><span><strong>League advance</strong><small>Thursday · 10:00 PM</small></span></div>
            </div>
          </article>
        </aside>
      </div>`;
  }

  function leaderActivity(player, label, value) {
    const team = teamById(player.teamId);
    return `<div class="activity-item clickable-row" data-player-id="${player.id}"><span class="activity-icon activity-icon--player"><svg><use href="#icon-star"></use></svg></span><div><strong>${escapeHtml(player.name)} · ${team.abbr}</strong><p>${label}: <b>${value}</b></p><span>${player.position} · ${player.overall} OVR · ${player.dev}</span></div></div>`;
  }

  function gameActivity(game) {
    const away = teamById(game.awayId); const home = teamById(game.homeId);
    const winner = game.awayScore > game.homeScore ? away : home;
    return `<div class="activity-item clickable-row" data-game-id="${game.id}"><span class="activity-icon activity-icon--score"><svg><use href="#icon-trophy"></use></svg></span><div><strong>${winner.fullName} wins</strong><p>${away.abbr} ${game.awayScore} · ${home.abbr} ${game.homeScore}</p><span>Week ${game.week} · Final</span></div></div>`;
  }

  function newsActivity(article) {
    return `<div class="activity-item clickable-row" data-news-id="${article.id}"><span class="activity-icon activity-icon--news"><svg><use href="#icon-news"></use></svg></span><div><strong>${escapeHtml(article.category)}</strong><p>${escapeHtml(article.title)}</p><span>${escapeHtml(article.time)}</span></div></div>`;
  }


  let liveTeamDirectory = null;
  let liveTeamDirectoryLoading = false;
  const liveRosterPlayers = new Map();

  function applyActiveSnapshotShell(snapshot=null,currentContext={}) {
    const contextHost=document.querySelector('[data-active-league-context]');
    const weekHost=document.querySelector('[data-live-week-chip]');
    if(!snapshot){
      if(contextHost)contextHost.textContent='League data unavailable';
      if(weekHost)weekHost.innerHTML='<span class="status-dot status-dot--warning"></span>Week unavailable';
      return;
    }
    const season=Number(snapshot.seasonYear??currentContext.season);
    const week=Number(currentContext.week??snapshot.weekIndex);
    const phase=String(currentContext.label||'Regular Season');
    const period=currentContext.round||currentContext.displayLabel||(Number.isFinite(week)?`${phase} Week ${week}`:phase);
    if(contextHost)contextHost.textContent=`${Number.isFinite(season)?`Season ${season}`:'Season unavailable'} · ${period}`;
    if(weekHost)weekHost.innerHTML=`<span class="status-dot status-dot--live"></span>${escapeHtml(period)}`;
  }


  function liveTeamOwnerName(team={}) {
    const owner=team.owner;
    return owner && String(owner).trim() ? String(owner).trim() : 'Unassigned';
  }

  function liveOwnedTeamId() {
    const account=window.FGC_TRADE?.getCurrentAccount?.();
    if(!account?.teamId) return null;
    const assigned=String(account.teamId).toLowerCase();
    const match=liveTeamDirectory?.teams?.find(team=>
      [team.id,team.abbr,team.teamKey].some(value=>String(value||'').toLowerCase()===assigned)
    );
    return match?.id || account.teamId;
  }

  function accountOwnsTeam(team,account=window.FGC_TRADE?.getCurrentAccount?.()){
    const assigned=String(account?.teamId||'').toLowerCase();
    return Boolean(assigned&&[team?.id,team?.abbr,team?.teamKey,team?.slug].some(value=>String(value||'').toLowerCase()===assigned));
  }

  function accountOwnsPlayer(player,account=window.FGC_TRADE?.getCurrentAccount?.()){
    return accountOwnsTeam(teamById(player?.teamId),account);
  }

  function decodeTeamStreak(value) {
    const raw=Number(value);
    if(!Number.isFinite(raw)||raw===0) return '—';
    const signed=raw>127?raw-256:raw;
    return `${signed>0?'W':'L'}${Math.abs(signed)}`;
  }

  function compactMoney(value) {
    if(value===null||value===undefined||value==='') return 'Unavailable';
    const number=Number(value);
    if(!Number.isFinite(number)) return '—';
    const millions=Math.abs(number)>=100000?Math.abs(number)/1000000:Math.abs(number);
    return `${number<0?'-$':'$'}${millions.toFixed(1)}M`;
  }

  function officialRating(source={}, keys=[]) {
    for(const key of keys){
      const value=Number(source[key]);
      if(Number.isFinite(value)&&value>0) return value;
    }
    return null;
  }

  function liveTeamUiShape(team={},standing=null) {
    const source=team.source||{};
    const city=team.city||source.cityName||source.city_name||'';
    const nickname=team.nickname||source.nickName||source.nickname||team.displayName||source.displayName||'Team';
    const fullName=team.displayName||source.displayName||[city,nickname].filter(Boolean).join(' ')||nickname;
    const conference=team.conference||source.conferenceName||source.confName||String(standing?.conference||'').split(' ')[0]||'';
    const divisionRaw=team.division||source.divisionName||source.divName||standing?.division||'';
    const division=String(divisionRaw).replace(/^AFC\s+|^NFC\s+/i,'');
    const wins=Number(standing?.wins||0),losses=Number(standing?.losses||0),ties=Number(standing?.ties||0);
    const shaped={
      id:String(team.id||source.teamId||''),
      abbr:team.abbreviation||source.abbrName||source.abbreviation||String(nickname).slice(0,3).toUpperCase(),
      city,name:nickname,fullName,
      conference,division,
      record:`${wins}-${losses}${ties?`-${ties}`:''}`,
      wins,losses,ties,
      divisionRank:Number(standing?.rank||standing?.source?.rank||0)||'—',
      primary:team.primaryColor||source.primaryColor||null,
      secondary:team.secondaryColor||source.secondaryColor||null,
      logo:team.logo||source.logo_url||source.logoUrl||null,
      ovr:officialRating({...source,...standing?.source,...team},['overall','ovrRating','teamOvr','overallRating']),
      off:null,
      def:null,
      cap:firstNumericValue(standing?.source?.capAvailable??standing?.source?.capRoom??source.capAvailable),
      pf:Number(standing?.source?.ptsFor||0),
      pa:Number(standing?.source?.ptsAgainst||0),
      streak:decodeTeamStreak(standing?.source?.winLossStreak),
      coach:source.coachName||source.headCoach||'—',
      stadium:source.stadiumName||source.stadium||'—',
      source
    };
    shaped.teamKey=team.teamKey||source.teamKey||String(shaped.abbr||'').toLowerCase();
    shaped.slug=safeTeamSlug(team.slug||shaped.teamKey);
    shaped.owner=liveTeamOwnerName(team);
    shaped.ownerRole=team.ownerRole||source.ownerRole||null;
    shaped.ownerAccountId=null;
    return shaped;
  }

  function normalizeLiveDevelopment(value) {
    if(value===null||value===undefined||value==='') return 'Normal';
    const numeric=Number(value);
    if(Number.isFinite(numeric)&&String(value).trim()!==''){
      if(numeric>=3) return 'X-Factor';
      if(numeric===2) return 'Superstar';
      if(numeric===1) return 'Star';
      return 'Normal';
    }
    const text=String(value).trim().toLowerCase();
    if(text.includes('x')) return 'X-Factor';
    if(text.includes('superstar')) return 'Superstar';
    if(text.includes('star')) return 'Star';
    return 'Normal';
  }

  function firstNumeric(source={},keys=[]) {
    for(const key of keys){
      const value=Number(source?.[key]);
      if(Number.isFinite(value)&&value>0) return value;
    }
    return null;
  }

  function corePlayerRatings(source={},existing={}) {
    const all={...source,...existing};
    return {
      spd:firstNumeric(all,['spd','speed','speedRating','playerSpeed']),
      str:firstNumeric(all,['str','strength','strengthRating','playerStrength']),
      agi:firstNumeric(all,['agi','agility','agilityRating','playerAgility']),
      acc:firstNumeric(all,['accelRating','accelerationRating','playerAcceleration','acceleration','acc']),
      awr:firstNumeric(all,['awareRating','awarenessRating','playerAwareness','awareness','awr','aws'])
    };
  }

  function firstNumericValue(value) {
    if(value===null||value===undefined||value==='') return null;
    const numeric=Number(value);
    return Number.isFinite(numeric)?numeric:null;
  }

  function ordinalRank(value) {
    const n=Number(value);
    if(!Number.isFinite(n)||n<=0) return '—';
    const mod100=n%100;
    const suffix=(mod100>=11&&mod100<=13)?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th');
    return `${n}${suffix} in NFL`;
  }

  function scheduleSourceInspection(game={}) {
    const source=game.source||{};
    const route=String(source.routePath||source.route_path||source.sourceRoutePath||source.source_route_path||source.route||'');
    const context=stageWeekContext(source,game.week,game.stage);
    return {route:route||'—',rawStage:source.stage??source.stageName??game.stage??'—',stageIndex:source.stageIndex??'—',rawWeekIndex:source.weekIndex??'—',canonicalWeek:game.week??'—',calculatedStage:context.phase,calculatedWeek:context.week,calculatedLabel:context.round||`${context.label} Week ${context.week}`,homeTeamId:String(game.homeTeamId??source.homeTeamId??'—'),awayTeamId:String(game.awayTeamId??source.awayTeamId??'—'),status:String(game.status??source.status??'—'),rawHomeScore:firstDefined({...source,...game},['homeScore','homeTeamScore','home_score','homePts','homePoints','scoreHome'])??'—',rawAwayScore:firstDefined({...source,...game},['awayScore','awayTeamScore','away_score','awayPts','awayPoints','scoreAway'])??'—',calculatedStatus:resolvedGameStatus(game,window.FranchiseHQ?.currentSeasonContext||null)};
  }

  function renderScheduleSourceInspector() {
    const rows=(liveTeamDirectory?.games||[]).map(scheduleSourceInspection);
    const routes=[...new Set(rows.map(row=>row.route))];
    const counts=rows.reduce((a,r)=>(a[r.calculatedStage]=(a[r.calculatedStage]||0)+1,a),{});
    pageContent.innerHTML=`<section class="developer-workspace schedule-source-inspector">
      <div class="page-heading"><div><span class="eyebrow">Developer Tools · Schedule</span><h1>Schedule Source Inspector</h1><p>Private diagnostic view for certifying Madden stage and week mapping before public schedule integration.</p></div></div>
      <div class="summary-grid">${summaryTile('Captured Games',rows.length,'')}${summaryTile('Routes',routes.length,'')}${summaryTile('Preseason',counts.preseason||0,'')}${summaryTile('Regular Season',counts.regular||0,'')}${summaryTile('Playoffs',counts.playoffs||0,'')}</div>
      <article class="card"><div class="card-header"><div><span class="eyebrow">Raw → Canonical</span><h3>Captured Schedule Records</h3></div><span class="pill pill--neutral">${rows.length} records</span></div><div class="table-wrap"><table class="schedule-inspector-table"><thead><tr><th>Route</th><th>Raw Stage</th><th>Stage Index</th><th>Raw Week Index</th><th>Canonical Week</th><th>Calculated Stage</th><th>Calculated Week</th><th>Display Label</th><th>Away</th><th>Home</th><th>Raw Status</th><th>Away Score</th><th>Home Score</th><th>Calculated Status</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td><code>${escapeHtml(r.route)}</code></td><td>${escapeHtml(r.rawStage)}</td><td>${escapeHtml(r.stageIndex)}</td><td>${escapeHtml(r.rawWeekIndex)}</td><td>${escapeHtml(r.canonicalWeek)}</td><td>${escapeHtml(r.calculatedStage)}</td><td><strong>${escapeHtml(r.calculatedWeek)}</strong></td><td>${escapeHtml(r.calculatedLabel)}</td><td>${escapeHtml(r.awayTeamId)}</td><td>${escapeHtml(r.homeTeamId)}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.rawAwayScore)}</td><td>${escapeHtml(r.rawHomeScore)}</td><td>${escapeHtml(r.calculatedStatus)}</td></tr>`).join(''):`<tr><td colspan="14">No captured schedule records are available in the active snapshot.</td></tr>`}</tbody></table></div></article>
      <article class="card"><div class="card-header"><div><span class="eyebrow">Captured Sources</span><h3>Unique Schedule Routes</h3></div></div><div class="card-body">${routes.length?routes.map(route=>`<div class="diagnostic-row"><code>${escapeHtml(route)}</code></div>`).join(''):'No source-route metadata was captured.'}</div></article>
    </section>`;
  }

  window.FranchiseHQ = window.FranchiseHQ || {};
  function joinFieldValue(record={},keys=[]) {
    const source=record.source||{};
    const merged={...record,...source};
    for(const key of keys){
      const value=merged[key];
      if(value!==undefined&&value!==null&&value!=='') return String(value);
    }
    return '';
  }

  function gameJoinIdentity(game={}) {
    const source=game.source||{};
    const context=stageWeekContext(source,game.week,game.stage);
    return {
      gameId:joinFieldValue(game,['gameId','game_id','id','scheduleId','schedule_id']),
      scheduleId:joinFieldValue(game,['scheduleId','schedule_id','gameId','game_id','id']),
      stageIndex:joinFieldValue(game,['stageIndex','stage_index']),
      weekIndex:joinFieldValue(game,['weekIndex','week_index']),
      phase:context.phase,
      week:String(context.week),
      homeTeamId:joinFieldValue(game,['homeTeamId','home_team_id','homeId']),
      awayTeamId:joinFieldValue(game,['awayTeamId','away_team_id','awayId']),
      route:joinFieldValue(game,['routePath','route_path','sourceRoutePath','source_route_path'])
    };
  }

  function statisticJoinIdentity(row={}) {
    const source=row.source||{};
    const context=stageWeekContext(source,row.week,row.stage);
    return {
      gameId:joinFieldValue(row,['gameId','game_id','scheduleId','schedule_id']),
      scheduleId:joinFieldValue(row,['scheduleId','schedule_id','gameId','game_id']),
      teamId:joinFieldValue(row,['teamId','team_id','clubId','club_id']),
      playerId:joinFieldValue(row,['playerId','player_id','rosterId','roster_id']),
      stageIndex:joinFieldValue(row,['stageIndex','stage_index']),
      weekIndex:joinFieldValue(row,['weekIndex','week_index']),
      phase:context.phase,
      week:String(context.week),
      category:joinFieldValue(row,['category','statCategory','stat_category','type']),
      route:joinFieldValue(row,['routePath','route_path','sourceRoutePath','source_route_path'])
    };
  }

  function joinCandidateMatches(gameIdentity,statIdentity) {
    const matches=[];
    if(gameIdentity.gameId&&statIdentity.gameId&&gameIdentity.gameId===statIdentity.gameId) matches.push('gameId');
    if(gameIdentity.scheduleId&&statIdentity.scheduleId&&gameIdentity.scheduleId===statIdentity.scheduleId) matches.push('scheduleId');
    if(gameIdentity.stageIndex&&statIdentity.stageIndex&&gameIdentity.stageIndex===statIdentity.stageIndex) matches.push('stageIndex');
    if(gameIdentity.weekIndex&&statIdentity.weekIndex&&gameIdentity.weekIndex===statIdentity.weekIndex) matches.push('weekIndex');
    if(gameIdentity.phase===statIdentity.phase&&gameIdentity.week===statIdentity.week) matches.push('phase+week');
    if(statIdentity.teamId&&(statIdentity.teamId===gameIdentity.homeTeamId||statIdentity.teamId===gameIdentity.awayTeamId)) matches.push('teamId');
    return matches;
  }

  window.FranchiseHQ.gameStateJoinInspector = {
    async load(targetId) {
      const target=document.getElementById(targetId);
      if(!target)return;
      try{
        const service=liveReadModel();
        if(!service) throw new Error('Live Read Model service is unavailable.');
        const [games,statistics,players]=await Promise.all([service.getSchedule(),service.getStatistics(),service.getPlayers()]);
        const gameRows=(games||[]).map(game=>({game,identity:gameJoinIdentity(game)}));
        const statRows=(statistics||[]).map(row=>({row,identity:statisticJoinIdentity(row)}));
        const playerIds=new Set((players||[]).map(player=>String(player.id||player.playerId||player.source?.playerId||'')));
        const summaries=gameRows.map(({game,identity})=>{
          const candidates=statRows.map(item=>({item,matches:joinCandidateMatches(identity,item.identity)})).filter(result=>result.matches.length);
          const direct=candidates.filter(result=>result.matches.includes('gameId')||result.matches.includes('scheduleId'));
          const contextual=candidates.filter(result=>!result.matches.includes('gameId')&&!result.matches.includes('scheduleId')&&result.matches.includes('phase+week')&&result.matches.includes('teamId'));
          const linkedPlayers=new Set(candidates.map(result=>result.item.identity.playerId).filter(id=>id&&playerIds.has(id)));
          const teamStats=candidates.filter(result=>!result.item.identity.playerId);
          const playerStats=candidates.filter(result=>result.item.identity.playerId);
          return {game,identity,direct,contextual,linkedPlayers,teamStats,playerStats};
        });
        const directGames=summaries.filter(row=>row.direct.length).length;
        const contextualGames=summaries.filter(row=>!row.direct.length&&row.contextual.length).length;
        const unjoinedGames=summaries.filter(row=>!row.direct.length&&!row.contextual.length).length;
        const statFields=[...new Set(
          statRows.flatMap(({row}) =>
            Object.keys({...row,...(row.source||{})})
              .filter(key=>/game|schedule|team|player|stage|week|route/i.test(key))
          )
        )].sort();

        target.innerHTML=`<section class="game-state-join-inspector">
          <div class="card-header"><div><span class="eyebrow">v5.9.5.0.12.5.4.3.2.0.1.1 · Data Certification</span><h3>Game-State Join Inspector</h3><p>Determines whether schedule, team-stat, and player-stat records can be joined through direct IDs or stage/week/team context.</p></div><span class="pill pill--neutral">${summaries.length} games</span></div>
          <div class="summary-grid game-join-summary">
            ${summaryTile('Direct ID Join',directGames,'gameId or scheduleId')}
            ${summaryTile('Context Join',contextualGames,'phase + week + team')}
            ${summaryTile('Unjoined Games',unjoinedGames,'requires mapper work')}
            ${summaryTile('Statistic Records',statRows.length,'active snapshot')}
            ${summaryTile('Join Fields Found',statFields.length,'raw field names')}
          </div>
          <article class="card"><div class="card-header"><div><span class="eyebrow">Per-game analysis</span><h3>Join Coverage</h3></div></div>
            <div class="table-wrap"><table class="game-join-table"><thead><tr><th>Game</th><th>Route</th><th>Game ID</th><th>Schedule ID</th><th>Stage / Week</th><th>Teams</th><th>Direct Matches</th><th>Context Matches</th><th>Team Stats</th><th>Player Stats</th><th>Linked Players</th><th>Recommended Join</th></tr></thead>
            <tbody>${summaries.length?summaries.map(row=>{
              const label=canonicalScheduleLabel({...row.game,stage:row.identity.phase,week:Number(row.identity.week)});
              const recommendation=row.direct.length?'Direct ID':row.contextual.length?'Phase + Week + Team':'No verified join';
              return `<tr><td>${escapeHtml(label)}</td><td><code>${escapeHtml(row.identity.route||'—')}</code></td><td><code>${escapeHtml(row.identity.gameId||'—')}</code></td><td><code>${escapeHtml(row.identity.scheduleId||'—')}</code></td><td>${escapeHtml(`${row.identity.phase} / ${row.identity.week}`)}</td><td><code>${escapeHtml(`${row.identity.awayTeamId||'—'} @ ${row.identity.homeTeamId||'—'}`)}</code></td><td>${row.direct.length}</td><td>${row.contextual.length}</td><td>${row.teamStats.length}</td><td>${row.playerStats.length}</td><td>${row.linkedPlayers.size}</td><td><span class="pill ${recommendation==='Direct ID'?'pill--success':recommendation==='Phase + Week + Team'?'pill--accent':'pill--warning'}">${escapeHtml(recommendation)}</span></td></tr>`;
            }).join(''):`<tr><td colspan="12">No schedule records were returned.</td></tr>`}</tbody></table></div>
          </article>
          <article class="card"><div class="card-header"><div><span class="eyebrow">Raw schema</span><h3>Available Join Fields</h3><p>Identifier-like fields found across active statistic records.</p></div></div><div class="card-body game-join-fields">${statFields.length?statFields.map(field=>`<code>${escapeHtml(field)}</code>`).join(''):'No identifier-like fields were found.'}</div></article>
          <article class="card"><div class="card-header"><div><span class="eyebrow">Sample records</span><h3>Statistic Join JSON</h3></div></div><div class="card-body"><details><summary>Open first five normalized statistic identities</summary><pre>${escapeHtml(JSON.stringify(statRows.slice(0,5).map(item=>item.identity),null,2))}</pre></details></div></article>
        </section>`;
      }catch(error){
        target.innerHTML=`<article class="card roadmap-state"><div class="roadmap-state__inner"><h3>Join inspection failed</h3><p>${escapeHtml(error?.message||'Unable to inspect active snapshot joins.')}</p><button type="button" class="button button--primary" data-game-state-join-retry="${escapeHtml(targetId)}">Retry</button></div></article>`;
      }
    },
    renderPanel() {
      const id=`game-state-join-${Date.now()}`;
      setTimeout(()=>this.load(id),0);
      return `<section id="${id}"><article class="card roadmap-state"><div class="roadmap-state__inner"><div class="spinner" aria-hidden="true"></div><h3>Analyzing game-state joins…</h3><p>Comparing schedule, statistic, team, and player identifiers.</p></div></article></section>`;
    }
  };

  window.FranchiseHQ.gameDetailInspector = {
    async load(targetId) {
      const target=document.getElementById(targetId); if(!target)return;
      try{
        const service=liveReadModel();
        const games=await service.getSchedule();
        const rows=(games||[]).map(game=>{
          const context=stageWeekContext(game.source||{},game.week,game.stage);
          return {game,context,meta:gameMetadata(game)};
        });
        target.innerHTML=`<section class="game-detail-inspector"><div class="card-header"><div><span class="eyebrow">Game Metadata Analysis</span><h3>Date, Time & Join Inspector</h3><p>Use this view to identify the exact Madden fields for kickoff metadata and game-stat joins.</p></div><span class="pill pill--neutral">${rows.length} games</span></div>
        <div class="table-wrap"><table class="game-metadata-table"><thead><tr><th>Route</th><th>Game ID</th><th>Stage / Week</th><th>Source Field</th><th>Raw Value</th><th>Parsed Timestamp</th><th>Day</th><th>Time</th><th>Stadium</th><th>Raw Date/Time Fields</th></tr></thead><tbody>${rows.map(({game,context,meta})=>`<tr><td><code>${escapeHtml(game.source?.routePath||game.source?.route_path||'—')}</code></td><td><code>${escapeHtml(game.id||game.source?.gameId||'—')}</code></td><td>${escapeHtml(context.round||`${context.label} Week ${context.week}`)}</td><td>${escapeHtml(meta.usedField||'—')}</td><td>${escapeHtml(meta.rawValue||'—')}</td><td>${escapeHtml(meta.parsedTimestamp||'—')}</td><td>${escapeHtml(meta.dayLabel||'—')}</td><td>${escapeHtml(meta.timeLabel||'—')}</td><td>${escapeHtml(meta.stadium||'—')}</td><td><details><summary>JSON</summary><pre>${escapeHtml(JSON.stringify(meta.rawFields,null,2))}</pre></details></td></tr>`).join('')}</tbody></table></div></section>`;
      }catch(error){target.innerHTML=`<article class="card"><div class="card-body"><h3>Game metadata inspection failed</h3><p>${escapeHtml(error?.message||'Unable to load schedule metadata.')}</p></div></article>`;}
    },
    renderPanel(){
      const id=`game-detail-inspector-${Date.now()}`;
      setTimeout(()=>this.load(id),0);
      return `<section id="${id}"><article class="card"><div class="card-body"><h3>Loading game metadata…</h3></div></article></section>`;
    }
  };

  window.FranchiseHQ.scheduleSourceInspector = {
    renderRows(rows=[]) {
      const routes=[...new Set(rows.map(row=>row.route))];
      const counts=rows.reduce((a,r)=>(a[r.calculatedStage]=(a[r.calculatedStage]||0)+1,a),{});
      return `<section class="schedule-source-inspector">
        <div class="card-header"><div><span class="eyebrow">Raw → Canonical</span><h3>Schedule Source Inspector</h3><p><span class="pill pill--success">Mapping certified</span></p><p>Compare captured Madden route, stage, and week metadata against Franchise HQ's calculated display week.</p></div><span class="pill pill--neutral">${rows.length} records</span></div>
        <div class="summary-grid">${summaryTile('Captured Games',rows.length,'')}${summaryTile('Routes',routes.length,'')}${summaryTile('Preseason',counts.preseason||0,'')}${summaryTile('Regular Season',counts.regular||0,'')}${summaryTile('Playoffs',counts.playoffs||0,'')}</div>
        <article class="card"><div class="table-wrap"><table class="schedule-inspector-table"><thead><tr><th>Route</th><th>Raw Stage</th><th>Stage Index</th><th>Raw Week Index</th><th>Canonical Week</th><th>Calculated Stage</th><th>Calculated Week</th><th>Display Label</th><th>Away</th><th>Home</th><th>Raw Status</th><th>Away Score</th><th>Home Score</th><th>Calculated Status</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td><code>${escapeHtml(r.route)}</code></td><td>${escapeHtml(r.rawStage)}</td><td>${escapeHtml(r.stageIndex)}</td><td>${escapeHtml(r.rawWeekIndex)}</td><td>${escapeHtml(r.canonicalWeek)}</td><td>${escapeHtml(r.calculatedStage)}</td><td><strong>${escapeHtml(r.calculatedWeek)}</strong></td><td>${escapeHtml(r.calculatedLabel)}</td><td>${escapeHtml(r.awayTeamId)}</td><td>${escapeHtml(r.homeTeamId)}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.rawAwayScore)}</td><td>${escapeHtml(r.rawHomeScore)}</td><td>${escapeHtml(r.calculatedStatus)}</td></tr>`).join(''):`<tr><td colspan="14">The active snapshot returned no schedule records.</td></tr>`}</tbody></table></div></article>
        <article class="card"><div class="card-header"><div><span class="eyebrow">Captured Sources</span><h3>Unique Schedule Routes</h3></div></div><div class="card-body">${routes.length?routes.map(route=>`<div class="diagnostic-row"><code>${escapeHtml(route)}</code></div>`).join(''):'No source-route metadata was present on the returned records.'}</div></article>
      </section>`;
    },
    async load(targetId) {
      const target=document.getElementById(targetId);
      if(!target)return;
      try{
        const service=liveReadModel();
        if(!service) throw new Error('Live Read Model service is unavailable.');
        const stateValue=await service.getState();
        if(stateValue!=='live') throw new Error('No active live snapshot is available.');
        const games=await service.getSchedule();
        const rows=(games||[]).map(scheduleSourceInspection);
        const liveTarget=document.getElementById(targetId);
        if(liveTarget)liveTarget.innerHTML=this.renderRows(rows);
      }catch(error){
        const liveTarget=document.getElementById(targetId);
        if(liveTarget)liveTarget.innerHTML=`<article class="card roadmap-state"><div class="roadmap-state__inner"><h3>Schedule inspection failed</h3><p>${escapeHtml(error?.message||'The active snapshot schedule could not be loaded.')}</p><button type="button" class="button button--primary" data-schedule-inspector-retry="${escapeHtml(targetId)}">Retry</button></div></article>`;
      }
    },
    renderPanel() {
      const targetId=`schedule-source-inspector-${Date.now()}`;
      setTimeout(()=>this.load(targetId),0);
      return `<section id="${targetId}" class="schedule-source-inspector"><article class="card roadmap-state"><div class="roadmap-state__inner"><div class="spinner" aria-hidden="true"></div><h3>Loading schedule records…</h3><p>Reading directly from the active snapshot.</p></div></article></section>`;
    }
  };


  const playerInspectorState = {
    loaded:false,
    loading:false,
    error:null,
    players:[],
    teams:[],
    statistics:[],
    snapshot:null,
    selectedId:'',
    query:'',
    imageFieldCoverage:[]
  };

  function playerInspectorPrimitiveEntries(record={}) {
    return Object.entries(record||{}).filter(([,value]) =>
      value!==null && value!==undefined &&
      (typeof value==='string' || typeof value==='number' || typeof value==='boolean')
    );
  }

  function playerInspectorFieldRows(record={},pattern=null) {
    const source=record?.source||{};
    const merged={...source,...record};
    return playerInspectorPrimitiveEntries(merged)
      .filter(([key])=>!pattern || pattern.test(key))
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([key,value])=>({key,value}));
  }

  function playerInspectorRatingRows(player={}) {
    const pattern=/(rating|overall|ovr|speed|accel|agil|aware|strength|throw|catch|route|block|tackle|coverage|kick|power|move|pursuit|play.?recog|stamina|injury|toughness|jump|carrying|break.?tackle|trucking|elusive|press|man.?cov|zone.?cov)/i;
    return playerInspectorFieldRows(player,pattern)
      .filter(row=>Number.isFinite(Number(row.value)))
      .slice(0,180);
  }

  function playerInspectorContractRows(player={}) {
    const pattern=/(contract|salary|bonus|cap|year.*remain|years.*left|signing)/i;
    return playerInspectorFieldRows(player,pattern).slice(0,120);
  }

  function playerInspectorBioRows(player={}) {
    const pattern=/(height|weight|college|school|age|birth|experience|years.?pro|draft|jersey|handed|hand|position|first.?name|last.?name|display.?name|team.?id)/i;
    return playerInspectorFieldRows(player,pattern).slice(0,120);
  }

  function playerInspectorImageRows(player={}) {
    const pattern=/(image|portrait|headshot|head.?shot|photo|asset|face|render|picture|(^|_)pic($|_)|presentation|avatar|thumb)/i;
    return playerInspectorFieldRows(player,pattern).slice(0,120);
  }

  function playerInspectorStatsFor(playerId='') {
    const id=String(playerId||'');
    return (playerInspectorState.statistics||[]).filter(row=>{
      const raw=row?.source||{};
      return String(row.playerId||raw.player_external_id||raw.playerId||raw.player_id||'')===id;
    });
  }

  function playerInspectorTeam(player={}) {
    const id=String(player.teamId||player.source?.team_external_id||player.source?.teamId||'');
    return (playerInspectorState.teams||[]).find(team=>String(team.id||'')===id)||null;
  }

  function playerInspectorFieldTable(rows=[],empty='No matching fields were found.') {
    if(!rows.length) return `<div class="player-inspector-empty">${escapeHtml(empty)}</div>`;
    return `<div class="table-wrap player-inspector-table-wrap"><table class="player-inspector-table"><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>${rows.map(row=>`<tr><td><code>${escapeHtml(row.key)}</code></td><td>${escapeHtml(typeof row.value==='object'?JSON.stringify(row.value):row.value)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function playerInspectorImageCoverage(players=[]) {
    const coverage=new Map();
    players.forEach(player=>{
      const seen=new Set();
      playerInspectorImageRows(player).forEach(({key,value})=>{
        if(seen.has(key))return;
        seen.add(key);
        const entry=coverage.get(key)||{key,count:0,samples:[]};
        entry.count++;
        const text=String(value);
        if(text && entry.samples.length<4 && !entry.samples.includes(text)) entry.samples.push(text);
        coverage.set(key,entry);
      });
    });
    return [...coverage.values()].sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key));
  }

  function playerInspectorCategorySummary(rows=[]) {
    const result={};
    rows.forEach(row=>{
      const category=String(row.category||row.source?.category||'unknown').toLowerCase();
      result[category]=(result[category]||0)+1;
    });
    return result;
  }

  function playerInspectorHasOverall(player={}) {
    return Number.isFinite(Number(player.overall)) ||
      playerInspectorRatingRows(player).some(row=>/overall|ovr/i.test(row.key));
  }

  function playerInspectorHasContract(player={}) {
    const c=player.contract||{};
    return Object.values(c).some(v=>v!==null&&v!==undefined&&v!=='') || playerInspectorContractRows(player).length>0;
  }

  function playerInspectorSourceRoute(player={}) {
    const source=player.source||{};
    return String(source.routePath||source.route_path||source.sourceRoutePath||source.source_route_path||source.route||'—');
  }

  function renderPlayerInspectorSelected(player={}) {
    const team=playerInspectorTeam(player);
    const stats=playerInspectorStatsFor(player.id);
    const categories=playerInspectorCategorySummary(stats);
    const bio=playerInspectorBioRows(player);
    const ratings=playerInspectorRatingRows(player);
    const contracts=playerInspectorContractRows(player);
    const images=playerInspectorImageRows(player);
    const normalized={
      id:player.id,
      displayName:player.displayName,
      firstName:player.firstName,
      lastName:player.lastName,
      position:player.position,
      teamId:player.teamId,
      team:team?.displayName||team?.nickname||null,
      overall:player.overall,
      age:player.age,
      devTrait:player.devTrait,
      jerseyNumber:player.jerseyNumber,
      contract:player.contract
    };
    const joinChecks=[
      ['Player ID',Boolean(player.id),player.id||'Missing'],
      ['Team Join',Boolean(team),team?(team.displayName||team.nickname||team.id):'No matching team'],
      ['Overall / Ratings',playerInspectorHasOverall(player),ratings.length?`${ratings.length} rating-like fields`:'No rating-like fields'],
      ['Contract',playerInspectorHasContract(player),contracts.length?`${contracts.length} contract/cap fields`:'No contract/cap fields'],
      ['Statistics',stats.length>0,stats.length?`${stats.length} statistic records`:'No statistic records'],
      ['Image Candidate',images.length>0,images.length?`${images.length} image/asset fields`:'No image/asset fields']
    ];

    return `<section class="player-inspector-selected">
      <article class="card player-inspector-identity">
        <div class="card-header">
          <div><span class="eyebrow">Selected Player</span><h3>${escapeHtml(player.displayName||`${player.firstName||''} ${player.lastName||''}`.trim()||player.id||'Unknown Player')}</h3><p>${escapeHtml([player.position,team?.displayName||team?.nickname].filter(Boolean).join(' · ')||'No team/position context')}</p></div>
          <span class="pill ${team?'pill--success':'pill--warning'}">${escapeHtml(player.overall!==null&&player.overall!==undefined?`${player.overall} OVR`:'OVR —')}</span>
        </div>
        <div class="player-inspector-join-grid">${joinChecks.map(([label,ok,detail])=>`<div class="player-inspector-join ${ok?'is-pass':'is-missing'}"><span>${escapeHtml(label)}</span><strong>${ok?'✓':'—'}</strong><small>${escapeHtml(detail)}</small></div>`).join('')}</div>
        <div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span>Player source route: <code>${escapeHtml(playerInspectorSourceRoute(player))}</code></span></div>
      </article>

      <div class="player-inspector-detail-grid">
        <article class="card"><div class="card-header"><div><span class="eyebrow">Identity / Physical / Draft</span><h3>Bio Fields</h3></div><span class="pill pill--neutral">${bio.length}</span></div>${playerInspectorFieldTable(bio,'No additional bio or physical fields were found.')}</article>
        <article class="card"><div class="card-header"><div><span class="eyebrow">Ratings Discovery</span><h3>Ratings Fields</h3></div><span class="pill pill--neutral">${ratings.length}</span></div>${playerInspectorFieldTable(ratings,'No numeric rating fields were found in this player record.')}</article>
        <article class="card"><div class="card-header"><div><span class="eyebrow">Contract Discovery</span><h3>Contract / Cap Fields</h3></div><span class="pill pill--neutral">${contracts.length}</span></div>${playerInspectorFieldTable(contracts,'No contract or cap fields were found in this player record.')}</article>
        <article class="card"><div class="card-header"><div><span class="eyebrow">Visual Asset Discovery</span><h3>Image / Portrait Candidates</h3></div><span class="pill ${images.length?'pill--success':'pill--neutral'}">${images.length}</span></div>${playerInspectorFieldTable(images,'No portrait, image, headshot, asset, face, render, or presentation fields were found on this player record.')}</article>
      </div>

      <article class="card">
        <div class="card-header"><div><span class="eyebrow">Statistics Join</span><h3>Player Statistic Coverage</h3><p>Categories linked to this exact player ID in the active snapshot.</p></div><span class="pill ${stats.length?'pill--success':'pill--neutral'}">${stats.length} records</span></div>
        <div class="stats-preview-summary player-inspector-stats-summary">${['passing','rushing','receiving','defense','kicking','punting'].map(category=>`<div><span>${escapeHtml(category)}</span><strong>${categories[category]||0}</strong></div>`).join('')}</div>
        ${stats.length?`<div class="table-wrap"><table class="player-inspector-table"><thead><tr><th>Category</th><th>Stage</th><th>Week</th><th>Team</th><th>Source</th><th>Metrics</th></tr></thead><tbody>${stats.slice(0,100).map(row=>`<tr><td>${escapeHtml(row.category||'—')}</td><td>${escapeHtml(row.stage||'—')}</td><td>${escapeHtml(row.week??'—')}</td><td><code>${escapeHtml(row.teamId||'—')}</code></td><td><code>${escapeHtml(row.source?.source_route_path||row.source?.sourceRoutePath||row.source?.routePath||'—')}</code></td><td><details><summary>JSON</summary><pre>${escapeHtml(JSON.stringify(row.metrics||{},null,2))}</pre></details></td></tr>`).join('')}</tbody></table></div>`:'<div class="player-inspector-empty">No statistics are linked to this player in the active snapshot.</div>'}
      </article>

      <div class="player-inspector-json-grid">
        <article class="card"><div class="card-header"><div><span class="eyebrow">Application Contract</span><h3>Normalized Player JSON</h3></div></div><div class="card-body"><details open><summary>Normalized record</summary><pre>${escapeHtml(JSON.stringify(normalized,null,2))}</pre></details></div></article>
        <article class="card"><div class="card-header"><div><span class="eyebrow">Madden Source</span><h3>Approved Player Data</h3></div></div><div class="card-body"><details><summary>Normalized source fields</summary><pre>${escapeHtml(JSON.stringify(player.source||{},null,2))}</pre></details></div></article>
      </div>
    </section>`;
  }

  function renderPlayerDataInspector() {
    const state=playerInspectorState;
    if(state.loading) return `<article class="card roadmap-state"><div class="roadmap-state__inner"><div class="spinner" aria-hidden="true"></div><h3>Inspecting player sources…</h3><p>Loading players, teams, statistics, and active snapshot metadata.</p></div></article>`;
    if(state.error) return `<article class="card roadmap-state"><div class="roadmap-state__inner"><h3>Player inspection failed</h3><p>${escapeHtml(state.error)}</p><button type="button" class="button button--primary" data-player-inspector-reload>Retry</button></div></article>`;
    if(!state.loaded) return `<article class="card roadmap-state"><div class="roadmap-state__inner"><div class="spinner" aria-hidden="true"></div><h3>Preparing Player Data Inspector…</h3></div></article>`;

    const query=String(state.query||'').trim().toLowerCase();
    const filtered=(state.players||[])
      .filter(player=>{
        if(!query)return true;
        const team=playerInspectorTeam(player);
        return [player.displayName,player.firstName,player.lastName,player.position,player.id,team?.displayName,team?.nickname,team?.abbreviation]
          .some(value=>String(value||'').toLowerCase().includes(query));
      })
      .sort((a,b)=>String(a.displayName||'').localeCompare(String(b.displayName||'')));

    let selected=(state.players||[]).find(player=>String(player.id||player.source?.player_external_id||player.source?.playerId||'')===String(state.selectedId));
    if(!selected) selected=filtered[0]||state.players[0]||null;
    if(selected) state.selectedId=String(selected.id||selected.source?.player_external_id||selected.source?.playerId||'');

    const playerCount=state.players.length;
    const teamJoined=state.players.filter(player=>Boolean(playerInspectorTeam(player))).length;
    const ratingsCount=state.players.filter(player=>playerInspectorHasOverall(player)).length;
    const contractsCount=state.players.filter(player=>playerInspectorHasContract(player)).length;
    const statsLinked=new Set((state.statistics||[]).map(row=>String(row.playerId||row.source?.player_external_id||'')).filter(Boolean));
    const imagePlayers=state.players.filter(player=>playerInspectorImageRows(player).length).length;

    return `<section class="player-data-inspector" data-player-data-inspector>
      <div class="card-header player-inspector-heading">
        <div><span class="eyebrow">v5.9.6.6aedccbcb.2b.1ba.1 · Player Source Discovery</span><h3>Player Data Inspector</h3><p>Certify player identity, team, ratings, contract, statistics, and visual-asset sources before Player Card 2.0.</p></div>
        <span class="pill pill--success">Active Snapshot</span>
      </div>

      <div class="summary-grid player-inspector-summary">
        ${summaryTile('Players',playerCount,'active snapshot')}
        ${summaryTile('Team Joins',teamJoined,`${playerCount?Math.round(teamJoined/playerCount*100):0}% resolved`)}
        ${summaryTile('Ratings',ratingsCount,`${playerCount?Math.round(ratingsCount/playerCount*100):0}% with OVR/rating data`)}
        ${summaryTile('Contracts',contractsCount,`${playerCount?Math.round(contractsCount/playerCount*100):0}% with contract/cap data`)}
        ${summaryTile('Stats Linked',statsLinked.size,'unique player IDs')}
        ${summaryTile('Image Candidates',imagePlayers,'players with candidate fields')}
      </div>

      <article class="card player-inspector-controls">
        <div class="card-header"><div><span class="eyebrow">Player Selection</span><h3>Inspect a Player</h3></div><button type="button" class="button button--ghost" data-player-inspector-reload>Refresh Inspector</button></div>
        <div class="player-inspector-filter-row">
          <label class="field"><span>Search</span><input type="search" value="${escapeHtml(state.query)}" placeholder="Name, team, position, or player ID" data-player-inspector-search></label>
          <label class="field"><span>Player</span><select data-player-inspector-select>${filtered.slice(0,1000).map(player=>{const team=playerInspectorTeam(player);const pid=String(player.id||player.source?.player_external_id||player.source?.playerId||'');return `<option value="${escapeHtml(pid)}" ${pid===String(state.selectedId)?'selected':''}>${escapeHtml(`${player.displayName||pid||'Unknown Player'} · ${player.position||'—'} · ${team?.abbreviation||team?.nickname||'Unassigned'}`)}</option>`}).join('')}</select></label>
        </div>
        <small>${filtered.length} matching players${filtered.length>1000?' · first 1,000 shown':''}</small>
      </article>

      <article class="card">
        <div class="card-header"><div><span class="eyebrow">League-Wide Visual Scan</span><h3>Image / Portrait Field Coverage</h3><p>Candidate source fields found across every active player record. This does not assume that any field is a usable image URL.</p></div><span class="pill ${state.imageFieldCoverage.length?'pill--success':'pill--neutral'}">${state.imageFieldCoverage.length} candidate fields</span></div>
        ${state.imageFieldCoverage.length?`<div class="table-wrap"><table class="player-inspector-table"><thead><tr><th>Field</th><th>Players</th><th>Coverage</th><th>Sample Values</th></tr></thead><tbody>${state.imageFieldCoverage.map(row=>`<tr><td><code>${escapeHtml(row.key)}</code></td><td>${row.count}</td><td>${playerCount?Math.round(row.count/playerCount*100):0}%</td><td>${row.samples.map(sample=>`<code>${escapeHtml(sample)}</code>`).join('<br>')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="player-inspector-empty">No image-, portrait-, headshot-, asset-, face-, render-, avatar-, or presentation-like fields were detected in the active player records.</div>'}
      </article>

      ${selected?renderPlayerInspectorSelected(selected):'<article class="card"><div class="card-body"><p>No players are available in the active snapshot.</p></div></article>'}
    </section>`;
  }

  async function loadPlayerDataInspector(force=false) {
    if(playerInspectorState.loading)return;
    playerInspectorState.loading=true;
    playerInspectorState.error=null;
    rerenderPlayerDataInspector();
    try{
      const service=liveReadModel();
      if(!service)throw new Error('Live Read Model service is unavailable.');
      if(force) await service.refresh();
      const [players,teams,statistics,snapshot]=await Promise.all([
        service.getPlayers(),
        service.getTeams(),
        service.getStatistics(),
        service.getSnapshot()
      ]);
      playerInspectorState.players=players||[];
      playerInspectorState.teams=teams||[];
      playerInspectorState.statistics=statistics||[];
      playerInspectorState.snapshot=snapshot||null;
      playerInspectorState.imageFieldCoverage=playerInspectorImageCoverage(playerInspectorState.players);
      if(!playerInspectorState.selectedId && playerInspectorState.players[0]){
        playerInspectorState.selectedId=String(playerInspectorState.players[0].id||playerInspectorState.players[0].source?.player_external_id||playerInspectorState.players[0].source?.playerId||'');
      }
      playerInspectorState.loaded=true;
    }catch(error){
      playerInspectorState.error=error?.message||'Unable to inspect active player data.';
    }finally{
      playerInspectorState.loading=false;
      rerenderPlayerDataInspector();
    }
  }

  function rerenderPlayerDataInspector({preserveScroll=false,focusSearch=false}={}) {
    const target=document.querySelector('[data-player-inspector-host]');
    if(!target)return;

    const scrollY=preserveScroll?window.scrollY:null;
    const active=document.activeElement;
    const searchWasActive=Boolean(active?.matches?.('[data-player-inspector-search]'));
    const selectionStart=searchWasActive?active.selectionStart:null;
    const selectionEnd=searchWasActive?active.selectionEnd:null;

    target.innerHTML=renderPlayerDataInspector();

    requestAnimationFrame(()=>{
      if(preserveScroll && scrollY!==null){
        window.scrollTo({top:scrollY,left:0,behavior:'auto'});
      }
      if(focusSearch || searchWasActive){
        const next=document.querySelector('[data-player-inspector-search]');
        if(next){
          next.focus({preventScroll:true});
          if(selectionStart!==null){
            try{next.setSelectionRange(selectionStart,selectionEnd);}catch{}
          }
        }
      }
    });
  }

  window.FranchiseHQ.playerDataInspector = {
    async load(targetId) {
      const target=document.getElementById(targetId);
      if(!target)return;
      target.setAttribute('data-player-inspector-host','');
      if(!playerInspectorState.loaded&&!playerInspectorState.loading){
        await loadPlayerDataInspector(false);
      }else{
        target.innerHTML=renderPlayerDataInspector();
      }
    },
    renderPanel() {
      const id=`player-data-inspector-${Date.now()}`;
      setTimeout(()=>this.load(id),0);
      return `<section id="${id}" data-player-inspector-host><article class="card roadmap-state"><div class="roadmap-state__inner"><div class="spinner" aria-hidden="true"></div><h3>Loading Player Data Inspector…</h3><p>Reading player, team, statistics, and source records from the active snapshot.</p></div></article></section>`;
    },
    diagnostics() {
      return Object.freeze({
        service:'playerDataInspector',
        version:'5.9.6.6aedccbcb.2b.1ba.1',
        loaded:playerInspectorState.loaded,
        playerCount:playerInspectorState.players.length,
        teamCount:playerInspectorState.teams.length,
        statisticCount:playerInspectorState.statistics.length,
        imageCandidateFieldCount:playerInspectorState.imageFieldCoverage.length,
        selectedPlayerId:playerInspectorState.selectedId||null,
        lastError:playerInspectorState.error
      });
    }
  };

  document.addEventListener('input',event=>{
    const input=event.target.closest('[data-player-inspector-search]');
    if(!input)return;
    playerInspectorState.query=input.value||'';
    rerenderPlayerDataInspector({preserveScroll:true,focusSearch:true});
  });

  document.addEventListener('change',event=>{
    const seasonSelect=event.target.closest?.('[data-player-game-log-season]');
    if(!seasonSelect)return;

    const playerId=seasonSelect.dataset.playerGameLogSeason;
    const year=Number(seasonSelect.value);
    const target=document.querySelector(`[data-player-game-log-content="${CSS.escape(playerId)}"]`);
    if(target)target.innerHTML=canonicalGameLog(playerId,year);
  });

  document.addEventListener('change',event=>{
    const select=event.target.closest('[data-player-inspector-select]');
    if(!select)return;

    const selectedId=String(select.value||'');
    if(!selectedId)return;

    const exists=(playerInspectorState.players||[]).some(player=>String(player.id||'')===selectedId);
    if(!exists)return;

    playerInspectorState.selectedId=selectedId;
    rerenderPlayerDataInspector({preserveScroll:true});
  });

  let lastMatchupInputTiming=null;

  document.addEventListener('pointerdown',event=>{
    const target=event.target.closest?.('[data-game-id]');
    if(!target)return;
    lastMatchupInputTiming={
      gameId:String(target.dataset.gameId||''),
      pointerEventTime:performance.now(),
      nativeEventTimestamp:Number(event.timeStamp)||null
    };
  },true);

  document.addEventListener('click',async event=>{
    const sort=event.target.closest?.('[data-season-team-sort]');
    if(!sort)return;
    event.preventDefault();

    const wrapper=document.querySelector('.season-team-stat-table-wrap');
    const savedScroll={
      pageY:window.scrollY,
      left:wrapper?.scrollLeft||0,
      top:wrapper?.scrollTop||0
    };

    const key=sort.dataset.seasonTeamSort;
    if(state.teamStatsSortKey===key){
      state.teamStatsSortDirection=state.teamStatsSortDirection==='asc'?'desc':'asc';
    }else{
      state.teamStatsSortKey=key;
      state.teamStatsSortDirection='desc';
    }

    await renderStats();

    requestAnimationFrame(()=>{
      const next=document.querySelector('.season-team-stat-table-wrap');
      if(next){
        next.scrollLeft=savedScroll.left;
        next.scrollTop=savedScroll.top;
      }
      window.scrollTo({top:savedScroll.pageY,left:0,behavior:'auto'});
    });
  });

  document.addEventListener('click',event=>{
    const tab=event.target.closest?.('[data-player-career-stat-tab]');if(!tab)return;const root=tab.closest('.canonical-career-stats');if(!root)return;const category=tab.dataset.playerCareerStatTab;root.querySelectorAll('[data-player-career-stat-tab]').forEach(button=>button.classList.toggle('is-active',button===tab));root.querySelectorAll('[data-player-career-stat-panel]').forEach(panel=>panel.classList.toggle('is-active',panel.dataset.playerCareerStatPanel===category));
  });

  document.addEventListener('click',event=>{
    const openCert=event.target.closest?.('[data-open-player-stats-certification]');
    if(openCert){
      event.preventDefault();
      setRoute('player-stats-certification');
      return;
    }

    const rerun=event.target.closest?.('[data-run-player-stats-certification]');
    if(rerun){
      event.preventDefault();
      const host=document.querySelector('.player-stats-certification');
      if(host)host.outerHTML=renderPlayerStatisticsCertification();
      showToast('Certification complete','Player Statistics certification has been rerun against the active snapshot.');
    }
  });

  document.addEventListener('click',event=>{
    const sort=event.target.closest?.('[data-live-stats-sort]');
    if(!sort)return;
    event.preventDefault();
    const key=sort.dataset.liveStatsSort;
    if(state.statsSortKey===key){
      state.statsSortDirection=state.statsSortDirection==='asc'?'desc':'asc';
    }else{
      state.statsSortKey=key;
      state.statsSortDirection='desc';
    }
    renderStats();
  });

  document.addEventListener('click',event=>{
    const target=event.target.closest?.('[data-game-id]');
    if(!target)return;
    const now=performance.now();
    if(!lastMatchupInputTiming||lastMatchupInputTiming.gameId!==String(target.dataset.gameId||'')){
      lastMatchupInputTiming={
        gameId:String(target.dataset.gameId||''),
        pointerEventTime:now,
        nativeEventTimestamp:Number(event.timeStamp)||null
      };
    }
    lastMatchupInputTiming.clickCaptureTime=now;
  },true);

  document.addEventListener('click',event=>{
    if(event.target.closest('[data-player-inspector-reload]')){
      event.preventDefault();
      loadPlayerDataInspector(true);
    }
  });


  const playerStatisticsState={loaded:false,loading:false,rows:[],error:null,promise:null};
  const PLAYER_STAT_CATEGORIES=['passing','rushing','receiving','defense','kicking','punting'];

  function playerStatIdentity(row={}) {
    const source=row.source||{};
    return String(row.playerId||source.player_external_id||source.playerId||source.player_id||'');
  }
  function playerStatValue(row={},aliases=[]) {
    const metrics=row.metrics||{}, source=row.source||{};
    for(const alias of aliases){
      for(const bag of [metrics,source]){
        if(bag[alias]!==undefined&&bag[alias]!==null&&bag[alias]!=='')return bag[alias];
        const key=Object.keys(bag).find(k=>k.toLowerCase()===String(alias).toLowerCase());
        if(key&&bag[key]!==null&&bag[key]!=='')return bag[key];
      }
    }
    return null;
  }
  function playerStatNum(row={},aliases=[]) {
    const value=playerStatValue(row,aliases);
    if(value===null||value===undefined||value==='')return null;
    const number=Number(value);
    return Number.isFinite(number)?number:null;
  }
  function playerStatSum(rows=[],aliases=[]) {
    let found=false,total=0;
    rows.forEach(row=>{const n=playerStatNum(row,aliases);if(n!==null){found=true;total+=n;}});
    return found?total:null;
  }
  function playerStatLast(rows=[],aliases=[]) {
    for(let index=rows.length-1;index>=0;index--){
      const value=playerStatValue(rows[index],aliases);
      if(value!==null&&value!==undefined&&value!=='')return value;
    }
    return null;
  }
  function playerStatCategoryTotals(rows=[],category='') {
    const sum=aliases=>playerStatSum(rows,aliases);
    const max=aliases=>{const values=rows.map(row=>playerStatNum(row,aliases)).filter(v=>v!==null);return values.length?Math.max(...values):null;};
    const avg=aliases=>{const values=rows.map(row=>playerStatNum(row,aliases)).filter(v=>v!==null);return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;};
    if(category==='passing'){
      const cmp=sum(['passComp','passCompletions','completions','cmp']),att=sum(['passAtt','passAttempts','attempts','att']),yds=sum(['passYds','passYards','passingYards']);
      return {CMP:cmp,ATT:att,'CMP%':att?((cmp||0)/att)*100:null,YDS:yds,TD:sum(['passTDs','passingTDs','passTouchdowns']),INT:sum(['passInts','interceptionsThrown','ints']),'Y/A':att?yds/att:null,RTG:avg(['passRating','passerRating','qbRating','rating']),LONG:max(['passLongest','passLong','longPass']),SACK:sum(['passSacks','sacksTaken','sacked'])};
    }
    if(category==='rushing'){
      const att=sum(['rushAtt','rushingAttempts','carries']),yds=sum(['rushYds','rushYards','rushingYards']);
      return {ATT:att,YDS:yds,TD:sum(['rushTDs','rushingTDs']),'Y/A':att?yds/att:null,FUM:sum(['rushFum','rushFumbles','fumbles']),YACON:sum(['rushYdsAfterContact','rushYardsAfterContact']),'20+':sum(['rush20PlusYds','rush20Plus']),LONG:max(['rushLongest','rushLong','longRush']),BTK:sum(['rushBrokenTackles','brokenTackles'])};
    }
    if(category==='receiving'){
      const rec=sum(['recCatches','receptions','catches','rec']),yds=sum(['recYards','recYds','receivingYards']);
      return {REC:rec,YDS:yds,TD:sum(['recTDs','receivingTDs']),DROP:sum(['recDrops','drops']),YAC:sum(['recYdsAfterCatch','recYdsAfterCatc','recYardsAfterCatch']),'Y/R':rec?yds/rec:null,LONG:max(['recLongest','recLong','longReception'])};
    }
    if(category==='defense')return {TKL:sum(['defTotalTackles','totalTackles','tackles']),TFL:sum(['defTacklesForLoss','tacklesForLoss','tackleForLoss','tfl']),SACK:sum(['defSacks','sacks']),INT:sum(['defInts','defInterceptions']),FF:sum(['defForcedFum','forcedFumbles']),FR:sum(['defFumRec','fumbleRecoveries']),TD:sum(['defTDs','defensiveTDs'])};
    if(category==='kicking'){
      const fga=sum(['fGAtt','kickFGAtt','fieldGoalAttempts']),fgm=sum(['fGMade','kickFGMade','fieldGoalsMade']);
      return {FGA:fga,FGM:fgm,'FG%':fga?((fgm||0)/fga)*100:null,'50+ ATT':sum(['fG50PlusAtt']),'50+ MADE':sum(['fG50PlusMade']),XPA:sum(['xPAtt','kickXPAtt','extraPointAttempts']),XPM:sum(['xPMade','kickXPMade','extraPointsMade']),LONG:max(['fGLongest','kickLongFG','longFieldGoal']),PTS:sum(['kickPts','points'])};
    }
    if(category==='punting'){
      const punts=sum(['puntAtt','puntAttempts','punts']);
      const weighted=rows.map(row=>{const att=playerStatNum(row,['puntAtt','puntAttempts','punts']),rate=playerStatNum(row,['puntNetYdsPerAtt']);return att!==null&&rate!==null?{att,rate}:null;}).filter(Boolean);
      const denom=weighted.reduce((s,x)=>s+x.att,0);const netPerAtt=weighted.length&&denom?weighted.reduce((s,x)=>s+x.att*x.rate,0)/denom:avg(['puntNetYdsPerAtt']);
      return {PUNTS:punts,'NET Y/P':netPerAtt,IN20:sum(['puntsIn20','puntsInside20','inside20']),TB:sum(['puntTBs','puntTouchbacks','touchbacks']),LONG:max(['puntLongest','puntLong','longPunt'])};
    }
    return {};
  }
  function playerStatRows(playerId='') {
    const id=String(playerId||'');
    return playerStatisticsState.rows.filter(row=>playerStatIdentity(row)===id&&PLAYER_STAT_CATEGORIES.includes(String(row.category||'').toLowerCase()));
  }
  function playerStatModel(playerId='') {
    const rows=playerStatRows(playerId);
    const categories={};
    PLAYER_STAT_CATEGORIES.forEach(category=>{
      const items=rows.filter(row=>String(row.category||'').toLowerCase()===category).sort((a,b)=>Number(a.week||a.weekIndex||0)-Number(b.week||b.weekIndex||0));
      categories[category]={rows:items,totals:playerStatCategoryTotals(items,category)};
    });
    return {playerId:String(playerId||''),rows,categories};
  }
  function playerStatFormat(label,value){
    if(value===null||value===undefined||value===''||Number.isNaN(value))return '—';
    if(typeof value==='number'){
      if(label.includes('%'))return `${value.toFixed(1)}%`;
      if(['AVG','RTG','Y/A','Y/R','Y/G','NET Y/P'].includes(label))return value.toFixed(1);
      return Number.isInteger(value)?String(value):value.toFixed(1);
    }
    return String(value);
  }
  function playerStatLabel(category){return ({passing:'Passing',rushing:'Rushing',receiving:'Receiving',defense:'Defense',kicking:'Kicking',punting:'Punting'})[category]||category;}
  function playerStatCategoryOrderForPosition(position='',available=PLAYER_STAT_CATEGORIES){
    const pos=canonicalFilterPosition(position);let preferred;
    if(pos==='QB')preferred=['passing','rushing']; else if(['RB','FB'].includes(pos))preferred=['rushing','receiving']; else if(['WR','TE'].includes(pos))preferred=['receiving','rushing']; else if(pos==='K')preferred=['kicking']; else if(pos==='P')preferred=['punting']; else preferred=['defense'];
    return [...preferred,...PLAYER_STAT_CATEGORIES].filter((c,i,a)=>a.indexOf(c)===i&&available.includes(c));
  }
  function playerStatModelForPhase(playerId='',phase='regular-season'){
    const model=playerStatModel(playerId);
    const categories={};
    PLAYER_STAT_CATEGORIES.forEach(category=>{
      const rows=(model.categories[category]?.rows||[]).filter(row=>canonicalStatStage(row)===phase);
      categories[category]={rows,totals:playerStatCategoryTotals(rows,category)};
    });
    return {playerId:String(playerId||''),rows:model.rows.filter(row=>canonicalStatStage(row)===phase),categories};
  }

  function renderPlayerStatsReady(playerId='',requestedPhase='regular-season'){
    const full=playerStatModel(playerId);
    const hasPlayoffs=full.rows.some(row=>canonicalStatStage(row)==='playoffs');
    const phase=requestedPhase==='playoffs'&&hasPlayoffs?'playoffs':'regular-season';
    const model=playerStatModelForPhase(playerId,phase);
    const normalized=liveRosterPlayers.get(String(playerId))||rosterService()?.findPlayer?.(playerId);
    const view=normalized?rosterPlayerView(normalized):{};
    const availableRaw=PLAYER_STAT_CATEGORIES.filter(category=>model.categories[category].rows.length);
    const available=playerStatCategoryOrderForPosition(view.position,availableRaw);
    const year=canonicalCurrentSeasonYear();
    const phaseLabel=phase==='playoffs'?'Playoffs':'Regular Season';

    return `<div class="player-live-statistics" data-live-player-stats="${escapeHtml(playerId)}" data-player-stat-phase-current="${phase}">
      <div class="player-stat-phase-tabs" style="display:flex;gap:8px;margin-bottom:14px;">
        <button type="button" class="button button--small ${phase==='regular-season'?'button--primary':''}" data-player-stat-phase="regular-season">Regular Season</button>
        ${hasPlayoffs?`<button type="button" class="button button--small ${phase==='playoffs'?'button--primary':''}" data-player-stat-phase="playoffs">Playoffs</button>`:''}
      </div>
      ${available.length
        ? `<div class="player-live-stat-nav">${available.map((category,index)=>`<button type="button" class="player-live-stat-tab ${index===0?'is-active':''}" data-player-stat-tab="${category}">${playerStatLabel(category)}</button>`).join('')}</div>
           ${available.map((category,index)=>{
             const data=model.categories[category],totals=data.totals,columns=CANONICAL_STAT_COLUMNS[category]||[];
             return `<div class="player-live-stat-panel ${index===0?'is-active':''}" data-player-stat-panel="${category}">
               <div class="player-live-stat-season-heading"><div><span class="eyebrow">${escapeHtml(phaseLabel)} · ${playerStatLabel(category)}</span><h4>${escapeHtml(year||'Season')}</h4></div></div>
               <div class="player-live-stat-grid">${columns.map(([label])=>`<div><span>${label}</span><strong>${playerStatFormat(label,totals[label])}</strong></div>`).join('')}</div>
             </div>`;
           }).join('')}`
        : `<div class="player-live-stats-empty"><strong>No ${escapeHtml(phaseLabel)} statistics</strong><span>No mapped Madden ${escapeHtml(phaseLabel.toLowerCase())} records exist for this player.</span></div>`
      }
    </div>`;
  }
  function rerenderPlayerStatHosts(){
    document.querySelectorAll('[data-player-stat-host]').forEach(host=>{
      const id=host.getAttribute('data-player-stat-host')||'';
      const phase=host.querySelector('[data-player-stat-phase-current]')?.dataset?.playerStatPhaseCurrent||'regular-season';
      host.innerHTML=playerStatisticsState.error?`<div class="player-live-stats-empty"><strong>Statistics unavailable</strong><span>${escapeHtml(playerStatisticsState.error)}</span></div>`:renderPlayerStatsReady(id,phase);
    });
  }
  async function hydratePlayerStatistics(force=false){
    if(playerStatisticsState.loaded&&!force)return playerStatisticsState.rows;
    if(playerStatisticsState.promise&&!force)return playerStatisticsState.promise;
    playerStatisticsState.loading=true;playerStatisticsState.error=null;
    playerStatisticsState.promise=(async()=>{
      try{
        const service=liveReadModel();
        if(!service)throw new Error('Live Read Model service is unavailable.');
        if(force)await service.refresh();
        playerStatisticsState.rows=await service.getStatistics()||[];
        playerStatisticsState.loaded=true;
        matchupCompactModelCache.clear();
        // Build matchup lookup once while data is hydrating so opening/clicking
        // Matchup tabs never scans the full statistics collection.
        // Build indexes cooperatively after rows are available. Do not block
        // the browser's main thread or delay first user interaction.
        // Canonical index is the only startup index. Avoid the legacy
        // synchronous rebuilds that were still blocking first interaction.
        rebuildCanonicalStatisticsIndexCooperative(true);
        return playerStatisticsState.rows;
      }catch(error){
        playerStatisticsState.error=error?.message||'Unable to load player statistics.';
        return [];
      }finally{
        playerStatisticsState.loading=false;playerStatisticsState.promise=null;rerenderPlayerStatHosts();refreshOpenPlayerGameLogs();
      }
    })();
    return playerStatisticsState.promise;
  }
  function renderLivePlayerStatistics(playerId=''){
    if(!playerStatisticsState.loaded&&!playerStatisticsState.loading)hydratePlayerStatistics(false);
    if(!playerStatisticsState.loaded){
      return `<div data-player-stat-host="${escapeHtml(playerId)}"><div class="player-live-stats-loading"><span class="spinner" aria-hidden="true"></span><strong>Loading player statistics…</strong></div></div>`;
    }
    return `<div data-player-stat-host="${escapeHtml(playerId)}">${renderPlayerStatsReady(playerId)}</div>`;
  }
  document.addEventListener('click',event=>{
    const phaseButton=event.target.closest('[data-player-stat-phase]');
    if(!phaseButton)return;
    const root=phaseButton.closest('[data-live-player-stats]');
    if(!root)return;
    const playerId=root.dataset.livePlayerStats||'';
    root.outerHTML=renderPlayerStatsReady(playerId,phaseButton.dataset.playerStatPhase||'regular-season');
  });

  document.addEventListener('click',event=>{
    const tab=event.target.closest('[data-player-stat-tab]');
    if(!tab)return;
    const root=tab.closest('.player-live-statistics');if(!root)return;
    const category=tab.getAttribute('data-player-stat-tab');
    root.querySelectorAll('[data-player-stat-tab]').forEach(button=>button.classList.toggle('is-active',button===tab));
    root.querySelectorAll('[data-player-stat-panel]').forEach(panel=>panel.classList.toggle('is-active',panel.getAttribute('data-player-stat-panel')===category));
  });
  window.FranchiseHQ.playerStatistics={
    get(playerId){return playerStatModel(playerId);},
    render(playerId){return renderLivePlayerStatistics(playerId);},
    refresh(){return hydratePlayerStatistics(true);},
    diagnostics(playerId){const model=playerStatModel(playerId);return Object.freeze({playerId:String(playerId||''),loaded:playerStatisticsState.loaded,totalRecords:model.rows.length,categories:Object.fromEntries(PLAYER_STAT_CATEGORIES.map(category=>[category,model.categories[category].rows.length])),lastError:playerStatisticsState.error});}
  };

  function stageWeekContext(source={},fallbackWeek=0,fallbackStage='reg') {
    const resolver=window.FranchiseHQ?.canonicalWeekContext?.resolve;
    if(typeof resolver!=='function')throw new Error('Canonical week context is unavailable.');
    return resolver(source,fallbackWeek,fallbackStage);
  }

  function canonicalScheduleLabel(game={}) {
    if(game.round) return game.round;
    const source=game.source||{};
    const week=Number(game.week??game.weekIndex??source.week??source.weekIndex)||1;
    const stage=game.stage||game.phase||game.stageLabel||game.phaseLabel||source.stage||source.seasonStage||'regular';
    const postseason=canonicalPostseasonMeta(week,stage);
    if(postseason)return postseason.full;
    const phase=String(stage).toLowerCase();
    const label=game.stageLabel||game.phaseLabel||(phase.includes('pre')?'Preseason':phase.includes('post')||phase.includes('playoff')?'Playoffs':'Regular Season');
    return `${label} Week ${week}`;
  }

  // v5.9.9.0 — authoritative Madden contract/cap normalization.
  const CONTRACT_FIELD_ALIASES={
    yearsRemaining:['yearsRemaining','years','contractYearsLeft','contractYearsRemaining','contractLengthRemaining','yearsLeft','remainingYears','contractYearsRemain','contractYearsRem'],
    length:['length','contractLength','contractYears','totalContractYears','yearsTotal','contractTotalYears'],
    currentYearSalary:['currentYearSalary','currentSalary','capSalary','currentSeasonSalary','yearSalary','salaryCurrent','salaryThisYear'],
    capHit:['capHit','salaryCapHit','currentCapHit','currentYearCapHit','capNumber','capCharge','currentCapCharge'],
    currentYearBonus:['currentYearBonus','bonusCurrent','currentBonus'],
    totalSalary:['totalSalary','contractSalary','contractTotalSalary','salaryTotal','totalContractValue','contractValue'],
    totalBonus:['totalBonus','contractBonus','signingBonus','bonusTotal'],
    releaseNetSavings:['capReleaseNetSavings','releaseNetSavings','netSavings','releaseSavings','capSavings','netReleaseSavings','capReleaseSavings'],
    releasePenalty:['capReleasePenalty','totalReleasePenalty','releasePenalty','totalPenalty','deadCap','deadMoney','releaseDeadCap']
  };

  function contractCandidateSources(player={}) {
    const raw=player.raw||{};
    const source=player.source||raw||{};
    return [
      player.contract,
      source.contract,
      raw.contract,
      source.contractInfo,
      raw.contractInfo,
      source,
      raw,
      player
    ].filter(value=>value && typeof value==='object' && !Array.isArray(value));
  }

  function canonicalContractField(player={},field='') {
    const aliases=CONTRACT_FIELD_ALIASES[field]||[field];
    const sources=contractCandidateSources(player);
    for(let sourceIndex=0;sourceIndex<sources.length;sourceIndex+=1){
      const source=sources[sourceIndex];
      for(const key of aliases){
        const rawValue=source?.[key];
        if(rawValue===undefined || rawValue===null || rawValue==='') continue;
        const numeric=Number(rawValue);
        return {value:Number.isFinite(numeric)?numeric:rawValue,sourceField:key,sourceIndex,rawValue};
      }
    }
    return {value:null,sourceField:null,sourceIndex:null,rawValue:null};
  }

  function canonicalContract(player={}) {
    const resolved={};
    Object.keys(CONTRACT_FIELD_ALIASES).forEach(field=>resolved[field]=canonicalContractField(player,field));

    const numericOrNull=field=>{
      const numeric=Number(resolved[field].value);
      return Number.isFinite(numeric)?numeric:null;
    };

    let yearsRemaining=numericOrNull('yearsRemaining');
    let length=numericOrNull('length');
    if(yearsRemaining!==null && yearsRemaining<0) yearsRemaining=null;
    if(length!==null && length<0) length=null;
    if(length===null && yearsRemaining!==null) length=yearsRemaining;

    const contract={
      yearsRemaining,
      length,
      currentYearSalary:numericOrNull('currentYearSalary'),
      capHit:numericOrNull('capHit'),
      currentYearBonus:numericOrNull('currentYearBonus'),
      totalSalary:numericOrNull('totalSalary'),
      totalBonus:numericOrNull('totalBonus'),
      releaseNetSavings:numericOrNull('releaseNetSavings'),
      releasePenalty:numericOrNull('releasePenalty'),
      provenance:Object.fromEntries(Object.entries(resolved).map(([field,result])=>[
        field,result.sourceField?{sourceField:result.sourceField,rawValue:result.rawValue}:null
      ]))
    };

    const required=['yearsRemaining','totalSalary','capHit'];
    const available=required.filter(field=>contract[field]!==null).length;
    contract.completeness={
      available,
      required:required.length,
      percent:Math.round((available/required.length)*100),
      missing:required.filter(field=>contract[field]===null)
    };
    contract.hasAnyData=['yearsRemaining','length','currentYearSalary','capHit','currentYearBonus','totalSalary','totalBonus','releaseNetSavings','releasePenalty']
      .some(field=>contract[field]!==null);
    return contract;
  }

  function certifyContracts(players=[],teams=[]) {
    const audit=contractAudit(players);
    const checks=[];
    const add=(id,label,pass,detail,severity='error')=>checks.push({id,label,pass:Boolean(pass),detail,severity});

    add('players-present','Players loaded',audit.playerCount>0,
      `${audit.playerCount} player records available.`);

    add('contract-coverage','Contract data present',audit.playersWithAnyContract>0,
      `${audit.playersWithAnyContract}/${audit.playerCount} players contain at least one mapped contract field.`);

    add('core-fields','Core contract fields mapped',audit.playersComplete===audit.playerCount,
      `${audit.playersComplete}/${audit.playerCount} players have Years + Salary + Cap Hit.`,
      audit.playersComplete===audit.playerCount?'error':'warning');

    const negativeMoney=audit.rows.filter(row=>
      ['currentYearSalary','capHit','currentYearBonus','totalSalary','totalBonus','releasePenalty']
        .some(field=>Number(row.contract[field])<0)
    );
    add('no-negative-money','No invalid negative contract values',negativeMoney.length===0,
      negativeMoney.length?`${negativeMoney.length} players contain negative money fields.`:'No invalid negative money values found.');

    const negativeYears=audit.rows.filter(row=>Number(row.contract.yearsRemaining)<0 || Number(row.contract.length)<0);
    add('no-negative-years','No invalid negative contract years',negativeYears.length===0,
      negativeYears.length?`${negativeYears.length} players contain negative year values.`:'No invalid negative contract years found.');

    const playerIds=new Set();
    const duplicateIds=[];
    audit.rows.forEach(row=>{
      if(!row.playerId)return;
      if(playerIds.has(row.playerId)) duplicateIds.push(row.playerId);
      playerIds.add(row.playerId);
    });
    add('unique-player-contracts','One canonical contract per player',duplicateIds.length===0,
      duplicateIds.length?`${duplicateIds.length} duplicate player IDs found.`:'Player IDs are unique.');

    const rowsByTeam=new Map();
    audit.rows.forEach(row=>{
      const id=String(row.teamId||'');
      if(!id)return;
      if(!rowsByTeam.has(id))rowsByTeam.set(id,[]);
      rowsByTeam.get(id).push(row);
    });
    const teamsWithPlayers=teams.filter(team=>rowsByTeam.has(String(team.id)));
    add('team-coverage','Contracts resolve across loaded teams',teamsWithPlayers.length>0,
      `${teamsWithPlayers.length}/${teams.length||teamsWithPlayers.length} loaded teams have player contract rows.`);

    // UI consistency: roster view and canonical contract must agree because both are live consumers.
    const inconsistent=[];
    (players||[]).forEach(player=>{
      const canonical=canonicalContract(player);
      const roster=rosterPlayerView(player);
      const sameYears=Number(roster.years||0)===Number(canonical.yearsRemaining||0);
      const sameSalary=Number(roster.salary||0)===Number(canonical.totalSalary||0);
      const sameCap=Number(roster.capHit||0)===Number(canonical.capHit||0);
      if(!(sameYears&&sameSalary&&sameCap)) inconsistent.push(String(player.id||player.name||'unknown'));
    });
    add('consumer-consistency','Roster and canonical contract values agree',inconsistent.length===0,
      inconsistent.length?`${inconsistent.length} players differ between roster and canonical contract values.`:'Roster consumer matches canonical contract values.');

    const failures=checks.filter(check=>!check.pass && check.severity==='error');
    const warnings=checks.filter(check=>!check.pass && check.severity==='warning');
    return {
      release:'6.3.2',
      passed:failures.length===0,
      status:failures.length?'FAIL':warnings.length?'PASS WITH WARNINGS':'PASS',
      checks,
      failures,
      warnings,
      auditSummary:{
        playerCount:audit.playerCount,
        playersWithAnyContract:audit.playersWithAnyContract,
        playersComplete:audit.playersComplete,
        incompletePlayers:audit.incompletePlayers.length,
        coverage:audit.coverage
      },
      generatedAt:new Date().toISOString()
    };
  }

  function contractAudit(players=[]) {
    const rows=(players||[]).map(player=>{
      const contract=canonicalContract(player);
      return {
        playerId:String(player.id||''),
        playerName:player.name||player.displayName||'Unknown Player',
        teamId:String(player.teamId||''),
        position:String(player.position||''),
        contract
      };
    });

    const fields=Object.keys(CONTRACT_FIELD_ALIASES);
    const coverage=Object.fromEntries(fields.map(field=>{
      const count=rows.filter(row=>row.contract[field]!==null).length;
      return [field,{count,total:rows.length,percent:rows.length?Math.round(count/rows.length*100):0}];
    }));

    const sourceFields={};
    rows.forEach(row=>Object.entries(row.contract.provenance||{}).forEach(([field,meta])=>{
      if(!meta?.sourceField)return;
      sourceFields[field] ||= {};
      sourceFields[field][meta.sourceField]=(sourceFields[field][meta.sourceField]||0)+1;
    }));

    return {
      release:'5.9.10.0',
      playerCount:rows.length,
      playersWithAnyContract:rows.filter(row=>row.contract.hasAnyData).length,
      playersComplete:rows.filter(row=>row.contract.completeness.percent===100).length,
      coverage,
      sourceFields,
      incompletePlayers:rows.filter(row=>row.contract.completeness.percent<100),
      rows
    };
  }

  // v5.9.9.2 — shared, uppercase football position filter standard.
  const POSITION_FILTER_ORDER=['QB','HB','FB','WR','TE','LT','LG','C','RG','RT','REDGE','DT','LEDGE','SAM','MIKE','WILL','CB','FS','SS','K','P','LS'];
  const POSITION_FILTER_ALIASES={RB:'HB',REDG:'REDGE',REDGE:'REDGE',RDE:'REDGE',RE:'REDGE',LEDG:'LEDGE',LEDGE:'LEDGE',LDE:'LEDGE',LE:'LEDGE',LOLB:'SAM',SLB:'SAM',MLB:'MIKE',ILB:'MIKE',ROLB:'WILL',WLB:'WILL'};
  function canonicalFilterPosition(position=''){
    const value=String(position||'').trim().toUpperCase().replace(/[_ -]+/g,'');
    return POSITION_FILTER_ALIASES[value]||value;
  }
  function positionFilterLabel(position=''){return canonicalFilterPosition(position).toUpperCase();}
  function sortPositionFilterValues(values=[]){
    const unique=[...new Set((values||[]).map(canonicalFilterPosition).filter(Boolean))];
    return unique.sort((a,b)=>{
      const ai=POSITION_FILTER_ORDER.indexOf(a),bi=POSITION_FILTER_ORDER.indexOf(b);
      if(ai>=0||bi>=0){if(ai<0)return 1;if(bi<0)return -1;return ai-bi;}
      return a.localeCompare(b);
    });
  }

  // v5.9.10.0 — Madden transaction source audit and discovery.
  const TRANSACTION_KEY_PATTERN=/(transaction|trade|traded|sign|signed|release|released|waiver|waived|claim|claimed|acquire|acquired|formerteam|previousteam|oldteam|fromteam|toteam|movement|rosterchange)/i;
  const TRANSACTION_TYPE_PATTERN=/(trade|sign|release|waiver|claim|acquire|move|transaction)/i;

  function transactionScalar(value){
    return value===null || ['string','number','boolean'].includes(typeof value);
  }

  function scanTransactionEvidence(value,{path='root',depth=0,maxDepth=5,rows=[]}={}){
    if(value===null||value===undefined||depth>maxDepth)return rows;
    if(Array.isArray(value)){
      if(TRANSACTION_KEY_PATTERN.test(path)){
        rows.push({path,kind:'array',count:value.length,sample:value.slice(0,2)});
      }
      value.slice(0,250).forEach((item,index)=>scanTransactionEvidence(item,{path:`${path}[${index}]`,depth:depth+1,maxDepth,rows}));
      return rows;
    }
    if(typeof value!=='object')return rows;

    Object.entries(value).forEach(([key,child])=>{
      const childPath=`${path}.${key}`;
      if(TRANSACTION_KEY_PATTERN.test(key)){
        rows.push({
          path:childPath,
          key,
          kind:Array.isArray(child)?'array':typeof child,
          count:Array.isArray(child)?child.length:1,
          sample:transactionScalar(child)?child:Array.isArray(child)?child.slice(0,2):Object.fromEntries(Object.entries(child||{}).slice(0,8))
        });
      }
      if(child && typeof child==='object'){
        scanTransactionEvidence(child,{path:childPath,depth:depth+1,maxDepth,rows});
      }
    });
    return rows;
  }

  function transactionFieldCoverage(players=[]){
    const map=new Map();
    (players||[]).forEach(player=>{
      const source=player?.raw||player?.source||player||{};
      const seen=new Set();
      const walk=(value,path='',depth=0)=>{
        if(!value||typeof value!=='object'||depth>4)return;
        Object.entries(value).forEach(([key,child])=>{
          const fieldPath=path?`${path}.${key}`:key;
          if(TRANSACTION_KEY_PATTERN.test(key)){
            const identity=fieldPath.toLowerCase();
            if(!seen.has(identity)){
              seen.add(identity);
              const row=map.get(fieldPath)||{field:fieldPath,count:0,samples:[]};
              row.count+=1;
              const sample=transactionScalar(child)?child:(Array.isArray(child)?`Array(${child.length})`:'Object');
              if(row.samples.length<4 && !row.samples.some(value=>String(value)===String(sample)))row.samples.push(sample);
              map.set(fieldPath,row);
            }
          }
          if(child&&typeof child==='object')walk(child,fieldPath,depth+1);
        });
      };
      walk(source);
    });
    return [...map.values()].sort((a,b)=>b.count-a.count||a.field.localeCompare(b.field));
  }

  function transactionRosterInferenceCoverage(players=[]){
    const aliases={
      currentTeam:['teamId','team_id','teamExternalId','team_external_id'],
      rosterStatus:['rosterStatus','status','roster_status'],
      previousTeam:['previousTeamId','previous_team_id','formerTeamId','former_team_id','oldTeamId','fromTeamId'],
      transactionType:['transactionType','transaction_type','lastTransactionType','last_transaction_type','movementType'],
      transactionDate:['transactionDate','transaction_date','lastTransactionDate','last_transaction_date','signedDate','releaseDate'],
      transactionWeek:['transactionWeek','transaction_week','lastTransactionWeek','last_transaction_week'],
      transactionSeason:['transactionSeason','transaction_season','lastTransactionSeason','last_transaction_season']
    };
    const coverage={};
    Object.entries(aliases).forEach(([label,keys])=>{
      let count=0;
      const sourceFields={};
      (players||[]).forEach(player=>{
        const source=player?.raw||player?.source||player||{};
        const found=keys.find(key=>source?.[key]!==undefined&&source?.[key]!==null&&source?.[key]!=='');
        if(found){count+=1;sourceFields[found]=(sourceFields[found]||0)+1;}
      });
      coverage[label]={count,total:(players||[]).length,percent:(players||[]).length?Math.round(count/(players||[]).length*100):0,sourceFields};
    });
    return coverage;
  }

  function franchiseTradeRecords(teams=[]){
    const seen=new Set(),rows=[];
    (teams||[]).forEach(team=>{
      const history=window.FGC_TRADE?.getTeamTradeHistory?.(team.id)||[];
      history.forEach(row=>{
        const id=String(row.id||row.tradeId||'');
        const key=id||JSON.stringify([row.date,row.summary,row.teamIds]);
        if(seen.has(key))return;
        seen.add(key);
        rows.push({
          id:id||null,
          date:row.date||null,
          status:row.status||'approved',
          teamIds:row.teamIds||[],
          summary:row.summary||null,
          kind:row.kind||'trade'
        });
      });
    });
    return rows;
  }

  async function transactionDiscoveryAudit(){
    await loadLiveTeamDirectory(false);
    const directory=liveTeamDirectory;
    const players=directory?.players||[];
    const teams=directory?.teams||[];
    const snapshot=directory?.snapshot||null;

    const playerFieldCoverage=transactionFieldCoverage(players);
    const playerEvidence=players.flatMap(player=>
      scanTransactionEvidence(player?.raw||{},{
        path:`player:${player.id||player.name||'unknown'}`,
        maxDepth:4,
        rows:[]
      }).slice(0,40)
    );
    const snapshotEvidence=scanTransactionEvidence(snapshot||{},{
      path:'snapshot',
      maxDepth:6,
      rows:[]
    });

    const explicitPlayerEvidence=playerEvidence.filter(row=>
      TRANSACTION_TYPE_PATTERN.test(row.path) && !/rosterStatus|status/i.test(row.path)
    );
    const explicitSnapshotEvidence=snapshotEvidence.filter(row=>TRANSACTION_TYPE_PATTERN.test(row.path));
    const inferenceCoverage=transactionRosterInferenceCoverage(players);
    const tradeCenterRecords=franchiseTradeRecords(teams);

    const previousTeamCoverage=inferenceCoverage.previousTeam?.percent||0;
    const transactionTypeCoverage=inferenceCoverage.transactionType?.percent||0;
    const hasExplicit=explicitSnapshotEvidence.length>0 || explicitPlayerEvidence.length>0 || transactionTypeCoverage>0;

    let recommendedArchitecture='snapshot-diff-required';
    if(hasExplicit && previousTeamCoverage>0)recommendedArchitecture='hybrid-explicit-plus-snapshot-diff';
    else if(hasExplicit)recommendedArchitecture='explicit-first-with-snapshot-diff-fallback';

    const cautions=[];
    if(!hasExplicit)cautions.push('No reliable explicit Madden transaction event source was discovered in the currently loaded snapshot.');
    if(previousTeamCoverage===0)cautions.push('Current player rows do not preserve a previous-team field, so historical movement cannot be reconstructed from one snapshot alone.');
    cautions.push('Franchise HQ Trade Center records are application workflow records and must remain distinct from Madden-origin transactions.');

    return {
      release:'5.9.10.0',
      snapshotId:snapshot?.id||snapshot?.snapshotId||snapshot?.snapshot_id||null,
      playerCount:players.length,
      teamCount:teams.length,
      recommendedArchitecture,
      explicitMaddenEvidence:{
        found:hasExplicit,
        snapshotEvidence:explicitSnapshotEvidence.slice(0,100),
        playerEvidence:explicitPlayerEvidence.slice(0,100),
        candidateFieldCoverage:playerFieldCoverage
      },
      inferenceReadiness:{
        coverage:inferenceCoverage,
        canDiffCurrentRoster:Boolean(inferenceCoverage.currentTeam?.count),
        canClassifyStatusMovement:Boolean(inferenceCoverage.rosterStatus?.count),
        canInferHistoricalMovementFromSingleSnapshot:previousTeamCoverage>0
      },
      franchiseHQTradeCenter:{
        recordCount:tradeCenterRecords.length,
        records:tradeCenterRecords.slice(0,100),
        authority:'franchisehq-workflow-not-madden'
      },
      snapshotDiff:{
        required:recommendedArchitecture!=='explicit-only',
        previousSnapshotAvailableInCurrentClient:false,
        note:'5.9.10.0 audits the active snapshot. If prior roster state is not embedded in Madden data, 5.9.10.1 must compare persisted snapshots server-side.'
      },
      cautions,
      generatedAt:new Date().toISOString()
    };
  }

  function liveRosterPlayerShape(player={}) {
    const source=player.source||{};
    const contract=canonicalContract({...player,raw:source,source});
    const ratings={...(player.ratings||{})};
    Object.entries(source).forEach(([key,value])=>{
      const numeric=Number(value);
      if(Number.isFinite(numeric) && /rating|speed|acceleration|awareness|strength|agility|throw|catch|route|tackle|coverage|block|power|finesse|^spd$|^str$|^agi$|^acc$|^awr$|^aws$/i.test(key)) ratings[key]=numeric;
    });
    Object.assign(ratings,corePlayerRatings(source,ratings));
    return {
      id:String(player.id||source.playerId||source.external_id||''),
      publicId:PUBLIC_PLAYER_ID_PATTERN.test(String(player.publicId||'').toLowerCase())?String(player.publicId).toLowerCase():null,
      name:player.displayName||source.displayName||source.fullName||[player.firstName||source.firstName,player.lastName||source.lastName].filter(Boolean).join(' ')||'Unknown Player',
      firstName:player.firstName||source.firstName||'',
      lastName:player.lastName||source.lastName||'',
      teamId:String(player.teamId||source.teamId||source.team_id||source.rosterTeamId||''),
      position:canonicalFilterPosition(player.position||source.position||source.positionName||source.pos||''),
      overall:officialRating({...source,...player},['overall','overallRating','ovrRating','playerBestOvr','bestOverall','overall_rating','playerOverall','ovr']),
      age:Number(player.age??source.age??0)||null,
      yearsPro:Number(source.yearsPro||source.experience||0)||null,
      developmentTrait:normalizeLiveDevelopment(player.devTrait??source.devTrait??source.developmentTrait??source.dev),
      injuryStatus:source.injuryStatus||source.injury||'Healthy',
      depthOrder:Number(source.depthOrder??source.depthChartOrder??source.depth_chart_order??source.depth??source.depthPositionOrder??source.positionOrder??99),
      depthPosition:canonicalFilterPosition(source.depthPosition??source.depthChartPosition??source.depth_chart_position??source.depthSlot??source.depthChartSlot??source.positionDepth??source.position??player.position??''),
      rosterStatus:String(source.rosterStatus||source.status||'active').toLowerCase(),
      contract,
      ratings,
      abilities:Array.isArray(player.abilities)?player.abilities:[],
      raw:{...source,
        college:source.college||source.school||source.collegeName||'—',
        jersey_number:player.jersey_number||source.jersey_number||player.jerseyNumber||source.jerseyNumber||source.number||'—',
        jerseyNumber:player.jersey_number||source.jersey_number||player.jerseyNumber||source.jerseyNumber||source.number||'—',
        imageUrl:source.imageUrl||source.playerImageUrl||source.headshotUrl||source.portraitUrl||null
      }
    };
  }

  async function loadLiveTeamDirectory(force=false) {
    if(liveTeamDirectory?.snapshot&&liveTeamDirectory?.playersByTeam&&!force) return liveTeamDirectory;
    if(liveTeamDirectoryLoading) {
      while(liveTeamDirectoryLoading) await new Promise(resolve=>setTimeout(resolve,25));
      if(!force) return liveTeamDirectory;
    }
    liveTeamDirectoryLoading=true;
    try{
      const service=liveReadModel();
      if(!service) return null;

      // 5.9.11.0 — a new activated snapshot must invalidate BOTH layers:
      // Live Read Model caches and app-level liveTeamDirectory caches.
      if(force && typeof service.refresh==='function'){
        await service.refresh();
      }

      const [stateValue,snapshotValue,teamRows,standingRows,playerRows,gameRows,freeAgentStateValue,integrity]=await Promise.all([
        service.getState(),service.getSnapshot(),service.getTeams(),service.getStandings(),service.getPlayers(),service.getSchedule(),service.getFreeAgentState(),service.getIntegrity()
      ]);
      if(stateValue!=='live') {
        applyActiveSnapshotShell(null);
        return null;
      }
      const standingMap=new Map(standingRows.map(row=>[String(row.teamId),row]));
      const teamsLive=teamRows.map(team=>liveTeamUiShape(team,standingMap.get(String(team.id))));
      [...teamsLive].sort((a,b)=>Number(b.pf)-Number(a.pf)||String(a.fullName).localeCompare(String(b.fullName))).forEach((team,index)=>team.pfRank=index+1);
      [...teamsLive].sort((a,b)=>Number(a.pa)-Number(b.pa)||String(a.fullName).localeCompare(String(b.fullName))).forEach((team,index)=>team.paRank=index+1);
      let freeAgentState=freeAgentStateValue;
      const playersLive=playerRows.map(liveRosterPlayerShape);
      const activeSnapshotFreeAgents=playersLive.filter(player=>player.rosterStatus==='free-agent');
      if((freeAgentState?.status==='ready'&&activeSnapshotFreeAgents.length!==Number(freeAgentState.count))||(freeAgentState?.status==='empty-confirmed'&&activeSnapshotFreeAgents.length!==0)){
        freeAgentState={status:'unavailable',count:null,reason:'The active snapshot Free Agent rows do not reconcile to its pinned player-mapping source.',interpretedAsZero:false,authority:'active-snapshot'};
      }
      liveRosterPlayers.clear();
      playersLive.forEach(player=>{
        if(player.id)liveRosterPlayers.set(String(player.id),player);
        if(player.publicId)liveRosterPlayers.set(String(player.publicId),player);
      });
      const playersByTeam=new Map();
      playersLive.forEach(player=>{
        const key=String(player.teamId||'');
        if(!playersByTeam.has(key)) playersByTeam.set(key,[]);
        playersByTeam.get(key).push(player);
      });
      playersByTeam.forEach(list=>list.sort((a,b)=>(Number(a.depthOrder)||99)-(Number(b.depthOrder)||99)||(Number(b.overall)||0)-(Number(a.overall)||0)||a.name.localeCompare(b.name)));
      const provisionalGames=gameRows.map(game=>liveGameShape(game,new Map(teamsLive.map(team=>[String(team.id),team]))));
      const currentContext=authoritativeSeasonContext(snapshotValue,standingRows,provisionalGames);
      const normalizedGames=gameRows.map(game=>liveGameShape(game,new Map(teamsLive.map(team=>[String(team.id),team])),currentContext));
      liveTeamDirectory={
        snapshot:snapshotValue,
        currentContext,
        teams:teamsLive,
        teamMap:new Map(teamsLive.flatMap(team=>[
          [String(team.id),team],
          ...(team.slug?[[String(team.slug),team]]:[])
        ])),
        standingMap,
        players:playersLive,
        rosteredPlayers:playersLive.length,
        playerMap:new Map(playersLive.flatMap(player=>[
          [String(player.id),player],
          ...(player.publicId?[[String(player.publicId),player]]:[])
        ])),
        playersByTeam,
        games:normalizedGames,
        freeAgents:freeAgentState,
        integrity
      };
      window.FranchiseHQ=window.FranchiseHQ||{};
      window.FranchiseHQ.currentSeasonContext=currentContext;
      applyActiveSnapshotShell(snapshotValue,currentContext);
      return liveTeamDirectory;
    } finally {
      liveTeamDirectoryLoading=false;
    }
  }

  function liveRosterModel(team,players) {
    const active=players.filter(player=>player.rosterStatus==='active'||!player.rosterStatus).length;
    return {
      teamId:String(team.id),team,found:true,players,
      summary:{total:players.length,active,injuredReserve:players.filter(player=>player.rosterStatus==='injured-reserve').length,practiceSquad:players.filter(player=>player.rosterStatus==='practice-squad').length,other:players.length-active},
      provenance:{mode:'live',authority:'active-snapshot',authoritative:true,sourceType:'madden-companion'},
      health:{healthy:true,playerCount:players.length,errorCount:0,warningCount:0,issues:[]}
    };
  }

  async function renderTeamsLive() {
    const service=liveReadModel();
    if(!service){
      pageContent.innerHTML=`<article class="card roadmap-state"><div class="roadmap-state__inner"><h2>Teams unavailable</h2><p>The live read service has not loaded.</p></div></article>`;
      return;
    }

    // Paint the page chrome immediately. Team cards hydrate from the small teams +
    // standings domains only; do not wait for 2,000+ players, schedule, or Free Agents.
    pageContent.innerHTML=`
      <div class="page-heading"><div><h1>Teams</h1></div><div class="heading-actions"><button class="button button--ghost" data-demo-toast="Team comparison remains planned for a later release."><svg><use href="#icon-chart"></use></svg>Compare teams</button></div></div>
      <div class="filter-bar">
        <label class="field field--grow"><span>Search teams or owners</span><div class="input-wrap"><svg><use href="#icon-search"></use></svg><input data-team-search value="${escapeHtml(state.teamSearch)}" placeholder="Ravens, owner, Baltimore..." /></div></label>
        <label class="field"><span>Conference</span><select data-team-conference><option ${state.teamConference==='All'?'selected':''}>All</option><option ${state.teamConference==='AFC'?'selected':''}>AFC</option><option ${state.teamConference==='NFC'?'selected':''}>NFC</option></select></label>
        <label class="field"><span>Division</span><select data-team-division><option ${state.teamDivision==='All'?'selected':''}>All</option><option>East</option><option>North</option><option>South</option><option>West</option></select></label>
        <span class="result-count" data-team-count>Loading…</span>
      </div>
      <div class="team-grid" data-team-grid><article class="card roadmap-state" style="grid-column:1/-1"><div class="roadmap-state__inner"><p>Loading teams…</p></div></article></div>`;

    try{
      const [stateValue,snapshot,teamRows,standingRows]=await Promise.all([
        service.getState(),service.getSnapshot(),service.getTeams(),service.getStandings()
      ]);
      if(routeBase(currentAppRoute())!=='teams'||currentAppRoute().split('/')[1])return;
      if(stateValue!=='live'||!snapshot){
        pageContent.innerHTML=`<article class="card roadmap-state"><div class="roadmap-state__inner"><h2>Team data unavailable</h2><p>Teams will appear after the first successful import.</p></div></article>`;
        return;
      }
      const standingMap=new Map((standingRows||[]).map(row=>[String(row.teamId),row]));
      const teamsLive=(teamRows||[]).map(team=>liveTeamUiShape(team,standingMap.get(String(team.id))));
      liveTeamDirectory=liveTeamDirectory||{};
      liveTeamDirectory.teams=teamsLive;
      liveTeamDirectory.teamMap=new Map(teamsLive.flatMap(team=>[
        [String(team.id),team],
        ...(team.slug?[[String(team.slug),team]]:[])
      ]));
      liveTeamDirectory.standings=standingRows||[];
      liveTeamDirectory.standingMap=standingMap;
      refreshTeamGrid();
    }catch(error){
      console.error('[Teams Live Integration]',error);
      if(routeBase(currentAppRoute())==='teams'){
        const grid=document.querySelector('[data-team-grid]');
        if(grid)grid.innerHTML=`<article class="card roadmap-state" style="grid-column:1/-1"><div class="roadmap-state__inner"><h2>Teams unavailable</h2><p>${escapeHtml(error.message||'League team data could not be read.')}</p></div></article>`;
      }
    }
  }

  function renderTeams() {
    renderTeamsLive();
    return;
    pageContent.innerHTML = `
      <div class="page-heading"><div><h1>Teams</h1></div><div class="heading-actions"><button class="button button--ghost" data-demo-toast="Team comparison will be added after the core league pages are complete."><svg><use href="#icon-chart"></use></svg>Compare teams</button></div></div>
      <div class="filter-bar">
        <label class="field field--grow"><span>Search teams or owners</span><div class="input-wrap"><svg><use href="#icon-search"></use></svg><input data-team-search value="${escapeHtml(state.teamSearch)}" placeholder="Cowboys, Peckin, Dallas..." /></div></label>
        <label class="field"><span>Conference</span><select data-team-conference><option ${state.teamConference==='All'?'selected':''}>All</option><option ${state.teamConference==='AFC'?'selected':''}>AFC</option><option ${state.teamConference==='NFC'?'selected':''}>NFC</option></select></label>
        <label class="field"><span>Division</span><select data-team-division><option ${state.teamDivision==='All'?'selected':''}>All</option><option>East</option><option>North</option><option>South</option><option>West</option></select></label>
        <span class="result-count" data-team-count></span>
      </div>
      <div class="team-grid" data-team-grid></div>`;
    refreshTeamGrid();
  }

  function refreshTeamGrid() {
    const grid = document.querySelector('[data-team-grid]');
    if (!grid) return;
    const term = state.teamSearch.trim().toLowerCase();
    const ownedTeamId = liveOwnedTeamId();
    const teamCollection = liveTeamDirectory?.teams || teams;
    const filtered = teamCollection.filter(team => {
      const matchesTerm = !term || `${team.fullName} ${team.abbr} ${team.owner}`.toLowerCase().includes(term);
      return matchesTerm && (state.teamConference === 'All' || team.conference === state.teamConference) && (state.teamDivision === 'All' || team.division === state.teamDivision);
    }).sort((a,b) => {
      if (ownedTeamId && a.id === ownedTeamId && b.id !== ownedTeamId) return -1;
      if (ownedTeamId && b.id === ownedTeamId && a.id !== ownedTeamId) return 1;
      return a.conference.localeCompare(b.conference) || a.division.localeCompare(b.division) || sortStandings(a,b);
    });
    document.querySelector('[data-team-count]').textContent = `${filtered.length} of ${teamCollection.length} teams`;
    grid.innerHTML = filtered.length ? filtered.map(team => `
      <article class="team-card card team-card--clickable" style="${teamStyle(team)}" data-team-id="${team.id}" tabindex="0" role="button" aria-label="Open ${escapeHtml(team.fullName)}">
        <div class="team-card__top">${renderTeamMark(team,'team-logo')}<div class="team-card__record"><strong>${team.record}</strong><small>#${team.divisionRank} ${team.division}</small></div></div>
        <h3>${team.fullName}${ownedTeamId===team.id?'<span class="my-team-tag">MY TEAM</span>':''}</h3><span class="team-card__owner">${escapeHtml(team.owner)} · ${team.conference} ${team.division}</span>
        <div class="team-card__metrics team-card__metrics--overall"><span><strong>${team.ovr??'—'}</strong><small>Overall</small></span></div>
        <div class="team-card__footer"><span>${compactMoney(team.cap)} cap space</span><span>${escapeHtml(team.streak)}</span></div>
      </article>`).join('') : `<article class="card roadmap-state" style="grid-column:1/-1"><div class="roadmap-state__inner"><div class="roadmap-icon"><svg><use href="#icon-search"></use></svg></div><h2>No teams found</h2><p>Try clearing a filter or searching for another city, nickname, abbreviation, or owner.</p></div></article>`;

    grid.querySelectorAll('.team-card[data-team-id]').forEach(card=>{
      const open=event=>{
        if(event){
          const nested=event.target.closest('button, a, input, select, textarea, label');
          if(nested && nested!==card) return;
          event.preventDefault();
          event.stopPropagation();
        }
        const teamId=card.dataset.teamId;
        state.teamTab='roster';
        setRoute(`teams/${teamId}`,{source:'team-card'});
      };
      card.onclick=open;
      card.onkeydown=event=>{
        if(['Enter',' '].includes(event.key)) open(event);
      };
    });
  }

  function rosterService() {
    return window.FranchiseHQ?.modules?.league?.rosters || window.FranchiseHQ?.leagueRosters || null;
  }

  function rosterPlayerView(player) {
    const raw = player?.raw || {};
    const contract = canonicalContract(player);
    const resolvedTeamId = String(player?.teamId ?? raw.teamId ?? raw.team_id ?? raw.teamExternalId ?? raw.team_external_id ?? '');
    const position = canonicalFilterPosition(player?.position ?? raw.position ?? raw.positionAbbr ?? raw.pos ?? '');
    const depthPosition = canonicalFilterPosition(player?.depthPosition ?? raw.depthPosition ?? raw.depthChartPosition ?? raw.depth_chart_position ?? raw.depthSlot ?? raw.depthChartSlot ?? position);
    return {
      ...player,
      contract,
      teamId: resolvedTeamId,
      position,
      dev: normalizeLiveDevelopment(player?.developmentTrait ?? raw.dev ?? raw.developmentTrait),
      injury: player?.injuryStatus || raw.injury || 'Healthy',
      years: Number(contract.yearsRemaining ?? 0) || 0,
      salary: Number(contract.totalSalary ?? 0) || 0,
      capHit: Number(contract.capHit ?? 0) || 0,
      depth: player?.depthOrder ?? raw.depthOrder ?? raw.depthChartOrder ?? raw.depth_chart_order ?? raw.depth ?? null,
      depthPosition,
      college: raw.college || raw.school || '—',
      imageUrl: raw.imageUrl || raw.playerImageUrl || raw.headshotUrl || raw.headshot || raw.photoUrl || raw.photo || raw.portraitUrl || raw.portrait || player?.imageUrl || player?.headshotUrl || null,
      imageAssetId: raw.imageAssetId || raw.portraitId || raw.headshotId || null,
      number: raw.jersey_number || raw.jerseyNumber || raw.number || player?.jersey_number || player?.jerseyNumber || '—',
      age: Number(player?.age ?? raw.age ?? 0) || null,
      height: raw.height || '—',
      weight: raw.weight || '—',
      tradeBlock: Boolean(raw.tradeBlock),
      initials: raw.initials || String(player?.name || '?').split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase(),
      ratings:{...(player?.ratings||raw.ratings||{}),...corePlayerRatings(raw,player?.ratings||raw.ratings||{})},
      stats: player?.stats || raw.stats || {}
    };
  }

  function isRookiePlayer(player={}) {
    const raw=player?.raw||player?.source||{};
    const values=[
      player?.yearsPro,
      raw.yearsPro,
      raw.years_pro,
      raw.experience,
      raw.yearsExperience,
      raw.proYears,
      raw.nflExperience
    ];
    for(const value of values){
      if(value===null||value===undefined||value==='')continue;
      const numeric=Number(value);
      if(Number.isFinite(numeric))return numeric===0;
    }
    return false;
  }

  function playerIsRetired(player={}) {
    const raw=player?.raw||player?.source||{};
    const values=[
      player?.rosterStatus,player?.status,raw.rosterStatus,raw.roster_status,
      raw.playerStatus,raw.player_status,raw.status,raw.transactionStatus
    ];
    if(player?.isRetired===true||raw?.isRetired===true||raw?.retired===true||raw?.hasRetired===true)return true;
    return values.some(value=>/(^|\b)(retired|retirement)(\b|$)/i.test(String(value||'').trim()));
  }

  function rosterTeamView(teamId) {
    const id=String(teamId??'');
    const directoryTeam=liveTeamDirectory?.teamMap?.get(id)
      || liveTeamDirectory?.teams?.find(team=>String(team.id)===id||String(team.source?.teamId??team.source?.team_id??team.source?.teamExternalId??team.source?.team_external_id??'')===id);
    if(directoryTeam) return directoryTeam;
    if(liveTeamDirectory?.snapshot) return null;
    const legacy = teamById(id);
    if (legacy) return legacy;
    const current = window.FranchiseHQ?.leagueData?.current?.();
    const team = (current?.teams || []).find(item => String(item.id) === id || String(item.source?.teamId??item.source?.team_id??item.source?.team_external_id??'')===id);
    if (!team) return null;
    const standing=liveTeamDirectory?.standingMap?.get(String(team.id))||null;
    return liveTeamUiShape(team,standing);
  }

  function rosterSourceLabel(provenance) {
    if (provenance?.mode === 'live') return provenance.sourceType === 'madden-companion' ? 'Madden Companion' : 'Verified Madden snapshot';
    if (provenance?.mode === 'demo') return 'Development Data';
    return 'No league data';
  }

  function formatRosterContract(player) {
    const view = rosterPlayerView(player);
    const years = view.years ? `${view.years} yr${view.years === 1 ? '' : 's'}` : '—';
    const salary = view.contract.totalSalary!=null ? compactMoney(view.contract.totalSalary) : 'Unavailable';
    return `${years} / ${salary}`;
  }

  function schoolAbbreviation(value) {
    const school = String(value || '').trim();
    if (!school || school === '—') return '—';
    const normalized = school.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const known = {
      'oklahoma':'OKL','ohio state':'OSU','alabama':'ALA','georgia':'UGA','texas':'TEX','lsu':'LSU',
      'louisiana state':'LSU','michigan':'MCH','oregon':'ORE','clemson':'CLE','penn state':'PSU',
      'florida state':'FSU','usc':'USC','southern california':'USC','notre dame':'NDM','tennessee':'TEN',
      'washington':'WAS','miami':'MIA','ucla':'UCL','tcu':'TCU','auburn':'AUB','baylor':'BAY',
      'oklahoma state':'OKS','texas a m':'TAM','texas a&m':'TAM','virginia tech':'VTK','kansas state':'KSU'
    };
    if (known[normalized]) return known[normalized];
    const compact = school.replace(/[^A-Za-z0-9]/g,'').toUpperCase();
    if (compact.length >= 3) return compact.slice(0,3);
    return compact.padEnd(3,'X');
  }

  function rosterGroupForPlayer(player) {
    const status = String(player.rosterStatus || '').toLowerCase();
    if (status === 'injured-reserve') return 'Injured Reserve';
    if (['practice-squad','inactive','unassigned'].includes(status)) return 'Practice Squad / Other';
    const pos = String(player.position || '').toUpperCase();
    if (['QB','RB','HB','FB','WR','TE','LT','LG','C','RG','RT','OL'].includes(pos)) return 'Offense';
    if (['K','P','LS','KR','PR'].includes(pos)) return 'Special Teams';
    if (pos) return 'Defense';
    return 'Other';
  }

  function rosterSortValue(player,key) {
    if(key==='player') return String(player.name||'').toLowerCase();
    if(key==='position') return String(player.position||'');
    if(key==='overall'||key==='age') return Number(player[key]??-1);
    if(['spd','str','agi','acc','awr'].includes(key)) return Number(player.ratings?.[key]??-1);
    if(key==='development') return String(player.dev||'');
    if(key==='contract') return Number(player.years||0);
    if(key==='salary') return Number(player.salary||0);
    if(key==='status') return String(player.injury||player.rosterStatus||'');
    return 0;
  }

  function rosterSortButton(key,label) {
    const active=(state.rosterSortKey||'overall')===key;
    const direction=state.rosterSortDirection||'desc';
    return `<button type="button" class="roster-sort-button ${active?'is-active':''}" data-roster-sort="${key}">${label}${active?` <span>${direction==='asc'?'▲':'▼'}</span>`:''}</button>`;
  }

  function sizeRosterScrollWindow(root=document) {
    requestAnimationFrame(()=>{
      const wrapper=root?.querySelector?.('[data-roster-scroll-window]') || document.querySelector('[data-roster-scroll-window]');
      if(!wrapper)return;
      wrapper.style.removeProperty('max-height');
      wrapper.style.removeProperty('height');
      wrapper.dataset.verticalScroll='page';
    });
  }

  function renderRosterExperience(team, rosterModel) {
    const allPlayers = rosterModel.players.map(rosterPlayerView).sort((a,b) => (Number(b.overall)||0) - (Number(a.overall)||0) || String(a.name).localeCompare(String(b.name)));
    const rosterOwner=accountOwnsTeam(team);
    const positions = sortPositionFilterValues(allPlayers.map(player => player.position));
    const devTraits = [...new Set(allPlayers.map(player => player.dev).filter(Boolean))].sort();
    const sortKey=state.rosterSortKey||'overall';
    const sortDirection=state.rosterSortDirection||'desc';
    const filtered = allPlayers.filter(player => {
      if (state.rosterGroup !== 'All' && rosterGroupForPlayer(player) !== state.rosterGroup) return false;
      if (state.rosterPosition !== 'All' && canonicalFilterPosition(player.position) !== canonicalFilterPosition(state.rosterPosition)) return false;
      if (state.rosterDev !== 'All' && player.dev !== state.rosterDev) return false;
      return true;
    }).sort((a,b)=>{
      const av=rosterSortValue(a,sortKey);
      const bv=rosterSortValue(b,sortKey);
      const comparison=(typeof av==='number'&&typeof bv==='number')
        ? av-bv
        : String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:'base'});
      return (sortDirection==='asc'?comparison:-comparison)||String(a.name).localeCompare(String(b.name));
    });
    return `<div class="roster-experience roster-experience--clean">
      <div class="filter-bar roster-table-filters">
        <label class="field"><span>Roster Group</span><select data-roster-group><option value="All">Full Roster</option>${['Offense','Defense','Special Teams','Injured Reserve','Practice Squad / Other','Other'].map(value=>`<option value="${value}" ${state.rosterGroup===value?'selected':''}>${value}</option>`).join('')}</select></label>
        <label class="field"><span>Position</span><select data-roster-position><option value="All">All Positions</option>${positions.map(value=>`<option value="${escapeHtml(canonicalFilterPosition(value))}" ${canonicalFilterPosition(state.rosterPosition)===canonicalFilterPosition(value)?'selected':''}>${escapeHtml(positionFilterLabel(value))}</option>`).join('')}</select></label>
        <label class="field"><span>Development</span><select data-roster-dev><option value="All">All Traits</option>${devTraits.map(value=>`<option value="${escapeHtml(value)}" ${state.rosterDev===value?'selected':''}>${escapeHtml(value)}</option>`).join('')}</select></label>
        <span class="result-count">${filtered.length} player${filtered.length===1?'':'s'} · sorted by ${escapeHtml(state.rosterSortKey||'overall')}</span>
      </div>
      <article class="card roster-table-card"><div class="table-wrap roster-table-scroll-window" data-roster-scroll-window><table class="team-roster-table team-roster-table--single"><thead><tr><th>${rosterSortButton('player','Player')}</th><th>${rosterSortButton('position','Pos')}</th><th>${rosterSortButton('overall','OVR')}</th><th>${rosterSortButton('age','Age')}</th><th>${rosterSortButton('development','Development')}</th><th>${rosterSortButton('spd','SPD')}</th><th>${rosterSortButton('str','STR')}</th><th>${rosterSortButton('agi','AGI')}</th><th>${rosterSortButton('acc','ACC')}</th><th>${rosterSortButton('awr','AWR')}</th><th>${rosterSortButton('salary','Contract')}</th><th>${rosterSortButton('status','Status')}</th></tr></thead><tbody>${filtered.map(player=>{const blockActive=rosterOwner&&window.FGC_TRADE?.onBlock?.(player);return `<tr class="clickable-row roster-player-row" data-roster-player-detail="${escapeHtml(player.id||'')}"><td><div class="roster-player-inline">${rosterOwner?`<button type="button" class="roster-star ${blockActive?'is-active':''}" data-player-action="star" data-player-id-action="${escapeHtml(player.id||'')}" aria-pressed="${blockActive?'true':'false'}" aria-label="${blockActive?'Remove from Trade Block':'Add to Trade Block'}" title="${blockActive?'Remove from Trade Block':'Add to Trade Block'}"><svg><use href="#icon-star"></use></svg></button>`:''}<span class="roster-player-inline__identity"><strong>${escapeHtml(player.name)}</strong><small>— ${escapeHtml(schoolAbbreviation(player.college))}</small></span><button type="button" class="roster-trade-button roster-trade-button--compact" data-add-player-trade="${escapeHtml(player.id||'')}">Trade</button></div></td><td><span class="pill pill--neutral">${escapeHtml(player.position||'—')}</span></td><td><span class="rating-chip ${player.overall>=90?'rating-chip--elite':player.overall>=84?'rating-chip--high':''}">${player.overall ?? '—'}</span></td><td>${player.age ?? '—'}</td><td><span class="dev-badge ${devClass(player.dev)}">${escapeHtml(player.dev)}</span></td><td class="roster-core-rating">${player.ratings?.spd??'—'}</td><td class="roster-core-rating">${player.ratings?.str??'—'}</td><td class="roster-core-rating">${player.ratings?.agi??'—'}</td><td class="roster-core-rating">${player.ratings?.acc??'—'}</td><td class="roster-core-rating">${player.ratings?.awr??'—'}</td><td>${escapeHtml(formatRosterContract(player))}</td><td><span class="pill ${player.injury==='Healthy'?'pill--success':'pill--warning'}">${escapeHtml(player.rosterStatus==='active'?player.injury:titleCase(String(player.rosterStatus||'other').replace(/-/g,' ')))}</span></td></tr>`}).join('') || `<tr><td colspan="12"><div class="roster-no-results"><strong>No players match these filters.</strong><span>Change a roster filter to see more players.</span></div></td></tr>`}</tbody></table></div></article>
    </div>`;
  }

  function depthPlayerImageMarkup(player) {
    const candidates=canonicalPlayerImageCandidates(player||{});
    if(candidates.length){
      const encoded=escapeHtml(JSON.stringify(candidates));
      return `<span class="formation-player-card__image"><img src="${escapeHtml(candidates[0])}" alt="" loading="lazy" referrerpolicy="no-referrer" data-player-image-candidates='${encoded}' onerror="const list=JSON.parse(this.dataset.playerImageCandidates||'[]');const current=list.indexOf(this.src);const next=list[current+1]||list.find(x=>x!==this.src);if(next){this.src=next}else{this.remove();this.parentElement.classList.add('is-placeholder')}"></span>`;
    }
    return `<span class="formation-player-card__image is-placeholder" aria-hidden="true"><svg><use href="#icon-user"></use></svg></span>`;
  }

  function activeTeamIdForTeamPage() {
    const route=String(currentAppRoute()||'');
    const [base,id]=route.split('/');
    if(base==='teams' && id) return String(teamForPublicRoute(id)?.id||id);
    if(base==='my-team'){
      const account=window.FGC_TRADE?.getCurrentAccount?.();
      return String(liveOwnedTeamId?.()||account?.teamId||'');
    }
    return '';
  }

  function refreshActiveRosterTab() {
    const teamId=activeTeamIdForTeamPage();
    const team=liveTeamDirectory?.teamMap?.get(teamId);
    const players=liveTeamDirectory?.playersByTeam?.get(teamId)||[];
    const target=pageContent?.querySelector?.('[data-team-tab-content]');
    if(!team||!target||state.teamTab!=='roster') return false;
    const rosterModel=liveRosterModel(team,players);
    target.innerHTML=renderRosterExperience(team,rosterModel);
    sizeRosterScrollWindow(target);
    return true;
  }

  function scrollTeamTabsToTop() {
    const tabs = pageContent?.querySelector?.('[data-team-tabs]');
    if (!tabs) return;
    requestAnimationFrame(() => {
      const mainRect = mainContent?.getBoundingClientRect?.();
      const tabsRect = tabs.getBoundingClientRect();
      if (mainContent && mainRect) {
        const nextTop = mainContent.scrollTop + tabsRect.top - mainRect.top - 12;
        mainContent.scrollTo({ top: Math.max(0, nextTop), behavior: 'instant' });
      } else {
        const nextTop = window.scrollY + tabsRect.top - 12;
        window.scrollTo({ top: Math.max(0, nextTop), left: 0, behavior: 'instant' });
      }
    });
  }

  function depthFocusedNameMarkup(name='') {
    const clean=String(name||'').trim().replace(/\s+/g,' ');
    if(!clean) return '<span class="depth-focus-name__line">—</span>';
    const parts=clean.split(' ');
    if(parts.length===1) return `<span class="depth-focus-name__line">${escapeHtml(clean)}</span>`;
    const first=parts.shift();
    const last=parts.join(' ');
    return `<span class="depth-focus-name__line depth-focus-name__first">${escapeHtml(first)}</span><span class="depth-focus-name__line depth-focus-name__last">${escapeHtml(last)}</span>`;
  }

  function renderRosterDepthChart(rosterModel) {
    const devRank = value => ({'X-Factor':4,'Superstar':3,'Star':2,'Normal':1}[normalizeLiveDevelopment(value)] || 0);
    const depthValue = player => {
      const value=Number(player?.depth);
      return Number.isFinite(value) && value >= 0 ? value : 999;
    };
    const sortDepth = (a,b) => depthValue(a)-depthValue(b) || (Number(b.overall)||0)-(Number(a.overall)||0) || devRank(b.dev)-devRank(a.dev) || String(a.name||'').localeCompare(String(b.name||''));
    const players = rosterModel.players.map(rosterPlayerView).filter(player=>player.rosterStatus==='active'||!player.rosterStatus).sort(sortDepth);
    const slotName = player => String(player.depthPosition || player.position || '').toUpperCase().replace(/[^A-Z0-9]/g,'');
    const aliases = {
      QB:['QB'], HB:['HB','RB'], FB:['FB'],
      WR1:['WR1','WRX','XWR'], WR2:['WR2','WRZ','ZWR'], SLWR:['SLWR','SLOTWR','SWR'], WR:['WR'],
      TE:['TE'], LT:['LT'], LG:['LG'], C:['C'], RG:['RG'], RT:['RT'],
      CB1:['CB1','LCB'], CB2:['CB2','RCB'], SCB:['SCB','SLOTCB'], CB:['CB'],
      FS:['FS'], SS:['SS'], S:['S'],
      LEDGE:['LEDGE','LEDG','LE','LEDT'], REDGE:['REDGE','REDG','RE','REDT'], DT:['DT','DT1','DT2'],
      SAM:['SAM','LOLB'], MIKE:['MIKE','MLB'], WILL:['WILL','ROLB'],
      K:['K'], P:['P']
    };
    const explicit = key => players.filter(player => (aliases[key]||[key]).includes(slotName(player))).sort(sortDepth);
    const position = (...names) => players.filter(player => names.includes(String(player.position||'').toUpperCase())).sort(sortDepth);
    const unique = list => { const seen=new Set(); return list.filter(player=>{const id=String(player.id||player.name); if(seen.has(id))return false; seen.add(id); return true;}); };
    const prefer = (key, fallback=[]) => unique([...explicit(key), ...fallback]).sort(sortDepth);
    const distribute = (list,index,total) => list.filter((_,i)=>i%total===index);
    const stackMarkup = (label, list, area) => {
      if (!list.length) return `<div class="formation-position formation-position--empty" data-depth-area="${area}" style="grid-area:${area}"><span>${label}</span></div>`;
      const ordered = [...list].sort(sortDepth);
      const visible = ordered.slice(0,3);
      const front = visible[0];
      const backups = visible.slice(1);
      return `<section class="formation-position" data-depth-area="${area}" style="grid-area:${area}">
        <span class="formation-position__label">${label}</span>
        <div class="formation-depth-card">
          <button type="button" class="formation-depth-card__starter ${depthDevelopmentClass(front.dev)} is-selected" data-depth-player-id="${escapeHtml(front.id||'')}" aria-label="Show ${escapeHtml(front.name)}">
            ${depthPlayerImageMarkup(front)}
            <span class="formation-player-card__ovr">${front.overall ?? '—'}</span>
            <strong class="depth-focus-name">${depthFocusedNameMarkup(front.name)}</strong>
          </button>
          <div class="formation-depth-card__backups">
            ${[0,1].map(index=>{
              const player=backups[index];
              if (!player) return `<span class="formation-depth-card__backup formation-depth-card__backup--empty" aria-hidden="true"></span>`;
              return `<button type="button" class="formation-depth-card__backup ${depthDevelopmentClass(player.dev)} ${state.depthSelectedPlayer===player.id?'is-selected':''}" data-depth-player-id="${escapeHtml(player.id||'')}" aria-label="Show ${escapeHtml(player.name)}"><strong>${escapeHtml(player.name)}</strong><b>${player.overall ?? '—'}</b></button>`;
            }).join('')}
          </div>
        </div>
      </section>`;
    };

    // Prefer explicit Madden depth-chart slot labels. If the export only supplies a base
    // position, fall back to Madden depth order, then OVR, dev trait and player name.
    const wrBase=position('WR');
    const cbBase=position('CB');
    const dtBase=position('DT');
    const wr1=prefer('WR1',distribute(wrBase,0,3));
    const wr2=prefer('WR2',distribute(wrBase,1,3));
    const slotWr=prefer('SLWR',distribute(wrBase,2,3));
    const cb1=prefer('CB1',distribute(cbBase,0,3));
    const cb2=prefer('CB2',distribute(cbBase,1,3));
    const slotCb=prefer('SCB',distribute(cbBase,2,3));
    const dt1=prefer('DT',distribute(dtBase,0,2));
    const dt2=prefer('DT',distribute(dtBase,1,2));

    const offense = [
      stackMarkup('WR1',wr1,'wr1'), stackMarkup('LT',prefer('LT',position('LT')),'lt'), stackMarkup('LG',prefer('LG',position('LG')),'lg'), stackMarkup('C',prefer('C',position('C')),'c'), stackMarkup('RG',prefer('RG',position('RG')),'rg'), stackMarkup('RT',prefer('RT',position('RT')),'rt'), stackMarkup('TE',prefer('TE',position('TE')),'te'), stackMarkup('WR2',wr2,'wr2'), stackMarkup('SLOT',slotWr,'slot'), stackMarkup('QB',prefer('QB',position('QB')),'qb'), stackMarkup('HB',prefer('HB',position('HB','RB')),'rb'), stackMarkup('FB',prefer('FB',position('FB')),'fb')
    ].join('');
    const defense = [
      stackMarkup('FS',prefer('FS',position('FS')),'fs'), stackMarkup('SS',prefer('SS',position('SS')),'ss'), stackMarkup('SAM',prefer('SAM',position('SAM','LOLB')),'lolb'), stackMarkup('MIKE',prefer('MIKE',position('MIKE','MLB')),'mlb'), stackMarkup('WILL',prefer('WILL',position('WILL','ROLB')),'rolb'), stackMarkup('CB1',cb1,'cb1'), stackMarkup('SCB',slotCb,'scb'), stackMarkup('REDGE',prefer('REDGE',position('REDGE','REDG','RE')),'redge'), stackMarkup('DT1',dt1,'dt1'), stackMarkup('DT2',dt2,'dt2'), stackMarkup('LEDGE',prefer('LEDGE',position('LEDGE','LEDG','LE')),'ledge'), stackMarkup('CB2',cb2,'cb2')
    ].join('');
    const special = [stackMarkup('K',prefer('K',position('K')),'k'),stackMarkup('P',prefer('P',position('P')),'p')].join('');
    const explicitCount=players.filter(player=>{const slot=slotName(player); return slot && slot!==String(player.position||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}).length;
    const sourceLabel=explicitCount ? 'Madden depth-chart slots' : 'Madden roster depth order';
    return `<article class="card madden-depth-card"><div class="card-header"><div><span class="eyebrow">Current lineup</span><h3>Depth Chart</h3><p>Built from the current roster using ${sourceLabel}. When an explicit Madden slot is unavailable, Franchise HQ falls back to depth order, OVR, development trait, then player name.</p></div><span class="pill pill--success">Current</span></div><div class="card-body"><div class="formation-section"><h4>Offense</h4><div class="football-formation football-formation--offense">${offense}</div></div><div class="formation-section"><h4>Defense</h4><div class="football-formation football-formation--defense">${defense}</div></div><div class="formation-section"><h4>Special Teams</h4><div class="football-formation football-formation--special">${special}</div></div></div></article>`;
  }

  function playerCardField(raw={},aliases=[],fallback=null) {
    for(const alias of aliases){
      if(raw?.[alias]!==undefined&&raw?.[alias]!==null&&raw?.[alias]!=='') return raw[alias];
      const key=Object.keys(raw||{}).find(k=>k.toLowerCase()===String(alias).toLowerCase());
      if(key&&raw[key]!==null&&raw[key]!=='') return raw[key];
    }
    return fallback;
  }

  function playerCardMoney(value) {
    const amount=Number(value);
    if(!Number.isFinite(amount))return '—';
    return `$${(amount/1000000).toFixed(3)}M`;
  }

  function playerCardRatingEntries(player={}) {
    const raw=player.raw||{};
    const bags=[player.ratings||{},raw.ratings||{},raw];
    const merged={};
    bags.forEach(bag=>{
      Object.entries(bag||{}).forEach(([key,value])=>{
        const number=Number(value);
        if(Number.isFinite(number)&&number>=0&&number<=100) merged[key]=number;
      });
    });
    return merged;
  }

  const PLAYER_CARD_RATING_GROUPS=[
    ['Core Ratings',[
      ['Speed',['spd','speedRating','speed']],
      ['Acceleration',['acc','accelRating','accelerationRating','acceleration']],
      ['Agility',['agi','agilityRating','agility']],
      ['Strength',['str','strengthRating','strength']],
      ['Awareness',['awr','awareRating','awarenessRating','awareness']],
      ['Jump',['jmp','jumpingRating','jumpRating','jump']],
      ['Stamina',['sta','staminaRating','stamina']],
      ['Toughness',['tgh','toughRating','toughnessRating','toughness']],
      ['Injury',['inj','injuryRating','injury']]
    ]],
    ['Passing',[
      ['Throw Power',['throwPowerRating','throwPower','thp']],
      ['General Accuracy',['throwAccRating','throwAccuracyRating','throwAccuracy']],
      ['Short Accuracy',['throwAccShortRating','throwAccuracyShortRating','shortAccuracy','sac']],
      ['Medium Accuracy',['throwAccMidRating','throwAccuracyMidRating','mediumAccuracy','mac']],
      ['Deep Accuracy',['throwAccDeepRating','throwAccuracyDeepRating','deepAccuracy','dac']],
      ['Throw on Run',['throwOnRunRating','throwOnRun','tor']],
      ['Play Action',['playActionRating','playAction','pac']],
      ['Under Pressure',['throwUnderPressureRating','throwUnderPressure','tup']],
      ['Break Sack',['breakSackRating','breakSack','bsk']]
    ]],
    ['Rushing',[
      ['Carrying',['carryRating','carryingRating','carrying','car']],
      ['Ball Carrier Vision',['bCVRating','bcVisionRating','ballCarrierVision','bcv']],
      ['Break Tackle',['breakTackleRating','breakTackle','btk']],
      ['Trucking',['truckRating','truckingRating','trucking','trk']],
      ['Change of Direction',['changeOfDirectionRating','changeOfDirection','cod']],
      ['Juke Move',['jukeMoveRating','jukeMove','jkm']],
      ['Spin Move',['spinMoveRating','spinMove','spm']],
      ['Stiff Arm',['stiffArmRating','stiffArm','sfa']]
    ]],
    ['Receiving',[
      ['Catching',['catchRating','catchingRating','catching','cth']],
      ['Catch in Traffic',['cITRating','catchInTrafficRating','catchInTraffic','cit']],
      ['Spectacular Catch',['specCatchRating','spectacularCatchRating','spectacularCatch','spc']],
      ['Short Route',['routeRunShortRating','shortRouteRunning','srr']],
      ['Medium Route',['routeRunMedRating','mediumRouteRunning','mrr']],
      ['Deep Route',['routeRunDeepRating','deepRouteRunning','drr']],
      ['Release',['releaseRating','release','rls']]
    ]],
    ['Blocking',[
      ['Pass Block',['passBlockRating','passBlock','pbk']],
      ['Pass Block Power',['passBlockPowerRating','passBlockPower','pbp']],
      ['Pass Block Finesse',['passBlockFinesseRating','passBlockFinesse','pbf']],
      ['Run Block',['runBlockRating','runBlock','rbk']],
      ['Run Block Power',['runBlockPowerRating','runBlockPower','rbp']],
      ['Run Block Finesse',['runBlockFinesseRating','runBlockFinesse','rbf']],
      ['Impact Block',['impactBlockRating','impactBlock','ibl']],
      ['Lead Block',['leadBlockRating','leadBlock','lbk']]
    ]],
    ['Defense',[
      ['Tackle',['tackleRating','tackle','tak']],
      ['Hit Power',['hitPowerRating','hitPower','pow']],
      ['Pursuit',['pursuitRating','pursuit','pur']],
      ['Play Recognition',['playRecRating','playRecognitionRating','playRecognition','prc']],
      ['Block Shed',['blockShedRating','blockSheddingRating','blockShedding','bsh']],
      ['Power Moves',['powerMovesRating','powerMoves','pmv']],
      ['Finesse Moves',['finesseMovesRating','finesseMoves','fmv']],
      ['Man Coverage',['manCoverRating','manCoverageRating','manCoverage','mcv']],
      ['Zone Coverage',['zoneCoverRating','zoneCoverageRating','zoneCoverage','zcv']],
      ['Press',['pressRating','press','prs']]
    ]],
    ['Kicking',[
      ['Kick Power',['kickPowerRating','kickPower','kpw']],
      ['Kick Accuracy',['kickAccRating','kickAccuracyRating','kickAccuracy','kac']],
      ['Kick Return',['kickRetRating','kickReturnRating','kickReturn','kr']],
      ['Long Snap',['longSnapRating','longSnap','ls']]
    ]]
  ];

  function canonicalRatingValue(player={},aliases=[]) {
    const merged=playerCardRatingEntries(player);
    for(const alias of aliases){
      if(merged[alias]!==undefined) return merged[alias];
      const key=Object.keys(merged).find(k=>k.toLowerCase()===String(alias).toLowerCase());
      if(key) return merged[key];
    }
    return null;
  }

  function renderCanonicalRatings(player={}) {
    return `<div class="canonical-rating-groups">${PLAYER_CARD_RATING_GROUPS.map(([group,ratings])=>{
      const rows=ratings.map(([label,aliases])=>[label,canonicalRatingValue(player,aliases)]).filter(([,value])=>value!==null);
      return `<section class="canonical-rating-group"><div class="canonical-rating-group__heading"><h4>${escapeHtml(group)}</h4><span>${rows.length} mapped</span></div>${rows.length?`<div class="canonical-rating-list">${rows.map(([label,value])=>`<div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join('')}</div>`:`<div class="canonical-player-empty">No mapped ${escapeHtml(group.toLowerCase())} ratings in the current player source.</div>`}</section>`;
    }).join('')}</div>`;
  }

  function renderCanonicalAbilities(player={}) {
    const abilities=Array.isArray(player.abilities)?player.abilities:[];
    if(!abilities.length) return '<div class="canonical-player-empty"><strong>No abilities supplied</strong><span>The active Madden player source does not include a public signature ability for this player.</span></div>';
    return `<div class="canonical-ability-list">${abilities.map(ability=>`<article><div><strong>${escapeHtml(ability.title||'Ability')}</strong><span>${escapeHtml(ability.description||'No description supplied by Madden.')}</span></div><small>${ability.rank?`Rank ${escapeHtml(ability.rank)}`:'Source ability'}${ability.threshold!=null?` · ${escapeHtml(ability.threshold)} OVR`:''}${ability.unlocked?' · Unlocked':' · Locked'}</small></article>`).join('')}</div>`;
  }

  function canonicalCurrentSeasonYear() {
    const context=window.FranchiseHQ?.currentSeasonContext||liveTeamDirectory?.currentContext||{};
    const candidates=[
      context.season,
      context.calendarYear,
      context.seasonYear,
      context.year,
      liveTeamDirectory?.snapshot?.seasonYear,
      liveTeamDirectory?.snapshot?.calendarYear,
      window.FGC_APP?.league?.currentSeasonYear,
      window.FGC_APP?.league?.seasonYear
    ];

    for(const value of candidates){
      const year=Number(value);
      if(Number.isFinite(year)&&year>=2000&&year<=2100)return year;
    }

    const years=[];
    (playerStatisticsState?.rows||[]).forEach(row=>{
      const source=row.source||{};
      const year=Number(row.seasonYear??source.seasonYear??source.calendarYear);
      if(Number.isFinite(year)&&year>=2000&&year<=2100)years.push(year);
    });

    (liveTeamDirectory?.games||[]).forEach(game=>{
      const source=game.source||{};
      const year=Number(game.seasonYear??game.calendarYear??source.seasonYear??source.calendarYear);
      if(Number.isFinite(year)&&year>=2000&&year<=2100)years.push(year);
    });

    return years.length?Math.max(...years):null;
  }

  function canonicalScheduleUniverse() {
    const rows=[];
    const add=list=>{if(Array.isArray(list))rows.push(...list);};

    add(liveTeamDirectory?.games);
    add(window.FranchiseHQ?.liveScheduleGames);
    add(window.FranchiseHQ?.schedule);
    add(window.FGC_APP?.schedule);
    add(window.FranchiseHQ?.liveReadModelCache?.games);

    const seen=new Set();
    return rows.filter(game=>{
      const source=game.source||{};
      const id=String(game.id||game.gameId||game.scheduleId||source.scheduleId||'');
      const key=id||[
        game.seasonYear??source.seasonYear??'',
        game.stage??game.phase??source.stage??'',
        game.week??game.weekIndex??source.weekIndex??'',
        game.homeTeamId??game.homeId??source.homeTeamId??'',
        game.awayTeamId??game.awayId??source.awayTeamId??''
      ].join(':');
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    });
  }

  function canonicalGameResultFor(playerId='',week='—',stage='regular-season',seasonYear=null) {
    const player=liveRosterPlayers.get(String(playerId))
      ||rosterService()?.findPlayer?.(playerId);
    const view=player?rosterPlayerView(player):null;
    const teamId=String(view?.teamId||player?.teamId||'');
    if(!teamId)return null;

    const wantedStage=canonicalEffectiveStage(stage,week);

    const match=canonicalScheduleUniverse().find(game=>{
      const source=game.source||{};
      const gw=Number(game.week??game.weekIndex??source.weekIndex??source.week);
      const gs=canonicalEffectiveStage(game.stage??game.stageLabel??game.phase??source.stage??source.seasonStage,gw);
      const home=String(game.homeTeamId??game.homeId??game.home?.id??source.homeTeamId??'');
      const away=String(game.awayTeamId??game.awayId??game.away?.id??source.awayTeamId??'');

      const gy=Number(
        game.seasonYear??
        game.calendarYear??
        source.seasonYear??
        source.calendarYear??
        liveTeamDirectory?.snapshot?.seasonYear
      );

      const yearMatch=
        !Number.isFinite(Number(seasonYear))
        ||!Number.isFinite(gy)
        ||gy===Number(seasonYear);

      return canonicalComparableWeek(gw,gs)===canonicalComparableWeek(week,wantedStage)
        &&gs===wantedStage
        &&yearMatch
        &&(home===teamId||away===teamId);
    });

    if(!match)return null;

    const source=match.source||{};
    const home=String(match.homeTeamId??match.homeId??match.home?.id??source.homeTeamId??'');
    const away=String(match.awayTeamId??match.awayId??match.away?.id??source.awayTeamId??'');
    const isHome=home===teamId;
    const opponentId=isHome?away:home;
    const opponent=matchupTeam(opponentId)||{};

    const homeScore=Number(match.homeScore??match.home?.score??source.homeScore??source.homeScoreTotal??source.homePoints);
    const awayScore=Number(match.awayScore??match.away?.score??source.awayScore??source.awayScoreTotal??source.awayPoints);
    const played=Number.isFinite(homeScore)&&Number.isFinite(awayScore);
    const teamScore=isHome?homeScore:awayScore;
    const oppScore=isHome?awayScore:homeScore;
    const result=played?(teamScore>oppScore?'W':teamScore<oppScore?'L':'T'):'';

    return {
      opponent:`${isHome?'vs.':'@'} ${opponent.abbr||opponent.abbreviation||opponent.nickname||opponent.fullName||'OPP'}`,
      score:played?`${teamScore}-${oppScore}`:'',
      result,
      className:result==='W'?'is-win':result==='L'?'is-loss':'is-neutral'
    };
  }

  function canonicalCompactStatSummary(metricsByCategory=[]) {
    const merged={};
    metricsByCategory.forEach(item=>Object.assign(merged,item.metrics||{}));
    const val=aliases=>{
      for(const alias of aliases){
        const key=Object.keys(merged).find(k=>k.toLowerCase()===alias.toLowerCase());
        if(key&&merged[key]!==null&&merged[key]!==undefined&&merged[key]!=='')return merged[key];
      }
      return null;
    };
    const pieces=[];
    const push=(label,aliases)=>{
      const value=val(aliases);
      if(value!==null)pieces.push(`${value} ${label}`);
    };

    push('Cmp',['passCompletions','completions','passComp','cmp']);
    push('Att',['passAttempts','attempts','passAtt','att']);
    push('Pass Yds',['passYds','passingYards','passYards']);
    push('Pass TD',['passTDs','passingTDs','passTouchdowns']);
    push('INT',['passInts','interceptionsThrown']);
    push('Rush',['rushAtt','rushingAttempts','carries']);
    push('Rush Yds',['rushYds','rushingYards']);
    push('Rush TD',['rushTDs','rushingTDs']);
    push('Rec',['recCatches','receptions','catches','rec']);
    push('Rec Yds',['recYds','receivingYards']);
    push('Rec TD',['recTDs','receivingTDs']);
    push('Tkls',['defTotalTackles','totalTackles','tackles','tacklesTotal']);
    push('Sack',['defSacks','sacks']);
    push('INT',['defInts','defInterceptions']);
    push('FF',['defForcedFum','forcedFumbles','ff']);
    push('FGM',['kickFGMade','fieldGoalsMade','fgMade']);
    push('Punts',['puntAttempts','punts','puntAtt']);

    return pieces.length?pieces.join(' · '):'Stat record available';
  }

  const CANONICAL_STAT_COLUMNS={
    passing:[['CMP',['passComp']],['ATT',['passAtt']],['CMP%',['passCompPct']],['YDS',['passYds','passYards']],['TD',['passTDs']],['INT',['passInts']],['Y/A',['passYdsPerAtt']],['RTG',['passRating']],['LONG',['passLongest']],['SACK',['passSacks']]],
    rushing:[['ATT',['rushAtt']],['YDS',['rushYds','rushYards']],['TD',['rushTDs']],['Y/A',['rushYdsPerAtt']],['FUM',['rushFum']],['YACON',['rushYdsAfterContact']],['20+',['rush20PlusYds']],['LONG',['rushLongest']],['BTK',['rushBrokenTackles']]],
    receiving:[['REC',['recCatches']],['YDS',['recYards','recYds']],['TD',['recTDs']],['DROP',['recDrops']],['YAC',['recYdsAfterCatch','recYdsAfterCatc']],['Y/R',['recYdsPerCatch']],['LONG',['recLongest']]],
    defense:[['TKL',['defTotalTackles','totalTackles','tackles']],['TFL',['defTacklesForLoss','tacklesForLoss','tackleForLoss','tfl']],['SACK',['defSacks','sacks']],['INT',['defInts','defInterceptions']],['FF',['defForcedFum','forcedFumbles']],['FR',['defFumRec','fumbleRecoveries']],['TD',['defTDs','defensiveTDs']]],
    kicking:[['FGA',['fGAtt']],['FGM',['fGMade']],['FG%',['fGCompPct']],['50+ ATT',['fG50PlusAtt']],['50+ MADE',['fG50PlusMade']],['XPA',['xPAtt']],['XPM',['xPMade']],['LONG',['fGLongest']],['PTS',['kickPts']]],
    punting:[['PUNTS',['puntAtt']],['NET Y/P',['puntNetYdsPerAtt']],['IN20',['puntsIn20']],['TB',['puntTBs']],['LONG',['puntLongest']]]
  };

  function canonicalMetricValue(metricsByCategory=[],aliases=[]){
    for(const item of metricsByCategory){
      const bag=item.metrics||{};
      for(const alias of aliases){
        const key=Object.keys(bag).find(k=>k.toLowerCase()===alias.toLowerCase());
        if(key&&bag[key]!==null&&bag[key]!==undefined&&bag[key]!=='')return bag[key];
      }
    }
    return '—';
  }

  function canonicalColumnsForCategories(categories=[]){
    const out=[],seen=new Set();
    categories.forEach(category=>(CANONICAL_STAT_COLUMNS[category]||[]).forEach(col=>{
      const key=col[0];
      if(!seen.has(key)){seen.add(key);out.push(col);}
    }));
    return out;
  }

  function canonicalSortableTable(tableId,headers,rows){
    return `<div class="canonical-flat-table-wrap"><table id="${tableId}" class="canonical-flat-table">
      <thead><tr>${headers.map((h,i)=>`<th><button type="button" data-sort-table="${tableId}" data-sort-col="${i}">${escapeHtml(h)} <span>↕</span></button></th>`).join('')}</tr></thead>
      <tbody>${rows.map(row=>`<tr>${row.map((cell,i)=>`<td${i===1&&cell?.className?` class="${escapeHtml(cell.className)}"`:''}>${escapeHtml(cell?.value??cell)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }

  function canonicalAvailableGameLogSeasons(playerId='') {
    const model=window.FranchiseHQ?.playerStatistics?.get?.(playerId);
    const years=new Set();

    Object.values(model?.categories||{}).forEach(data=>{
      (data?.rows||[]).forEach(row=>{
        const source=row.source||{};
        const year=Number(row.seasonYear??source.seasonYear??source.calendarYear);
        if(Number.isFinite(year)&&year>=2000&&year<=2100)years.add(year);
      });
    });

    canonicalScheduleUniverse().forEach(game=>{
      const source=game.source||{};
      const year=Number(game.seasonYear??game.calendarYear??source.seasonYear??source.calendarYear);
      if(Number.isFinite(year)&&year>=2000&&year<=2100)years.add(year);
    });

    const current=canonicalCurrentSeasonYear();
    if(Number.isFinite(Number(current)))years.add(Number(current));
    return [...years].sort((a,b)=>b-a);
  }

  const CANONICAL_POSTSEASON_WEEKS=Object.freeze({
    19:{full:'Wild Card Round',short:'WC',ordinal:1},
    20:{full:'Divisional Round',short:'DV',ordinal:2},
    21:{full:'Conference Championship Round',short:'CON',ordinal:3},
    22:{full:'Pro Bowl',short:'PB',ordinal:null},
    23:{full:'Super Bowl',short:'SB',ordinal:4}
  });
  const CANONICAL_PLAYOFF_ORDINALS=Object.freeze({
    1:{full:'Wild Card Round',short:'WC'},
    2:{full:'Divisional Round',short:'DV'},
    3:{full:'Conference Championship Round',short:'CON'},
    4:{full:'Super Bowl',short:'SB'}
  });

  function canonicalPostseasonMeta(week,stage=''){
    const n=Number(week);
    if(CANONICAL_POSTSEASON_WEEKS[n])return CANONICAL_POSTSEASON_WEEKS[n];
    const phase=canonicalNormalizeStage(stage);
    if(phase==='playoffs'&&CANONICAL_PLAYOFF_ORDINALS[n]){
      return {...CANONICAL_PLAYOFF_ORDINALS[n],ordinal:n};
    }
    return null;
  }

  function canonicalComparableWeek(week,stage=''){
    const meta=canonicalPostseasonMeta(week,stage);
    if(meta&&meta.ordinal!=null)return Number(meta.ordinal);
    return Number(week);
  }

  function canonicalEffectiveStage(stage='',week=null){
    const normalized=canonicalNormalizeStage(stage);
    const n=Number(week);
    if(CANONICAL_POSTSEASON_WEEKS[n]){
      return n===22?'pro-bowl':'playoffs';
    }
    return normalized;
  }

  function canonicalGameLogWeekLabel(week,stage=''){
    const meta=canonicalPostseasonMeta(week,stage);
    return meta?.short||String(week);
  }

  function canonicalStatStage(row={}){
    const raw=row.source||{};
    const week=Number(row.week??row.weekIndex??raw.week??raw.weekIndex);
    return canonicalEffectiveStage(row.stage||raw.stage||raw.seasonStage,week);
  }

  function canonicalNormalizeStage(value='') {
    const text=String(value||'').toLowerCase();
    if(text.includes('pre'))return 'preseason';
    if(text.includes('post')||text.includes('playoff'))return 'playoffs';
    return 'regular-season';
  }

  function canonicalTeamIdAliases(teamId='') {
    const wanted=String(teamId??'').toLowerCase();
    const team=(liveTeamDirectory?.teams||[]).find(candidate=>{
      const aliases=[
        candidate?.id,candidate?.liveTeamId,candidate?.abbr,candidate?.abbreviation,
        candidate?.source?.teamId,candidate?.source?.team_id,candidate?.source?.external_id
      ].filter(value=>value!==undefined&&value!==null&&String(value)!=='')
       .map(value=>String(value).toLowerCase());
      return aliases.includes(wanted);
    });
    const aliases=new Set([
      teamId,
      team?.id,team?.liveTeamId,team?.abbr,team?.abbreviation,
      team?.source?.teamId,team?.source?.team_id,team?.source?.external_id
    ].filter(value=>value!==undefined&&value!==null&&String(value)!=='')
     .map(value=>String(value).toLowerCase()));
    return aliases;
  }

  function canonicalTeamIdentityMatches(value='',aliases=new Set()) {
    return aliases.has(String(value??'').toLowerCase());
  }

  function canonicalGameLog(playerId='',seasonOverride=null) {
    const model=window.FranchiseHQ?.playerStatistics?.get?.(playerId);
    const categories=model?.categories||{};
    const normalized=liveRosterPlayers.get(String(playerId))||rosterService()?.findPlayer?.(playerId);
    const view=normalized?rosterPlayerView(normalized):{};
    const teamId=String(view.teamId||normalized?.teamId||'');
    const teamAliases=canonicalTeamIdAliases(teamId);

    const currentYear=canonicalCurrentSeasonYear();
    const selectedYear=Number.isFinite(Number(seasonOverride))
      ? Number(seasonOverride)
      : Number(currentYear);

    const rawAvailable=PLAYER_STAT_CATEGORIES.filter(category=>(categories[category]?.rows||[]).some(row=>{
      const raw=row.source||{};
      const stage=canonicalNormalizeStage(row.stage||raw.stage||raw.seasonStage);
      const year=Number(row.seasonYear??raw.seasonYear??raw.calendarYear??selectedYear);
      return stage!=='preseason'
        &&(!Number.isFinite(selectedYear)||!Number.isFinite(year)||year===selectedYear);
    }));

    const available=playerStatCategoryOrderForPosition(view.position,rawAvailable);

    if(!available.length){
      return `<div class="canonical-player-empty">No regular-season or playoff game-log records are available${selectedYear?` for ${selectedYear}`:''}.</div>`;
    }

    const groups=available.map(category=>({
      category,
      label:playerStatLabel(category),
      columns:CANONICAL_STAT_COLUMNS[category]||[]
    }));

    const scheduleRows=canonicalScheduleUniverse().filter(game=>{
      const source=game.source||{};
      const home=String(game.homeTeamId??game.homeId??game.home?.id??source.homeTeamId??'');
      const away=String(game.awayTeamId??game.awayId??game.away?.id??source.awayTeamId??'');
      const year=Number(game.seasonYear??game.calendarYear??source.seasonYear??source.calendarYear??selectedYear);
      const week=game.week??game.weekIndex??source.weekIndex??source.week;
      const stage=canonicalEffectiveStage(game.stage??game.stageLabel??source.stage??source.seasonStage,week);

      return (canonicalTeamIdentityMatches(home,teamAliases)||canonicalTeamIdentityMatches(away,teamAliases))
        &&stage!=='preseason'
        &&(!Number.isFinite(selectedYear)||!Number.isFinite(year)||year===selectedYear);
    }).sort((a,b)=>{
      const sourceA=a.source||{},sourceB=b.source||{};
      const wa=Number(a.week??a.weekIndex??sourceA.weekIndex??0);
      const wb=Number(b.week??b.weekIndex??sourceB.weekIndex??0);
      const stageA=canonicalEffectiveStage(a.stage??a.stageLabel??sourceA.stage??sourceA.seasonStage,wa);
      const stageB=canonicalEffectiveStage(b.stage??b.stageLabel??sourceB.stage??sourceB.seasonStage,wb);
      const order={'regular-season':0,'playoffs':1,'pro-bowl':2};
      return (order[stageA]-order[stageB])||wa-wb;
    });

    const rowFor=(category,week,stage)=>{
      return (categories[category]?.rows||[]).find(row=>{
        const raw=row.source||{};
        const rowWeek=Number(row.week??row.weekIndex??raw.weekIndex??raw.week);
        const rowStage=canonicalEffectiveStage(row.stage||raw.stage||raw.seasonStage,rowWeek);
        const rowYear=Number(row.seasonYear??raw.seasonYear??raw.calendarYear??selectedYear);

        return rowStage===stage
          &&canonicalComparableWeek(rowWeek,rowStage)===canonicalComparableWeek(week,stage)
          &&(!Number.isFinite(selectedYear)||!Number.isFinite(rowYear)||rowYear===selectedYear);
      });
    };

    const playerAppearedInGame=(week,stage)=>{
      const meta=canonicalPostseasonMeta(week,stage);
      if(meta?.full==='Pro Bowl'||stage==='pro-bowl')return false;
      if(stage!=='playoffs')return true;
      return available.some(category=>Boolean(rowFor(category,week,stage)));
    };

    const visibleScheduleRows=scheduleRows.filter(game=>{
      const source=game.source||{};
      const week=game.week??game.weekIndex??source.weekIndex??source.week;
      const stage=canonicalEffectiveStage(game.stage??game.stageLabel??source.stage??source.seasonStage,week);
      return playerAppearedInGame(week,stage);
    });

    const formatMetric=(label,value)=>{
      const n=Number(value);
      if(!Number.isFinite(n))return '0';
      if(label.includes('%'))return `${n.toFixed(1)}%`;
      if(['Y/A','Y/R','RTG','NET Y/P'].includes(label))return n.toFixed(1);
      return n.toLocaleString();
    };

    const groupHeaders=groups.map(group=>
      `<th class="canonical-history-group" colspan="${group.columns.length}">${escapeHtml(group.label)}</th>`
    ).join('');

    const metricHeaders=groups.flatMap(group=>
      group.columns.map(([label])=>{
        let display=label;
        if(group.category==='passing'){
          if(label==='YDS')display='P YDS';
          if(label==='TD')display='P TD';
          if(label==='INT')display='P INT';
          if(label==='ATT')display='P ATT';
        }else if(group.category==='rushing'){
          if(label==='ATT')display='R ATT';
          if(label==='YDS')display='R YDS';
          if(label==='TD')display='R TD';
          if(label==='FUM')display='R FUM';
        }else if(group.category==='receiving'){
          if(label==='REC')display='REC';
          if(label==='YDS')display='REC YDS';
          if(label==='TD')display='REC TD';
        }
        return `<th>${escapeHtml(display)}</th>`;
      })
    ).join('');

    const body=visibleScheduleRows.map(game=>{
      const source=game.source||{};
      const week=game.week??game.weekIndex??source.weekIndex??source.week??'—';
      const stage=canonicalEffectiveStage(game.stage??game.stageLabel??source.stage??source.seasonStage,week);
      const year=Number(game.seasonYear??game.calendarYear??source.seasonYear??source.calendarYear??selectedYear);

      const result=canonicalGameResultFor(playerId,week,stage,year);
      const postseason=canonicalPostseasonMeta(week,stage);
      const opponent=result
        ? `${result.opponent}${result.score?` - ${result.score}`:''}`
        : (postseason?.short||`${stage==='playoffs'?'Playoffs':'Week'} ${week}`);
      const gameLogWeekLabel=canonicalGameLogWeekLabel(week,stage);

      const cells=groups.flatMap(group=>{
        const row=rowFor(group.category,week,stage);
        const metrics=[{category:group.category,metrics:row?.metrics||{}}];

        return group.columns.map(([label,aliases])=>{
          const value=canonicalMetricValue(metrics,aliases);
          return `<td>${escapeHtml(formatMetric(label,value==='—'?0:value))}</td>`;
        });
      }).join('');

      return `<tr>
        <td>${escapeHtml(gameLogWeekLabel)}</td>
        <td class="${escapeHtml(result?.className||'is-neutral')}">${escapeHtml(opponent)}</td>
        ${cells}
      </tr>`;
    }).join('');

    const totalColumns=2+groups.reduce((sum,group)=>sum+group.columns.length,0);

    return `<div class="canonical-history-game-log-wrap">
      <table class="canonical-history-game-log">
        <thead>
          <tr>
            <th rowspan="2">Week</th>
            <th rowspan="2">Opponent / Result</th>
            ${groupHeaders}
          </tr>
          <tr>${metricHeaders}</tr>
        </thead>
        <tbody>
          ${body||`<tr><td colspan="${totalColumns}">No games are available for ${escapeHtml(selectedYear)}.</td></tr>`}
        </tbody>
      </table>
    </div>`;
  }

  function renderCanonicalGameLogTab(playerId='') {
    const seasons=canonicalAvailableGameLogSeasons(playerId);
    const current=canonicalCurrentSeasonYear();
    const selected=seasons.includes(Number(current))?Number(current):(seasons[0]||Number(current));

    return `<div class="canonical-game-log-tab" data-player-game-log-root="${escapeHtml(playerId)}">
      <div class="canonical-game-log-controls">
        <label>
          <span>Season</span>
          <select data-player-game-log-season="${escapeHtml(playerId)}">
            ${seasons.map(year=>`<option value="${year}" ${year===selected?'selected':''}>${year}</option>`).join('')}
          </select>
        </label>
        <small>Historical game logs by season. Regular season and playoffs only; preseason is excluded.</small>
      </div>
      <div data-player-game-log-content="${escapeHtml(playerId)}">
        ${canonicalGameLog(playerId,selected)}
      </div>
    </div>`;
  }

  function refreshOpenPlayerGameLogs(){
    const modal=document.querySelector('[data-value-card-modal].is-open');
    const playerId=String(modal?.dataset?.canonicalPlayerId||'');
    if(!playerId)return false;
    const details=modal.querySelector('.canonical-current-game-log-body');
    if(details)details.innerHTML=canonicalDetailsGameLog(playerId);
    const historical=modal.querySelector(`[data-player-game-log-content="${CSS.escape(playerId)}"]`);
    const season=Number(modal.querySelector(`[data-player-game-log-season="${CSS.escape(playerId)}"]`)?.value);
    if(historical)historical.innerHTML=canonicalGameLog(playerId,Number.isFinite(season)?season:null);
    return true;
  }

  function canonicalContractPanel(player={}) {
    const contract=canonicalContract(player);
    const text=value=>value===null||value===undefined?'—':value;
    return `<div class="canonical-contract-grid canonical-contract-grid--compact">
      ${[
        ['Cap Hit',playerCardMoney(contract.capHit)],
        ['Current Salary','Unavailable'],
        ['Total Contract',playerCardMoney(contract.totalSalary)],
        ['Total Bonus',playerCardMoney(contract.totalBonus)],
        ['Years Left / Length',`${text(contract.yearsRemaining)} / ${text(contract.length)}`],
        ['Net Release Savings',playerCardMoney(contract.releaseNetSavings)],
        ['Total Release Penalty',playerCardMoney(contract.releasePenalty)]
      ].map(([label,value])=>`<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}
    </div>`;
  }

  function canonicalTransactionHistory(playerId='') {
    return `<div class="canonical-player-transaction-history" data-canonical-player-transaction-history="${escapeHtml(String(playerId))}">
      <div class="canonical-player-empty"><strong>Loading transaction history…</strong></div>
    </div>`;
  }

  async function refreshCanonicalPlayerTransactionHistory(playerId='',root=null) {
    const selector=`[data-canonical-player-transaction-history="${CSS.escape(String(playerId))}"]`;
    const hosts=root?[...root.querySelectorAll(selector)]:[...document.querySelectorAll(selector)];
    if(!hosts.length)return;

    try{
      const payload=await loadCanonicalTransactionsForUi(false);
      const rows=(payload?.transactions||[])
        .filter(transaction=>transactionIsPubliclyVisible(transaction))
        .filter(transaction=>(transaction.playerIds||[]).map(String).includes(String(playerId)))
        .sort((a,b)=>(Number(b.season||0)-Number(a.season||0))||(Number(b.week||0)-Number(a.week||0))||((new Date(b.occurredAt||b.createdAt||0).getTime()||0)-(new Date(a.occurredAt||a.createdAt||0).getTime()||0)));

      const markup=rows.length
        ? `<div class="canonical-transaction-list">${rows.map(row=>{
            const direction=transactionDirectionLabel(row);
            const workflowId=row.workflowTradeId;
            return `<button type="button" class="canonical-transaction-row" ${workflowId?`data-route="trade-center/${escapeHtml(String(workflowId))}"`:''}>
              <span>
                <strong>${escapeHtml(transactionEventLabel(transactionDisplayType(row)))}${direction?` · ${escapeHtml(direction)}`:''}</strong>
                <small>${escapeHtml(transactionTimeLabel(row))}</small>
              </span>
              ${transactionAuthorityMarkup(row)}
            </button>`;
          }).join('')}</div>`
        : `<div class="canonical-player-empty"><strong>No transaction history</strong><span>No completed or Madden-recorded transaction is available for this player.</span></div>`;

      hosts.forEach(host=>host.innerHTML=markup);
    }catch(error){
      console.error('[Canonical Player Transaction History]',error);
      hosts.forEach(host=>{
        host.innerHTML=`<div class="canonical-player-empty"><strong>Transaction history unavailable</strong><span>${escapeHtml(error?.message||'The transaction ledger could not be loaded.')}</span></div>`;
      });
    }
  }

  function canonicalTradePlayer(player={}) {
    return {
      id:String(player.id||''),
      name:player.name||player.displayName||'Player',
      teamId:String(player.teamId||''),
      position:String(player.position||''),
      overall:Number(player.overall)||0,
      age:Number(player.age)||21,
      dev:player.dev||normalizeLiveDevelopment(player.developmentTrait||player.raw?.developmentTrait),
      years:Number(player.years)||Number(player.contract?.yearsRemaining)||0,
      salary:tradeCalculatorMillions(player.salary),
      capHit:tradeCalculatorMillions(player.capHit),
      injury:player.injury||'Healthy',
      passingYards:Number(player.stats?.passingYards||0),
      rushingYards:Number(player.stats?.rushingYards||0),
      receivingYards:Number(player.stats?.receivingYards||0),
      touchdowns:Number(player.stats?.touchdowns||0)
    };
  }

  function canonicalTradeBreakdown(player={}) {
    const valuation=window.FGC_TRADE?.playerValuation?.(canonicalTradePlayer(player));
    if(!valuation||!window.FGC_TRADE?.tradeCalculatorEnabled?.())return '';
    return `<section class="canonical-player-trade-breakdown value-card-box value-card-breakdown">
      <div class="box-heading box-heading--inline"><div><h3>Trade Calculator Breakdown</h3></div><div class="value-total"><span>Total Trade Value</span><strong>${Number(valuation.total||0).toLocaleString()}</strong></div></div>
      <div class="breakdown-grid">${(valuation.breakdown||[]).map(([label,val,note])=>`<div class="breakdown-tile"><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(note)}</small></span><b class="${Number(val)<0?'is-negative':''}">${Number(val)>=0?'+':''}${Number(val||0).toLocaleString()}</b></div>`).join('')}</div>
    </section>`;
  }

  function canonicalPlayerImageCandidates(player={}) {
    const raw=player.raw||player.source||{};
    const direct=[
      player.imageUrl,raw.imageUrl,raw.image_url,raw.headshot,raw.headshotUrl,raw.portraitUrl
    ].filter(v=>v!==null&&v!==undefined&&String(v).trim()!=='').map(v=>String(v).trim());

    const portraitIds=[
      raw.portrait_id,raw.portraitid,raw.portraitId,
      player.portrait_id,player.portraitid,player.portraitId
    ].filter(v=>v!==null&&v!==undefined&&String(v).trim()!=='').map(v=>String(v).trim());

    const presentationIds=[
      raw.presentationid,raw.presentationId,
      player.presentationid,player.presentationId
    ].filter(v=>v!==null&&v!==undefined&&String(v).trim()!=='').map(v=>String(v).trim());

    const urls=[...direct];

    portraitIds.forEach(id=>{
      if(/^https?:\/\//i.test(id)) urls.push(id);
      else if(/^\d+$/.test(id)) urls.push(`https://ratings-images-prod.pulse.ea.com/madden-nfl-26/portraits/${id}.png`);
    });

    presentationIds.forEach(id=>{
      if(/^https?:\/\//i.test(id)) urls.push(id);
      else if(/^\d+$/.test(id)) urls.push(`https://ratings-images-prod.pulse.ea.com/madden-nfl-26/portraits/${id}.png`);
    });

    return [...new Set(urls)];
  }

  function renderCanonicalPlayerImage(player={}) {
    const candidates=canonicalPlayerImageCandidates(player);
    if(candidates.length){
      const encoded=escapeHtml(JSON.stringify(candidates));
      return `<img src="${escapeHtml(candidates[0])}" alt="${escapeHtml(player.name||'Player')}" loading="lazy" referrerpolicy="no-referrer"
        data-player-image-candidates='${encoded}'
        onerror="const list=JSON.parse(this.dataset.playerImageCandidates||'[]');const current=list.indexOf(this.src);const next=list[current+1]||list.find(x=>x!==this.src);if(next){this.src=next}else{this.remove();this.parentElement.classList.add('is-placeholder')}">`;
    }
    return `<span class="canonical-player-image-placeholder">${escapeHtml(player.initials||'?')}</span>`;
  }

  function canonicalPlayerBio(player={}) {
    const raw=player.raw||{};
    const age=player.age??raw.age??'—';
    const exp=raw.yearsPro??raw.experience??raw.yearsExperience??(Number(age)?Math.max(0,Number(age)-21):'—');
    return {age,exp};
  }

    function canonicalPlayerSeasonHistory(playerId='') {
    const model=window.FranchiseHQ?.playerStatistics?.get?.(playerId);
    const rows=model?.rows||[];
    const seasons=new Map();

    rows.forEach(row=>{
      const source=row.source||{};
      const year=Number(row.seasonYear??source.seasonYear??source.calendarYear??canonicalCurrentSeasonYear());
      const category=String(row.category||'').toLowerCase();
      if(!seasons.has(year))seasons.set(year,{year,categories:{}});
      const season=seasons.get(year);
      if(!season.categories[category])season.categories[category]=[];
      season.categories[category].push(row);
    });

    return [...seasons.values()].sort((a,b)=>b.year-a.year);
  }

  function canonicalSeasonSummary(season={}) {
    const fragments=[];
    const c=season.categories||{};
    const add=(category,labels)=>{
      const rows=c[category]||[];
      if(!rows.length)return;
      const totals=playerStatCategoryTotals(rows,category);
      labels.forEach(label=>{
        const value=totals[label];
        if(value!==null&&value!==undefined)fragments.push(`${label} ${playerStatFormat(label,value)}`);
      });
    };
    add('passing',['YDS','TD','INT']);
    add('rushing',['YDS','TD']);
    add('receiving',['REC','YDS','TD']);
    add('defense',['TKL','SACK','INT','FF']);
    add('kicking',['FGM','FGA']);
    add('punting',['PUNTS','YDS']);
    return fragments.join(' · ')||'—';
  }

  function canonicalCareerTotals(playerId='') {
    const model=window.FranchiseHQ?.playerStatistics?.get?.(playerId);
    const totals={};
    PLAYER_STAT_CATEGORIES.forEach(category=>{
      const rows=model?.categories?.[category]?.rows||[];
      totals[category]=playerStatCategoryTotals(rows,category);
    });
    const cards=[];
    const add=(label,value)=>{if(value!==null&&value!==undefined)cards.push([label,value]);};
    add('Pass Yards',totals.passing?.YDS);
    add('Pass TD',totals.passing?.TD);
    add('Rush Yards',totals.rushing?.YDS);
    add('Rush TD',totals.rushing?.TD);
    add('Receptions',totals.receiving?.REC);
    add('Rec Yards',totals.receiving?.YDS);
    add('Tackles',totals.defense?.TKL);
    add('Sacks',totals.defense?.SACK);
    add('Interceptions',totals.defense?.INT);
    add('Field Goals',totals.kicking?.FGM);
    return cards;
  }

  function renderCanonicalHistoricalStatistics(playerId='') {
    const seasons=canonicalPlayerSeasonHistory(playerId),player=liveRosterPlayers.get(String(playerId))||rosterService()?.findPlayer?.(playerId),view=player?rosterPlayerView(player):{},rawAvailable=[...new Set(seasons.flatMap(s=>Object.keys(s.categories||{})))].filter(c=>PLAYER_STAT_CATEGORIES.includes(c)),available=playerStatCategoryOrderForPosition(view.position,rawAvailable);
    if(!available.length)return `<div class="canonical-player-empty">No franchise career statistics are available.</div>`;
    return `<div class="canonical-career-stats"><div class="player-live-stat-nav canonical-career-stat-nav">${available.map((category,index)=>`<button type="button" class="player-live-stat-tab ${index===0?'is-active':''}" data-player-career-stat-tab="${category}">${playerStatLabel(category)}</button>`).join('')}</div>${available.map((category,index)=>{const cols=CANONICAL_STAT_COLUMNS[category]||[],allRows=seasons.flatMap(season=>season.categories?.[category]||[]),career=playerStatCategoryTotals(allRows,category),careerTiles=cols.map(([label])=>`<div><span>${label}</span><strong>${playerStatFormat(label,career[label])}</strong></div>`).join(''),seasonRows=seasons.filter(s=>(s.categories?.[category]||[]).length).map(season=>{const totals=playerStatCategoryTotals(season.categories[category],category);return [season.year,...cols.map(([label])=>playerStatFormat(label,totals[label]))];});return `<section class="canonical-career-stat-panel ${index===0?'is-active':''}" data-player-career-stat-panel="${category}"><div class="canonical-career-stat-tiles">${careerTiles}</div>${canonicalSortableTable(`season-stats-${String(playerId).replace(/\W/g,'')}-${category}`,['Year',...cols.map(c=>c[0])],seasonRows)}</section>`;}).join('')}</div>`;
  }

  const PLAYER_DETAILS_GAMELOG_COLUMNS={
    QB:[
      ['P Yds',['passYds','passYards']],
      ['P TDs',['passTDs']],
      ['P INTs',['passInts']],
      ['P CMP %',['passCompPct']],
      ['R ATT',['rushAtt']],
      ['R Yds',['rushYds','rushYards']],
      ['R TDs',['rushTDs']]
    ],
    HB:[
      ['R ATT',['rushAtt']],
      ['R Yds',['rushYds','rushYards']],
      ['R TDs',['rushTDs']],
      ['R Fum',['rushFum']],
      ['Rec',['recCatches']],
      ['Rec Yds',['recYards','recYds']],
      ['Rec TDs',['recTDs']]
    ],
    FB:[
      ['R ATT',['rushAtt']],
      ['R Yds',['rushYds','rushYards']],
      ['R TDs',['rushTDs']],
      ['R Fum',['rushFum']],
      ['Rec',['recCatches']],
      ['Rec Yds',['recYards','recYds']],
      ['Rec TDs',['recTDs']]
    ],
    RB:[
      ['R ATT',['rushAtt']],
      ['R Yds',['rushYds','rushYards']],
      ['R TDs',['rushTDs']],
      ['R Fum',['rushFum']],
      ['Rec',['recCatches']],
      ['Rec Yds',['recYards','recYds']],
      ['Rec TDs',['recTDs']]
    ],
    WR:[
      ['Rec',['recCatches']],
      ['Rec Yds',['recYards','recYds']],
      ['Rec TDs',['recTDs']],
      ['R ATT',['rushAtt']],
      ['R Yds',['rushYds','rushYards']],
      ['R TDs',['rushTDs']],
      ['R Fum',['rushFum']]
    ],
    TE:[
      ['Rec',['recCatches']],
      ['Rec Yds',['recYards','recYds']],
      ['Rec TDs',['recTDs']],
      ['R ATT',['rushAtt']],
      ['R Yds',['rushYds','rushYards']],
      ['R TDs',['rushTDs']],
      ['R Fum',['rushFum']]
    ],
    DEFENSE:[
      ['Tackles',['defTotalTackles','totalTackles','tackles']],
      ['TFL',['defTacklesForLoss','tacklesForLoss','tackleForLoss','tfl']],
      ['Sacks',['defSacks','sacks']],
      ['INTs',['defInts','defInterceptions']],
      ['FF',['defForcedFum','forcedFumbles']],
      ['FR',['defFumRec','fumbleRecoveries']],
      ['TDs',['defTDs','defensiveTDs']]
    ],
    K:[
      ['FG Att',['fGAtt']],
      ['FG Made',['fGMade']],
      ['XP Att',['xPAtt']],
      ['XP Made',['xPMade']]
    ],
    P:[
      ['Punts Att',['puntAtt']],
      ['Punt Net Yds / Att',['puntNetYdsPerAtt']],
      ['Punt Longest',['puntLongest']]
    ]
  };

  function playerDetailsGameLogColumns(position=''){
    const pos=canonicalFilterPosition(position);
    if(PLAYER_DETAILS_GAMELOG_COLUMNS[pos])return PLAYER_DETAILS_GAMELOG_COLUMNS[pos];
    if(['LE','RE','LEDGE','REDGE','EDGE','DT','DL','LOLB','ROLB','MLB','LB','SAM','MIKE','WILL','CB','FS','SS','DB'].includes(pos))return PLAYER_DETAILS_GAMELOG_COLUMNS.DEFENSE;
    return [];
  }

  function canonicalDetailsGameLog(playerId=''){
    const model=window.FranchiseHQ?.playerStatistics?.get?.(playerId);
    const categories=model?.categories||{};
    const normalized=liveRosterPlayers.get(String(playerId))||rosterService()?.findPlayer?.(playerId);
    const view=normalized?rosterPlayerView(normalized):{};
    const teamId=String(view.teamId||normalized?.teamId||'');
    const year=Number(canonicalCurrentSeasonYear());
    const columns=playerDetailsGameLogColumns(view.position);

    if(!columns.length){
      return `<div class="canonical-player-empty">No game-log layout is configured for this position.</div>`;
    }

    const scheduleRows=canonicalScheduleUniverse().filter(game=>{
      const source=game.source||{};
      const home=String(game.homeTeamId??game.homeId??game.home?.id??source.homeTeamId??'');
      const away=String(game.awayTeamId??game.awayId??game.away?.id??source.awayTeamId??'');
      const gameYear=Number(game.seasonYear??game.calendarYear??source.seasonYear??source.calendarYear??year);
      const week=game.week??game.weekIndex??source.weekIndex??source.week;
      const stage=canonicalEffectiveStage(game.stage??game.stageLabel??source.stage??source.seasonStage,week);

      return (home===teamId||away===teamId)
        &&stage!=='preseason'
        &&stage!=='pro-bowl'
        &&(!Number.isFinite(year)||!Number.isFinite(gameYear)||gameYear===year);
    }).sort((a,b)=>{
      const sourceA=a.source||{},sourceB=b.source||{};
      const wa=Number(a.week??a.weekIndex??sourceA.weekIndex??sourceA.week??0);
      const wb=Number(b.week??b.weekIndex??sourceB.weekIndex??sourceB.week??0);
      const stageA=canonicalEffectiveStage(a.stage??a.stageLabel??sourceA.stage??sourceA.seasonStage,wa);
      const stageB=canonicalEffectiveStage(b.stage??b.stageLabel??sourceB.stage??sourceB.seasonStage,wb);
      const order={'regular-season':0,'playoffs':1};
      return (order[stageA]-order[stageB])||wa-wb;
    });

    const statRowFor=(week,stage)=>{
      for(const category of PLAYER_STAT_CATEGORIES){
        const row=(categories[category]?.rows||[]).find(item=>{
          const raw=item.source||{};
          const rowWeek=Number(item.week??item.weekIndex??raw.weekIndex??raw.week);
          const rowStage=canonicalEffectiveStage(item.stage||raw.stage||raw.seasonStage,rowWeek);
          const rowYear=Number(item.seasonYear??raw.seasonYear??raw.calendarYear??year);

          return rowStage===stage
            &&canonicalComparableWeek(rowWeek,rowStage)===canonicalComparableWeek(week,stage)
            &&(!Number.isFinite(year)||!Number.isFinite(rowYear)||rowYear===year);
        });
        if(row)return {category,row};
      }
      return null;
    };

    const metricFor=(week,stage,aliases)=>{
      for(const category of PLAYER_STAT_CATEGORIES){
        const row=(categories[category]?.rows||[]).find(item=>{
          const raw=item.source||{};
          const rowWeek=Number(item.week??item.weekIndex??raw.weekIndex??raw.week);
          const rowStage=canonicalEffectiveStage(item.stage||raw.stage||raw.seasonStage,rowWeek);
          const rowYear=Number(item.seasonYear??raw.seasonYear??raw.calendarYear??year);

          return rowStage===stage
            &&canonicalComparableWeek(rowWeek,rowStage)===canonicalComparableWeek(week,stage)
            &&(!Number.isFinite(year)||!Number.isFinite(rowYear)||rowYear===year);
        });
        if(!row)continue;
        const value=canonicalMetricValue([{category,metrics:row.metrics||{}}],aliases);
        if(value!=='—')return value;
      }
      return 0;
    };

    const visibleGames=scheduleRows.filter(game=>{
      const source=game.source||{};
      const week=game.week??game.weekIndex??source.weekIndex??source.week;
      const stage=canonicalEffectiveStage(game.stage??game.stageLabel??source.stage??source.seasonStage,week);

      // Regular-season games remain visible. Postseason rows only appear when
      // this exact player has mapped stats for that playoff round.
      if(stage!=='playoffs')return true;
      return Boolean(statRowFor(week,stage));
    });

    const rows=visibleGames.map(game=>{
      const source=game.source||{};
      const week=game.week??game.weekIndex??source.weekIndex??source.week??'—';
      const stage=canonicalEffectiveStage(game.stage??game.stageLabel??source.stage??source.seasonStage,week);
      const gameYear=Number(game.seasonYear??game.calendarYear??source.seasonYear??source.calendarYear??year);
      const result=canonicalGameResultFor(playerId,week,stage,gameYear);
      const weekLabel=canonicalGameLogWeekLabel(week,stage);

      const opponent=result
        ? `${result.opponent}${result.score?` - ${result.score}`:''}`
        : `${stage==='playoffs'?(canonicalPostseasonMeta(week,stage)?.short||'Playoffs'):'Week'} ${stage==='playoffs'?'':week}`;

      const metricCells=columns.map(([label,aliases])=>{
        const value=metricFor(week,stage,aliases);
        return label.includes('%')
          ? `${Number(value||0).toFixed(1)}%`
          : ['Punt Net Yds / Att'].includes(label)
            ? Number(value||0).toFixed(1)
            : Number(value||0).toLocaleString();
      });

      return [
        weekLabel,
        {value:opponent,className:result?.className||'is-neutral'},
        ...metricCells
      ];
    });

    if(!rows.length){
      return `<div class="canonical-player-empty">No current-season game-log records are available.</div>`;
    }

    return `<div class="canonical-details-game-log-scroll">
      ${canonicalSortableTable(
        `details-game-log-${String(playerId).replace(/\W/g,'')}-${year}`,
        ['Week','Opponent / Result',...columns.map(([label])=>label)],
        rows
      )}
    </div>`;
  }

const CANONICAL_DETAILS_GAME_LOG_STYLE_ID='fhq-canonical-details-game-log-style';
  if(!document.getElementById(CANONICAL_DETAILS_GAME_LOG_STYLE_ID)){
    const style=document.createElement('style');
    style.id=CANONICAL_DETAILS_GAME_LOG_STYLE_ID;
    style.textContent=`
      .canonical-details-game-log-scroll{
        max-height:390px;
        overflow-y:auto;
        overflow-x:auto;
      }
      .canonical-details-game-log-scroll .table-wrap{
        overflow:visible;
      }
      .canonical-details-game-log-scroll thead th{
        position:sticky;
        top:0;
        z-index:3;
        background:var(--surface,#fff);
      }
    `;
    document.head.appendChild(style);
  }

function canonicalPlayerDashboardStats(playerId='') {
    const year=canonicalCurrentSeasonYear();

    return `<div class="canonical-dashboard-stack">
      <section class="canonical-dashboard-card">
        <div class="canonical-dashboard-card__head"><h3>Statistics (${year||'Season'})</h3></div>
        ${window.FranchiseHQ?.playerStatistics?.render?.(playerId)||'<div class="canonical-player-empty">Statistics service unavailable.</div>'}
      </section>

      <section class="canonical-dashboard-card canonical-current-game-log-card">
        <div class="canonical-dashboard-card__head"><h3>Game Log${year?` (${year})`:''}</h3></div>
        <div class="canonical-current-game-log-body">
          ${canonicalDetailsGameLog(playerId)}
        </div>
      </section>
    </div>`;
  }

  function canonicalPlayerSideRail(player={}) {
    return `<div class="canonical-dashboard-stack"><section class="canonical-dashboard-card"><div class="canonical-dashboard-card__head"><h3>Abilities</h3></div>${renderCanonicalAbilities(player)}</section><section class="canonical-dashboard-card"><div class="canonical-dashboard-card__head"><h3>Contract</h3></div>${canonicalContractPanel(player)}</section><section class="canonical-dashboard-card"><div class="canonical-dashboard-card__head"><h3>Transaction History</h3></div>${canonicalTransactionHistory(player.id)}</section></div>`;
  }

  function openCanonicalLivePlayerCard(playerId='') {
    const livePlayer=liveRosterPlayers.get(String(playerId));
    const normalized=livePlayer||(liveTeamDirectory?.snapshot?null:rosterService()?.findPlayer?.(playerId));
    if(!normalized)return false;
    const player=rosterPlayerView(normalized);
    const team=rosterTeamView(player.teamId)||{id:player.teamId,abbr:'FA',fullName:'Free Agent',primary:'#27364f',secondary:'#8fa4c4'};
    const modal=document.querySelector('[data-value-card-modal]');
    const content=document.querySelector('[data-value-card-content]');
    if(!modal||!content)return false;
    if(player.publicId)modal.dataset.publicPlayerId=player.publicId;
    modal.dataset.canonicalPlayerId=String(player.id||playerId);
    modal.dataset.playerReturnRoute=publicPlayerReturnRoute||'players';
    const logo=renderTeamMark(team,'canonical-player-team-logo');
    const watermarkLogo=team.logo
      ? `<img class="canonical-player-watermark-image" src="${escapeHtml(team.logo)}" alt="" aria-hidden="true" loading="lazy">`
      : renderTeamMark(team,'canonical-player-watermark-fallback');
    const stats=window.FranchiseHQ?.playerStatistics?.render?.(player.id)||'<div class="canonical-player-empty">Statistics service unavailable.</div>';
    const bio=canonicalPlayerBio(player);
    const dev=normalizeLiveDevelopment(player.developmentTrait||player.dev||player.raw?.developmentTrait);
    const teamPrimary=team.primary||'#27364f', teamSecondary=team.secondary||teamPrimary||'#8fa4c4';

    content.innerHTML=`<div class="value-card-context canonical-player-topbar"><button type="button" data-close-value-card><svg><use href="#icon-arrow"></use></svg><span>${escapeHtml(playerReturnLabel(modal.dataset.playerReturnRoute))}</span></button><span>Player Card</span></div>
      <section class="canonical-player-hero canonical-player-hero--approved" data-team-abbr="${escapeHtml(team.abbr||'')}" style="--player-team-primary:${escapeHtml(teamPrimary)};--player-team-secondary:${escapeHtml(teamSecondary)};background:linear-gradient(118deg,${escapeHtml(teamPrimary)} 0%,${escapeHtml(teamPrimary)} 43%,color-mix(in srgb,${escapeHtml(teamPrimary)} 55%,${escapeHtml(teamSecondary)}) 62%,${escapeHtml(teamSecondary)} 100%)">
        <div class="canonical-player-hero__stripe" aria-hidden="true"></div>
        <div class="canonical-player-hero__watermark canonical-player-hero__watermark--logo">${watermarkLogo}</div>
        <div class="canonical-player-hero__image">${renderCanonicalPlayerImage(player)}</div>
        <div class="canonical-player-hero__identity">
          <button type="button" class="canonical-player-teamline" data-team-id="${escapeHtml(team.id||'')}">${logo}<span><strong>${escapeHtml(team.fullName||team.abbr||'Team')}</strong><span>#${escapeHtml(player.number||'—')} &nbsp;•&nbsp; ${escapeHtml(player.position||'—')}</span></span></button>
          <div class="canonical-player-nameblock"><h2>${escapeHtml(player.name||'Player')}</h2><p>${escapeHtml(player.height||'—')} &nbsp;•&nbsp; ${escapeHtml(player.weight||'—')} lbs &nbsp;•&nbsp; ${escapeHtml(player.college||'—')}</p></div>
          <div class="canonical-player-bio-strip"><div><span>Age</span><strong>${escapeHtml(bio.age)}</strong></div><div><span>Exp</span><strong>${escapeHtml(bio.exp==='—'?'—':`${bio.exp} Year${Number(bio.exp)===1?'':'s'}`)}</strong></div><div><span>College</span><strong>${escapeHtml(player.college||'—')}</strong></div></div>
        </div>
        <div class="canonical-player-hero__overall"><strong>${player.overall??'—'}</strong><span>OVR</span><b>${escapeHtml(dev)}</b></div>
      </section>

      <div class="canonical-player-tabs canonical-player-tabs--approved" role="tablist">
        ${[['ratings','Details'],['statistics','Statistics'],['game-log','Game Logs'],['transactions','Transaction History']].map(([id,label],index)=>`<button type="button" class="${index===0?'is-active':''}" data-canonical-player-tab="${id}">${label}</button>`).join('')}
      </div>

      <div class="canonical-player-panels canonical-player-panels--approved">
        <section class="canonical-player-panel is-active" data-canonical-player-panel="ratings"><div class="canonical-player-dashboard"><div class="canonical-player-dashboard__ratings"><section class="canonical-dashboard-card canonical-dashboard-card--ratings"><div class="canonical-dashboard-card__head"><h3>Ratings</h3></div>${renderCanonicalRatings(player)}</section></div><div class="canonical-player-dashboard__center">${canonicalPlayerDashboardStats(player.id)}</div><aside class="canonical-player-dashboard__rail">${canonicalPlayerSideRail(player)}</aside></div></section>
        <section class="canonical-player-panel" data-canonical-player-panel="statistics"><section class="canonical-dashboard-card canonical-full-tab-card"><div class="canonical-dashboard-card__head"><h3>Franchise Career Statistics</h3></div>${renderCanonicalHistoricalStatistics(player.id)}</section></section>
        <section class="canonical-player-panel" data-canonical-player-panel="game-log">
          <section class="canonical-dashboard-card canonical-full-tab-card">
            <div class="canonical-dashboard-card__head"><h3>Game Logs</h3></div>
            ${renderCanonicalGameLogTab(player.id)}
          </section>
        </section>
        
        <section class="canonical-player-panel" data-canonical-player-panel="contract"><section class="canonical-dashboard-card canonical-full-tab-card"><div class="canonical-dashboard-card__head"><h3>Contract</h3></div>${canonicalContractPanel(player)}</section></section>
        <section class="canonical-player-panel" data-canonical-player-panel="transactions"><section class="canonical-dashboard-card canonical-full-tab-card"><div class="canonical-dashboard-card__head"><h3>Transaction History</h3></div>${canonicalTransactionHistory(player.id)}</section></section>
      </div>
      ${canonicalTradeBreakdown(player)}`;

    refreshCanonicalPlayerTransactionHistory(player.id,content);
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
    return true;
  }

  function playerReturnLabel(route='players'){
    const base=routeBase(String(route||'players'));
    return ({home:'Back to League Home','league-activity':'Back to League Activity',teams:'Back to Team Roster','my-team':'Back to My Team',players:'Back to Players',stats:'Back to Stats & Leaders',schedule:'Back to Schedule',standings:'Back to Standings',transactions:'Back to Transactions','trade-center':'Back to Trade Center','trade-block':'Back to Trade Block',commissioner:'Back to Commissioner HQ'})[base]||'Back to Previous Page';
  }

  document.addEventListener('click',event=>{
    const tab=event.target.closest('[data-canonical-player-tab]');
    if(!tab)return;
    event.preventDefault();
    const root=tab.closest('[data-value-card-content]')||document.querySelector('[data-value-card-content]');
    if(!root)return;
    const target=tab.getAttribute('data-canonical-player-tab');
    root.querySelectorAll('[data-canonical-player-tab]').forEach(button=>button.classList.toggle('is-active',button===tab));
    root.querySelectorAll('[data-canonical-player-panel]').forEach(panel=>panel.classList.toggle('is-active',panel.getAttribute('data-canonical-player-panel')===target));
    if(target==='transactions'){
      const host=root.querySelector('[data-canonical-player-transaction-history]');
      if(host)refreshCanonicalPlayerTransactionHistory(host.dataset.canonicalPlayerTransactionHistory,root);
    }
  });

  function openRosterPlayerDetail(playerId) {
    const scrollingElement=document.scrollingElement;
    const savedWindowScroll=scrollingElement?.scrollTop??window.scrollY;
    const savedMainScroll=mainContent?.scrollTop||0;

    const restorePlayerScroll=()=>{
      const restore=()=>{
        if(scrollingElement)scrollingElement.scrollTop=savedWindowScroll;
        window.scrollTo(0,savedWindowScroll);
        if(mainContent)mainContent.scrollTop=savedMainScroll;
      };
      restore();
      requestAnimationFrame(()=>{restore();requestAnimationFrame(restore);});
    };

    const open=()=>{
      const publicPlayer=playerForPublicRoute(playerId);
      const publicId=String(publicPlayer?.publicId||'').toLowerCase();
      const currentRoute=currentAppRoute();
      const originRoute=routeBase(currentRoute)==='players'&&currentRoute.split('/')[1]
        ? (publicPlayerReturnRoute||'players')
        : currentRoute;
      if(PUBLIC_PLAYER_ID_PATTERN.test(publicId)&&currentRoute!==`players/${publicId}`){
        publicPlayerReturnRoute=originRoute;
        setRoute(`players/${publicId}`,{source:'player-link'});
        return true;
      }
      try{
        if(openCanonicalLivePlayerCard(playerId)){
          restorePlayerScroll();
          return true;
        }
      }catch(error){
        console.error('[Canonical Player Card]',error);
      }

      if(liveTeamDirectory?.snapshot) return false;
      const legacy=playerById(playerId);
      if(legacy&&window.FGC_TRADE?.openValueCard){
        window.FGC_TRADE.openValueCard(playerId);
        restorePlayerScroll();
        return true;
      }
      return false;
    };

    // Open from the already-hydrated roster immediately. Statistics continue
    // in the shared background request and repaint the two game-log surfaces.
    if(liveRosterPlayers.has(String(playerId))){
      open();
      if(!playerStatisticsState.loaded)hydratePlayerStatistics(false).catch(error=>console.error('[Canonical Player Statistics Prewarm]',error));
      return;
    }
    loadLiveTeamDirectory(false).then(()=>{
      open();
      if(!playerStatisticsState.loaded)hydratePlayerStatistics(false).catch(error=>console.error('[Canonical Player Statistics Prewarm]',error));
    }).catch(error=>{
      console.error('[Canonical Player Card Hydration]',error);
      open();
    });
  }

  function renderTeamDetailLegacy(teamId) {
    const team = teamById(teamId);
    if (!team) { setRoute('teams'); return; }
    const rosterModel = rosterService()?.getTeamRoster?.(team.id);
    const roster = rosterModel?.players?.map(rosterPlayerView) || [];
    const teamGames = schedule.flatMap(week => week.games).filter(game => game.homeId === team.id || game.awayId === team.id);
    const leaders = [...roster].sort((a,b) => b.overall - a.overall).slice(0,5);

    pageContent.innerHTML = `
      <div class="page-heading"><div><button class="text-button" data-route="teams"><svg style="transform:rotate(180deg)"><use href="#icon-arrow"></use></svg>All teams</button></div><div class="heading-actions">${accountOwnsTeam(team)?`<button class="button button--ghost" data-open-block-drawer><svg><use href="#icon-tag"></use></svg>Manage Trade Block</button>`:''}<button class="button button--primary" data-start-team-trade="${team.id}"><svg><use href="#icon-swap"></use></svg>${accountOwnsTeam(team)?'Start Trade Proposal':`Start Trade w/ ${team.fullName}`}</button></div></div>
      <section class="team-hero" style="${teamStyle(team)}" data-abbr="${team.abbr}">
        <div class="team-hero__content">${renderTeamMark(team,'team-logo team-logo--large')}<div class="team-hero__copy"><span class="eyebrow">${team.conference} ${team.division} · Owner ${escapeHtml(team.owner)}</span><h1>${team.fullName}</h1><p>Head Coach ${escapeHtml(team.coach)} · ${team.stadium}</p></div><div class="team-hero__record"><strong>${team.record}</strong><span>#${team.divisionRank} in ${team.division} · ${team.streak}</span></div></div>
      </section>
      <div class="team-summary-grid">
        ${summaryTile('Overall',team.ovr,'Team rating')}${summaryTile('Offense',team.off,'Unit rating')}${summaryTile('Defense',team.def,'Unit rating')}${summaryTile('Points For',team.pf,`${(team.pf/7).toFixed(1)} per game`)}${summaryTile('Points Against',team.pa,`${(team.pa/7).toFixed(1)} per game`)}${summaryTile('Cap Space',formatMoney(team.cap),'Current estimate')}
      </div>
      <div class="subnav" data-team-tabs>
        ${['roster','depth','schedule','stats','cap','trade-history'].map(tab => `<button data-team-tab="${tab}" class="${state.teamTab===tab?'is-active':''}">${tab === 'depth' ? 'Depth Chart' : tab === 'trade-history' ? 'Transaction History' : titleCase(tab)}</button>`).join('')}
      </div>
      <div data-team-tab-content>${renderTeamTab(team, rosterModel, roster, teamGames, leaders)}</div>`;
  }

  async function renderTeamDetail(teamId,options={}) {
    pageContent.setAttribute('aria-busy','true');
    try{
      const directory=await loadLiveTeamDirectory();
      pageContent.removeAttribute('aria-busy');
      if(!directory){
        pageContent.innerHTML='<section class="empty-state"><strong>Team data unavailable</strong><p>League data did not return a team directory.</p></section>';
        return;
      }
      const team=teamForPublicRoute(teamId);
      if(!team){setRoute('teams');return;}
      if(!options.preserveRoute)replaceCurrentPublicUrl(`teams/${team.id}`);
      const players=directory.playersByTeam.get(String(team.id))||[];
      const rosterModel=liveRosterModel(team,players);
      const roster=players.map(rosterPlayerView);
      const leaders=[...roster].sort((a,b)=>(Number(b.overall)||0)-(Number(a.overall)||0)).slice(0,5);
      const teamGames=(directory.games||[])
        .filter(game=>String(game.homeTeamId)===String(team.id)||String(game.awayTeamId)===String(team.id))
        .map(game=>liveTeamScheduleGame(game));

      pageContent.innerHTML=`
        <div class="page-heading"><div>${options.myTeam?'<span class="eyebrow">Assigned franchise</span><h1>My Team</h1>':'<button class="text-button" data-route="teams"><svg style="transform:rotate(180deg)"><use href="#icon-arrow"></use></svg>All teams</button>'}</div><div class="heading-actions">${accountOwnsTeam(team)?`<button class="button button--ghost" data-open-block-drawer><svg><use href="#icon-tag"></use></svg>Manage Trade Block</button>`:''}<button class="button button--primary" data-start-team-trade="${team.id}"><svg><use href="#icon-swap"></use></svg>${accountOwnsTeam(team)?'Start Trade Proposal':`Start Trade w/ ${escapeHtml(team.fullName)}`}</button></div></div>
        <section class="team-hero team-hero--watermark team-hero--matchup-colors" style="${teamStyle(team)};background:linear-gradient(125deg,${escapeHtml(team.primary)},${escapeHtml(team.secondary||team.primary)}) !important" data-abbr="${escapeHtml(team.abbr)}">
          ${team.logo?`<img class="team-hero__watermark" src="${escapeHtml(team.logo)}" alt="" aria-hidden="true" loading="lazy">`:''}
          <div class="team-hero__content"><div class="team-hero__copy"><span class="eyebrow">${escapeHtml(team.conference)} ${escapeHtml(team.division)} · Owner ${escapeHtml(team.owner)}</span><h1>${escapeHtml(team.fullName)}</h1></div><div class="team-hero__record"><strong>${escapeHtml(team.record)}</strong><span>${escapeHtml(team.conference)} ${escapeHtml(team.division)}</span></div></div>
        </section>
        <div class="team-summary-grid">
          ${team.ovr?summaryTile('Overall',team.ovr,''):''}${summaryTile('Points For',team.pf,ordinalRank(team.pfRank))}${summaryTile('Points Against',team.pa,ordinalRank(team.paRank))}${summaryTile('Cap Space',compactMoney(team.cap),'')}
        </div>
        <div data-gm-career-host="${escapeHtml(team.teamKey||team.abbr||team.id)}"></div>
        <div class="subnav" data-team-tabs>
          ${['roster','depth','schedule','stats','cap','trade-history'].map(tab=>`<button data-team-tab="${tab}" class="${state.teamTab===tab?'is-active':''}">${tab==='depth'?'Depth Chart':tab==='trade-history'?'Transaction History':titleCase(tab)}</button>`).join('')}
        </div>
        <div data-team-tab-content>${renderTeamTab(team,rosterModel,roster,teamGames,leaders)}</div>`;
      if(state.teamTab==='trade-history') refreshTeamTransactionHistory(team,pageContent.querySelector('[data-team-tab-content]'));
      window.FranchiseHQ?.ownershipCareer?.mountTeam?.(pageContent.querySelector('[data-gm-career-host]'),team.teamKey||team.abbr||team.id);
      requestAnimationFrame(()=>{
        if(mainContent?.scrollTo) mainContent.scrollTo({top:0,left:0,behavior:'instant'});
        window.scrollTo({top:0,left:0,behavior:'instant'});
      });
    }catch(error){
      pageContent.removeAttribute('aria-busy');
      console.error('[Team Detail Live Integration]',error);
      pageContent.innerHTML=`<section class="empty-state"><strong>Team page could not load</strong><p>${escapeHtml(error?.message||'An unexpected Team-page rendering error occurred.')}</p></section>`;
    }
  }

  function summaryTile(label, value, detail='') { return `<article class="summary-tile card"><span>${label}</span><strong>${value}</strong>${detail?`<small>${detail}</small>`:''}</article>`; }
  function titleCase(value) { return value.replace(/\b\w/g, letter => letter.toUpperCase()); }
  function positionOrder(position) { return positionBlueprint.findIndex(([pos]) => pos === position); }

  function renderTeamTab(team, rosterModel, roster, teamGames, leaders) {
    if (!rosterModel) return `<article class="card roadmap-state"><div class="roadmap-state__inner"><h2>Roster service unavailable</h2><p>The Roster Read Model has not loaded.</p></div></article>`;
    if (state.teamTab === 'depth') return renderRosterDepthChart(rosterModel);
    if (state.teamTab === 'schedule') return renderTeamSchedule(team, teamGames);
    if (state.teamTab === 'stats') return renderTeamStats(team, roster);
    if (state.teamTab === 'cap') return renderTeamCap(team, roster);
    if (state.teamTab === 'trade-history') return renderTeamTradeHistory(team);
    return renderRosterExperience(team, rosterModel);
  }

  function renderRosterPlayerActions(player, account) {
    const ownPlayer = accountOwnsPlayer(player,account);
    const active = ownPlayer ? window.FGC_TRADE?.onBlock?.(player) : false;
    const starLabel = active ? 'Remove from Trade Block' : 'Add to Trade Block';
    return {
      star: ownPlayer ? `<button type="button" class="roster-star ${active?'is-active':''}" data-player-action="star" data-player-id-action="${player.id}" aria-pressed="${active?'true':'false'}" aria-label="${starLabel}" title="${starLabel}"><svg><use href="#icon-star"></use></svg></button>` : '',
      trade: `<button type="button" class="roster-trade-button" data-player-action="trade" data-player-id-action="${player.id}">Trade</button>`
    };
  }

  function renderRosterTable(roster) {
    const account = window.FGC_TRADE?.getCurrentAccount?.();
    return `<article class="card"><div class="card-header"><div><span class="eyebrow">Active franchise roster</span><h3>Active roster</h3></div><span class="pill pill--neutral">${roster.length} records</span></div><div class="table-wrap" data-roster-scroll><table class="team-roster-table"><thead><tr><th class="quick-star-col"><span class="sr-only">Quick action</span></th><th>Player</th><th>OVR</th><th>Age</th><th>Development</th><th>Contract</th><th>Cap Hit</th><th>Status</th></tr></thead><tbody>${roster.map(player => { const actions=renderRosterPlayerActions(player,account); return `<tr class="clickable-row roster-player-row" data-player-id="${player.id}" data-roster-player-row="${player.id}"><td class="quick-star-col">${actions.star}</td><td><div class="roster-player-cell">${renderPlayerIdentity(player,false)}${actions.trade}</div></td><td><span class="rating-chip ${player.overall>=90?'rating-chip--elite':player.overall>=84?'rating-chip--high':''}">${player.overall}</span></td><td>${player.age}</td><td><span class="dev-badge ${devClass(player.dev)}">${player.dev}</span></td><td>${player.years} year${player.years===1?'':'s'}</td><td>${formatMoney(player.capHit)}</td><td><span class="pill ${player.injury==='Healthy'?'pill--success':'pill--warning'}">${player.injury}</span></td></tr>` }).join('')}</tbody></table></div></article>`;
  }

  function renderDepthChart(roster) {
    const groups = [
      ['QB',['QB']],['HB',['RB','FB']],['REC',['WR','TE']],['OL',['LT','LG','C','RG','RT']],
      ['DL',['LE','RE','DT']],['LB',['LOLB','MLB','ROLB']],['DB',['CB','FS','SS']],['ST',['K','P']]
    ];
    return `<article class="card"><div class="card-header"><div><span class="eyebrow">Projected lineup</span><h3>Depth chart</h3></div><span class="pill pill--accent">OVR-derived order</span></div><div class="card-body"><div class="depth-chart">${groups.map(([label, positions]) => {
      const groupPlayers = roster.filter(player => positions.includes(player.position)).sort((a,b) => b.overall-a.overall).slice(0,3);
      return `<div class="depth-row"><span class="depth-position">${label}</span>${groupPlayers.map(player => `<button class="depth-player" data-player-id="${player.id}"><span class="rating-chip ${player.overall>=90?'rating-chip--elite':player.overall>=84?'rating-chip--high':''}">${player.overall}</span><div><strong>${escapeHtml(player.name)}</strong><small>${player.position} · ${player.dev}</small></div></button>`).join('')}</div>`;
    }).join('')}</div></div></article>`;
  }

  const liveMatchupGames=new Map();
  const liveMatchupTeams=new Map();

  function gameMetadata(game={}) {
    const source=game.source||{};
    const merged={...game,...source};
    const candidates=[
      ['scheduledAt',merged.scheduledAt],['scheduledDate',merged.scheduledDate],['scheduleDate',merged.scheduleDate],
      ['gameDate',merged.gameDate],['date',merged.date],['startTime',merged.startTime],
      ['kickoffTime',merged.kickoffTime],['gameTime',merged.gameTime],['time',merged.time]
    ];
    let parsed=null,usedField=null,rawValue=null;
    for(const [field,value] of candidates){
      if(value===undefined||value===null||value==='') continue;
      const date=new Date(value);
      if(!Number.isNaN(date.getTime())){parsed=date;usedField=field;rawValue=value;break;}
    }
    if(!parsed){
      const year=Number(firstDefined(merged,['calendarYear','year']));
      const month=Number(firstDefined(merged,['calendarMonth','month']));
      const day=Number(firstDefined(merged,['calendarDay','dayOfMonth','day']));
      const hour=Number(firstDefined(merged,['hour','gameHour']));
      const minute=Number(firstDefined(merged,['minute','gameMinute']));
      if(Number.isFinite(year)&&Number.isFinite(month)&&Number.isFinite(day)){
        const date=new Date(year,Math.max(0,month-1),day,Number.isFinite(hour)?hour:0,Number.isFinite(minute)?minute:0);
        if(!Number.isNaN(date.getTime())){parsed=date;usedField='calendar parts';rawValue=`${year}-${month}-${day} ${hour||0}:${minute||0}`;}
      }
    }
    const explicitDay=firstDefined(merged,['dayOfWeek','gameDay','dayName']);
    const explicitTime=firstDefined(merged,['kickoffTime','gameTime','timeLabel']);
    const dayLabel=parsed?parsed.toLocaleDateString(undefined,{weekday:'short'}).toUpperCase():(explicitDay?String(explicitDay).toUpperCase():null);
    const timeLabel=parsed?parsed.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):(explicitTime?String(explicitTime):null);
    return {
      parsedTimestamp:parsed?parsed.toISOString():null,
      dayLabel,timeLabel,usedField,rawValue,
      stadium:firstDefined(merged,['stadiumName','stadium']),
      network:firstDefined(merged,['network','broadcastNetwork']),
      rawFields:Object.fromEntries(Object.entries(merged).filter(([key,value])=>/date|time|calendar|hour|minute|kick|start|day|zone/i.test(key)&&value!==null&&value!==undefined&&value!==''))
    };
  }

  function matchupTeam(teamId) {
    const id=String(teamId||'');
    const live=liveTeamDirectory?.teamMap?.get(id);
    if(live)return live;
    if(liveTeamDirectory?.snapshot) return {id,abbr:'TBD',fullName:'Unavailable team',city:'',primary:null,secondary:null,record:'—',owner:'Unassigned',sourceState:'unavailable'};
    const fallback=teamById(id);
    return fallback||{id,abbr:'TBD',fullName:'Team',city:'',primary:'#27364f',secondary:'#8fa4c4',record:'—',owner:'Unassigned'};
  }

  const matchupTeamStatsCache=new Map();
  let activeMatchupGame=null;

  function statisticRaw(row={}) {
    return {...(row.source||{}),...(row.metrics||{}),...row};
  }

  function statisticDirectGameId(row={}) {
    const raw=statisticRaw(row), metrics=row?.metrics||{};
    const value=raw.gameId??raw.game_id??raw.scheduleId??raw.schedule_id??raw.eventId
      ??metrics.__gameId??metrics.scheduleId??metrics.gameId??metrics.game_id??metrics.schedule_id??null;
    return value===null||value===undefined||value===''?'':String(value);
  }

  function gameDirectIds(game={}) {
    const raw={...(game.source||{}),...game};
    return [...new Set([
      raw.id,raw.gameId,raw.game_id,raw.scheduleId,raw.schedule_id,raw.external_id
    ].filter(value=>value!==undefined&&value!==null&&String(value)!=='').map(String))];
  }

  function metricValue(raw={},keys=[]) {
    const all={...(raw.source||{}),...(raw.metrics||{}),...raw};
    for(const key of keys){
      const value=all[key];
      if(value!==undefined&&value!==null&&value!=='') return value;
    }
    return null;
  }

  function numericMetric(raw={},keys=[]) {
    const value=metricValue(raw,keys);
    if(value===null) return null;
    const number=Number(value);
    return Number.isFinite(number)?number:null;
  }

  function fractionMetric(raw={},madeKeys=[],attKeys=[],combinedKeys=[]) {
    const combined=metricValue(raw,combinedKeys);
    if(combined!==null){
      const text=String(combined).trim();
      const match=text.match(/(\d+)\s*[-\/]\s*(\d+)/);
      if(match) return `${Number(match[1])}/${Number(match[2])}`;
    }
    const made=numericMetric(raw,madeKeys),att=numericMetric(raw,attKeys);
    return made!==null&&att!==null?`${made}/${att}`:null;
  }

  function possessionMetric(raw={}) {
    const text=metricValue(raw,['timeOfPossession','timePossession','possessionTime','time_of_possession','possession_time']);
    if(text!==null){
      if(typeof text==='string'&&text.includes(':')) return text;
      const seconds=Number(text);
      if(Number.isFinite(seconds)&&seconds>=0){
        const mins=Math.floor(seconds/60),secs=Math.floor(seconds%60);
        return `${mins}:${String(secs).padStart(2,'0')}`;
      }
    }
    const mins=numericMetric(raw,['topMin','topmin','possessionMinutes','timePossessionMinutes']);
    const secs=numericMetric(raw,['topSec','topsec','possessionSeconds','timePossessionSeconds']);
    return mins!==null?`${mins}:${String(secs||0).padStart(2,'0')}`:null;
  }

  function mergeTeamStatisticRows(rows=[]) {
    const merged={};
    rows.forEach(row=>{
      Object.assign(merged,row.source||{},row.metrics||{},row);
    });
    return merged;
  }

  function teamGameStatisticModel(rows=[]) {
    const raw=mergeTeamStatisticRows(rows);
    const turnovers=numericMetric(raw,['turnovers','totalTurnovers','giveaways','turnoverTotal','teamTurnovers']);
    const interceptions=numericMetric(raw,['interceptionsThrown','passInterceptions','intsThrown']);
    const fumblesLost=numericMetric(raw,['fumblesLost','fumbleLost']);
    const derivedTurnovers=turnovers!==null?turnovers:(interceptions!==null||fumblesLost!==null?(interceptions||0)+(fumblesLost||0):null);
    const penalties=numericMetric(raw,['penalties','penaltyCount','totalPenalties']);
    const penaltyYards=numericMetric(raw,['penaltyYards','penYds','penalty_yards']);
    return {
      totalOffense:numericMetric(raw,['totalOffense','totalOffenseYards','totalYards','offenseYards','teamOffYds','teamoff','total_offense_yards']),
      passingYards:numericMetric(raw,['passingYards','passYards','passYds','netPassingYards','teamPassYds','teampass','passing_yards']),
      rushingYards:numericMetric(raw,['rushingYards','rushYards','rushYds','teamRushYds','teamrush','rushing_yards']),
      firstDowns:numericMetric(raw,['firstDowns','totalFirstDowns','firstdowns','first_downs']),
      turnovers:derivedTurnovers,
      thirdDown:fractionMetric(raw,['thirdDownMade','thirdDownConversions','thirdDownsMade','thirdmade','third_down_made'],['thirdDownAttempts','thirdDownAtt','thirdDownsAttempted','thirdatt','third_down_attempts'],['thirdDown','thirdDownEfficiency','third_down']),
      redZone:fractionMetric(raw,['redZoneMade','redZoneTDs','redZoneConversions','rzmade','red_zone_made'],['redZoneAttempts','redZoneAtt','rzatt','red_zone_attempts'],['redZone','redZoneEfficiency','red_zone']),
      possession:possessionMetric(raw),
      penalties:penalties!==null?(penaltyYards!==null?`${penalties}-${penaltyYards}`:String(penalties)):null,
      rowCount:rows.length,
      raw
    };
  }

  function rowTeamId(row={}) {
    const raw=statisticRaw(row);
    return String(raw.teamId??raw.team_id??raw.teamExternalId??raw.team_external_id??raw.clubId??raw.club_id??'');
  }

  function rowPlayerId(row={}) {
    const raw=statisticRaw(row);
    return String(raw.playerId??raw.player_id??raw.playerExternalId??raw.player_external_id??raw.rosterId??raw.roster_id??'');
  }

  function sumMetric(rows=[],keys=[]) {
    let found=false,total=0;
    rows.forEach(row=>{
      const value=numericMetric(row,keys);
      if(value!==null){found=true;total+=value;}
    });
    return found?total:null;
  }

  function aggregatePlayerGameStats(rows=[]) {
    const passingYards=sumMetric(rows,['passingYards','passYards','passYds','pass_yds']);
    const rushingYards=sumMetric(rows,['rushingYards','rushYards','rushYds','rush_yds']);
    const interceptions=sumMetric(rows,['interceptions','passInterceptions','interceptionsThrown','intsThrown']);
    const fumblesLost=sumMetric(rows,['fumblesLost','fumbleLost','fumbles_lost']);
    return {
      passingYards,
      rushingYards,
      totalOffense:passingYards!==null||rushingYards!==null?(passingYards||0)+(rushingYards||0):null,
      turnovers:interceptions!==null||fumblesLost!==null?(interceptions||0)+(fumblesLost||0):null,
      rowCount:rows.length
    };
  }

  function gameStatField(raw={},side='away',aliases=[]) {
    const prefix=side==='home'?'home':'away';
    const cap=prefix[0].toUpperCase()+prefix.slice(1);
    const keys=[];
    aliases.forEach(name=>{
      const n=String(name);
      const nameCap=n[0]?.toUpperCase()+n.slice(1);
      keys.push(
        `${prefix}${nameCap}`,`${prefix}${n}`,
        `${prefix}_${n}`,`${prefix}_${n.replace(/[A-Z]/g,m=>`_${m.toLowerCase()}`)}`,
        `${n}${cap}`,`${n}_${prefix}`,
        `${nameCap}${cap}`
      );
    });
    return metricValue(raw,keys);
  }

  function numericGameStat(raw={},side='away',aliases=[]) {
    const value=gameStatField(raw,side,aliases);
    if(value===null||value===undefined||value==='') return null;
    const number=Number(value);
    return Number.isFinite(number)?number:null;
  }

  function ratioDisplay(made,attempted) {
    if(made===null&&attempted===null) return null;
    if(attempted===null||Number(attempted)===0) return made!==null?String(made):null;
    const pct=(Number(made||0)/Number(attempted))*100;
    return `${Number(made||0)}/${Number(attempted)} (${pct.toFixed(0)}%)`;
  }

  function possessionDisplay(value) {
    if(value===null||value===undefined||value==='') return null;
    if(typeof value==='string'&&value.includes(':')) return value;
    const seconds=Number(value);
    if(!Number.isFinite(seconds)) return String(value);
    // Madden exports have used either seconds or clock-style integer values.
    if(seconds>=60){
      const minutes=Math.floor(seconds/60);
      const remain=Math.round(seconds%60);
      return `${minutes}:${String(remain).padStart(2,'0')}`;
    }
    return String(value);
  }

  function gameSideBoxScore(game={},side='away') {
    const raw={...(game.source||{}),...game};

    const totalOffense=numericGameStat(raw,side,[
      'totalOffense','totalOffenseYards','totalYards','offenseYards','offYds','totalOffYds'
    ]);
    const passingYards=numericGameStat(raw,side,[
      'passingYards','passYards','passYds','netPassingYards','netPassYards','passNetYds'
    ]);
    const rushingYards=numericGameStat(raw,side,[
      'rushingYards','rushYards','rushYds','totalRushYards'
    ]);
    const firstDowns=numericGameStat(raw,side,[
      'firstDowns','firstdowns','totalFirstDowns','firstDownTotal'
    ]);
    const turnovers=numericGameStat(raw,side,[
      'turnovers','giveaways','totalTurnovers','turnoverCount'
    ]);

    const thirdPct=gameStatField(raw,side,[
      'thirdDownPct','thirdDownPercentage','thirdDownPercent','thirdDownEfficiency'
    ]);
    const thirdMade=numericGameStat(raw,side,[
      'thirdDownConversions','thirdDownConverts','thirdDownMade','thirdDownConv','thirdDownSuccesses'
    ]);
    const thirdAtt=numericGameStat(raw,side,[
      'thirdDownAttempts','thirdDownAtt','thirdDownTries'
    ]);

    const redPct=gameStatField(raw,side,[
      'redZonePct','redZonePercentage','redZonePercent','redZoneEfficiency'
    ]);
    const redMade=numericGameStat(raw,side,[
      'redZoneTDs','redZoneTouchdowns','redZoneConversions','redZoneMade','redZoneScores'
    ]);
    const redAtt=numericGameStat(raw,side,[
      'redZoneAttempts','redZoneAtt','redZoneTrips','redZonePossessions'
    ]);

    const possessionRaw=gameStatField(raw,side,[
      'timeOfPossession','possessionTime','timePossession','possessionSeconds','timeOfPossessionSeconds','possession'
    ]);

    const penalties=numericGameStat(raw,side,[
      'penalties','penaltyCount','totalPenalties'
    ]);
    const penaltyYards=numericGameStat(raw,side,[
      'penaltyYards','penYds','penaltyYds','totalPenaltyYards'
    ]);

    return {
      totalOffense,
      passingYards,
      rushingYards,
      firstDowns,
      turnovers,
      thirdDown:thirdPct!==null&&thirdPct!==undefined&&thirdPct!==''?String(thirdPct):ratioDisplay(thirdMade,thirdAtt),
      redZone:redPct!==null&&redPct!==undefined&&redPct!==''?String(redPct):ratioDisplay(redMade,redAtt),
      possession:possessionDisplay(possessionRaw),
      penalties:penalties!==null?(penaltyYards!==null?`${penalties}-${penaltyYards}`:String(penalties)):null
    };
  }

  function combineGameTeamStats(primaryStats={},fallbackStats={}) {
    const value=key=>primaryStats[key]!==null&&primaryStats[key]!==undefined&&primaryStats[key]!==''?primaryStats[key]:fallbackStats[key];
    return {
      totalOffense:value('totalOffense'),
      passingYards:value('passingYards'),
      rushingYards:value('rushingYards'),
      firstDowns:value('firstDowns'),
      turnovers:value('turnovers'),
      thirdDown:value('thirdDown'),
      redZone:value('redZone'),
      defensiveSacks:value('defensiveSacks'),
      penalties:value('penalties')
    };
  }

  function normalizedGamePhase(value) {
    const text=String(value??'').toLowerCase();
    if(text.includes('pre')) return 'preseason';
    if(text.includes('post')||text.includes('playoff')) return 'playoffs';
    return 'regular-season';
  }

  function teamGameRowsFor(game={},statistics=[],teamId='') {
    const gameIds=new Set(gameDirectIds(game));
    const gameContext=stageWeekContext(game.source||{},game.week,game.stage);
    const phase=normalizedGamePhase(gameContext.phase), week=Number(gameContext.week);
    const candidates=(statistics||[]).filter(row=>String(row.category||'').toLowerCase()==='team-game'&&rowTeamId(row)===String(teamId));
    const direct=candidates.filter(row=>{const id=statisticDirectGameId(row);return Boolean(id&&gameIds.has(id));});
    if(direct.length)return direct;
    return candidates.filter(row=>{const c=stageWeekContext(row.source||{},row.week,row.stage);return normalizedGamePhase(c.phase)===phase&&Number(c.week)===week;});
  }

  function teamSummaryMetrics(rows=[]) {
    const merged={};
    rows.forEach(row=>Object.assign(merged,row.metrics||{},row.source||{}));
    return merged;
  }

  function mappedTeamSummaryStats(rows=[]) {
    const raw=teamSummaryMetrics(rows);
    const num=aliases=>numericMetric(raw,aliases);

    const offFumLost=num(['offFumLost']);
    const offIntsLost=num(['offIntsLost']);
    const turnovers=(offFumLost!==null||offIntsLost!==null)
      ? (offFumLost||0)+(offIntsLost||0)
      : null;

    const thirdDownPct=num(['off3rdDownConvPct']);
    const redZonePct=num(['offRedZonePct']);
    const penalties=num(['penalties']);
    const penaltyYards=num(['penaltyYds']);

    return {
      totalOffense:num(['offTotalYds','offTotalYdsGained']),
      passingYards:num(['offPassYds']),
      rushingYards:num(['offRushYds']),
      firstDowns:num(['off1stDowns']),
      turnovers,
      thirdDown:thirdDownPct!==null?`${thirdDownPct.toFixed(1)}%`:null,
      redZone:redZonePct!==null?`${redZonePct.toFixed(1)}%`:null,
      defensiveSacks:num(['defSacks']),
      penalties:penalties!==null
        ? `${penalties} / ${penaltyYards!==null?penaltyYards:'—'}`
        : null
    };
  }

  async function hydrateMatchupTeamStatistics(game={}){
    const key=String(game.id||game.gameId||game.scheduleId||'');
    if(key&&matchupTeamStatsCache.has(key))return matchupTeamStatsCache.get(key);
    if(!playerStatisticsState.loaded)await hydratePlayerStatistics(false);

    const statistics=playerStatisticsState.rows||[],ids=new Set(gameDirectIds(game));
    const awayId=String(game.awayTeamId??game.awayId??''),homeId=String(game.homeTeamId??game.homeId??'');
    const direct=canonicalGameRows(game);
    const byTeam=teamId=>direct.filter(row=>rowTeamId(row)===String(teamId));
    const awayRows=byTeam(awayId),homeRows=byTeam(homeId);
    const awayPlayerRows=awayRows.filter(row=>rowPlayerId(row)),homePlayerRows=homeRows.filter(row=>rowPlayerId(row));
    const awayTeamGameRows=teamGameRowsFor(game,statistics,awayId),homeTeamGameRows=teamGameRowsFor(game,statistics,homeId);
    const awayGame=gameSideBoxScore(game,'away'),homeGame=gameSideBoxScore(game,'home');
    const awayTeamSummary=mappedTeamSummaryStats(awayTeamGameRows),homeTeamSummary=mappedTeamSummaryStats(homeTeamGameRows);
    const awayAggregate=aggregatePlayerGameStats(awayPlayerRows),homeAggregate=aggregatePlayerGameStats(homePlayerRows);
    const away=combineGameTeamStats(awayTeamSummary,combineGameTeamStats(awayGame,awayAggregate));
    const home=combineGameTeamStats(homeTeamSummary,combineGameTeamStats(homeGame,homeAggregate));
    const populated=[...Object.values(away),...Object.values(home)].filter(v=>v!==null&&v!==undefined&&v!=='').length;
    const model={join:direct.length?'canonical-index':'stage-week-team',source:'canonical-statistics-index',gameIds:[...ids],away,home,totalRows:direct.length,
      awayRows:awayRows.length,homeRows:homeRows.length,awayPlayerRows:awayPlayerRows.length,homePlayerRows:homePlayerRows.length,
      awayTeamGameRows:awayTeamGameRows.length,homeTeamGameRows:homeTeamGameRows.length,populated,
      rawGameFields:Object.entries({...game,...(game.source||{})}).filter(([key])=>/yard|down|turn|pen|poss|offen|rush|pass|red|score|first|third|time/i.test(key))
        .sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${key}=${String(value)}`)
    };
    if(key)matchupTeamStatsCache.set(key,model);
    return model;
  }

  function matchupStatDisplay(value) {
    return value===null||value===undefined||value===''?'—':escapeHtml(String(value));
  }

  function renderMatchupTeamStats(game={}) {
    const key=String(game.id||game.gameId||game.scheduleId||'');
    const model=matchupTeamStatsCache.get(key);
    const away=matchupTeam(game.awayTeamId??game.awayId);
    const home=matchupTeam(game.homeTeamId??game.homeId);
    const status=String(game.status||resolvedGameStatus(game,window.FranchiseHQ?.currentSeasonContext||null)||'').toLowerCase();
    if(!model){
      return `<section class="matchup-tab-panel"><div class="card-body matchup-team-stats-state"><strong>Loading team statistics…</strong><span>Loading current game statistics.</span></div></section>`;
    }
    if(!model.populated){
      const copy=status==='final'
        ? 'The completed game is joined correctly, but this export does not contain any supported box-score or player-game fields for the Team Stats panel.'
        : 'Game-specific team statistics will populate after Madden records statistics for this matchup.';
      return `<section class="matchup-tab-panel"><div class="card-header"><div><span class="eyebrow">Direct game join</span><h3>Team Statistics</h3></div><span class="pill pill--neutral">${model.totalRows} joined records</span></div><div class="card-body matchup-team-stats-state"><strong>${status==='final'?'Statistics fields unavailable':'Upcoming matchup'}</strong><span>${copy}</span></div></section>`;
    }
    const rows=[
      ['Total Offense','totalOffense'],['Passing Yards','passingYards'],['Rushing Yards','rushingYards'],['First Downs','firstDowns'],['Turnovers','turnovers'],['3rd Down','thirdDown'],['Red Zone','redZone'],['Defensive Sacks','defensiveSacks'],['Penalties / Yards','penalties']
    ];
    return `<section class="matchup-tab-panel matchup-team-stats-panel">
      <div class="card-header"><div><span class="eyebrow">Game-specific join · ${model.totalRows + (model.awayTeamGameRows||0) + (model.homeTeamGameRows||0)} records</span><h3>Team Statistics</h3></div><span class="pill pill--success">Game Specific</span></div>
      <div class="matchup-team-stat-board">
        <div class="matchup-team-stat-head"><span>${renderTeamMark(away,'team-logo')}<strong>${escapeHtml(away.abbr||away.fullName)}</strong></span><b>TEAM STATS</b><span><strong>${escapeHtml(home.abbr||home.fullName)}</strong>${renderTeamMark(home,'team-logo')}</span></div>
        ${rows.map(([label,key])=>`<div class="matchup-team-stat-row"><strong>${matchupStatDisplay(model.away[key])}</strong><span>${label}</span><strong>${matchupStatDisplay(model.home[key])}</strong></div>`).join('')}
      </div>
      <div class="matchup-stat-footnote">Team Statistics use Madden's directly joined /team record for the selected game. Player-game aggregation is retained only as a fallback for fields unavailable in the team record.</div>
    </section>`;
  }

  const matchupPlayerGameModelCache={
    sourceRef:null,
    byDirectGame:new Map(),
    byContext:new Map()
  };

  function buildCompactPlayerGameModel(rows=[]) {
    const categoryMap=new Map();

    rows.forEach(row=>{
      const category=matchupPlayerCategory(row);
      if(!MATCHUP_PLAYER_COLUMNS[category])return;

      const playerId=rowPlayerId(row);
      if(!playerId)return;

      const teamId=rowTeamId(row);
      const key=`${category}:${teamId}:${playerId}`;
      let entry=categoryMap.get(key);
      if(!entry){
        entry={category,teamId,playerId,combined:{}};
        categoryMap.set(key,entry);
      }
      Object.assign(entry.combined,row.source||{},row.metrics||{},row);
    });

    const grouped={};
    categoryMap.forEach(entry=>{
      if(!grouped[entry.category])grouped[entry.category]=[];
      grouped[entry.category].push(entry);
    });

    return grouped;
  }

  function rebuildMatchupPlayerGameModelCache(force=false) {
    const rows=playerStatisticsState.rows||[];
    if(!force && matchupPlayerGameModelCache.sourceRef===rows)return matchupPlayerGameModelCache;

    const directBuckets=new Map();
    const contextBuckets=new Map();

    rows.forEach(row=>{
      const raw=statisticRaw(row);
      const direct=statisticDirectGameId(row);

      if(direct){
        const bucket=directBuckets.get(direct)||[];
        bucket.push(row);
        directBuckets.set(direct,bucket);
      }

      const week=Number(row.week??row.weekIndex??raw.week??raw.weekIndex);
      if(!Number.isFinite(week))return;

      const stage=row.stage||raw.stage||raw.seasonStage||'regular';
      const season=Number(row.seasonYear??raw.seasonYear??raw.calendarYear);
      const key=matchupStatContextKey(season,stage,week);
      const bucket=contextBuckets.get(key)||[];
      bucket.push(row);
      contextBuckets.set(key,bucket);

      const anyKey=matchupStatContextKey(null,stage,week);
      if(anyKey!==key){
        const anyBucket=contextBuckets.get(anyKey)||[];
        anyBucket.push(row);
        contextBuckets.set(anyKey,anyBucket);
      }
    });

    const byDirectGame=new Map();
    directBuckets.forEach((rows,key)=>byDirectGame.set(key,buildCompactPlayerGameModel(rows)));

    const byContext=new Map();
    contextBuckets.forEach((rows,key)=>byContext.set(key,buildCompactPlayerGameModel(rows)));

    matchupPlayerGameModelCache.sourceRef=rows;
    matchupPlayerGameModelCache.byDirectGame=byDirectGame;
    matchupPlayerGameModelCache.byContext=byContext;
    return matchupPlayerGameModelCache;
  }

  const matchupCompactModelCache=new Map();

  function matchupCompactGameModel(game={}) {
    const cacheKey=String(game.id||game.gameId||game.scheduleId||'');
    if(cacheKey&&matchupCompactModelCache.has(cacheKey))return matchupCompactModelCache.get(cacheKey);
    const rows=canonicalGameRows(game);
    const categoryMap=new Map();
    rows.forEach(row=>{
      const category=matchupPlayerCategory(row);
      if(!MATCHUP_PLAYER_COLUMNS[category])return;
      const playerId=rowPlayerId(row);if(!playerId)return;
      const teamId=rowTeamId(row),key=`${category}:${teamId}:${playerId}`;
      let entry=categoryMap.get(key);
      if(!entry){entry={category,teamId,playerId,combined:{}};categoryMap.set(key,entry);}
      Object.assign(entry.combined,row.source||{},row.metrics||{},row);
    });
    const grouped={};
    categoryMap.forEach(entry=>{
      if(!grouped[entry.category])grouped[entry.category]=[];
      grouped[entry.category].push(entry);
    });
    if(cacheKey)matchupCompactModelCache.set(cacheKey,grouped);
    return grouped;
  }

  const canonicalStatisticsIndex={sourceRef:null,byGameId:new Map(),byContext:new Map(),byPlayerId:new Map(),byTeamId:new Map(),byCategory:new Map()};

  function canonicalStatContextKey(season,stage,week){
    const year=Number(season),safeYear=Number.isFinite(year)?String(year):'any';
    const text=String(stage||'').toLowerCase();
    const phase=text.includes('pre')?'preseason':text.includes('post')||text.includes('playoff')?'playoffs':'regular';
    return `${safeYear}:${phase}:${Number(week)||0}`;
  }

  function pushStatIndex(map,key,row){
    const safe=String(key??'');if(!safe)return;
    const bucket=map.get(safe)||[];bucket.push(row);map.set(safe,bucket);
  }

  function rebuildCanonicalStatisticsIndex(force=false){
    const rows=playerStatisticsState.rows||[];
    if(!force&&canonicalStatisticsIndex.sourceRef===rows)return canonicalStatisticsIndex;
    const byGameId=new Map(),byContext=new Map(),byPlayerId=new Map(),byTeamId=new Map(),byCategory=new Map();
    rows.forEach(row=>{
      const raw=statisticRaw(row),direct=statisticDirectGameId(row);
      if(direct)pushStatIndex(byGameId,direct,row);
      const playerId=rowPlayerId(row);if(playerId)pushStatIndex(byPlayerId,playerId,row);
      const teamId=rowTeamId(row);if(teamId)pushStatIndex(byTeamId,teamId,row);
      const category=String(row.category||raw.category||raw.statType||raw.type||'').toLowerCase();
      if(category)pushStatIndex(byCategory,category,row);
      const week=Number(row.week??row.weekIndex??raw.week??raw.weekIndex);
      if(Number.isFinite(week)){
        const stage=row.stage||raw.stage||raw.seasonStage||'regular';
        const season=Number(row.seasonYear??raw.seasonYear??raw.calendarYear);
        const exact=canonicalStatContextKey(season,stage,week);pushStatIndex(byContext,exact,row);
        const any=canonicalStatContextKey(null,stage,week);if(any!==exact)pushStatIndex(byContext,any,row);
      }
    });
    Object.assign(canonicalStatisticsIndex,{sourceRef:rows,byGameId,byContext,byPlayerId,byTeamId,byCategory});
    return canonicalStatisticsIndex;
  }

  let canonicalStatisticsIndexPromise=null;

  async function rebuildCanonicalStatisticsIndexCooperative(force=false){
    const rows=playerStatisticsState.rows||[];
    if(!force&&canonicalStatisticsIndex.sourceRef===rows)return canonicalStatisticsIndex;
    if(canonicalStatisticsIndexPromise&&!force)return canonicalStatisticsIndexPromise;

    canonicalStatisticsIndexPromise=(async()=>{
      const byGameId=new Map(),byContext=new Map(),byPlayerId=new Map(),byTeamId=new Map(),byCategory=new Map();
      const chunkSize=250;

      for(let start=0;start<rows.length;start+=chunkSize){
        const end=Math.min(rows.length,start+chunkSize);
        for(let i=start;i<end;i++){
          const row=rows[i];
          const raw=statisticRaw(row),direct=statisticDirectGameId(row);
          if(direct)pushStatIndex(byGameId,direct,row);
          const playerId=rowPlayerId(row);if(playerId)pushStatIndex(byPlayerId,playerId,row);
          const teamId=rowTeamId(row);if(teamId)pushStatIndex(byTeamId,teamId,row);
          const category=String(row.category||raw.category||raw.statType||raw.type||'').toLowerCase();
          if(category)pushStatIndex(byCategory,category,row);
          const week=Number(row.week??row.weekIndex??raw.week??raw.weekIndex);
          if(Number.isFinite(week)){
            const stage=row.stage||raw.stage||raw.seasonStage||'regular';
            const season=Number(row.seasonYear??raw.seasonYear??raw.calendarYear);
            const exact=canonicalStatContextKey(season,stage,week);pushStatIndex(byContext,exact,row);
            const any=canonicalStatContextKey(null,stage,week);if(any!==exact)pushStatIndex(byContext,any,row);
          }
        }

        // Yield to browser between chunks so clicks, scrolling and modal opens
        // are never queued behind statistics indexing.
        if(end<rows.length){
          await new Promise(resolve=>{
            if(typeof scheduler!=='undefined'&&typeof scheduler.yield==='function'){
              scheduler.yield().then(resolve);
            }else{
              setTimeout(resolve,0);
            }
          });
        }
      }

      Object.assign(canonicalStatisticsIndex,{sourceRef:rows,byGameId,byContext,byPlayerId,byTeamId,byCategory});
      return canonicalStatisticsIndex;
    })().finally(()=>{canonicalStatisticsIndexPromise=null;});

    return canonicalStatisticsIndexPromise;
  }


  function canonicalGameRows(game={}){
    const rows=playerStatisticsState.rows||[];
    const index=canonicalStatisticsIndex.sourceRef===rows?canonicalStatisticsIndex:null;

    if(index){
      const directRows=[];
      gameDirectIds(game).forEach(id=>{
        const bucket=index.byGameId.get(String(id));
        if(bucket?.length)directRows.push(...bucket);
      });
      if(directRows.length)return [...new Set(directRows)];

      const context=matchupGameContext(game);
      const year=Number(game.seasonYear??game.calendarYear??game.source?.seasonYear??game.source?.calendarYear??canonicalCurrentSeasonYear());
      return index.byContext.get(canonicalStatContextKey(year,context.phase,context.week))
        ||index.byContext.get(canonicalStatContextKey(null,context.phase,context.week))||[];
    }

    // Rare first-interaction fallback while cooperative index is still building:
    // scan only until direct game matches are found, then return. This preserves
    // responsiveness because it does not build/rebuild global maps.
    const ids=new Set(gameDirectIds(game));
    const direct=[];
    for(const row of rows){
      const directId=statisticDirectGameId(row);
      if(directId&&ids.has(directId))direct.push(row);
    }
    if(direct.length)return direct;

    const context=matchupGameContext(game);
    const year=Number(game.seasonYear??game.calendarYear??game.source?.seasonYear??game.source?.calendarYear??canonicalCurrentSeasonYear());
    return rows.filter(row=>{
      const raw=statisticRaw(row);
      const week=Number(row.week??row.weekIndex??raw.week??raw.weekIndex);
      if(week!==Number(context.week))return false;
      const rowContext=stageWeekContext(raw,week,row.stage||raw.stage||raw.seasonStage);
      const rowYear=Number(row.seasonYear??raw.seasonYear??raw.calendarYear);
      return rowContext.phase===context.phase&&(!Number.isFinite(year)||!Number.isFinite(rowYear)||rowYear===year);
    });
  }

  const matchupPlayerStatIndex={
    sourceRef:null,
    byGameId:new Map(),
    byContext:new Map()
  };

  function matchupStatStageKey(value='regular') {
    const text=String(value||'').toLowerCase();
    if(text.includes('pre'))return 'preseason';
    if(text.includes('post')||text.includes('playoff'))return 'playoffs';
    return 'regular';
  }

  function matchupStatContextKey(season,stage,week) {
    const year=Number(season);
    const safeYear=Number.isFinite(year)?String(year):'any';
    return `${safeYear}:${matchupStatStageKey(stage)}:${Number(week)||0}`;
  }

  function rebuildMatchupPlayerStatIndex(force=false) {
    const rows=playerStatisticsState.rows||[];
    if(!force && matchupPlayerStatIndex.sourceRef===rows) return matchupPlayerStatIndex;

    const byGameId=new Map();
    const byContext=new Map();

    rows.forEach(row=>{
      const raw=statisticRaw(row);
      const direct=statisticDirectGameId(row);
      if(direct){
        const bucket=byGameId.get(direct)||[];
        bucket.push(row);
        byGameId.set(direct,bucket);
      }

      const week=Number(row.week??row.weekIndex??raw.week??raw.weekIndex);
      if(!Number.isFinite(week)) return;

      const stage=row.stage||raw.stage||raw.seasonStage||'regular';
      const season=Number(row.seasonYear??raw.seasonYear??raw.calendarYear);
      const key=matchupStatContextKey(season,stage,week);
      const bucket=byContext.get(key)||[];
      bucket.push(row);
      byContext.set(key,bucket);

      // Also maintain an "any year" key for exports that omit a season year.
      const anyKey=matchupStatContextKey(null,stage,week);
      if(anyKey!==key){
        const anyBucket=byContext.get(anyKey)||[];
        anyBucket.push(row);
        byContext.set(anyKey,anyBucket);
      }
    });

    matchupPlayerStatIndex.sourceRef=rows;
    matchupPlayerStatIndex.byGameId=byGameId;
    matchupPlayerStatIndex.byContext=byContext;
    return matchupPlayerStatIndex;
  }

  function matchupPlayerRows(game={}) {
    return canonicalGameRows(game);
  }

  function matchupPlayerIdentity(playerId='') {
    const id=String(playerId||'');

    // O(1) lookup first. The prior order called rosterService.findPlayer()
    // for every row, which can scan the entire roster repeatedly.
    const player=
      liveRosterPlayers.get(id)
      ||(liveTeamDirectory?.players||[]).find(item=>String(item.id||item.playerId)===id)
      ||(liveTeamDirectory?.snapshot?null:rosterService()?.findPlayer?.(id));

    if(!player)return {id,name:liveTeamDirectory?.snapshot?`Historical player ${id}`:`Player ${id}`,position:'',teamId:'',sourceState:'unavailable'};

    const view=rosterPlayerView(player);
    return {
      id,
      name:view?.name||player.name||player.fullName||`${player.firstName||''} ${player.lastName||''}`.trim()||`Player ${id}`,
      position:String(view?.position||player.position||'').toUpperCase(),
      teamId:String(view?.teamId||player.teamId||'')
    };
  }

  function matchupPlayerMetric(row,aliases=[],fallback='—') {
    const value=metricValue(row,aliases);
    return value===null||value===undefined||value===''?fallback:value;
  }

  function matchupPlayerCategory(row={}) {
    const raw=statisticRaw(row);
    const explicit=String(row.category||raw.category||raw.statType||raw.type||'').toLowerCase();
    for(const category of ['passing','rushing','receiving','defense','kicking','punting']){
      if(explicit.includes(category))return category;
    }
    return explicit;
  }

  const MATCHUP_PLAYER_COLUMNS={
    passing:[['CMP',['passComp']],['ATT',['passAtt']],['CMP%',['passCompPct']],['YDS',['passYds','passYards']],['TD',['passTDs']],['INT',['passInts']],['Y/A',['passYdsPerAtt']],['RTG',['passRating']],['LONG',['passLongest']],['SACK',['passSacks']]],
    rushing:[['ATT',['rushAtt']],['YDS',['rushYds','rushYards']],['TD',['rushTDs']],['Y/A',['rushYdsPerAtt']],['FUM',['rushFum']],['YACON',['rushYdsAfterContact']],['20+',['rush20PlusYds']],['LONG',['rushLongest']],['BTK',['rushBrokenTackles']]],
    receiving:[['REC',['recCatches']],['YDS',['recYards','recYds']],['TD',['recTDs']],['DROP',['recDrops']],['YAC',['recYdsAfterCatch','recYdsAfterCatc']],['Y/R',['recYdsPerCatch']],['LONG',['recLongest']]],
    defense:[['TKL',['defTotalTackles']],['SACK',['defSacks']],['INT',['defInts']],['FF',['defForcedFum']],['FR',['defFumRec']],['DEF',['defDeflections']],['INT YDS',['defIntReturnYds']],['TD',['defTDs']]],
    kicking:[['FGA',['fGAtt']],['FGM',['fGMade']],['FG%',['fGCompPct']],['50+ ATT',['fG50PlusAtt']],['50+ MADE',['fG50PlusMade']],['XPA',['xPAtt']],['XPM',['xPMade']],['LONG',['fGLongest']],['PTS',['kickPts']]],
    punting:[['PUNTS',['puntAtt']],['NET Y/P',['puntNetYdsPerAtt']],['IN20',['puntsIn20']],['TB',['puntTBs']],['LONG',['puntLongest']]]
  };

  function renderCompactMatchupPlayerCategory(title,category,entries=[],awayId='',homeId='') {
    const columns=MATCHUP_PLAYER_COLUMNS[category]||[];
    const players=(entries||[]).map(entry=>{
      const identity=matchupPlayerIdentity(entry.playerId);
      return {identity,teamId:String(entry.teamId||identity.teamId||''),combined:entry.combined||{}};
    }).filter(item=>item.teamId===String(awayId)||item.teamId===String(homeId));

    const sortMetricByCategory={
      passing:['passYds','passYards'],
      rushing:['rushAtt'],
      receiving:['recCatches'],
      defense:['defTotalTackles']
    };
    const sortAliases=sortMetricByCategory[category]||[];
    if(sortAliases.length){
      players.sort((a,b)=>{
        const av=Number(matchupPlayerMetric(a.combined,sortAliases,0))||0;
        const bv=Number(matchupPlayerMetric(b.combined,sortAliases,0))||0;
        return bv-av||String(a.identity.name).localeCompare(String(b.identity.name));
      });
    }

    if(!players.length)return '';

    const sideTable=(teamId,label)=>{
      const side=players.filter(item=>String(item.teamId)===String(teamId));
      if(!side.length)return `<div class="matchup-player-side"><h4>${escapeHtml(label)}</h4><div class="matchup-player-empty">No ${escapeHtml(title.toLowerCase())} records.</div></div>`;

      return `<div class="matchup-player-side"><h4>${escapeHtml(label)}</h4><div class="matchup-player-table-wrap"><table class="matchup-player-table">
        <thead><tr><th>Player</th>${columns.map(([name])=>`<th>${escapeHtml(name)}</th>`).join('')}</tr></thead>
        <tbody>${side.map(item=>`<tr>
          <td><button type="button" class="matchup-player-link" data-roster-player-detail="${escapeHtml(item.identity.id)}">${escapeHtml(item.identity.name)}</button><small>${escapeHtml(item.identity.position)}</small></td>
          ${columns.map(([,aliases])=>`<td>${escapeHtml(matchupPlayerMetric(item.combined,aliases,'0'))}</td>`).join('')}
        </tr>`).join('')}</tbody>
      </table></div></div>`;
    };

    const away=matchupTeam(awayId),home=matchupTeam(homeId);
    return `<section class="matchup-player-category">
      <div class="matchup-player-category__head"><h4>${escapeHtml(title)}</h4></div>
      <div class="matchup-player-sides">
        ${sideTable(awayId,away.abbr||away.fullName||'Away')}
        ${sideTable(homeId,home.abbr||home.fullName||'Home')}
      </div>
    </section>`;
  }

  function renderMatchupPlayerCategory(title,category,rows,awayId,homeId) {
    const columns=MATCHUP_PLAYER_COLUMNS[category]||[];
    const merged=new Map();

    rows.forEach(row=>{
      const playerId=rowPlayerId(row);
      if(!playerId)return;
      const key=`${playerId}:${category}`;
      const existing=merged.get(key);
      if(!existing){
        merged.set(key,{playerId,rows:[row]});
      }else{
        existing.rows.push(row);
      }
    });

    const players=[...merged.values()].map(entry=>{
      const identity=matchupPlayerIdentity(entry.playerId);
      const combined=mergeTeamStatisticRows(entry.rows);
      const teamId=rowTeamId(entry.rows[0])||identity.teamId;
      return {identity,teamId,combined};
    }).filter(item=>item.teamId===String(awayId)||item.teamId===String(homeId));

    const sortMetricByCategory={
      passing:['passYds','passingYards','passYards','yards'],
      rushing:['rushAtt','rushingAttempts','carries','attempts'],
      receiving:['recCatches','receptions','catches','rec'],
      defense:['defTotalTackles','totalTackles','tackles','tacklesTotal']
    };
    const sortAliases=sortMetricByCategory[category]||[];
    if(sortAliases.length){
      players.sort((a,b)=>{
        const av=Number(matchupPlayerMetric(a.combined,sortAliases,0))||0;
        const bv=Number(matchupPlayerMetric(b.combined,sortAliases,0))||0;
        return bv-av||String(a.identity.name).localeCompare(String(b.identity.name));
      });
    }

    if(!players.length)return '';

    const sideTable=(teamId,label)=>{
      const side=players.filter(item=>String(item.teamId)===String(teamId));
      if(!side.length)return `<div class="matchup-player-side"><h4>${escapeHtml(label)}</h4><div class="matchup-player-empty">No ${escapeHtml(title.toLowerCase())} records.</div></div>`;
      return `<div class="matchup-player-side"><h4>${escapeHtml(label)}</h4><div class="matchup-player-table-wrap"><table class="matchup-player-table">
        <thead><tr><th>Player</th>${columns.map(([name])=>`<th>${escapeHtml(name)}</th>`).join('')}</tr></thead>
        <tbody>${side.map(item=>`<tr>
          <td><button type="button" class="matchup-player-link" data-roster-player-detail="${escapeHtml(item.identity.id)}">${escapeHtml(item.identity.name)}</button><small>${escapeHtml(item.identity.position)}</small></td>
          ${columns.map(([,aliases])=>`<td>${escapeHtml(matchupPlayerMetric(item.combined,aliases,'0'))}</td>`).join('')}
        </tr>`).join('')}</tbody>
      </table></div></div>`;
    };

    const away=matchupTeam(awayId),home=matchupTeam(homeId);
    return `<section class="matchup-player-category">
      <div class="matchup-player-category__head"><h4>${escapeHtml(title)}</h4></div>
      <div class="matchup-player-sides">
        ${sideTable(awayId,away.abbr||away.fullName||'Away')}
        ${sideTable(homeId,home.abbr||home.fullName||'Home')}
      </div>
    </section>`;
  }

  function renderMatchupPlayerStats(game={}) {
    const status=game.status||resolvedGameStatus(game,window.FranchiseHQ?.currentSeasonContext||null);

    if(status!=='final'){
      return `<section class="matchup-tab-panel"><div class="card-header"><div><span class="eyebrow">Game-specific player data</span><h3>Player Statistics</h3></div></div><div class="card-body matchup-player-empty"><strong>Upcoming matchup</strong><span>Player box-score statistics will populate after this game is completed and imported.</span></div></section>`;
    }

    if(!playerStatisticsState.loaded){
      return `<section class="matchup-tab-panel"><div class="card-body matchup-player-loading"><span class="spinner"></span><strong>Loading player box score…</strong></div></section>`;
    }

    const model=matchupCompactGameModel(game);
    const awayId=String(game.awayTeamId??game.awayId??game.source?.awayTeamId??'');
    const homeId=String(game.homeTeamId??game.homeId??game.source?.homeTeamId??'');

    const categories=[
      ['Passing','passing'],
      ['Rushing','rushing'],
      ['Receiving','receiving'],
      ['Defense','defense'],
      ['Kicking','kicking'],
      ['Punting','punting']
    ];

    const sections=categories.map(([title,category])=>
      renderCompactMatchupPlayerCategory(title,category,model[category]||[],awayId,homeId)
    ).filter(Boolean).join('');

    if(!sections){
      return `<section class="matchup-tab-panel"><div class="card-header"><div><span class="eyebrow">Direct game join</span><h3>Player Statistics</h3></div><span class="pill pill--neutral">0 joined records</span></div><div class="card-body matchup-player-empty"><strong>Player box score unavailable</strong><span>No game-specific player-stat records were joined to this completed game. Season totals are not substituted.</span></div></section>`;
    }

    const joinedCount=Object.values(model).reduce((sum,entries)=>sum+(entries?.length||0),0);

    return `<section class="matchup-tab-panel matchup-player-stats-panel">
      <div class="card-header"><div><span class="eyebrow">Game-specific box score</span><h3>Player Statistics</h3></div><span class="pill pill--success">${joinedCount} joined players</span></div>
      <div class="matchup-player-stat-stack">${sections}</div>
      <div class="matchup-stat-footnote">Player Statistics use game-specific Madden records only. Click any player name to open the live Player Card.</div>
    </section>`;
  }

  const matchupPanelCache=new Map();

  function matchupPanelCacheKey(game={},tab='team') {
    return `${String(game.id||game.gameId||game.scheduleId||'')}:${tab}`;
  }

  function clearMatchupPanelCache(game={}) {
    const prefix=`${String(game.id||game.gameId||game.scheduleId||'')}:`;
    [...matchupPanelCache.keys()].forEach(key=>{
      if(key.startsWith(prefix)) matchupPanelCache.delete(key);
    });
  }

  function buildMatchupPanel(tab,game={}) {
    if(tab==='team') return renderMatchupTeamStats(game);
    if(tab==='player') return renderMatchupPlayerStats(game);
    if(tab==='advanced') {
      return `<section class="matchup-tab-panel"><div class="card-header"><div><span class="eyebrow">Verified calculations</span><h3>Advanced Statistics</h3></div></div><div class="card-body"><p>Advanced Statistics integration follows player-stat certification.</p></div></section>`;
    }
    return renderMatchupTeamStats(game);
  }

  function cachedMatchupPanel(tab,game={}) {
    const key=matchupPanelCacheKey(game,tab);
    if(matchupPanelCache.has(key)) return matchupPanelCache.get(key);
    const html=buildMatchupPanel(tab,game);
    matchupPanelCache.set(key,html);
    return html;
  }

  function warmMatchupPanels(game={}) {
    // Only cache the trivial Advanced panel. Player Stats now uses the indexed
    // statistics lookup and renders quickly on its first click.
    const key=matchupPanelCacheKey(game,'advanced');
    if(!matchupPanelCache.has(key)){
      matchupPanelCache.set(key,buildMatchupPanel('advanced',game));
    }
  }

  function findCachedMatchupGame(gameId=''){
    const key=String(gameId||'');
    return liveMatchupGames.get(key)||liveTeamDirectory?.games?.find(game=>String(game.id||game.gameId||game.scheduleId||'')===key)||null;
  }

  function prepareMatchupRuntime(game={}){
    const teamKey=matchupPanelCacheKey(game,'team');
    const playerKey=matchupPanelCacheKey(game,'player');
    const gameKey=String(game.id||game.gameId||game.scheduleId||'');

    if(!matchupPanelCache.has(teamKey)){
      const start=performance.now();
      matchupPanelCache.set(teamKey,buildMatchupPanel('team',game));
      console.info(`[Matchup PanelBuild] ${gameKey} Team ${(performance.now()-start).toFixed(1)}ms`);
    }

    if(!matchupPanelCache.has(playerKey)){
      const start=performance.now();
      matchupPanelCache.set(playerKey,buildMatchupPanel('player',game));
      console.info(`[Matchup PanelBuild] ${gameKey} Player ${(performance.now()-start).toFixed(1)}ms`);
    }
  }

  function matchupTabPanel(tab) {
    return cachedMatchupPanel(tab,activeMatchupGame||{});
  }

  function matchupGameContext(game={}) {
    const source=game.source||{};
    return stageWeekContext(source,game.week,game.stage||game.phase);
  }

  function previousCapturedMatchup(teamId,currentGame={}) {
    const current=matchupGameContext(currentGame);
    const phaseOrder={preseason:0,regular:1,playoffs:2};
    const games=[...liveMatchupGames.values(),...(liveTeamDirectory?.games||[])]
      .filter((game,index,array)=>array.findIndex(item=>String(item.id)===String(game.id))===index)
      .filter(game=>{
        const home=String(game.homeTeamId??game.homeId??'');
        const away=String(game.awayTeamId??game.awayId??'');
        if(home!==String(teamId)&&away!==String(teamId)) return false;
        if(String(game.id)===String(currentGame.id)) return false;
        const candidate=matchupGameContext(game);
        return phaseOrder[candidate.phase]<phaseOrder[current.phase]
          || (candidate.phase===current.phase&&Number(candidate.week)<Number(current.week));
      })
      .sort((a,b)=>{
        const ac=matchupGameContext(a),bc=matchupGameContext(b);
        return phaseOrder[bc.phase]-phaseOrder[ac.phase]||Number(bc.week)-Number(ac.week);
      });
    return games[0]||null;
  }

  function previousMatchupMarkup(teamId,currentGame) {
    const previous=previousCapturedMatchup(teamId,currentGame);
    if(!previous) return `<div class="matchup-previous matchup-previous--empty"><span>Previous matchup</span><strong>No captured result</strong></div>`;
    const homeId=String(previous.homeTeamId??previous.homeId??'');
    const awayId=String(previous.awayTeamId??previous.awayId??'');
    const opponentId=homeId===String(teamId)?awayId:homeId;
    const opponent=matchupTeam(opponentId);
    const status=previous.status||resolvedGameStatus(previous,window.FranchiseHQ?.currentSeasonContext||null);
    const teamScore=homeId===String(teamId)?(previous.homeScore??resolvedGameScore(previous,'home')):(previous.awayScore??resolvedGameScore(previous,'away'));
    const oppScore=homeId===String(teamId)?(previous.awayScore??resolvedGameScore(previous,'away')):(previous.homeScore??resolvedGameScore(previous,'home'));
    const result=status==='final'&&teamScore!==null&&oppScore!==null
      ? `${teamScore>oppScore?'W':'L'} ${teamScore}-${oppScore}`
      : status==='live'?'Live':'Scheduled';
    return `<button type="button" class="matchup-previous" data-previous-game-id="${escapeHtml(previous.id||'')}">
      <span>Previous matchup</span>
      <strong>${escapeHtml(canonicalScheduleLabel(previous))} · ${escapeHtml(opponent.abbr||opponent.fullName)}</strong>
      <small>${escapeHtml(result)}</small>
    </button>`;
  }

  async function hydrateMatchupRegistry() {
    const directory=window.dispatchEvent(new CustomEvent('franchisehq:league-data-state-changed'));
      try{window.FranchiseHQ?.transactionUiLoader?.clear?.()}catch{}
    if(!directory) throw new Error('The team directory is unavailable.');

    const current=window.FranchiseHQ?.currentSeasonContext||null;
    const normalized=(directory.games||[]).map(game=>liveGameShape(game,directory.teamMap,current));

    normalized.forEach(game=>liveMatchupGames.set(String(game.id||''),game));
    (directory.teams||[]).forEach(team=>liveMatchupTeams.set(String(team.id),team));
    directory.games=normalized;

    return normalized;
  }

  async function resolveMatchupGame(gameId) {
    let game=liveMatchupGames.get(String(gameId))
      || liveTeamDirectory?.games?.find(item=>String(item.id)===String(gameId));

    if(game) return game;

    const games=await hydrateMatchupRegistry();
    game=games.find(item=>{
      const source=item.source||{};
      return String(item.id)===String(gameId)
        || String(source.gameId||'')===String(gameId)
        || String(source.scheduleId||'')===String(gameId);
    });

    return game||null;
  }

  const matchupColdDiagnostics=new Map();

  async function openMatchupCard(gameId){
    const gameIdText=String(gameId||'');
    const openCount=(matchupColdDiagnostics.get(gameIdText)||0)+1;
    matchupColdDiagnostics.set(gameIdText,openCount);
    const t0=performance.now();

    const log=(label,start,end=performance.now())=>{
      console.info(`[Matchup ColdRender] ${gameIdText} open#${openCount} ${label} ${(end-start).toFixed(1)}ms`);
    };

    const lookupStart=performance.now();
    let game=findCachedMatchupGame(gameIdText);
    log('game lookup',lookupStart);

    if(!game){
      const placeholderStart=performance.now();
      openDetail(`<div class="matchup-modal matchup-modal--gotw matchup-modal--instant" data-matchup-modal><div class="matchup-instant-placeholder"><span class="spinner"></span><strong>Opening matchup…</strong></div></div>`);
      log('placeholder openDetail',placeholderStart);

      const dirStart=performance.now();
      try{
        await loadLiveTeamDirectory(false);
        log('loadLiveTeamDirectory wait',dirStart);
        game=findCachedMatchupGame(gameIdText);
        if(!game)throw new Error('Selected game is unavailable.');
      }catch(error){
        console.error('[Matchup Card]',error);
        showToast('Matchup unavailable',error?.message||'The schedule could not be loaded.');
        return;
      }
    }

    activeMatchupGame=game;

    const identityStart=performance.now();
    const awayTeamId=String(game.awayTeamId??game.awayId??game.source?.awayTeamId??''),
          homeTeamId=String(game.homeTeamId??game.homeId??game.source?.homeTeamId??'');
    const away=matchupTeam(awayTeamId),home=matchupTeam(homeTeamId);
    const status=game.status||resolvedGameStatus(game,window.FranchiseHQ?.currentSeasonContext||null);
    const awayScore=game.awayScore??resolvedGameScore(game,'away'),
          homeScore=game.homeScore??resolvedGameScore(game,'home');
    const score=(awayScore!==null&&homeScore!==null)?`${awayScore} – ${homeScore}`:(status==='final'?'Score unavailable':'Upcoming');
    log('team identity + score prep',identityStart);

    const panelStart=performance.now();
    const teamKey=matchupPanelCacheKey(game,'team');
    const initialPanel=matchupPanelCache.get(teamKey)||`<section class="matchup-tab-panel matchup-tab-panel--loading"><div class="matchup-instant-loading"><span class="spinner"></span><strong>Loading matchup statistics…</strong></div></section>`;
    log('initial Team Stats panel lookup',panelStart);

    const logoStart=performance.now();
    const awayLogoMarkup=renderTeamMark(away,'matchup-team-logo');
    const homeLogoMarkup=renderTeamMark(home,'matchup-team-logo');
    log('team logo markup',logoStart);

    const domStart=performance.now();
    openDetail(`<div class="matchup-modal matchup-modal--gotw matchup-modal--instant" data-matchup-modal data-matchup-shell="${escapeHtml(gameIdText)}">
      <div class="matchup-modal__header"><span class="eyebrow matchup-modal__week">${escapeHtml(canonicalScheduleLabel(game))}</span>
      <span class="pill matchup-modal__status ${status==='final'?'pill--neutral':status==='live'?'pill--danger':'pill--accent'}">${status==='final'?'Final':status==='live'?'Live':'Upcoming'}</span></div>
      <div class="matchup-gotw-board">
        <section class="matchup-gotw-half matchup-gotw-half--away team-gradient-card" style="--team-primary:${away.primary};--team-secondary:${away.secondary||away.primary}">
          <div class="matchup-gotw-identity">${awayLogoMarkup}<div><span class="eyebrow">${escapeHtml(away.city||away.abbr||'Away')}</span><h2>${escapeHtml(away.fullName)}</h2><p>${escapeHtml(away.record||'—')} · Owner: ${escapeHtml(away.owner||'Unassigned')}</p></div></div>
          <div class="matchup-previous-shell" data-matchup-previous="away"></div></section>
        <div class="matchup-gotw-center"><span>${escapeHtml(canonicalScheduleLabel(game))}</span><strong>${escapeHtml(score)}</strong><small data-matchup-meta></small></div>
        <section class="matchup-gotw-half matchup-gotw-half--home team-gradient-card team-gradient-card--home" style="--team-primary:${home.primary};--team-secondary:${home.secondary||home.primary}">
          <div class="matchup-gotw-identity matchup-gotw-identity--home"><div><span class="eyebrow">${escapeHtml(home.city||home.abbr||'Home')}</span><h2>${escapeHtml(home.fullName)}</h2><p>${escapeHtml(home.record||'—')} · Owner: ${escapeHtml(home.owner||'Unassigned')}</p></div>${homeLogoMarkup}</div>
          <div class="matchup-previous-shell" data-matchup-previous="home"></div></section>
      </div>
      <div class="matchup-stat-tabs" role="tablist" aria-label="Matchup statistics">
        <button type="button" class="is-active" data-matchup-tab="team" role="tab" aria-selected="true">Team Stats</button>
        <button type="button" data-matchup-tab="player" role="tab" aria-selected="false">Player Stats</button>
      </div>
      <div class="matchup-tab-content" data-matchup-tab-content>${initialPanel}</div>
    </div>`);
    const domEnd=performance.now();
    log('openDetail DOM insertion',domStart,domEnd);
    console.info(`[Matchup ColdRender] ${gameIdText} open#${openCount} handler→DOM total ${(domEnd-t0).toFixed(1)}ms`);

    requestAnimationFrame(()=>{
      const frame1=performance.now();
      log('DOM→frame1',domEnd,frame1);

      requestAnimationFrame(()=>{
        const frame2=performance.now();
        log('frame1→frame2',frame1,frame2);
        console.info(`[Matchup ColdRender] ${gameIdText} open#${openCount} handler→frame2 TOTAL ${(frame2-t0).toFixed(1)}ms`);
      });

      const modal=document.querySelector('[data-matchup-shell="'+CSS.escape(gameIdText)+'"]');if(!modal)return;

      try{
        const metaStart=performance.now();
        const meta=gameMetadata(game),info=[meta.dayLabel,meta.timeLabel,meta.stadium].filter(Boolean).join(' · ');
        const metaTarget=modal.querySelector('[data-matchup-meta]');if(metaTarget)metaTarget.textContent=info||(status==='final'?'Final':'Scheduled');
        log('metadata',metaStart);

        const prevStart=performance.now();
        const awayPrev=modal.querySelector('[data-matchup-previous="away"]'),
              homePrev=modal.querySelector('[data-matchup-previous="home"]');
        if(awayPrev)awayPrev.outerHTML=previousMatchupMarkup(away.id,game);
        if(homePrev)homePrev.outerHTML=previousMatchupMarkup(home.id,game);
        log('previous matchup render',prevStart);
      }catch(error){console.warn('[Matchup Header Enrichment]',error);}

      const statsStart=performance.now();
      Promise.resolve(hydrateMatchupTeamStatistics(game)).then(()=>{
        const statsEnd=performance.now();
        log('team stats hydrate',statsStart,statsEnd);

        const runtimeStart=performance.now();
        prepareMatchupRuntime(game);
        const runtimeEnd=performance.now();
        log('panel build/cache',runtimeStart,runtimeEnd);

        const liveModal=document.querySelector('[data-matchup-shell="'+CSS.escape(gameIdText)+'"]');if(!liveModal)return;
        const activeTab=liveModal.querySelector('[data-matchup-tab].is-active')?.dataset.matchupTab||'team';
        const target=liveModal.querySelector('[data-matchup-tab-content]'),key=matchupPanelCacheKey(game,activeTab);

        const swapStart=performance.now();
        if(target&&matchupPanelCache.has(key))target.innerHTML=matchupPanelCache.get(key);
        const swapEnd=performance.now();
        log('active panel DOM swap',swapStart,swapEnd);
        console.info(`[Matchup ColdRender] ${gameIdText} open#${openCount} COMPLETE async work ${(swapEnd-t0).toFixed(1)}ms`);
      });
    });
  }

  let scheduleMatchupPreloadPromise=null;
  function preloadScheduleMatchupData(){
    if(scheduleMatchupPreloadPromise)return scheduleMatchupPreloadPromise;
    scheduleMatchupPreloadPromise=Promise.all([loadLiveTeamDirectory(false),hydratePlayerStatistics(false)])
      .catch(error=>console.warn('[Schedule Preload]',error))
      .finally(()=>{scheduleMatchupPreloadPromise=null;});
    return scheduleMatchupPreloadPromise;
  }

  if(typeof requestIdleCallback==='function'){
    requestIdleCallback(()=>{preloadScheduleMatchupData();},{timeout:650});
  }else{
    setTimeout(()=>{preloadScheduleMatchupData();},120);
  }

  function liveTeamScheduleGame(game={}) {
    const source=game.source||{};
    const context=stageWeekContext(source,game.week,game.stage);
    const phase=context.phase;
    const metadata=gameMetadata(game);
    const normalized={
      id:String(game.id||source.gameId||''),
      phase,
      phaseLabel:context.label,
      week:context.week,
      awayId:String(game.awayTeamId??source.awayTeamId??''),
      homeId:String(game.homeTeamId??source.homeTeamId??''),
      awayScore:resolvedGameScore(game,'away'),
      homeScore:resolvedGameScore(game,'home'),
      status:resolvedGameStatus(game,window.FranchiseHQ?.currentSeasonContext||null),
      day:metadata.dayLabel,
      time:metadata.timeLabel,
      network:metadata.network||'',
      stadium:metadata.stadium||'',
      metadata,
      source,
      round:source.roundName||source.playoffRound||context.round||null
    };
    liveMatchupGames.set(String(normalized.id),normalized);
    return normalized;
  }


  function buildExtendedTeamSchedule(team, existingGames) {
    const sorted=[...existingGames].sort((a,b)=>{
      const order={preseason:0,regular:1,playoffs:2};
      return (order[a.phase]-order[b.phase])||(Number(a.week)-Number(b.week));
    });
    return {
      preseason:sorted.filter(game=>game.phase==='preseason'),
      regular:sorted.filter(game=>game.phase==='regular'),
      playoffs:sorted.filter(game=>game.phase==='playoffs')
    };
  }

  function renderTeamScheduleCard(game, teamId) {
    const opponentId=game.homeId===teamId?game.awayId:game.homeId;
    const opponent = rosterTeamView(opponentId) || {id:opponentId,abbr:'TBD',fullName:'Unavailable opponent',primary:null,secondary:null,sourceState:'unavailable'};
    const home = game.homeId===teamId;
    const final = game.status==='final';
    const live = game.status==='live';
    const teamScore = home?game.homeScore:game.awayScore;
    const oppScore = home?game.awayScore:game.homeScore;
    const result = final ? `${teamScore>oppScore?'W':'L'} ${teamScore}-${oppScore}` : live ? `LIVE ${teamScore}-${oppScore}` : `${home?'vs':'@'} ${opponent.abbr}`;
    return `<button type="button" class="team-schedule-card ${final?'is-final':live?'is-live':'is-upcoming'}" data-game-id="${escapeHtml(game.id)}"><span class="team-schedule-card__week">${canonicalScheduleLabel(game)}</span><div class="team-schedule-card__matchup">${renderTeamMark(opponent,'mini-team')}<div><strong>${home?'vs':'@'} ${escapeHtml(opponent.fullName)}</strong>${[game.day,game.time,game.network].filter(Boolean).length?`<small>${[game.day,game.time,game.network].filter(Boolean).map(escapeHtml).join(' · ')}</small>`:''}</div></div><div class="team-schedule-card__result"><strong>${escapeHtml(result)}</strong><small>${final?'Final':live?'In Progress':'Upcoming'}</small></div></button>`;
  }

  function renderTeamSchedule(team, teamGames) {
    const scheduleByPhase=buildExtendedTeamSchedule(team,teamGames);
    const availablePhases=['preseason','regular','playoffs'].filter(phase=>scheduleByPhase[phase].length);
    if(!availablePhases.includes(state.teamSchedulePhase)) state.teamSchedulePhase=availablePhases.includes('regular')?'regular':availablePhases[0]||'regular';
    const selected=scheduleByPhase[state.teamSchedulePhase] || [];
    return `<div class="team-schedule-view"><div class="filter-bar team-schedule-filters"><div class="segmented-tabs">${availablePhases.map(phase=>`<button type="button" data-team-schedule-phase="${phase}" class="${state.teamSchedulePhase===phase?'is-active':''}">${phase==='preseason'?'Preseason':phase==='regular'?'Regular Season':'Playoffs'}</button>`).join('')}</div><span class="result-count">${selected.length} game${selected.length===1?'':'s'}</span></div><div class="team-schedule-list">${selected.map(game=>renderTeamScheduleCard(game,team.id)).join('') || `<article class="card roadmap-state"><div class="roadmap-state__inner"><h3>No playoff schedule yet</h3><p>Playoff games appear only after the league advances beyond the regular season.</p></div></article>`}</div></div>`;
  }

  function teamStatTable(title, players, columns, emptyMessage) {
    return `<article class="card team-stat-section"><div class="card-header"><div><span class="eyebrow">Position-specific production</span><h3>${title}</h3></div><span class="pill pill--neutral">${players.length} player${players.length===1?'':'s'}</span></div><div class="table-wrap"><table class="team-stat-table"><thead><tr><th>Player</th>${columns.map(column=>`<th>${column.label}</th>`).join('')}</tr></thead><tbody>${players.length?players.map(player=>`<tr class="clickable-row" data-roster-player-detail="${escapeHtml(player.id)}"><td><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.position)}</small></td>${columns.map(column=>`<td>${column.format?column.format(player.stats?.[column.key],player):escapeHtml(String(player.stats?.[column.key] ?? '—'))}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${columns.length+1}">${emptyMessage}</td></tr>`}</tbody></table></div></article>`;
  }

  function canonicalTeamStatsRows(team={}) {
    const aliases=canonicalTeamIdAliases(team?.id||team?.liveTeamId||'');
    const currentYear=Number(canonicalCurrentSeasonYear());
    return (playerStatisticsState.rows||[]).filter(row=>{
      const raw=statisticRaw(row);
      const rowTeam=String(rowTeamId(row)||'');
      if(!canonicalTeamIdentityMatches(rowTeam,aliases))return false;
      const stage=canonicalNormalizeStage(row.stage||raw.stage||raw.seasonStage);
      if(stage!=='regular-season')return false;
      const year=Number(row.seasonYear??row.season??raw.seasonYear??raw.season_year??raw.calendarYear);
      if(Number.isFinite(currentYear)&&Number.isFinite(year)&&year!==currentYear)return false;
      return Boolean(rowPlayerId(row));
    });
  }

  function canonicalTeamPlayerTotals(team={},category='') {
    const rows=canonicalTeamStatsRows(team).filter(row=>matchupPlayerCategory(row)===category);
    const grouped=new Map();

    rows.forEach(row=>{
      const playerId=String(rowPlayerId(row)||'');
      if(!playerId)return;
      if(!grouped.has(playerId))grouped.set(playerId,[]);
      grouped.get(playerId).push(row);
    });

    const canonicalToTeamKeys=(category,totals,playerRows)=>{
      const games=new Set(playerRows.map(row=>{
        const raw=statisticRaw(row);
        return `${canonicalNormalizeStage(row.stage||raw.stage||raw.seasonStage)}:${Number(row.week??row.weekIndex??raw.week??raw.weekIndex)||0}`;
      })).size;

      const n=value=>{
        const number=Number(value);
        return Number.isFinite(number)?number:0;
      };

      if(category==='passing'){
        return {
          games,
          completions:n(totals.CMP),
          attempts:n(totals.ATT),
          compPct:n(totals['CMP%']),
          passingYards:n(totals.YDS),
          passingTD:n(totals.TD),
          interceptions:n(totals.INT),
          yardsPerAttempt:n(totals['Y/A']),
          passerRating:n(totals.RTG)
        };
      }

      if(category==='rushing'){
        return {
          games,
          carries:n(totals.ATT),
          rushingYards:n(totals.YDS),
          rushingTD:n(totals.TD),
          yardsPerCarry:n(totals['Y/A']),
          fumbles:n(totals.FUM),
          longRush:n(totals.LONG)
        };
      }

      if(category==='receiving'){
        const targets=playerStatSum(playerRows,['recTargets','targets','receivingTargets']);
        return {
          games,
          targets:n(targets),
          receptions:n(totals.REC),
          receivingYards:n(totals.YDS),
          receivingTD:n(totals.TD),
          yardsPerCatch:n(totals['Y/R']),
          drops:n(totals.DROP),
          longReception:n(totals.LONG)
        };
      }

      if(category==='defense'){
        const tfl=playerStatSum(playerRows,['defTacklesForLoss','tacklesForLoss','tfl']);
        return {
          games,
          tackles:n(totals.TKL),
          tacklesForLoss:n(tfl),
          sacks:n(totals.SACK),
          defensiveInterceptions:n(totals.INT),
          passDeflections:n(totals.DEF),
          forcedFumbles:n(totals.FF),
          fumbleRecoveries:n(totals.FR),
          defensiveTD:n(totals.TD)
        };
      }

      if(category==='kicking'){
        return {
          games,
          fgm:n(totals.FGM),
          fga:n(totals.FGA),
          fgPct:n(totals['FG%']),
          longFieldGoal:n(totals.LONG),
          xpm:n(totals.XPM),
          xpa:n(totals.XPA),
          points:n(totals.PTS)
        };
      }

      if(category==='punting'){
        const puntYards=playerStatSum(playerRows,['puntYds','puntYards']);
        const punts=n(totals.PUNTS);
        return {
          games,
          punts,
          average:punts&&Number.isFinite(Number(puntYards))?Number(puntYards)/punts:n(totals['NET Y/P']),
          netAverage:n(totals['NET Y/P']),
          inside20:n(totals.IN20),
          touchbacks:n(totals.TB),
          longPunt:n(totals.LONG)
        };
      }

      return {games};
    };

    return [...grouped.entries()].map(([playerId,playerRows])=>{
      const identity=matchupPlayerIdentity(playerId);
      const canonicalTotals=playerStatCategoryTotals(playerRows,category)||{};
      const stats=canonicalToTeamKeys(category,canonicalTotals,playerRows);

      return {
        id:playerId,
        name:identity?.name||`Player ${playerId}`,
        position:identity?.position||'',
        stats
      };
    }).sort((x,y)=>{
      const key=({
        passing:'passingYards',
        rushing:'rushingYards',
        receiving:'receivingYards',
        defense:'tackles',
        kicking:'points',
        punting:'average'
      })[category]||'games';
      return Number(y.stats?.[key]||0)-Number(x.stats?.[key]||0)||String(x.name).localeCompare(String(y.name));
    });
  }

  function canonicalTeamOverview(team={}) {
    const aliases=canonicalTeamIdAliases(team?.id||team?.liveTeamId||'');
    const currentYear=Number(canonicalCurrentSeasonYear());
    const teamRows=(playerStatisticsState.rows||[]).filter(row=>{
      if(String(row.category||'').toLowerCase()!=='team-game')return false;
      if(!canonicalTeamIdentityMatches(rowTeamId(row),aliases))return false;
      const raw=statisticRaw(row);
      const stage=canonicalNormalizeStage(row.stage||raw.stage||raw.seasonStage);
      if(stage==='preseason')return false;
      const year=Number(row.seasonYear??row.season??raw.seasonYear??raw.season_year??raw.calendarYear);
      return !(Number.isFinite(currentYear)&&Number.isFinite(year)&&year!==currentYear);
    });

    let latest=null;
    teamRows.forEach(row=>{
      const raw=statisticRaw(row);
      const stage=canonicalNormalizeStage(row.stage||raw.stage||raw.seasonStage);
      const week=Number(row.week??row.weekIndex??raw.week??raw.weekIndex)||0;
      const rank=stage==='playoffs'?2:1;
      if(!latest||rank>latest.rank||(rank===latest.rank&&week>latest.week))latest={row,rank,week};
    });

    const raw=latest?statisticRaw(latest.row):{};
    const num=aliases=>{
      for(const key of aliases){
        const value=raw[key];
        const n=Number(value);
        if(value!==undefined&&value!==null&&value!==''&&Number.isFinite(n))return n;
      }
      return 0;
    };
    const giveaways=num(['tOGiveaways'])||num(['offFumLost'])+num(['offIntsLost']);
    const takeaways=num(['tOTakeaways'])||num(['defIntsRec'])+num(['defFumRec']);

    return {
      pointsPerGame:num(['offPtsPerGame']),
      pointsAllowedPerGame:num(['defPtsPerGame']),
      totalOffense:num(['offTotalYds','offTotalYdsGained']),
      passingOffense:num(['offPassYds']),
      rushingOffense:num(['offRushYds']),
      takeaways,
      turnovers:giveaways,
      turnoverDifferential:num(['tODiff'])||(takeaways-giveaways),
      sacks:num(['defSacks'])
    };
  }

  function renderTeamStats(team, roster) {
    if(!playerStatisticsState.loaded){
      hydratePlayerStatistics(false).then(()=>{
        if(state.teamTab==='stats'){
          const host=document.querySelector('[data-team-tab-content]');
          if(host)host.innerHTML=renderTeamStats(team,roster);
        }
      }).catch(error=>console.error('[Team Stats Canonical Hydration]',error));
      return '<article class="card"><div class="card-body">Loading canonical team statistics…</div></article>';
    }

    const overview=canonicalTeamOverview(team);
    const categoryColumns={
      passing:statsColumnMap.passing,
      rushing:statsColumnMap.rushing,
      receiving:statsColumnMap.receiving,
      defense:statsColumnMap.defense,
      kicking:statsColumnMap.kicking,
      punting:statsColumnMap.punting
    };

    return `<div class="team-stats-view">
      <div class="team-stats-overview">
        ${[
          ['PPG',overview.pointsPerGame],
          ['Allowed/G',overview.pointsAllowedPerGame],
          ['Total Offense',overview.totalOffense],
          ['Pass Offense',overview.passingOffense],
          ['Rush Offense',overview.rushingOffense],
          ['Takeaways',overview.takeaways],
          ['Turnovers',overview.turnovers],
          ['Turnover Diff',overview.turnoverDifferential],
          ['Sacks',overview.sacks]
        ].map(([label,value])=>summaryStatBox(label,Number(value||0).toLocaleString(undefined,{maximumFractionDigits:1}))).join('')}
      </div>
      ${Object.entries(categoryColumns).map(([category,columns])=>{
        const rows=canonicalTeamPlayerTotals(team,category);
        return `<article class="card team-stat-section">
          <div class="card-header">
            <div><span class="eyebrow">Canonical Madden Statistics</span><h3>${titleCase(category)}</h3></div>
            <span class="pill pill--neutral">${rows.length} players</span>
          </div>
          <div class="table-wrap"><table class="team-stat-table">
            <thead><tr><th>Player</th>${columns.map(([,label])=>`<th>${label}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(row=>`<tr class="clickable-row" data-player-id="${escapeHtml(row.id)}">
              <td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.position)}</small></td>
              ${columns.map(([key])=>`<td>${formatStatValue(key,row.stats?.[key])}</td>`).join('')}
            </tr>`).join('')||`<tr><td colspan="${columns.length+1}">No ${category} statistics are available.</td></tr>`}</tbody>
          </table></div>
        </article>`;
      }).join('')}
    </div>`;
  }

  function summaryStatBox(label,value) { return `<div class="stat-box"><span>${label}</span><strong>${value}</strong></div>`; }

  function renderTeamCap(team, roster) {
    try{
      const allRows=[...roster].map(player=>{
        const contract=canonicalContract(player);
        return {...player,contract};
      });

      const positions=sortPositionFilterValues(allRows.map(player=>player.position));
      if(state.capPosition!=='All' && !positions.includes(state.capPosition)) state.capPosition='All';

      const filtered=allRows.filter(player=>
        state.capPosition==='All' || canonicalFilterPosition(player.position)===canonicalFilterPosition(state.capPosition)
      );

      const sortKey=state.capSortKey||'capHit';
      const direction=state.capSortDirection==='asc'?1:-1;
      const valueFor=(player,key)=>{
        if(key==='player') return String(player.name||'').toLowerCase();
        if(key==='position') return String(player.position||'').toLowerCase();
        if(key==='years') return player.contract.yearsRemaining;
        if(key==='salary') return player.contract.totalSalary;
        if(key==='capHit') return player.contract.capHit;
        if(key==='bonus') return player.contract.totalBonus;
        return null;
      };
      const sorted=[...filtered].sort((a,b)=>{
        const av=valueFor(a,sortKey), bv=valueFor(b,sortKey);
        const aMissing=av===null||av===undefined||av==='';
        const bMissing=bv===null||bv===undefined||bv==='';
        if(aMissing&&bMissing) return String(a.name||'').localeCompare(String(b.name||''));
        if(aMissing) return 1;
        if(bMissing) return -1;
        if(typeof av==='number' && typeof bv==='number'){
          const result=av-bv;
          return result===0?String(a.name||'').localeCompare(String(b.name||'')):result*direction;
        }
        const result=String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:'base'});
        return result===0?String(a.name||'').localeCompare(String(b.name||'')):result*direction;
      });

      const totalSalary=allRows.reduce((sum,p)=>sum+(Number(p.contract.totalSalary)||0),0);
      const totalCapHit=allRows.reduce((sum,p)=>sum+(Number(p.contract.capHit)||0),0);
      const largestCapHit=allRows.reduce((max,p)=>Math.max(max,Number(p.contract.capHit)||0),0);
      const upcomingFA=allRows.filter(p=>Number(p.contract.yearsRemaining)===1).length;

      const sortHeader=(label,key)=>{
        const active=sortKey===key;
        const arrow=active?(state.capSortDirection==='asc'?' ↑':' ↓'):'';
        return `<button type="button" class="table-sort-button ${active?'is-active':''}" data-cap-sort="${key}" aria-label="Sort by ${escapeHtml(label)}">${escapeHtml(label)}${arrow}</button>`;
      };

      return `<div class="content-grid content-grid--cap">
        <article class="card">
          <div class="card-header"><div><h3>Financial Overview</h3></div></div>
          <div class="card-body"><div class="stat-box-grid">
            ${summaryStatBox('Team Cap Space',team.cap!=null?compactMoney(team.cap):'Unavailable')}
            ${summaryStatBox('Total Contracts',totalSalary?compactMoney(totalSalary):'Unavailable')}
            ${summaryStatBox('Current Cap Hits',totalCapHit?compactMoney(totalCapHit):'—')}
            ${summaryStatBox('Largest Cap Hit',largestCapHit?compactMoney(largestCapHit):'—')}
            ${summaryStatBox('Upcoming FA',upcomingFA)}
          </div></div>
        </article>

        <article class="card cap-roster-card">
          <div class="card-header">
            <div><span class="eyebrow">Active contracts</span><h3>Player Contracts</h3></div>
            <div class="heading-actions">
              <label class="field cap-position-filter">
                <span>Position</span>
                <select data-cap-position>
                  <option value="All" ${state.capPosition==='All'?'selected':''}>All Positions</option>
                  ${positions.map(position=>`<option value="${escapeHtml(position)}" ${state.capPosition===position?'selected':''}>${escapeHtml(positionFilterLabel(position))}</option>`).join('')}
                </select>
              </label>
              <span class="pill pill--neutral">${sorted.length} player${sorted.length===1?'':'s'}</span>
            </div>
          </div>
          <div class="table-wrap">
            <table class="cap-roster-table">
              <thead><tr>
                <th>${sortHeader('Player','player')}</th>
                <th>${sortHeader('Pos','position')}</th>
                <th>${sortHeader('Years','years')}</th>
                <th>${sortHeader('Total Contract','salary')}</th>
                <th>${sortHeader('Cap Hit','capHit')}</th>
                <th>${sortHeader('Total Bonus','bonus')}</th>
              </tr></thead>
              <tbody>${sorted.length?sorted.map(player=>`
                <tr class="clickable-row" data-roster-player-detail="${escapeHtml(player.id||'')}">
                  <td><strong>${escapeHtml(player.name||'Unknown Player')}</strong></td>
                  <td><span class="pill pill--neutral">${escapeHtml(player.position||'—')}</span></td>
                  <td>${player.contract.yearsRemaining??'—'}</td>
                  <td>${player.contract.totalSalary!=null?compactMoney(player.contract.totalSalary):'Unavailable'}</td>
                  <td><strong>${player.contract.capHit!=null?compactMoney(player.contract.capHit):'—'}</strong></td>
                  <td>${player.contract.totalBonus!=null?compactMoney(player.contract.totalBonus):'Unavailable'}</td>
                </tr>`).join(''):`<tr><td colspan="6">No players match the selected position.</td></tr>`}
              </tbody>
            </table>
          </div>
        </article>
      </div>`;
    }catch(error){
      console.error('[Team Cap]',error);
      return `<article class="card roadmap-state"><div class="roadmap-state__inner">
        <h2>Salary cap could not render</h2>
        <p>${escapeHtml(error?.message||'Unexpected salary-cap rendering error.')}</p>
      </div></article>`;
    }
  }

  function refreshActiveCapTab() {
    const teamId=activeTeamIdForTeamPage();
    const team=liveTeamDirectory?.teamMap?.get(teamId);
    const players=liveTeamDirectory?.playersByTeam?.get(teamId)||[];
    const target=pageContent?.querySelector?.('[data-team-tab-content]');
    if(!team||!target||state.teamTab!=='cap') return;
    const roster=players.map(rosterPlayerView);
    target.innerHTML=renderTeamCap(team,roster);
  }

  const TRANSACTION_SESSION_CACHE_KEY='fhq:transactions:ui:v1';
  const TRANSACTION_SESSION_TTL_MS=300000;
  let canonicalTransactionUiCache={payload:null,promise:null,loadedAt:0,snapshotId:''};

  function hydrateCanonicalTransactionSessionCache(){
    // P5e1: full transaction payloads are intentionally NOT restored from sessionStorage.
    // The ledger can exceed browser storage quotas. Keep the authoritative payload in memory.
    try{
      const raw=sessionStorage.getItem(TRANSACTION_SESSION_CACHE_KEY);
      if(!raw)return;
      const cached=JSON.parse(raw);
      canonicalTransactionUiCache.loadedAt=Number(cached?.loadedAt||0);
      canonicalTransactionUiCache.snapshotId=String(cached?.snapshotId||'');
      sessionStorage.removeItem(TRANSACTION_SESSION_CACHE_KEY);
    }catch{
      try{sessionStorage.removeItem(TRANSACTION_SESSION_CACHE_KEY)}catch{}
    }
  }

  function persistCanonicalTransactionSessionCache(){
    // Store only tiny metadata. Never serialize the full canonical ledger.
    try{
      sessionStorage.setItem(TRANSACTION_SESSION_CACHE_KEY,JSON.stringify({
        loadedAt:canonicalTransactionUiCache.loadedAt||Date.now(),
        snapshotId:String(canonicalTransactionUiCache.snapshotId||'')
      }));
    }catch{
      try{sessionStorage.removeItem(TRANSACTION_SESSION_CACHE_KEY)}catch{}
    }
  }

  hydrateCanonicalTransactionSessionCache();

  async function loadCanonicalTransactionsForUi(force=false){
    if(!force&&canonicalTransactionUiCache.payload&&Date.now()-canonicalTransactionUiCache.loadedAt<300000)return canonicalTransactionUiCache.payload;
    if(!force&&canonicalTransactionUiCache.promise)return canonicalTransactionUiCache.promise;
    canonicalTransactionUiCache.promise=(async()=>{
      let payload=null;
      const service=window.FranchiseHQ?.transactions;
      if(service?.canonical){
        payload=await service.canonical();
      }else{
        const slug=location.pathname.match(/\/leagues\/([^/]+)/i)?.[1]||'';
        const response=await fetch(`/api/leagues/${encodeURIComponent(slug)}/transactions/canonical`,{
          credentials:'include',cache:'no-store',headers:{accept:'application/json'}
        });
        payload=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
        if(!response.ok||payload?.ok===false)throw new Error(payload?.detail||payload?.error||'Transactions unavailable.');
      }
      canonicalTransactionUiCache.payload=payload||{transactions:[]};
      canonicalTransactionUiCache.loadedAt=Date.now();
      canonicalTransactionUiCache.snapshotId=String(liveTeamDirectory?.snapshot?.id||liveTeamDirectory?.snapshot?.snapshotId||liveTeamDirectory?.snapshot?.snapshot_id||'');
      canonicalTransactionUiCache.promise=null;
      persistCanonicalTransactionSessionCache();
      return canonicalTransactionUiCache.payload;
    })().catch(error=>{canonicalTransactionUiCache.promise=null;throw error});
    return canonicalTransactionUiCache.promise;
  }

  window.FranchiseHQ=window.FranchiseHQ||{};
  window.FranchiseHQ.transactionUiLoader={
    load:(force=false)=>loadCanonicalTransactionsForUi(force),
    cached:()=>canonicalTransactionUiCache.payload,
    clear:()=>{
      canonicalTransactionUiCache={payload:null,promise:null,loadedAt:0,snapshotId:''};
      try{sessionStorage.removeItem(TRANSACTION_SESSION_CACHE_KEY)}catch{}
    }
  };

  let canonicalTransactionPrewarmStarted=false;
  let canonicalTransactionPostLoadScheduled=false;

  function prewarmCanonicalTransactions(){
    if(canonicalTransactionPrewarmStarted||canonicalTransactionUiCache.payload||canonicalTransactionUiCache.promise)return;
    canonicalTransactionPrewarmStarted=true;
    Promise.resolve()
      .then(()=>loadCanonicalTransactionsForUi(false))
      .catch(error=>console.warn('[Transactions Prewarm]',error))
      .finally(()=>{canonicalTransactionPrewarmStarted=false});
  }

  function scheduleCanonicalTransactionPrewarm(){
    if(canonicalTransactionPostLoadScheduled)return;
    canonicalTransactionPostLoadScheduled=true;

    const queueAfterLoad=()=>{
      setTimeout(()=>{
        const begin=()=>{
          if(canonicalTransactionUiCache.payload)return;
          prewarmCanonicalTransactions();
        };
        if(typeof requestIdleCallback==='function') requestIdleCallback(begin,{timeout:2000});
        else setTimeout(begin,750);
      },1500);
    };

    if(document.readyState==='complete')queueAfterLoad();
    else window.addEventListener('load',queueAfterLoad,{once:true});
  }

  // Network prewarm is deliberately outside the cold-boot critical path.
  scheduleCanonicalTransactionPrewarm();


  window.FranchiseHQ.transactionRecovery={
    release:'6.3.2',
    refresh:async()=>{
      window.FranchiseHQ?.transactionUiLoader?.clear?.();
      const payload=await loadCanonicalTransactionsForUi(true);
      if(routeBase(currentAppRoute())==='transactions')renderLeagueTransactionTable(payload);
      return {ok:true,transactions:payload?.transactions?.length||0};
    },
    status:()=>({
      release:'6.3.2',
      cached:Boolean(canonicalTransactionUiCache?.payload),
      count:canonicalTransactionUiCache?.payload?.transactions?.length||0,
      route:routeBase(currentAppRoute())
    })
  };

  window.FranchiseHQ.transactionPerformance={
    cached:()=>Boolean(canonicalTransactionUiCache.payload),
    loading:()=>Boolean(canonicalTransactionUiCache.promise),
    loadedAt:()=>canonicalTransactionUiCache.loadedAt||0,
    ageMs:()=>canonicalTransactionUiCache.loadedAt?Date.now()-canonicalTransactionUiCache.loadedAt:null,
    prewarm:()=>{prewarmCanonicalTransactions();return true;},
    print:()=>console.log('[Transaction Performance]',{
      release:'6.3.2',
      cached:Boolean(canonicalTransactionUiCache.payload),
      loading:Boolean(canonicalTransactionUiCache.promise),
      loadedAt:canonicalTransactionUiCache.loadedAt||null,
      ageMs:canonicalTransactionUiCache.loadedAt?Date.now()-canonicalTransactionUiCache.loadedAt:null,
      transactionCount:canonicalTransactionUiCache.payload?.transactions?.length||0,
      documentReadyState:document.readyState,
      postLoadPrewarmScheduled:canonicalTransactionPostLoadScheduled
    })
  };

  window.FranchiseHQ.coldBootPerformance={
    print:()=>console.log('[Cold Boot Performance]',{
      release:'6.3.2',
      domContentLoadedMs:performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd||null,
      loadEventMs:performance.getEntriesByType('navigation')[0]?.loadEventEnd||null,
      transactionCached:Boolean(canonicalTransactionUiCache.payload),
      transactionLoading:Boolean(canonicalTransactionUiCache.promise)
    })
  };


  function canonicalTeamAliases(team={}){
    return new Set([team.id,team.liveTeamId,team.abbr,team.abbreviation,team.source?.teamId,team.source?.team_id]
      .filter(value=>value!==undefined&&value!==null&&String(value)!=='').map(value=>String(value).toLowerCase()));
  }

  function transactionIsPubliclyVisible(transaction={}){
    const authority=String(transaction.authority||'').toLowerCase();
    const execution=String(transaction.executionStatus||'').toLowerCase();
    const type=String(transaction.eventType||'').toLowerCase();

    if(type==='roster-status-change')return false;

    const hasMaddenEvidence=authority==='madden-explicit'||authority==='franchisehq+madden'||execution==='confirmed-madden';
    const hasRosterEvidence=authority==='franchisehq+snapshot-confirmed'||authority==='snapshot-inferred'||execution==='confirmed-roster'||execution==='observed-roster';

    if(type==='trade'){
      if(execution==='pending-madden-execution')return false;
      return hasMaddenEvidence||hasRosterEvidence;
    }

    return hasMaddenEvidence||hasRosterEvidence;
  }

  function transactionInvolvesTeam(transaction={},team={}){
    const aliases=canonicalTeamAliases(team);
    return (transaction.teamIds||[]).some(value=>aliases.has(String(value).toLowerCase()));
  }

  function transactionTeamByCanonicalId(id){
    const wanted=String(id??'').toLowerCase();
    return (liveTeamDirectory?.teams||[]).find(team=>canonicalTeamAliases(team).has(wanted))||null;
  }

  function transactionDisplayType(transaction={}){
    const rawType=String(transaction.eventType||transaction.type||'').toLowerCase();
    const evidence=Array.isArray(transaction.evidence)?transaction.evidence:[];
    const evidenceTypes=new Set(evidence.map(item=>String(item?.sourceType||'').toLowerCase()));
    const strongTradeEvidence=
      Boolean(transaction.workflowTradeId) ||
      evidenceTypes.has('madden-explicit') ||
      evidenceTypes.has('franchisehq-workflow') ||
      String(transaction.authority||'').toLowerCase().includes('madden') ||
      String(transaction.authority||'').toLowerCase().includes('workflow');

    if(rawType==='trade'&&!strongTradeEvidence)return'team-change';

    if(rawType==='team-change'){
      const moves=transactionMoves(transaction);
      const practiceMove=moves.find(m=>
        String(m?.oldStatus||'').toLowerCase().includes('practice') &&
        String(m?.fromTeamId||'') &&
        String(m?.toTeamId||'') &&
        String(m.fromTeamId)!==String(m.toTeamId)
      );
      if(practiceMove)return'signed-off-practice-squad';
      if(strongTradeEvidence)return'trade';
    }

    return rawType;
  }
  function transactionEventLabel(type=''){
    const key=String(type||'').toLowerCase();
    return ({
      trade:'Trade',
      signing:'Signed',
      drafted:'Drafted',
      release:'Released',
      'waiver-claim':'Waiver Claim',
      waived:'Waived',
      'team-change':'Team Change',
      'signed-off-practice-squad':'Signed off Practice Squad',
      'practice-squad-signing':'Signed off Practice Squad',
      'practice-squad-promotion':'Promoted from Practice Squad',
      'practice-squad-demotion':'Moved to Practice Squad',
      'ir-placement':'Placed on IR',
      'ir-activation':'Activated from IR',
      'roster-move':'Roster Move',
      'roster-status-change':'Roster Status Change'
    })[key]||titleCase(key.replace(/-/g,' '))||'Transaction';
  }

  function transactionEventTone(type=''){
    const key=String(type||'').toLowerCase();
    if(key==='trade')return'accent';
    if(['signing','drafted','waiver-claim','practice-squad-signing','signed-off-practice-squad','practice-squad-promotion','ir-activation'].includes(key))return'success';
    if(['release','waived','practice-squad-demotion','ir-placement'].includes(key))return'danger';
    return'neutral';
  }

  function transactionAuthorityLabel(transaction={}){
    const authority=String(transaction.authority||'').toLowerCase();
    if(authority==='franchisehq+madden')return'Madden Confirmed';
    if(authority==='madden-explicit')return'Madden';
    if(authority==='franchisehq+snapshot-confirmed')return'Roster Confirmed';
    if(authority==='franchisehq-workflow')return transaction.executionStatus==='pending-madden-execution'?'Pending Madden':'Franchise HQ';
    if(authority==='snapshot-inferred')return'Roster Detected';
    return'Recorded';
  }

  function transactionTimeLabel(transaction={}){
    const parts=[];
    if(transaction.season!=null)parts.push(`Season ${transaction.season}`);
    parts.push(transactionMaddenWeekLabel(transaction));
    return parts.filter(Boolean).join(' · ')||'Madden week unavailable';
  }

  function transactionMoves(transaction={}){
    return (transaction.evidence||[])
      .flatMap(item=>Array.isArray(item?.evidence?.moves)?item.evidence.moves:[])
      .filter(Boolean);
  }

  function transactionTeamLabel(id){
    if(id==null||String(id).toUpperCase()==='FA')return'FA';
    const team=transactionTeamByCanonicalId(id);
    return team?.abbr||team?.fullName||String(id).toUpperCase();
  }

  function transactionDirectionLabel(transaction={}){
    const moves=transactionMoves(transaction);
    const type=String(transaction.eventType||'').toLowerCase();
    if(type==='trade'){
      const ids=[...new Set(moves.flatMap(m=>[m.fromTeamId,m.toTeamId]).filter(v=>v&&String(v).toUpperCase()!=='FA').map(String))];
      if(ids.length>=2)return `${transactionTeamLabel(ids[0])} ↔ ${transactionTeamLabel(ids[1])}`;
    }
    const move=moves[0]||{};
    let from=move.fromTeamId, to=move.toTeamId;
    if(type==='signing'){from='FA';to=to||(transaction.teamIds||[]).find(id=>String(id).toUpperCase()!=='FA')}
    if(type==='release'){from=from||(transaction.teamIds||[]).find(id=>String(id).toUpperCase()!=='FA');to='FA'}
    if(from||to)return `${transactionTeamLabel(from)} → ${transactionTeamLabel(to)}`;
    const ids=transaction.teamIds||[];
    return ids.length?ids.map(transactionTeamLabel).join(' → '):'';
  }

  function transactionAuthorityMarkup(transaction={}){
    const label=transactionAuthorityLabel(transaction);
    if(label==='Roster Detected')return'';
    return `<span class="pill pill--neutral">${escapeHtml(label)}</span>`;
  }

  function transactionPlayerRows(transaction={}){
    const participantMap=new Map((transaction.participants||[]).map(p=>[String(p.id),p]));
    const ids=[...new Set((transaction.playerIds||[]).map(String).filter(Boolean))];
    const rows=ids.map(id=>{
      const live=liveTeamDirectory?.playerMap?.get?.(id)||(liveTeamDirectory?.players||[]).find(player=>String(player.id)===id);
      if(live)return rosterPlayerView(live);
      const participant=participantMap.get(id);
      if(participant)return{
        id,
        name:participant.name||`Player ${id}`,
        position:participant.position||'—',
        overall:Number.isFinite(Number(participant.overall))?Number(participant.overall):null
      };
      const move=transactionMoves(transaction).find(item=>String(item?.playerId||'')===id);
      return move?{
        id,
        name:move.playerName||`Player ${id}`,
        position:move.position||'—',
        overall:Number.isFinite(Number(move.overall))?Number(move.overall):null
      }:{id,name:`Player ${id}`,position:'—',overall:null};
    });
    if(rows.length)return rows;
    const summaries=(transaction.evidence||[]).map(item=>item?.evidence?.summary).filter(Boolean);
    return summaries.length?[{name:String(summaries[0]),summary:true}]:[];
  }

  function transactionPartnerTeams(transaction={},team={}){
    const aliases=canonicalTeamAliases(team);
    return (transaction.teamIds||[]).filter(id=>!aliases.has(String(id).toLowerCase()))
      .map(id=>transactionTeamByCanonicalId(id)||{id,abbr:String(id).toUpperCase(),fullName:String(id).toUpperCase()});
  }

  function renderCanonicalTeamTransactionRow(transaction,team){
    const partners=transactionPartnerTeams(transaction,team);
    const txPlayers=transactionPlayerRows(transaction);
    const evidenceCount=(transaction.evidence||[]).length;
    const canOpenTrade=Boolean(transaction.workflowTradeId&&String(transaction.eventType).toLowerCase()==='trade');
    const playersMarkup=txPlayers.length?`<div class="team-transaction-assets">${txPlayers.map(player=>player.summary
      ?`<span class="team-transaction-summary">${escapeHtml(player.name)}</span>`
      :`<button type="button" class="team-transaction-player" data-roster-player-detail="${escapeHtml(player.id)}"><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.position||'—')}${player.overall?` · ${player.overall} OVR`:''}</small></button>`).join('')}</div>`
      :`<div class="team-transaction-assets"><span class="team-transaction-summary">Roster movement recorded</span></div>`;
    const partnersMarkup=partners.length?partners.map(partner=>`<span class="team-transaction-partner">${renderTeamMark(partner,'team-logo')}<span>${escapeHtml(partner.abbr||partner.fullName||'Team')}</span></span>`).join(''):'<span class="team-transaction-partner">League transaction</span>';

    return `<article class="card team-transaction-row">
      <div class="team-transaction-row__header"><div><span class="pill pill--${transactionEventTone(transactionDisplayType(transaction))}">${escapeHtml(transactionEventLabel(transactionDisplayType(transaction)))}</span><strong>${escapeHtml(transactionTimeLabel(transaction))}</strong>${transactionDirectionLabel(transaction)?`<small>${escapeHtml(transactionDirectionLabel(transaction))}</small>`:''}</div>${transactionAuthorityMarkup(transaction)}</div>
      <div class="team-transaction-row__body"><div class="team-transaction-partners"><small>${partners.length?'With / Against':'Team'}</small>${partnersMarkup}</div>${playersMarkup}</div>
      <div class="team-transaction-row__footer"><small>${evidenceCount} source record${evidenceCount===1?'':'s'} merged into one canonical transaction</small>${canOpenTrade?`<button type="button" class="text-button" data-route="trade-center/${escapeHtml(transaction.workflowTradeId)}">View Trade Details <svg><use href="#icon-arrow"></use></svg></button>`:''}</div>
    </article>`;
  }

  function renderTeamTransactionLoading(team){
    return `<div class="team-trade-history-view"><div class="section-heading"><div><span class="eyebrow">LIVE transactions</span><h2>${escapeHtml(team.fullName)} Transaction History</h2></div></div><article class="card roadmap-state"><div class="roadmap-state__inner"><h3>Loading transactions…</h3><p>Reading the canonical Franchise HQ transaction ledger.</p></div></article></div>`;
  }

  async function refreshTeamTransactionHistory(team,target=null){
    const host=target||pageContent?.querySelector?.('[data-team-tab-content]');
    if(!host||state.teamTab!=='trade-history')return;
    try{
      const payload=await loadCanonicalTransactionsForUi(false);
      if(state.teamTab!=='trade-history')return;
      const rows=(payload?.transactions||[]).filter(transaction=>transactionIsPubliclyVisible(transaction)&&transactionInvolvesTeam(transaction,team));
      rows.sort((a,b)=>(Number(b.season||0)-Number(a.season||0))||(Number(b.week||0)-Number(a.week||0))||((new Date(b.occurredAt||b.createdAt||0).getTime()||0)-(new Date(a.occurredAt||a.createdAt||0).getTime()||0)));
      host.innerHTML=`<div class="team-trade-history-view"><div class="section-heading"><div><h2>${escapeHtml(team.fullName)} Transaction History</h2></div><span class="pill pill--neutral">${rows.length} transaction${rows.length===1?'':'s'}</span></div>${rows.length?`<div class="team-transaction-list">${rows.map(row=>renderCanonicalTeamTransactionRow(row,team)).join('')}</div>`:`<article class="card roadmap-state"><div class="roadmap-state__inner"><h3>No LIVE transactions recorded</h3><p>No canonical transaction currently involves ${escapeHtml(team.fullName)}.</p></div></article>`}</div>`;
    }catch(error){
      console.error('[Team Transaction History]',error);
      host.innerHTML=`<article class="card roadmap-state"><div class="roadmap-state__inner"><h3>Transaction history unavailable</h3><p>${escapeHtml(error?.message||'The canonical transaction ledger could not be loaded.')}</p></div></article>`;
    }
  }

  function renderTeamTradeHistory(team) {
    return renderTeamTransactionLoading(team);
  }

  async function renderPlayers() {
    pageContent.innerHTML='<section class="empty-state"><strong>Loading players…</strong><p>Reading league data.</p></section>';await loadLiveTeamDirectory(false);if(routeBase(currentAppRoute())!=='players')return;
    const sourceTeams=liveTeamDirectory?.teams||[],sourcePlayers=liveTeamDirectory?.players||[],positions=sortPositionFilterValues(sourcePlayers.map(player=>player.position));
    const freeAgentStatus=liveTeamDirectory?.freeAgents?.status||'unavailable';
    const freeAgentLabel=['ready','empty-confirmed'].includes(freeAgentStatus)?'Free Agents':`Free Agents — ${freeAgentStatus==='blocked'?'blocked / unknown':'unavailable'}`;
    pageContent.innerHTML=`<div class="page-heading"><div><h1>Players</h1></div><div class="heading-actions"><button class="button button--ghost" data-player-clear-filters><svg><use href="#icon-refresh"></use></svg>Clear filters</button></div></div><div class="filter-bar roster-filter-bar"><label class="field field--grow"><span>Player search</span><div class="input-wrap"><svg><use href="#icon-search"></use></svg><input data-player-search value="${escapeHtml(state.playerSearch)}" placeholder="Search player name, team, or position..." /></div></label><label class="field"><span>Position</span><select data-player-position><option value="All">All</option>${positions.map(pos=>`<option value="${pos}" ${canonicalFilterPosition(state.playerPosition)===pos?'selected':''}>${positionFilterLabel(pos)}</option>`).join('')}</select></label><label class="field"><span>Team</span><select data-player-team><option value="All">All teams</option><option value="__free_agents__" ${state.playerTeam==='__free_agents__'?'selected':''}>${escapeHtml(freeAgentLabel)}</option>${sourceTeams.map(team=>`<option value="${escapeHtml(team.id)}" ${state.playerTeam===team.id?'selected':''}>${escapeHtml(team.abbr)} — ${escapeHtml(team.fullName)}</option>`).join('')}</select></label><label class="field"><span>Status</span><select data-player-status>${['All','active','injured-reserve','practice-squad','free-agent','unassigned','other'].map(value=>`<option value="${value}" ${state.playerStatus===value?'selected':''}>${value==='All'?'All statuses':titleCase(value.replace(/-/g,' '))}</option>`).join('')}</select></label><label class="field"><span>Development</span><select data-player-dev>${['All','Normal','Star','Superstar','X-Factor'].map(value=>`<option value="${value}" ${state.playerDev===value?'selected':''}>${value==='All'?'All traits':value}</option>`).join('')}</select></label><label class="field"><span>OVR</span><div class="range-pair"><input type="number" min="0" max="99" data-player-min-ovr value="${state.playerMinOvr}"><span>to</span><input type="number" min="0" max="99" data-player-max-ovr value="${state.playerMaxOvr}"></div></label><label class="field"><span>Age</span><div class="range-pair"><input type="number" min="18" max="60" data-player-min-age value="${state.playerMinAge}"><span>to</span><input type="number" min="18" max="60" data-player-max-age value="${state.playerMaxAge}"></div></label><label class="field player-rookie-filter"><span>Experience</span><span class="checkbox-filter"><input type="checkbox" data-player-rookie ${state.playerRookiesOnly?'checked':''}><strong>Is Rookie</strong></span></label><label class="field"><span>Sort</span><select data-player-sort><option value="overall-desc" ${state.playerSort==='overall-desc'?'selected':''}>Overall: High to Low</option><option value="age-asc" ${state.playerSort==='age-asc'?'selected':''}>Age: Youngest</option><option value="depth-asc" ${state.playerSort==='depth-asc'?'selected':''}>Depth Order</option><option value="name-asc" ${state.playerSort==='name-asc'?'selected':''}>Name: A–Z</option></select></label><span class="result-count" data-player-count></span></div><article class="card player-directory-card"><div class="table-wrap"><table class="player-directory-table"><thead><tr><th>Player</th><th>Pos</th><th>OVR</th><th>Age</th><th>Development</th><th>Team</th><th>Status</th><th>Total Contract</th></tr></thead><tbody data-player-table></tbody></table></div><div class="player-directory-pagination" data-player-pagination></div></article>`;refreshPlayerTable();
  }

  function refreshPlayerTable() {
    const tbody=document.querySelector('[data-player-table]');if(!tbody)return;
    const freeAgentUnavailable=state.playerTeam==='__free_agents__'&&!['ready','empty-confirmed'].includes(liveTeamDirectory?.freeAgents?.status);
    let filtered=(liveTeamDirectory?.players||[]).map(player=>rosterPlayerView(player)).filter(player=>!playerIsRetired(player));const q=String(state.playerSearch||'').trim().toLowerCase();if(q)filtered=filtered.filter(player=>{const team=rosterTeamView(player.teamId);return [player.name,player.position,team?.abbr,team?.fullName].some(value=>String(value||'').toLowerCase().includes(q));});filtered=filtered.filter(player=>{if(state.playerPosition!=='All'&&canonicalFilterPosition(player.position)!==canonicalFilterPosition(state.playerPosition))return false;if(state.playerTeam==='__free_agents__'&&!['free-agent','unassigned'].includes(player.rosterStatus))return false;if(state.playerTeam!=='All'&&state.playerTeam!=='__free_agents__'&&String(player.teamId)!==String(state.playerTeam))return false;if(state.playerStatus!=='All'&&player.rosterStatus!==state.playerStatus)return false;if(state.playerDev!=='All'&&player.dev!==state.playerDev)return false;if(state.playerRookiesOnly&&!isRookiePlayer(player))return false;if((player.overall??0)<state.playerMinOvr||(player.overall??0)>state.playerMaxOvr)return false;if(player.age!=null&&(player.age<state.playerMinAge||player.age>state.playerMaxAge))return false;return true;});const sorters={'overall-desc':(a,b)=>(b.overall??-1)-(a.overall??-1)||a.name.localeCompare(b.name),'age-asc':(a,b)=>(a.age??999)-(b.age??999)||(b.overall??-1)-(a.overall??-1),'depth-asc':(a,b)=>(a.depthOrder??a.depth??999)-(b.depthOrder??b.depth??999)||(b.overall??-1)-(a.overall??-1),'name-asc':(a,b)=>a.name.localeCompare(b.name)};filtered.sort(sorters[state.playerSort]||sorters['overall-desc']);
    const pageSize=Math.max(25,Number(state.playerPageSize)||100),totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));state.playerPage=Math.min(Math.max(1,Number(state.playerPage)||1),totalPages);const start=(state.playerPage-1)*pageSize,pageRows=filtered.slice(start,start+pageSize);const count=document.querySelector('[data-player-count]');if(count)count.textContent=`${filtered.length.toLocaleString()} result${filtered.length===1?'':'s'}`;
    if(freeAgentUnavailable){tbody.innerHTML=`<tr><td colspan="8"><div class="roadmap-state"><div class="roadmap-state__inner"><h2>Free Agent data is unavailable</h2><p>Madden did not provide a complete Free Agent roster for this export. Try again after a future export.</p></div></div></td></tr>`;}else{tbody.innerHTML=pageRows.map(player=>{const team=rosterTeamView(player.teamId);return `<tr class="clickable-row" data-roster-player-detail="${escapeHtml(player.id||'')}"><td data-label="Player"><div class="roster-player-name roster-player-name--single"><strong>${escapeHtml(player.name)}</strong></div></td><td data-label="Pos"><span class="pill pill--neutral">${escapeHtml(player.position||'—')}</span></td><td data-label="OVR"><span class="rating-chip ${player.overall>=90?'rating-chip--elite':player.overall>=84?'rating-chip--high':''}">${player.overall??'—'}</span></td><td data-label="Age">${player.age??'—'}</td><td data-label="Development"><span class="dev-badge ${devClass(player.dev)}">${escapeHtml(player.dev)}</span></td><td data-label="Team">${team?`<div class="table-team">${renderTeamMark(team)}<div><strong>${escapeHtml(team.abbr)}</strong><small>${escapeHtml(team.fullName)}</small></div></div>`:'<span class="pill pill--warning">Free Agent</span>'}</td><td data-label="Status"><span class="pill ${player.rosterStatus==='active'?'pill--success':player.rosterStatus==='injured-reserve'?'pill--warning':'pill--neutral'}">${escapeHtml(titleCase(String(player.rosterStatus||'other').replace(/-/g,' ')))}</span></td><td data-label="Contract">${escapeHtml(formatRosterContract(player))}</td></tr>`;}).join('')||`<tr><td colspan="8"><div class="roadmap-state"><div class="roadmap-state__inner"><h2>No matching players</h2><p>Change or clear the filters to see more players.</p></div></div></td></tr>`;}
    const pagination=document.querySelector('[data-player-pagination]');if(pagination){const first=filtered.length?start+1:0,last=Math.min(start+pageSize,filtered.length);pagination.innerHTML=`<span>Showing ${first.toLocaleString()}–${last.toLocaleString()} of ${filtered.length.toLocaleString()} matched · ${(liveTeamDirectory?.players?.length||0).toLocaleString()} players</span><div><button type="button" class="button button--ghost" data-player-page="${state.playerPage-1}" ${state.playerPage<=1?'disabled':''}>Previous</button><strong>Page ${state.playerPage} of ${totalPages}</strong><button type="button" class="button button--ghost" data-player-page="${state.playerPage+1}" ${state.playerPage>=totalPages?'disabled':''}>Next</button></div>`;}
  }

  async function renderInactivePublicPlayer(publicId) {
    const leagueSlug=location.pathname.match(/^\/leagues\/([^/]+)/i)?.[1]||'';
    if(!leagueSlug||!PUBLIC_PLAYER_ID_PATTERN.test(String(publicId||'')))return false;
    try{
      const response=await fetch(`/api/leagues/${encodeURIComponent(decodeURIComponent(leagueSlug))}/players/${encodeURIComponent(publicId)}`,{
        credentials:'same-origin',cache:'no-store'
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.player)return false;
      pageContent.innerHTML=`
        <div class="page-heading"><div><button class="text-button" data-route="players"><svg style="transform:rotate(180deg)"><use href="#icon-arrow"></use></svg>Player database</button></div></div>
        <section class="card roadmap-state"><div class="roadmap-state__inner">
          <span class="eyebrow">Permanent player identity</span>
          <h1>${escapeHtml(payload.player.displayName||'Player')}</h1>
          <p>This identity link is valid, but the player is not present on the current roster. FranchiseHQ will preserve this URL through releases and team changes without classifying the player as a Free Agent.</p>
          <span class="pill pill--neutral">Not on active roster</span>
        </div></section>`;
      return true;
    }catch{return false}
  }

  async function renderPlayerProfile(playerId) {
    if(!liveTeamDirectory){
      pageContent.innerHTML='<section class="empty-state"><strong>Loading player…</strong><p>Reading league data.</p></section>';
      await loadLiveTeamDirectory(false);
    }
    if(liveTeamDirectory?.snapshot){
      const livePlayer=playerForPublicRoute(playerId);
      await renderPlayers();
      if(livePlayer){
        replaceCurrentPublicUrl(`players/${livePlayer.publicId||playerId}`);
        openCanonicalLivePlayerCard(livePlayer.id);
      }
      else if(!(await renderInactivePublicPlayer(playerId)))showToast('Player unavailable','That player identity is not available in this league.');
      return;
    }
    const player = playerById(playerId);
    if (!player) { setRoute('players'); return; }
    const team = teamById(player.teamId);
    const ratings = Object.entries(player.ratings).sort((a,b)=>b[1]-a[1]);
    const similar = players.filter(p=>p.id!==player.id&&p.position===player.position).sort((a,b)=>Math.abs(a.overall-player.overall)-Math.abs(b.overall-player.overall)).slice(0,4);
    const gameLog = Array.from({length:7},(_,i)=>createGameLogRow(player,i+1));
    pageContent.innerHTML = `
      <div class="page-heading"><div><button class="text-button" data-route="players"><svg style="transform:rotate(180deg)"><use href="#icon-arrow"></use></svg>Player database</button></div><div class="heading-actions">${accountOwnsPlayer(player)?`<button class="button button--ghost" data-toggle-player-block="${player.id}"><svg><use href="#icon-star"></use></svg>${window.FGC_TRADE?.onBlock?.(player)?'Remove from Trade Block':'Add to Trade Block'}</button>`:''}<button class="button button--primary" data-add-player-trade="${player.id}"><svg><use href="#icon-swap"></use></svg>Add to trade</button></div></div>
      <section class="player-profile-hero" style="${teamStyle(team)}" data-number="${player.number}">
        <div class="player-profile-portrait">${player.initials}</div>
        <div class="player-profile-copy"><span class="eyebrow">${team.fullName} · #${player.number}</span><h1>${escapeHtml(player.name)}</h1><div class="player-profile-meta"><span class="pill pill--accent">${player.position}</span><span>${player.height} · ${player.weight} lbs</span><span>Age ${player.age}</span><span>${escapeHtml(player.college)}</span><span class="dev-badge ${devClass(player.dev)}">${player.dev}</span></div></div>
        <div class="player-profile-rating"><strong>${player.overall}</strong><span>Overall Rating</span></div>
      </section>
      <div class="team-summary-grid">
        ${summaryTile('Team',team.abbr,team.record)}${summaryTile('Age',player.age,'Years old')}${summaryTile('Development',player.dev,'Progression trait')}${summaryTile('Contract',`${player.years} yrs`,compactMoney(player.salary))}${summaryTile('Cap Hit',compactMoney(player.capHit),'Current season')}${summaryTile('Trade Status',player.tradeBlock?'On Block':'Unavailable',player.injury)}
      </div>
      <div class="content-grid">
        <article class="card"><div class="card-header"><div><span class="eyebrow">Madden-style attributes</span><h3>Core ratings</h3></div><span class="pill pill--neutral">Mock values</span></div><div class="rating-bars">${ratings.map(([label,value])=>`<div class="rating-row"><span>${label}</span><div class="rating-track"><div class="rating-fill" style="width:${value}%"></div></div><strong>${value}</strong></div>`).join('')}</div></article>
        <article class="card"><div class="card-header"><div><span class="eyebrow">Season production</span><h3>2026 statistics</h3></div><button class="text-button" data-route="stats">League ranks <svg><use href="#icon-arrow"></use></svg></button></div><div class="card-body"><div class="stat-box-grid">${renderPlayerStatBoxes(player)}</div></div></article>
      </div>
      <div class="content-grid content-grid--equal" style="margin-top:18px">
        <article class="card"><div class="card-header"><div><span class="eyebrow">Weekly performance</span><h3>Game log</h3></div></div><div class="table-wrap player-details-game-log-scroll"><table><thead><tr><th>Week</th><th>Opponent</th><th>Primary</th><th>Secondary</th><th>Fantasy</th></tr></thead><tbody>${gameLog.map(row=>`<tr><td>${canonicalGameLogWeekLabel(row.week,row.stage||row.phase||'')}</td><td>${row.opponent}</td><td><strong>${row.primary}</strong></td><td>${row.secondary}</td><td>${row.fantasy.toFixed(1)}</td></tr>`).join('')}</tbody></table></div></article>
        <article class="card"><div class="card-header"><div><span class="eyebrow">Market comparison</span><h3>Similar players</h3></div></div><div class="activity-list">${similar.map(p=>leaderActivity(p,`${p.position} · ${p.dev}`,p.overall)).join('')}</div></article>
      </div>`;
  }

  function renderPlayerStatBoxes(player) {
    const s = player.stats;
    if (player.position==='QB') return `${summaryStatBox('Pass Yards',s.passingYards.toLocaleString())}${summaryStatBox('Pass TD',s.passingTD)}${summaryStatBox('INT',s.interceptions)}${summaryStatBox('Comp %',percent(s.compPct))}`;
    if (['RB','FB'].includes(player.position)) return `${summaryStatBox('Rush Yards',s.rushingYards.toLocaleString())}${summaryStatBox('Rush TD',s.rushingTD)}${summaryStatBox('Receptions',s.receptions)}${summaryStatBox('Rec Yards',s.receivingYards)}`;
    if (['WR','TE'].includes(player.position)) return `${summaryStatBox('Receptions',s.receptions)}${summaryStatBox('Rec Yards',s.receivingYards.toLocaleString())}${summaryStatBox('Rec TD',s.receivingTD)}${summaryStatBox('Yards / Catch',s.yardsPerCatch.toFixed(1))}`;
    if (defensePositions.includes(player.position)) return `${summaryStatBox('Tackles',s.tackles)}${summaryStatBox('Sacks',s.sacks.toFixed(1))}${summaryStatBox('Interceptions',s.interceptions)}${summaryStatBox('Forced Fumbles',s.forcedFumbles)}`;
    if (player.position==='K') return `${summaryStatBox('FG Made',s.fgm)}${summaryStatBox('FG Attempts',s.fga)}${summaryStatBox('FG %',percent(s.fgPct))}${summaryStatBox('Long',s.long)}`;
    return `${summaryStatBox('Punts',s.punts)}${summaryStatBox('Average',s.average.toFixed(1))}${summaryStatBox('Inside 20',s.inside20)}${summaryStatBox('Long',s.long)}`;
  }

  function createGameLogRow(player, week) {
    const teamGames = schedule[week-1]?.games||[];
    const game = teamGames.find(g=>g.homeId===player.teamId||g.awayId===player.teamId);
    if(!game)return null;
    const opponentId = game.homeId===player.teamId?game.awayId:game.homeId;
    const opponent = teamById(opponentId);
    const stage=canonicalEffectiveStage(game.stage||game.phase||game.stageLabel||'',week);
    const base = seededNumber(`${player.id}-week-${week}`,1,100);
    if (player.position==='QB') return { week, stage, opponent:opponent.abbr, primary:`${170+base*3} YDS`, secondary:`${1+base%4} TD · ${base%3} INT`, fantasy:12+base/5 };
    if (['RB','FB'].includes(player.position)) return { week, stage, opponent:opponent.abbr, primary:`${35+base*2} RUSH`, secondary:`${base%3} TD · ${base%5} REC`, fantasy:7+base/6 };
    if (['WR','TE'].includes(player.position)) return { week, stage, opponent:opponent.abbr, primary:`${3+base%8} REC`, secondary:`${40+base*2} YDS · ${base%2} TD`, fantasy:6+base/7 };
    if (defensePositions.includes(player.position)) return { week, stage, opponent:opponent.abbr, primary:`${3+base%9} TKL`, secondary:`${(base%25)/10} SCK · ${base%2} INT`, fantasy:4+base/8 };
    return { week, stage, opponent:opponent.abbr, primary:`${1+base%4} FGM`, secondary:`${base%2} XP`, fantasy:3+base/10 };
  }

  function standingsService() {
    return window.FranchiseHQ?.modules?.league?.standings || window.FranchiseHQ?.leagueStandings || null;
  }

  function ownershipCareerService() {
    return window.FranchiseHQ?.modules?.league?.ownershipCareer || window.FranchiseHQ?.ownershipCareer || null;
  }


  async function renderStandingsLive() {
    const service=liveReadModel();
    if(!service){renderStandingsLegacy();return;}
    pageContent.setAttribute('aria-busy','true');
    try{
      const requestedView=state.standingsView==='confidence'?'division':state.standingsView;
      const ownership=ownershipCareerService();
      const historyPromise=requestedView==='history'&&ownership?.requestLeague
        ? ownership.requestLeague()
        : Promise.resolve(null);
      const [stateValue,snapshot,teamRows,standingRows,leagueHistory]=await Promise.all([service.getState(),service.getSnapshot(),service.getTeams(),service.getStandings(),historyPromise]);
      pageContent.removeAttribute('aria-busy');
      if(routeBase(currentAppRoute())!=='standings')return;
      if(stateValue!=='live'||!snapshot){renderLiveState('Standings unavailable','Standings will appear after the first successful import.');return;}
      const liveTeams=teamRows.map(liveTeamShape),teamMap=new Map(liveTeams.map(t=>[String(t.id),t]));
      const rows=standingRows.map(r=>liveStandingShape(r,teamMap));
      const sortRows=(a,b)=>(b.winPct-a.winPct)||(b.pointDifferential-a.pointDifferential)||(b.pointsFor-a.pointsFor)||a.team.localeCompare(b.team);
      const ranked=[...rows].sort(sortRows).map((row,index)=>({...row,leagueRank:index+1}));
      const table=(group,seeded=false)=>`<div class="table-wrap"><table class="standings-service-table"><thead><tr>${seeded?'<th>Rank</th>':''}<th>Team</th><th>W</th><th>L</th><th>T</th><th>PCT</th><th>DIV</th><th>CONF</th><th>PF</th><th>PA</th><th>DIFF</th><th>STRK</th></tr></thead><tbody>${group.map((row,index)=>{const team=teamMap.get(row.teamId)||{};return `<tr class="clickable-row" data-route="teams/${escapeHtml(row.teamId)}">${seeded?`<td><span class="seed">${row.leagueRank||index+1}</span></td>`:''}<td><div class="table-team">${renderTeamMark(team)}<div><strong>${escapeHtml(team.fullName||row.team)}</strong><small>${escapeHtml([row.conference,row.division].filter(Boolean).join(' '))}</small></div></div></td><td><strong>${row.wins}</strong></td><td>${row.losses}</td><td>${row.ties}</td><td>${Number(row.winPct).toFixed(3).replace(/^0/,'')}</td><td>${escapeHtml(row.divisionRecord)}</td><td>${escapeHtml(row.conferenceRecord)}</td><td>${row.pointsFor}</td><td>${row.pointsAgainst}</td><td class="${row.pointDifferential>=0?'streak--win':'streak--loss'}">${row.pointDifferential>=0?'+':''}${row.pointDifferential}</td><td><span class="streak ${String(row.streak).startsWith('W')?'streak--win':String(row.streak).startsWith('L')?'streak--loss':''}">${escapeHtml(row.streak)}</span></td></tr>`}).join('')}</tbody></table></div>`;
      const confGroups=Object.fromEntries(['AFC','NFC'].map(conf=>[conf,ranked.filter(r=>String(r.conference).toUpperCase()===conf).map((r,i)=>({...r,leagueRank:i+1}))]));
      const divisionGroups={};ranked.forEach(row=>{const key=[row.conference,row.division].filter(Boolean).join(' ')||'League';(divisionGroups[key]||(divisionGroups[key]=[])).push(row)});Object.values(divisionGroups).forEach(group=>group.sort(sortRows));
      const activeView=requestedView;
      const content=activeView==='history'
        ? (ownership?.renderLeague?.(leagueHistory)||'<article class="card gm-career-empty"><h3>League History unavailable</h3><p>The ownership history service has not loaded.</p></article>')
        : activeView==='league'?`<article class="card">${table(ranked,true)}</article>`:
        activeView==='conference'?`<div class="content-grid content-grid--equal">${['AFC','NFC'].map(conf=>`<article class="card"><div class="card-header"><div><span class="eyebrow">Conference rankings</span><h3>${conf}</h3></div></div>${table(confGroups[conf]||[],true)}</article>`).join('')}</div>`:
        activeView==='playoffs'?`<div class="playoff-grid">${['AFC','NFC'].map(conf=>{const picture=buildConferencePicture(conf,rows);return `<article class="card"><div class="card-header"><div><h3>${conf} Playoff Picture</h3></div><span class="pill pill--accent">Top 7</span></div><div class="playoff-bracket">${picture.seeds.map(row=>{const team=teamMap.get(String(row.teamId))||{};return `<div class="playoff-seed"><span class="seed">${row.playoffSeed}</span>${renderTeamMark(team)}<div><strong>${escapeHtml(team.fullName||row.team)}</strong><small>${escapeHtml(row.qualification)}</small></div><strong>${escapeHtml(row.record)}</strong></div>`}).join('')}</div></article>`}).join('')}</div>`:
        `<div class="division-grid">${Object.entries(divisionGroups).map(([name,group])=>`<article class="card division-card"><div class="card-header"><div><span class="eyebrow">${escapeHtml(name.split(' ')[0]||'League')}</span><h3>${escapeHtml(name.split(' ').slice(1).join(' ')||name)}</h3></div></div>${table(group,false)}</article>`).join('')}</div>`;
      const tabs=[['division','Division'],['conference','Conference'],['league','League'],['playoffs','Playoff Picture'],['history','League History']];
      const context=publicSeasonContext(snapshot,[]);
      pageContent.innerHTML=`<div class="page-heading"><div><span class="eyebrow">Season ${escapeHtml(snapshot.seasonYear??'—')}</span><h1>Standings</h1></div><div class="heading-actions"><div class="segmented-tabs standings-primary-tabs">${tabs.map(([key,label])=>`<button data-standings-view="${key}" class="${activeView===key?'is-active':''}">${label}</button>`).join('')}</div></div></div><div data-standings-content>${content}</div>`;
    }catch(error){console.error('[Standings Live Integration]',error);if(routeBase(currentAppRoute())==='standings')renderLiveState('Standings unavailable',error.message||'League data could not be loaded.','warning');}
  }
  function renderStandings() {
    const service=liveReadModel();
    if(service){renderStandingsLive();return;}
    renderStandingsLegacy();
  }

  function renderStandingsLegacy() {
    const service=standingsService();
    if(!service){pageContent.innerHTML='<div class="empty-state"><h2>Standings unavailable</h2><p>The standings service has not loaded.</p></div>';return;}
    const season=scheduleService()?.getSeason?.()||{id:leagueYear(),currentWeek:state.scheduleWeek};
    const tabs = [['division','Division'],['conference','Conference'],['league','League'],['playoffs','Playoff Picture'],['confidence','Confidence Pool']];
    pageContent.innerHTML = `
      <div class="page-heading"><div><span class="eyebrow">Season ${season.id} · Through Week ${season.currentWeek}</span><h1>Standings</h1><p>League races and Confidence Pool rankings powered by completed game results.</p></div><div class="heading-actions"><div class="segmented-tabs standings-primary-tabs">${tabs.map(([key,label])=>`<button data-standings-view="${key}" class="${state.standingsView===key?'is-active':''}">${label}</button>`).join('')}</div></div></div>
      <div data-standings-content>${renderStandingsContent()}</div>`;
  }

  function renderStandingsContent() {
    const service=standingsService();
    if(state.standingsView==='confidence') return renderConfidenceStandings();
    if (state.standingsView==='league') return renderStandingsTable(service.getStandings(),true,true);
    if (state.standingsView==='conference') {const groups=service.getConferenceStandings();return `<div class="content-grid content-grid--equal">${['AFC','NFC'].map(conf=>`<article class="card"><div class="card-header"><div><span class="eyebrow">Conference rankings</span><h3>${conf}</h3></div></div>${renderStandingsTable(groups[conf]||[],false,true)}</article>`).join('')}</div>`;}
    if (state.standingsView==='playoffs') return renderPlayoffPicture();
    const groups=service.getDivisionStandings();
    return `<div class="division-grid">${Object.entries(groups).map(([name,group])=>`<article class="card division-card"><div class="card-header"><div><span class="eyebrow">${name.split(' ')[0]}</span><h3>${name.split(' ').slice(1).join(' ')}</h3></div><span class="pill pill--neutral">${group[0]?.record||'0-0'} leader</span></div>${renderStandingsTable(group,false,false)}</article>`).join('')}</div>`;
  }

  function renderStandingsTable(group, wrapped=true, seeded=false) {
    const table = `<div class="table-wrap"><table class="standings-service-table"><thead><tr>${seeded?'<th>Rank</th>':''}<th>Team</th><th>W</th><th>L</th><th>T</th><th>PCT</th><th>DIV</th><th>CONF</th><th>PF</th><th>PA</th><th>DIFF</th><th>STRK</th></tr></thead><tbody>${group.map((row,index)=>{const team=teamById(row.teamId)||{};return `<tr class="clickable-row" data-team-id="${row.teamId}">${seeded?`<td><span class="seed">${row.leagueRank||row.conferenceRank||index+1}</span></td>`:''}<td><div class="table-team">${renderTeamMark(team)}<div><strong>${escapeHtml(row.team||team.fullName||row.teamId)}</strong><small>${row.conference} ${row.division}</small></div></div></td><td><strong>${row.wins}</strong></td><td>${row.losses}</td><td>${row.ties}</td><td>${Number(row.winPct).toFixed(3).replace(/^0/,'')}</td><td>${row.divisionRecord}</td><td>${row.conferenceRecord}</td><td>${row.pointsFor}</td><td>${row.pointsAgainst}</td><td class="${row.pointDifferential>=0?'streak--win':'streak--loss'}">${row.pointDifferential>=0?'+':''}${row.pointDifferential}</td><td><span class="streak ${String(row.streak).startsWith('W')?'streak--win':String(row.streak).startsWith('L')?'streak--loss':''}">${row.streak}</span></td></tr>`}).join('')}</tbody></table></div>`;
    return wrapped?`<article class="card">${table}</article>`:table;
  }

  function renderPlayoffPicture() {
    const picture=standingsService().getPlayoffPicture();
    return `<div class="playoff-grid">${['AFC','NFC'].map(conf=>{const data=picture[conf]||{seeds:[],inHunt:[]};return `<article class="card"><div class="card-header"><div><span class="eyebrow">Projected postseason</span><h3>${conf} Playoff Picture</h3></div><span class="pill pill--accent">7 teams qualify</span></div><div class="playoff-bracket">${data.seeds.map(row=>{const team=teamById(row.teamId);return `<div class="playoff-seed" data-team-id="${row.teamId}"><span class="seed">${row.seed}</span>${renderTeamMark(team)}<div><strong>${escapeHtml(row.team)}</strong><small>${row.type}</small></div><strong>${row.record}</strong></div>`}).join('')}${data.inHunt.length?`<div class="playoff-cutline-label">In the hunt</div>${data.inHunt.map(row=>{const team=teamById(row.teamId);return `<div class="playoff-seed playoff-seed--hunt" data-team-id="${row.teamId}"><span class="seed">—</span>${renderTeamMark(team)}<div><strong>${escapeHtml(row.team)}</strong><small>${row.pointDifferential>=0?'+':''}${row.pointDifferential} differential</small></div><strong>${row.record}</strong></div>`}).join('')}`:''}</div></article>`}).join('')}</div>`;
  }

  function renderConfidenceStandings() {
    const service=standingsService();
    const seasonRows=service.getConfidencePoolStandings();
    const maxWeek=Math.max(1,...(scheduleService()?.getAllGames?.()||[]).map(g=>Number(g.week)||1));
    const weeklyRows=service.getConfidencePoolWeek(state.confidenceStandingsWeek);
    const rows=state.confidenceStandingsView==='weekly'?weeklyRows:seasonRows;
    return `<div class="confidence-standings-shell">
      <article class="card confidence-standings-toolbar"><div><span class="eyebrow">Confidence Pool</span><h3>${state.confidenceStandingsView==='weekly'?`Week ${state.confidenceStandingsWeek} Results`:'Season Standings'}</h3><p>${state.confidenceStandingsView==='weekly'?'Compare points earned from completed games in the selected week.':'Track total points, correct picks, weekly wins, and remaining scoring potential.'}</p></div><div class="confidence-standings-controls"><div class="segmented-tabs"><button data-confidence-standings-view="season" class="${state.confidenceStandingsView==='season'?'is-active':''}">Season</button><button data-confidence-standings-view="weekly" class="${state.confidenceStandingsView==='weekly'?'is-active':''}">Weekly</button></div>${state.confidenceStandingsView==='weekly'?`<div class="week-nav compact"><button class="icon-button icon-button--small" data-confidence-standings-week="-1" ${state.confidenceStandingsWeek<=1?'disabled':''}>‹</button><strong>Week ${state.confidenceStandingsWeek}</strong><button class="icon-button icon-button--small" data-confidence-standings-week="1" ${state.confidenceStandingsWeek>=maxWeek?'disabled':''}>›</button></div>`:''}</div></article>
      <article class="card"><div class="table-wrap"><table class="confidence-standings-table"><thead><tr>${state.confidenceStandingsView==='weekly'?'<th>Rank</th><th>Owner</th><th>Team</th><th>Points</th><th>Correct</th><th>Final Games</th><th>Status</th>':'<th>Rank</th><th>Owner</th><th>Team</th><th>Total Points</th><th>Correct</th><th>Weeks Won</th><th>Average</th><th>Best Week</th><th>Max Remaining</th><th>Status</th>'}</tr></thead><tbody>${rows.map(row=>{const team=teamById(row.teamId);return `<tr><td><span class="seed">${row.rank}</span></td><td><strong>${escapeHtml(row.name)}</strong></td><td>${team?`<div class="table-team">${renderTeamMark(team)}<span>${team.abbr}</span></div>`:'—'}</td><td><strong>${state.confidenceStandingsView==='weekly'?row.points:row.totalPoints}</strong></td><td>${row.correctPicks}</td>${state.confidenceStandingsView==='weekly'?`<td>${row.finalGames}</td>`:`<td>${row.weeksWon}</td><td>${Number(row.averageWeeklyScore).toFixed(1)}</td><td>${row.bestWeek}</td><td>${row.remainingPossiblePoints}</td>`}<td><span class="pill ${row.status==='submitted'?'pill--success':'pill--neutral'}">${titleCase(row.status||'draft')}</span></td></tr>`}).join('')||`<tr><td colspan="${state.confidenceStandingsView==='weekly'?7:10}">No Confidence Pool entries have been saved yet.</td></tr>`}</tbody></table></div></article>
    </div>`;
  }

  function statisticsService() { return window.FranchiseHQ?.modules?.league?.statistics || window.FranchiseHQ?.leagueStatistics || null; }

  const statsColumnMap = {
    passing:[['games','GP'],['completions','CMP'],['attempts','ATT'],['compPct','CMP%'],['passingYards','YDS'],['passingTD','TD'],['interceptions','INT'],['yardsPerAttempt','Y/A'],['passerRating','RATE']],
    rushing:[['games','GP'],['carries','CAR'],['rushingYards','YDS'],['rushingTD','TD'],['yardsPerCarry','Y/C'],['fumbles','FUM'],['longRush','LONG']],
    receiving:[['games','GP'],['targets','TGT'],['receptions','REC'],['receivingYards','YDS'],['receivingTD','TD'],['yardsPerCatch','Y/R'],['drops','DROP'],['longReception','LONG']],
    defense:[['games','GP'],['tackles','TKL'],['tacklesForLoss','TFL'],['sacks','SACK'],['defensiveInterceptions','INT'],['passDeflections','PD'],['forcedFumbles','FF'],['fumbleRecoveries','FR'],['defensiveTD','TD']],
    kicking:[['games','GP'],['fgm','FGM'],['fga','FGA'],['fgPct','FG%'],['longFieldGoal','LONG'],['xpm','XPM'],['xpa','XPA'],['points','PTS']],
    punting:[['games','GP'],['punts','PUNTS'],['average','AVG'],['netAverage','NET'],['inside20','IN20'],['touchbacks','TB'],['longPunt','LONG']]
  };

  function runPlayerStatisticsCertification(){
    const rows=playerStatisticsState.rows||[];
    const certRows=rows.filter(row=>{
      const raw=statisticRaw(row);
      const stage=canonicalNormalizeStage(row.stage||raw.stage||raw.seasonStage);
      return stage!=='preseason';
    });
    const seasonYear=canonicalCurrentSeasonYear();
    const categories=['passing','rushing','receiving','defense','kicking','punting'];

    const checks=[];
    const add=(id,label,ok,detail,severity='required')=>{
      checks.push({id,label,ok:Boolean(ok),detail:String(detail||''),severity});
    };

    const rowsByCategory=new Map(categories.map(category=>[category,[]]));
    const playerIds=new Set();
    const teamIds=new Set();
    const weeks=new Set();
    const gameIds=new Set();
    let unresolvedPlayers=0;
    let unresolvedTeams=0;
    let malformedRows=0;
    let seasonMismatchRows=0;

    certRows.forEach(row=>{
      const raw=statisticRaw(row);
      const category=matchupPlayerCategory(row);
      if(rowsByCategory.has(category))rowsByCategory.get(category).push(row);

      const playerId=rowPlayerId(row);
      const teamId=rowTeamId(row);
      const week=Number(row.week??row.weekIndex??raw.week??raw.weekIndex);
      const directGame=statisticDirectGameId(row);
      const rowYear=Number(row.seasonYear??raw.seasonYear??raw.calendarYear);

      if(playerId){
        playerIds.add(String(playerId));
        const identity=matchupPlayerIdentity(playerId);
        if(!identity?.name||String(identity.name).startsWith('Player '))unresolvedPlayers+=1;
      }

      if(teamId){
        teamIds.add(String(teamId));
        const team=matchupTeam(teamId);
        if(!team?.id||team.fullName==='Team'||team.abbr==='TBD')unresolvedTeams+=1;
      }

      if(Number.isFinite(week))weeks.add(week);
      if(directGame)gameIds.add(String(directGame));

      if(!category||(!playerId&&!teamId))malformedRows+=1;
      if(Number.isFinite(seasonYear)&&Number.isFinite(rowYear)&&rowYear!==Number(seasonYear))seasonMismatchRows+=1;
    });

    const scheduleGames=liveTeamDirectory?.games||[];
    const completedGames=scheduleGames.filter(game=>{
      const status=(game.status||resolvedGameStatus(game,window.FranchiseHQ?.currentSeasonContext||null));
      const source=game.source||{};
      const stage=canonicalNormalizeStage(game.stage||game.stageLabel||source.stage||source.seasonStage);
      return status==='final'&&stage!=='preseason';
    });
    const completedGameIds=new Set(completedGames.map(game=>String(game.id||game.gameId||game.scheduleId||'')));

    let completedWithPlayerStats=0;
    completedGames.forEach(game=>{
      if(canonicalGameRows(game).some(row=>rowPlayerId(row)))completedWithPlayerStats+=1;
    });

    add('stats-loaded','Statistics snapshot loaded',playerStatisticsState.loaded&&rows.length>0,`${certRows.length.toLocaleString()} regular-season/playoff statistic rows loaded (${rows.length.toLocaleString()} total including preseason).`);
    add('season-context','Dynamic season context resolved',Number.isFinite(Number(seasonYear)),seasonYear?`Active franchise season: ${seasonYear}`:'No active season year could be resolved.');
    add('player-joins','Player identity joins',unresolvedPlayers===0,unresolvedPlayers===0?`${playerIds.size} unique player identities resolved.`:`${unresolvedPlayers} statistic rows reference unresolved players.`);
    add('team-joins','Team identity joins',unresolvedTeams===0,unresolvedTeams===0?`${teamIds.size} teams represented with valid identities.`:`${unresolvedTeams} statistic rows reference unresolved teams.`);
    add('row-shape','Statistic row integrity',malformedRows===0,malformedRows===0?'No malformed player/team statistic rows detected.':`${malformedRows} rows are missing a usable category or player/team identity.`);
    add('season-consistency','Season consistency',seasonMismatchRows===0,seasonMismatchRows===0?'Statistic rows align with the active season context.':`${seasonMismatchRows} rows belong to a different season than the active context.`,'warning');

    categories.forEach(category=>{
      const count=rowsByCategory.get(category)?.length||0;
      add(`category-${category}`,`${category[0].toUpperCase()+category.slice(1)} coverage`,count>0,`${count.toLocaleString()} ${category} rows available.`,category==='kicking'||category==='punting'?'warning':'required');
    });

    add(
      'week-coverage',
      'Weekly game-log coverage',
      weeks.size>0,
      weeks.size?`Weeks represented: ${[...weeks].sort((a,b)=>a-b).join(', ')}`:'No weekly player-stat records were detected.'
    );

    add(
      'completed-game-joins',
      'Completed regular/playoff matchup player-stat joins',
      completedGames.length===0||completedWithPlayerStats===completedGames.length,
      `${completedWithPlayerStats} of ${completedGames.length} completed games currently join to player-stat records.`,
      completedGames.length&&completedWithPlayerStats<completedGames.length?'warning':'required'
    );

    const liveStatsCategories=categories.filter(category=>(rowsByCategory.get(category)?.length||0)>0);
    add(
      'leaders-ready',
      'Stats & Leaders readiness',
      liveStatsCategories.length>=4,
      `${liveStatsCategories.length} of 6 player-stat categories have live leaderboard data.`
    );

    const playerCardReady=playerIds.size>0&&unresolvedPlayers===0;
    add(
      'player-card-ready',
      'Live Player Card readiness',
      playerCardReady,
      playerCardReady?'Live player identities are available for Player Card statistics and game logs.':'Player identity issues remain that can affect Player Cards.'
    );

    const requiredFailures=checks.filter(check=>check.severity==='required'&&!check.ok);
    const warnings=checks.filter(check=>check.severity==='warning'&&!check.ok);

    return {
      release:'5.9.9.0',
      seasonYear,
      generatedAt:new Date().toISOString(),
      rows:certRows.length,
      totalRows:rows.length,
      players:playerIds.size,
      teams:teamIds.size,
      weeks:[...weeks].sort((a,b)=>a-b),
      gameIds:gameIds.size,
      completedGames:completedGames.length,
      completedWithPlayerStats,
      checks,
      passed:requiredFailures.length===0,
      requiredFailures:requiredFailures.length,
      warnings:warnings.length
    };
  }

  function renderPlayerStatisticsCertification(){
    const result=runPlayerStatisticsCertification();

    const statusClass=result.passed?'pill--success':'pill--danger';
    const statusLabel=result.passed?'CERTIFIED':'ACTION REQUIRED';

    return `<section class="player-stats-certification">
      <div class="certification-summary-card">
        <div>
          <span class="eyebrow">5.9.6 Player Statistics Certification</span>
          <h2>${statusLabel}</h2>
          <p>${result.passed
            ? 'The live player-statistics pipeline passed all required integration checks.'
            : `${result.requiredFailures} required certification check${result.requiredFailures===1?'':'s'} failed.`}</p>
        </div>
        <span class="pill ${statusClass}">${statusLabel}</span>
      </div>

      <div class="certification-metrics">
        <div><span>Season</span><strong>${escapeHtml(result.seasonYear||'—')}</strong></div>
        <div><span>Certified Stat Rows</span><strong>${result.rows.toLocaleString()}</strong></div>
        <div><span>Players</span><strong>${result.players.toLocaleString()}</strong></div>
        <div><span>Teams</span><strong>${result.teams.toLocaleString()}</strong></div>
        <div><span>Weeks</span><strong>${result.weeks.length}</strong></div>
        <div><span>Warnings</span><strong>${result.warnings}</strong></div>
      </div>

      <div class="certification-check-list">
        ${result.checks.map(check=>`<article class="certification-check ${check.ok?'is-pass':check.severity==='warning'?'is-warning':'is-fail'}">
          <div class="certification-check__icon">${check.ok?'✓':check.severity==='warning'?'!':'×'}</div>
          <div>
            <strong>${escapeHtml(check.label)}</strong>
            <p>${escapeHtml(check.detail)}</p>
          </div>
          <span>${check.ok?'PASS':check.severity==='warning'?'WARN':'FAIL'}</span>
        </article>`).join('')}
      </div>

      <div class="certification-actions">
        <button type="button" class="btn btn-primary" data-run-player-stats-certification>Run Certification Again</button>
      </div>
    </section>`;
  }

  async function renderStats() {
    pageContent.innerHTML=`<div class="page-heading"><div><h1>Stats & Leaders</h1></div></div><section class="card stats-loading-shell"><div class="card-header"><div><h3>League Leaders</h3><p>Loading league statistics…</p></div><span class="pill pill--neutral">Loading</span></div></section>`;

    try{
      await Promise.all([
        loadLiveTeamDirectory(false),
        hydratePlayerStatistics(false)
      ]);
    }catch(error){
      console.warn('[Stats & Leaders Hydration]',error);
    }

    const categories=[['passing','Passing'],['rushing','Rushing'],['receiving','Receiving'],['defense','Defense'],['kicking','Kicking'],['punting','Punting'],['team','Team Statistics']];
    const year=canonicalCurrentSeasonYear();
    const games=liveTeamDirectory?.games||[];
    const regularSeasonWeeks=[...new Set(games
      .filter(game=>canonicalEffectiveStage(game.stage||game.phase||game.source?.stage,game.week??game.weekIndex??game.source?.weekIndex)==='regular-season')
      .map(game=>Number(game.week??game.weekIndex??game.source?.weekIndex)||1)
      .filter(week=>week>=1&&week<=18))].sort((a,b)=>a-b);
    const availableWeeks=regularSeasonWeeks.length?regularSeasonWeeks:[Number(liveTeamDirectory?.snapshot?.weekIndex)||1];
    if(!availableWeeks.includes(Number(state.statsWeek))) state.statsWeek=availableWeeks[availableWeeks.length-1];
    const liveTeams=liveTeamDirectory?.teams||[];
    const teamOptions=['<option value="All">All teams</option>',...liveTeams.map(team=>`<option value="${escapeHtml(team.id)}" ${String(state.statsTeam)===String(team.id)?'selected':''}>${escapeHtml(team.fullName||team.name||team.abbr||'Team')}</option>`)].join('');

    const content=state.statsCategory==='team'
      ? renderSeasonTeamStatistics()
      : renderLivePlayerStatisticsLeaderboard();

    pageContent.innerHTML=`
      <div class="page-heading">
        <div><h1>Stats & Leaders</h1></div>
      </div>

      <div class="stats-category-tabs segmented-tabs stats-category-tabs--wrap">
        ${categories.map(([key,label])=>`<button data-stats-category="${key}" class="${state.statsCategory===key?'is-active':''}">${label}</button>`).join('')}
      </div>
      ${state.statsCategory==='team'?'':`<article class="card stats-filter-card">
        <div class="stats-filter-grid">
          <label><span>View</span><select data-stats-scope><option value="season" ${state.statsScope==='season'?'selected':''}>Full Season</option><option value="week" ${state.statsScope==='week'?'selected':''}>Weekly Leaders</option></select></label>
          <label><span>Captured week</span><select data-stats-week ${state.statsScope!=='week'?'disabled':''}>${availableWeeks.map(week=>`<option value="${week}" ${Number(state.statsWeek)===week?'selected':''}>Week ${week}</option>`).join('')}</select></label>
          <label><span>Team</span><select data-stats-team>${teamOptions}</select></label>
          <label><span>Minimum games</span><select data-stats-min-games>${[0,1,3,5,8].map(n=>`<option value="${n}" ${Number(state.statsMinimumGames)===n?'selected':''}>${n||'Any'}</option>`).join('')}</select></label>
        </div>
      </article>`}
      ${content}`;
  }

  function liveStatsRowsForCategory(category='passing') {
    const rows=playerStatisticsState.rows||[];
    const currentYear=canonicalCurrentSeasonYear();
    const scopeWeek=state.statsScope==='week'?Number(state.statsWeek):null;

    return rows.filter(row=>{
      const raw=statisticRaw(row);
      const cat=matchupPlayerCategory(row);
      if(cat!==category)return false;

      const rowYear=Number(row.seasonYear??raw.seasonYear??raw.calendarYear);
      if(Number.isFinite(currentYear)&&Number.isFinite(rowYear)&&rowYear!==Number(currentYear))return false;

      const week=Number(row.week??row.weekIndex??raw.week??raw.weekIndex);
      const rowStage=canonicalStatStage(row);
      if(rowStage!=='regular-season')return false;
      if(scopeWeek&&week!==scopeWeek)return false;

      const teamId=rowTeamId(row);
      if(state.statsTeam&&state.statsTeam!=='All'&&String(teamId)!==String(state.statsTeam))return false;

      return true;
    });
  }

  const LIVE_LEADER_COLUMNS={
    passing:[['CMP',['passComp']],['ATT',['passAtt']],['CMP%',['passCompPct']],['YDS',['passYds','passYards']],['TD',['passTDs']],['INT',['passInts']],['Y/A',['passYdsPerAtt']],['Y/G',['__passYdsPerGame']],['RTG',['passRating']],['LONG',['passLongest']],['SACK',['passSacks']]],
    rushing:[['ATT',['rushAtt']],['YDS',['rushYds','rushYards']],['TD',['rushTDs']],['Y/A',['rushYdsPerAtt']],['Y/G',['__rushYdsPerGame']],['FUM',['rushFum']],['YACON',['rushYdsAfterContact']],['20+',['rush20PlusYds']],['LONG',['rushLongest']],['BTK',['rushBrokenTackles']]],
    receiving:[['REC',['recCatches']],['YDS',['recYards','recYds']],['TD',['recTDs']],['DROP',['recDrops']],['YAC',['recYdsAfterCatch','recYdsAfterCatc']],['Y/R',['recYdsPerCatch']],['Y/G',['__recYdsPerGame']],['LONG',['recLongest']]],
    defense:[['TKL',['defTotalTackles']],['SACK',['defSacks']],['INT',['defInts']],['FF',['defForcedFum']],['FR',['defFumRec']],['DEF',['defDeflections']],['INT YDS',['defIntReturnYds']],['TD',['defTDs']]],
    kicking:[['FGA',['fGAtt']],['FGM',['fGMade']],['FG%',['fGCompPct']],['50+ ATT',['fG50PlusAtt']],['50+ MADE',['fG50PlusMade']],['XPA',['xPAtt']],['XPM',['xPMade']],['LONG',['fGLongest']],['PTS',['kickPts']]],
    punting:[['PUNTS',['puntAtt']],['NET Y/P',['puntNetYdsPerAtt']],['IN20',['puntsIn20']],['TB',['puntTBs']],['LONG',['puntLongest']]]
  };

  function liveLeaderDefaultSort(category){
    return {passing:'YDS',rushing:'ATT',receiving:'REC',defense:'TKL',kicking:'PTS',punting:'PUNTS'}[category]||'YDS';
  }

  function aggregateLiveLeaderboard(category='passing'){
    const columns=LIVE_LEADER_COLUMNS[category]||[],rows=liveStatsRowsForCategory(category),players=new Map();
    rows.forEach(row=>{const playerId=rowPlayerId(row);if(!playerId)return;const identity=matchupPlayerIdentity(playerId),teamId=rowTeamId(row)||identity.teamId;let entry=players.get(playerId);if(!entry){entry={id:playerId,identity,teamId,rows:[],games:new Set(),values:{}};players.set(playerId,entry);}entry.rows.push(row);const raw=statisticRaw(row),week=Number(row.week??row.weekIndex??raw.week??raw.weekIndex),stage=canonicalEffectiveStage(row.stage||raw.stage||raw.seasonStage,week);if(Number.isFinite(week))entry.games.add(`${stage}:${week}`);});
    const list=[...players.values()].filter(entry=>entry.games.size>=Number(state.statsMinimumGames||0));list.forEach(entry=>{const totals=playerStatCategoryTotals(entry.rows,category);columns.forEach(([label])=>entry.values[label]=totals[label]??0);if(['passing','rushing','receiving'].includes(category))entry.values['Y/G']=entry.games.size?(Number(totals.YDS)||0)/entry.games.size:0;});
    const validLabels=new Set(columns.map(([label])=>label)),requestedSort=state.statsSortKey,sortLabel=requestedSort&&validLabels.has(requestedSort)?requestedSort:liveLeaderDefaultSort(category),direction=state.statsSortDirection==='asc'?1:-1;list.sort((a,b)=>((Number(a.values[sortLabel]||0)-Number(b.values[sortLabel]||0))*direction)||String(a.identity.name).localeCompare(String(b.identity.name)));return {list,columns,sortLabel};
  }

  function renderLivePlayerStatisticsLeaderboard(){
    const category=state.statsCategory||'passing';
    const {list,columns,sortLabel}=aggregateLiveLeaderboard(category);
    const leaders=list.slice(0,3);

    const leaderCards=leaders.length?`<div class="leader-grid">${leaders.map((entry,index)=>{
      const team=matchupTeam(entry.teamId);
      return `<article class="card live-leader-card" data-roster-player-detail="${escapeHtml(entry.id)}">
        <div class="live-leader-rank">#${index+1}</div>
        <div class="live-leader-team">${renderTeamMark(team,'mini-team')}</div>
        <div class="live-leader-copy"><span>${escapeHtml(team.abbr||'')}</span><button type="button" data-roster-player-detail="${escapeHtml(entry.id)}">${escapeHtml(entry.identity.name)}</button><small>${escapeHtml(entry.identity.position)}</small></div>
        <strong>${escapeHtml(formatLiveLeaderboardValue(sortLabel,entry.values[sortLabel]))}</strong>
        <em>${escapeHtml(sortLabel)}</em>
      </article>`;
    }).join('')}</div>`:'';

    const headers=['RK','Player','Team',...columns.map(([label])=>label)];
    const tableRows=list.map((entry,index)=>{
      const team=matchupTeam(entry.teamId);
      return [
        index+1,
        {html:`<button type="button" class="stats-player-link" data-roster-player-detail="${escapeHtml(entry.id)}">${escapeHtml(entry.identity.name)}</button><small>${escapeHtml(entry.identity.position)}</small>`},
        {html:`<span class="stats-team-cell">${renderTeamMark(team,'mini-team')}<strong>${escapeHtml(team.abbr||'—')}</strong></span>`},
        ...columns.map(([label])=>formatLiveLeaderboardValue(label,entry.values[label]))
      ];
    });

    return `${leaderCards}
      <article class="card live-leaderboard-card">
        <div class="card-header"><div><span class="eyebrow">${state.statsScope==='week'?`Week ${escapeHtml(state.statsWeek)}`:'Season'} leaderboard</span><h3>${escapeHtml(category[0].toUpperCase()+category.slice(1))}</h3></div><span class="pill pill--neutral">${list.length} players</span></div>
        ${renderLiveLeaderboardTable(`league-leaders-${category}`,headers,tableRows,columns)}
      </article>`;
  }

  function formatLiveLeaderboardValue(label,value){
    const n=Number(value);
    if(!Number.isFinite(n))return '—';
    if(label.includes('%'))return `${n.toFixed(1)}%`;
    if(['Y/A','Y/R','Y/G','RTG','NET Y/P'].includes(label))return n.toFixed(1);
    return Math.round(n).toLocaleString();
  }

  function renderLiveLeaderboardTable(tableId,headers,rows,columns){
    return `<div class="table-wrap live-leaderboard-wrap"><table id="${tableId}" class="live-leaderboard-table">
      <thead><tr>${headers.map((header,index)=>{
        const sortable=index>=3;
        const label=sortable?columns[index-3][0]:header;
        return `<th>${sortable?`<button type="button" data-live-stats-sort="${escapeHtml(label)}">${escapeHtml(header)} <span>↕</span></button>`:escapeHtml(header)}</th>`;
      }).join('')}</tr></thead>
      <tbody>${rows.length?rows.map(row=>`<tr>${row.map(cell=>`<td>${cell&&typeof cell==='object'&&cell.html?cell.html:escapeHtml(cell)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">No ${escapeHtml(state.statsCategory)} statistics are available for the selected filters.</td></tr>`}</tbody>
    </table></div>`;
  }

  const SEASON_TEAM_STAT_GROUPS=[
    {
      label:'Offense',
      columns:[
        ['PPG','offPtsPerGame','decimal'],
        ['Total Yds','offTotalYds','integer'],
        ['Yds Gained','offTotalYdsGained','integer'],
        ['Pass Yds','offPassYds','integer'],
        ['Pass TD','offPassTDs','integer'],
        ['Rush Yds','offRushYds','integer'],
        ['Rush TD','offRushTDs','integer'],
        ['1st Downs','off1stDowns','integer'],
        ['Sacks Allowed','offSacks','integer']
      ]
    },
    {
      label:'Situational Offense',
      columns:[
        ['3D ATT','off3rdDownAtt','integer'],
        ['3D CONV','off3rdDownConv','integer'],
        ['3D %','off3rdDownConvPct','percent'],
        ['4D ATT','off4thDownAtt','integer'],
        ['4D CONV','off4thDownConv','integer'],
        ['4D %','off4thDownConvPct','percent'],
        ['RZ ATT','offRedZones','integer'],
        ['RZ TD','offRedZoneTDs','integer'],
        ['RZ FG','offRedZoneFGs','integer'],
        ['RZ %','offRedZonePct','percent'],
        ['2PT ATT','off2PtAtt','integer'],
        ['2PT CONV','off2PtConv','integer'],
        ['2PT %','off2PtConvPct','percent']
      ]
    },
    {
      label:'Defense',
      columns:[
        ['PPG','defPtsPerGame','decimal'],
        ['Total Yds','defTotalYds','integer'],
        ['Pass Yds','defPassYds','integer'],
        ['Rush Yds','defRushYds','integer'],
        ['Sacks','defSacks','integer'],
        ['INT','defIntsRec','integer'],
        ['FF','defForcedFum','integer'],
        ['FR','defFumRec','integer'],
        ['RZ ATT','defRedZones','integer'],
        ['RZ TD','defRedZoneTDs','integer'],
        ['RZ FG','defRedZoneFGs','integer'],
        ['RZ %','defRedZonePct','percent']
      ]
    },
    {
      label:'Turnovers & Penalties',
      columns:[
        ['FUM Lost','offFumLost','integer'],
        ['INT Lost','offIntsLost','integer'],
        ['Giveaways','tOGiveaways','integer'],
        ['Takeaways','tOTakeaways','integer'],
        ['TO Diff','tODiff','signed'],
        ['Penalties','penalties','integer'],
        ['Penalty Yds','penaltyYds','integer']
      ]
    }
  ];

  function seasonTeamStatRows(){
    const currentYear=Number(canonicalCurrentSeasonYear());
    const rows=(playerStatisticsState.rows||[]).filter(row=>{
      if(String(row.category||'').toLowerCase()!=='team-game')return false;
      const raw=statisticRaw(row);
      const year=Number(row.seasonYear??raw.seasonYear??raw.calendarYear);
      const stage=canonicalNormalizeStage(row.stage||raw.stage||raw.seasonStage);
      if(stage==='preseason')return false;
      if(Number.isFinite(currentYear)&&Number.isFinite(year)&&year!==currentYear)return false;
      return Boolean(rowTeamId(row));
    });

    // Madden team records are season-to-date snapshots. Select the newest
    // available snapshot per team rather than summing weekly cumulative rows.
    const latest=new Map();
    rows.forEach(row=>{
      const teamId=rowTeamId(row);
      const raw=statisticRaw(row);
      const stage=canonicalNormalizeStage(row.stage||raw.stage||raw.seasonStage);
      const week=Number(row.week??row.weekIndex??raw.week??raw.weekIndex)||0;
      const current=latest.get(teamId);
      if(!current||week>current.week){
        latest.set(teamId,{row,week,stage});
      }
    });

    return [...latest.entries()].map(([teamId,item])=>{
      const row=item.row;
      const raw={...(row.source||{}),...(row.metrics||{}),...row};
      const team=matchupTeam(teamId);
      return {teamId,team,raw,week:item.week,stage:item.stage};
    });
  }

  function seasonTeamStatValue(raw={},field=''){
    const value=raw[field];
    if(value===undefined||value===null||value==='')return null;
    const number=Number(value);
    return Number.isFinite(number)?number:value;
  }

  function formatSeasonTeamStat(value,type='integer'){
    if(value===null||value===undefined||value==='')return '—';
    const n=Number(value);
    if(!Number.isFinite(n))return String(value);
    if(type==='percent')return `${n.toFixed(1)}%`;
    if(type==='decimal')return n.toFixed(1);
    if(type==='signed')return `${n>0?'+':''}${Math.round(n)}`;
    return Math.round(n).toLocaleString();
  }

  function renderSeasonTeamStatistics(){
    const allColumns=SEASON_TEAM_STAT_GROUPS.flatMap(group=>group.columns);
    const defaultKey='offPtsPerGame';
    const requested=state.teamStatsSortKey;
    const valid=new Set(allColumns.map(([,field])=>field));
    const sortKey=valid.has(requested)?requested:defaultKey;
    const direction=state.teamStatsSortDirection==='asc'?1:-1;

    const rows=seasonTeamStatRows();
    rows.sort((a,b)=>{
      const av=Number(seasonTeamStatValue(a.raw,sortKey));
      const bv=Number(seasonTeamStatValue(b.raw,sortKey));
      const aSafe=Number.isFinite(av)?av:(direction===1?Infinity:-Infinity);
      const bSafe=Number.isFinite(bv)?bv:(direction===1?Infinity:-Infinity);
      return (aSafe-bSafe)*direction||String(a.team.fullName||'').localeCompare(String(b.team.fullName||''));
    });

    const groupHeaders=SEASON_TEAM_STAT_GROUPS.map(group=>
      `<th class="season-team-group" colspan="${group.columns.length}">${escapeHtml(group.label)}</th>`
    ).join('');

    const headers=SEASON_TEAM_STAT_GROUPS.flatMap(group=>group.columns.map(([label,field])=>
      `<th><button type="button" class="${field===sortKey?'is-active':''}" data-season-team-sort="${escapeHtml(field)}">${escapeHtml(label)} <span>${field===sortKey?(direction===-1?'↓':'↑'):'↕'}</span></button></th>`
    )).join('');

    const body=rows.map((entry,index)=>{
      const team=entry.team;
      return `<tr>
        <td class="season-team-rank">${index+1}</td>
        <td class="season-team-team"><button type="button" data-team-id="${escapeHtml(entry.teamId)}">${renderTeamMark(team,'mini-team')}<span><strong>${escapeHtml(team.fullName||team.abbr||'Team')}</strong><small>${escapeHtml(team.record||'—')}</small></span></button></td>
        ${SEASON_TEAM_STAT_GROUPS.flatMap(group=>group.columns.map(([,field,type])=>
          `<td>${escapeHtml(formatSeasonTeamStat(seasonTeamStatValue(entry.raw,field),type))}</td>`
        )).join('')}
      </tr>`;
    }).join('');

    const year=canonicalCurrentSeasonYear();
    const latestWeek=rows.length?Math.max(...rows.map(row=>Number(row.week)||0)):0;

    return `<article class="card season-team-statistics-card">
      <div class="card-header">
        <div><span class="eyebrow">${escapeHtml(year||'Current Season')} Team Statistics</span><h3>Season Team Statistics</h3></div>
        <span class="pill pill--neutral">${rows.length} teams${latestWeek?` · Through Week ${latestWeek}`:''}</span>
      </div>
      <div class="season-team-stat-scroll-note">Showing 10 teams at a time · scroll vertically for the remaining teams · scroll horizontally for additional statistics</div>
      <div class="season-team-stat-table-wrap">
        <table class="season-team-stat-table">
          <thead>
            <tr><th rowspan="2">RK</th><th rowspan="2">Team</th>${groupHeaders}</tr>
            <tr>${headers}</tr>
          </thead>
          <tbody>${body||`<tr><td colspan="${2+allColumns.length}">No season team-statistics snapshot is available yet.</td></tr>`}</tbody>
        </table>
      </div>
    </article>`;
  }

  function renderTeamStatisticsLeaderboard(service){
    const options=[['scoringOffense','Scoring Offense'],['scoringDefense','Scoring Defense'],['totalOffense','Total Offense'],['passingOffense','Passing Offense'],['rushingOffense','Rushing Offense'],['turnoverDifferential','Turnover Differential'],['sacks','Sacks'],['pointDifferential','Point Differential']];
    const rows=service.getTeamRankings(state.statsTeamCategory);
    return `<article class="card stats-team-ranking-toolbar"><div><span class="eyebrow">Team comparison</span><h3>League Team Rankings</h3></div><label><span>Ranking category</span><select data-stats-team-category>${options.map(([key,label])=>`<option value="${key}" ${state.statsTeamCategory===key?'selected':''}>${label}</option>`).join('')}</select></label></article>
      <article class="card"><div class="table-wrap"><table class="statistics-table"><thead><tr><th>Rank</th><th>Team</th><th>Games</th><th>Value</th><th>League Average</th></tr></thead><tbody>${rows.map(row=>{const team=teamById(row.teamId);return `<tr class="clickable-row" data-team-id="${row.teamId}"><td><span class="seed">${row.rank}</span></td><td><div class="table-team">${team?renderTeamMark(team):''}<strong>${escapeHtml(row.team)}</strong></div></td><td>${row.games}</td><td><strong>${Number(row.value).toLocaleString(undefined,{maximumFractionDigits:1})}</strong></td><td>${Number(row.leagueAverage).toLocaleString(undefined,{maximumFractionDigits:1})}</td></tr>`}).join('')}</tbody></table></div></article>`;
  }

  function formatStatValue(key,value) {
    if (value===undefined||value===null) return '—';
    if (['compPct','fgPct'].includes(key)) return percent(value);
    if (['sacks','fantasy','yardsPerCatch'].includes(key)) return Number(value).toFixed(1);
    return Number(value).toLocaleString();
  }

  function renderLeaderCard(leader,rank,data) {
    if (leader.team) {
      const team=leader.team;
      return `<article class="leader-card card" data-rank="${rank}" data-team-id="${team.id}"><div class="leader-card__top"><span class="rank-number">#${rank}</span><span class="pill pill--neutral">${team.record}</span></div><div class="leader-card__player">${renderTeamMark(team,'team-logo')}<div><strong>${team.fullName}</strong><span>${team.conference} ${team.division}</span></div></div><strong class="leader-value">${leader.value}<small>${leader.label}</small></strong></article>`;
    }
    const player=leader.player; const team=teamById(player.teamId);
    return `<article class="leader-card card" data-rank="${rank}" data-player-id="${player.id}"><div class="leader-card__top"><span class="rank-number">#${rank}</span><span class="pill pill--neutral">${player.position}</span></div><div class="leader-card__player"><span class="player-avatar" style="${teamStyle(team)}">${player.initials}</span><div><strong>${escapeHtml(player.name)}</strong><span>${team.abbr} · ${player.overall} OVR</span></div></div><strong class="leader-value">${leader.value}<small>${leader.label}</small></strong></article>`;
  }

  function scheduleService() { return window.FranchiseHQ?.modules?.league?.games || window.FranchiseHQ?.leagueGames || null; }

  function confidencePoolModel() {
    const service=scheduleService();
    if(!service) return null;
    const current=window.FGC_TRADE?.getCurrentAccount?.() || {id:'commissioner',handle:'Commissioner',teamId:'dal'};
    return {service,current,config:service.confidence.config(),entry:service.confidence.getEntry(current.id)};
  }

  function renderConfidencePicks() {
    const model=confidencePoolModel();
    if(!model) return `<article class="card roadmap-state"><div class="roadmap-state__inner"><h3>Confidence Pool loading</h3><p>The Season & Games service is still initializing.</p></div></article>`;
    const {service,current,config,entry}=model;
    const week=service.getWeek(state.confidenceWeek);
    const weekOpen=service.confidence.isWeekOpen(state.confidenceWeek,current.id);const weekSubmitted=Boolean(entry.submittedWeeks?.[String(state.confidenceWeek)]);const locked=!weekOpen;
    const validation=service.confidence.validateEntry(current.id);
    return `<div class="confidence-pool-shell">
      <article class="card confidence-pool-status"><div><span class="eyebrow">Season ${config.season} Confidence Pool</span><h2>${weekSubmitted?`Week ${state.confidenceWeek} Submitted`:locked?`Week ${state.confidenceWeek} Closed`:`Week ${state.confidenceWeek} Open`}</h2><p>Submit each week separately while the Commissioner has that week open. Confidence values reset within each week.</p></div><div class="confidence-status-actions"><span class="pill ${locked?'pill--warning':'pill--success'}">${locked?'Locked':'Open'}</span><strong>${validation.picked} / ${validation.totalGames}</strong><small>games picked</small></div></article>
      <div class="week-control confidence-week-control"><div class="week-nav"><button class="icon-button icon-button--small" data-confidence-week-change="-1" ${state.confidenceWeek<=1?'disabled':''}><svg style="transform:rotate(90deg)"><use href="#icon-chevron"></use></svg></button><div class="week-label"><strong>Week ${state.confidenceWeek}</strong><span>${week.games.length} confidence values</span></div><button class="icon-button icon-button--small" data-confidence-week-change="1" ${state.confidenceWeek>=schedule.length?'disabled':''}><svg style="transform:rotate(-90deg)"><use href="#icon-chevron"></use></svg></button></div><div class="confidence-week-actions"><button class="button button--ghost" data-confidence-clear-week="${state.confidenceWeek}" ${locked?'disabled':''}>Clear Week</button><button class="button button--ghost button--danger-quiet" data-confidence-clear-season ${locked?'disabled':''}>Clear Season</button><button class="button button--ghost" data-confidence-auto="${state.confidenceWeek}" ${locked?'disabled':''}>Auto-Pick & Assign Week</button><button class="button button--primary" data-confidence-submit-week="${state.confidenceWeek}" ${locked?'disabled':''}>${weekSubmitted?'Week Submitted':'Submit Week'}</button></div></div>
      <div class="confidence-pick-list">${week.games.map(game=>{const away=teamById(game.awayId),home=teamById(game.homeId),pick=entry.picks?.[game.id]||{};return `<article class="card confidence-pick-card"><div class="confidence-matchup"><span>Week ${game.week}</span><strong>${away.abbr} @ ${home.abbr}</strong><small>${game.day} · ${game.time}</small></div><div class="confidence-team-choice"><button type="button" data-confidence-team="${game.id}:${away.id}" class="${pick.selectedTeamId===away.id?'is-selected':''}" ${locked?'disabled':''}>${renderTeamMark(away,'mini-team')}<span>${away.abbr}</span></button><button type="button" data-confidence-team="${game.id}:${home.id}" class="${pick.selectedTeamId===home.id?'is-selected':''}" ${locked?'disabled':''}>${renderTeamMark(home,'mini-team')}<span>${home.abbr}</span></button></div><label class="field confidence-value"><span>Confidence</span><select data-confidence-value="${game.id}" ${locked?'disabled':''}><option value="">Select</option>${week.games.map((_,i)=>`<option value="${i+1}" ${Number(pick.confidence)===i+1?'selected':''}>${i+1}</option>`).join('')}</select></label></article>`}).join('')}</div>
    </div>`;
  }

  function renderConfidenceResults() {
    const service=scheduleService();
    const board=service?.confidence?.leaderboard?.()||[];
    return `<article class="card confidence-results"><div class="card-header"><div><span class="eyebrow">Season leaderboard preview</span><h3>Confidence Pool Results</h3></div></div><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Owner</th><th>Team</th><th>Points</th><th>Correct</th><th>Status</th></tr></thead><tbody>${board.map((row,i)=>`<tr><td><strong>#${i+1}</strong></td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(teamById(row.teamId)?.abbr||'—')}</td><td><strong>${row.totalPoints}</strong></td><td>${row.correctPicks}</td><td><span class="pill ${row.status==='submitted'?'pill--success':'pill--neutral'}">${titleCase(row.status)}</span></td></tr>`).join('')||`<tr><td colspan="6">No Confidence Pool entries have been saved yet.</td></tr>`}</tbody></table></div></article>`;
  }


  const confidenceDirtyWeeks=new Set();
  function confidenceCurrentIdentity(){const snap=window.FranchiseHQ?.auth?.getSnapshot?.()||{};return snap.authenticated&&snap.user?{id:String(snap.user.id),name:window.FranchiseHQ?.auth?.getDisplayName?.()||snap.user.displayName||'Member',teamId:snap.membership?.teamId||null}:{id:'anonymous',name:'Member',teamId:null}}
  function confidenceUnsavedPrompt(){return !confidenceDirtyWeeks.size||confirm('You have Confidence Pool picks that have not been submitted for this week. Leave without submitting them?')}
  function renderScheduleConfidence(week,teamMap){const service=scheduleService(),identity=confidenceCurrentIdentity();if(!service?.confidence||identity.id==='anonymous')return'';const poolWeek=service.getWeek(week),entry=service.confidence.getEntry(identity.id),open=service.confidence.isWeekOpen(week,identity.id),submitted=Boolean(entry.submittedWeeks?.[String(week)]);if(!poolWeek?.games?.length)return'';return `<section class="schedule-confidence-shell"><div class="card schedule-confidence-head"><div><span class="eyebrow">Confidence Pool</span><h2>Week ${week} Picks</h2><p>Choose each winner and confidence value. Submit or clear this week independently.</p></div><div class="confidence-week-actions"><button class="button button--ghost" data-confidence-clear-week="${week}" ${!open?'disabled':''}>Clear Week</button><button class="button button--primary" data-confidence-submit-week="${week}" ${!open?'disabled':''}>${submitted?'Week Submitted':'Submit Week'}</button></div></div><div class="confidence-pick-list">${poolWeek.games.map(game=>{const away=teamMap.get(String(game.awayId))||teamById(game.awayId),home=teamMap.get(String(game.homeId))||teamById(game.homeId),pick=entry.picks?.[game.id]||{};return `<article class="card confidence-pick-card"><div class="confidence-matchup"><strong>${escapeHtml(away?.abbr||game.awayId)} @ ${escapeHtml(home?.abbr||game.homeId)}</strong></div><div class="confidence-team-choice"><button type="button" data-confidence-team="${game.id}:${game.awayId}" class="${pick.selectedTeamId===game.awayId?'is-selected':''}" ${!open?'disabled':''}>${away?renderTeamMark(away,'mini-team'):''}<span>${escapeHtml(away?.abbr||game.awayId)}</span></button><button type="button" data-confidence-team="${game.id}:${game.homeId}" class="${pick.selectedTeamId===game.homeId?'is-selected':''}" ${!open?'disabled':''}>${home?renderTeamMark(home,'mini-team'):''}<span>${escapeHtml(home?.abbr||game.homeId)}</span></button></div><label class="field confidence-value"><span>Confidence</span><select data-confidence-value="${game.id}" ${!open?'disabled':''}><option value="">Select</option>${poolWeek.games.map((_,i)=>`<option value="${i+1}" ${Number(pick.confidence)===i+1?'selected':''}>${i+1}</option>`).join('')}</select></label></article>`}).join('')}</div></section>`}
  async function renderSchedule() {
    preloadScheduleMatchupData();
    pageContent.innerHTML='<section class="empty-state"><strong>Loading schedule…</strong><p>Reading league data.</p></section>';
    try{
      const service=liveReadModel();
      if(!service) throw new Error('Live Read Model service is unavailable.');
      const [stateValue,snapshot,teamRows,standingRows,gameRows]=await Promise.all([
        service.getState(),service.getSnapshot(),service.getTeams(),service.getStandings(),service.getSchedule()
      ]);
      if(stateValue!=='live'||!snapshot) throw new Error('No active live snapshot is available.');
      const liveTeams=teamRows.map(liveTeamUiShape);
      const teamMap=new Map(liveTeams.map(team=>[String(team.id),team]));
      const provisional=gameRows.map(game=>liveGameShape(game,teamMap));
      const current=authoritativeSeasonContext(snapshot,standingRows,provisional);
      const games=gameRows.map(game=>liveGameShape(game,teamMap,current));
      window.FranchiseHQ=window.FranchiseHQ||{};
      window.FranchiseHQ.currentSeasonContext=current;
      // 6.3.2: Confidence Pool uses the exact canonical schedule returned by the
      // LIVE read model (the same rows rendered directly below), never a stale
      // League Data / demo schedule.
      scheduleService()?.hydrateCanonicalSchedule?.(gameRows,teamRows,current);

      const phases=['preseason','regular','playoffs'].filter(phase=>games.some(game=>game.stage===phase));
      if(!phases.includes(state.schedulePhase)) state.schedulePhase=phases.includes(current.phase)?current.phase:(phases[0]||'regular');
      const phaseGames=games.filter(game=>game.stage===state.schedulePhase);
      const weeks=[...new Set(phaseGames.map(game=>Number(game.week)).filter(Boolean))].sort((a,b)=>a-b);
      if(!weeks.includes(Number(state.scheduleWeek))) state.scheduleWeek=weeks.includes(current.week)&&state.schedulePhase===current.phase?current.week:(weeks[0]||1);
      const filtered=phaseGames.filter(game=>Number(game.week)===Number(state.scheduleWeek))
        .filter(game=>state.scheduleTeam==='All'||String(game.homeTeamId)===String(state.scheduleTeam)||String(game.awayTeamId)===String(state.scheduleTeam));
      const phaseLabel=state.schedulePhase==='preseason'?'Preseason':state.schedulePhase==='playoffs'?'Playoffs':'Regular Season';

      pageContent.innerHTML=`
        <div class="page-heading"><div><span class="eyebrow">Franchise calendar</span><h1>League Schedule</h1><p>${escapeHtml(current.displayLabel)}</p></div></div>
        <div class="filter-bar live-schedule-controls">
          <div class="segmented-tabs">${phases.map(phase=>`<button type="button" data-live-schedule-phase="${phase}" class="${state.schedulePhase===phase?'is-active':''}">${phase==='preseason'?'Preseason':phase==='regular'?'Regular Season':'Playoffs'}</button>`).join('')}</div>
          <label class="field"><span>Week</span><select data-live-schedule-week>${weeks.map(week=>`<option value="${week}" ${Number(state.scheduleWeek)===week?'selected':''}>${state.schedulePhase==='playoffs'?({1:'Wild Card',2:'Divisional Round',3:'Conference Championship',4:'Super Bowl'}[week]||`Playoff Week ${week}`):`${phaseLabel} Week ${week}`}</option>`).join('')}</select></label>
          <label class="field"><span>Filter team</span><select data-schedule-team><option value="All">All teams</option>${liveTeams.map(team=>`<option value="${team.id}" ${String(state.scheduleTeam)===String(team.id)?'selected':''}>${escapeHtml(team.abbr)} · ${escapeHtml(team.fullName)}</option>`).join('')}</select></label>
          <span class="pill pill--success">${escapeHtml(current.displayLabel)} current</span>
        </div>
        <div class="schedule-grid">${filtered.length?filtered.map(game=>renderLiveScheduleCard(game,teamMap,current)).join(''):`<article class="card roadmap-state"><div class="roadmap-state__inner"><h3>No games available</h3><p>No schedule records are available for this phase and week.</p></div></article>`}</div>${state.schedulePhase==='regular'?renderScheduleConfidence(Number(state.scheduleWeek),teamMap):''}`;
    }catch(error){
      pageContent.innerHTML=`<section class="empty-state"><strong>Schedule unavailable</strong><p>${escapeHtml(error?.message||'The schedule could not be loaded.')}</p></section>`;
    }
  }

  function renderLiveScheduleCard(game,teamMap,current) {
    liveMatchupGames.set(String(game.id||''),game);
    const away=teamMap.get(String(game.awayTeamId))||{fullName:'Away Team',record:'',abbr:'AWY'};
    const home=teamMap.get(String(game.homeTeamId))||{fullName:'Home Team',record:'',abbr:'HME'};
    const isFinal=game.status==='final';
    const isLive=game.status==='live';
    const scoresAvailable=game.awayScore!==null&&game.homeScore!==null;
    const winnerId=isFinal&&scoresAvailable?(game.awayScore>game.homeScore?String(game.awayTeamId):String(game.homeTeamId)):null;
    const label=canonicalScheduleLabel(game);
    return `<button type="button" class="game-card card" data-game-id="${escapeHtml(game.id||'')}">
      <div class="game-card__meta"><span>${escapeHtml(label)}</span><span class="pill ${isFinal?'pill--neutral':isLive?'pill--danger':'pill--accent'}">${isFinal?'Final':isLive?'Live':'Upcoming'}</span></div>
      <div class="game-card__body">
        <div class="game-team">${renderTeamMark(away)}<div><strong>${escapeHtml(away.fullName)}</strong><span>${escapeHtml(away.record||'')}</span></div></div>
        ${scoresAvailable?`<div class="game-score"><strong class="${winnerId===String(game.awayTeamId)?'streak--win':''}">${game.awayScore}</strong><span>–</span><strong class="${winnerId===String(game.homeTeamId)?'streak--win':''}">${game.homeScore}</strong></div>`:`<div class="game-time"><strong>TBD</strong><span>${isFinal?'Score unavailable':'Scheduled'}</span></div>`}
        <div class="game-team game-team--away"><div><strong>${escapeHtml(home.fullName)}</strong><span>${escapeHtml(home.record||'')}</span></div>${renderTeamMark(home)}</div>
      </div>
      <div class="game-card__footer"><span>${escapeHtml(game.source?.stadiumName||game.source?.stadium||'')}</span><span>${isFinal?'Completed game':isLive?'In progress':Number(game.week)<Number(current.week)&&game.stage===current.phase?'Historical record':'Upcoming matchup'}</span></div>
    </button>`;
  }

  function renderGameCard(game, perspectiveTeamId=null) {
    const away=teamById(game.awayId); const home=teamById(game.homeId);
    const isFinal=game.status==='final'; const isLive=game.status==='live';
    const winnerId=isFinal||isLive?(game.awayScore>game.homeScore?away.id:home.id):null;
    return `<article class="game-card card" data-game-id="${game.id}">
      <div class="game-card__meta"><span>WEEK ${game.week} · ${game.day}</span><span class="pill ${isFinal?'pill--neutral':isLive?'pill--danger':'pill--accent'}">${isFinal?'Final':isLive?'Live':game.time}</span></div>
      <div class="game-card__body">
        <div class="game-team">${renderTeamMark(away)}<div><strong>${away.fullName}</strong><span>${away.record}${perspectiveTeamId===away.id?' · Your team':''}</span></div></div>
        ${isFinal||isLive?`<div class="game-score"><strong class="${winnerId===away.id?'streak--win':''}">${game.awayScore}</strong><span>–</span><strong class="${winnerId===home.id?'streak--win':''}">${game.homeScore}</strong></div>`:`<div class="game-time"><strong>${game.time}</strong><span>${game.network}</span></div>`}
        <div class="game-team game-team--away"><div><strong>${home.fullName}</strong><span>${home.record}${perspectiveTeamId===home.id?' · Your team':''}</span></div>${renderTeamMark(home)}</div>
      </div>
      <div class="game-card__footer"><span>${game.stadium}</span><span>${isLive?'Live game data':isFinal?'View game summary':'Matchup preview'}</span></div>
    </article>`;
  }

  function transactionMaddenWeekLabel(transaction={}) {
    const type=transactionDisplayType(transaction);
    if(type==='drafted')return'Offseason';

    const week=Number(transaction.week);
    const rawStage=transaction.stage||transaction.seasonStage||transaction.phase||transaction.raw?.stage||'';
    const stage=String(rawStage||'').toLowerCase();

    // A raw lifecycle week of 0 does not contain enough evidence to claim a
    // specific preseason week. Never relabel it using the CURRENT live week.
    if(week===0)return 'Preseason';

    if(Number.isFinite(week)){
      const postseason=typeof canonicalPostseasonMeta==='function'?canonicalPostseasonMeta(week,stage):null;
      if(postseason?.full)return postseason.full;
      if(stage.includes('pre'))return `Preseason Week ${week}`;
      return `Week ${week}`;
    }
    return '—';
  }

  function transactionPlayerMove(transaction={},playerId=''){
    const wanted=String(playerId||'');
    return transactionMoves(transaction).find(move=>
      String(move?.playerId??move?.id??'')===wanted
    )||transactionMoves(transaction)[0]||{};
  }

  function transactionOriginTeamId(transaction={},playerId=''){
    const type=transactionDisplayType(transaction);
    const move=transactionPlayerMove(transaction,playerId);
    const nonFa=(transaction.teamIds||[]).find(id=>String(id).toUpperCase()!=='FA');

    if(['signing','drafted','waiver-claim'].includes(type))return move.toTeamId||nonFa||'FA';
    if(['release','waived'].includes(type))return move.fromTeamId||nonFa||'FA';
    if(type==='signed-off-practice-squad')return move.toTeamId||nonFa||move.fromTeamId||'FA';
    if(['practice-squad-signing','practice-squad-promotion','practice-squad-demotion','ir-placement','ir-activation'].includes(type)){
      return move.fromTeamId||move.toTeamId||nonFa||'FA';
    }
    if(type==='trade'||type==='team-change')return move.fromTeamId||nonFa||'FA';
    return move.fromTeamId||move.toTeamId||nonFa||'FA';
  }

  function transactionOriginTeamName(transaction={},playerId=''){
    const id=transactionOriginTeamId(transaction,playerId);
    if(id==null||String(id).toUpperCase()==='FA')return'Free Agent';
    const team=transactionTeamByCanonicalId(id);
    return team?.fullName||team?.name||team?.abbr||String(id);
  }

  function transactionTablePlayerRows(transaction={}){
    const players=transactionPlayerRows(transaction);
    const type=transactionDisplayType(transaction);
    const action=transactionEventLabel(type);
    const week=transactionMaddenWeekLabel(transaction);

    if(!players.length){
      return [{
        team:transactionOriginTeamName(transaction,''),
        player:'Roster movement recorded',
        playerId:'',
        position:'—',
        overall:'—',
        action,
        actionType:type,
        week
      }];
    }

    return players.map(player=>({
      team:transactionOriginTeamName(transaction,player.id),
      player:player.name||'Unknown Player',
      playerId:player.id||'',
      position:player.position||'—',
      overall:Number.isFinite(Number(player.overall))?Number(player.overall):'—',
      action,
      actionType:type,
      week
    }));
  }

  function renderLeagueTransactionTable(payload){
    const publicRows=(payload?.transactions||[]).filter(transactionIsPubliclyVisible);
    const teamOptions=(liveTeamDirectory?.teams||[]).slice().sort((a,b)=>String(a.fullName||a.abbr).localeCompare(String(b.fullName||b.abbr)));
    const typeOptions=[...new Set(publicRows.map(row=>transactionDisplayType(row)).filter(Boolean))]
      .sort((a,b)=>transactionEventLabel(a).localeCompare(transactionEventLabel(b)));

    const matchesTeam=row=>{
      if(state.transactionTeam==='all')return true;
      const team=transactionTeamByCanonicalId(state.transactionTeam)||teamOptions.find(t=>canonicalTeamAliases(t).has(String(state.transactionTeam).toLowerCase()));
      return team?transactionInvolvesTeam(row,team):(row.teamIds||[]).map(String).includes(String(state.transactionTeam));
    };

    const q=String(state.transactionSearch||'').trim().toLowerCase();
    const matchesSearch=row=>{
      if(!q)return true;
      const players=transactionPlayerRows(row);
      const teams=(row.teamIds||[]).map(id=>transactionTeamByCanonicalId(id)).filter(Boolean);
      return [
        transactionEventLabel(transactionDisplayType(row)),
        transactionMaddenWeekLabel(row),
        ...players.map(p=>p.name),
        ...teams.flatMap(t=>[t.fullName,t.abbr])
      ].filter(Boolean).join(' ').toLowerCase().includes(q);
    };

    const transactions=publicRows
      .filter(row=>state.transactionType==='all'||transactionDisplayType(row)===state.transactionType)
      .filter(matchesTeam)
      .filter(matchesSearch)
      .sort((a,b)=>(Number(b.season||0)-Number(a.season||0))||(Number(b.week||0)-Number(a.week||0))||((new Date(b.occurredAt||b.createdAt||0).getTime()||0)-(new Date(a.occurredAt||a.createdAt||0).getTime()||0)));

    const tableRows=transactions.flatMap(transaction=>transactionTablePlayerRows(transaction));

    pageContent.innerHTML=`<div class="page-heading"><div><h1>Transactions</h1></div></div>
      <div class="filter-bar league-transaction-filters">
        <label class="field field--grow"><span>Search</span><input data-transaction-search value="${escapeHtml(state.transactionSearch||'')}" placeholder="Player, team, transaction..."></label>
        <label class="field"><span>Type</span><select data-transaction-type><option value="all">All Types</option>${typeOptions.map(type=>`<option value="${escapeHtml(type)}" ${state.transactionType===type?'selected':''}>${escapeHtml(transactionEventLabel(type))}</option>`).join('')}</select></label>
        <label class="field"><span>Team</span><select data-transaction-team><option value="all">All Teams</option>${teamOptions.map(team=>`<option value="${escapeHtml(String(team.id))}" ${String(state.transactionTeam)===String(team.id)?'selected':''}>${escapeHtml(team.fullName||team.abbr)}</option>`).join('')}</select></label>
        <span class="result-count">${tableRows.length} player row${tableRows.length===1?'':'s'}</span>
      </div>
      ${tableRows.length?`<article class="card transaction-table-card"><div class="table-wrap transaction-table-wrap"><table class="league-transactions-table">
        <thead><tr><th>Team Name</th><th>Player Name</th><th>Position</th><th>Overall</th><th>Action</th><th>Madden Week</th></tr></thead>
        <tbody>${tableRows.map(row=>`<tr ${row.playerId?`class="clickable-row" data-roster-player-detail="${escapeHtml(row.playerId)}"`:''}>
          <td><strong>${escapeHtml(row.team)}</strong></td>
          <td><strong>${escapeHtml(row.player)}</strong></td>
          <td>${escapeHtml(row.position)}</td>
          <td>${escapeHtml(row.overall)}</td>
          <td><span class="pill pill--${transactionEventTone(row.actionType)}">${escapeHtml(row.action)}</span></td>
          <td>${escapeHtml(row.week)}</td>
        </tr>`).join('')}</tbody>
      </table></div></article>`:`<article class="card roadmap-state"><div class="roadmap-state__inner"><h3>No transactions found</h3><p>No public executed transactions match the current filters.</p></div></article>`}`;
  }

  async function renderLeagueTransactions() {
    // Performance rule: never refetch or recompute the ledger when the five-minute
    // canonical UI cache is already warm. Paint from memory immediately.
    const cached=canonicalTransactionUiCache?.payload;
    if(cached){
      renderLeagueTransactionTable(cached);
      return;
    }

    pageContent.innerHTML=`<div class="page-heading"><div><h1>Transactions</h1></div></div>
      <article class="card transaction-table-card transaction-table-loading" aria-busy="true">
        <div class="table-wrap transaction-table-wrap">
          <table class="league-transactions-table">
            <thead><tr><th>Team Name</th><th>Player Name</th><th>Position</th><th>Overall</th><th>Action</th><th>Madden Week</th></tr></thead>
            <tbody>${Array.from({length:6},()=>`<tr class="transaction-skeleton-row"><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td><td><span></span></td></tr>`).join('')}</tbody>
          </table>
        </div>
      </article>`;

    try{
      const payload=await loadCanonicalTransactionsForUi(false);
      if(routeBase(currentAppRoute())!=='transactions')return;
      renderLeagueTransactionTable(payload);
    }catch(error){
      console.error('[League Transactions]',error);
      pageContent.innerHTML=`<div class="page-heading"><div><h1>Transactions</h1></div></div><article class="card roadmap-state"><div class="roadmap-state__inner"><h3>Transactions unavailable</h3><p>${escapeHtml(error?.message||'The transaction ledger could not be loaded.')}</p></div></article>`;
    }
  }

  function renderNews() {
    const dynamicNews = window.FGC_TRADE?.getApprovedNews?.() || [];
    const allNews = [...dynamicNews, ...newsArticles];
    const categories=['All',...new Set(allNews.map(a=>a.category))];
    const filtered=allNews.filter(a=>state.newsCategory==='All'||a.category===state.newsCategory);
    const featured=filtered.find(a=>a.featured)||filtered[0]||allNews[0];
    const rest=filtered.filter(a=>a.id!==featured.id);
    pageContent.innerHTML = `
      <div class="page-heading"><div><span class="eyebrow">Stories, announcements, and activity</span><h1>League News</h1><p>Approved trades, game recaps, power rankings, awards, commissioner updates, and automated league stories.</p></div><div class="heading-actions"><button class="button button--primary" data-demo-toast="The commissioner news editor will be connected after authentication and database setup."><svg><use href="#icon-news"></use></svg>Create post</button></div></div>
      <div class="filter-bar"><div class="segmented-tabs">${categories.map(category=>`<button data-news-category="${escapeHtml(category)}" class="${state.newsCategory===category?'is-active':''}">${escapeHtml(category)}</button>`).join('')}</div><span class="result-count">${filtered.length} stories</span></div>
      <article class="featured-news" data-news-id="${featured.id}"><div class="featured-news__content"><span class="pill pill--accent">${escapeHtml(featured.category)}</span><h2>${escapeHtml(featured.title)}</h2><p>${escapeHtml(featured.excerpt)}</p><div class="news-meta"><span>${escapeHtml(featured.author)}</span><span>•</span><span>${escapeHtml(featured.time)}</span><span>•</span><span>${escapeHtml(featured.read)}</span></div></div></article>
      <div class="news-grid">${rest.map(article=>renderNewsCard(article)).join('')}</div>`;
  }

  function renderNewsCard(article) {
    return `<article class="news-card card" data-news-id="${article.id}"><div class="news-card__art" data-mark="${escapeHtml(article.mark)}"><span class="pill pill--neutral">${escapeHtml(article.category)}</span></div><div class="news-card__body"><span class="eyebrow">${escapeHtml(article.time)}</span><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(article.excerpt)}</p><div class="news-card__footer"><span>${escapeHtml(article.author)}</span><span>${escapeHtml(article.read)}</span></div></div></article>`;
  }

  function renderDesignSystem() {
    pageContent.innerHTML = `
      <div class="page-heading"><div><span class="eyebrow">Milestone 1A foundation</span><h1>Design System</h1><p>The reusable foundation now supports every interactive league page included in Milestone 1B.</p></div><div class="heading-actions"><button class="button button--primary" data-open-style-panel><svg><use href="#icon-palette"></use></svg>Preview appearance</button></div></div>
      <div class="design-section"><div class="section-heading"><div><span class="section-number">01</span><h2>Foundation</h2></div><p>Dark stadium-inspired surfaces with a replaceable accent system and responsive typography.</p></div><div class="foundation-grid"><article class="card"><div class="card-header"><div><span class="eyebrow">Color</span><h3>Core palette</h3></div></div><div class="swatch-grid"><div><span class="swatch swatch--canvas"></span><strong>Canvas</strong><small>#0B0E14</small></div><div><span class="swatch swatch--surface"></span><strong>Surface</strong><small>#131821</small></div><div><span class="swatch swatch--surface2"></span><strong>Raised</strong><small>#1A202B</small></div><div><span class="swatch swatch--accent"></span><strong>Accent</strong><small>${accents[state.accent].hex.toUpperCase()}</small></div><div><span class="swatch swatch--success"></span><strong>Success</strong><small>#39D98A</small></div><div><span class="swatch swatch--danger"></span><strong>Danger</strong><small>#FF5C6C</small></div></div></article><article class="card"><div class="card-header"><div><span class="eyebrow">Type</span><h3>Typography</h3></div></div><div class="type-samples"><div class="type-sample type-sample--display">League Command Center</div><div class="type-sample type-sample--heading">Trade Committee Review</div><div class="type-sample type-sample--body">Built for fast scanning, dense sports information, and clear transaction decisions.</div></div></article></div></div>
      <div class="design-section"><div class="section-heading"><div><span class="section-number">02</span><h2>Components</h2></div><p>Shared components now power league pages, profiles, filters, tables, schedules, and news.</p></div><article class="card"><div class="component-showcase"><div class="component-row"><div class="component-label"><strong>Actions</strong><small>Primary, secondary, quiet, and destructive</small></div><div class="component-demo"><button class="button button--primary">Primary action</button><button class="button button--secondary">Secondary</button><button class="button button--ghost">Ghost</button><button class="button button--danger">Decline</button></div></div><div class="component-row"><div class="component-label"><strong>Status</strong><small>Workflow and health labels</small></div><div class="component-demo"><span class="pill pill--success">Approved</span><span class="pill pill--warning">Pending</span><span class="pill pill--danger">Rejected</span><span class="pill pill--accent">Private</span><span class="pill pill--neutral">Mock data</span></div></div><div class="component-row"><div class="component-label"><strong>Team identity</strong><small>Color-aware fallback marks</small></div><div class="component-demo">${teams.slice(0,7).map(team=>renderTeamMark(team,'team-logo')).join('')}</div></div></div></article></div>`;
  }

  function renderRoadmap(route) {
    const data = {
      'trade-center': { title:'Private Trade Center', eyebrow:'Milestone 1C', icon:'icon-swap', copy:'Saved drafts, owner-to-owner negotiation rooms, revisions, acceptance, committee review, and final decisions will be built after the league-view experience.', items:['Private draft builder','Owner negotiation room','Versioned revisions','Committee submission','Approval announcements','Rejection feedback'] },
      'trade-block': { title:'Trade Block', eyebrow:'Milestone 1C', icon:'icon-tag', copy:'Owners will advertise available players, team needs, preferred return types, and contact options without exposing private trade calculations.', items:['Player availability','Team needs','Position filters','Owner contact','Watchlist alerts','Add to trade'] },
      commissioner: { title:'Commissioner HQ', eyebrow:'Future operations milestone', icon:'icon-sliders', copy:'League member assignments, committee roles, Madden export health, calculator settings, news controls, and audit records will live here.', items:['Discord assignments','Export status','Trade rules','Committee settings','News editor','Audit log'] }
    }[route] || { title:'Coming Soon',eyebrow:'Project roadmap',icon:'icon-construction',copy:'This area is prepared for a later milestone.',items:[] };
    pageContent.innerHTML=`<div class="page-heading"><div><span class="eyebrow">${data.eyebrow}</span><h1>${data.title}</h1><p>${data.copy}</p></div></div><article class="roadmap-state card"><div class="roadmap-state__inner"><div class="roadmap-icon"><svg><use href="#${data.icon}"></use></svg></div><h2>${data.title} is next in the build plan</h2><p>${data.copy}</p><div class="roadmap-list">${data.items.map(item=>`<span><svg><use href="#icon-check"></use></svg>${item}</span>`).join('')}</div><div class="heading-actions" style="justify-content:center"><button class="button button--primary" data-route="home">Return home</button><button class="button button--ghost" data-route="design-system">View design system</button></div></div></article>`;
  }

  function gameRosterRows(teamId) {
    return players.filter(p=>p.teamId===teamId).sort((a,b)=>{
      const unitOrder=p=>offensePositions.includes(p.position)?0:defensePositions.includes(p.position)?1:2;
      return unitOrder(a)-unitOrder(b)||b.overall-a.overall||a.position.localeCompare(b.position);
    });
  }

  function compactSeasonStats(player) {
    const s=player.stats;
    if(player.position==='QB') return `${s.passingYards.toLocaleString()} YDS · ${s.passingTD} TD · ${s.interceptions} INT`;
    if(['RB','FB'].includes(player.position)) return `${s.rushingYards.toLocaleString()} RUSH · ${s.rushingTD} TD`;
    if(['WR','TE'].includes(player.position)) return `${s.receptions} REC · ${s.receivingYards.toLocaleString()} YDS`;
    if(defensePositions.includes(player.position)) return `${s.tackles} TKL · ${Number(s.sacks).toFixed(1)} SCK · ${s.interceptions} INT`;
    if(player.position==='K') return `${s.fgm}/${s.fga} FG`;
    return `${s.punts||0} PUNTS · ${Number(s.average||0).toFixed(1)} AVG`;
  }

  function renderGameRoster(team) {
    return `<div class="game-center-roster">
      <div class="game-center-roster-head">${renderTeamMark(team,'team-logo')}<span><strong>${team.fullName}</strong><small>${team.record} · ${team.ovr} OVR</small></span></div>
      <div class="game-center-player-list">
        ${gameRosterRows(team.id).map(player=>`<button type="button" data-open-player-card="${player.id}">
          <span class="gc-position">${player.position}</span>
          <span><strong>${escapeHtml(player.name)}</strong><small>${compactSeasonStats(player)}</small></span>
          <span class="rating-chip ${player.overall>=90?'rating-chip--elite':player.overall>=84?'rating-chip--high':''}">${player.overall}</span>
          <span class="dev-badge ${devClass(player.dev)}">${player.dev}</span>
        </button>`).join('')}
      </div>
    </div>`;
  }

  function gameStatValue(player, game, metric, low, high) {
    const base=seededNumber(`${game.id}-${player.id}-${metric}`,low,high);
    return Math.max(0,base);
  }

  function gameStatRows(team, game, category) {
    const roster=players.filter(p=>p.teamId===team.id);
    if(category==='passing'){
      return roster.filter(p=>p.position==='QB').slice(0,2).map(p=>({
        player:p, values:[
          `${gameStatValue(p,game,'cmp',14,31)}/${gameStatValue(p,game,'att',25,43)}`,
          gameStatValue(p,game,'passyd',145,385),
          gameStatValue(p,game,'passtd',0,4),
          gameStatValue(p,game,'passint',0,2)
        ]
      }));
    }
    if(category==='rushing'){
      return roster.filter(p=>['RB','FB','QB'].includes(p.position)).slice(0,4).map(p=>({
        player:p, values:[
          gameStatValue(p,game,'car',2,22),
          gameStatValue(p,game,'rushyd',8,142),
          gameStatValue(p,game,'rushtd',0,2),
          Number((gameStatValue(p,game,'rushavg',20,72)/10).toFixed(1))
        ]
      })).sort((a,b)=>b.values[1]-a.values[1]);
    }
    if(category==='receiving'){
      return roster.filter(p=>['WR','TE','RB'].includes(p.position)).slice(0,6).map(p=>({
        player:p, values:[
          gameStatValue(p,game,'rec',1,10),
          gameStatValue(p,game,'recyd',8,138),
          gameStatValue(p,game,'rectd',0,2),
          gameStatValue(p,game,'targets',2,13)
        ]
      })).sort((a,b)=>b.values[1]-a.values[1]);
    }
    if(category==='defense'){
      return roster.filter(p=>defensePositions.includes(p.position)).slice(0,7).map(p=>({
        player:p, values:[
          gameStatValue(p,game,'tkl',1,12),
          Number((gameStatValue(p,game,'sack',0,20)/10).toFixed(1)),
          gameStatValue(p,game,'defint',0,1),
          gameStatValue(p,game,'tfl',0,4)
        ]
      })).sort((a,b)=>b.values[0]-a.values[0]);
    }
    return roster.filter(p=>specialPositions.includes(p.position)).map(p=>({
      player:p,
      values:p.position==='K'
        ? [`${gameStatValue(p,game,'fgm',0,4)}/${gameStatValue(p,game,'fga',1,4)}`,`${gameStatValue(p,game,'xpm',1,5)}/${gameStatValue(p,game,'xpa',1,5)}`,gameStatValue(p,game,'longfg',31,58),'—']
        : [gameStatValue(p,game,'punts',2,7),Number((gameStatValue(p,game,'puntavg',390,512)/10).toFixed(1)),gameStatValue(p,game,'inside20',0,4),'—']
    }));
  }

  function renderGameStatTable(team, game, category, labels) {
    const rows=gameStatRows(team,game,category);
    return `<div class="game-stat-team">
      <div class="game-stat-team-head">${renderTeamMark(team,'team-logo')}<strong>${team.abbr}</strong></div>
      <div class="game-stat-table">
        <div class="game-stat-row game-stat-row--head"><span>Player</span>${labels.map(x=>`<span>${x}</span>`).join('')}</div>
        ${rows.map(row=>`<button type="button" class="game-stat-row" data-open-player-card="${row.player.id}">
          <span><strong>${escapeHtml(row.player.name)}</strong><small>${row.player.position}</small></span>
          ${row.values.map(v=>`<span>${v}</span>`).join('')}
        </button>`).join('')}
      </div>
    </div>`;
  }

  function renderCompletedGameStats(away,home,game) {
    const groups=[
      ['Passing','passing',['C/A','YDS','TD','INT']],
      ['Rushing','rushing',['CAR','YDS','TD','AVG']],
      ['Receiving','receiving',['REC','YDS','TD','TGT']],
      ['Defense','defense',['TKL','SCK','INT','TFL']],
      ['Special Teams','special',['FG/P','XP/AVG','LONG/I20','—']]
    ];
    return `<div class="completed-game-stats">
      ${groups.map(([title,key,labels])=>`<section class="game-stat-section">
        <div class="game-stat-section-title"><span class="eyebrow">Box score</span><h3>${title}</h3></div>
        <div class="game-stat-pair">${renderGameStatTable(away,game,key,labels)}${renderGameStatTable(home,game,key,labels)}</div>
      </section>`).join('')}
    </div>`;
  }

  function gameCenterSwitcher(activeGameId) {
    const currentWeek=schedule.find(w=>w.games.some(g=>g.id===activeGameId)) || schedule.find(w=>w.week===8);
    return `<div class="game-center-switcher">
      ${currentWeek.games.map(g=>{
        const a=teamById(g.awayId),h=teamById(g.homeId);
        return `<button type="button" data-game-center-switch="${g.id}" class="${g.id===activeGameId?'is-active':''}">
          <span>${a.abbr} <b>at</b> ${h.abbr}</span>
          <small>${g.status==='final'?`${g.awayScore}-${g.homeScore}`:`${g.day} · ${g.time}`}</small>
        </button>`;
      }).join('')}
    </div>`;
  }

  function gameTeamStatRows(away, home, game) {
    const final=game.status==='final';
    const make=(label,awayValue,homeValue)=>({label,awayValue,homeValue});
    if(final){
      return [
        make('Total Offense',gameStatValue(away,game,'teamoff',265,515),gameStatValue(home,game,'teamoff',265,515)),
        make('Passing Yards',gameStatValue(away,game,'teampass',150,390),gameStatValue(home,game,'teampass',150,390)),
        make('Rushing Yards',gameStatValue(away,game,'teamrush',55,205),gameStatValue(home,game,'teamrush',55,205)),
        make('First Downs',gameStatValue(away,game,'firstdowns',14,29),gameStatValue(home,game,'firstdowns',14,29)),
        make('Turnovers',gameStatValue(away,game,'turnovers',0,4),gameStatValue(home,game,'turnovers',0,4)),
        make('3rd Down',`${gameStatValue(away,game,'thirdmade',2,9)}/${gameStatValue(away,game,'thirdatt',8,15)}`,`${gameStatValue(home,game,'thirdmade',2,9)}/${gameStatValue(home,game,'thirdatt',8,15)}`),
        make('Red Zone',`${gameStatValue(away,game,'rzmade',1,5)}/${gameStatValue(away,game,'rzatt',2,6)}`,`${gameStatValue(home,game,'rzmade',1,5)}/${gameStatValue(home,game,'rzatt',2,6)}`),
        make('Time of Possession',`${gameStatValue(away,game,'topmin',24,35)}:${String(gameStatValue(away,game,'topsec',0,59)).padStart(2,'0')}`,`${gameStatValue(home,game,'topmin',24,35)}:${String(gameStatValue(home,game,'topsec',0,59)).padStart(2,'0')}`)
      ];
    }
    return [
      make('Overall',away.ovr,home.ovr),
      make('Offense',away.off,home.off),
      make('Defense',away.def,home.def),
      make('Points / Game',(away.pf/7).toFixed(1),(home.pf/7).toFixed(1)),
      make('Points Allowed / Game',(away.pa/7).toFixed(1),(home.pa/7).toFixed(1)),
      make('Point Differential',away.pf-away.pa,home.pf-home.pa)
    ];
  }

  function renderTeamStatsTab(away,home,game){
    const rows=gameTeamStatRows(away,home,game);
    return `<section class="game-center-tab-panel">
      <div class="game-center-section-heading"><span class="eyebrow">${game.status==='final'?'Final comparison':'Pregame comparison'}</span><h3>Team Stats</h3></div>
      <div class="team-stat-board">
        <div class="team-stat-board-head">
          <span>${renderTeamMark(away,'team-logo')}<strong>${away.abbr}</strong></span>
          <span>Team Stats</span>
          <span><strong>${home.abbr}</strong>${renderTeamMark(home,'team-logo')}</span>
        </div>
        ${rows.map(row=>`<div class="team-stat-board-row"><strong>${row.awayValue}</strong><span>${row.label}</span><strong>${row.homeValue}</strong></div>`).join('')}
      </div>
    </section>`;
  }

  function renderPlayerStatsTab(away,home,game){
    if(game.status==='final'){
      return `<section class="game-center-tab-panel">
        <div class="game-center-section-heading"><span class="eyebrow">Final box score</span><h3>Player Stats</h3></div>
        ${renderCompletedGameStats(away,home,game)}
      </section>`;
    }
    return `<section class="game-center-tab-panel">
      <div class="game-center-section-heading"><span class="eyebrow">Pregame</span><h3>Full Rosters & Current-Year Stats</h3></div>
      <div class="game-center-rosters">${renderGameRoster(away)}${renderGameRoster(home)}</div>
    </section>`;
  }

  function topGamePerformers(team,game){
    const roster=players.filter(p=>p.teamId===team.id);
    const candidates=roster.map(p=>{
      let value=0;
      let line='';
      if(p.position==='QB'){
        const y=gameStatValue(p,game,'passyd',145,385),td=gameStatValue(p,game,'passtd',0,4);
        value=y+(td*60); line=`${y} PASS YDS · ${td} TD`;
      }else if(['RB','FB'].includes(p.position)){
        const y=gameStatValue(p,game,'rushyd',8,142),td=gameStatValue(p,game,'rushtd',0,2);
        value=y+(td*75); line=`${y} RUSH YDS · ${td} TD`;
      }else if(['WR','TE'].includes(p.position)){
        const y=gameStatValue(p,game,'recyd',8,138),td=gameStatValue(p,game,'rectd',0,2);
        value=y+(td*75); line=`${y} REC YDS · ${td} TD`;
      }else if(defensePositions.includes(p.position)){
        const t=gameStatValue(p,game,'tkl',1,12),s=gameStatValue(p,game,'sack',0,20)/10,i=gameStatValue(p,game,'defint',0,1);
        value=t*7+s*35+i*80; line=`${t} TKL · ${s.toFixed(1)} SCK · ${i} INT`;
      }else{
        const fg=gameStatValue(p,game,'fgm',0,4);
        value=fg*30; line=`${fg} FG MADE`;
      }
      return {player:p,value,line};
    });
    return candidates.sort((a,b)=>b.value-a.value).slice(0,3);
  }

  function recapStoryData(away,home,game){
    const awayTop=topGamePerformers(away,game);
    const homeTop=topGamePerformers(home,game);
    const allTop=[...awayTop,...homeTop].sort((a,b)=>b.value-a.value).slice(0,3);
    const isFinal=game.status==='final';
    const winner=isFinal?(game.awayScore>game.homeScore?away:home):null;
    const loser=isFinal?(winner.id===away.id?home:away):null;
    const winnerScore=isFinal?Math.max(game.awayScore,game.homeScore):null;
    const loserScore=isFinal?Math.min(game.awayScore,game.homeScore):null;
    const margin=isFinal?winnerScore-loserScore:0;
    const mvp=allTop[0];

    const closeGame=isFinal&&margin<=7;
    const decisive=isFinal&&margin>=17;
    const headline=isFinal
      ? closeGame
        ? `${winner.name} survive ${loser.name} in a Week ${game.week} thriller`
        : decisive
          ? `${winner.name} roll past ${loser.name}, ${winnerScore}-${loserScore}`
          : `${winner.name} defeat ${loser.name} in Week ${game.week}`
      : `${away.name} and ${home.name} meet in a Week ${game.week} showcase`;

    const story=isFinal
      ? `${winner.fullName} secured a ${winnerScore}-${loserScore} victory at ${game.stadium}. ${mvp.player.name} led the way with ${mvp.line.toLowerCase()}, while the ${winner.name} delivered the defining plays in a ${closeGame?'tightly contested finish':decisive?'commanding performance':'complete team win'}.`
      : `${away.fullName} and ${home.fullName} are scheduled for ${game.day} at ${game.time}. The matchup features two rosters looking to strengthen their position in the Season 4 standings.`;

    const social=isFinal
      ? `${winner.abbr} ${winnerScore}, ${loser.abbr} ${loserScore} | ${mvp.player.name}: ${mvp.line} | Season 4, Week ${game.week}`
      : `${away.abbr} vs ${home.abbr} | ${game.day}, ${game.time} | Season 4, Week ${game.week}`;

    return {awayTop,homeTop,allTop,isFinal,winner,loser,winnerScore,loserScore,margin,mvp,headline,story,social};
  }

  function recapFormatDetails(format){
    return {
      landscape:{label:'Broadcast',ratio:'16:9',width:1600,height:900},
      square:{label:'Social',ratio:'1:1',width:1200,height:1200},
      story:{label:'Story',ratio:'9:16',width:1080,height:1920}
    }[format] || {label:'Broadcast',ratio:'16:9',width:1600,height:900};
  }

  function renderRecapTab(away,home,game){
    const recap=recapStoryData(away,home,game);
    const formats=['landscape','square','story'];
    return `<section class="game-center-tab-panel recap-tab">
      <div class="recap-studio-toolbar">
        <div>
          <span class="eyebrow">TC-011.1 · Broadcast Recap Generator</span>
          <h3>Recap Studio</h3>
          <p>Automatically transforms the final score and box score into a broadcast-ready league graphic.</p>
        </div>
        <div class="recap-studio-actions">
          <button type="button" class="button button--ghost" data-copy-recap="${game.id}">Copy Story</button>
          <button type="button" class="button button--primary" data-export-recap="${game.id}" ${recap.isFinal?'':'disabled'}>Download PNG</button>
        </div>
      </div>

      <div class="recap-format-picker">
        <span>Output format</span>
        <div>${formats.map(format=>{
          const details=recapFormatDetails(format);
          return `<button type="button" data-recap-format="${format}" class="${state.recapFormat===format?'is-active':''}">
            <strong>${details.label}</strong><small>${details.ratio}</small>
          </button>`;
        }).join('')}</div>
      </div>

      ${!recap.isFinal?`<div class="recap-availability-note"><strong>Pregame preview active</strong><span>The final broadcast graphic and player rankings unlock after the game result is imported.</span></div>`:''}

      <div class="broadcast-recap broadcast-recap--${state.recapFormat}" data-recap-capture="${game.id}" style="--recap-away:${away.primary};--recap-home:${home.primary}">
        <div class="broadcast-recap-topline">
          <span>FRANCHISE HQ ${recap.isFinal?'GAME RECAP':'GAME PREVIEW'}</span>
          <span>SEASON 4 · WEEK ${game.week}</span>
        </div>
        <div class="broadcast-recap-score">
          <div>${renderTeamMark(away,'featured-team-logo')}<strong>${away.abbr}</strong><small>${away.fullName}</small></div>
          <span><b>${recap.isFinal?game.awayScore:'—'}</b><em>${recap.isFinal?'FINAL':'VS'}</em><b>${recap.isFinal?game.homeScore:'—'}</b></span>
          <div>${renderTeamMark(home,'featured-team-logo')}<strong>${home.abbr}</strong><small>${home.fullName}</small></div>
        </div>
        <div class="broadcast-recap-story">
          <span class="eyebrow">${game.day} · ${game.time} · ${game.stadium}</span>
          <h3>${recap.headline}</h3>
          <p>${recap.story}</p>
        </div>
        <div class="broadcast-stars">
          ${recap.allTop.map((entry,index)=>`
            <button type="button" data-open-player-card="${entry.player.id}" class="${index===0?'is-mvp':''}">
              <span class="broadcast-star-rank">${index===0?'MVP':`#${index+1}`}</span>
              <span><strong>${escapeHtml(entry.player.name)}</strong><small>${entry.player.position} · ${teamById(entry.player.teamId).abbr}</small></span>
              <em>${entry.line}</em>
            </button>`).join('')}
        </div>
        <div class="broadcast-recap-footer">
          <span>Generated from imported Franchise HQ game data</span>
          <span>FURIOUS GAMING COMMUNITY</span>
        </div>
      </div>

      <div class="recap-story-panel">
        <div><span class="eyebrow">Generated headline</span><h4>${recap.headline}</h4></div>
        <div><span class="eyebrow">Generated game story</span><p>${recap.story}</p></div>
        <div><span class="eyebrow">Social caption</span><p>${recap.social}</p></div>
      </div>
    </section>`;
  }

  function canvasRoundRect(ctx,x,y,w,h,r){
    const radius=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+radius,y);
    ctx.arcTo(x+w,y,x+w,y+h,radius);
    ctx.arcTo(x+w,y+h,x,y+h,radius);
    ctx.arcTo(x,y+h,x,y,radius);
    ctx.arcTo(x,y,x+w,y,radius);
    ctx.closePath();
  }

  function drawWrappedText(ctx,text,x,y,maxWidth,lineHeight,maxLines){
    const words=String(text).split(/\s+/);
    const lines=[];
    let current='';
    words.forEach(word=>{
      const next=current?`${current} ${word}`:word;
      if(ctx.measureText(next).width>maxWidth&&current){
        lines.push(current);
        current=word;
      }else current=next;
    });
    if(current) lines.push(current);
    const shown=lines.slice(0,maxLines);
    shown.forEach((line,index)=>ctx.fillText(line,x,y+(index*lineHeight)));
    return shown.length*lineHeight;
  }

  function hexToRgb(hex){
    const clean=String(hex||'#263449').replace('#','');
    const value=parseInt(clean.length===3?clean.split('').map(x=>x+x).join(''):clean,16);
    return {r:(value>>16)&255,g:(value>>8)&255,b:value&255};
  }

  function mixColor(hex,amount=.35){
    const {r,g,b}=hexToRgb(hex);
    return `rgb(${Math.round(r*amount)},${Math.round(g*amount)},${Math.round(b*amount)})`;
  }

  function downloadRecapPng(gameId){
    const game=schedule.flatMap(week=>week.games).find(item=>item.id===gameId);
    if(!game||game.status!=='final'){
      showToast('Final result required','Import the completed game before exporting its broadcast recap.');
      return;
    }
    const away=teamById(game.awayId),home=teamById(game.homeId);
    const recap=recapStoryData(away,home,game);
    const format=recapFormatDetails(state.recapFormat);
    const canvas=document.createElement('canvas');
    canvas.width=format.width;
    canvas.height=format.height;
    const ctx=canvas.getContext('2d');
    const W=canvas.width,H=canvas.height;
    const pad=Math.round(W*.055);
    const portrait=H>W;

    const bg=ctx.createLinearGradient(0,0,W,0);
    bg.addColorStop(0,mixColor(away.primary,.52));
    bg.addColorStop(.47,'#08101b');
    bg.addColorStop(.53,'#08101b');
    bg.addColorStop(1,mixColor(home.primary,.52));
    ctx.fillStyle=bg;
    ctx.fillRect(0,0,W,H);

    ctx.globalAlpha=.16;
    ctx.fillStyle='#ffffff';
    for(let i=-H;i<W+H;i+=90){
      ctx.save();
      ctx.translate(i,0);
      ctx.rotate(-.45);
      ctx.fillRect(0,0,3,H*1.5);
      ctx.restore();
    }
    ctx.globalAlpha=1;

    ctx.fillStyle='rgba(5,10,18,.78)';
    ctx.fillRect(0,0,W,Math.round(H*.09));
    ctx.fillRect(0,H-Math.round(H*.07),W,Math.round(H*.07));

    ctx.fillStyle='#ffffff';
    ctx.font=`900 ${Math.round(W*.018)}px Arial`;
    ctx.textAlign='left';
    ctx.fillText('FRANCHISE HQ GAME RECAP',pad,Math.round(H*.057));
    ctx.textAlign='right';
    ctx.fillText(`SEASON 4 · WEEK ${game.week}`,W-pad,Math.round(H*.057));

    const logoY=portrait?Math.round(H*.22):Math.round(H*.25);
    const logoSize=portrait?Math.round(W*.25):Math.round(W*.13);
    const leftX=portrait?Math.round(W*.26):Math.round(W*.22);
    const rightX=portrait?Math.round(W*.74):Math.round(W*.78);

    [[away,leftX],[home,rightX]].forEach(([team,x])=>{
      ctx.fillStyle='rgba(4,8,14,.62)';
      canvasRoundRect(ctx,x-logoSize/2,logoY-logoSize/2,logoSize,logoSize,logoSize*.22);
      ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.28)';
      ctx.lineWidth=Math.max(2,W*.002);
      ctx.stroke();
      ctx.fillStyle='#fff';
      ctx.font=`900 ${Math.round(logoSize*.25)}px Arial`;
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText(team.abbr,x,logoY);
      ctx.textBaseline='alphabetic';
      ctx.font=`900 ${Math.round(W*.032)}px Arial`;
      ctx.fillText(team.abbr,x,logoY+logoSize*.76);
      ctx.font=`600 ${Math.round(W*.012)}px Arial`;
      ctx.fillStyle='rgba(255,255,255,.72)';
      ctx.fillText(team.fullName.toUpperCase(),x,logoY+logoSize*.94);
    });

    ctx.textAlign='center';
    ctx.fillStyle='#fff';
    ctx.font=`900 ${Math.round(portrait?W*.13:W*.072)}px Arial`;
    const scoreY=logoY+Math.round(logoSize*.05);
    ctx.fillText(`${game.awayScore}  –  ${game.homeScore}`,W/2,scoreY);
    ctx.font=`900 ${Math.round(W*.013)}px Arial`;
    ctx.fillStyle='#9aa8bb';
    ctx.fillText('FINAL',W/2,scoreY+Math.round(H*.055));

    const storyTop=portrait?Math.round(H*.42):Math.round(H*.48);
    ctx.fillStyle='rgba(4,8,14,.72)';
    canvasRoundRect(ctx,pad,storyTop,W-pad*2,portrait?Math.round(H*.22):Math.round(H*.20),Math.round(W*.016));
    ctx.fill();

    ctx.fillStyle='#53e6c1';
    ctx.font=`900 ${Math.round(W*.012)}px Arial`;
    ctx.textAlign='center';
    ctx.fillText(`${game.day.toUpperCase()} · ${game.time.toUpperCase()} · ${game.stadium.toUpperCase()}`,W/2,storyTop+Math.round(H*.038));

    ctx.fillStyle='#fff';
    ctx.font=`900 ${Math.round(portrait?W*.052:W*.035)}px Arial`;
    const headlineY=storyTop+Math.round(H*.09);
    drawWrappedText(ctx,recap.headline,W/2,headlineY,W-pad*3,Math.round(H*.045),2);

    ctx.fillStyle='rgba(255,255,255,.75)';
    ctx.font=`500 ${Math.round(W*.014)}px Arial`;
    const storyY=headlineY+Math.round(H*.1);
    drawWrappedText(ctx,recap.story,W/2,storyY,W-pad*3,Math.round(H*.028),portrait?5:3);

    const starsY=portrait?Math.round(H*.69):Math.round(H*.72);
    const starGap=Math.round(W*.018);
    const starW=portrait?W-pad*2:Math.round((W-pad*2-starGap*2)/3);
    const starH=portrait?Math.round(H*.075):Math.round(H*.14);

    recap.allTop.forEach((entry,index)=>{
      const x=portrait?pad:pad+index*(starW+starGap);
      const y=portrait?starsY+index*(starH+Math.round(H*.012)):starsY;
      ctx.fillStyle=index===0?'rgba(83,230,193,.16)':'rgba(4,8,14,.72)';
      canvasRoundRect(ctx,x,y,starW,starH,Math.round(W*.012));
      ctx.fill();
      ctx.strokeStyle=index===0?'rgba(83,230,193,.7)':'rgba(255,255,255,.14)';
      ctx.lineWidth=Math.max(2,W*.0015);
      ctx.stroke();

      ctx.textAlign='left';
      ctx.fillStyle=index===0?'#53e6c1':'#9aa8bb';
      ctx.font=`900 ${Math.round(W*.011)}px Arial`;
      ctx.fillText(index===0?'GAME MVP':`TOP PERFORMER #${index+1}`,x+Math.round(W*.014),y+Math.round(starH*.28));
      ctx.fillStyle='#fff';
      ctx.font=`900 ${Math.round(W*.018)}px Arial`;
      ctx.fillText(entry.player.name,x+Math.round(W*.014),y+Math.round(starH*.53));
      ctx.fillStyle='#53e6c1';
      ctx.font=`700 ${Math.round(W*.011)}px Arial`;
      ctx.fillText(entry.line,x+Math.round(W*.014),y+Math.round(starH*.78));
    });

    ctx.fillStyle='#fff';
    ctx.font=`800 ${Math.round(W*.012)}px Arial`;
    ctx.textAlign='left';
    ctx.fillText('FURIOUS GAMING COMMUNITY',pad,H-Math.round(H*.025));
    ctx.textAlign='right';
    ctx.fillStyle='#9aa8bb';
    ctx.fillText(`${format.label.toUpperCase()} · GENERATED BY FRANCHISE HQ`,W-pad,H-Math.round(H*.025));

    const link=document.createElement('a');
    link.download=`franchise-hq-week-${game.week}-${away.abbr}-${home.abbr}-${state.recapFormat}.png`;
    link.href=canvas.toDataURL('image/png',1);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Broadcast recap downloaded',`${format.label} PNG exported at ${format.width} × ${format.height}.`);
  }

  function renderGameCenterTabs(away,home,game){
    const tabs=[['team','Team'],['player','Player'],['recap','Recap']];
    return `<div class="game-center-tabs">
      ${tabs.map(([key,label])=>`<button type="button" data-game-center-tab="${key}" class="${state.gameCenterTab===key?'is-active':''}">${label}</button>`).join('')}
    </div>
    <div class="game-center-tab-content">
      ${state.gameCenterTab==='team'?renderTeamStatsTab(away,home,game):state.gameCenterTab==='player'?renderPlayerStatsTab(away,home,game):renderRecapTab(away,home,game)}
    </div>`;
  }

  function openGameDetail(gameId) {
    const game=schedule.flatMap(week=>week.games).find(item=>item.id===gameId);
    if (!game) return;
    const away=teamById(game.awayId),home=teamById(game.homeId);
    const isFinal=game.status==='final',isLive=game.status==='live';

    openDetail(`
      <div class="game-center-shell" style="--game-away:${away.primary};--game-home:${home.primary}">
        <header class="game-center-topbar">
          <div class="game-center-schedule-info">
            <span class="eyebrow">Season 4 · Week ${game.week}</span>
            <strong>${game.day} · ${game.time}</strong>
            <small>${game.network} · ${game.stadium}</small>
          </div>
          <div class="game-center-title"><span class="eyebrow">${isFinal?'Final':isLive?'Live':'Scheduled'}</span><h2>Game Center</h2></div>
          <button type="button" class="icon-button game-center-close" data-close-detail aria-label="Close Game Center"><svg><use href="#icon-close"></use></svg></button>
        </header>

        ${gameCenterSwitcher(game.id)}

        <div class="game-center-matchup">
          <div class="game-center-team game-center-team--away">
            ${renderTeamMark(away,'featured-team-logo')}
            <span>${away.city}</span><strong>${away.name}</strong><small>${away.record} · ${escapeHtml(away.owner)}</small>
          </div>
          <div class="game-center-score">
            <span>${isFinal?'Final':isLive?'Live':`${game.day} · ${game.time}`}</span>
            <strong>${isFinal||isLive?`${game.awayScore}<b>–</b>${game.homeScore}`:'VS'}</strong>
            <small>${game.network} · ${game.stadium}</small>
          </div>
          <div class="game-center-team game-center-team--home">
            ${renderTeamMark(home,'featured-team-logo')}
            <span>${home.city}</span><strong>${home.name}</strong><small>${home.record} · ${escapeHtml(home.owner)}</small>
          </div>
        </div>

        <div class="game-center-body">
          ${renderGameCenterTabs(away,home,game)}
        </div>
      </div>`);
  }

  function openNewsDetail(newsId) {
    const article=[...(window.FGC_TRADE?.getApprovedNews?.() || []), ...newsArticles].find(item=>item.id===newsId);
    if (!article) return;
    openDetail(`<div class="modal-hero"><div><span class="pill pill--accent">${escapeHtml(article.category)}</span><h2>${escapeHtml(article.title)}</h2><div class="news-meta"><span>${escapeHtml(article.author)}</span><span>•</span><span>${escapeHtml(article.time)}</span><span>•</span><span>${escapeHtml(article.read)}</span></div></div></div><div class="modal-body"><p><strong>${escapeHtml(article.excerpt)}</strong></p><p>This is a mock long-form news story showing how commissioner articles, automated recaps, trade announcements, weekly awards, and analysis can be presented inside the finished league site.</p><p>When the Madden export is connected, game results and statistical changes can provide structured facts for automatically generated stories. Commissioners will still control what becomes public and can edit the final wording before publication.</p><div class="modal-summary-grid"><div><span>Category</span><strong>${escapeHtml(article.category)}</strong></div><div><span>Visibility</span><strong>League Public</strong></div><div><span>Source</span><strong>Mock Data</strong></div></div><div class="heading-actions" style="justify-content:flex-start"><button class="button button--primary" data-close-detail>Back to news</button><button class="button button--ghost" data-demo-toast="Discord cross-posting will be connected when the Discord bot is built."><svg><use href="#icon-external"></use></svg>Preview Discord post</button></div></div>`);
  }

  function openDetail(html) {
    detailContent.innerHTML=html;
    detailModal.classList.add('is-open');
    detailModal.setAttribute('aria-hidden','false');
    body.style.overflow='hidden';
  }

  function closeDetail() {
    detailModal.classList.remove('is-open');
    detailModal.setAttribute('aria-hidden','true');
    detailContent.innerHTML='';
    unlockBody();
  }

  function setRoute(route, options={}) {
    if(routeBase(currentAppRoute())==='schedule'&&routeBase(route)!=='schedule'&&!confidenceUnsavedPrompt())return false;
    if(routeBase(route)!=='schedule')confidenceDirtyWeeks.clear();
    const navigation=window.FranchiseHQ?.navigation;
    if (navigation?.go) return navigation.go(route,{source:options.source||'legacy-app',replace:options.replace===true});
    const normalized=String(route||'home').replace(/^#\/?/,'').replace(/^\//,'')||'home';
    const publicUrl=publicUrlForRoute(normalized);
    if(publicUrl){
      if(options.replace===true)history.replaceState({franchiseHqRoute:normalized},'',publicUrl);
      else history.pushState({franchiseHqRoute:normalized},'',publicUrl);
      renderRoute(normalized);
    }else{
      const hash=`#${normalized}`;
      if (location.hash===hash) renderRoute(normalized);
      else location.hash=normalized;
    }
    return normalized;
  }

  let commissionerAuthRecoveryInFlight=false;

  function requestCommissionerAuthRecovery(){
    const auth=window.FranchiseHQ?.auth;
    if(commissionerAuthRecoveryInFlight||typeof auth?.refresh!=='function') return false;
    commissionerAuthRecoveryInFlight=true;
    Promise.resolve(auth.refresh()).finally(()=>{
      commissionerAuthRecoveryInFlight=false;
      if(routeBase(currentAppRoute())==='commissioner') renderRoute(currentAppRoute()||'commissioner');
    });
    return true;
  }

  function commissionerAccessState() {
    const platform=window.FranchiseHQ;
    const auth=platform?.auth;
    const permissions=platform?.permissions;

    // On a hard refresh, app.js loads before auth-client.js and
    // platform/permissions.js. Treat that brief period as unresolved instead
    // of falling back to the simulated role and redirecting the real
    // commissioner away from Commissioner HQ.
    if (!auth?.getSnapshot || typeof permissions?.canOpenCommissionerHQ!=='function') {
      return null;
    }

    const snapshot=auth.getSnapshot();
    if (snapshot?.status==='loading') return null;

    return permissions.canOpenCommissionerHQ()===true;
  }

  function syncCommissionerAccess() {
    const access=commissionerAccessState();
    if (access===null) return;

    document.querySelectorAll('[data-role-link="commissioner"]').forEach(link=>{
      link.hidden=!access;
      link.setAttribute('aria-hidden',String(!access));
    });

    if (!access && routeBase(currentAppRoute())==='commissioner') {
      // A hard refresh can briefly expose an anonymous snapshot before the
      // persisted server session is restored. Recover auth in place rather
      // than navigating away from Commissioner HQ.
      if(requestCommissionerAuthRecovery()) return;
    }
  }

  function leagueDataIsEmpty() {
    return window.FranchiseHQ?.leagueData?.status?.().isEmpty === true;
  }

  function renderGlobalLeagueDataBanner() {
    return window.FranchiseHQ?.leagueDataBanner?.renderGlobal?.({
      host: document.querySelector('[data-league-data-global-banner]'),
      canManage: commissionerAccessState() === true
    }) ?? false;
  }

  function renderLeagueDataEmpty(subject = 'league data') {
    const emptyState = window.FranchiseHQ?.leagueEmptyState;
    if (emptyState?.render?.(pageContent, subject, { showAction: commissionerAccessState() === true })) { if(!pageContent.querySelector('[data-use-development-device]')) pageContent.querySelector('[data-league-empty-state]')?.insertAdjacentHTML('beforeend','<button class="button button--primary mobile-source-recovery" data-use-development-device>Use Development Data on this device</button>'); return true; }

    const message = window.FranchiseHQ?.leagueData?.emptyMessage?.(subject) || `No ${subject} is available.`;
    pageContent.innerHTML = `<section class="empty-state league-data-empty-state"><strong>${escapeHtml(message)}</strong><p>Data-source choices are stored per browser until shared league settings move to the backend. You can load Development Data on this device.</p><button class="button button--primary" data-use-development-device>Use Development Data on this device</button></section>`;
    return false;
  }


  function commissionerImportService(){
    return window.FranchiseHQ?.oneClickImport
      || window.FranchiseHQ?.platform?.oneClickImport
      || window.FranchiseHQ?.getModuleService?.('platform','oneClickImport')
      || null;
  }

  function mountCommissionerFranchiseImporter(){
    return false;
    const route=currentAppRoute()||'home';
    if(!route.startsWith('commissioner')||route.startsWith('commissioner/platform-workspace'))return false;
    const panel=document.querySelector('.commissioner-tab-panel');
    if(!panel)return false;
    const activeImport=document.querySelector('.commissioner-tabs [data-commissioner-tab="import"].is-active');
    const legacyImport=panel.querySelector('.commissioner-import-layout');
    if(!activeImport&&!legacyImport)return false;
    const service=commissionerImportService();
    if(!service?.renderPanel)return false;
    if(panel.querySelector('[data-commissioner-live-import-host]'))return true;
    panel.innerHTML=`<div class="commissioner-import-layout commissioner-import-layout--live"><div data-commissioner-live-import-host>${service.renderPanel()}</div></div>`;
    service.renderImportNotification?.();
    return true;
  }

  function scheduleCommissionerImporterMount(){
    requestAnimationFrame(()=>requestAnimationFrame(()=>mountCommissionerFranchiseImporter()));
  }

  const commissionerImportObserver=new MutationObserver(()=>{
    if((currentAppRoute()||'').startsWith('commissioner')){
      scheduleCommissionerImporterMount();
      setTimeout(()=>mountPerformanceCertificationCard(),60);
    }
  });
  function startCommissionerImportObserver(){
    const target=document.querySelector('[data-page-content]')||document.querySelector('main')||document.body;
    commissionerImportObserver.observe(target,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startCommissionerImportObserver,{once:true});
  else startCommissionerImportObserver();


  const PERFORMANCE_CERTIFICATION_RELEASE='6.3.2';
  const PERFORMANCE_PAGE_TARGET_MS=1000;
  let performanceCertificationResult=null;
  let performanceCertificationRunning=false;

  function performanceCertificationRoutes(){
    return [
      {route:'home',label:'League Home'},
      {route:'players',label:'Players'},
      {route:'stats',label:'Stats & Leaders'},
      {route:'transactions',label:'Transactions'},
      {route:'standings',label:'Standings'},
      {route:'teams',label:'Teams'},
      {route:'schedule',label:'Schedule'}
    ];
  }

  function performanceRouteLooksReady(route){
    if(!pageContent||!pageContent.children.length)return false;
    if(pageContent.getAttribute('aria-busy')==='true')return false;
    const text=String(pageContent.innerText||'').replace(/\\s+/g,' ').trim();
    if(!text)return false;
    const blockers=[
      'Loading current league leaders',
      'Loading live league statistics',
      'Franchise HQ is reading the active snapshot',
      'Loading transaction ledger',
      'Loading the canonical transaction ledger',
      'Loading Players',
      'Loading league data',
      'Loading My Team',
      'Checking Commissioner access'
    ];
    if(blockers.some(value=>text.includes(value)))return false;
    return true;
  }

  async function waitForPerformanceRoute(route,timeoutMs=12000){
    const started=performance.now();
    return await new Promise(resolve=>{
      let settled=false;
      const finish=(timedOut=false)=>{
        if(settled)return;
        settled=true;
        observer.disconnect();
        cancelAnimationFrame(frame);
        resolve({
          ms:Math.round((performance.now()-started)*100)/100,
          timedOut,
          textLength:String(pageContent?.innerText||'').length
        });
      };
      const check=()=>{
        if(performanceRouteLooksReady(route))return finish(false);
        if(performance.now()-started>=timeoutMs)return finish(true);
        frame=requestAnimationFrame(check);
      };
      const observer=new MutationObserver(()=>{
        if(performanceRouteLooksReady(route))finish(false);
      });
      observer.observe(pageContent,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-busy']});
      let frame=requestAnimationFrame(check);
    });
  }

  async function measurePerformanceRoute(item){
    const started=performance.now();
    // Async live renderers verify the active hash before committing their DOM.
    // Update the URL without firing hashchange so the certification measures the
    // real page instead of leaving the renderer thinking Commissioner HQ is active.
    history.replaceState({franchiseHqRoute:item.route},'',publicUrlForRoute(item.route)||`#${item.route}`);
    renderRoute(item.route);
    const readiness=await waitForPerformanceRoute(item.route);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const totalMs=Math.round((performance.now()-started)*100)/100;
    return {
      route:item.route,
      label:item.label,
      readyMs:readiness.ms,
      totalMs,
      timedOut:readiness.timedOut,
      pass:!readiness.timedOut&&readiness.ms<=PERFORMANCE_PAGE_TARGET_MS
    };
  }

  async function runPerformanceCertification(){
    if(performanceCertificationRunning)return performanceCertificationResult;
    performanceCertificationRunning=true;
    const returnRoute=currentAppRoute()||'commissioner';
    const routes=performanceCertificationRoutes();
    const startedAt=new Date().toISOString();
    const cold=[];
    const warm=[];
    try{
      showToast('Performance certification started','Franchise HQ will briefly open each core page twice and return to Commissioner HQ.');
      for(const item of routes)cold.push(await measurePerformanceRoute(item));
      for(const item of routes)warm.push(await measurePerformanceRoute(item));
      const nav=performance.getEntriesByType('navigation')?.[0];
      const boot={
        domContentLoadedMs:nav?Math.round(nav.domContentLoadedEventEnd*100)/100:null,
        windowLoadMs:nav?Math.round(nav.loadEventEnd*100)/100:null
      };
      const failed=[...cold,...warm].filter(row=>!row.pass);
      performanceCertificationResult={
        ok:true,
        release:PERFORMANCE_CERTIFICATION_RELEASE,
        targetMs:PERFORMANCE_PAGE_TARGET_MS,
        startedAt,
        completedAt:new Date().toISOString(),
        status:failed.length?'review':'pass',
        score:Math.round((([...cold,...warm].length-failed.length)/([...cold,...warm].length||1))*100),
        boot,
        firstVisit:cold,
        repeatVisit:warm,
        failed:failed.map(row=>({route:row.route,label:row.label,readyMs:row.readyMs,timedOut:row.timedOut}))
      };
      try{localStorage.setItem('fhq:performance-certification:v6.5.2',JSON.stringify(performanceCertificationResult));}catch{}
      console.info('[Performance Certification]',JSON.stringify(performanceCertificationResult,null,2));
      return performanceCertificationResult;
    }finally{
      performanceCertificationRunning=false;
      history.replaceState({franchiseHqRoute:returnRoute},'',publicUrlForRoute(returnRoute)||`#${returnRoute}`);
      if(returnRoute.startsWith('commissioner')){
        renderRoute('commissioner');
        setTimeout(()=>mountPerformanceCertificationCard(),60);
      }else renderRoute(returnRoute);
    }
  }

  function lastPerformanceCertification(){
    if(performanceCertificationResult)return performanceCertificationResult;
    try{
      performanceCertificationResult=JSON.parse(localStorage.getItem('fhq:performance-certification:v6.5.2')||'null');
    }catch{}
    return performanceCertificationResult;
  }

  function renderPerformanceCertificationCard(){
    const result=lastPerformanceCertification();
    const status=result?.status==='pass'?'success':result?'warning':'neutral';
    const summary=result
      ? `${result.score}% · ${result.failed?.length||0} measurement(s) over ${result.targetMs}ms`
      : `Target: core pages ready within ${PERFORMANCE_PAGE_TARGET_MS}ms`;
    const rows=result?.repeatVisit||[];
    return `<section class="card commissioner-performance-certification" data-performance-certification-card>
      <div class="card-header"><div><span class="eyebrow">6.5.2 · Production readiness</span><h3>Performance Certification</h3><p>Measure the core league pages twice: first visit and repeat navigation.</p></div><span class="pill pill--${status}">${result?result.status.toUpperCase():'READY'}</span></div>
      <div class="commissioner-live-import-summary">
        <span><small>Page Target</small><strong>&le; ${PERFORMANCE_PAGE_TARGET_MS} ms</strong></span>
        <span><small>Last Result</small><strong>${escapeHtml(summary)}</strong></span>
        ${result?.boot?.domContentLoadedMs!=null?`<span><small>DOM Ready</small><strong>${escapeHtml(result.boot.domContentLoadedMs)} ms</strong></span>`:''}
      </div>
      ${rows.length?`<div class="table-wrap"><table><thead><tr><th>Page</th><th>First Visit</th><th>Repeat Visit</th><th>Status</th></tr></thead><tbody>${rows.map((row,index)=>{const first=result.firstVisit?.[index];const pass=Boolean(first?.pass&&row.pass);return `<tr><td><strong>${escapeHtml(row.label)}</strong></td><td>${first?.timedOut?'Timeout':`${escapeHtml(first?.readyMs??'—')} ms`}</td><td>${row.timedOut?'Timeout':`${escapeHtml(row.readyMs)} ms`}</td><td><span class="pill pill--${pass?'success':'warning'}">${pass?'PASS':'REVIEW'}</span></td></tr>`}).join('')}</tbody></table></div>`:''}
      <div class="commissioner-import-actions"><button class="button button--primary" data-run-performance-certification ${performanceCertificationRunning?'disabled':''}>${performanceCertificationRunning?'Running Certification…':'Run Performance Certification'}</button></div>
      <div class="league-import-framework-note"><svg><use href="#icon-info"></use></svg><span>The test temporarily navigates through League Home, Players, Stats & Leaders, Transactions, Standings, Teams, and Schedule, then automatically returns here.</span></div>
    </section>`;
  }

  function mountPerformanceCertificationCard(){
    return false;
    const route=currentAppRoute()||'home';
    if(!route.startsWith('commissioner')||route.includes('platform-workspace'))return false;
    if(document.querySelector('[data-performance-certification-card]'))return true;
    const panel=document.querySelector('.commissioner-tab-panel');
    if(!panel)return false;
    const importActive=document.querySelector('.commissioner-tabs [data-commissioner-tab="import"].is-active');
    if(importActive)return false;
    panel.insertAdjacentHTML('beforeend',renderPerformanceCertificationCard());
    return true;
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-run-performance-certification]');
    if(!button)return;
    event.preventDefault();
    button.disabled=true;
    button.textContent='Running Certification…';
    runPerformanceCertification().catch(error=>{
      console.error('[Performance Certification]',error);
      showToast('Performance certification failed',error?.message||'Unable to complete the performance test.');
      renderRoute('commissioner');
      setTimeout(()=>mountPerformanceCertificationCard(),60);
    });
  });

  window.FranchiseHQ=window.FranchiseHQ||{};
  window.FranchiseHQ.performanceCertification={
    release:PERFORMANCE_CERTIFICATION_RELEASE,
    run:()=>runPerformanceCertification(),
    last:()=>lastPerformanceCertification(),
    print:()=>console.log(JSON.stringify(lastPerformanceCertification(),null,2))
  };

  function renderRoute(routeInput=currentAppRoute()||'home') {
    const route=routeInput||'home';
    const [base,id]=route.split('/');
    const publicPlayerModal=document.querySelector('[data-value-card-modal][data-public-player-id]');
    if(publicPlayerModal&&!(base==='players'&&id===publicPlayerModal.dataset.publicPlayerId)){
      publicPlayerModal.classList.remove('is-open');
      publicPlayerModal.setAttribute('aria-hidden','true');
      delete publicPlayerModal.dataset.publicPlayerId;
      document.body.style.overflow='';
    }
    closeSidebar();
    document.querySelectorAll('.nav-item[data-route]').forEach(item=>item.classList.toggle('is-active',item.dataset.route===base));
    pageContent.innerHTML='';
    renderGlobalLeagueDataBanner();
    const emptySubjects = {
      home: 'league data',
      'league-activity': 'league activity',
      teams: 'teams',
      'my-team': 'rosters',
      players: 'players',
      standings: 'standings',
      stats: 'statistics',
      schedule: 'schedule'
    };
    if (leagueDataIsEmpty() && Object.prototype.hasOwnProperty.call(emptySubjects, base)) {
      renderLeagueDataEmpty(emptySubjects[base]);
      mainContent.focus({preventScroll:true});
      window.scrollTo({top:0,behavior:'smooth'});
      return { base, id, route, empty: true };
    }
    switch(base) {
      case 'home': renderLeagueHome(); break;
      case 'league-activity': renderActivity(); break;
      case 'teams': if(id){renderTeamDetail(id);}else{renderTeams();} break;
      case 'my-team': {
        const tradeService=window.FGC_TRADE;
        if (!tradeService?.getCurrentAccount) {
          pageContent.innerHTML='<section class="empty-state"><strong>Loading My Team…</strong><p>Franchise HQ is restoring your selected identity and assigned franchise.</p></section>';
          break;
        }
        const account=tradeService.getCurrentAccount();
        if(account?.teamId){state.teamTab='roster';renderTeamDetail(liveOwnedTeamId()||account.teamId,{preserveRoute:true,myTeam:true});}
        else { showToast('My Team unavailable','Switch to an owner or commissioner identity with an assigned franchise.'); setRoute('teams'); }
        break;
      }
      case 'players': id?renderPlayerProfile(id):renderPlayers(); break;
      case 'standings': renderStandings(); break;
      case 'stats': renderStats(); break;
      case 'player-stats-certification':
        pageContent.innerHTML=`<div class="page-heading"><div><span class="eyebrow">Integration certification</span><h1>Player Statistics Certification</h1><p>Validate the live Madden player-statistics pipeline across Player Cards, Matchups, and Stats & Leaders.</p></div></div>${renderPlayerStatisticsCertification()}`;
        break;
      case 'schedule': renderSchedule(); break;
      case 'news': renderNews(); break;
      case 'transactions': renderLeagueTransactions(); break;
      case 'trade-center': window.FGC_TRADE?.renderTradeCenter ? window.FGC_TRADE.renderTradeCenter(id) : window.FranchiseHQ?.trade?.renderTradeCenter ? window.FranchiseHQ.trade.renderTradeCenter(id) : renderRoadmap(base); break;
      case 'trade-block': window.FGC_TRADE?.renderTradeBlock ? window.FGC_TRADE.renderTradeBlock() : window.FranchiseHQ?.trade?.renderTradeBlock ? window.FranchiseHQ.trade.renderTradeBlock() : renderRoadmap(base); break;
      case 'design-system': renderDesignSystem(); break;
      case 'commissioner': {
        const access=commissionerAccessState();
        if (access===null) {
          pageContent.innerHTML='<section class="empty-state"><strong>Checking Commissioner access…</strong><p>Franchise HQ is validating your authenticated league membership.</p></section>';
          break;
        }
        if (!access) {
          if(requestCommissionerAuthRecovery()) {
            pageContent.innerHTML='<section class="empty-state"><strong>Restoring Commissioner session…</strong><p>Franchise HQ is restoring your persistent Discord session.</p></section>';
            break;
          }
          pageContent.innerHTML='<section class="empty-state"><strong>Commissioner access required</strong><p>This Discord account is not currently authorized as a commissioner for this league.</p></section>';
          break;
        }
        if(id==='platform-workspace'){
          if(window.FGC_TRADE?.renderPlatformWorkspace) window.FGC_TRADE.renderPlatformWorkspace();
          else if(window.FranchiseHQ?.platformWorkspace?.renderWorkspace) pageContent.innerHTML=`<div data-platform-workspace-host>${window.FranchiseHQ.platformWorkspace.renderWorkspace()}</div>`;
          else renderRoadmap(base);
        }else if(window.FGC_TRADE?.renderCommissioner){
          window.FGC_TRADE.renderCommissioner();
          scheduleCommissionerImporterMount();
          setTimeout(()=>mountPerformanceCertificationCard(),60);
        }else if(window.FranchiseHQ?.trade?.renderCommissioner){
          window.FranchiseHQ.trade.renderCommissioner();
          scheduleCommissionerImporterMount();
          setTimeout(()=>mountPerformanceCertificationCard(),60);
        }else{
          renderRoadmap(base);
        }
        break;
      }
      case 'schedule-source-inspector': renderScheduleSourceInspector(); break;
      default: renderRoadmap(base);
    }
    mainContent.focus({preventScroll:true});
    window.scrollTo({top:0,behavior:'smooth'});
    return { base, id, route };
  }


  function suppressPlatformWorkspaceImporter(){
    if(!(currentAppRoute()||'').startsWith('commissioner/platform-workspace'))return;
    document.querySelectorAll('[data-one-click-import-panel]').forEach(node=>node.remove());
  }

  function resolveRouteTitle(routeInput) {
    const [base,id]=String(routeInput||'home').split('/');
    const liveTeam=id&&base==='teams'?liveTeamDirectory?.teamMap?.get(String(id)):null;
    const livePlayer=id&&base==='players'?liveRosterPlayers.get(String(id)):null;
    const pageTitle=base==='my-team'
      ? (rosterTeamView(window.FGC_TRADE?.getCurrentAccount?.()?.teamId)?.fullName||'My Team')
      : id
        ? (base==='teams'?(liveTeam?.fullName||(liveTeamDirectory?.snapshot?null:teamById(id)?.fullName)):(livePlayer?.name||(liveTeamDirectory?.snapshot?null:playerById(id)?.name)))
        : pageNames[base];
    return `${pageTitle||'Franchise HQ'} — Franchise HQ`;
  }

  function buildCommandResults(query='') {
    const term=query.trim().toLowerCase();
    const pageItems=Object.entries(pageNames).filter(([key])=>key!=='commissioner'||commissionerAccessState()===true).map(([route,label])=>({type:'Page',label,detail:'Open league page',route,icon:pageIcon(route)}));
    const commandTeams=liveTeamDirectory?.snapshot?(liveTeamDirectory.teams||[]):teams;
    const commandPlayers=liveTeamDirectory?.snapshot?(liveTeamDirectory.players||[]):players;
    const teamItems=commandTeams.map(team=>({type:'Team',label:team.fullName,detail:`${team.abbr} · ${team.record} · ${team.owner}`,route:`teams/${team.id}`,abbr:team.abbr,team}));
    const playerItems=commandPlayers.filter(player=>player.overall>=82).map(player=>({type:'Player',label:player.name,detail:`${player.position} · ${rosterTeamView(player.teamId)?.abbr||'Unavailable'} · ${player.overall} OVR`,route:`players/${player.id}`,player}));
    const newsItems=newsArticles.map(article=>({type:'News',label:article.title,detail:`${article.category} · ${article.time}`,newsId:article.id,icon:'icon-news'}));
    let items=[...pageItems,...teamItems,...playerItems,...newsItems];
    if (term) items=items.filter(item=>`${item.label} ${item.detail} ${item.type}`.toLowerCase().includes(term));
    else items=[...pageItems.slice(0,7),...teamItems.filter(item=>['DAL','KC','PHI'].includes(item.abbr)),...playerItems.slice(0,3)];
    items=items.slice(0,18);
    commandResults.innerHTML=items.length?`<span class="command-group-label">${term?'Search results':'Quick navigation'}</span>${items.map(item=>{
      const icon=item.team?renderTeamMark(item.team):item.player?`<span class="player-avatar" style="${teamStyle(rosterTeamView(item.player.teamId)||{})}">${item.player.initials}</span>`:`<span class="menu-icon"><svg><use href="#${item.icon||'icon-search'}"></use></svg></span>`;
      return `<button class="command-result" ${item.route?`data-command-route="${item.route}"`:`data-command-news="${item.newsId}"`}>${icon}<span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small></span><span class="pill pill--neutral">${item.type}</span></button>`;
    }).join('')}`:`<div class="command-empty"><strong>No results</strong><p>Try a player name, team, page, or news category.</p></div>`;
  }


  function apply630NavigationCleanup(){
    document.querySelectorAll('[data-route="league-activity"],[href="#league-activity"],[data-route="design-system"],[href="#design-system"]').forEach(node=>node.closest('li')?.remove()||node.remove());
    document.querySelectorAll('[data-route="news"],[href="#news"]').forEach(node=>{const text=node.querySelector('span:last-child');if(text&&/league news/i.test(text.textContent||''))text.textContent='News';else if(/league news/i.test(node.textContent||''))node.childNodes.forEach(n=>{if(n.nodeType===3)n.textContent=n.textContent.replace(/League News/ig,'News')})});
    if(!document.querySelector('link[data-release-630-css]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/release-6.3.2.css';link.dataset.release630Css='true';document.head.appendChild(link)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply630NavigationCleanup,{once:true});else apply630NavigationCleanup();
  function pageIcon(route) {
    return {home:'icon-home',teams:'icon-shield',players:'icon-users',standings:'icon-table',stats:'icon-chart',schedule:'icon-calendar',news:'icon-news',transactions:'icon-activity','trade-center':'icon-swap','trade-block':'icon-tag',commissioner:'icon-sliders','design-system':'icon-palette'}[route]||'icon-search';
  }

  function openCommand() {
    buildCommandResults('');
    commandModal.classList.add('is-open');
    commandModal.setAttribute('aria-hidden','false');
    body.style.overflow='hidden';
    setTimeout(()=>commandInput.focus(),30);
  }

  function closeCommand() {
    commandModal.classList.remove('is-open');
    commandModal.setAttribute('aria-hidden','true');
    commandInput.value='';
    unlockBody();
  }

  function openSidebar() {
    if (window.FranchiseHQ?.sidebar?.open) return window.FranchiseHQ.sidebar.open();
    if (!sidebar || !mobileOverlay) return false;
    document.body.classList.add('sidebar-open');
    sidebar.classList.add('is-open');
    mobileOverlay.hidden=false;
    mobileOverlay.classList.add('is-open');
    requestAnimationFrame(()=>mobileOverlay.classList.add('is-visible'));
    body.style.overflow='hidden';
    return true;
  }

  function closeSidebar() {
    if (window.FranchiseHQ?.sidebar?.close) return window.FranchiseHQ.sidebar.close();
    if (!sidebar || !mobileOverlay) return false;
    document.body.classList.remove('sidebar-open');
    sidebar.classList.remove('is-open');
    mobileOverlay.classList.remove('is-open','is-visible');
    mobileOverlay.hidden=true;
    unlockBody();
    return true;
  }
  function openStylePanel() { stylePanel.classList.add('is-open'); panelOverlay.classList.add('is-open'); body.style.overflow='hidden'; }
  function closeStylePanel() { stylePanel.classList.remove('is-open'); panelOverlay.classList.remove('is-open'); unlockBody(); }
  function unlockBody() { if (![commandModal,detailModal,stylePanel,sidebar].some(el=>el?.classList.contains('is-open'))) body.style.overflow=''; }
  function closeProfileMenu() { profileMenu.classList.remove('is-open'); profileButton.setAttribute('aria-expanded','false'); }

  function applyAccent(name,notify=false) {
    const accent=accents[name]||accents.blue; state.accent=name in accents?name:'blue';
    document.documentElement.style.setProperty('--accent',accent.hex); document.documentElement.style.setProperty('--accent-rgb',accent.rgb);
    document.querySelectorAll('[data-accent]').forEach(button=>button.classList.toggle('is-active',button.dataset.accent===state.accent));
    window.FranchiseHQ?.store?.setString?.('m1b-accent',state.accent,{source:'appearance'});
    if (notify) showToast(`${accent.label} applied`,'Your appearance preference is saved in this browser.');
  }

  function applyDensity(density) {
    state.density=density==='compact'?'compact':'comfortable'; body.dataset.density=state.density;
    document.querySelectorAll('[data-density]').forEach(button=>button.classList.toggle('is-active',button.dataset.density===state.density));
    window.FranchiseHQ?.store?.setString?.('m1b-density',state.density,{source:'appearance'});
  }

  function applyRole(role,notify=false) {
    const labels={commissioner:'Commissioner',owner:'Team Owner',committee:'Trade Committee',guest:'Guest'};
    const simulation=window.FranchiseHQ?.simulation;
    const result=simulation?.setRole?.(role,{silent:true,source:'app-role-selector'});
    state.role=result?.role || (labels[role]?role:'commissioner');
    const currentRole=document.querySelector('[data-current-role]');
    if(currentRole) currentRole.textContent=labels[state.role]||labels.commissioner;
    document.querySelectorAll('[data-role]').forEach(button=>button.classList.toggle('is-selected',button.dataset.role===state.role));
    syncCommissionerAccess();
    closeProfileMenu();
    if (notify) {
      simulation?.setRole?.(state.role,{source:'app-role-selector'});
      showToast(`${labels[state.role]||labels.commissioner} preview active`,'Simulation changes the workflow perspective only. Authenticated permissions remain unchanged.');
    }
  }

  function showToast(title,copy) {
    const toast=document.createElement('div'); toast.className='toast'; toast.innerHTML=`<span><svg><use href="#icon-info"></use></svg></span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></div>`;
    toastRegion.appendChild(toast); setTimeout(()=>toast.remove(),3800);
  }

  document.addEventListener('click', event => {
    const retry=event.target.closest('[data-game-state-join-retry]');
    if(!retry)return;
    event.preventDefault();
    window.FranchiseHQ?.gameStateJoinInspector?.load?.(retry.dataset.gameStateJoinRetry);
  });

  document.addEventListener('click', event => {
    const phase=event.target.closest('[data-live-schedule-phase]');
    if(!phase)return;
    event.preventDefault();
    if(!confidenceUnsavedPrompt())return;confidenceDirtyWeeks.clear();state.schedulePhase=phase.dataset.liveSchedulePhase;
    state.scheduleWeek=1;
    renderSchedule();
  });

  document.addEventListener('change', event => {
    if(event.target.matches('[data-live-schedule-week]')){
      if(!confidenceUnsavedPrompt()){event.target.value=state.scheduleWeek;return;}confidenceDirtyWeeks.clear();state.scheduleWeek=Number(event.target.value);
      renderSchedule();
    }
  });

  document.addEventListener('click', event => {
    const retry=event.target.closest('[data-schedule-inspector-retry]');
    if(!retry)return;
    event.preventDefault();
    window.FranchiseHQ?.scheduleSourceInspector?.load?.(retry.dataset.scheduleInspectorRetry);
  });

  document.addEventListener('click', event => {
    const teamCard=event.target.closest('.team-card[data-team-id]');
    if(!teamCard) return;
    const nested=event.target.closest('button, a, input, select, textarea, label');
    if(nested && nested!==teamCard) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const teamId=teamCard.dataset.teamId;
    state.teamTab='roster';
    const route=`teams/${teamId}`;
    setRoute(route,{source:'team-card-keyboard'});
  }, true);

  document.addEventListener('click', event => {
    const closeDetailTarget=event.target.closest('[data-close-detail]');
    if (closeDetailTarget) { event.preventDefault(); event.stopPropagation(); closeDetail(); return; }

    const closePlayerTarget=event.target.closest('[data-close-value-card]');
    if(closePlayerTarget&&routeBase(currentAppRoute())==='players'&&currentAppRoute().split('/')[1]){
      // trade-module owns the shared modal close and emits a navigation event.
      // Keep a zero-delay fallback for pages where that module is unavailable.
      setTimeout(()=>{
        if(!publicPlayerReturnRoute)return;
        const returnRoute=publicPlayerReturnRoute;
        publicPlayerReturnRoute=null;
        setRoute(returnRoute,{source:'player-card-close-fallback',replace:true});
      },0);
    }

    const gameCenterTab=event.target.closest('[data-game-center-tab]');
    if (gameCenterTab) {
      event.preventDefault();
      state.gameCenterTab=gameCenterTab.dataset.gameCenterTab;
      const shell=event.target.closest('.game-center-shell');
      const active=shell?.querySelector('.game-center-switcher .is-active');
      if(active) openGameDetail(active.dataset.gameCenterSwitch);
      return;
    }

    const recapFormat=event.target.closest('[data-recap-format]');
    if(recapFormat){
      event.preventDefault();
      state.recapFormat=recapFormat.dataset.recapFormat;
      const shell=event.target.closest('.game-center-shell');
      const active=shell?.querySelector('.game-center-switcher .is-active');
      if(active) openGameDetail(active.dataset.gameCenterSwitch);
      return;
    }

    const exportRecap=event.target.closest('[data-export-recap]');
    if(exportRecap){
      event.preventDefault();
      downloadRecapPng(exportRecap.dataset.exportRecap);
      return;
    }

    const copyRecap=event.target.closest('[data-copy-recap]');
    if(copyRecap){
      event.preventDefault();
      const game=schedule.flatMap(week=>week.games).find(item=>item.id===copyRecap.dataset.copyRecap);
      if(game){
        const away=teamById(game.awayId),home=teamById(game.homeId);
        const recap=recapStoryData(away,home,game);
        const text=`${recap.headline}\n\n${recap.story}\n\n${recap.social}`;
        navigator.clipboard?.writeText(text).then(()=>showToast('Recap copied','Headline, game story, and social caption copied to your clipboard.')).catch(()=>showToast('Copy unavailable','Your browser blocked clipboard access.'));
      }
      return;
    }

    const gameCenterSwitch=event.target.closest('[data-game-center-switch]');
    if (gameCenterSwitch) { event.preventDefault(); openGameDetail(gameCenterSwitch.dataset.gameCenterSwitch); return; }

    const openPlayerCard=event.target.closest('[data-open-player-card]');
    if (openPlayerCard) {
      event.preventDefault();
      openRosterPlayerDetail(openPlayerCard.dataset.openPlayerCard);
      return;
    }

    const tradePlayerCard=event.target.closest('[data-open-value-card]');
    if(tradePlayerCard&&playerForPublicRoute(tradePlayerCard.dataset.openValueCard)){
      event.preventDefault();
      event.stopImmediatePropagation();
      openRosterPlayerDetail(tradePlayerCard.dataset.openValueCard);
      return;
    }

    const rosterTradeTarget=event.target.closest('[data-add-player-trade]');
    if (rosterTradeTarget) return;

    const depthPlayerTarget=event.target.closest('[data-depth-player-id]');
    if (depthPlayerTarget) {
      event.preventDefault();
      event.stopPropagation();
      const section=depthPlayerTarget.closest('.formation-position');
      const starter=section?.querySelector('.formation-depth-card__starter');
      const playerId=depthPlayerTarget.dataset.depthPlayerId;

      if(depthPlayerTarget===starter){
        // The visible starter is already the focused player for this position.
        // One click opens its canonical Player Card. A backup must first be
        // promoted into this focused slot, then a second click opens the card.
        openRosterPlayerDetail(playerId);
        return;
      }

      if(!starter||!section) return;
      const selected=rosterPlayerView(liveRosterPlayers.get(String(playerId))||rosterService()?.findPlayer?.(playerId));
      const starterId=starter.dataset.depthPlayerId;
      const current=rosterPlayerView(liveRosterPlayers.get(String(starterId))||rosterService()?.findPlayer?.(starterId));
      if(!selected||!current) return;

      starter.dataset.depthPlayerId=selected.id;
      starter.setAttribute('aria-label',`Show ${selected.name}`);
      starter.className=`formation-depth-card__starter ${depthDevelopmentClass(selected.dev)} is-selected`;
      starter.innerHTML=`${depthPlayerImageMarkup(selected)}<span class="formation-player-card__ovr">${selected.overall??'—'}</span><strong class="depth-focus-name">${depthFocusedNameMarkup(selected.name)}</strong>`;

      depthPlayerTarget.dataset.depthPlayerId=current.id;
      depthPlayerTarget.setAttribute('aria-label',`Show ${current.name}`);
      depthPlayerTarget.className=`formation-depth-card__backup ${depthDevelopmentClass(current.dev)}`;
      depthPlayerTarget.innerHTML=`<strong>${escapeHtml(current.name)}</strong><b>${current.overall??'—'}</b>`;

      state.depthSelectedPlayer=selected.id;
      return;
    }

    const previousGameTarget=event.target.closest('[data-previous-game-id]');
    if(previousGameTarget){
      event.preventDefault();
      event.stopPropagation();
      openMatchupCard(previousGameTarget.dataset.previousGameId);
      return;
    }

    const matchupTab=event.target.closest('[data-matchup-tab]');
    if(matchupTab){
      event.preventDefault();
      const modal=matchupTab.closest('[data-matchup-modal]');
      const target=modal?.querySelector('[data-matchup-tab-content]');
      if(!modal||!target)return;
      modal.querySelectorAll('[data-matchup-tab]').forEach(button=>{
        const active=button===matchupTab;
        button.classList.toggle('is-active',active);
        button.setAttribute('aria-selected',String(active));
      });
      const tabName=matchupTab.dataset.matchupTab;
      const game=activeMatchupGame||{};
      const key=matchupPanelCacheKey(game,tabName);

      if(matchupPanelCache.has(key))target.innerHTML=matchupPanelCache.get(key);
      return;
    }

    const matchupTarget=event.target.closest('[data-game-id]');
    if(matchupTarget){
      event.preventDefault();
      event.stopPropagation();
      openMatchupCard(matchupTarget.dataset.gameId);
      return;
    }

    const teamSchedulePhase=event.target.closest('[data-team-schedule-phase]');
    if (teamSchedulePhase) {
      event.preventDefault();
      const windowScroll=window.scrollY;
      const mainScroll=mainContent?.scrollTop || 0;
      state.teamSchedulePhase=teamSchedulePhase.dataset.teamSchedulePhase;
      renderRoute(currentAppRoute());
      requestAnimationFrame(() => {
        window.scrollTo({top:windowScroll,left:0,behavior:'instant'});
        if (mainContent) mainContent.scrollTop=mainScroll;
      });
      return;
    }

    const rosterPlayerTarget=event.target.closest('[data-roster-player-detail]');
    if (rosterPlayerTarget) {
      event.preventDefault();
      openRosterPlayerDetail(rosterPlayerTarget.dataset.rosterPlayerDetail);
      return;
    }

    const clearPlayerFilters=event.target.closest('[data-player-clear-filters]');
    if (clearPlayerFilters) {
      state.playerSearch=''; state.playerPosition='All'; state.playerTeam='All'; state.playerStatus='All'; state.playerDev='All'; state.playerRookiesOnly=false;
      state.playerMinOvr=0; state.playerMaxOvr=99; state.playerMinAge=18; state.playerMaxAge=60; state.playerSort='overall-desc'; state.playerPage=1;
      renderPlayers();
      return;
    }

    const playerPageTarget=event.target.closest('[data-player-page]');
    if(playerPageTarget&&!playerPageTarget.disabled){
      state.playerPage=Math.max(1,Number(playerPageTarget.dataset.playerPage)||1);
      refreshPlayerTable();
      document.querySelector('.player-directory-card')?.scrollIntoView?.({block:'start',behavior:'smooth'});
      return;
    }

    const routeTarget=event.target.closest('[data-route]');
    if (routeTarget) {
      event.preventDefault();
      const route=routeTarget.dataset.route;
      if(/^teams\//.test(route)){
        state.teamTab='roster';
        setRoute(route,{source:'data-route'});
      } else setRoute(route);
      return;
    }

    const interactiveTarget=event.target.closest('button, a, input, select, textarea, label');
    const teamTarget=event.target.closest('[data-team-id]');
    const nestedInteractive=interactiveTarget && interactiveTarget!==teamTarget;
    if (teamTarget && !nestedInteractive) {
      event.preventDefault();
      const playerModal=teamTarget.closest('[data-value-card-modal]');
      if(playerModal){
        playerModal.classList.remove('is-open');
        playerModal.setAttribute('aria-hidden','true');
        document.body.style.overflow='';
        publicPlayerReturnRoute=null;
      }
      const route=`teams/${teamTarget.dataset.teamId}`;
      setRoute(route,{source:'team-link'});
      return;
    }

    const playerTarget=event.target.closest('[data-player-id]');
    if (playerTarget) {
      event.preventDefault();
      openRosterPlayerDetail(playerTarget.dataset.playerId);
      return;
    }

    const gameTarget=event.target.closest('[data-game-id]');
    if (gameTarget) { openGameDetail(gameTarget.dataset.gameId); return; }

    const newsTarget=event.target.closest('[data-news-id]');
    if (newsTarget) { openNewsDetail(newsTarget.dataset.newsId); return; }

    const commandRoute=event.target.closest('[data-command-route]');
    if (commandRoute) {
      const route=commandRoute.dataset.commandRoute;
      closeCommand();
      if (route.startsWith('players/')) {
        openRosterPlayerDetail(route.split('/')[1]);
      } else {
        setRoute(route);
      }
      return;
    }

    const commandNews=event.target.closest('[data-command-news]');
    if (commandNews) { const id=commandNews.dataset.commandNews; closeCommand(); openNewsDetail(id); return; }

    const modalTeam=event.target.closest('[data-modal-team]');
    if (modalTeam) { const id=modalTeam.dataset.modalTeam; closeDetail(); setRoute(`teams/${id}`); return; }

    const capSort=event.target.closest('[data-cap-sort]');
    if(capSort){
      event.preventDefault();
      event.stopPropagation();
      const key=capSort.dataset.capSort;
      if(state.capSortKey===key){
        state.capSortDirection=state.capSortDirection==='asc'?'desc':'asc';
      }else{
        state.capSortKey=key;
        state.capSortDirection=['player','position'].includes(key)?'asc':'desc';
      }
      refreshActiveCapTab();
      return;
    }

    const teamTab=event.target.closest('[data-team-tab]');
    if (teamTab) {
      event.preventDefault();
      event.stopPropagation();
      const nextTab=teamTab.dataset.teamTab;
      state.teamTab=nextTab;

      // Team tabs are local UI state. Do not re-run the async team route just to
      // switch panels; rebuild only the active panel from the already-loaded
      // LIVE directory/roster model.
      const teamId=activeTeamIdForTeamPage();
      const team=liveTeamDirectory?.teamMap?.get(teamId);
      const players=liveTeamDirectory?.playersByTeam?.get(teamId)||[];
      const target=pageContent?.querySelector?.('[data-team-tab-content]');

      if(team && target){
        const rosterModel=liveRosterModel(team,players);
        const roster=players.map(rosterPlayerView);
        const leaders=[...roster].sort((a,b)=>(Number(b.overall)||0)-(Number(a.overall)||0)).slice(0,5);
        const teamGames=(liveTeamDirectory?.games||[])
          .filter(game=>String(game.homeTeamId)===teamId||String(game.awayTeamId)===teamId)
          .map(game=>liveTeamScheduleGame(game));

        pageContent.querySelectorAll('[data-team-tab]').forEach(button=>{
          button.classList.toggle('is-active',button.dataset.teamTab===nextTab);
        });
        try{
          target.innerHTML=renderTeamTab(team,rosterModel,roster,teamGames,leaders);
          if(nextTab==='roster') sizeRosterScrollWindow(target);
          if(nextTab==='trade-history') refreshTeamTransactionHistory(team,target);
        }catch(error){
          console.error('[Team Tab Render]',nextTab,error);
          target.innerHTML=`<article class="card roadmap-state"><div class="roadmap-state__inner"><h2>${escapeHtml(titleCase(nextTab))} could not render</h2><p>${escapeHtml(error?.message||'Unexpected team-tab rendering error.')}</p></div></article>`;
        }
        scrollTeamTabsToTop();
      } else {
        // Safe fallback if the directory was cleared unexpectedly.
        renderRoute(currentAppRoute());
      }
      return;
    }

    const featureGame=event.target.closest('[data-feature-game]');
    if (featureGame) { state.featuredGameId=featureGame.dataset.featureGame; renderLeagueHome(); return; }

    const homeLeaderToggle=event.target.closest('[data-home-leader-metric]');
    if (homeLeaderToggle) {
      state.homeLeaderMetrics[homeLeaderToggle.dataset.homeLeaderCategory]=homeLeaderToggle.dataset.homeLeaderMetric;
      renderLeagueHome();
      return;
    }

    const activityFilter=event.target.closest('[data-activity-filter]');
    if (activityFilter) { state.activityFilter=activityFilter.dataset.activityFilter; renderActivity(); return; }

    const standingsView=event.target.closest('[data-standings-view]');
    if (standingsView) { state.standingsView=standingsView.dataset.standingsView; renderStandings(); return; }
    const confidenceStandingsView=event.target.closest('[data-confidence-standings-view]');
    if(confidenceStandingsView){state.confidenceStandingsView=confidenceStandingsView.dataset.confidenceStandingsView;renderStandings();return;}
    const confidenceStandingsWeek=event.target.closest('[data-confidence-standings-week]');
    if(confidenceStandingsWeek){state.confidenceStandingsWeek=clamp(state.confidenceStandingsWeek+Number(confidenceStandingsWeek.dataset.confidenceStandingsWeek),1,Math.max(1,...schedule.map(w=>w.week)));renderStandings();return;}

    const statsCategory=event.target.closest('[data-stats-category]');
    if (statsCategory) {
      const nextCategory=statsCategory.dataset.statsCategory;
      if(nextCategory!==state.statsCategory){
        state.statsCategory=nextCategory;
        state.statsSortKey=nextCategory==='team'?null:liveLeaderDefaultSort(nextCategory);
        state.statsSortDirection='desc';
      }
      renderStats();
      return;
    }
    const statsSort=event.target.closest('[data-stats-sort]');
    if(statsSort){const key=statsSort.dataset.statsSort;if(state.statsSortKey===key)state.statsSortDirection=state.statsSortDirection==='desc'?'asc':'desc';else{state.statsSortKey=key;state.statsSortDirection='desc';}renderStats();return;}

    const useDevelopmentDevice=event.target.closest('[data-use-development-device]');
    if(useDevelopmentDevice){const service=window.FranchiseHQ?.leagueData;if(service?.setMode){service.setMode('demo');if(service.status?.().isEmpty)service.seedDemoFromLegacy?.();showToast('Development Data enabled','This browser will now use Development Data.');renderRoute(currentAppRoute()||'home');}return;}

    const scheduleSection=event.target.closest('[data-schedule-section]');
    if(scheduleSection){state.scheduleSection=scheduleSection.dataset.scheduleSection;renderSchedule();return;}
    const confidenceWeekChange=event.target.closest('[data-confidence-week-change]');
    if(confidenceWeekChange){state.confidenceWeek=clamp(state.confidenceWeek+Number(confidenceWeekChange.dataset.confidenceWeekChange),1,schedule.length);renderSchedule();return;}
    const confidenceTeam=event.target.closest('[data-confidence-team]');
    if(confidenceTeam){confidenceDirtyWeeks.add(Number(state.scheduleWeek));const [gameId,teamId]=confidenceTeam.dataset.confidenceTeam.split(':');const result=scheduleService()?.confidence?.saveSelection(gameId,teamId);if(!result?.ok)showToast('Pick not saved',result?.error||'Unable to save pick.');renderSchedule();return;}
    const confidenceClearWeek=event.target.closest('[data-confidence-clear-week]');
    if(confidenceClearWeek){const week=Number(confidenceClearWeek.dataset.confidenceClearWeek);if(confirm(`Clear every winner and confidence value for Week ${week}? This cannot be undone.`)){const result=scheduleService()?.confidence?.clearWeek(week);if(result?.ok)confidenceDirtyWeeks.delete(week);showToast(result?.ok?'Week cleared':'Unable to clear week',result?.error||`Week ${week} selections were removed.`);renderSchedule();}return;}
    const confidenceClearSeason=event.target.closest('[data-confidence-clear-season]');
    if(confidenceClearSeason){const confirmation=prompt(`Type CLEAR to remove every Confidence Pool pick for Season ${scheduleService()?.confidence?.config?.()?.season||''}.`);if(confirmation==='CLEAR'){const result=scheduleService()?.confidence?.clearSeason();showToast(result?.ok?'Season entry cleared':'Unable to clear season',result?.error||'All season selections were removed.');renderSchedule();}else if(confirmation!==null){showToast('Season not cleared','The confirmation text did not match CLEAR.');}return;}
    const confidenceAuto=event.target.closest('[data-confidence-auto]');
    if(confidenceAuto){const result=scheduleService()?.confidence?.autoAssign(Number(confidenceAuto.dataset.confidenceAuto));showToast(result?.ok?'Week predicted and assigned':'Unable to assign',result?.error||`Week ${state.confidenceWeek} picks and confidence values were assigned from league history.`);renderSchedule();return;}
    const submitWeekButton=event.target.closest('[data-confidence-submit-week]');if(submitWeekButton){const week=Number(submitWeekButton.dataset.confidenceSubmitWeek);const result=scheduleService()?.confidence?.submitWeek(week);if(result?.ok)confidenceDirtyWeeks.delete(week);showToast(result?.ok?`Week ${week} submitted`:'Week incomplete',result?.error||`Week ${week} is locked and ready for scoring.`);renderSchedule();return;}

    const weekButton=event.target.closest('[data-week]');
    if (weekButton) { state.scheduleWeek=Number(weekButton.dataset.week); renderSchedule(); return; }

    const weekChange=event.target.closest('[data-week-change]');
    if (weekChange) { state.scheduleWeek=clamp(state.scheduleWeek+Number(weekChange.dataset.weekChange),1,9); renderSchedule(); return; }

    const newsCategory=event.target.closest('[data-news-category]');
    if (newsCategory) { state.newsCategory=newsCategory.dataset.newsCategory; renderNews(); return; }

    const accentButton=event.target.closest('[data-accent]');
    if (accentButton) { applyAccent(accentButton.dataset.accent,true); return; }

    const densityButton=event.target.closest('[data-density]');
    if (densityButton) { applyDensity(densityButton.dataset.density); return; }

    const roleButton=event.target.closest('[data-role]');
    if (roleButton) { applyRole(roleButton.dataset.role,true); return; }

    if (event.target.closest('[data-open-sidebar]')) { openSidebar(); return; }
    if (event.target.closest('[data-close-sidebar]')||event.target.closest('[data-mobile-overlay]')) { closeSidebar(); return; }
    if (event.target.closest('[data-open-command]')) { openCommand(); return; }
    if (event.target.closest('[data-close-command]')) { closeCommand(); return; }
    if (event.target.closest('[data-open-style-panel]')) { openStylePanel(); return; }
    if (event.target.closest('[data-close-style-panel]')||event.target.closest('[data-panel-overlay]')) { closeStylePanel(); return; }
    if (event.target.closest('[data-close-detail]')) { closeDetail(); return; }

    const demo=event.target.closest('[data-demo-toast]');
    if (demo) { showToast('Prototype preview',demo.dataset.demoToast); return; }

    if (event.target.closest('[data-profile-button]')) {
      const open=profileMenu.classList.toggle('is-open'); profileButton.setAttribute('aria-expanded',String(open)); return;
    }
    if (!profileMenu.contains(event.target)&&!profileButton.contains(event.target)) closeProfileMenu();
  });

  window.addEventListener('franchisehq:player-card-closed',event=>{
    const returnRoute=String(event.detail?.playerReturnRoute||publicPlayerReturnRoute||'players');
    publicPlayerReturnRoute=null;
    if(routeBase(currentAppRoute())==='players'&&currentAppRoute().split('/')[1]){
      setRoute(returnRoute,{source:'player-card-close',replace:true});
    }
  });




  let mobileMenuToggleLock=false;
  document.addEventListener('click', event => {
    const openButton=event.target.closest('[data-open-sidebar]');
    if(openButton){
      event.preventDefault();
      event.stopImmediatePropagation();
      if(mobileMenuToggleLock) return;
      mobileMenuToggleLock=true;
      openSidebar();
      setTimeout(()=>{mobileMenuToggleLock=false},240);
      return;
    }

    const closeButton=event.target.closest('[data-close-sidebar], [data-mobile-overlay]');
    if(closeButton && !event.target.closest('.sidebar')){
      event.preventDefault();
      closeSidebar();
    }
  }, true);

  document.addEventListener('click', event => {
    const button=event.target.closest('[data-roster-sort]');
    if(!button)return;
    event.preventDefault();
    event.stopPropagation();
    const key=button.dataset.rosterSort;
    if((state.rosterSortKey||'overall')===key) state.rosterSortDirection=(state.rosterSortDirection||'desc')==='asc'?'desc':'asc';
    else { state.rosterSortKey=key; state.rosterSortDirection=key==='player'||key==='position'||key==='development'||key==='status'?'asc':'desc'; }
    const scrollHost=mainContent||document.scrollingElement;
    const savedTop=scrollHost?.scrollTop??window.scrollY;
    const teamId=activeTeamIdForTeamPage();
    const team=liveTeamDirectory?.teamMap?.get(teamId);
    const players=liveTeamDirectory?.playersByTeam?.get(teamId)||[];
    const target=pageContent.querySelector('[data-team-tab-content]');
    if(team&&target){
      target.innerHTML=renderRosterExperience(team,liveRosterModel(team,players));
      requestAnimationFrame(()=>{
        if(scrollHost?.scrollTo) scrollHost.scrollTo({top:savedTop,left:0,behavior:'instant'});
        else window.scrollTo({top:savedTop,left:0,behavior:'instant'});
      });
    }
  });


  document.addEventListener('change', event => {
    const positionFilter=event.target.closest('[data-cap-position]');
    if(!positionFilter) return;
    state.capPosition=positionFilter.value||'All';
    refreshActiveCapTab();
  });

  document.addEventListener('input',event=>{
    if(!event.target.matches('[data-transaction-search]'))return;
    state.transactionSearch=event.target.value;
    const cached=canonicalTransactionUiCache?.payload;
    if(cached){
      renderLeagueTransactionTable(cached);
      const input=document.querySelector('[data-transaction-search]');
      if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length)}
    }else{
      renderLeagueTransactions();
    }
  });

  document.addEventListener('change',event=>{
    if(event.target.matches('[data-transaction-type]')){
      state.transactionType=event.target.value||'all';
      if(canonicalTransactionUiCache?.payload)renderLeagueTransactionTable(canonicalTransactionUiCache.payload);
      else renderLeagueTransactions();
      return;
    }
    if(event.target.matches('[data-transaction-team]')){
      state.transactionTeam=event.target.value||'all';
      if(canonicalTransactionUiCache?.payload)renderLeagueTransactionTable(canonicalTransactionUiCache.payload);
      else renderLeagueTransactions();
    }
  });

  document.addEventListener('keydown', event => {
    const gameTarget=event.target.closest('[data-game-id]');
    if(gameTarget&&['Enter',' '].includes(event.key)){
      event.preventDefault();
      openMatchupCard(gameTarget.dataset.gameId);
      return;
    }
  });

  document.addEventListener('keydown', event => {
    const teamCard=event.target.closest('.team-card[data-team-id]');
    if(!teamCard || !['Enter',' '].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const teamId=teamCard.dataset.teamId;
    state.teamTab='roster';
    const route=`teams/${teamId}`;
    setRoute(route,{source:'team-card-keyboard'});
  }, true);

  document.addEventListener('keydown', event => {
    const teamCard=event.target.closest('.team-card[data-team-id]');
    if(!teamCard || !['Enter',' '].includes(event.key)) return;
    event.preventDefault();
    const route=`teams/${teamCard.dataset.teamId}`;
    setRoute(route,{source:'team-card-keyboard'});
  });

  document.addEventListener('input', event => {
    if (event.target.matches('[data-team-search]')) { state.teamSearch=event.target.value; refreshTeamGrid(); }
    if (event.target.matches('[data-player-search]')) { state.playerSearch=event.target.value; state.playerPage=1; refreshPlayerTable(); }
    if (event.target.matches('[data-player-min-ovr]')) { state.playerMinOvr=Number(event.target.value)||0; state.playerPage=1; refreshPlayerTable(); }
    if (event.target.matches('[data-player-max-ovr]')) { state.playerMaxOvr=Number(event.target.value)||99; state.playerPage=1; refreshPlayerTable(); }
    if (event.target.matches('[data-player-min-age]')) { state.playerMinAge=Number(event.target.value)||18; state.playerPage=1; refreshPlayerTable(); }
    if (event.target.matches('[data-player-max-age]')) { state.playerMaxAge=Number(event.target.value)||60; state.playerPage=1; refreshPlayerTable(); }
    if (event.target.matches('[data-command-input]')) buildCommandResults(event.target.value);
  });

  document.addEventListener('change', event => {
    if (event.target.matches('[data-team-conference]')) { state.teamConference=event.target.value; refreshTeamGrid(); }
    if (event.target.matches('[data-team-division]')) { state.teamDivision=event.target.value; refreshTeamGrid(); }
    if (event.target.matches('[data-roster-group]')) {
      state.rosterGroup=event.target.value;
      if(!refreshActiveRosterTab()) renderRoute(currentAppRoute());
    }
    if (event.target.matches('[data-roster-position]')) {
      state.rosterPosition=event.target.value==='All'?'All':canonicalFilterPosition(event.target.value);
      if(!refreshActiveRosterTab()) renderRoute(currentAppRoute());
    }
    if (event.target.matches('[data-roster-dev]')) {
      state.rosterDev=event.target.value;
      if(!refreshActiveRosterTab()) renderRoute(currentAppRoute());
    }
    if (event.target.matches('[data-player-position]')) { state.playerPosition=event.target.value; state.playerPage=1; refreshPlayerTable(); }
    if (event.target.matches('[data-player-team]')) { state.playerTeam=event.target.value; state.playerPage=1; refreshPlayerTable(); }
    if (event.target.matches('[data-player-status]')) { state.playerStatus=event.target.value; state.playerPage=1; refreshPlayerTable(); }
    if (event.target.matches('[data-player-dev]')) { state.playerDev=event.target.value; state.playerPage=1; refreshPlayerTable(); }
    if (event.target.matches('[data-player-rookie]')) { state.playerRookiesOnly=Boolean(event.target.checked); state.playerPage=1; refreshPlayerTable(); }
    if (event.target.matches('[data-player-sort]')) { state.playerSort=event.target.value; state.playerPage=1; refreshPlayerTable(); }
    if (event.target.matches('[data-schedule-team]')) { state.scheduleTeam=event.target.value; renderSchedule(); }
    if (event.target.matches('[data-confidence-value]')) { const gameId=event.target.dataset.confidenceValue; const result=scheduleService()?.confidence?.saveConfidence(gameId,event.target.value); if(!result?.ok) showToast('Confidence not saved',result?.error||'Choose another confidence value.'); renderSchedule(); }
    if (event.target.matches('[data-stats-scope]')) { state.statsScope=event.target.value; renderStats(); }
    if (event.target.matches('[data-stats-week]')) { state.statsWeek=Number(event.target.value)||1; renderStats(); }
    if (event.target.matches('[data-stats-team]')) { state.statsTeam=event.target.value; renderStats(); }
    if (event.target.matches('[data-stats-min-games]')) { state.statsMinimumGames=Number(event.target.value)||0; renderStats(); }
    if (event.target.matches('[data-stats-team-category]')) { state.statsTeamCategory=event.target.value; renderStats(); }
  });

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k') { event.preventDefault(); openCommand(); }
    if (event.key==='Escape') { closeCommand(); closeDetail(); closeStylePanel(); closeSidebar(); closeProfileMenu(); }
  });


  // 4.21.2: guarantee the active route mounts after hard refresh / bfcache restore.
  window.addEventListener('pageshow', () => {
    const route=String(location.hash||'#home').replace(/^#\/?/,'')||'home';
    if (pageContent && !pageContent.children.length) renderRoute(route);
  });

  window.addEventListener('franchisehq:auth-changed', event=>{
    if(event.detail?.status!=='ready') return;
    syncCommissionerAccess();
    const activeBase=routeBase(currentAppRoute());
    if (['commissioner','trade-center','trade-block'].includes(activeBase)) {
      const currentProtectedRoute=currentAppRoute()||activeBase;
      renderRoute(currentProtectedRoute);
    }
  });

  window.addEventListener('franchisehq:trade-ready', ()=>{
    if (routeBase(currentAppRoute())==='my-team') renderRoute('my-team');
  });

  window.addEventListener('franchisehq:gotw-changed', event=>{
    const currentWeek=currentHomeWeek();
    if(Number(event.detail?.week)===Number(currentWeek?.week)) state.featuredGameId=event.detail?.gameId||null;
    if(routeBase(currentAppRoute())==='home') renderLeagueHome();
  });

  window.FranchiseHQ?.sidebar?.init?.({ sidebar, overlay: mobileOverlay });

  // v5.9.10.1b — SAFE Trade Center LIVE-data bridge.
  // The Trade Center keeps its original module and references these same arrays.
  // We mutate them in place after LIVE data loads instead of replacing/re-writing the module.
  const TRADE_LIVE_CACHE_KEY='franchisehq:trade-live-cache:v2';

  function tradeCalculatorMillions(value) {
    const amount=Number(value);
    if(!Number.isFinite(amount))return 0;
    return Math.abs(amount)>=100000?amount/1000000:amount;
  }

  function tradeLiveCachePlayer(player={}){
    return {
      id:String(player.id||''),
      name:String(player.name||'Unknown Player'),
      first:String(player.first||''),
      last:String(player.last||''),
      initials:String(player.initials||''),
      teamId:String(player.teamId||''),
      position:String(player.position||''),
      overall:Number(player.overall||0)||0,
      age:Number(player.age||0)||0,
      dev:player.dev||'Normal',
      years:Number(player.years||0)||0,
      salary:Number(player.salary||0)||0,
      capHit:Number(player.capHit||0)||0,
      number:player.number??'—',
      college:player.college||'—',
      injury:player.injury||'Healthy',
      ratings:player.ratings||{},
      imageUrl:player.imageUrl||null,
      portraitCandidates:Array.isArray(player.portraitCandidates)?player.portraitCandidates.slice(0,4):[],
      liveSource:true
    };
  }

  function tradeLiveCacheTeam(team={}){
    return {
      id:String(team.id||''),
      liveTeamId:String(team.liveTeamId||''),
      abbr:String(team.abbr||''),
      city:String(team.city||''),
      name:String(team.name||''),
      fullName:String(team.fullName||team.displayName||''),
      displayName:String(team.displayName||team.fullName||''),
      owner:String(team.owner||'Unassigned'),
      ownerRole:team.ownerRole||null,
      teamKey:team.teamKey||String(team.abbr||'').toLowerCase(),
      logo:team.logo||null,
      primary:team.primary||null,
      secondary:team.secondary||null
    };
  }

  function saveTradeLiveCache(snapshotId,liveTeams=[],livePlayers=[]){
    try{
      localStorage.setItem(TRADE_LIVE_CACHE_KEY,JSON.stringify({
        release:'5.9.10.1k',
        snapshotId:String(snapshotId||''),
        savedAt:new Date().toISOString(),
        teams:liveTeams.map(tradeLiveCacheTeam),
        players:livePlayers.map(tradeLiveCachePlayer)
      }));
      return true;
    }catch(error){
      console.warn('[Trade Center LIVE Cache] Save skipped.',error);
      return false;
    }
  }

  function restoreTradeLiveCache(){
    try{
      const cached=JSON.parse(localStorage.getItem(TRADE_LIVE_CACHE_KEY)||'null');
      if(!cached||!Array.isArray(cached.teams)||cached.teams.length!==32||!Array.isArray(cached.players)||!cached.players.length){
        return false;
      }
      teams.splice(0,teams.length,...cached.teams);
      players.splice(0,players.length,...cached.players);
      tradeCenterLiveBridgeState={
        mode:'live',
        snapshotId:String(cached.snapshotId||''),
        teamCount:teams.length,
        playerCount:players.length,
        cache:true,
        savedAt:cached.savedAt||null
      };
      window.FGC_TRADE_LIVE={
        release:'5.9.10.1k',
        status:()=>({...tradeCenterLiveBridgeState}),
        resync:()=>syncTradeCenterLiveBridge({rerender:true,forceLive:true})
      };
      document.documentElement.classList.remove('trade-live-boot-pending','trade-live-first-load');
      document.querySelector('[data-trade-live-boot-curtain]')?.remove();
      return true;
    }catch(error){
      console.warn('[Trade Center LIVE Cache] Restore skipped.',error);
      return false;
    }
  }

  let tradeCenterLiveBridgeState={mode:'development',snapshotId:null,teamCount:teams.length,playerCount:players.length};

  function tradeCenterStableTeamId(team={}) {
    return String(team.teamKey||team.source?.teamKey||team.abbr||team.abbreviation||team.source?.abbrName||team.id||'').trim().toLowerCase();
  }

  function tradeCenterLiveTeamShape(team={}) {
    const id=tradeCenterStableTeamId(team);
    return {
      ...team,
      id,
      liveTeamId:String(team.id||''),
      abbr:String(team.abbr||team.abbreviation||id).toUpperCase(),
      fullName:team.fullName||team.displayName||[team.city,team.name].filter(Boolean).join(' ')||id.toUpperCase(),
      logo:team.logo||team.source?.logo_url||team.source?.logoUrl||null,
      owner:liveTeamOwnerName(team),
      ownerRole:team.ownerRole||team.source?.ownerRole||null,
      teamKey:team.teamKey||team.source?.teamKey||id
    };
  }

  function tradeCenterLivePlayerShape(player={},teamMap=new Map()) {
    const view=rosterPlayerView(player);
    const raw=player.raw||player.source||{};
    const sourceTeamId=String(view.teamId||player.teamId||'');
    const stableTeamId=teamMap.get(sourceTeamId)||String(liveTeamDirectory?.teamMap?.get(sourceTeamId)?.abbr||sourceTeamId).toLowerCase();
    const name=String(view.name||player.name||'Unknown Player');
    const nameParts=name.trim().split(/\s+/);
    const first=nameParts.shift()||'';
    const last=nameParts.join(' ');
    const imageCandidates=canonicalPlayerImageCandidates({...player,...view,raw});
    return {
      ...view,
      id:String(view.id||player.id||''),
      name,
      first,
      last,
      initials:`${first[0]||''}${last[0]||''}`.toUpperCase()||'—',
      teamId:stableTeamId,
      position:String(view.position||player.position||'').toUpperCase(),
      overall:Number(view.overall||player.overall||0)||0,
      age:Number(view.age||player.age||0)||0,
      dev:view.dev||normalizeLiveDevelopment(player.developmentTrait||raw.devTrait),
      years:Number(view.years||0)||0,
      salary:tradeCalculatorMillions(view.salary),
      capHit:tradeCalculatorMillions(view.capHit),
      number:raw.jerseyNumber??raw.jersey_number??'—',
      college:raw.college||raw.school||raw.collegeName||'—',
      injury:view.injury||player.injuryStatus||raw.injuryStatus||'Healthy',
      ratings:{...(player.ratings||{}),...corePlayerRatings(raw,player.ratings||{})},
      imageUrl:imageCandidates[0]||raw.imageUrl||raw.playerImageUrl||raw.headshotUrl||raw.portraitUrl||null,
      portraitCandidates:imageCandidates,
      liveSource:true,
      raw
    };
  }

  function removeOriginalTradeDemoSeeds() {
    try{
      const keys=['fgc-negotiations-v3','fgc-m1-trades-v2'];
      const seedIds=new Set(['101','102','104','105']);
      keys.forEach(key=>{
        const parsed=JSON.parse(localStorage.getItem(key)||'null');
        if(!parsed||typeof parsed!=='object')return;
        let changed=false;
        if(Array.isArray(parsed.negotiations)){
          const next=parsed.negotiations.filter(row=>!seedIds.has(String(row?.id||row?.negotiationId||'')));
          changed=next.length!==parsed.negotiations.length;
          parsed.negotiations=next;
        }
        if(Array.isArray(parsed.trades)){
          const next=parsed.trades.filter(row=>!seedIds.has(String(row?.id||row?.negotiationId||'')));
          changed=changed||next.length!==parsed.trades.length;
          parsed.trades=next;
        }
        if(changed)localStorage.setItem(key,JSON.stringify(parsed));
      });
    }catch(error){
      console.warn('[Trade Center LIVE Bridge] Demo cleanup skipped.',error);
    }
  }

  async function syncTradeCenterLiveBridge({rerender=true,forceLive=false}={}) {
    try{
      await loadLiveTeamDirectory(Boolean(forceLive));
      if(!liveTeamDirectory?.teams?.length||!liveTeamDirectory?.players?.length)return false;

      const liveTeams=liveTeamDirectory.teams.map(tradeCenterLiveTeamShape);
      const teamMap=new Map();
      liveTeamDirectory.teams.forEach(team=>{
        const stable=tradeCenterStableTeamId(team);
        teamMap.set(String(team.id||''),stable);
        teamMap.set(String(team.abbr||'').toLowerCase(),stable);
      });

      const livePlayers=liveTeamDirectory.players
        .filter(player=>{
          const teamId=String(player.teamId||'');
          return Boolean(teamMap.get(teamId)||liveTeamDirectory?.teamMap?.get(teamId));
        })
        .map(player=>tradeCenterLivePlayerShape(player,teamMap));

      // Critical safety choice: preserve the ORIGINAL array references.
      // trade-module.js destructures `teams` and `players` once at startup.
      // splice() updates what it sees without replacing its variables or handlers.
      teams.splice(0,teams.length,...liveTeams);
      players.splice(0,players.length,...livePlayers);

      tradeCenterLiveBridgeState={
        mode:'live',
        snapshotId:String(liveTeamDirectory.snapshot?.id||liveTeamDirectory.snapshot?.snapshotId||liveTeamDirectory.snapshot?.snapshot_id||''),
        teamCount:teams.length,
        playerCount:players.length,
        cache:false
      };

      saveTradeLiveCache(tradeCenterLiveBridgeState.snapshotId,liveTeams,livePlayers);
      removeOriginalTradeDemoSeeds();

      window.FGC_TRADE_LIVE={
        release:'5.9.10.1k',
        status:()=>({...tradeCenterLiveBridgeState}),
        resync:()=>syncTradeCenterLiveBridge({rerender:true,forceLive:true})
      };

      // Remove the pre-render Trade LIVE boot curtain only after authoritative
      // LIVE teams/players have replaced prototype data.
      document.documentElement.classList.remove('trade-live-boot-pending','trade-live-first-load');
      document.querySelector('[data-trade-live-boot-curtain]')?.remove();
      window.dispatchEvent(new CustomEvent('franchisehq:trade-live-ready',{
        detail:{...tradeCenterLiveBridgeState}
      }));

      if(rerender){
        const base=(currentAppRoute()||'').split('/')[0];
        if(['trade-center','trade-block','commissioner'].includes(base)){
          renderRoute(currentAppRoute());
        }
      }
      return true;
    }catch(error){
      console.error('[Trade Center LIVE Bridge]',error);
      return false;
    }
  }

  // v5.9.10.1d — direct special-route navigation rescue.
  // These routes use legacy Trade/Commissioner renderers and should not be blocked
  // by the platform navigation handoff.
  function navigateSpecialRoute(route='') {
    const normalized=String(route||'').replace(/^#\/?/,'').replace(/^\//,'');
    if(!['trade-center','trade-block','commissioner','commissioner/platform-workspace'].includes(normalized)) return false;
    setRoute(normalized,{source:'special-route'});

    // Keep sidebar selection in sync without requiring a second navigation event.
    document.querySelectorAll('[data-route]').forEach(node=>{
      node.classList.toggle('is-active',node.getAttribute('data-route')===normalized);
    });

    return true;
  }

  window.FranchiseHQ=window.FranchiseHQ||{};
  window.FranchiseHQ.navigateSpecialRoute=navigateSpecialRoute;

  restoreTradeLiveCache();

  window.FGC_APP = {
    teams, players, schedule, newsArticles, state, pageContent,
    teamById, playerById, teamStyle, renderTeamMark, renderPlayerIdentity,
    devClass, formatMoney, escapeHtml, setRoute, renderRoute, showToast,
    openDetail, closeDetail, applyRole, closeProfileMenu,
    commissionerAccessState, syncCommissionerAccess, renderGlobalLeagueDataBanner,
    navigateSpecialRoute,
    rosterService, rosterPlayerView, renderRosterExperience, openRosterPlayerDetail,
    syncTradeCenterLiveBridge,
    getTradeCenterLiveBridgeStatus:()=>({...tradeCenterLiveBridgeState}),
    gotw: { getWeekModel:gotwWeekModel, getOfficialGameId:officialGotwId, saveOfficial:saveOfficialGotw, currentWeek:currentHomeWeek }
  };

  window.FranchiseHQ?.ui?.registerAdapter?.('legacy-app', {
    showToast,
    getTeam: teamById
  });

  window.FranchiseHQ?.navigation?.configureLocationAdapter?.({
    routeFromLocation:routeFromPublicLocation,
    urlForRoute:publicUrlForRoute
  });

  window.FranchiseHQ?.appRouter?.configure?.({
    renderer: renderRoute,
    titleResolver: resolveRouteTitle,
    afterRender: () => window.FranchiseHQ?.sidebar?.restore?.()
  });

  window.FranchiseHQ?.navigation?.start?.({renderInitial:false});

  applyAccent(state.accent,false);
  applyDensity(state.density);
  window.addEventListener('franchisehq:simulation-changed',event=>{
    const nextRole=event.detail?.role;
    if(nextRole && nextRole!==state.role) applyRole(nextRole,false);
  });
  applyRole(window.FranchiseHQ?.simulation?.getRole?.() || state.role,false);
  window.FranchiseHQ?.appRouter?.render?.(currentAppRoute()||'home',{source:'startup'}) || renderRoute();

  // v5.9.10.1k — Trade data is hydrated synchronously from the last validated
  // LIVE cache before UI startup. Refresh Cloudflare data immediately in the
  // background instead of waiting until after the first paint.
  syncTradeCenterLiveBridge({rerender:false}).then(updated=>{
    if(updated){
      const base=(currentAppRoute()||'').split('/')[0];
      if(['trade-center','trade-block'].includes(base)) renderRoute(currentAppRoute());
    }
  });
  document.addEventListener('franchisehq:league-data-state-changed',()=>syncTradeCenterLiveBridge({rerender:true,forceLive:true}));
  window.addEventListener('franchisehq:live-snapshot-booted',()=>syncTradeCenterLiveBridge({rerender:true,forceLive:true}));
  window.addEventListener('franchisehq:one-click-import-complete',async()=>{
    const route=currentAppRoute()||'home';
    await syncTradeCenterLiveBridge({rerender:false,forceLive:true});
    if((currentAppRoute()||'home')===route)renderRoute(route);
  });

  window.addEventListener('franchisehq:live-snapshot-booted',event=>{
    const incoming=String(event?.detail?.snapshotId||event?.detail?.snapshot?.id||'');
    const cached=String(canonicalTransactionUiCache?.snapshotId||'');
    if(incoming&&cached&&incoming!==cached){
      window.FranchiseHQ?.transactionUiLoader?.clear?.();
    }
  });

  // 7.3.7 — ownership careers plus player and mobile experience remediation.
  const VISIBLE_RELEASE = '7.4.0.5';
  function visibleEnvironment() {
    const hostname=String(window.location.hostname||'').toLowerCase();
    if(hostname==='franchisehq.app'||hostname==='franchise-hq.pages.dev')return 'Production';
    if(hostname.endsWith('.franchise-hq.pages.dev'))return 'Staging';
    if(hostname==='localhost'||hostname==='127.0.0.1'||hostname==='::1')return 'Local';
    return 'Unknown Environment';
  }
  function syncVisibleReleaseMarker() {
    const environment=visibleEnvironment();
    document.querySelectorAll('.version-label,[data-current-release]').forEach(node => {
      node.textContent = `${environment} · Current Release ${VISIBLE_RELEASE}`;
    });
    document.documentElement.dataset.franchiseHqRelease = VISIBLE_RELEASE;
    document.documentElement.dataset.franchiseHqEnvironment = environment.toLowerCase().replaceAll(' ','-');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncVisibleReleaseMarker, { once:true });
  } else {
    syncVisibleReleaseMarker();
  }
  window.addEventListener('load', syncVisibleReleaseMarker, { once:true });


  window.FranchiseHQ=window.FranchiseHQ||{};
  window.FranchiseHQ.playerLiveSync={
    release:'6.3.2',
    refresh:async()=>{
      await syncTradeCenterLiveBridge({rerender:true,forceLive:true});
      return window.FranchiseHQ.playerLiveSync.status();
    },
    status:()=>{
      const live=liveTeamDirectory?.players||[];
      const serviceRows=window.FranchiseHQ?.players?.getAll?.()||[];
      const liveIds=new Set(live.map(p=>String(p.id||'')));
      const serviceIds=new Set(serviceRows.map(p=>String(p.id??p.externalId??p.playerId??p.rosterId??'')));
      let missingFromService=0,staleInService=0;
      liveIds.forEach(id=>{if(id&&!serviceIds.has(id))missingFromService++});
      serviceIds.forEach(id=>{if(id&&!liveIds.has(id))staleInService++});
      return{
        release:'6.3.2',
        snapshotId:String(liveTeamDirectory?.snapshot?.id||liveTeamDirectory?.snapshot?.snapshotId||''),
        livePlayerCount:live.length,
        playerServiceCount:serviceRows.length,
        missingFromService,
        staleInService,
        synchronized:Boolean(live.length&&live.length===serviceRows.length&&!missingFromService&&!staleInService)
      };
    }
  };

  window.FranchiseHQ.contracts={
    release:'5.9.10.0',
    normalize:player=>canonicalContract(player),
    forPlayer:playerId=>{
      const id=String(playerId||'');
      const allPlayers=liveTeamDirectory?.players
        || [...(liveTeamDirectory?.playersByTeam?.values?.()||[])].flat();
      const player=(allPlayers||[]).find(row=>String(row.id)===id);
      return player?canonicalContract(player):null;
    },
    audit:()=>{
      const allPlayers=liveTeamDirectory?.players
        || [...(liveTeamDirectory?.playersByTeam?.values?.()||[])].flat();
      return contractAudit(allPlayers||[]);
    },
    certify:()=>{
      const allPlayers=liveTeamDirectory?.players
        || [...(liveTeamDirectory?.playersByTeam?.values?.()||[])].flat();
      const teams=liveTeamDirectory?.teams||[];
      return certifyContracts(allPlayers||[],teams);
    },
    aliases:()=>JSON.parse(JSON.stringify(CONTRACT_FIELD_ALIASES))
  };



  function transactionLeagueSlug(){
    const routeMatch=location.pathname.match(/\/leagues\/([^/]+)/i);
    if(routeMatch?.[1])return decodeURIComponent(routeMatch[1]).toLowerCase();
    return String(
      window.FranchiseHQ?.leagueTenant?.current?.()?.slug ||
      window.FranchiseHQ?.leagueSlug ||
      window.FranchiseHQ?.liveData?.leagueSlug ||
      window.FranchiseHQ?.leagueData?.currentSource?.()?.leagueSlug ||
      ''
    ).trim().toLowerCase();
  }

  function transactionEndpoint(){
    return `/api/leagues/${encodeURIComponent(transactionLeagueSlug())}/transactions/canonical`;
  }

  function transactionPrimitive(value){
    return value===null || ['string','number','boolean'].includes(typeof value);
  }

  function firstTransactionValue(source={},keys=[]){
    for(const key of keys){
      const value=source?.[key];
      if(value!==undefined&&value!==null&&value!=='')return value;
    }
    return null;
  }

  function normalizedTransactionType(value=''){
    const text=String(value||'').trim().toLowerCase();
    if(/trade|traded/.test(text))return 'trade';
    if(/waiv.*claim|claim/.test(text))return 'waiver-claim';
    if(/waiv/.test(text))return 'waived';
    if(/release|released|cut/.test(text))return 'release';
    if(/sign|signed|acquire|acquired/.test(text))return 'signing';
    return '';
  }

  function explicitTransactionEventsFromPlayers(players=[]){
    const grouped=new Map();

    (players||[]).forEach(player=>{
      const raw=player?.raw||player?.source||{};
      const candidates=[];
      const visit=(value,path='root',depth=0)=>{
        if(!value||typeof value!=='object'||depth>3)return;
        Object.entries(value).forEach(([key,child])=>{
          const keyType=normalizedTransactionType(key);
          const valueType=transactionPrimitive(child)?normalizedTransactionType(child):'';
          const looksExplicit=/(transactionType|transaction_type|lastTransaction|tradeType|trade_type|rosterTransaction|movementType)/i.test(key);
          if((looksExplicit&&valueType) || (keyType&&typeof child==='boolean'&&child===true)){
            candidates.push({container:value,path:`${path}.${key}`,type:valueType||keyType});
          }
          if(child&&typeof child==='object')visit(child,`${path}.${key}`,depth+1);
        });
      };
      visit(raw);

      candidates.forEach((candidate,index)=>{
        const container=candidate.container||raw;
        const type=candidate.type;
        if(!type)return;

        const fromTeam=String(firstTransactionValue(container,[
          'fromTeamId','from_team_id','previousTeamId','previous_team_id','formerTeamId','oldTeamId'
        ]) ?? firstTransactionValue(raw,[
          'fromTeamId','from_team_id','previousTeamId','previous_team_id','formerTeamId','oldTeamId'
        ]) ?? '');
        const toTeam=String(firstTransactionValue(container,[
          'toTeamId','to_team_id','newTeamId','new_team_id','teamId','team_id'
        ]) ?? firstTransactionValue(raw,['toTeamId','to_team_id','teamId','team_id']) ?? player.teamId ?? '');
        const eventId=String(firstTransactionValue(container,[
          'transactionId','transaction_id','tradeId','trade_id','eventId','event_id'
        ]) ?? firstTransactionValue(raw,[
          'transactionId','transaction_id','tradeId','trade_id','eventId','event_id'
        ]) ?? '');
        const season=Number(firstTransactionValue(container,['season','seasonYear','transactionSeason','transaction_season'])
          ?? firstTransactionValue(raw,['season','seasonYear','transactionSeason','transaction_season']));
        const week=Number(firstTransactionValue(container,['week','weekIndex','transactionWeek','transaction_week'])
          ?? firstTransactionValue(raw,['week','weekIndex','transactionWeek','transaction_week']));
        const date=String(firstTransactionValue(container,['date','transactionDate','transaction_date','createdAt','created_at'])
          ?? firstTransactionValue(raw,['transactionDate','transaction_date','createdAt','created_at']) ?? '');

        // Prefer an explicit Madden event ID. Otherwise group players that share the same
        // type/team pair/season/week/date so a multi-player trade becomes one evidence event.
        const pair=[fromTeam,toTeam].filter(Boolean).sort().join('|');
        const sourceKey=eventId
          ? `madden:${eventId}`
          : `madden:${type}:${pair}:${Number.isFinite(season)?season:''}:${Number.isFinite(week)?week:''}:${date||candidate.path}`;

        const current=grouped.get(sourceKey)||{
          sourceKey,
          sourceType:'madden-explicit',
          eventType:type,
          fromTeamId:fromTeam||null,
          toTeamId:toTeam||null,
          teamIds:[...new Set([fromTeam,toTeam].filter(Boolean))],
          playerIds:[],
          season:Number.isFinite(season)?season:null,
          week:Number.isFinite(week)?week:null,
          occurredAt:date||null,
          confidence:'explicit',
          rawEvidence:[]
        };
        if(player.id&&!current.playerIds.includes(String(player.id)))current.playerIds.push(String(player.id));
        if(current.rawEvidence.length<12)current.rawEvidence.push({playerId:String(player.id||''),path:candidate.path,type});
        grouped.set(sourceKey,current);
      });
    });

    return [...grouped.values()];
  }

  function workflowTransactionEvents(teams=[]){
    const records=franchiseTradeRecords(teams);
    return records.map((record,index)=>{
      const raw=record||{};
      const playerIds=[...new Set([
        ...(raw.playerIds||[]),
        ...(raw.players||[]).map(value=>typeof value==='object'?(value.id||value.playerId):value),
        ...(raw.assets||[]).filter(value=>String(value?.type||'').toLowerCase()==='player').map(value=>value.playerId||value.id)
      ].filter(Boolean).map(String))];
      return {
        sourceKey:`workflow:${raw.id||raw.tradeId||index}`,
        sourceType:'franchisehq-workflow',
        workflowTradeId:String(raw.id||raw.tradeId||'')||null,
        eventType:'trade',
        teamIds:[...new Set((raw.teamIds||[]).filter(Boolean).map(String))],
        playerIds,
        status:String(raw.status||'approved').toLowerCase(),
        occurredAt:raw.date||raw.updatedAt||raw.createdAt||null,
        confidence:'workflow',
        rawEvidence:raw
      };
    }).filter(row=>['approved','complete','completed'].includes(row.status));
  }

  function currentRosterState(players=[]){
    return (players||[])
      .filter(player=>{
        const team=String(player.teamId||'').toLowerCase();
        const status=String(player.rosterStatus||'').toLowerCase();
        return !['','fa','free-agent','free_agent','unassigned','none','null'].includes(team)
          && !['free-agent','unassigned'].includes(status);
      })
      .map(player=>({
        playerId:String(player.id||''),
        playerName:String(player.name||'Unknown Player'),
        teamId:String(player.teamId||''),
        rosterStatus:String(player.rosterStatus||'active'),
        position:String(player.position||''),
        overall:Number(player.overall??0)||null,
        age:Number(player.age??0)||null,
        devTrait:String(player.developmentTrait||player.dev||''),
        source:player.raw||player.source||{}
      })).filter(row=>row.playerId);
  }

  async function canonicalTransactionRequest(method='GET',body=null){
    const response=await fetch(transactionEndpoint(),{
      method,
      credentials:'include',
      headers:body?{'content-type':'application/json'}:undefined,
      body:body?JSON.stringify(body):undefined
    });
    let payload=null;
    try{payload=await response.json()}catch{}
    if(!response.ok || payload?.ok===false){
      const error=new Error(payload?.detail||payload?.error||`Transaction engine request failed (${response.status}).`);
      error.status=response.status;
      error.payload=payload;
      throw error;
    }
    return payload;
  }

  async function syncCanonicalTransactions(force=true){
    await loadLiveTeamDirectory(Boolean(force));
    const snapshot=liveTeamDirectory?.snapshot||{};
    const snapshotId=String(snapshot.id||snapshot.snapshotId||snapshot.snapshot_id||'');
    if(!snapshotId)throw new Error('No active LIVE snapshot ID is available.');

    const players=liveTeamDirectory?.players||[];
    const teams=liveTeamDirectory?.teams||[];
    const explicitEvents=explicitTransactionEventsFromPlayers(players);
    const workflowEvents=workflowTransactionEvents(teams);

    const payload=await canonicalTransactionRequest('POST',{
      action:'sync',
      snapshotId,
      season:Number(snapshot.seasonYear??snapshot.season??0)||null,
      week:Number(snapshot.weekIndex??snapshot.week??snapshot.currentWeek??0)||null,
      roster:currentRosterState(players),
      explicitEvents,
      workflowEvents
    });

    // 6.4.6: reconstruct roster lifecycle from complete 32-team Companion capture sessions.
    // This gives us stable rosterId-based Releases/Signings even when a player disappears
    // from the current canonical player snapshot and no Free Agent endpoint is available.
    const plan=await canonicalTransactionRequest('POST',{action:'capture-lifecycle-plan'});
    const pending=(plan.sessions||[]).filter(row=>!row.processed);
    const processed=[];
    for(const session of pending){
      processed.push(await canonicalTransactionRequest('POST',{action:'capture-lifecycle-session',sessionId:session.sessionId}));
    }
    const lifecycle=await canonicalTransactionRequest('POST',{action:'capture-lifecycle-finalize'});

    canonicalTransactionUiCache={payload:null,promise:null,loadedAt:0,snapshotId:''};
    window.dispatchEvent(new CustomEvent('franchisehq:league-data-state-changed'));
      try{window.FranchiseHQ?.transactionUiLoader?.clear?.()}catch{}
    return {...payload,captureLifecycle:{planned:plan.sessions?.length||0,processedSessions:processed.length,...lifecycle}};
  }

  function transactionCertificationVisibilitySample(){
    const rows=[
      {name:'workflow-only trade',eventType:'trade',authority:'franchisehq-workflow',executionStatus:'pending-madden-execution',expected:false},
      {name:'Madden-confirmed trade',eventType:'trade',authority:'franchisehq+madden',executionStatus:'confirmed-madden',expected:true},
      {name:'snapshot-confirmed trade',eventType:'trade',authority:'franchisehq+snapshot-confirmed',executionStatus:'confirmed-roster',expected:true},
      {name:'Madden signing',eventType:'signing',authority:'madden-explicit',executionStatus:'confirmed-madden',expected:true},
      {name:'snapshot release',eventType:'release',authority:'snapshot-inferred',executionStatus:'observed-roster',expected:true}
    ];
    return rows.map(row=>({...row,actual:transactionIsPubliclyVisible(row),pass:transactionIsPubliclyVisible(row)===row.expected}));
  }

  async function certifyTransactionIntegration(){
    await loadLiveTeamDirectory(false);
    const checks=[];
    const add=(id,label,pass,detail,severity='error')=>checks.push({id,label,pass:Boolean(pass),detail,severity});

    const payload=await canonicalTransactionRequest('GET');
    const transactions=Array.isArray(payload?.transactions)?payload.transactions:[];
    const rosterSnapshots=Array.isArray(payload?.rosterSnapshots)?payload.rosterSnapshots:[];

    add('canonical-api','Canonical transaction API available',payload?.ok===true,
      payload?.ok===true?`${transactions.length} canonical transactions loaded.`:'Canonical transaction API did not return ok:true.');

    add('roster-baseline','Roster snapshot baseline exists',rosterSnapshots.length>0,
      rosterSnapshots.length?`${rosterSnapshots.length} roster snapshot baseline${rosterSnapshots.length===1?'':'s'} available.`:'No canonical roster snapshot baseline is stored.');

    const duplicateIds=[];
    const seenIds=new Set();
    transactions.forEach(row=>{
      const id=String(row.id||'');
      if(!id)return;
      if(seenIds.has(id))duplicateIds.push(id);
      seenIds.add(id);
    });
    add('unique-canonical-ids','Canonical transaction IDs are unique',duplicateIds.length===0,
      duplicateIds.length?`${duplicateIds.length} duplicate canonical IDs found.`:'No duplicate canonical transaction IDs found.');

    const duplicateEvidence=[];
    const seenEvidence=new Set();
    transactions.forEach(row=>{
      (row.evidence||[]).forEach(item=>{
        const key=`${item.sourceType||''}:${item.sourceKey||''}`;
        if(!item.sourceKey)return;
        if(seenEvidence.has(key))duplicateEvidence.push(key);
        seenEvidence.add(key);
      });
    });
    add('unique-evidence','Evidence source keys are unique',duplicateEvidence.length===0,
      duplicateEvidence.length?`${duplicateEvidence.length} duplicate evidence source keys found.`:'Evidence source keys are unique.');

    const workflowOnlyPublic=transactions.filter(row=>{
      const authority=String(row.authority||'').toLowerCase();
      const execution=String(row.executionStatus||'').toLowerCase();
      return transactionIsPubliclyVisible(row) &&
        (authority==='franchisehq-workflow'||execution==='pending-madden-execution');
    });
    add('privacy-workflow','Private workflow-only trades stay private',workflowOnlyPublic.length===0,
      workflowOnlyPublic.length?`${workflowOnlyPublic.length} workflow-only/pending records would leak into public history.`:'No workflow-only or pending-Madden records are publicly visible.');

    const visibilitySample=transactionCertificationVisibilitySample();
    const visibilityFailures=visibilitySample.filter(row=>!row.pass);
    add('visibility-rules','Public transaction visibility rules behave correctly',visibilityFailures.length===0,
      visibilityFailures.length?`${visibilityFailures.length} synthetic visibility rule checks failed.`:'Synthetic privacy/publication rules all passed.');

    const players=liveTeamDirectory?.players||[];
    const teams=liveTeamDirectory?.teams||[];
    const playerIds=new Set(players.map(player=>String(player.id)));
    const teamAliases=new Set();
    teams.forEach(team=>canonicalTeamAliases(team).forEach(alias=>teamAliases.add(alias)));

    const orphanPlayers=[];
    const orphanTeams=[];
    transactions.forEach(row=>{
      (row.playerIds||[]).forEach(id=>{
        if(id && !playerIds.has(String(id)))orphanPlayers.push({transactionId:row.id,playerId:String(id)});
      });
      (row.teamIds||[]).forEach(id=>{
        if(id && !teamAliases.has(String(id).toLowerCase()))orphanTeams.push({transactionId:row.id,teamId:String(id)});
      });
    });

    add('player-integrity','Transaction player IDs resolve to LIVE players',orphanPlayers.length===0,
      orphanPlayers.length?`${orphanPlayers.length} transaction player references do not resolve to the LIVE player directory.`:'All transaction player IDs resolve to LIVE players.',
      orphanPlayers.length?'warning':'error');

    add('team-integrity','Transaction team IDs resolve to LIVE teams',orphanTeams.length===0,
      orphanTeams.length?`${orphanTeams.length} transaction team references do not resolve to the LIVE team directory.`:'All transaction team IDs resolve to LIVE teams.',
      orphanTeams.length?'warning':'error');

    const evidenceMismatch=[];
    transactions.forEach(row=>{
      const evidenceTypes=new Set((row.evidence||[]).map(item=>String(item.sourceType||'').toLowerCase()));
      const authority=String(row.authority||'').toLowerCase();
      if(authority==='franchisehq+madden' && !(evidenceTypes.has('franchisehq-workflow')&&evidenceTypes.has('madden-explicit'))){
        evidenceMismatch.push({transactionId:row.id,authority,evidence:[...evidenceTypes]});
      }
      if(authority==='franchisehq+snapshot-confirmed' && !(evidenceTypes.has('franchisehq-workflow')&&evidenceTypes.has('snapshot-diff'))){
        evidenceMismatch.push({transactionId:row.id,authority,evidence:[...evidenceTypes]});
      }
      if(authority==='snapshot-inferred' && !evidenceTypes.has('snapshot-diff')){
        evidenceMismatch.push({transactionId:row.id,authority,evidence:[...evidenceTypes]});
      }
    });
    add('authority-evidence','Canonical authority matches attached evidence',evidenceMismatch.length===0,
      evidenceMismatch.length?`${evidenceMismatch.length} canonical records have authority/evidence mismatches.`:'Canonical authority labels agree with attached evidence.',
      evidenceMismatch.length?'warning':'error');

    const synthetic=await canonicalTransactionRequest('POST',{action:'dedupe-test'});
    add('dedupe-invariant','One real-world trade = one canonical transaction',synthetic?.test?.passed===true,
      synthetic?.test?.passed===true
        ?`Synthetic dedupe test merged ${synthetic.test.simulatedEvidenceRecords} evidence sources into ${synthetic.test.expectedCanonicalTransactions} canonical transaction.`
        :'Synthetic dedupe invariant failed.');

    const publicTransactions=transactions.filter(transactionIsPubliclyVisible);
    const privateTransactions=transactions.filter(row=>!transactionIsPubliclyVisible(row));
    const failures=checks.filter(check=>!check.pass&&check.severity==='error');
    const warnings=checks.filter(check=>!check.pass&&check.severity==='warning');

    return {
      release:'5.9.10.5',
      status:failures.length?'FAIL':warnings.length?'PASS WITH WARNINGS':'PASS',
      passed:failures.length===0,
      checks,
      failures,
      warnings,
      summary:{
        canonicalTransactions:transactions.length,
        publicTransactions:publicTransactions.length,
        privateTransactions:privateTransactions.length,
        rosterSnapshots:rosterSnapshots.length,
        livePlayers:players.length,
        liveTeams:teams.length
      },
      visibilitySample,
      generatedAt:new Date().toISOString()
    };
  }

  function freeAgentLikeValue(value){
    if(value===undefined||value===null)return false;
    const text=String(value).trim().toLowerCase();
    if(!text)return false;
    return ['0','fa','free agent','free-agent','free_agent','unassigned','none','null','freeagent'].includes(text);
  }

  function explicitFreeAgentEvidence(player={}){
    const raw=player.raw||player.source||{};
    const fields=[
      ['teamId',player.teamId],['teamAbbr',player.teamAbbr],['rosterStatus',player.rosterStatus],['status',player.status],
      ['raw.teamId',raw.teamId],['raw.team_id',raw.team_id],['raw.teamExternalId',raw.teamExternalId],
      ['raw.team_external_id',raw.team_external_id],['raw.rosterStatus',raw.rosterStatus],
      ['raw.roster_status',raw.roster_status],['raw.status',raw.status]
    ];
    return fields.filter(([,value])=>freeAgentLikeValue(value)).map(([field,value])=>({field,value}));
  }

  function playerSourceTeamCandidates(player={}){
    const raw=player.raw||player.source||player||{};
    const keys=['teamId','team_id','teamExternalId','team_external_id','team','teamAbbr','team_abbr','currentTeamId','current_team_id','rosterStatus','roster_status','status'];
    return keys.map(key=>({key,value:raw?.[key]})).filter(row=>row.value!==undefined&&row.value!==null&&row.value!=='');
  }

  async function freeAgentAndSnapshotDiscovery(){
    await loadLiveTeamDirectory(false);
    const canonicalPlayers=liveTeamDirectory?.players||[];
    const canonicalTeams=liveTeamDirectory?.teams||[];
    const snapshot=liveTeamDirectory?.snapshot||{};
    const playerServiceRows=window.FranchiseHQ?.players?.getAll?.()||[];

    const sourceFieldCoverage=new Map();
    canonicalPlayers.forEach(player=>{
      playerSourceTeamCandidates(player).forEach(({key,value})=>{
        const row=sourceFieldCoverage.get(key)||{field:key,count:0,values:new Map()};
        row.count+=1;
        const val=String(value);
        row.values.set(val,(row.values.get(val)||0)+1);
        sourceFieldCoverage.set(key,row);
      });
    });

    const fieldCoverage=[...sourceFieldCoverage.values()].map(row=>({
      field:row.field,
      count:row.count,
      topValues:[...row.values.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([value,count])=>({value,count}))
    })).sort((a,b)=>b.count-a.count);

    const canonicalFreeAgentLike=canonicalPlayers
      .map(player=>({player,evidence:explicitFreeAgentEvidence(player)}))
      .filter(row=>row.evidence.length);

    const canonicalUnmappedTeam=canonicalPlayers.filter(player=>{
      const id=String(player.teamId||'');
      return id && !canonicalTeams.some(team=>String(team.id)===id);
    });

    const backend=await canonicalTransactionRequest('POST',{
      action:'raw-discovery',
      activeSnapshotId:String(snapshot.id||snapshot.snapshotId||snapshot.snapshot_id||'')
    });

    return {
      release:'5.9.10.6.0',
      activeSnapshot:{
        id:String(snapshot.id||snapshot.snapshotId||snapshot.snapshot_id||'')||null,
        season:snapshot.seasonYear??snapshot.season??null,
        week:snapshot.week??snapshot.currentWeek??null
      },
      canonicalPlayerDirectory:{
        count:canonicalPlayers.length,
        playerServiceCount:playerServiceRows.length,
        freeAgentLikeCount:canonicalFreeAgentLike.length,
        unmappedTeamCount:canonicalUnmappedTeam.length,
        freeAgentLikeSample:canonicalFreeAgentLike.slice(0,25).map(({player,evidence})=>({
          id:player.id,name:player.name||player.displayName,teamId:player.teamId||null,
          rosterStatus:player.rosterStatus||player.status||null,evidence
        })),
        sourceFieldCoverage:fieldCoverage
      },
      historicalSnapshots:backend?.historicalSnapshots||[],
      sourcePlayerAudit:backend?.sourcePlayerAudit||null,
      transactionBackfill:backend?.transactionBackfill||null,
      rawStorageDiscovery:backend?.rawStorageDiscovery||null,
      d1StorageInventory:backend?.d1StorageInventory||null,
      r2StorageInventory:backend?.r2StorageInventory||null,
      generatedAt:new Date().toISOString()
    };
  }

  async function historicalSnapshotRawPlayerDeepInspection(){
    await loadLiveTeamDirectory(false);
    const snapshot=liveTeamDirectory?.snapshot||{};
    const backend=await canonicalTransactionRequest('POST',{
      action:'deep-inspection',
      activeSnapshotId:String(snapshot.id||snapshot.snapshotId||snapshot.snapshot_id||'')
    });
    return {
      release:'5.9.10.6.0b',
      activeSnapshot:{
        id:String(snapshot.id||snapshot.snapshotId||snapshot.snapshot_id||'')||null,
        season:snapshot.seasonYear??snapshot.season??null,
        week:snapshot.week??snapshot.currentWeek??null
      },
      leagueSnapshots:backend?.leagueSnapshots||[],
      snapshotRecordInventory:backend?.snapshotRecordInventory||null,
      playerPreviewAudit:backend?.playerPreviewAudit||null,
      routeCaptureAudit:backend?.routeCaptureAudit||null,
      historicalBackfillReadiness:backend?.historicalBackfillReadiness||null,
      generatedAt:new Date().toISOString()
    };
  }

  async function integrateFreeAgentsAndHistoricalRoster(){
    const progress={
      release:'5.9.10.6.1',
      stage:'planning',
      freeAgents:{capturesProcessed:0,discovered:0},
      historical:{snapshotsProcessed:0,recordsProcessed:0},
      final:null
    };

    const plan=await canonicalTransactionRequest('POST',{action:'integration-plan'});
    progress.plan=plan;

    // Scan small R2 capture batches to stay below Cloudflare Worker CPU/memory limits.
    let captureOffset=0;
    const captureTotal=Number(plan?.freeAgentCaptureCount||0);
    while(captureOffset<captureTotal){
      progress.stage='free-agent-scan';
      const batch=await canonicalTransactionRequest('POST',{
        action:'scan-free-agents',
        offset:captureOffset,
        limit:3
      });
      captureOffset+=Number(batch?.processedCaptures||0);
      if(!Number(batch?.processedCaptures||0))break;
      progress.freeAgents.capturesProcessed=captureOffset;
      progress.freeAgents.discovered=Number(batch?.canonicalFreeAgents||progress.freeAgents.discovered||0);
    }

    // Normalize each historical league snapshot in bounded D1 record batches.
    for(const snapshot of plan?.snapshots||[]){
      progress.stage='historical-normalization';
      let offset=0;
      const total=Number(snapshot.recordCount||0);
      while(offset<total){
        const batch=await canonicalTransactionRequest('POST',{
          action:'normalize-historical-snapshot',
          snapshotId:String(snapshot.snapshotId),
          offset,
          limit:400
        });
        const processed=Number(batch?.processedRecords||0);
        if(!processed)break;
        offset+=processed;
        progress.historical.recordsProcessed+=processed;
      }
      progress.historical.snapshotsProcessed+=1;
    }

    progress.stage='historical-backfill';
    const final=await canonicalTransactionRequest('POST',{action:'finalize-historical-backfill'});
    progress.final=final;
    progress.stage='complete';

    // Force the live directory to reload so the Players page immediately receives persisted Free Agents.
    window.dispatchEvent(new CustomEvent('franchisehq:league-data-state-changed'));
      try{window.FranchiseHQ?.transactionUiLoader?.clear?.()}catch{}

    return progress;
  }

  async function inspectStoredRecordAndRouteShapes(){
    const payload=await canonicalTransactionRequest('POST',{action:'decoder-inspection'});
    return {
      release:'5.9.10.6.1a',
      snapshotRecordSchema:payload?.snapshotRecordSchema||null,
      snapshotRecordSamples:payload?.snapshotRecordSamples||[],
      snapshotRecordDistributions:payload?.snapshotRecordDistributions||null,
      routePayloadSamples:payload?.routePayloadSamples||[],
      routeStructureSummary:payload?.routeStructureSummary||null,
      candidatePlayerCollections:payload?.candidatePlayerCollections||[],
      freeAgentFieldEvidence:payload?.freeAgentFieldEvidence||[],
      generatedAt:new Date().toISOString()
    };
  }

  async function discoverFreeAgentRouteAndDecodeHistory(){
    const payload=await canonicalTransactionRequest('POST',{action:'route-and-history-discovery'});
    return {
      release:'5.9.10.6.1b',
      routeInventory:payload?.routeInventory||null,
      nonTeamRosterRoutes:payload?.nonTeamRosterRoutes||[],
      candidateLeaguePlayerRoutes:payload?.candidateLeaguePlayerRoutes||[],
      candidatePayloads:payload?.candidatePayloads||[],
      historicalPlayerDomains:payload?.historicalPlayerDomains||null,
      historicalPlayerSamples:payload?.historicalPlayerSamples||[],
      historicalSnapshotCounts:payload?.historicalSnapshotCounts||[],
      backfillPreview:payload?.backfillPreview||null,
      generatedAt:new Date().toISOString()
    };
  }

  async function freeAgentCaptureStatus(){
    const slug=typeof transactionLeagueSlug==='function'?transactionLeagueSlug():(location.pathname.match(/\/leagues\/([^/]+)/i)?.[1]||'');
    const response=await fetch(`/api/leagues/${encodeURIComponent(slug)}/companion/free-agent-capture`,{
      credentials:'include',
      cache:'no-store'
    });
    const text=await response.text();
      let payload;
      try{payload=JSON.parse(text)}catch{payload={ok:false,http:response.status,error:`HTTP ${response.status}`,detail:text.slice(0,500)}}
    if(!response.ok||payload?.ok===false)throw Object.assign(new Error(payload?.detail||payload?.error||'Free Agent capture status failed.'),{payload});
    return payload;
  }

  async function forwardTransactionDetectionStatus(){
    const slug=typeof transactionLeagueSlug==='function'?transactionLeagueSlug():(location.pathname.match(/\/leagues\/([^/]+)/i)?.[1]||'');
    const response=await fetch(`/api/leagues/${encodeURIComponent(slug)}/transactions/forward-detection`,{
      credentials:'include',
      cache:'no-store'
    });
    const payload=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
    if(!response.ok||payload?.ok===false)throw Object.assign(new Error(payload?.detail||payload?.error||'Forward transaction detection status failed.'),{payload});
    return payload;
  }

  async function transactionClassificationStatus(){
    const slug=typeof transactionLeagueSlug==='function'?transactionLeagueSlug():(location.pathname.match(/\/leagues\/([^/]+)/i)?.[1]||'');
    const response=await fetch(`/api/leagues/${encodeURIComponent(slug)}/transactions/classification`,{credentials:'include',cache:'no-store'});
    const payload=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
    if(!response.ok||payload?.ok===false)throw Object.assign(new Error(payload?.detail||payload?.error||'Transaction classification status failed.'),{payload});
    return payload;
  }

  window.FranchiseHQ=window.FranchiseHQ||{};
  window.FranchiseHQ.transactions={
    release:'6.3.2',
    mode:'read-only-stabilized',
    audit:()=>transactionDiscoveryAudit(),
    fieldCoverage:async()=>{
      await loadLiveTeamDirectory(false);
      return transactionFieldCoverage(liveTeamDirectory?.players||[]);
    },
    inferenceCoverage:async()=>{
      await loadLiveTeamDirectory(false);
      return transactionRosterInferenceCoverage(liveTeamDirectory?.players||[]);
    },
    tradeCenterRecords:async()=>{
      await loadLiveTeamDirectory(false);
      return franchiseTradeRecords(liveTeamDirectory?.teams||[]);
    },
    explicitEvents:async()=>{
      await loadLiveTeamDirectory(false);
      return explicitTransactionEventsFromPlayers(liveTeamDirectory?.players||[]);
    },
    workflowEvents:async()=>{
      await loadLiveTeamDirectory(false);
      return workflowTransactionEvents(liveTeamDirectory?.teams||[]);
    },
    canonical:()=>canonicalTransactionRequest('GET'),
    dedupeTest:()=>canonicalTransactionRequest('POST',{action:'dedupe-test'}),
    certify:()=>certifyTransactionIntegration(),
    inspectStoredRecordShapes:()=>inspectStoredRecordAndRouteShapes(),
    freeAgentCaptureStatus:()=>freeAgentCaptureStatus(),
    forwardDetectionStatus:()=>forwardTransactionDetectionStatus(),
    classificationStatus:()=>transactionClassificationStatus()
  };

})();

  window.addEventListener('franchisehq:one-click-import-complete', async () => {
    window.FranchiseHQ?.transactionUiLoader?.clear?.();
    try{
      [...Object.keys(sessionStorage)].filter(key=>key.startsWith('fhq:live-home:')).forEach(key=>sessionStorage.removeItem(key));
      [...Object.keys(localStorage)].filter(key=>key.startsWith('fhq:home-critical:')).forEach(key=>localStorage.removeItem(key));
    }catch{}
    window.__FHQ_HOME_DEEP_CACHE__=null;

    try{await window.FranchiseHQ?.transactionUiLoader?.load?.(true)}
    catch(error){console.warn('[Transactions Post Import Refresh]',error)}

    const activeRoute=String(currentAppRoute()||'').replace(/^\/?/,'');
    const base=activeRoute.split('/')[0]||'home';
    if(base==='transactions'){
      renderLeagueTransactions();
    }else if(base==='teams'&&state.teamTab==='trade-history'){
      const teamId=activeTeamIdForTeamPage();
      const team=liveTeamDirectory?.teamMap?.get(teamId);
      if(team)refreshTeamTransactionHistory(team,pageContent.querySelector('[data-team-tab-content]'));
    }

    const playerHost=document.querySelector('[data-canonical-player-transaction-history]');
    if(playerHost){
      refreshCanonicalPlayerTransactionHistory(playerHost.dataset.canonicalPlayerTransactionHistory,document);
    }

    setTimeout(warmLeagueReadCaches,0);
  });

  // 5.9.11.0 stabilization baseline
  // P5 lifecycle/free-agent/trade repair consoles were intentionally removed.
  // Current player state is authoritative from the active Madden snapshot only.
  // Free Agent ingestion remains source-only until Madden 27 export behavior is certified.
  window.FranchiseHQ=window.FranchiseHQ||{};
  window.FranchiseHQ.stabilization={
    release:'6.3.2',
    transactionRepairsDisabled:true,
    freeAgentInferenceDisabled:true,
    sourceOfTruth:'active-madden-snapshot'
  };

  function warmLeagueReadCaches(){

    const live=window.FranchiseHQ?.liveData
      || window.FranchiseHQ?.league?.liveData
      || window.FranchiseHQ?.getModuleService?.('league','liveData')
      || null;
    if(live?.warm)live.warm().catch(()=>{});
    window.FranchiseHQ?.transactionUiLoader?.load?.(false)?.catch?.(()=>{});
  }

  function warmLeagueStatisticsCache(){
    // 6.5.2b: statistics state/hydrator live inside the player module closure.
    // Do not reach across that scope from the global boot path.
    return;
  }

  const scheduleStatisticsWarm=()=>{};
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{
      setTimeout(warmLeagueReadCaches,0);
      scheduleStatisticsWarm();
    },{once:true});
  }else{
    setTimeout(warmLeagueReadCaches,0);
    scheduleStatisticsWarm();
  }

  window.addEventListener('franchisehq:league-data-state-changed', () => {
    window.FGC_APP?.renderGlobalLeagueDataBanner?.();
  });


document.addEventListener('click',event=>{
  const button=event.target.closest('[data-statistics-preview-category]');
  if(!button)return;
  event.preventDefault();
  event.stopPropagation();
  const root=button.closest('[data-statistics-preview-root]');
  if(!root)return;
  const category=button.getAttribute('data-statistics-preview-category');
  root.querySelectorAll('[data-statistics-preview-category]').forEach(b=>b.classList.toggle('is-active',b===button));
  root.querySelectorAll('[data-statistics-preview-panel]').forEach(panel=>panel.classList.toggle('is-active',panel.getAttribute('data-statistics-preview-panel')===category));
});

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-team-tab],[data-team-detail-nav]');
  if(!button)return;
  const teamPage=button.closest('[data-team-detail],[data-team-page]');
  if(!teamPage)return;
  const tab=button.getAttribute('data-team-tab')||button.getAttribute('data-team-detail-nav');
  if(!tab)return;
  event.preventDefault();
  event.stopPropagation();
  document.querySelectorAll('[data-team-tab],[data-team-detail-nav]').forEach(b=>b.classList.toggle('is-active',(b.getAttribute('data-team-tab')||b.getAttribute('data-team-detail-nav'))===tab));
  teamPage.querySelectorAll('[data-team-panel],[data-team-detail-panel]').forEach(panel=>{
    const id=panel.getAttribute('data-team-panel')||panel.getAttribute('data-team-detail-panel');
    panel.classList.toggle('is-active',id===tab);
  });
});

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-sort-table]');
  if(!button)return;
  event.preventDefault();
  const table=document.getElementById(button.dataset.sortTable); if(!table)return;
  const col=Number(button.dataset.sortCol),body=table.tBodies[0],rows=[...body.rows];
  const next=button.dataset.sortDir==='asc'?'desc':'asc'; button.dataset.sortDir=next;
  rows.sort((a,b)=>{
    const av=a.cells[col]?.textContent.trim()||'',bv=b.cells[col]?.textContent.trim()||'';
    const an=Number(av.replace(/[^0-9.-]/g,'')),bn=Number(bv.replace(/[^0-9.-]/g,''));
    const cmp=Number.isFinite(an)&&Number.isFinite(bn)?an-bn:av.localeCompare(bv,undefined,{numeric:true});
    return next==='asc'?cmp:-cmp;
  });
  rows.forEach(row=>body.appendChild(row));
});


/* 5.9.11.0 — experimental released-player locator removed during stabilization */
