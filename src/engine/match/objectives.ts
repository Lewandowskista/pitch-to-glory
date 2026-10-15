import type { Objective, Player } from '../../model/domain';
import { createRng, type Rng } from '../rng';
import { CONFIG } from '../config';

const C = CONFIG.match;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** The match's personal objectives: a rating target and one drawn for the position. */
export function matchObjectives(selected: Player, rng: Rng): Objective[] {
  const O = C.objectives;
  const position = selected.primaryPosition;
  const P = C.routinePass;
  const passing = clamp(
    Math.round((P.base + selected.attributes.passing * P.passing) * 100) + O.passingMargin,
    O.passingRange[0],
    O.passingRange[1],
  );
  const pool: { kind: Objective['kind']; target: number }[] =
    position === 'GK'
      ? [
          { kind: 'clean-sheet', target: 1 },
          { kind: 'saves', target: O.saves },
        ]
      : ['CB', 'LB', 'RB'].includes(position)
        ? [
            { kind: 'clean-sheet', target: 1 },
            { kind: 'tackles', target: O.tackles.defender },
            { kind: 'passing', target: passing },
          ]
        : position === 'DM'
          ? [
              { kind: 'passing', target: passing },
              { kind: 'tackles', target: O.tackles.midfield },
              { kind: 'clean-sheet', target: 1 },
            ]
          : position === 'CM'
            ? [
                { kind: 'passing', target: passing },
                { kind: 'assists', target: 1 },
              ]
            : position === 'AM'
              ? [
                  { kind: 'passing', target: passing },
                  { kind: 'assists', target: 1 },
                  { kind: 'shots', target: O.shots.other },
                ]
              : position === 'ST'
                ? [
                    { kind: 'goals', target: 1 },
                    { kind: 'shots', target: O.shots.striker },
                  ]
                : [
                    { kind: 'goals', target: 1 },
                    { kind: 'shots', target: O.shots.other },
                    { kind: 'assists', target: 1 },
                  ];
  const drawn = rng.pick(pool);
  return [
    { id: 'rating', kind: 'rating', target: O.rating, progress: 0 },
    { id: drawn.kind, kind: drawn.kind, target: drawn.target, progress: 0 },
  ];
}

/**
 * The objectives of a match on the current engine (match-15, decision 3): drawn on their own
 * stream, `${seed}:objectives:${position}`, keyed only by the match seed (a career fixture's seed
 * names the fixture) and the player's position, never by the preview stream, so the hub can
 * show days ahead exactly what kickoff will set.
 */
export function objectivesFor(seed: string, player: Player): Objective[] {
  return matchObjectives(player, createRng(`${seed}:objectives:${player.primaryPosition}`));
}
