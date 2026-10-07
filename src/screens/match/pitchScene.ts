// Pixi's no-eval shader and uniform code, so the pitch runs under the strict Content
// Security Policy (no 'unsafe-eval'); see public/_headers.
import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Club, Point, ReplayFrame } from '../../model/domain';
import { kitAppearance } from './Maps';
import { preparePlayback, samplePlayback, type Playback } from './playback';

/** Pitch units to scene units; the ball may cross the goal line into the net or past it. */
export const pitchPoint = (point: Point, overrun = 0) => ({
  x: 8 + Math.max(-overrun, Math.min(100 + overrun, point.x)),
  y: 8 + Math.max(0, Math.min(100, point.y)) * 0.64,
});

interface Token {
  view: Container;
  /** The token's shapes, transformed by a celebration while the view keeps its position. */
  body: Container;
}
/** What the pitch shows: the latest frame and the passage of play that led to it. */
export interface PitchView {
  frame: ReplayFrame;
  /** Keyframes ending at `frame`; a new array is played from the positions on screen. */
  motion: ReplayFrame[] | null;
  /** Sporting milliseconds per real millisecond, and the longest the passage may take. */
  rate: number;
  maxMs: number;
  reducedMotion: boolean;
}
export interface PitchScene {
  update(view: PitchView): void;
  /** Play the selected player's goal celebration once the ball is in the net (milestone 7). */
  celebrate(motion: string): void;
  destroy(): void;
}
const CELEBRATION_MS = 1600;
/** Body transform at progress t (0–1) of a celebration. */
function celebrationPose(motion: string, t: number) {
  const pulse = Math.sin(Math.PI * t);
  switch (motion) {
    case 'wave':
      return {
        x: 0,
        y: 0,
        rotation: 0.45 * Math.sin(4 * Math.PI * t) * (1 - t),
        scale: 1 + 0.3 * pulse,
        flip: 1,
      };
    case 'slide':
      return { x: 6 * pulse, y: 0, rotation: 0, scale: 1 + 0.15 * pulse, flip: 1 };
    case 'dance':
      return {
        x: 1.2 * Math.sin(6 * Math.PI * t),
        y: -0.8 * Math.abs(Math.sin(6 * Math.PI * t)),
        rotation: 0,
        scale: 1.2,
        flip: 1,
      };
    case 'sprint':
      return {
        x: 3 * Math.sin(2 * Math.PI * t),
        y: 1.5 * (1 - Math.cos(2 * Math.PI * t)),
        rotation: 0.3 * Math.sin(2 * Math.PI * t),
        scale: 1.15,
        flip: 1,
      };
    case 'spin':
      return {
        x: 0,
        y: 0,
        rotation: 4 * Math.PI * (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
        scale: 1 + 0.25 * pulse,
        flip: 1,
      };
    case 'flip':
      return {
        x: 0,
        y: -3 * pulse,
        rotation: 0,
        scale: 1 + 0.2 * pulse,
        flip: Math.cos(2 * Math.PI * t),
      };
    default:
      return { x: 0, y: 0, rotation: 0, scale: 1 + 0.5 * pulse, flip: 1 };
  }
}

export async function createPitchScene(
  host: HTMLDivElement,
  home: Club,
  away: Club,
  selectedPlayerId: string,
  frame: ReplayFrame,
  unavailable: () => void,
): Promise<PitchScene> {
  const app = new Application();
  try {
    await app.init({
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      background: '#143d2d',
      antialias: true,
      preference: 'webgl',
      autoStart: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
  } catch (error) {
    // Failed initialization can leave a renderer absent, so only destroy a fully initialized app.
    if (app.renderer) app.destroy({ removeView: true }, { children: true });
    throw error;
  }
  host.appendChild(app.canvas);
  app.canvas.setAttribute('aria-hidden', 'true');
  app.canvas.style.display = 'block';
  const world = new Container();
  app.stage.addChild(world);
  const grass = new Graphics().rect(0, 0, 116, 80).fill('#143d2d');
  for (let stripe = 0; stripe < 10; stripe++)
    grass.rect(8 + stripe * 10, 8, 10, 64).fill(stripe % 2 ? '#286345' : '#2e704e');
  const line = { color: '#d5e8cc', width: 0.35, alpha: 0.85 };
  grass.rect(8, 8, 100, 64).stroke(line).moveTo(58, 8).lineTo(58, 72).stroke(line);
  grass.circle(58, 40, 9.15).stroke(line).circle(58, 40, 0.55).fill('#d5e8cc');
  grass.rect(8, 20, 16.5, 40).stroke(line).rect(91.5, 20, 16.5, 40).stroke(line);
  grass.rect(8, 30.5, 5.5, 19).stroke(line).rect(102.5, 30.5, 5.5, 19).stroke(line);
  grass.circle(19, 40, 0.4).fill('#d5e8cc').circle(97, 40, 0.4).fill('#d5e8cc');
  grass
    .moveTo(19 + Math.cos(-0.94) * 9.15, 40 + Math.sin(-0.94) * 9.15)
    .arc(19, 40, 9.15, -0.94, 0.94)
    .stroke(line);
  grass
    .moveTo(97 + Math.cos(Math.PI - 0.94) * 9.15, 40 + Math.sin(Math.PI - 0.94) * 9.15)
    .arc(97, 40, 9.15, Math.PI - 0.94, Math.PI + 0.94)
    .stroke(line);
  grass
    .rect(5, 35.8, 3, 8.4)
    .stroke({ color: '#f5f0df', width: 0.5 })
    .rect(108, 35.8, 3, 8.4)
    .stroke({ color: '#f5f0df', width: 0.5 });
  for (const x of [5, 6, 7, 109, 110, 111])
    grass.moveTo(x, 35.8).lineTo(x, 44.2).stroke({ color: '#f5f0df', width: 0.15, alpha: 0.5 });
  world.addChild(grass);
  const tokens = new Map<string, Token>();
  const kits = kitAppearance(home, away);
  let reducedMotion = false;
  let playback: (Playback & { started: number }) | null = null;
  let celebration: { motion: string; elapsed: number } | null = null;
  let pendingCelebration: string | null = null;
  const addToken = (id: string, point: Point, index: number) => {
    const isHome = home.playerIds.includes(id);
    const view = new Container();
    const body = new Container();
    const shape = new Graphics().circle(0.15, 0.35, 1.75).fill({ color: '#06281b', alpha: 0.4 });
    if (id === selectedPlayerId)
      shape
        .circle(0, 0, 2.7)
        .stroke({ color: '#ffda70', width: 0.35 })
        .circle(0, 0, 2.3)
        .stroke({ color: '#ffda70', width: 0.2 });
    shape
      .circle(0, 0, 1.7)
      .fill(isHome ? kits.home : kits.away)
      .stroke({ color: isHome ? '#111e2c' : '#ffffff', width: 0.3 });
    if (!isHome && kits.clash) shape.circle(0, 0, 1.05).stroke({ color: '#ffffff', width: 0.3 });
    if (!isHome)
      for (let arc = 0; arc < 8; arc++) {
        const angle = (arc * Math.PI) / 4;
        shape
          .moveTo(Math.cos(angle) * 2.05, Math.sin(angle) * 2.05)
          .arc(0, 0, 2.05, angle, angle + 0.35)
          .stroke({ color: '#ffffff', width: 0.2 });
      }
    body.addChild(shape);
    const number = new Text({
      text: String((index % 11) + 1),
      style: {
        fontFamily: 'Inter, sans-serif',
        fontSize: 1.5,
        fontWeight: 'bold',
        fill: '#ffffff',
        stroke: { color: '#17221c', width: 0.22 },
      },
      resolution: 4,
    });
    number.anchor.set(0.5);
    body.addChild(number);
    view.addChild(body);
    const at = pitchPoint(point);
    view.position.set(at.x, at.y);
    world.addChild(view);
    tokens.set(id, { view, body });
  };
  // The shadow stays on the grass while a lofted ball rises and grows.
  const ballShadow = new Graphics().circle(0, 0, 0.7).fill({ color: '#09281d', alpha: 0.5 });
  const ball = new Graphics()
    .circle(0, 0, 0.65)
    .fill('#ffffff')
    .stroke({ color: '#17221c', width: 0.18 })
    .circle(0, 0, 0.2)
    .fill('#17221c');
  const placeBall = (point: Point, height: number) => {
    const at = pitchPoint(point, 5);
    ballShadow.position.set(at.x + 0.1 + height * 0.6, at.y + 0.25 + height * 0.4);
    ballShadow.alpha = 1 - height * 0.6;
    ball.position.set(at.x, at.y - height * 2.4);
    ball.scale.set(1 + height * 0.55);
  };
  /** Show a frame exactly, adding tokens for players seen for the first time. */
  const applyFrame = (next: ReplayFrame) => {
    const active = new Set(next.players.map((player) => player.id));
    for (const [id, token] of tokens) token.view.visible = active.has(id);
    next.players.forEach((player, index) => {
      if (!tokens.has(player.id)) addToken(player.id, player.point, index);
      const at = pitchPoint(player.point);
      tokens.get(player.id)!.view.position.set(at.x, at.y);
    });
    placeBall(next.ball, 0);
  };
  /** Positions on screen, in pitch units, so a new passage starts without a jump. */
  const onScreen = (frame: ReplayFrame): ReplayFrame => ({
    ...frame,
    ball: { x: ballShadow.x - 8.1, y: (ballShadow.y - 8.25) / 0.64 },
    players: frame.players.map((player) => {
      const token = tokens.get(player.id);
      return token?.view.visible
        ? { ...player, point: { x: token.view.x - 8, y: (token.view.y - 8) / 0.64 } }
        : player;
    }),
  });
  applyFrame(frame);
  world.addChild(ballShadow);
  world.addChild(ball);
  let destroyed = false;
  const resize = () => {
    if (destroyed) return;
    app.renderer.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
    const scale = Math.min(host.clientWidth / 116, host.clientHeight / 80);
    world.scale.set(scale);
    world.position.set((host.clientWidth - 116 * scale) / 2, (host.clientHeight - 80 * scale) / 2);
    if (!playback && !celebration) app.render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const startCelebration = (motion: string) => {
    celebration = { motion, elapsed: 0 };
    const selected = tokens.get(selectedPlayerId);
    if (selected) world.setChildIndex(selected.view, world.children.length - 3);
    app.start();
  };
  app.ticker.add((ticker) => {
    if (reducedMotion) return;
    if (playback) {
      const elapsed = performance.now() - playback.started;
      const sample = samplePlayback(playback, elapsed);
      for (const [id, point] of sample.players) {
        const token = tokens.get(id);
        if (!token) continue;
        const at = pitchPoint(point);
        token.view.position.set(at.x, at.y);
      }
      placeBall(sample.ball, sample.height);
      if (elapsed >= playback.duration) {
        playback = null;
        if (pendingCelebration) {
          startCelebration(pendingCelebration);
          pendingCelebration = null;
        }
      }
    }
    const celebrating = celebration && tokens.get(selectedPlayerId);
    if (celebration && celebrating) {
      celebration.elapsed += ticker.deltaMS;
      const t = Math.min(1, celebration.elapsed / CELEBRATION_MS);
      const pose = celebrationPose(celebration.motion, t);
      celebrating.body.position.set(pose.x, pose.y);
      celebrating.body.rotation = pose.rotation;
      celebrating.body.scale.set(pose.scale, pose.scale * pose.flip);
      if (t >= 1) {
        celebrating.body.position.set(0, 0);
        celebrating.body.rotation = 0;
        celebrating.body.scale.set(1);
        celebration = null;
      }
    }
    if (!playback && !celebration) app.stop();
  });
  const lost = (event: Event) => {
    event.preventDefault();
    unavailable();
  };
  app.canvas.addEventListener('webglcontextlost', lost);
  let shownMotion: ReplayFrame[] | null | undefined;
  return {
    update(view) {
      if (destroyed) return;
      reducedMotion = view.reducedMotion;
      const fresh = view.motion !== shownMotion;
      // The first view only shows where play stands; later passages are played out.
      const replay =
        fresh && shownMotion !== undefined && !reducedMotion && (view.motion?.length ?? 0) > 1;
      shownMotion = view.motion;
      for (const player of view.frame.players)
        if (!tokens.has(player.id))
          addToken(player.id, player.point, view.frame.players.indexOf(player));
      if (replay) {
        const frames = [onScreen(view.motion![0]!), ...view.motion!.slice(1)];
        const prepared = preparePlayback(frames, view.rate, view.maxMs);
        const active = new Set(view.frame.players.map((player) => player.id));
        for (const [id, token] of tokens) token.view.visible = active.has(id);
        playback = prepared.duration > 0 ? { ...prepared, started: performance.now() } : null;
        if (!playback) applyFrame(view.frame);
      } else if (fresh || reducedMotion || !playback) {
        playback = null;
        applyFrame(view.frame);
      }
      world.setChildIndex(ballShadow, world.children.length - 2);
      world.setChildIndex(ball, world.children.length - 1);
      if ((playback || celebration) && !reducedMotion) app.start();
      else {
        app.stop();
        app.render();
      }
    },
    celebrate(motion) {
      if (destroyed || reducedMotion) return;
      if (playback) pendingCelebration = motion;
      else startCelebration(motion);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      app.canvas.removeEventListener('webglcontextlost', lost);
      app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
    },
  };
}
