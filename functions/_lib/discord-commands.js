export const DISCORD_COMMAND_RELEASE = '7.4.4.5';

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
      {type:OPTION.STRING,name:'scope',description:'Choose the standings view.',required:true,choices:[
        choice('League','league'),choice('Conference','conference'),choice('Division','division'),choice('Team','team')
      ]},
      {type:OPTION.STRING,name:'name',description:'Conference, division, or team name.'},
      privateOption
    ]
  },
  {
    name:'schedule',description:'View the season schedule or one week of games.',
    options:[
      {type:OPTION.STRING,name:'scope',description:'Choose a schedule view.',required:true,choices:[
        choice('Season','season'),choice('Week','week')
      ]},
      {type:OPTION.INTEGER,name:'week',description:'Franchise week number.'},
      {type:OPTION.STRING,name:'status',description:'Filter games.',choices:[
        choice('All','all'),choice('Played','played'),choice('Unplayed','unplayed')
      ]},
      {type:OPTION.STRING,name:'team',description:'Optional team name or abbreviation.'},
      privateOption
    ]
  },
  {
    name:'stats',description:'Look up player or team statistics.',
    options:[
      {type:OPTION.STRING,name:'target',description:'Choose player or team statistics.',required:true,choices:[
        choice('Player','player'),choice('Team','team')
      ]},
      {type:OPTION.STRING,name:'name',description:'Player or team name.',required:true},
      {type:OPTION.STRING,name:'category',description:'Passing, rushing, receiving, defense, kicking, or punting.'},
      {type:OPTION.INTEGER,name:'week',description:'Optional franchise week.'},
      privateOption
    ]
  },
  {
    name:'leaders',description:'View league statistical leaders.',
    options:[
      {type:OPTION.STRING,name:'category',description:'Stat category.',required:true,choices:[
        choice('Passing','passing'),choice('Rushing','rushing'),choice('Receiving','receiving'),
        choice('Defense','defense'),choice('Kicking','kicking'),choice('Punting','punting')
      ]},
      {type:OPTION.INTEGER,name:'week',description:'Optional franchise week.'},
      privateOption
    ]
  },
  {
    name:'player',description:'Find a player and open the canonical FranchiseHQ Player Card.',
    options:[
      {type:OPTION.STRING,name:'name',description:'Player name or public player ID.',required:true},
      privateOption
    ]
  },
  {
    name:'trade-block',description:'View the current league Trade Block and team needs.',
    options:[
      {type:OPTION.STRING,name:'team',description:'Optional team name or abbreviation.'},
      {type:OPTION.STRING,name:'position',description:'Optional player position.'},
      privateOption
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
      {type:OPTION.STRING,name:'name',description:'Optional owner, team, or Discord name.'},
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
      {type:OPTION.STRING,name:'query',description:'Optional category, section, or rule text.'},
      privateOption
    ]
  },
  {
    name:'trade',description:'Create or respond to a FranchiseHQ trade.',
    options:[
      {type:OPTION.SUB_COMMAND,name:'create',description:'Create a native two-team trade offer.',options:[
        {type:OPTION.STRING,name:'opponent',description:'Other team name or abbreviation.',required:true},
        {type:OPTION.STRING,name:'send',description:'Comma-separated player: or pick: assets your team sends.',required:true},
        {type:OPTION.STRING,name:'receive',description:'Comma-separated player: or pick: assets your team receives.',required:true},
        {type:OPTION.STRING,name:'note',description:'Optional trade message.'}
      ]},
      {type:OPTION.SUB_COMMAND,name:'multi-team',description:'Open the web composer for a three- or four-team trade.'},
      {type:OPTION.SUB_COMMAND,name:'accept',description:'Accept the current revision of a trade.',options:[
        {type:OPTION.STRING,name:'trade',description:'FranchiseHQ trade ID.',required:true}
      ]},
      {type:OPTION.SUB_COMMAND,name:'reject',description:'Reject a trade involving your team.',options:[
        {type:OPTION.STRING,name:'trade',description:'FranchiseHQ trade ID.',required:true},
        {type:OPTION.STRING,name:'reason',description:'Optional rejection reason.'}
      ]},
      {type:OPTION.SUB_COMMAND,name:'review',description:'Record a Trade Committee decision.',options:[
        {type:OPTION.STRING,name:'trade',description:'FranchiseHQ trade ID.',required:true},
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

export function discordInteractionIsPrivate(interaction = {}) {
  const command = discordCommandName(interaction);
  const {subcommand, values} = discordCommandOptions(interaction);
  if (values.private === true) return true;
  if (['join','confidence','trade'].includes(command)) return true;
  if (discordScheduleThreadWeek(command)) return true;
  if (command === 'twitch' && subcommand === 'set') return true;
  return false;
}
