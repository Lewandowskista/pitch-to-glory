/**
 * The locale seam (docs/ARCHITECTURE.md, "Localization"): the active language, the registry
 * type every copy module serves its strings through, and the number, money, date, list and
 * plural helpers every screen formats with. Nothing else in `src/` passes a locale to `Intl` or
 * `toLocale*` (eslint.config.js enforces it).
 *
 * English is the only registered language. Copy is resolved when its module first evaluates, so
 * the language is fixed for a page load. This module imports no copy, so any chunk can use it
 * without pulling in `en.ts`.
 */

/**
 * Every registered language: its BCP 47 formatting tag and the few pieces of copy the
 * formatters themselves need. English formats as British English, as the game always has.
 */
export const LOCALES = {
  en: {
    tag: 'en-GB',
    /** An amount of the game's currency, the credit. */
    money: '{amount} Cr',
    /** Ordinal suffixes by plural category ("1st", "2nd", "3rd", "4th"). */
    ordinal: { one: '{n}st', two: '{n}nd', few: '{n}rd', other: '{n}th' },
  },
} as const satisfies Record<string, LocaleData>;

interface LocaleData {
  tag: string;
  money: string;
  ordinal: PluralForms;
}

export type LocaleId = keyof typeof LOCALES;
/**
 * The language the game is shown in. A constant while English is the only language, so the
 * bundler resolves every registry lookup below at build time (see `Translations`).
 */
export const LOCALE: LocaleId = 'en';
const active = LOCALE;

/** The language the game is shown in. */
export const activeLocale = (): LocaleId => active;
/** The BCP 47 tag `Intl` formats with ("en-GB"). */
export const localeTag = (): string => LOCALES[active].tag;

/**
 * The shape a translation must have: the English copy with every string widened to `string`
 * (English's `as const` literals are not a translation's), functions and tuples kept.
 */
export type Translation<T> = T extends string
  ? string
  : T extends (...args: never[]) => unknown
    ? T
    : { readonly [K in keyof T]: Translation<T[K]> };

/**
 * One copy table in every registered language, typed by the English table: adding a language to
 * `LOCALES` makes every copy module provide it, with every key, before the build passes. Each
 * module serves its table through it:
 *
 *     export const careerText = ({ en: careerTextEn } satisfies Translations<typeof careerTextEn>)[LOCALE];
 *
 * An object literal indexed by a constant, not a function call: Rollup sees through it to the
 * English table, so a route that imports a copy module without reading it still leaves it out
 * (a call, even marked pure, made the career copy load with every rating badge).
 */
export type Translations<T> = { readonly en: T } & {
  readonly [L in Exclude<LocaleId, 'en'>]: Translation<NoInfer<T>>;
};

/** Template parameters; a missing (or undefined) one leaves its placeholder as written. */
export type FormatParams = Record<string, string | number | undefined>;
/** Fill `{name}` placeholders; unknown ones are left as written. */
export function format(template: string, params: FormatParams): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(params[key] ?? match));
}

/**
 * A count's wording in each plural category the language uses (CLDR: zero, one, two, few, many,
 * other). English uses `one` and `other`; `other` is required as the fallback.
 */
export type PluralForms = Partial<Record<Exclude<Intl.LDMLPluralRule, 'other'>, string>> & {
  other: string;
};
/**
 * Declare a copy entry as plural forms, so a translation may add the categories its language
 * needs (Polish `few` and `many`) where English has only `one` and `other`.
 */
/*#__NO_SIDE_EFFECTS__*/
export function plurals(forms: PluralForms): PluralForms {
  return forms;
}

const pluralRules = new Map<string, Intl.PluralRules>();
function rules(type: Intl.PluralRuleType): Intl.PluralRules {
  let found = pluralRules.get(type);
  if (!found) pluralRules.set(type, (found = new Intl.PluralRules(localeTag(), { type })));
  return found;
}

/**
 * The form for `count`, with `{count}` (and any `params`) filled: `plural(3, goals)` is
 * "3 goals". `count` is written as given (no grouping), as the game always has.
 */
export function plural(count: number, forms: PluralForms, params: FormatParams = {}): string {
  return format(pluralForm(count, forms), { count, ...params });
}
/** The unfilled form `plural` would use, for a layout that draws the count apart. */
export function pluralForm(count: number, forms: PluralForms): string {
  return forms[rules('cardinal').select(count)] ?? forms.other;
}

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(value: number): string {
  const forms: PluralForms = LOCALES[active].ordinal;
  return format(forms[rules('ordinal').select(value)] ?? forms.other, { n: value });
}

const numberFormats = new Map<string, Intl.NumberFormat>();
/** A number grouped for the language ("12,500"); `options` as `Intl.NumberFormat`'s. */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  const key = options ? JSON.stringify(options) : '';
  let formatter = numberFormats.get(key);
  if (!formatter) numberFormats.set(key, (formatter = new Intl.NumberFormat(localeTag(), options)));
  return formatter.format(value);
}
/** A number rounded to a whole one and grouped ("12,500"). */
export const formatInteger = (value: number): string =>
  formatNumber(value, { maximumFractionDigits: 0 });
/** An amount of credits, rounded to a whole one: "12,500 Cr". */
export const formatMoney = (amount: number): string =>
  format(LOCALES[active].money, { amount: formatInteger(amount) });

const listFormats = new Map<string, Intl.ListFormat>();
/** Items as a list in running text: "A and B", "A, B and C" (`type: 'disjunction'` for "or"). */
export function formatList(
  items: readonly string[],
  type: Intl.ListFormatType = 'conjunction',
): string {
  let formatter = listFormats.get(type);
  if (!formatter) listFormats.set(type, (formatter = new Intl.ListFormat(localeTag(), { type })));
  return formatter.format(items);
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();
/** A real-world date or time in the language's conventions; `options` as `Intl.DateTimeFormat`'s. */
export function formatDate(
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const key = options ? JSON.stringify(options) : '';
  let formatter = dateFormats.get(key);
  if (!formatter) dateFormats.set(key, (formatter = new Intl.DateTimeFormat(localeTag(), options)));
  return formatter.format(typeof value === 'string' ? new Date(value) : value);
}
