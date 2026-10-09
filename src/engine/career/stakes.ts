import type { Fixture, League, World } from '../../model/domain';
import { fixtureKind } from './fixtures';

/**
 * What a career fixture is about, in one line: a final, a derby, the rival, an old club, or
 * what the result does to the table. Read from the world as it stands before the match, most
 * telling first, so the hub and the pre-match screen can say why this game matters.
 */
export type StakeKind =
  | 'final'
  | 'tie'
  | 'phase'
  | 'rival'
  | 'former-club'
  | 'derby'
  | 'go-top'
  | 'stay-top'
  | 'top-clash'
  | 'into-promotion'
  | 'escape-drop'
  | 'six-pointer'
  | 'cup';
export interface FixtureStake {
  kind: StakeKind;
  params: Record<string, string | number>;
}
/** Table stakes wait until every club has played this many league games. */
const SETTLED = 3;

function zones(league: League, rows: number): { promotion: number; relegation: number } {
  const listed = league.zones ?? [];
  const promotion = listed.length
    ? Math.max(0, ...listed.filter((zone) => zone.kind === 'promotion').map((zone) => zone.to))
    : league.promotionPlaces;
  const relegationFrom = listed.length
    ? Math.min(
        rows + 1,
        ...listed.filter((zone) => zone.kind === 'relegation').map((zone) => zone.from),
      )
    : rows - league.relegationPlaces + 1;
  return { promotion, relegation: relegationFrom };
}

function tableStakes(world: World, fixture: Fixture, clubId: string): FixtureStake[] {
  const league = world.leagues[fixture.competitionId];
  if (!league || !league.clubIds.includes(clubId)) return [];
  const rows = league.standings;
  if (rows.length < 4 || rows.some((row) => row.played < SETTLED)) return [];
  const opponentId = fixture.homeId === clubId ? fixture.awayId : fixture.homeId;
  const rank = rows.findIndex((row) => row.clubId === clubId) + 1;
  const opponentRank = rows.findIndex((row) => row.clubId === opponentId) + 1;
  if (!rank || !opponentRank) return [];
  const points = rows[rank - 1]!.points;
  const pointsAt = (place: number) => rows[place - 1]?.points ?? 0;
  const { promotion, relegation } = zones(league, rows.length);
  const opponent = { opponent: world.clubs[opponentId]?.name ?? '', rank: opponentRank };
  const stakes: FixtureStake[] = [];
  if (rank <= 2 && opponentRank <= 2) stakes.push({ kind: 'top-clash', params: opponent });
  if (rank === 1) stakes.push({ kind: 'stay-top', params: {} });
  else if (points + 3 > pointsAt(1)) stakes.push({ kind: 'go-top', params: {} });
  if (promotion > 1 && rank > promotion && points + 3 > pointsAt(promotion))
    stakes.push({ kind: 'into-promotion', params: {} });
  if (relegation <= rows.length) {
    const nearBottom = (place: number) => place >= relegation - 2;
    if (rank >= relegation && points + 3 > pointsAt(relegation - 1))
      stakes.push({ kind: 'escape-drop', params: {} });
    if (nearBottom(rank) && nearBottom(opponentRank))
      stakes.push({ kind: 'six-pointer', params: opponent });
  }
  return stakes;
}

/** Every stake of the fixture for the career player, most telling first. */
export function fixtureStakes(world: World, fixture: Fixture): FixtureStake[] {
  const career = world.career;
  const clubId = career ? world.players[career.playerId]?.clubId : undefined;
  if (!career || !clubId || (fixture.homeId !== clubId && fixture.awayId !== clubId)) return [];
  const opponentId = fixture.homeId === clubId ? fixture.awayId : fixture.homeId;
  const club = world.clubs[clubId],
    opponent = world.clubs[opponentId];
  if (!club || !opponent) return [];
  const stakes: FixtureStake[] = [];
  const kind = fixtureKind(world, fixture);
  if (kind === 'final') stakes.push({ kind: 'final', params: {} });
  else if (kind === 'tie') stakes.push({ kind: 'tie', params: {} });
  else if (kind === 'phase') stakes.push({ kind: 'phase', params: {} });
  const rivalry = world.rivalries.find((entry) => entry.careerPlayerId === career.playerId);
  const rival = rivalry ? world.players[rivalry.rivalPlayerId] : undefined;
  if (rival && !rival.retired && rival.clubId === opponentId)
    stakes.push({ kind: 'rival', params: { rival: rival.name, opponent: opponent.name } });
  const former = career.market.moves.some((move) => move.fromClubId === opponentId);
  if (former) stakes.push({ kind: 'former-club', params: { opponent: opponent.name } });
  if (club.city && club.city === opponent.city)
    stakes.push({ kind: 'derby', params: { city: club.city, opponent: opponent.name } });
  stakes.push(...tableStakes(world, fixture, clubId));
  if (kind === 'cup') stakes.push({ kind: 'cup', params: { opponent: opponent.name } });
  return stakes;
}

/** The single line the hub and the pre-match screen show, if the fixture has one. */
export function fixtureStake(world: World, fixture: Fixture): FixtureStake | null {
  return fixtureStakes(world, fixture)[0] ?? null;
}
