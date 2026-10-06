import type { ChronicleEntry, ChronicleKind, World } from '../../../model/domain';
import { CONFIG } from '../../config';
import { nextId } from '../market/records';
import { today } from '../market/rules';

/**
 * The Career Chronicle (AGENTS.md §9.1): dated biography entries written as things happen.
 * Templates in the i18n catalogue turn each entry into a sentence; the UI groups them by
 * season and illustrates them with the player's portrait at that age and the club crest.
 */
export function chronicle(
  world: World,
  kind: ChronicleKind,
  params: ChronicleEntry['params'] = {},
  options: { clubId?: string | null; momentId?: string | null } = {},
): void {
  const career = world.career;
  if (!career) return;
  const player = world.players[career.playerId]!;
  world.chronicle.push({
    id: nextId(world, 'chronicle'),
    playerId: career.playerId,
    date: today(world),
    kind,
    params,
    clubId: options.clubId === undefined ? player.clubId : options.clubId,
    momentId: options.momentId ?? null,
  });
  const own = world.chronicle.filter((entry) => entry.playerId === career.playerId);
  const excess = own.length - CONFIG.career.honours.chronicleLimit;
  if (excess > 0) {
    // Keep the story's landmarks; drop the oldest routine entries first.
    // Keep the start for ever; if routine entries run out, the oldest others go next.
    const routine = new Set<ChronicleKind>(['cap', 'apps-milestone', 'injury']);
    const candidates = [
      ...own.filter((entry) => routine.has(entry.kind)),
      ...own.filter((entry) => !routine.has(entry.kind) && entry.kind !== 'start'),
    ];
    const drop = new Set(candidates.slice(0, excess).map((entry) => entry.id));
    world.chronicle = world.chronicle.filter((entry) => !drop.has(entry.id));
  }
}
