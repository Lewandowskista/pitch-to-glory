// Pixi's no-eval shader and uniform code, so the clips run under the strict Content Security
// Policy (no 'unsafe-eval'); see public/_headers.
import 'pixi.js/unsafe-eval';
// Only what the clips draw with: the WebGL renderer, containers, graphics and text. Pixi's
// Application would bring renderer auto-detection (WebGPU and canvas chunks); without WebGL
// the reel draws its SVG stills instead.
import { Container, Graphics, Text, Ticker, UPDATE_PRIORITY, WebGLRenderer } from 'pixi.js';
import type { Club, Point } from '../../../model/domain';
import { kitAppearance } from '../pitchKit';
import { kitNumberColor, pitchArt } from '../pitchArt';
import { pitchQuality } from '../pitchQuality';
import { samplePlayback } from '../playback';
import type { CamArrow } from '../cam';
import type { ClipCast, ClipMember } from './cast';
import type { ClipTimeline } from './timeline';
import { TRAIL_FRAMES } from './timeline';
import {
  ARROW_COLOURS,
  badgePoint,
  BALL_PX,
  GHOST_ALPHA,
  GHOST_PX,
  PITCH_LENGTH_M,
  PITCH_WIDTH_M,
  TOKEN_PX,
  cameraTarget,
  clampCamera,
  follow,
  toClip,
  toStage,
  viewSize,
} from './geometry';

/*
 * The clip renderer (docs/EXPERIENCE-REDESIGN-1.0.md §1.3): one step of a chain, or a goal,
 * drawn from the passage's keyframes and filtered to its cast. A camera framing about 30 × 35 m
 * follows the ball; the pitch is vertical in portrait (the player's team attacking up) and
 * horizontal in landscape. Its ticker runs only while something moves: it stops when a clip has
 * played and its camera settled, while a decision card waits, and while the tab is hidden. No
 * React state changes per frame; the screen hands it one clip at a time.
 */

export interface ClipSpec {
  key: string;
  timeline: ClipTimeline;
  /** Whether the player's team attacks towards engine x = 100 in this clip's minute. */
  attacksRight: boolean;
  cast: ClipCast;
  /** Numbered choice arrows, drawn while the step waits for a decision. */
  arrows: readonly CamArrow[];
  deciding: boolean;
  /** Draw the shot's path once it is struck. */
  shotPath: boolean;
  /** A goal: a small camera shake and confetti in the scorer's colours at the strike. */
  goal: 0 | 1 | null;
  /** Start at the end (a restored match, or a still). */
  atEnd?: boolean;
  /** How far the camera leans from the ball towards the player (0 for a goal without them). */
  lean?: number;
}
export interface ClipScene {
  play(spec: ClipSpec): void;
  /** Jump to the clip's last frame (tap to skip to the outcome). */
  skip(): void;
  setArrows(arrows: readonly CamArrow[], deciding: boolean): void;
  setVertical(vertical: boolean): void;
  setReduced(reduced: boolean): void;
  /** Nothing to show: the ticker stops and the stage clears. */
  idle(): void;
  destroy(): void;
}
export interface ClipSceneOptions {
  home: Club;
  away: Club;
  selectedPlayerId: string;
  vertical: boolean;
  reduced: boolean;
  youLabel: string;
  unavailable: () => void;
}

/** A WebGL renderer, a stage and a stopped ticker that renders the stage after each update. */
async function createStage(options: {
  width: number;
  height: number;
  background: string;
  antialias: boolean;
  resolution: number;
}) {
  const renderer = new WebGLRenderer();
  try {
    await renderer.init({ ...options, autoDensity: true, manageImports: false });
  } catch (error) {
    try {
      renderer.destroy();
    } catch {
      // Nothing more to release.
    }
    throw error;
  }
  const stage = new Container();
  const ticker = new Ticker();
  ticker.autoStart = false;
  const render = () => renderer.render(stage);
  ticker.add(render, undefined, UPDATE_PRIORITY.LOW);
  return { renderer, stage, ticker, render };
}

const LINE = { color: pitchArt.line, width: 0.14, alpha: pitchArt.lineAlpha };
/** The whole pitch in clip metres, the attacked goal at y = 0. */
function drawPitch(): Graphics {
  const g = new Graphics().rect(-12, -12, PITCH_WIDTH_M + 24, PITCH_LENGTH_M + 24);
  g.fill(pitchArt.grass);
  for (let band = 0; band < 12; band += 2)
    g.rect(-12, band * 10.5 - 6, PITCH_WIDTH_M + 24, 10.5).fill(pitchArt.stripes[1]);
  const w = PITCH_WIDTH_M,
    l = PITCH_LENGTH_M;
  g.rect(0, 0, w, l).stroke(LINE);
  g.moveTo(0, l / 2)
    .lineTo(w, l / 2)
    .stroke(LINE);
  g.circle(w / 2, l / 2, 9.15).stroke(LINE);
  for (const end of [0, 1]) {
    const y = (d: number) => (end ? l - d : d);
    const box = (half: number, depth: number) =>
      g
        .moveTo(w / 2 - half, y(0))
        .lineTo(w / 2 - half, y(depth))
        .lineTo(w / 2 + half, y(depth))
        .lineTo(w / 2 + half, y(0))
        .stroke(LINE);
    box(20.16, 16.5);
    box(9.16, 5.5);
    g.circle(w / 2, y(11), 0.25).fill({ color: '#ffffff', alpha: pitchArt.lineAlpha });
    // The arc of the area.
    const start = end ? Math.PI + 0.93 : 0.93;
    g.moveTo(w / 2 + Math.cos(start) * 9.15, y(11) + Math.sin(start) * 9.15)
      .arc(w / 2, y(11), 9.15, start, start + Math.PI - 1.86)
      .stroke(LINE);
    // The goal.
    g.rect(w / 2 - 3.66, end ? l : -2, 7.32, 2)
      .fill({ color: '#ffffff', alpha: 0.18 })
      .stroke({ color: '#ffffff', width: 0.18 });
  }
  g.circle(w / 2, l / 2, 0.25).fill({ color: '#ffffff', alpha: pitchArt.lineAlpha });
  return g;
}

/** Text at its real pixel size, rasterised once. */
function label(text: string, size: number, fill: string, weight: '700' | '800' = '800') {
  const view = new Text({
    text,
    style: {
      fontFamily: 'Inter Variable, Inter, Arial, sans-serif',
      fontSize: size,
      fontWeight: weight,
      fill,
    },
    resolution: Math.min(2, window.devicePixelRatio || 1),
  });
  view.anchor.set(0.5);
  return view;
}

interface TokenView {
  view: Container;
  ghost: boolean;
  key: string;
}

export async function createClipScene(
  host: HTMLDivElement,
  options: ClipSceneOptions,
): Promise<ClipScene> {
  const app = await createStage({
    width: Math.max(1, host.clientWidth),
    height: Math.max(1, host.clientHeight),
    background: pitchArt.grass,
    ...pitchQuality(
      window.devicePixelRatio || 1,
      (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    ),
  });
  const canvas = app.renderer.canvas;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  host.appendChild(canvas);
  const kits = kitAppearance(options.home, options.away);
  const homeIds = new Set<string>(options.home.playerIds);
  const ownIds = new Set<string>(
    options.home.playerIds.includes(options.selectedPlayerId)
      ? options.home.playerIds
      : options.away.playerIds,
  );
  const pitch = new Container();
  pitch.addChild(drawPitch());
  const arrows = new Graphics();
  const shot = new Graphics();
  const trail = new Graphics();
  const badges = new Container();
  const tokens = new Container();
  const ballView = new Container();
  const ballShadow = new Graphics().ellipse(0, 0, BALL_PX * 0.55, BALL_PX * 0.32).fill({
    color: '#06281b',
    alpha: 0.45,
  });
  const ball = new Graphics()
    .circle(0, 0, BALL_PX / 2)
    .fill('#ffffff')
    .stroke({ color: '#14251e', width: 1.5 });
  ballView.addChild(ball);
  const confetti = new Graphics();
  app.stage.addChild(pitch, arrows, shot, trail, tokens, badges, ballShadow, ballView, confetti);

  let vertical = options.vertical;
  let reduced = options.reduced;
  let width = Math.max(1, host.clientWidth);
  let height = Math.max(1, host.clientHeight);
  let view = viewSize(width, height, vertical);
  let spec: ClipSpec | null = null;
  let elapsed = 0;
  let camera: Point = { x: PITCH_WIDTH_M / 2, y: PITCH_LENGTH_M / 2 };
  let settled = true;
  const trailPoints: Point[] = [];
  const views = new Map<string, TokenView>();
  let shownArrows: readonly CamArrow[] = [];
  let deciding = false;
  let destroyed = false;

  const size = () => ({ width, height, ppm: view.ppm });
  const stagePoint = (point: Point) => toStage(point, camera, size(), vertical);

  const colourOf = (id: string) => (homeIds.has(id) ? kits.home : kits.away);
  const edgeOf = (id: string) => (homeIds.has(id) ? kits.edge.home : kits.edge.away).pitch;
  /** A cast token (25 px) or a ghost (16 px), with its number or label. */
  const tokenFor = (member: ClipMember | null, id: string): TokenView => {
    const ghost = member === null;
    const key = ghost
      ? `ghost:${id}`
      : `${member.role}:${member.label}:${member.name ?? ''}:${member.number}`;
    const existing = views.get(id);
    if (existing && existing.key === key) return existing;
    existing?.view.destroy({ children: true });
    const view = new Container();
    const colour = colourOf(id);
    const radius = (ghost ? GHOST_PX : TOKEN_PX) / 2;
    const you = member?.role === 'you';
    const shape = new Graphics();
    if (you) shape.circle(0, 0, radius + 7).fill({ color: pitchArt.gold, alpha: 0.3 });
    shape
      .ellipse(1, 2, radius, radius * 0.92)
      .fill({ color: '#06281b', alpha: ghost ? 0.15 : 0.35 });
    shape
      .circle(0, 0, radius)
      .fill(colour)
      .stroke(
        you
          ? { color: pitchArt.gold, width: 3 }
          : { color: edgeOf(id) ? '#ffffff' : '#102c26', width: ghost ? 1 : 2 },
      );
    // The second marker on away tokens when no kit is distinct for colour-blind viewers.
    if (!homeIds.has(id) && kits.clash && !ghost)
      shape.circle(0, 0, radius - 4).stroke({ color: kitNumberColor(colour), width: 1.5 });
    view.addChild(shape);
    if (!ghost) {
      view.addChild(label(String(member.number), 12, kitNumberColor(colour)));
      if (member.label !== 'number') {
        const text = member.label === 'you' ? options.youLabel : member.name!;
        const tag = label(text, 11, member.label === 'you' ? pitchArt.night : '#ffffff', '800');
        const pillWidth = tag.width + 12;
        // YOU sits under its token, the opponent's name over his, so the two never collide.
        const top = member.label === 'you' ? radius + 3 : -radius - 20;
        const pill = new Graphics()
          .roundRect(-pillWidth / 2, top, pillWidth, 17, 8.5)
          .fill(member.label === 'you' ? pitchArt.gold : 'rgba(20,37,30,0.9)');
        tag.position.set(0, top + 8.5);
        view.addChild(pill, tag);
      }
    } else view.alpha = GHOST_ALPHA;
    tokens.addChild(view);
    const made = { view, ghost, key };
    views.set(id, made);
    return made;
  };

  const badgeViews = new Map<number, Container>();
  const badgeFor = (number: number, colour: string) => {
    let badge = badgeViews.get(number);
    if (!badge) {
      badge = new Container();
      badge.addChild(
        new Graphics().circle(0, 0, 11).fill(colour).stroke({ color: '#14251e', width: 2 }),
        label(String(number), 13, '#153c2d'),
      );
      badges.addChild(badge);
      badgeViews.set(number, badge);
    }
    return badge;
  };
  const drawArrows = (from: (point: Point) => Point) => {
    arrows.clear();
    for (const badge of badgeViews.values()) badge.visible = false;
    if (!deciding) return;
    for (const arrow of shownArrows) {
      const a = from(arrow.from);
      const b = from(arrow.to);
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      const bend = (arrow.number % 2 ? -1 : 1) * Math.min(28, length * 0.14);
      const c = {
        x: (a.x + b.x) / 2 + (-dy / length) * bend,
        y: (a.y + b.y) / 2 + (dx / length) * bend,
      };
      const colour = ARROW_COLOURS[(arrow.number - 1) % ARROW_COLOURS.length]!;
      arrows
        .moveTo(a.x, a.y)
        .quadraticCurveTo(c.x, c.y, b.x, b.y)
        .stroke({ color: colour, width: 3.5, cap: 'round', alpha: 0.95 });
      const ex = b.x - c.x,
        ey = b.y - c.y;
      const el = Math.hypot(ex, ey) || 1;
      const ux = ex / el,
        uy = ey / el;
      arrows
        .poly([
          b.x,
          b.y,
          b.x - ux * 11 - uy * 6,
          b.y - uy * 11 + ux * 6,
          b.x - ux * 11 + uy * 6,
          b.y - uy * 11 - ux * 6,
        ])
        .fill(colour);
      const badge = badgeFor(arrow.number, colour);
      badge.visible = true;
      badge.position.copyFrom(badgePoint(a, c, b));
    }
  };

  /** Draw the clip at `elapsed`; returns whether anything still moves. */
  const draw = (dt: number): boolean => {
    if (!spec) return false;
    const timeline = spec.timeline;
    const at = Math.min(elapsed, timeline.duration);
    const sample = timeline.frames.length > 1 ? samplePlayback(timeline, at) : null;
    const frame = timeline.frames.at(-1)!;
    const position = (id: string): Point | undefined => {
      const point = sample?.players.get(id) ?? frame.players.find((p) => p.id === id)?.point;
      return point ? toClip(point, spec!.attacksRight) : undefined;
    };
    const ballAt = toClip(sample?.ball ?? frame.ball, spec.attacksRight);
    const you = position(options.selectedPlayerId);
    const target = clampCamera(cameraTarget(ballAt, you, spec.lean), view.across, view.along);
    const next = dt > 0 ? follow(camera, target, dt) : target;
    settled = Math.hypot(next.x - target.x, next.y - target.y) < 0.03;
    camera = next;
    pitch.scale.set(view.ppm);
    pitch.pivot.set(camera.x, camera.y);
    pitch.rotation = vertical ? 0 : Math.PI / 2;
    let shake = { x: 0, y: 0 };
    if (spec.goal !== null && !reduced && at >= timeline.beatAt && at < timeline.beatAt + 260) {
      const k = 1 - (at - timeline.beatAt) / 260;
      shake = { x: Math.sin(at * 0.09) * 3 * k, y: Math.cos(at * 0.11) * 2 * k };
    }
    pitch.position.set(width / 2 + shake.x, height / 2 + shake.y);
    const place = (point: Point) => {
      const p = stagePoint(point);
      return { x: p.x + shake.x, y: p.y + shake.y };
    };
    // The cast and the ghosts; everyone else stays hidden.
    for (const tokenView of views.values()) tokenView.view.visible = false;
    for (const id of spec.cast.ghosts) {
      const point = position(id);
      if (!point) continue;
      const token = tokenFor(null, id);
      token.view.visible = true;
      token.view.position.copyFrom(place(point));
    }
    // You on top.
    for (const member of [...spec.cast.members].reverse()) {
      const point = position(member.id);
      if (!point) continue;
      const token = tokenFor(member, member.id);
      token.view.visible = true;
      token.view.position.copyFrom(place(point));
      tokens.setChildIndex(token.view, tokens.children.length - 1);
    }
    // The ball, lifted by its flight, with a short trail.
    // A carried ball sits at the carrier's feet, ahead of the token, not over its number.
    const carrier = sample ? sample.carrierId : (frame.carrierId ?? null);
    const loose = place(ballAt);
    const ahead = carrier ? (ownIds.has(carrier) ? 1 : -1) * (TOKEN_PX / 2 + 3) : 0;
    const ground = vertical
      ? { x: loose.x, y: loose.y - ahead }
      : { x: loose.x + ahead, y: loose.y };
    const lift = (sample?.height ?? 0) * 14;
    ballShadow.position.set(ground.x + 1, ground.y + 2);
    ballView.position.set(ground.x, ground.y - lift);
    ballView.scale.set(1 + (sample?.height ?? 0) * 0.35);
    trailPoints.push({ ...ballAt });
    while (trailPoints.length > TRAIL_FRAMES) trailPoints.shift();
    trail.clear();
    if (!reduced)
      trailPoints.forEach((point, index) => {
        if (index === trailPoints.length - 1) return;
        const p = place(point);
        const share = (index + 1) / trailPoints.length;
        trail
          .circle(p.x, p.y, 1 + share * 2.4)
          .fill({ color: pitchArt.trail, alpha: share * 0.45 });
      });
    // The shot's path, once struck.
    shot.clear();
    if (spec.shotPath && timeline.strike !== null && at >= timeline.times[timeline.strike - 1]!) {
      const from = place(toClip(timeline.frames[timeline.strike - 1]!.ball, spec.attacksRight));
      const to = place(toClip(timeline.frames[timeline.strike]!.ball, spec.attacksRight));
      const reach = Math.min(1, (at - timeline.times[timeline.strike - 1]!) / 250);
      shot
        .moveTo(from.x, from.y)
        .lineTo(from.x + (to.x - from.x) * reach, from.y + (to.y - from.y) * reach)
        .stroke({ color: pitchArt.gold, width: 2.5, alpha: 0.9, cap: 'round' });
    }
    drawArrows(place);
    // Confetti in the scorer's colours after a goal.
    confetti.clear();
    const party = spec.goal !== null && !reduced && at >= timeline.beatAt;
    if (party) {
      const t = (at - timeline.beatAt) / 1000;
      const colours = spec.goal === 0 ? [kits.home, pitchArt.gold] : [kits.away, pitchArt.gold];
      for (let i = 0; i < 28 && t < 1.2; i++) {
        const x = ((i * 97) % 100) / 100;
        const fall = t * (0.5 + ((i * 37) % 10) / 20);
        confetti
          .rect(x * width + Math.sin(t * 6 + i) * 8, fall * height - 12, 5, 8)
          .fill({ color: colours[i % 2]!, alpha: Math.max(0, 1 - t / 1.2) });
      }
    }
    const playing = elapsed < timeline.duration;
    return playing || !settled || (party && at < timeline.beatAt + 1200) || trailPoints.length > 1;
  };

  app.ticker.add((ticker) => {
    if (destroyed || !spec) return;
    if (document.hidden) {
      app.ticker.stop();
      return;
    }
    const dt = Math.min(50, ticker.deltaMS);
    if (!reduced) elapsed += dt;
    else elapsed = spec.timeline.duration;
    // After the clip, the trail fades as the ball rests.
    if (elapsed >= spec.timeline.duration && trailPoints.length > 1) trailPoints.shift();
    if (!draw(dt)) app.ticker.stop();
  });

  const start = () => {
    if (destroyed || document.hidden) return;
    if (!app.ticker.started) app.ticker.start();
  };
  const renderNow = () => {
    draw(0);
    app.render();
  };
  const resize = () => {
    if (destroyed) return;
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    app.renderer.resize(width, height);
    view = viewSize(width, height, vertical);
    if (spec) renderNow();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const visibility = () => {
    if (document.hidden) app.ticker.stop();
    else if (spec && elapsed < spec.timeline.duration) start();
  };
  document.addEventListener('visibilitychange', visibility);
  const lost = (event: Event) => {
    event.preventDefault();
    options.unavailable();
  };
  canvas.addEventListener('webglcontextlost', lost);

  return {
    play(next) {
      if (destroyed) return;
      const fresh = spec?.key !== next.key;
      spec = next;
      shownArrows = next.arrows;
      deciding = next.deciding;
      if (fresh) {
        elapsed = next.atEnd || reduced ? next.timeline.duration : 0;
        trailPoints.length = 0;
        // A new clip starts with its camera on the play, not travelling from the last one.
        const first = next.timeline.frames[0];
        if (first) {
          const you = first.players.find((p) => p.id === options.selectedPlayerId)?.point;
          camera = clampCamera(
            cameraTarget(
              toClip(first.ball, next.attacksRight),
              you ? toClip(you, next.attacksRight) : undefined,
              next.lean,
            ),
            view.across,
            view.along,
          );
        }
      }
      if (elapsed < next.timeline.duration) start();
      else renderNow();
    },
    skip() {
      if (!spec || destroyed) return;
      elapsed = spec.timeline.duration;
      trailPoints.length = 0;
      renderNow();
      start();
    },
    setArrows(next, isDeciding) {
      shownArrows = next;
      deciding = isDeciding;
      if (spec) renderNow();
    },
    setVertical(next) {
      if (next === vertical) return;
      vertical = next;
      view = viewSize(width, height, vertical);
      if (spec) renderNow();
    },
    setReduced(next) {
      reduced = next;
      if (spec && reduced) {
        elapsed = spec.timeline.duration;
        trailPoints.length = 0;
        renderNow();
      }
    },
    idle() {
      spec = null;
      app.ticker.stop();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('webglcontextlost', lost);
      app.ticker.destroy();
      app.stage.destroy({ children: true });
      app.renderer.destroy({ removeView: true });
    },
  };
}
