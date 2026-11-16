import { useEffect, useRef } from 'react';
import type { MatchSession } from '../../engine/match/types';
import { audio, type SoundName } from '../../audio';
import type { ReelBeat } from './reel/useReel';

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
 * Match sound for the highlights reel: whistles at kick-off, half-time and full time; the
 * crowd swelling before each chain and a cue when its card opens; the net and the roar (or
 * the groan) when a goal goes in on the pitch — not before, while its clip still plays; a
 * kick for shots in the ticker; and a crowd bed that follows the beat and the occasion. Only
 * new events make sound, so a restored match does not replay its history.
 */
export function useMatchAudio(
  session: MatchSession | null,
  beat: ReelBeat['kind'],
  heldGoalId?: string,
): void {
  const status = session?.state.match.status;
  const events = session?.state.match.events;
  // A goal still on the pitch is not counted until it goes in.
  const count = (events?.length ?? 0) - (heldGoalId ? 1 : 0);
  const momentum = session?.state.match.momentum ?? 50;
  const selected = session?.setup.selectedPlayerId;
  const ownTeamId = session
    ? session.setup.home.playerIds.includes(selected ?? '')
      ? session.setup.home.id
      : session.setup.away.id
    : null;
  const seed = session?.setup.seed;
  const occasion =
    (session?.setup.fixture?.importance ?? 1) > 1 ||
    (Boolean(session?.setup.home.city) && session?.setup.home.city === session?.setup.away.city);
  const lastStatus = useRef(status);
  const lastCount = useRef(count);

  useEffect(() => {
    void audio.prepare(MATCH_SOUNDS);
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
  }, [status]);

  useEffect(() => {
    if (beat === 'card') audio.play('moment');
  }, [beat]);

  useEffect(() => {
    const from = lastCount.current;
    lastCount.current = count;
    if (!events || count <= from) return;
    const fresh = events.filter((event) => event.id !== heldGoalId).slice(from);
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
  }, [count, events, ownTeamId, heldGoalId]);

  useEffect(() => {
    if (!status) return audio.crowd(null);
    const excitement = Math.min(1, Math.abs(momentum - 50) / 50);
    const level =
      beat === 'build'
        ? 0.9
        : beat === 'clip' || beat === 'banner'
          ? 0.65
          : beat === 'card'
            ? 0.55
            : status === 'live'
              ? 0.3 + 0.4 * excitement
              : status === 'preview'
                ? 0.1
                : 0.15;
    audio.crowd(Math.round(Math.min(1, level * (occasion ? 1.25 : 1)) * 10) / 10);
  }, [status, beat, momentum, occasion]);
}
