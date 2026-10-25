import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/persistence/session', () => ({ autosave: { flush: vi.fn() } }));
import { autosave } from '../src/persistence/session';
import { updateApplication } from '../src/persistence/update';
import { UpdateBlockedError } from '../src/release/busy';
import { useAppStore } from '../src/store';
import { SaveError } from '../src/persistence/schema';
import type { World } from '../src/model/domain';

afterEach(() => {
  useAppStore.setState({ world: null, worldJob: null, activeSave: null });
  vi.resetAllMocks();
});

describe('application update safety', () => {
  it.each(['before', 'during'] as const)(
    'keeps a worker job running if it starts %s saving',
    async (timing) => {
      useAppStore.setState({ world: null, activeSave: null, worldJob: null });
      const startJob = () =>
        useAppStore.getState().setWorldJob({
          type: 'simulate-season',
          completedWeeks: 0,
          totalWeeks: 34,
          cancelling: false,
        });
      if (timing === 'before') startJob();
      else
        vi.mocked(autosave.flush).mockImplementationOnce(async () => {
          startJob();
        });
      const reload = vi.fn();
      await expect(updateApplication(reload)).rejects.toMatchObject({
        reason: 'simulating-season',
      });
      expect(reload).not.toHaveBeenCalled();
    },
  );
  it('preserves an unsaved world without attempting a reload', async () => {
    useAppStore.setState({ world: { id: 'unsaved' } as World, activeSave: null, worldJob: null });
    const reload = vi.fn();
    await expect(updateApplication(reload)).rejects.toMatchObject({ reason: 'unsaved-world' });
    expect(autosave.flush).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
  it('rechecks world ownership after the save transaction', async () => {
    useAppStore.setState({ world: null, activeSave: null, worldJob: null });
    vi.mocked(autosave.flush).mockImplementationOnce(async () => {
      useAppStore.setState({ world: { id: 'new' } as World });
    });
    const reload = vi.fn();
    await expect(updateApplication(reload)).rejects.toMatchObject({ reason: 'unsaved-world' });
    expect(reload).not.toHaveBeenCalled();
  });
  it('keeps the current app if persistence fails', async () => {
    useAppStore.setState({ world: null, activeSave: null, worldJob: null });
    vi.mocked(autosave.flush).mockRejectedValueOnce(new SaveError('locked'));
    const reload = vi.fn();
    await expect(updateApplication(reload)).rejects.toMatchObject({ code: 'locked' });
    expect(reload).not.toHaveBeenCalled();
  });
  it('refuses when a change could not be saved, naming a match in hand', async () => {
    useAppStore.setState({
      world: { id: 'saved' } as World,
      activeSave: { slot: 1 } as never,
      worldJob: null,
      change: 3,
      savedChange: 2,
      matchSession: { engine: 'match-21' } as never,
    });
    const reload = vi.fn();
    const failure = await updateApplication(reload).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(UpdateBlockedError);
    expect(failure).toMatchObject({ reason: 'match', page: null });
    expect(reload).not.toHaveBeenCalled();
    useAppStore.setState({ change: 0, savedChange: 0, matchSession: null });
  });
  it('flushes pending changes before installing an update', async () => {
    useAppStore.setState({ world: null, activeSave: null, worldJob: null });
    const order: string[] = [];
    vi.mocked(autosave.flush).mockImplementationOnce(async () => {
      order.push('saved');
    });
    await updateApplication(async () => {
      order.push('reloaded');
    });
    expect(order).toEqual(['saved', 'reloaded']);
  });
});
