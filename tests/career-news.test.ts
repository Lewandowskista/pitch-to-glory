import { beforeAll, describe, expect, it } from 'vitest';
import type { GameEvent, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { injure } from '../src/engine/career/training';
import { createRng } from '../src/engine/rng';
import { rivalOf } from '../src/engine/career/social';
import { validateWorld } from '../src/persistence/worldSchema';
import { format, t } from '../src/i18n';

/** Phase 7 (C7): a career's debut, first goal, injuries and rivalry in the world's news. */
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
const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const valid = (world: World) => expect(() => validateWorld(clone(world))).not.toThrow();
let start: World;
let played: World;
beforeAll(() => {
  const base = generateWorld('career-news', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'career-news')[0]!;
  start = createCareer(base, draft, trial.id, 'career-news');
  played = clone(start);
  // Play on until the career has its first goal (or half a season has gone by).
  for (let week = 0; week < 20 && played.phase === 'active'; week++) {
    played = advanceCareerWeek(played, { inPlace: true, autoPlay: true }).world;
    if (played.players[played.career!.playerId]!.stats.goals > 0) break;
  }
}, 300000);
const newsOf = (world: World, kind: GameEvent['kind']) =>
  world.events.filter((event) => event.kind === kind);
const wording = (event: GameEvent) =>
  format(t.world.careerEvents[event.kind as keyof typeof t.world.careerEvents], event.params);

describe('career news in the world feed', () => {
  it('announces the rivalry when the career begins', () => {
    const [event] = newsOf(start, 'rivalry');
    const player = start.players[start.career!.playerId]!;
    const rival = rivalOf(start)!;
    expect(newsOf(start, 'rivalry')).toHaveLength(1);
    expect(event!.entityIds).toEqual([player.id, rival.id]);
    expect(event!.params).toMatchObject({ name: player.name, rival: rival.name });
    expect(wording(event!)).not.toMatch(/[{}]/);
    valid(start);
  });

  it('records the debut and the first goal once each', () => {
    const player = played.players[played.career!.playerId]!;
    expect(player.stats.appearances).toBeGreaterThan(0);
    const debut = newsOf(played, 'debut');
    expect(debut).toHaveLength(1);
    const first = played.career!.matches[0]!;
    expect(debut[0]!.params).toMatchObject({
      name: player.name,
      opponent: played.clubs[first.opponentId]!.name,
    });
    expect(debut[0]!.date).toMatchObject({ season: first.season, week: first.week });
    expect(wording(debut[0]!)).not.toMatch(/[{}]/);
    const goals = newsOf(played, 'first-goal');
    if (player.stats.goals > 0) {
      expect(goals).toHaveLength(1);
      const scored = played.career!.matches.find((match) => match.goals > 0)!;
      expect(goals[0]!.date).toMatchObject({ season: scored.season, week: scored.week });
      expect(wording(goals[0]!)).not.toMatch(/[{}]/);
    } else expect(goals).toHaveLength(0);
    valid(played);
  });

  it('reports injuries longer than a knock', () => {
    const world = clone(start);
    const before = newsOf(world, 'injury').length;
    injure(world, 'match', createRng('news-knock'), 'knock');
    const knock = world.career!.injury!;
    expect(newsOf(world, 'injury')).toHaveLength(before + (knock.weeksRemaining >= 2 ? 1 : 0));
    const serious = clone(start);
    const injury = injure(serious, 'match', createRng('news-calf'), 'calf-tear');
    const [event] = newsOf(serious, 'injury').slice(-1);
    expect(event!.params).toMatchObject({ weeks: injury.weeksRemaining });
    expect(wording(event!)).toContain(String(injury.weeksRemaining));
    valid(serious);
  });

  it('rejects an unknown event kind', () => {
    const world = clone(start);
    world.events.push({ ...world.events.at(-1)!, kind: 'gossip' as GameEvent['kind'] });
    expect(() => validateWorld(world)).toThrow();
  });
});
