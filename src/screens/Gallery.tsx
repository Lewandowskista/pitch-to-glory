import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { format, t } from '../i18n';
import { generateGallery } from '../engine/assets/gallery';
import { renderCrest } from '../engine/assets/crest';
import { renderKit } from '../engine/assets/kit';
import { renderAvatar } from '../engine/assets/avatar';
import { CONFIG } from '../engine/config';
import { Page } from '../ui/Page';
import { Icon } from '../ui/Icon';
import { Artwork } from '../ui/Artwork';
type View = 'crests' | 'kits' | 'avatars';
const views: View[] = ['crests', 'kits', 'avatars'];
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
  return (
    <Page>
      <div className="page-heading">
        <h1>{t.gallery.title}</h1>
        <p>{t.gallery.description}</p>
      </div>
      <div className="seed-toolbar">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSeed(draft);
          }}
        >
          <label htmlFor="seed">{t.gallery.seed}</label>
          <div className="seed-input">
            <input
              id="seed"
              value={draft}
              maxLength={120}
              required
              onChange={(event) => setDraft(event.target.value)}
              aria-describedby="seed-hint"
            />
            <button className="button secondary" type="submit">
              {t.gallery.apply}
            </button>
          </div>
        </form>
        <button className="button" onClick={reseed}>
          <Icon name="refresh" />
          {t.gallery.reseed}
        </button>
        <Link className="save-gallery" to="/saves">
          <Icon name="save" />
          {t.gallery.save}
        </Link>
      </div>
      <p id="seed-hint" className="seed-hint">
        {t.gallery.seedHint}
      </p>
      <div className="gallery-navigation">
        <div className="gallery-tabs" role="tablist" aria-label={t.gallery.tabs}>
          {views.map((v) => (
            <button
              key={v}
              role="tab"
              id={`tab-${v}`}
              aria-controls={`panel-${v}`}
              aria-selected={view === v}
              tabIndex={view === v ? 0 : -1}
              onClick={() => select(v)}
              onKeyDown={(event) => {
                if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
                  event.preventDefault();
                  const index = views.indexOf(v);
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? 2
                        : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
                  select(views[next]!);
                  document.getElementById(`tab-${views[next]}`)?.focus();
                }
              }}
            >
              {t.gallery[v]}
            </button>
          ))}
        </div>
        <span className="design-count">
          {format(t.gallery.count, { count: view === 'avatars' ? 24 : view === 'kits' ? 45 : 15 })}
        </span>
      </div>
      <section role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`} tabIndex={0}>
        <p className="gallery-note">
          {view === 'crests'
            ? t.gallery.crestNote
            : view === 'kits'
              ? t.gallery.kitNote
              : t.gallery.avatarNote}
        </p>
        {view === 'crests' && (
          <div className="crest-grid">
            {assets.clubs.map((club, i) => (
              <article className="crest-card" key={club.id}>
                <div className="asset-index">{String(i + 1).padStart(2, '0')}</div>
                <Artwork
                  svg={renderCrest(club.crest)}
                  alt={format(t.gallery.crestAlt, { name: club.name })}
                />
                <h2>{club.name}</h2>
                <div className="swatches" aria-label={t.gallery.colors}>
                  {club.crest.colors.map((color) => (
                    <span key={color} style={{ backgroundColor: color }} title={color} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
        {view === 'kits' && (
          <div className="kit-grid">
            {assets.clubs.map((club) => (
              <article className="kit-club" key={club.id}>
                <div className="club-caption">
                  <Artwork svg={renderCrest(club.crest)} alt="" />
                  <h2>{club.name}</h2>
                </div>
                <div className="kit-trio">
                  {(['home', 'away', 'third'] as const).map((type) => (
                    <div key={type}>
                      <Artwork
                        svg={renderKit(club.kits[type])}
                        alt={format(t.gallery.kitAlt, { name: club.name, type: t.gallery[type] })}
                      />
                      <h3>{t.gallery[type]}</h3>
                      <p>{t.gallery.patterns[club.kits[type].pattern]}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
        {view === 'avatars' && (
          <div className="avatar-grid">
            {assets.players.map((player) => (
              <article className="avatar-club" key={player.id}>
                <h2>{player.name}</h2>
                <div className="age-trio">
                  {CONFIG.gallery.ages.map((age) => (
                    <div key={age}>
                      <Artwork
                        svg={renderAvatar(player.avatar, age)}
                        alt={format(t.gallery.avatarAlt, { name: player.name, age })}
                      />
                      <p>{format(t.gallery.age, { age })}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </Page>
  );
}
