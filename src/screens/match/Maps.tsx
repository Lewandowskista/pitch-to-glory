import type { Club, MatchEvent, MatchReport, Point } from '../../model/domain';
import { chooseMatchKits } from '../../engine/assets/clash';
import { pitchCopy as copy } from '../../i18n/pitch';
import { matchFormat } from '../../i18n/match';
import { pitchArt } from './pitchArt';
import { HEAT_COLUMNS, HEAT_ROWS, attacksRightAt } from '../../engine/match';

/**
 * Token colours for a match, shared by the SVG fallback and GPU scene (importing this does
 * not load Pixi). The away kit is chosen to be distinct for colour-blind viewers too; when no
 * kit is, `clash` adds a second marker to away tokens.
 */
export function kitAppearance(home: Club, away: Club) {
  const kits = chooseMatchKits(home, away);
  return { home: kits.home.colors[0], away: kits.away.colors[0], clash: kits.clash };
}

export function PitchMarkings() {
  return (
    <g fill="none" stroke={pitchArt.line} strokeWidth="0.32" opacity={pitchArt.lineAlpha}>
      <rect x="8" y="8" width="100" height="64" />
      <path d="M58 8V72" />
      <circle cx="58" cy="40" r="9.15" />
      <rect x="8" y="20" width="16.5" height="40" />
      <rect x="91.5" y="20" width="16.5" height="40" />
      <rect x="8" y="30.5" width="5.5" height="19" />
      <rect x="102.5" y="30.5" width="5.5" height="19" />
      <rect x="5" y="35.8" width="3" height="8.4" fill="#ffffff" fillOpacity=".16" />
      <rect x="108" y="35.8" width="3" height="8.4" fill="#ffffff" fillOpacity=".16" />
      <path d="M9 8A1 1 0 0 1 8 9M108 9A1 1 0 0 1 107 8M107 72A1 1 0 0 1 108 71M8 71A1 1 0 0 1 9 72" />
      <circle cx="19" cy="40" r="0.5" />
      <circle cx="97" cy="40" r="0.5" />
      <circle cx="58" cy="40" r="0.5" />
      <path d="M24.5 32.69A9.15 9.15 0 0 1 24.5 47.31M91.5 32.69A9.15 9.15 0 0 0 91.5 47.31" />
    </g>
  );
}

const x = (value: number) => 8 + Math.max(0, Math.min(100, value));
const y = (value: number) => 8 + Math.max(0, Math.min(100, value)) * 0.64;
const MAP_GREEN = '#1e563b';
const flip = (point: Point): Point => ({ x: 100 - point.x, y: 100 - point.y });

/**
 * The report's passes and shots turned so your team attacks left to right in both halves
 * (like the heat grid), with each shot's chance of a goal. The report keeps raw points; the
 * player's events, in the same order, carry the minute that says which way they attacked.
 */
function oriented(
  report: MatchReport,
  events: readonly MatchEvent[] | undefined,
  side: 0 | 1 | null,
) {
  const own = events?.filter((event) => event.playerId === report.playerId) ?? [];
  const passEvents = own.filter((event) => event.kind === 'pass');
  const shotEvents = own.filter((event) => event.kind === 'shot');
  const turn = (minute: number | undefined) =>
    side !== null && minute !== undefined && !attacksRightAt(side, minute);
  const passes =
    passEvents.length === report.passes.length
      ? report.passes.map((pass, index) =>
          turn(passEvents[index]!.minute)
            ? { ...pass, from: flip(pass.from), to: flip(pass.to) }
            : pass,
        )
      : report.passes;
  const shots =
    shotEvents.length === report.shots.length
      ? report.shots.map((shot, index) => ({
          ...(turn(shotEvents[index]!.minute)
            ? { ...shot, from: flip(shot.from), to: flip(shot.to) }
            : shot),
          xg: shotEvents[index]!.xg,
        }))
      : report.shots.map((shot) => ({ ...shot, xg: undefined as number | undefined }));
  return { passes, shots, turned: side !== null && passEvents.length === report.passes.length };
}

/**
 * "Your match, mapped" (redesign phase 5b, M10): where you spent your time (the engine's
 * heat grid), your passes (completed solid, incomplete dashed) and your shots (a gold star for
 * a goal, circles sized by the chance), all with your team attacking left to right.
 */
export default function MatchMaps({
  report,
  heat,
  events,
  side = null,
  team,
}: {
  report: MatchReport;
  /** Time in each heat cell (engine match-14); older sessions fall back to minute samples. */
  heat?: readonly number[];
  /** The match's events, to turn passes and shots to one attacking direction. */
  events?: readonly MatchEvent[];
  /** The selected player's side (0 home, 1 away). */
  side?: 0 | 1 | null;
  /** Your club's name, for the attacking-direction note. */
  team?: string;
}) {
  const timed = heat && heat.length === HEAT_COLUMNS * HEAT_ROWS && heat.some((ms) => ms > 0);
  const columns = timed ? HEAT_COLUMNS : 10,
    rows = timed ? HEAT_ROWS : 8;
  const cells = timed ? [...heat] : Array.from({ length: 80 }, () => 0);
  if (!timed)
    for (const point of report.heatmap) {
      const column = Math.min(9, Math.max(0, Math.floor(point.x / 10)));
      const row = Math.min(7, Math.max(0, Math.floor(point.y / 12.5)));
      cells[row * 10 + column]!++;
    }
  const maximum = Math.max(1, ...cells);
  const seconds = timed ? Math.round(cells.reduce((sum, ms) => sum + ms, 0) / 1000) : 0;
  const width = 100 / columns,
    height = 64 / rows;
  const { passes, shots } = oriented(report, events, side);
  const completed = passes.filter((pass) => pass.success).length;
  const scored = shots.filter((shot) => shot.goal).length;
  const background = (
    <>
      <rect width="116" height="80" fill={MAP_GREEN} />
      <PitchMarkings />
    </>
  );
  return (
    <div className="match-maps">
      <figure>
        <figcaption>{copy.heatmap}</figcaption>
        <svg
          viewBox="0 0 116 80"
          role="img"
          aria-label={
            timed
              ? `${copy.heatmap}: ${seconds} ${copy.seconds}`
              : `${copy.heatmap}: ${report.heatmap.length} ${copy.samples}`
          }
        >
          <rect width="116" height="80" fill={MAP_GREEN} />
          {cells.map(
            (count, index) =>
              count > 0 && (
                <rect
                  key={index}
                  x={8 + (index % columns) * width}
                  y={8 + Math.floor(index / columns) * height}
                  width={width}
                  height={height}
                  fill={pitchArt.gold}
                  opacity={0.15 + (count / maximum) * 0.65}
                >
                  <title>
                    {timed ? Math.round(count / 1000) : count} {timed ? copy.seconds : copy.samples}
                  </title>
                </rect>
              ),
          )}
          <PitchMarkings />
          {timed && (
            <path
              d="M52 76H64M61 74L64 76L61 78"
              fill="none"
              stroke="#ffffff"
              strokeWidth=".5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity=".8"
            />
          )}
        </svg>
        <p className="match-map-legend">
          <svg width="48" height="14" viewBox="0 0 48 14" aria-hidden="true">
            <rect width="48" height="14" fill={MAP_GREEN} />
            <rect x="3" y="2" width="13" height="10" fill={pitchArt.gold} opacity="0.2" />
            <rect x="17.5" y="2" width="13" height="10" fill={pitchArt.gold} opacity="0.5" />
            <rect x="32" y="2" width="13" height="10" fill={pitchArt.gold} opacity="0.8" />
          </svg>
          <span>
            {timed
              ? team
                ? `${copy.heatTime} ${matchFormat(copy.heatDirection, { club: team })}`
                : copy.timeDensity
              : report.heatmap.length
                ? copy.density
                : copy.noMovement}
          </span>
        </p>
      </figure>
      <figure>
        <figcaption>{copy.passes}</figcaption>
        <svg
          viewBox="0 0 116 80"
          role="img"
          aria-label={`${copy.passes}: ${passes.length} ${copy.attempts}, ${completed} ${copy.completed}`}
        >
          {background}
          {passes.map((pass, index) => (
            <g
              key={index}
              stroke={pass.success ? '#8bdbff' : '#ff9c8b'}
              fill={pass.success ? '#8bdbff' : '#ff9c8b'}
            >
              <line
                x1={x(pass.from.x)}
                y1={y(pass.from.y)}
                x2={x(pass.to.x)}
                y2={y(pass.to.y)}
                strokeWidth="0.7"
                strokeDasharray={pass.success ? undefined : '2 1'}
              />
              <circle cx={x(pass.from.x)} cy={y(pass.from.y)} r="0.6" />
              <path
                d={`M${x(pass.to.x) - 0.8} ${y(pass.to.y) - 0.8}l1.6 1.6m-1.6 0l1.6 -1.6`}
                strokeWidth="0.6"
              />
            </g>
          ))}
        </svg>
        <p className="match-map-legend">
          <span className="match-map-key">
            <svg width="30" height="14" viewBox="0 0 30 14" aria-hidden="true">
              <rect width="30" height="14" fill={MAP_GREEN} />
              <path d="M3 7H27" stroke="#8bdbff" strokeWidth="2.5" />
            </svg>
            {copy.completedLegend}
          </span>
          <span className="match-map-key">
            <svg width="30" height="14" viewBox="0 0 30 14" aria-hidden="true">
              <rect width="30" height="14" fill={MAP_GREEN} />
              <path d="M3 7H27" stroke="#ff9c8b" strokeWidth="2.5" strokeDasharray="5 3" />
            </svg>
            {copy.incompleteLegend}
          </span>
          <span>
            {passes.length ? (
              <>
                <strong>
                  {completed}/{passes.length} {copy.completed}.
                </strong>{' '}
                {copy.passLegend}
              </>
            ) : (
              copy.noPasses
            )}
          </span>
        </p>
      </figure>
      <figure>
        <figcaption>{copy.shots}</figcaption>
        <svg
          viewBox="0 0 116 80"
          role="img"
          aria-label={`${copy.shots}: ${shots.length} ${copy.attempts}, ${scored} ${copy.scored}`}
        >
          {background}
          {shots.map((shot, index) => {
            const r = 1.1 + Math.sqrt(Math.max(0, Math.min(1, shot.xg ?? 0.12))) * 2.4;
            return (
              <g key={index}>
                <line
                  x1={x(shot.from.x)}
                  y1={y(shot.from.y)}
                  x2={x(shot.to.x)}
                  y2={y(shot.to.y)}
                  stroke={shot.goal ? pitchArt.gold : '#ffffff'}
                  strokeWidth="0.6"
                  opacity="0.6"
                />
                {shot.goal ? (
                  <path
                    transform={`translate(${x(shot.from.x)} ${y(shot.from.y)})`}
                    d="M0 -2.6L0.8 -0.8L2.6 -0.8L1.2 0.5L1.8 2.6L0 1.3L-1.8 2.6L-1.2 0.5L-2.6 -0.8L-0.8 -0.8Z"
                    fill={pitchArt.gold}
                    stroke="#14251e"
                    strokeWidth="0.3"
                  />
                ) : (
                  <circle
                    cx={x(shot.from.x)}
                    cy={y(shot.from.y)}
                    r={r}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="0.6"
                  />
                )}
              </g>
            );
          })}
        </svg>
        <p className="match-map-legend">
          <span className="match-map-key">
            <svg width="14" height="14" viewBox="-3 -3 6 6" aria-hidden="true">
              <path
                d="M0 -2.6L0.8 -0.8L2.6 -0.8L1.2 0.5L1.8 2.6L0 1.3L-1.8 2.6L-1.2 0.5L-2.6 -0.8L-0.8 -0.8Z"
                fill={pitchArt.gold}
                stroke="#9a7612"
                strokeWidth="0.4"
              />
            </svg>
            {copy.goalLegend}
          </span>
          <span className="match-map-key">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            {copy.otherShotLegend}
          </span>
          <span>
            {shots.length ? (
              <>
                <strong>
                  {scored}/{shots.length} {copy.scored}.
                </strong>{' '}
                {copy.shotLegend} {copy.shotSizes}
              </>
            ) : (
              copy.noShots
            )}
          </span>
        </p>
      </figure>
    </div>
  );
}
