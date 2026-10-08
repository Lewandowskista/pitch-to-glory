// Pixi's no-eval shader and uniform code, so the pitch runs under the strict Content
// Security Policy (no 'unsafe-eval'); see public/_headers.
import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Club, Point, ReplayFrame } from '../../model/domain';
import { kitAppearance } from './Maps';
import { preparePlayback, samplePlayback, type Playback } from './playback';
import { ballAtFeet, kitNumberColor, pitchArt, pitchPoint, pitchAssetScale } from './pitchArt';

interface Token {
  view: Container;
  /** The token's shapes, transformed by a celebration while the view keeps its position. */
  body: Container;
  direction: Graphics;
  heading: number;
  keeper: boolean;
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
  paused: boolean;
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
      background: pitchArt.grass,
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
  const grass = new Graphics().rect(0, 0, 116, 80).fill(pitchArt.grass);
  for (let stripe = 0; stripe < 10; stripe++)
    grass.rect(8 + stripe * 10, 8, 10, 64).fill(pitchArt.stripes[stripe % 2]!);
  const line = { color: pitchArt.line, width: 0.38, alpha: 0.85 };
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
  for (const x of [5, 108])
    for (let y = 37.2; y < 44.2; y += 1.4)
      grass
        .moveTo(x, y)
        .lineTo(x + 3, y)
        .stroke({ color: '#f5f0df', width: 0.12, alpha: 0.35 });
  for (const [x, y, start] of [
    [8, 8, 0],
    [108, 8, Math.PI / 2],
    [108, 72, Math.PI],
    [8, 72, Math.PI * 1.5],
  ])
    grass
      .moveTo(x! + Math.cos(start!) * 1, y! + Math.sin(start!) * 1)
      .arc(x!, y!, 1, start!, start! + Math.PI / 2)
      .stroke(line);
  world.addChild(grass);
  const trail = new Graphics();
  const possession = new Graphics()
    .circle(0, 0, 2.55)
    .stroke({ color: '#9ff5d5', width: 0.3, alpha: 0.8 });
  const impact = new Graphics();
  world.addChild(trail, possession, impact);
  const tokens = new Map<string, Token>();
  const kits = kitAppearance(home, away);
  let reducedMotion = false;
  let paused = false;
  let playback: (Playback & { elapsed: number }) | null = null;
  let arrival: { point: Point; color: string; elapsed: number } | null = null;
  let shownRate = 0,
    shownMax = 0;
  let assetScale = 1;
  let celebration: { motion: string; elapsed: number } | null = null;
  let pendingCelebration: string | null = null;
  const addToken = (id: string, point: Point, index: number) => {
    const isHome = home.playerIds.includes(id);
    const view = new Container();
    const body = new Container();
    const color = isHome ? kits.home : kits.away;
    const ink = kitNumberColor(color);
    const shape = new Graphics()
      .ellipse(0.15, 0.5, 2.05, 1.9)
      .fill({ color: '#06281b', alpha: 0.4 });
    if (id === selectedPlayerId)
      shape
        .circle(0, 0, 3.1)
        .stroke({ color: pitchArt.gold, width: 0.3 })
        .circle(0, 0, 2.75)
        .stroke({ color: pitchArt.gold, width: 0.18 });
    shape
      .circle(0, 0, pitchArt.radius)
      .fill(color)
      .stroke({ color: '#102c26', width: 0.3 })
      .circle(0, 0, pitchArt.radius - 0.25)
      .stroke({ color: ink, width: 0.12, alpha: 0.3 });
    if (!isHome && kits.clash) shape.circle(0, 0, 1.35).stroke({ color: ink, width: 0.2 });
    if (!isHome)
      for (let arc = 0; arc < 8; arc++) {
        const angle = (arc * Math.PI) / 4;
        shape
          .moveTo(Math.cos(angle) * 2.3, Math.sin(angle) * 2.3)
          .arc(0, 0, 2.3, angle, angle + 0.4)
          .stroke({ color: '#ffffff', width: 0.22 });
      }
    const direction = new Graphics().poly([1.65, -0.65, 2.6, 0, 1.65, 0.65]).fill(ink);
    body.addChild(direction);
    const keeper = index % 11 === 0;
    if (keeper) {
      const gloves = new Graphics();
      for (const x of [-2.2, 1.55])
        gloves
          .roundRect(x, -0.55, 0.65, 1.1, 0.18)
          .fill('#f7edcf')
          .stroke({ color: '#102c26', width: 0.15 });
      body.addChild(gloves);
    }
    body.addChild(shape);
    const number = new Text({
      text: String((index % 11) + 1),
      style: {
        fontFamily: 'Arial, sans-serif',
        // Rasterize at a real font size, then shrink the texture to scene units.
        // Tiny font metrics otherwise round away, putting blurry digits off-centre.
        fontSize: 32,
        fontWeight: 'bold',
        fill: ink,
        trim: true,
        padding: 2,
      },
      resolution: 2,
      autoGenerateMipmaps: true,
    });
    number.anchor.set(0.5);
    number.scale.set(pitchArt.numberSize / 32);
    body.addChild(number);
    body.scale.set(assetScale);
    view.addChild(body);
    const at = pitchPoint(point);
    view.position.set(at.x, at.y);
    world.addChild(view);
    const homeKeeper = frame.players.find((player) => home.playerIds.includes(player.id));
    const homeRight = (homeKeeper?.point.x ?? 0) < 50;
    const heading = isHome === homeRight ? 0 : Math.PI;
    direction.rotation = heading;
    tokens.set(id, { view, body, direction, heading, keeper });
  };
  // The shadow stays on the grass while a lofted ball rises and grows.
  const ballShadow = new Graphics().ellipse(0, 0, 0.85, 0.5).fill({ color: '#09281d', alpha: 0.5 });
  const ball = new Graphics()
    .circle(0, 0, pitchArt.ballRadius)
    .fill('#ffffff')
    .stroke({ color: '#17221c', width: 0.18 })
    .poly([0, -0.3, 0.29, -0.09, 0.18, 0.25, -0.18, 0.25, -0.29, -0.09])
    .fill('#17221c')
    .circle(-0.6, -0.2, 0.13)
    .fill('#17221c')
    .circle(0.5, 0.4, 0.13)
    .fill('#17221c');
  let ballPoint = frame.ball;
  let ballHeight = 0;
  let ballFootOffset: Point | undefined;
  let shownCarrier: string | null = frame.carrierId ?? null;
  const trailPoints: Point[] = [];
  const placeBall = (
    point: Point,
    height: number,
    carrierId: string | null = null,
    footOffset?: Point,
  ) => {
    ballPoint = point;
    ballHeight = height;
    ballFootOffset = footOffset;
    shownCarrier = carrierId;
    const token = carrierId ? tokens.get(carrierId) : null;
    const ground = pitchPoint(point, 5);
    const at = token
      ? ballAtFeet(ground, token.heading, assetScale)
      : footOffset
        ? { x: ground.x + footOffset.x * assetScale, y: ground.y + footOffset.y * assetScale }
        : ground;
    ballShadow.position.set(at.x + 0.1 + height * 0.6, at.y + 0.25 + height * 0.4);
    ballShadow.alpha = Math.max(0.2, 1 - height * 0.5);
    ballShadow.scale.set(assetScale * (1 + height * 0.35));
    ball.position.set(at.x, at.y - height * 3.8);
    ball.scale.set(assetScale * (1 + height * 0.3));
    possession.visible = !!token;
    possession.scale.set(assetScale);
    if (token) possession.position.copyFrom(token.view.position);
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
    trail.clear();
    trailPoints.length = 0;
    impact.clear();
    arrival = null;
    placeBall(next.ball, 0, next.carrierId);
  };
  /** Positions on screen, in pitch units, so a new passage starts without a jump. */
  const onScreen = (frame: ReplayFrame): ReplayFrame => ({
    ...frame,
    ball: { ...ballPoint },
    carrierId: shownCarrier,
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
    assetScale = pitchAssetScale(scale);
    for (const token of tokens.values()) token.body.scale.set(assetScale);
    placeBall(ballPoint, ballHeight, shownCarrier, ballFootOffset);
    world.scale.set(scale);
    world.position.set((host.clientWidth - 116 * scale) / 2, (host.clientHeight - 80 * scale) / 2);
    if (!playback && !celebration && !arrival) app.render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const startCelebration = (motion: string) => {
    celebration = { motion, elapsed: 0 };
    const selected = tokens.get(selectedPlayerId);
    if (selected) world.setChildIndex(selected.view, world.children.length - 3);
    if (!paused && !document.hidden) app.start();
  };
  app.ticker.add((ticker) => {
    if (reducedMotion || paused || document.hidden) return;
    if (playback) {
      playback.elapsed += ticker.deltaMS;
      const elapsed = playback.elapsed;
      const sample = samplePlayback(playback, elapsed);
      for (const [id, point] of sample.players) {
        const token = tokens.get(id);
        if (!token) continue;
        const at = pitchPoint(point);
        const dx = at.x - token.view.x,
          dy = at.y - token.view.y;
        if (sample.motion !== 'reset' && Math.hypot(dx, dy) > 0.005) {
          const heading = Math.atan2(dy, dx);
          const turn = Math.atan2(
            Math.sin(heading - token.heading),
            Math.cos(heading - token.heading),
          );
          token.heading += turn * Math.min(1, ticker.deltaMS / 100);
          token.direction.rotation = token.heading;
        }
        token.view.position.set(at.x, at.y);
        if (token.keeper && !(celebration && id === selectedPlayerId)) {
          const reach = Math.hypot(point.x - sample.to.ball.x, (point.y - sample.to.ball.y) * 0.64);
          const dive =
            sample.motion === 'shot' && reach < 8 ? Math.sin(sample.progress * Math.PI) : 0;
          token.body.scale.set(assetScale * (1 + dive * 0.22), assetScale * (1 - dive * 0.12));
        }
      }
      const movingBall = !['carry', 'dead', 'reset'].includes(sample.motion ?? 'dead');
      let footOffset: Point | undefined;
      if (movingBall) {
        const sender = sample.from.carrierId ? tokens.get(sample.from.carrierId) : null;
        const receiver = sample.to.carrierId ? tokens.get(sample.to.carrierId) : null;
        const u = sample.progress;
        footOffset = {
          x:
            2.95 *
            ((sender ? Math.cos(sender.heading) * (1 - u) : 0) +
              (receiver ? Math.cos(receiver.heading) * u : 0)),
          y:
            2.95 *
            ((sender ? Math.sin(sender.heading) * (1 - u) : 0) +
              (receiver ? Math.sin(receiver.heading) * u : 0)),
        };
      }
      const previousBall = { x: ball.x, y: ball.y };
      placeBall(sample.ball, sample.height, sample.carrierId, footOffset);
      const distance = Math.hypot(ball.x - previousBall.x, ball.y - previousBall.y);
      ball.rotation += sample.motion === 'reset' ? 0 : distance * 0.75;
      trail.clear();
      if (movingBall && distance > 0.01) {
        trailPoints.push({ x: ball.x, y: ball.y });
        if (trailPoints.length > 7) trailPoints.shift();
        for (let i = 1; i < trailPoints.length; i++) {
          const a = trailPoints[i - 1]!,
            b = trailPoints[i]!;
          trail
            .moveTo(a.x, a.y)
            .lineTo(b.x, b.y)
            .stroke({
              color: sample.motion === 'shot' ? pitchArt.gold : '#dffbea',
              width: 0.3 + (0.5 * i) / trailPoints.length,
              alpha: (0.4 * i) / trailPoints.length,
            });
        }
      } else trailPoints.length = 0;
      impact.clear();
      if (movingBall && sample.progress > 0.72) {
        const t = (sample.progress - 0.72) / 0.28;
        const at = pitchPoint(sample.to.ball, 5);
        impact.circle(at.x, at.y, 0.9 + t * 2).stroke({
          color: sample.motion === 'shot' ? pitchArt.gold : '#dffbea',
          width: 0.2,
          alpha: Math.sin(t * Math.PI) * 0.65,
        });
      }
      if (elapsed >= playback.duration) {
        if (movingBall)
          arrival = {
            point: { x: ball.x, y: ball.y },
            color: sample.motion === 'shot' ? pitchArt.gold : '#dffbea',
            elapsed: 0,
          };
        playback = null;
        trail.clear();
        trailPoints.length = 0;
        impact.clear();
        if (pendingCelebration) {
          startCelebration(pendingCelebration);
          pendingCelebration = null;
        }
      }
    }
    if (arrival) {
      arrival.elapsed += ticker.deltaMS;
      const t = Math.min(1, arrival.elapsed / 380);
      impact
        .clear()
        .circle(arrival.point.x, arrival.point.y, 1 + t * 2.8)
        .stroke({ color: arrival.color, width: 0.25, alpha: (1 - t) * 0.75 });
      if (t >= 1) {
        arrival = null;
        impact.clear();
      }
    }
    const celebrating = celebration && tokens.get(selectedPlayerId);
    if (celebration && celebrating) {
      celebration.elapsed += ticker.deltaMS;
      const t = Math.min(1, celebration.elapsed / CELEBRATION_MS);
      const pose = celebrationPose(celebration.motion, t);
      celebrating.body.position.set(pose.x, pose.y);
      celebrating.body.rotation = pose.rotation;
      celebrating.body.scale.set(assetScale * pose.scale, assetScale * pose.scale * pose.flip);
      if (t >= 1) {
        celebrating.body.position.set(0, 0);
        celebrating.body.rotation = 0;
        celebrating.body.scale.set(assetScale);
        celebration = null;
      }
    }
    if (!playback && !celebration && !arrival) app.stop();
  });
  const lost = (event: Event) => {
    event.preventDefault();
    unavailable();
  };
  app.canvas.addEventListener('webglcontextlost', lost);
  const visibility = () => {
    if (document.hidden) app.stop();
    else if (!paused && !reducedMotion && (playback || celebration || arrival)) app.start();
  };
  document.addEventListener('visibilitychange', visibility);
  let shownMotion: ReplayFrame[] | null | undefined;
  return {
    update(view) {
      if (destroyed) return;
      reducedMotion = view.reducedMotion;
      paused = view.paused;
      const fresh = view.motion !== shownMotion;
      // The first view only shows where play stands; later passages are played out.
      const replay =
        fresh && shownMotion !== undefined && !reducedMotion && (view.motion?.length ?? 0) > 1;
      shownMotion = view.motion;
      for (const player of view.frame.players)
        if (!tokens.has(player.id))
          addToken(player.id, player.point, view.frame.players.indexOf(player));
      if (replay) {
        trailPoints.length = 0;
        const frames = [onScreen(view.motion![0]!), ...view.motion!.slice(1)];
        const prepared = preparePlayback(frames, view.rate, view.maxMs);
        const active = new Set(view.frame.players.map((player) => player.id));
        for (const [id, token] of tokens) token.view.visible = active.has(id);
        playback = prepared.duration > 0 ? { ...prepared, elapsed: 0 } : null;
        if (!playback) applyFrame(view.frame);
      } else if (fresh || reducedMotion || !playback) {
        playback = null;
        applyFrame(view.frame);
      } else if (view.rate !== shownRate || view.maxMs !== shownMax) {
        const prepared = preparePlayback(playback.frames, view.rate, view.maxMs);
        playback = {
          ...prepared,
          elapsed: (playback.elapsed * prepared.duration) / playback.duration,
        };
      }
      shownRate = view.rate;
      shownMax = view.maxMs;
      if (reducedMotion) {
        celebration = null;
        pendingCelebration = null;
        const selected = tokens.get(selectedPlayerId);
        selected?.body.position.set(0, 0);
        selected?.body.scale.set(assetScale);
        if (selected) selected.body.rotation = 0;
      }
      // Keep your shirt number readable even when a defender closes the gap.
      const selected = tokens.get(selectedPlayerId);
      if (selected) world.setChildIndex(selected.view, world.children.length - 3);
      world.setChildIndex(ballShadow, world.children.length - 2);
      world.setChildIndex(ball, world.children.length - 1);
      if ((playback || celebration || arrival) && !reducedMotion && !paused && !document.hidden)
        app.start();
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
      document.removeEventListener('visibilitychange', visibility);
      app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
    },
  };
}
