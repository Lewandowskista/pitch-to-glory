import type { Club, MatchReport } from '../../model/domain';
import { pitchCopy as copy } from '../../i18n/pitch';

// Shared by the SVG fallback and GPU scene; importing this does not load Pixi.
// Luminance and blue separation avoid relying on red/green differences alone.
export function kitAppearance(home: Club, away: Club) {
  const rgb = (hex: string) =>
    [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const first = rgb(home.kits.home.colors[0]);
  const luminance = (c: number[]) => c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722;
  const contrast = (hex: string) => {
    const second = rgb(hex);
    return (
      Math.abs(luminance(first) - luminance(second)) * 2 + Math.abs(first[2]! - second[2]!) * 0.3
    );
  };
  const options = [away.kits.away, away.kits.third, away.kits.home];
  const best = [...options].sort((a, b) => contrast(b.colors[0]) - contrast(a.colors[0]))[0]!;
  return { home: home.kits.home.colors[0], away: best.colors[0] };
}

export function PitchMarkings() {
  return (
    <g fill="none" stroke="#d5e8cc" strokeWidth="0.45" opacity="0.8">
      <rect x="8" y="8" width="100" height="64" />
      <path d="M58 8V72" />
      <circle cx="58" cy="40" r="9.15" />
      <rect x="8" y="20" width="16.5" height="40" />
      <rect x="91.5" y="20" width="16.5" height="40" />
      <rect x="8" y="30.5" width="5.5" height="19" />
      <rect x="102.5" y="30.5" width="5.5" height="19" />
      <rect x="5" y="35.8" width="3" height="8.4" />
      <rect x="108" y="35.8" width="3" height="8.4" />
      <circle cx="19" cy="40" r="0.5" />
      <circle cx="97" cy="40" r="0.5" />
      <circle cx="58" cy="40" r="0.5" />
      <path d="M24.5 32.69A9.15 9.15 0 0 1 24.5 47.31M91.5 32.69A9.15 9.15 0 0 0 91.5 47.31" />
    </g>
  );
}

const x = (value: number) => 8 + Math.max(0, Math.min(100, value));
const y = (value: number) => 8 + Math.max(0, Math.min(100, value)) * 0.64;

export default function MatchMaps({ report }: { report: MatchReport }) {
  const cells = Array.from({ length: 80 }, () => 0);
  for (const point of report.heatmap) {
    const column = Math.min(9, Math.max(0, Math.floor(point.x / 10)));
    const row = Math.min(7, Math.max(0, Math.floor(point.y / 12.5)));
    cells[row * 10 + column]!++;
  }
  const maximum = Math.max(1, ...cells);
  const background = (
    <>
      <rect width="116" height="80" rx="3" fill="#1e563b" />
      <PitchMarkings />
    </>
  );
  return (
    <div
      className="match-maps"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))',
        gap: '1rem',
      }}
    >
      <figure style={{ margin: 0 }}>
        <figcaption>
          <strong>{copy.heatmap}</strong>
        </figcaption>
        <svg
          viewBox="0 0 116 80"
          role="img"
          aria-label={`${copy.heatmap}: ${report.heatmap.length} ${copy.samples}`}
          style={{ width: '100%', display: 'block', marginTop: '0.5rem' }}
        >
          {background}
          {cells.map(
            (count, index) =>
              count > 0 && (
                <rect
                  key={index}
                  x={8 + (index % 10) * 10}
                  y={8 + Math.floor(index / 10) * 8}
                  width="10"
                  height="8"
                  fill="#ffe58e"
                  opacity={0.15 + (count / maximum) * 0.65}
                >
                  <title>
                    {count} {copy.samples}
                  </title>
                </rect>
              ),
          )}
          <PitchMarkings />
        </svg>
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          {report.heatmap.length ? copy.density : copy.noMovement}
        </p>
      </figure>
      <figure style={{ margin: 0 }}>
        <figcaption>
          <strong>{copy.passes}</strong>
        </figcaption>
        <svg
          viewBox="0 0 116 80"
          role="img"
          aria-label={`${copy.passes}: ${report.passes.length} ${copy.attempts}`}
          style={{ width: '100%', display: 'block', marginTop: '0.5rem' }}
        >
          {background}
          {report.passes.map((pass, index) => (
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
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          {report.passes.length
            ? `${report.passes.filter((pass) => pass.success).length}/${report.passes.length} ${copy.completed}. ${copy.passLegend}`
            : copy.noPasses}
        </p>
      </figure>
      <figure style={{ margin: 0 }}>
        <figcaption>
          <strong>{copy.shots}</strong>
        </figcaption>
        <svg
          viewBox="0 0 116 80"
          role="img"
          aria-label={`${copy.shots}: ${report.shots.length} ${copy.attempts}`}
          style={{ width: '100%', display: 'block', marginTop: '0.5rem' }}
        >
          {background}
          {report.shots.map((shot, index) => (
            <g key={index} stroke={shot.goal ? '#ffe58e' : '#ffffff'} fill="none">
              <line
                x1={x(shot.from.x)}
                y1={y(shot.from.y)}
                x2={x(shot.to.x)}
                y2={y(shot.to.y)}
                strokeWidth="0.6"
                opacity="0.6"
              />
              {shot.goal ? (
                <path
                  transform={`translate(${x(shot.from.x)} ${y(shot.from.y)})`}
                  d="M0 -2L.6 -.6L2 -.6L.9 .4L1.4 2L0 1L-1.4 2L-.9 .4L-2 -.6L-.6 -.6Z"
                  fill="#ffe58e"
                  strokeWidth="0.3"
                />
              ) : (
                <circle cx={x(shot.from.x)} cy={y(shot.from.y)} r="1.5" strokeWidth="0.6" />
              )}
            </g>
          ))}
        </svg>
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          {report.shots.length
            ? `${report.shots.filter((shot) => shot.goal).length}/${report.shots.length} ${copy.scored}. ${copy.shotLegend}`
            : copy.noShots}
        </p>
      </figure>
    </div>
  );
}
