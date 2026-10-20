import { useMemo } from 'react';
import { Artwork } from '../../ui/Artwork';
import { renderCrest } from '../../engine/assets/crest';
import { renderAvatar } from '../../engine/assets/avatar';
import { chooseMatchKits } from '../../engine/assets/clash';
import type { Club, Player, ProbabilityFactor } from '../../model/domain';
import { matchText as m, matchLabel, matchFormat } from '../../i18n/match';
import { cx } from '../../ui/kit';

export function ClubBadge({ club, className }: { club: Club; className?: string }) {
  return (
    <Artwork
      svg={renderCrest(club.crest)}
      alt={club.name}
      className={cx('match-crest', className)}
    />
  );
}
/** The selected player's portrait, in the kit their side wears for this match. */
export function FootballerAvatar({
  player,
  season,
  home,
  away,
  className,
}: {
  player: Player;
  season: number;
  home: Club;
  away: Club;
  className?: string;
}) {
  const age = season - player.birthSeason;
  const svg = useMemo(() => {
    const kits = chooseMatchKits(home, away);
    const awaySide = player.clubId === away.id;
    return renderAvatar(player.avatar, age, {
      kit: awaySide ? kits.away : kits.home,
      crest: (awaySide ? away : home).crest,
    });
  }, [player.avatar, player.clubId, age, home, away]);
  return <Artwork svg={svg} alt={player.name} className={cx('match-avatar', className)} />;
}
/** The selected player with their name and position (the friendly selection, the report). */
export function Footballer({
  player,
  season,
  home,
  away,
}: {
  player: Player;
  season: number;
  home: Club;
  away: Club;
}) {
  const age = season - player.birthSeason;
  return (
    <div className="match-footballer">
      <FootballerAvatar player={player} season={season} home={home} away={away} />
      <div>
        <span className="match-eyebrow">{m.selected}</span>
        <h2>{player.name}</h2>
        <p>
          {player.primaryPosition} · {matchFormat(m.age, { age })}
        </p>
      </div>
    </div>
  );
}

/** A signed percentage with a true minus sign: "+9.5%", "−3.0%". */
export function signedPercent(value: number, digits = 1) {
  const shown = Math.abs(value * 100).toFixed(digits);
  const zero = Number(shown) === 0;
  return `${zero ? '' : value > 0 ? '+' : '−'}${shown}%`;
}

/**
 * Every factor behind a chance, each with a bar from the centre line (right adds, left takes
 * away) and its signed value; the optional total is the chance they add up to.
 */
export function Factors({
  factors,
  total,
  totalLabel = m.ui.successChance,
}: {
  factors: ProbabilityFactor[];
  total?: number;
  /** What the factors add up to (a success chance unless named). */
  totalLabel?: string;
}) {
  return (
    <ul className="match-factors">
      {factors.map((factor, index) => {
        const value = factor.contribution;
        const width = Math.min(Math.abs(value) * 80, 50);
        const shown = Number((value * 100).toFixed(1));
        const tone = shown > 0 ? 'is-up' : shown < 0 ? 'is-down' : 'is-flat';
        return (
          <li key={`${factor.labelKey}-${index}`} className={tone}>
            <span>{matchLabel(factor.labelKey)}</span>
            <span className="match-factor-bar" aria-hidden="true">
              <span
                style={{
                  width: `${width}%`,
                  ...(value >= 0 ? { left: '50%' } : { right: '50%' }),
                }}
              />
            </span>
            <strong title={matchFormat(m.contribution, { value: Math.round(value * 100) })}>
              {signedPercent(value)}
            </strong>
          </li>
        );
      })}
      {total !== undefined && (
        <li className="match-factor-total">
          <span>{totalLabel}</span>
          <strong>{(total * 100).toFixed(1)}%</strong>
        </li>
      )}
    </ul>
  );
}

/** Steps that only state where the odds start or end, not what moved them. */
const FIXED = new Set(['match.factor.base', 'match.factor.limit']);
/** The factor that moved a chance most, in one direction. */
export function strongest(factors: ProbabilityFactor[], direction: 1 | -1) {
  return factors
    .filter((factor) => !FIXED.has(factor.labelKey) && factor.contribution * direction >= 0.005)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))[0];
}
/** Against the odds or a rare miss, in words; null for an ordinary result. */
export function verdictOf(probability: number, success: boolean): string | null {
  const percent = Math.round(probability * 100);
  return success && probability < 0.35
    ? matchFormat(m.againstOdds, { probability: percent })
    : !success && probability > 0.7
      ? matchFormat(m.rareMiss, { probability: percent })
      : null;
}
