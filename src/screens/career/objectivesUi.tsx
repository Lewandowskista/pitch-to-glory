import { useMemo } from 'react';
import type { Fixture, World } from '../../model/domain';
import { previewObjectives } from '../../engine/career/objectives';
import { careerSelection } from '../../engine/career/market';
import { format } from '../../i18n';
import { objectiveText as o } from '../../i18n/objectives';

/** The selection chance from which the hub treats the player as expected to start. */
export const EXPECTED_START = 0.5;

/**
 * The next match's personal objectives on the hub's hero (engine match-15, decision 3): drawn
 * from the fixture and the player's position, so they are exactly what kickoff will set. Shown
 * as the player's objectives when they are expected to start (selection chance of 50% or
 * more), otherwise as the objectives "if you are picked". Nothing for an injured player.
 */
export function ObjectivesLine({ world, fixture }: { world: World; fixture: Fixture }) {
  const preview = useMemo(() => {
    const player = world.career ? world.players[world.career.playerId] : undefined;
    if (!player || player.injuryId) return null;
    const objectives = previewObjectives(world, fixture);
    if (!objectives) return null;
    const chance = careerSelection(world, fixture).probability;
    return { objectives, expected: chance >= EXPECTED_START };
  }, [world, fixture]);
  if (!preview) return null;
  return (
    <div className="text-sm" data-testid="hub-objectives">
      <p className="text-xs font-extrabold tracking-[0.14em] text-gold uppercase">
        {preview.expected ? o.heading : o.ifPicked}
      </p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1" aria-label={o.listLabel}>
        {preview.objectives.map((objective) => (
          <li key={objective.id} className="text-hero-ink">
            {format(o.short[objective.kind], { target: objective.target })}
          </li>
        ))}
      </ul>
    </div>
  );
}
