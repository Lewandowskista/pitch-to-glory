import { beforeAll, describe, expect, it } from 'vitest';
import type { AwardKind, Hex, Tournament, World } from '../src/model/domain';
import { generateWorld } from '../src/engine/world/generate';
import { CONTINENTAL_IDS } from '../src/engine/world/continental';
import { createCareer, trialOffers, type CareerDraft } from '../src/engine/career/create';
import { LIFESTYLE } from '../src/engine/career/lifestyle';
import { COSMETICS } from '../src/engine/career/lifestyle/catalogue';
import { medalFor, renderTrophy, TROPHY_KINDS, trophyKindFor } from '../src/engine/assets/trophies';
import { counterpartOf, FLAG_COUNTERPARTS, renderFlag } from '../src/engine/assets/flags';
import { LIFESTYLE_ART_IDS, renderLifestyle } from '../src/engine/assets/lifestyle';
import {
  INTENSITIES,
  PITCH_STATES,
  pitchStateFor,
  renderPitch,
  renderWeather,
  WEATHERS,
} from '../src/engine/assets/conditions';
import {
  CELEBRATION_POSE_IDS,
  celebrationToken,
  renderCelebration,
} from '../src/engine/assets/celebrations';
import { renderStadium } from '../src/engine/assets/stadium';
import { TONE } from '../src/engine/assets/illustration';
import { contrastRatio, PALETTES } from '../src/engine/assets/shared';
import { posterSvg } from '../src/screens/career/chroniclePoster';

const ids = (svg: string) => [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]!);

/** Standalone, inert SVG whose every url(#…) reference resolves inside it. */
function expectSafe(svg: string) {
  expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  expect(svg).toContain('viewBox=');
  expect(svg).toMatch(/<\/svg>$/);
  expect(svg).not.toMatch(
    /script|foreignObject|https?:\/\/(?!www.w3.org)|\son[a-z]+=|undefined|NaN/,
  );
  const own = ids(svg);
  expect(new Set(own).size).toBe(own.length);
  for (const reference of svg.matchAll(/url\(#([^)]+)\)/g)) expect(own).toContain(reference[1]);
  return own;
}

/** Every output renders safely, distinctly, and never shares a resource id with another. */
function expectFamily(outputs: string[]) {
  const all = outputs.flatMap(expectSafe);
  expect(new Set(all).size).toBe(all.length);
  expect(new Set(outputs).size).toBe(outputs.length);
}

describe('illustrations', () => {
  it('draws every trophy, alone and on its disc', () => {
    expectFamily(TROPHY_KINDS.map((kind) => renderTrophy(kind)));
    expectFamily(TROPHY_KINDS.map((kind) => renderTrophy(kind, false)));
    expectFamily(TROPHY_KINDS.map((kind) => renderTrophy(kind, 'plate')));
    expect(renderTrophy('league')).toContain(`fill="${TONE.field}"`);
    expect(renderTrophy('league', 'plate')).toContain(`fill="${TONE.plate}"`);
    expect(() => renderTrophy('bogus' as never)).toThrow();
    expect([1, 2, 3, 4].map(medalFor)).toEqual([
      'medal-gold',
      'medal-silver',
      'medal-bronze',
      'medal-bronze',
    ]);
  });

  it('draws the six real flags, distinct two-colour fallbacks, and rejects bad colours', () => {
    expectFamily(FLAG_COUNTERPARTS.map((country) => renderFlag(country)));
    const fallbacks = Array.from({ length: 5 }, (_, pattern) =>
      renderFlag(undefined, { colors: ['#123c69', '#ffffff'], pattern }),
    );
    expectFamily(fallbacks);
    expectSafe(renderFlag(null));
    expect(() => renderFlag(null, { colors: ['red' as Hex, '#ffffff'] })).toThrow();
    for (const country of FLAG_COUNTERPARTS) expect(counterpartOf(country)).toBe(country);
    expect(counterpartOf('Ostrava')).toBeNull();
  });

  it('draws every lifestyle item in the catalogue, and a fallback for new ones of a kind', () => {
    expect(LIFESTYLE_ART_IDS).toEqual(expect.arrayContaining(LIFESTYLE.map((item) => item.id)));
    expectFamily(LIFESTYLE.map((item) => renderLifestyle(item.id)));
    expect(renderLifestyle('car:new-model', 'car')).toBe(renderLifestyle('car:hatch'));
    expect(renderLifestyle('house:castle')).toBe(renderLifestyle('house:flat'));
    expect(() => renderLifestyle('yacht:big')).toThrow();
  });

  it('draws weather at three intensities and four pitch states', () => {
    expectFamily(
      WEATHERS.flatMap((weather) =>
        INTENSITIES.map((intensity) => renderWeather(weather, intensity)),
      ),
    );
    expect(renderWeather('rain')).toBe(renderWeather('rain', 'steady'));
    expectFamily(PITCH_STATES.map(renderPitch));
    expect(pitchStateFor('snow', 95)).toBe('frozen');
    expect(pitchStateFor('rain', 95)).toBe('heavy');
    expect(pitchStateFor('clear', 40)).toBe('heavy');
    expect(pitchStateFor('clear', 90)).toBe('firm');
    expect(pitchStateFor('wind', 90)).toBe('good');
  });

  it('poses every catalogue celebration in readable kit colours', () => {
    const catalogue = COSMETICS.filter((item) => item.kind === 'celebration').map((i) => i.id);
    expect([...CELEBRATION_POSE_IDS].sort()).toEqual([...catalogue].sort());
    expectFamily(catalogue.map((id) => renderCelebration(id)));
    for (const [shirt, trim] of PALETTES) {
      const token = celebrationToken([shirt, trim]);
      expect(contrastRatio(token.shirt, token.trim)).toBeGreaterThanOrEqual(3);
      expectSafe(renderCelebration('celebration:robot', [shirt, trim], 10));
    }
    expect(renderCelebration('celebration:spin', ['#e0802c', '#2a2320'], 7)).toContain('>7</text>');
    expect(() => renderCelebration('celebration:moonwalk')).toThrow();
  });

  it('paints the stadium in the club colours and keeps the visitors visible', () => {
    const outputs = PALETTES.map((colors) => renderStadium(colors));
    expectFamily(outputs);
    PALETTES.forEach((colors, index) => {
      expect(outputs[index]).toContain(`fill="${colors[0]}"`);
      expect(outputs[index]).toContain(`fill="${colors[1]}"`);
    });
    // Gold home colours swap the visitors to the dark plate.
    expect(renderStadium(['#e9bd4f', '#202f40', '#fcf5e9'])).toContain(`fill="${TONE.plate}"`);
    expect(() => renderStadium(['#fff', '#000000', '#000000'] as never)).toThrow();
  });
});

describe('illustration mapping in generated worlds', () => {
  const awards: AwardKind[] = [
    'month',
    'team-season',
    'golden-boot',
    'young-player',
    'mvp',
    'golden-ball',
  ];
  let national: World;
  let legacy: World;
  beforeAll(() => {
    national = generateWorld('illustrations-national');
    legacy = generateWorld('illustrations-legacy', { format: 'legacy' });
  }, 120000);

  it('gives every competition, award and tournament a trophy', () => {
    for (const world of [national, legacy]) {
      for (const id of Object.keys(world.leagues)) expect(trophyKindFor(id)).toBe('league');
      for (const competition of Object.values(world.competitions)) {
        const kind = trophyKindFor(competition.id);
        expect(TROPHY_KINDS).toContain(kind);
        if (competition.kind === 'champions') expect(kind).toBe('continental');
        else if (competition.kind === 'continental') expect(kind).toBe('shield');
        else expect(kind).toBe('cup');
      }
    }
    expect(CONTINENTAL_IDS.map(trophyKindFor)).toEqual(['continental', 'shield']);
    // Portugal's deciding phase and championship final crown a division: league trophies.
    expect(trophyKindFor('country:5:2026:liga-3-promotion')).toBe('league');
    expect(trophyKindFor('country:5:2026:campeonato-championship')).toBe('league');
    expect(awards.map(trophyKindFor)).toEqual([
      'medal-gold',
      'medal-gold',
      'golden-boot',
      'medal-gold',
      'medal-gold',
      'golden-ball',
    ]);
    const tournaments: Tournament['kind'][] = ['continental', 'world'];
    expect(tournaments.map(trophyKindFor)).toEqual(['international', 'international']);
  });

  it('flags every country: real counterparts in national worlds, fallbacks in legacy ones', () => {
    for (const country of Object.values(national.countries)) {
      expect(FLAG_COUNTERPARTS).toContain(country.counterpart);
      expect(renderFlag(country.counterpart)).toBe(renderFlag(counterpartOf(country.name) ?? null));
    }
    const legacyFlags = Object.values(legacy.countries).map((country) => {
      expect(country.counterpart).toBeUndefined();
      const nation = legacy.international?.nations.find((n) => n.countryId === country.id);
      return renderFlag(country.counterpart, nation && { colors: nation.colors });
    });
    legacyFlags.forEach(expectSafe);
  });
});

describe('Chronicle poster', () => {
  const draft: CareerDraft = {
    name: 'Robin Vale',
    avatar: {
      face: 1,
      skin: 2,
      hair: 3,
      hairColor: 4,
      facialHair: 0,
      eyebrows: 1,
      eyes: 2,
      accessory: 3,
    },
    nationalityId: 'country:0',
    position: 'ST',
    foot: 'left',
    age: 17,
    archetype: 'finisher',
  };
  let world: World;
  beforeAll(() => {
    const base = generateWorld('poster-tests', { format: 'legacy' });
    const trial = trialOffers(base, 'country:0', 'poster-tests')[0]!;
    world = createCareer(base, draft, trial.id, 'poster-tests');
    const player = world.players[world.career!.playerId]!;
    const season = world.date.season;
    world.trophies.push(
      {
        id: 't1',
        competitionId: 'league:0:1',
        season,
        clubId: player.clubId!,
        playerIds: [player.id],
      },
      { id: 't2', competitionId: 'cup:0', season, clubId: player.clubId!, playerIds: [player.id] },
      {
        id: 't3',
        competitionId: 'continental:champions',
        season,
        clubId: player.clubId!,
        playerIds: [player.id],
      },
    );
    world.awards.push({
      id: 'a1',
      kind: 'golden-ball',
      season,
      month: null,
      competitionId: null,
      winnerIds: [player.id],
      shortlist: [],
      value: 400,
    });
  }, 120000);

  it('uses only design tokens, shows the trophies and crest, and keeps 1080 × 1350', () => {
    const player = world.players[world.career!.playerId]!;
    const entries = world.chronicle.filter((entry) => entry.playerId === player.id);
    const svg = posterSvg(world, player, entries);
    const first = expectSafe(svg);
    const second = expectSafe(posterSvg(world, player, entries));
    expect(first.some((id) => second.includes(id))).toBe(false);
    expect(svg).toContain('viewBox="0 0 1080 1350"');
    for (const stale of ['#0b3d2c', '#f1cf58', '#f9f5e9']) expect(svg).not.toContain(stale);
    // Embedded art (portrait, crest) is URL-encoded, so every raw colour is the poster's own.
    const tokens = new Set<string>(Object.values(TONE));
    for (const [color] of svg.matchAll(/#[0-9a-f]{6}\b/gi)) expect(tokens).toContain(color);
    expect(svg.match(/translate\(4\.5 4\.5\) scale\(\.86\)/g)).toHaveLength(4);
    expect(svg).toContain(`x="872" y="92"`);
    expect(svg).toContain("font-family=\"'Bebas Neue'");
    expect(svg).toContain('Robin Vale');
    // Embedded fonts go into the definitions.
    const fonts = "<style>@font-face{font-family:'Bebas Neue'}</style>";
    expect(posterSvg(world, player, entries, fonts)).toContain(`<defs>${fonts}`);
  });

  it('collapses a long run of silverware into a count', () => {
    const many = structuredClone(world);
    const player = many.players[many.career!.playerId]!;
    for (let index = 0; index < 30; index++)
      many.trophies.push({
        id: `x${index}`,
        competitionId: 'league:0:1',
        season: many.date.season + index,
        clubId: player.clubId!,
        playerIds: [player.id],
      });
    const svg = posterSvg(many, player, []);
    expect(svg.match(/translate\(4\.5 4\.5\) scale\(\.86\)/g)).toHaveLength(19);
    expect(svg).toContain('>+15</text>');
  });
});
