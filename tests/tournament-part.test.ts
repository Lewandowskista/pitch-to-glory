import { describe, expect, it } from 'vitest';
import { tournamentPart } from '../src/engine/career/honours/trophies';
import type { Legacy, Tournament, World } from '../src/model/domain';

const part = { nationId: 'nation:eng', stage: 'winner', inSquad: true } as const;
const tournament = (year: number): Tournament => ({
  id: `tournament:${year}`,
  kind: year % 4 === 0 ? 'continental' : 'world',
  name: `Cup ${year}`,
  year,
  groups: [],
  matchIds: [],
  winnerId: 'nation:eng',
  runnerUpId: 'nation:fra',
  career: part,
});
const legacy = (playerId: string, startSeason: number, retired: number) =>
  ({ playerId, startSeason, retiredAt: { season: retired, week: 60, day: 7 } }) as Legacy;
/** A parent who played 2026–2040, and their child, who started in the season the parent retired. */
const world = {
  career: { playerId: 'career:child', startSeason: 2040 },
  legacies: [legacy('career:parent', 2026, 2040)],
} as unknown as World;

describe('a stored tournament belongs to the career that played it (0.9.1)', () => {
  it('gives the parent the tournaments of their career, up to the one after they retired', () => {
    expect(tournamentPart(world, 'career:parent', tournament(2026))).toBeNull();
    expect(tournamentPart(world, 'career:parent', tournament(2028))).toEqual(part);
    expect(tournamentPart(world, 'career:parent', tournament(2041))).toEqual(part);
    expect(tournamentPart(world, 'career:parent', tournament(2042))).toBeNull();
  });
  it("never gives the child the parent's tournaments, even one held after the parent's last season", () => {
    for (const year of [2028, 2040, 2041])
      expect(tournamentPart(world, 'career:child', tournament(year))).toBeNull();
    expect(tournamentPart(world, 'career:child', tournament(2042))).toEqual(part);
  });
  it('gives a player with no career in the world no tournaments', () => {
    expect(tournamentPart(world, 'player:someone', tournament(2042))).toBeNull();
  });
});
