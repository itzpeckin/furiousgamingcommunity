export const NFL_DRAFT_PICK_TEAM_LABELS = Object.freeze([
  '49ers','Bears','Bengals','Bills','Broncos','Browns','Buccaneers','Cardinals',
  'Chargers','Chiefs','Colts','Commanders','Cowboys','Dolphins','Eagles','Falcons',
  'Giants','Jaguars','Jets','Lions','Packers','Panthers','Patriots','Raiders',
  'Rams','Ravens','Saints','Seahawks','Steelers','Texans','Titans','Vikings'
]);

export const MADDEN_27_DRAFT_PICK_SOURCE = Object.freeze({
  key: 'madden-27-opening-three-year-horizon',
  version: 1,
  gameRelease: 'Madden NFL 27',
  effectiveSeasonYear: 2026,
  sourceReference: 'https://docs.google.com/spreadsheets/d/1vBwSdbkFT7UMNH9_omWB_jKJnmxcjHEa98L-roJPTYM/edit?usp=sharing',
  workbookSha256: '1f34c0ace58c0be07aaf666f6272c69af91f6de08979d0f106bac1ba314b6a7a',
  normalizedMappingSha256: '490fb6c83761dd0ed5bae8853578c623fb79733bf28b54a14f60c41c0897b173',
  expectedTeamCount: 32,
  expectedPickCount: 672,
  sourceCorrections: Object.freeze(['Pacekrs via Cowboys -> Packers via Cowboys']),
  overrides: Object.freeze([
    [2027,1,'Colts','Jets'],[2027,1,'Cowboys','Jets'],[2027,1,'Packers','Cowboys'],[2027,1,'Rams','Browns'],
    [2027,3,'Eagles','Vikings'],[2027,3,'Rams','Chiefs'],
    [2027,4,'Cowboys','Packers'],[2027,4,'Giants','Browns'],[2027,4,'Seahawks','Browns'],[2027,4,'Vikings','Panthers'],
    [2027,5,'Bears','Patriots'],[2027,5,'Cowboys','Steelers'],[2027,5,'Panthers','Vikings'],[2027,5,'Patriots','Eagles'],
    [2027,5,'Steelers','Dolphins'],[2027,5,'Texans','Browns'],
    [2027,6,'49ers','Chiefs'],[2027,6,'Browns','Texans'],[2027,6,'Chargers','Saints'],[2027,6,'Chiefs','Jets'],
    [2027,6,'Eagles','Jets'],[2027,6,'Jets','Vikings'],[2027,6,'Packers','Eagles'],[2027,6,'Ravens','49ers'],
    [2027,6,'Saints','Patriots'],[2027,6,'Steelers','Cowboys'],[2027,6,'Texans','Patriots'],[2027,6,'Vikings','Patriots'],
    [2027,7,'Chargers','Lions'],[2027,7,'Chiefs','49ers'],[2027,7,'Cowboys','Eagles'],[2027,7,'Dolphins','Steelers'],
    [2027,7,'Eagles','Vikings'],[2027,7,'Falcons','Seahawks'],[2027,7,'Giants','Dolphins'],[2027,7,'Jets','Panthers'],
    [2027,7,'Patriots','Texans'],[2027,7,'Raiders','Bills'],[2027,7,'Rams','Chargers'],[2027,7,'Ravens','Eagles'],
    [2027,7,'Saints','Broncos'],[2027,7,'Texans','Browns'],[2027,7,'Vikings','Falcons'],
    [2028,1,'Patriots','Eagles'],[2028,2,'Rams','Browns'],
    [2028,6,'Panthers','Chargers'],[2028,6,'Saints','Cowboys'],[2028,6,'Texans','Saints'],
    [2028,7,'Browns','Rams'],[2028,7,'Cowboys','Saints'],[2028,7,'Dolphins','Patriots'],[2028,7,'Giants','Ravens'],
    [2028,7,'Jets','Chargers'],[2028,7,'Patriots','Saints'],[2028,7,'Saints','Texans'],[2028,7,'Seahawks','Jets'],
    [2029,3,'Rams','Browns'],[2029,7,'Patriots','Dolphins']
  ])
});

export const FGC_DRAFT_PICK_OVERLAY = Object.freeze({
  key: 'fgc-madden-27-opening-ownership',
  version: 1,
  leagueSlug: 'furious-gaming-community',
  gameRelease: 'Madden NFL 27',
  effectiveSeasonYear: 2026,
  sourceReference: 'https://docs.google.com/spreadsheets/d/1Hmn3o1RFJdg6PXw6iDYppNLTozZA9cxLfq5_38g_DVc/edit?usp=sharing',
  workbookSha256: '66403da484b8f35e3f4c1ab08624153b0e8ea0dafc558f08e1084007c72440c7',
  normalizedMappingSha256: '2d7aef1b23d1e3a31c79d04a039858a00a24bc6a09ab2f2866dd7f28ce4cc9ec',
  expectedTeamCount: 32,
  expectedPickCount: 672,
  overrides: Object.freeze([
    [2027,1,'Bears','Ravens'],[2027,1,'Chargers','Colts'],[2027,1,'Commanders','Patriots'],[2027,1,'Falcons','Jets'],
    [2027,1,'Raiders','Cowboys'],[2027,1,'Ravens','Patriots'],[2027,1,'Seahawks','Browns'],
    [2027,2,'Bears','Ravens'],[2027,2,'Colts','Jaguars'],[2027,2,'Commanders','Chargers'],[2027,2,'Falcons','Chiefs'],
    [2027,2,'Jaguars','Cowboys'],[2027,2,'Ravens','Patriots'],[2027,2,'Saints','Buccaneers'],
    [2027,3,'49ers','Jets'],[2027,3,'Bears','Ravens'],[2027,3,'Browns','Raiders'],[2027,3,'Colts','Jets'],
    [2027,3,'Commanders','Saints'],[2027,3,'Cowboys','Saints'],[2027,3,'Falcons','Chiefs'],[2027,3,'Jaguars','Cowboys'],
    [2027,3,'Jets','Chargers'],[2027,3,'Patriots','Ravens'],[2027,3,'Raiders','Cowboys'],[2027,3,'Steelers','Colts'],
    [2027,3,'Texans','Saints'],
    [2027,4,'Bears','Ravens'],[2027,4,'Buccaneers','Saints'],[2027,4,'Eagles','Jets'],[2027,4,'Falcons','Buccaneers'],
    [2027,4,'Rams','Chargers'],[2027,4,'Ravens','Vikings'],
    [2027,5,'Bears','Chiefs'],[2027,5,'Buccaneers','Patriots'],[2027,5,'Chargers','Bears'],[2027,5,'Ravens','Vikings'],
    [2027,6,'Saints','Eagles'],[2027,7,'Eagles','Seahawks'],[2027,7,'Falcons','Ravens'],
    [2028,1,'Bears','Ravens'],[2028,1,'Browns','Raiders'],[2028,1,'Falcons','Patriots'],[2028,1,'Jaguars','Buccaneers'],
    [2028,2,'Bears','Steelers'],[2028,2,'Bengals','Steelers'],[2028,2,'Commanders','Patriots'],[2028,2,'Seahawks','Browns'],
    [2028,3,'Bengals','Steelers'],[2028,3,'Colts','Texans'],[2028,3,'Seahawks','Saints'],
    [2028,4,'Bears','Seahawks'],[2028,4,'Steelers','Colts'],
    [2028,6,'Panthers','Panthers'],[2028,6,'Patriots','Chargers'],
    [2029,1,'Bears','Steelers'],[2029,3,'Colts','Texans'],[2029,6,'Patriots','Chargers'],[2029,7,'Patriots','Commanders']
  ])
});

export const DRAFT_PICK_SOURCE_CATALOG = Object.freeze({
  [MADDEN_27_DRAFT_PICK_SOURCE.key]: MADDEN_27_DRAFT_PICK_SOURCE,
  [FGC_DRAFT_PICK_OVERLAY.key]: FGC_DRAFT_PICK_OVERLAY
});
