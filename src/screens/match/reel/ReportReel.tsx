import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { MatchSession } from '../../../engine/match';
import { reelText as r } from '../../../i18n/reel';
import { matchFormat } from '../../../i18n/match';
import { cx } from '../../../ui/kit';
import { ClipStage } from './ClipStage';
import { chainSummaries, type ChainSummaryView } from './chain';
import { clockText } from './clock';
import { castDescription } from './cast';
import { replayClip, stepFrames } from './replay';
import type { ReelClip } from './clips';
import { BEAT_MS, GAP_MS } from './timeline';

const upright = () => window.matchMedia('(orientation: portrait) and (max-width: 950px)').matches;
function useUpright() {
  return useSyncExternalStore(
    (change) => {
      const list = window.matchMedia('(orientation: portrait) and (max-width: 950px)');
      list.addEventListener('change', change);
      return () => list.removeEventListener('change', change);
    },
    upright,
    () => false,
  );
}

/**
 * The report's first beat after the score (docs/EXPERIENCE-REDESIGN-1.0.md §1.5, §2): one tile
 * per chain — its minute, how it ended and a ✓ or ✗ for each step — and a tap on a tile
 * replays its clips, lead-in then outcome, on the reel's stage.
 */
export function ReportReel({ session, reduced }: { session: MatchSession; reduced: boolean }) {
  const id = useId();
  const chains = useMemo(() => chainSummaries(session), [session]);
  const [open, setOpen] = useState<ChainSummaryView | null>(null);
  const [clips, setClips] = useState<ReelClip[]>([]);
  const [index, setIndex] = useState(0);
  const [beat, setBeat] = useState(false);
  const vertical = useUpright();
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let current = true;
    setClips([]);
    setIndex(0);
    setBeat(false);
    void stepFrames(session, open.momentIds).then((frames) => {
      if (!current) return;
      const built: ReelClip[] = [];
      open.momentIds.forEach((momentId, step) => {
        const moment = session.state.match.keyMoments.find((entry) => entry.id === momentId);
        const parts = frames.get(momentId);
        if (!moment || !parts) return;
        if (parts.lead) built.push(replayClip(session, moment, 'lead', parts.lead, step));
        if (parts.outcome) built.push(replayClip(session, moment, 'outcome', parts.outcome, step));
      });
      setClips(built);
      stage.current?.scrollIntoView({ block: 'nearest' });
    });
    return () => {
      current = false;
    };
  }, [open, session]);
  const clip = clips[index] ?? null;
  // Clip after clip, the outcome's line shown as it lands.
  useEffect(() => {
    if (!clip) return;
    setBeat(false);
    const beatTimer = clip.beat
      ? window.setTimeout(() => setBeat(true), reduced ? 0 : clip.timeline.beatAt)
      : 0;
    const next =
      index < clips.length - 1
        ? window.setTimeout(
            () => setIndex(index + 1),
            (reduced ? 900 : clip.timeline.duration) + GAP_MS + (clip.beat ? BEAT_MS : 0),
          )
        : 0;
    return () => {
      window.clearTimeout(beatTimer);
      window.clearTimeout(next);
    };
  }, [clip, index, clips.length, reduced]);
  return (
    <section className="match-panel reel-report" aria-labelledby={`${id}-moments`}>
      <h3 id={`${id}-moments`} className="match-card-title is-display">
        {r.report.moments}
      </h3>
      {chains.length === 0 ? (
        <p className="match-card-note">{r.report.none}</p>
      ) : (
        <ol className="reel-tiles">
          {chains.map((chain) => {
            const minute = clockText(chain.minute, chain.addedTime);
            const outcome = r.report.outcomes[chain.outcome];
            return (
              <li key={chain.id}>
                <button
                  type="button"
                  className={cx('reel-tile', chain.positive && 'is-positive')}
                  aria-pressed={open?.id === chain.id}
                  aria-label={matchFormat(r.report.tileLabel, {
                    minute,
                    outcome,
                    steps: chain.results.map((step) => (step.success ? '✓' : '✗')).join(' '),
                  })}
                  data-testid="moment-tile"
                  onClick={() => setOpen(chain)}
                >
                  <span className="reel-tile-minute">{minute}</span>
                  <strong>{outcome}</strong>
                  <span className="reel-tile-steps" aria-hidden="true">
                    {chain.results.map((step, number) => (
                      <span key={number} data-success={step.success ? '' : undefined}>
                        {step.success ? '✓' : '✗'}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {open && (
        <div ref={stage} className="reel-report-stage" data-testid="moment-replay">
          <ClipStage
            spec={clip}
            setup={session.setup}
            vertical={vertical}
            reduced={reduced}
            skipKey={0}
            label={clip ? castDescription(clip.cast, session.setup, { you: r.you }) : r.goalClip}
          >
            {clip?.beat && beat && (
              <div className="reel-beat" data-success={clip.beat.success ? '' : undefined}>
                <span className="reel-beat-mark" aria-hidden="true">
                  {clip.beat.success ? '✓' : '✗'}
                </span>
                <span className="min-w-0">
                  <strong>{clip.beat.title}</strong>
                  <span>{clip.beat.cause}</span>
                </span>
              </div>
            )}
          </ClipStage>
          <button type="button" className="reel-why-close" onClick={() => setOpen(null)}>
            {r.report.close}
          </button>
        </div>
      )}
    </section>
  );
}
