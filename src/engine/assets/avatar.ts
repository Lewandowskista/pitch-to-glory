import type { Avatar, Club, Crest, Hex, Kit, KitPattern } from '../../model/domain';
import { createRng, type Rng } from '../rng';
import { ART, item, mix, svg } from './shared';

/** How many options each portrait part has. Every option index runs from 0 to count - 1. */
export const AVATAR_OPTIONS = {
  face: 8,
  skin: 8,
  hair: 12,
  hairColor: 8,
  facialHair: 9,
  eyebrows: 8,
  eyes: 8,
  iris: 8,
  nose: 8,
  mouth: 8,
  accessory: 9,
} as const satisfies Record<keyof Avatar, number>;
export type AvatarPart = keyof typeof AVATAR_OPTIONS;
export const AVATAR_PARTS = Object.keys(AVATAR_OPTIONS) as AvatarPart[];
/** Parts added after the first save format; absent ones are derived by `resolveAvatar`. */
const DERIVED: ReadonlySet<AvatarPart> = new Set(['iris', 'nose', 'mouth']);

/** True when every part is a valid option index (the derived parts may be absent). */
export function isAvatar(value: unknown): value is Avatar {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const parts = value as Record<string, unknown>;
  if (Object.keys(parts).some((key) => !(key in AVATAR_OPTIONS))) return false;
  return AVATAR_PARTS.every((part) => {
    const option = parts[part];
    if (option === undefined) return DERIVED.has(part);
    return (
      Number.isInteger(option) &&
      (option as number) >= 0 &&
      (option as number) < AVATAR_OPTIONS[part]
    );
  });
}

/**
 * Fill in eye colour, nose and mouth when they are absent. They come from a side stream seeded by
 * the face, skin, eyebrows and eyes, which never change after generation (the wardrobe only
 * changes hair, hair colour, facial hair and accessories), so a person keeps the same features
 * for their whole career without any extra draw from the world's random streams.
 */
export function resolveAvatar(avatar: Avatar): Required<Avatar> {
  const rng = createRng(`avatar:${avatar.face}.${avatar.skin}.${avatar.eyebrows}.${avatar.eyes}`);
  const iris = rng.int(0, 7);
  const nose = rng.int(0, 7);
  const mouth = rng.int(0, 7);
  return {
    ...avatar,
    // Darker skin tones get dark brown or hazel eyes.
    iris: avatar.iris ?? (avatar.skin >= 5 ? DARK_IRIS[iris % DARK_IRIS.length]! : iris),
    nose: avatar.nose ?? nose,
    mouth: avatar.mouth ?? mouth,
  };
}

/**
 * One draw per part, in this order, as before the parts were widened: world generation and
 * every later draw depend on the count. `rng.int` over eight options never rejects (8 divides
 * 2^32); the wider parts map a single `next()` so they cannot take a second draw either.
 */
export function generateAvatar(rng: Rng): Avatar {
  return {
    face: rng.int(0, 7),
    skin: rng.int(0, 7),
    hair: Math.min(AVATAR_OPTIONS.hair - 1, Math.floor(rng.next() * AVATAR_OPTIONS.hair)),
    hairColor: rng.int(0, 7),
    facialHair: Math.min(
      AVATAR_OPTIONS.facialHair - 1,
      Math.floor(rng.next() * AVATAR_OPTIONS.facialHair),
    ),
    eyebrows: rng.int(0, 7),
    eyes: rng.int(0, 7),
    accessory: accessoryFrom(rng.next()),
  };
}
/** Most people wear nothing; the captain's armband is never handed out at random. */
const WORN = [1, 2, 4, 5, 6, 7, 8] as const;
function accessoryFrom(roll: number): number {
  const bare = 0.55;
  if (roll < bare) return 0;
  return WORN[Math.min(WORN.length - 1, Math.floor(((roll - bare) / (1 - bare)) * WORN.length))]!;
}

const SKIN = [
  '#f6d7bd',
  '#eec09a',
  '#dea77f',
  '#c98d62',
  '#ad7148',
  '#8c5536',
  '#6b3f29',
  '#4a2c1f',
] as const satisfies readonly Hex[];
/** Share the portrait's palette with full-body wardrobe artwork. */
export function avatarSkinColor(avatar: Pick<Avatar, 'skin'>): Hex {
  return item(SKIN, avatar.skin);
}
const HAIR_COLOR: readonly Hex[] = [
  '#1d2124',
  '#3b2a22',
  '#5e3a26',
  '#8a5a33',
  '#c08a4e',
  '#e2c27c',
  '#a8492c',
  '#d8d4cc',
];
const IRIS: readonly Hex[] = [
  '#4a3122',
  '#6b4626',
  '#2f5d7c',
  '#4e6b3a',
  '#7a5a2e',
  '#1f1712',
  '#5d7487',
  '#8a6a3a',
];
const DARK_IRIS = [0, 1, 5, 4] as const;
const FACES = [
  'M62 84Q62 40 100 40Q138 40 138 84Q138 112 126 124Q114 136 100 136Q86 136 74 124Q62 112 62 84Z',
  'M62 82Q62 40 100 40Q138 40 138 82L136 110Q132 127 116 133L100 137L84 133Q68 127 64 110Z',
  'M60 86Q60 40 100 40Q140 40 140 86Q140 133 100 135Q60 133 60 86Z',
  'M64 80Q64 38 100 38Q136 38 136 80L134 114Q128 138 100 140Q72 138 66 114Z',
  'M60 80Q60 40 100 40Q140 40 140 80Q140 104 128 118L100 138L72 118Q60 104 60 80Z',
  'M64 78Q66 40 100 40Q134 40 136 78L140 96L128 122L100 138L72 122L60 96Z',
  'M60 84Q60 40 100 40Q140 40 140 84L140 112Q138 128 120 134L100 136L80 134Q62 128 60 112Z',
  'M66 82Q66 38 100 38Q134 38 134 82Q134 118 118 132Q108 140 100 140Q92 140 82 132Q66 118 66 82Z',
];
/** Hairstyles: front (`f`), behind the head (`b`), over the shoulders (`o`) and highlight (`h`). */
interface Hairstyle {
  f: string;
  b?: string;
  o?: string;
  h: string;
  bald?: true;
}
const HAIR: readonly Hairstyle[] = [
  // Buzz cut
  { f: 'M63 76Q60 42 100 40Q140 42 137 76Q133 58 118 53Q100 49 82 53Q67 58 63 76Z', h: '' },
  // Short crop
  {
    f: 'M60 84Q55 36 100 33Q145 36 140 84L135 66Q122 60 110 62Q98 55 86 60Q72 60 65 70Z',
    h: 'M74 44Q92 36 112 40Q94 42 80 50Z',
  },
  // Curly top
  {
    f: 'M62 82Q52 62 62 50Q58 34 76 32Q84 20 100 26Q116 20 124 32Q142 34 138 50Q148 62 138 82Q134 64 120 61Q100 57 80 61Q66 64 62 82Z',
    h: 'M72 42Q78 34 88 36Q80 38 76 46Z M104 30Q114 28 120 36Q112 34 106 36Z',
  },
  // Afro
  {
    f: 'M58 84Q50 50 72 36Q100 24 128 36Q150 50 142 84Q136 66 122 60Q100 54 78 60Q64 66 58 84Z',
    b: 'M46 96Q30 52 58 28Q78 10 100 12Q122 10 142 28Q170 52 154 96Q148 80 140 72L60 72Q52 80 46 96Z',
    h: 'M62 40Q74 24 94 20Q78 30 70 46Z',
  },
  // Cornrows
  {
    f: 'M61 80Q58 38 100 36Q142 38 139 80Q134 60 120 54Q100 50 80 54Q66 60 61 80Z',
    o: 'M64 84L58 156Q62 160 67 156L71 90Z M136 84L142 156Q138 160 133 156L129 90Z',
    h: 'M78 40L74 56L77 56L81 40Z M92 37L90 52L93 52L95 37Z M105 37L107 52L110 52L108 37Z M119 40L123 56L126 56L122 40Z',
  },
  // Man bun
  {
    f: 'M62 78Q60 40 100 38Q140 40 138 78Q132 56 100 50Q68 56 62 78Z',
    b: 'M86 30Q86 14 100 14Q114 14 114 30Q114 42 100 42Q86 42 86 30Z',
    h: 'M74 50Q90 40 110 42Q92 46 78 56Z',
  },
  // Side part
  {
    f: 'M59 86Q54 36 98 31Q146 29 142 82L138 66Q128 50 100 50L92 47Q80 58 68 63Q62 72 59 86Z',
    h: 'M96 34Q122 32 136 50Q120 40 100 40Z',
  },
  // Long hair
  {
    f: 'M60 88Q55 34 100 33Q145 34 140 88L133 62Q118 48 101 47L99 47Q82 48 67 62Z',
    o: 'M60 80Q50 124 58 166L82 166L74 92Z M140 80Q150 124 142 166L118 166L126 92Z',
    h: 'M72 46Q84 38 96 38Q84 44 76 54Z',
  },
  // Bald
  { f: '', h: 'M80 47Q92 42 104 44Q92 47 84 53Z', bald: true },
  // Mohawk
  {
    f: 'M88 44Q88 20 100 12Q112 20 112 44Q100 48 88 44Z M63 76Q62 52 80 46Q70 58 66 78Z M137 76Q138 52 120 46Q130 58 134 78Z',
    h: 'M96 22Q100 15 104 22L102 38L98 38Z',
  },
  // Dreadlocks
  {
    f: 'M60 84Q55 34 100 32Q145 34 140 84Q136 62 126 56L120 68L112 54L100 66L88 54L80 68L74 56Q64 62 60 84Z',
    o: 'M58 78L48 146Q54 152 60 146L66 92Z M68 72L64 156Q70 162 76 156L78 86Z M142 78L152 146Q146 152 140 146L134 92Z M132 72L136 156Q130 162 124 156L122 86Z',
    h: 'M74 42Q90 34 108 36Q90 40 78 50Z',
  },
  // Quiff
  {
    f: 'M60 82Q56 44 72 32Q86 16 112 18Q140 22 140 50L140 82L135 64Q124 54 104 54Q84 54 70 60Q63 68 60 82Z',
    h: 'M84 25Q104 17 124 26Q104 25 90 32Z',
  },
];
const BROWS = [
  'M74 74L90 73M110 73L126 74',
  'M73 76Q82 69 91 74M109 74Q118 69 127 76',
  'M73 72L91 77M109 77L127 72',
  'M74 75Q82 72 90 75M110 75Q118 72 126 75',
  'M73 77L84 72L91 74M109 74L116 72L127 77',
  'M74 73Q84 75 90 78M110 78Q116 75 126 73',
  'M72 76Q80 69 92 72M108 72Q120 69 128 76',
  'M74 76Q82 74 90 76M110 76Q118 74 126 76',
];
const BROW_WIDTH = [4.6, 4.2, 5, 3.8, 5.4, 4, 4.4, 6];
/** Eye shapes differ in how open they are. */
const EYE_HEIGHT = [5, 4, 5.8, 4.5, 3.6, 5.4, 6.2, 4.2];
const NOSES = [
  'M99 88L95 103Q100 106.5 105 103L101 88Z',
  'M98 90L91 103Q100 109 109 103L102 90Z',
  'M94.5 101Q100 106 105.5 101Q100 103.5 94.5 101Z',
  'M99 86L93 102Q96 105 100 104Q104 105 107 102L101 86Z',
  'M96 99Q100 108 104 99Q106 104 100 106.5Q94 104 96 99Z',
  'M98 88Q96 98 92 102Q100 108 108 102Q103 98 102 88Z',
  'M99 90L96 103Q100 105 104 103Z',
  'M97 88L90 104Q100 111 110 104L103 88Z',
];
/** Mouths (`m`) with teeth (`t`) where the mouth is open. */
const MOUTHS: readonly { m: string; t: string }[] = [
  { m: 'M89 115Q100 122 111 115Q100 125 89 115Z', t: '' },
  {
    m: 'M88 113Q100 128 112 113Q100 117 88 113Z',
    t: 'M90 114Q100 117.5 110 114L109 116.5Q100 119.5 91 116.5Z',
  },
  { m: 'M90 117Q100 119 110 116L110 118.4Q100 121.4 90 119.4Z', t: '' },
  { m: 'M90 118Q102 121 112 113L113 115.5Q103 124 90 120.4Z', t: '' },
  { m: 'M87 113Q100 133 113 113Z', t: 'M89 114L111 114L110 117Q100 119 90 117Z' },
  { m: 'M93 118Q100 120 107 118L107 119.8Q100 122 93 119.8Z', t: '' },
  { m: 'M85 114Q100 124 115 114Q100 128 85 114Z', t: '' },
  { m: 'M92 117Q100 114 108 117Q100 122.5 92 117Z', t: '' },
];
const MOUSTACHE = ' M88 112Q100 106 112 112L110 115.5Q100 111.5 90 115.5Z';
/** Facial hair (`d`) and its full-grown opacity (`o`): stubble stays faint. */
const BEARDS: readonly { d: string; o: number }[] = [
  { d: '', o: 0 },
  {
    d:
      'M66 104Q68 134 100 138Q132 134 134 104Q128 124 114 126Q100 120 86 126Q72 124 66 104Z' +
      MOUSTACHE,
    o: 0.3,
  },
  {
    d:
      'M64 96Q64 142 100 148Q136 142 136 96L130 110Q126 128 112 126Q100 121 88 126Q74 128 70 110Z' +
      MOUSTACHE,
    o: 0.96,
  },
  { d: 'M92 124Q100 122 108 124L106 137Q100 141 94 137Z' + MOUSTACHE, o: 0.96 },
  { d: 'M86 113Q100 104 114 113L111 117Q100 111 89 117Z', o: 0.96 },
  {
    d:
      'M66 100Q68 136 100 141Q132 136 134 100L128 112Q122 126 110 127Q100 122 90 127Q78 126 72 112Z' +
      MOUSTACHE,
    o: 0.96,
  },
  { d: 'M64 98Q64 140 100 146Q136 140 136 98L131 102Q130 134 100 140Q70 134 69 102Z', o: 0.96 },
  { d: 'M97 124L103 124L101.5 131L98.5 131Z', o: 0.96 },
  {
    d:
      'M62 94Q60 152 100 162Q140 152 138 94L130 110Q126 128 112 126Q100 121 88 126Q74 128 70 110Z' +
      MOUSTACHE,
    o: 0.96,
  },
];
/**
 * Accessories: none, headband, ear studs, captain's armband (on the shoulder), nose strip, hoop
 * earring, plaster, necklace and a headband in the club's colour.
 */
const ACCESSORIES: readonly { d: string; color: Hex | 'club' | null; armband?: true }[] = [
  { d: '', color: null },
  { d: 'M61 60Q100 46 139 60L139 69Q100 55 61 69Z', color: '#f7f3ea' },
  {
    d: 'M56.8 101a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0Z M136.8 101a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0Z',
    color: ART.gold,
  },
  { d: '', color: null, armband: true },
  { d: 'M93 95L107 95L107 99.6L93 99.6Z', color: '#f7f3ea' },
  {
    d: 'M133 103a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0 -11 0Z M135.4 103a3.1 3.1 0 1 0 6.2 0a3.1 3.1 0 1 0 -6.2 0Z',
    color: ART.gold,
  },
  { d: 'M114 66L128 62L129.5 66.6L115.5 70.6Z', color: '#f1d3b0' },
  { d: 'M84 152Q100 168 116 152L116 154.6Q100 171 84 154.6Z', color: ART.gold },
  { d: 'M61 60Q100 46 139 60L139 69Q100 55 61 69Z', color: 'club' },
];

const SHIRT = 'M16 210Q18 166 58 156L85 146Q100 158 115 146L142 156Q182 166 184 210Z';
/** Crew, V and polo collars; the kit's eight collar styles fold onto these three. */
const COLLARS = [
  'M84 146Q100 162 116 146L121 150Q100 171 79 150Z',
  'M82 147L100 172L118 147L123 151L100 181L77 151Z',
  'M79 145L100 166L121 145L130 158L108 164L100 177L92 164L70 158Z',
];
const KIT_COLLAR = [0, 1, 2, 0, 0, 2, 1, 0] as const;
const PATTERNS: Record<KitPattern, string> = {
  solid: '',
  stripes: 'M42 140h13v80h-13Z M68 140h13v80h-13Z M119 140h13v80h-13Z M145 140h13v80h-13Z',
  hoops: 'M0 168h200v11h-200Z M0 192h200v11h-200Z',
  halves: 'M100 140h100v80h-100Z',
  sash: 'M150 150L170 158L72 214L48 214Z',
  chevron: 'M0 170L100 194L200 170L200 182L100 206L0 182Z',
  pinstripe:
    'M46 140h2.4v80h-2.4Z M62 140h2.4v80h-2.4Z M78 140h2.4v80h-2.4Z M120 140h2.4v80h-2.4Z M136 140h2.4v80h-2.4Z M152 140h2.4v80h-2.4Z',
  gradient: '',
};
const BADGE = 'M126 172H138V180Q138 187 132 189Q126 187 126 180Z';
const BADGE_INNER = 'M128.6 174.4H135.4V180Q135.4 184.6 132 186Q128.6 184.6 128.6 180Z';
const ARMBAND = 'M148 164L180 172L177 188L145 180Z';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const fixed = (value: number) => value.toFixed(2);

/** What the portrait wears: a club kit and crest, or the neutral brand colours without one. */
export interface AvatarDress {
  kit?: Kit;
  crest?: Crest;
  /** The disc behind the bust. */
  background?: Hex;
  /** Draw only the head and neck, without the disc or shirt, for composing a figure. */
  headOnly?: boolean;
}

/** A club's home kit and crest, or the neutral shirt when there is no club. */
export function clubDress(club: Pick<Club, 'kits' | 'crest'> | null | undefined): AvatarDress {
  return club ? { kit: club.kits.home, crest: club.crest } : {};
}

/**
 * The head, neck and hair as an SVG fragment in the portrait's 200 x 200 space, for composing
 * a figure or the full portrait. `accent` colours the club headband.
 */
export function avatarHead(avatar: Avatar, age: number, accent: Hex = ART.gold): string {
  const layers = headLayers(avatar, age, accent);
  return `${layers.back}${layers.over}${layers.neck}${layers.face}`;
}

function headLayers(input: Avatar, age: number, accent: Hex) {
  if (!Number.isFinite(age) || age < 0 || age > 110) throw new RangeError('Invalid avatar age');
  const avatar = resolveAvatar(input);
  const skin = avatarSkinColor(avatar);
  const shade = mix(skin, '#3a1d12', 0.2);
  const deep = mix(skin, '#2a140c', 0.45);
  const grey = clamp((age - 30) / 12) * 0.85;
  const lines = clamp((age - 27) / 14);
  const youth = clamp((age - 15.5) / 6);
  const hair = mix(item(HAIR_COLOR, avatar.hairColor), '#d6d2ca', grey);
  const style = item(HAIR, avatar.hair);
  const light = style.bald ? mix(skin, '#ffffff', 0.35) : mix(hair, '#ffffff', 0.22);
  const open = item(EYE_HEIGHT, avatar.eyes);
  const white = (cx: number) => `M${cx - 7.5} 86a7.5 ${open} 0 1 0 15 0a7.5 ${open} 0 1 0 -15 0Z`;
  const lid = (cx: number) => `M${cx - 8.5} 85Q${cx} ${86 - open - 2.2} ${cx + 8.5} 85`;
  const mouth = item(MOUTHS, avatar.mouth);
  const beard = item(BEARDS, avatar.facialHair);
  const accessory = item(ACCESSORIES, avatar.accessory);
  const iris = item(IRIS, avatar.iris);
  const shift = -clamp((age - 29) / 10) * 7;
  const accessoryColor = accessory.color === 'club' ? accent : accessory.color;
  const beardOpacity = beard.o * (beard.o < 0.5 ? 1 : 0.35 + youth * 0.65);
  const face = [
    `<ellipse cx="62" cy="91" rx="7.5" ry="11.5" fill="${skin}"/><ellipse cx="138" cy="91" rx="7.5" ry="11.5" fill="${skin}"/>`,
    `<path d="M60 86Q64 91 61 97M140 86Q136 91 139 97" stroke="${deep}" stroke-width="1.8" stroke-linecap="round" opacity=".5"/>`,
    `<path d="${item(FACES, avatar.face)}" fill="${skin}"/>`,
    `<path d="M127 64Q138 82 136 104Q132 126 112 135Q128 118 130 100Q131 82 127 64Z" fill="${shade}" opacity=".6"/>`,
    `<path d="M71 104a8 4.5 0 1 0 16 0a8 4.5 0 1 0 -16 0Z M113 104a8 4.5 0 1 0 16 0a8 4.5 0 1 0 -16 0Z" fill="#e26b5f" opacity="${fixed(0.2 * (1 - lines * 0.6))}"/>`,
    lines > 0
      ? `<path data-ageing="wrinkles" d="M84 60Q100 56 116 60M86 66Q100 63 114 66M73 93L67 91M73 97L67 98M127 93L133 91M127 97L133 98M91 104Q86 112 88 119M109 104Q114 112 112 119M76 94Q82 97 88 94M112 94Q118 97 124 94" stroke="${deep}" stroke-width="1.6" stroke-linecap="round" opacity="${fixed(lines * 0.6)}"/>`
      : '',
    `<path d="${white(82.5)} ${white(117.5)}" fill="#fffaf2"/>`,
    `<circle cx="82.5" cy="86.5" r="3.9" fill="${iris}"/><circle cx="117.5" cy="86.5" r="3.9" fill="${iris}"/>`,
    `<circle cx="82.5" cy="86.5" r="1.9" fill="#17110d"/><circle cx="117.5" cy="86.5" r="1.9" fill="#17110d"/>`,
    `<circle cx="83.8" cy="85.2" r="1.1" fill="#ffffff"/><circle cx="118.8" cy="85.2" r="1.1" fill="#ffffff"/>`,
    `<path d="${lid(82.5)} ${lid(117.5)}" stroke="#2a1d17" stroke-width="2.2" stroke-linecap="round"/>`,
    `<path d="${item(NOSES, avatar.nose)}" fill="${shade}"/>`,
    `<path d="${mouth.m}" fill="${mix(shade, '#7a2a24', 0.45)}"/>`,
    mouth.t ? `<path d="${mouth.t}" fill="#fffaf2"/>` : '',
    beard.d ? `<path d="${beard.d}" fill="${hair}" opacity="${fixed(beardOpacity)}"/>` : '',
    `<g data-hairline="${fixed(shift)}"${grey > 0 ? ` data-gray="${fixed(grey)}"` : ''} transform="translate(0 ${fixed(shift)})">`,
    style.f ? `<path d="${style.f}" fill="${hair}"/>` : '',
    style.h ? `<path d="${style.h}" fill="${light}"/>` : '',
    '</g>',
    `<path d="${item(BROWS, avatar.eyebrows)}" stroke="${mix(hair, '#1a120d', 0.25)}" stroke-width="${item(BROW_WIDTH, avatar.eyebrows)}" stroke-linecap="round"/>`,
    accessory.d && accessoryColor
      ? `<path d="${accessory.d}" fill="${accessoryColor}" fill-rule="evenodd"/>`
      : '',
  ].join('');
  return {
    back: style.b ? `<path d="${style.b}" fill="${hair}"/>` : '',
    over: style.o ? `<path d="${style.o}" fill="${hair}"/>` : '',
    neck: `<path d="M85 118L85 150Q100 162 115 150L115 118Z" fill="${skin}"/><path d="M85 124Q100 140 115 124L115 140Q100 152 85 140Z" fill="${shade}"/>`,
    face,
    armband: Boolean(accessory.armband),
  };
}

/**
 * A flat vector bust in a disc: the head over the shirt of the given kit, with the crest as the
 * chest badge. Without a kit the shirt is in the brand's green and gold. The SVG's IDs are
 * prefixed with `id` so composed artwork can hold several portraits.
 */
export function renderAvatar(
  avatar: Avatar,
  age: number,
  dress: AvatarDress = {},
  id = 'av',
): string {
  const [base, accent, light] = dress.kit?.colors ?? [ART.field, ART.gold, ART.heroInk];
  const layers = headLayers(avatar, age, accent);
  if (dress.headOnly)
    return svg(`${layers.back}${layers.over}${layers.neck}${layers.face}`, '0 0 200 200');
  const kit = dress.kit;
  const pattern =
    kit?.pattern === 'gradient'
      ? Array.from(
          { length: 8 },
          (_, i) =>
            `<path d="M0 ${150 + i * 8}h200v8h-200Z" fill="${accent}" opacity="${fixed((i + 1) / 9)}"/>`,
        ).join('')
      : kit && PATTERNS[kit.pattern]
        ? `<path d="${PATTERNS[kit.pattern]}" fill="${accent}"/>`
        : '';
  const collar = COLLARS[kit ? item(KIT_COLLAR, kit.collar) : 0]!;
  const badge = dress.crest
    ? `<path d="${BADGE}" fill="${dress.crest.colors[0]}"/><path d="${BADGE_INNER}" fill="${dress.crest.colors[1]}"/>`
    : `<path d="${BADGE}" fill="${kit ? light : ART.gold}"/>`;
  return svg(
    [
      `<defs><clipPath id="${id}-disc"><circle cx="100" cy="100" r="100"/></clipPath><clipPath id="${id}-shirt"><path d="${SHIRT}"/></clipPath></defs>`,
      `<g clip-path="url(#${id}-disc)">`,
      `<rect width="200" height="200" fill="${dress.background ?? ART.artBlue}"/>`,
      `<path d="M0 0H34V200H0Z M68 0H102V200H68Z M136 0H170V200H136Z" fill="#ffffff" opacity=".22"/>`,
      layers.back,
      `<path d="${SHIRT}" fill="${base}"/>`,
      `<g clip-path="url(#${id}-shirt)">${pattern}<path d="M0 150Q40 156 62 158Q72 180 66 210H0Z" fill="#000000" opacity=".14"/><path d="M138 158Q162 160 200 166V152Q170 150 138 154Z" fill="#ffffff" opacity=".12"/></g>`,
      layers.over,
      layers.neck,
      `<path d="${collar}" fill="${accent}"/>`,
      badge,
      layers.armband ? `<path d="${ARMBAND}" fill="${ART.gold}"/>` : '',
      layers.face,
      '</g>',
    ].join(''),
    '0 0 200 200',
  );
}
