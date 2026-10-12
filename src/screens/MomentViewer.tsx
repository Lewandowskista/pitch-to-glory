import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { parseMomentLink, type Clip, type MomentLink } from '../engine/career/honours/clip';
import { Page } from '../ui/Page';
import { format } from '../i18n';
import { honoursText as h } from '../i18n/honours';
import { MomentPitch } from './career/MomentPitch';
import { FootballIllustration } from '../ui/FootballIllustration';

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
      <header className="page-heading">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">{h.eyebrow}</p>
        <h1>{h.titles.moment}</h1>
        <p>{h.moments.viewerBody}</p>
      </header>
      <section className="ui-card max-w-4xl rounded-panel border border-line bg-surface p-panel shadow-surface sm:p-panel-lg">
        {moment === 'invalid' ? (
          <p role="alert" className="inline-error">
            {h.moments.invalid}
          </p>
        ) : moment ? (
          <div className="grid gap-4">
            <h2 className="font-display text-[2rem] leading-none">
              {h.moments.kinds[moment.kind]} · {moment.scorer}
            </h2>
            <p className="text-sm">
              {moment.home[0]} {moment.score[0]}–{moment.score[1]} {moment.away[0]} ·{' '}
              {format(h.moments.minute, { minute: moment.minute })}
            </p>
            <MomentPitch
              clip={moment.decoded}
              home={moment.home[1]}
              away={moment.away[1]}
              label={format(h.moments.pitch, { scorer: moment.scorer, minute: moment.minute })}
            />
            <p className="text-xs text-muted">{format(h.moments.seed, { seed: moment.seed })}</p>
          </div>
        ) : (
          <FootballIllustration kind="match" />
        )}
        <Link className="button mt-5" to="/career/new">
          {h.moments.start}
        </Link>
      </section>
    </Page>
  );
}
