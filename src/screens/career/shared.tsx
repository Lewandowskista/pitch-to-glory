import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { careerGroupOf } from './navigation';
import { navigationText as n } from '../../i18n/navigation';
import { useAppStore } from '../../store';
import { Page } from '../../ui/Page';
import { Icon } from '../../ui/Icon';
import { Artwork } from '../../ui/Artwork';
import { clubDress, renderAvatar } from '../../engine/assets/avatar';
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
import { cardTitleClass, PageHeader, panelClass } from '../../ui/kit/Panel';
import { chipClass, CountBadge } from '../../ui/kit/Chip';
import { Meter as KitMeter, XpBar as KitXpBar, type MeterTone } from '../../ui/kit/Meter';
import { Button, ButtonLink, Spinner } from '../../ui/kit/Button';
import { StatusLine } from '../../ui/kit/StatusLine';

/**
 * Shared Tailwind class strings, so every career card reads as one family. They are the UI
 * kit's classes (src/ui/kit, docs/UI-KIT.md); new code can use the kit components directly.
 */
export const ui = {
  panel: panelClass('default', 'normal'),
  /** A dense or supporting card: summaries, quiet tiles, notices beside main content. */
  panelCompact: panelClass('default', 'compact'),
  heading: cardTitleClass('md'),
  eyebrow: 'text-xs font-bold uppercase tracking-[0.12em] text-accent',
  muted: 'text-sm text-muted',
  chip: chipClass('accent'),
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
      className={`ui-empty rounded-panel border border-dashed border-line px-panel-compact py-3.5 sm:px-panel ${className}`}
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
                  <CountBadge count={unread} />
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
        <PageHeader title={title} description={description} />
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        {loading ? (
          <CareerLoading />
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
    <div className="mb-6 flex flex-wrap items-center gap-4 rounded-panel border border-line bg-art-gold px-panel-compact py-4 sm:px-[1.375rem] sm:py-[1.125rem]">
      <span
        aria-hidden="true"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-gold text-on-gold"
      >
        <Icon name="save" className="h-[1.375rem] w-[1.375rem]" />
      </span>
      <div className="min-w-0 flex-[1_1_20rem]">
        <strong className="block text-[0.9375rem]">{c.common.saveCareer}</strong>
        <p className="mt-0.5 text-sm text-gold-ink">{c.common.saveCareerBody}</p>
      </div>
      <ButtonLink to="/saves">{c.common.openSaves}</ButtonLink>
    </div>
  );
}

/**
 * While a saved career opens after a refresh: the page frame stays (its tabs depend only on
 * the address), with a quiet outline of the hub where the career will appear.
 */
export function CareerLoading() {
  return (
    <div className="flex flex-col gap-[1.125rem]">
      <p role="status" className="flex items-center gap-2.5 font-semibold text-muted">
        <Spinner className="h-5 w-5 text-accent" />
        {c.common.loading}
      </p>
      <div aria-hidden="true" className="flex flex-wrap gap-4">
        <div className="h-44 flex-[2_1_22.5rem] rounded-panel bg-[repeating-linear-gradient(90deg,var(--accent-soft)_0_72px,var(--surface-soft)_72px_144px)]" />
        <div className="h-44 flex-[1_1_13.75rem] rounded-panel border border-line bg-surface-soft" />
      </div>
    </div>
  );
}

/** The football pyramid on the empty career page: tiers 1–4 above the semi-pro start. */
function PyramidArt() {
  const tiers = [
    { x: 70, y: 30, width: 100, fill: 'fill-field' },
    { x: 50, y: 68, width: 140, fill: 'fill-field-stripe' },
    { x: 30, y: 106, width: 180, fill: 'fill-field-stripe opacity-80' },
    { x: 14, y: 144, width: 212, fill: 'fill-field-stripe opacity-60' },
  ];
  return (
    <svg
      viewBox="0 0 240 230"
      width="240"
      height="230"
      role="img"
      aria-label={c.empty.pyramidLabel}
      className="h-auto max-w-full shrink-0"
    >
      {tiers.map((tier, index) => (
        <g key={tier.y}>
          <rect x={tier.x} y={tier.y} width={tier.width} height="30" rx="8" className={tier.fill} />
          <text
            x="120"
            y={tier.y + 19}
            textAnchor="middle"
            className="fill-hero-ink font-sans text-[11px] font-extrabold uppercase"
          >
            {format(c.empty.pyramidTier, { tier: index + 1 })}
          </text>
        </g>
      ))}
      <rect
        x="1"
        y="182"
        width="238"
        height="30"
        rx="8"
        strokeWidth="2"
        className="fill-surface stroke-accent"
      />
      <text
        x="110"
        y="201"
        textAnchor="middle"
        className="fill-accent font-sans text-[11px] font-extrabold uppercase"
      >
        {c.empty.pyramidStart}
      </text>
      <path
        d="M218 190 C236 150 214 90 160 48"
        fill="none"
        strokeWidth="2.5"
        strokeDasharray="5 6"
        strokeLinecap="round"
        className="stroke-meter-gold"
      />
      <circle cx="219" cy="197" r="9" strokeWidth="2.5" className="fill-gold stroke-on-gold" />
      <path
        d="M146 6 H166 V14 Q166 24 156 24 Q146 24 146 14Z M152 24 V28 H160 V24"
        strokeWidth="2"
        strokeLinejoin="round"
        className="fill-gold stroke-meter-gold"
      />
    </svg>
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
    <div className="flex flex-wrap items-stretch gap-5">
      <section
        aria-labelledby="career-story"
        className="relative flex min-w-0 flex-[1.3_1_30rem] flex-wrap items-center gap-6 overflow-hidden rounded-panel border border-line bg-accent-soft p-panel sm:p-8"
      >
        <div className="flex min-w-0 flex-[1_1_16.25rem] flex-col items-start gap-3.5">
          <p className={ui.eyebrow}>{c.hub.eyebrow}</p>
          <h2
            id="career-story"
            className="font-display text-[2.75rem] leading-[0.92] font-normal sm:text-[3.25rem]"
          >
            {c.empty.title}
          </h2>
          <p className="max-w-[23.75rem] text-[0.9375rem] text-muted">{c.empty.body}</p>
          <ButtonLink to="/career/new" size="lg" iconEnd="arrow" className="mt-1.5">
            {c.empty.start}
          </ButtonLink>
        </div>
        <PyramidArt />
      </section>
      <section
        className={`${ui.panel} flex flex-[1_1_21.25rem] flex-col gap-3.5`}
        aria-labelledby="saved-careers"
      >
        <h2 id="saved-careers" className={cardTitleClass('md')}>
          {c.empty.loadTitle}
        </h2>
        {error && <StatusLine tone="error">{error}</StatusLine>}
        {!slots ? (
          <>
            <p role="status" className={ui.muted}>
              {t.saves.loading}
            </p>
            <div aria-hidden="true" className="h-16 rounded-control bg-track" />
            <div aria-hidden="true" className="h-16 rounded-control bg-surface-soft" />
          </>
        ) : careers.length ? (
          <ul className="flex flex-col gap-2.5">
            {careers.map((entry) => (
              <li key={entry.slot}>
                <button
                  type="button"
                  className="flex min-h-16 w-full items-center gap-3.5 rounded-control border border-line bg-surface-soft px-3.5 py-3 text-left transition-colors hover:border-accent aria-disabled:cursor-progress"
                  aria-busy={busy === entry.slot || undefined}
                  aria-disabled={busy !== null || undefined}
                  onClick={() => {
                    if (busy !== null) return;
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
                  <CrestImage crest={entry.crest} alt="" className="h-[3.1rem] w-11 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate font-extrabold">
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
                  {busy === entry.slot ? (
                    <Spinner className="h-5 w-5 text-accent" />
                  ) : (
                    <Icon name="arrow" className="shrink-0 text-accent" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-3 rounded-control border border-dashed border-line p-4 text-muted">
            <Icon name="save" className="h-6 w-6 shrink-0" />
            {t.saves.emptyBody}
          </p>
        )}
        <p className="mt-auto text-xs text-muted">{c.empty.savesNote}</p>
      </section>
    </div>
  );
}

function NoCareerInWorld() {
  const legacy = useAppStore((s) => s.world?.legacies.at(-1));
  const lastClub = useAppStore((s) => {
    const id = s.world?.legacies.at(-1)?.clubIds.at(-1);
    return id ? s.world!.clubs[id] : undefined;
  });
  const link = useSaveLink();
  const portrait = useMemo(
    () => (legacy ? renderAvatar(legacy.avatar, legacy.age, clubDress(lastClub), 'legacy') : null),
    [legacy, lastClub],
  );
  if (legacy)
    return (
      <section
        aria-labelledby="career-legacy-name"
        className="flex flex-wrap items-center gap-[1.375rem] rounded-panel border border-line bg-accent-soft p-panel sm:p-[1.625rem]"
      >
        {portrait && (
          <Artwork
            svg={portrait}
            alt={format(c.wizard.previewAlt, { age: legacy.age })}
            className="h-[8.25rem] w-[8.25rem] shrink-0 rounded-full"
          />
        )}
        <div className="flex min-w-0 flex-[1_1_17.5rem] flex-col gap-2.5">
          <p className={ui.eyebrow}>{honoursText.legacy.yourLegacy}</p>
          <h2
            id="career-legacy-name"
            className="font-display text-[2.75rem] leading-[0.95] font-normal break-words"
          >
            {legacy.name}
          </h2>
          <p className="text-muted">
            {format(honoursText.legacy.retired, {
              age: legacy.age,
              season: legacy.retiredAt.season,
            })}{' '}
            ·{' '}
            {format(honoursText.legacy.hallLine, {
              rank: legacy.hallOfFame.rank,
              of: legacy.hallOfFame.of,
            })}
          </p>
          <div className="mt-1 flex flex-wrap gap-2.5">
            <ButtonLink to={link('/career/legacy')} iconEnd="arrow">
              {honoursText.titles.legacy}
            </ButtonLink>
            {!legacy.childPlayerId && (
              <ButtonLink
                variant="secondary"
                to={link(`/career/new?parent=${encodeURIComponent(legacy.id)}`)}
              >
                {format(honoursText.legacy.child, { name: legacy.name })}
              </ButtonLink>
            )}
            <ButtonLink variant="secondary" to={link('/career/new')}>
              {honoursText.legacy.newCareer}
            </ButtonLink>
          </div>
        </div>
      </section>
    );
  return (
    <section
      aria-labelledby="career-no-career"
      className="flex max-w-3xl flex-col items-start gap-3 rounded-panel border border-line bg-accent-soft p-panel sm:p-[1.625rem]"
    >
      <h2 id="career-no-career" className="font-display text-[2.25rem] leading-[0.95] font-normal">
        {c.empty.noWorldCareer}
      </h2>
      <p className="max-w-prose text-muted">{c.empty.noWorldCareerBody}</p>
      <ButtonLink to={link('/career/new')} iconEnd="arrow">
        {c.empty.start}
      </ButtonLink>
    </section>
  );
}

/** A bust portrait in the club's home kit and crest, or the neutral shirt without a club. */
export function PlayerPortrait({
  player,
  age,
  club,
  className = '',
}: {
  player: Player;
  age: number;
  club?: Club | null;
  className?: string;
}) {
  const svg = useMemo(
    () => renderAvatar(player.avatar, age, clubDress(club)),
    [player.avatar, age, club],
  );
  return <Artwork svg={svg} alt={format(c.wizard.previewAlt, { age })} className={className} />;
}
export function CrestImage({
  crest,
  alt,
  className = '',
  founded,
}: {
  crest: Crest;
  alt: string;
  className?: string;
  /** Show the club's founding-year ribbon (large crests on club pages only). */
  founded?: number;
}) {
  const svg = useMemo(
    () => renderCrest(crest, founded === undefined ? {} : { founded }),
    [crest, founded],
  );
  return <Artwork svg={svg} alt={alt} className={className} />;
}

/** A 0–100 career meter (form, morale, fitness, fatigue): the kit's `Meter`. */
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
  tone?: MeterTone;
}) {
  return <KitMeter label={label} ariaLabel={ariaLabel ?? label} value={value} tone={tone} />;
}

/** The career's level and experience: the kit's `XpBar`, fed from `levelProgress`. */
export function XpBar({ career }: { career: Career }) {
  const { into, needed } = levelProgress(career);
  return <KitXpBar level={career.level} into={into} needed={needed} />;
}

/** Live progress of a world job with its cancel control. */
export function JobProgress() {
  const job = useAppStore((s) => s.worldJob);
  if (!job || job.type === 'commit-match') return null;
  const total = Math.max(1, job.totalWeeks);
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
        <div
          role="progressbar"
          aria-label={c.hub.simulating}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.min(total, job.completedWeeks)}
          className="mt-2 h-2 overflow-hidden rounded-full bg-line"
        >
          <span
            className="block h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${Math.min(100, (job.completedWeeks / total) * 100)}%` }}
          />
        </div>
      </div>
      {job.type !== 'create-career' && (
        <Button variant="secondary" disabled={job.cancelling} onClick={cancelWorldJob}>
          {c.hub.cancel}
        </Button>
      )}
    </section>
  );
}

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : format(many, { count });
}
