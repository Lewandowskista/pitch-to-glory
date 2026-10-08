/**
 * Career navigation copy (Phase 3.1). Kept apart from the screen copy, because the app shell
 * loads it on every page.
 */
export const navigationText = {
  groups: {
    overview: 'Overview',
    player: 'Player',
    club: 'Club',
    life: 'Life',
    history: 'History',
  },
  pages: {
    '/career': 'Hub',
    '/career/calendar': 'Calendar',
    '/career/inbox': 'Inbox',
    '/career/profile': 'Profile',
    '/career/skills': 'Skills',
    '/career/training': 'Training',
    '/career/national': 'National team',
    '/career/club': 'Club life',
    '/career/transfers': 'Transfers',
    '/career/agent': 'Agent',
    '/career/media': 'Media',
    '/career/rival': 'Rival',
    '/career/lifestyle': 'Lifestyle',
    '/career/wardrobe': 'Wardrobe',
    '/career/trophies': 'Trophies',
    '/career/chronicle': 'Chronicle',
    '/career/moments': 'Moments',
    '/career/legacy': 'Legacy',
  } as Record<string, string>,
  tabs: '{group} pages',
  more: 'More',
  moreTitle: 'More',
  play: 'Play',
  app: 'Game',
  close: 'Close',
  unread: '{count} unread',
} as const;
