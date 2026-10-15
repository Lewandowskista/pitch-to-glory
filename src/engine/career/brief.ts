import type { Club, Fixture, Id, Player, Position, World } from '../../model/domain';
import { CONFIG } from '../config';
import { STYLES } from '../world/catalog';
import { FORMATION_SLOTS, type SlotRole } from '../selection/formations';
import { clubLineup, clubStarters } from '../selection/world';
import { expectedGoals, managerStrengthBonus, playerAbility, teamStrength } from '../strength';
import { careerSelection } from './market/rules';

/**
 * The manager's pre-match plan (phase 7, C2): one line on the hub's next-match card, such as
 * "Start you up front: press their centre-backs and attack the left channel." Worked out from
 * the world as it stands, with no random draws of its own: where the player is expected to
 * play (the selection slot), the club's playing style and culture, the formation behind the
 * slot, and the opponent (who is weak at full-back, who is dangerous up front, and whether the
 * club goes in as favourites). The copy lives in `i18n/brief.ts` under the returned keys.
 */
const B = CONFIG.career.brief;

export type PlanGroup = 'keeper' | 'defence' | 'fullback' | 'midfield' | 'wide' | 'attack';
export type PlanStyle = (typeof STYLES)[number];
export type PlanRole = 'start' | 'bench' | 'unregistered';
export type PlanOutlook = 'favourite' | 'even' | 'underdog';
/** The closing line: the occasion as the club's culture sees it, when it says something. */
export type PlanNote = 'favourite' | 'win-now' | 'underdog' | 'brave' | 'youth' | 'discipline';
export type PlanSide = 'left' | 'right';

export interface MatchPlan {
  role: PlanRole;
  /** The slot the player fills, or the one they are closest to. */
  position: Position;
  group: PlanGroup;
  style: PlanStyle;
  outlook: PlanOutlook;
  /** Who gives the plan. */
  managerId: Id;
  /** The instruction's key in `briefText.plans`: `${group}.${style}`. */
  key: `${PlanGroup}.${PlanStyle}`;
  /**
   * The instruction's parameters: the channel or flank to attack, the opponent's player the
   * instruction names (`target`: the full-back or winger faced; `danger`: their best forward),
   * and the opponent club.
   */
  params: { opponent: string; side?: PlanSide; target?: string; danger?: string };
  note: PlanNote | null;
}

const GROUPS: Record<Position, PlanGroup> = {
  GK: 'keeper',
  CB: 'defence',
  LB: 'fullback',
  RB: 'fullback',
  DM: 'midfield',
  CM: 'midfield',
  AM: 'midfield',
  LW: 'wide',
  RW: 'wide',
  ST: 'attack',
};
/** Where a player stands without a formation (worlds on line-based selection). */
const ROLE_OF: Record<Position, SlotRole> = {
  GK: 'keeper',
  CB: 'centre-back',
  LB: 'left-back',
  RB: 'right-back',
  DM: 'pivot',
  CM: 'left-mid',
  AM: 'attacking-mid',
  LW: 'wide-left',
  RW: 'wide-right',
  ST: 'striker',
};
interface Placed {
  player: Player;
  position: Position;
  role: SlotRole;
}
/** The eleven a club would field, each with the slot they play. */
function fielded(world: World, club: Club): Placed[] {
  const lineup = clubLineup(world, club);
  if (lineup) {
    const slots = FORMATION_SLOTS[lineup.formation];
    return lineup.starterIds.map((id, index) => ({
      player: world.players[id]!,
      position: lineup.slots[index]!,
      role: slots[index]!.role,
    }));
  }
  return clubStarters(world, club).map((player) => ({
    player,
    position: player.primaryPosition,
    role: ROLE_OF[player.primaryPosition],
  }));
}
const byAbility = (a: Placed, b: Placed) =>
  playerAbility(b.player) - playerAbility(a.player) || (a.player.id < b.player.id ? -1 : 1);
/** The defender on one flank: the full-back (or wing-back), else the centre-back on that side. */
function flankDefender(side: Placed[], flank: PlanSide): Placed | undefined {
  const back = flank === 'left' ? 'LB' : 'RB';
  return (
    side.find((entry) => entry.position === back) ??
    side.find((entry) => entry.role === `centre-back-${flank}`)
  );
}
/** The attacker on one flank: the winger, else whoever plays wide there. */
function flankAttacker(side: Placed[], flank: PlanSide): Placed | undefined {
  const winger = flank === 'left' ? 'LW' : 'RW';
  return (
    side.find((entry) => entry.position === winger) ??
    side.find((entry) => entry.role === `wide-${flank}`)
  );
}
const opposite = (side: PlanSide): PlanSide => (side === 'left' ? 'right' : 'left');

/** Expected goals for and against, the way the world simulates the fixture. */
function outlookOf(world: World, fixture: Fixture, own: Club): PlanOutlook {
  const strength = (club: Club) =>
    teamStrength(club.reputation, clubStarters(world, club)) +
    managerStrengthBonus(world.managers[club.managerId]?.ability ?? 60);
  const home = world.clubs[fixture.homeId]!;
  const away = world.clubs[fixture.awayId]!;
  const [homeGoals, awayGoals] = expectedGoals(
    strength(home),
    strength(away),
    Boolean(fixture.neutral),
  );
  const margin = own.id === home.id ? homeGoals - awayGoals : awayGoals - homeGoals;
  if (margin >= B.outlookGoals) return 'favourite';
  if (margin <= -B.outlookGoals) return 'underdog';
  return 'even';
}

function noteOf(outlook: PlanOutlook, club: Club, age: number): PlanNote | null {
  const culture = club.culture;
  if (outlook === 'favourite') return culture.winNow >= B.trait ? 'win-now' : 'favourite';
  if (outlook === 'underdog') return culture.attacking >= B.trait ? 'brave' : 'underdog';
  if (culture.youth >= B.trait && age <= B.youthAge) return 'youth';
  if (culture.discipline >= B.trait) return 'discipline';
  return null;
}

/**
 * The manager's plan for the career player in a fixture of their club, or null when there is
 * no plan to give (no career, no club, injured, or a fixture of another club). Pure: the same
 * world and fixture always give the same plan.
 */
export function matchPlan(world: World, fixture: Fixture): MatchPlan | null {
  const career = world.career;
  if (!career) return null;
  const player = world.players[career.playerId];
  if (!player?.clubId || player.injuryId) return null;
  if (fixture.homeId !== player.clubId && fixture.awayId !== player.clubId) return null;
  const club = world.clubs[player.clubId];
  const opponent = world.clubs[fixture.homeId === player.clubId ? fixture.awayId : fixture.homeId];
  if (!club || !opponent) return null;
  const selection = careerSelection(world, fixture);
  const thisWeek =
    fixture.date.season === world.date.season && fixture.date.week === world.date.week;
  // This week's selection is settled; a later fixture is the manager's current intention.
  const picked = thisWeek ? selection.selected : selection.probability >= B.startChance;
  const role: PlanRole = !selection.registered ? 'unregistered' : picked ? 'start' : 'bench';
  const position = selection.competition.position;
  const group = GROUPS[position];
  const style: PlanStyle = (STYLES as readonly string[]).includes(club.playingStyle)
    ? (club.playingStyle as PlanStyle)
    : 'balanced';
  const them = fielded(world, opponent);
  const forwards = them
    .filter((entry) => ['ST', 'LW', 'RW', 'AM'].includes(entry.position))
    .sort(byAbility);
  const danger = forwards[0]?.player.name;
  const params: MatchPlan['params'] = { opponent: opponent.name };
  if (group === 'attack' || group === 'midfield') {
    // Attack the channel of their weaker full-back: our left faces their right-back.
    const right = flankDefender(them, 'right');
    const left = flankDefender(them, 'left');
    const weakRight =
      !left || (right !== undefined && playerAbility(right.player) <= playerAbility(left.player));
    params.side = weakRight ? 'left' : 'right';
    const target = weakRight ? right : left;
    if (target) params.target = target.player.name;
  } else if (group === 'wide') {
    const side: PlanSide = position === 'LW' ? 'left' : 'right';
    params.side = side;
    const target = flankDefender(them, opposite(side));
    if (target) params.target = target.player.name;
  } else if (group === 'fullback') {
    const side: PlanSide = position === 'LB' ? 'left' : 'right';
    params.side = side;
    const target = flankAttacker(them, opposite(side)) ?? forwards[0];
    if (target) params.target = target.player.name;
  }
  if (danger && (group === 'defence' || group === 'keeper')) params.danger = danger;
  const outlook = outlookOf(world, fixture, club);
  return {
    role,
    position,
    group,
    style,
    outlook,
    managerId: club.managerId,
    key: `${group}.${style}`,
    params,
    note: noteOf(outlook, club, world.date.season - player.birthSeason),
  };
}
