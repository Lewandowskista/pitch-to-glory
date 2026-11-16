import { matchFormat, matchText as m } from '../../../i18n/match';

/** The clock: "34′", or in added time (match-22) "90+3′". */
export function clockText(minute: number, added?: number): string {
  return added
    ? matchFormat(m.ui.addedMinute, { minute, added })
    : matchFormat(m.minute, { minute });
}
