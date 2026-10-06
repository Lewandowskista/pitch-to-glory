import type {
  Career,
  Injury,
  Player,
  Position,
  TrainingFocus,
  TrainingGroup,
  TrainingPlan,
  TrainingReport,
  World,
} from '../../model/domain';
import { CONFIG } from '../config';
import { createRng, type Rng } from '../rng';
import { ageCategory, careerCap, isKeeperKey, type AnyAttribute } from '../ageing';
import { getSeasonWeeks } from '../world/calendar';
import { attributeValue, trainableAttributes } from './progression';
import { chronicle } from './honours/chronicle';

const T = CONFIG.career.training;
const I = CONFIG.career.injuries;
const DEV = CONFIG.world.development;
const POSITIONS: readonly Position[] = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];
export const TRAINING_GROUPS: readonly TrainingGroup[] = [
  'technical',
  'physical',
  'mental',
  'goalkeeping',
];

export function defaultTrainingPlan(position: Position): TrainingPlan {
  // Keepers train goalkeeping and mental attributes; outfield players their full set.
  return position === 'GK'
    ? {
        sessions: [
          { focus: 'goalkeeping', intensity: 'normal' },
          { focus: 'mental', intensity: 'normal' },
          { focus: 'goalkeeping', intensity: 'low' },
        ],
        extra: null,
      }
    : {
        sessions: [
          { focus: 'technical', intensity: 'normal' },
          { focus: 'physical', intensity: 'normal' },
          { focus: 'mental', intensity: 'low' },
        ],
        extra: null,
      };
}
export const isPositionFocus = (focus: TrainingFocus): focus is `position:${Position}` =>
  focus.startsWith('position:');

/** Attributes a focus trains for this player (empty for recovery and position work). */
export function focusAttributes(player: Player, focus: TrainingFocus): AnyAttribute[] {
  if (focus === 'recovery' || isPositionFocus(focus)) return [];
  const trainable = trainableAttributes(player);
  if ((TRAINING_GROUPS as readonly string[]).includes(focus))
    return trainable.filter((key) => {
      const category = ageCategory(key);
      return focus === 'goalkeeping'
        ? category === 'keeper'
        : focus === 'physical'
          ? category === 'physical' || category === 'pace'
          : focus === 'mental'
            ? category === 'mental'
            : category === 'technical';
    });
  return trainable.includes(focus as AnyAttribute) ? [focus as AnyAttribute] : [];
}
/** Whether a focus is meaningful for this player (used by validation and the planner). */
export function validFocus(player: Player, focus: TrainingFocus): boolean {
  if (focus === 'recovery') return true;
  if (isPositionFocus(focus)) {
    const position = focus.slice('position:'.length) as Position;
    return (
      POSITIONS.includes(position) &&
      position !== player.primaryPosition &&
      (position === 'GK') === (player.primaryPosition === 'GK')
    );
  }
  return focusAttributes(player, focus).length > 0;
}
const focusValue = (player: Player, keys: readonly AnyAttribute[]) =>
  keys.length ? keys.reduce((sum, key) => sum + attributeValue(player, key), 0) / keys.length : 0;

/** The teammate best placed to lead an extra session in this focus. */
export function mentorFor(world: World, focus: TrainingFocus): Player | null {
  const player = world.players[world.career!.playerId]!;
  const club = player.clubId ? world.clubs[player.clubId] : undefined;
  if (!club || focus === 'recovery') return null;
  const position = isPositionFocus(focus) ? focus.slice('position:'.length) : null;
  const keys = focusAttributes(player, focus);
  const candidates = club.playerIds
    .map((id) => world.players[id]!)
    .filter((p) => p.id !== player.id && (!position || p.primaryPosition === position));
  const value = (p: Player) =>
    position ? focusValue(p, focusAttributes(p, 'technical')) : focusValue(p, keys);
  return candidates.sort((a, b) => value(b) - value(a) || (a.id < b.id ? -1 : 1))[0] ?? null;
}

function learningRate(age: number): number {
  const points = T.ageLearning;
  if (age <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index++) {
    const [toAge, toValue] = points[index]!;
    if (age <= toAge) {
      const [fromAge, fromValue] = points[index - 1]!;
      return fromValue + ((toValue - fromValue) * (age - fromAge)) / (toAge - fromAge);
    }
  }
  return points[points.length - 1]![1];
}
const has = (career: Career, skill: string) => career.skills.includes(skill);

function addProgress(
  world: World,
  player: Player,
  keys: readonly AnyAttribute[],
  amount: number,
  report: TrainingReport,
): void {
  const career = world.career!;
  const age = world.date.season - player.birthSeason;
  for (const key of keys) {
    const value = attributeValue(player, key);
    const cap = careerCap(player, key, age);
    if (value >= 99 || value >= cap + CONFIG.career.costs.capMargin) continue;
    const share = (amount / keys.length) * (value >= cap ? T.beyondCapFactor : 1);
    const progress = (career.trainingProgress[key] ?? 0) + share;
    report.gains[key] = Math.round(((report.gains[key] ?? 0) + share) * 1e4) / 1e4;
    const whole = Math.floor(progress);
    career.trainingProgress[key] = Math.round((progress - whole) * 1e6) / 1e6;
    if (whole > 0) {
      if (isKeeperKey(key)) player.keeperAttributes[key] = Math.min(99, value + whole);
      else player.attributes[key] = Math.min(99, value + whole);
      if (!report.improved.includes(key)) report.improved.push(key);
    }
  }
}

/** Start an injury for the career player. */
export function injure(world: World, cause: Injury['cause'], rng: Rng, kind?: string): Injury {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  type InjuryType = (typeof I.types)[number];
  const types: readonly InjuryType[] = kind ? I.types.filter((t) => t.kind === kind) : I.types;
  let pick = rng.next() * types.reduce((sum: number, t) => sum + t.weight, 0);
  let type = types[types.length - 1]!;
  for (const candidate of types) {
    pick -= candidate.weight;
    if (pick < 0) {
      type = candidate;
      break;
    }
  }
  const injury: Injury = {
    id: `injury:${world.date.season}:${world.date.week}:${career.matches.length}`,
    playerId: player.id,
    kind: type.kind,
    started: { ...world.date },
    weeksRemaining: rng.int(type.weeks[0], type.weeks[1]),
    severity: type.severity,
    reinjuryRisk: 0,
    recovery: null,
    careerThreatening: type.threatening > 0 && rng.next() < type.threatening,
    cause,
  };
  career.injury = injury;
  career.reinjury = null;
  player.injuryId = injury.id;
  if (injury.weeksRemaining >= 4)
    chronicle(world, 'injury', { kind: injury.kind, weeks: injury.weeksRemaining });
  return injury;
}
/** Injury chance multiplier from fatigue, injury proneness and the Iron Man skill. */
export function injuryFactor(career: Career, player: Player): number {
  return (
    (1 + player.fatigue / I.fatigueWeight) *
    (0.5 + player.hidden.injuryProneness / 100) *
    (has(career, 'iron-man') ? I.ironManSkill : 1)
  );
}

/** Choose how to recover: a rushed return halves time out but leaves a re-injury risk. */
export function chooseRecovery(world: World, recovery: 'rehab' | 'rush'): World {
  const career = structuredClone(world.career!);
  const injury = career.injury;
  if (!injury || injury.recovery) throw new Error('No recovery decision pending');
  injury.recovery = recovery;
  if (recovery === 'rush') {
    injury.weeksRemaining = Math.max(1, Math.ceil(injury.weeksRemaining * I.rush.durationFactor));
    injury.reinjuryRisk = I.rush.reinjuryRisk;
  }
  return { ...world, career };
}

/**
 * One week for the career player, run by the world simulation after the week's fixtures:
 * injury recovery, training (or rest while injured), ageing decline and hidden-attribute
 * reveals. Mutates the given world, which the caller owns.
 */
export function careerWeek(world: World): void {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const rng = createRng(`${world.seed}:career:${world.date.season}:${world.date.week}`);
  const age = world.date.season - player.birthSeason;
  const report: TrainingReport = {
    season: world.date.season,
    week: world.date.week,
    gains: {},
    improved: [],
    declined: [],
    familiarity: null,
    fatigue: 0,
    injuryId: null,
  };
  refreshMentor(world);
  if (career.injury) {
    const injury = career.injury;
    injury.weeksRemaining--;
    report.fatigue = T.fatigue.recovery;
    if (injury.weeksRemaining <= 0) {
      if (injury.careerThreatening)
        for (const key of ['pace', 'acceleration'] as const)
          player.attributes[key] = Math.max(1, player.attributes[key] - I.threateningLoss);
      career.reinjury =
        injury.recovery === 'rush'
          ? { risk: injury.reinjuryRisk, weeks: 6, kind: injury.kind }
          : null;
      career.injury = null;
      player.injuryId = null;
    }
  } else {
    if (career.reinjury) {
      career.reinjury.weeks--;
      if (career.reinjury.weeks <= 0) career.reinjury = null;
    }
    const learning =
      learningRate(age) *
      ((DEV.professionalismBase + player.hidden.professionalism / 100) / 1.1) *
      (has(career, 'professional') ? T.professionalSkill : 1);
    const sessions = [
      ...career.training.sessions.map((session) => ({ ...session, extra: false })),
      ...(career.training.extra
        ? [{ focus: career.training.extra.focus, intensity: 'normal' as const, extra: true }]
        : []),
    ];
    for (const session of sessions) {
      const fatigue = session.extra
        ? T.fatigue.extra
        : session.focus === 'recovery'
          ? T.fatigue.recovery
          : T.fatigue[session.intensity];
      report.fatigue +=
        fatigue > 0 && has(career, 'second-wind') ? fatigue * T.secondWindSkill : fatigue;
      if (session.focus === 'recovery') continue;
      if (isPositionFocus(session.focus)) {
        const position = session.focus.slice('position:'.length) as Position;
        const entry = player.secondaryPositions.find((p) => p.position === position);
        const gain = T.familiarity[session.intensity] * (session.extra ? 1.5 : 1);
        const familiarity = Math.min(100, Math.round((entry?.familiarity ?? 0) + gain));
        if (entry) entry.familiarity = familiarity;
        else player.secondaryPositions.push({ position, familiarity });
        report.familiarity = { position, familiarity };
      } else {
        let gain = (session.extra ? T.mentorGain : T.gain[session.intensity]) * learning;
        if (session.extra && career.training.extra) {
          const mentor = world.players[career.training.extra.mentorId];
          const keys = focusAttributes(player, session.focus);
          if (mentor && keys.length) {
            const lead = (focusValue(mentor, keys) - focusValue(player, keys)) / 20;
            gain *= 1 + Math.max(0, Math.min(T.mentorBonus, lead));
          }
        }
        addProgress(world, player, focusAttributes(player, session.focus), gain, report);
      }
      const risk = session.extra ? T.injuryRisk.extra : T.injuryRisk[session.intensity];
      if (!career.injury && rng.next() < risk * injuryFactor(career, player))
        report.injuryId = injure(world, 'training', rng).id;
    }
  }
  report.fatigue = Math.round(report.fatigue);
  player.fatigue = Math.max(0, Math.min(100, player.fatigue + report.fatigue));
  player.fitness = Math.max(0, Math.min(100, Math.round(100 - player.fatigue * 0.2)));
  // Ageing: past a category's peak, attributes above the age-adjusted cap fall back toward it.
  const seasonWeeks = getSeasonWeeks(world);
  for (const key of trainableAttributes(player)) {
    const category = ageCategory(key);
    if (age <= DEV.peakEnd[category]) continue;
    const value = attributeValue(player, key);
    const gap = value - careerCap(player, key, age);
    if (gap > 0 && rng.next() < Math.min(0.9, (gap * DEV.declinePerSeason) / seasonWeeks)) {
      if (isKeeperKey(key)) player.keeperAttributes[key] = value - 1;
      else player.attributes[key] = value - 1;
      report.declined.push(key);
    }
  }
  revealHidden(player);
  career.lastTraining = report;
}

/** Keep the extra session's mentor a current teammate, re-picking or dropping it if not. */
export function refreshMentor(world: World): void {
  const career = world.career!;
  const extra = career.training.extra;
  if (!extra) return;
  const player = world.players[career.playerId]!;
  const mentor = world.players[extra.mentorId];
  if (mentor && !mentor.retired && mentor.clubId === player.clubId) return;
  const replacement = mentorFor(world, extra.focus);
  career.training.extra = replacement ? { ...extra, mentorId: replacement.id } : null;
}

/** Reveal hidden attributes as appearances accumulate. */
export function revealHidden(player: Player): void {
  const { appearances, order } = CONFIG.career.reveal;
  const due = appearances.filter((count) => player.stats.appearances >= count).length;
  for (const key of order.slice(0, due))
    if (!player.hidden.revealed.includes(key)) player.hidden.revealed.push(key);
}
