const ESPN_BASE = 'https://a.espncdn.com/i/teamlogos/nfl/500';

const TEAMS = [
  ['ARI','Arizona','Cardinals','NFC','West','#97233F','#000000','ari'],
  ['ATL','Atlanta','Falcons','NFC','South','#A71930','#000000','atl'],
  ['BAL','Baltimore','Ravens','AFC','North','#241773','#000000','bal'],
  ['BUF','Buffalo','Bills','AFC','East','#00338D','#C60C30','buf'],
  ['CAR','Carolina','Panthers','NFC','South','#0085CA','#101820','car'],
  ['CHI','Chicago','Bears','NFC','North','#0B162A','#C83803','chi'],
  ['CIN','Cincinnati','Bengals','AFC','North','#FB4F14','#000000','cin'],
  ['CLE','Cleveland','Browns','AFC','North','#311D00','#FF3C00','cle'],
  ['DAL','Dallas','Cowboys','NFC','East','#003594','#869397','dal'],
  ['DEN','Denver','Broncos','AFC','West','#FB4F14','#002244','den'],
  ['DET','Detroit','Lions','NFC','North','#0076B6','#B0B7BC','det'],
  ['GB','Green Bay','Packers','NFC','North','#203731','#FFB612','gb'],
  ['HOU','Houston','Texans','AFC','South','#03202F','#A71930','hou'],
  ['IND','Indianapolis','Colts','AFC','South','#002C5F','#A2AAAD','ind'],
  ['JAX','Jacksonville','Jaguars','AFC','South','#006778','#D7A22A','jax'],
  ['KC','Kansas City','Chiefs','AFC','West','#E31837','#FFB81C','kc'],
  ['LV','Las Vegas','Raiders','AFC','West','#000000','#A5ACAF','lv'],
  ['LAC','Los Angeles','Chargers','AFC','West','#0080C6','#FFC20E','lac'],
  ['LAR','Los Angeles','Rams','NFC','West','#003594','#FFA300','lar'],
  ['MIA','Miami','Dolphins','AFC','East','#008E97','#FC4C02','mia'],
  ['MIN','Minnesota','Vikings','NFC','North','#4F2683','#FFC62F','min'],
  ['NE','New England','Patriots','AFC','East','#002244','#C60C30','ne'],
  ['NO','New Orleans','Saints','NFC','South','#D3BC8D','#101820','no'],
  ['NYG','New York','Giants','NFC','East','#0B2265','#A71930','nyg'],
  ['NYJ','New York','Jets','AFC','East','#125740','#FFFFFF','nyj'],
  ['PHI','Philadelphia','Eagles','NFC','East','#004C54','#A5ACAF','phi'],
  ['PIT','Pittsburgh','Steelers','AFC','North','#FFB612','#101820','pit'],
  ['SF','San Francisco','49ers','NFC','West','#AA0000','#B3995D','sf'],
  ['SEA','Seattle','Seahawks','NFC','West','#002244','#69BE28','sea'],
  ['TB','Tampa Bay','Buccaneers','NFC','South','#D50A0A','#34302B','tb'],
  ['TEN','Tennessee','Titans','AFC','South','#0C2340','#4B92DB','ten'],
  ['WAS','Washington','Commanders','NFC','East','#5A1414','#FFB612','wsh']
];

const REGISTRY = Object.freeze(TEAMS.map(([abbreviation, cityName, nickname, conferenceName, divisionName, primaryColor, secondaryColor, espnKey]) => Object.freeze({
  key: abbreviation,
  abbreviation,
  cityName,
  nickname,
  displayName: `${cityName} ${nickname}`,
  conferenceName,
  divisionName,
  primaryColor,
  secondaryColor,
  logoUrl: `${ESPN_BASE}/${espnKey}.png`,
  logoProvider: 'ESPN CDN'
})));

function token(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const ABBR_ALIASES = Object.freeze({
  arizona: 'ARI', cardinals: 'ARI',
  atlanta: 'ATL', falcons: 'ATL',
  baltimore: 'BAL', ravens: 'BAL',
  buffalo: 'BUF', bills: 'BUF',
  carolina: 'CAR', panthers: 'CAR',
  chicago: 'CHI', bears: 'CHI',
  cincinnati: 'CIN', bengals: 'CIN',
  cleveland: 'CLE', browns: 'CLE',
  dallas: 'DAL', cowboys: 'DAL',
  denver: 'DEN', broncos: 'DEN',
  detroit: 'DET', lions: 'DET',
  greenbay: 'GB', packers: 'GB',
  houston: 'HOU', texans: 'HOU',
  indianapolis: 'IND', colts: 'IND',
  jacksonville: 'JAX', jaguars: 'JAX',
  kansascity: 'KC', chiefs: 'KC',
  lasvegas: 'LV', raiders: 'LV', oakland: 'LV',
  chargers: 'LAC', losangeleschargers: 'LAC', sandiego: 'LAC',
  rams: 'LAR', losangelesrams: 'LAR', stlouis: 'LAR',
  miami: 'MIA', dolphins: 'MIA',
  minnesota: 'MIN', vikings: 'MIN',
  newengland: 'NE', patriots: 'NE',
  neworleans: 'NO', saints: 'NO',
  newyorkgiants: 'NYG', giants: 'NYG',
  newyorkjets: 'NYJ', jets: 'NYJ',
  philadelphia: 'PHI', eagles: 'PHI',
  pittsburgh: 'PIT', steelers: 'PIT',
  sanfrancisco: 'SF', fortyniners: 'SF', '49ers': 'SF',
  seattle: 'SEA', seahawks: 'SEA',
  tampabay: 'TB', buccaneers: 'TB', bucs: 'TB',
  tennessee: 'TEN', titans: 'TEN',
  washington: 'WAS', commanders: 'WAS', footballteam: 'WAS', redskins: 'WAS'
});

const BY_ABBR = new Map(REGISTRY.map(team => [team.abbreviation, team]));
const BY_TOKEN = new Map();
for (const team of REGISTRY) {
  for (const value of [team.abbreviation, team.cityName, team.nickname, team.displayName]) BY_TOKEN.set(token(value), team);
}
for (const [alias, abbr] of Object.entries(ABBR_ALIASES)) BY_TOKEN.set(token(alias), BY_ABBR.get(abbr));

export function findTeamBranding(team = {}) {
  const abbreviation = token(team.abbreviation || team.abbrName || team.teamAbbr).toUpperCase();
  const normalizedAbbreviation = abbreviation === 'WSH' ? 'WAS' : abbreviation;
  if (BY_ABBR.has(normalizedAbbreviation)) return BY_ABBR.get(normalizedAbbreviation);

  const candidates = [
    team.displayName,
    team.fullName,
    team.teamName,
    [team.cityName || team.city, team.nickname || team.nickName].filter(Boolean).join(' '),
    team.nickname,
    team.cityName || team.city
  ];
  for (const candidate of candidates) {
    const found = BY_TOKEN.get(token(candidate));
    if (found) return found;
  }
  return null;
}

export function enrichTeamBranding(team = {}) {
  const branding = findTeamBranding(team);
  if (!branding) {
    return {
      ...team,
      brandingKey: null,
      brandingSource: 'export-fallback',
      logoProvider: team.logoUrl ? 'Madden export' : null
    };
  }
  return {
    ...team,
    abbreviation: branding.abbreviation,
    cityName: team.cityName || branding.cityName,
    nickname: team.nickname || branding.nickname,
    displayName: team.displayName || branding.displayName,
    conferenceName: team.conferenceName || branding.conferenceName,
    divisionName: team.divisionName || branding.divisionName,
    primaryColor: branding.primaryColor,
    secondaryColor: branding.secondaryColor,
    logoUrl: branding.logoUrl,
    brandingKey: branding.key,
    brandingSource: 'canonical-registry',
    logoProvider: branding.logoProvider
  };
}

export function teamBrandingRegistry() {
  return REGISTRY.map(team => ({ ...team }));
}
