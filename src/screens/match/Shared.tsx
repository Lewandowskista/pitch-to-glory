import { Artwork } from '../../ui/Artwork';
import { renderCrest } from '../../engine/assets/crest';
import { renderAvatar } from '../../engine/assets/avatar';
import type { Club, Player, ProbabilityFactor } from '../../model/domain';
import { matchText as m, matchLabel, matchFormat } from '../../i18n/match';

export function ClubBadge({ club }: { club: Club }) {
  return <Artwork svg={renderCrest(club.crest)} alt={club.name} className="match-crest" />;
}
export function Footballer({ player, season }: { player: Player; season: number }) {
  return (
    <div className="match-footballer">
      <Artwork
        svg={renderAvatar(player.avatar, season - player.birthSeason)}
        alt={player.name}
        className="match-avatar"
      />
      <div>
        <span className="match-eyebrow">{m.selected}</span>
        <h2>{player.name}</h2>
        <p>
          {player.primaryPosition} · {matchFormat(m.age, { age: season - player.birthSeason })}
        </p>
      </div>
    </div>
  );
}
export function Factors({ factors }: { factors: ProbabilityFactor[] }) {
  return (
    <ul className="match-factors">
      {factors.map((factor, index) => (
        <li key={`${factor.labelKey}-${index}`}>
          <span>{matchLabel(factor.labelKey)}</span>
          <strong
            title={matchFormat(m.contribution, { value: Math.round(factor.contribution * 100) })}
          >
            {factor.contribution > 0 ? '+' : ''}
            {(factor.contribution * 100).toFixed(1)}%
          </strong>
        </li>
      ))}
    </ul>
  );
}
