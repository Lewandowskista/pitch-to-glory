import type { Avatar, Crest, Hex, Kit, KitPattern, SleeveLength } from '../../model/domain';
import { avatarHead, avatarSkinColor } from './avatar';
import { ART, colors, item, svg } from './shared';

/**
 * Wardrobe artwork (milestone 7, redrawn in the redesign): the career player head to boots, in
 * the club kit with their sleeve length, captain's armband, socks and boots. One flat vector
 * figure; the head is the portrait's, scaled to the body.
 */
export interface FigureDress {
  kit: Kit;
  crest?: Crest;
  sleeves: SleeveLength;
  /** Armband fill and lettering, or null for none. */
  armband: [Hex, Hex] | null;
  /** Sock style id from the cosmetics catalogue, such as `socks:taped`. */
  socks: string;
  /** Boot colour and trim. */
  boots: [Hex, Hex];
}

const OUTLINE = 'stroke="#182a35" stroke-opacity=".22" stroke-width="1.5" stroke-linejoin="round"';
// Body parts in a 200 x 250 space; the figure moves the body below the head.
const SHIRT =
  'M40 18Q66 6 84 2Q100 16 116 2Q134 6 160 18L192 60L166 76L152 60L152 120L48 120L48 60L34 76L8 60Z';
const ARM = 'M12 60L34 74L32 118Q30 128 22 126Q14 124 14 116L6 70Z';
const SHORTS = 'M50 112H150L158 162H106L100 140L94 162H42Z';
const COLLARS = [
  'M84 2Q100 18 116 2L121 6Q100 30 79 6Z',
  'M84 2L100 26L116 2L121 6L100 34L79 6Z',
  'M80 1L100 22L120 1L128 14L108 20L100 32L92 20L72 14Z',
];
/** The kit's eight collar styles fold onto crew, V and polo, as on the portrait. */
const KIT_COLLAR = [0, 1, 2, 0, 0, 2, 1, 0] as const;
const BADGE = 'M124 30H138V40Q138 47 131 49Q124 47 124 40Z';
const BADGE_INNER = 'M126.5 32.5H135.5V40Q135.5 44.6 131 46.2Q126.5 44.6 126.5 40Z';
const HEAD_SCALE = 0.8;
/** Where the body starts below the scaled head, so the collar meets the neck. */
const BODY_TOP = 118;

function shirtPattern(pattern: KitPattern, accent: Hex): string {
  const fill = (d: string) => `<path d="${d}" fill="${accent}"/>`;
  switch (pattern) {
    case 'solid':
      return '';
    case 'stripes':
      return fill([58, 82, 106, 130].map((x) => `M${x} 0h12v125h-12Z`).join(' '));
    case 'hoops':
      return fill([38, 66, 94].map((y) => `M0 ${y}h200v12h-200Z`).join(' '));
    case 'halves':
      return fill('M100 0h100v125h-100Z');
    case 'sash':
      return fill('M150 10L172 24L64 125L40 125Z');
    case 'chevron':
      return fill('M8 40L100 80L192 40V56L100 96L8 56Z');
    case 'pinstripe':
      return fill(Array.from({ length: 14 }, (_, i) => `M${21 + i * 12} 0h2v125h-2Z`).join(' '));
    case 'gradient':
      return Array.from(
        { length: 9 },
        (_, i) =>
          `<path d="M0 ${12 + i * 12}h200v12h-200Z" fill="${accent}" opacity="${((i + 1) / 10).toFixed(2)}"/>`,
      ).join('');
  }
}

/** Both socks: each shape is drawn on the left leg and again 47 units right. */
function socks(style: string, base: Hex, sock: Hex): string {
  const both = (shape: string) => `${shape}<g transform="translate(47 0)">${shape}</g>`;
  const band = (d: string, color: Hex) => both(`<path d="${d}" fill="${color}"/>`);
  const top = style === 'socks:high' ? 160 : 172;
  const body = band(`M60 ${top}H93V230H60Z`, sock);
  switch (style) {
    case 'socks:rolled':
      return `${body}${band('M60 170H93V182H60Z', base)}${both('<path d="M60 176H93" stroke="#182a35" stroke-opacity=".2" stroke-width="1.5"/>')}`;
    case 'socks:taped':
      return `${body}${band(`M60 ${top}H93V180H60Z`, base)}${band('M60 190H93V194H60Z M60 198H93V202H60Z', '#f5f5f5')}`;
    case 'socks:striped':
      return `${body}${band('M60 188H93V192H60Z M60 200H93V204H60Z M60 212H93V216H60Z', base)}`;
    case 'socks:high':
      return `${body}${band('M60 160H93V168H60Z', base)}`;
    default:
      return `${body}${band('M60 172H93V180H60Z', base)}`;
  }
}

/** The player head to boots, for the wardrobe preview. */
export function renderFigure(avatar: Avatar, age: number, dress: FigureDress, id = 'fig'): string {
  const { kit } = dress;
  colors(kit.colors);
  colors([...dress.boots, dress.boots[0]]);
  if (dress.armband) colors([...dress.armband, dress.armband[0]]);
  const [base, accent, light] = kit.colors;
  const skin = avatarSkinColor(avatar);
  const sleeve =
    dress.sleeves === 'long'
      ? `<path d="M12 60L34 74L32.6 108H14.6L6 70Z" fill="${base}"/><path d="M14.4 103H32.8V110H14.4Z" fill="${accent}" stroke="none"/>`
      : '';
  const arms = `<g fill="${skin}" stroke="#51352b" stroke-opacity=".2" stroke-width="1.5" stroke-linejoin="round"><g data-arm="left"><path d="${ARM}"/>${sleeve}</g><g data-arm="right" transform="translate(200 0) scale(-1 1)"><path d="${ARM}"/>${sleeve}</g></g>`;
  const badge = dress.crest
    ? `<path d="${BADGE}" fill="${dress.crest.colors[0]}"/><path d="${BADGE_INNER}" fill="${dress.crest.colors[1]}"/>`
    : `<path d="${BADGE}" fill="${light}"/>`;
  // The portrait's captain's armband accessory shows on the sleeve when no armband is worn.
  const armband = dress.armband ?? (avatar.accessory === 3 ? [ART.gold, ART.onGold] : null);
  const band = armband
    ? `<path d="M156 40L176 28L181 37L161 49Z" fill="${armband[0]}" stroke="${armband[1]}" stroke-width="1"/><text x="168.5" y="41.5" font-family="Inter, sans-serif" font-size="9" font-weight="800" fill="${armband[1]}" text-anchor="middle" transform="rotate(-31 168.5 38.5)">C</text>`
    : '';
  const boot = (d: string) => `<path d="${d}" fill="${dress.boots[0]}" ${OUTLINE}/>`;
  const body = [
    `<ellipse cx="100" cy="246" rx="74" ry="4" fill="${ART.ink}" opacity=".12"/>`,
    arms,
    `<path d="M62 156H92V176H62Z M108 156H138V176H108Z" fill="${skin}"/>`,
    socks(dress.socks, base, accent),
    boot('M60 222H93V234Q93 238 98 240V246H42Q38 246 40 241Q46 233 60 230Z'),
    boot('M140 222H107V234Q107 238 102 240V246H158Q162 246 160 241Q154 233 140 230Z'),
    `<path d="M50 238L82 232L84 236L54 242Z M150 238L118 232L116 236L146 242Z" fill="${dress.boots[1]}"/>`,
    `<path d="${SHORTS}" fill="${base}" ${OUTLINE}/>`,
    `<path d="M54 116L47 158M146 116L153 158" stroke="${accent}" stroke-width="5"/>`,
    `<defs><clipPath id="${id}-shirt"><path d="${SHIRT}"/></clipPath></defs>`,
    `<path d="${SHIRT}" fill="${base}"/>`,
    `<g clip-path="url(#${id}-shirt)">${shirtPattern(kit.pattern, accent)}<path d="M48 60V120H60V70Z M152 60V120H140V70Z" fill="#000000" opacity=".08"/></g>`,
    `<path d="M8 60L34 76L37 70L12 54Z M192 60L166 76L163 70L188 54Z" fill="${accent}"/>`,
    `<path d="${item(COLLARS, item(KIT_COLLAR, kit.collar))}" fill="${accent}"/>`,
    badge,
    `<path d="M48 118H152" stroke="${accent}" stroke-width="3"/>`,
    `<path d="${SHIRT}" ${OUTLINE}/>`,
    band,
  ].join('');
  return svg(
    `<g transform="translate(0 ${BODY_TOP})">${body}</g><g transform="translate(${100 - 100 * HEAD_SCALE} 0) scale(${HEAD_SCALE})">${avatarHead(avatar, age, accent)}</g>`,
    `0 0 200 ${BODY_TOP + 250}`,
  );
}
