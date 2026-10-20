import { useMemo } from 'react';
import type { Selection } from '../../engine/career/market';
import { FORMATION_SLOTS } from '../../engine/selection/formations';
import { clubLineup } from '../../engine/selection/world';
import type { Club, World } from '../../model/domain';
import { format } from '../../i18n';
import { careerText as c } from '../../i18n/career';
import { marketText as m } from '../../i18n/market';
import { selectionText as t } from '../../i18n/selection';

const points = (value: number) => {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${Math.abs(rounded)}`;
};

/** Where the career player stands for a place, in one sentence. */
export function competitionLine(world: World, selection: Selection): string {
  const competition = selection.competition;
  const position = c.positions[competition.position] ?? competition.position;
  if (competition.inTeam)
    return competition.fit < 100
      ? format(t.inTeamFamiliar, { position, fit: competition.fit })
      : format(t.inTeam, { position });
  if (!competition.formation) return format(t.outsideLine, { places: competition.placesOutside });
  const names = competition.aheadIds.map((id) => world.players[id]?.name ?? id).join(t.and);
  return competition.placesOutside === 1
    ? format(t.outside, { position, names })
    : format(t.outsideMany, { places: competition.placesOutside, position, names });
}

/**
 * The selection chance and its parts, in the order they are added: the same numbers
 * `careerSelection` uses, so the explanation always matches the calculation. `showLine`
 * leaves out the opening sentence where the card already shows it (beside the mini-pitch).
 */
export function SelectionReasons({
  world,
  selection,
  className = '',
  chanceLabel = t.chance,
  showLine = true,
}: {
  world: World;
  selection: Selection;
  className?: string;
  chanceLabel?: string;
  showLine?: boolean;
}) {
  return (
    <div className={className}>
      {showLine && <p className="text-sm font-bold">{competitionLine(world, selection)}</p>}
      <dl
        className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-[0.8125rem] tabular-nums ${showLine ? 'mt-3' : ''}`}
      >
        {selection.reasons.map((reason) => (
          <div key={reason.kind} className="contents">
            <dt className="min-w-0 text-muted">
              {format(t.reasons[reason.kind], {
                role:
                  reason.kind === 'role'
                    ? (m.roles[reason.detail as keyof typeof m.roles] ?? String(reason.detail))
                    : '',
                value: typeof reason.detail === 'number' ? Math.round(reason.detail) : '',
              })}
            </dt>
            <dd
              className={`text-right font-extrabold ${
                (reason.contribution ?? 0) > 0
                  ? 'text-accent'
                  : (reason.contribution ?? 0) < 0
                    ? 'text-danger'
                    : 'text-muted'
              }`}
            >
              {reason.contribution === null ? '' : points(reason.contribution)}
            </dd>
          </div>
        ))}
        <dt className="self-center border-t border-line pt-2.5 font-extrabold">{chanceLabel}</dt>
        <dd className="border-t border-line pt-1.5 text-right font-display text-[2.125rem] leading-none text-accent">
          {Math.round(selection.probability * 100)}%
        </dd>
      </dl>
      <p className="mt-2 text-xs text-muted">{t.explain}</p>
    </div>
  );
}

// The pitch is drawn attacking to the right: a slot's depth runs along x, its width along y.
const PITCH = { width: 176, height: 118 };
const pitchX = (depth: number) => 12 + ((depth - 6) / (72 - 6)) * 148;
const pitchY = (width: number) => 10 + (width / 100) * 98;

/**
 * The manager's formation on a small pitch with the career player's slot ringed in gold: the
 * slot they hold, or the one they are competing for. Nothing in a world still picking by
 * position lines, which has no shape to draw.
 */
export function FormationPitch({
  world,
  club,
  selection,
  className = '',
}: {
  world: World;
  club: Club;
  selection: Selection;
  className?: string;
}) {
  const competition = selection.competition;
  const formation = competition.formation;
  const playerId = world.career?.playerId;
  const target = useMemo(() => {
    if (!formation) return -1;
    const slots = FORMATION_SLOTS[formation];
    if (competition.inTeam && playerId) {
      const at = clubLineup(world, club)?.starterIds.indexOf(playerId) ?? -1;
      if (at >= 0) return at;
    }
    return slots.findIndex((slot) => slot.position === competition.position);
  }, [world, club, formation, competition.inTeam, competition.position, playerId]);
  if (!formation) return null;
  const slots = FORMATION_SLOTS[formation];
  const mine = slots[target];
  const label = format(t.club.pitch, {
    club: club.name,
    formation,
    line: competitionLine(world, selection),
  });
  return (
    <svg
      viewBox={`0 0 ${PITCH.width} ${PITCH.height}`}
      role="img"
      aria-label={label}
      className={`h-auto w-44 shrink-0 ${className}`}
    >
      <rect
        x={1}
        y={1}
        width={PITCH.width - 2}
        height={PITCH.height - 2}
        rx={8}
        className="fill-field"
      />
      <g fill="none" className="stroke-hero-ink" strokeOpacity={0.35} strokeWidth={1.5}>
        <path d={`M${PITCH.width / 2} 1V${PITCH.height - 1}`} />
        <circle cx={PITCH.width / 2} cy={PITCH.height / 2} r={14} />
        <path d="M1 34H20V84H1" />
        <path d="M175 34H156V84H175" />
      </g>
      {slots.map((slot, index) => {
        const keeper = index === 0;
        const you = index === target && competition.inTeam;
        return (
          <circle
            key={`${slot.role}-${index}`}
            cx={pitchX(slot.in[0])}
            cy={pitchY(slot.in[1])}
            r={you ? 8 : 6.5}
            strokeWidth={2}
            className={
              you
                ? 'fill-gold stroke-hero-ink'
                : keeper
                  ? 'fill-gold stroke-field'
                  : 'fill-hero-ink stroke-field'
            }
          />
        );
      })}
      {mine && (
        <>
          <circle
            cx={pitchX(mine.in[0])}
            cy={pitchY(mine.in[1])}
            r={11}
            fill="none"
            strokeWidth={2}
            strokeDasharray="3 3"
            className="stroke-gold"
          />
          <text
            x={pitchX(mine.in[0])}
            y={pitchY(mine.in[1]) > 90 ? pitchY(mine.in[1]) - 15 : pitchY(mine.in[1]) + 21}
            textAnchor="middle"
            fontSize={9}
            fontWeight={800}
            className="fill-gold font-sans uppercase"
          >
            {t.club.you}
          </text>
        </>
      )}
    </svg>
  );
}
