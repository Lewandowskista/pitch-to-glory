import { beforeAll, describe, expect, it } from 'vitest';
import type { Award, Position, World } from '../src/model/domain';
import { CONFIG } from '../src/engine/config';
import { generateWorld } from '../src/engine/world/generate';
import { startNextSeason } from '../src/engine/world/simulate';
import { decidedTitles } from '../src/engine/world/titles';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import {
  achievementScore,
  addAchievement,
  awardAchievement,
  contribution,
  creditCaps,
  creditTitles,
  seasonContributions,
  tierWeight,
} from '../src/engine/career/honours/achievements';
import { careerHallOfFameScore, hallOfFameRank } from '../src/engine/career/honours/retirement';
import { validateWorld } from '../src/persistence/worldSchema';

const F = CONFIG.career.honours.hallOfFame;
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
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
  position: 'GK',
  foot: 'right',
  age: 17,
  archetype: 'shot-stopper',
};

let season: World;
beforeAll(() => {
  const base = generateWorld('achievement-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'achievement-tests')[0]!;
  season = createCareer(base, draft, trial.id, 'achievement-tests');
  while (season.phase === 'active')
    season = advanceCareerWeek(season, { inPlace: true, autoPlay: true }).world;
}, 300000);

describe('one record for every player', () => {
  it('starts with new worlds and fills over a season', () => {
    expect(season.achievements).toMatchObject({ version: 1 });
    const scored = Object.values(season.players).filter((p) => (p.hallOfFame ?? 0) > 0);
    expect(scored.length).toBeGreaterThan(100);
    expect(() => validateWorld(clone(season))).not.toThrow();
  });

  it('scores identical records identically, active, archived or the career itself', () => {
    const world = clone(season);
    const careerPlayer = world.players[world.career!.playerId]!;
    const other = Object.values(world.players).find(
      (p) => p.id !== careerPlayer.id && !p.retired && p.clubId,
    )!;
    other.hallOfFame = careerPlayer.hallOfFame;
    expect(achievementScore(world, other)).toBe(careerHallOfFameScore(world));
    // Archiving keeps the points, so the rank of everyone else is unchanged.
    const probe = 200;
    const before = hallOfFameRank(world, probe, careerPlayer.id);
    other.retired = true;
    const next = startNextSeason(world);
    expect(next.archive!.players[other.id]!.hallOfFame).toBe(other.hallOfFame);
    expect(hallOfFameRank(next, probe, careerPlayer.id)).toEqual(before);
  }, 120000);

  it('weighs contributions by line and by level', () => {
    // Elite careers of 573 appearances in the top tier, by line.
    const strong: [Position, number, number, number][] = [
      ['GK', 0, 0, 220],
      ['CB', 27, 9, 194],
      ['CM', 100, 120, 170],
      ['ST', 260, 80, 0],
    ];
    const scores = strong.map(([position, goals, assists, cleanSheets]) =>
      contribution(position, { appearances: 573, goals, assists, cleanSheets }),
    );
    const top = Math.max(...scores);
    for (const value of scores) expect(value / top).toBeGreaterThan(0.75);
    // A lower tier counts for less.
    expect(tierWeight(1)).toBe(1);
    expect(tierWeight(4)).toBeLessThan(tierWeight(2));
    const world = clone(season);
    world.phase = 'active';
    const [first, fourth] = [1, 4].map(
      (tier) => Object.values(world.leagues).find((league) => league.tier === tier)!,
    );
    world.seasonStats!.competitions = {};
    const lines = [first!, fourth!].map((league) => {
      const clubId = league.clubIds[0]!;
      const playerId = world.clubs[clubId]!.playerIds.find(
        (id) => world.players[id]!.primaryPosition === 'ST',
      )!;
      world.seasonStats!.competitions[league.id] = {
        [clubId]: { [playerId]: [30, 2700, 15, 5, 0, 210] },
      };
      return playerId;
    });
    const points = seasonContributions(world);
    expect(points.get(lines[1]!)! / points.get(lines[0]!)!).toBeCloseTo(tierWeight(4), 5);
  });

  it('credits each title once, to everyone who played in the campaign', () => {
    const world = clone(season);
    const title = decidedTitles(world)[0]!;
    const stats = world.seasonStats!.competitions;
    const winners = title.campaign.flatMap((id) =>
      Object.entries(stats[id]?.[title.clubId] ?? {})
        .filter(([, line]) => line[0] > 0)
        .map(([playerId]) => playerId),
    );
    expect(winners.length).toBeGreaterThan(10);
    world.achievements!.titles = world.achievements!.titles.filter(
      (id) => id !== `${world.date.season}:${title.competitionId}`,
    );
    const before = new Map(winners.map((id) => [id, world.players[id]?.hallOfFame ?? 0]));
    creditTitles(world);
    const gained = winners.map((id) => (world.players[id]?.hallOfFame ?? 0) - before.get(id)!);
    expect(new Set(gained.map((value) => Math.round(value)))).toEqual(
      new Set([Math.round(gained[0]!)]),
    );
    expect(gained[0]).toBeGreaterThan(0);
    const again = winners.map((id) => world.players[id]?.hallOfFame ?? 0);
    creditTitles(world);
    expect(winners.map((id) => world.players[id]?.hallOfFame ?? 0)).toEqual(again);
  });

  it('values awards by kind, leaving monthly awards out', () => {
    const award = (kind: Award['kind']) => ({ kind });
    expect(awardAchievement(award('month'))).toBe(0);
    expect(awardAchievement(award('golden-ball'))).toBe(F.goldenBall);
    expect(awardAchievement(award('mvp'))).toBe(F.awardWeights.mvp);
    expect(awardAchievement(award('team-season'))).toBeLessThan(awardAchievement(award('mvp')));
    // Awards now cover every top-two-tier league, not just the career's.
    const leagues = new Set(
      season.awards
        .filter((a) => a.kind === 'golden-boot' && a.season === season.date.season)
        .map((a) => a.competitionId),
    );
    expect(leagues.size).toBeGreaterThan(1);
  });

  it('caps other internationals, while the career player is credited by their own matches', () => {
    const world = clone(season);
    const careerId = world.career!.playerId;
    const other = Object.keys(world.players).find((id) => id !== careerId)!;
    const before = [careerId, other].map((id) => world.players[id]!.hallOfFame ?? 0);
    creditCaps(world, [careerId, other], 2);
    expect(world.players[careerId]!.hallOfFame ?? 0).toBe(before[0]);
    expect(world.players[other]!.hallOfFame).toBeCloseTo(before[1]! + 2 * F.cap, 5);
  });

  it('is adopted by an older world at a season start, from what was kept', () => {
    const world = clone(season);
    delete world.achievements;
    for (const player of Object.values(world.players)) delete player.hallOfFame;
    for (const record of Object.values(world.archive?.players ?? {})) delete record.hallOfFame;
    const next = startNextSeason(world);
    expect(next.achievements).toEqual({ version: 1, since: next.date.season, titles: [] });
    const veteran = Object.values(next.players).find((p) => p.stats.appearances > 20 && p.clubId)!;
    expect(veteran.hallOfFame).toBeGreaterThan(0);
    addAchievement(next, veteran.id, 10);
    expect(() => validateWorld(clone(next))).not.toThrow();
  }, 120000);
});
