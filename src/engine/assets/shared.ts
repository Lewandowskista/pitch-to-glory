import type { Hex } from '../../model/domain';
/**
 * Brand colours for generated SVG art. Art is shown as image data URIs, which cannot read CSS
 * variables, so these mirror src/styles/tokens.css; keep the two in step.
 */
export const ART = {
  field: '#075e45',
  fieldStripe: '#0a6a4e',
  gold: '#efcf63',
  goldPressed: '#c9a73c',
  onGold: '#153c2d',
  heroInk: '#fff7e4',
  ink: '#1d3329',
  surface: '#ffffff',
  artBlue: '#e4ebee',
  danger: '#a72d30',
} as const satisfies Record<string, Hex>;
export const PALETTES: readonly [Hex, Hex, Hex][] = [
  ['#075e45', '#f1cf58', '#f9f5e9'],
  ['#19386d', '#f6f2e7', '#e95042'],
  ['#bb3436', '#f9e8ce', '#253444'],
  ['#593d78', '#f6bc54', '#fbf5e7'],
  ['#15788b', '#f5f3e6', '#1e3547'],
  ['#e89134', '#202f40', '#fcf5e9'],
  ['#32323e', '#eab84f', '#f5f3e9'],
  ['#23714e', '#f6f5e7', '#d45b42'],
  ['#923958', '#f8eacb', '#253145'],
  ['#286bc0', '#ffcf57', '#f7f7ed'],
];
export function item<T>(values: readonly T[], index: number): T {
  if (!Number.isInteger(index) || index < 0 || index >= values.length)
    throw new RangeError('Invalid asset option');
  return values[index]!;
}
export function colors(colors: readonly Hex[]): void {
  if (colors.length !== 3 || colors.some((color) => !/^#[0-9a-f]{6}$/i.test(color)))
    throw new Error('Invalid asset colors');
}
export function svg(body: string, viewBox: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none">${body}</svg>`;
}

/** Blend `color` towards `target` by `amount` (0 keeps the colour, 1 gives the target). */
export function mix(color: Hex, target: Hex, amount: number): Hex {
  const channel = (hex: Hex, index: number) => parseInt(hex.slice(index, index + 2), 16);
  return `#${[1, 3, 5]
    .map((index) =>
      Math.round(channel(color, index) + (channel(target, index) - channel(color, index)) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}` as Hex;
}

function luminance(color: Hex): number {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = parseInt(color.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
/** WCAG contrast ratio between two colours. */
export function contrastRatio(a: Hex, b: Hex): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}
/** Move a colour towards black or white, keeping its hue, until it stands out on a background. */
export function withContrast(color: Hex, background: Hex, minimum = 3): Hex {
  if (contrastRatio(color, background) >= minimum) return color;
  const target = luminance(background) > 0.18 ? 0 : 255;
  const channels = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
  for (let step = 1; step <= 10; step++) {
    const mixed = `#${channels
      .map((channel) =>
        Math.round(channel + ((target - channel) * step) / 10)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}` as Hex;
    if (contrastRatio(mixed, background) >= minimum) return mixed;
  }
  return target ? '#ffffff' : '#000000';
}
