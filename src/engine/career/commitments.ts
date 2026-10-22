import type { CommitmentKind, World } from '../../model/domain';
import { CONFIG } from '../config';
import { addXp } from './progression';
import { adjustRelationship } from './market/records';
import { pay } from './market/moves';
import { adjustCliques, adjustMood } from './social/dressing';

/**
 * Weekly commitments outside training (review phase 4, step 4.4): up to three things the
 * player gives their spare time to, kept every week like the training plan, so a routine week
 * stays one click. Each has an effect and most a little fatigue, so they compete with rest.
 */
const C = CONFIG.career.commitments;
export const COMMITMENTS: readonly CommitmentKind[] = [
  'mentoring',
  'sponsor',
  'community',
  'team-social',
  'family',
  'rest',
];
const clamp = (value: number) => Math.max(0, Math.min(100, value));

/** Why a commitment cannot be kept now, or null when it can. */
export function commitmentBlocked(
  world: World,
  kind: CommitmentKind,
): 'age' | 'no-youngster' | 'no-sponsor' | null {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  if (kind === 'mentoring') {
    if (world.date.season - player.birthSeason < C.mentoring.minimumAge) return 'age';
    const club = player.clubId ? world.clubs[player.clubId] : undefined;
    const youngster = club?.playerIds.some(
      (id) => id !== player.id && world.date.season - world.players[id]!.birthSeason < 21,
    );
    return youngster ? null : 'no-youngster';
  }
  if (kind === 'sponsor')
    return world.sponsorships.some((deal) => deal.status === 'active') ? null : 'no-sponsor';
  return null;
}

/** Sponsor appearances made so far, for appearance obligations. */
export const sponsorAppearances = (world: World): number =>
  world.career!.commitments?.totals.sponsor ?? 0;

/** Keep this week's commitments: their effects, and the record of them. */
export function commitmentsWeek(world: World): CommitmentKind[] {
  const career = world.career!;
  const plan = career.training.commitments ?? [];
  if (!plan.length) return [];
  const player = world.players[career.playerId]!;
  const club = player.clubId ? world.clubs[player.clubId] : undefined;
  const kept: CommitmentKind[] = [];
  for (const kind of plan) {
    if (commitmentBlocked(world, kind)) continue;
    switch (kind) {
      case 'mentoring':
        addXp(career, C.mentoring.xp);
        adjustCliques(world, { young: C.mentoring.young });
        player.fatigue += C.mentoring.fatigue;
        break;
      case 'sponsor': {
        career.fame += C.sponsor.fame;
        const fees = world.sponsorships
          .filter((deal) => deal.status === 'active')
          .reduce((sum, deal) => sum + deal.weeklyFee, 0);
        pay(world, Math.round(fees * C.sponsor.feeShare), false);
        player.fatigue += C.sponsor.fatigue;
        break;
      }
      case 'community':
        if (club) adjustRelationship(world, 'fans', club.id, C.community.fans);
        career.fame += C.community.fame;
        player.fatigue += C.community.fatigue;
        break;
      case 'team-social':
        adjustCliques(world, C['team-social'].cliques);
        adjustMood(world, C['team-social'].mood);
        player.morale = clamp(player.morale + C['team-social'].morale);
        player.fatigue += C['team-social'].fatigue;
        break;
      case 'family':
        player.morale = clamp(player.morale + C.family.morale);
        break;
      case 'rest':
        player.fatigue += C.rest.fatigue;
        break;
    }
    kept.push(kind);
  }
  player.fatigue = Math.round(clamp(player.fatigue) * 10) / 10;
  const record = (career.commitments ??= { totals: {}, last: null });
  for (const kind of kept) record.totals[kind] = (record.totals[kind] ?? 0) + 1;
  record.last = { season: world.date.season, week: world.date.week, kept };
  return kept;
}

/**
 * A sensible week for a player who would rather not plan it (delegation): rest when tired,
 * family when low, sponsor appearances owed, then the dressing room, the fans and a
 * youngster, up to the slots.
 */
export function suggestCommitments(world: World): CommitmentKind[] {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const owed = world.sponsorships.some(
    (deal) => deal.status === 'active' && deal.obligations.some((o) => o.kind === 'appearances'),
  );
  const order: CommitmentKind[] = [
    ...(player.fatigue > 50 ? (['rest'] as const) : []),
    ...(player.morale < 55 ? (['family'] as const) : []),
    ...(owed ? (['sponsor'] as const) : []),
    'team-social',
    'community',
    'mentoring',
    'family',
  ];
  return [...new Set(order)].filter((kind) => !commitmentBlocked(world, kind)).slice(0, C.slots);
}
