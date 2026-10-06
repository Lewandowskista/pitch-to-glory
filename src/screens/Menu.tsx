import { Link } from 'react-router-dom';
import { t } from '../i18n';
import { Page } from '../ui/Page';
import { Icon } from '../ui/Icon';
import { Artwork } from '../ui/Artwork';
import { generateGallery } from '../engine/assets/gallery';
import { renderCrest } from '../engine/assets/crest';
import { renderKit } from '../engine/assets/kit';
import { renderAvatar } from '../engine/assets/avatar';
import stadium from '../assets/stadium.svg';
const sample = generateGallery('pitch-to-glory');
export default function Menu() {
  return (
    <Page className="menu-page">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{t.menu.eyebrow}</p>
          <h1>{t.menu.headline}</h1>
          <p className="hero-description">{t.menu.body}</p>
          <Link className="button hero-button" to="/gallery">
            {t.menu.explore}
            <Icon name="arrow" />
          </Link>
          <Link className="button secondary menu-world-link" to="/world">
            {t.menu.world}
            <Icon name="ball" />
          </Link>
          <Link className="text-button menu-world-link" to="/match">
            {t.app.match}
            <Icon name="arrow" />
          </Link>
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
