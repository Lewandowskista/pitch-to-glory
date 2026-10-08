import { refreshDressingRoom } from '../src/engine/world/dressing';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Id, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { seasonAwards } from '../src/engine/career/honours/awards';
import { simulateWeek, startNextSeason } from '../src/engine/world/simulate';
import { applyFinalizedFixture, finalizeFixture } from '../src/engine/world/finalize';
import {
  allCompetitionTotals,
  appearedFor,
  competitionTotals,
  hasSeasonStatistics,
} from '../src/engine/world/statistics';
import { selectStartingPlayers } from '../src/engine/strength';
import { validateWorld } from '../src/persistence/worldSchema';
import { createSave, DEFAULT_SETTINGS, migrateSave, parseSave } from '../src/persistence/schema';

const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;

/** A legacy career world whose season has been played to the end, awards included. */
let complete: World;
beforeAll(() => {
  const base = generateWorld('competition-stats', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'competition-stats')[0]!;
  let world = createCareer(
    base,
    {
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
    },
    trial.id,
    'competition-stats',
  );
  while (world.phase === 'active')
    world = advanceCareerWeek(world, { inPlace: true, autoPlay: true }).world;
  complete = world;
}, 120000);

const careerLeagueId = (world: World) =>
  world.clubs[world.players[world.career!.playerId]!.clubId!]!.leagueId;
/** Goals scored in one competition this season, read from the stored results. */
function competitionGoals(world: World, competitionId: Id): Map<Id, number> {
  const goals = new Map<Id, number>();
  for (const result of Object.values(world.results)) {
    const fixture = world.fixtures[result.fixtureId]!;
    if (fixture.competitionId !== competitionId || fixture.date.season !== world.date.season)
      continue;
    for (const goal of result.goals) goals.set(goal.playerId, (goals.get(goal.playerId) ?? 0) + 1);
  }
  return goals;
}
/** Re-run the season's awards after changing who is where. */
function rerunAwards(world: World) {
  const season = world.date.season;
  world.awards = world.awards.filter((award) => award.season !== season || award.kind === 'month');
  seasonAwards(world);
  return world.awards.find((award) => award.season === season && award.kind === 'golden-boot')!;
}
function move(world: World, playerId: Id, clubId: Id) {
  const player = world.players[playerId]!;
  const from = world.clubs[player.clubId!]!;
  from.playerIds = from.playerIds.filter((id) => id !== playerId);
  world.clubs[clubId]!.playerIds.push(playerId);
  player.clubId = clubId;
  if (player.contractId) world.contracts[player.contractId]!.clubId = clubId;
  // As the engine's transfers do: both dressing rooms lose or gain the player.
  refreshDressingRoom(world, from);
  refreshDressingRoom(world, world.clubs[clubId]!);
}

describe('league awards count league football only', () => {
  it('ignores cup goals and goals scored for clubs in other leagues', () => {
    const world = clone(complete);
    const leagueId = careerLeagueId(world);
    const league = competitionGoals(world, leagueId);
    const best = Math.max(...league.values());
    // A league player with fewer league goals scores heavily elsewhere (cups, another league).
    const [cupScorer] = [...league.entries()].find(([, goals]) => goals < best)!;
    world.players[cupScorer]!.stats.goals += best + 5;
    // A striker from another league joins the league with a big tally from there.
    const other = Object.values(world.leagues).find((l) => l.id !== leagueId && l.tier === 1)!;
    // The best scorer still at a club: a prolific veteran can retire at the intake week.
    const elsewhere = [...competitionGoals(world, other.id).entries()]
      .sort((a, b) => b[1] - a[1])
      .find(([id]) => world.players[id]!.clubId)![0];
    world.players[elsewhere]!.stats.goals += best + 5;
    move(world, elsewhere, world.leagues[leagueId]!.clubIds[0]!);
    const boot = rerunAwards(world);
    expect(boot.competitionId).toBe(leagueId);
    expect(boot.winnerIds[0]).not.toBe(cupScorer);
    expect(boot.winnerIds[0]).not.toBe(elsewhere);
    expect(league.get(boot.winnerIds[0]!)).toBe(best);
    expect(boot.value).toBe(best);
  });
  it('keeps a departed player eligible for the league award they earned there', () => {
    const world = clone(complete);
    const leagueId = careerLeagueId(world);
    const league = competitionGoals(world, leagueId);
    const goals = Math.max(...league.values());
    // Every leader leaves the league before the awards; one of them must still win.
    const leaders = [...league.entries()].filter(([, g]) => g === goals).map(([id]) => id);
    const away = Object.values(world.leagues).find((l) => l.id !== leagueId)!;
    for (const leader of leaders) move(world, leader, away.clubIds[0]!);
    const boot = rerunAwards(world);
    expect(leaders).toContain(boot.winnerIds[0]);
    expect(boot.value).toBe(goals);
  });
});

describe('season competition statistics', () => {
  it("agree with every result and with each player's totals over a national season", () => {
    let world = generateWorld('competition-stats-national');
    expect(hasSeasonStatistics(world)).toBe(true);
    while (world.phase === 'active') world = simulateWeek(world);
    expect(() => validateWorld(clone(world))).not.toThrow();
    const totals = allCompetitionTotals(world);
    let checked = 0;
    for (const player of Object.values(world.players)) {
      const line = totals.get(player.id);
      if (!line) {
        expect(player.stats.appearances).toBe(0);
        continue;
      }
      checked++;
      expect(line.apps).toBe(player.stats.appearances);
      expect(line.minutes).toBe(player.stats.minutes);
      expect(line.goals).toBe(player.stats.goals);
      expect(line.assists).toBe(player.stats.assists);
      expect(line.cleanSheets).toBe(player.stats.cleanSheets);
      expect(line.ratingTotal).toBeCloseTo(player.stats.ratingTotal, 1);
    }
    expect(checked).toBeGreaterThan(1000);
    // League goals are the league's results, separate from cups.
    const league = Object.values(world.leagues).find((l) => l.tier === 1)!;
    const fromResults = competitionGoals(world, league.id);
    for (const [id, line] of competitionTotals(world, league.id))
      expect(line.goals).toBe(fromResults.get(id) ?? 0);
  }, 300000);

  it('keeps a loan spell apart from the parent club, and both in the league total', () => {
    const world = generateWorld('competition-stats-loan', { format: 'legacy' });
    const league = Object.values(world.leagues)[0]!;
    const [parentId, loanId] = league.clubIds as [Id, Id];
    const xi = (clubId: Id) =>
      selectStartingPlayers(world.clubs[clubId]!.playerIds.map((id) => world.players[id]!)).map(
        (p) => p.id,
      );
    const loanee = xi(parentId).find((id) => world.players[id]!.primaryPosition !== 'GK')!;
    for (const [clubId, week] of [
      [parentId, 1],
      [loanId, 2],
    ] as const) {
      const fixture = Object.values(world.fixtures).find(
        (f) =>
          f.competitionId === league.id &&
          f.date.week === week &&
          (f.homeId === clubId || f.awayId === clubId),
      )!;
      const home = fixture.homeId === clubId;
      const own = [
        ...xi(clubId)
          .filter((id) => id !== loanee)
          .slice(0, 10),
        loanee,
      ];
      const other = xi(home ? fixture.awayId : fixture.homeId);
      const minutes = (ids: Id[]) => Object.fromEntries(ids.map((id) => [id, 90]));
      const [homeIds, awayIds] = home ? [own, other] : [other, own];
      applyFinalizedFixture(
        world,
        finalizeFixture(world, fixture, {
          score: home ? [1, 0] : [0, 1],
          goals: [{ playerId: loanee, teamId: clubId, minute: 30 }],
          minutes: { home: minutes(homeIds), away: minutes(awayIds) },
          onPitch: { home: homeIds, away: awayIds },
          selected: { playerId: other[0]!, rating: 6.5 },
        }),
      );
    }
    const lines = world.seasonStats!.competitions[league.id]!;
    expect(lines[parentId]![loanee]!.slice(0, 3)).toEqual([1, 90, 1]);
    expect(lines[loanId]![loanee]!.slice(0, 3)).toEqual([1, 90, 1]);
    expect(competitionTotals(world, league.id).get(loanee)).toMatchObject({ apps: 2, goals: 2 });
    expect(appearedFor(world, league.id, parentId, loanee)).toBe(true);
    expect(appearedFor(world, league.id, loanId, loanee)).toBe(true);
    const unused = world.clubs[loanId]!.playerIds.find((id) => !lines[loanId]![id])!;
    expect(appearedFor(world, league.id, loanId, unused)).toBe(false);
  });

  it('rejects tampered statistics and survives export and import', () => {
    const world = clone(complete);
    const save = createSave(1, 'Statistics', {
      kind: 'world',
      world,
      gallery: { seed: 'stats', generation: 0 },
      settings: DEFAULT_SETTINGS,
    });
    const imported = parseSave(JSON.stringify(save));
    if (imported.payload.kind !== 'world') throw new Error('Expected a world save');
    expect(imported.payload.world.seasonStats).toEqual(world.seasonStats);
    const leagueId = careerLeagueId(world);
    const [clubId, lines] = Object.entries(world.seasonStats!.competitions[leagueId]!)[0]!;
    const playerId = Object.keys(lines)[0]!;
    const tamper = (change: (w: World) => void) => {
      const copy = clone(world);
      change(copy);
      return () => validateWorld(copy);
    };
    const line = (w: World) => w.seasonStats!.competitions[leagueId]![clubId]![playerId]!;
    expect(tamper(() => {})).not.toThrow();
    // A goal the results do not hold, a negative count, impossible ratings and clean sheets.
    expect(tamper((w) => (line(w)[2] += 1))).toThrow();
    expect(tamper((w) => (line(w)[3] = -1))).toThrow();
    expect(tamper((w) => (line(w)[5] = line(w)[0] * 11))).toThrow();
    expect(tamper((w) => (line(w)[4] = line(w)[0] + 1))).toThrow();
    expect(tamper((w) => (w.seasonStats!.season -= 1))).toThrow();
    expect(
      tamper((w) => {
        w.seasonStats!.competitions[leagueId]!['club:missing'] = {};
      }),
    ).toThrow();
    expect(
      tamper((w) => {
        w.seasonStats!.competitions[leagueId]![clubId]!['player:missing'] = [1, 90, 0, 0, 0, 6];
      }),
    ).toThrow();
  });

  it("keeps an older save's award mode until its next season, then counts competitions", () => {
    // A save from before Phase 1.3: schema 13 and no competition statistics.
    const world = clone(complete);
    delete world.seasonStats;
    // Its award baselines were taken at the start of the season, when every total was zero.
    for (const id of Object.keys(world.players)) world.awardState!.seasonStart[id] = [0, 0, 0, 0];
    const old = {
      ...createSave(2, 'Older career', {
        kind: 'world',
        world,
        gallery: { seed: 'older', generation: 0 },
        settings: DEFAULT_SETTINGS,
      }),
      schemaVersion: 13,
    };
    const migrated = migrateSave(JSON.parse(JSON.stringify(old)));
    expect(migrated.schemaVersion).toBe(18);
    if (migrated.payload.kind !== 'world') throw new Error('Expected a world save');
    const loaded = migrated.payload.world;
    expect(hasSeasonStatistics(loaded)).toBe(false);
    // That season's awards keep the earlier mode, where a cup goal still counts.
    const leagueId = careerLeagueId(loaded);
    const league = competitionGoals(loaded, leagueId);
    const best = Math.max(...league.values());
    const [cupScorer] = [...league.entries()].find(([, goals]) => goals < best)!;
    loaded.players[cupScorer]!.stats.goals += best + 5;
    expect(rerunAwards(loaded).winnerIds).toEqual([cupScorer]);
    const issued = loaded.awards.filter((award) => award.season === loaded.date.season);
    // The next season starts complete statistics, and the issued awards are kept.
    const next = startNextSeason(loaded);
    expect(hasSeasonStatistics(next)).toBe(true);
    expect(next.seasonStats).toEqual({
      version: 1,
      season: loaded.date.season + 1,
      competitions: {},
    });
    expect(next.awardState!.seasonStart).toEqual({});
    expect(next.awards.filter((award) => award.season === loaded.date.season)).toEqual(issued);
    expect(() => validateWorld(clone(next))).not.toThrow();
  });

  it('clears the season lines at rollover after a transfer', () => {
    const world = clone(complete);
    const leagueId = careerLeagueId(world);
    const [scorer] = [...competitionTotals(world, leagueId)].sort(
      (a, b) => b[1].goals - a[1].goals,
    )[0]!;
    const away = Object.values(world.leagues).find((l) => l.id !== leagueId)!;
    move(world, scorer, away.clubIds[0]!);
    const goals = world.players[scorer]!.stats.goals;
    const next = startNextSeason(world);
    expect(next.seasonStats!.season).toBe(world.date.season + 1);
    expect(next.seasonStats!.competitions).toEqual({});
    // Lifetime totals stay; only the current-season lines start again.
    const after = next.players[scorer] ?? next.archive?.players[scorer];
    expect(after?.stats.goals).toBe(goals);
    expect(() => validateWorld(clone(next))).not.toThrow();
  });
});
