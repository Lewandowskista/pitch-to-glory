/**
 * The selected player's rating as it builds up (rating parts), and the report at full time:
 * rating breakdown, XP, fame, maps, objectives, headline and reactions.
 */
import type { MatchReport, ProbabilityFactor } from '../../model/domain';
import { rules22, type MatchSession, type RatingPart } from './types';
import { MATCH_CONFIG as C } from './tuning';
import { performanceFame, performanceXp, rewardScale } from './rewards';
import { reportCopy } from './headlines';
import { OFF_ANIMATION } from './parked';
import { clamp, round6 } from './decisions';
import { offPitch, rolePosition, selectedSide } from './shared';
import type { RatingFamily } from './situations';

const F = C.cards;
const R = C.rating22;
/** The parts every session starts with; `par` is added by engine match-22 at its first moment. */
export const INITIAL_RATING_PARTS: RatingPart[] = [
  'shooting',
  'passing',
  'dribbling',
  'defending',
  'goalkeeping',
  'goals',
  'assists',
  'saves',
  'errors',
  'team',
  'discipline',
];
export const RATING_PARTS: RatingPart[] = [...INITIAL_RATING_PARTS, 'par'];

export function addRating(session: MatchSession, part: RatingPart, delta: number): void {
  const s = session.state;
  s.ratingParts = { ...s.ratingParts, [part]: round6((s.ratingParts[part] ?? 0) + delta) };
  const latest = rules22(session.setup);
  const total = RATING_PARTS.reduce<number>(
    (sum, key) => sum + (s.ratingParts[key] ?? 0),
    latest ? R.base : C.rating.base,
  );
  s.stats.rating = latest
    ? round6(softLimit(total))
    : round6(clamp(total, C.rating.minimum, C.rating.maximum));
}
/**
 * The match-22 rating from the sum of its parts: its distance from the base leaned (less below,
 * more above), then unchanged between the knees, moving at `beyond` of the rate past them (low
 * and high), and bounded.
 */
function softLimit(sum: number): number {
  const [low, high] = R.knees;
  const total = R.base + (sum - R.base) * (sum < R.base ? R.lean[0] : R.lean[1]);
  const limited =
    total > high
      ? high + (total - high) * R.beyond[1]
      : total < low
        ? low - (low - total) * R.beyond[0]
        : total;
  return clamp(limited, R.minimum, R.maximum);
}
/**
 * How much each key moment's credit counts (match-22): √(reference moments ÷ the match's
 * planned moments), so a busy match is not a wider one.
 */
function momentScale(session: MatchSession): number {
  // Decision chains (X1a): measured against the planned steps, chains × their mean length.
  if (rules22(session.setup))
    return squareRoot(
      R.chainSteps / Math.max(R.fewest, session.state.momentMinutes.length * C.chains.meanSteps),
    );
  return squareRoot(R.moments / Math.max(R.fewest, session.state.momentMinutes.length));
}
/**
 * A square root from + and ÷ alone (Newton's method from a fixed start), rounded, so replayed
 * state never depends on how an engine computes `Math.sqrt`. For the ratios above (about 0.3
 * to 2) twelve steps are exact to the rounding.
 */
function squareRoot(value: number): number {
  let root = 1;
  for (let step = 0; step < 12; step++) root = (root + value / root) / 2;
  return round6(root);
}
/** `repeat` to the power of the goals and assists already made (multiplied out, for replay). */
function repeated(count: number): number {
  let factor = 1;
  for (let index = 0; index < count; index++) factor = round6(factor * R.repeat);
  return factor;
}
/** Below this live rating a manager may take the player off (`tacticalSubstitution`). */
export const poorRating = (session: MatchSession): number =>
  rules22(session.setup) ? R.substituteBelow : C.tacticalSubstitution.ratingBelow;
/** Rating credit for the player's goal (match-22: a hat-trick's third adds `hatTrick`). */
export const goalCredit = (session: MatchSession): number =>
  rules22(session.setup)
    ? round6(
        (R.goal * repeated(involvement(session) - 1) +
          (session.state.stats.goals === 3 ? R.hatTrick : 0)) *
          momentScale(session),
      )
    : C.rating.goal;
/** Rating credit for an assist from the player's moment. */
export const assistCredit = (session: MatchSession): number =>
  rules22(session.setup)
    ? round6(R.assist * momentScale(session) * repeated(involvement(session) - 1))
    : C.rating.assist;
/** Goals and assists so far: each further one is worth `repeat` of the one before (match-22). */
const involvement = (session: MatchSession): number =>
  session.state.stats.goals + session.state.stats.assists;
/** Rating credit (negative) for a goal conceded from the player's moment. */
export const errorCredit = (session: MatchSession): number =>
  rules22(session.setup) ? round6(R.error * momentScale(session)) : C.rating.error;
/**
 * Rating credit for a save or defensive stop: in proportion to the danger it removed, divided
 * by the reference player's odds (match-13), so its expected value is the same for every
 * defensive choice and a better player's stops are worth their quality.
 */
export const stopCredit = (session: MatchSession, danger: number, reference: number): number =>
  rules22(session.setup)
    ? round6(stopValue(danger, reference) * momentScale(session))
    : (C.rating.stop * danger) / reference;
/** Match-22's stop credit before the moment scale: its odds floored, the credit capped. */
const stopValue = (danger: number, reference: number): number =>
  Math.min((R.stop * danger) / Math.max(reference, R.stopFloor), R.stopCap);
/**
 * What the reference player would make of a key moment on average (match-22): own goals,
 * assists, the danger a defending or keeping choice removes, and goals conceded.
 */
export interface MomentPar {
  /** The player's goals and assists before the moment. */
  scored: number;
  assisted: number;
  goals: number;
  assists: number;
  danger: number;
  conceded: number;
}
/**
 * The decision's credit. Match-21: harder successes earn more, safe failures cost more, measured
 * against the reference player's odds: weight × (success − reference). Match-22 does the same
 * with its own weight, and subtracts the moment's par, so every moment's credit averages zero
 * for the reference player and the rating centres in every position.
 */
export function creditDecision(
  session: MatchSession,
  family: RatingFamily,
  /** A success, or (match-22, a chain's lead-in) a share of one. */
  success: boolean | number,
  reference: number,
  par: MomentPar,
): void {
  if (!rules22(session.setup)) {
    const weight = C.rating.decisionWeight;
    addRating(session, family, success ? weight * (1 - reference) : -weight * reference);
    return;
  }
  const scale = momentScale(session);
  const credited = typeof success === 'number' ? success : success ? 1 : 0;
  addRating(session, family, round6(R.decision[family] * (credited - reference) * scale));
  // A stop is credited on success, so its par is the reference odds × its credit. A hat-trick's
  // bonus is left out: rare enough not to move the centre, and a striker on two goals is not
  // marked down for every chance that might have made it three.
  const repeat = repeated(par.scored + par.assisted);
  const expected =
    (R.goal * par.goals + R.assist * par.assists) * repeat +
    reference * stopValue(par.danger, reference) +
    R.error * par.conceded;
  addRating(session, 'par', round6(-expected * scale));
}
export function finish(session: MatchSession): void {
  const s = session.state;
  s.match.status = 'finished';
  s.report = report(session);
  s.match.reports = [s.report];
}
const RATING_LABELS: Record<RatingPart, string> = {
  shooting: 'match.rating.shooting',
  passing: 'match.rating.passing',
  dribbling: 'match.rating.dribbling',
  defending: 'match.rating.defending',
  goalkeeping: 'match.rating.goalkeeping',
  goals: 'match.rating.goals',
  assists: 'match.rating.assists',
  saves: 'match.rating.saves',
  errors: 'match.rating.errors',
  team: 'match.rating.team',
  discipline: 'match.rating.discipline',
  par: 'match.rating.par',
};
function report(session: MatchSession): MatchReport {
  const s = session.state,
    m = s.match,
    id = session.setup.selectedPlayerId;
  // The team's result and, for the back line, a clean sheet count toward the rating.
  const own = selectedSide(session.setup);
  const margin = m.score[own]! - m.score[1 - own]!;
  const T = rules22(session.setup) ? R : C.rating;
  // Match-22 counts a defensive midfielder's clean sheet too.
  const back = (
    rules22(session.setup) ? ['GK', 'CB', 'LB', 'RB', 'DM'] : ['GK', 'CB', 'LB', 'RB']
  ).includes(rolePosition(session.setup));
  addRating(
    session,
    'team',
    (margin > 0 ? T.result : margin < 0 ? -T.result : 0) +
      (back && m.score[1 - own] === 0 && !offPitch(s) ? T.cleanSheet : 0),
  );
  const rating = Math.round(clamp(s.stats.rating, T.minimum, T.maximum) * 10) / 10;
  const playerEvents = m.events.filter((e) => e.playerId === id);
  const passes = playerEvents
    .filter((e) => e.kind === 'pass')
    .map((e) => ({
      from: e.point,
      to: { ...(e.endPoint ?? e.point) },
      success: e.outcome?.success ?? true,
    }));
  const shots = playerEvents
    .filter((e) => e.kind === 'shot')
    .map((e) => ({
      from: e.point,
      to: { ...(e.endPoint ?? e.point) },
      goal: m.events.some((g) => g.kind === 'goal' && g.minute === e.minute && g.playerId === id),
    }));
  const ownSide = selectedSide(session.setup);
  const cleanSheet = m.score[1 - ownSide] === 0;
  const objectives = m.objectives.map((o) => ({
    ...o,
    progress:
      o.kind === 'rating'
        ? rating
        : o.kind === 'passing'
          ? s.stats.passesAttempted
            ? (s.stats.passesCompleted / s.stats.passesAttempted) * 100
            : 0
          : o.kind === 'clean-sheet'
            ? cleanSheet
              ? 1
              : 0
            : o.kind === 'goals'
              ? s.stats.goals
              : o.kind === 'assists'
                ? s.stats.assists
                : o.kind === 'tackles'
                  ? s.stats.tackles
                  : o.kind === 'saves'
                    ? s.stats.saves
                    : s.stats.shots,
  }));
  m.objectives = objectives;
  const backLine = ['GK', 'CB', 'LB', 'RB'].includes(rolePosition(session.setup));
  // The story of the match decides the headline; the result and the rating the reactions.
  const copy = reportCopy(session, rating);
  s.headlineKey = copy.headlineKey;
  s.headlineParams = copy.headlineParams;
  s.managerReactionKey = copy.managerReactionKey;
  s.fanReactionKey = copy.fanReactionKey;
  // Every contribution is listed; the final factor absorbs the bounds (match-22: the soft limit
  // beyond the knees) and the rounding.
  const ratingFactors: ProbabilityFactor[] = [
    { labelKey: 'match.rating.base', source: 'attribute', contribution: T.base },
    ...RATING_PARTS.filter((part) => (s.ratingParts[part] ?? 0) !== 0).map((part) => ({
      labelKey: RATING_LABELS[part],
      source: 'attribute' as const,
      contribution: s.ratingParts[part] ?? 0,
    })),
  ];
  const limit = round6(
    rating - ratingFactors.reduce((sum, f) => sum + f.contribution, 0 as number),
  );
  if (limit !== 0)
    ratingFactors.push({
      labelKey: 'match.rating.limit',
      source: 'attribute',
      contribution: limit,
    });
  // Match-22: a player who started on the bench and never came on earns nothing from it.
  const unused = s.bench !== undefined && s.bench.on === undefined;
  return {
    playerId: id,
    rating,
    ratingFactors,
    xp: unused
      ? 0
      : performanceXp(
          {
            minutes: s.selectedPlayerMinutes,
            rating,
            goals: s.stats.goals,
            assists: s.stats.assists,
            objectives: objectives.filter((o) => o.progress >= o.target).length,
          },
          rewardScale(session),
        ),
    // A dismissal costs fame (match-16).
    fameDelta: unused
      ? 0
      : performanceFame(
          rating,
          s.stats.goals,
          s.stats.assists,
          backLine && cleanSheet && !s.sentOff,
          rewardScale(session),
        ) - (s.sentOff ? F.fame : 0),
    heatmap: s.frames.flatMap((f) => {
      const p = f.players.find((p) => p.id === id);
      return p && p.animation !== OFF_ANIMATION ? [p.point] : [];
    }),
    passes,
    shots,
    objectives,
    headlineId: s.headlineKey,
    ...(s.headlineParams ? { headlineParams: s.headlineParams } : {}),
    cards: {
      yellow: m.events.filter(
        (e) =>
          e.kind === 'card' &&
          e.playerId === id &&
          (e.card === 'yellow' || e.card === 'second-yellow'),
      ).length,
      ...(s.sentOff ? { sentOff: { ...s.sentOff } } : {}),
    },
    ...(s.bench ? { bench: { cameOn: s.bench.on ?? null } } : {}),
  };
}
