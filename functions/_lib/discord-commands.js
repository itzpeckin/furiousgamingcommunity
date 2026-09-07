export const DISCORD_COMMAND_RELEASE = '7.4.4.10';

// These names belong to FranchiseHQ and are replaced by the direct /player and
// /team experiences. Registration removes only these exact legacy names after
// every current command has been upserted successfully.
export const DISCORD_RETIRED_GLOBAL_COMMANDS = Object.freeze([
  'stats','player-stats','team-stats'
]);

const OPTION = Object.freeze({
  SUB_COMMAND:1,
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
const categoryOption = {
  type:OPTION.STRING,name:'category',description:'Passing, rushing, receiving, defense, kicking, or punting.',choices:[
    choice('Passing','passing'),choice('Rushing','rushing'),choice('Receiving','receiving'),
    choice('Defense','defense'),choice('Kicking','kicking'),choice('Punting','punting')
  ]
};
const autocompleteString=(name,description,{required=false}={})=>({
  type:OPTION.STRING,name,description,required,autocomplete:true
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
      autocompleteString('view','League, Conference, Division, NFC East, or a team.'),
      privateOption
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
    name:'schedule',description:'View the schedule for a week or team.',
    options:[
      autocompleteString('view','Team or week, such as Buccaneers or Week 12.'),
      privateOption
    ]
  },
  {
    name:'games',description:'View played and unplayed games in the current scheduled week.',
    options:[
      {type:OPTION.STRING,name:'status',description:'Show both groups or only one game status.',choices:[
        choice('Played and unplayed','all'),choice('Played','played'),choice('Unplayed','unplayed')
      ]},
      privateOption
    ]
  },
  {
    name:'leaders',description:'View league statistical leaders.',
    options:[
      {...categoryOption,required:true},
      autocompleteString('metric','Leader category, such as touchdowns, receptions, or interceptions.'),
      privateOption
    ]
  },
  {
    name:'player',description:'Find players and view all available position-specific Franchise statistics.',
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
      autocompleteString('name','Optional owner, team, or Discord name.'),
      privateOption
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
      autocompleteString('query','Category, section, rule title, or rule text.'),
      privateOption
    ]
  },
  {
    name:'trade',description:'Create or respond to a FranchiseHQ trade.',
    options:[
      {type:OPTION.SUB_COMMAND,name:'create',description:'Create a native two-team trade offer.',options:[
        autocompleteString('owner','Registered FranchiseHQ owner and team.',{required:true}),
        autocompleteString('send-1','First player or pick your team sends.',{required:true}),
        autocompleteString('receive-1','First player or pick your team receives.',{required:true}),
        ...Array.from({length:5},(_,index)=>autocompleteString(`send-${index+2}`,`Additional player or pick your team sends.`)),
        ...Array.from({length:5},(_,index)=>autocompleteString(`receive-${index+2}`,`Additional player or pick your team receives.`)),
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
  const subcommand = first?.type === OPTION.SUB_COMMAND ? String(first.name || '') : null;
  const options = subcommand ? (Array.isArray(first.options) ? first.options : []) : raw;
  return {
    subcommand,
    values:Object.fromEntries(options.map(item => [String(item.name), item.value]))
  };
}

export function discordFocusedOption(interaction = {}) {
  const root=Array.isArray(interaction?.data?.options)?interaction.data.options:[];
  const first=root[0];
  const subcommand=first?.type===OPTION.SUB_COMMAND?String(first.name||''):null;
  const options=subcommand&&Array.isArray(first.options)?first.options:root;
  const focused=options.find(item=>item?.focused===true)||null;
  return {
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
