import { useEffect, useMemo, useRef, useState } from 'react';
import type { Point, ReplayFrame } from '../../model/domain';
import type { MatchSetup } from '../../engine/match';
import { matchFormat, matchText } from '../../i18n/match';
import { kitAppearance } from './Maps';
import { kitNumberColor, pitchArt, shirtNumber } from './pitchArt';
import { useSvgPlayback } from './useSvgPlayback';
import {
  surname,
  toCam,
  type CamArrow,
  type CamWindow,
  type CastMember,
  type CastRole,
} from './cam';

const u = matchText.ui;
/** Arrow and badge colours by choice number, as on the approved camera. */
const ARROW_COLOURS = ['#efcf63', '#ffffff', '#9ed9b7', '#ffd2b0'];
/** Replays play slower than live passages, like the decision passages on the live pitch. */
const REPLAY_RATE = 6;
const REPLAY_MAX_MS = 4200;

export type CamView = 'final' | 'middle' | 'defensive' | 'replay';

/** A cast member's label: the surname, with "(You)", "(free)" where it matters. */
function labelOf(name: string, role: CastRole) {
  const short = surname(name);
  return role === 'you'
    ? matchFormat(u.camYou, { name: short })
    : role === 'free'
      ? matchFormat(u.camFree, { name: short })
      : short;
}
/** The spoken form, which also names the presser and the keeper. */
function spokenOf(name: string, role: CastRole) {
  const short = surname(name);
  return role === 'press'
    ? matchFormat(u.camPress, { name: short })
    : role === 'keeper'
      ? matchFormat(u.camKeeper, { name: short })
      : labelOf(name, role);
}

/** Token and label size in the drawing: larger on narrow screens so names stay readable. */
function useDrawingScale(widthDm: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const resize = () => {
      const width = element.clientWidth || widthDm;
      setScale(Math.max(1, Math.min(2, widthDm / width)));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, [widthDm]);
  return { ref, scale };
}

/**
 * The tactical camera (redesign phase 5b): the key moment on a vertical pitch with your team
 * attacking north, framed on one third and showing only the players involved, each labelled
 * with a name and squad number. Arrows show choices whose target is known. Given `replay`, it
 * plays those keyframes in the same framing (the decision as it happened).
 */
export function TacticalCam({
  setup,
  frame,
  replay,
  cast,
  arrows = [],
  window,
  attacksRight,
  view,
  numbers,
  reducedMotion,
  compact = false,
}: {
  setup: Pick<MatchSetup, 'home' | 'away' | 'players' | 'selectedPlayerId'>;
  /** The moment's frame: what is shown first, and where a replay starts from. */
  frame: ReplayFrame;
  replay?: readonly ReplayFrame[] | null;
  cast: readonly CastMember[];
  arrows?: readonly CamArrow[];
  window: CamWindow;
  attacksRight: boolean;
  view: CamView;
  numbers: Readonly<Record<string, number>>;
  reducedMotion: boolean;
  /** Phones: no north chip, a tighter crop is chosen by the caller. */
  compact?: boolean;
}) {
  const kits = kitAppearance(setup.home, setup.away);
  // A replay starts from the frame on screen: mount on the moment, then play.
  const [started, setStarted] = useState(false);
  useEffect(() => setStarted(Boolean(replay?.length)), [replay]);
  const playing = started && replay && replay.length > 1 ? (replay as ReplayFrame[]) : null;
  const last = playing ? playing[playing.length - 1]! : frame;
  const sample = useSvgPlayback(last, playing, REPLAY_RATE, REPLAY_MAX_MS, reducedMotion, false);
  const [, , widthDm] = window.viewBox.split(' ').map(Number) as [number, number, number];
  const { ref, scale: drawing } = useDrawingScale(widthDm);
  // Tokens grow a little on narrow screens, names a little more, so both stay readable.
  const scale = Math.min(1.35, drawing);
  const labelScale = Math.min(1.8, drawing);
  const positions = useMemo(() => {
    const shown = new Map<string, Point>();
    const source = sample ? null : last;
    if (sample) for (const [id, point] of sample.players) shown.set(id, toCam(point, attacksRight));
    else
      for (const player of source!.players) shown.set(player.id, toCam(player.point, attacksRight));
    return shown;
  }, [sample, last, attacksRight]);
  // A carried ball sits just ahead of the carrier's feet, clear of the shirt number.
  const carrierId = sample ? sample.carrierId : (last.carrierId ?? null);
  const carrier = carrierId ? positions.get(carrierId) : undefined;
  const ownSide = setup.home.playerIds.includes(setup.selectedPlayerId) ? setup.home : setup.away;
  const ball = carrier
    ? { x: carrier.x, y: carrier.y + (ownSide.playerIds.includes(carrierId!) ? -2.4 : 2.4) * scale }
    : toCam(sample ? sample.ball : last.ball, attacksRight);
  const index = new Map(frame.players.map((player, i) => [player.id, i]));
  const members = cast
    .map((member) => ({ ...member, at: positions.get(member.id) }))
    .filter((member): member is CastMember & { at: Point } => Boolean(member.at))
    // You are drawn last, on top.
    .sort((a, b) => Number(a.role === 'you') - Number(b.role === 'you'));
  const title = matchFormat(u.cam, { view: u.camViews[view] });
  const spoken = matchFormat(u.camLabel, {
    title,
    players: cast
      .map((member) => {
        const player = setup.players[member.id];
        return player ? spokenOf(player.name, member.role) : '';
      })
      .filter(Boolean)
      .join(', '),
  });
  const zone = window.zone;
  const d = (value: number) => value * 10;
  const token = 14 * scale;
  // Names sit under their tokens; one that would overlap a name already placed moves down.
  const labels = new Map<string, { text: string; y: number; width: number }>();
  const placed: { left: number; right: number; top: number; bottom: number }[] = [];
  for (const member of [...members].sort((a, b) => a.at.y - b.at.y)) {
    const player = setup.players[member.id];
    if (!player) continue;
    const text = labelOf(player.name, member.role);
    const width = (text.length * 6.6 + 16) * labelScale;
    const height = 19 * labelScale;
    const x = d(member.at.x);
    let y = d(member.at.y) + token + 6 * scale;
    for (
      let tries = 0;
      tries < 6 &&
      placed.some(
        (box) =>
          x - width / 2 < box.right &&
          x + width / 2 > box.left &&
          y < box.bottom &&
          y + height > box.top,
      );
      tries++
    )
      y += height + 2;
    placed.push({ left: x - width / 2, right: x + width / 2, top: y, bottom: y + height });
    labels.set(member.id, { text, y, width });
  }
  return (
    <div ref={ref} className="match-cam" data-zone={zone}>
      <svg viewBox={window.viewBox} role="img" aria-label={spoken} className="block h-auto w-full">
        <rect x="-80" y="-120" width="840" height="1300" fill={pitchArt.grass} />
        {Array.from({ length: 12 }, (_, band) => (
          <rect
            key={band}
            x="-80"
            y={-100 + band * 100}
            width="840"
            height="50"
            fill={pitchArt.stripes[1]}
          />
        ))}
        <g fill="none" stroke="#ffffff" strokeOpacity={pitchArt.lineAlpha} strokeWidth="3">
          <rect x="0" y="0" width="680" height="1050" />
          <path d="M0 525H680" />
          <circle cx="340" cy="525" r="91.5" />
          <path d="M138.4 0V165H541.6V0M248.4 0V55H431.6V0M267 165A91.5 91.5 0 0 0 413 165" />
          <path d="M138.4 1050V885H541.6V1050M248.4 1050V995H431.6V1050M267 885A91.5 91.5 0 0 1 413 885" />
        </g>
        <g fill="#ffffff" fillOpacity={pitchArt.lineAlpha}>
          <circle cx="340" cy="525" r="4" />
          <circle cx="340" cy="110" r="4" />
          <circle cx="340" cy="940" r="4" />
        </g>
        <rect
          x="303.4"
          y="-22"
          width="73.2"
          height="22"
          fill="#ffffff"
          fillOpacity="0.16"
          stroke="#ffffff"
          strokeWidth="3"
        />
        <rect
          x="303.4"
          y="1050"
          width="73.2"
          height="22"
          fill="#ffffff"
          fillOpacity="0.16"
          stroke="#ffffff"
          strokeWidth="3"
        />
        {!playing &&
          arrows.map((arrow) => {
            const from = { x: d(arrow.from.x), y: d(arrow.from.y) };
            const to = { x: d(arrow.to.x), y: d(arrow.to.y) };
            const dx = to.x - from.x,
              dy = to.y - from.y;
            const length = Math.hypot(dx, dy) || 1;
            const bend = (arrow.number % 2 ? -1 : 1) * Math.min(60, length * 0.12);
            const c = {
              x: (from.x + to.x) / 2 + (-dy / length) * bend,
              y: (from.y + to.y) / 2 + (dx / length) * bend,
            };
            const ex = to.x - c.x,
              ey = to.y - c.y;
            const el = Math.hypot(ex, ey) || 1;
            const [ux, uy] = [ex / el, ey / el];
            const head = `M${to.x} ${to.y}L${to.x - ux * 16 + -uy * 8} ${to.y - uy * 16 + ux * 8}L${to.x - ux * 16 - -uy * 8} ${to.y - uy * 16 - ux * 8}Z`;
            const t = 0.62,
              v = 1 - t;
            const badge = {
              x: v * v * from.x + 2 * v * t * c.x + t * t * to.x,
              y: v * v * from.y + 2 * v * t * c.y + t * t * to.y,
            };
            const colour = ARROW_COLOURS[(arrow.number - 1) % ARROW_COLOURS.length]!;
            return (
              <g key={arrow.number} aria-hidden="true">
                <path
                  d={`M${from.x} ${from.y}Q${c.x} ${c.y} ${to.x} ${to.y}`}
                  fill="none"
                  stroke={colour}
                  strokeWidth={4}
                  strokeDasharray="12 9"
                  strokeLinecap="round"
                />
                <path d={head} fill={colour} />
                <circle
                  cx={badge.x}
                  cy={badge.y}
                  r={13 * scale}
                  fill={colour}
                  stroke="#14251e"
                  strokeWidth="2"
                />
                <text
                  x={badge.x}
                  y={badge.y}
                  dy={4.5 * scale}
                  textAnchor="middle"
                  fontSize={13 * scale}
                  fontWeight="800"
                  fill="#153c2d"
                >
                  {arrow.number}
                </text>
                {arrow.post && (
                  <g>
                    <rect
                      x={to.x - 46 * scale}
                      y={to.y - 40 * scale}
                      width={92 * scale}
                      height={22 * scale}
                      rx={6 * scale}
                      fill={pitchArt.gold}
                    />
                    <text
                      x={to.x}
                      y={to.y - 25 * scale}
                      textAnchor="middle"
                      fontSize={12 * scale}
                      fontWeight="800"
                      fill="#153c2d"
                    >
                      {u.camPosts[arrow.post]}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        {members.map((member) => {
          const player = setup.players[member.id];
          if (!player) return null;
          const home = setup.home.playerIds.includes(member.id);
          const colour = home ? kits.home : kits.away;
          const ink = kitNumberColor(colour);
          const you = member.role === 'you';
          const label = labels.get(member.id);
          if (!label) return null;
          const x = d(member.at.x),
            y = d(member.at.y);
          return (
            <g key={member.id} aria-hidden="true">
              {you && (
                <circle cx={x} cy={y} r={27 * scale} fill={pitchArt.gold} fillOpacity="0.32" />
              )}
              {member.role === 'press' && (
                <circle
                  cx={x}
                  cy={y}
                  r={21 * scale}
                  fill="none"
                  stroke="#ffada5"
                  strokeWidth={3}
                  strokeDasharray="5 5"
                />
              )}
              {!home && !you && (
                <circle
                  cx={x}
                  cy={y}
                  r={token + 4 * scale}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={token}
                fill={colour}
                stroke={you ? pitchArt.gold : '#102c26'}
                strokeWidth={you ? 4 : 2.5}
              />
              <text
                x={x}
                y={y}
                dy={4.5 * scale}
                textAnchor="middle"
                fontSize={13 * scale}
                fontWeight="800"
                fill={ink}
              >
                {shirtNumber(numbers, member.id, index.get(member.id) ?? 1)}
              </text>
              <rect
                x={x - label.width / 2}
                y={label.y}
                width={label.width}
                height={19 * labelScale}
                rx={9.5 * labelScale}
                fill={
                  you ? pitchArt.night : member.role === 'press' ? '#a72d30' : 'rgba(20,37,30,0.86)'
                }
                stroke={you ? pitchArt.gold : 'none'}
                strokeWidth="1.5"
              />
              <text
                x={x}
                y={label.y + 13.5 * labelScale}
                textAnchor="middle"
                fontSize={11 * labelScale}
                fontWeight="700"
                fill={member.role === 'free' ? pitchArt.gold : '#ffffff'}
              >
                {label.text}
              </text>
            </g>
          );
        })}
        <circle
          cx={d(ball.x)}
          cy={d(ball.y) - (sample?.height ?? 0) * 40}
          r={7 * scale}
          fill="#ffffff"
          stroke="#14251e"
          strokeWidth="2.5"
          aria-hidden="true"
        />
      </svg>
      <div className="match-cam-chips" aria-hidden="true" hidden={compact}>
        <span className="match-cam-chip">
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path
              d="M3 8H15V17H3ZM15 11L21 8V17L15 14"
              fill="none"
              stroke={pitchArt.gold}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          {title}
        </span>
        {!compact && <span className="match-cam-chip is-quiet">{u.camNorth}</span>}
      </div>
      <div className="match-cam-zone" aria-hidden="true">
        <span className="match-cam-zone-strip">
          {(['final', 'middle', 'defensive'] as const).map((part) => (
            <span key={part} className={part === zone ? 'is-on' : undefined} />
          ))}
        </span>
        {u.camZones[zone]}
      </div>
    </div>
  );
}
