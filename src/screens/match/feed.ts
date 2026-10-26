import type { MatchEvent } from '../../model/domain';

/**
 * The live commentary feed (redesign phase 5b). It shows the engine's event commentary, with
 * beat-based narration lines slotted in by minute, just before the event they lead to when
 * `eventId` names it. Release 1.0 step 5.5 keeps it about what matters: the player's routine
 * passes fold into one summary row a spell, and a shot that goes in leaves the telling to the
 * goal's own line.
 */
export interface NarrationLine {
  /** Stable key for the row (for example `${eventId}:${index}` or `${minute}:${index}`). */
  id: string;
  minute: number;
  text: string;
  /** The event this line builds up to; the line is shown just before that event's row. */
  eventId?: string;
  /** The line's template (its narration key), for measuring repetition. */
  template?: string;
}
export type FeedKind =
  'goal' | 'moment' | 'save' | 'card' | 'whistle' | 'substitution' | 'play' | 'line';
/** A row's words and the template they came from (a commentary key, `goal:…`, `spell:…`). */
export interface FeedText {
  text: string;
  template?: string;
}
/** Consecutive routine passes by the player, with no other event between them. */
export interface RoutineSpell {
  /** The first pass's event id. */
  id: string;
  events: MatchEvent[];
  completed: number;
  lost: number;
}
export interface FeedRow {
  id: string;
  minute: number;
  kind: FeedKind;
  text: string;
  template?: string;
  /** Who it is about: the player, or the team for team events. */
  subject?: string;
  teamId?: string;
  event?: MatchEvent;
  /** A summary row: the passes it stands for. */
  spell?: RoutineSpell;
}
export interface FeedOptions {
  /**
   * The summary row of a spell of routine passes, given the spells before it. Without it, each
   * routine pass is a row of its own.
   */
  spell?: (spell: RoutineSpell, earlier: readonly RoutineSpell[]) => FeedText;
}

/** A routine pass: logged with an outcome, but not a key moment. */
export const isRoutine = (event: MatchEvent): boolean =>
  event.outcome?.input.momentId.startsWith('routine:') ?? false;
/** A key moment's own event. */
const isMoment = (event: MatchEvent): boolean => Boolean(event.outcome) && !isRoutine(event);

function kindOf(event: MatchEvent): FeedKind {
  if (event.kind === 'goal') return 'goal';
  // Routine passes carry an outcome too; only real key moments stand out.
  if (isMoment(event)) return 'moment';
  if (event.kind === 'save') return 'save';
  if (event.kind === 'card') return 'card';
  if (event.kind === 'halftime') return 'whistle';
  if (event.kind === 'substitution') return 'substitution';
  return 'play';
}
const asText = (value: string | FeedText): FeedText =>
  typeof value === 'string' ? { text: value } : value;

/**
 * Feed rows, newest first. `text` and `subject` render an event; narration lines keep their
 * own text. Lines for the same minute without an event follow that minute's events. A shot
 * outside the player's moments that goes in shows as its goal only, and with `options.spell`
 * a spell of routine passes is one row, placed at its last pass.
 */
export function buildFeed(
  events: readonly MatchEvent[],
  text: (event: MatchEvent) => string | FeedText,
  subject: (event: MatchEvent) => string | undefined,
  narration: readonly NarrationLine[] = [],
  options: FeedOptions = {},
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
    ...(entry.template ? { template: entry.template } : {}),
  });
  const pending = [...loose].sort((a, b) => a.minute - b.minute);
  const spells: RoutineSpell[] = [];
  let spell: RoutineSpell | null = null;
  const closeSpell = () => {
    if (!spell || !options.spell) return;
    const last = spell.events[spell.events.length - 1]!;
    const words = options.spell(spell, spells);
    rows.push({
      id: `spell:${spell.id}`,
      minute: last.minute,
      kind: 'play',
      ...words,
      subject: subject(last),
      teamId: last.teamId,
      spell,
    });
    spells.push(spell);
    spell = null;
  };
  // Narration tied to a folded shot moves to the goal that follows it.
  let carried: NarrationLine[] = [];
  events.forEach((event, index) => {
    // Loose lines from earlier minutes come before this event.
    while (pending.length && pending[0]!.minute < event.minute) rows.push(line(pending.shift()!));
    const tied = [...carried, ...(before.get(event.id) ?? [])];
    carried = [];
    if (options.spell && isRoutine(event)) {
      for (const entry of tied) rows.push(line(entry));
      spell ??= { id: event.id, events: [], completed: 0, lost: 0 };
      spell.events.push(event);
      if (event.outcome!.success) spell.completed++;
      else spell.lost++;
      return;
    }
    closeSpell();
    const next = events[index + 1];
    if (
      event.kind === 'shot' &&
      !isMoment(event) &&
      next?.kind === 'goal' &&
      next.playerId === event.playerId
    ) {
      carried = tied;
      return;
    }
    for (const entry of tied) rows.push(line(entry));
    rows.push({
      id: event.id,
      minute: event.minute,
      kind: kindOf(event),
      ...asText(text(event)),
      subject: subject(event),
      teamId: event.teamId,
      event,
    });
  });
  closeSpell();
  rows.push(...pending.map(line));
  return rows.reverse();
}
