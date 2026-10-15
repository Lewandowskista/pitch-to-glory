import { describe, expect, it } from 'vitest';
import type { Fixture, World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { simulateWeek } from '../src/engine/world/simulate';
import {
  applyDiscipline,
  disciplineScope,
  rollDiscipline,
  seasonCards,
  suspendedFor,
  suspension,
  type FixtureCard,
} from '../src/engine/world/discipline';
import { careerSelection } from '../src/engine/career/market/rules';
import { pendingCareerFixture } from '../src/engine/career/fixtures';
import { advanceCareerWeek } from '../src/engine/career/season';
import { careerMatchSetup } from '../src/engine/career/matches';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { validateWorld } from '../src/persistence/worldSchema';

/**
 * Suspensions (the discipline phase, decision 5): bans by scope, served by the next matches in
 * it; cards in background fixtures on their own stream; the career player's selection, inbox
 * and save. See docs/BALANCING.md, "Discipline and suspensions".
 */
const S = CONFIG.world.background.suspensions;
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const national = generateWorld('discipline-world');
const draft = (overrides: Partial<CareerDraft> = {}): CareerDraft => ({
  name: 'Sam Carter',
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
  position: 'CB',
  foot: 'right',
  age: 17,
  archetype: 'destroyer',
  ...overrides,
});

/** A league fixture and a cup "fixture" between two clubs of the same league. */
function fixtures(world: World): { league: Fixture; cup: Fixture } {
  const league = Object.values(world.fixtures).find(
    (fixture) => world.leagues[fixture.competitionId],
  )!;
  const cupId = Object.values(world.competitions).find((c) => c.kind === 'domestic')!.id;
  return {
    league,
    cup: { ...league, id: `${league.id}:cup`, competitionId: cupId },
  };
}
const card = (fixture: Fixture, playerId: string, kind: FixtureCard['card']): FixtureCard => ({
  playerId,
  teamId: fixture.homeId,
  minute: 30,
  card: kind,
});

describe('suspension rules', () => {
  it('bans for a second yellow and a straight red, served in the scope they were earned in', () => {
    const world = clone(national);
    const { league, cup } = fixtures(world);
    expect(disciplineScope(world, league)).toBe('league');
    expect(disciplineScope(world, cup)).toBe('cup');
    const [first, second] = world.clubs[league.homeId]!.playerIds.filter(
      (id) => world.players[id]!.primaryPosition !== 'GK',
    );
    const bans = applyDiscipline(world, league, [
      card(league, first!, 'yellow'),
      card(league, first!, 'second-yellow'),
      card(league, second!, 'red'),
    ]);
    expect(bans).toEqual([
      { playerId: first, scope: 'league', matches: S.secondYellow, reason: 'second-yellow' },
      { playerId: second, scope: 'league', matches: S.straightRed, reason: 'straight-red' },
    ]);
    expect(seasonCards(world, first!, league.competitionId)).toEqual([2, 1]);
    expect(seasonCards(world, second!)).toEqual([0, 1]);
    expect(world.players[first!]!.stats).toMatchObject({ yellowCards: 2, redCards: 1 });
    // A cup match serves nothing in the league.
    applyDiscipline(world, cup, []);
    expect(suspension(world, first!, league)).toBe(S.secondYellow);
    expect(suspension(world, first!, cup)).toBe(0);
    // The club's next league matches serve them, one a match.
    applyDiscipline(world, league, []);
    expect(suspension(world, first!, league)).toBe(0);
    expect(suspension(world, second!, league)).toBe(S.straightRed - 1);
    // Yellows that ended in a dismissal never count towards an accumulation ban.
    expect(world.discipline!.players[first!]!.tally.league).toBeUndefined();
  });

  it('bans for every fifth league yellow, and every third in a cup', () => {
    const world = clone(national);
    const { league, cup } = fixtures(world);
    const id = world.clubs[league.homeId]!.playerIds.find(
      (pid) => world.players[pid]!.primaryPosition !== 'GK',
    )!;
    for (let match = 1; match <= S.accumulation.league; match++) {
      const bans = applyDiscipline(world, league, [card(league, id, 'yellow')]);
      // The fifth yellow's match serves nothing: the ban is for the next one.
      expect(bans.length).toBe(match === S.accumulation.league ? 1 : 0);
    }
    expect(suspension(world, id, league)).toBe(1);
    for (let match = 1; match <= S.accumulation.cup; match++)
      applyDiscipline(world, cup, [card(cup, id, 'yellow')]);
    expect(suspension(world, id, cup)).toBe(1);
    expect(world.players[id]!.stats.yellowCards).toBe(S.accumulation.league + S.accumulation.cup);
  });

  it('starts cards again each season and carries the bans still to serve', () => {
    const world = clone(national);
    const { league } = fixtures(world);
    const [banned, booked] = world.clubs[league.homeId]!.playerIds.filter(
      (id) => world.players[id]!.primaryPosition !== 'GK',
    );
    applyDiscipline(world, league, [card(league, banned!, 'red'), card(league, booked!, 'yellow')]);
    world.date = { ...world.date, season: world.date.season + 1 };
    rollDiscipline(world);
    expect(world.discipline!.season).toBe(world.date.season);
    expect(suspension(world, banned!, league)).toBe(S.straightRed);
    expect(seasonCards(world, banned!)).toEqual([0, 0]);
    expect(world.discipline!.players[booked!]).toBeUndefined();
  });

  it('leaves out the suspended, as long as eleven remain', () => {
    const world = clone(national);
    const { league } = fixtures(world);
    const club = world.clubs[league.homeId]!;
    const all = club.playerIds.filter((id) => world.players[id]!.primaryPosition !== 'GK');
    world.discipline = {
      version: 1,
      season: world.date.season,
      players: Object.fromEntries(
        all.map((id) => [id, { cards: {}, tally: {}, bans: { league: 1 } }]),
      ),
    };
    const out = suspendedFor(world, club, league);
    expect(club.playerIds.length - out.length).toBe(11);
  });
});

describe('cards in the background world', () => {
  // Ten weeks of a national season: cards on their own stream, suspensions in selection.
  let world = clone(national);
  let fixturesPlayed = 0;
  let checkedBans = 0;
  for (let week = 0; week < 10; week++) {
    const due = Object.values(world.fixtures).filter(
      (f) => f.date.season === world.date.season && f.date.week === world.date.week,
    );
    // Players banned from league football whose club plays only a league match this week.
    const banned = Object.entries(world.discipline?.players ?? {}).flatMap(([id, record]) => {
      const clubId = world.players[id]?.clubId;
      const own = due.filter((f) => f.homeId === clubId || f.awayId === clubId);
      return (record.bans.league ?? 0) > 0 &&
        own.length === 1 &&
        world.leagues[own[0]!.competitionId] &&
        suspendedFor(world, world.clubs[clubId!]!, own[0]!).includes(id)
        ? [{ id, apps: world.players[id]!.stats.appearances, ban: record.bans.league! }]
        : [];
    });
    world = simulateWeek(world, { inPlace: true, allowCareerFixture: true });
    fixturesPlayed += due.length;
    for (const entry of banned) {
      checkedBans++;
      expect(world.players[entry.id]!.stats.appearances).toBe(entry.apps);
      expect(world.discipline!.players[entry.id]?.bans.league ?? 0).toBeLessThan(entry.ban);
    }
  }

  it('shows cards at a realistic rate', () => {
    let yellow = 0,
      red = 0;
    for (const record of Object.values(world.discipline!.players))
      for (const [y, r] of Object.values(record.cards)) {
        yellow += y;
        red += r;
      }
    expect(yellow / fixturesPlayed).toBeGreaterThan(3.2);
    expect(yellow / fixturesPlayed).toBeLessThan(4.4);
    expect(red / fixturesPlayed).toBeGreaterThan(0.06);
    expect(red / fixturesPlayed).toBeLessThan(0.26);
  });

  it('keeps suspended players out of their club’s next matches', () => {
    expect(checkedBans).toBeGreaterThan(5);
  });

  it('saves and reloads the season’s discipline, and rejects a forged one', () => {
    const saved = clone(world);
    expect(validateWorld(saved).discipline).toEqual(world.discipline);
    const [id] = Object.keys(world.discipline!.players);
    for (const forge of [
      (w: World) => (w.discipline!.season = w.date.season - 1),
      (w: World) => (w.discipline!.players[id!]!.bans = { league: -1 }),
      (w: World) => ((w.discipline!.players[id!]!.bans as Record<string, number>).friendly = 2),
      (w: World) => (w.discipline!.players['player:nobody'] = { cards: {}, tally: {}, bans: {} }),
    ]) {
      const forged = clone(world);
      forge(forged);
      expect(() => validateWorld(forged)).toThrow();
    }
  });

  it('draws no background cards in worlds from before the national pyramid', () => {
    let legacy = generateWorld('discipline-legacy', { format: 'legacy' });
    for (let week = 0; week < 3; week++)
      legacy = simulateWeek(legacy, { inPlace: true, allowCareerFixture: true });
    expect(legacy.discipline).toBeUndefined();
  });
});

describe('the career player’s suspensions', () => {
  const base = clone(national);
  const trial = trialOffers(base, 'country:0', 'discipline')[0]!;
  const career = createCareer(base, draft(), trial.id, 'discipline');
  const playerId = career.career!.playerId;
  const nextLeague = (world: World) =>
    Object.values(world.fixtures)
      .filter(
        (f) =>
          world.leagues[f.competitionId] &&
          (f.homeId === trial.id || f.awayId === trial.id) &&
          !world.results[f.id],
      )
      .sort((a, b) => a.date.week - b.date.week || a.date.day - b.date.day)[0]!;

  it('cannot be picked while suspended, and the missed match is not "dropped"', () => {
    const world = clone(career);
    world.discipline = {
      version: 1,
      season: world.date.season,
      players: { [playerId]: { cards: {}, tally: {}, bans: { league: 1 } } },
    };
    const fixture = nextLeague(world);
    const selection = careerSelection(world, fixture);
    expect(selection.selected).toBe(false);
    expect(selection.suspended).toBe(1);
    expect(selection.reasons.at(-1)).toMatchObject({ kind: 'suspended', detail: 1 });
    // Play on to the fixture's week: it is simulated without the player and serves the ban.
    let current = world;
    while (current.date.week < fixture.date.week)
      current = advanceCareerWeek(current, { inPlace: true, autoPlay: true }).world;
    expect(pendingCareerFixture(current)?.id).not.toBe(fixture.id);
    const appearances = current.players[playerId]!.stats.appearances;
    current = advanceCareerWeek(current, { inPlace: true, autoPlay: true }).world;
    expect(current.results[fixture.id]).toBeDefined();
    expect(current.career!.matches.some((m) => m.fixtureId === fixture.id)).toBe(false);
    expect(suspension(current, playerId, fixture)).toBe(0);
    expect(current.players[playerId]!.stats.appearances).toBeGreaterThanOrEqual(appearances);
    expect(current.inbox.some((m) => m.subjectKey === 'dropped')).toBe(false);
  }, 120000);

  it('leaves suspended opponents out of the interactive match', () => {
    const world = clone(career);
    const fixture = nextLeague(world);
    const opponentId = fixture.homeId === trial.id ? fixture.awayId : fixture.homeId;
    const opponent = world.clubs[opponentId]!;
    const banned = opponent.playerIds.find((id) => world.players[id]!.primaryPosition === 'CB')!;
    world.discipline = {
      version: 1,
      season: world.date.season,
      players: { [banned]: { cards: {}, tally: {}, bans: { league: 2 } } },
    };
    const setup = careerMatchSetup(world, fixture);
    expect(setup.discipline).toBe(true);
    expect(setup.suspended).toEqual([banned]);
  });

  it('hears from the manager when a ban starts, and serves it', () => {
    // A hothead centre-back: booked often, so a ban comes within a season.
    let world = clone(career);
    const player = world.players[playerId]!;
    player.attributes.aggression = 99;
    player.attributes.tackling = 20;
    let message;
    for (let week = 0; week < 34 && world.phase === 'active' && !message; week++) {
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
      message = world.inbox.find((m) => m.subjectKey === 'suspended');
    }
    expect(message).toBeDefined();
    expect(message!.sender?.kind).toBe('manager');
    expect(['league', 'cup', 'continental']).toContain(message!.params.scope);
    expect(['second-yellow', 'straight-red', 'accumulation']).toContain(message!.params.reason);
    expect(Number(message!.params.matches)).toBeGreaterThan(0);
    expect(
      (player.stats.yellowCards ?? 0) + (world.players[playerId]!.stats.yellowCards ?? 0),
    ).toBeGreaterThan(0);
    expect(validateWorld(clone(world)).discipline).toBeDefined();
  }, 240000);
});
