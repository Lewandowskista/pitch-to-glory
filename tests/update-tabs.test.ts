import { describe, expect, it, vi } from 'vitest';
import { UpdateTabs, type ChannelLike } from '../src/release/updateTabs';
import { busyReason, type BusyReason } from '../src/release/busy';
import type { AppStore } from '../src/store';

/** BroadcastChannel between tabs of one test: delivered asynchronously, never to the sender. */
class Bus {
  private readonly members = new Set<FakeChannel>();
  join(): FakeChannel {
    const channel = new FakeChannel(this);
    this.members.add(channel);
    return channel;
  }
  leave(channel: FakeChannel) {
    this.members.delete(channel);
  }
  send(from: FakeChannel, message: unknown) {
    const data = structuredClone(message);
    for (const member of this.members)
      if (member !== from) queueMicrotask(() => member.deliver(data));
  }
}
type Listener = (event: { data: unknown }) => void;
class FakeChannel implements ChannelLike {
  private readonly listeners = new Set<Listener>();
  closed = false;
  constructor(private readonly bus: Bus) {}
  postMessage(message: unknown) {
    if (!this.closed) this.bus.send(this, message);
  }
  addEventListener(_: 'message', listener: Listener) {
    this.listeners.add(listener);
  }
  removeEventListener(_: 'message', listener: Listener) {
    this.listeners.delete(listener);
  }
  close() {
    this.closed = true;
    this.bus.leave(this);
  }
  deliver(data: unknown) {
    if (!this.closed) for (const listener of this.listeners) listener({ data });
  }
}

interface Tab {
  tabs: UpdateTabs;
  channel: FakeChannel;
  onReload: ReturnType<typeof vi.fn>;
  prepare: ReturnType<typeof vi.fn>;
}
function tab(
  bus: Bus,
  id: string,
  page: string,
  prepare: () => Promise<BusyReason | null> = async () => null,
): Tab {
  const channel = bus.join();
  const onReload = vi.fn();
  const prepareSpy = vi.fn(prepare);
  const tabs = new UpdateTabs({
    tabId: id,
    channel,
    page: () => page,
    prepare: prepareSpy,
    onReload,
    ackMs: 20,
    statusMs: 200,
  });
  return { tabs, channel, onReload, prepare: prepareSpy };
}

describe('coordinated updates across tabs', () => {
  it('goes ahead when this is the only tab', async () => {
    const bus = new Bus();
    const only = tab(bus, 'a', 'Clubhouse');
    await expect(only.tabs.poll()).resolves.toBeNull();
  });

  it('asks every other tab to save first, and goes ahead when all are free', async () => {
    const bus = new Bus();
    const asker = tab(bus, 'a', 'Clubhouse');
    const others = [tab(bus, 'b', 'Matchday'), tab(bus, 'c', 'World')];
    await expect(asker.tabs.poll()).resolves.toBeNull();
    for (const other of others) expect(other.prepare).toHaveBeenCalledOnce();
    expect(asker.prepare).not.toHaveBeenCalled();
  });

  it('refuses while another tab is busy, naming the tab and what holds it', async () => {
    const bus = new Bus();
    const asker = tab(bus, 'a', 'Clubhouse');
    tab(bus, 'b', 'Matchday');
    tab(bus, 'c', 'World', async () => 'simulating-season');
    await expect(asker.tabs.poll()).resolves.toEqual({
      busy: 'simulating-season',
      page: 'World',
    });
  });

  it('waits for a tab that is still saving, within the time limit', async () => {
    const bus = new Bus();
    const asker = tab(bus, 'a', 'Clubhouse');
    let saved = false;
    tab(bus, 'b', 'Career hub', async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      saved = true;
      return null;
    });
    await expect(asker.tabs.poll()).resolves.toBeNull();
    expect(saved).toBe(true);
  });

  it('holds the update for a tab that acknowledged but never answered', async () => {
    const bus = new Bus();
    const asker = tab(bus, 'a', 'Clubhouse');
    tab(bus, 'b', 'Training', () => new Promise(() => {}));
    await expect(asker.tabs.poll()).resolves.toEqual({ busy: 'unresponsive', page: 'Training' });
  });

  it('counts a tab whose save failed as holding unsaved changes', async () => {
    const bus = new Bus();
    const asker = tab(bus, 'a', 'Clubhouse');
    tab(bus, 'b', 'Inbox', () => Promise.reject(new Error('locked')));
    await expect(asker.tabs.poll()).resolves.toEqual({ busy: 'unsaved-changes', page: 'Inbox' });
  });

  it('does not count a tab that never acknowledges (frozen or closed)', async () => {
    const bus = new Bus();
    const asker = tab(bus, 'a', 'Clubhouse');
    const frozen = tab(bus, 'b', 'World', async () => 'unsaved-world');
    frozen.channel.close();
    await expect(asker.tabs.poll()).resolves.toBeNull();
  });

  it('asks the other tabs to reload once the update is active, never itself', async () => {
    const bus = new Bus();
    const asker = tab(bus, 'a', 'Clubhouse');
    const other = tab(bus, 'b', 'Matchday');
    asker.tabs.announceReload();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(other.onReload).toHaveBeenCalledOnce();
    expect(asker.onReload).not.toHaveBeenCalled();
  });

  it('ignores malformed messages and answers meant for another asker', async () => {
    const bus = new Bus();
    const asker = tab(bus, 'a', 'Clubhouse');
    const stranger = bus.join();
    const result = asker.tabs.poll();
    stranger.postMessage({ type: 'ack', id: 'a:1', from: 'x', to: 'someone-else', page: 'P' });
    stranger.postMessage({ type: 'status', id: 'a:1', from: 'x', to: 'a', busy: 'nonsense' });
    stranger.postMessage({ type: 'reload' });
    stranger.postMessage('reload');
    await expect(result).resolves.toBeNull();
    expect(asker.onReload).not.toHaveBeenCalled();
  });

  it('stops listening when closed', async () => {
    const bus = new Bus();
    const asker = tab(bus, 'a', 'Clubhouse');
    const other = tab(bus, 'b', 'World', async () => 'simulating');
    other.tabs.close();
    await expect(asker.tabs.poll()).resolves.toBeNull();
  });

  it('goes ahead at once where the browser has no BroadcastChannel', async () => {
    const tabs = new UpdateTabs({
      tabId: 'a',
      channel: null,
      page: () => 'Clubhouse',
      prepare: async () => null,
      onReload: () => {},
    });
    await expect(tabs.poll()).resolves.toBeNull();
    expect(() => tabs.announceReload()).not.toThrow();
  });
});

describe('what holds a tab', () => {
  const idle = {
    worldJob: null,
    trainingSaving: false,
    world: null,
    activeSave: null,
    change: 0,
    savedChange: 0,
    matchSession: null,
  } as unknown as AppStore;
  const job = (type: string) =>
    ({ type, completedWeeks: 0, totalWeeks: 1, cancelling: false }) as AppStore['worldJob'];
  it('names each busy state', () => {
    expect(busyReason(idle, true)).toBeNull();
    expect(busyReason({ ...idle, worldJob: job('simulate-season') }, false)).toBe(
      'simulating-season',
    );
    expect(busyReason({ ...idle, worldJob: job('simulate-to-match') }, false)).toBe('simulating');
    expect(busyReason({ ...idle, trainingSaving: true }, false)).toBe('training');
    expect(busyReason({ ...idle, world: {} as AppStore['world'] }, false)).toBe('unsaved-world');
  });
  it('counts unsaved changes only once the autosave has been written', () => {
    const dirty = {
      ...idle,
      world: {} as AppStore['world'],
      activeSave: {} as AppStore['activeSave'],
      change: 2,
      savedChange: 1,
    };
    expect(busyReason(dirty, false)).toBeNull();
    expect(busyReason(dirty, true)).toBe('unsaved-changes');
    expect(busyReason({ ...dirty, matchSession: {} as AppStore['matchSession'] }, true)).toBe(
      'match',
    );
  });
});
