import type { Position, Skill, SkillBranch } from '../../model/domain';
import type { AnyAttribute } from '../ageing';

/** Starting archetypes: an attribute emphasis, a matching position family and a first skill. */
export interface Archetype {
  id: string;
  family: 'outfield' | 'keeper';
  /** Positions offered first in the wizard for this archetype. */
  positions: readonly Position[];
  emphasis: Partial<Record<AnyAttribute, number>>;
  startingSkill: string;
}

export const ARCHETYPES: readonly Archetype[] = [
  {
    id: 'finisher',
    family: 'outfield',
    positions: ['ST', 'LW', 'RW'],
    emphasis: { finishing: 10, composure: 6, heading: 4, positioning: 4 },
    startingSkill: 'clinical-finisher',
  },
  {
    id: 'speedster',
    family: 'outfield',
    positions: ['LW', 'RW', 'ST', 'LB', 'RB'],
    emphasis: { pace: 10, acceleration: 10, dribbling: 4, agility: 4 },
    startingSkill: 'engine',
  },
  {
    id: 'playmaker',
    family: 'outfield',
    positions: ['AM', 'CM', 'DM'],
    emphasis: { passing: 10, vision: 10, decisions: 5, firstTouch: 4 },
    startingSkill: 'playmaker',
  },
  {
    id: 'technician',
    family: 'outfield',
    positions: ['AM', 'LW', 'RW', 'CM'],
    emphasis: { dribbling: 10, firstTouch: 8, agility: 5, composure: 4 },
    startingSkill: 'trickster',
  },
  {
    id: 'box-to-box',
    family: 'outfield',
    positions: ['CM', 'DM', 'AM'],
    emphasis: { stamina: 10, workRate: 10, tackling: 5, passing: 4 },
    startingSkill: 'engine',
  },
  {
    id: 'destroyer',
    family: 'outfield',
    positions: ['CB', 'DM', 'LB', 'RB'],
    emphasis: { tackling: 10, strength: 8, aggression: 5, positioning: 6 },
    startingSkill: 'ball-winner',
  },
  {
    id: 'target-forward',
    family: 'outfield',
    positions: ['ST', 'CB'],
    emphasis: { heading: 10, jumping: 10, strength: 6, finishing: 3 },
    startingSkill: 'aerial-threat',
  },
  {
    id: 'shot-stopper',
    family: 'keeper',
    positions: ['GK'],
    emphasis: { reflexes: 10, diving: 8, handling: 6 },
    startingSkill: 'cat-reflexes',
  },
  {
    id: 'sweeper-keeper',
    family: 'keeper',
    positions: ['GK'],
    emphasis: { oneOnOnes: 10, kicking: 8, decisions: 4, composure: 4 },
    startingSkill: 'sweeper',
  },
  {
    id: 'commander',
    family: 'keeper',
    positions: ['GK'],
    emphasis: { commandOfArea: 10, aerialReach: 8, leadership: 6 },
    startingSkill: 'commanding',
  },
];
export const ARCHETYPE_BY_ID: Readonly<Record<string, Archetype>> = Object.fromEntries(
  ARCHETYPES.map((archetype) => [archetype.id, archetype]),
);

/** Point cost and minimum level by tier. */
const TIER: Record<number, { cost: number; level: number }> = {
  1: { cost: 1, level: 1 },
  2: { cost: 2, level: 5 },
  3: { cost: 2, level: 12 },
  4: { cost: 3, level: 20 },
};
const skill = (
  id: string,
  branch: SkillBranch,
  tier: number,
  prerequisites: string[],
  attributeBonuses: Skill['attributeBonuses'],
  forPlayers: Skill['for'],
): Skill => ({
  id,
  branch,
  tier,
  prerequisites,
  pointCost: TIER[tier]!.cost,
  minimumLevel: TIER[tier]!.level,
  attributeBonuses,
  for: forPlayers,
});

/**
 * The skill tree. A skill's id is also its trait id: the match engine boosts or unlocks
 * key-moment choices for it (see TRAIT_BOOSTS and requiredTraitId), and a few skills change
 * training, fatigue or injury risk. Every skill also grants small permanent attribute bonuses.
 */
export const SKILLS: readonly Skill[] = [
  // Finishing
  skill('clinical-finisher', 'finishing', 1, [], { finishing: 2 }, 'outfield'),
  skill('long-ranger', 'finishing', 2, ['clinical-finisher'], { longShots: 3 }, 'outfield'),
  skill(
    'finesse-shot',
    'finishing',
    2,
    ['clinical-finisher'],
    { finishing: 1, composure: 1 },
    'outfield',
  ),
  skill('chip-specialist', 'finishing', 3, ['finesse-shot'], { composure: 2 }, 'outfield'),
  skill(
    'poacher',
    'finishing',
    3,
    ['clinical-finisher', 'long-ranger'],
    { positioning: 2, finishing: 1 },
    'outfield',
  ),
  skill('acrobat', 'finishing', 4, ['poacher'], { agility: 2, finishing: 1 }, 'outfield'),
  // Creativity
  skill('playmaker', 'creativity', 1, [], { passing: 2 }, 'outfield'),
  skill('through-ball-artist', 'creativity', 2, ['playmaker'], { vision: 2 }, 'outfield'),
  skill('crosser', 'creativity', 2, ['playmaker'], { crossing: 3 }, 'outfield'),
  skill('tempo-setter', 'creativity', 3, ['through-ball-artist'], { decisions: 2 }, 'outfield'),
  skill('maestro', 'creativity', 3, ['through-ball-artist'], { vision: 2, passing: 1 }, 'outfield'),
  skill('visionary', 'creativity', 4, ['maestro', 'tempo-setter'], { vision: 3 }, 'outfield'),
  // Dribbling
  skill('trickster', 'dribbling', 1, [], { dribbling: 2 }, 'outfield'),
  skill('close-control', 'dribbling', 2, ['trickster'], { firstTouch: 2 }, 'outfield'),
  skill('speed-dribbler', 'dribbling', 2, ['trickster'], { acceleration: 2 }, 'outfield'),
  skill('escape-artist', 'dribbling', 3, ['close-control'], { agility: 2 }, 'outfield'),
  skill('flair', 'dribbling', 3, ['speed-dribbler'], { dribbling: 2, composure: 1 }, 'outfield'),
  skill(
    'magician',
    'dribbling',
    4,
    ['escape-artist', 'flair'],
    { dribbling: 2, firstTouch: 2 },
    'outfield',
  ),
  // Defending
  skill('ball-winner', 'defending', 1, [], { tackling: 2 }, 'outfield'),
  skill('interceptor', 'defending', 2, ['ball-winner'], { positioning: 2 }, 'outfield'),
  skill('man-marker', 'defending', 2, ['ball-winner'], { decisions: 2 }, 'outfield'),
  skill('last-ditch', 'defending', 3, ['interceptor'], { tackling: 2 }, 'outfield'),
  skill('aerial-dominance', 'defending', 3, ['man-marker'], { heading: 2, jumping: 1 }, 'outfield'),
  skill(
    'defensive-wall',
    'defending',
    4,
    ['last-ditch', 'aerial-dominance'],
    { positioning: 2, strength: 2 },
    'outfield',
  ),
  // Physical
  skill('engine', 'physical', 1, [], { stamina: 3 }, 'all'),
  skill('sprinter', 'physical', 2, ['engine'], { pace: 2 }, 'all'),
  skill('powerhouse', 'physical', 2, ['engine'], { strength: 3 }, 'all'),
  skill('aerial-threat', 'physical', 1, [], { jumping: 2, heading: 1 }, 'outfield'),
  skill('iron-man', 'physical', 3, ['powerhouse'], { stamina: 1, strength: 1 }, 'all'),
  skill('second-wind', 'physical', 3, ['sprinter'], { stamina: 2 }, 'all'),
  // Mentality
  skill('composed', 'mentality', 1, [], { composure: 2 }, 'all'),
  skill('professional', 'mentality', 2, ['composed'], { workRate: 1, decisions: 1 }, 'all'),
  skill('leader', 'mentality', 2, ['composed'], { leadership: 3 }, 'all'),
  skill('big-game-player', 'mentality', 3, ['professional'], { composure: 1 }, 'all'),
  skill('captains-voice', 'mentality', 3, ['leader'], { leadership: 3 }, 'all'),
  skill('clutch', 'mentality', 4, ['big-game-player'], { decisions: 2, composure: 2 }, 'all'),
  // Set pieces
  skill('set-piece-specialist', 'set-pieces', 1, [], { setPieces: 3 }, 'outfield'),
  skill(
    'curler',
    'set-pieces',
    2,
    ['set-piece-specialist'],
    { setPieces: 2, longShots: 1 },
    'outfield',
  ),
  skill(
    'delivery-specialist',
    'set-pieces',
    2,
    ['set-piece-specialist'],
    { crossing: 2 },
    'outfield',
  ),
  skill('free-kick-master', 'set-pieces', 3, ['curler'], { setPieces: 3 }, 'outfield'),
  // Goalkeeping
  skill('safe-hands', 'goalkeeping', 1, [], { handling: 2 }, 'keeper'),
  skill('cat-reflexes', 'goalkeeping', 1, [], { reflexes: 2 }, 'keeper'),
  skill('sweeper', 'goalkeeping', 1, [], { oneOnOnes: 2 }, 'keeper'),
  skill('commanding', 'goalkeeping', 1, [], { commandOfArea: 2 }, 'keeper'),
  skill('one-on-one-specialist', 'goalkeeping', 2, ['sweeper'], { oneOnOnes: 2 }, 'keeper'),
  skill('distributor', 'goalkeeping', 2, ['sweeper'], { kicking: 3 }, 'keeper'),
  skill(
    'reaction-saves',
    'goalkeeping',
    3,
    ['cat-reflexes', 'safe-hands'],
    { reflexes: 2, diving: 2 },
    'keeper',
  ),
  skill('aerial-command', 'goalkeeping', 3, ['commanding'], { aerialReach: 3 }, 'keeper'),
  skill(
    'wall',
    'goalkeeping',
    4,
    ['reaction-saves', 'aerial-command'],
    { handling: 2, reflexes: 2 },
    'keeper',
  ),
];
export const SKILL_BY_ID: Readonly<Record<string, Skill>> = Object.fromEntries(
  SKILLS.map((entry) => [entry.id, entry]),
);
export const SKILL_BRANCHES: readonly SkillBranch[] = [
  'finishing',
  'creativity',
  'dribbling',
  'defending',
  'physical',
  'mentality',
  'set-pieces',
  'goalkeeping',
];
/** Skills whose effect is systemic rather than a key-moment boost. */
export const SYSTEMIC_SKILLS = {
  professional: 'training',
  'second-wind': 'fatigue',
  'iron-man': 'injury',
  'big-game-player': 'importance',
  'captains-voice': 'leadership',
  leader: 'leadership',
} as const;
