/** The manager's pre-match plan on the hub (phase 7, C2; `engine/career/brief.ts`). */
export const briefText = {
  label: 'Manager’s plan',
  /** The bold first line, by the player's expected role. */
  roles: {
    start: 'Manager’s plan: start you {where}',
    bench: 'Manager’s plan: you start on the bench, ready to come on {where}',
    unregistered: 'Manager’s plan: you are not registered to play yet',
  },
  /** Where the slot is, after "start you" or "come on". */
  where: {
    GK: 'in goal',
    CB: 'at centre-back',
    LB: 'at left-back',
    RB: 'at right-back',
    DM: 'in the holding role',
    CM: 'in central midfield',
    AM: 'in the number 10 role',
    LW: 'on the left wing',
    RW: 'on the right wing',
    ST: 'up front',
  },
  sides: { left: 'left', right: 'right' },
  /** Words for an opponent the plan names, when the eleven has nobody in that place. */
  fallback: {
    target: {
      attack: 'their full-back',
      midfield: 'their full-back',
      wide: 'their full-back',
      fullback: 'their winger',
      defence: 'their winger',
      keeper: 'their winger',
    },
    danger: 'their best forward',
  },
  /** The instruction, by position group and the club's playing style. */
  plans: {
    'attack.press': 'Press their centre-backs and attack the {side} channel.',
    'attack.possession':
      'Come short to link the play, then attack the box when we work it down the {side}.',
    'attack.direct': 'Win the first ball, then run the {side} channel behind {target}.',
    'attack.counter': 'Stay high on their last man and break into the {side} channel.',
    'attack.balanced': 'Lead the line, hold it up and attack the {side} channel when it opens.',
    'wide.press': 'Press {target} when they have it, then go at them down the {side}.',
    'wide.possession': 'Hold the width, keep the ball and take {target} on when it is on.',
    'wide.direct': 'Get in behind {target} early and whip crosses into the box.',
    'wide.counter': 'Stay high when we defend; the moment we win it, run at {target}.',
    'wide.balanced': 'Track back when we need you, then run at {target} with the ball.',
    'midfield.press': 'Squeeze their midfield, win it high and get it out to the {side} quickly.',
    'midfield.possession':
      'Take the ball off the centre-backs and keep it moving. Find the runners.',
    'midfield.direct': 'Win the second balls and play it forward early, down the {side}.',
    'midfield.counter': 'Screen the back four, then spring forward the moment we win it.',
    'midfield.balanced': 'Keep it simple, cover the full-backs and arrive late in the box.',
    'fullback.press': 'Push up on {target} and win the ball back high on the {side}.',
    'fullback.possession': 'Give us width on the {side}, but always know where {target} is.',
    'fullback.direct': 'Stop {target} first, then get it forward early down the {side}.',
    'fullback.counter': 'Stay tight to {target}, then overlap down the {side} when we break.',
    'fullback.balanced': 'Defend {target} first, and overlap down the {side} when it is on.',
    'defence.press': 'Hold a high line and stay touch-tight to {danger}.',
    'defence.possession': 'Split wide, take it off the keeper and play out from the back.',
    'defence.direct': 'Win your headers, keep {danger} quiet and get it forward early.',
    'defence.counter': 'Sit deep, stay compact and keep {danger} in front of you.',
    'defence.balanced': 'Stay organised, talk to the back line and keep {danger} quiet.',
    'keeper.press': 'Sweep behind a high line and come for anything played over the top.',
    'keeper.possession': 'Be our extra passer: play it short to the centre-backs when you can.',
    'keeper.direct': 'Go long to the forwards and own your box at set pieces.',
    'keeper.counter': 'Command your area, then start the break quickly with your throws.',
    'keeper.balanced': 'Organise the defence, watch {danger} and keep your distribution tidy.',
  } as Record<string, string>,
  /** The closing line: the occasion as the club's culture sees it. */
  notes: {
    favourite: 'We should win this. Take the game to {opponent}.',
    'win-now': 'The board expects three points against {opponent}. Nothing less.',
    underdog: 'Nobody expects anything from us. Stay compact and stay in the game.',
    brave: 'Underdogs, but we play our way at this club. No fear.',
    youth: 'This club trusts its young players. Show them why.',
    discipline: 'Stick to the plan and keep your shape for the whole game.',
  },
};
