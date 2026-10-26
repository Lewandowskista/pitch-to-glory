import { LOCALE, type Translations } from './locale';

/**
 * Key moments of the 1.0 match rules (engine match-22, release 1.0 step 5.2) that the match
 * screen needs from its first render: the new choices, a plain sentence for each new situation,
 * the Clutch factor and the decision panel's label for the reads. The framings and the reads
 * themselves load with the match (momentsCopy.ts).
 */
const situationsEn: Record<string, string> = {
  'last-man': 'You are the last defender and an attacker is through.',
  'cross-defence': 'A cross is coming into your box.',
  'two-on-one': 'Two of them, one of you.',
  'set-piece-marking': 'A set piece against you. Pick your job in the box.',
  sweeping: 'A long ball over your defence. Come or stay?',
  'back-pass': 'A back-pass is coming to you under pressure.',
  rebound: 'The rebound falls to you in front of goal.',
  'weak-foot': 'The ball comes to you on your weaker foot.',
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
const momentsEn = {
  situations: situationsEn,
  choices: choicesEn,
  /** The decision panel's line of reads (screen copy). */
  readsLabel: 'What you see',
} as const;
const moments = ({ en: momentsEn } satisfies Translations<typeof momentsEn>)[LOCALE];
/** The decision panel's label for a moment's reads. */
export const readsLabel = moments.readsLabel;

/** The engine keys of match-22's choices and situations, merged into the match labels. */
export const momentLabels: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(moments.situations).map(([id, text]) => [`match.situation.${id}`, text]),
  ),
  ...Object.fromEntries(
    Object.entries(moments.choices).map(([id, text]) => [`match.choice.${id}`, text]),
  ),
  'match.factor.clutch': 'Clutch',
};
