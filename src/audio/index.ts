import type { AudioSettings } from '../model/domain';
import type { SoundName } from './synth';

/**
 * The game's audio facade. Browsers only allow audio after a user gesture (AGENTS.md §3), so
 * nothing loads until `unlock` runs on the first interaction; Howler and the synthesiser
 * then load as their own chunk, outside the initial bundle. Calls made earlier are dropped,
 * except the crowd level, which is applied once audio is ready.
 */
export type { SoundName };
type Player = typeof import('./player');
let player: Player | null = null;
let loading: Promise<Player> | null = null;
let settings: AudioSettings | null = null;
let crowdLevel: number | null = null;
let warm: SoundName[] = [];

export const audio = {
  configure(next: AudioSettings): void {
    settings = next;
    player?.configure(next);
  },
  /** Call from a user gesture. Safe to call repeatedly. */
  async unlock(): Promise<void> {
    if (player) {
      player.unlock();
      return;
    }
    if (typeof window === 'undefined') return;
    if (loading) {
      await loading.catch(() => undefined);
      return;
    }
    loading = import('./player').then((loaded) => {
      player = loaded;
      void loaded.prepare(['tap', 'toggle', 'confirm', ...warm]);
      if (settings) loaded.configure(settings);
      loaded.unlock();
      if (crowdLevel !== null) loaded.crowd(crowdLevel);
      return loaded;
    });
    await loading.catch(() => {
      loading = null;
    });
  },
  get ready(): boolean {
    return player !== null;
  },
  /** Render sounds ahead of need, such as the match sounds when the match screen opens. */
  async prepare(names: SoundName[]): Promise<void> {
    if (player) await player.prepare(names);
    else warm = [...new Set([...warm, ...names])];
  },
  play(name: SoundName): void {
    player?.play(name);
  },
  async preview(name: SoundName): Promise<void> {
    await audio.unlock();
    await player?.preview(name);
  },
  crowd(level: number | null): void {
    crowdLevel = level;
    player?.crowd(level);
  },
};
