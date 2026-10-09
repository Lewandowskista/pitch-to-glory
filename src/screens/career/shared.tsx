import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { careerGroupOf } from './navigation';
import { navigationText as n } from '../../i18n/navigation';
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
import { honoursText } from '../../i18n/honours';

/** Shared Tailwind class strings, so every career card reads as one family. */
export const ui = {
  panel: 'rounded-panel border border-line bg-surface p-panel shadow-surface sm:p-panel-lg',
  /** A dense or supporting card: summaries, quiet tiles, notices beside main content. */
  panelCompact:
    'rounded-panel border border-line bg-surface p-panel-compact shadow-surface sm:p-panel',
  heading: 'font-display text-[1.75rem] leading-none tracking-[0.02em] text-ink',
  eyebrow: 'text-xs font-bold uppercase tracking-[0.12em] text-accent',
  muted: 'text-sm text-muted',
  chip: 'inline-flex min-h-7 items-center gap-1 rounded-full bg-accent-soft px-3 text-xs font-bold text-accent',
  focus: 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent',
  /** Helper text under a heading or label. */
  helper: 'mt-helper text-sm text-muted',
  /** A row of actions after content: clear of the prose above, evenly spaced, wrapping. */
  actions: 'mt-action flex flex-wrap items-center gap-action',
  /** A row of filter buttons: wraps on wider screens, scrolls sideways on phones. */
  filters: 'flex gap-1.5 max-sm:-mx-1 max-sm:overflow-x-auto max-sm:px-1 max-sm:pb-1 sm:flex-wrap',
  /** An empty section inside a page: one quiet line instead of a full card. */
  empty: 'rounded-control border border-dashed border-line px-4 py-3 text-sm text-muted',
} as const;

/**
 * A section with nothing in it yet: its title and the reason in one compact, dashed card,
 * instead of a full panel waiting to be filled. It keeps its heading, so it stays a named
 * region that grows into the full section once there is content.
 */
export function EmptySection({
  id,
  title,
  children,
  className = '',
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={`rounded-panel border border-dashed border-line px-panel-compact py-3.5 sm:px-panel ${className}`}
    >
      <h2 id={id} className="text-base font-bold">
        {title}
      </h2>
      <div className="mt-0.5 text-sm text-muted">{children}</div>
    </section>
  );
}

/** One filter in a `ui.filters` row; the chosen one is filled. */
export const filterButton = (pressed: boolean) =>
  `min-h-11 shrink-0 rounded-control border px-3 text-sm font-semibold whitespace-nowrap transition-colors ${ui.focus} ${
    pressed
      ? 'border-accent bg-accent text-on-accent'
      : 'border-line bg-surface text-muted hover:bg-surface-soft hover:text-ink'
  }`;

/**
 * The loaded world, restoring a saved slot from the `save` URL parameter after a refresh,
 * exactly like the world and match screens.
 */
export function useRestoredWorld(): { loading: boolean; error: string; retry: () => void } {
  const world = useAppStore((s) => s.world);
  const job = useAppStore((s) => s.worldJob);
  const active = useAppStore((s) => s.activeSave);
  const [params, setParams] = useSearchParams();
  const attempted = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    attempted.current = null;
    setError('');
    setAttempt((count) => count + 1);
  };
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
  }, [world, active, job, params, setParams, attempt]);
  return {
    loading: loading || Boolean(!world && params.get('save') && !error && !job),
    error,
    retry,
  };
}

/** `path` carrying the loaded save slot, so refreshing the target restores the same world. */
export function useSaveLink(): (path: string) => string {
  const slot = useAppStore((s) => (s.activeSave?.payload.kind === 'world' ? s.activeSave.slot : 0));
  return (path) => {
    if (!slot) return path;
    const [base, query] = path.split('?');
    const params = new URLSearchParams(query);
    params.set('save', String(slot));
    return `${base}?${params.toString()}`;
  };
}

/** Why career edits are blocked right now, if they are. */
export function useEditBlock(): string | null {
  const job = useAppStore((s) => s.worldJob);
  const saving = useAppStore((s) => s.trainingSaving);
  const session = useAppStore((s) => s.matchSession);
  // Saving a changed world clears the match session, so edits wait until it is recorded.
  if (job || saving) return c.common.blockedJob;
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

/**
 * The pages of the current career group as one row of tabs, first on every career page so it
 * never moves between them. The sidebar (desktop) and bottom bar (phones) switch groups.
 * Arrow keys move along the tabs.
 */
export function CareerNav() {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const group = careerGroupOf(pathname);
  const unread = useAppStore((s) => s.world?.inbox.filter((message) => !message.read).length ?? 0);
  if (!group) return null;
  const save = params.get('save');
  return (
    <nav
      aria-label={format(n.tabs, { group: group.label })}
      className="career-tabs"
      style={{ '--tabs': group.pages.length } as CSSProperties}
    >
      <ul>
        {group.pages.map((page) => (
          <li key={page.path}>
            <NavLink
              to={save ? `${page.path}?save=${save}` : page.path}
              end
              onKeyDown={(event) => {
                if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                event.preventDefault();
                const links = Array.from(
                  event.currentTarget.closest('ul')?.querySelectorAll<HTMLAnchorElement>('a') ?? [],
                );
                const index = links.indexOf(event.currentTarget);
                const step = event.key === 'ArrowRight' ? 1 : links.length - 1;
                links[(index + step) % links.length]?.focus();
              }}
            >
              <span>{page.label}</span>
              {page.path === '/career/inbox' && unread > 0 && (
                <>
                  <span aria-hidden="true" className="nav-badge">
                    {unread > 99 ? '99+' : unread}
                  </span>
                  <span className="sr-only"> · {format(m.inbox.unread, { count: unread })}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Page frame for every career screen: the group's page tabs, the screen's name and the career
 * gate. The tabs and the top bar say where the player is, so there is no eyebrow.
 */
export function CareerPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: (context: CareerContext) => ReactNode;
}) {
  const world = useAppStore((s) => s.world);
  const { loading, error } = useRestoredWorld();
  const player = world?.career ? world.players[world.career.playerId] : undefined;
  return (
    <Page className="career-page">
      {/* Shown while a save loads too: the tabs depend only on the route, and appearing late
          would push the whole page down. */}
      {(loading || (world?.career && player)) && <CareerNav />}
      <div className="page-body">
        <header className="page-heading">
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
      </div>
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
                      .then((loaded) => {
                        if (loaded) navigate(`/career?save=${entry.slot}`, { replace: true });
                      })
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
  const link = useSaveLink();
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
          <Link className="button" to={link('/career/legacy')}>
            {honoursText.titles.legacy}
            <Icon name="arrow" />
          </Link>
          {!legacy.childPlayerId && (
            <Link
              className="button secondary"
              to={link(`/career/new?parent=${encodeURIComponent(legacy.id)}`)}
            >
              {format(honoursText.legacy.child, { name: legacy.name })}
            </Link>
          )}
          <Link className="button secondary" to={link('/career/new')}>
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
        <Link className="button" to={link('/career/new')}>
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
  ariaLabel,
  value,
  tone = 'accent',
}: {
  /** Shown above the bar: keep it short when the card already names the subject. */
  label: string;
  /** The full name for screen readers, when the visible label relies on the card title. */
  ariaLabel?: string;
  value: number;
  tone?: 'accent' | 'danger' | 'gold';
}) {
  const bounded = Math.max(0, Math.min(100, Math.round(value)));
  const fill = tone === 'danger' ? 'bg-danger' : tone === 'gold' ? 'bg-meter-gold' : 'bg-accent';
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="font-display text-xl leading-none tabular-nums">{bounded}</span>
      </div>
      <div
        role="meter"
        aria-label={ariaLabel ?? label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={bounded}
        aria-valuetext={format(c.common.meterValue, { value: bounded })}
        className="h-2.5 overflow-hidden rounded-full bg-line"
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
