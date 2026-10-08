# Match pitch clarity and playback

Goal: make the existing vector match pitch legible and show football actions fluidly.

Use the current PixiJS renderer and SVG fallback. Keep engine outcomes and persisted
replay frames unchanged. Improve presentation and the deterministic replay sampler.

- Reproduce the small-font rasterization and capture desktop and mobile pitch views.
- Add regression coverage for stationary-player overshoot, unequal keyframe timing,
  restart discontinuities, and unreadably short shot animations.
- Render labels at a normal font size, scale down, and use consistent centered token art.
- Separate the ball from the carrier visually; show possession, short flight trails,
  lofted shadows, shot impact, and direction of movement with procedural graphics.
- Use bounded time-aware interpolation and readable action timing. Schedule match
  progression after each displayed passage so outcome animations can finish.
- Match the fallback's token art, numbers, ball and pitch markings to the GPU scene.
- Verify typecheck, lint, production build, replay/engine tests, and match browser flows
  in Chromium, Firefox, and WebKit, including reduced motion, resize and context loss.
