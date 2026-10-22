import type { CareerFact, FactKind, World } from '../../model/domain';
import { CONFIG } from '../config';

/**
 * Lasting story facts (review phase 5, step 5.2): what the football world remembers about the
 * player (a challenge kept or missed, public criticism, a declaration of loyalty, a youngster
 * mentored, a hard comeback, a transfer request, the captaincy) and what it changes: how far
 * a manager will trust them, how willingly a club renews, the captaincy claim, and later, a
 * mentee returning as a manager. Pure apart from `addFact`.
 */
const F = CONFIG.career.facts;
const GRIEVANCES: ReadonlySet<FactKind> = new Set([
  'promise-broken',
  'public-criticism',
  'transfer-request',
]);

/** Remember a fact, once per kind and subject in a season; the oldest go past the limit. */
export function addFact(
  world: World,
  kind: FactKind,
  subject: { clubId?: string; managerId?: string; playerId?: string } = {},
): void {
  const career = world.career;
  if (!career) return;
  const facts = (career.facts ??= []);
  const season = world.date.season;
  const same = facts.some(
    (fact) =>
      fact.kind === kind &&
      fact.season === season &&
      fact.clubId === subject.clubId &&
      fact.managerId === subject.managerId &&
      fact.playerId === subject.playerId,
  );
  if (same) return;
  const fact: CareerFact = { kind, season, week: world.date.week, ...subject };
  for (const key of ['clubId', 'managerId', 'playerId'] as const)
    if (fact[key] === undefined) delete fact[key];
  facts.push(fact);
  if (facts.length > F.limit) facts.splice(0, facts.length - F.limit);
}

/** The facts a manager holds against the player. */
export const grievancesOf = (world: World, managerId: string): CareerFact[] =>
  (world.career?.facts ?? []).filter(
    (fact) => fact.managerId === managerId && GRIEVANCES.has(fact.kind),
  );

/** The most a manager can trust the player: lower for each grievance they hold. */
export function trustCeiling(world: World, managerId: string): number {
  return Math.max(F.trustFloor, 100 - grievancesOf(world, managerId).length * F.grievance);
}

/** How willingly a club offers a new contract: more after loyalty, less after a request. */
export function renewalWillingness(world: World, clubId: string): number {
  const facts = (world.career?.facts ?? []).filter((fact) => fact.clubId === clubId);
  const loyal = facts.some((fact) => fact.kind === 'declared-loyalty');
  const requested = facts.some(
    (fact) =>
      fact.kind === 'transfer-request' && world.date.season - fact.season < F.requestSeasons,
  );
  return (loyal ? F.loyalty : 1) * (requested ? F.request : 1);
}

/** Points the career's history adds to (or takes from) a captaincy claim at a club. */
export function captaincyStanding(world: World, clubId: string, managerId: string): number {
  return (world.career?.facts ?? [])
    .filter(
      (fact) =>
        fact.clubId === clubId ||
        fact.managerId === managerId ||
        (fact.kind === 'mentored' && !fact.clubId),
    )
    .reduce((sum, fact) => sum + (F.captaincy[fact.kind] ?? 0), 0);
}

/** Whether a story kind is resting: told within its cooldown of seasons. */
export function storyResting(world: World, kind: string): boolean {
  const cooldown = F.cooldown[kind] ?? 1;
  return (world.career?.stories ?? []).some(
    (story) => story.kind === kind && world.date.season - story.started.season < cooldown,
  );
}
