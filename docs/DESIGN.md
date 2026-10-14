---
name: Pitch to Glory
colors:
  primary: '#075e45'
  on-primary: '#ffffff'
  primary-container: '#e0ebe2'
  on-primary-container: '#075e45'
  secondary: '#efcf63'
  on-secondary: '#153c2d'
  secondary-container: '#f4ead4'
  on-secondary-container: '#5c4708'
  tertiary: '#2d6f8f'
  on-tertiary: '#ffffff'
  tertiary-container: '#e4ebee'
  background: '#f4f5ee'
  on-background: '#23342a'
  surface: '#ffffff'
  on-surface: '#23342a'
  surface-variant: '#e9ede2'
  on-surface-variant: '#5e6c61'
  surface-container-low: '#f4f5ee'
  surface-container: '#e9ede2'
  surface-container-high: '#e4eddd'
  outline: '#5e6c61'
  outline-variant: '#dce3d8'
  error: '#a72d30'
  on-error: '#ffffff'
  error-container: '#fff0ef'
  hero-ink: '#fff7e4'
  hero-muted: '#e4edd7'
  meter-gold: '#9a7612'
  dark-background: '#14251e'
  dark-surface: '#1b2e25'
  dark-surface-soft: '#233a2e'
  dark-ink: '#edf2e7'
  dark-muted: '#b2c1b5'
  dark-line: '#354a3d'
  dark-accent: '#9ed9b7'
typography:
  display-xl:
    fontFamily: Bebas Neue
    fontSize: 64px
    fontWeight: '400'
    lineHeight: 60px
    letterSpacing: 0em
  display-lg:
    fontFamily: Bebas Neue
    fontSize: 40px
    fontWeight: '400'
    lineHeight: 40px
  headline-md:
    fontFamily: Bebas Neue
    fontSize: 28px
    fontWeight: '400'
    lineHeight: 30px
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 22px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
  stat-lg:
    fontFamily: Bebas Neue
    fontSize: 48px
    fontWeight: '400'
    lineHeight: 44px
rounded:
  sm: 0.5rem
  DEFAULT: 0.75rem
  lg: 1.25rem
  xl: 1.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  gutter: 20px
  margin: 44px
---

## Brand & Style

Pitch to Glory is a browser football career game: the player lives one footballer's career from a
semi-professional league to legend status. The register is **bold, sporty, warm**: matchday
energy, not spreadsheet calm. Think console career modes (EA FC Career, NBA 2K MyCareer) for a
strong "your player" identity, and modern sports apps (OneFootball, FotMob) for clear fixture
hierarchy and comfortable tap targets.

The identity is **green and gold**: deep pitch green (#075e45) and trophy gold (#efcf63) on a warm,
grass-tinted off-white. All illustration is **clean flat vector / cartoon**: procedural player
portraits, club crests and kits drawn as layered flat shapes with subtle tonal shading, no
photographs, no gradients-on-everything, no glassmorphism, no neon.

Design principles:
1. **One obvious next action.** Every screen leads with what the player should do now.
2. **Stable navigation.** Persistent left sidebar on desktop, bottom tab bar on mobile.
3. **Show the football.** Pitch, score, crests and opponents stay in view; numbers explain the game.
4. **Earned celebration.** Gold, motion and big type are spent on real rewards (goals, level-ups,
   trophies), not on chrome.
5. **Teach through transparency.** Every chance and rating is traceable to plain-language causes.

## Colors

- **Pitch green (primary #075e45):** primary buttons, active nav, hero panels. Hero panels use the
  green as a full-bleed field with soft vertical mowing stripes (alternating lighter green bands).
- **Trophy gold (secondary #efcf63):** the single most important call to action on a green hero,
  XP bars, level badges, "available points" chips, awards. Text on gold is dark green #153c2d.
- **Background #f4f5ee / surface #ffffff:** warm off-white page, white cards.
- **Soft tints:** green-tint #e0ebe2 for selected states, gold-tint #f4ead4 for highlights,
  blue-grey #e4ebee for neutral art backdrops.
- **Ink #23342a / muted #5e6c61:** green-tinted near-black text, never pure black.
- **Danger #a72d30** on #fff0ef for injuries, losses, warnings.
- **Dark theme** is a full equal: background #14251e, surface #1b2e25, soft surface #233a2e,
  ink #edf2e7, muted #b2c1b5, lines #354a3d, accent mint #9ed9b7. Gold stays #efcf63.

## Typography

- **Bebas Neue (display):** all page titles (very large, e.g. "CAREER HUB" at 64px), card
  headings, club names on fixtures, scorelines, big stat numbers. Always uppercase, tight leading.
- **Inter (UI):** body, labels, buttons, table data. Buttons are Inter 600. Use tabular figures
  for stats.
- Small uppercase letter-spaced eyebrows are used sparingly (at most one per hero), never over
  every section.

## Layout & Spacing

- **Desktop (primary):** 240px persistent left sidebar (logo shield + "PITCH TO GLORY" wordmark,
  icon + label nav, current save at the bottom), slim top bar with breadcrumb and save status,
  then a wide content area on a 12-column grid with ~20px gutters. Multi-column: hero card
  spanning 2/3 with a side panel at 1/3, then a row of three cards.
- **Mobile:** single column, 16px side gutters, bottom tab bar with 5 icons, hero first, every
  touch target at least 44px. Mobile is a designed layout, not a squeezed desktop.
- Generous spacing; content breathes. Avoid identical card grids: vary card sizes by importance.

## Elevation & Depth

- Cards: white, 1px line #dce3d8, radius 20px, very soft shadow (0 8px 28px rgb(27 48 33 / 0.04)).
- Hero panels: solid pitch green with mowing stripes, no border, radius 20px.
- No heavy drop shadows, no blur, no glass.

## Shapes

- Panels 20px radius, controls 12px radius, pills fully rounded.
- Crests are bold flat badges (shield, roundel, banner, chevron shapes) with a simple animal or
  emblem symbol in 2–3 club colours and a thin inner rim.
- Player portraits are flat cartoon busts in a circular frame: expressive face, layered hair,
  kit collar in club colours.

## Components

- **Primary button:** solid gold on green heroes (dark green text, arrow icon) or solid green on
  white surfaces (white text). 48px tall, 12px radius.
- **Secondary button:** white with 1px line border, ink text. Text links are underlined green.
- **Segmented tabs:** white pill container, selected segment solid green with white text.
- **Nav item:** icon + label; selected item has green-tint #e0ebe2 background and green text.
- **Fixture hero:** two crests facing each other with a large Bebas "V" between, club names in
  Bebas below, "YOUR CLUB" tag in gold, competition and week line, gold CTA.
- **Attribute row:** label, Bebas number right-aligned, thin green bar on a pale track with a
  small tick for the soft cap, "+1" stepper button.
- **Stat tile:** large Bebas number with a small Inter label.
- **Badges:** gold rounded "available" chip with a big Bebas number; green-tint pills for tags.
- **Pitch:** top-down flat pitch in alternating green stripes with white lines; players are flat
  circular tokens in kit colours with a shirt number; the user's player has a gold ring.
