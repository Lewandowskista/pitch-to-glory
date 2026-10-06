import type { Hex } from '../../model/domain';
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
