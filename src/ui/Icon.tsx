export type IconName =
  | 'home'
  | 'gallery'
  | 'save'
  | 'settings'
  | 'arrow'
  | 'refresh'
  | 'sun'
  | 'moon'
  | 'check'
  | 'download'
  | 'upload'
  | 'trash'
  | 'ball'
  | 'globe'
  | 'career'
  | 'edit'
  | 'overview'
  | 'player'
  | 'club'
  | 'life'
  | 'history'
  | 'more'
  | 'lock'
  | 'alert'
  | 'warning'
  | 'info'
  | 'chevron'
  | 'close'
  | 'inbox'
  | 'contract'
  | 'play';
const paths: Record<IconName, string> = {
  home: 'M3 10L12 3L21 10V21H15V14H9V21H3Z',
  gallery: 'M3 3H10V10H3ZM14 3H21V10H14ZM3 14H10V21H3ZM14 14H21V21H14Z',
  save: 'M5 3H17L21 7V21H3V3ZM7 3V9H16V3M7 21V14H17V21',
  settings:
    'M12 8A4 4 0 1 0 12 16A4 4 0 1 0 12 8M9 3H15L16 6L19 7L22 10V14L19 17L16 18L15 21H9L8 18L5 17L2 14V10L5 7L8 6Z',
  arrow: 'M4 12H20M14 6L20 12L14 18',
  refresh: 'M20 10A8 8 0 1 0 20 16M20 3V10H13',
  sun: 'M12 8A4 4 0 1 0 12 16A4 4 0 1 0 12 8M12 2V4M12 20V22M2 12H4M20 12H22M5 5L7 7M17 17L19 19M5 19L7 17M17 7L19 5',
  moon: 'M20 16A9 9 0 0 1 8 4A9 9 0 1 0 20 16Z',
  check: 'M5 12L10 17L20 6',
  download: 'M12 3V16M6 10L12 16L18 10M4 16V21H20V16',
  upload: 'M12 17V3M6 9L12 3L18 9M4 16V21H20V16',
  trash: 'M3 6H21M9 6V3H15V6M5 6L6 21H18L19 6M10 10V17M14 10V17',
  globe:
    'M12 2A10 10 0 1 0 12 22A10 10 0 1 0 12 2M2 12H22M12 2C9 5 8 8.5 8 12S9 19 12 22M12 2C15 5 16 8.5 16 12S15 19 12 22',
  career:
    'M8 3L3 5.5L1.5 10.5L5 11.5V21H19V11.5L22.5 10.5L21 5.5L16 3Q12 6.5 8 3ZM12 11L13.2 13.4L15.8 13.8L13.9 15.6L14.4 18.2L12 17L9.6 18.2L10.1 15.6L8.2 13.8L10.8 13.4Z',
  edit: 'M4 20H8L19 9L15 5L4 16ZM13 7L17 11M14 20H20',
  overview: 'M3 3H10V12H3ZM14 3H21V8H14ZM14 12H21V21H14ZM3 16H10V21H3Z',
  player: 'M12 3A4 4 0 1 0 12 11A4 4 0 1 0 12 3M4 21C4 16.6 7.6 14 12 14S20 16.6 20 21',
  club: 'M12 2L20 5V11C20 16 16.5 19.8 12 22C7.5 19.8 4 16 4 11V5Z',
  life: 'M12 3L14.6 8.6L20.7 9.3L16.2 13.4L17.4 19.4L12 16.4L6.6 19.4L7.8 13.4L3.3 9.3L9.4 8.6Z',
  history:
    'M8 4H16V9A4 4 0 0 1 8 9ZM8 6H4V7A3 3 0 0 0 8 10M16 6H20V7A3 3 0 0 1 16 10M12 13V17M9 17H15V21H9Z',
  more: 'M4 12A1.6 1.6 0 1 0 7.2 12A1.6 1.6 0 1 0 4 12M10.4 12A1.6 1.6 0 1 0 13.6 12A1.6 1.6 0 1 0 10.4 12M16.8 12A1.6 1.6 0 1 0 20 12A1.6 1.6 0 1 0 16.8 12',
  ball: 'M12 2A10 10 0 1 0 12 22A10 10 0 1 0 12 2M12 8L16 11L14 16H10L8 11ZM12 8V2M16 11L22 9M14 16L18 20M10 16L6 20M8 11L2 9',
  lock: 'M6 11H18V21H6ZM8.5 11V7.5A3.5 3.5 0 0 1 15.5 7.5V11',
  alert: 'M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3M12 8V13M12 16.5V17',
  warning: 'M12 3L22 20H2ZM12 10V14M12 17V17.5',
  info: 'M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3M12 11V16M12 7.5V8',
  chevron: 'M9 6L15 12L9 18',
  close: 'M6 6L18 18M18 6L6 18',
  inbox: 'M4 6H20V18H4ZM4 7L12 13L20 7',
  contract: 'M6 3H15L19 7V21H6ZM15 3V7H19M9 12H16M9 16H14',
  play: 'M12 2A10 10 0 1 0 12 22A10 10 0 1 0 12 2M10 8L16 12L10 16Z',
};
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
