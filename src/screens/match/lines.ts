import type { MatchEvent } from '../../model/domain';
import type { MatchSession } from '../../engine/match';
import { cycledVariant } from '../../engine/match/commentary';
import { commentaryLabel, spellCopy } from '../../i18n/commentary';
import { addMatchLabels, matchFormat } from '../../i18n/match';
import { momentCopy } from '../../i18n/momentsCopy';
import { narrationFeed, narrationName } from '../../i18n/narration';
import type { FeedText, NarrationLine, RoutineSpell } from './feed';
import { goalStory, goalText, scoreline } from './goals';

/**
 * The words of the live commentary (release 1.0, step 5.5), read from the session: each event's
 * line with the names and the score it refers to, goals through their score-aware lines (5.1),
 * and the summary of a spell of routine passes. Presentation only: nothing here is stored, so
 * match-21 and match-22 sessions read alike (their keys differ).
 *
 * The match screen loads this module, with the commentary and narration copy, once a match is
 * under way (MatchBody), so the copy stays off the route's first render.
 */
// Match-22's framings and reads of the play load with the commentary (step 5.2).
addMatchLabels(momentCopy);

export interface FeedLines {
  text(event: MatchEvent): FeedText;
  spell(spell: RoutineSpell, earlier: readonly RoutineSpell[]): FeedText;
}

export function feedLines(session: Pick<MatchSession, 'setup' | 'state'>): FeedLines {
  const { setup, state } = session;
  const events = state.match.events;
  // The score once each event is logged, home first.
  const scores = new Map<string, [number, number]>();
  const running: [number, number] = [0, 0];
  for (const event of events) {
    if (event.kind === 'goal') running[event.teamId === setup.home.id ? 0 : 1]++;
    scores.set(event.id, [running[0], running[1]]);
  }
  const nameOf = (id: string | null | undefined) => (id && setup.players[id]?.name) || '';
  /** Each side's goalkeeper on the pitch now, by surname. */
  const keepers = ([state.match.home, state.match.away] as const).map((team) => {
    const id = team.starterIds.find(
      (player) =>
        setup.players[player]?.primaryPosition === 'GK' && !team.sentOffIds?.includes(player),
    );
    return id ? narrationName(nameOf(id)) : '';
  });
  const club = (side: 0 | 1) => (side === 0 ? setup.home : setup.away);

  function params(event: MatchEvent): Record<string, string> {
    const side = event.teamId === setup.home.id ? 0 : 1;
    const score = scores.get(event.id) ?? [0, 0];
    const leader = score[0] === score[1] ? undefined : score[0] > score[1] ? 0 : 1;
    return {
      ...event.commentaryParams,
      ...(event.receiverId && !event.commentaryParams?.receiver
        ? { receiver: nameOf(event.receiverId) }
        : {}),
      team: club(side).name,
      opponent: club(side === 0 ? 1 : 0).name,
      keeper: keepers[side === 0 ? 1 : 0] || club(side === 0 ? 1 : 0).name,
      home: setup.home.name,
      away: setup.away.name,
      scoreline: scoreline(setup, score),
      ...(leader === undefined
        ? {}
        : { leader: club(leader).name, trailer: club(leader === 0 ? 1 : 0).name }),
    };
  }

  return {
    text(event) {
      if (event.kind === 'goal') return goalText(setup, goalStory(setup, events, event), events);
      const template = event.commentaryKey;
      return { text: matchFormat(commentaryLabel(template), params(event)), template };
    },
    spell(spell, earlier) {
      const pool = poolOf(spell);
      const lines = spellCopy[pool];
      const uses = earlier.filter((entry) => poolOf(entry) === pool).length;
      const index = cycledVariant(`${setup.seed}:spell:${pool}`, lines.length, uses);
      const first = spell.events[0]!;
      // The teammate the spell found most, first found first on a tie.
      const found = new Map<string, number>();
      for (const event of spell.events)
        if (event.outcome?.success && event.receiverId)
          found.set(event.receiverId, (found.get(event.receiverId) ?? 0) + 1);
      const receiver = [...found].reduce<[string, number] | undefined>(
        (best, entry) => (!best || entry[1] > best[1] ? entry : best),
        undefined,
      )?.[0];
      const side = first.teamId === setup.home.id ? 0 : 1;
      return {
        text: matchFormat(lines[index]!, {
          player: nameOf(first.playerId),
          receiver: receiver ? nameOf(receiver) : spellCopy.teammate,
          team: club(side).name,
          count: spell.events.length,
          lost: spell.lost,
        }),
        template: `spell:${pool}.${index}`,
      };
    },
  };
}

const poolOf = (spell: RoutineSpell): 'one' | 'lost' | 'several' | 'mixed' =>
  spell.events.length === 1 ? (spell.lost ? 'lost' : 'one') : spell.lost ? 'mixed' : 'several';

/** The live line for one event, as the feed shows it (and the screen reader announces it). */
export const liveText = (session: Pick<MatchSession, 'setup' | 'state'>, event: MatchEvent) =>
  feedLines(session).text(event).text;

/** The session's narration as feed lines (engine M3), with each line's key as its template. */
export function narrationLines(session: Pick<MatchSession, 'setup' | 'state'>): NarrationLine[] {
  return narrationFeed(session).map((entry) => ({
    id: String(entry.index),
    minute: entry.minute,
    ...(entry.addedTime ? { addedTime: entry.addedTime } : {}),
    text: entry.text,
    template: session.state.narration[entry.index]!.key,
    ...(entry.eventId ? { eventId: entry.eventId } : {}),
  }));
}
