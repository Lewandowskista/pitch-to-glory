import type { GameEvent, World } from '../../model/domain';

/** Append a dated world event. IDs are deterministic within a world's history. */
export function recordEvent(
  world: World,
  kind: GameEvent['kind'],
  entityIds: string[],
  params: GameEvent['params'],
): void {
  world.events.push({
    id: `event:${world.date.season}:${world.date.week}:${world.events.length}`,
    date: { ...world.date },
    kind,
    entityIds,
    params,
  });
}
