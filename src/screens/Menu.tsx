import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { saves } from '../persistence/runtime';
import { loadSlot, errorCode } from '../persistence/session';
import type { SlotId } from '../model/domain';
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
/** The most recently saved career, offered as "Continue" from the clubhouse. */
function useSavedCareer(skip: boolean) {
  const [saved, setSaved] = useState<{ slot: SlotId; name: string } | null>(null);
  useEffect(() => {
    if (skip) return;
    let current = true;
    void saves
      .list()
      .then((list) => {
        const careers = list.flatMap((entry) =>
          entry.status === 'ready' && entry.world?.career
            ? [{ slot: entry.slot, name: entry.world.career.name, updatedAt: entry.updatedAt }]
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
export default function Menu() {
  const world = useAppStore((s) => s.world);
  const loaded = world?.career ? world.players[world.career.playerId] : undefined;
  const saved = useSavedCareer(Boolean(loaded));
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Page className="menu-page">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{t.menu.eyebrow}</p>
          <h1>{t.menu.headline}</h1>
          <p className="hero-description">{t.menu.body}</p>
          <div className="relative z-[2] mt-6 flex flex-wrap items-center gap-3">
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
                  void loadSlot(saved.slot)
                    .then(() => navigate(`/career?save=${saved.slot}`))
                    .catch((cause: unknown) => setError(errorText(errorCode(cause))))
                    .finally(() => setBusy(false));
                }}
              >
                {format(t.menu.continueCareer, { name: saved.name })}
                <Icon name="career" />
              </button>
            ) : null}
            <Link
              className={`button ${loaded || saved ? 'secondary' : 'hero-button'}`}
              to="/career/new"
            >
              {t.menu.startCareer}
              <Icon name="arrow" />
            </Link>
          </div>
          {error && (
            <p role="alert" className="relative z-[2] mt-3 text-sm font-semibold text-gold">
              {error}
            </p>
          )}
          <div className="relative z-[2] mt-3 flex flex-wrap items-center gap-x-1 gap-y-2">
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-semibold text-[#fff7e4] underline underline-offset-4 transition-colors hover:bg-white/10"
              to="/gallery"
            >
              {t.menu.explore}
              <Icon name="arrow" />
            </Link>
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-semibold text-[#fff7e4] underline underline-offset-4 transition-colors hover:bg-white/10"
              to="/world"
            >
              {t.menu.world}
              <Icon name="ball" />
            </Link>
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-semibold text-[#fff7e4] underline underline-offset-4 transition-colors hover:bg-white/10"
              to="/match"
            >
              {t.app.match}
              <Icon name="arrow" />
            </Link>
          </div>
        </div>
        <img className="stadium" src={stadium} alt={t.menu.artLabel} />
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
