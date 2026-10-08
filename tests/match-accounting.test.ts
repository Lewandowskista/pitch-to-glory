import { beforeAll, describe, expect, it } from 'vitest';
import type { Fixture, Id, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { createPostseasonTie } from '../src/engine/world/postseason';
import {
  applyFinalizedFixture,
  finalizeFixture,
  type PlayedFixture,
} from '../src/engine/world/finalize';
import { selectStartingPlayers } from '../src/engine/strength';
import {
  autoPlayCommand,
  careerMatchSetup,
  commitCareerMatch,
  defaultTactics,
} from '../src/engine/career/matches';
import { applyMatchCommand, createMatchSession, type MatchSession } from '../src/engine/match';
import { createSave, DEFAULT_SETTINGS, parseSave } from '../src/persistence/schema';

const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const draft = (overrides: Partial<CareerDraft> = {}): CareerDraft => ({
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
  position: 'CM',
  foot: 'right',
  age: 17,
  archetype: 'playmaker',
  ...overrides,
});

let playmaker: World;
let national: World;
beforeAll(() => {
  const base = generateWorld('review-assists', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'review-assists')[0]!;
  playmaker = createCareer(base, draft(), trial.id, 'review-assists');
  national = generateWorld('accounting-extra-time');
});

/** A one-legged play-off between two clubs this week: a level 90 minutes goes to extra time. */
function playoff(world: World, homeId: Id, awayId: Id, key: string): Fixture {
  const league = world.leagues[world.clubs[homeId]!.leagueId]!;
  const tie = createPostseasonTie(world, {
    id: `test:${key}`,
    countryId: league.countryId,
    name: 'Test play-off',
    kind: 'promotion',
    sourceLeagueIds: [league.id],
    targetDivisionId: null,
    round: 1,
    clubIds: [homeId, awayId],
    legs: 1,
    drawRule: 'extra-time-penalties',
    higherRankedId: null,
    startWeek: world.date.week,
    neutral: true,
  });
  return world.fixtures[tie.fixtureIds[0]!]!;
}
const xi = (world: World, clubId: Id) =>
  selectStartingPlayers(world.clubs[clubId]!.playerIds.map((id) => world.players[id]!));
/** Regulation 1–1, with the home side's selected outfielder replaced on the hour. */
function levelPlayed(world: World, fixture: Fixture) {
  const home = xi(world, fixture.homeId);
  const away = xi(world, fixture.awayId);
  const replaced = home.find((p) => p.primaryPosition !== 'GK')!;
  const bench = world.clubs[fixture.homeId]!.playerIds.find(
    (id) => !home.some((p) => p.id === id) && world.players[id]!.primaryPosition !== 'GK',
  )!;
  const scorer = home.find((p) => p.id !== replaced.id && p.primaryPosition !== 'GK')!;
  const played: PlayedFixture = {
    score: [1, 1],
    goals: [
      { playerId: scorer.id, teamId: fixture.homeId, minute: 20, assistId: replaced.id },
      { playerId: away.at(-1)!.id, teamId: fixture.awayId, minute: 70 },
    ],
    minutes: {
      home: {
        ...Object.fromEntries(home.map((p) => [p.id, 90])),
        [replaced.id]: 60,
        [bench]: 30,
      },
      away: Object.fromEntries(away.map((p) => [p.id, 90])),
    },
    onPitch: {
      home: [...home.filter((p) => p.id !== replaced.id).map((p) => p.id), bench],
      away: away.map((p) => p.id),
    },
    selected: { playerId: replaced.id, rating: 7.2 },
  };
  return { played, replaced: replaced.id, bench };
}

describe('career match accounting', () => {
  it('credits every goal, assist, appearance and minute once across a season', () => {
    let world = clone(playmaker);
    while (world.phase === 'active')
      world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
    const records = world.career!.matches;
    const stats = world.players[world.career!.playerId]!.stats;
    expect(records.length).toBeGreaterThan(10);
    const sum = (key: 'goals' | 'assists' | 'minutes') =>
      records.reduce((total, record) => total + record[key], 0);
    expect(stats.appearances).toBe(records.length);
    expect(stats.goals).toBe(sum('goals'));
    expect(stats.assists).toBe(sum('assists'));
    expect(stats.minutes).toBe(sum('minutes'));
  }, 120000);

  it('keeps explicit assists and never invents one for the interactively played player', () => {
    const world = clone(playmaker);
    const league = Object.values(world.leagues)[0]!;
    let invented = 0;
    for (const fixtureId of league.fixtureIds.slice(0, 30)) {
      const fixture = world.fixtures[fixtureId]!;
      const home = xi(world, fixture.homeId);
      const away = xi(world, fixture.awayId);
      const [selected, scorer, assister] = home.filter((p) => p.primaryPosition !== 'GK');
      const final = finalizeFixture(world, fixture, {
        score: [2, 0],
        goals: [
          { playerId: scorer!.id, teamId: fixture.homeId, minute: 10, assistId: assister!.id },
          { playerId: scorer!.id, teamId: fixture.homeId, minute: 50 },
        ],
        minutes: {
          home: Object.fromEntries(home.map((p) => [p.id, 90])),
          away: Object.fromEntries(away.map((p) => [p.id, 90])),
        },
        onPitch: { home: home.map((p) => p.id), away: away.map((p) => p.id) },
        selected: { playerId: selected!.id, rating: 6.8 },
      });
      expect(final.goals[0]!.assistId).toBe(assister!.id);
      const background = final.goals[1]!.assistId;
      if (background) {
        invented++;
        expect(background).not.toBe(selected!.id);
        expect(background).not.toBe(scorer!.id);
        expect(home.some((p) => p.id === background)).toBe(true);
      }
      const me = final.participants.find((p) => p.playerId === selected!.id)!;
      expect(me).toMatchObject({ goals: 0, assists: 0, rating: 6.8, minutes: 90 });
    }
    // Teammates still collect assists for goals the session left unassisted.
    expect(invented).toBeGreaterThan(10);
  });

  it('plays extra time with only the players on the pitch at 90 minutes', () => {
    const world = clone(national);
    const league = Object.values(world.leagues).find((l) => l.tier === 1)!;
    const [homeId, awayId] = league.clubIds;
    let extraGoals = 0;
    for (let index = 0; index < 40; index++) {
      const fixture = playoff(world, homeId!, awayId!, `extra-time-${index}`);
      const { played, replaced, bench } = levelPlayed(world, fixture);
      const final = finalizeFixture(world, fixture, played);
      expect(final.extraTime).not.toBeNull();
      expect(final.regulation).toEqual([1, 1]);
      expect(final.score).toEqual([1 + final.extraTime![0], 1 + final.extraTime![1]]);
      expect(final.decided).toBe(final.penalties ? 'penalties' : 'extra-time');
      const onPitch = new Set([...played.onPitch.home, ...played.onPitch.away]);
      for (const goal of final.goals.filter((g) => g.extraTime)) {
        extraGoals++;
        expect(goal.minute).toBeGreaterThan(90);
        expect(goal.minute).toBeLessThanOrEqual(120);
        expect(onPitch.has(goal.playerId)).toBe(true);
        if (goal.assistId) expect(onPitch.has(goal.assistId)).toBe(true);
      }
      const byId = Object.fromEntries(final.participants.map((p) => [p.playerId, p]));
      expect(byId[replaced]).toMatchObject({
        minutes: 60,
        extraTimeMinutes: 0,
        extraTimeGoals: 0,
        extraTimeAssists: 0,
      });
      expect(byId[bench]).toMatchObject({ minutes: 30, extraTimeMinutes: 30 });
      // Penalties decide the winner without becoming anyone's goals.
      const credited = final.participants.reduce((sum, p) => sum + p.goals, 0);
      expect(credited).toBe(final.score[0] + final.score[1]);
      expect(final.goals).toHaveLength(credited);
      // The stored result and statistics are exactly the finalized outcome.
      const before = clone(world);
      applyFinalizedFixture(world, final);
      expect(world.results[fixture.id]!.score).toEqual(final.score);
      for (const p of final.participants) {
        const was = before.players[p.playerId]!.stats;
        const now = world.players[p.playerId]!.stats;
        expect(now.goals - was.goals).toBe(p.goals);
        expect(now.assists - was.assists).toBe(p.assists);
        expect(now.minutes - was.minutes).toBe(p.minutes + p.extraTimeMinutes);
        expect(now.appearances - was.appearances).toBe(1);
      }
    }
    expect(extraGoals).toBeGreaterThan(5);
  }, 120000);

  it('derives every career reward from the finalized match, extra time included', () => {
    const base = clone(national);
    const trial = trialOffers(base, 'country:0', 'accounting')[0]!;
    const career = createCareer(
      base,
      draft({ position: 'ST', archetype: 'finisher' }),
      trial.id,
      'accounting',
    );
    const opponent = career.leagues[career.clubs[trial.id]!.leagueId]!.clubIds.find(
      (id) => id !== trial.id,
    )!;
    let checked = 0;
    let scoredInExtraTime = false;
    for (let index = 0; index < 150 && !(checked >= 3 && scoredInExtraTime); index++) {
      const world = clone(career);
      const fixture = playoff(world, trial.id, opponent, `career-${index}`);
      let session: MatchSession = createMatchSession(
        careerMatchSetup(world, fixture),
        defaultTactics(world),
      );
      while (session.state.match.status !== 'finished')
        session = applyMatchCommand(session, autoPlayCommand(session));
      const [home, away] = session.state.match.score;
      if (home !== away || session.state.substituted) continue;
      const playerId = world.career!.playerId;
      const before = clone(world);
      const { record, final, celebrationFame } = commitCareerMatch(world, session);
      checked++;
      expect(final.extraTime).not.toBeNull();
      expect(record.decided).toBe(final.penalties ? 'penalties' : 'extra-time');
      expect(final.extraTimeMinutes).toBe(30);
      expect(record.minutes).toBe(session.state.selectedPlayerMinutes + 30);
      expect(record.goals).toBe(session.state.stats.goals + final.extraTimeGoals);
      expect(record.assists).toBe(session.state.stats.assists + final.extraTimeAssists);
      expect(record.score).toEqual(final.score);
      expect(record.rating).toBe(final.rating);
      if (final.extraTimeGoals || final.extraTimeAssists) {
        scoredInExtraTime ||= final.extraTimeGoals > 0;
        expect(final.rating).toBeGreaterThan(session.state.report!.rating);
      } else expect(final.rating).toBe(session.state.report!.rating);
      // Cumulative statistics, contract bonuses, XP and fame agree with the record.
      const was = before.players[playerId]!.stats;
      const now = world.players[playerId]!.stats;
      expect(now.goals - was.goals).toBe(record.goals);
      expect(now.assists - was.assists).toBe(record.assists);
      expect(now.minutes - was.minutes).toBe(record.minutes);
      expect(now.appearances - was.appearances).toBe(1);
      const contract = world.contracts[world.players[playerId]!.contractId!]!;
      expect(world.career!.market.pendingBonuses - before.career!.market.pendingBonuses).toBe(
        contract.appearanceBonus + record.goals * contract.goalBonus,
      );
      expect(world.career!.xp - before.career!.xp).toBe(record.xp);
      expect(world.career!.fame - before.career!.fame).toBe(final.fame + celebrationFame);
      // A second commit, also after a save round trip, is rejected without any reward.
      const committed = JSON.stringify(world.career);
      expect(() => commitCareerMatch(world, session)).toThrow();
      const saved = parseSave(
        JSON.stringify(
          createSave(1, 'Accounting', {
            kind: 'world',
            world,
            gallery: { seed: 'accounting', generation: 0 },
            settings: DEFAULT_SETTINGS,
          }),
        ),
      );
      if (saved.payload.kind !== 'world') throw new Error('Expected a world save');
      const reloaded = saved.payload.world;
      expect(() => commitCareerMatch(reloaded, session)).toThrow();
      expect(JSON.stringify(reloaded.career)).toBe(committed);
      expect(JSON.stringify(world.career)).toBe(committed);
    }
    expect(checked).toBeGreaterThanOrEqual(3);
    expect(scoredInExtraTime).toBe(true);
  }, 360000);

  it('credits the fame the report shows, assists and clean sheets included', () => {
    const base = clone(national);
    const trial = trialOffers(base, 'country:0', 'fame')[0]!;
    for (const [position, archetype] of [
      ['CB', 'destroyer'],
      ['CM', 'playmaker'],
    ] as const) {
      const career = createCareer(base, draft({ position, archetype }), trial.id, 'fame');
      const opponent = career.leagues[career.clubs[trial.id]!.leagueId]!.clubIds.find(
        (id) => id !== trial.id,
      )!;
      let checked = 0;
      let credited = false;
      for (let index = 0; index < 150 && !(checked >= 3 && credited); index++) {
        const world = clone(career);
        const fixture = playoff(world, trial.id, opponent, `fame-${position}-${index}`);
        let session: MatchSession = createMatchSession(
          careerMatchSetup(world, fixture),
          defaultTactics(world),
        );
        while (session.state.match.status !== 'finished')
          session = applyMatchCommand(session, autoPlayCommand(session));
        const [home, away] = session.state.match.score;
        // Decided in 90 minutes, so the report and the finalized match count the same play.
        if (home === away) continue;
        const before = world.career!.fame;
        const { final, celebrationFame } = commitCareerMatch(world, session);
        checked++;
        expect(final.fame).toBe(session.state.report!.fameDelta);
        expect(world.career!.fame - before).toBe(final.fame + celebrationFame);
        credited ||=
          position === 'CB' ? session.state.match.score[1] === 0 : session.state.stats.assists > 0;
      }
      expect(checked).toBeGreaterThanOrEqual(3);
      expect(credited).toBe(true);
    }
  }, 360000);
});
