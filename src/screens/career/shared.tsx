import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../../store';
import { Page } from '../../ui/Page';
import { Icon } from '../../ui/Icon';
import { Artwork } from '../../ui/Artwork';
import { renderAvatar } from '../../engine/assets/avatar';
import { renderCrest } from '../../engine/assets/crest';
import { levelProgress } from '../../engine/career/progression';
import { errorCode } from '../../persistence/errors';
import { mayHaveSaves, persistence } from '../../persistence/lazy';
import type { SlotListing } from '../../persistence/localRepository';
import type { Career, Club, Crest, Player, SlotId, World } from '../../model/domain';
import { cancelWorldJob } from '../../workers/client';
import { errorText, format, t } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { marketText as m } from '../../i18n/market';
import { socialText } from '../../i18n/social';
import { lifestyleText } from '../../i18n/lifestyle';
import { honoursText } from '../../i18n/honours';

/** Shared Tailwind class strings, so every career card reads as one family. */
export const ui = {
  panel: 'rounded-panel border border-line bg-surface p-5 shadow-surface sm:p-6',
  heading: 'font-display text-[1.75rem] leading-none tracking-[0.02em] text-ink',
  eyebrow: 'text-[0.68rem] font-bold uppercase tracking-[0.14em] text-accent',
  muted: 'text-sm text-muted',
  chip: 'inline-flex min-h-7 items-center gap-1 rounded-full bg-accent-soft px-3 text-xs font-bold text-accent',
  focus: 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent',
} as const;

/**
 * The loaded world, restoring a saved slot from the `save` URL parameter after a refresh,
 * exactly like the world and match screens.
 */
export function useRestoredWorld(): { loading: boolean; error: string } {
  const world = useAppStore((s) => s.world);
  const job = useAppStore((s) => s.worldJob);
  const active = useAppStore((s) => s.activeSave);
  const [params, setParams] = useSearchParams();
  const attempted = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const slot = params.get('save');
    if (world && active?.payload.kind === 'world' && slot !== String(active.slot)) {
      const next = new URLSearchParams(params);
      next.set('save', String(active.slot));
      setParams(next, { replace: true });
    } else if (world && slot && active?.payload.kind !== 'world') {
      const next = new URLSearchParams(params);
      next.delete('save');
      setParams(next, { replace: true });
    } else if (
      !world &&
      !job &&
      slot &&
      ['1', '2', '3'].includes(slot) &&
      attempted.current !== slot
    ) {
      attempted.current = slot;
      setLoading(true);
      void persistence()
        .then((p) => p.loadSlot(Number(slot) as SlotId))
        .catch((cause: unknown) => setError(errorText(errorCode(cause))))
        .finally(() => setLoading(false));
    }
  }, [world, active, job, params, setParams]);
  return { loading: loading || Boolean(!world && params.get('save') && !error && !job), error };
}

/** Why career edits are blocked right now, if they are. */
export function useEditBlock(): string | null {
  const job = useAppStore((s) => s.worldJob);
  const session = useAppStore((s) => s.matchSession);
  // Saving a changed world clears the match session, so edits wait until it is recorded.
  if (job) return c.common.blockedJob;
  if (session) return c.common.blockedMatch;
  return null;
}

export interface CareerContext {
  world: World;
  career: Career;
  player: Player;
  club: Club | undefined;
  age: number;
}

type Section = { to: string; label: string; end: boolean };
const groups: { label: string; sections: Section[] }[] = [
  {
    label: honoursText.groups.career,
    sections: [
      { to: '/career', label: c.sectionNames.hub, end: true },
      { to: '/career/inbox', label: m.sectionNames.inbox, end: false },
      { to: '/career/profile', label: c.sectionNames.profile, end: false },
      { to: '/career/skills', label: c.sectionNames.skills, end: false },
      { to: '/career/training', label: c.sectionNames.training, end: false },
    ],
  },
  {
    label: honoursText.groups.club,
    sections: [
      { to: '/career/club', label: socialText.sectionNames.club, end: false },
      { to: '/career/transfers', label: m.sectionNames.transfers, end: false },
      { to: '/career/agent', label: m.sectionNames.agent, end: false },
      { to: '/career/rival', label: socialText.sectionNames.rival, end: false },
    ],
  },
  {
    label: honoursText.groups.life,
    sections: [
      { to: '/career/media', label: socialText.sectionNames.media, end: false },
      { to: '/career/lifestyle', label: lifestyleText.sectionNames.lifestyle, end: false },
      { to: '/career/wardrobe', label: lifestyleText.sectionNames.wardrobe, end: false },
    ],
  },
  {
    label: honoursText.groups.honours,
    sections: [
      { to: '/career/national', label: honoursText.sectionNames.national, end: false },
      { to: '/career/trophies', label: honoursText.sectionNames.trophies, end: false },
      { to: '/career/chronicle', label: honoursText.sectionNames.chronicle, end: false },
      { to: '/career/moments', label: honoursText.sectionNames.moments, end: false },
      { to: '/career/legacy', label: honoursText.sectionNames.legacy, end: false },
    ],
  },
];
/**
 * Career sections in four labelled groups. Groups wrap on wide screens and scroll as one row
 * on narrow ones; arrow keys move across every link.
 */
export function CareerNav() {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navigation.current;
    if (!nav) return;
    const revealActive = () => {
      const active = nav.querySelector<HTMLAnchorElement>('[aria-current="page"]');
      if (!active || nav.scrollWidth <= nav.clientWidth) return;
      const bounds = nav.getBoundingClientRect();
      const link = active.getBoundingClientRect();
      if (link.left < bounds.left) nav.scrollLeft += link.left - bounds.left;
      else if (link.right > bounds.right) nav.scrollLeft += link.right - bounds.right;
    };
    revealActive();
    const resize = new ResizeObserver(revealActive);
    resize.observe(nav);
    return () => resize.disconnect();
  }, [pathname]);
  const save = params.get('save');
  const unread = useAppStore((s) => s.world?.inbox.filter((message) => !message.read).length ?? 0);
  return (
    <nav
      ref={navigation}
      aria-label={c.sections}
      data-tour="career-nav"
      className="mb-6 overflow-x-auto lg:overflow-visible"
    >
      <ul className="flex min-w-max gap-2 rounded-control border border-line bg-surface p-1.5 shadow-surface lg:min-w-0 lg:flex-wrap">
        {groups.map((group) => (
          <li key={group.label} className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className="px-2 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted"
            >
              {group.label}
            </span>
            <ul aria-label={group.label} className="flex gap-1">
              {group.sections.map((section) => (
                <li key={section.to}>
                  <NavLink
                    to={save ? `${section.to}?save=${save}` : section.to}
                    end={section.end}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                      event.preventDefault();
                      const links = Array.from(
                        event.currentTarget
                          .closest('nav')
                          ?.querySelectorAll<HTMLAnchorElement>('a') ?? [],
                      );
                      const index = links.indexOf(event.currentTarget);
                      const step = event.key === 'ArrowRight' ? 1 : links.length - 1;
                      links[(index + step) % links.length]?.focus();
                    }}
                    className={({ isActive }) =>
                      `relative flex min-h-11 items-center rounded-[0.6rem] px-4 text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-accent text-on-accent'
                          : 'text-muted hover:bg-surface-soft hover:text-ink'
                      }`
                    }
                  >
                    {section.label}
                    {section.to === '/career/inbox' && unread > 0 && (
                      <>
                        <span
                          aria-hidden="true"
                          className="ml-2 grid min-w-6 place-items-center rounded-full bg-gold px-1.5 text-xs font-bold text-on-gold"
                        >
                          {unread}
                        </span>
                        <span className="sr-only">
                          {' '}
                          · {format(m.inbox.unread, { count: unread })}
                        </span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Page frame for every career screen: heading, section links and the career gate. */
export function CareerPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: (context: CareerContext) => ReactNode;
}) {
  const world = useAppStore((s) => s.world);
  const { loading, error } = useRestoredWorld();
  const player = world?.career ? world.players[world.career.playerId] : undefined;
  return (
    <Page>
      <header className="page-heading">
        <p className={ui.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </header>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className={ui.muted}>
          {c.common.loading}
        </p>
      ) : !world ? (
        <CareerEmpty />
      ) : !world.career || !player ? (
        <NoCareerInWorld />
      ) : (
        <>
          <CareerNav />
          <UnsavedCareer />
          {children({
            world,
            career: world.career,
            player,
            club: player.clubId ? world.clubs[player.clubId] : undefined,
            age: world.date.season - player.birthSeason,
          })}
        </>
      )}
    </Page>
  );
}

function UnsavedCareer() {
  const active = useAppStore((s) => s.activeSave);
  if (active) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-4 rounded-panel border border-line bg-art-gold p-4 sm:p-5">
      <Icon name="save" className="shrink-0 text-accent" />
      <div className="min-w-0 flex-1 basis-60">
        <strong className="block text-sm">{c.common.saveCareer}</strong>
        <p className="text-sm text-muted">{c.common.saveCareerBody}</p>
      </div>
      <Link className="button" to="/saves">
        {c.common.openSaves}
      </Link>
    </div>
  );
}

/** Real empty state: start a career or continue one from a save slot. */
export function CareerEmpty() {
  const [slots, setSlots] = useState<SlotListing[] | null>(null);
  const [busy, setBusy] = useState<SlotId | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    let current = true;
    void mayHaveSaves()
      .then((saves) => (saves ? persistence().then((p) => p.saves.list()) : []))
      .then((list) => current && setSlots(list))
      .catch(() => current && setSlots([]));
    return () => {
      current = false;
    };
  }, []);
  const careers = (slots ?? []).flatMap((slot) =>
    slot.status === 'ready' && slot.world?.career
      ? [{ slot: slot.slot, ...slot.world.career }]
      : [],
  );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section className={`${ui.panel} flex flex-col gap-4 bg-art-green`}>
        <p className={ui.eyebrow}>{c.hub.eyebrow}</p>
        <h2 className="font-display text-[2.6rem] leading-[0.95]">{c.empty.title}</h2>
        <p className="max-w-prose text-muted">{c.empty.body}</p>
        <div>
          <Link className="button" to="/career/new">
            {c.empty.start}
            <Icon name="arrow" />
          </Link>
        </div>
      </section>
      <section className={ui.panel} aria-labelledby="saved-careers">
        <h2 id="saved-careers" className={ui.heading}>
          {c.empty.loadTitle}
        </h2>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        {!slots ? (
          <p role="status" className={`${ui.muted} mt-4`}>
            {t.saves.loading}
          </p>
        ) : careers.length ? (
          <ul className="mt-4 grid gap-3">
            {careers.map((entry) => (
              <li key={entry.slot}>
                <button
                  className="flex min-h-14 w-full items-center gap-3 rounded-control border border-line bg-surface-soft p-3 text-left transition hover:border-accent disabled:opacity-60"
                  disabled={busy !== null}
                  onClick={() => {
                    setBusy(entry.slot);
                    setError('');
                    void persistence()
                      .then((p) => p.loadSlot(entry.slot))
                      .then(() => navigate(`/career?save=${entry.slot}`, { replace: true }))
                      .catch((cause: unknown) => setError(errorText(errorCode(cause))))
                      .finally(() => setBusy(null));
                  }}
                >
                  <CrestImage crest={entry.crest} alt="" className="h-11 w-11 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate">
                      {format(c.empty.load, { name: entry.name })}
                    </strong>
                    <span className="block text-xs text-muted">
                      {format(c.empty.loadMeta, {
                        slot: entry.slot,
                        level: entry.level,
                        club: entry.clubName,
                      })}
                    </span>
                  </span>
                  <Icon name="arrow" className="shrink-0 text-accent" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`${ui.muted} mt-4`}>{t.saves.emptyBody}</p>
        )}
      </section>
    </div>
  );
}

function NoCareerInWorld() {
  const legacy = useAppStore((s) => s.world?.legacies.at(-1));
  if (legacy)
    return (
      <section className={`${ui.panel} flex flex-col gap-4 bg-art-green`}>
        <p className={ui.eyebrow}>{honoursText.legacy.yourLegacy}</p>
        <h2 className="font-display text-[2.2rem] leading-none">{legacy.name}</h2>
        <p className="max-w-prose text-muted">
          {format(honoursText.legacy.retired, { age: legacy.age, season: legacy.retiredAt.season })}{' '}
          ·{' '}
          {format(honoursText.legacy.hallLine, {
            rank: legacy.hallOfFame.rank,
            of: legacy.hallOfFame.of,
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link className="button" to="/career/legacy">
            {honoursText.titles.legacy}
            <Icon name="arrow" />
          </Link>
          {!legacy.childPlayerId && (
            <Link
              className="button secondary"
              to={`/career/new?parent=${encodeURIComponent(legacy.id)}`}
            >
              {format(honoursText.legacy.child, { name: legacy.name })}
            </Link>
          )}
          <Link className="button secondary" to="/career/new">
            {honoursText.legacy.newCareer}
          </Link>
        </div>
      </section>
    );
  return (
    <section className={`${ui.panel} flex flex-col gap-4 bg-art-green`}>
      <h2 className="font-display text-[2.2rem] leading-none">{c.empty.noWorldCareer}</h2>
      <p className="max-w-prose text-muted">{c.empty.noWorldCareerBody}</p>
      <div>
        <Link className="button" to="/career/new">
          {c.empty.start}
          <Icon name="arrow" />
        </Link>
      </div>
    </section>
  );
}

export function PlayerPortrait({
  player,
  age,
  className = '',
}: {
  player: Player;
  age: number;
  className?: string;
}) {
  const svg = useMemo(() => renderAvatar(player.avatar, age), [player.avatar, age]);
  return (
    <Artwork
      svg={svg}
      alt={format(c.wizard.previewAlt, { age })}
      className={`rounded-full bg-art-blue ${className}`}
    />
  );
}
export function CrestImage({
  crest,
  alt,
  className = '',
}: {
  crest: Crest;
  alt: string;
  className?: string;
}) {
  const svg = useMemo(() => renderCrest(crest), [crest]);
  return <Artwork svg={svg} alt={alt} className={className} />;
}

export function Meter({
  label,
  value,
  tone = 'accent',
}: {
  label: string;
  value: number;
  tone?: 'accent' | 'danger' | 'gold';
}) {
  const bounded = Math.max(0, Math.min(100, Math.round(value)));
  const fill = tone === 'danger' ? 'bg-danger' : tone === 'gold' ? 'bg-gold' : 'bg-accent';
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="font-display text-xl leading-none">{bounded}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={bounded}
        aria-valuetext={format(c.common.meterValue, { value: bounded })}
        className="h-2.5 overflow-hidden rounded-full bg-surface-soft"
      >
        <span className={`block h-full rounded-full ${fill}`} style={{ width: `${bounded}%` }} />
      </div>
    </div>
  );
}

export function XpBar({ career }: { career: Career }) {
  const { into, needed } = levelProgress(career);
  const percent = needed ? Math.min(100, (into / needed) * 100) : 100;
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-display text-2xl leading-none text-accent">
          {format(c.common.level, { level: career.level })}
        </span>
        <span className="text-muted">
          {needed ? format(c.common.xp, { into, needed }) : c.common.xpMax}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={format(c.common.xpLabel, { level: career.level + 1 })}
        aria-valuemin={0}
        aria-valuemax={Math.max(1, needed)}
        aria-valuenow={needed ? into : 1}
        className="h-3 overflow-hidden rounded-full bg-surface-soft"
      >
        <span
          className="block h-full rounded-full bg-gradient-to-r from-accent to-gold"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** Live progress of a world job with its cancel control. */
export function JobProgress() {
  const job = useAppStore((s) => s.worldJob);
  if (!job || job.type === 'commit-match') return null;
  return (
    <section
      aria-label={c.hub.simulating}
      className="flex flex-wrap items-center gap-4 rounded-control border border-line bg-surface-soft p-4"
    >
      <div className="min-w-0 flex-1 basis-48">
        <strong className="block text-sm" role="status">
          {job.cancelling
            ? c.hub.cancelling
            : job.type === 'generate'
              ? c.wizard.building
              : job.type === 'create-career'
                ? c.wizard.signing
                : c.hub.simulating}
        </strong>
        {job.totalWeeks > 1 && (
          <span className="text-xs text-muted">
            {format(c.hub.progress, { completed: job.completedWeeks, total: job.totalWeeks })}
          </span>
        )}
        <progress
          className="mt-2 block h-2 w-full accent-[var(--accent)]"
          max={Math.max(1, job.totalWeeks)}
          value={job.completedWeeks}
          aria-label={c.hub.simulating}
        />
      </div>
      {job.type !== 'create-career' && (
        <button className="button secondary" disabled={job.cancelling} onClick={cancelWorldJob}>
          {c.hub.cancel}
        </button>
      )}
    </section>
  );
}

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : format(many, { count });
}
