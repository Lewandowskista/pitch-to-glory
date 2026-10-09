import { beforeAll, describe, expect, it } from 'vitest';
import type { CareerMove, Fixture, Standing, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { fixtureStake, fixtureStakes } from '../src/engine/career/stakes';
import { stakeText } from '../src/screens/career/stakesUi';
import { stakesText } from '../src/i18n/stakes';

const draft: CareerDraft = {
  name: 'Robin Vale',
  avatar: {
    face: 1,
    skin: 2,
    hair: 3,
    hairColor: 4,
    facialHair: 0,
    eyebrows: 1,
    eyes: 2,
    accessory: 3,
  },
  nationalityId: 'country:0',
  position: 'ST',
  foot: 'left',
  age: 17,
  archetype: 'finisher',
};
let start: World;
beforeAll(() => {
  const base = generateWorld('stakes-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'stakes-tests')[0]!;
  start = createCareer(base, draft, trial.id, 'stakes-tests');
}, 60000);
const clone = (world: World): World => structuredClone(world);
const clubOf = (world: World) => world.players[world.career!.playerId]!.clubId!;
/** The career club's next league fixture, and the world with its table set by hand. */
function withTable(order: (clubIds: string[]) => string[], points: (rank: number) => number) {
  const world = clone(start);
  const clubId = clubOf(world);
  const league = world.leagues[world.clubs[clubId]!.leagueId]!;
  const fixture = Object.values(world.fixtures)
    .filter((f) => f.competitionId === league.id && (f.homeId === clubId || f.awayId === clubId))
    .sort((a, b) => a.date.week - b.date.week)[0]!;
  const ids = order(league.clubIds);
  league.standings = ids.map((id, index): Standing => ({
    clubId: id,
    played: 10,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: points(index + 1),
  }));
  return { world, fixture, clubId, league, opponentId: opponent(fixture, clubId) };
}
const opponent = (fixture: Fixture, clubId: string) =>
  fixture.homeId === clubId ? fixture.awayId : fixture.homeId;
/** Put the career club at `rank` and its opponent at `opponentRank`. */
const placing =
  (clubId: string, opponentId: string, rank: number, opponentRank: number) => (ids: string[]) => {
    const rest = ids.filter((id) => id !== clubId && id !== opponentId);
    const result: string[] = [];
    for (let place = 1; place <= ids.length; place++)
      result.push(place === rank ? clubId : place === opponentRank ? opponentId : rest.shift()!);
    return result;
  };

describe('what a fixture is about', () => {
  it('says nothing about the table until every club has played a few games', () => {
    const world = clone(start);
    const clubId = clubOf(world);
    const fixture = Object.values(world.fixtures).find(
      (f) =>
        (f.homeId === clubId || f.awayId === clubId) &&
        world.leagues[f.competitionId] !== undefined,
    )!;
    expect(
      fixtureStakes(world, fixture).filter((stake) =>
        ['go-top', 'stay-top', 'top-clash', 'escape-drop', 'six-pointer'].includes(stake.kind),
      ),
    ).toEqual([]);
  });

  it('reads the table: top, a title clash, the promotion places and the drop', () => {
    const base = withTable(
      (ids) => ids,
      () => 0,
    );
    const { clubId, opponentId } = base;
    const rows = base.league.clubIds.length;
    expect(rows).toBeGreaterThanOrEqual(6);
    const at = (rank: number, opponentRank: number, points: (rank: number) => number) => {
      const { world, fixture } = withTable(placing(clubId, opponentId, rank, opponentRank), points);
      // Two up and two down, whatever the generated league uses.
      const league = world.leagues[fixture.competitionId]!;
      league.promotionPlaces = 2;
      league.relegationPlaces = 2;
      delete league.zones;
      return fixtureStakes(world, fixture).map((stake) => stake.kind);
    };
    const falling = (rank: number) => 60 - rank * 3;
    expect(at(1, 2, falling)).toEqual(expect.arrayContaining(['top-clash', 'stay-top']));
    expect(at(1, 4, falling)).toContain('stay-top');
    // Two points behind the leaders: a win takes them top.
    expect(at(2, 4, (rank) => (rank === 1 ? 40 : 40 - rank))).toContain('go-top');
    expect(at(4, 1, falling)).not.toContain('go-top');
    // Third, a point behind second: a win lifts them into the promotion places.
    expect(at(3, 5, (rank) => 40 - rank)).toContain('into-promotion');
    // In the relegation zone, two points from safety, against a fellow struggler.
    const bottom = rows - 1;
    const drop = at(bottom, bottom - 1, (rank) => (rank >= bottom ? 10 : 12));
    expect(drop).toEqual(expect.arrayContaining(['escape-drop', 'six-pointer']));
    // Mid-table against mid-table: only the points.
    expect(at(3, 4, falling)).toEqual([]);
  });

  it('names a derby, the rival and a former club', () => {
    const { world, fixture, clubId, opponentId } = withTable(
      (ids) => ids,
      () => 0,
    );
    world.clubs[opponentId]!.city = world.clubs[clubId]!.city;
    const move: CareerMove = {
      date: { ...world.date },
      kind: 'transfer',
      fromClubId: opponentId,
      toClubId: clubId,
      fee: 0,
      weeklyWage: 100,
    };
    world.career!.market.moves.push(move);
    const rivalry = world.rivalries.find((r) => r.careerPlayerId === world.career!.playerId);
    if (rivalry) world.players[rivalry.rivalPlayerId]!.clubId = opponentId;
    const kinds = fixtureStakes(world, fixture).map((stake) => stake.kind);
    expect(kinds).toEqual(expect.arrayContaining(['derby', 'former-club']));
    if (rivalry) expect(kinds[0]).toBe('rival');
    const text = stakeText(world, fixture)!;
    expect(text).not.toMatch(/[{}]/);
  });

  it('has a line for every kind, with nothing left unfilled', () => {
    const first = withTable(
      (ids) => ids,
      () => 0,
    );
    const { world, fixture } = withTable(
      placing(first.clubId, first.opponentId, 1, 2),
      (rank) => 60 - rank,
    );
    expect(fixtureStake(world, fixture)).not.toBeNull();
    expect(stakeText(world, fixture)).not.toMatch(/[{}]/);
    expect(Object.keys(stakesText.kinds).sort()).toEqual(
      [
        'final',
        'tie',
        'phase',
        'rival',
        'former-club',
        'derby',
        'go-top',
        'stay-top',
        'top-clash',
        'into-promotion',
        'escape-drop',
        'six-pointer',
        'cup',
      ].sort(),
    );
  });
});
