/**
 * The manager's development promise (Phase 6): one story arc a season around the accepted
 * season goal. The manager proposes a quantified six-week milestone towards it; the player
 * accepts or declines; progress updates each week from finalized records; the outcome follows
 * what actually happened. A move, a new manager or a long injury cancels it without penalty.
 *
 * States: offered → active → achieved | missed, or cancelled from offered or active. The id is
 * stable per season, and every effect (message, trust, Chronicle) is applied once, on its
 * transition, so reprocessing a week or reloading a save never repeats it.
 */
import type { ManagerPromise, PromiseEnd, SeasonGoalKind, World } from '../../../model/domain';
import { CONFIG } from '../../config';
import type { AnyAttribute } from '../../ageing';
import { getSeasonWeeks } from '../../world/calendar';
import { attributeValue } from '../progression';
import { developmentAttribute } from '../coaching';
import { adjustRelationship, postMessage } from '../market/records';
import { today } from '../market/rules';
import { chronicle } from '../honours/chronicle';

const P = CONFIG.career.promise;

export const promiseId = (season: number) => `promise:${season}`;
/** This season's promise, in any state. */
export function currentPromise(world: World): ManagerPromise | null {
  const promises = world.career?.social.promises ?? [];
  return promises.find((entry) => entry.season === world.date.season) ?? null;
}

/** The running measure a milestone counts: matches, completed passes, tackles or the attribute. */
export function promiseMeasure(
  world: World,
  kind: SeasonGoalKind,
  attribute: string | null,
): number {
  const career = world.career!;
  const season = career.matches.filter((match) => match.season === world.date.season);
  switch (kind) {
    case 'appearances':
      return season.filter((match) => match.minutes > 0).length;
    case 'passing':
      return season.reduce((sum, match) => sum + (match.passes?.[0] ?? 0), 0);
    case 'defending':
      return season.reduce((sum, match) => sum + (match.tackles ?? 0), 0);
    case 'attribute':
      return attributeValue(world.players[career.playerId]!, attribute as AnyAttribute);
  }
}

/** The club's fixtures in the weeks a milestone accepted next week would run. */
function fixturesAhead(world: World, clubId: string, from: number, to: number): number {
  return Object.values(world.fixtures).filter(
    (fixture) =>
      fixture.date.season === world.date.season &&
      fixture.date.week >= from &&
      fixture.date.week <= to &&
      (fixture.homeId === clubId || fixture.awayId === clubId),
  ).length;
}

/**
 * The milestone the manager would propose now, or null: it needs an accepted season goal,
 * a fit player at a club and room for the whole window before the season ends. Match-based
 * goals become a training milestone when too few fixtures fall in the window.
 */
export function proposal(
  world: World,
): Pick<ManagerPromise, 'kind' | 'target' | 'attribute'> | null {
  const career = world.career;
  if (!career || world.phase === 'complete' || career.injury) return null;
  const goal = career.coaching?.goal;
  if (!goal || goal.season !== world.date.season) return null;
  const player = world.players[career.playerId]!;
  if (!player.clubId) return null;
  // Answered next week, the milestone runs that week and the five after it.
  const start = world.date.week + 1;
  const end = start + P.weeks - 1;
  if (end > getSeasonWeeks(world)) return null;
  const fixtures = fixturesAhead(world, player.clubId, start, end);
  if (goal.kind === 'attribute' || fixtures < P.minimumFixtures) {
    const attribute = goal.attribute ?? developmentAttribute(world);
    return attribute ? { kind: 'attribute', target: P.targets.attribute, attribute } : null;
  }
  const target =
    goal.kind === 'appearances'
      ? Math.max(1, Math.min(fixtures, Math.ceil(fixtures * P.targets.appearanceShare)))
      : goal.kind === 'passing'
        ? P.targets.passes
        : P.targets.tackles;
  return { kind: goal.kind, target, attribute: null };
}

function finish(
  world: World,
  promise: ManagerPromise,
  status: 'achieved' | 'missed' | 'cancelled',
  end: PromiseEnd | null,
): void {
  if (promise.status !== 'offered' && promise.status !== 'active') return;
  const wasActive = promise.status === 'active';
  promise.status = status;
  promise.end = end;
  promise.resolved = today(world);
  const manager = world.managers[promise.managerId]?.name ?? '';
  if (status === 'cancelled') {
    // Only an accepted milestone needs a word when it is called off.
    if (wasActive && end !== 'retirement')
      postMessage(world, 'promise-cancelled', { manager, reason: end ?? '' }, promise.id);
    return;
  }
  adjustRelationship(world, 'manager', promise.managerId, P.trust[status]);
  postMessage(
    world,
    status === 'achieved' ? 'promise-achieved' : 'promise-missed',
    { manager, progress: promise.progress, target: promise.target },
    promise.id,
  );
  // One Chronicle conclusion per promise, whatever the history of the save.
  if (
    !world.chronicle.some(
      (entry) => entry.kind === 'promise' && entry.params.promise === promise.id,
    )
  )
    chronicle(
      world,
      'promise',
      {
        promise: promise.id,
        outcome: status,
        manager,
        kind: promise.kind,
        target: promise.target,
        attribute: promise.attribute ?? '',
      },
      { clubId: promise.clubId },
    );
}

/**
 * The weekly step, after the week's matches and training: cancel what has become unfair,
 * update progress, conclude a milestone that is met or out of time, and make an offer when
 * the season has room for one. Safe to run more than once in a week.
 */
export function promiseWeek(world: World): void {
  const career = world.career;
  if (!career) return;
  const promise = currentPromise(world);
  const player = world.players[career.playerId]!;
  const week = world.date.week;
  if (promise && (promise.status === 'offered' || promise.status === 'active')) {
    const club = player.clubId ? world.clubs[player.clubId] : undefined;
    const weeksLeft = promise.deadline === null ? P.weeks : promise.deadline - week;
    const unfair: PromiseEnd | null =
      player.clubId !== promise.clubId
        ? 'transfer'
        : club?.managerId !== promise.managerId
          ? 'manager'
          : career.injury && career.injury.weeksRemaining >= weeksLeft
            ? 'injury'
            : null;
    if (unfair) finish(world, promise, 'cancelled', unfair);
    else if (promise.status === 'offered') {
      if (week >= promise.respondBy) finish(world, promise, 'cancelled', 'expired');
    } else {
      promise.progress = Math.max(
        0,
        promiseMeasure(world, promise.kind, promise.attribute) - promise.baseline,
      );
      if (promise.progress >= promise.target) finish(world, promise, 'achieved', null);
      else if (week >= promise.deadline!) finish(world, promise, 'missed', null);
    }
    return;
  }
  if (promise) return;
  const offer = proposal(world);
  if (!offer) return;
  const club = world.clubs[player.clubId!]!;
  const entry: ManagerPromise = {
    id: promiseId(world.date.season),
    version: 1,
    season: world.date.season,
    clubId: club.id,
    managerId: club.managerId,
    status: 'offered',
    ...offer,
    baseline: 0,
    offered: today(world),
    // It arrives with next week; the answer is due by the end of the week after.
    respondBy: week + P.respondWeeks,
    started: null,
    deadline: null,
    progress: 0,
    resolved: null,
    end: null,
  };
  const promises = (career.social.promises ??= []);
  promises.push(entry);
  if (promises.length > P.historyLimit) promises.splice(0, promises.length - P.historyLimit);
  postMessage(
    world,
    'promise-offer',
    { manager: world.managers[club.managerId]?.name ?? '', target: entry.target },
    entry.id,
  );
}

/** Accept the manager's offer: the milestone starts this week. Returns a new world. */
export function acceptPromise(input: World): World {
  const world = draft(input);
  const promise = currentPromise(world);
  if (!promise || promise.status !== 'offered') throw new Error('No promise to accept');
  promise.status = 'active';
  promise.started = today(world);
  promise.deadline = Math.min(world.date.week + P.weeks - 1, getSeasonWeeks(world));
  promise.baseline = promiseMeasure(world, promise.kind, promise.attribute);
  promise.progress = 0;
  return world;
}
/** Decline the offer, without penalty. Returns a new world. */
export function declinePromise(input: World): World {
  const world = draft(input);
  const promise = currentPromise(world);
  if (!promise || promise.status !== 'offered') throw new Error('No promise to decline');
  finish(world, promise, 'cancelled', 'declined');
  return world;
}
/** At the new season, anything still open from the last one closes quietly. */
export function promiseRollover(world: World): void {
  for (const promise of world.career?.social.promises ?? [])
    if (
      promise.season < world.date.season &&
      (promise.status === 'offered' || promise.status === 'active')
    ) {
      promise.status = 'cancelled';
      promise.end = 'season';
      promise.resolved = today(world);
    }
}

/** A copy of the world with its career, inbox, relationships and Chronicle detached. */
function draft(input: World): World {
  return {
    ...input,
    career: structuredClone(input.career!),
    inbox: [...input.inbox],
    relationships: input.relationships.map((entry) => ({ ...entry })),
    chronicle: [...input.chronicle],
  };
}
