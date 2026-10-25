import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Club, Moment, World } from '../../model/domain';
import { decodeClip, momentLink } from '../../engine/career/honours';
import { platform } from '../../platform';
import { track } from '../../analytics';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { honoursText as h } from '../../i18n/honours';
import { CONFIG } from '../../engine/config';
import { ButtonLink, CardTitle, HeroPanel, Panel, StatusLine, cx } from '../../ui/kit';
import { CareerPage, CrestImage, useSaveLink } from './shared';
import { counted, Glyph, ordinal, useReducedMotionSetting, type GlyphName } from './honoursUi';
import { ClipPitch, ClipProgress, ReplayButton, useClipPlayback } from './MomentPitch';

export default function CareerMoments() {
  return (
    <CareerPage title={h.titles.moments} description={h.moments.pageBody}>
      {({ world, career }) => <MomentsContent world={world} playerId={career.playerId} />}
    </CareerPage>
  );
}

/** Goals first, then the moments every position can make (saves, challenges, assists). */
const MOMENT_KINDS = [
  'winner',
  'equalizer',
  'wonder',
  'final',
  'hat-trick',
  'shootout',
  'penalty-save',
  'great-save',
  'last-ditch',
  'assist',
] as const;
const MOMENT_GLYPH: Record<Moment['kind'], GlyphName> = {
  winner: 'ball',
  equalizer: 'ball',
  wonder: 'star',
  final: 'trophy',
  'hat-trick': 'ball',
  shootout: 'medal',
  'penalty-save': 'glove',
  'great-save': 'glove',
  'last-ditch': 'shield',
  assist: 'boot',
};
/** Rare kinds wear gold; the rest the accent. */
const GOLD_KINDS = new Set<Moment['kind']>(['wonder', 'final', 'shootout', 'penalty-save']);
const LATE = ordinal(CONFIG.career.honours.moments.lateMinute);

/** A side's crest, found by name (clips store names and colours, not club ids). */
function TeamCrest({ club }: { club: Club | undefined }) {
  if (!club) return null;
  return <CrestImage crest={club.crest} alt="" className="h-[1.4375rem] w-5 shrink-0" />;
}

export function MomentCard({
  moment,
  highlight,
  clubs,
}: {
  moment: Moment;
  highlight?: boolean;
  clubs?: Map<string, Club>;
}) {
  const clip = useMemo(() => decodeClip(moment.clip), [moment.clip]);
  const playback = useClipPlayback(clip);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string }>({
    tone: 'success',
    text: '',
  });
  const path = `/moment#${momentLink(moment)}`;
  const kind = h.moments.kinds[moment.kind];
  return (
    <li
      id={`moment-${moment.id}`}
      className={cx(
        'flex min-w-0 scroll-mt-6 flex-wrap items-start gap-x-5 gap-y-3.5 rounded-panel p-4.5',
        highlight
          ? 'flex-[1_1_100%] border-2 border-accent bg-accent-soft'
          : 'flex-[1_1_27.5rem] border border-line bg-surface-soft',
      )}
    >
      <div className="flex flex-[1_1_100%] flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
        <span className="flex flex-wrap items-center gap-2.5">
          <span
            aria-hidden="true"
            className={cx(
              'grid h-[2.125rem] w-[2.125rem] shrink-0 place-items-center self-center rounded-full',
              GOLD_KINDS.has(moment.kind) ? 'bg-gold text-on-gold' : 'bg-accent text-on-accent',
            )}
          >
            <Glyph name={MOMENT_GLYPH[moment.kind]} className="h-[1.125rem] w-[1.125rem]" />
          </span>
          <h3 className="font-display text-[1.875rem] leading-none font-normal">{kind}</h3>
          {highlight && (
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-[0.6875rem] font-extrabold text-on-accent">
              {h.moments.focused}
            </span>
          )}
        </span>
        <span className="text-xs font-semibold text-muted">
          {format(c.common.seasonWeek, { season: moment.date.season, week: moment.date.week })}
        </span>
      </div>
      <p className="-mt-1.5 flex flex-[1_1_100%] flex-wrap items-center gap-2 text-sm">
        <TeamCrest club={clubs?.get(moment.home.name)} />
        <span className="font-semibold">{moment.home.name}</span>
        <span className="font-display text-[1.375rem] leading-none">
          {moment.score[0]}–{moment.score[1]}
        </span>
        <span className="font-semibold">{moment.away.name}</span>
        <TeamCrest club={clubs?.get(moment.away.name)} />
        <span className="text-muted">· {format(h.moments.minute, { minute: moment.minute })}</span>
      </p>
      <figure
        className={cx(
          'flex min-w-0 flex-col gap-2',
          highlight ? 'flex-[1.6_1_28.75rem]' : 'flex-[1_1_100%]',
        )}
      >
        <ClipPitch
          clip={clip}
          playback={playback}
          home={moment.home.color}
          away={moment.away.color}
          scorer={moment.scorerName}
          label={format(h.moments.pitch, { scorer: moment.scorerName, minute: moment.minute })}
        />
        <ClipProgress playback={playback} />
      </figure>
      <div
        className={cx(
          'flex min-w-0 flex-[1_1_16.25rem] flex-col gap-3',
          highlight && 'self-center',
        )}
      >
        <p className="text-[0.8125rem] text-muted">
          <span className="font-bold text-ink">{h.moments.savedBecause}</span>{' '}
          {format(h.moments.kindHints[moment.kind], { minute: LATE })}
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <ReplayButton playback={playback} />
          <button
            type="button"
            className="button secondary"
            onClick={async () => {
              const result = await platform.shareLink(`${window.location.origin}${path}`, kind);
              if (result !== 'failed') track('shared', { what: 'moment', method: result });
              setStatus(
                result === 'shared'
                  ? { tone: 'success', text: h.moments.shared }
                  : result === 'copied'
                    ? { tone: 'success', text: h.moments.copied }
                    : { tone: 'error', text: h.moments.shareFailed },
              );
            }}
          >
            <Glyph name="link" className="h-4 w-4" />
            {h.moments.share}
          </button>
          <Link className="text-button" to={path}>
            {h.moments.open}
          </Link>
        </div>
        <StatusLine tone={status.tone} className="self-start py-2">
          {status.text}
        </StatusLine>
      </div>
    </li>
  );
}

function MomentsContent({ world, playerId }: { world: World; playerId: string }) {
  const [params] = useSearchParams();
  const focus = params.get('moment');
  const reduced = useReducedMotionSetting();
  const moments = world.moments.filter((moment) => moment.playerId === playerId).reverse();
  const clubs = useMemo(
    () => new Map(Object.values(world.clubs).map((club) => [club.name, club])),
    [world.clubs],
  );
  // A moment opened from the Chronicle is brought into view.
  useEffect(() => {
    if (!focus) return;
    document
      .getElementById(`moment-${focus}`)
      ?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  }, [focus, reduced]);
  if (!moments.length) return <MomentsEmpty />;
  return (
    <Panel aria-labelledby="moments-heading" className="flex flex-col gap-4.5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-[1_1_26rem]">
          <CardTitle id="moments-heading" size="lg">
            {h.moments.title}
          </CardTitle>
          <p className="mt-1 max-w-[38.75rem] text-muted">{h.moments.body}</p>
        </div>
        <span className="text-[0.8125rem] font-semibold text-muted">
          {format(counted(moments.length, h.moments.count), {
            limit: CONFIG.career.honours.moments.limit,
          })}
        </span>
      </div>
      <ul className="flex flex-wrap gap-4">
        {moments.map((moment) => (
          <MomentCard
            key={moment.id}
            moment={moment}
            highlight={moment.id === focus}
            clubs={clubs}
          />
        ))}
      </ul>
    </Panel>
  );
}

/** Teaches what a moment is and sends the player to the next match to make one. */
function MomentsEmpty() {
  const link = useSaveLink();
  return (
    <HeroPanel aria-labelledby="moments-heading" markings className="max-w-4xl">
      <div className="flex flex-col gap-4">
        <h2
          id="moments-heading"
          className="font-display text-[2.25rem] leading-[0.95] font-normal sm:text-[2.75rem]"
        >
          {h.moments.emptyTitle}
        </h2>
        <p className="text-hero-muted">{h.moments.emptyBody}</p>
        <ul className="flex flex-col gap-2">
          {MOMENT_KINDS.map((kind) => (
            <li
              key={kind}
              className="flex items-center gap-3 rounded-control bg-surface px-3.5 py-2.5 text-ink"
            >
              <span
                aria-hidden="true"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"
              >
                <Glyph name={MOMENT_GLYPH[kind]} />
              </span>
              <span className="min-w-0 text-sm">
                <strong className="block">{h.moments.kinds[kind]}</strong>
                <span className="text-muted">
                  {format(h.moments.kindHints[kind], { minute: LATE })}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <div>
          <ButtonLink variant="play" size="lg" to={link('/match')} iconEnd="arrow">
            {h.moments.play}
          </ButtonLink>
        </div>
      </div>
    </HeroPanel>
  );
}
