import type { Hex, Kit, SleeveLength } from '../../model/domain';
import { renderKit } from './kit';
import { svg } from './shared';

/**
 * Wardrobe artwork (milestone 7): the club shirt with the player's sleeve length and
 * armband, and a pair of socks and boots. Flat vector shapes in the kit's own colours.
 */
export function renderDressedKit(
  kit: Kit,
  sleeves: SleeveLength,
  armband: [Hex, Hex] | null,
): string {
  const [base, accent] = kit.colors;
  const shirt = renderKit(kit);
  const long =
    sleeves === 'long'
      ? `<path d="M7 68L29 81L23 118L3 110Z" fill="${base}" stroke="#182a35" stroke-opacity=".22" stroke-width="2" stroke-linejoin="round"/><path d="M153 68L131 81L137 118L157 110Z" fill="${base}" stroke="#182a35" stroke-opacity=".22" stroke-width="2" stroke-linejoin="round"/><path d="M4 106L23 113M156 106L137 113" stroke="${accent}" stroke-width="5"/>`
      : '';
  const band = armband
    ? `<path d="M15 51L33 59L30 66L12 58Z" fill="${armband[0]}" stroke="${armband[1]}" stroke-width="1.5"/><text x="22" y="61" font-family="Inter, sans-serif" font-size="7" font-weight="800" fill="${armband[1]}" text-anchor="middle" transform="rotate(24 22 61)">C</text>`
    : '';
  return shirt.replace('</svg>', `${long}${band}</svg>`);
}

const SOCK = 'M18 4H42V58Q42 66 50 70L62 76Q70 80 70 88V92H18Z';
export function renderSocksAndBoots(kit: Kit, socks: string, boots: [Hex, Hex]): string {
  const [base, accent, light] = kit.colors;
  const sockColor = kit.colors[2] === base ? light : accent;
  const pattern: Record<string, string> = {
    'socks:classic': '',
    'socks:rolled': `<path d="M16 26H44" stroke="${base}" stroke-width="7"/>`,
    'socks:taped': `<path d="M18 36H42M18 42H42" stroke="#f5f5f5" stroke-width="4"/>`,
    'socks:high': `<path d="M18 0H42V8H18Z" fill="${sockColor}"/>`,
    'socks:striped': `<path d="M18 12H42M18 22H42M18 32H42" stroke="${base}" stroke-width="4"/>`,
  };
  const one = (offset: number) =>
    `<g transform="translate(${offset} 0)"><path d="${SOCK}" fill="${sockColor}" stroke="#182a35" stroke-opacity=".25" stroke-width="1.5"/>${pattern[socks] ?? ''}<path d="M14 66H52Q72 66 76 82L78 92H14Z" fill="${boots[0]}" stroke="#182a35" stroke-opacity=".35" stroke-width="1.5"/><path d="M22 74L60 76" stroke="${boots[1]}" stroke-width="5" stroke-linecap="round"/><path d="M18 92V98M34 92V98M54 92V98M70 92V98" stroke="${boots[1]}" stroke-width="3"/></g>`;
  return svg(`${one(4)}${one(84)}`, '0 0 168 100');
}
