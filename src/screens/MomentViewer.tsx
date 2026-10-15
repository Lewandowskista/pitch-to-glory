import { useEffect, useState } from 'react';
import { parseMomentLink, type Clip, type MomentLink } from '../engine/career/honours/clip';
import { Page } from '../ui/Page';
import { ButtonLink, PageHeader, StatusLine } from '../ui/kit';
import { format, t } from '../i18n';
import { honoursText as h } from '../i18n/honours';
import { MomentPitch } from './career/MomentPitch';

/** A team in the scoreline: its name beside a disc in its kit colour (from the link). */
function TeamMark({ team, end = false }: { team: [string, string]; end?: boolean }) {
  const disc = (
    <span
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-line"
      style={{ background: team[1] }}
    />
  );
  return (
    <span className="flex min-w-0 items-center gap-2 font-bold">
      {!end && disc}
      <span className="min-w-0 break-words">{team[0]}</span>
      {end && disc}
    </span>
  );
}

/** A damaged link: a crossed-out pitch and the way forward. */
function InvalidMoment() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <svg
          viewBox="0 0 116 80"
          width="120"
          height="70"
          aria-hidden="true"
          className="shrink-0 rounded-chip"
        >
          <rect width="116" height="80" className="fill-surface-soft" />
          <g fill="none" strokeWidth="1.5" className="stroke-muted opacity-40">
            <rect x="8" y="8" width="100" height="64" />
            <path d="M58 8 V72" />
            <circle cx="58" cy="40" r="9" />
          </g>
          <path
            d="M48 30 L68 50 M68 30 L48 50"
            strokeWidth="3"
            strokeLinecap="round"
            className="stroke-danger"
          />
        </svg>
        <StatusLine tone="error" className="min-w-0 flex-[1_1_15rem] text-sm">
          {h.moments.invalid}
        </StatusLine>
      </div>
      <p className="text-[0.8125rem] text-muted">{h.moments.invalidBody}</p>
      <div>
        <ButtonLink to="/career/new" iconEnd="arrow">
          {h.moments.start}
        </ButtonLink>
      </div>
    </div>
  );
}

/**
 * A shared moment, replayed from its link alone: the clip and seed travel in the URL hash,
 * so it works without a save, offline, and is never sent to a server.
 */
export default function MomentViewer() {
  const [moment, setMoment] = useState<(MomentLink & { decoded: Clip }) | null | 'invalid'>(null);
  useEffect(() => {
    const read = () => {
      try {
        setMoment(parseMomentLink(window.location.hash.slice(1)));
      } catch {
        setMoment('invalid');
      }
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  return (
    <Page>
      <PageHeader
        eyebrow={
          <span className="font-extrabold tracking-[0.14em] text-accent uppercase">
            {h.eyebrow}
          </span>
        }
        title={h.titles.moment}
        description={h.moments.viewerBody}
      />
      <div className="flex max-w-[70rem] flex-col gap-[1.375rem]">
        <section
          aria-labelledby={moment && moment !== 'invalid' ? 'moment-title' : undefined}
          aria-label={moment && moment !== 'invalid' ? undefined : h.titles.moment}
          className="ui-card flex min-w-0 flex-col gap-4 rounded-panel border border-line bg-surface p-panel shadow-surface sm:p-6"
        >
          {moment === 'invalid' ? (
            <InvalidMoment />
          ) : moment ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <h2
                  id="moment-title"
                  className="min-w-0 font-display text-[2.25rem] leading-[0.95] font-normal break-words sm:text-[3rem]"
                >
                  {h.moments.kinds[moment.kind]} · {moment.scorer}
                </h2>
                <p className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-surface-soft px-4 py-2.5">
                  <span className="sr-only">
                    {format(h.moments.score, {
                      home: moment.home[0],
                      away: moment.away[0],
                      homeGoals: moment.score[0],
                      awayGoals: moment.score[1],
                    })}
                    {' · '}
                  </span>
                  <span aria-hidden="true" className="contents">
                    <TeamMark team={moment.home} />
                    <span className="font-display text-[2.125rem] leading-none">
                      {moment.score[0]}–{moment.score[1]}
                    </span>
                    <TeamMark team={moment.away} end />
                  </span>
                  <span className="border-l border-line pl-3 font-bold text-muted">
                    {format(h.moments.minute, { minute: moment.minute })}
                  </span>
                </p>
              </div>
              <MomentPitch
                clip={moment.decoded}
                home={moment.home[1]}
                away={moment.away[1]}
                label={format(h.moments.pitch, { scorer: moment.scorer, minute: moment.minute })}
              />
              <p className="text-xs text-muted tabular-nums">
                {format(h.moments.seed, { seed: moment.seed })}
              </p>
            </>
          ) : (
            <div
              aria-hidden="true"
              className="aspect-[116/80] w-full rounded-control bg-surface-soft"
            />
          )}
        </section>
        {moment !== 'invalid' && (
          <section
            aria-labelledby="moment-cta"
            className="relative flex flex-wrap items-center justify-between gap-5 overflow-hidden rounded-sheet bg-field-stripes px-panel py-7 text-hero-ink sm:px-9 sm:py-8"
          >
            <div className="min-w-0 flex-[1_1_22.5rem]">
              <h2
                id="moment-cta"
                className="font-display text-[2.5rem] leading-[0.92] font-normal sm:text-[3.25rem]"
              >
                {t.menu.headline}
              </h2>
              <p className="mt-2 max-w-[28.75rem] text-hero-muted">{h.moments.ctaBody}</p>
            </div>
            <ButtonLink to="/career/new" variant="play" size="lg" iconEnd="arrow">
              {h.moments.start}
            </ButtonLink>
          </section>
        )}
      </div>
    </Page>
  );
}
