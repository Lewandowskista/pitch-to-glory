import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Moment, World } from '../../model/domain';
import { decodeClip, momentLink } from '../../engine/career/honours';
import { platform } from '../../platform';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { honoursText as h } from '../../i18n/honours';
import { CareerPage, ui } from './shared';
import { MomentPitch } from './MomentPitch';

export default function CareerMoments() {
  return (
    <CareerPage eyebrow={h.eyebrow} title={h.titles.moments}>
      {({ world, career }) => <MomentsContent world={world} playerId={career.playerId} />}
    </CareerPage>
  );
}

export function MomentCard({ moment, highlight }: { moment: Moment; highlight?: boolean }) {
  const clip = useMemo(() => decodeClip(moment.clip), [moment.clip]);
  const [status, setStatus] = useState('');
  const path = `/moment#${momentLink(moment)}`;
  return (
    <li
      id={`moment-${moment.id}`}
      className={`flex flex-col gap-3 rounded-control border p-4 ${highlight ? 'border-accent bg-accent-soft' : 'border-line bg-surface-soft'}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="font-display text-2xl leading-none">
          {h.moments.kinds[moment.kind]}
        </strong>
        <span className="text-xs text-muted">
          {format(c.common.seasonWeek, { season: moment.date.season, week: moment.date.week })}
        </span>
      </div>
      <p className="text-sm">
        {moment.home.name} {moment.score[0]}–{moment.score[1]} {moment.away.name} ·{' '}
        {format(h.moments.minute, { minute: moment.minute })}
      </p>
      <MomentPitch
        clip={clip}
        home={moment.home.color}
        away={moment.away.color}
        label={format(h.moments.pitch, { scorer: moment.scorerName, minute: moment.minute })}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="button secondary"
          onClick={async () => {
            const result = await platform.shareLink(
              `${window.location.origin}${path}`,
              h.moments.kinds[moment.kind],
            );
            setStatus(
              result === 'shared'
                ? h.moments.shared
                : result === 'copied'
                  ? h.moments.copied
                  : h.moments.shareFailed,
            );
          }}
        >
          {h.moments.share}
        </button>
        <Link className="text-button" to={path}>
          {h.moments.open}
        </Link>
        <span role="status" className="text-xs font-semibold text-accent">
          {status}
        </span>
      </div>
    </li>
  );
}

function MomentsContent({ world, playerId }: { world: World; playerId: string }) {
  const [params] = useSearchParams();
  const focus = params.get('moment');
  const moments = world.moments.filter((moment) => moment.playerId === playerId).reverse();
  return (
    <section aria-labelledby="moments-heading" className={ui.panel}>
      <h2 id="moments-heading" className={ui.heading}>
        {h.moments.title}
      </h2>
      <p className={`${ui.muted} mt-1 max-w-prose`}>{h.moments.body}</p>
      {moments.length ? (
        <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
          {moments.map((moment) => (
            <MomentCard key={moment.id} moment={moment} highlight={moment.id === focus} />
          ))}
        </ul>
      ) : (
        <p className={`${ui.muted} mt-4`}>{h.moments.empty}</p>
      )}
    </section>
  );
}
