import { useId, useState } from 'react';
import type { World } from '../../model/domain';
import { matchText as m, matchFormat } from '../../i18n/match';
import { cx } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { ClubBadge, FootballerAvatar } from './Shared';

const u = m.ui;

/**
 * The friendly fixture form (redesign phase 5b): a field-green hero with both crests and your
 * footballer beside the form that picks them, the seed, and the gold "Prepare match".
 */
export function Selection({
  world,
  onPrepare,
}: {
  world: World;
  onPrepare: (home: string, away: string, player: string, seed: string) => void;
}) {
  const id = useId();
  const countries = Object.values(world.countries);
  const [countryId, setCountryId] = useState(countries[0]!.id);
  const leagues = Object.values(world.leagues).filter((league) => league.countryId === countryId);
  const [leagueId, setLeagueId] = useState(leagues.at(-1)!.id);
  const league = leagues.find((item) => item.id === leagueId) ?? leagues.at(-1)!;
  const [homeId, setHomeId] = useState(league.clubIds[0]!);
  const [awayId, setAwayId] = useState(league.clubIds[1]!);
  const home = world.clubs[league.clubIds.includes(homeId) ? homeId : league.clubIds[0]!]!;
  const away =
    world.clubs[
      league.clubIds.includes(awayId) && awayId !== home.id
        ? awayId
        : league.clubIds.find((id) => id !== home.id)!
    ]!;
  const [side, setSide] = useState<'home' | 'away'>('home');
  const team = side === 'home' ? home : away;
  const [playerId, setPlayerId] = useState(team.playerIds[0]!);
  const availableIds = team.playerIds.filter((id) => {
    const player = world.players[id]!;
    return !player.retired && !player.injuryId && player.fitness > 0;
  });
  const selectedId = availableIds.includes(playerId)
    ? playerId
    : (availableIds[0] ?? team.playerIds[0]!);
  const player = world.players[selectedId]!;
  const [seed, setSeed] = useState(`${world.seed}:friendly:1`);
  const side_ = (club: typeof home, which: 'home' | 'away') => (
    <div className="match-friendly-side">
      <ClubBadge club={club} className="match-friendly-crest" />
      <span className="match-friendly-name">{club.name}</span>
      <span className={cx('match-friendly-tag', which === side && 'is-yours')}>
        {which === 'home' ? u.homeSide : u.awaySide}
        {which === side ? ` · ${u.yourTeamSide}` : ''}
      </span>
    </div>
  );
  return (
    <section className="match-selection" aria-labelledby={`${id}-title`}>
      <div className="match-selection-hero">
        <div>
          <p className="match-hero-eyebrow">{m.friendly}</p>
          <h2 id={`${id}-title`} className="match-hero-title">
            {u.friendlyHeading}
          </h2>
          <p className="match-hero-body">{m.friendlyBody}</p>
        </div>
        <div className="match-fixture-art">
          {side_(home, 'home')}
          <span className="match-fixture-dash" aria-hidden="true">
            –
          </span>
          {side_(away, 'away')}
        </div>
        <div className="match-selection-player">
          <FootballerAvatar
            player={player}
            season={world.date.season}
            home={home}
            away={away}
            className="match-selection-avatar"
          />
          <div className="min-w-0">
            <p className="match-hero-eyebrow">{m.selected}</p>
            <p className="match-selection-name">{player.name}</p>
            <p className="match-hero-body">
              {player.primaryPosition} ·{' '}
              {matchFormat(m.age, { age: world.date.season - player.birthSeason })}
            </p>
          </div>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onPrepare(home.id, away.id, player.id, seed.trim() || `${world.seed}:friendly:1`);
        }}
        className="match-panel match-selection-form"
        aria-label={m.friendly}
      >
        <div className="match-field-row">
          <label>
            {m.country}
            <select value={countryId} onChange={(event) => setCountryId(event.target.value)}>
              {countries.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>
          <label className="is-wide">
            {m.division}
            <select value={league.id} onChange={(event) => setLeagueId(event.target.value)}>
              {leagues.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="match-field-row match-pairing">
          <label>
            {m.home}
            <select value={home.id} onChange={(event) => setHomeId(event.target.value)}>
              {league.clubIds.map((id) => (
                <option key={id} value={id}>
                  {world.clubs[id]!.name}
                </option>
              ))}
            </select>
          </label>
          <span className="match-pairing-v" aria-hidden="true">
            {u.versus}
          </span>
          <label>
            {m.away}
            <select value={away.id} onChange={(event) => setAwayId(event.target.value)}>
              {league.clubIds
                .filter((id) => id !== home.id)
                .map((id) => (
                  <option key={id} value={id}>
                    {world.clubs[id]!.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <fieldset className="match-team-choice">
          <legend>{m.yourTeam}</legend>
          <div>
            {(['home', 'away'] as const).map((which) => {
              const club = which === 'home' ? home : away;
              return (
                <label key={which} className={cx('match-team-option', side === which && 'is-on')}>
                  <input
                    type="radio"
                    name={`${id}-side`}
                    value={which}
                    checked={side === which}
                    onChange={() => setSide(which)}
                  />
                  <ClubBadge club={club} className="h-8 w-7" />
                  <span>
                    {club.name}
                    <small>{which === 'home' ? u.homeSide : u.awaySide}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="match-field">
          <label htmlFor={`${id}-player`}>{m.footballer}</label>
          <select
            id={`${id}-player`}
            value={player.id}
            aria-describedby={`${id}-player-hint`}
            onChange={(event) => setPlayerId(event.target.value)}
          >
            {availableIds.map((id) => (
              <option key={id} value={id}>
                {world.players[id]!.name} · {world.players[id]!.primaryPosition}
              </option>
            ))}
          </select>
          <span id={`${id}-player-hint`} className="match-card-note">
            {u.footballerHint}
          </span>
        </div>
        <div className="match-field">
          <label htmlFor={`${id}-seed`}>{m.seed}</label>
          <input
            id={`${id}-seed`}
            value={seed}
            maxLength={128}
            aria-describedby={`${id}-seed-hint`}
            onChange={(event) => setSeed(event.target.value)}
          />
          <span id={`${id}-seed-hint`} className="match-card-note">
            {u.seedHint}
          </span>
        </div>
        <div className="match-form-actions">
          <button className="button play button-lg" type="submit">
            {m.prepare}
            <Icon name="arrow" />
          </button>
          <span className="match-card-note">{u.nextBriefing}</span>
        </div>
      </form>
    </section>
  );
}
