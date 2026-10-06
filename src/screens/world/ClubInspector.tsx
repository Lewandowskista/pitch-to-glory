import type { Club, Player, World } from '../../model/domain';
import { format, t } from '../../i18n';
import { Artwork } from '../../ui/Artwork';
import { renderCrest } from '../../engine/assets/crest';
import { renderKit } from '../../engine/assets/kit';
import { renderAvatar } from '../../engine/assets/avatar';

const integer = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
function ability(player: Player): number {
  const values = Object.values(
    player.primaryPosition === 'GK' ? player.keeperAttributes : player.attributes,
  );
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}
export function ClubInspector({
  world,
  club,
  selectedPlayer,
  onPlayer,
}: {
  world: World;
  club: Club;
  selectedPlayer?: string;
  onPlayer(id: string): void;
}) {
  const manager = world.managers[club.managerId]!;
  const squad = club.playerIds.map((id) => world.players[id]!);
  const player = squad.find((player) => player.id === selectedPlayer) ?? squad[0]!;
  const age = (player: Player) => world.date.season - player.birthSeason;
  const money = (value: number) => format(t.world.money, { amount: integer.format(value) });
  const groups = [
    [
      t.world.technical,
      [
        'finishing',
        'passing',
        'dribbling',
        'firstTouch',
        'crossing',
        'heading',
        'tackling',
        'longShots',
        'setPieces',
      ],
    ],
    [t.world.physical, ['pace', 'acceleration', 'stamina', 'strength', 'agility', 'jumping']],
    [
      t.world.mental,
      ['vision', 'composure', 'positioning', 'decisions', 'workRate', 'leadership', 'aggression'],
    ],
    ...(player.primaryPosition === 'GK'
      ? [[t.world.keeper, Object.keys(player.keeperAttributes)]]
      : []),
  ] as [string, string[]][];
  const attributes = { ...player.attributes, ...player.keeperAttributes };
  return (
    <aside className="club-inspector" aria-label={t.world.inspect}>
      <header className="club-identity">
        <Artwork svg={renderCrest(club.crest)} alt="" />
        <div>
          <p className="eyebrow">{club.city}</p>
          <h2>{club.name}</h2>
          <p>
            {t.world.reputation} <strong>{club.reputation}</strong>
          </p>
        </div>
      </header>
      <div className="club-kits">
        {(['home', 'away', 'third'] as const).map((type) => (
          <figure key={type}>
            <Artwork
              svg={renderKit(club.kits[type])}
              alt={format(t.gallery.kitAlt, { name: club.name, type: t.gallery[type] })}
            />
            <figcaption>{t.gallery[type]}</figcaption>
          </figure>
        ))}
      </div>
      <dl className="club-details">
        <div>
          <dt>{t.world.stadium}</dt>
          <dd>
            {club.stadium.name}
            <small>
              {format(t.world.capacity, { count: integer.format(club.stadium.capacity) })}
            </small>
          </dd>
        </div>
        <div>
          <dt>{t.world.style}</dt>
          <dd>{t.world.styles[club.playingStyle as keyof typeof t.world.styles]}</dd>
        </div>
      </dl>
      <div className="manager-line">
        <Artwork svg={renderAvatar(manager.avatar, Math.min(110, manager.age))} alt="" />
        <div>
          <span>{t.world.manager}</span>
          <strong>{manager.name}</strong>
          <small>{manager.preferredFormation}</small>
        </div>
      </div>
      <div className="culture-tags" aria-label={t.world.cultures}>
        {club.youthFocus >= 60 && <span>{t.world.youth}</span>}
        {club.culture.winNow >= 65 && <span>{t.world.winNow}</span>}
        {club.culture.fanOwned && <span>{t.world.fanOwned}</span>}
        {club.culture.discipline >= 70 && <span>{t.world.disciplined}</span>}
        {club.culture.attacking >= 70 && <span>{t.world.attacking}</span>}
      </div>
      <details className="finance-details">
        <summary>{t.world.finances}</summary>
        <dl className="club-details">
          <div>
            <dt>{t.world.balance}</dt>
            <dd>{money(club.finances.balance)}</dd>
          </div>
          <div>
            <dt>{t.world.wageBudget}</dt>
            <dd>{money(club.finances.wageBudget)}</dd>
          </div>
          <div>
            <dt>{t.world.transferBudget}</dt>
            <dd>{money(club.finances.transferBudget)}</dd>
          </div>
        </dl>
      </details>
      <h3 className="squad-heading">
        {t.world.squad}
        <span>{squad.length}</span>
      </h3>
      <div className="table-scroll">
        <table className="squad-table">
          <caption className="sr-only">
            {club.name} · {t.world.squad}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t.world.player}</th>
              <th scope="col">{t.world.age}</th>
              <th scope="col" title={t.world.position}>
                {t.world.position}
              </th>
              <th scope="col">{t.world.ability}</th>
              <th scope="col">{t.world.goals}</th>
            </tr>
          </thead>
          <tbody>
            {squad.map((member) => (
              <tr key={member.id} className={member.id === player.id ? 'selected-row' : ''}>
                <th scope="row">
                  <button
                    onClick={() => onPlayer(member.id)}
                    aria-pressed={member.id === player.id}
                  >
                    <Artwork svg={renderAvatar(member.avatar, Math.min(110, age(member)))} alt="" />
                    <span>{member.name}</span>
                  </button>
                </th>
                <td>{age(member)}</td>
                <td>{member.primaryPosition}</td>
                <td>{ability(member)}</td>
                <td>{member.stats.goals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="player-inspect">
        <header>
          <Artwork svg={renderAvatar(player.avatar, Math.min(110, age(player)))} alt="" />
          <div>
            <p className="eyebrow">{t.world.playerDetail}</p>
            <h3>{player.name}</h3>
            <p>
              {player.primaryPosition} · {format(t.gallery.age, { age: age(player) })}
            </p>
          </div>
        </header>
        <dl className="player-overview">
          <div>
            <dt>{t.world.ability}</dt>
            <dd>{ability(player)}</dd>
          </div>
          <div>
            <dt>{t.world.potential}</dt>
            <dd>{player.potential}</dd>
          </div>
          <div>
            <dt>{t.world.fitness}</dt>
            <dd>{player.fitness}</dd>
          </div>
          <div>
            <dt>{t.world.form}</dt>
            <dd>{player.form}</dd>
          </div>
        </dl>
        <p className="player-foot">
          {t.world.foot}: {t.world.feet[player.foot]}
        </p>
        <div className="attribute-groups">
          {groups.map(([title, keys]) => (
            <div key={title}>
              <h4>{title}</h4>
              <dl>
                {keys.map((key) => (
                  <div key={key}>
                    <dt>{t.world.attributes[key as keyof typeof t.world.attributes]}</dt>
                    <dd>{attributes[key as keyof typeof attributes]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
