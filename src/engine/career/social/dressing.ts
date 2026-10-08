import type { Clique, CliqueKind, Player, World } from '../../../model/domain';
import { playerAbility } from '../../strength';
import { clubStarters } from '../../selection/world';
import { adjustRelationship, relationship } from '../market/records';
import { lineOf } from '../market/rules';
import {
  careerClub,
  careerPlayer,
  careerRoom,
  cliqueKindOf,
  CLIQUE_KINDS,
  compatibility,
  hasInternationals,
  S,
} from './rules';

const C = S.cliques;
const clampPercent = (value: number) => Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The career club's cliques, regrouped from the current squad: seniors, young players,
 * internationals (when there are enough of them) and the core. A group keeps the player's
 * standing with it (affinity) across squad changes; its influence follows its size and
 * the leadership of its natural leader.
 */
export function syncCliques(world: World): void {
  const club = careerClub(world);
  const room = careerRoom(world);
  const player = careerPlayer(world);
  const internationals = hasInternationals(world, club);
  const members = new Map<CliqueKind, Player[]>();
  for (const id of club.playerIds) {
    const member = world.players[id]!;
    const kind = cliqueKindOf(world, club, member, internationals);
    members.set(kind, [...(members.get(kind) ?? []), member]);
  }
  const own = cliqueKindOf(world, club, player, internationals);
  const previous = new Map(room.cliques.map((clique) => [clique.kind, clique]));
  room.cliques = CLIQUE_KINDS.flatMap((kind): Clique[] => {
    const group = (members.get(kind) ?? []).sort(byId);
    if (group.length < 2) return [];
    const leader = [...group].sort(
      (a, b) => b.attributes.leadership - a.attributes.leadership || byId(a, b),
    )[0]!;
    return [
      {
        id: `clique:${club.id}:${kind}`,
        kind,
        playerIds: group.map((member) => member.id),
        leaderId: leader.id,
        affinity: previous.get(kind)?.affinity ?? (kind === own ? C.ownAffinity : C.otherAffinity),
        influence: Math.round(
          Math.min(
            100,
            (group.length / club.playerIds.length) * 60 + leader.attributes.leadership * 0.4,
          ),
        ),
      },
    ];
  });
}

export function adjustCliques(
  world: World,
  deltas: Partial<Record<CliqueKind, number>> | number,
): void {
  for (const clique of careerRoom(world).cliques) {
    const delta = typeof deltas === 'number' ? deltas : (deltas[clique.kind] ?? 0);
    clique.affinity = clampPercent(clique.affinity + delta);
  }
}
export function adjustMood(world: World, delta: number): void {
  const room = careerRoom(world);
  room.mood = clampPercent(room.mood + delta);
}
/** The player's standing in the dressing room: clique affinity weighted by influence. */
export function dressingStanding(world: World): number {
  const cliques = careerRoom(world).cliques.filter(
    (clique) => !clique.playerIds.every((id) => id === world.career!.playerId),
  );
  const weight = cliques.reduce((sum, clique) => sum + clique.influence, 0);
  if (!weight) return 50;
  return Math.round(
    cliques.reduce((sum, clique) => sum + clique.affinity * clique.influence, 0) / weight,
  );
}

/**
 * The teammates who matter most to the player: the dressing-room leaders, their own
 * clique's leader, and the best players in their line.
 */
export function keyTeammates(world: World): Player[] {
  const club = careerClub(world);
  const player = careerPlayer(world);
  const room = careerRoom(world);
  const picked: string[] = [];
  const add = (id: string | null | undefined) => {
    if (id && id !== player.id && club.playerIds.includes(id) && !picked.includes(id))
      picked.push(id);
  };
  room.leaderIds.forEach(add);
  add(room.cliques.find((clique) => clique.playerIds.includes(player.id))?.leaderId);
  const line = lineOf(player.primaryPosition);
  club.playerIds
    .map((id) => world.players[id]!)
    .filter((p) => p.id !== player.id && lineOf(p.primaryPosition) === line)
    .sort((a, b) => playerAbility(b) - playerAbility(a) || byId(a, b))
    .forEach((p) => add(p.id));
  return picked.slice(0, S.teammates.count).map((id) => world.players[id]!);
}

/**
 * Relationships with the current key teammates exist, starting from their compatibility.
 * Former teammates beyond the kept number are forgotten, oldest first.
 */
export function ensureTeammates(world: World): void {
  const club = careerClub(world);
  const player = careerPlayer(world);
  for (const teammate of keyTeammates(world))
    relationship(
      world,
      'teammate',
      teammate.id,
      compatibility(world, player, teammate, club).value,
    );
  const former = world.relationships.filter(
    (r) => r.kind === 'teammate' && !club.playerIds.includes(r.targetId),
  );
  const excess = former.length - S.teammates.keepFormer;
  if (excess > 0) {
    const drop = new Set(former.slice(0, excess).map((r) => r.id));
    world.relationships = world.relationships.filter((r) => !drop.has(r.id));
  }
}

/** The career club's last results, newest last. */
export function recentResults(
  world: World,
  clubId: string,
  count: number,
): ('win' | 'draw' | 'loss')[] {
  return Object.values(world.fixtures)
    .filter((f) => (f.homeId === clubId || f.awayId === clubId) && world.results[f.id])
    .sort((a, b) => a.date.week - b.date.week || a.date.day - b.date.day || byId(a, b))
    .slice(-count)
    .map((fixture) => {
      const winner = world.results[fixture.id]!.winnerId;
      return winner === clubId ? 'win' : winner === null ? 'draw' : 'loss';
    });
}

/**
 * The dressing room's week: mood follows recent results and the player's standing; clique
 * regard drifts toward the mood; chemistry with key teammates grows while they share the
 * club, faster when they played together, and is pulled by their clique's regard.
 */
export function dressingWeek(world: World, playedThisWeek: boolean): void {
  syncCliques(world);
  ensureTeammates(world);
  const club = careerClub(world);
  const room = careerRoom(world);
  const player = careerPlayer(world);
  const results = recentResults(world, club.id, S.mood.recentResults);
  const score = results.reduce((sum, r) => sum + (r === 'win' ? 1 : r === 'loss' ? -1 : 0), 0);
  room.mood = clampPercent(
    room.mood * S.mood.retention +
      (50 + score * S.mood.perResult + (dressingStanding(world) - 50) * S.mood.affinity) *
        (1 - S.mood.retention),
  );
  for (const clique of room.cliques) {
    const target = 50 + (room.mood - 50) * C.moodPull;
    clique.affinity = clampPercent(clique.affinity + (target - clique.affinity) * C.drift);
  }
  const T = S.teammates;
  const internationals = hasInternationals(world, club);
  // Teammates the background XI would field alongside the player this week.
  const starters = new Set(playedThisWeek ? clubStarters(world, club).map((p) => p.id) : []);
  for (const teammate of keyTeammates(world)) {
    const entry = relationship(world, 'teammate', teammate.id);
    const baseline = compatibility(world, player, teammate, club).value;
    const clique = room.cliques.find(
      (c) => c.kind === cliqueKindOf(world, club, teammate, internationals),
    );
    const delta =
      T.weekly +
      (starters.has(teammate.id) ? T.playedTogether : 0) +
      (baseline - entry.value) * T.pull +
      ((clique?.affinity ?? 50) - 50) * T.cliqueInfluence;
    adjustRelationship(world, 'teammate', teammate.id, delta);
  }
  // Seniors who rate the player put in a word with the manager.
  const seniors = room.cliques.find((clique) => clique.kind === 'seniors');
  if (seniors && seniors.affinity > 65)
    adjustRelationship(world, 'manager', club.managerId, C.trustFromSeniors);
  else if (seniors && seniors.affinity < 35)
    adjustRelationship(world, 'manager', club.managerId, -C.trustFromSeniors);
}

/** Average chemistry with the current key teammates. */
export function chemistry(world: World): number {
  const club = careerClub(world);
  const values = world.relationships.filter(
    (r) => r.kind === 'teammate' && club.playerIds.includes(r.targetId),
  );
  if (!values.length) return S.teammates.base;
  return Math.round(values.reduce((sum, r) => sum + r.value, 0) / values.length);
}
