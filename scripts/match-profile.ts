/**
 * Match profile (balance gate, docs/GAME-DESIGN-REVIEW.md Phase B). Plays many interactive
 * matches per position with the best-value policy (and the worst, for the spread) and reports
 * what a player experiences: goals, ratings, moments, objectives, substitutions, fatigue and
 * whether the stated odds come true. A check mode asserts the gates.
 *
 *   npm run profile:match -- --matches 300          every position
 *   npm run profile:match -- --positions ST,GK --matches 500
 *   npm run profile:match -- --seeds match-profile,match-profile-b   several world seeds
 *   npm run profile:match -- --check                 assert the gates on the last run, per seed
 *   npm run profile:match -- --check --assert-targets   also fail on the 1.0 targets (step 2.3)
 *
 * The check also reports the 1.0 targets (docs/RELEASE-1.0-PLAN.md step 2.3; `TARGETS` below):
 * choices that matter, no dominant choice, believable ratings, match statistics and goals in
 * added time. Each is reported, not asserted, until the phase 5 step that meets it flips its
 * `asserted` flag: ratings and match statistics are asserted from step 5.3.
 *
 * Not modelled: a player starting on the bench. The match engine's selected player always
 * starts; benching is a career matter, gated by the career profile's playing time.
 *
 * Writes artifacts/profile/matches.json.
 */
import { CALIBRATION_GATE, calibrationProblems } from './calibration';
import {
  assertAllTargets,
  evaluateTargets,
  percentile as quantile,
  printTargets,
  standardDeviation,
  within,
  type Target,
} from './targets';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Position } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import {
  applyMatchCommand,
  createMatchSession,
  createMatchSetup,
  type MatchCommand,
  type MatchSession,
  type MatchSetup,
} from '../src/engine/match';
import { ABILITY_WEIGHTS } from '../src/engine/strength';
import { FORMATION_SLOTS, FORMATIONS } from '../src/engine/selection/formations';
import { expectedImpact } from '../src/engine/match/decisions';
import { situationOf, templateOf } from '../src/engine/match/situations22';
import { createRng } from '../src/engine/rng';
import { autoPlayCommand } from '../src/engine/career/matches';
import { motionProbe } from '../src/engine/match/motion';

const OUT = 'artifacts/profile/matches.json';
const POSITIONS: Position[] = ['GK', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'ST'];

interface Bucket {
  n: number;
  stated: number;
  actual: number;
}
export interface PositionProfile {
  position: Position;
  matches: number;
  goals: number;
  assists: number;
  rating: {
    mean: number;
    p10: number;
    p90: number;
    nineOrMore: number;
    /** Standard deviation and the share rated 5.0 or less (1.0 targets, step 2.3). */
    sd?: number;
    fiveOrLess?: number;
  };
  moments: number;
  objectives: Record<string, { offered: number; completed: number }>;
  substituted: number;
  fatigueAtEnd: number;
  xp: number;
  fame: number;
  /** Team goals for and against, and the player's goals plus assists, with the best and the
   * worst policy on a specialised profile. */
  policy: { best: [number, number]; worst: [number, number]; involvement: [number, number] };
  calibration: Record<string, Bucket>;
  /**
   * Cards a match, both sides (engine match-16): yellows shown (second yellows included),
   * dismissals (second yellows and straight reds), the selected player's dismissals, and the
   * goals a side scored and conceded per minute while a man short, against every side-minute.
   */
  cards?: {
    yellow: number;
    red: number;
    secondYellow: number;
    straightRed: number;
    playerSentOff: number;
    short: { minutes: number; for: number; against: number };
    level: { minutes: number; goals: number };
  };
  /** Milliseconds per full match: everything, and the choreography (motion, narration included). */
  cost: { matchMs: number; motionMs: number; narrationMs?: number };
  /** The world seed the profile was played in (review phase 6: several seeds). */
  seed?: string;
  /**
   * Goals prevented by deciding well (review phase 6): per seed, the goals conceded with the
   * worst policy less those with the best, on the same specialised setup; mean, standard error.
   */
  prevented?: { mean: number; se: number; n: number };
  /**
   * Key moments from minute 75 by the selected side's score then (review phase 6): attacking
   * and defending situations when behind, level and ahead.
   */
  late?: Record<'behind' | 'level' | 'ahead', { attack: number; defence: number }>;
  /**
   * Scenarios on a share of the seeds (review phase 6): the mean odds of the choices taken in
   * the player's own slot and out of position (a formation without it; absent where every
   * formation has the slot), and substitutions and ratings fresh and tired.
   */
  /**
   * Choices that matter (1.0 targets, step 2.3): per seed, the selected side's goal difference
   * with the best policy less that with the worst, on the same specialised setup.
   */
  swing?: { mean: number; se: number; n: number };
  /**
   * No dominant choice (1.0 targets): per situation, its instances in the best-policy matches
   * and how often each choice had the highest expected value (ties share the credit).
   */
  dominance?: Record<string, { n: number; best: Record<string, number> }>;
  /**
   * Decision chains (engine match-22, release 1.0 X1a): chains a match and their planned
   * length; how each policy's chains ended (best on the profile's setup, a random choice at
   * every step, the worst on the specialised setup); the steps with the best policy (lead-ins
   * and finishes, finishing shots); matches with at least one positive chain; the prizes of
   * attacking chains; the hero beat and the climax.
   */
  chains?: ChainProfile;
  /**
   * Match statistics of the best-policy matches (1.0 targets): shots and shots on target by
   * both sides, goals and goals in added time, and the home side's possession in each match.
   */
  statistics?: {
    matches: number;
    shots: number;
    onTarget: number;
    /** Shots off the post or bar (engine match-22; absent before). */
    woodwork?: number;
    goals: number;
    addedTimeGoals: number;
    possession: number[];
  };
  scenarios?: {
    /** Mean contribution of the "Out of position" factor to the choices taken. */
    slot: { own: number; outOfPosition: number | null; n: number };
    tired: {
      substitutedFresh: number;
      substitutedTired: number;
      ratingFresh: number;
      ratingTired: number;
      n: number;
    };
  };
}

export interface ChainProfile {
  matches: number;
  chains: number;
  threeSteps: number;
  outcomes: Record<string, number>;
  positive: { best: number; random: number; worst: number; bestShaped: number };
  /** Chains played with each policy (the denominators of `positive`). */
  played: { best: number; random: number; worst: number; bestShaped: number };
  matchesWithPositive: number;
  lead: { n: number; success: number };
  finish: { n: number; success: number };
  shots: { n: number; goals: number };
  /** Attacking chains' prizes (expected goals at the start), and how many reached 0.25. */
  prize: { n: number; sum: number; high: number };
  /** Matches with 60 minutes or more, and those with a high-value chain (hero beat). */
  hero: { matches: number; met: number };
  /** Close games at 75′, and those whose last chain came from 82′ (in added time). */
  climax: { close: number; late: number; added: number };
}
function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const worstCommand = (session: MatchSession): MatchCommand => {
  const moment = session.state.currentMoment;
  if (moment) {
    const worst = [...moment.choices].sort(
      (a, b) => expectedImpact(a).net - expectedImpact(b).net || (a.id < b.id ? -1 : 1),
    )[0]!;
    return { type: 'choose', choiceId: worst.id };
  }
  return autoPlayCommand(session);
};
/** A random choice at every step (the "average" policy of the chain gates). */
const randomCommand = (session: MatchSession): MatchCommand => {
  const moment = session.state.currentMoment;
  if (moment) {
    const pick = createRng(`${session.setup.seed}:random:${moment.id}`).int(
      0,
      moment.choices.length - 1,
    );
    return { type: 'choose', choiceId: moment.choices[pick]!.id };
  }
  return autoPlayCommand(session);
};
/** Positive chains and chains played in a session. */
const positives = (session: MatchSession): [number, number] => {
  const chains = session.state.chains ?? [];
  return [chains.filter((chain) => chain.positive).length, chains.length];
};
/** The close game at 75′ and where its last chain came (the climax). */
function climaxOf(
  session: MatchSession,
  own: number,
): { close: boolean; minute?: number; added: boolean } {
  const goals = session.state.match.events.filter((e) => e.kind === 'goal' && e.minute < 75);
  const ownId = own === 0 ? session.setup.home.id : session.setup.away.id;
  const mine = goals.filter((e) => e.teamId === ownId).length;
  const close = Math.abs(2 * mine - goals.length) <= 1;
  const last = (session.state.chains ?? []).at(-1);
  return { close, ...(last ? { minute: last.minute } : {}), added: Boolean(last?.addedTime) };
}
function tallyChains(profile: ChainProfile, session: MatchSession, own: number): void {
  const s = session.state;
  const chains = s.chains ?? [];
  profile.matches++;
  profile.chains += chains.length;
  if (chains.some((chain) => chain.positive)) profile.matchesWithPositive++;
  for (const chain of chains) {
    if (chain.steps === 3) profile.threeSteps++;
    profile.outcomes[chain.outcome] = (profile.outcomes[chain.outcome] ?? 0) + 1;
    for (const result of chain.results) {
      const finish = result.step === chain.steps - 1;
      const bucket = finish ? profile.finish : profile.lead;
      bucket.n++;
      if (result.success) bucket.success++;
      if (!finish) continue;
      const moment = s.match.keyMoments.find(
        (entry) => entry.chainId === chain.id && entry.step === result.step,
      );
      if (moment && templateOf(moment.situationId, result.choiceId)?.direct === 'for') {
        profile.shots.n++;
        if (result.success) profile.shots.goals++;
      }
    }
    if (chain.kind === 'attack' && chain.prize !== undefined) {
      profile.prize.n++;
      profile.prize.sum += chain.prize;
      if (chain.prize >= 0.25 - 1e-9) profile.prize.high++;
    }
  }
  // The hero beat: 60 minutes or more on the pitch, and a chain worth 0.25 (its prize: expected
  // goals in attack, the danger it faces in defence).
  if (s.selectedPlayerMinutes >= 60) {
    profile.hero.matches++;
    if (chains.some((chain) => (chain.prize ?? 0) >= 0.25 - 1e-9)) profile.hero.met++;
  }
  const climax = climaxOf(session, own);
  if (climax.close && !s.substituted && !s.sentOff) {
    profile.climax.close++;
    if ((climax.minute ?? 0) >= 82) profile.climax.late++;
    if (climax.added) profile.climax.added++;
  }
}
function play(session: MatchSession, command: (s: MatchSession) => MatchCommand): MatchSession {
  while (session.state.match.status !== 'finished')
    session = applyMatchCommand(session, command(session));
  return session;
}
/** The selected player with a specialised profile: stronger in what the position relies on. */
function specialise(setup: MatchSetup, id: string): MatchSetup {
  const copy = structuredClone(setup);
  const player = copy.players[id]!;
  if (player.primaryPosition === 'GK') {
    // A shot-stopper (review phase 6): reflexes, diving, handling and one-on-ones up, the
    // kicking and command of the area down.
    const keeper = player.keeperAttributes as unknown as Record<string, number>;
    const strong = new Set(['reflexes', 'diving', 'handling', 'oneOnOnes']);
    for (const key of Object.keys(keeper))
      keeper[key] = Math.max(1, Math.min(99, keeper[key]! + (strong.has(key) ? 12 : -8)));
    return copy;
  }
  const weights = ABILITY_WEIGHTS[player.primaryPosition] as Record<string, number>;
  const source = player.attributes as unknown as Record<string, number>;
  for (const key of Object.keys(source)) {
    const weight = weights[key] ?? 1;
    const shift = weight >= 3 ? 12 : weight === 2 ? 4 : -8;
    source[key] = Math.max(1, Math.min(99, source[key]! + shift));
  }
  return copy;
}
const percentile = (values: number[], share: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
};

/** The "Out of position" factor of every choice the player took (0 when absent). */
const positionFactors = (session: MatchSession): number[] =>
  session.state.match.events.flatMap((event) => {
    const outcome = event.outcome;
    if (!outcome || outcome.input.momentId.startsWith('routine:')) return [];
    const moment = session.state.match.keyMoments.find((m) => m.id === outcome.input.momentId);
    const choice = moment?.choices.find((c) => c.id === outcome.input.choiceId);
    const factor = choice?.factors.find((f) => f.labelKey === 'match.factor.position');
    return choice ? [factor?.contribution ?? 0] : [];
  });
const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

/** A goal in added time: match-22 marks it with its added minute (release 1.0 step 5.4). */
const inAddedTime = (event: { kind: string; addedTime?: unknown }) =>
  event.kind === 'goal' && Boolean(event.addedTime);

/** Credit the choice with the highest expected value at each of a match's key moments. */
function tallyBestChoices(
  tally: NonNullable<PositionProfile['dominance']>,
  session: MatchSession,
): void {
  for (const moment of session.state.match.keyMoments) {
    if (moment.choices.length < 2) continue;
    const values = moment.choices.map((choice) => expectedImpact(choice).net);
    const top = Math.max(...values);
    const best = moment.choices.filter((_, index) => values[index]! >= top - 1e-9);
    const entry = (tally[moment.situationId] ??= { n: 0, best: {} });
    entry.n++;
    for (const choice of best)
      entry.best[choice.id] = (entry.best[choice.id] ?? 0) + 1 / best.length;
  }
}

export function profilePosition(
  position: Position,
  matches: number,
  seed = 'match-profile',
): PositionProfile {
  const world = generateWorld(seed, { format: 'legacy' });
  const clubs = Object.values(world.clubs).slice(0, 2);
  const tactics = { role: 'balanced', risk: 'balanced', mentality: 'balanced' } as const;
  const ratings: number[] = [];
  const buckets: Record<string, { n: number; p: number; s: number }> = {};
  const result: PositionProfile = {
    position,
    matches,
    goals: 0,
    assists: 0,
    rating: { mean: 0, p10: 0, p90: 0, nineOrMore: 0 },
    moments: 0,
    objectives: {},
    substituted: 0,
    fatigueAtEnd: 0,
    xp: 0,
    fame: 0,
    policy: { best: [0, 0], worst: [0, 0], involvement: [0, 0] },
    calibration: {},
    cards: {
      yellow: 0,
      red: 0,
      secondYellow: 0,
      straightRed: 0,
      playerSentOff: 0,
      short: { minutes: 0, for: 0, against: 0 },
      level: { minutes: 0, goals: 0 },
    },
    cost: { matchMs: 0, motionMs: 0 },
    seed,
    late: {
      behind: { attack: 0, defence: 0 },
      level: { attack: 0, defence: 0 },
      ahead: { attack: 0, defence: 0 },
    },
  };
  const cards = result.cards!;
  const late = result.late!;
  const odds = { own: [] as number[], away: [] as number[] };
  const prevented: number[] = [];
  const swing: number[] = [];
  const dominance: NonNullable<PositionProfile['dominance']> = {};
  const chainProfile: ChainProfile = {
    matches: 0,
    chains: 0,
    threeSteps: 0,
    outcomes: {},
    positive: { best: 0, random: 0, worst: 0, bestShaped: 0 },
    played: { best: 0, random: 0, worst: 0, bestShaped: 0 },
    matchesWithPositive: 0,
    lead: { n: 0, success: 0 },
    finish: { n: 0, success: 0 },
    shots: { n: 0, goals: 0 },
    prize: { n: 0, sum: 0, high: 0 },
    hero: { matches: 0, met: 0 },
    climax: { close: 0, late: 0, added: 0 },
  };
  const statistics: NonNullable<PositionProfile['statistics']> = {
    matches: 0,
    shots: 0,
    onTarget: 0,
    woodwork: 0,
    goals: 0,
    addedTimeGoals: 0,
    possession: [],
  };
  const tired = {
    fresh: [] as boolean[],
    tired: [] as boolean[],
    freshRating: [] as number[],
    tiredRating: [] as number[],
  };
  // Motion cost probe (redesign step M0): choreography must stay within 10 ms a match.
  motionProbe.clock = () => performance.now();
  motionProbe.ms = 0;
  motionProbe.passages = 0;
  motionProbe.narrationMs = 0;
  const started = performance.now();
  for (let index = 0; index < matches; index++) {
    const [home, away] = index % 2 ? [clubs[1]!, clubs[0]!] : [clubs[0]!, clubs[1]!];
    const club = index % 2 ? clubs[1]! : clubs[0]!;
    // Every player of the position at the club takes turns, so one profile does not decide.
    const candidates = club.playerIds.filter(
      (id) => world.players[id]!.primaryPosition === position,
    );
    const selected = candidates[Math.floor(index / 2) % candidates.length];
    if (!selected) throw new Error(`No ${position} at ${club.name}`);
    const setup = createMatchSetup(
      world,
      home.id,
      away.id,
      selected,
      `profile:${position}:${index}`,
    );
    const own = setup.home.id === club.id ? 0 : 1;
    // Moments follow the slot played (engine match-11), so a position is profiled in a
    // formation that has a slot for it: an attacking midfielder is not measured at striker.
    if (
      setup.formations &&
      !FORMATION_SLOTS[setup.formations[own]].some((s) => s.position === position)
    )
      setup.formations[own] = FORMATIONS.find((f) =>
        FORMATION_SLOTS[f].some((s) => s.position === position),
      )!;
    const best = play(createMatchSession(setup, tactics), autoPlayCommand);
    // 1.0 targets: the best choice at every moment, and the match's statistics.
    tallyBestChoices(dominance, best);
    statistics.matches++;
    statistics.shots += best.state.stats.homeShots + best.state.stats.awayShots;
    statistics.onTarget += best.state.stats.shotsOnTarget[0] + best.state.stats.shotsOnTarget[1];
    const woodwork = best.state.stats.woodwork ?? [0, 0];
    statistics.woodwork! += woodwork[0] + woodwork[1];
    statistics.possession.push(best.state.stats.homePossession);
    for (const event of best.state.match.events)
      if (event.kind === 'goal') {
        statistics.goals++;
        if (inAddedTime(event)) statistics.addedTimeGoals++;
      }
    // Late moments by the score at the time (review phase 6).
    for (const moment of best.state.match.keyMoments) {
      if (moment.minute < 75) continue;
      const goals = best.state.match.events.filter(
        (event) => event.kind === 'goal' && event.minute < moment.minute,
      );
      const mine = goals.filter((event) => event.teamId === club.id).length;
      const theirs = goals.length - mine;
      const state = mine < theirs ? 'behind' : mine > theirs ? 'ahead' : 'level';
      const phase = situationOf(moment.situationId)?.phase;
      if (phase === 'attack') late[state].attack++;
      else if (phase === 'defence') late[state].defence++;
    }
    // Scenarios on every fourth seed (review phase 6).
    if (index % 4 === 0 && position !== 'GK') {
      odds.own.push(...positionFactors(best));
      const lacking = FORMATIONS.find(
        (f) => !FORMATION_SLOTS[f].some((slot) => slot.position === position),
      );
      if (lacking && setup.formations) {
        const away = structuredClone(setup);
        away.formations![own] = lacking;
        odds.away.push(
          ...positionFactors(play(createMatchSession(away, tactics), autoPlayCommand)),
        );
      }
      const worn = structuredClone(setup);
      worn.players[selected]!.fitness = 60;
      worn.players[selected]!.fatigue = 70;
      const wornPlayed = play(createMatchSession(worn, tactics), autoPlayCommand);
      tired.fresh.push(Boolean(best.state.substituted));
      tired.tired.push(Boolean(wornPlayed.state.substituted));
      tired.freshRating.push(best.state.report!.rating);
      tired.tiredRating.push(wornPlayed.state.report!.rating);
    }
    // The policy spread is measured on a career-like profile: strong in what the position
    // relies on, weaker elsewhere, so choices differ in value.
    const shaped = specialise(setup, selected);
    const bestShaped = play(createMatchSession(shaped, tactics), autoPlayCommand);
    const worst = play(createMatchSession(shaped, tactics), worstCommand);
    // Decision chains (X1a): the best policy's chains in full, and how each policy's ended.
    const random = play(createMatchSession(setup, tactics), randomCommand);
    tallyChains(chainProfile, best, own);
    for (const [name, session] of [
      ['best', best],
      ['random', random],
      ['worst', worst],
      ['bestShaped', bestShaped],
    ] as const) {
      const [good, all] = positives(session);
      chainProfile.positive[name] += good;
      chainProfile.played[name] += all;
    }
    const s = best.state;
    const report = s.report!;
    result.goals += s.stats.goals;
    result.assists += s.stats.assists;
    ratings.push(report.rating);
    result.moments += s.match.keyMoments.length;
    for (const objective of report.objectives) {
      const entry = (result.objectives[objective.kind] ??= { offered: 0, completed: 0 });
      entry.offered++;
      if (objective.progress >= objective.target) entry.completed++;
    }
    if (s.substituted) result.substituted++;
    // Cards in all three matches of the seed (match-16), and goals while a side is a man short.
    for (const session of [best, bestShaped, worst]) {
      const events = session.state.match.events;
      const shown = events.filter((event) => event.kind === 'card');
      cards.yellow += shown.filter((e) => e.card === 'yellow' || e.card === 'second-yellow').length;
      cards.secondYellow += shown.filter((e) => e.card === 'second-yellow').length;
      cards.straightRed += shown.filter((e) => e.card === 'red').length;
      if (session.state.sentOff) cards.playerSentOff++;
      const homeId = session.setup.home.id;
      // Men down per side for each minute 1–90 (a card at minute m counts from m on).
      const down = (side: string, minute: number) =>
        shown.filter((e) => e.card !== 'yellow' && e.teamId === side && e.minute <= minute).length;
      for (let minute = 1; minute <= 90; minute++) {
        const goals = events.filter((e) => e.kind === 'goal' && e.minute === minute);
        for (const side of [homeId, session.setup.away.id]) {
          const other = side === homeId ? session.setup.away.id : homeId;
          const scored = goals.filter((e) => e.teamId === side).length;
          if (down(side, minute) > down(other, minute)) {
            cards.short.minutes++;
            cards.short.for += scored;
            cards.short.against += goals.filter((e) => e.teamId === other).length;
          } else if (!down(side, minute) && !down(other, minute)) {
            cards.level.minutes++;
            cards.level.goals += scored;
          }
        }
      }
    }
    result.fatigueAtEnd += s.stats.fatigue;
    result.xp += report.xp;
    result.fame += report.fameDelta;
    prevented.push(worst.state.match.score[1 - own]! - bestShaped.state.match.score[1 - own]!);
    swing.push(
      bestShaped.state.match.score[own]! -
        bestShaped.state.match.score[1 - own]! -
        (worst.state.match.score[own]! - worst.state.match.score[1 - own]!),
    );
    result.policy.best[0] += bestShaped.state.match.score[own]!;
    result.policy.best[1] += bestShaped.state.match.score[1 - own]!;
    result.policy.worst[0] += worst.state.match.score[own]!;
    result.policy.worst[1] += worst.state.match.score[1 - own]!;
    result.policy.involvement[0] += bestShaped.state.stats.goals + bestShaped.state.stats.assists;
    result.policy.involvement[1] += worst.state.stats.goals + worst.state.stats.assists;
    const seen = new Set<string>();
    for (const event of s.match.events) {
      const outcome = event.outcome;
      if (
        !outcome ||
        seen.has(outcome.input.momentId) ||
        outcome.input.momentId.startsWith('routine:')
      )
        continue;
      seen.add(outcome.input.momentId);
      const moment = s.match.keyMoments.find((entry) => entry.id === outcome.input.momentId);
      const family = moment ? moment.situationId : 'unknown';
      const key = `${family}:${Math.floor(outcome.probability * 5) * 20}`;
      const bucket = (buckets[key] ??= { n: 0, p: 0, s: 0 });
      bucket.n++;
      bucket.p += outcome.probability;
      bucket.s += outcome.success ? 1 : 0;
    }
  }
  const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
  // Four matches a seed: the best policy, the best and worst on the specialised profile, and a
  // random choice at every step (X1a).
  result.cost = {
    matchMs: round((performance.now() - started) / (4 * matches)),
    motionMs: round(motionProbe.ms / (4 * matches)),
    narrationMs: round(motionProbe.narrationMs / (4 * matches)),
  };
  motionProbe.clock = null;
  result.goals = round(result.goals / matches);
  result.assists = round(result.assists / matches);
  result.rating = {
    mean: round(ratings.reduce((sum, value) => sum + value, 0) / matches),
    p10: percentile(ratings, 0.1),
    p90: percentile(ratings, 0.9),
    nineOrMore: round(ratings.filter((value) => value >= 9).length / matches, 3),
    sd: round(standardDeviation(ratings), 3),
    fiveOrLess: round(ratings.filter((value) => value <= 5).length / matches, 3),
  };
  result.moments = round(result.moments / matches, 1);
  result.substituted = round(result.substituted / matches, 3);
  result.fatigueAtEnd = round(result.fatigueAtEnd / matches, 1);
  result.xp = round(result.xp / matches, 0);
  result.fame = round(result.fame / matches, 2);
  const played = 3 * matches;
  result.cards = {
    yellow: round(cards.yellow / played, 3),
    red: round((cards.secondYellow + cards.straightRed) / played, 3),
    secondYellow: round(cards.secondYellow / played, 3),
    straightRed: round(cards.straightRed / played, 3),
    playerSentOff: round(cards.playerSentOff / played, 4),
    short: cards.short,
    level: cards.level,
  };
  result.policy = {
    best: [round(result.policy.best[0] / matches), round(result.policy.best[1] / matches)],
    worst: [round(result.policy.worst[0] / matches), round(result.policy.worst[1] / matches)],
    involvement: [
      round(result.policy.involvement[0] / matches),
      round(result.policy.involvement[1] / matches),
    ],
  };
  const sd = Math.sqrt(
    prevented.reduce((sum, value) => sum + (value - mean(prevented)) ** 2, 0) /
      Math.max(1, prevented.length - 1),
  );
  result.prevented = {
    mean: round(mean(prevented), 3),
    se: round(sd / Math.sqrt(Math.max(1, prevented.length)), 3),
    n: prevented.length,
  };
  const swingSd = Math.sqrt(
    swing.reduce((sum, value) => sum + (value - mean(swing)) ** 2, 0) /
      Math.max(1, swing.length - 1),
  );
  result.swing = {
    mean: round(mean(swing), 3),
    se: round(swingSd / Math.sqrt(Math.max(1, swing.length)), 3),
    n: swing.length,
  };
  result.dominance = Object.fromEntries(
    Object.entries(dominance).map(([situation, entry]) => [
      situation,
      {
        n: entry.n,
        best: Object.fromEntries(
          Object.entries(entry.best).map(([choice, count]) => [choice, round(count, 2)]),
        ),
      },
    ]),
  );
  result.statistics = statistics;
  result.chains = chainProfile;
  result.scenarios = {
    slot: {
      own: round(mean(odds.own), 4),
      outOfPosition: odds.away.length ? round(mean(odds.away), 4) : null,
      n: odds.own.length,
    },
    tired: {
      substitutedFresh: round(mean(tired.fresh.map(Number)), 3),
      substitutedTired: round(mean(tired.tired.map(Number)), 3),
      ratingFresh: round(mean(tired.freshRating)),
      ratingTired: round(mean(tired.tiredRating)),
      n: tired.fresh.length,
    },
  };
  result.calibration = Object.fromEntries(
    Object.entries(buckets).map(([key, value]) => [
      key,
      {
        n: value.n,
        stated: Math.round((100 * value.p) / value.n),
        actual: Math.round((100 * value.s) / value.n),
      },
    ]),
  );
  return result;
}

type Gate = { name: string; check: (profiles: PositionProfile[]) => string | null };
const of = (profiles: PositionProfile[], position: Position) =>
  profiles.find((profile) => profile.position === position);
export const GATES: Gate[] = [
  {
    name: 'a striker scores 0.35–0.55 a match',
    check: (profiles) => {
      const st = of(profiles, 'ST');
      return !st || (st.goals >= 0.35 && st.goals <= 0.55) ? null : `${st.goals}`;
    },
  },
  {
    name: 'a keeper can rate highly (p90 ≥ 7.6) and every position can reach 9',
    check: (profiles) => {
      const gk = of(profiles, 'GK');
      const problems: string[] = profiles
        .filter((p) => p.rating.nineOrMore === 0)
        .map((p) => p.position);
      if (gk && gk.rating.p90 < 7.6) problems.push(`GK p90 ${gk.rating.p90}`);
      return problems.length ? problems.join(', ') : null;
    },
  },
  {
    name: 'objectives complete 10–75% of the time, every kind',
    check: (profiles) => {
      const off = profiles.flatMap((p) =>
        Object.entries(p.objectives)
          .filter(
            ([, v]) =>
              v.offered >= 30 && (v.completed / v.offered < 0.1 || v.completed / v.offered > 0.75),
          )
          .map(
            ([kind, v]) => `${p.position} ${kind} ${Math.round((100 * v.completed) / v.offered)}%`,
          ),
      );
      return off.length ? off.join('; ') : null;
    },
  },
  {
    name: 'outfield substitutions happen in 4–25% of matches',
    check: (profiles) => {
      const off = profiles
        .filter((p) => p.position !== 'GK' && (p.substituted < 0.04 || p.substituted > 0.25))
        .map((p) => `${p.position} ${Math.round(p.substituted * 100)}%`);
      return off.length ? off.join('; ') : null;
    },
  },
  {
    name: 'the best policy involves an attacker in ≥ 18% more goals than the worst',
    check: (profiles) => {
      const off = profiles
        .filter(
          (p) =>
            ['CM', 'AM', 'LW', 'RW', 'ST'].includes(p.position) &&
            p.policy.involvement[0] < 1.18 * p.policy.involvement[1],
        )
        .map(
          (p) => `${p.position} best ${p.policy.involvement[0]} worst ${p.policy.involvement[1]}`,
        );
      return off.length ? off.join('; ') : null;
    },
  },
  {
    name: 'choreography costs at most 10 ms a match',
    check: (profiles) => {
      const off = profiles
        .filter((p) => p.cost && p.cost.motionMs > 10)
        .map((p) => `${p.position} ${p.cost.motionMs} ms`);
      return off.length ? off.join('; ') : null;
    },
  },
  {
    name: 'cards a match: 3.3–4.3 yellows and 0.10–0.20 reds; a career player sent off in ≤ 3%',
    check: (profiles) => {
      const counted = profiles.filter((p) => p.cards);
      if (!counted.length) return 'no card data';
      const total = counted.reduce((sum, p) => sum + p.matches, 0);
      const mean = (pick: (p: PositionProfile) => number) =>
        counted.reduce((sum, p) => sum + pick(p) * p.matches, 0) / total;
      const yellow = mean((p) => p.cards!.yellow),
        red = mean((p) => p.cards!.red);
      const problems: string[] = [];
      if (yellow < 3.3 || yellow > 4.3) problems.push(`yellows ${yellow.toFixed(2)}`);
      if (red < 0.1 || red > 0.2) problems.push(`reds ${red.toFixed(3)}`);
      for (const p of counted)
        if (p.cards!.playerSentOff > 0.03)
          problems.push(`${p.position} sent off ${(p.cards!.playerSentOff * 100).toFixed(1)}%`);
      return problems.length ? problems.join('; ') : null;
    },
  },
  {
    name: 'a side a man short scores less and concedes more than at eleven against eleven',
    check: (profiles) => {
      const sum = (pick: (p: PositionProfile) => number) =>
        profiles.reduce((total, p) => total + (p.cards ? pick(p) : 0), 0);
      const shortMinutes = sum((p) => p.cards!.short.minutes),
        levelMinutes = sum((p) => p.cards!.level.minutes);
      if (shortMinutes < 2000 || !levelMinutes) return `only ${shortMinutes} minutes a man short`;
      const level = sum((p) => p.cards!.level.goals) / levelMinutes;
      const scored = sum((p) => p.cards!.short.for) / shortMinutes / level,
        conceded = sum((p) => p.cards!.short.against) / shortMinutes / level;
      return scored < 0.9 && conceded > 1.1
        ? null
        : `scored ×${scored.toFixed(2)}, conceded ×${conceded.toFixed(2)}`;
    },
  },
  {
    // Review phase 6: decisions matter at the back too, measured in goals prevented: the worst
    // policy concedes more than the best on the same seeds, pooled over the back line, by more
    // than twice its standard error.
    name: 'keepers and defenders prevent goals by deciding well (pooled, beyond 2 standard errors)',
    check: (profiles) => {
      const back = profiles.filter(
        (p) => ['GK', 'CB', 'LB', 'RB', 'DM'].includes(p.position) && p.prevented,
      );
      if (!back.length) return 'no goals-prevented data';
      const n = back.reduce((sum, p) => sum + p.prevented!.n, 0);
      const mean = back.reduce((sum, p) => sum + p.prevented!.mean * p.prevented!.n, 0) / n;
      // Independent positions: the pooled standard error from each one's.
      const se =
        Math.sqrt(back.reduce((sum, p) => sum + (p.prevented!.se * p.prevented!.n) ** 2, 0)) / n;
      return mean > 2 * se
        ? null
        : `prevented ${mean.toFixed(3)} a match, standard error ${se.toFixed(3)} (${back
            .map((p) => `${p.position} ${p.prevented!.mean}±${p.prevented!.se}`)
            .join(', ')})`;
    },
  },
  {
    name: 'late in a match a side behind gets more attacking moments than a side ahead',
    check: (profiles) => {
      const sum = (state: 'behind' | 'ahead', phase: 'attack' | 'defence') =>
        profiles.reduce((total, p) => total + (p.late?.[state][phase] ?? 0), 0);
      const share = (state: 'behind' | 'ahead') =>
        sum(state, 'attack') / Math.max(1, sum(state, 'attack') + sum(state, 'defence'));
      if (!profiles.some((p) => p.late)) return 'no late-moment data';
      return share('behind') > share('ahead')
        ? null
        : `behind ${Math.round(share('behind') * 100)}% attacking, ahead ${Math.round(share('ahead') * 100)}%`;
    },
  },
  {
    name: 'out of position, the choices taken carry an "Out of position" cost',
    check: (profiles) => {
      const off = profiles
        .filter(
          (p) =>
            p.scenarios?.slot.outOfPosition != null &&
            !(p.scenarios.slot.outOfPosition < p.scenarios.slot.own),
        )
        .map(
          (p) =>
            `${p.position} own ${p.scenarios!.slot.own} away ${p.scenarios!.slot.outOfPosition}`,
        );
      return off.length ? off.join('; ') : null;
    },
  },
  {
    name: 'a tired player is substituted more often than a fresh one',
    check: (profiles) => {
      const sum = (pick: (t: NonNullable<PositionProfile['scenarios']>['tired']) => number) =>
        profiles.reduce(
          (total, p) => total + (p.scenarios ? pick(p.scenarios.tired) * p.scenarios.tired.n : 0),
          0,
        );
      const n = profiles.reduce((total, p) => total + (p.scenarios?.tired.n ?? 0), 0);
      if (!n) return 'no scenario data';
      const fresh = sum((t) => t.substitutedFresh) / n;
      const worn = sum((t) => t.substitutedTired) / n;
      return worn > fresh
        ? null
        : `tired ${Math.round(worn * 100)}% fresh ${Math.round(fresh * 100)}%`;
    },
  },
  {
    name: CALIBRATION_GATE,
    check: (profiles) => {
      const off = profiles.flatMap((p) => calibrationProblems(p.calibration, String(p.position)));
      return off.length ? off.join('; ') : null;
    },
  },
];

/**
 * The 1.0 match targets (docs/RELEASE-1.0-PLAN.md step 2.3), over every seed in the run. Phase 5
 * (engine match-22) meets them and sets `asserted: true` on each.
 */
const seedsOf = (profiles: PositionProfile[]) => [
  ...new Set(profiles.map((p) => p.seed ?? 'match-profile')),
];
const bySeed = (profiles: PositionProfile[]) =>
  seedsOf(profiles).map(
    (seed) => [seed, profiles.filter((p) => (p.seed ?? 'match-profile') === seed)] as const,
  );
/** The 1.0 bands, in one place. */
export const TARGET_BANDS = {
  /** Perfect versus worst play, goals a match, for every position. */
  swing: 0.3,
  /** Seeds the swing must hold on. */
  seeds: 2,
  /** The most often one choice may be best in its situation, and the instances to judge it. */
  dominantShare: 0.6,
  dominantMinimum: 30,
  // The redesign's tighter band (mean 6.6–6.9, sd 0.8–1.0) is the tuning goal after the owner
  // plays the chains; until then the 5.3 band stays asserted.
  rating: { mean: [6.5, 6.9], sd: [0.7, 1.0], nineOrMore: 0.03, fiveOrLess: 0.03 },
  /**
   * Decision chains (release 1.0 X1a; docs/EXPERIENCE-REDESIGN-1.0.md 1.1): best minus worst
   * play a chain and a match (every position); the best option's success at a lead-in step and
   * a finishing shot's; chains ending positively with a random choice at every step ("on
   * average"), the best and the worst play; matches with a positive chain; the striker's goals
   * plus assists a match.
   */
  chains: {
    swingPerChain: 0.12,
    swingPerMatch: 0.6,
    lead: [0.6, 0.75],
    shots: [0.3, 0.5],
    positive: { average: [0.5, 0.6], best: 0.65, worst: 0.35 },
    matchesWithPositive: [0.85, 0.9],
    strikerInvolvement: [0.55, 0.75],
  },
  onTargetShare: [0.3, 0.4],
  shotsPerTeam: [11, 14],
  /** Home possession: the 10th percentile at most, the 90th at least. */
  possession: [40, 60],
  /** Goals in added time, as a share of all goals (football data: about 7–9%). */
  addedTimeShare: [0.06, 0.1],
} as const;
export const TARGETS: Target<PositionProfile[]>[] = [
  {
    id: 'choices-matter',
    name: `choices matter: perfect vs worst play ≥ ${TARGET_BANDS.swing} goals a match for every position, on ${TARGET_BANDS.seeds} seeds`,
    phase: 5,
    // Met and asserted in release 1.0 step 5.2 (engine match-22).
    asserted: true,
    evaluate: (profiles) => {
      const seeds = bySeed(profiles).filter(([, list]) => list.every((p) => p.swing));
      if (!seeds.length) return { met: null, value: 'no swing data (rerun the profile)' };
      const parts = seeds.map(
        ([seed, list]) =>
          `${seed}: ${list.map((p) => `${p.position} ${p.swing!.mean.toFixed(2)}±${p.swing!.se.toFixed(2)}`).join(', ')}`,
      );
      const low = seeds.flatMap(([, list]) =>
        list.filter((p) => p.swing!.mean < TARGET_BANDS.swing),
      );
      const enough = seeds.length >= TARGET_BANDS.seeds;
      return {
        met: low.length ? false : enough ? true : null,
        value: `${parts.join(' | ')}${enough ? '' : ` (${seeds.length} of ${TARGET_BANDS.seeds} seeds)`}`,
      };
    },
  },
  {
    id: 'no-dominant-choice',
    name: `no dominant choice: none best in more than ${TARGET_BANDS.dominantShare * 100}% of its situation's instances (situations with ≥ ${TARGET_BANDS.dominantMinimum})`,
    phase: 5,
    // Met and asserted in release 1.0 step 5.2 (engine match-22).
    asserted: true,
    evaluate: (profiles) => {
      if (!profiles.some((p) => p.dominance)) return { met: null, value: 'no dominance data' };
      const offenders: string[] = [];
      let judged = 0;
      for (const [seed, list] of bySeed(profiles)) {
        const pooled: Record<string, { n: number; best: Record<string, number> }> = {};
        for (const profile of list)
          for (const [situation, entry] of Object.entries(profile.dominance ?? {})) {
            const target = (pooled[situation] ??= { n: 0, best: {} });
            target.n += entry.n;
            for (const [choice, count] of Object.entries(entry.best))
              target.best[choice] = (target.best[choice] ?? 0) + count;
          }
        for (const [situation, entry] of Object.entries(pooled)) {
          if (entry.n < TARGET_BANDS.dominantMinimum) continue;
          judged++;
          const [choice, count] = Object.entries(entry.best).sort((a, b) => b[1] - a[1])[0]!;
          const share = count / entry.n;
          if (share > TARGET_BANDS.dominantShare)
            offenders.push(
              `${seed} ${situation}/${choice} ${Math.round(share * 100)}% of ${entry.n}`,
            );
        }
      }
      return {
        met: offenders.length === 0,
        value: offenders.length
          ? `${offenders.length} of ${judged} situations: ${offenders.join('; ')}`
          : `${judged} situations judged, none dominated`,
      };
    },
  },
  {
    id: 'ratings',
    name: 'ratings: per-position mean 6.5–6.9, standard deviation 0.7–1.0, ≤ 3% at 9.0+ and ≤ 3% at 5.0 or less',
    phase: 5,
    // Met by step 5.3 (engine match-22) on both seeds.
    asserted: true,
    evaluate: (profiles) => {
      const measured = profiles.filter((p) => p.rating.sd !== undefined);
      if (!measured.length) return { met: null, value: 'no rating spread data' };
      const band = TARGET_BANDS.rating;
      const off = measured.filter(
        (p) =>
          !within(p.rating.mean, band.mean[0], band.mean[1]) ||
          !within(p.rating.sd!, band.sd[0], band.sd[1]) ||
          p.rating.nineOrMore > band.nineOrMore ||
          p.rating.fiveOrLess! > band.fiveOrLess,
      );
      const line = (p: PositionProfile) =>
        `${p.position} ${p.rating.mean.toFixed(2)} sd ${p.rating.sd!.toFixed(2)} 9+ ${(p.rating.nineOrMore * 100).toFixed(1)}% ≤5 ${(p.rating.fiveOrLess! * 100).toFixed(1)}%`;
      return {
        met: off.length === 0,
        value: bySeed(measured)
          .map(([seed, list]) => `${seed}: ${list.map(line).join(', ')}`)
          .join(' | '),
      };
    },
  },
  {
    id: 'match-statistics',
    name: 'match statistics: shots on target 30–40%; 11–14 shots a team; possession p10–p90 at least 40–60%',
    phase: 5,
    // Met by step 5.3 (engine match-22) on both seeds.
    asserted: true,
    evaluate: (profiles) => {
      const measured = profiles.filter((p) => p.statistics);
      if (!measured.length) return { met: null, value: 'no statistics data' };
      const parts: string[] = [];
      let met = true;
      for (const [seed, list] of bySeed(measured)) {
        const sum = (pick: (s: NonNullable<PositionProfile['statistics']>) => number) =>
          list.reduce((total, p) => total + pick(p.statistics!), 0);
        const matches = sum((s) => s.matches);
        const onTarget =
          sum((s) => s.onTarget) /
          Math.max(
            1,
            sum((s) => s.shots),
          );
        const shots = sum((s) => s.shots) / Math.max(1, 2 * matches);
        const possession = list.flatMap((p) => p.statistics!.possession);
        const p10 = quantile(possession, 0.1);
        const p90 = quantile(possession, 0.9);
        const woodwork = sum((s) => s.woodwork ?? 0) / Math.max(1, matches);
        const ok =
          within(onTarget, TARGET_BANDS.onTargetShare[0], TARGET_BANDS.onTargetShare[1]) &&
          within(shots, TARGET_BANDS.shotsPerTeam[0], TARGET_BANDS.shotsPerTeam[1]) &&
          p10 <= TARGET_BANDS.possession[0] &&
          p90 >= TARGET_BANDS.possession[1];
        met &&= ok;
        parts.push(
          `${seed}: on target ${(onTarget * 100).toFixed(1)}%, ${shots.toFixed(1)} shots a team, possession p10–p90 ${p10}–${p90}%, ${woodwork.toFixed(2)} off the woodwork a match, ${matches} matches`,
        );
      }
      return { met, value: parts.join(' | ') };
    },
  },
  {
    // Release 1.0 step 5.4 (review M12): stoppage time is played, and goals come in it.
    id: 'added-time-goals',
    name: `some goals in added time: ${TARGET_BANDS.addedTimeShare[0] * 100}–${TARGET_BANDS.addedTimeShare[1] * 100}% of all goals`,
    phase: 5,
    asserted: true,
    evaluate: (profiles) => {
      const measured = profiles.filter((p) => p.statistics);
      if (!measured.length) return { met: null, value: 'no statistics data' };
      const parts: string[] = [];
      let met = true;
      for (const [seed, list] of bySeed(measured)) {
        const added = list.reduce((total, p) => total + p.statistics!.addedTimeGoals, 0);
        const goals = list.reduce((total, p) => total + p.statistics!.goals, 0);
        const share = added / Math.max(1, goals);
        met &&= within(share, TARGET_BANDS.addedTimeShare[0], TARGET_BANDS.addedTimeShare[1]);
        parts.push(`${seed}: ${added} of ${goals} goals (${(share * 100).toFixed(1)}%)`);
      }
      return { met, value: parts.join(' | ') };
    },
  },
];

/** A ratio of two counts pooled over a seed's positions. */
const pooledShare = (list: PositionProfile[], pick: (c: ChainProfile) => [number, number]) => {
  let a = 0,
    b = 0;
  for (const p of list) {
    if (!p.chains) continue;
    const [x, y] = pick(p.chains);
    a += x;
    b += y;
  }
  return b ? a / b : Number.NaN;
};
const percent = (value: number) => `${(value * 100).toFixed(0)}%`;
/**
 * Decision chains (release 1.0 X1a). Reported: each becomes an asserted gate once a full run on
 * both seeds meets it (docs/MATCH-BALANCING.md "Decision chains" has the latest figures).
 */
export const CHAIN_TARGETS: Target<PositionProfile[]>[] = [
  {
    id: 'chain-swing',
    name: `chains decide: best minus worst ≥ ${TARGET_BANDS.chains.swingPerChain} goals a chain and ≥ ${TARGET_BANDS.chains.swingPerMatch} a match, every position`,
    phase: 5,
    asserted: false,
    evaluate: (profiles) => {
      const measured = profiles.filter((p) => p.swing && p.chains?.chains);
      if (!measured.length) return { met: null, value: 'no chain data' };
      const B = TARGET_BANDS.chains;
      const per = (p: PositionProfile) => p.swing!.mean / (p.chains!.chains / p.chains!.matches);
      const off = measured.filter(
        (p) => per(p) < B.swingPerChain || p.swing!.mean < B.swingPerMatch,
      );
      return {
        met: off.length === 0,
        value: bySeed(measured)
          .map(
            ([seed, list]) =>
              `${seed}: ${list.map((p) => `${p.position} ${per(p).toFixed(3)}/${p.swing!.mean.toFixed(2)}`).join(', ')}`,
          )
          .join(' | '),
      };
    },
  },
  {
    id: 'chain-steps',
    name: `chain steps: the best option at a lead-in succeeds ${TARGET_BANDS.chains.lead.join('–')}, a finishing shot ${TARGET_BANDS.chains.shots.join('–')} (pooled a seed)`,
    phase: 5,
    asserted: false,
    evaluate: (profiles) => {
      if (!profiles.some((p) => p.chains)) return { met: null, value: 'no chain data' };
      const B = TARGET_BANDS.chains;
      let met = true;
      const parts = bySeed(profiles).map(([seed, list]) => {
        const lead = pooledShare(list, (c) => [c.lead.success, c.lead.n]);
        const shots = pooledShare(list, (c) => [c.shots.goals, c.shots.n]);
        met &&= within(lead, B.lead[0], B.lead[1]) && within(shots, B.shots[0], B.shots[1]);
        return `${seed}: lead ${percent(lead)}, shots ${percent(shots)}`;
      });
      return { met, value: parts.join(' | ') };
    },
  },
  {
    id: 'chain-positive',
    name: `chains end positively ${TARGET_BANDS.chains.positive.average.join('–')} with a random choice, ≥ ${TARGET_BANDS.chains.positive.best} with the best, ≤ ${TARGET_BANDS.chains.positive.worst} with the worst; ${TARGET_BANDS.chains.matchesWithPositive.join('–')} of matches have one (pooled a seed)`,
    phase: 5,
    asserted: false,
    evaluate: (profiles) => {
      if (!profiles.some((p) => p.chains)) return { met: null, value: 'no chain data' };
      const B = TARGET_BANDS.chains;
      let met = true;
      const parts = bySeed(profiles).map(([seed, list]) => {
        const random = pooledShare(list, (c) => [c.positive.random, c.played.random]);
        const best = pooledShare(list, (c) => [c.positive.best, c.played.best]);
        const worst = pooledShare(list, (c) => [c.positive.worst, c.played.worst]);
        const matches = pooledShare(list, (c) => [c.matchesWithPositive, c.matches]);
        met &&=
          within(random, B.positive.average[0], B.positive.average[1]) &&
          best >= B.positive.best &&
          worst <= B.positive.worst &&
          within(matches, B.matchesWithPositive[0], B.matchesWithPositive[1]);
        return `${seed}: random ${percent(random)}, best ${percent(best)}, worst ${percent(worst)}, matches ${percent(matches)}`;
      });
      return { met, value: parts.join(' | ') };
    },
  },
  {
    id: 'striker-involvement',
    name: `a striker's goals plus assists ${TARGET_BANDS.chains.strikerInvolvement.join('–')} a match`,
    phase: 5,
    asserted: false,
    evaluate: (profiles) => {
      const strikers = profiles.filter((p) => p.position === 'ST');
      if (!strikers.length) return { met: null, value: 'no striker profile' };
      const [low, high] = TARGET_BANDS.chains.strikerInvolvement;
      return {
        met: strikers.every((p) => within(p.goals + p.assists, low, high)),
        value: strikers.map((p) => `${p.seed}: ${(p.goals + p.assists).toFixed(2)}`).join(' | '),
      };
    },
  },
];

/** Every seed's profiles are checked on their own (review phase 6: several seeds). */
function check(): void {
  const all = JSON.parse(readFileSync(OUT, 'utf8')) as PositionProfile[];
  const seeds = [...new Set(all.map((p) => p.seed ?? 'match-profile'))];
  let failed = 0;
  for (const seed of seeds) {
    const profiles = all.filter((p) => (p.seed ?? 'match-profile') === seed);
    console.log(`seed ${seed} (${profiles.length} positions)`);
    for (const gate of GATES) {
      const problem = gate.check(profiles);
      console.log(`${problem ? 'FAIL' : 'ok  '} ${gate.name}${problem ? ` — ${problem}` : ''}`);
      if (problem) failed++;
    }
  }
  // The 1.0 targets: reported until their phase asserts them.
  failed += printTargets(evaluateTargets([...TARGETS, ...CHAIN_TARGETS], all, assertAllTargets()));
  if (failed) process.exitCode = 1;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/match-profile.ts')) {
  if (process.argv.includes('--check')) check();
  else {
    const matches = Number(argument('matches') ?? 300);
    const positions = (argument('positions')?.split(',') as Position[] | undefined) ?? POSITIONS;
    const seeds = argument('seeds')?.split(',') ?? ['match-profile'];
    const profiles = seeds.flatMap((seed) =>
      positions.map((position) => {
        const profile = profilePosition(position, matches, seed);
        console.log(
          `${position}: ${profile.goals} g ${profile.assists} a · rating ${profile.rating.mean} (p10 ${profile.rating.p10}, p90 ${profile.rating.p90}, 9+ ${profile.rating.nineOrMore}) · ${profile.moments} moments · subs ${profile.substituted} · fatigue ${profile.fatigueAtEnd} · xp ${profile.xp} fame ${profile.fame} · best ${profile.policy.best.join('-')} worst ${profile.policy.worst.join('-')} involvement ${profile.policy.involvement.join('/')} · ${profile.cost.matchMs} ms a match (motion ${profile.cost.motionMs}, narration ${profile.cost.narrationMs ?? 0}) · objectives ${JSON.stringify(profile.objectives)} · cards ${JSON.stringify(profile.cards)}`,
        );
        return profile;
      }),
    );
    mkdirSync('artifacts/profile', { recursive: true });
    writeFileSync(OUT, JSON.stringify(profiles, null, 2));
    console.log(`Profile: ${OUT}`);
  }
}
