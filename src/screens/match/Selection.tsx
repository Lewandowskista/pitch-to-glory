import { useState } from 'react';
import type { World } from '../../model/domain';
import { matchText as m } from '../../i18n/match';
import { ClubBadge, Footballer } from './Shared';

export function Selection({
  world,
  onPrepare,
}: {
  world: World;
  onPrepare: (home: string, away: string, player: string, seed: string) => void;
}) {
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
  return (
    <section className="match-selection">
      <div className="match-selection-intro">
        <span className="match-eyebrow">{m.friendly}</span>
        <h2>{m.selection}</h2>
        <p>{m.friendlyBody}</p>
        <div className="match-fixture-art">
          <ClubBadge club={home} />
          <span>–</span>
          <ClubBadge club={away} />
        </div>
        <Footballer player={player} season={world.date.season} />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onPrepare(home.id, away.id, player.id, seed.trim() || `${world.seed}:friendly:1`);
        }}
        className="match-selection-form"
      >
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
        <label>
          {m.division}
          <select value={league.id} onChange={(event) => setLeagueId(event.target.value)}>
            {leagues.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="match-input-pair">
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
        <label>
          {m.yourTeam}
          <select value={side} onChange={(event) => setSide(event.target.value as 'home' | 'away')}>
            <option value="home">{home.name}</option>
            <option value="away">{away.name}</option>
          </select>
        </label>
        <label>
          {m.footballer}
          <select value={player.id} onChange={(event) => setPlayerId(event.target.value)}>
            {availableIds.map((id) => (
              <option key={id} value={id}>
                {world.players[id]!.name} · {world.players[id]!.primaryPosition}
              </option>
            ))}
          </select>
        </label>
        <label>
          {m.seed}
          <input value={seed} maxLength={128} onChange={(event) => setSeed(event.target.value)} />
        </label>
        <button className="button" type="submit">
          {m.prepare}
        </button>
      </form>
    </section>
  );
}
