/**
 * Late career under development rules 2. From an onset age the career player's soft caps fall
 * and decline speeds up every season, so playing on is a trade-off rather than a free choice.
 * Longevity, from 0 to 1, postpones that onset and softens both effects. It comes from what the
 * player chose: conditioning skills, a running share of physical training, the stamina and
 * strength they built, and their character. Pure and deterministic.
 */
import type { Career, Player, TrainingFocus, TrainingPlan, World } from '../../model/domain';
import { CONFIG } from '../config';
import {
  ageCategory,
  careerCap,
  isKeeperKey,
  type AgeCategory,
  type AnyAttribute,
} from '../ageing';

const L = CONFIG.career.longevity;

/** Whether this career plays under the late-decline rules. */
export const usesLateDecline = (career: Pick<Career, 'developmentRules'>): boolean =>
  career.developmentRules === 2;

const unit = (value: number, from: number, to: number) =>
  Math.max(0, Math.min(1, (value - from) / (to - from)));

/** How much one session counts as conditioning work: 1 for physical work, less for recovery. */
export function conditioningValue(player: Player, focus: TrainingFocus): number {
  if (focus === 'recovery')
    return player.primaryPosition === 'GK' ? 1 : L.conditioning.recoveryShare;
  if (focus === 'physical') return 1;
  if (focus in player.attributes && !isKeeperKey(focus)) {
    const category = ageCategory(focus as AnyAttribute);
    return category === 'pace' || category === 'physical' ? 1 : 0;
  }
  return 0;
}

/** The share of a week's plan, extra session included, that is conditioning work. */
export function planConditioning(player: Player, plan: TrainingPlan): number {
  const focuses = [
    ...plan.sessions.map((session) => session.focus),
    ...(plan.extra ? [plan.extra.focus] : []),
  ];
  if (!focuses.length) return 0;
  const total = focuses.reduce((sum, focus) => sum + conditioningValue(player, focus), 0);
  return Math.round((total / focuses.length) * 1e4) / 1e4;
}

/** Move the running conditioning share a week's worth toward this week's plan. */
export function conditioningWeek(career: Career, player: Player): void {
  const week = planConditioning(player, career.training);
  const share = career.conditioning ?? week;
  career.conditioning = Math.round((share + (week - share) * L.conditioning.weekly) * 1e4) / 1e4;
}

export interface Longevity {
  /** 0-1: how well the body is built to last. */
  score: number;
  /** The age, fractional, from which decline accelerates. */
  onset: number;
  /** Each source's contribution to the score. */
  parts: { skills: number; conditioning: number; physique: number; character: number };
}

export function longevity(career: Career, player: Player): Longevity {
  const keeper = player.primaryPosition === 'GK';
  const skills = career.skills.reduce((sum, id) => sum + (L.skills[id] ?? 0), 0);
  const share = career.conditioning ?? planConditioning(player, career.training);
  const conditioning = L.conditioning.weight * unit(share, L.conditioning.from, L.conditioning.to);
  // A keeper's outfield physique is untrained, so it counts as average.
  const physique = keeper
    ? L.physique.weight / 2
    : L.physique.weight *
      unit(
        (player.attributes.stamina + player.attributes.strength) / 2,
        L.physique.from,
        L.physique.to,
      );
  const character =
    L.character.weight *
    unit(player.hidden.professionalism - player.hidden.injuryProneness, -100, 100);
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const score = round(Math.min(1, skills + conditioning + physique + character));
  return {
    score,
    onset: round(L.onsetAge + (keeper ? L.keeperOnset : 0) + L.onsetShift * score),
    parts: {
      skills: round(skills),
      conditioning: round(conditioning),
      physique: round(physique),
      character: round(character),
    },
  };
}

/** Late seasons at an age: 0 before the onset, 1 in the onset season, and so on. */
export const lateSeasons = (age: number, onset: number): number => Math.max(0, age + 1 - onset);

/** Share of the soft cap kept after `late` late seasons. */
export function lateCapFactor(category: AgeCategory, late: number, score: number): number {
  if (late <= 0) return 1;
  const drop = L.capDrop[category] * (1 - L.capSoftening * score) * late ** 1.5;
  return 1 - Math.min(L.maxDrop, drop);
}

/** How much faster than normal attributes decline after `late` late seasons. */
export const lateRate = (late: number, score: number): number =>
  late <= 0 ? 1 : (L.rate - L.rateSoftening * score) ** late;

/** The career player's late-career state, or null under the original rules. */
export function lateCareer(
  world: World,
  player: Player,
  age: number,
): (Longevity & { late: number }) | null {
  const career = world.career;
  if (!career || career.playerId !== player.id || !usesLateDecline(career)) return null;
  const state = longevity(career, player);
  return { ...state, late: lateSeasons(age, state.onset) };
}

/**
 * The career player's soft cap for an attribute: the age-adjusted cap, lowered every late
 * season under development rules 2. Anyone else's cap is unchanged.
 */
export function careerSoftCap(world: World, player: Player, key: AnyAttribute, age: number) {
  const cap = careerCap(player, key, age);
  const late = lateCareer(world, player, age);
  if (!late?.late) return cap;
  return Math.max(1, Math.round(cap * lateCapFactor(ageCategory(key), late.late, late.score)));
}
