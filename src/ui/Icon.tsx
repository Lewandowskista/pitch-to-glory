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
  | 'ball';
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
  ball: 'M12 2A10 10 0 1 0 12 22A10 10 0 1 0 12 2M12 8L16 11L14 16H10L8 11ZM12 8V2M16 11L22 9M14 16L18 20M10 16L6 20M8 11L2 9',
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
