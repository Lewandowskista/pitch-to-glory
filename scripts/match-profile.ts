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
 *
 * Not modelled: a player starting on the bench. The match engine's selected player always
 * starts; benching is a career matter, gated by the career profile's playing time.
 *
 * Writes artifacts/profile/matches.json.
 */
import { CALIBRATION_GATE, calibrationProblems } from './calibration';
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
import { SITUATION_BY_ID } from '../src/engine/match/situations';
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
  rating: { mean: number; p10: number; p90: number; nineOrMore: number };
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
    // Late moments by the score at the time (review phase 6).
    for (const moment of best.state.match.keyMoments) {
      if (moment.minute < 75) continue;
      const goals = best.state.match.events.filter(
        (event) => event.kind === 'goal' && event.minute < moment.minute,
      );
      const mine = goals.filter((event) => event.teamId === club.id).length;
      const theirs = goals.length - mine;
      const state = mine < theirs ? 'behind' : mine > theirs ? 'ahead' : 'level';
      const phase = SITUATION_BY_ID[moment.situationId]?.phase;
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
  // Three matches a seed: the best policy, and the best and worst on the specialised profile.
  result.cost = {
    matchMs: round((performance.now() - started) / (3 * matches)),
    motionMs: round(motionProbe.ms / (3 * matches)),
    narrationMs: round(motionProbe.narrationMs / (3 * matches)),
  };
  motionProbe.clock = null;
  result.goals = round(result.goals / matches);
  result.assists = round(result.assists / matches);
  result.rating = {
    mean: round(ratings.reduce((sum, value) => sum + value, 0) / matches),
    p10: percentile(ratings, 0.1),
    p90: percentile(ratings, 0.9),
    nineOrMore: round(ratings.filter((value) => value >= 9).length / matches, 3),
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
