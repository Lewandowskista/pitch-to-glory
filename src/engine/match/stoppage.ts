/**
 * Stoppage time (match-22, release 1.0 step 5.4; review M12). At the end of each period the
 * fourth official's board shows the added minutes, from what stopped play in it (goals,
 * substitutions, cards, injuries) within a realistic band; the clock then stands at the
 * period's last minute (45, 90, and 105 and 120 in extra time) while they are played, shown
 * as 45+2′ or 90+4′. Match-21 sessions never reach this module.
 */
import { createRng } from '../rng';
import type { MatchSession, MatchState } from './types';
import { MATCH_CONFIG as C } from './tuning';
import { event, line } from './events';

const S = C.occasions.stoppage;

/** The minutes that end a period: 45 and 90, and 105 and 120 once extra time began. */
export function periodEnds(state: Pick<MatchState, 'regulation'>): number[] {
  return state.regulation ? [45, 90, 105, 120] : [45, 90];
}
/** The board shown at the end of the period that ends at `at`, if it was shown. */
export const boardAt = (state: Pick<MatchState, 'stoppage'>, at: number) =>
  state.stoppage?.find((board) => board.at === at);
/** Whether the next minute played is an added one: the board is up and minutes remain. */
export function addedDue(state: MatchState): boolean {
  const board = boardAt(state, state.match.minute);
  return board !== undefined && (state.added ?? 0) < board.minutes;
}
/** Whether the period that ends at this minute has played all of its added time. */
export function periodOver(state: MatchState): boolean {
  const board = boardAt(state, state.match.minute);
  return board !== undefined && (state.added ?? 0) >= board.minutes;
}

/**
 * The added minutes for the period ending at `at` (`${seed}:added:${at}`; three draws always):
 * base + goals × goal + substitutions × substitution + cards × card + injuries × injury +
 * a uniform draw below `jitter`, rounded within the band. In the second half a long stoppage
 * stretches the band to `long.upTo` with `long.chance`.
 */
export function addedMinutes(session: MatchSession, at: number): number {
  const s = session.state;
  const ends = periodEnds(s);
  const from = ends[ends.indexOf(at) - 1] ?? 0;
  const period = C.occasions.stoppage.periods[at] ?? { base: 0, band: [0, 2] as const };
  let goals = 0,
    substitutions = 0,
    cards = 0;
  for (const e of s.match.events) {
    if (e.minute <= from || e.minute > at) continue;
    if (e.kind === 'goal') goals++;
    else if (e.kind === 'substitution') substitutions++;
    else if (e.kind === 'card') cards++;
  }
  const injuries =
    (s.injuries ?? []).filter((injury) => injury.minute > from && injury.minute <= at).length +
    (s.knock && s.knock.minute > from && s.knock.minute <= at ? 1 : 0);
  const rng = createRng(`${session.setup.seed}:added:${at}`);
  const jitter = rng.next(),
    long = rng.next(),
    stretch = rng.int(2, 4);
  const raw = Math.round(
    period.base +
      goals * S.goal +
      substitutions * S.substitution +
      cards * S.card +
      injuries * S.injury +
      jitter * S.jitter,
  );
  const [low, high] = period.band;
  const minutes = Math.max(low, Math.min(high, raw));
  return at === 90 && long < S.long.chance ? Math.min(S.long.upTo, minutes + stretch) : minutes;
}

/**
 * The board goes up at the end of a period's last minute: its added minutes are stored and
 * announced (none to announce when the period has none).
 */
export function showBoard(session: MatchSession): { at: number; minutes: number } {
  const s = session.state,
    at = s.match.minute;
  const board = { at, minutes: addedMinutes(session, at) };
  s.stoppage = [...(s.stoppage ?? []), board];
  if (board.minutes > 0) {
    const shown = event(
      session,
      'halftime',
      session.setup.players[session.setup.selectedPlayerId]!.clubId!,
      null,
      line(session, 'match.commentary.added-time'),
    );
    shown.commentaryParams = { minutes: String(board.minutes) };
  }
  return board;
}

/** Moves the clock on one minute: an added minute while the board's remain, else the next. */
export function tick(state: MatchState): void {
  if (addedDue(state)) state.added = (state.added ?? 0) + 1;
  else {
    state.match.minute++;
    delete state.added;
  }
}
