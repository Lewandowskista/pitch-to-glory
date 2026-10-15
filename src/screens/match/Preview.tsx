import {
  conditionsEffect,
  pitchEffect,
  positionFamily,
  rolesForPosition,
  weatherEffect,
  type MatchSession,
  type Tactics,
} from '../../engine/match';
import { useId, useMemo, type ReactNode } from 'react';
import { pitchStateFor, renderPitch, renderWeather } from '../../engine/assets/conditions';
import { renderAvatar } from '../../engine/assets/avatar';
import { overallRating } from '../../engine/strength';
import { Artwork } from '../../ui/Artwork';
import { FORMATION_SLOTS, formationOf } from '../../engine/selection/formations';
import { slotFit } from '../../engine/selection/lineup';
import { selectionText as s } from '../../i18n/selection';
import { matchText as m, matchFormat, matchLabel } from '../../i18n/match';
import { useAppStore } from '../../store';
import { Chip, cx } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import type { Club, Hex, Lineup, Objective } from '../../model/domain';

type MatchObjectiveKind = Objective['kind'];
import { ClubBadge, FootballerAvatar } from './Shared';
import { kitAppearance } from './Maps';
import { kitNumberColor } from './pitchArt';

const u = m.ui;
/** Icons for the objective rows, by kind. */
const OBJECTIVE_ICON: Record<MatchObjectiveKind, string> = {
  goals: 'M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3ZM12 8L15.5 10.5L14.2 14.5H9.8L8.5 10.5Z',
  assists: 'M4 12H16M12 6L18 12L12 18',
  passing: 'M4 17L10 11L14 15L20 7M15 7H20V12',
  'clean-sheet': 'M12 3L20 6V12C20 17 16.5 20 12 21C7.5 20 4 17 4 12V6Z',
  rating: 'M12 3L14.6 9L21 9.5L16 13.6L17.6 20L12 16.6L6.4 20L8 13.6L3 9.5L9.4 9Z',
  tackles: 'M5 19L19 5M8 5H5V8M16 19H19V16',
  saves: 'M6 12C6 7 9 4 12 4S18 7 18 12V20H6Z',
  shots: 'M4 20L20 4M13 4H20V11',
};

/** One personal setting as a row of radio segments (keyboard: arrows move, Space picks). */
function Segments<T extends string>({
  name,
  legend,
  hint,
  value,
  options,
  columns,
  onChange,
}: {
  name: string;
  legend: string;
  hint: string;
  value: T;
  options: readonly { value: T; label: string }[];
  columns: number;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <fieldset className="match-segments" aria-describedby={`${id}-hint`}>
      <legend>{legend}</legend>
      <div
        className="match-segment-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cx('match-segment', option.value === value && 'is-on')}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <span id={`${id}-hint`} className="match-card-note">
        {hint}
      </span>
    </fieldset>
  );
}

/** A side's eleven on a small vertical pitch, attacking up, with squad numbers. */
function LineupPitch({
  club,
  lineup,
  colour,
  players,
  selectedId,
}: {
  club: Club;
  lineup: Lineup;
  colour: Hex;
  players: MatchSession['setup']['players'];
  selectedId: string;
}) {
  const posts = FORMATION_SLOTS[formationOf(lineup.formation)];
  const ink = kitNumberColor(colour);
  const you = lineup.starterIds.includes(selectedId) ? players[selectedId] : undefined;
  return (
    <figure className="match-lineup-pitch">
      <svg
        viewBox="-24 -34 728 1118"
        role="img"
        aria-label={matchFormat(you ? u.lineupYou : u.lineupPitch, {
          club: club.name,
          formation: lineup.formation,
          number: you?.squadNumber ?? '',
        })}
      >
        <rect x="-24" y="-34" width="728" height="1118" fill="#2f7a4f" />
        {Array.from({ length: 11 }, (_, band) => (
          <rect key={band} x="-24" y={-34 + band * 105} width="728" height="52.5" fill="#2a7148" />
        ))}
        <g fill="none" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="5">
          <rect x="0" y="0" width="680" height="1050" />
          <path d="M0 525H680" />
          <circle cx="340" cy="525" r="91.5" />
          <path d="M138.4 0V165H541.6V0M248.4 0V55H431.6V0" />
          <path d="M138.4 1050V885H541.6V1050M248.4 1050V995H431.6V1050" />
        </g>
        <path d="M340 -26L326 -8H354Z" fill="#fff7e4" fillOpacity="0.8" />
        {lineup.starterIds.map((id, slot) => {
          const post = posts[slot];
          if (!post) return null;
          const x = post.in[1] * 6.8,
            y = 1050 - post.in[0] * 13.5;
          const selected = id === selectedId;
          return (
            <g key={id}>
              {selected && <circle cx={x} cy={y} r="58" fill="#efcf63" fillOpacity="0.4" />}
              <circle
                cx={x}
                cy={y}
                r="34"
                fill={colour}
                stroke={selected ? '#efcf63' : '#102c26'}
                strokeWidth={selected ? 9 : 5}
              />
              <text x={x} y={y + 10} textAnchor="middle" fontSize="30" fontWeight="800" fill={ink}>
                {players[id]?.squadNumber}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>{matchFormat(u.attackingUp, { formation: lineup.formation })}</figcaption>
    </figure>
  );
}

/**
 * The pre-match briefing (redesign phase 5b): your footballer, the conditions, the manager's
 * instructions and your objectives; your approach with the kick-off; then both elevens on a
 * formation pitch with squad numbers, slots and the bench behind a disclosure.
 */
export function Preview({
  session,
  onTactics,
  onKickoff,
  onNewFixture,
  note,
  selection,
  stake,
}: {
  session: MatchSession;
  /** Replaces the friendly-match explanation (career fixtures). */
  note?: string;
  /** Why the career player is starting, for a career fixture. */
  selection?: ReactNode;
  /** What the career fixture is about, above the footballer. */
  stake?: ReactNode;
  onTactics: (tactics: Tactics) => void;
  onKickoff: () => void;
  /** Friendlies: back to the fixture form. */
  onNewFixture?: () => void;
}) {
  const { setup, state } = session;
  const world = useAppStore((store) => store.world);
  const player = setup.players[setup.selectedPlayerId]!;
  const ownClub = setup.home.playerIds.includes(player.id) ? setup.home : setup.away;
  const manager = world?.managers[world.clubs[ownClub.id]?.managerId ?? ''];
  const managerSvg = useMemo(
    () => (manager ? renderAvatar(manager.avatar, manager.age) : null),
    [manager],
  );
  const roleIds = rolesForPosition(player.primaryPosition);
  const family = positionFamily(player.primaryPosition);
  const instruction =
    family === 'keeper'
      ? 'keeper'
      : family === 'defence'
        ? 'defend'
        : ['CM', 'AM'].includes(player.primaryPosition)
          ? 'midfield'
          : 'attack';
  const signed = (value: number) =>
    `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value * 100))}%`;
  // Engine match-15 reports how hard it rains, blows or snows and the pitch's state, and the
  // two are separate factors; earlier sessions have one combined conditions effect.
  const intensity = state.match.weatherIntensity;
  const pitch =
    state.match.pitchState ??
    pitchStateFor(state.match.weather, state.match.pitchCondition, intensity);
  const effect = (sensitivity: 'technical' | 'direct') =>
    intensity
      ? weatherEffect(sensitivity, state.match.weather, intensity) +
        pitchEffect(sensitivity, state.match.weather, pitch, state.match.pitchCondition)
      : conditionsEffect(sensitivity, state.match.weather, state.match.pitchCondition);
  const technical = effect('technical');
  const direct = effect('direct');
  const weatherIcon = useMemo(
    () => renderWeather(state.match.weather, intensity ?? 'steady'),
    [state.match.weather, intensity],
  );
  const pitchIcon = useMemo(() => renderPitch(pitch), [pitch]);
  const kits = kitAppearance(setup.home, setup.away);
  const age = setup.season - player.birthSeason;
  const tactics = state.match.tactics;
  return (
    <div className="match-preview">
      <div className="match-preview-top">
        <section className="match-panel match-briefing" aria-labelledby="briefing-heading">
          {stake}
          <div className="match-briefing-player">
            <FootballerAvatar
              player={player}
              season={setup.season}
              home={setup.home}
              away={setup.away}
              className="match-briefing-avatar"
            />
            <div className="min-w-0 flex-1">
              <h2 id="briefing-heading" className="match-eyebrow">
                {u.beforeKickoff}
              </h2>
              <p className="match-briefing-name">
                <span>{player.name}</span>
                {state.captain && (
                  <span className="match-captain-chip">
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 9H20V15H4Z" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    {m.captain}
                  </span>
                )}
              </p>
              <p className="match-card-note">
                {matchFormat(u.footballerLine, {
                  position: player.primaryPosition,
                  age,
                  club: ownClub.name,
                })}
              </p>
            </div>
            <dl className="match-tiles is-pair">
              <div>
                <dt>{u.overall}</dt>
                <dd>{overallRating(player)}</dd>
              </div>
              <div>
                <dt>{u.fatigueTile}</dt>
                <dd>{Math.round(player.fatigue)}%</dd>
              </div>
            </dl>
          </div>
          <div className="match-conditions">
            <div className="is-weather">
              <Artwork svg={weatherIcon} alt="" className="h-9 w-9 shrink-0" />
              <div>
                <span>{m.weather}</span>
                <strong>
                  {intensity
                    ? m.weatherNames[intensity][state.match.weather]
                    : m[state.match.weather]}
                </strong>
              </div>
            </div>
            <div className="is-pitch">
              <Artwork svg={pitchIcon} alt={m.pitchStates[pitch]} className="h-9 w-9 shrink-0" />
              <div>
                <span>{m.pitch}</span>
                <strong>
                  {intensity
                    ? matchFormat(m.pitchLine, {
                        state: m.pitchNames[pitch],
                        value: state.match.pitchCondition,
                      })
                    : matchFormat(m.pitchValue, { value: state.match.pitchCondition })}
                </strong>
              </div>
            </div>
            <div className="is-effect">
              <Icon name="info" className="h-9 w-9 shrink-0" />
              <div>
                <span>{m.conditions}</span>
                <strong>
                  {technical || direct
                    ? [
                        technical
                          ? matchFormat(m.conditionsTechnical, { value: signed(technical) })
                          : '',
                        direct ? matchFormat(m.conditionsDirect, { value: signed(direct) }) : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : m.conditionsNeutral}
                </strong>
              </div>
            </div>
          </div>
          <div className="match-briefing-columns">
            <div>
              <h3>{m.instructions}</h3>
              <figure className="match-instructions">
                {managerSvg && manager && (
                  <Artwork svg={managerSvg} alt="" className="match-manager-face" />
                )}
                <div className="min-w-0">
                  <blockquote>“{matchLabel(`match.instructions.${instruction}`)}”</blockquote>
                  {manager && (
                    <figcaption>{matchFormat(u.managerLine, { name: manager.name })}</figcaption>
                  )}
                </div>
              </figure>
            </div>
            <div>
              <h3>{m.objectives}</h3>
              <ul className="match-objectives">
                {state.match.objectives.map((objective) => (
                  <li key={objective.id}>
                    <span className="match-objective-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24">
                        <path
                          d={OBJECTIVE_ICON[objective.kind]}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="flex-1">{m.objectiveNames[objective.kind]}</span>
                    <strong>
                      {objective.target}
                      {objective.kind === 'passing' ? '%' : ''}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
        <section
          className="match-panel match-approach"
          data-tour="tactics"
          aria-labelledby="approach-heading"
        >
          <h2 id="approach-heading" className="match-card-title is-display">
            {m.tactics}
          </h2>
          <Segments
            name="match-role"
            legend={m.role}
            hint={u.roleHint}
            value={tactics.role}
            columns={2}
            options={roleIds.map((role) => ({ value: role, label: m.roles[role] ?? role }))}
            onChange={(role) => onTactics({ ...tactics, role })}
          />
          <Segments
            name="match-risk"
            legend={m.risk}
            hint={u.riskHint}
            value={tactics.risk}
            columns={3}
            options={(['low', 'balanced', 'high'] as const).map((risk) => ({
              value: risk,
              label: m[risk],
            }))}
            onChange={(risk) => onTactics({ ...tactics, risk })}
          />
          <Segments
            name="match-mentality"
            legend={m.mentality}
            hint={u.mentalityHint}
            value={tactics.mentality}
            columns={3}
            options={(['defensive', 'balanced', 'attacking'] as const).map((mentality) => ({
              value: mentality,
              label: m[mentality],
            }))}
            onChange={(mentality) => onTactics({ ...tactics, mentality })}
          />
          <button
            type="button"
            className="button play button-lg match-kickoff"
            data-tour="kickoff"
            onClick={onKickoff}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 4L19 12L7 20Z" fill="currentColor" />
            </svg>
            {m.kickoff}
          </button>
          {/* On phones the tour's kick-off step appears here, in the page. */}
          <div data-tour-slot="kickoff" />
          <p className="match-card-note">{note ?? m.friendlyBody}</p>
          {onNewFixture && (
            <button
              type="button"
              className="button secondary match-new-fixture"
              onClick={onNewFixture}
            >
              <Icon name="arrow" className="h-4 w-4 -scale-x-100" />
              {m.newFixture}
            </button>
          )}
          {selection}
        </section>
      </div>
      <div className="match-lineups">
        {[setup.home, setup.away].map((club, index) => {
          const lineup = index === 0 ? state.match.home : state.match.away;
          // Earlier sessions fielded 4-3-3 in the same slot order.
          const posts = FORMATION_SLOTS[formationOf(lineup.formation)];
          const own = club.id === ownClub.id;
          return (
            <section key={club.id} className="match-panel" aria-label={club.name}>
              <div className="match-lineup-title">
                <ClubBadge club={club} />
                <div className="min-w-0 flex-1">
                  <span className="match-eyebrow">
                    {matchFormat(index === 0 ? u.homeClub : u.awayClub, {
                      formation: lineup.formation,
                    })}
                  </span>
                  <h2>{club.name}</h2>
                </div>
                <Chip tone={own ? 'gold-soft' : 'info'}>{own ? u.yourClub : u.opponent}</Chip>
              </div>
              <div className="match-lineup-body">
                <LineupPitch
                  club={club}
                  lineup={lineup}
                  colour={index === 0 ? kits.home : kits.away}
                  players={setup.players}
                  selectedId={player.id}
                />
                <div className="min-w-0 flex-1">
                  <h3>{m.lineup}</h3>
                  <ol className="match-lineup">
                    {lineup.starterIds.map((id, slot) => {
                      const starter = setup.players[id]!;
                      const position = posts[slot]?.position ?? starter.primaryPosition;
                      const fit = slotFit(starter, position);
                      return (
                        <li key={id} className={id === player.id ? 'selected' : ''}>
                          <span className="match-lineup-position">{position}</span>
                          <span className="match-lineup-number">
                            <span className="sr-only">{m.shirtNumber} </span>
                            {starter.squadNumber}
                          </span>
                          <strong>{starter.name}</strong>
                          {id === player.id && <small className="is-you">{m.selected}</small>}
                          {fit < 100 && (
                            <small>
                              {fit > 0 ? matchFormat(s.slot.secondary, { fit }) : s.slot.unfamiliar}
                            </small>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  <details className="match-bench">
                    <summary>
                      {m.bench} ({lineup.benchIds.length})
                      <Icon name="chevron" className="h-4 w-4" />
                    </summary>
                    <ul className="match-lineup">
                      {lineup.benchIds.map((id) => (
                        <li key={id}>
                          <span className="match-lineup-position">
                            {setup.players[id]!.primaryPosition}
                          </span>
                          <span className="match-lineup-number">
                            <span className="sr-only">{m.shirtNumber} </span>
                            {setup.players[id]!.squadNumber}
                          </span>
                          <span>{setup.players[id]!.name}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
