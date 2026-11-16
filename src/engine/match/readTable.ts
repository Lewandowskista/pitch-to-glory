/**
 * The reads of each situation (engine match-22, release 1.0 step 5.2; docs/MATCH-BALANCING.md
 * "Reads"): what the pitch shows at a key moment (the keeper off his line, a wall of four, a
 * high press), each state multiplying the odds of the choices it bears on, named as an odds
 * factor (`match.read.<read>.<state>`).
 *
 * Every option wins somewhere: the far post when the keeper covers the near one, the safe ball
 * when the shot is blocked, the punch in traffic. The tables lean down more than up: the right
 * read is worth a little more than the moment's budget, the wrong one a lot less, so a player
 * who reads the pitch decides the match without inflating the scoring of one who plays well.
 */

/** One state of a read: how often it comes up, and the odds multiplier of each choice it bears on. */
export interface ReadState {
  id: string;
  weight: number;
  odds: Readonly<Record<string, number>>;
}
/**
 * A read of the play. Drawn reads are drawn on the moment's read stream; `pace` and `aerial`
 * reads come from the matchup with the drawn opponent (no draw), by `moments22.matchupMargin`.
 */
export interface Read {
  id: string;
  kind?: 'pace' | 'aerial';
  states: readonly ReadState[];
}
const state = (id: string, weight: number, odds: Record<string, number> = {}): ReadState => ({
  id,
  weight,
  odds,
});
/** A matchup read: the player is ahead of, level with or behind their direct opponent. */
const matchup = (
  id: 'pace' | 'aerial',
  ahead: Record<string, number>,
  behind: Record<string, number>,
): Read => ({
  id,
  kind: id,
  states: [state('ahead', 0, ahead), state('level', 0), state('behind', 0, behind)],
});

export const READS: Readonly<Record<string, readonly Read[]>> = {
  'box-chance': [
    {
      id: 'keeper',
      states: [
        state('set', 0.35, { 'take-on': 1.1 }),
        state('near', 0.35, { 'near-post': 0.6, 'far-post': 1.2 }),
        state('off-line', 0.3, { 'near-post': 1.2, 'far-post': 0.6, 'take-on': 1.15 }),
      ],
    },
    {
      id: 'cover',
      states: [
        state('sight', 0.35, { 'take-on': 0.83, 'square-pass': 0.72 }),
        state('tight', 0.35, {
          'near-post': 0.55,
          'far-post': 0.55,
          'take-on': 0.55,
          'square-pass': 1.15,
        }),
        state('isolated', 0.3, { 'take-on': 1.3, 'square-pass': 0.83 }),
      ],
    },
  ],
  'edge-of-area': [
    {
      id: 'keeper',
      states: [
        state('set', 0.4, { 'long-shot': 0.89, 'lay-off': 0.91 }),
        state('off-line', 0.3, { 'long-shot': 1.35, curler: 1.3, 'lay-off': 0.83 }),
        state('screened', 0.3, { 'long-shot': 0.4, curler: 0.51, 'drive-inside': 0.83 }),
      ],
    },
    {
      id: 'space',
      states: [
        state('room', 0.35, {
          'long-shot': 1.15,
          curler: 1.1,
          'drive-inside': 0.45,
          'lay-off': 0.77,
        }),
        state('closed', 0.35, { 'long-shot': 0.67, 'drive-inside': 1.25, 'lay-off': 0.89 }),
        state('crowded', 0.3, { 'drive-inside': 0.4, 'long-shot': 0.67, curler: 0.72 }),
      ],
    },
  ],
  'aerial-chance': [
    {
      id: 'delivery',
      states: [
        state('whipped', 0.38, { header: 1.25, 'control-shoot': 0.4, cushion: 0.72 }),
        state('looping', 0.37, {
          header: 0.55,
          'control-shoot': 1.3,
          'bicycle-kick': 1.25,
          cushion: 0.77,
        }),
        state('behind', 0.25, { header: 0.4, 'control-shoot': 0.45, 'bicycle-kick': 0.72 }),
      ],
    },
    matchup('aerial', { header: 1.2, 'bicycle-kick': 1.1 }, { header: 0.72 }),
  ],
  'build-up': [
    {
      id: 'line',
      states: [
        state('high', 0.35, {
          'through-ball': 1.35,
          'disguised-pass': 1.3,
          'cross-switch': 0.35,
          'carry-forward': 0.65,
        }),
        state('deep', 0.35, { 'through-ball': 0.26, 'disguised-pass': 0.35, 'cross-switch': 1.25 }),
        state('mid', 0.3, { 'cross-switch': 0.59, 'through-ball': 0.59, 'carry-forward': 1.1 }),
      ],
    },
    {
      id: 'space',
      states: [
        state('room', 0.4, { 'carry-forward': 1.3 }),
        state('closed', 0.6, { 'carry-forward': 0.3 }),
      ],
    },
  ],
  'defend-attack': [
    {
      id: 'carrier',
      states: [
        state('heavy-touch', 0.25, {
          tackle: 1.4,
          'slide-block': 1.3,
          'press-carry': 1.35,
          jockey: 0.5,
          'track-runner': 0.5,
        }),
        state('skilful', 0.25, {
          tackle: 0.34,
          'slide-block': 0.39,
          'press-carry': 0.34,
          intercept: 0.62,
          jockey: 1.3,
        }),
        state('head-up', 0.25, {
          intercept: 1.45,
          'track-runner': 0.56,
          tackle: 0.62,
          jockey: 0.5,
        }),
        state('runner', 0.25, {
          'track-runner': 1.45,
          intercept: 0.39,
          jockey: 0.45,
          tackle: 0.74,
        }),
      ],
    },
  ],
  'build-out': [
    {
      id: 'press',
      states: [
        state('high', 0.35, {
          'short-pass': 0.29,
          'carry-out': 0.45,
          'clear-long': 1.2,
          'press-escape': 1.3,
          'first-time-ball': 1.2,
        }),
        state('mid', 0.3, { 'carry-out': 1.35, 'short-pass': 0.62, 'clear-long': 0.62 }),
        state('off', 0.35, { 'short-pass': 1.3, 'clear-long': 0.45, 'carry-out': 0.8 }),
      ],
    },
    {
      id: 'their-line',
      states: [
        state('high', 0.4, { 'clear-long': 1.2, 'first-time-ball': 1.3 }),
        state('deep', 0.6, { 'clear-long': 0.74, 'first-time-ball': 0.68 }),
      ],
    },
  ],
  'shot-incoming': [
    {
      id: 'shot',
      states: [
        state('tame', 0.35, { hold: 1.15, parry: 0.6, 'tip-over': 0.55 }),
        state('powerful', 0.35, { hold: 0.45, parry: 1.3, 'tip-over': 1.2 }),
        state('dipping', 0.3, { hold: 0.6, parry: 0.5, 'tip-over': 1.45 }),
      ],
    },
    {
      id: 'range',
      states: [
        state('distance', 0.5, { hold: 1.05, parry: 0.9 }),
        state('close', 0.5, { hold: 0.8, parry: 1.1 }),
      ],
    },
  ],
  'one-on-one': [
    {
      id: 'position',
      states: [
        state('advanced', 0.45, { rush: 1.35, smother: 1.3, 'stay-line': 0.5 }),
        state('deep', 0.55, { rush: 0.55, smother: 0.6, 'stay-line': 1.25 }),
      ],
    },
    {
      id: 'angle',
      states: [
        state('central', 0.5, { rush: 1.15, smother: 1.1, 'stay-line': 0.75 }),
        state('tight', 0.5, { rush: 0.75, smother: 0.8, 'stay-line': 1.15 }),
      ],
    },
  ],
  'cross-ball': [
    {
      id: 'traffic',
      states: [
        state('clear', 0.35, { claim: 1.4, punch: 0.62, 'hold-line': 0.5 }),
        state('crowded', 0.35, { claim: 0.34, punch: 1.4, 'hold-line': 0.74 }),
        state('runner', 0.3, { 'hold-line': 1.3, claim: 0.68, punch: 0.68 }),
      ],
    },
    {
      id: 'delivery',
      states: [
        state('floated', 0.5, { claim: 1.1, 'hold-line': 0.8 }),
        state('whipped', 0.5, { claim: 0.8, 'hold-line': 1.1 }),
      ],
    },
  ],
  distribution: [
    {
      id: 'press',
      states: [
        state('high', 0.5, {
          'short-distribution': 0.2,
          'long-distribution': 1.2,
          'quick-release': 1.15,
        }),
        state('off', 0.5, { 'short-distribution': 1.15, 'long-distribution': 0.5 }),
      ],
    },
    {
      id: 'shape',
      states: [
        state('committed', 0.35, { 'long-distribution': 1.4, 'quick-release': 1.45 }),
        state('settled', 0.65, { 'long-distribution': 0.9, 'quick-release': 0.74 }),
      ],
    },
  ],
  penalty: [
    {
      id: 'keeper',
      states: [
        state('dives-early', 0.35, {
          'penalty-chip': 1.4,
          'penalty-power': 1.1,
          'penalty-corner': 0.7,
        }),
        state('stays-big', 0.35, {
          'penalty-corner': 1.15,
          'penalty-chip': 0.45,
          'penalty-power': 0.7,
        }),
        state('guesses', 0.3, { 'penalty-chip': 0.85 }),
      ],
    },
  ],
  'free-kick': [
    {
      id: 'distance',
      states: [
        state('close', 0.35, {
          'free-kick-curl': 1.35,
          'free-kick-drive': 1.1,
          'free-kick-short': 0.68,
        }),
        state('mid', 0.35, { 'free-kick-curl': 0.87, 'free-kick-drive': 0.87 }),
        state('long', 0.3, {
          'free-kick-curl': 0.39,
          'free-kick-drive': 0.62,
          'free-kick-short': 1.05,
        }),
      ],
    },
    {
      id: 'wall',
      states: [
        state('big', 0.5, { 'free-kick-drive': 0.45, 'free-kick-curl': 0.93 }),
        state('thin', 0.5, { 'free-kick-drive': 1.35, 'free-kick-short': 0.8 }),
      ],
    },
  ],
  'corner-kick': [
    {
      id: 'marking',
      states: [
        state('zonal', 0.35, {
          'corner-near-post': 1.35,
          'corner-inswinger': 0.56,
          'corner-short': 0.74,
        }),
        state('man', 0.35, {
          'corner-inswinger': 1.3,
          'corner-near-post': 0.56,
          'corner-short': 0.74,
        }),
        state('packed', 0.3, {
          'corner-short': 1.3,
          'corner-inswinger': 0.5,
          'corner-near-post': 0.5,
        }),
      ],
    },
    matchup(
      'aerial',
      { 'corner-inswinger': 1.15, 'corner-near-post': 1.1 },
      { 'corner-inswinger': 0.68, 'corner-near-post': 0.8 },
    ),
  ],
  'goal-line': [
    {
      id: 'shot',
      states: [
        state('low-drive', 0.5, {
          'body-block': 1.3,
          'goal-line-clear': 0.56,
          'stretch-tackle': 0.8,
        }),
        state('lofted', 0.5, {
          'goal-line-clear': 1.25,
          'body-block': 0.5,
          'stretch-tackle': 1.05,
        }),
      ],
    },
  ],
  'offside-line': [
    {
      id: 'line',
      states: [
        state('together', 0.5, { 'step-up': 1.4, 'drop-off': 0.56, 'track-runner': 0.68 }),
        state('broken', 0.5, { 'step-up': 0.29, 'drop-off': 1.15, 'track-runner': 1.05 }),
      ],
    },
    matchup('pace', { 'track-runner': 1.3 }, { 'track-runner': 0.5, 'drop-off': 1.1 }),
  ],
  'penalty-save': [
    {
      id: 'taker',
      states: [
        state('early', 0.4, { 'penalty-read': 1.25, 'penalty-stay': 0.7 }),
        state('waits', 0.4, { 'penalty-read': 0.65 }),
        state('nervous', 0.2),
      ],
    },
  ],
  'last-man': [
    {
      id: 'cover',
      states: [
        state('covered', 0.45, {
          'show-wide': 1.35,
          'professional-foul': 0.56,
          'chase-back': 0.74,
        }),
        state('alone', 0.55, { 'show-wide': 0.34, 'professional-foul': 1.15 }),
      ],
    },
    matchup('pace', { 'chase-back': 1.35 }, { 'chase-back': 0.39, 'show-wide': 1.05 }),
  ],
  'cross-defence': [
    {
      id: 'delivery',
      states: [
        state('early', 0.35, { 'attack-cross': 1.35, 'block-cross': 0.39, 'mark-runner': 0.68 }),
        state('cut-back', 0.35, { 'block-cross': 1.4, 'attack-cross': 0.34, 'mark-runner': 0.74 }),
        state('whipped', 0.3, { 'mark-runner': 1.3, 'attack-cross': 0.74, 'block-cross': 0.5 }),
      ],
    },
    matchup('aerial', { 'attack-cross': 1.2 }, { 'attack-cross': 0.62, 'mark-runner': 1.05 }),
  ],
  'two-on-one': [
    {
      id: 'carrier',
      states: [
        state('head-up', 0.5, { 'cut-lane': 1.4, 'engage-carrier': 0.45 }),
        state('head-down', 0.5, { 'engage-carrier': 1.4, 'cut-lane': 0.39 }),
      ],
    },
    {
      id: 'help',
      states: [
        state('coming', 0.45, { delay: 1.35, 'engage-carrier': 0.74, 'cut-lane': 0.8 }),
        state('none', 0.55, { delay: 0.34 }),
      ],
    },
  ],
  'set-piece-marking': [
    {
      id: 'delivery',
      states: [
        state('far', 0.35, { 'man-mark': 1.35, 'front-post': 0.39, 'zonal-hold': 0.74 }),
        state('near', 0.35, { 'front-post': 1.4, 'zonal-hold': 0.5, 'man-mark': 0.68 }),
        state('middle', 0.3, { 'zonal-hold': 1.35, 'man-mark': 0.62, 'front-post': 0.56 }),
      ],
    },
    matchup(
      'aerial',
      { 'zonal-hold': 1.15, 'front-post': 1.15 },
      { 'zonal-hold': 0.74, 'front-post': 0.74, 'man-mark': 1.05 },
    ),
  ],
  sweeping: [
    {
      id: 'race',
      states: [
        state('yours', 0.35, { 'sweep-control': 1.4, 'sweep-clear': 1.05, 'stay-home': 0.39 }),
        state('even', 0.35, { 'sweep-clear': 1.3, 'sweep-control': 0.39, 'stay-home': 0.74 }),
        state('theirs', 0.3, { 'sweep-clear': 0.34, 'sweep-control': 0.24, 'stay-home': 1.3 }),
      ],
    },
  ],
  'back-pass': [
    {
      id: 'pass',
      states: [
        state('under-hit', 0.4, {
          'first-time-clear': 1.25,
          'take-touch': 0.34,
          'round-striker': 0.74,
        }),
        state('firm', 0.6, { 'take-touch': 1.25, 'first-time-clear': 0.8 }),
      ],
    },
    {
      id: 'press',
      states: [
        state('high', 0.45, { 'take-touch': 0.5, 'round-striker': 1.3 }),
        state('off', 0.55, { 'take-touch': 1.15, 'round-striker': 0.5 }),
      ],
    },
  ],
  rebound: [
    {
      id: 'keeper',
      states: [
        state('down', 0.45, {
          'rebound-first-time': 1.3,
          'rebound-control': 1.05,
          'rebound-cutback': 0.77,
        }),
        state('recovered', 0.55, { 'rebound-first-time': 0.55, 'rebound-control': 0.83 }),
      ],
    },
    {
      id: 'ball',
      states: [
        state('kindly', 0.35, { 'rebound-control': 1.3, 'rebound-cutback': 0.72 }),
        state('awkward', 0.35, { 'rebound-control': 0.45, 'rebound-first-time': 1.05 }),
        state('crowded', 0.3, {
          'rebound-cutback': 1.2,
          'rebound-first-time': 0.55,
          'rebound-control': 0.55,
        }),
      ],
    },
  ],
  'weak-foot': [
    {
      id: 'pressure',
      states: [
        state('closing', 0.5, { 'shift-strong': 0.4, 'weak-foot-shot': 1.15 }),
        state('time', 0.5, { 'shift-strong': 1.3, 'weak-foot-shot': 0.72 }),
      ],
    },
    {
      id: 'keeper',
      states: [
        state('set', 0.6, { 'weak-foot-shot': 0.83, 'shift-strong': 0.89 }),
        state('off-line', 0.4, { 'weak-foot-shot': 1.2, 'weak-foot-pass': 0.83 }),
      ],
    },
  ],
  // ── Decision chains' lead-in steps (match-22, release 1.0 X1a; chainTable.ts) ───────────
  // Each has one read, drawn when the step opens: each state favours one option and leans hard
  // against another, so the step is a read of the play and a wrong read costs the chain.
  'chain-receive': [
    {
      id: 'marker',
      states: [
        state('tight', 0.35, { 'receive-set': 1.25, 'receive-turn': 0.4, 'receive-run': 0.7 }),
        state('loose', 0.35, { 'receive-turn': 1.5, 'receive-set': 0.8 }),
        state('square', 0.3, { 'receive-run': 1.6, 'receive-turn': 0.75, 'receive-set': 0.8 }),
      ],
    },
  ],
  'chain-beat': [
    {
      id: 'defender',
      states: [
        state('goal-side', 0.35, { 'beat-combine': 1.4, 'beat-dribble': 0.4 }),
        state('square', 0.35, { 'beat-dribble': 1.5, 'beat-shield': 0.75, 'beat-combine': 0.9 }),
        state('lunging', 0.3, { 'beat-shield': 1.5, 'beat-combine': 0.8, 'beat-dribble': 0.7 }),
      ],
    },
  ],
  'chain-run': [
    {
      id: 'box-marker',
      states: [
        state('tight', 0.35, { 'run-hold': 1.25, 'run-near': 0.45, 'run-far': 0.85 }),
        state('watching', 0.35, { 'run-far': 1.45, 'run-near': 1.1, 'run-hold': 0.8 }),
        state('zonal', 0.3, { 'run-near': 1.45, 'run-far': 0.7, 'run-hold': 0.9 }),
      ],
    },
  ],
  'chain-collect': [
    {
      id: 'pressure',
      states: [
        state('closing', 0.35, { 'collect-first': 1.5, 'collect-touch': 0.6, 'collect-scan': 0.8 }),
        state('time', 0.35, { 'collect-scan': 1.45, 'collect-first': 0.8 }),
        state('crowded', 0.3, {
          'collect-touch': 1.35,
          'collect-scan': 0.75,
          'collect-first': 0.6,
        }),
      ],
    },
  ],
  'chain-position': [
    {
      id: 'attacker',
      states: [
        state('quick', 0.35, {
          'position-goal-side': 1.35,
          'position-press': 0.35,
          'position-cover': 0.9,
        }),
        state('heavy', 0.35, {
          'position-press': 1.5,
          'position-cover': 0.7,
          'position-goal-side': 0.9,
        }),
        state('passer', 0.3, {
          'position-cover': 1.5,
          'position-goal-side': 0.8,
          'position-press': 0.55,
        }),
      ],
    },
  ],
  'chain-engage': [
    {
      id: 'run',
      states: [
        state('straight', 0.35, { 'engage-show': 1.4, 'engage-delay': 0.7, 'engage-step': 0.6 }),
        state('cutting', 0.35, { 'engage-step': 1.5, 'engage-show': 0.45 }),
        state('waiting', 0.3, { 'engage-delay': 1.35, 'engage-step': 0.4 }),
      ],
    },
  ],
  'chain-set': [
    {
      id: 'threat',
      states: [
        state('shooter', 0.35, { 'set-line': 1.3, 'set-off': 0.38 }),
        state('runner', 0.35, { 'set-off': 1.5, 'set-line': 0.6, 'set-near': 0.75 }),
        state('wide', 0.3, { 'set-near': 1.5, 'set-off': 0.55 }),
      ],
    },
  ],
  'chain-angle': [
    {
      id: 'shape',
      states: [
        state('square', 0.35, { 'angle-big': 1.35, 'angle-feint': 0.45 }),
        state('onrushing', 0.35, { 'angle-narrow': 1.45, 'angle-big': 0.6 }),
        state('angled', 0.3, { 'angle-feint': 1.5, 'angle-narrow': 0.55 }),
      ],
    },
  ],
  'chain-spot': [
    {
      id: 'nerve',
      states: [
        state('still', 0.5, { 'spot-keeper': 1.3, 'spot-pick': 0.85 }),
        state('restless', 0.5, { 'spot-pick': 1.2, 'spot-keeper': 0.7 }),
      ],
    },
  ],
  'chain-scan': [
    {
      id: 'box',
      states: [
        state('open', 0.5, { 'scan-near': 1.3, 'scan-far': 0.9 }),
        state('crowded', 0.5, { 'scan-far': 1.25, 'scan-near': 0.7 }),
      ],
    },
  ],
  'chain-taker': [
    {
      id: 'run-up',
      states: [
        state('long', 0.5, { 'taker-hips': 1.3, 'taker-big': 0.85 }),
        state('stutter', 0.5, { 'taker-big': 1.25, 'taker-hips': 0.65 }),
      ],
    },
  ],
};
