import { useEffect, useRef } from 'react';
import type { MatchSession } from '../../engine/match/types';
import { audio, type SoundName } from '../../audio';

const MATCH_SOUNDS: SoundName[] = [
  'whistle',
  'whistleLong',
  'whistleFull',
  'kick',
  'net',
  'roar',
  'ooh',
  'moment',
  'crowd',
];

/**
 * Match sound: whistles at kick-off, half-time and full time, a cue when a key moment
 * pauses play, the crowd roaring for the player's side and groaning at the opposition's
 * goals, and a crowd bed that rises with play and momentum. Only new events make sound, so
 * a restored match does not replay its history; a burst of events (skipping ahead, 4×
 * speed) plays at most one goal sound.
 */
export function useMatchAudio(session: MatchSession | null, playing: boolean): void {
  const status = session?.state.match.status;
  const events = session?.state.match.events;
  const count = events?.length ?? 0;
  const momentum = session?.state.match.momentum ?? 50;
  const selected = session?.setup.selectedPlayerId;
  const ownTeamId = session
    ? session.setup.home.playerIds.includes(selected ?? '')
      ? session.setup.home.id
      : session.setup.away.id
    : null;
  const seed = session?.setup.seed;
  const lastStatus = useRef(status);
  const lastCount = useRef(count);

  useEffect(() => {
    audio.prepare(MATCH_SOUNDS);
    return () => audio.crowd(null);
  }, []);

  // A different match (a new fixture, a load) starts silently from its current state.
  useEffect(() => {
    lastStatus.current = status;
    lastCount.current = count;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the match changes
  }, [seed]);

  useEffect(() => {
    const previous = lastStatus.current;
    lastStatus.current = status;
    if (!status || previous === status) return;
    if (status === 'live' && (previous === 'preview' || previous === 'halftime'))
      audio.play('whistle');
    else if (status === 'halftime') audio.play('whistleLong');
    else if (status === 'finished') audio.play('whistleFull');
    else if (status === 'decision') audio.play('moment');
  }, [status]);

  useEffect(() => {
    const from = lastCount.current;
    lastCount.current = count;
    if (!events || count <= from) return;
    const fresh = events.slice(from);
    const goals = fresh.filter((event) => event.kind === 'goal');
    if (goals.length) {
      const ours = goals.some((goal) => goal.teamId === ownTeamId);
      audio.play('net');
      audio.play(ours ? 'roar' : 'ooh');
      return;
    }
    const recent = fresh.slice(-3);
    if (recent.some((event) => event.kind === 'shot')) audio.play('kick');
    if (recent.some((event) => event.kind === 'save' && event.teamId !== ownTeamId))
      audio.play('ooh');
    if (recent.some((event) => event.kind === 'card')) audio.play('whistle');
  }, [count, events, ownTeamId]);

  useEffect(() => {
    if (!status) return audio.crowd(null);
    const excitement = Math.min(1, Math.abs(momentum - 50) / 50);
    const level =
      status === 'live'
        ? playing
          ? 0.3 + 0.5 * excitement
          : 0.2
        : status === 'decision'
          ? 0.55
          : status === 'preview'
            ? 0.1
            : 0.15;
    audio.crowd(Math.round(level * 10) / 10);
  }, [status, playing, momentum]);
}
