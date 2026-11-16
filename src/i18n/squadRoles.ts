import { LOCALE, type Translations } from './locale';
/** The squad roles a contract promises, apart from the market copy so selection notes stay small. */
export const squadRoleNamesEn = {
  key: 'Key player',
  rotation: 'Rotation',
  backup: 'Backup',
  youth: 'Youth prospect',
};
export const squadRoleNames = (
  { en: squadRoleNamesEn } satisfies Translations<typeof squadRoleNamesEn>
)[LOCALE];
