import { beforeAll, describe, expect, it } from 'vitest';
import type { Fixture, Position, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { matchPlan, type PlanGroup, type PlanStyle } from '../src/engine/career/brief';
import { careerSelection } from '../src/engine/career/market/rules';
import { clubLineup } from '../src/engine/selection/world';
import { playerAbility } from '../src/engine/strength';
import { STYLES } from '../src/engine/world/catalog';
import { planText } from '../src/screens/career/briefUi';
import { briefText } from '../src/i18n/brief';

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
  const base = generateWorld('brief-tests', { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', 'brief-tests')[0]!;
  start = createCareer(base, draft, trial.id, 'brief-tests');
}, 60000);
const clone = (world: World): World => structuredClone(world);
const careerPlayer = (world: World) => world.players[world.career!.playerId]!;
const clubOf = (world: World) => world.clubs[careerPlayer(world).clubId!]!;
/** The career club's first fixture of the season. */
function firstFixture(world: World): Fixture {
  const clubId = clubOf(world).id;
  return Object.values(world.fixtures)
    .filter((f) => f.homeId === clubId || f.awayId === clubId)
    .sort((a, b) => a.date.week - b.date.week || a.date.day - b.date.day)[0]!;
}
/** Make the career player an outstanding first choice in a position. */
function playAt(world: World, position: Position): void {
  const player = careerPlayer(world);
  player.primaryPosition = position;
  player.secondaryPositions = [];
  for (const key of Object.keys(player.attributes) as (keyof typeof player.attributes)[])
    player.attributes[key] = 95;
  if (player.keeperAttributes)
    for (const key of Object.keys(
      player.keeperAttributes,
    ) as (keyof typeof player.keeperAttributes)[])
      player.keeperAttributes[key] = 95;
  // Every position has a slot: the 4-2-3-1 is the one with a number 10.
  world.managers[clubOf(world).managerId]!.preferredFormation =
    position === 'AM' ? '4-2-3-1' : '4-3-3';
  world.career!.market.registeredFrom = { season: 0, week: 1, day: 1 };
}
const GROUP: Record<Position, PlanGroup> = {
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

describe("the manager's pre-match plan", () => {
  it('is deterministic and draws on no random stream', () => {
    const world = clone(start);
    const fixture = firstFixture(world);
    const before = JSON.stringify(world);
    const plan = matchPlan(world, fixture);
    expect(plan).not.toBeNull();
    expect(JSON.stringify(world)).toBe(before);
    expect(matchPlan(clone(world), fixture)).toEqual(plan);
  });

  it('places every position in its group with the slot the manager has in mind', () => {
    for (const position of Object.keys(GROUP) as Position[]) {
      const world = clone(start);
      playAt(world, position);
      const fixture = firstFixture(world);
      const plan = matchPlan(world, fixture)!;
      expect(plan.position, position).toBe(careerSelection(world, fixture).competition.position);
      expect(plan.position, position).toBe(position);
      expect(plan.group, position).toBe(GROUP[position]);
      expect(plan.role, position).toBe('start');
      const text = planText(plan);
      expect(text.headline).toContain(briefText.where[position]);
      expect(`${text.headline} ${text.instruction} ${text.note}`).not.toMatch(/[{}]|undefined/);
    }
  });

  it('follows the club’s playing style, with copy for every group and style', () => {
    for (const style of STYLES) {
      const world = clone(start);
      clubOf(world).playingStyle = style;
      const plan = matchPlan(world, firstFixture(world))!;
      expect(plan.style).toBe(style);
      expect(plan.key).toBe(`${plan.group}.${style}`);
    }
    const groups: PlanGroup[] = ['keeper', 'defence', 'fullback', 'midfield', 'wide', 'attack'];
    for (const group of groups)
      for (const style of STYLES as readonly PlanStyle[])
        expect(briefText.plans[`${group}.${style}`], `${group}.${style}`).toBeTruthy();
  });

  it('attacks the channel of the weaker full-back and names who is faced', () => {
    const world = clone(start);
    playAt(world, 'ST');
    const fixture = firstFixture(world);
    const plan = matchPlan(world, fixture)!;
    const opponentId = fixture.homeId === clubOf(world).id ? fixture.awayId : fixture.homeId;
    const lineup = clubLineup(world, world.clubs[opponentId]!)!;
    const at = (position: Position) =>
      world.players[lineup.starterIds[lineup.slots.indexOf(position)]!]!;
    const [left, right] = [at('LB'), at('RB')];
    const weaker = playerAbility(right) <= playerAbility(left) ? right : left;
    expect(plan.params.side).toBe(weaker === right ? 'left' : 'right');
    expect(plan.params.target).toBe(weaker.name);
    // A winger faces the full-back on their flank; a centre-back their best forward.
    playAt(world, 'LW');
    const winger = matchPlan(world, fixture)!;
    expect(winger.params).toMatchObject({ side: 'left', target: right.name });
    playAt(world, 'CB');
    expect(matchPlan(world, fixture)!.params.danger).toBeTruthy();
  });

  it('reads the occasion through the club’s culture', () => {
    const world = clone(start);
    const fixture = firstFixture(world);
    const own = clubOf(world);
    const opponent = world.clubs[fixture.homeId === own.id ? fixture.awayId : fixture.homeId]!;
    own.reputation = 99;
    opponent.reputation = 1;
    own.culture = { ...own.culture, winNow: 30 };
    expect(matchPlan(world, fixture)).toMatchObject({ outlook: 'favourite', note: 'favourite' });
    own.culture.winNow = 80;
    expect(matchPlan(world, fixture)!.note).toBe('win-now');
    own.reputation = 1;
    opponent.reputation = 99;
    own.culture.attacking = 30;
    expect(matchPlan(world, fixture)).toMatchObject({ outlook: 'underdog', note: 'underdog' });
    own.culture.attacking = 80;
    expect(matchPlan(world, fixture)!.note).toBe('brave');
  });

  it('puts an unpicked player on the bench and an unregistered one in the stands', () => {
    const world = clone(start);
    const fixture = firstFixture(world);
    world.career!.market.registeredFrom = { season: world.date.season + 1, week: 1, day: 1 };
    expect(matchPlan(world, fixture)!.role).toBe('unregistered');
    const later = clone(start);
    const player = careerPlayer(later);
    for (const key of Object.keys(player.attributes) as (keyof typeof player.attributes)[])
      player.attributes[key] = 5;
    player.form = 0;
    later.career!.market.registeredFrom = { season: 0, week: 1, day: 1 };
    const next = Object.values(later.fixtures).find(
      (f) =>
        (f.homeId === clubOf(later).id || f.awayId === clubOf(later).id) &&
        f.date.week > later.date.week,
    )!;
    expect(careerSelection(later, next).probability).toBeLessThan(0.5);
    expect(matchPlan(later, next)!.role).toBe('bench');
    expect(planText(matchPlan(later, next)!).headline).toMatch(/bench/);
  });

  it('gives no plan while injured or for another club’s fixture', () => {
    const world = clone(start);
    const own = clubOf(world).id;
    const other = Object.values(world.fixtures).find((f) => f.homeId !== own && f.awayId !== own)!;
    expect(matchPlan(world, other)).toBeNull();
    careerPlayer(world).injuryId = 'injury:test';
    expect(matchPlan(world, firstFixture(world))).toBeNull();
  });
});
