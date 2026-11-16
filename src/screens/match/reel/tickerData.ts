import type { MatchEvent } from '../../../model/domain';
import type { MatchSession } from '../../../engine/match';
import { reelText as r } from '../../../i18n/reel';

/*
 * What the ticker shows between chains (docs/EXPERIENCE-REDESIGN-1.0.md §1.2): a momentum wave
 * of the last 20 minutes and event chips. Both are read from the match's events, so a restored
 * match draws the same wave and chips as one watched from kick-off.
 */
export const WAVE_MINUTES = 20;
export const CHIP_COUNT = 3;

/** Pressure an event shows, for the side that made it. */
const WEIGHT: Partial<Record<MatchEvent['kind'], number>> = {
  goal: 3,
  shot: 1.6,
  save: 0,
  dribble: 0.5,
  pass: 0.15,
};

/**
 * The wave: for each of the last 20 minutes, the home side's pressure minus the away side's
 * (shots weighted by their chance, goals most), scaled to −1…1. Positive bars rise in the home
 * colour, negative fall in the away colour.
 */
export function momentumWave(
  events: readonly MatchEvent[],
  homeId: string,
  minute: number,
  momentum: number,
): number[] {
  const end = Math.max(1, minute);
  const start = Math.max(1, end - WAVE_MINUTES + 1);
  const values = new Map<number, number>();
  for (const event of events) {
    if (event.minute < start || event.minute > end) continue;
    let weight = WEIGHT[event.kind] ?? 0;
    if (event.kind === 'shot') weight += (event.xg ?? 0.08) * 6;
    if (!weight) continue;
    const sign = event.teamId === homeId ? 1 : -1;
    values.set(event.minute, (values.get(event.minute) ?? 0) + sign * weight);
  }
  const wave: number[] = [];
  for (let m = start; m <= end; m++) {
    // Each minute leans with the run of play: the current momentum on the last bar.
    const lean = m === end ? (momentum - 50) / 50 : 0;
    const raw = (values.get(m) ?? 0) + lean * 1.2;
    wave.push(Math.max(-1, Math.min(1, raw / 4)));
  }
  return wave;
}

/** The share of the wave's pressure that was the home side's, in percent. */
export function waveShare(wave: readonly number[]): number {
  const home = wave.reduce((sum, value) => sum + Math.max(0, value), 0);
  const away = wave.reduce((sum, value) => sum + Math.max(0, -value), 0);
  return home + away > 0 ? Math.round((home / (home + away)) * 100) : 50;
}

export type ChipKind = keyof typeof r.chips;
export interface TickerChip {
  id: string;
  minute: number;
  addedTime?: number;
  kind: ChipKind;
  /** The side it belongs to: 0 home, 1 away. */
  side: 0 | 1;
  playerId: string | null;
}

/** A shot event's chip kind, from how it ended. */
function shotKind(event: MatchEvent, events: readonly MatchEvent[], index: number): ChipKind {
  if (event.shotResult === 'woodwork') return 'woodwork';
  if (event.shotResult === 'blocked') return 'blocked';
  if (event.shotResult === 'off-target') return 'wide';
  if (event.shotResult === 'saved') return 'saved';
  // Earlier engines: a save by the other side in the same minute.
  for (let i = index + 1; i < Math.min(events.length, index + 4); i++) {
    const next = events[i]!;
    if (next.minute !== event.minute) break;
    if (next.kind === 'goal') return 'goal';
    if (next.kind === 'save' && next.teamId !== event.teamId) return 'saved';
  }
  return 'shot';
}

/**
 * The chips of everything notable so far, newest first: shots (with how they ended), goals,
 * cards, substitutions and injuries. `hidden` is a goal still being shown on the pitch.
 */
export function tickerChips(session: MatchSession, hidden?: string): TickerChip[] {
  const { setup, state } = session;
  const events = state.match.events;
  const chips: TickerChip[] = [];
  const sideOf = (teamId: string): 0 | 1 => (teamId === setup.home.id ? 0 : 1);
  const goalShots = new Set<number>();
  events.forEach((event, index) => {
    if (event.kind !== 'goal' || event.id === hidden) return;
    // The shot that scored folds into the goal's chip.
    for (let i = index - 1; i >= Math.max(0, index - 3); i--)
      if (events[i]!.kind === 'shot' && events[i]!.minute === event.minute) goalShots.add(i);
  });
  events.forEach((event, index) => {
    if (event.id === hidden) return;
    const base = {
      id: event.id,
      minute: event.minute,
      ...(event.addedTime ? { addedTime: event.addedTime } : {}),
      side: sideOf(event.teamId),
      playerId: event.playerId,
    };
    if (event.kind === 'goal') chips.push({ ...base, kind: 'goal' });
    else if (event.kind === 'shot' && !goalShots.has(index))
      chips.push({ ...base, kind: shotKind(event, events, index) });
    else if (event.kind === 'card')
      chips.push({ ...base, kind: event.card && event.card !== 'yellow' ? 'red' : 'yellow' });
    else if (event.kind === 'substitution') chips.push({ ...base, kind: 'sub' });
  });
  for (const injury of state.injuries ?? [])
    chips.push({
      id: `injury:${injury.playerId}:${injury.minute}`,
      minute: injury.minute,
      ...(injury.addedTime ? { addedTime: injury.addedTime } : {}),
      kind: 'injury',
      side: setup.home.playerIds.includes(injury.playerId) ? 0 : 1,
      playerId: injury.playerId,
    });
  // Newest first; within a minute, the later event first.
  return chips
    .reverse()
    .sort((a, b) => b.minute - a.minute || (b.addedTime ?? 0) - (a.addedTime ?? 0))
    .slice(0, CHIP_COUNT);
}
