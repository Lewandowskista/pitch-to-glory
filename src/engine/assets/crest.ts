import type { Crest } from '../../model/domain';
import type { Rng } from '../rng';
import { colors, item, PALETTES, svg } from './shared';

export const CREST_SHAPES = [
  'M22 14H138V86Q138 135 80 169Q22 135 22 86Z',
  'M80 10A72 72 0 1 1 79.9 154A72 72 0 1 1 80 10Z',
  'M80 9L140 42V117L80 169L20 117V42Z',
  'M20 16H140V128L112 144L80 168L48 144L20 128Z',
  'M80 8L147 82L80 169L13 82Z',
  'M32 12H128L141 40V113L80 167L19 113V40Z',
  'M80 9L139 34L132 111Q124 150 80 169Q36 150 28 111L21 34Z',
  'M28 13H132V106L80 165L28 106Z',
  'M80 10C127 10 143 38 143 83C143 126 116 159 80 167C44 159 17 126 17 83C17 38 33 10 80 10Z',
  'M80 8L110 26L140 24L136 87L145 116L80 167L15 116L24 87L20 24L50 26Z',
  'M19 18Q80 0 141 18L132 110Q119 148 80 168Q41 148 28 110Z',
  'M80 9L132 29L147 78L130 130L80 158L30 130L13 78L28 29Z',
  'M22 15H138V112Q138 163 80 163Q22 163 22 112Z',
  'M80 8L135 25V139L110 128L80 163L50 128L25 139V25Z',
  'M80 9L98 24L121 18L129 41L147 53L140 80L148 106L126 123L116 147L91 150L80 170L69 150L44 147L34 123L12 106L20 80L13 53L31 41L39 18L62 24Z',
] as const;

// Every symbol is authored in the same 100×100 coordinate system.
export const CREST_SYMBOLS = [
  '<path d="M20 27L38 20L50 29L67 20L81 29L72 45L78 65L62 83H37L22 64L29 43Z"/><path d="M33 48L44 53M58 53L68 48M40 68L50 74L60 68" fill="none" stroke="currentColor"/>',
  '<path d="M10 25L40 40L50 22L60 40L90 25L79 59L61 69L50 87L39 69L21 59Z"/><path d="M45 47H55L50 57Z" fill="currentColor"/>',
  '<path d="M25 16L47 32L74 16L73 56L50 84L27 57Z"/><path d="M35 48L44 51M56 51L65 48M42 67H58" stroke="currentColor"/>',
  '<path d="M25 27Q17 10 32 15L39 26Q50 20 61 26Q77 10 77 27L74 64L60 81H40L26 64Z"/><path d="M38 51H40M60 51H62M42 67L50 72L58 67" stroke="currentColor"/>',
  '<path d="M18 18L45 34L50 26L56 34L82 18L73 66L50 86L27 66Z"/><path d="M30 49L43 55L39 65M70 49L57 55L61 65" stroke="currentColor" fill="none"/>',
  '<path d="M40 39L50 33L61 39L66 63L50 86L34 63Z"/><path d="M40 40L25 27L18 12M26 28L14 28M31 32L36 15M60 40L75 27L82 12M74 28L86 28M69 32L64 15" stroke="inherit" fill="none"/>',
  '<path d="M23 20L38 30L62 30L77 20V68L50 87L23 68Z"/><circle cx="37" cy="48" r="10" fill="currentColor"/><circle cx="63" cy="48" r="10" fill="currentColor"/><path d="M45 61L50 69L55 61Z" fill="currentColor"/>',
  '<path d="M28 79L32 52L24 42L44 19L58 16L76 42L69 53L52 47L62 78Z"/><path d="M44 19L42 8L54 17M29 48L22 60L22 76" fill="none"/>',
  '<path d="M17 50Q43 19 71 42L88 28V73L71 58Q43 83 17 50Z"/><circle cx="31" cy="47" r="3" fill="currentColor"/><path d="M45 36L51 23L60 37"/>',
  '<path d="M50 12L61 38L90 40L68 59L75 87L50 71L25 87L32 59L10 40L39 38Z"/>',
  '<path d="M24 82V38H30V19H40V30H47V19H57V30H64V19H75V38H80V82Z"/><path d="M43 82V61Q50 49 57 61V82" fill="currentColor"/>',
  '<path d="M12 32Q24 18 37 32T63 32T89 32M12 51Q24 37 37 51T63 51T89 51M12 70Q24 56 37 70T63 70T89 70" stroke="inherit" stroke-width="8" fill="none"/>',
  '<path d="M22 14L66 68L74 67L86 79L79 86L67 75L68 65L14 22ZM78 14L34 68L26 67L14 79L21 86L33 75L32 65L86 22Z"/>',
  '<circle cx="50" cy="22" r="10" fill="none"/><path d="M50 32V80M29 49H71M18 58Q20 85 50 86Q80 85 82 58M18 58L14 69M82 58L86 69" fill="none" stroke-width="8"/>',
  '<circle cx="50" cy="50" r="21"/><path d="M50 9V19M50 81V91M9 50H19M81 50H91M20 20L28 28M72 72L80 80M20 80L28 72M72 28L80 20" fill="none" stroke-width="7"/>',
  '<path d="M10 78L37 27L52 50L67 15L92 78Z"/><path d="M29 42L37 27L47 43M59 33L67 15L78 35" stroke="currentColor"/>',
  '<path d="M50 11L75 41H64L84 65H58V86H42V65H16L36 41H25Z"/>',
  '<path d="M29 16Q-1 50 29 83M71 16Q101 50 71 83" fill="none"/><path d="M25 25L12 19L16 36L29 38M18 46L6 39L9 56L23 59M23 68L13 63L19 79L35 80M75 25L88 19L84 36L71 38M82 46L94 39L91 56L77 59M77 68L87 63L81 79L65 80"/>',
  '<path d="M51 10L21 57H47L39 91L79 39H53L64 10Z"/>',
  '<path d="M17 28L36 46L50 18L64 46L83 28L74 74H26ZM27 85H73"/>',
  '<path d="M12 76V33H23V48Q50 12 77 48V33H88V76H76V58Q50 29 24 58V76Z"/>',
  '<path d="M50 13Q71 8 73 31Q94 33 81 54Q84 77 62 74Q48 93 34 75Q12 76 18 54Q4 32 27 31Q30 9 50 13Z"/><circle cx="50" cy="49" r="13" fill="currentColor"/>',
  '<circle cx="50" cy="50" r="33" fill="none" stroke-width="8"/><circle cx="50" cy="50" r="8"/><path d="M50 17V83M17 50H83M27 27L73 73M27 73L73 27" fill="none"/>',
  '<circle cx="50" cy="50" r="34" fill="none"/><path d="M50 29L69 43L61 65H39L31 43ZM31 43L18 39M50 29V17M69 43L82 39M61 65L70 77M39 65L30 77"/>',
  '<circle cx="35" cy="35" r="18" fill="none" stroke-width="9"/><path d="M48 48L81 81M65 65L76 54M76 76L86 66" fill="none" stroke-width="9"/>',
  '<path d="M52 11Q78 32 65 48Q90 45 79 72Q66 94 37 81Q13 72 26 49Q30 38 34 26Q40 48 48 44Q58 35 52 11Z"/>',
  '<path d="M14 66H87L75 83H28ZM47 17V62H18ZM54 24L81 62H54Z"/>',
  '<path d="M14 25Q32 15 50 28Q68 15 86 25V78Q68 68 50 81Q32 68 14 78Z"/><path d="M50 29V80M25 36L40 39M61 39L76 36" stroke="currentColor" fill="none"/>',
  '<path d="M50 10L85 44L50 89L15 44ZM15 44H85M33 26L50 89L67 26"/>',
  '<path d="M16 75L35 25L87 16L65 40L38 48L72 39L57 58L31 60L51 61L39 75Z"/>',
  '<ellipse cx="50" cy="54" rx="17" ry="29"/><path d="M33 41Q7 8 14 45L34 57M67 41Q93 8 86 45L66 57M42 24L37 13M58 24L63 13"/><path d="M35 46H65M35 60H65" stroke="currentColor" stroke-width="7"/>',
  '<path d="M50 12V88M23 20V45Q23 58 50 58Q77 58 77 45V20M15 27L23 14L31 27M42 25L50 12L58 25M69 27L77 14L85 27" fill="none" stroke-width="7"/>',
  '<path d="M50 12L61 40L88 50L61 60L50 88L40 60L12 50L40 40Z"/><circle cx="50" cy="50" r="9" fill="currentColor"/>',
] as const;

export function generateCrest(rng: Rng): Crest {
  return {
    shape: rng.int(0, CREST_SHAPES.length - 1),
    symbol: rng.int(0, CREST_SYMBOLS.length - 1),
    colors: [...rng.pick(PALETTES)],
  };
}
export function renderCrest(crest: Crest): string {
  colors(crest.colors);
  const [base, accent, light] = crest.colors;
  const path = item(CREST_SHAPES, crest.shape);
  const symbol = item(CREST_SYMBOLS, crest.symbol);
  return svg(
    `<path d="${path}" fill="${base}" stroke="${accent}" stroke-width="5" stroke-linejoin="round"/><path d="${path}" transform="translate(8 9) scale(.9)" stroke="${light}" stroke-opacity=".45" stroke-width="1.5"/><g transform="translate(40 37) scale(.8)" fill="${light}" stroke="${light}" color="${base}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">${symbol}</g><path d="M57 133H103" stroke="${accent}" stroke-width="5" stroke-linecap="round"/>`,
    '0 0 160 180',
  );
}
