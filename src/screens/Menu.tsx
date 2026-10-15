import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { errorCode } from '../persistence/errors';
import { mayHaveSaves, persistence } from '../persistence/lazy';
import { summaryPortrait } from '../persistence/summary';
import type { Avatar, Crest, Hex, Kit, SlotId } from '../model/domain';
import { errorText, format, t } from '../i18n';
import { Page } from '../ui/Page';
import { Icon } from '../ui/Icon';
import { Artwork } from '../ui/Artwork';
import { kitArt } from '../ui/kitArt';
import { Button, ButtonLink, StatusLine, cx } from '../ui/kit';
import { APP_VERSION } from '../release/version';
import { generateGallery } from '../engine/assets/gallery';
import { renderCrest } from '../engine/assets/crest';
import { renderKit } from '../engine/assets/kit';
import { clubDress, renderAvatar } from '../engine/assets/avatar';
import { renderStadium } from '../engine/assets/stadium';
import stadium from '../assets/stadium.svg';

const sample = generateGallery('pitch-to-glory');

/** What the clubhouse shows about a career the player can return to. */
interface CareerStatus {
  name: string;
  level: number;
  club: string;
  crest: Crest | null;
  /** The career player's bust, when the save records it (older slot records do not). */
  portrait: { avatar: Avatar; age: number; kit?: Kit; crest?: Crest } | null;
  /** The club's colours, for the stadium. */
  colors: readonly [Hex, Hex, Hex] | null;
  /** Where the career stands, and so what happens next. */
  next: string;
}

/** The most recently saved career, offered as "Continue" from the clubhouse. */
function useSavedCareer(skip: boolean) {
  const [saved, setSaved] = useState<(CareerStatus & { slot: SlotId }) | null>(null);
  useEffect(() => {
    if (skip) return;
    let current = true;
    void mayHaveSaves()
      .then((saves) => (saves ? persistence().then((p) => p.saves.list()) : []))
      .then((list) => {
        const careers = list.flatMap((entry) => {
          if (entry.status !== 'ready' || !entry.world?.career) return [];
          const career = entry.world.career;
          return [
            {
              slot: entry.slot,
              name: career.name,
              level: career.level,
              club: career.clubName,
              crest: career.crest,
              portrait: summaryPortrait(entry.world),
              colors: career.kit?.colors ?? career.crest.colors,
              next: format(t.menu.statusWhere, {
                season: entry.world.season,
                week: entry.world.week,
              }),
              updatedAt: entry.updatedAt,
            },
          ];
        });
        careers.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        if (current) setSaved(careers[0] ?? null);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [skip]);
  return saved;
}

/** The career loaded in this tab, if any. */
function useLoadedCareer(): CareerStatus | null {
  const world = useAppStore((s) => s.world);
  const session = useAppStore((s) => s.matchSession);
  const player = world?.career ? world.players[world.career.playerId] : undefined;
  if (!world?.career || !player) return null;
  const club = player.clubId ? world.clubs[player.clubId] : undefined;
  return {
    name: player.name,
    level: world.career.level,
    club: club?.name ?? '',
    crest: club?.crest ?? null,
    portrait: {
      avatar: player.avatar,
      age: world.date.season - player.birthSeason,
      ...clubDress(club),
    },
    colors: club ? club.kits.home.colors : null,
    next: session
      ? t.menu.statusMatch
      : world.phase === 'complete'
        ? format(t.menu.statusComplete, { season: world.date.season })
        : format(t.menu.statusWhere, { season: world.date.season, week: world.date.week }),
  };
}

/** Draws art that may come from another version of the save format; null if it cannot. */
function safely(draw: () => string): string | null {
  try {
    return draw();
  } catch {
    return null;
  }
}

/** A returning player's career at a glance, with the way back in. */
function CareerStatusCard({ status, children }: { status: CareerStatus; children: ReactNode }) {
  const crest = useMemo(
    () => (status.crest ? safely(() => renderCrest(status.crest!)) : null),
    [status.crest],
  );
  const portrait = useMemo(() => {
    const p = status.portrait;
    return p
      ? safely(() => renderAvatar(p.avatar, p.age, { kit: p.kit, crest: p.crest }, 'menu'))
      : null;
  }, [status.portrait]);
  return (
    <section
      aria-labelledby="career-status-heading"
      className="flex max-w-[31.25rem] flex-col gap-3 rounded-panel border border-hero-ink/15 bg-black/25 p-4 sm:px-[1.375rem] sm:py-5"
    >
      <h2 id="career-status-heading" className="text-[0.8125rem] font-bold text-hero-muted">
        {t.menu.statusLabel}
      </h2>
      <div className="flex items-center gap-3.5">
        {crest && <Artwork svg={crest} alt="" className="h-[3.9rem] w-14 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-display text-[2.25rem] leading-[0.95] break-words sm:text-[2.5rem]">
            {status.name}
          </p>
          <p className="mt-0.5 text-sm text-hero-muted">
            {format(t.menu.statusMeta, { level: status.level, club: status.club })}
          </p>
        </div>
        {portrait && (
          <Artwork
            svg={portrait}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full max-sm:hidden"
          />
        )}
      </div>
      <p className="text-sm text-hero-muted">{status.next}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

/** The ways to look around without a career: gallery, world and a friendly match. */
function ExploreLinks({ onHero }: { onHero: boolean }) {
  const link = cx(
    'inline-flex min-h-11 items-center gap-2 rounded-control px-3 font-semibold underline underline-offset-4 transition-colors',
    onHero ? 'text-hero-ink hover:bg-white/10' : 'font-bold text-accent hover:bg-surface-soft',
  );
  return (
    <>
      <Link className={link} to="/gallery">
        {t.menu.explore}
        <Icon name="arrow" className="h-4 w-4" />
      </Link>
      <Link className={link} to="/world">
        {t.menu.world}
        <Icon name="ball" className="h-4 w-4" />
      </Link>
      <Link className={link} to="/match">
        {t.app.match}
        <Icon name="arrow" className="h-4 w-4" />
      </Link>
    </>
  );
}

/** The stadium hero art: in the career club's colours for a returning player. */
function StadiumArt({ colors, club }: { colors: CareerStatus['colors']; club: string }) {
  const svg = useMemo(() => (colors ? safely(() => renderStadium(colors)) : null), [colors]);
  return svg ? (
    <Artwork
      svg={svg}
      alt={format(t.menu.clubArtLabel, { club })}
      className="block h-auto w-full"
    />
  ) : (
    <img className="block h-auto w-full" src={stadium} alt={t.menu.artLabel} />
  );
}

const PILLAR_ICONS = [
  'M4 18 L10 12 L14 15 L20 7 M15 7 H20 V12',
  'M12 3 L14.6 9 L21 9.5 L16 13.6 L17.6 20 L12 16.6 L6.4 20 L8 13.6 L3 9.5 L9.4 9Z',
  'M8 4 H16 V9 Q16 14 12 14 Q8 14 8 9Z M8 6 H4 Q4 10 8 10 M16 6 H20 Q20 10 16 10 M12 14 V18 M8 20 H16',
];

const cardClass =
  'ui-card min-w-0 rounded-panel border border-line bg-surface shadow-surface text-ink';

/** The four pillars as cards, the first with an illustrated key moment (a new player). */
function Pillars() {
  const [first, ...rest] = t.menu.pillars;
  return (
    <section aria-labelledby="pillars-heading" className="mt-5 flex flex-col gap-4">
      <h2
        id="pillars-heading"
        className="font-display text-[2.25rem] leading-none text-ink sm:text-[2.5rem]"
      >
        {t.menu.pillarsTitle}
      </h2>
      <ol className="flex flex-wrap gap-4">
        <li className={cx(cardClass, 'flex flex-[1.7_1_23.75rem] flex-wrap gap-5 p-6')}>
          <div className="min-w-0 flex-[1_1_12.5rem]">
            <span
              aria-hidden="true"
              className="font-display text-[2.75rem] leading-none text-accent"
            >
              01
            </span>
            <h3 className="mt-1.5 text-[1.0625rem] font-extrabold">{first!.title}</h3>
            <p className="mt-1.5 text-muted">{first!.body}</p>
          </div>
          <div
            aria-hidden="true"
            className="flex min-w-0 flex-[1_1_13.75rem] flex-col gap-2 rounded-control bg-night p-3.5 text-night-ink"
          >
            <div className="flex justify-between text-[0.6875rem] font-extrabold tracking-[0.1em] text-gold uppercase">
              <span>{t.menu.sampleMoment}</span>
              <span className="text-night-muted">{t.menu.sampleMinute}</span>
            </div>
            {t.menu.sampleChoices.map((choice, index) => (
              <div
                key={choice.label}
                className="flex items-center gap-2.5 rounded-chip bg-night-raised px-2.5 py-[0.4375rem] text-[0.8125rem]"
              >
                <span className="grid h-[1.375rem] w-[1.375rem] place-items-center rounded-chip border border-night-line text-xs font-extrabold">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">{choice.label}</span>
                <span
                  className={cx(
                    'rounded-full px-2 py-px text-xs font-extrabold',
                    choice.odds >= 60 ? 'bg-mint text-night' : 'bg-night-line text-night-ink',
                  )}
                >
                  {choice.odds}%
                </span>
              </div>
            ))}
          </div>
        </li>
        {rest.map((pillar, index) => (
          <li
            key={pillar.title}
            className={cx(cardClass, 'flex flex-[1_1_13.75rem] flex-col gap-1.5 p-6')}
          >
            <div className="flex items-center justify-between">
              <span
                aria-hidden="true"
                className="font-display text-[2.75rem] leading-none text-accent"
              >
                {String(index + 2).padStart(2, '0')}
              </span>
              <span
                aria-hidden="true"
                className="grid h-10 w-10 place-items-center rounded-control bg-accent-soft text-accent"
              >
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path
                    d={PILLAR_ICONS[index]}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </div>
            <h3 className="text-[1.0625rem] font-extrabold">{pillar.title}</h3>
            <p className="text-muted">{pillar.body}</p>
          </li>
        ))}
      </ol>
      <p className="flex items-start gap-2.5 rounded-control bg-accent-soft px-4 py-3 font-semibold text-accent">
        <Icon name="check" className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0" />
        {t.menu.promise}
      </p>
    </section>
  );
}

/** The pillars as one compact list, for a returning player who knows the game. */
function PillarList() {
  return (
    <section
      aria-labelledby="pillars-heading"
      className={cx(cardClass, 'flex flex-[1.4_1_30rem] flex-col gap-3.5 p-panel sm:p-6')}
    >
      <h2 id="pillars-heading" className="font-display text-[2rem] leading-none">
        {t.menu.pillarsTitle}
      </h2>
      <ol className="grid grid-cols-[repeat(auto-fit,minmax(12.5rem,1fr))] gap-x-5 gap-y-1">
        {t.menu.pillars.map((pillar, index) => (
          <li key={pillar.title} className="flex gap-3 border-b border-line py-2.5">
            <span
              aria-hidden="true"
              className="w-[1.875rem] shrink-0 font-display text-[1.875rem] leading-none text-accent"
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="min-w-0">
              <span className="block font-extrabold">{pillar.title}</span>
              <span className="block text-[0.8125rem] text-muted">
                {t.menu.pillarsShort[index]}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p className="flex items-start gap-2 text-[0.8125rem] font-semibold text-accent">
        <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" />
        {t.menu.promise}
      </p>
    </section>
  );
}

const DISCOVERIES = [
  { view: 'crests', title: t.menu.crests, body: t.menu.crestsBody, tint: 'bg-art-green' },
  { view: 'kits', title: t.menu.kits, body: t.menu.kitsBody, tint: 'bg-art-gold' },
  { view: 'avatars', title: t.menu.players, body: t.menu.playersBody, tint: 'bg-art-blue' },
] as const;

/** Three pieces of art per discovery card: crests, a club's three kits, three ages of player. */
function discoveryArt(view: (typeof DISCOVERIES)[number]['view']): string[] {
  const club = sample.clubs[0]!;
  if (view === 'crests') return sample.clubs.slice(0, 3).map((entry) => renderCrest(entry.crest));
  if (view === 'kits')
    return Object.values(club.kits).map((kit) => renderKit(kit, kitArt(kit, club.crest)));
  return sample.players
    .slice(0, 3)
    .map((player, i) =>
      renderAvatar(player.avatar, [28, 17, 42][i]!, clubDress(sample.clubs[i]), `menu-${i}`),
    );
}

/** "Make your mark": the gallery's crests, kits and players, large for a new player. */
function Discoveries({ compact }: { compact: boolean }) {
  const art = useMemo(() => DISCOVERIES.map((item) => discoveryArt(item.view)), []);
  const heading = (
    <div>
      <h2
        id="mark-heading"
        className={cx(
          'font-display leading-none text-ink',
          compact ? 'text-[2rem]' : 'text-[2.25rem] sm:text-[2.5rem]',
        )}
      >
        {t.menu.intro}
      </h2>
      <p className={cx('mt-1 text-muted', compact ? 'text-[0.8125rem]' : 'sm:text-[0.9375rem]')}>
        {t.menu.introBody}
      </p>
    </div>
  );
  if (compact)
    return (
      <section
        aria-labelledby="mark-heading"
        className="flex min-w-0 flex-[1_1_21.25rem] flex-col gap-3"
      >
        {heading}
        {DISCOVERIES.map((item, index) => (
          <Link
            key={item.view}
            to={`/gallery?view=${item.view}`}
            className="clubhouse-discovery flex min-h-[5.5rem] items-center gap-3.5 overflow-hidden rounded-panel border border-line bg-surface text-ink transition-colors hover:border-accent"
          >
            <span
              aria-hidden="true"
              className={cx(
                'flex w-24 shrink-0 self-stretch justify-center',
                item.tint,
                item.view === 'avatars' ? 'items-end' : 'items-center',
              )}
            >
              <Artwork
                svg={art[index]![item.view === 'avatars' ? 2 : 1]!}
                alt=""
                className={item.view === 'avatars' ? 'h-20 w-20' : 'h-16 w-16 object-contain'}
              />
            </span>
            <span className="min-w-0 flex-1 py-3">
              <span className="block font-extrabold">{item.title}</span>
              <span className="block text-[0.8125rem] text-muted">{item.body}</span>
            </span>
            <Icon name="arrow" className="mr-4 h-[1.125rem] w-[1.125rem] shrink-0 text-accent" />
          </Link>
        ))}
      </section>
    );
  return (
    <section aria-labelledby="mark-heading" className="mt-6 flex flex-col gap-4">
      {heading}
      <div className="flex flex-wrap gap-4">
        {DISCOVERIES.map((item, index) => (
          <Link
            key={item.view}
            to={`/gallery?view=${item.view}`}
            className={cx(
              cardClass,
              'clubhouse-discovery flex flex-[1_1_17.5rem] flex-col overflow-hidden transition-colors hover:border-accent',
            )}
          >
            <span
              aria-hidden="true"
              className={cx(
                'clubhouse-discovery-art flex h-[11.25rem] justify-center gap-1',
                item.tint,
                item.view === 'avatars' ? 'items-end' : 'items-center',
              )}
            >
              {art[index]!.map((svg, i) => (
                <Artwork
                  key={i}
                  svg={svg}
                  alt=""
                  className={cx(
                    'object-contain',
                    i === 1 ? 'relative z-[1] w-[7.75rem]' : 'w-[6.25rem]',
                    item.view === 'crests' && (i === 1 ? 'h-32' : 'h-[6.25rem]'),
                  )}
                />
              ))}
            </span>
            <div className="flex flex-1 flex-col gap-1.5 px-[1.375rem] pt-5 pb-[1.375rem]">
              <h3 className="text-[1.0625rem] font-extrabold">{item.title}</h3>
              <p className="text-muted">{item.body}</p>
              <span className="mt-auto flex items-center justify-between pt-3 font-bold text-accent">
                {t.menu.view}
                <Icon name="arrow" className="h-[1.125rem] w-[1.125rem]" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Menu() {
  const loaded = useLoadedCareer();
  const saved = useSavedCareer(Boolean(loaded));
  const status = loaded ?? saved;
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = (
    <ButtonLink
      to="/career/new"
      variant={status ? 'secondary' : 'play'}
      size={status ? undefined : 'lg'}
      iconEnd="arrow"
    >
      {t.menu.startCareer}
    </ButtonLink>
  );
  return (
    <Page className="menu-page">
      <div className="flex max-w-[77.5rem] flex-col gap-5">
        <section
          aria-labelledby="menu-title"
          className={cx(
            'clubhouse-hero relative isolate flex flex-wrap items-center overflow-hidden rounded-sheet bg-field-stripes text-hero-ink',
            !status && 'min-[701px]:min-h-[30rem]',
          )}
        >
          {!status && (
            <svg
              viewBox="0 0 1100 480"
              preserveAspectRatio="xMidYMid slice"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <g fill="none" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="3">
                <circle cx="230" cy="240" r="120" />
                <path d="M-10 60 H140 V420 H-10" />
              </g>
            </svg>
          )}
          <div
            className={cx(
              'relative flex min-w-0 flex-col box-border',
              status
                ? 'flex-[1_1_28.75rem] gap-4 px-5 py-7 sm:py-10 sm:pr-5 sm:pl-11'
                : 'flex-[1_1_27.5rem] gap-[1.125rem] px-5 pt-8 pb-6 sm:pt-12 sm:pr-5 sm:pb-11 sm:pl-12',
            )}
          >
            <p className="text-xs font-extrabold tracking-[0.14em] text-gold uppercase">
              {t.menu.eyebrow}
            </p>
            <h1
              id="menu-title"
              className={cx(
                'max-w-[32.5rem] font-display leading-[0.9] font-normal',
                status
                  ? 'text-[2.75rem] sm:text-[4rem]'
                  : 'text-[3.5rem] sm:text-[clamp(4rem,6.4vw,5.75rem)]',
              )}
            >
              {t.menu.headline}
            </h1>
            {status ? (
              <CareerStatusCard status={status}>
                {loaded ? (
                  <ButtonLink to="/career" variant="play" size="lg" iconEnd="career">
                    {format(t.menu.continueCareer, { name: loaded.name })}
                  </ButtonLink>
                ) : saved ? (
                  <Button
                    variant="play"
                    size="lg"
                    iconEnd="career"
                    busy={busy}
                    onClick={() => {
                      setBusy(true);
                      setError('');
                      void persistence()
                        .then((p) => p.loadSlot(saved.slot))
                        .then((done) => {
                          if (done) navigate(`/career?save=${saved.slot}`);
                        })
                        .catch((cause: unknown) => setError(errorText(errorCode(cause))))
                        .finally(() => setBusy(false));
                    }}
                  >
                    {format(t.menu.continueCareer, { name: saved.name })}
                  </Button>
                ) : null}
                {start}
                {error && (
                  <StatusLine tone="error" className="basis-full">
                    {error}
                  </StatusLine>
                )}
              </CareerStatusCard>
            ) : (
              <>
                <p className="max-w-[23.75rem] text-hero-muted sm:text-base sm:leading-relaxed">
                  {t.menu.body}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-[1.125rem] gap-y-3">
                  {start}
                  <span className="text-xs text-hero-muted">{t.menu.startHint}</span>
                </div>
                <div className="mt-1.5 -ml-3 flex flex-wrap items-center gap-1">
                  <ExploreLinks onHero />
                </div>
              </>
            )}
          </div>
          <div
            className={cx(
              'relative min-w-0 self-end pt-3 leading-[0]',
              status ? 'flex-[1_1_23.75rem] max-[700px]:hidden' : 'flex-[1_1_27.5rem]',
            )}
          >
            <StadiumArt colors={status?.colors ?? null} club={status?.club ?? ''} />
          </div>
        </section>
        {status ? (
          <>
            <nav aria-labelledby="more-heading" className="-ml-3 flex flex-wrap items-center gap-1">
              <h2 id="more-heading" className="sr-only">
                {t.menu.moreTitle}
              </h2>
              <ExploreLinks onHero={false} />
            </nav>
            <div className="flex flex-wrap items-stretch gap-5">
              <PillarList />
              <Discoveries compact />
            </div>
          </>
        ) : (
          <>
            <Pillars />
            <Discoveries compact={false} />
          </>
        )}
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span>{format(t.app.release.version, { version: APP_VERSION })}</span>
          <span aria-hidden="true">·</span>
          <Link
            to="/whats-new"
            className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4 hover:text-ink"
          >
            {t.app.release.link}
          </Link>
        </p>
      </div>
    </Page>
  );
}
