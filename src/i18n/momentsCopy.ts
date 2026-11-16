import { LOCALE, type Translations } from './locale';

/**
 * The words of match-22's key moments that load with the match (release 1.0 step 5.2): the
 * framings of the new situations and two more for each earlier one, and the reads of the play
 * (each also an odds factor's label). The match screen loads this module with the commentary
 * (screens/match/lines.ts), so it stays off the route's first render; until then a moment reads
 * its situation's plain sentence (`situationText`). Parameters as in the match-12 framings:
 * {opponent}, {minute}, {keeper}, {defender}, {attacker}, {teammate}.
 */
const framingsEn: Record<string, string[]> = {
  // Two more for each match-21 situation (indices 3 and 4).
  'box-chance': [
    '{defender} slips and the ball sits up for you inside the area.',
    'You ghost in behind {defender}. Twelve yards out, {keeper} to beat.',
  ],
  'build-up': [
    'You pick it up between the lines. {defender} has to decide whether to step out.',
    '{teammate} is free on the far side, and the gap in front of you is closing.',
  ],
  'edge-of-area': [
    'The ball rolls into your path just outside the box. {defender} is a yard slow.',
    'A half-cleared corner drops to you on the edge of the area.',
  ],
  'aerial-chance': [
    'The ball hangs in the air at the back post, and you are first to see it.',
    'A deflected cross loops towards you. {defender} has lost you.',
  ],
  'defend-attack': [
    '{attacker} picks up the ball and turns towards your goal.',
    'A loose pass in midfield and {opponent} are running at you.',
  ],
  'build-out': [
    'Your keeper rolls it to you. {attacker} sprints to close you down.',
    'You collect a clearance deep in your own half. {opponent} hunt in packs.',
  ],
  'shot-incoming': [
    'The ball breaks to {attacker} twenty yards out. Get set.',
    '{attacker} cuts inside and shoots. Your defence is screening the view.',
  ],
  'one-on-one': [
    'A through ball splits your centre-backs. {attacker} is clean through.',
    '{attacker} wins the race to the ball. Only you stand in the way.',
  ],
  'cross-ball': [
    'A deep cross is on its way. {attacker} is making for the six-yard box.',
    '{opponent} swing it in from the right. Bodies everywhere.',
  ],
  distribution: [
    'You claim it cleanly. {opponent} start to drop back.',
    'Ball in your hands. {teammate} is waving for it.',
  ],
  penalty: [
    'Penalty, and you have the ball in your hands. {keeper} tries to get in your head.',
    'You take a deep breath. The referee points to the spot and waits.',
  ],
  'free-kick': [
    'Free kick in a dangerous spot. {keeper} shouts at his wall.',
    'You stand over the ball. {teammate} offers a short option.',
  ],
  'corner-kick': [
    'Corner. {teammate} is waiting to attack the near post.',
    'You place the ball by the flag. {opponent} crowd the six-yard box.',
  ],
  'goal-line': [
    '{attacker} squeezes a shot past the keeper. You are on the line.',
    'The ball is loose in the six-yard box and the goal is gaping.',
  ],
  'offside-line': [
    '{attacker} is lurking on your shoulder. The pass is coming.',
    'Their playmaker has time on the ball. Hold the line or drop?',
  ],
  'penalty-save': [
    '{attacker} takes a long run-up. You bounce on your line.',
    'Penalty. {attacker} stares at one corner. Is it a bluff?',
  ],
  // The match-22 situations: five each.
  'last-man': [
    'You are the last defender and {attacker} is through on the halfway line.',
    '{attacker} knocks the ball past the midfield. Only you are between him and the goal.',
    'A long ball over the top. {attacker} is racing clear and you are the last man.',
    '{opponent} break at speed. You have to stop {attacker} somehow.',
    '{attacker} spins away from the cover. Your goal is wide open behind you.',
  ],
  'cross-defence': [
    'A cross is coming into your box and {attacker} is attacking it.',
    '{opponent} get to the byline. You have a runner to deal with.',
    'The winger shapes to cross. {attacker} is lurking behind you.',
    'A ball into the box from wide. Attack it, mark your man or close the cross?',
    '{attacker} is making a run to the near post as the cross comes in.',
  ],
  'two-on-one': [
    'Two of them, one of you. {attacker} carries the ball at you.',
    '{opponent} break two on one. Your cover is chasing back.',
    '{attacker} has a teammate to his side. Which one do you take?',
    'You are outnumbered in your own half. {attacker} is running at you.',
    'A counter-attack, two against one. Make the call.',
  ],
  'set-piece-marking': [
    'Corner against you. Pick your job in the box.',
    '{opponent} have a corner. {attacker} is the danger in the air.',
    'A free kick to be swung into your box. {attacker} is lining up.',
    'Their big men come forward for the corner. Where do you stand?',
    'Corner kick. The delivery could go anywhere.',
  ],
  sweeping: [
    'A long ball over your defence. {attacker} is chasing it.',
    'The ball is played in behind. You have to decide whether to come.',
    '{attacker} is racing onto a ball over the top. Come or stay?',
    'Your back line has pushed up and the space behind is empty.',
    'A ball into the channel. It is between you and {attacker}.',
  ],
  'back-pass': [
    'A back-pass is coming to you. {attacker} is charging in.',
    'Your defender rolls it back to you. {attacker} smells a mistake.',
    'The ball comes back to your feet. {opponent} press high.',
    'A back-pass under pressure. You have a second to decide.',
    '{attacker} chases the back-pass down. Keep calm.',
  ],
  rebound: [
    'The keeper parries and the ball falls to you in the six-yard box.',
    'A shot comes back off the post. The rebound is yours.',
    '{keeper} spills it. The ball is loose in front of goal.',
    'A deflection and the ball drops at your feet. {keeper} is scrambling.',
    '{teammate} shoots, {keeper} saves, and the rebound runs to you.',
  ],
  'weak-foot': [
    'The ball comes to you on your weaker foot in the box.',
    'Space to shoot, but the ball is on your wrong side.',
    'A chance falls on your weaker foot. {defender} is closing.',
    'Your weaker foot or a touch to set it right? {keeper} is waiting.',
    'The ball runs across you onto your weaker side, twelve yards out.',
  ],
};
/** What the pitch shows: `match.read.<read>.<state>`, also the read's odds-factor label. */
const readsEn: Record<string, Record<string, string>> = {
  keeper: {
    set: 'Keeper set',
    near: 'Keeper covering the near post',
    'off-line': 'Keeper off his line',
    screened: 'Keeper’s view screened',
    'dives-early': 'Keeper dives early',
    'stays-big': 'Keeper stays big',
    guesses: 'Keeper guessing',
    down: 'Keeper on the ground',
    recovered: 'Keeper back on his feet',
  },
  cover: {
    sight: 'Clear sight of goal',
    tight: 'Defender tight on you',
    isolated: 'One against one',
    covered: 'Cover behind you',
    alone: 'No cover behind you',
  },
  space: { room: 'Room to shoot', closed: 'Space closing', crowded: 'Crowded area' },
  delivery: {
    whipped: 'Whipped delivery',
    looping: 'Looping ball',
    behind: 'Ball behind you',
    floated: 'Floated cross',
    early: 'Early cross from deep',
    'cut-back': 'Cut-back along the ground',
    far: 'Delivery to the far post',
    near: 'Delivery to the near post',
    middle: 'Delivery into the middle',
  },
  line: {
    high: 'Their line is high',
    deep: 'Their line sits deep',
    mid: 'Their line holds midway',
    together: 'Your line is together',
    broken: 'Your line is broken',
  },
  carrier: {
    'heavy-touch': 'Heavy touch on the ball',
    skilful: 'Tricky dribbler',
    'head-up': 'Looking for a pass',
    'head-down': 'Going it alone',
    runner: 'Runner in behind',
  },
  press: { high: 'High press', mid: 'Mid-block', off: 'Press sitting off' },
  'their-line': { high: 'Space behind their line', deep: 'No space behind them' },
  shot: {
    tame: 'Tame shot at you',
    powerful: 'Powerful strike',
    dipping: 'Dipping shot',
    'low-drive': 'Low drive',
    lofted: 'Lofted shot',
  },
  range: { distance: 'Shot from distance', close: 'Shot from close range' },
  position: { advanced: 'You are off your line', deep: 'You are deep on your line' },
  angle: { central: 'Central angle', tight: 'Tight angle' },
  traffic: { clear: 'Clear six-yard box', crowded: 'Crowded six-yard box', runner: 'Late runner' },
  shape: { committed: 'They have men forward', settled: 'They are back in shape' },
  distance: { close: 'Close range free kick', mid: 'Twenty-five yards out', long: 'Long range' },
  wall: { big: 'Wall of four', thin: 'Wall of two' },
  marking: { zonal: 'Zonal marking', man: 'Man marking', packed: 'Packed six-yard box' },
  taker: {
    early: 'Taker picks a corner early',
    waits: 'Taker waits for you',
    nervous: 'Nervous taker',
  },
  help: { coming: 'Help coming back', none: 'No help coming' },
  race: {
    yours: 'The ball runs to you',
    even: 'A fifty-fifty race',
    theirs: 'They will get there first',
  },
  pass: { 'under-hit': 'Under-hit back-pass', firm: 'Firm back-pass' },
  ball: {
    kindly: 'The ball falls kindly',
    awkward: 'Awkward bounce',
    crowded: 'Bodies in the way',
  },
  pressure: { closing: 'Defender closing fast', time: 'Time to adjust' },
  pace: { ahead: 'Quicker than him', level: 'Level for pace', behind: 'Beaten for pace' },
  aerial: {
    ahead: 'You win in the air',
    level: 'Even in the air',
    behind: 'Outmatched in the air',
  },
  marked: { double: 'Double-marked' },
};
const copyEn = { framings: framingsEn, reads: readsEn } as const;
const copy = ({ en: copyEn } satisfies Translations<typeof copyEn>)[LOCALE];

/**
 * Decision chains (match-22, release 1.0 X1a): the lead-in steps' options and framings, their
 * reads and the edges they leave, what each option's chance is of, what failing it leads to,
 * the stakes header and the one-line cause, and the drought director's pre-match line.
 */
const chainEn = {
  choices: {
    'receive-set': 'Set it',
    'receive-turn': 'Turn your man',
    'receive-run': 'Run in behind',
    'beat-dribble': 'Take him on',
    'beat-combine': 'Play a one-two',
    'beat-shield': 'Shield it',
    'run-near': 'Attack the near post',
    'run-far': 'Drift to the far post',
    'run-hold': 'Hold your run',
    'collect-touch': 'Take a touch',
    'collect-scan': 'Scan, then play',
    'collect-first': 'Play it first time',
    'position-goal-side': 'Get goal-side',
    'position-press': 'Press him',
    'position-cover': 'Cover the pass',
    'engage-step': 'Step in',
    'engage-delay': 'Hold him up',
    'engage-show': 'Show him wide',
    'set-line': 'Set on your line',
    'set-off': 'Come off your line',
    'set-near': 'Cover the near post',
    'angle-narrow': 'Narrow the angle',
    'angle-big': 'Stay big',
    'angle-feint': 'Show him the near post',
    'spot-keeper': 'Read the keeper',
    'spot-pick': 'Pick your spot',
    'scan-near': 'Look for the near-post run',
    'scan-far': 'Trust the routine',
    'taker-hips': 'Watch his hips',
    'taker-big': 'Stay big and wait',
  },
  framings: {
    'chain-receive': [
      'The ball is played into your feet. {defender} is on your back.',
      'A pass comes in to you. How do you take it?',
      '{teammate} looks up and finds you between the lines.',
    ],
    'chain-beat': [
      '{defender} stands between you and the goal.',
      'One man to beat. {defender} squares up.',
      'You have it under control. {defender} closes in.',
    ],
    'chain-run': [
      'The ball is going into the box. Where is your run?',
      'A delivery is coming. {defender} is tracking you.',
      'Space opens in the box. Time your run.',
    ],
    'chain-collect': [
      'The ball comes back to you deep in your half.',
      'You collect it under pressure. Their press is coming.',
      'Possession at the back. Pick your moment.',
    ],
    'chain-position': [
      '{attacker} picks up the ball and runs at you.',
      'They break. {attacker} has the ball and space.',
      '{attacker} turns towards your goal. Get set.',
    ],
    'chain-engage': [
      '{attacker} is coming at you. Your move.',
      'You are face to face with {attacker}.',
      '{attacker} slows, looking for a way past.',
    ],
    'chain-set': [
      'Danger: {attacker} is through and heading your way.',
      'A shot is coming. Set your feet.',
      'They are in your box. Where do you stand?',
    ],
    'chain-angle': [
      '{attacker} is bearing down on goal.',
      'It is you against {attacker}.',
      '{attacker} looks up. The angle is yours to take.',
    ],
    'chain-spot': [
      'You place the ball. {keeper} waits.',
      'The set piece is yours. Look at {keeper}.',
      'A deep breath. {keeper} is on his line.',
    ],
    'chain-scan': [
      'You take the corner. Look at their marking.',
      'Bodies in the box. Find your target.',
      'The corner is yours to deliver.',
    ],
    'chain-taker': [
      'Penalty against you. Watch the taker.',
      'Twelve yards. The taker places the ball.',
      'It is you and the taker. Read him.',
    ],
  } as Record<string, readonly string[]>,
  reads: {
    marker: {
      tight: 'Marker tight on you',
      loose: 'Marker standing off',
      square: 'Their line square',
    },
    defender: {
      'goal-side': 'Defender goal-side',
      square: 'Defender square on',
      lunging: 'Defender diving in',
    },
    'box-marker': {
      tight: 'Marked tight in the box',
      watching: 'Marker ball-watching',
      zonal: 'They mark zonally',
    },
    pressure: { crowded: 'Bodies around you' },
    attacker: {
      quick: 'A quick attacker',
      heavy: 'A heavy first touch',
      passer: 'He is looking to pass',
    },
    run: { straight: 'Running straight', cutting: 'Cutting inside', waiting: 'Waiting for help' },
    threat: {
      shooter: 'He wants to shoot',
      runner: 'A runner in behind',
      wide: 'It comes from wide',
    },
    shape: { square: 'Square on to you', onrushing: 'Running through', angled: 'On an angle' },
    nerve: { still: 'Keeper still', restless: 'Keeper restless' },
    box: { open: 'Space at the near post', crowded: 'Packed six-yard box' },
    'run-up': { long: 'A long run-up', stutter: 'A stuttering run-up' },
    edge: {
      settled: 'Ball settled',
      turned: 'Turned your man',
      'in-behind': 'In behind',
      'man-beaten': 'Your man beaten',
      combined: 'One-two played',
      shielded: 'Ball shielded',
      'near-run': 'Near-post run',
      'far-run': 'Far-post run',
      'held-run': 'Held your run',
      'first-touch': 'A touch to settle',
      scanned: 'Saw the picture',
      'first-time': 'Played first time',
      'goal-side': 'Goal-side',
      pressed: 'Pressed him',
      covered: 'Pass covered',
      'stepped-in': 'Stepped in',
      delayed: 'Held him up',
      'shown-wide': 'Shown wide',
      'on-line': 'Set on your line',
      'off-line': 'Off your line',
      'near-covered': 'Near post covered',
      narrowed: 'Angle narrowed',
      'stood-big': 'Stood big',
      feinted: 'Sold him the near post',
      'keeper-read': 'Read the keeper',
      'keeper-misread': 'Keeper not fooled',
      'spot-picked': 'Spot picked',
      'spot-doubted': 'Second thoughts',
      'marking-read': 'Read their marking',
      'marking-misread': 'They read it',
      'routine-set': 'Routine on',
      'routine-read': 'Routine read',
      'taker-read': 'Read the taker',
      'taker-misread': 'Taker fooled you',
      'stayed-big': 'Stayed big',
      'big-read': 'Taker waited you out',
    },
  } as Record<string, Record<string, string>>,
  outcomes: {
    goal: 'Goal {chance}%',
    pass: 'Pass {chance}%',
    beat: 'Beat him {chance}%',
    stop: 'Stop {chance}%',
    save: 'Save {chance}%',
    control: 'Control {chance}%',
    turn: 'Turn {chance}%',
    run: 'Get there {chance}%',
    combine: 'One-two {chance}%',
    shield: 'Keep it {chance}%',
    'goal-side': 'Goal-side {chance}%',
    press: 'Win it {chance}%',
    cover: 'Cut it out {chance}%',
    set: 'Set {chance}%',
    read: 'Read it {chance}%',
  },
  failures: {
    lost: 'If not: ball lost',
    counter: 'If not: they break',
    offside: 'If not: offside',
    'foul-won': 'If not: a free kick',
    beaten: 'If not: he is through',
    foul: 'If not: a foul, maybe a card',
    misread: 'If not: they are ready',
    missed: 'If not: it is missed',
    goal: 'If not: a goal',
    shot: 'If not: they shoot',
    card: 'A card is likely',
  },
  stakes: {
    attack: '{minute}′ · {for}–{against} · A chance is on',
    defence: '{minute}′ · {for}–{against} · They are coming at you',
    keeper: '{minute}′ · {for}–{against} · Danger in your box',
    'set-piece': '{minute}′ · {for}–{against} · A set piece',
    'hero.attack': '{minute}′ · {for}–{against} · Your big chance',
    'hero.defence': '{minute}′ · {for}–{against} · Only you can stop this',
    'hero.keeper': '{minute}′ · {for}–{against} · Only you can stop this',
    'hero.set-piece': '{minute}′ · {for}–{against} · A set piece to decide it',
    'climax.level': '{minute}′ · {for}–{against} · The winner is on the line',
    'climax.ahead': '{minute}′ · {for}–{against} · Hold the lead',
    'climax.behind': '{minute}′ · {for}–{against} · The equaliser is on the line',
  },
  causes: {
    success: '{factor} · {chance}%',
    failure: '{factor} · {chance}%',
    'success-odds': 'It came off · {chance}%',
    'failure-odds': 'Not this time · {chance}%',
  },
  drought: 'Coach: they’ll leave you more space today.',
};
const chain = ({ en: chainEn } satisfies Translations<typeof chainEn>)[LOCALE];
/** The decision chains' engine keys (X1a). */
export const chainCopy: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(chain.choices).map(([id, text]) => [`match.choice.${id}`, text]),
  ),
  ...Object.fromEntries(
    Object.entries(chain.framings).flatMap(([id, lines]) =>
      lines.map((text, index) => [`match.situation.${id}.${index}`, text]),
    ),
  ),
  ...Object.fromEntries(
    Object.keys(chain.framings).map((id) => [`match.situation.${id}`, chain.framings[id]![0]!]),
  ),
  ...Object.fromEntries(
    Object.entries(chain.reads).flatMap(([read, states]) =>
      Object.entries(states).map(([state, text]) => [`match.read.${read}.${state}`, text]),
    ),
  ),
  ...Object.fromEntries(
    Object.entries(chain.outcomes).map(([id, text]) => [`match.outcome.${id}`, text]),
  ),
  ...Object.fromEntries(
    Object.entries(chain.failures).map(([id, text]) => [`match.chain.failure.${id}`, text]),
  ),
  ...Object.fromEntries(
    Object.entries(chain.stakes).map(([id, text]) => [`match.chain.stakes.${id}`, text]),
  ),
  ...Object.fromEntries(
    Object.entries(chain.causes).map(([id, text]) => [`match.chain.cause.${id}`, text]),
  ),
  'match.director.drought': chain.drought,
};

/** Engine keys: `match.situation.<id>.<variant>` and `match.read.<read>.<state>`. */
export const momentCopy: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(copy.framings).flatMap(([id, lines]) => {
      // The earlier situations keep their three framings (indices 0–2) in match.ts.
      const first = lines.length === 5 ? 0 : 3;
      return lines.map((text, index) => [`match.situation.${id}.${first + index}`, text]);
    }),
  ),
  ...Object.fromEntries(
    Object.entries(copy.reads).flatMap(([read, states]) =>
      Object.entries(states).map(([state, text]) => [`match.read.${read}.${state}`, text]),
    ),
  ),
  ...chainCopy,
};
