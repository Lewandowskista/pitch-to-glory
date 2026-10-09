import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { errorCode } from '../persistence/errors';
import { mayHaveSaves, persistence } from '../persistence/lazy';
import type { Crest, SlotId } from '../model/domain';
import { errorText } from '../i18n';
import { format, t } from '../i18n';
import { Page } from '../ui/Page';
import { Icon } from '../ui/Icon';
import { Artwork } from '../ui/Artwork';
import { generateGallery } from '../engine/assets/gallery';
import { renderCrest } from '../engine/assets/crest';
import { renderKit } from '../engine/assets/kit';
import { renderAvatar } from '../engine/assets/avatar';
import stadium from '../assets/stadium.svg';
const sample = generateGallery('pitch-to-glory');

/** What the clubhouse shows about a career the player can return to. */
interface CareerStatus {
  name: string;
  level: number;
  club: string;
  crest: Crest | null;
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
        const careers = list.flatMap((entry) =>
          entry.status === 'ready' && entry.world?.career
            ? [
                {
                  slot: entry.slot,
                  name: entry.world.career.name,
                  level: entry.world.career.level,
                  club: entry.world.career.clubName,
                  crest: entry.world.career.crest,
                  next: format(t.menu.statusWhere, {
                    season: entry.world.season,
                    week: entry.world.week,
                  }),
                  updatedAt: entry.updatedAt,
                },
              ]
            : [],
        );
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
    next: session
      ? t.menu.statusMatch
      : world.phase === 'complete'
        ? format(t.menu.statusComplete, { season: world.date.season })
        : format(t.menu.statusWhere, { season: world.date.season, week: world.date.week }),
  };
}

/** A returning player's career at a glance, with the way back in. */
function CareerStatusCard({ status, children }: { status: CareerStatus; children: ReactNode }) {
  const crest = useMemo(() => (status.crest ? renderCrest(status.crest) : null), [status.crest]);
  return (
    <section
      aria-labelledby="career-status-heading"
      className="relative z-[2] mt-6 max-w-[30rem] rounded-panel bg-black/25 p-4 ring-1 ring-white/15 sm:p-5"
    >
      <h2 id="career-status-heading" className="text-sm font-semibold text-hero-eyebrow">
        {t.menu.statusLabel}
      </h2>
      <div className="mt-2 flex items-center gap-3">
        {crest && <Artwork svg={crest} alt="" className="h-12 w-12 shrink-0" />}
        <div className="min-w-0">
          <p className="font-display text-[2rem] leading-none break-words">{status.name}</p>
          <p className="mt-1 text-sm text-hero-muted">
            {format(t.menu.statusMeta, { level: status.level, club: status.club })}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-hero-muted">{status.next}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

const exploreLink =
  'inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-semibold underline underline-offset-4 transition-colors';

export default function Menu() {
  const loaded = useLoadedCareer();
  const saved = useSavedCareer(Boolean(loaded));
  const status = loaded ?? saved;
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = (
    <Link className={`button ${status ? 'secondary' : 'hero-button'}`} to="/career/new">
      {t.menu.startCareer}
      <Icon name="arrow" />
    </Link>
  );
  const explore = (tone: string) => (
    <>
      <Link className={`${exploreLink} ${tone}`} to="/gallery">
        {t.menu.explore}
        <Icon name="arrow" />
      </Link>
      <Link className={`${exploreLink} ${tone}`} to="/world">
        {t.menu.world}
        <Icon name="ball" />
      </Link>
      <Link className={`${exploreLink} ${tone}`} to="/match">
        {t.app.match}
        <Icon name="arrow" />
      </Link>
    </>
  );
  return (
    <Page className="menu-page">
      <section className={`hero ${status ? 'hero--returning' : ''}`}>
        <div className="hero-copy">
          <p className="eyebrow">{t.menu.eyebrow}</p>
          <h1>{t.menu.headline}</h1>
          {status ? (
            <CareerStatusCard status={status}>
              {loaded ? (
                <Link className="button hero-button" to="/career">
                  {format(t.menu.continueCareer, { name: loaded.name })}
                  <Icon name="career" />
                </Link>
              ) : saved ? (
                <button
                  className="button hero-button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    setError('');
                    void persistence()
                      .then((p) => p.loadSlot(saved.slot))
                      .then((loaded) => {
                        if (loaded) navigate(`/career?save=${saved.slot}`);
                      })
                      .catch((cause: unknown) => setError(errorText(errorCode(cause))))
                      .finally(() => setBusy(false));
                  }}
                >
                  {format(t.menu.continueCareer, { name: saved.name })}
                  <Icon name="career" />
                </button>
              ) : null}
              {start}
            </CareerStatusCard>
          ) : (
            <>
              <p className="hero-description">{t.menu.body}</p>
              <div className="relative z-[2] mt-6 flex flex-wrap items-center gap-3">{start}</div>
            </>
          )}
          {error && (
            <p role="alert" className="relative z-[2] mt-3 text-sm font-semibold text-gold">
              {error}
            </p>
          )}
          {!status && (
            <div className="relative z-[2] mt-3 flex flex-wrap items-center gap-x-1 gap-y-2">
              {explore('text-hero-ink hover:bg-white/10')}
            </div>
          )}
        </div>
        <img className="stadium" src={stadium} alt={t.menu.artLabel} />
      </section>
      {status && (
        <nav aria-labelledby="more-heading" className="mt-6">
          <h2 id="more-heading" className="sr-only">
            {t.menu.moreTitle}
          </h2>
          <div className="-ml-3 flex flex-wrap items-center gap-x-1 gap-y-2">
            {explore('text-accent hover:bg-surface-soft')}
          </div>
        </nav>
      )}
      <section aria-labelledby="pillars-heading" className="mt-10">
        <h2
          id="pillars-heading"
          className="font-display text-[2.2rem] leading-none tracking-[0.02em] text-ink"
        >
          {t.menu.pillarsTitle}
        </h2>
        <ol className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {t.menu.pillars.map((pillar, index) => (
            <li
              key={pillar.title}
              className="rounded-panel border border-line bg-surface p-5 shadow-surface"
            >
              <span aria-hidden="true" className="font-display text-3xl leading-none text-accent">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-2 text-base font-bold">{pillar.title}</h3>
              <p className="mt-1 text-sm text-muted">{pillar.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 flex items-start gap-2 text-sm font-semibold">
          <Icon name="check" className="mt-0.5 shrink-0 text-accent" />
          {t.menu.promise}
        </p>
      </section>
      <section className="menu-intro">
        <h2>{t.menu.intro}</h2>
        <p>{t.menu.introBody}</p>
      </section>
      <div className="discovery-grid">
        <Link to="/gallery?view=crests" className="discovery">
          <div className="discovery-art crest-art">
            {sample.clubs.slice(0, 3).map((club) => (
              <Artwork key={club.id} svg={renderCrest(club.crest)} alt="" />
            ))}
          </div>
          <div className="discovery-copy">
            <h3>{t.menu.crests}</h3>
            <p>{t.menu.crestsBody}</p>
            <span>
              {t.menu.view}
              <Icon name="arrow" />
            </span>
          </div>
        </Link>
        <Link to="/gallery?view=kits" className="discovery">
          <div className="discovery-art kit-art">
            {Object.values(sample.clubs[0]!.kits).map((kit, i) => (
              <Artwork key={i} svg={renderKit(kit)} alt="" />
            ))}
          </div>
          <div className="discovery-copy">
            <h3>{t.menu.kits}</h3>
            <p>{t.menu.kitsBody}</p>
            <span>
              {t.menu.view}
              <Icon name="arrow" />
            </span>
          </div>
        </Link>
        <Link to="/gallery?view=avatars" className="discovery">
          <div className="discovery-art avatar-art">
            {sample.players.slice(0, 3).map((player, i) => (
              <Artwork key={player.id} svg={renderAvatar(player.avatar, [17, 28, 42][i]!)} alt="" />
            ))}
          </div>
          <div className="discovery-copy">
            <h3>{t.menu.players}</h3>
            <p>{t.menu.playersBody}</p>
            <span>
              {t.menu.view}
              <Icon name="arrow" />
            </span>
          </div>
        </Link>
      </div>
    </Page>
  );
}
