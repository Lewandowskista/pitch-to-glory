import type { MatchEvent } from '../../model/domain';

/**
 * The live commentary feed (redesign phase 5b). It shows the engine's event commentary now,
 * and accepts optional narration lines (beat-based play-by-play, added alongside this work)
 * without changing shape: pass them as `NarrationLine`s and they slot in by minute, just
 * before the event they lead to when `eventId` names it.
 */
export interface NarrationLine {
  /** Stable key for the row (for example `${eventId}:${index}` or `${minute}:${index}`). */
  id: string;
  minute: number;
  text: string;
  /** The event this line builds up to; the line is shown just before that event's row. */
  eventId?: string;
}
export type FeedKind =
  'goal' | 'moment' | 'save' | 'card' | 'whistle' | 'substitution' | 'play' | 'line';
export interface FeedRow {
  id: string;
  minute: number;
  kind: FeedKind;
  text: string;
  /** Who it is about: the player, or the team for team events. */
  subject?: string;
  teamId?: string;
  event?: MatchEvent;
}

function kindOf(event: MatchEvent): FeedKind {
  if (event.kind === 'goal') return 'goal';
  // Routine passes carry an outcome too; only real key moments stand out.
  if (event.outcome && !event.outcome.input.momentId.startsWith('routine:')) return 'moment';
  if (event.kind === 'save') return 'save';
  if (event.kind === 'card') return 'card';
  if (event.kind === 'halftime') return 'whistle';
  if (event.kind === 'substitution') return 'substitution';
  return 'play';
}

/**
 * Feed rows, newest first. `text` and `subject` render an event; narration lines keep their
 * own text. Lines for the same minute without an event follow that minute's events.
 */
export function buildFeed(
  events: readonly MatchEvent[],
  text: (event: MatchEvent) => string,
  subject: (event: MatchEvent) => string | undefined,
  narration: readonly NarrationLine[] = [],
): FeedRow[] {
  const before = new Map<string, NarrationLine[]>();
  const loose: NarrationLine[] = [];
  const known = new Set(events.map((event) => event.id));
  for (const line of narration) {
    if (line.eventId && known.has(line.eventId))
      before.set(line.eventId, [...(before.get(line.eventId) ?? []), line]);
    else loose.push(line);
  }
  const rows: FeedRow[] = [];
  const line = (entry: NarrationLine): FeedRow => ({
    id: `line:${entry.id}`,
    minute: entry.minute,
    kind: 'line',
    text: entry.text,
  });
  const pending = [...loose].sort((a, b) => a.minute - b.minute);
  for (const event of events) {
    // Loose lines from earlier minutes come before this event.
    while (pending.length && pending[0]!.minute < event.minute) rows.push(line(pending.shift()!));
    for (const entry of before.get(event.id) ?? []) rows.push(line(entry));
    rows.push({
      id: event.id,
      minute: event.minute,
      kind: kindOf(event),
      text: text(event),
      subject: subject(event),
      teamId: event.teamId,
      event,
    });
  }
  rows.push(...pending.map(line));
  return rows.reverse();
}
