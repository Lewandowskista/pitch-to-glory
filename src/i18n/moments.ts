import { LOCALE, type Translations } from './locale';

/**
 * Key moments of the 1.0 match rules (engine match-22, release 1.0 step 5.2): the framings of
 * the new situations and two more for each earlier one, the new choices, the reads of the play
 * (each also an odds factor) and the Clutch factor. Parameters as in the match-12 framings:
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
const choicesEn: Record<string, string> = {
  'professional-foul': 'Take him down',
  'chase-back': 'Chase him back',
  'show-wide': 'Show him wide and wait',
  'attack-cross': 'Attack the ball',
  'mark-runner': 'Stay with the runner',
  'block-cross': 'Close down the crosser',
  'engage-carrier': 'Go to the ball',
  'cut-lane': 'Cut out the pass',
  delay: 'Back off and delay',
  'zonal-hold': 'Hold your zone',
  'man-mark': 'Mark their best header',
  'front-post': 'Attack the near post',
  'sweep-clear': 'Rush out and clear it',
  'sweep-control': 'Come out and take it down',
  'stay-home': 'Stay home',
  'first-time-clear': 'Clear it first time',
  'take-touch': 'Take a touch and pass',
  'round-striker': 'Go round the striker',
  'rebound-first-time': 'Hit it first time',
  'rebound-control': 'Control and place it',
  'rebound-cutback': 'Cut it back to a teammate',
  'weak-foot-shot': 'Shoot with your weaker foot',
  'shift-strong': 'Shift it onto your stronger foot',
  'weak-foot-pass': 'Lay it off',
  'press-carry': 'Win it and drive forward',
  'first-time-ball': 'Play a first-time ball over the press',
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
const momentsEn = {
  framings: framingsEn,
  choices: choicesEn,
  reads: readsEn,
  /** The decision panel's line of reads (screen copy). */
  readsLabel: 'What you see',
} as const;
const moments = ({ en: momentsEn } satisfies Translations<typeof momentsEn>)[LOCALE];
/** The decision panel's label for a moment's reads. */
export const readsLabel = moments.readsLabel;

/** The engine keys of match-22's key moments, merged into the match labels (match.ts). */
export const momentLabels: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(moments.framings).flatMap(([id, lines]) => {
      // The earlier situations keep their three framings (indices 0–2) in match.ts.
      const first = lines.length === 5 ? 0 : 3;
      return [
        ...(first === 0 ? [[`match.situation.${id}`, lines[0]!]] : []),
        ...lines.map((text, index) => [`match.situation.${id}.${first + index}`, text]),
      ];
    }),
  ),
  ...Object.fromEntries(
    Object.entries(moments.choices).map(([id, text]) => [`match.choice.${id}`, text]),
  ),
  ...Object.fromEntries(
    Object.entries(moments.reads).flatMap(([read, states]) =>
      Object.entries(states).map(([state, text]) => [`match.read.${read}.${state}`, text]),
    ),
  ),
  'match.factor.clutch': 'Clutch',
};
