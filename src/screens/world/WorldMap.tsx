import { t } from '../../i18n';
import { cx } from '../../ui/kit';

/**
 * The six countries of every world, as a flat stylised map for the field-green "create a
 * world" hero (WorldCreate artboard). Only the hero's fixed colours are used, so it reads the
 * same in both themes.
 */
const COUNTRIES = [
  {
    key: 'england',
    d: 'M128 28L146 22L158 40L150 58L166 74L176 104L190 122L184 140L160 150L132 154L114 150L126 136L118 124L134 112L128 96L138 80L124 62L132 46Z',
    fill: 'fill-hero-ink',
    label: [156, 118],
    city: [166, 134],
    inside: true,
  },
  {
    key: 'france',
    d: 'M168 172L196 166L222 176L252 188L262 200L254 222L262 238L252 262L262 284L238 296L214 300L196 296L176 304L158 298L162 270L150 244L130 224L118 212L136 204L160 198Z',
    fill: 'fill-hero-muted',
    label: [206, 250],
    city: [204, 208],
    inside: true,
  },
  {
    key: 'spain',
    d: 'M86 304L130 300L158 308L176 304L196 312L190 326L176 336L170 360L158 384L134 404L104 406L86 396L90 372L88 344L84 324Z',
    fill: 'fill-hero-ink',
    label: [136, 332],
    city: [128, 352],
    inside: true,
  },
  {
    key: 'portugal',
    d: 'M60 314L86 304L84 324L88 344L90 372L86 396L66 398L62 372L56 346Z',
    fill: 'fill-mint',
    label: [58, 296],
    city: [68, 370],
    inside: false,
  },
  {
    key: 'germany',
    d: 'M262 118L290 108L312 114L330 132L336 160L326 184L340 210L326 232L300 238L272 236L254 222L262 200L252 188L258 160L252 136Z',
    fill: 'fill-mint',
    label: [298, 178],
    city: [314, 146],
    inside: true,
  },
  {
    key: 'italy',
    d: 'M272 250L300 244L326 250L322 266L308 270L318 292L340 316L366 336L372 352L358 352L350 366L338 360L340 344L322 332L302 310L288 290L280 270ZM330 384L358 378L350 398ZM276 318L290 316L292 346L278 348Z',
    fill: 'fill-hero-muted',
    label: [372, 300],
    city: [314, 300],
    inside: false,
  },
] as const;

export function WorldMap({ className }: { className?: string }) {
  return (
    <figure className={cx('m-0 flex flex-col items-center gap-2', className)}>
      <svg
        viewBox="0 0 420 440"
        role="img"
        aria-label={t.world.map.label}
        className="h-auto w-full"
      >
        <rect
          x="4"
          y="4"
          width="412"
          height="432"
          rx="28"
          className="fill-night"
          fillOpacity="0.4"
        />
        <path
          d="M4 110H416M4 220H416M4 330H416M110 4V436M220 4V436M330 4V436"
          fill="none"
          className="stroke-mint"
          strokeOpacity="0.14"
        />
        <g strokeWidth="2.5" strokeLinejoin="round" className="stroke-field">
          {COUNTRIES.map((country) => (
            <path key={country.key} d={country.d} className={country.fill} />
          ))}
        </g>
        <g
          fontFamily="Bebas Neue, sans-serif"
          fontSize="17"
          letterSpacing="1"
          textAnchor="middle"
          aria-hidden="true"
        >
          {COUNTRIES.map((country) => (
            <text
              key={country.key}
              x={country.label[0]}
              y={country.label[1]}
              className={country.inside ? 'fill-on-gold stroke-hero-ink' : 'fill-hero-ink'}
              strokeWidth={country.inside ? 3 : undefined}
              paintOrder="stroke"
            >
              {t.world.map.countries[country.key].toUpperCase()}
            </text>
          ))}
        </g>
        <g strokeWidth="2" className="fill-gold stroke-on-gold">
          {COUNTRIES.map((country) => (
            <circle key={country.key} cx={country.city[0]} cy={country.city[1]} r="5" />
          ))}
        </g>
      </svg>
      <figcaption className="text-center text-[0.8125rem] text-hero-muted lg:sr-only">
        {t.world.map.caption}
      </figcaption>
    </figure>
  );
}
