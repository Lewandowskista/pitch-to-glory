import type { Challenge, ChallengeKind, World } from '../../../model/domain';
import { createRng } from '../../rng';
import { getSeasonWeeks } from '../../world/calendar';
import { COSMETICS } from './catalogue';
import { availability, L } from './wardrobe';

const C = L.challenges;

/**
 * Daily and weekly challenges follow the real calendar, so they reward coming back. The UI
 * passes today's local date; the engine stays pure and the sets are seeded by period.
 */
export function challengePeriods(isoDate: string): { daily: string; weekly: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error('Invalid date');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  // ISO week: the week containing the year's first Thursday is week 1.
  const day = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return {
    daily: isoDate,
    weekly: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`,
  };
}

/** The career counter a challenge kind measures. */
export function challengeCounter(world: World, kind: ChallengeKind): number {
  const career = world.career!;
  const matches = career.matches;
  switch (kind) {
    case 'play':
      return matches.length;
    case 'goals':
      return matches.reduce((sum, m) => sum + m.goals, 0);
    case 'assists':
      return matches.reduce((sum, m) => sum + m.assists, 0);
    case 'wins':
      return matches.filter((m) => m.result === 'win').length;
    case 'rating':
      return matches.filter((m) => m.rating >= 7).length;
    case 'clean-sheets':
      return matches.filter((m) => m.cleanSheet).length;
    case 'press':
      return career.social.answered;
    case 'weeks':
      return (world.date.season - career.startSeason) * getSeasonWeeks(world) + world.date.week;
    case 'xp':
      return career.xp;
    case 'commitments':
      return Object.values(career.commitments?.totals ?? {}).reduce(
        (sum, count) => sum + (count ?? 0),
        0,
      );
  }
}

/** Kinds that only matches move: a sidelined player cannot make progress on them. */
const MATCH_KINDS: ReadonlySet<ChallengeKind> = new Set([
  'play',
  'goals',
  'assists',
  'wins',
  'rating',
  'clean-sheets',
]);
export const needsMinutes = (kind: ChallengeKind): boolean => MATCH_KINDS.has(kind);

/**
 * Whether the player is out of the side for now: injured, or not on the pitch in their club's
 * last fixture (benched or suspended).
 */
export function sidelined(world: World): boolean {
  const career = world.career!;
  if (career.injury || world.players[career.playerId]?.injuryId) return true;
  const last = career.availability?.at(-1);
  return Boolean(last && last.status !== 'played' && last.season === world.date.season);
}

/** What a challenge needing minutes becomes while sidelined: a goal of the same size off it. */
const ALTERNATIVES: Record<'daily' | 'weekly', [ChallengeKind, number][]> = {
  daily: [
    ['commitments', 2],
    ['press', 1],
    ['weeks', 2],
  ],
  weekly: [
    ['commitments', 6],
    ['press', 3],
    ['weeks', 8],
  ],
};

/**
 * Swap a challenge that needs match minutes for one the player can reach while sidelined
 * (review phase 5): the first alternative not already set, with the same reward. Once each.
 */
export function swapChallenge(world: World, id: string): void {
  const challenge = world.challenges.find((entry) => entry.id === id);
  if (!challenge || challenge.claimed || challenge.swapped)
    throw new Error('This challenge cannot be swapped');
  if (!needsMinutes(challenge.kind) || !sidelined(world))
    throw new Error('Swaps are for challenges you cannot play towards');
  const taken = new Set(
    world.challenges.filter((entry) => entry.cadence === challenge.cadence).map((e) => e.kind),
  );
  const next = ALTERNATIVES[challenge.cadence].find(([kind]) => !taken.has(kind));
  if (!next) throw new Error('No alternative is free');
  challenge.kind = next[0];
  challenge.target = next[1];
  challenge.baseline = challengeCounter(world, next[0]);
  challenge.swapped = true;
}
export function challengeProgress(world: World, challenge: Challenge): number {
  return Math.max(
    0,
    Math.min(challenge.target, challengeCounter(world, challenge.kind) - challenge.baseline),
  );
}
export const challengeDone = (world: World, challenge: Challenge) =>
  challengeProgress(world, challenge) >= challenge.target;

const DAILY: [ChallengeKind, number][] = [
  ['play', 1],
  ['weeks', 2],
  ['press', 1],
  ['goals', 1],
  ['assists', 1],
  ['rating', 1],
];
const WEEKLY: [ChallengeKind, number][] = [
  ['play', 5],
  ['wins', 3],
  ['goals', 4],
  ['rating', 3],
  ['weeks', 8],
  ['press', 3],
  ['xp', 600],
];

/**
 * Replace challenges from past periods with the current day's and week's sets. Goals
 * challenges suit attackers and clean sheets suit defenders and keepers.
 */
export function refreshChallenges(world: World, isoDate: string): boolean {
  const periods = challengePeriods(isoDate);
  const before = world.challenges.length;
  world.challenges = world.challenges.filter(
    (challenge) => challenge.period === periods[challenge.cadence],
  );
  let changed = world.challenges.length !== before;
  const position = world.players[world.career!.playerId]!.primaryPosition;
  const defensive = ['GK', 'CB', 'LB', 'RB'].includes(position);
  const fit = ([kind, target]: [ChallengeKind, number]): [ChallengeKind, number] =>
    defensive && (kind === 'goals' || kind === 'assists')
      ? ['clean-sheets', Math.max(1, Math.ceil(target / 2))]
      : [kind, target];
  for (const cadence of ['daily', 'weekly'] as const) {
    const period = periods[cadence];
    if (world.challenges.some((challenge) => challenge.cadence === cadence)) continue;
    const rng = createRng(`${world.seed}:challenges:${world.career!.playerId}:${period}`);
    const pool = [...(cadence === 'daily' ? DAILY : WEEKLY)];
    const picked: [ChallengeKind, number][] = [];
    while (picked.length < C[cadence] && pool.length) {
      const [entry] = pool.splice(rng.int(0, pool.length - 1), 1);
      const fitted = fit(entry!);
      if (!picked.some(([kind]) => kind === fitted[0])) picked.push(fitted);
    }
    const locked = COSMETICS.filter((item) => availability(world, item) === 'tokens');
    picked.forEach(([kind, target], index) => {
      const cosmetic =
        cadence === 'weekly' && locked.length && rng.next() < C.weeklyCosmeticChance
          ? rng.pick(locked).id
          : null;
      world.challenges.push({
        id: `challenge:${period}:${index}`,
        cadence,
        period,
        kind,
        target,
        baseline: challengeCounter(world, kind),
        rewardTokens: cadence === 'daily' ? C.dailyTokens : C.weeklyTokens,
        rewardCosmeticId: cosmetic,
        claimed: false,
      });
    });
    changed = true;
  }
  return changed;
}

/** Collect a completed challenge's style tokens and cosmetic. */
export function claimChallenge(world: World, id: string): void {
  const challenge = world.challenges.find((entry) => entry.id === id);
  if (!challenge || challenge.claimed) throw new Error('Nothing to claim');
  if (!challengeDone(world, challenge)) throw new Error('Not completed yet');
  const style = world.career!.style;
  challenge.claimed = true;
  style.tokens += challenge.rewardTokens;
  if (challenge.rewardCosmeticId && !style.owned.includes(challenge.rewardCosmeticId))
    style.owned.push(challenge.rewardCosmeticId);
}
