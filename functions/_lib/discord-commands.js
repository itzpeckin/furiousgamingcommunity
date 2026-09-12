export const DISCORD_COMMAND_RELEASE = '7.5.5.6';

// These names belong to FranchiseHQ and are replaced by the direct /player and
// /team experiences. Registration removes only these exact legacy names after
// every current command has been upserted successfully.
export const DISCORD_RETIRED_GLOBAL_COMMANDS = Object.freeze([
  'stats','player-stats','team-stats'
]);

const OPTION = Object.freeze({
  SUB_COMMAND:1,
  SUB_COMMAND_GROUP:2,
  STRING:3,
  INTEGER:4,
  BOOLEAN:5,
  USER:6
});

const choice = (name, value = name.toLowerCase()) => ({name, value});
const privateOption = {
  type:OPTION.BOOLEAN,
  name:'private',
  description:'Show the result only to you instead of the current channel.'
};
const autocompleteString=(name,description,{required=false}={})=>({
  type:OPTION.STRING,name,description,required,autocomplete:true
});
const subcommand=(name,description,options=[privateOption])=>({type:OPTION.SUB_COMMAND,name,description,options});
const leaderGroup=(name,description,metrics)=>({
  type:OPTION.SUB_COMMAND_GROUP,name,description,
  options:metrics.map(([metric,metricDescription])=>subcommand(metric,metricDescription))
});

export const DISCORD_SCHEDULE_THREAD_COMMANDS = Object.freeze(
  Array.from({length:18},(_,index)=>({
    name:`week${index+1}`,
    description:`Create or reconcile Week ${index+1} matchup threads from the active FranchiseHQ schedule.`
  }))
);

export const DISCORD_GLOBAL_COMMANDS = Object.freeze([
  {
    name:'standings',description:'View league, conference, division, or team standings.',
    options:[
      subcommand('all','View all 32 teams in league order.'),
      subcommand('division','View every division or one selected division.',[
        autocompleteString('name','Optional division, such as NFC East.'),privateOption
      ]),
      subcommand('conference','View every conference or one selected conference.',[
        autocompleteString('name','Optional conference, such as NFC or AFC.'),privateOption
      ]),
      subcommand('team','View one team’s current standing.',[
        autocompleteString('name','Team name or abbreviation.',{required:true}),privateOption
      ])
    ]
  },
  {
    name:'playoffs',description:'View the top 10 teams in each conference by current playoff seed.',
    options:[
      autocompleteString('conference','All conferences, AFC, or NFC.'),
      privateOption
    ]
  },
  {
    name:'eliminated',description:'View teams mathematically eliminated from the playoffs by record.',
    options:[privateOption]
  },
  {
    name:'schedule',description:'View the schedule for a week or team.',
    options:[
      {type:OPTION.SUB_COMMAND,name:'current',description:'View the current imported week schedule.',options:[privateOption]},
      {type:OPTION.SUB_COMMAND,name:'week',description:'View one week of the schedule.',options:[
        {type:OPTION.INTEGER,name:'number',description:'Regular-season week number.',required:true,min_value:1,max_value:18},
        privateOption
      ]},
      {type:OPTION.SUB_COMMAND,name:'team',description:'View one team’s full schedule.',options:[
        autocompleteString('name','Team name or abbreviation.',{required:true}),
        privateOption
      ]}
    ]
  },
  {
    name:'games',description:'View played and unplayed games in the current scheduled week.',
    options:[
      {type:OPTION.SUB_COMMAND,name:'unplayed',description:'View unplayed games in the current week.',options:[privateOption]},
      {type:OPTION.SUB_COMMAND,name:'played',description:'View completed games in the current week.',options:[privateOption]},
      {type:OPTION.SUB_COMMAND,name:'all',description:'View played and unplayed games in the current week.',options:[privateOption]}
    ]
  },
  {
    name:'leaders',description:'View league statistical leaders.',
    options:[
      leaderGroup('passing','Passing leaders.',[
        ['yards','Top 10 passing-yard leaders.'],['touchdowns','Top 10 passing-touchdown leaders.'],
        ['interceptions','Top 10 interceptions-thrown leaders.']
      ]),
      leaderGroup('rushing','Rushing leaders.',[
        ['yards','Top 10 rushing-yard leaders.'],['touchdowns','Top 10 rushing-touchdown leaders.']
      ]),
      leaderGroup('receiving','Receiving leaders.',[
        ['catches','Top 10 reception leaders.'],['yards','Top 10 receiving-yard leaders.'],
        ['touchdowns','Top 10 receiving-touchdown leaders.']
      ]),
      leaderGroup('defense','Defensive leaders.',[
        ['tackles','Top 10 tackle leaders.'],['sacks','Top 10 sack leaders.'],
        ['interceptions','Top 10 defensive-interception leaders.']
      ]),
      leaderGroup('kicking','Kicking leaders.',[
        ['field-goals-made','Top 10 field-goal leaders.']
      ])
    ]
  },
  {
    name:'player',description:'Find players and view their major position-specific Franchise statistics.',
    options:[
      autocompleteString('name','Full or partial player name, or public Player ID.',{required:true}),
      privateOption
    ]
  },
  {
    name:'team',description:'Find a team and view all available current-season team statistics.',
    options:[
      autocompleteString('name','Team name or abbreviation.',{required:true}),
      privateOption
    ]
  },
  {
    name:'trade-block',description:'View or manage your league Trade Block.',
    options:[
      {type:OPTION.SUB_COMMAND,name:'view',description:'View current Trade Block listings and team needs.',options:[
        autocompleteString('team','Optional team name or abbreviation.'),
        {type:OPTION.STRING,name:'position',description:'Optional player position.'},
        privateOption
      ]},
      {type:OPTION.SUB_COMMAND,name:'add',description:'Add one player from your roster to the Trade Block.',options:[
        autocompleteString('player','Player on your active FranchiseHQ roster.',{required:true}),
        {type:OPTION.STRING,name:'looking-for',description:'Optional note describing the return you want.'}
      ]},
      {type:OPTION.SUB_COMMAND,name:'remove',description:'Remove one of your players from the Trade Block.',options:[
        autocompleteString('player','Player currently listed by your team.',{required:true})
      ]}
    ]
  },
  {
    name:'trade-history',description:'View completed, commissioner-approved league trades.',
    options:[privateOption]
  },
  {
    name:'news',description:'View the latest published league news.',
    options:[privateOption]
  },
  {
    name:'gotw',description:'View the league Game of the Week.',
    options:[
      {type:OPTION.INTEGER,name:'week',description:'Optional franchise week.'},
      privateOption
    ]
  },
  {
    name:'league-site',description:'Get the canonical FranchiseHQ league website link.',
    options:[privateOption]
  },
  {
    name:'twitch',description:'View or manage a league member’s Twitch channel.',
    options:[
      {type:OPTION.SUB_COMMAND,name:'view',description:'View a member’s Twitch channel.',options:[
        {type:OPTION.USER,name:'member',description:'League member. Defaults to you.'},privateOption
      ]},
      {type:OPTION.SUB_COMMAND,name:'set',description:'Set your Twitch channel.',options:[
        {type:OPTION.STRING,name:'channel',description:'Twitch handle or channel URL.',required:true}
      ]},
      {type:OPTION.SUB_COMMAND,name:'clear',description:'Commissioner: clear an invalid member Twitch channel.',options:[
        {type:OPTION.USER,name:'member',description:'League member whose invalid channel should be cleared.',required:true}
      ]}
    ]
  },
  {
    name:'join',description:'Join this FranchiseHQ league with unassigned access.'
  },
  {
    name:'gm-history',description:'View historical GM or owner standings.',
    options:[
      subcommand('all','View every GM or owner in league history.'),
      subcommand('player','View one GM or owner’s league history.',[
        autocompleteString('name','Owner, Discord, or team name.',{required:true}),privateOption
      ])
    ]
  },
  {
    name:'confidence',description:'View, make, or submit private Confidence Pool picks.',
    options:[
      {type:OPTION.SUB_COMMAND,name:'view',description:'View your own current picks.'},
      {type:OPTION.SUB_COMMAND,name:'pick',description:'Save one private game pick.',options:[
        {type:OPTION.STRING,name:'game',description:'Game ID from the current open week.',required:true},
        {type:OPTION.STRING,name:'team',description:'Selected team ID or abbreviation.',required:true},
        {type:OPTION.INTEGER,name:'confidence',description:'Unique confidence value for this week.',required:true}
      ]},
      {type:OPTION.SUB_COMMAND,name:'submit',description:'Submit all picks for one week.',options:[
        {type:OPTION.INTEGER,name:'week',description:'Open franchise week.',required:true}
      ]}
    ]
  },
  {
    name:'rules',description:'Look up league rules by category, section, or text.',
    options:[
      subcommand('all','View all published league rules.'),
      subcommand('category','View a commissioner-authored rules category.',[
        autocompleteString('name','Category published by this league.',{required:true}),privateOption
      ]),
      subcommand('section','View a commissioner-authored rules section.',[
        autocompleteString('name','Section published by this league.',{required:true}),privateOption
      ]),
      subcommand('rule','View one commissioner-authored rule.',[
        autocompleteString('name','Rule published by this league.',{required:true}),privateOption
      ])
    ]
  },
  {
    name:'trade',description:'Create or respond to a FranchiseHQ trade.',
    options:[
      {type:OPTION.SUB_COMMAND,name:'create',description:'Create a native two-team trade offer.',options:[
        autocompleteString('owner','Registered FranchiseHQ owner and team.',{required:true}),
        autocompleteString('send-1','First asset your team sends; send and receive counts may differ.',{required:true}),
        autocompleteString('receive-1','First asset your team receives; send and receive counts may differ.',{required:true}),
        ...Array.from({length:5},(_,index)=>autocompleteString(`send-${index+2}`,`Optional additional asset sent; independent of receive slots.`)),
        ...Array.from({length:5},(_,index)=>autocompleteString(`receive-${index+2}`,`Optional additional asset received; independent of send slots.`)),
        {type:OPTION.STRING,name:'note',description:'Optional trade message.'}
      ]},
      {type:OPTION.SUB_COMMAND,name:'multi-team',description:'Open the web composer for a three- or four-team trade.'},
      {type:OPTION.SUB_COMMAND,name:'accept',description:'Accept the current revision of a trade.',options:[
        autocompleteString('trade','Negotiating trade involving your team.',{required:true})
      ]},
      {type:OPTION.SUB_COMMAND,name:'reject',description:'Reject a trade involving your team.',options:[
        autocompleteString('trade','Negotiating trade involving your team.',{required:true}),
        {type:OPTION.STRING,name:'reason',description:'Optional rejection reason.'}
      ]},
      {type:OPTION.SUB_COMMAND,name:'review',description:'Record a Trade Committee decision.',options:[
        autocompleteString('trade','Trade awaiting committee review.',{required:true}),
        {type:OPTION.STRING,name:'decision',description:'Committee decision.',required:true,choices:[
          choice('Approve','approve'),choice('Reject','reject'),choice('Abstain','abstain')
        ]},
        {type:OPTION.STRING,name:'reason',description:'Optional decision reason.'},
        {type:OPTION.BOOLEAN,name:'free-trade',description:'Approve as a Free Trade when league settings allow it.'}
      ]}
    ]
  },
  ...DISCORD_SCHEDULE_THREAD_COMMANDS
]);

export function discordGlobalCommandsNamed(names = []) {
  const requested = [...new Set(names.map(name => String(name || '').trim().toLowerCase()).filter(Boolean))];
  if (!requested.length) return [...DISCORD_GLOBAL_COMMANDS];
  const byName = new Map(DISCORD_GLOBAL_COMMANDS.map(command => [command.name, command]));
  const missing = requested.filter(name => !byName.has(name));
  if (missing.length) throw new Error(`Unknown Discord command name(s): ${missing.join(', ')}.`);
  return requested.map(name => byName.get(name));
}

export function discordScheduleThreadWeek(commandOrInteraction = '') {
  const command = typeof commandOrInteraction === 'string'
    ? commandOrInteraction
    : discordCommandName(commandOrInteraction);
  const match = String(command || '').trim().toLowerCase().match(/^week(1[0-8]|[1-9])$/);
  return match ? Number(match[1]) : null;
}

export function discordCommandName(interaction = {}) {
  return String(interaction?.data?.name || '').trim().toLowerCase();
}

export function discordCommandOptions(interaction = {}) {
  const raw = Array.isArray(interaction?.data?.options) ? interaction.data.options : [];
  const first = raw[0];
  const subcommandGroup = first?.type === OPTION.SUB_COMMAND_GROUP ? String(first.name || '') : null;
  const nested = subcommandGroup && Array.isArray(first.options) ? first.options[0] : null;
  const subcommand = first?.type === OPTION.SUB_COMMAND
    ? String(first.name || '')
    : nested?.type === OPTION.SUB_COMMAND ? String(nested.name || '') : null;
  const options = nested?.type === OPTION.SUB_COMMAND
    ? (Array.isArray(nested.options) ? nested.options : [])
    : subcommand ? (Array.isArray(first.options) ? first.options : []) : raw;
  return {
    subcommandGroup,
    subcommand,
    values:Object.fromEntries(options.map(item => [String(item.name), item.value]))
  };
}

export function discordFocusedOption(interaction = {}) {
  const root=Array.isArray(interaction?.data?.options)?interaction.data.options:[];
  const first=root[0];
  const subcommandGroup=first?.type===OPTION.SUB_COMMAND_GROUP?String(first.name||''):null;
  const nested=subcommandGroup&&Array.isArray(first.options)?first.options[0]:null;
  const subcommand=first?.type===OPTION.SUB_COMMAND?String(first.name||''):
    nested?.type===OPTION.SUB_COMMAND?String(nested.name||''):null;
  const options=nested?.type===OPTION.SUB_COMMAND?(Array.isArray(nested.options)?nested.options:[]):
    subcommand&&Array.isArray(first.options)?first.options:root;
  const focused=options.find(item=>item?.focused===true)||null;
  return {
    subcommandGroup,
    subcommand,
    focused:focused?{name:String(focused.name||''),value:focused.value??''}:null,
    values:Object.fromEntries(options.map(item=>[String(item.name),item.value]))
  };
}

export function discordInteractionIsPrivate(interaction = {}) {
  const command = discordCommandName(interaction);
  const {subcommand, values} = discordCommandOptions(interaction);
  if (values.private === true) return true;
  if (['join','confidence','trade'].includes(command)) return true;
  if (command === 'trade-block' && subcommand !== 'view') return true;
  if (discordScheduleThreadWeek(command)) return true;
  if (command === 'twitch' && subcommand === 'set') return true;
  return false;
}
