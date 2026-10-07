import type { Avatar } from '../../model/domain';
import type { Rng } from '../rng';
import { item, svg } from './shared';

export const AVATAR_OPTIONS = {
  face: 8,
  skin: 8,
  hair: 8,
  hairColor: 8,
  facialHair: 8,
  eyebrows: 8,
  eyes: 8,
  accessory: 8,
} as const;
const SKIN = [
  '#f1ceb0',
  '#eaba91',
  '#d99c72',
  '#c08257',
  '#a66b47',
  '#895035',
  '#6e412e',
  '#4d3027',
];
const HAIR_COLOR = [
  '#242b30',
  '#412b23',
  '#69412c',
  '#956239',
  '#c2924f',
  '#e5c97f',
  '#ad5735',
  '#743e44',
];
const FACES = [
  'M54 64Q52 33 100 33Q148 33 146 64L142 113Q139 147 100 157Q61 147 58 113Z',
  'M54 64Q52 33 100 33Q148 33 146 64L144 112Q140 152 100 163Q60 152 56 112Z',
  'M51 66Q49 32 100 32Q151 32 149 66L143 122L126 146H74L57 122Z',
  'M58 66Q56 32 100 32Q144 32 142 66L137 116Q124 155 100 160Q76 155 63 116Z',
  'M49 68Q49 32 100 32Q151 32 151 68V108Q144 147 100 153Q56 147 49 108Z',
  'M57 66Q55 32 100 32Q145 32 143 66L133 120L100 161L67 120Z',
  'M50 68Q50 32 100 32Q150 32 150 68L143 126L123 155H77L57 126Z',
  'M53 66Q51 32 100 32Q149 32 147 66L144 107Q133 154 100 156Q67 154 56 107Z',
];
const HAIR = [
  '<path d="M51 70Q45 25 100 25Q155 25 149 70L139 57Q100 37 61 57Z"/>',
  '<path d="M51 74L49 48Q45 13 92 18Q135 3 150 40L149 77L137 53Q104 59 78 43L62 64Z"/>',
  '<path d="M50 72L48 45L61 32L65 17L79 22L91 8L105 21L121 10L130 29L146 28L151 56L144 76L130 47L111 54L90 41L67 52Z"/>',
  '<path d="M48 88Q39 17 98 17Q156 8 153 88L139 76V46Q112 39 76 54L62 72L61 90Z"/>',
  '<path d="M47 76Q38 27 69 26Q87 0 111 18Q151 9 153 65L144 79L135 43Q85 40 58 67Z"/><path d="M70 27Q81 13 105 19" fill="none" stroke="#fff" stroke-opacity=".15" stroke-width="4"/>',
  '<path d="M48 80V45Q51 16 100 18Q149 16 152 45V80L137 55V38H64V56Z"/><path d="M60 28H137" stroke="#fff" stroke-opacity=".14" stroke-width="3"/>',
  '<path d="M48 80L43 59L47 41L55 26L66 26L72 15L85 21L96 13L110 19L122 15L132 27L147 31L153 51L149 80L138 57L131 45L118 48L109 38L92 45L78 40L65 51L59 79Z"/>',
  '<path d="M49 82Q35 42 64 25Q77 14 99 19Q143 9 154 47Q161 73 148 95L140 67L137 45L127 54L110 38L86 52L70 43L61 66L59 91Z"/>',
];
const BEARDS = [
  '<path d="M87 134Q100 139 113 134" fill="none" stroke-opacity=".2" stroke-width="1"/>',
  '<path d="M60 119Q65 145 100 154Q135 145 140 119L130 124Q127 145 100 146Q73 145 70 124Z" opacity=".38"/>',
  '<path d="M84 120Q93 110 100 117Q107 110 116 120L112 125L100 122L88 125Z"/>',
  '<path d="M87 137H113L110 154L100 159L90 154Z"/>',
  '<path d="M58 103L71 114L74 134L91 142H109L126 134L129 114L142 103L138 134L117 158H83L62 134Z"/>',
  '<path d="M88 115Q100 109 112 115L119 129L105 125L100 119L95 125L81 129ZM92 136H108V152H92Z"/>',
  '<path d="M57 86H65V119L59 128ZM135 86H143L141 128L135 119Z"/>',
  '<path d="M84 118L100 113L116 118L112 124H88ZM60 114L76 137L90 145H110L124 137L140 114L135 142L118 162H82L65 142Z"/>',
];
const BROWS = [
  'M66 78L84 76M116 76L134 78',
  'M66 76Q76 70 85 76M115 76Q125 70 134 76',
  'M65 79L84 73M116 73L135 79',
  'M66 74L85 80M115 80L134 74',
  'M67 76H85M115 76H133',
  'M65 80Q76 74 85 77M115 77Q124 74 135 80',
  'M66 76L78 72L85 75M115 75L122 72L134 76',
  'M65 77Q75 69 85 73M115 73Q125 69 135 77',
];
const EYES = [
  '<ellipse cx="77" cy="89" rx="8" ry="5"/><ellipse cx="123" cy="89" rx="8" ry="5"/>',
  '<path d="M68 90Q77 78 86 90Q77 96 68 90M114 90Q123 78 132 90Q123 96 114 90Z"/>',
  '<path d="M69 89Q77 83 85 89V93H69ZM115 89Q123 83 131 89V93H115Z"/>',
  '<ellipse cx="77" cy="89" rx="6" ry="7"/><ellipse cx="123" cy="89" rx="6" ry="7"/>',
  '<path d="M67 89Q77 81 87 89Q77 93 67 89M113 89Q123 81 133 89Q123 93 113 89Z"/>',
  '<path d="M68 86L86 89L82 94H73ZM114 89L132 86L127 94H118Z"/>',
  '<ellipse cx="77" cy="88" rx="9" ry="6"/><ellipse cx="123" cy="88" rx="9" ry="6"/>',
  '<path d="M68 91L72 84H82L86 91L79 95H74ZM114 91L118 84H128L132 91L126 95H121Z"/>',
];
const ACCESSORIES = [
  '<path d="M51 58Q100 41 149 58V66Q100 49 51 66Z" fill="#e9c655"/>',
  '<circle cx="47" cy="110" r="5" fill="#e9c655"/><circle cx="153" cy="110" r="5" fill="#e9c655"/>',
  '<path d="M62 103L80 98L82 105L64 111Z" fill="#f7f1df"/>',
  '<path d="M53 61Q100 44 147 61" stroke="#f7f1df" stroke-width="5" fill="none"/>',
  '<circle cx="153" cy="112" r="7" stroke="#e9c655" stroke-width="3" fill="none"/>',
  '<path d="M95 100H105V105H95Z" fill="#f7f1df"/>',
  '<path d="M56 111L77 112V119H56Z" fill="#efb27f"/><path d="M60 114H73" stroke="#c37a4c" stroke-width="1"/>',
  '<path d="M53 62Q100 45 147 62" stroke="#c85140" stroke-width="7" fill="none"/><path d="M139 62L155 73L151 87L144 74" fill="#c85140"/>',
];

export function generateAvatar(rng: Rng): Avatar {
  return {
    face: rng.int(0, 7),
    skin: rng.int(0, 7),
    hair: rng.int(0, 7),
    hairColor: rng.int(0, 7),
    facialHair: rng.int(0, 7),
    eyebrows: rng.int(0, 7),
    eyes: rng.int(0, 7),
    accessory: rng.int(0, 7),
  };
}
export function renderAvatar(avatar: Avatar, age: number): string {
  if (!Number.isFinite(age) || age < 0 || age > 110) throw new RangeError('Invalid avatar age');
  const skin = item(SKIN, avatar.skin);
  const hair = item(HAIR_COLOR, avatar.hairColor);
  const hairstyle = item(HAIR, avatar.hair);
  const ageing = Math.max(0, Math.min(1, (age - 28) / 20));
  const gray =
    ageing > 0
      ? `<g data-gray="${ageing.toFixed(2)}" clip-path="url(#hair)" fill="none" stroke="#d1cec7" stroke-width="4" opacity="${ageing.toFixed(2)}"><path d="M54 47L58 69M63 38L65 53M140 41L144 64"/></g>`
      : '';
  const wrinkles =
    age >= 32
      ? `<g data-ageing="wrinkles" stroke="#634639" stroke-opacity="${(ageing * 0.45).toFixed(2)}" fill="none" stroke-width="1.5"><path d="M78 64Q100 59 122 64M63 91L57 88M63 95L56 97M137 91L143 88M137 95L144 97M83 110L79 125M117 110L121 125"/></g>`
      : '';
  return svg(
    `<defs><clipPath id="hair">${hairstyle}</clipPath></defs><path d="M17 220V195Q24 169 75 165H125Q176 169 183 195V220Z" fill="#075e45"/><path d="M79 141H121V169L100 186L79 169Z" fill="${skin}"/><path d="M79 151Q100 168 121 151V161Q100 176 79 161Z" fill="#442d27" opacity=".16"/><path d="M75 166L100 185L125 166" stroke="#efcf63" stroke-width="8" fill="none"/><ellipse cx="51" cy="95" rx="10" ry="18" fill="${skin}"/><ellipse cx="149" cy="95" rx="10" ry="18" fill="${skin}"/><path d="${item(FACES, avatar.face)}" fill="${skin}"/><path d="M62 106Q66 145 100 150" stroke="#442d27" stroke-opacity="${age < 20 ? '.03' : '.08'}" stroke-width="9" fill="none"/><g data-hairline="${ageing.toFixed(2)}" transform="translate(0 ${(-ageing * 6).toFixed(2)})" fill="${hair}">${hairstyle}${gray}</g><path d="${item(BROWS, avatar.eyebrows)}" stroke="${hair}" stroke-width="${(avatar.eyebrows % 3) + 3}" stroke-linecap="round"/><g fill="#fff8ee">${item(EYES, avatar.eyes)}</g><circle cx="77" cy="89" r="3.5" fill="#263c3b"/><circle cx="123" cy="89" r="3.5" fill="#263c3b"/><circle cx="78" cy="88" r="1" fill="white"/><circle cx="124" cy="88" r="1" fill="white"/><path d="M100 90L95 108Q100 112 106 108" stroke="#51352b" stroke-opacity=".4" stroke-width="2" stroke-linecap="round"/><path d="M88 126Q100 133 112 126" stroke="#6b4036" stroke-width="2.5" fill="none" stroke-linecap="round"/><g fill="${hair}" stroke="${hair}" stroke-linejoin="round" opacity="${Math.min(1, Math.max(0.12, (age - 16) / 7)).toFixed(2)}">${item(BEARDS, avatar.facialHair)}</g>${wrinkles}${item(ACCESSORIES, avatar.accessory)}<path d="M36 202V220M164 202V220" stroke="#efcf63" stroke-width="4"/>`,
    '0 0 200 220',
  );
}
