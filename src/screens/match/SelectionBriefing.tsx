import type { World } from '../../model/domain';
import { careerSelection } from '../../engine/career/market';
import { clubFormation, usesFormations } from '../../engine/selection/world';
import { format } from '../../i18n';
import { selectionText as s } from '../../i18n/selection';
import { SelectionReasons } from '../career/selectionUi';

/** Why the career player starts this fixture: the manager's shape, their place and the chance. */
export function CareerSelectionBriefing({ world, fixtureId }: { world: World; fixtureId: string }) {
  const player = world.players[world.career!.playerId]!;
  const club = world.clubs[player.clubId!]!;
  const manager = world.managers[club.managerId];
  const selection = careerSelection(world, world.fixtures[fixtureId]!);
  return (
    <div className="mt-4 border-t border-line pt-4">
      <h3 className="text-base font-bold">{s.briefing}</h3>
      <p className="mt-1 text-sm text-muted">
        {usesFormations(world)
          ? format(s.formation, {
              manager: manager?.name ?? '',
              formation: clubFormation(world, club),
            })
          : s.lineBased}
      </p>
      <p className="mt-2 text-sm font-semibold text-accent">
        {format(s.picked, { chance: Math.round(selection.probability * 100) })}
      </p>
      <SelectionReasons
        world={world}
        selection={selection}
        className="mt-3"
        chanceLabel={s.chanceThis}
      />
    </div>
  );
}
