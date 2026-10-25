import { LOCALE, type Translations } from './locale';
/**
 * Why an update has to wait (release 1.0 step 4.1): loaded with the update coordinator, off the
 * app shell, since it is only read when a tab is busy.
 */
const updateTextEn = {
  /** What holds this tab. */
  here: {
    'simulating-season': 'This tab is simulating a season — let it finish, then update.',
    simulating: 'The world is moving on — let it finish, then update.',
    training: 'Your training is saving — try again in a moment.',
    'unsaved-world': 'Save your world in a slot before installing this update.',
    match: 'Your match could not be saved yet — check the save status, then try again.',
    'unsaved-changes':
      'Your latest changes could not be saved yet — check the save status, then try again.',
    unresponsive: 'A tab did not answer — try again in a moment.',
  },
  /** What holds another tab; `{page}` is where that tab is. */
  other: {
    'simulating-season': 'Another tab ({page}) is simulating a season — finish or close it first.',
    simulating: 'Another tab ({page}) is simulating — finish or close it first.',
    training: 'Another tab ({page}) is saving training — try again in a moment.',
    'unsaved-world':
      'Another tab ({page}) has a world that is not saved in a slot — save it or close that tab first.',
    match: 'Another tab ({page}) has a match it could not save — check it or close it first.',
    'unsaved-changes':
      'Another tab ({page}) has changes it could not save — check it or close it first.',
    unresponsive: 'Another tab ({page}) did not answer — try again, or close it first.',
  },
} as const;
export const updateText = ({ en: updateTextEn } satisfies Translations<typeof updateTextEn>)[
  LOCALE
];
