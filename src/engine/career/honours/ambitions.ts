import type { Ambition, AmbitionId, Club, Position, World } from '../../../model/domain';
import { CONFIG } from '../../config';
import { addXp } from '../progression';
import { postMessage } from '../market/records';
import { today } from '../market/rules';
import { chronicle } from './chronicle';
import { liveHallOfFame } from './retirement';

/**
 * Career ambitions (docs/GAME-DESIGN-REVIEW follow-up): up to three long-term goals the player
 * chooses, shown on the hub with their progress. Reaching one pays fame and XP, writes the
 * Chronicle and posts to the inbox. They can be changed once a season; achieved ones stay.
 */
const A = CONFIG.career.honours.ambitions;
export const AMBITION_IDS: readonly AmbitionId[] = [
  'goals',
  'assists',
  'clean-sheets',
  'appearances',
  'caps',
  'league-title',
  'champions-cup',
  'golden-ball',
  'one-club',
  'dream-club',
  'hall-of-fame',
];
const ATTACK: Position[] = ['ST', 'LW', 'RW', 'AM', 'CM'];
const CREATE: Position[] = ['CM', 'AM', 'LW', 'RW', 'LB', 'RB'];
const DEFEND: Position[] = ['GK', 'CB', 'LB', 'RB', 'DM'];

/** The ambitions that suit a position: scoring for forwards, clean sheets for the back line. */
export function ambitionsFor(position: Position): AmbitionId[] {
  return AMBITION_IDS.filter(
    (id) =>
      (id !== 'goals' || ATTACK.includes(position)) &&
      (id !== 'assists' || CREATE.includes(position)) &&
      (id !== 'clean-sheets' || DEFEND.includes(position)),
  );
}
/** The dream clubs on offer: the world's most famous, the player's own club excluded. */
export function dreamClubs(world: World): Club[] {
  const own = world.career ? world.players[world.career.playerId]?.clubId : null;
  return Object.values(world.clubs)
    .filter((club) => club.id !== own)
    .sort((a, b) => b.reputation - a.reputation || (a.id < b.id ? -1 : 1))
    .slice(0, A.dreamClubs);
}

function competitionTier(world: World, id: string): number | null {
  const league = world.leagues[id];
  if (league) return league.tier;
  const phase = world.pyramid?.phases[id];
  const source = phase?.sourceLeagueIds[0];
  return source ? (world.leagues[source]?.tier ?? null) : null;
}
/** The season the player joined their current club (their first season when they never left). */
function joinedSeason(world: World): number {
  const career = world.career!;
  const clubId = world.players[career.playerId]!.clubId;
  const move = [...career.market.moves]
    .reverse()
    .find((entry) => entry.toClubId === clubId && entry.kind !== 'renewal');
  return move?.date.season ?? career.startSeason;
}

export interface AmbitionProgress {
  /** Progress towards the target; for the Hall of Fame, the current rank. */
  value: number;
  target: number;
  /** Whether the target is met now (an achieved ambition stays achieved). */
  met: boolean;
  /** Fraction complete, 0–1, for a meter. */
  share: number;
}
/** How far the career is towards an ambition, from the world as it stands. */
export function ambitionProgress(
  world: World,
  ambition: Pick<Ambition, 'id' | 'clubId'>,
  hallOfFameRank?: () => number,
): AmbitionProgress {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const count = (value: number, target: number): AmbitionProgress => ({
    value,
    target,
    met: value >= target,
    share: Math.min(1, value / target),
  });
  const trophies = world.trophies.filter((trophy) => trophy.playerIds.includes(player.id));
  switch (ambition.id) {
    case 'goals':
      return count(player.stats.goals, A.targets.goals);
    case 'assists':
      return count(player.stats.assists, A.targets.assists);
    case 'clean-sheets':
      return count(player.stats.cleanSheets, A.targets['clean-sheets']);
    case 'appearances':
      return count(player.stats.appearances, A.targets.appearances);
    case 'caps':
      return count(career.honours.caps.senior, A.targets.caps);
    case 'league-title':
      return count(
        trophies.filter((trophy) => competitionTier(world, trophy.competitionId) === 1).length,
        1,
      );
    case 'champions-cup':
      return count(
        trophies.filter((trophy) => world.competitions[trophy.competitionId]?.kind === 'champions')
          .length,
        1,
      );
    case 'golden-ball':
      return count(
        world.awards.filter(
          (award) => award.kind === 'golden-ball' && award.winnerIds[0] === player.id,
        ).length,
        1,
      );
    case 'one-club': {
      const seasons =
        world.date.season - joinedSeason(world) + (world.phase === 'complete' ? 1 : 0);
      return count(Math.max(0, seasons), A.targets['one-club']);
    }
    case 'dream-club':
      return count(player.clubId && player.clubId === ambition.clubId ? 1 : 0, 1);
    case 'hall-of-fame': {
      const rank = hallOfFameRank ? hallOfFameRank() : liveHallOfFame(world).rank;
      const target = A.targets['hall-of-fame'];
      return { value: rank, target, met: rank <= target, share: Math.min(1, target / rank) };
    }
  }
}

/** Whether the ambitions can be changed now: once a season. */
export function canChangeAmbitions(world: World): boolean {
  const ambitions = world.career?.ambitions;
  return !ambitions || ambitions.changedSeason !== world.date.season;
}

/**
 * Set the career's ambitions. Achieved ones are kept whatever is chosen; the rest are replaced.
 * Returns a new world.
 */
export function setAmbitions(
  input: World,
  choice: { ids: AmbitionId[]; dreamClubId?: string | null },
): World {
  const career = input.career;
  if (!career) throw new Error('No career');
  if (!canChangeAmbitions(input)) throw new Error('Ambitions were already changed this season');
  const player = input.players[career.playerId]!;
  const allowed = ambitionsFor(player.primaryPosition);
  const ids = [...new Set(choice.ids)];
  if (ids.some((id) => !allowed.includes(id))) throw new Error('Unknown ambition');
  const kept = (career.ambitions?.list ?? []).filter((ambition) => ambition.achieved);
  const fresh = ids.filter((id) => !kept.some((ambition) => ambition.id === id));
  if (fresh.length + kept.filter((a) => a.achieved?.season === input.date.season).length < 1)
    throw new Error('Choose at least one ambition');
  const open = fresh.slice(0, A.count);
  if (open.includes('dream-club')) {
    const club = choice.dreamClubId ? input.clubs[choice.dreamClubId] : undefined;
    if (!club || !dreamClubs(input).some((entry) => entry.id === club.id))
      throw new Error('Choose a dream club');
  }
  // An ambition already met pays at once: its records go to copies, never the input world.
  const world: World = {
    ...input,
    career: structuredClone(career),
    inbox: [...input.inbox],
    chronicle: [...input.chronicle],
  };
  const date = today(world);
  world.career!.ambitions = {
    changedSeason: world.date.season,
    list: [
      ...kept,
      ...open.map((id): Ambition => ({
        id,
        set: date,
        achieved: null,
        ...(id === 'dream-club' ? { clubId: choice.dreamClubId! } : {}),
      })),
    ],
  };
  // One already met counts at once.
  ambitionsCheck(world, { hallOfFame: true });
  return world;
}

/**
 * Mark ambitions met since the last check: fame, XP, a Chronicle entry and an inbox message.
 * The Hall of Fame is ranked only when asked (weekly), as it reads every player. Mutates.
 */
export function ambitionsCheck(world: World, options: { hallOfFame?: boolean } = {}): void {
  const career = world.career;
  const list = career?.ambitions?.list;
  if (!career || !list) return;
  let rank: number | undefined;
  const hallOfFameRank = () => (rank ??= liveHallOfFame(world).rank);
  for (const ambition of list) {
    if (ambition.achieved) continue;
    if (ambition.id === 'hall-of-fame' && !options.hallOfFame) continue;
    const progress = ambitionProgress(world, ambition, hallOfFameRank);
    if (!progress.met) continue;
    ambition.achieved = today(world);
    career.fame += A.reward.fame;
    addXp(career, A.reward.xp);
    const params = {
      ambition: ambition.id,
      target: progress.target,
      ...(ambition.clubId ? { club: world.clubs[ambition.clubId]?.name ?? '' } : {}),
    };
    chronicle(world, 'ambition', params);
    postMessage(world, 'ambition-achieved', { ...params, fame: A.reward.fame, xp: A.reward.xp });
  }
}
