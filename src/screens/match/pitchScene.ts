import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Club, Point, ReplayFrame } from '../../model/domain';
import { kitAppearance } from './Maps';

export const pitchPoint = (point: Point) => ({
  x: 8 + Math.max(0, Math.min(100, point.x)),
  y: 8 + Math.max(0, Math.min(100, point.y)) * 0.64,
});

interface Token {
  view: Container;
  /** The token's shapes, transformed by a celebration while the view keeps its position. */
  body: Container;
  target: Point;
}
export interface PitchScene {
  update(frame: ReplayFrame, playing: boolean, reducedMotion: boolean): void;
  /** Play the selected player's goal celebration (milestone 7). */
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
  let playing = false,
    reducedMotion = false;
  let highlightRemainingMs = 0;
  let celebration: { motion: string; elapsed: number } | null = null;
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
    const target = pitchPoint(point);
    view.position.set(target.x, target.y);
    world.addChild(view);
    tokens.set(id, { view, body, target });
  };
  const ball = new Graphics()
    .circle(0.1, 0.25, 0.7)
    .fill({ color: '#09281d', alpha: 0.5 })
    .circle(0, 0, 0.65)
    .fill('#ffffff')
    .stroke({ color: '#17221c', width: 0.18 })
    .circle(0, 0, 0.2)
    .fill('#17221c');
  let ballTarget = pitchPoint(frame.ball);
  let previousFrame = frame;
  const applyFrame = (next: ReplayFrame) => {
    const active = new Set(next.players.map((player) => player.id));
    for (const [id, token] of tokens) token.view.visible = active.has(id);
    next.players.forEach((player, index) => {
      if (!tokens.has(player.id)) addToken(player.id, player.point, index);
      const token = tokens.get(player.id)!;
      token.target = pitchPoint(player.point);
      if (!playing || reducedMotion) token.view.position.set(token.target.x, token.target.y);
    });
    ballTarget = pitchPoint(next.ball);
    if (!playing || reducedMotion) ball.position.set(ballTarget.x, ballTarget.y);
  };
  applyFrame(frame);
  world.addChild(ball);
  let destroyed = false;
  const resize = () => {
    if (destroyed) return;
    app.renderer.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
    const scale = Math.min(host.clientWidth / 116, host.clientHeight / 80);
    world.scale.set(scale);
    world.position.set((host.clientWidth - 116 * scale) / 2, (host.clientHeight - 80 * scale) / 2);
    if (!playing || reducedMotion) app.render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  app.ticker.add((ticker) => {
    if ((!playing && highlightRemainingMs <= 0) || reducedMotion) return;
    highlightRemainingMs = Math.max(0, highlightRemainingMs - ticker.deltaMS);
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
    const mix = 1 - Math.exp(-Math.min(ticker.deltaMS, 80) / 130);
    for (const { view, target } of tokens.values()) {
      view.x += (target.x - view.x) * mix;
      view.y += (target.y - view.y) * mix;
    }
    ball.x += (ballTarget.x - ball.x) * mix;
    ball.y += (ballTarget.y - ball.y) * mix;
    if (!playing && highlightRemainingMs <= 0) {
      ball.position.set(ballTarget.x, ballTarget.y);
      app.stop();
    }
  });
  const lost = (event: Event) => {
    event.preventDefault();
    unavailable();
  };
  app.canvas.addEventListener('webglcontextlost', lost);
  return {
    update(next, nextPlaying, nextReducedMotion) {
      if (destroyed) return;
      playing = nextPlaying;
      reducedMotion = nextReducedMotion;
      // A resolved choice changes the frame within the same sporting minute.
      // Animate that short highlight while the decision flow remains paused.
      const outcomeHighlight =
        next !== previousFrame && next.timeMs === previousFrame.timeMs && !reducedMotion;
      highlightRemainingMs = outcomeHighlight ? 500 : 0;
      // Pausing the current frame freezes its interpolation in place. A new
      // decision frame must instead land exactly on the engine's coordinates.
      if (next !== previousFrame || reducedMotion) {
        const wasPlaying = playing;
        if (outcomeHighlight) playing = true;
        applyFrame(next);
        playing = wasPlaying;
      }
      previousFrame = next;
      world.setChildIndex(ball, world.children.length - 1);
      if ((playing || highlightRemainingMs > 0) && !reducedMotion) app.start();
      else {
        app.stop();
        app.render();
      }
    },
    celebrate(motion) {
      if (destroyed || reducedMotion) return;
      celebration = { motion, elapsed: 0 };
      highlightRemainingMs = Math.max(highlightRemainingMs, CELEBRATION_MS);
      const selected = tokens.get(selectedPlayerId);
      if (selected) world.setChildIndex(selected.view, world.children.length - 1);
      app.start();
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
