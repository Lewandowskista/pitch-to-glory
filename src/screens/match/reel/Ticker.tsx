import { useMemo, type CSSProperties } from 'react';
import type { MatchSession } from '../../../engine/match';
import { reelText as r } from '../../../i18n/reel';
import { matchFormat } from '../../../i18n/match';
import { plural } from '../../../i18n/locale';
import { cx } from '../../../ui/kit';
import { kitAppearance } from '../pitchKit';
import { surname } from '../cam';
import { clockText } from './clock';
import { WAVE_MINUTES, momentumWave, tickerChips, waveShare } from './tickerData';
import type { ChainKind } from './chain';
import { defending } from './chain';

/*
 * The ticker between chains (docs/EXPERIENCE-REDESIGN-1.0.md §1.2): no pitch while play is
 * dead — the clock with the added-time board, a momentum wave of the last 20 minutes in the
 * teams' colours, and event chips sliding in. Before a chain the wave spikes and "Chance
 * building…" pulses. Chips are for the eyes: screen readers hear the chains, the goals and the
 * score instead.
 */
export function TickerPanel({
  session,
  heldGoalId,
  building,
  compact = false,
}: {
  session: MatchSession;
  heldGoalId?: string;
  /** A chain is about to start: whose. */
  building: ChainKind | null;
  /** Beside a clip on wide screens: the wave and chips only. */
  compact?: boolean;
}) {
  const { setup, state } = session;
  const kits = kitAppearance(setup.home, setup.away);
  const minute = state.match.minute;
  const events = state.match.events;
  const visible = useMemo(
    () => (heldGoalId ? events.filter((event) => event.id !== heldGoalId) : events),
    [events, heldGoalId],
  );
  const wave = useMemo(
    () => momentumWave(visible, setup.home.id, minute, state.match.momentum),
    [visible, setup.home.id, minute, state.match.momentum],
  );
  const chips = useMemo(() => tickerChips(session, heldGoalId), [session, heldGoalId]);
  const share = waveShare(wave);
  const board = state.stoppage?.find((entry) => entry.at === minute && entry.minutes > 0);
  const own = setup.home.playerIds.includes(setup.selectedPlayerId) ? 0 : 1;
  const spikeSide = building ? (defending(building) ? 1 - own : own) : null;
  return (
    <section
      className={cx('reel-ticker', compact && 'is-compact', building && 'is-building')}
      aria-label={r.ticker}
      data-testid="ticker"
    >
      {!compact && (
        <div className="reel-ticker-clock" aria-hidden="true">
          <span className="reel-live-dot" />
          <strong>{clockText(minute, state.added)}</strong>
          {board && (
            <span className="reel-added" data-testid="added-time-board">
              {matchFormat(r.addedBoard, { minutes: board.minutes })}
            </span>
          )}
        </div>
      )}
      {board && <span className="sr-only">{plural(board.minutes, r.addedBoardLabel)}</span>}
      <figure
        className="reel-wave"
        role="img"
        aria-label={matchFormat(r.waveLabel, {
          home: setup.home.name,
          away: setup.away.name,
          homeShare: share,
          awayShare: 100 - share,
        })}
      >
        <figcaption className="reel-wave-title" aria-hidden="true">
          {r.waveTitle}
        </figcaption>
        <div className="reel-wave-bars" aria-hidden="true">
          {wave.map((value, index) => (
            <span
              key={index}
              className={cx('reel-wave-bar', value >= 0 ? 'is-home' : 'is-away')}
              style={
                {
                  '--bar': Math.max(0.06, Math.abs(value)),
                  gridColumn: WAVE_MINUTES - wave.length + index + 1,
                  background: value >= 0 ? kits.home : kits.away,
                } as CSSProperties
              }
            />
          ))}
          {spikeSide !== null && (
            <span
              className={cx('reel-wave-spike', spikeSide === 0 ? 'is-home' : 'is-away')}
              style={{ background: spikeSide === 0 ? kits.home : kits.away }}
            />
          )}
        </div>
      </figure>
      {building && (
        <p className="reel-building" data-testid="chance-building">
          {defending(building) ? r.building.defence : r.building.attack}
        </p>
      )}
      <ol className="reel-chips" aria-hidden="true">
        {chips.map((chip) => {
          const player = chip.playerId ? setup.players[chip.playerId] : undefined;
          return (
            <li
              key={chip.id}
              className={cx('reel-chip', `is-${chip.kind}`)}
              style={{ '--team': chip.side === 0 ? kits.home : kits.away } as CSSProperties}
            >
              <time>{clockText(chip.minute, chip.addedTime)}</time>
              <strong>{r.chips[chip.kind]}</strong>
              {player && <span>{surname(player.name)}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
