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

/** Steps that only state where the odds start or end, not what moved them. */
const FIXED = new Set(['match.factor.base', 'match.factor.limit']);
/**
 * What decided a resolved moment, in words: the two or three steps that moved its odds most,
 * a line when it beat long odds or missed a likely one, and every factor on request.
 */
export function DecisiveFactors({
  factors,
  probability,
  success,
}: {
  factors: ProbabilityFactor[];
  probability: number;
  success: boolean;
}) {
  const moving = factors
    .filter((factor) => !FIXED.has(factor.labelKey) && Math.abs(factor.contribution) >= 0.005)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3);
  const base = factors.find((factor) => factor.labelKey === 'match.factor.base');
  const percent = Math.round(probability * 100);
  const verdict =
    success && probability < 0.35
      ? matchFormat(m.againstOdds, { probability: percent })
      : !success && probability > 0.7
        ? matchFormat(m.rareMiss, { probability: percent })
        : null;
  return (
    <div className="match-decisive">
      {verdict && <p className="match-decisive-verdict">{verdict}</p>}
      <h3>{m.decisive}</h3>
      {moving.length ? (
        <ul>
          {moving.map((factor) => (
            <li key={factor.labelKey} className={factor.contribution > 0 ? 'is-helped' : 'is-hurt'}>
              {matchFormat(factor.contribution > 0 ? m.helped : m.hurt, {
                factor: matchLabel(factor.labelKey),
                points: Math.abs(factor.contribution * 100).toFixed(1),
              })}
            </li>
          ))}
        </ul>
      ) : (
        <p>{matchFormat(m.baseOnly, { base: Math.round((base?.contribution ?? 0) * 100) })}</p>
      )}
      <details>
        <summary>{m.allFactors}</summary>
        <Factors factors={factors} />
      </details>
    </div>
  );
}
