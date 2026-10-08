import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/persistence/settings';

const fake = vi.hoisted(() => ({
  howls: [] as FakeHowl[],
  requests: [] as { id: number; name: string }[],
  worker: null as FakeWorker | null,
  hidden: false,
  visibility: () => {},
  ids: 0,
  disconnect: vi.fn(),
  connect: vi.fn(),
  compressor: {
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 0 },
    attack: { value: 0 },
    release: { value: 0 },
    connect: vi.fn(),
  },
}));
interface FakeHowl {
  options: {
    src: string[];
    loop?: boolean;
    onload: () => void;
    onloaderror: (id: number, error: string) => void;
  };
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  volume: ReturnType<typeof vi.fn>;
  fade: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  unload: ReturnType<typeof vi.fn>;
}
interface FakeWorker {
  onmessage: ((event: { data: { id: number; wav?: Uint8Array; error?: string } }) => void) | null;
  onerror: (() => void) | null;
}
vi.mock('howler', () => ({
  Howl: class {
    options: FakeHowl['options'];
    play = vi.fn(() => ++fake.ids);
    pause = vi.fn();
    stop = vi.fn();
    volume = vi.fn((value?: number) => value ?? 0.2);
    fade = vi.fn();
    once = vi.fn();
    unload = vi.fn();
    constructor(options: FakeHowl['options']) {
      this.options = options;
      fake.howls.push(this);
    }
  },
  Howler: {
    usingWebAudio: true,
    volume: vi.fn(),
    mute: vi.fn(),
    masterGain: { disconnect: fake.disconnect, connect: fake.connect },
    ctx: {
      state: 'running',
      destination: {},
      resume: vi.fn(async () => {}),
      createDynamicsCompressor: () => fake.compressor,
    },
  },
}));

const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
async function renderAndLoad(name: string): Promise<FakeHowl> {
  const request = [...fake.requests].reverse().find((r) => r.name === name)!;
  fake.worker!.onmessage!({ data: { id: request.id, wav: new Uint8Array(44) } });
  await settle();
  const howl = fake.howls.at(-1)!;
  howl.options.onload();
  await settle();
  return howl;
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  fake.howls = [];
  fake.requests = [];
  fake.hidden = false;
  vi.stubGlobal('document', {
    get hidden() {
      return fake.hidden;
    },
    addEventListener: (_: string, fn: () => void) => {
      fake.visibility = fn;
    },
  });
  vi.stubGlobal(
    'Worker',
    class {
      onmessage = null;
      onerror = null;
      onmessageerror = null;
      postMessage(request: { id: number; name: string }) {
        fake.requests.push(request);
      }
      terminate = vi.fn();
      constructor() {
        fake.worker = this;
      }
    },
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:audio');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('audio playback lifecycle', () => {
  it('puts overlapping audio through one gentle output compressor', async () => {
    const player = await import('../src/audio/player');
    player.configure(DEFAULT_SETTINGS.audio);
    player.configure(DEFAULT_SETTINGS.audio);
    expect(fake.disconnect).toHaveBeenCalledTimes(1);
    expect(fake.connect).toHaveBeenCalledWith(fake.compressor);
    expect(fake.compressor.threshold.value).toBeLessThan(0);
    expect(fake.compressor.ratio.value).toBeGreaterThan(1);
  });
  it('drops a delayed effect if the player mutes or hides before decoding completes', async () => {
    const player = await import('../src/audio/player');
    player.play('tap');
    player.configure({ ...DEFAULT_SETTINGS.audio, muted: true });
    const tap = await renderAndLoad('tap');
    expect(tap.play).not.toHaveBeenCalled();
    player.configure({ ...DEFAULT_SETTINGS.audio, musicEnabled: false });
    player.play('reward');
    fake.hidden = true;
    const reward = await renderAndLoad('reward');
    expect(reward.play).not.toHaveBeenCalled();
  });
  it('coalesces repeated clicks while a sound loads and releases its temporary URL', async () => {
    const player = await import('../src/audio/player');
    player.play('tap');
    player.play('tap');
    player.play('tap');
    const tap = await renderAndLoad('tap');
    expect(tap.play).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:audio');
  });
  it('keeps a single music instance, ducks it for the crowd, and pauses when hidden', async () => {
    const player = await import('../src/audio/player');
    player.configure(DEFAULT_SETTINGS.audio);
    player.configure(DEFAULT_SETTINGS.audio);
    const music = await renderAndLoad('music');
    expect(music.options.loop).toBe(true);
    expect(music.play).toHaveBeenCalledTimes(1);
    player.crowd(0.5);
    expect(music.fade).toHaveBeenLastCalledWith(
      expect.any(Number),
      DEFAULT_SETTINGS.audio.music * 0.45,
      expect.any(Number),
      expect.any(Number),
    );
    fake.hidden = true;
    fake.visibility();
    expect(music.pause).toHaveBeenCalledTimes(1);
    fake.hidden = false;
    fake.visibility();
    expect(music.play).toHaveBeenCalledTimes(2);
  });
  it('does not start disabled music after a pending render, and preserves independent channel settings', async () => {
    const player = await import('../src/audio/player');
    player.configure(DEFAULT_SETTINGS.audio);
    player.configure({ ...DEFAULT_SETTINGS.audio, musicEnabled: false });
    const music = await renderAndLoad('music');
    expect(music.play).not.toHaveBeenCalled();
    player.configure({ ...DEFAULT_SETTINGS.audio, effects: 0, crowd: 0 });
    await settle();
    expect(music.play).toHaveBeenCalledTimes(1);
  });
  it('can retry a failed render rather than keeping an unresolved request', async () => {
    const player = await import('../src/audio/player');
    player.play('tap');
    fake.worker!.onerror!();
    await settle();
    vi.advanceTimersByTime(1000);
    player.play('tap');
    const tap = await renderAndLoad('tap');
    expect(tap.play).toHaveBeenCalledTimes(1);
  });

  it('prevents unbounded overlapping reward effects', async () => {
    const player = await import('../src/audio/player');
    player.play('reward');
    const reward = await renderAndLoad('reward');
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(250);
      player.play('reward');
      await settle();
    }
    expect(reward.play).toHaveBeenCalledTimes(5);
    expect(reward.stop).toHaveBeenCalledTimes(2);
  });

  it('does not revive a stale effect after muting and unmuting during loading', async () => {
    const player = await import('../src/audio/player');
    player.play('reward');
    player.configure({ ...DEFAULT_SETTINGS.audio, muted: true });
    player.configure({ ...DEFAULT_SETTINGS.audio, musicEnabled: false });
    const reward = await renderAndLoad('reward');
    expect(reward.play).not.toHaveBeenCalled();
  });

  it('cancels a pending fade-out if music is enabled again', async () => {
    const player = await import('../src/audio/player');
    player.configure(DEFAULT_SETTINGS.audio);
    const music = await renderAndLoad('music');
    player.configure({ ...DEFAULT_SETTINGS.audio, musicEnabled: false });
    vi.advanceTimersByTime(300);
    player.configure(DEFAULT_SETTINGS.audio);
    vi.advanceTimersByTime(800);
    expect(music.pause).not.toHaveBeenCalled();
    expect(music.play).toHaveBeenCalledTimes(1);
  });
});
