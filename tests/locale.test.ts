import { describe, expect, expectTypeOf, it } from 'vitest';
import { t } from '../src/i18n';
import { en } from '../src/i18n/en';
import { agendaText } from '../src/i18n/agenda';
import { careerText } from '../src/i18n/career';
import { cardsLine, matchesLabel } from '../src/i18n/discipline';
import { honoursText } from '../src/i18n/honours';
import { lifestyleText } from '../src/i18n/lifestyle';
import { marketText } from '../src/i18n/market';
import { pitchCopy } from '../src/i18n/pitch';
import { selectionText } from '../src/i18n/selection';
import { socialText } from '../src/i18n/social';
import {
  activeLocale,
  format,
  formatDate,
  formatInteger,
  formatList,
  formatMoney,
  formatNumber,
  localeTag,
  LOCALE,
  ordinal,
  plural,
  pluralForm,
  plurals,
  type Translation,
  type Translations,
} from '../src/i18n/locale';

/*
 * The locale seam (release 1.0 plan, step 2.6). English output must not change: each case pins
 * what the screens printed before the helpers, with the old code inlined where it was a formula.
 */
describe('locale registry', () => {
  it('serves English, formatted as British English', () => {
    expect(activeLocale()).toBe('en');
    expect(localeTag()).toBe('en-GB');
    expect(t).toBe(en);
    expect(LOCALE).toBe('en');
    expect(careerText.common.level).toBe('Level {level}');
  });

  it('types a translation by the English table, with its strings widened', () => {
    const table = {
      title: 'Title',
      forms: plurals({ one: 'a', other: 'b' }),
      list: ['x'],
    } as const;
    // A translation writes its own words, may use plural categories English does not…
    const polish: Translation<typeof table> = {
      title: 'Tytuł',
      forms: plurals({ one: 'a', few: 'b', many: 'c', other: 'd' }),
      list: ['y'],
    };
    expectTypeOf(polish.title).toEqualTypeOf<string>();
    // …and must provide every key the English table has.
    // @ts-expect-error `list` is missing.
    const partial: Translation<typeof table> = { title: 'Tytuł', forms: plurals({ other: 'd' }) };
    expect([polish.list, partial.title]).toEqual([['y'], 'Tytuł']);
    // The registry serves the English table itself.
    expect(({ en: table } satisfies Translations<typeof table>)[LOCALE]).toBe(table);
  });
});

describe('plural', () => {
  it('picks English one and other as the binary plurals did', () => {
    const old = (count: number, one: string, many: string) =>
      count === 1 ? one : format(many, { count });
    for (const count of [0, 1, 2, 5, 11, 21, 101])
      expect(plural(count, careerText.common.attributePoints)).toBe(
        old(count, '1 attribute point', '{count} attribute points'),
      );
    expect(matchesLabel(1)).toBe('1 match');
    expect(matchesLabel(3)).toBe('3 matches');
    expect(cardsLine(2, 1)).toBe('2 yellow, 1 red');
    expect(plural(1, honoursText.chronicle.counts.weeks)).toBe('1 week');
    expect(plural(4, honoursText.chronicle.counts.weeks)).toBe('4 weeks');
    expect(plural(1, careerText.hub.injuryOut, { weeks: 1 })).toBe('Out for 1 week');
    expect(plural(3, careerText.hub.injuryOut, { weeks: 3 })).toBe('Out for 3 weeks');
    expect(plural(1, marketText.offers.tierAbove, { club: 'Ashford' })).toBe(
      'One tier above Ashford',
    );
    expect(plural(2, marketText.offers.tierBelow, { club: 'Ashford' })).toBe(
      '2 tiers below Ashford',
    );
    expect(plural(1, socialText.rival.intro.ahead, { rival: 'Kai' })).toBe(
      'You are a goal ahead of Kai this season. Here is where you stand.',
    );
    expect(plural(2, socialText.rival.intro.behind, { rival: 'Kai' })).toBe(
      'Kai is 2 goals ahead of you this season. Here is where you stand.',
    );
    expect(plural(1, socialText.media.answeredLabel)).toBe('question answered');
    expect(plural(1, agendaText.digest.messages, { unread: 1 })).toBe('1 new message');
    expect(plural(3, agendaText.digest.messages, { unread: 2 })).toBe('3 new messages, 2 unread');
  });

  it('keeps target-keyed tables, including entries English never inflects', () => {
    const { obligations } = lifestyleText.sponsors;
    expect(plural(1, obligations.starts, { target: 1 })).toBe('Start 1 match');
    expect(plural(6, obligations.starts, { target: 6 })).toBe('Start 6 matches');
    expect(plural(6.8, obligations.rating, { target: 6.8 })).toBe('Average a rating of 6.8');
    expect(plural(1, obligations.boots, { target: 1 })).toBe('Wear their boots');
    const { kinds } = lifestyleText.challenges;
    expect(plural(1, kinds.rating, { target: 1 })).toBe('Earn a 7.0+ rating once');
    expect(plural(3, kinds.rating, { target: 3 })).toBe('Earn a 7.0+ rating 3 times');
    expect(plural(2, selectionText.outside, { places: 2, position: 'striker', names: 'A' })).toBe(
      '2 players ahead of you for striker, starting with A.',
    );
  });

  it('falls back to other for categories a language does not use', () => {
    const polish = plurals({ one: '{count} gol', few: '{count} gole', other: '{count} goli' });
    // English has no "few": 2 is "other" here, and would be "few" in Polish.
    expect(plural(2, polish)).toBe('2 goli');
    expect(pluralForm(1, polish)).toBe('{count} gol');
  });

  it('writes ordinals as the English suffix rule did', () => {
    const old = (value: number) => {
      const tens = value % 100;
      const suffix =
        tens >= 11 && tens <= 13
          ? 'th'
          : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[value % 10] ?? 'th');
      return `${value}${suffix}`;
    };
    for (let value = 0; value <= 250; value++) expect(ordinal(value)).toBe(old(value));
  });
});

describe('number, money, list and date formats', () => {
  it('match the formatters the screens used', () => {
    for (const value of [0, 7, 999, 1000, 12500, 1234567, 1234.5678, -4200]) {
      /* eslint-disable no-restricted-syntax -- the old formatters, pinned as the reference. */
      expect(formatNumber(value)).toBe(new Intl.NumberFormat('en').format(value));
      expect(formatNumber(value)).toBe(value.toLocaleString('en-GB'));
      expect(formatInteger(value)).toBe(
        new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value),
      );
      /* eslint-enable no-restricted-syntax */
    }
    expect(formatNumber(12500)).toBe('12,500');
    expect(formatInteger(1234.6)).toBe('1,235');
    expect(formatMoney(12500)).toBe('12,500 Cr');
    expect(formatMoney(-600)).toBe('-600 Cr');
    expect(format(marketText.perWeek, { money: formatMoney(1500) })).toBe('1,500 Cr / week');
  });

  it('join names as " and " did for the two the screens show', () => {
    expect(formatList(['Ana'])).toBe('Ana');
    expect(formatList(['Ana', 'Ben'])).toBe(['Ana', 'Ben'].join(' and '));
  });

  it('write release dates as before', () => {
    const options = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' } as const;
    expect(formatDate('2026-10-15T00:00:00Z', options)).toBe('15 October 2026');
    /* eslint-disable-next-line no-restricted-syntax -- the old formatter, pinned. */
    const old = new Intl.DateTimeFormat('en-GB', options).format(new Date('2026-01-02T00:00:00Z'));
    expect(formatDate(new Date('2026-01-02T00:00:00Z'), options)).toBe(old);
  });
});

describe('whole-sentence templates', () => {
  it('say what the joined fragments said', () => {
    const p = agendaText.preview;
    expect(format(p.stopWeek, { from: 4, through: 4, week: 6, opponent: 'Ashford' })).toBe(
      'Continue plays out week 4, then stops in week 6 for Ashford if you are picked. If not, it plays on to your next match.',
    );
    expect(
      format(p.deadlineWeeks, { from: 4, through: 6, week: 6, action: 'answer the press' }),
    ).toBe(
      'Continue plays out weeks 4–6, then stops on deadline day, week 6, so you can answer the press before it lapses.',
    );
    expect(format(pitchCopy.heatTime, { club: 'Ashford' })).toBe(
      'Brighter cells show where you spent more time. Ashford attack left to right.',
    );
    expect(format(pitchCopy.passesLabel, { attempts: 30, completed: 25 })).toBe(
      'Pass map: 30 attempts, 25 completed',
    );
    expect(format(socialText.morale.chartLabel, { morale: 62, form: 55 })).toBe(
      'Morale and form, week by week: Morale 62, Form 55',
    );
    expect(format(careerText.hub.recoveryFirst, { line: 'Season 1 · Week 3 of 38' })).toBe(
      'Season 1 · Week 3 of 38. Choose how to recover first: the world waits until you do.',
    );
    const m = marketText.talks;
    expect(
      format(m.wageHintAgent, {
        wage: format(m.wageAbove, { amount: formatMoney(600) }),
        agent: format(m.agentUnder, { amount: formatMoney(100) }),
      }),
    ).toBe('Wage 600 Cr above their offer, 100 Cr under your agent’s estimate.');
    expect(format(marketText.offers.openWith, { club: 'Ashford' })).toBe('Open talks with Ashford');
  });
});
