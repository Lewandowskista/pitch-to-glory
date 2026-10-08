import type { Player, TrainingFocus } from '../model/domain';
import { CONFIG } from '../engine/config';
import { ARCHETYPE_BY_ID, SKILL_BY_ID } from '../engine/career/catalogue';
import { trainableAttributes, xpToNext } from '../engine/career/progression';
import { validFocus } from '../engine/career/training';
import {
  array,
  date,
  id,
  ids,
  number,
  object,
  options,
  ref,
  requireValue,
  text,
} from './worldValidation';

/**
 * Validates `World.career` against the world it belongs to. Values that the engine derives
 * (level from XP, traits from skills, the injury link) must agree, so an imported save cannot
 * claim progress it never earned.
 */
/**
 * The least XP a level can have needed: every step costs at least the cheaper of the current
 * curve and the one before schema 17, whichever curve a career climbed it on.
 */
function cheapestXpForLevel(level: number): number {
  const { base, growth } = CONFIG.career.legacyLevelCurve;
  let total = 0;
  for (let current = 1; current < level; current++)
    total += Math.min(Math.round(base * growth ** (current - 1)), xpToNext(current));
  return total;
}
export function validateCareer(w: Record<string, unknown>): void {
  if (w.career === undefined) return;
  const career = object(w.career);
  const players = object(w.players);
  const current = object(w.date);
  requireValue(career.version === 1);
  ref(career.playerId, players);
  const player = players[String(career.playerId)] as unknown as Player;
  requireValue(!player.retired && player.clubId !== null);
  requireValue(Boolean(ARCHETYPE_BY_ID[String(career.archetype)]));
  number(career.startSeason, 1800, Number(current.season), true);
  number(career.xp, 0, 1e9, true);
  number(career.level, 1, CONFIG.career.maximumLevel, true);
  // The level began at `levelXp`: no earlier than the cheapest curve ever shipped allows,
  // and it has not yet earned the next one.
  number(career.levelXp, cheapestXpForLevel(Number(career.level)), Number(career.xp), true);
  requireValue(
    career.level === CONFIG.career.maximumLevel ||
      Number(career.xp) - Number(career.levelXp) < xpToNext(Number(career.level)),
  );
  const earned =
    (Number(career.level) - 1) *
    Math.max(CONFIG.career.attributePointsPerLevel, CONFIG.career.legacyAttributePointsPerLevel);
  number(career.attributePoints, 0, earned, true);
  number(
    career.skillPoints,
    0,
    (Number(career.level) - 1) * CONFIG.career.skillPointsPerLevel,
    true,
  );
  const skills = ids(career.skills, 80);
  for (const skill of skills) {
    const entry = SKILL_BY_ID[skill];
    requireValue(entry && entry.prerequisites.every((p) => skills.includes(p)));
  }
  requireValue(
    player.traits.length === skills.length && skills.every((s) => player.traits.includes(s)),
  );
  const training = object(career.training);
  const sessions = array(training.sessions, CONFIG.career.training.sessions);
  requireValue(sessions.length === CONFIG.career.training.sessions);
  for (const value of sessions) {
    const session = object(value);
    requireValue(validFocus(player, session.focus as TrainingFocus));
    options(session.intensity, ['low', 'normal', 'high']);
    requireValue(Object.keys(session).length === 2);
  }
  if (training.extra !== null) {
    const extra = object(training.extra);
    requireValue(validFocus(player, extra.focus as TrainingFocus) && extra.focus !== 'recovery');
    ref(extra.mentorId, players);
    requireValue(extra.mentorId !== career.playerId);
  }
  const trainable = trainableAttributes(player) as string[];
  for (const [key, value] of Object.entries(object(career.trainingProgress))) {
    requireValue(trainable.includes(key));
    number(value, 0, 0.999999);
  }
  if (career.lastTraining !== null) {
    const report = object(career.lastTraining);
    number(report.season, 1800, Number(current.season), true);
    number(report.week, 1, 80, true);
    number(report.fatigue, -100, 100);
    for (const value of Object.values(object(report.gains))) number(value, 0, 10);
    array(report.improved, 30).forEach((key) => requireValue(trainable.includes(String(key))));
    array(report.declined, 30).forEach((key) => requireValue(trainable.includes(String(key))));
  }
  if (career.injury === null) requireValue(player.injuryId === null);
  else {
    const injury = object(career.injury);
    id(injury.id);
    requireValue(player.injuryId === injury.id && injury.playerId === career.playerId);
    requireValue(CONFIG.career.injuries.types.some((t) => t.kind === injury.kind));
    date(injury.started);
    number(injury.weeksRemaining, 0, 60, true);
    number(injury.severity, 1, 5, true);
    number(injury.reinjuryRisk, 0, 1);
    requireValue(injury.recovery === null || ['rehab', 'rush'].includes(String(injury.recovery)));
    requireValue(typeof injury.careerThreatening === 'boolean');
    options(injury.cause, ['training', 'match']);
  }
  if (career.reinjury !== null) {
    const reinjury = object(career.reinjury);
    number(reinjury.risk, 0, 1);
    number(reinjury.weeks, 0, 60, true);
    text(reinjury.kind);
  }
  number(career.fame, -1e6, 1e9);
  for (const value of array(career.matches, CONFIG.career.historyLimit)) {
    const match = object(value);
    id(match.fixtureId);
    id(match.competitionId);
    id(match.opponentId);
    number(match.season, 1800, Number(current.season), true);
    number(match.week, 1, 80, true);
    requireValue(typeof match.home === 'boolean' && typeof match.auto === 'boolean');
    requireValue(typeof match.cleanSheet === 'boolean');
    const score = array(match.score, 2);
    requireValue(score.length === 2);
    score.forEach((goals) => number(goals, 0, 40, true));
    options(match.result, ['win', 'draw', 'loss']);
    if (match.decided !== undefined) options(match.decided, ['extra-time', 'penalties']);
    number(match.minutes, 0, 120, true);
    number(match.rating, 0, 10);
    number(match.goals, 0, 40, true);
    number(match.assists, 0, 40, true);
    number(match.xp, 0, 1e6, true);
    if (match.passes !== undefined) {
      const passes = array(match.passes, 2);
      requireValue(passes.length === 2);
      passes.forEach((count) => number(count, 0, 500, true));
      requireValue(Number(passes[0]) <= Number(passes[1]));
    }
    if (match.tackles !== undefined) number(match.tackles, 0, 200, true);
  }
  if (career.coaching !== undefined) validateCoaching(career.coaching, current);
}

/** Coaching (Phase 5.2): recent decisions, the accepted season goal and past results. */
function validateCoaching(value: unknown, current: Record<string, unknown>): void {
  const coaching = object(value);
  const K = CONFIG.career.coaching;
  requireValue(coaching.version === 1);
  const families = ['shooting', 'passing', 'dribbling', 'defending', 'goalkeeping'];
  for (const entry of array(coaching.recent, K.recentLimit)) {
    const sample = object(entry);
    number(sample.season, 1800, Number(current.season), true);
    number(sample.week, 1, 80, true);
    options(sample.family, families);
    requireValue(typeof sample.success === 'boolean');
    number(sample.probability, 0, 1);
    for (const key of array(sample.attributes, 3)) text(key, 40);
  }
  const kinds = ['appearances', 'passing', 'defending', 'attribute'];
  if (coaching.goal !== null) {
    const goal = object(coaching.goal);
    requireValue(goal.version === 1);
    number(goal.season, 1800, Number(current.season), true);
    options(goal.kind, kinds);
    number(goal.target, 1, 1000, true);
    requireValue(
      goal.kind === 'attribute' ? typeof goal.attribute === 'string' : goal.attribute === null,
    );
    number(goal.baseline, 0, 99, true);
    date(goal.accepted);
  }
  if (coaching.declinedSeason !== null)
    number(coaching.declinedSeason, 1800, Number(current.season), true);
  for (const entry of array(coaching.history, K.historyLimit)) {
    const result = object(entry);
    number(result.season, 1800, Number(current.season), true);
    options(result.kind, kinds);
    number(result.target, 1, 1000, true);
    requireValue(result.attribute === null || typeof result.attribute === 'string');
    number(result.achieved, 0, 1e4, true);
    requireValue(typeof result.completed === 'boolean');
  }
}
