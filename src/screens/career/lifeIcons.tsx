/**
 * Line icons for the Life pages (Media, Rival, Lifestyle, Wardrobe). Decorative: every icon
 * sits beside text that says the same thing, so they are hidden from assistive technology.
 */
const PATHS = {
  clock: 'M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3M12 7V12L15 14',
  pen: 'M4 20H8L19 9L15 5L4 16ZM13 7L17 11',
  news: 'M4 5H17V19H6A2 2 0 0 1 4 17ZM17 9H20V17A2 2 0 0 1 18 19H17M7 9H14M7 12H14M7 15H11',
  heart: 'M12 20L4.5 12.5Q2 9.5 4 6.5Q7 3.5 12 7.5Q17 3.5 20 6.5Q22 9.5 19.5 12.5Z',
  heartBroken:
    'M12 20L4.5 12.5Q2 9.5 4 6.5Q7 3.5 12 7.5L10 11L13 13L11 17M12 7.5Q17 3.5 20 6.5Q22 9.5 19.5 12.5L12 20',
  chat: 'M5 5H19V15H10L6 19V15H5Z',
  transfer: 'M4 8H18M14 4L18 8L14 12M20 16H6M10 12L6 16L10 20',
  ball: 'M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3M12 8L15.5 10.5L14.2 14.5H9.8L8.5 10.5Z',
  trophy: 'M8 4H16V9Q16 14 12 14Q8 14 8 9ZM8 6H4Q4 10 8 10M16 6H20Q20 10 16 10M12 14V18M8 20H16',
  star: 'M12 3L14.6 9L21 9.5L16 13.6L17.6 20L12 16.6L6.4 20L8 13.6L3 9.5L9.4 9Z',
  shirt: 'M8 4L4 7L6 11L8 10V20H16V10L18 11L20 7L16 4Q12 7 8 4Z',
  bag: 'M5 8H19L18 20H6ZM9 8V6A3 3 0 0 1 15 6V8',
  car: 'M4 16V12L7 7H17L20 12V16ZM6 16A2 2 0 1 0 10 16M14 16A2 2 0 1 0 18 16',
  home: 'M3 11L12 4L21 11M5 10V20H19V10',
  person: 'M12 12A4 4 0 1 0 12 4A4 4 0 1 0 12 12M4 21Q4 15 12 15Q20 15 20 21',
  sun: 'M12 4A5 5 0 1 0 12.1 4ZM3 20Q8 16 12 20T21 20',
  chart: 'M4 18L10 12L14 15L20 7M15 7H20V12',
  legacy: 'M4 21H20M6 21V10L12 5L18 10V21M10 21V15H14V21',
  info: 'M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3M12 11V16M12 7.5V8',
  lock: 'M6 11H18V21H6ZM8.5 11V7.5A3.5 3.5 0 0 1 15.5 7.5V11',
  check: 'M5 12L10 17L19 7',
  chevronDown: 'M6 9L12 15L18 9',
  chevronRight: 'M9 6L15 12L9 18',
} as const;
export type LifeIconName = keyof typeof PATHS;

export function LifeIcon({
  name,
  className = 'h-4 w-4',
  filled = false,
}: {
  name: LifeIconName;
  className?: string;
  /** Fill the shape with the text colour (a liked post's heart). */
  filled?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The style-token coin: a gold disc with a star, beside token counts and rewards. */
export function TokenCoin({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <circle cx="12" cy="12" r="10" className="fill-gold" />
      <path
        d="M12 6.5L13.6 10L17.4 10.3L14.5 12.8L15.4 16.5L12 14.5L8.6 16.5L9.5 12.8L6.6 10.3L10.4 10Z"
        className="fill-on-gold"
      />
    </svg>
  );
}
