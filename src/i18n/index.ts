import { en } from './en';
import { LOCALE, type Translations } from './locale';

/** The shell's copy, in the active language (`locale.ts`). */
export const t = ({ en } satisfies Translations<typeof en>)[LOCALE];
export { format } from './locale';
export function errorText(code: string): string {
  return t.errors[code as keyof typeof t.errors] ?? t.errors.storage;
}
