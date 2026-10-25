/**
 * The selected player's rating as it builds up (rating parts), and the report at full time:
 * rating breakdown, XP, fame, maps, objectives, headline and reactions.
 */
import type { MatchReport, ProbabilityFactor } from '../../model/domain';
import type { MatchSession, RatingPart } from './types';
import { MATCH_CONFIG as C } from './tuning';
import { performanceFame, performanceXp } from './rewards';
import { reportCopy } from './headlines';
import { OFF_ANIMATION } from './parked';
import { clamp, round6 } from './decisions';
import { offPitch, rolePosition, selectedSide } from './shared';

const F = C.cards;
export const RATING_PARTS: RatingPart[] = [
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

export function addRating(session: MatchSession, part: RatingPart, delta: number): void {
  const s = session.state;
  s.ratingParts = { ...s.ratingParts, [part]: round6((s.ratingParts[part] ?? 0) + delta) };
  const total = RATING_PARTS.reduce<number>(
    (sum, key) => sum + (s.ratingParts[key] ?? 0),
    C.rating.base,
  );
  s.stats.rating = round6(clamp(total, C.rating.minimum, C.rating.maximum));
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
};
function report(session: MatchSession): MatchReport {
  const s = session.state,
    m = s.match,
    id = session.setup.selectedPlayerId;
  // The team's result and, for the back line, a clean sheet count toward the rating.
  const own = selectedSide(session.setup);
  const margin = m.score[own]! - m.score[1 - own]!;
  const back = ['GK', 'CB', 'LB', 'RB'].includes(rolePosition(session.setup));
  addRating(
    session,
    'team',
    (margin > 0 ? C.rating.result : margin < 0 ? -C.rating.result : 0) +
      (back && m.score[1 - own] === 0 && !offPitch(s) ? C.rating.cleanSheet : 0),
  );
  const rating = Math.round(clamp(s.stats.rating, C.rating.minimum, C.rating.maximum) * 10) / 10;
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
  // Every contribution is listed; the final factor absorbs the 3–10 bound and the rounding.
  const ratingFactors: ProbabilityFactor[] = [
    { labelKey: 'match.rating.base', source: 'attribute', contribution: C.rating.base },
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
  return {
    playerId: id,
    rating,
    ratingFactors,
    xp: performanceXp({
      minutes: s.selectedPlayerMinutes,
      rating,
      goals: s.stats.goals,
      assists: s.stats.assists,
      objectives: objectives.filter((o) => o.progress >= o.target).length,
    }),
    // A dismissal costs fame (match-16).
    fameDelta:
      performanceFame(
        rating,
        s.stats.goals,
        s.stats.assists,
        backLine && cleanSheet && !s.sentOff,
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
  };
}
