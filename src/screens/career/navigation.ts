/**
 * Career navigation (Phase 3.1): five groups of pages. The sidebar (desktop) and the bottom
 * bar (phones) move between groups; each career page opens with its group's page tabs, always
 * in the same place. Pure data, shared by the shell and the career screens.
 */
import type { IconName } from '../../ui/Icon';
import { navigationText as n } from '../../i18n/navigation';

export type CareerGroupId = 'overview' | 'player' | 'club' | 'life' | 'history';
export interface CareerPageLink {
  path: string;
  label: string;
}
export interface CareerGroup {
  id: CareerGroupId;
  label: string;
  icon: IconName;
  pages: CareerPageLink[];
}

export const CAREER_GROUPS: readonly CareerGroup[] = [
  {
    id: 'overview',
    label: n.groups.overview,
    icon: 'overview',
    pages: [
      { path: '/career', label: n.pages['/career']! },
      { path: '/career/calendar', label: n.pages['/career/calendar']! },
      { path: '/career/inbox', label: n.pages['/career/inbox']! },
    ],
  },
  {
    id: 'player',
    label: n.groups.player,
    icon: 'player',
    pages: [
      { path: '/career/profile', label: n.pages['/career/profile']! },
      { path: '/career/skills', label: n.pages['/career/skills']! },
      { path: '/career/training', label: n.pages['/career/training']! },
      { path: '/career/national', label: n.pages['/career/national']! },
    ],
  },
  {
    id: 'club',
    label: n.groups.club,
    icon: 'club',
    pages: [
      { path: '/career/club', label: n.pages['/career/club']! },
      { path: '/career/transfers', label: n.pages['/career/transfers']! },
      { path: '/career/agent', label: n.pages['/career/agent']! },
    ],
  },
  {
    id: 'life',
    label: n.groups.life,
    icon: 'life',
    pages: [
      { path: '/career/media', label: n.pages['/career/media']! },
      { path: '/career/rival', label: n.pages['/career/rival']! },
      { path: '/career/lifestyle', label: n.pages['/career/lifestyle']! },
      { path: '/career/wardrobe', label: n.pages['/career/wardrobe']! },
    ],
  },
  {
    id: 'history',
    label: n.groups.history,
    icon: 'history',
    pages: [
      { path: '/career/trophies', label: n.pages['/career/trophies']! },
      { path: '/career/chronicle', label: n.pages['/career/chronicle']! },
      { path: '/career/moments', label: n.pages['/career/moments']! },
      { path: '/career/legacy', label: n.pages['/career/legacy']! },
    ],
  },
];

/** The group a career page belongs to, if any (the wizard belongs to none). */
export function careerGroupOf(pathname: string): CareerGroup | undefined {
  const path = pathname.replace(/\/+$/, '') || '/';
  return CAREER_GROUPS.find((group) => group.pages.some((page) => page.path === path));
}
/** Where a group opens: its first page. */
export const groupHome = (group: CareerGroup) => group.pages[0]!.path;
