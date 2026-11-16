/**
 * Fully populated worlds (release 1.0 step 4.9): between them, every field of every type a
 * validator declares coverage for (`src/persistence/coverage.ts`) is present, optional ones
 * included. Built from the shared national career after its first season
 * (tests/support/world.ts): the engine plays the parts it can (a new season with its archive and
 * qualifying, a retired career and its child, a tournament, edit mode, challenges), and the
 * rest is set as the game would set it (a farewell announced, an injury, a sponsor deal running,
 * a promise offered…), each consistent with the validators' rules.
 */
import type { CareerFact, ManagerPromise, World } from '../../src/model/domain';
import { startNextSeason } from '../../src/engine/world/simulate';
import { openTournament } from '../../src/engine/career/honours/international';
import { retireCareer } from '../../src/engine/career/honours/retirement';
import { createCareer, trialOffers } from '../../src/engine/career/create';
import { applyEditAction } from '../../src/engine/world/edits';
import { refreshChallenges, swapChallenge } from '../../src/engine/career/lifestyle/challenges';
import { COMMITMENTS } from '../../src/engine/career/commitments';
import {
  COSMETICS,
  LIFESTYLE,
  STAFF_SPECIALITIES,
} from '../../src/engine/career/lifestyle/catalogue';
import { CONFIG } from '../../src/engine/config';
import { nationalCareerSeason, TEST_DRAFT } from './world';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The career world in its second season, with every optional career field set. */
function populate(world: World): World {
  const career = world.career!;
  const player = world.players[career.playerId]!;
  const clubId = player.clubId!;
  const season = world.date.season;
  const today = { ...world.date };
  // Weekly commitments and what was kept.
  career.training.commitments = [COMMITMENTS[0]!];
  career.commitments = {
    totals: { [COMMITMENTS[0]!]: 3 },
    last: { season, week: today.week, kept: [COMMITMENTS[0]!] },
  };
  career.ambitions = {
    list: [{ id: 'goals', set: today, achieved: null }],
    changedSeason: season,
  };
  const fact: CareerFact = { kind: 'captain', season, week: today.week, clubId };
  career.facts = [...(career.facts ?? []), fact];
  career.preseason = {
    season,
    done: false,
    ambition: { kind: 'place', target: 10, baseline: 0 },
    late: null,
  };
  career.captaincy = { clubId, since: today };
  career.farewell = { season, announced: today };
  career.testimonials = [clubId];
  // An injury in hand.
  const injuryId = 'injury:populated';
  player.injuryId = injuryId;
  career.injury = {
    id: injuryId,
    playerId: career.playerId,
    kind: CONFIG.career.injuries.types[0]!.kind,
    started: today,
    weeksRemaining: 2,
    severity: 1,
    reinjuryRisk: 0.1,
    recovery: null,
    careerThreatening: false,
    cause: 'training',
  };
  // A dismissal in the latest match.
  const match = career.matches.at(-1)!;
  match.sentOff = { minute: 70, reason: 'straight-red' };
  match.yellowCards = 1;
  match.decided ??= 'penalties';
  career.chainDrought ??= 1;
  career.honours.playInternationals = true;
  // The press: a promise offered, a stance taken and routine press answered in a tone.
  const promise: ManagerPromise = {
    id: `promise:${season}`,
    version: 1,
    season,
    clubId,
    managerId: world.clubs[clubId]!.managerId,
    status: 'offered',
    kind: 'appearances',
    target: 10,
    attribute: null,
    baseline: 0,
    offered: today,
    respondBy: today.week + 2,
    started: null,
    deadline: null,
    progress: 0,
    resolved: null,
    end: null,
  };
  career.social.promises = [promise];
  career.social.stance = { tone: 'team', date: today };
  career.social.pressTone = 'team';
  // Lifestyle: an experience taken and a member of staff with a speciality and upkeep.
  const experience = LIFESTYLE.find((item) => item.kind === 'experience')!;
  career.style.experiences = { [experience.id]: today };
  // A signature celebration used in a big match (set here: whether the simulated career scores
  // in one depends on the match engine's results).
  const celebration =
    career.style.equipped.celebration ?? COSMETICS.find((item) => item.kind === 'celebration')!.id;
  career.style.signatureUsesBy = { ...career.style.signatureUsesBy, [celebration]: 1 };
  career.style.signatureUses += 1;
  const staff = LIFESTYLE.find((item) => item.kind === 'staff' && STAFF_SPECIALITIES[item.id])!;
  career.style.assets.push({
    id: 'asset:populated',
    itemId: staff.id,
    kind: 'staff',
    bought: today,
    cost: 1000,
    value: 0,
    upkeep: 50,
    speciality: STAFF_SPECIALITIES[staff.id]![0]!,
  });
  // A sponsor deal running, with fees paid.
  const deal = world.sponsorships[0]!;
  for (const other of world.sponsorships)
    if (other !== deal && other.status === 'active') other.status = 'ended';
  Object.assign(deal, {
    status: 'active',
    start: today,
    baseline: { matches: 0, answered: 0, appearances: 0 },
    paid: deal.weeklyFee * 2,
  });
  // The move that brought the player to the club.
  career.market.moves.push({
    date: today,
    kind: 'transfer',
    fromClubId: null,
    toClubId: clubId,
    fee: 0,
    weeklyWage: world.contracts[player.contractId!]!.weeklyWage,
  });
  // A contract with a sell-on club and its option taken.
  const other = Object.values(world.contracts).find((contract) => contract.clubId !== clubId)!;
  other.sellOnClubId = clubId;
  other.optionTaken = true;
  // The career's academy at its club.
  world.clubs[clubId]!.academy = { patronId: career.playerId, since: season };
  // Edit mode: a renamed club, league and player.
  let edited = applyEditAction(world, { type: 'rename-club', id: clubId, name: 'Populated Town' });
  edited = applyEditAction(edited, {
    type: 'rename-league',
    id: Object.keys(world.leagues)[0]!,
    name: 'Populated League',
  });
  edited = applyEditAction(edited, {
    type: 'rename-player',
    id: career.playerId,
    name: 'Populated Player',
  });
  // Challenges for a day, one swapped for one the injured player can reach.
  refreshChallenges(edited, '2026-10-26');
  const swappable = edited.challenges.find((challenge) => {
    try {
      swapChallenge(clone(edited), challenge.id);
      return true;
    } catch {
      return false;
    }
  })!;
  swapChallenge(edited, swappable.id);
  // A player released this season, still without a club: the last of another club's squad.
  const club = Object.values(edited.clubs).find(
    (entry) => entry.id !== clubId && entry.playerIds.length > 20,
  )!;
  const free = edited.players[club.playerIds.at(-1)!]!;
  club.playerIds = club.playerIds.filter((id) => id !== free.id);
  delete edited.contracts[free.contractId!];
  for (const clique of edited.dressingRooms[club.dressingRoomId]?.cliques ?? [])
    clique.playerIds = clique.playerIds.filter((id) => id !== free.id);
  Object.assign(free, { clubId: null, contractId: null, releasedSeason: season });
  return edited;
}

/** Fully populated worlds, each valid; together they hold every covered field. */
export async function populatedWorlds(): Promise<{ name: string; world: World }[]> {
  const first = await nationalCareerSeason();
  const next = populate(startNextSeason(clone(first)));
  // A tournament opened with the player named, held as next season's (as a save holds it).
  const tournament = clone(first);
  const live = openTournament(tournament, tournament.date.season + 2)!;
  live.inSquad = true;
  live.starts = true;
  live.year = tournament.date.season + 1;
  // A retired career, and their child starting out in the same world.
  const parent = clone(next);
  const legacy = retireCareer(parent);
  // The players the retired career mentored.
  legacy.menteeIds = [Object.keys(parent.players)[0]!];
  const trial = trialOffers(parent, TEST_DRAFT.nationalityId, 'populated')[0]!;
  const child = createCareer(
    parent,
    { ...TEST_DRAFT, name: 'Robin Vale Junior', parentLegacyId: legacy.id },
    trial.id,
    'populated',
  );
  return [
    { name: 'next season', world: next },
    { name: 'tournament', world: tournament },
    { name: 'child career', world: child },
  ];
}
