import type { MatchSession, Tactics } from '../../engine/match';
import { matchText as m, matchFormat, matchLabel } from '../../i18n/match';
import { ClubBadge, Footballer } from './Shared';

export function Preview({
  session,
  onTactics,
  onKickoff,
}: {
  session: MatchSession;
  onTactics: (tactics: Tactics) => void;
  onKickoff: () => void;
}) {
  const { setup, state } = session;
  const player = setup.players[setup.selectedPlayerId]!;
  const roleIds =
    player.primaryPosition === 'GK'
      ? ['balanced', 'sweeper-keeper', 'shot-stopper', 'safe-distribution']
      : ['LW', 'RW', 'LM', 'RM'].includes(player.primaryPosition)
        ? ['balanced', 'hug-touchline', 'cut-inside', 'track-back']
        : ['CB', 'LB', 'RB', 'DM'].includes(player.primaryPosition)
          ? ['balanced', 'hold-position', 'ball-winner', 'push-forward']
          : ['balanced', 'playmaker', 'run-behind', 'target-player'];
  const instruction =
    player.primaryPosition === 'GK'
      ? 'keeper'
      : ['CB', 'LB', 'RB', 'DM'].includes(player.primaryPosition)
        ? 'defend'
        : ['CM', 'AM', 'LM', 'RM'].includes(player.primaryPosition)
          ? 'midfield'
          : 'attack';
  return (
    <div className="match-preview">
      <section className="match-panel">
        <span className="match-eyebrow">{m.preview}</span>
        <Footballer player={player} season={setup.season} />
        {state.captain && <span className="match-tag">{m.captain}</span>}
        <div className="match-weather">
          <span>
            {m.weather}
            <strong>{m[state.match.weather]}</strong>
          </span>
          <span>
            {m.pitch}
            <strong>{matchFormat(m.pitchValue, { value: state.match.pitchCondition })}</strong>
          </span>
        </div>
        <h3>{m.instructions}</h3>
        <p>{matchLabel(`match.instructions.${instruction}`)}</p>
        <h3>{m.objectives}</h3>
        <ul className="match-objectives">
          {state.match.objectives.map((objective) => (
            <li key={objective.id}>
              {m.objectiveNames[objective.kind]}{' '}
              <strong>
                {objective.target}
                {objective.kind === 'passing' ? '%' : ''}
              </strong>
            </li>
          ))}
        </ul>
      </section>
      <section className="match-panel">
        <h2>{m.tactics}</h2>
        <div className="match-tactics">
          <label>
            {m.role}
            <select
              value={state.match.tactics.role}
              onChange={(event) => onTactics({ ...state.match.tactics, role: event.target.value })}
            >
              {roleIds.map((role) => (
                <option key={role} value={role}>
                  {m.roles[role as keyof typeof m.roles]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {m.risk}
            <select
              value={state.match.tactics.risk}
              onChange={(event) =>
                onTactics({ ...state.match.tactics, risk: event.target.value as Tactics['risk'] })
              }
            >
              {(['low', 'balanced', 'high'] as const).map((risk) => (
                <option key={risk} value={risk}>
                  {m[risk]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {m.mentality}
            <select
              value={state.match.tactics.mentality}
              onChange={(event) =>
                onTactics({
                  ...state.match.tactics,
                  mentality: event.target.value as Tactics['mentality'],
                })
              }
            >
              {(['defensive', 'balanced', 'attacking'] as const).map((mentality) => (
                <option key={mentality} value={mentality}>
                  {m[mentality]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="button match-kickoff" onClick={onKickoff}>
          {m.kickoff}
        </button>
        <p className="muted">{m.friendlyBody}</p>
      </section>
      {[setup.home, setup.away].map((club, index) => {
        const lineup = index === 0 ? state.match.home : state.match.away;
        return (
          <section key={club.id} className="match-panel">
            <div className="match-lineup-title">
              <ClubBadge club={club} />
              <div>
                <span className="match-eyebrow">
                  {index === 0 ? m.home : m.away} · {lineup.formation}
                </span>
                <h2>{club.name}</h2>
              </div>
            </div>
            <h3>{m.lineup}</h3>
            <ol className="match-lineup">
              {lineup.starterIds.map((id) => (
                <li key={id} className={id === player.id ? 'selected' : ''}>
                  <span>{setup.players[id]!.primaryPosition}</span>
                  <strong>{setup.players[id]!.name}</strong>
                  {id === player.id && <small>{m.selected}</small>}
                </li>
              ))}
            </ol>
            <details>
              <summary>
                {m.bench} ({lineup.benchIds.length})
              </summary>
              <ul className="match-lineup">
                {lineup.benchIds.map((id) => (
                  <li key={id}>
                    <span>{setup.players[id]!.primaryPosition}</span>
                    {setup.players[id]!.name}
                  </li>
                ))}
              </ul>
            </details>
          </section>
        );
      })}
    </div>
  );
}
