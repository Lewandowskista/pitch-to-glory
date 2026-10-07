import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { advanceCareerWeek } from '../src/engine/career/season';
import { pendingCareerFixture } from '../src/engine/career/fixtures';
import {
  autoPlayCommand,
  careerMatchSetup,
  commitCareerMatch,
  defaultTactics,
  type CareerMatchOutcome,
} from '../src/engine/career/matches';
import { applyMatchCommand, createMatchSession } from '../src/engine/match';
import type { MatchSession } from '../src/engine/match/types';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import type { SlotId } from '../src/model/domain';
import { useAppStore } from '../src/store';

const clone = (world: World): World => JSON.parse(JSON.stringify(world)) as World;
const draft = (name: string): CareerDraft => ({
  name,
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
});
function careerWorld(seed: string, name: string): World {
  const base = generateWorld(seed, { format: 'legacy' });
  const trial = trialOffers(base, 'country:0', seed)[0]!;
  return createCareer(base, draft(name), trial.id, seed);
}
/** A career world with its first fixture played and committed, plus that match's report. */
function playedCareer(seed: string, name: string) {
  const world = careerWorld(seed, name);
  advanceCareerWeek(world, { inPlace: true });
  const fixture = pendingCareerFixture(world)!;
  let session: MatchSession = createMatchSession(
    careerMatchSetup(world, fixture),
    defaultTactics(world),
  );
  while (session.state.match.status !== 'finished')
    session = applyMatchCommand(session, autoPlayCommand(session));
  const outcome: CareerMatchOutcome = commitCareerMatch(world, session);
  return { world, session, outcome };
}
const saveOf = (slot: SlotId, world: World) =>
  createSave(slot, `Slot ${slot}`, {
    kind: 'world',
    world: clone(world),
    gallery: { seed: 'store-session', generation: 0 },
    settings: DEFAULT_SETTINGS,
  });

let first: ReturnType<typeof playedCareer>;
let second: World;
beforeAll(() => {
  first = playedCareer('store-session-a', 'Robin Vale');
  second = careerWorld('store-session-b', 'Sam Okafor');
});
beforeEach(() => {
  useAppStore.setState({ activeSave: null, world: null, matchSession: null, careerResult: null });
});
/** Slot 1 is loaded and its match has just been committed, so its report is on screen. */
function reportInSlotOne() {
  useAppStore.getState().applySave(saveOf(1, first.world));
  useAppStore.getState().setCareerResult({ session: first.session, outcome: first.outcome });
  expect(useAppStore.getState().careerResult).not.toBeNull();
}

describe('transient match report across saves', () => {
  it('never shows a report from slot 1 after slot 2 is loaded', () => {
    reportInSlotOne();
    useAppStore.getState().applySave(saveOf(2, second));
    expect(useAppStore.getState().world!.career!.playerId).toBe(second.career!.playerId);
    expect(useAppStore.getState().careerResult).toBeNull();
  });
  it('drops the report when a later state of the same career is loaded', () => {
    reportInSlotOne();
    const later = clone(first.world);
    const played = later.career!.matches.length;
    while (later.career!.matches.length === played)
      advanceCareerWeek(later, { inPlace: true, autoPlay: true });
    useAppStore.getState().applySave(saveOf(1, later));
    expect(useAppStore.getState().careerResult).toBeNull();
  });
  it('drops the report when a different world replaces the loaded one', () => {
    reportInSlotOne();
    useAppStore.getState().clearSession();
    useAppStore.getState().setWorld(clone(second));
    expect(useAppStore.getState().careerResult).toBeNull();
  });
  it('keeps the report when the same career is saved to another slot', () => {
    reportInSlotOne();
    useAppStore.getState().applySave(saveOf(3, useAppStore.getState().world!));
    expect(useAppStore.getState().careerResult?.outcome).toBe(first.outcome);
  });
  it('keeps the report through an edit of the career world and a detached save', () => {
    reportInSlotOne();
    const edited = clone(useAppStore.getState().world!);
    edited.career!.training = { ...edited.career!.training };
    useAppStore.getState().setWorld(edited);
    useAppStore.getState().clearSession();
    expect(useAppStore.getState().world).toBe(edited);
    expect(useAppStore.getState().careerResult?.outcome).toBe(first.outcome);
  });
  it('keeps the report set during commit, before the committed world arrives', () => {
    // The worker client stores the report, then replaces the world with the committed one.
    const before = clone(first.world);
    before.career!.matches.pop();
    useAppStore.getState().applySave(saveOf(1, before));
    useAppStore.getState().setCareerResult({ session: first.session, outcome: first.outcome });
    useAppStore.getState().setWorld(clone(first.world));
    expect(useAppStore.getState().careerResult?.outcome).toBe(first.outcome);
  });
});
