import { beforeAll, describe, expect, it } from 'vitest';
import type { CareerMatchRecord, MatchEvent, SeasonLine, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { nextCareerFixture } from '../src/engine/career/fixtures';
import { autoPlayCommand, careerMatchSetup, defaultTactics } from '../src/engine/career/matches';
import { applyMatchCommand, createMatchSession, type MatchSession } from '../src/engine/match';
import { captureMoments } from '../src/engine/career/honours/moments';
import { honoursMatch } from '../src/engine/career/honours/week';
import { backLine, rivalOutput, seasonLines } from '../src/engine/career/social/rival';
import { STORYLETS } from '../src/engine/career/stories/storylets';
import { validateWorld } from '../src/persistence/worldSchema';
import { createRng } from '../src/engine/rng';

/**
 * Review phase 3, step 3.4: a keeper's or defender's career collects Moments, rival verdicts
 * and Chronicle landmarks of its own, not only a scorer's.
 */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const draft = (position: CareerDraft['position'], archetype: string): CareerDraft => ({
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
  position,
  foot: 'right',
  age: 17,
  archetype,
});

let keeper: World;
let played: MatchSession;
beforeAll(() => {
  const base = generateWorld('every-position', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'every-position')[0]!;
  keeper = createCareer(base, draft('GK', 'shot-stopper'), trial.id, 'every-position');
  const fixture = nextCareerFixture(keeper)!;
  const setup = careerMatchSetup(keeper, fixture);
  played = createMatchSession(setup, defaultTactics(keeper, setup));
  while (played.state.match.status !== 'finished')
    played = applyMatchCommand(played, autoPlayCommand(played));
}, 120000);

/** The played match with one more event by the keeper: a save or challenge that worked. */
function withEvent(
  kind: MatchEvent['kind'],
  choiceId: string,
  minute: number,
  probability = 0.5,
  momentId = 'moment:test',
): MatchSession {
  const session = clone(played);
  const playerId = session.setup.selectedPlayerId;
  session.state.match.events.push({
    id: `event:test:${choiceId}`,
    kind,
    teamId: session.setup.players[playerId]!.clubId!,
    playerId,
    minute,
    commentaryKey: 'match.commentary.save.success',
    point: { x: 10, y: 50 },
    outcome: {
      input: { momentId, choiceId },
      success: true,
      roll: 0.1,
      probability,
      factors: [],
    },
  } as MatchEvent);
  return session;
}
const capture = (session: MatchSession) => {
  const world = clone(keeper);
  world.moments = [];
  const ids = captureMoments(world, session, 1);
  return ids.map((id) => world.moments.find((moment) => moment.id === id)!.kind);
};

describe('moments for every position', () => {
  it('keeps a saved penalty', () => {
    expect(capture(withEvent('save', 'penalty-read', 60))).toContain('penalty-save');
  });

  it('keeps a long-odds save late in a close game, but not an easy or early one', () => {
    const [home, away] = played.state.match.score;
    if (Math.abs(home - away) > 1) return;
    const lost = played.setup.home.playerIds.includes(played.setup.selectedPlayerId)
      ? home < away
      : away < home;
    const late = capture(withEvent('save', 'tip-over', 80, 0.25));
    expect(late.includes('great-save')).toBe(!lost);
    expect(capture(withEvent('save', 'tip-over', 80, 0.8))).not.toContain('great-save');
    expect(capture(withEvent('save', 'tip-over', 20, 0.25))).not.toContain('great-save');
  });

  it('keeps a goal-line clearance unless the game was lost', () => {
    const [home, away] = played.state.match.score;
    const own = played.setup.home.playerIds.includes(played.setup.selectedPlayerId) ? 0 : 1;
    const lost = (own === 0 ? home : away) < (own === 0 ? away : home);
    const kinds = capture(withEvent('tackle', 'goal-line-clear', 70));
    expect(kinds.includes('last-ditch')).toBe(!lost);
  });

  it('keeps the save that wins a shootout', () => {
    const session = withEvent('save', 'penalty-stay', 120, 0.3, 'moment:shootout');
    const own = session.setup.home.playerIds.includes(session.setup.selectedPlayerId) ? 0 : 1;
    session.state.match.keyMoments.push({
      ...clone(session.state.match.keyMoments[0] ?? ({} as never)),
      id: 'moment:shootout',
      follows: 'shootout',
    });
    session.state.shootout = {
      choiceId: 'penalty-stay',
      probability: 0.3,
      roll: 0.1,
      success: true,
    };
    session.state.penalties = own === 0 ? [4, 3] : [3, 4];
    expect(capture(session)).toContain('shootout');
    session.state.penalties = own === 0 ? [3, 4] : [4, 3];
    expect(capture(session)).not.toContain('shootout');
  });
});

describe('rivals judged by their line', () => {
  const line = (goals: number, assists: number, cleanSheets: number): SeasonLine => ({
    clubId: 'club:x',
    appearances: 30,
    goals,
    assists,
    rating: 7,
    cleanSheets,
  });
  it('weighs clean sheets for keepers and defenders, goals for the rest', () => {
    expect(backLine('GK')).toBe(true);
    expect(backLine('CB')).toBe(true);
    expect(backLine('ST')).toBe(false);
    // A keeper with more clean sheets is ahead of one who set up a goal.
    expect(rivalOutput(line(0, 0, 12), 'GK')).toBeGreaterThan(rivalOutput(line(0, 1, 8), 'GK'));
    expect(rivalOutput(line(2, 1, 10), 'CB')).toBeGreaterThan(rivalOutput(line(4, 1, 5), 'CB'));
    // A striker's clean sheets do not count.
    expect(rivalOutput(line(10, 3, 12), 'ST')).toBe(13);
  });

  it('settles a keeper’s war of words by what keepers do', () => {
    const story = STORYLETS.find((entry) => entry.kind === 'rival-war')!;
    const world = clone(keeper);
    const lines = seasonLines(world)!;
    expect(lines).not.toBeNull();
    const now = {
      career: rivalOutput(lines.career, 'GK'),
      rival: rivalOutput(lines.rival, 'GK'),
    };
    const rng = createRng('rival-war');
    // Since the story began the rival gained ten points of keeper's output, the player none.
    const behind = story.resolve!(
      world,
      { params: { rival: 'X', output: now.career, rivalOutput: now.rival - 10 } } as never,
      rng,
    );
    expect(behind.outcome).toBe('lost');
    // The player gained ten, the rival none.
    const ahead = story.resolve!(
      world,
      { params: { rival: 'X', output: now.career - 10, rivalOutput: now.rival } } as never,
      rng,
    );
    expect(ahead.outcome).toBe('won');
  });
});

describe('Chronicle landmarks for every position', () => {
  it('marks a keeper’s first clean sheet, clean-sheet and assist milestones', () => {
    const world = clone(keeper);
    const player = world.players[world.career!.playerId]!;
    const record = {
      opponentId: Object.keys(world.clubs)[1]!,
      goals: 0,
      assists: 1,
      cleanSheet: true,
    } as CareerMatchRecord;
    player.stats.appearances = 5;
    player.stats.cleanSheets = 1;
    player.stats.assists = 1;
    honoursMatch(world, played, record, 1);
    const kinds = world.chronicle.map((entry) => entry.kind);
    expect(kinds).toContain('first-clean-sheet');
    expect(kinds).toContain('first-assist');
    player.stats.cleanSheets = 25;
    player.stats.assists = 25;
    honoursMatch(world, played, record, 1);
    const later = world.chronicle.map((entry) => entry.kind);
    expect(later).toContain('clean-sheet-milestone');
    expect(later).toContain('assist-milestone');
    expect(() => validateWorld(clone(world))).not.toThrow();
  });
});
