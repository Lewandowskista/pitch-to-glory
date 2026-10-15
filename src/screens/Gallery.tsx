import { useMemo, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { format, t } from '../i18n';
import { generateGallery, type GalleryClub, type GalleryPlayer } from '../engine/assets/gallery';
import { foundedYear, renderCrest } from '../engine/assets/crest';
import { renderKit } from '../engine/assets/kit';
import { clubDress, renderAvatar } from '../engine/assets/avatar';
import { CONFIG } from '../engine/config';
import { Page } from '../ui/Page';
import { Icon } from '../ui/Icon';
import { Artwork } from '../ui/Artwork';
import { kitArt } from '../ui/kitArt';
import { Button, PageHeader, Panel } from '../ui/kit';

type View = 'crests' | 'kits' | 'avatars';
const views: View[] = ['crests', 'kits', 'avatars'];
const KIT_TYPES = ['home', 'away', 'third'] as const;
/** Kit and portrait cards: two side by side wherever a trio of 112px pictures fits. */
const PAIR_GRID = 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,23.75rem),1fr))] gap-4';

export default function Gallery() {
  const gallery = useAppStore((s) => s.gallery);
  const reseed = useAppStore((s) => s.reseed);
  const setSeed = useAppStore((s) => s.setSeed);
  const [draft, setDraft] = useState(gallery.seed);
  const [previousSeed, setPreviousSeed] = useState(gallery.seed);
  if (previousSeed !== gallery.seed) {
    setPreviousSeed(gallery.seed);
    setDraft(gallery.seed);
  }
  const [params, setParams] = useSearchParams();
  const selected = params.get('view');
  const view: View = views.includes(selected as View) ? (selected as View) : 'crests';
  const assets = useMemo(() => generateGallery(gallery.seed), [gallery.seed]);
  const select = (next: View) => setParams({ view: next });
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, current: View) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = views.indexOf(current);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? views.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : views.length - 1)) % views.length;
    select(views[next]!);
    document.getElementById(`tab-${views[next]}`)?.focus();
  };
  const note =
    view === 'crests'
      ? t.gallery.crestNote
      : view === 'kits'
        ? t.gallery.kitNote
        : t.gallery.avatarNote;
  return (
    <Page>
      <PageHeader title={t.gallery.title} description={t.gallery.description} />
      <Panel as="div" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <form
            className="min-w-0 flex-[1_1_23.75rem] sm:max-w-[32.5rem]"
            onSubmit={(event) => {
              event.preventDefault();
              setSeed(draft);
            }}
          >
            <label htmlFor="seed" className="mb-1.5 block text-[0.8125rem] font-bold">
              {t.gallery.seed}
            </label>
            <div className="flex gap-2">
              <input
                id="seed"
                value={draft}
                maxLength={120}
                required
                className="min-w-0 flex-1 bg-surface-soft"
                onChange={(event) => setDraft(event.target.value)}
                aria-describedby="seed-hint"
              />
              <Button type="submit" className="shrink-0">
                {t.gallery.apply}
              </Button>
            </div>
          </form>
          <Button variant="secondary" icon="refresh" onClick={reseed}>
            {t.gallery.reseed}
          </Button>
          <Link
            to="/saves"
            className="inline-flex min-h-12 items-center gap-2 px-1.5 font-bold text-accent underline underline-offset-4 sm:ml-auto"
          >
            <Icon name="save" />
            {t.gallery.save}
          </Link>
        </div>
        <p id="seed-hint" className="text-xs text-muted">
          {t.gallery.seedHint}
        </p>
      </Panel>
      <div className="mt-7 mb-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="segmented-tabs" role="tablist" aria-label={t.gallery.tabs}>
          {views.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              id={`tab-${v}`}
              aria-controls={`panel-${v}`}
              aria-selected={view === v}
              tabIndex={view === v ? 0 : -1}
              onClick={() => select(v)}
              onKeyDown={(event) => onTabKey(event, v)}
            >
              {t.gallery[v]}
            </button>
          ))}
        </div>
        <p className="font-semibold text-muted">{note}</p>
      </div>
      <section
        role="tabpanel"
        id={`panel-${view}`}
        aria-labelledby={`tab-${view}`}
        tabIndex={0}
        className="rounded-panel focus-visible:outline-offset-4"
      >
        {view === 'crests' && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(11.25rem,1fr))] sm:gap-4">
            {assets.clubs.map((club, index) => (
              <CrestCard key={club.id} club={club} index={index} />
            ))}
          </div>
        )}
        {view === 'kits' && (
          <div className={PAIR_GRID}>
            {assets.clubs.map((club) => (
              <KitCard key={club.id} club={club} />
            ))}
          </div>
        )}
        {view === 'avatars' && (
          <div className={PAIR_GRID}>
            {assets.players.map((player, index) => (
              <PortraitCard
                key={player.id}
                player={player}
                club={assets.clubs[index % assets.clubs.length]}
              />
            ))}
          </div>
        )}
      </section>
    </Page>
  );
}

function CrestCard({ club, index }: { club: GalleryClub; index: number }) {
  const svg = useMemo(() => renderCrest(club.crest, { founded: foundedYear(club) }), [club]);
  const colours = club.crest.colors;
  return (
    <Panel
      as="article"
      padding="none"
      className="crest-card gallery-lift relative flex flex-col items-center gap-2.5 px-3 pt-7 pb-4.5 text-center"
    >
      <span className="absolute top-3 left-3.5 text-xs font-bold text-muted tabular-nums">
        {String(index + 1).padStart(2, '0')}
      </span>
      <Artwork
        svg={svg}
        alt={format(t.gallery.crestAlt, { name: club.name })}
        className="aspect-[160/180] w-full max-w-[7.25rem]"
      />
      <h2 className="grid min-h-9 place-items-center text-[0.8125rem] font-bold">{club.name}</h2>
      <div
        role="img"
        aria-label={`${t.gallery.colors}: ${colours.join(', ')}`}
        className="flex gap-1.5"
      >
        {colours.map((colour, i) => (
          <span
            key={`${colour}-${i}`}
            title={colour}
            className="h-3 w-4.5 rounded-chip ring-1 ring-ink/20 ring-inset"
            style={{ backgroundColor: colour }}
          />
        ))}
      </div>
    </Panel>
  );
}

function KitCard({ club }: { club: GalleryClub }) {
  const art = useMemo(
    () => ({
      crest: renderCrest(club.crest),
      kits: KIT_TYPES.map((type) =>
        renderKit(club.kits[type], kitArt(club.kits[type], club.crest)),
      ),
    }),
    [club],
  );
  return (
    <Panel as="article" className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2.5">
        <Artwork svg={art.crest} alt="" className="h-8 w-7 shrink-0" />
        <h2 className="min-w-0 text-[0.9375rem] font-extrabold break-words">{club.name}</h2>
      </div>
      <div className="kit-trio grid grid-cols-3 gap-2 text-center">
        {KIT_TYPES.map((type, i) => (
          <div
            key={type}
            className="flex min-w-0 flex-col items-center gap-1 rounded-control bg-art-gold px-1.5 pt-3.5 pb-3"
          >
            <Artwork
              svg={art.kits[i]!}
              alt={format(t.gallery.kitAlt, { name: club.name, type: t.gallery[type] })}
              className="aspect-square w-full max-w-28"
            />
            <h3 className="text-[0.8125rem] font-extrabold">{t.gallery[type]}</h3>
            <p className="text-xs text-gold-ink">{t.gallery.patterns[club.kits[type].pattern]}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function PortraitCard({ player, club }: { player: GalleryPlayer; club?: GalleryClub }) {
  const portraits = useMemo(
    () =>
      CONFIG.gallery.ages.map((age) =>
        renderAvatar(player.avatar, age, clubDress(club), player.id),
      ),
    [player, club],
  );
  return (
    <Panel as="article" className="flex flex-col gap-3.5">
      <h2 className="text-[0.9375rem] font-extrabold break-words">{player.name}</h2>
      <div className="age-trio grid grid-cols-3 gap-2 text-center">
        {CONFIG.gallery.ages.map((age, i) => (
          <figure
            key={age}
            className="m-0 flex min-w-0 flex-col items-center overflow-hidden rounded-control bg-art-blue"
          >
            <div className="w-full px-1.5 pt-2.5 leading-none">
              <Artwork
                svg={portraits[i]!}
                alt={format(t.gallery.avatarAlt, { name: player.name, age })}
                className="mx-auto aspect-square w-full max-w-29"
              />
            </div>
            <figcaption className="self-stretch bg-surface-soft px-1 py-2 text-[0.8125rem] font-bold">
              {format(t.gallery.age, { age })}
            </figcaption>
          </figure>
        ))}
      </div>
    </Panel>
  );
}
