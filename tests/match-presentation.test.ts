import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Club, DecisionChoice, Hex, Kit, MatchEvent, ReplayFrame } from '../src/model/domain';
import {
  DECISION_RATE,
  GOAL_BUILD_UP_BEATS,
  GOAL_HOLD_MS,
  MAX_RATE,
  MINUTE_MS,
  MIN_RATE,
  passageGoal,
  passagePace,
  passageWait,
} from '../src/screens/match/pace';
import { preparePassage, preparePlayback } from '../src/screens/match/playback';
import { choiceWorth } from '../src/screens/match/choices';
import { goalLine, goalStory } from '../src/screens/match/goals';
import { goalCopy } from '../src/i18n/goals';
import {
  chooseMatchKits,
  colourDifference,
  matchColours,
  safeDifference,
  standsOut,
} from '../src/engine/assets/clash';
import { MATCH_SURFACES, edgeStyle, kitAppearance } from '../src/screens/match/pitchKit';
import { CONFIG } from '../src/engine/config';

/** A passage of `steps` ground passes, `stepMs` of sporting time apart. */
function passage(
  steps: number,
  stepMs: number,
  extra: (index: number) => Partial<ReplayFrame> = () => ({}),
) {
  return Array.from({ length: steps + 1 }, (_, index) => ({
    timeMs: index * stepMs,
    ball: { x: 30 + index * 4, y: 50 },
    players: [{ id: 'a', point: { x: 30 + index * 4, y: 50 }, animation: 'run' }],
    ...(index ? { ballMotion: 'ground' as const } : {}),
    ...extra(index),
  })) as ReplayFrame[];
}
/** A passage ending in a goal: build-up passes, the shot, then the celebration. */
function goalPassage(buildUp: number) {
  const frames = passage(buildUp, 2000);
  const last = frames[frames.length - 1]!.timeMs;
  frames.push(
    {
      timeMs: last + 900,
      ball: { x: 101, y: 48 },
      players: frames[0]!.players,
      ballMotion: 'shot',
      beat: { kind: 'shot', actorId: 'a', eventId: 'shot-1', zone: 'final', flank: 'centre' },
    },
    {
      timeMs: last + 4400,
      ball: { x: 101, y: 48 },
      players: frames[0]!.players,
      ballMotion: 'dead',
      beat: {
        kind: 'celebration',
        actorId: 'a',
        eventId: 'goal-1',
        zone: 'final',
        flank: 'centre',
      },
    },
  );
  return frames;
}

describe('passage pace (step 5.1, review M2)', () => {
  it('fills each minute: no frozen pitch between minutes at 1×, 2× and 4×', () => {
    for (const sporting of [4500, 7900, 9100, 14750]) {
      const frames = passage(5, sporting / 5);
      for (const speed of [1, 2, 4]) {
        const pace = passagePace({ kind: 'minute', frames }, speed);
        const played = preparePassage(frames, pace);
        const wait = passageWait({ kind: 'minute', frames }, played.duration, speed);
        expect(played.duration).toBeCloseTo(MINUTE_MS / speed, 6);
        // The next minute is asked for as this one ends: the static share is zero.
        expect(wait).toBeCloseTo(played.duration, 6);
      }
    }
  });

  it('plays a typical minute at about 3–5× at 1×, within the clamp, and scales with speed', () => {
    const frames = passage(5, 9100 / 5);
    const at1 = passagePace({ kind: 'minute', frames }, 1).rate;
    expect(at1).toBeGreaterThan(3);
    expect(at1).toBeLessThan(5);
    expect(passagePace({ kind: 'minute', frames }, 2).rate).toBeCloseTo(at1 * 2, 6);
    expect(passagePace({ kind: 'minute', frames }, 4).rate).toBeCloseTo(at1 * 4, 6);
    expect(passagePace({ kind: 'minute', frames: passage(4, 100) }, 1).rate).toBe(MIN_RATE);
    expect(passagePace({ kind: 'minute', frames: passage(4, 60000) }, 1).rate).toBe(MAX_RATE);
  });

  it('was mostly frozen before: the old 18× pace left about two thirds of a minute static', () => {
    const frames = passage(5, 9100 / 5);
    const old = preparePlayback(frames, 18, MINUTE_MS * 0.95);
    expect(1 - old.duration / Math.max(MINUTE_MS, old.duration + 80)).toBeGreaterThan(0.6);
  });

  it('keeps key-moment build-ups and outcomes at decision pace, and kick-off still', () => {
    const frames = passage(4, 2000);
    expect(passagePace({ kind: 'outcome', frames }, 4)).toEqual({
      rate: DECISION_RATE,
      maxMs: 4200,
    });
    expect(passagePace({ kind: 'moment', frames }, 1)).toEqual({
      rate: DECISION_RATE,
      maxMs: 4200,
    });
    expect(passagePace({ kind: 'kickoff', frames }, 2)).toEqual({ rate: 1, maxMs: 0 });
  });
});

describe('goal pace (step 5.1, review M3)', () => {
  it('finds the goal, its shot and its event in a passage', () => {
    const frames = goalPassage(6);
    expect(passageGoal(frames)).toEqual({ celebration: 8, shot: 7, eventId: 'goal-1' });
    expect(passageGoal(passage(6, 2000))).toBeNull();
  });

  it('slows the build-up, shot and celebration to decision pace, then holds for the banner', () => {
    const frames = goalPassage(6);
    for (const speed of [1, 2, 4]) {
      const pace = passagePace({ kind: 'minute', frames }, speed);
      expect(pace.slow).toEqual({
        from: 7 - GOAL_BUILD_UP_BEATS,
        rate: DECISION_RATE * speed,
        maxMs: 4200 / speed,
      });
      const played = preparePassage(frames, pace);
      const from = pace.slow!.from;
      // The slow run-in takes its sporting time at decision pace (quick actions keep a
      // readable minimum), within its cap.
      const sporting = frames[frames.length - 1]!.timeMs - frames[from]!.timeMs;
      const slowPart = played.duration - played.times[from]!;
      expect(slowPart).toBeGreaterThanOrEqual(
        Math.min(4200 / speed, sporting / (DECISION_RATE * speed)) - 1e-6,
      );
      expect(slowPart).toBeLessThanOrEqual(4200 / speed + 1e-6);
      const wait = passageWait({ kind: 'minute', frames }, played.duration, speed);
      expect(wait).toBeCloseTo(
        Math.max(MINUTE_MS / speed, played.duration + GOAL_HOLD_MS / speed),
        6,
      );
    }
  });

  it('keeps a goal on screen far longer than the old minute pace did', () => {
    const frames = goalPassage(8);
    const old = preparePlayback(frames, 18, MINUTE_MS * 0.95);
    const oldFrom = 8 - GOAL_BUILD_UP_BEATS;
    const oldOnScreen = old.duration - old.times[oldFrom]! + Math.max(0, MINUTE_MS - old.duration);
    const pace = passagePace({ kind: 'minute', frames }, 1);
    const played = preparePassage(frames, pace);
    const onScreen =
      passageWait({ kind: 'minute', frames }, played.duration, 1) - played.times[pace.slow!.from]!;
    expect(onScreen).toBeGreaterThan(oldOnScreen * 2.5);
  });

  it('plays a passage whose run-in starts at its first keyframe at the slow pace throughout', () => {
    const frames = goalPassage(1);
    const pace = passagePace({ kind: 'minute', frames }, 1);
    expect(pace.slow!.from).toBe(0);
    expect(preparePassage(frames, pace)).toEqual(
      preparePlayback(frames, pace.slow!.rate, pace.slow!.maxMs),
    );
  });
});

const choice = (
  id: string,
  probability: number,
  stakes: Partial<DecisionChoice['stakes']>,
): DecisionChoice => ({
  id,
  labelKey: id,
  probability,
  factors: [],
  requiredTraitId: null,
  traitId: null,
  attributes: [],
  stakes: { successGoal: 0, successConcede: 0, failureGoal: 0, failureConcede: 0, ...stakes },
});

describe('choice value hint (step 5.1, review M14)', () => {
  it('marks the best expected goal swing, the near ones even and the far ones costly', () => {
    const worth = choiceWorth([
      // 0.6 × 0.1 = 0.06 net
      choice('pass', 0.6, { successGoal: 0.1 }),
      // 0.12 net: an unlikely shot worth more than the likely pass
      choice('shot', 0.12, { successGoal: 1 }),
      // 0.115 net: within the costly threshold of the best
      choice('cross', 0.23, { successGoal: 0.5 }),
    ]);
    // A long shot (below 40%) is never marked best value (X1a): its worth stays in "Why?".
    expect(worth.get('shot')!.value).toBe('even');
    expect(worth.get('cross')!.value).toBe('even');
    expect(worth.get('pass')!.value).toBe('costly');
    expect(worth.get('pass')!.best).toBeCloseTo(0.12, 6);
    expect(worth.get('pass')!.net).toBeCloseTo(0.06, 6);
  });

  it('counts goals conceded against a choice', () => {
    const worth = choiceWorth([
      choice('tackle', 0.7, { failureConcede: 0.3 }),
      choice('jockey', 0.9, { failureConcede: 0.05 }),
    ]);
    expect(worth.get('jockey')!.value).toBe('best');
    expect(worth.get('tackle')!.value).toBe('costly');
    expect(worth.get('tackle')!.against).toBeCloseTo(0.09, 6);
  });

  it('calls every choice even when they all lie within the tie threshold', () => {
    const { tie } = CONFIG.match.valueHint;
    const worth = choiceWorth([
      choice('a', 0.5, { successGoal: 0.1 }),
      choice('b', 0.5, { successGoal: 0.1 + tie }),
    ]);
    expect([...worth.values()].map((entry) => entry.value)).toEqual(['even', 'even']);
  });
});

const club = (id: string, name: string, colours: [Hex, Hex, Hex][], playerIds: string[] = []) =>
  ({
    id,
    name,
    playerIds,
    kits: Object.fromEntries(
      (['home', 'away', 'third'] as const).map((kit, index) => [
        kit,
        { pattern: 'solid', colors: colours[index]!, collar: 0, trim: 0, sponsor: 0 } as Kit,
      ]),
    ),
  }) as unknown as Club;

describe('goal lines (step 5.1, review M3)', () => {
  const home = club(
    'h',
    'Vale',
    [
      ['#ff0000', '#ffffff', '#000000'],
      ['#ffffff', '#ff0000', '#000000'],
      ['#000000', '#ffffff', '#ff0000'],
    ],
    ['h1', 'h2'],
  );
  const away = club(
    'a',
    'Ashby',
    [
      ['#0000ff', '#ffffff', '#000000'],
      ['#ffff00', '#000000', '#000000'],
      ['#00ff00', '#000000', '#000000'],
    ],
    ['a1'],
  );
  const setup = {
    home,
    away,
    neutral: false,
    players: {
      h1: { name: 'Robin Vale' },
      h2: { name: 'Sam Hill' },
      a1: { name: 'Kofi Roberts' },
    },
  } as never;
  const goal = (id: string, minute: number, teamId: string, playerId: string): MatchEvent =>
    ({
      id,
      minute,
      kind: 'goal',
      teamId,
      playerId,
      point: { x: 0, y: 0 },
      commentaryKey: '',
      outcome: null,
    }) as MatchEvent;

  it('has at least six lines for home and away goals, and score-aware ones for the rest', () => {
    expect(goalCopy.lines.home.length).toBeGreaterThanOrEqual(6);
    expect(goalCopy.lines.away.length).toBeGreaterThanOrEqual(6);
    for (const pool of ['equaliser', 'goAhead', 'lateEqualiser', 'lateGoAhead', 'ownGoal'] as const)
      expect(goalCopy.lines[pool].length).toBeGreaterThanOrEqual(3);
    for (const line of Object.values(goalCopy.lines).flat()) {
      expect(line).toContain('{scoreline}');
      expect(line).toMatch(/\{team\}|\{opponent\}/);
    }
  });

  it('reads the story from the events: opener, equaliser, go-ahead, late and own goals', () => {
    const events = [
      goal('g1', 10, 'h', 'h1'),
      goal('g2', 30, 'a', 'a1'),
      goal('g3', 60, 'h', 'h2'),
      goal('g4', 88, 'a', 'a1'),
      goal('g5', 90, 'h', 'a1'),
    ];
    const story = (index: number) => goalStory(setup, events, events[index]!);
    expect(story(0)).toMatchObject({ side: 0, score: [1, 0], context: 'other', own: false });
    expect(story(1)).toMatchObject({ side: 1, score: [1, 1], context: 'equaliser' });
    expect(story(2)).toMatchObject({ side: 0, score: [2, 1], context: 'goAhead', late: false });
    expect(story(3)).toMatchObject({ score: [2, 2], context: 'equaliser', late: true });
    expect(story(4)).toMatchObject({ side: 0, score: [3, 2], own: true });
    // Each line names the team credited and the new score.
    expect(goalLine(setup, story(1))).toContain('Ashby');
    expect(goalLine(setup, story(1))).toContain('Vale 1–1 Ashby');
    const filled = (line: string) =>
      line
        .replace('{scorer}', 'Kofi Roberts')
        .replace('{team}', 'Ashby')
        .replace('{opponent}', 'Vale')
        .replace('{scoreline}', 'Vale 2–2 Ashby');
    expect(goalCopy.lines.lateEqualiser.map(filled)).toContain(goalLine(setup, story(3)));
    expect(goalLine(setup, story(4))).toMatch(/own goal|wrong net/i);
    // The same goal always reads the same.
    expect(goalLine(setup, story(0))).toBe(goalLine(setup, story(0)));
  });
});

describe('team colours against the pitch and the cards (step 5.1, review U19)', () => {
  it('matches the surfaces in tokens.css', () => {
    const tokens = readFileSync('src/styles/tokens.css', 'utf8');
    const light = tokens.slice(tokens.indexOf(':root {'));
    expect(light).toContain(`--surface: ${MATCH_SURFACES.light};`);
    const dark = tokens.slice(tokens.indexOf(":root[data-theme='dark']"));
    expect(dark).toContain(`--surface: ${MATCH_SURFACES.dark};`);
    expect(tokens).toContain(`--color-night: ${MATCH_SURFACES.night};`);
  });

  it('draws a shirt that vanishes into the grass in another colour of its kit', () => {
    const grass = club('g', 'Grass', [
      ['#2e7a4e', '#ffffff', '#000000'],
      ['#ffffff', '#2e7a4e', '#000000'],
      ['#000000', '#2e7a4e', '#ffffff'],
    ]);
    const red = club('r', 'Red', [
      ['#d01c1f', '#ffffff', '#000000'],
      ['#d01c1f', '#ffffff', '#000000'],
      ['#d01c1f', '#ffffff', '#000000'],
    ]);
    expect(colourDifference(grass.kits.home.colors[0], MATCH_SURFACES.pitch)).toBeLessThan(
      CONFIG.accessibility.surfaceClash,
    );
    const colours = matchColours(grass, red, MATCH_SURFACES);
    expect(colours.home.colour).toBe('#ffffff');
    expect(colours.home.edge.pitch).toBe(false);
    // On a white card, the white shirt is outlined in the light theme only.
    expect(colours.home.edge).toMatchObject({ light: true, dark: false });
    // Red stays red for its fans; it is outlined on the grass where some viewers lose it.
    expect(colours.away.colour).toBe('#d01c1f');
    expect(colours.away.edge.pitch).toBe(!standsOut('#d01c1f', MATCH_SURFACES.pitch));
    expect(safeDifference(colours.home.colour, colours.away.colour).difference).toBeGreaterThan(
      CONFIG.accessibility.kitClash,
    );
  });

  it('outlines a navy or black shirt on the dark card and the scoreboard', () => {
    const navy = club('n', 'Navy', [
      ['#101c3a', '#ffffff', '#000000'],
      ['#101c3a', '#ffffff', '#000000'],
      ['#101c3a', '#ffffff', '#000000'],
    ]);
    const gold = club('y', 'Gold', [
      ['#f2c230', '#000000', '#000000'],
      ['#f2c230', '#000000', '#000000'],
      ['#f2c230', '#000000', '#000000'],
    ]);
    const appearance = kitAppearance(navy, gold);
    expect(appearance.home).toBe('#101c3a');
    expect(appearance.edge.home).toMatchObject({ light: false, dark: true, night: true });
    expect(edgeStyle(appearance.edge.home, 'card')).toEqual({
      boxShadow: 'inset 0 0 0 1.5px var(--edge-if-dark)',
    });
    expect(edgeStyle(appearance.edge.home, 'night')).toEqual({
      boxShadow: 'inset 0 0 0 1.5px var(--color-night-ink)',
    });
    expect(edgeStyle(appearance.edge.away, 'night')).toBeUndefined();
  });

  it('keeps the kit choice of the clash check', () => {
    const a = club('a', 'A', [
      ['#c8102e', '#ffffff', '#000000'],
      ['#ffffff', '#c8102e', '#000000'],
      ['#000000', '#c8102e', '#ffffff'],
    ]);
    const b = club('b', 'B', [
      ['#c8102e', '#ffffff', '#000000'],
      ['#f5f5f5', '#c8102e', '#000000'],
      ['#111111', '#ffffff', '#c8102e'],
    ]);
    expect(matchColours(a, b, MATCH_SURFACES).kits).toEqual(chooseMatchKits(a, b));
  });
});

describe('remembered match speed (step 5.1, review M19)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  it('remembers the speed per device and falls back to 1×', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
    const { rememberSpeed, storedSpeed } = await import('../src/screens/match/speed');
    expect(storedSpeed()).toBe(1);
    rememberSpeed(4);
    expect(storedSpeed()).toBe(4);
    expect(JSON.parse(store.get('ptg-match')!)).toEqual({ speed: 4 });
    store.set('ptg-match', JSON.stringify({ speed: 3 }));
    expect(storedSpeed()).toBe(1);
    store.set('ptg-match', 'not json');
    expect(storedSpeed()).toBe(1);
  });
});
