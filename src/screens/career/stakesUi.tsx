import type { Fixture, World } from '../../model/domain';
import { fixtureStake } from '../../engine/career/stakes';
import { format } from '../../i18n';
import { stakesText as s } from '../../i18n/stakes';

/** The fixture's stake in words, or null when nothing beyond the points is at stake. */
export function stakeText(world: World, fixture: Fixture): string | null {
  const stake = fixtureStake(world, fixture);
  if (!stake) return null;
  const rank = typeof stake.params.rank === 'number' ? stake.params.rank : 0;
  return format(s.kinds[stake.kind], {
    ...stake.params,
    rank: s.rank[rank - 1] ?? String(rank),
  });
}

/**
 * One line on what the fixture is about, on the green match card (`field`) or a panel. Read
 * as part of the fixture by screen readers.
 */
export function StakeLine({
  world,
  fixture,
  tone = 'field',
}: {
  world: World;
  fixture: Fixture;
  tone?: 'field' | 'panel';
}) {
  const text = stakeText(world, fixture);
  if (!text) return null;
  return (
    <p
      className={
        tone === 'field'
          ? 'flex items-center gap-2 text-base font-bold text-gold'
          : 'match-stake flex items-center gap-2 font-bold'
      }
      data-testid="fixture-stake"
    >
      <span className="sr-only">{s.label}: </span>
      <span aria-hidden="true">★</span>
      {text}
    </p>
  );
}
