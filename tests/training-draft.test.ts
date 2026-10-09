import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateWorld } from '../src/engine/world/generate';
import { createCareer, trialOffers } from '../src/engine/career/create';
import { createSave, DEFAULT_SETTINGS } from '../src/persistence/schema';
import { useAppStore } from '../src/store';
import type { TrainingPlan, World } from '../src/model/domain';
import * as session from '../src/persistence/session';
import { startWorldJob } from '../src/workers/client';
import * as transitions from '../src/store/trainingTransitions';

const storage = vi.hoisted(() => ({
  acquire: vi.fn().mockResolvedValue(true),
  write: vi.fn(),
}));
vi.mock('../src/persistence/runtime', () => ({
  slotLocks: { acquire: storage.acquire },
  saves: { write: storage.write },
}));

let world: World;
beforeAll(() => {
  const base = generateWorld('training-draft', { format: 'legacy' });
  world = createCareer(
    base,
    {
      name: 'Robin Vale',
      nationalityId: 'country:0',
      position: 'ST',
      foot: 'left',
      age: 17,
      archetype: 'finisher',
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
    },
    trialOffers(base, 'country:0', 'training-draft')[0]!.id,
    'training-draft',
  );
});
beforeEach(() => {
  useAppStore.getState().clearSession();
  useAppStore.setState({ world: structuredClone(world), worldJob: null, matchSession: null });
  storage.acquire.mockResolvedValue(true);
  storage.write.mockReset();
});
const highPlan = (): TrainingPlan => {
  const plan = structuredClone(useAppStore.getState().world!.career!.training);
  plan.sessions[0]!.intensity = 'high';
  return plan;
};

describe('temporary training intent', () => {
  it('retains an edited plan separately from committed progress across unrelated store changes', () => {
    const before = useAppStore.getState();
    expect(before.editTrainingDraft).toBeTypeOf('function');
    before.editTrainingDraft(highPlan());
    before.updateSettings({ reducedMotion: true });
    expect(useAppStore.getState().trainingDraft?.plan.sessions[0]!.intensity).toBe('high');
    expect(useAppStore.getState().world!.career!.training.sessions[0]!.intensity).toBe('normal');
    expect(useAppStore.getState().change).toBe(before.change + 1);
  });
  it('discards explicitly without changing committed training', () => {
    useAppStore.getState().editTrainingDraft(highPlan());
    useAppStore.getState().discardTrainingDraft();
    expect(useAppStore.getState().trainingDraft).toBeNull();
    expect(useAppStore.getState().world!.career!.training).toEqual(world.career!.training);
  });
  it.each(['seed', 'week', 'player', 'original'] as const)(
    'drops a draft when %s changes',
    (field) => {
      useAppStore.getState().editTrainingDraft(highPlan());
      const next = structuredClone(useAppStore.getState().world!);
      if (field === 'seed') next.seed += '-other';
      if (field === 'week') next.date.week++;
      if (field === 'player') next.career!.playerId += '-other';
      if (field === 'original') next.career!.training.sessions[0]!.focus = 'recovery';
      useAppStore.getState().setWorld(next);
      expect(useAppStore.getState().trainingDraft).toBeNull();
    },
  );
  it('clears on a load of the same career and on clear-session', () => {
    useAppStore.getState().editTrainingDraft(highPlan());
    const save = createSave(1, 'Career', {
      kind: 'world',
      world,
      gallery: { seed: 'a', generation: 0 },
      settings: DEFAULT_SETTINGS,
    });
    useAppStore.getState().applySave(save);
    expect(useAppStore.getState().trainingDraft).toBeNull();
    useAppStore.getState().editTrainingDraft(highPlan());
    useAppStore.getState().saved(save, useAppStore.getState().change);
    expect(useAppStore.getState().trainingDraft).not.toBeNull();
    useAppStore.getState().clearSession();
    expect(useAppStore.getState().trainingDraft).toBeNull();
  });
});

describe('applying training and advancing time', () => {
  it('cancels session abandonment without consuming the draft', async () => {
    useAppStore.getState().editTrainingDraft(highPlan());
    const abandoning = transitions.confirmTrainingAbandonment();
    expect(useAppStore.getState().trainingAbandon).not.toBeNull();
    transitions.resolveTrainingAbandonment(false);
    expect(await abandoning).toBe(false);
    expect(useAppStore.getState().trainingDraft).not.toBeNull();
  });
  it('does not advance or consume intent if Save and continue fails', async () => {
    const save = createSave(1, 'Career', {
      kind: 'world',
      world,
      gallery: { seed: 'a', generation: 0 },
      settings: DEFAULT_SETTINGS,
    });
    useAppStore.getState().applySave(save);
    useAppStore.getState().editTrainingDraft(highPlan());
    await startWorldJob('simulate-to-match');
    storage.write.mockRejectedValue(new Error('disk failure'));
    expect(transitions.resumeTrainingAdvance).toBeTypeOf('function');
    expect(await transitions.resumeTrainingAdvance(true)).toBe(false);
    expect(useAppStore.getState().trainingAdvance).not.toBeNull();
    expect(useAppStore.getState().trainingDraft).not.toBeNull();
    expect(useAppStore.getState().worldJob).toBeNull();
  });
  it('applies memory-only edits once', async () => {
    useAppStore.getState().editTrainingDraft(highPlan());
    expect(session.saveTrainingDraft).toBeTypeOf('function');
    expect(await session.saveTrainingDraft()).toBe(true);
    expect(useAppStore.getState().world!.career!.training.sessions[0]!.intensity).toBe('high');
    expect(useAppStore.getState().trainingDraft).toBeNull();
    expect(await session.saveTrainingDraft()).toBe(false);
  });
  it('retains both committed plan and draft after actual persistence failure', async () => {
    const save = createSave(1, 'Career', {
      kind: 'world',
      world,
      gallery: { seed: 'a', generation: 0 },
      settings: DEFAULT_SETTINGS,
    });
    useAppStore.getState().applySave(save);
    useAppStore.getState().editTrainingDraft(highPlan());
    storage.write.mockRejectedValue(new Error('disk failure'));
    expect(await session.saveTrainingDraft()).toBe(false);
    expect(storage.write).toHaveBeenCalledOnce();
    expect(useAppStore.getState().world!.career!.training.sessions[0]!.intensity).toBe('normal');
    expect(useAppStore.getState().trainingDraft?.plan.sessions[0]!.intensity).toBe('high');
    expect(useAppStore.getState().saveStatus).toBe('error');
    expect(useAppStore.getState().trainingSaving).toBe(false);
  });
  it('commits the storage snapshot before applying and clears the draft on success', async () => {
    const save = createSave(1, 'Career', {
      kind: 'world',
      world,
      gallery: { seed: 'a', generation: 0 },
      settings: DEFAULT_SETTINGS,
    });
    useAppStore.getState().applySave(save);
    useAppStore.getState().editTrainingDraft(highPlan());
    storage.write.mockImplementation(async (value) => {
      expect(useAppStore.getState().world!.career!.training.sessions[0]!.intensity).toBe('normal');
      expect(useAppStore.getState().saveStatus).toBe('saving');
      return { ...value, revision: value.revision + 1 };
    });
    expect(await session.saveTrainingDraft()).toBe(true);
    expect(useAppStore.getState().world!.career!.training.sessions[0]!.intensity).toBe('high');
    expect(useAppStore.getState().trainingDraft).toBeNull();
    expect(useAppStore.getState().savedChange).toBe(useAppStore.getState().change);
  });
  it('rejects a lock lost while saving without applying the draft', async () => {
    const save = createSave(1, 'Career', {
      kind: 'world',
      world,
      gallery: { seed: 'a', generation: 0 },
      settings: DEFAULT_SETTINGS,
    });
    useAppStore.getState().applySave(save);
    useAppStore.getState().editTrainingDraft(highPlan());
    storage.acquire.mockResolvedValue(false);
    expect(await session.saveTrainingDraft()).toBe(false);
    expect(storage.write).not.toHaveBeenCalled();
    expect(useAppStore.getState().trainingDraft).not.toBeNull();
    expect(useAppStore.getState().saveError).toBe('locked');
  });
  it.each(['simulate-to-match', 'simulate-season', 'next-season', 'simulate-week'] as const)(
    'queues a decision before %s and never starts a worker',
    async (type) => {
      useAppStore.getState().editTrainingDraft(highPlan());
      await startWorldJob(type, { autoPlay: true });
      expect(useAppStore.getState().trainingAdvance?.type).toBe(type);
      expect(useAppStore.getState().worldJob).toBeNull();
    },
  );
});
