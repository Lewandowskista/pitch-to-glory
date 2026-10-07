import type { CareerHonours, CareerMatchRecord, World } from '../../../model/domain';
import type { MatchSession } from '../../match/types';
import { playerAbility } from '../../strength';
import { postMessage } from '../market/records';
import { chronicle } from './chronicle';
import { captureMoments } from './moments';
import { createInternational, internationalWindow, playTournament } from './international';
import { monthlyAward, recordCareerTrophies, seasonAwards, startAwardSeason } from './awards';
import { retireCareer, retirementAge } from './retirement';
import { CONFIG } from '../../config';

export { recordCareerTrophies, startAwardSeason };

const H = CONFIG.career.honours;

export function initialHonours(
  peakAbility: number,
  parentLegacyId: string | null = null,
): CareerHonours {
  return {
    caps: { U19: 0, U21: 0, senior: 0 },
    internationalGoals: { U19: 0, U21: 0, senior: 0 },
    lastCallUp: null,
    peakAbility: Math.round(peakAbility),
    parentLegacyId,
  };
}

/** The honours records a career needs: international football and award baselines. */
export function attachHonours(world: World): void {
  const career = world.career!;
  career.honours ??= initialHonours(playerAbility(world.players[career.playerId]!));
  world.international ??= createInternational(world);
  if (world.awardState?.season !== world.date.season) startAwardSeason(world);
}

/** Landmarks of a committed match: debut, first goal, hat-trick, milestones and moments. */
export function honoursMatch(
  world: World,
  session: MatchSession,
  record: CareerMatchRecord,
  importance: number,
): void {
  const career = world.career;
  if (!career?.honours) return;
  const player = world.players[career.playerId]!;
  const opponent = world.clubs[record.opponentId]?.name ?? '';
  const momentIds = captureMoments(world, session, importance);
  const momentId = momentIds[0] ?? null;
  if (player.stats.appearances === 1) chronicle(world, 'debut', { opponent }, { momentId });
  if (record.goals > 0 && player.stats.goals === record.goals)
    chronicle(world, 'first-goal', { opponent }, { momentId });
  else if (record.goals >= 3)
    chronicle(world, 'hat-trick', { opponent, goals: record.goals }, { momentId });
  else if (momentId) {
    const moment = world.moments.find((entry) => entry.id === momentId)!;
    chronicle(
      world,
      'moment',
      { opponent, kind: moment.kind, minute: moment.minute },
      { momentId },
    );
  }
  for (const milestone of [50, 100, 200, 300, 500])
    if (player.stats.goals >= milestone && player.stats.goals - record.goals < milestone)
      chronicle(world, 'goal-milestone', { goals: milestone });
  for (const milestone of [100, 250, 500, 750])
    if (player.stats.appearances === milestone)
      chronicle(world, 'apps-milestone', { appearances: milestone });
}

/** The honours week, after the lifestyle week: international windows and monthly awards. */
export function honoursWeek(world: World): void {
  const career = world.career!;
  career.honours.peakAbility = Math.max(
    career.honours.peakAbility,
    Math.round(playerAbility(world.players[career.playerId]!)),
  );
  internationalWindow(world);
  monthlyAward(world);
}

/** The season's final week, once its tables are archived. */
export function honoursSeasonEnd(world: World): void {
  seasonAwards(world);
  if (retirementAge(world) + 1 >= H.retirement.forcedAge) postMessage(world, 'retirement-due', {});
}

/**
 * Season change: a summer tournament in even years, new award baselines, and retirement
 * once the player reaches the forced age. Returns true when the career ended.
 */
export function honoursRollover(world: World): boolean {
  playTournament(world);
  if (retirementAge(world) >= H.retirement.forcedAge) {
    retireCareer(world);
    return true;
  }
  return false;
}
