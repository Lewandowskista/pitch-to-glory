import type { Attributes, KeeperAttributes, Standing } from '../model/domain';
import { CREST_SHAPES, CREST_SYMBOLS } from '../engine/assets/crest';

export function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new Error('invalid-world');
}
/**
 * A career match is committed during its week, before the rest of the week is simulated, so
 * a current-week fixture of the career player's club may already have a result.
 */
export function playedThisWeek(w: Record<string, unknown>, fixture: Record<string, unknown>) {
  const career = w.career as { playerId?: unknown } | undefined;
  if (!career) return false;
  const player = (w.players as Record<string, { clubId?: unknown }>)[String(career.playerId)];
  const club = player?.clubId;
  return (
    Number(object(fixture.date).week) === Number(object(w.date).week) &&
    club !== undefined &&
    club !== null &&
    (fixture.homeId === club || fixture.awayId === club)
  );
}

export function object(value: unknown): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
export function number(value: unknown, min = 0, max = 1e12, integer = false): void {
  requireValue(
    typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max &&
      (!integer || Number.isSafeInteger(value)),
  );
}
export function text(value: unknown, max = 120): void {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max);
}
export function id(value: unknown): void {
  text(value, 100);
  requireValue(
    /^[a-zA-Z0-9:_-]+$/.test(value as string) &&
      !['__proto__', 'constructor', 'prototype'].includes(value as string),
  );
}
export function array(value: unknown, max = 20000): unknown[] {
  requireValue(Array.isArray(value) && value.length <= max);
  return value;
}
export function ids(value: unknown, max = 20000): string[] {
  const values = array(value, max);
  values.forEach(id);
  requireValue(new Set(values).size === values.length);
  return values as string[];
}
export function date(value: unknown): void {
  const d = object(value);
  number(d.season, 1800, 9999, true);
  number(d.week, 1, 80, true);
  number(d.day, 1, 7, true);
}
export function options(value: unknown, choices: readonly string[]): void {
  requireValue(choices.includes(String(value)));
}
export function avatar(value: unknown): void {
  const a = object(value);
  for (const key of [
    'face',
    'skin',
    'hair',
    'hairColor',
    'facialHair',
    'eyebrows',
    'eyes',
    'accessory',
  ])
    number(a[key], 0, 7, true);
}
export function palette(value: unknown): void {
  const colors = array(value, 3);
  requireValue(
    colors.length === 3 &&
      colors.every((color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)),
  );
}
export function kits(value: unknown): void {
  const all = object(value);
  for (const type of ['home', 'away', 'third']) {
    const kit = object(all[type]);
    palette(kit.colors);
    options(kit.pattern, [
      'solid',
      'stripes',
      'hoops',
      'halves',
      'sash',
      'chevron',
      'pinstripe',
      'gradient',
    ]);
    for (const part of ['collar', 'trim', 'sponsor']) number(kit[part], 0, 7, true);
  }
}
export function personality(value: unknown): void {
  const p = object(value);
  for (const key of ['ambition', 'loyalty', 'temperament', 'sociability']) number(p[key], 0, 100);
}
const attributeKeys: (keyof Attributes)[] = [
  'finishing',
  'passing',
  'dribbling',
  'firstTouch',
  'crossing',
  'heading',
  'tackling',
  'longShots',
  'setPieces',
  'pace',
  'acceleration',
  'stamina',
  'strength',
  'agility',
  'jumping',
  'vision',
  'composure',
  'positioning',
  'decisions',
  'workRate',
  'leadership',
  'aggression',
];
const keeperKeys: (keyof KeeperAttributes)[] = [
  'handling',
  'reflexes',
  'diving',
  'oneOnOnes',
  'kicking',
  'commandOfArea',
  'aerialReach',
];
const positions = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];
export function attributes(value: unknown, keys: readonly string[]): void {
  const a = object(value);
  requireValue(Object.keys(a).length === keys.length);
  keys.forEach((key) => number(a[key], 1, 99, true));
}
export function map(value: unknown, max: number): Record<string, Record<string, unknown>> {
  const values = object(value);
  requireValue(Object.keys(values).length <= max);
  for (const [key, entity] of Object.entries(values)) {
    id(key);
    const record = object(entity);
    requireValue(record.id === key);
  }
  return values as Record<string, Record<string, unknown>>;
}
export function ref(value: unknown, entities: object): void {
  id(value);
  requireValue(Object.hasOwn(entities, value as string));
}
export function standings(
  value: unknown,
  clubIds: readonly string[],
  initialPoints?: Record<string, number>,
): Standing[] {
  const national = initialPoints !== undefined;
  const rows = array(value, national ? 32 : 8);
  requireValue(rows.length === clubIds.length);
  const seen = new Set();
  for (const value of rows) {
    const row = object(value);
    requireValue(clubIds.includes(String(row.clubId)) && !seen.has(row.clubId));
    seen.add(row.clubId);
    for (const key of ['played', 'won', 'drawn', 'lost'])
      number(row[key], 0, national ? 80 : 28, true);
    for (const key of ['goalsFor', 'goalsAgainst']) number(row[key], 0, national ? 800 : 280, true);
    number(row.points, 0, national ? 250 : 84, true);
    requireValue(row.played === Number(row.won) + Number(row.drawn) + Number(row.lost));
    requireValue(
      row.points ===
        Number(row.won) * 3 + Number(row.drawn) + (initialPoints?.[String(row.clubId)] ?? 0),
    );
  }
  return rows as Standing[];
}

export function validateEntities(
  w: Record<string, unknown>,
  feederClubIds: readonly string[] = [],
): void {
  if (w.developmentVersion !== undefined) requireValue(w.developmentVersion === 2);
  if (w.selectionVersion !== undefined) requireValue(w.selectionVersion === 1);
  if (w.identityVersion !== undefined) requireValue(w.identityVersion === 2);
  const currentDate = object(w.date);
  const countries = object(w.countries),
    leagues = object(w.leagues);
  const clubs = map(w.clubs, 2500),
    players = map(w.players, 150000);
  const contracts = map(w.contracts, 150000),
    managers = map(w.managers, 30000);
  const dressingRooms = map(w.dressingRooms, 2500);
  const registered = new Set<string>();
  for (const club of Object.values(clubs)) {
    text(club.name);
    text(club.city);
    ref(club.countryId, countries);
    if (feederClubIds.includes(String(club.id))) {
      id(club.leagueId);
      requireValue(String(club.leagueId).startsWith('feeder:'));
    } else ref(club.leagueId, leagues);
    ref(club.managerId, managers);
    ref(club.dressingRoomId, dressingRooms);
    number(club.reputation, 1, 99);
    number(club.youthFocus, 0, 100);
    options(club.playingStyle, ['possession', 'direct', 'press', 'counter', 'balanced']);
    const crest = object(club.crest);
    number(crest.shape, 0, CREST_SHAPES.length - 1, true);
    number(crest.symbol, 0, CREST_SYMBOLS.length - 1, true);
    palette(crest.colors);
    kits(club.kits);
    const stadium = object(club.stadium);
    id(stadium.id);
    text(stadium.name);
    number(stadium.capacity, 1, 200000, true);
    number(stadium.pitchQuality, 0, 100);
    const finance = object(club.finances);
    for (const key of ['balance', 'weeklyIncome', 'weeklyCosts', 'transferBudget', 'wageBudget'])
      number(finance[key], key === 'balance' ? -1e12 : 0);
    const culture = object(club.culture);
    requireValue(typeof culture.fanOwned === 'boolean');
    for (const key of ['youth', 'winNow', 'discipline', 'attacking']) number(culture[key], 0, 100);
    const roster = ids(club.playerIds, 40);
    requireValue(roster.length >= 18);
    for (const key of roster) {
      ref(key, players);
      requireValue(
        !registered.has(key) && players[key]!.clubId === club.id && players[key]!.retired === false,
      );
      registered.add(key);
    }
    requireValue(roster.filter((key) => players[key]!.primaryPosition === 'GK').length >= 2);
  }
  for (const player of Object.values(players)) {
    text(player.name);
    number(player.birthSeason, 1800, Number(currentDate.season) - 16, true);
    ref(player.nationalityId, countries);
    avatar(player.avatar);
    options(player.foot, ['left', 'right', 'both']);
    options(player.primaryPosition, positions);
    for (const value of array(player.secondaryPositions, 10)) {
      const position = object(value);
      options(position.position, positions);
      number(position.familiarity, 0, 100);
    }
    attributes(player.attributes, attributeKeys);
    attributes(player.keeperAttributes, keeperKeys);
    number(player.potential, 1, 99, true);
    personality(player.personality);
    const hidden = object(player.hidden);
    for (const key of [
      'injuryProneness',
      'bigMatchTemperament',
      'consistency',
      'professionalism',
      'ambition',
    ])
      number(hidden[key], 1, 99, true);
    array(hidden.revealed, 5).forEach((key) => text(key));
    requireValue(typeof player.retired === 'boolean');
    if (player.releasedSeason !== undefined) {
      number(player.releasedSeason, 1800, Number(currentDate.season), true);
      requireValue(player.clubId === null && !player.retired);
    }
    if (player.retired) requireValue(player.clubId === null && player.contractId === null);
    else if (player.clubId === null)
      requireValue(player.contractId === null && !registered.has(String(player.id)));
    else {
      ref(player.clubId, clubs);
      ref(player.contractId, contracts);
      requireValue(registered.has(String(player.id)));
    }
    for (const key of ['fitness', 'fatigue', 'morale', 'form']) number(player[key], 0, 100);
    // The career player's injury is linked by validateCareer; an AI injury carries its weeks.
    if (player.injuryId !== null) {
      id(player.injuryId);
      if (object(w.career ?? {}).playerId !== player.id) number(player.injuryWeeks, 1, 60, true);
    } else requireValue(player.injuryWeeks === undefined);
    ids(player.traits, 50);
    const stats = object(player.stats);
    for (const key of ['appearances', 'minutes', 'goals', 'assists', 'cleanSheets'])
      number(stats[key], 0, 1e7, true);
    number(stats.ratingTotal, 0, 1e8);
    ids(stats.trophies, 1000);
  }
  // A loaned player is registered with the loan club while contracted to the parent club;
  // marketValidation checks the loan itself.
  const loaned = new Set(
    (Array.isArray(w.loans) ? w.loans : []).map((loan) => String(object(loan).playerId)),
  );
  for (const contract of Object.values(contracts)) {
    ref(contract.playerId, players);
    ref(contract.clubId, clubs);
    date(contract.start);
    date(contract.end);
    requireValue(
      players[String(contract.playerId)]!.contractId === contract.id &&
        (players[String(contract.playerId)]!.clubId === contract.clubId ||
          loaned.has(String(contract.playerId))),
    );
    options(contract.role, ['key', 'rotation', 'backup', 'youth']);
    for (const key of [
      'weeklyWage',
      'appearanceBonus',
      'goalBonus',
      'cleanSheetBonus',
      'loyaltyBonus',
    ])
      number(contract[key]);
    if (contract.releaseClause !== null) number(contract.releaseClause);
    number(contract.sellOnPercent, 0, 100);
  }
  for (const manager of Object.values(managers)) {
    text(manager.name);
    avatar(manager.avatar);
    personality(manager.personality);
    number(manager.age, 25, 120, true);
    text(manager.preferredFormation, 20);
    if (manager.appointed !== undefined) date(manager.appointed);
    number(manager.ability, 1, 99);
    // A former player turned manager may since have been archived.
    if (manager.formerPlayerId !== null) {
      id(manager.formerPlayerId);
      requireValue(
        Object.hasOwn(players, String(manager.formerPlayerId)) ||
          Object.hasOwn(
            w.archive === undefined ? {} : object(object(w.archive).players),
            String(manager.formerPlayerId),
          ),
      );
    }
  }
  if (w.archive !== undefined) {
    const archive = object(w.archive);
    requireValue(Object.keys(archive).length === 1);
    for (const record of Object.values(map(archive.players, 1_000_000))) {
      requireValue(!Object.hasOwn(players, String(record.id)));
      text(record.name);
      number(record.birthSeason, 1800, Number(currentDate.season), true);
      ref(record.nationalityId, countries);
      options(record.primaryPosition, positions);
      avatar(record.avatar);
      number(record.retiredSeason, 1800, Number(currentDate.season), true);
      const stats = object(record.stats);
      for (const key of ['appearances', 'minutes', 'goals', 'assists', 'cleanSheets'])
        number(stats[key], 0, 1e7, true);
    }
  }
  for (const room of Object.values(dressingRooms)) {
    ref(room.clubId, clubs);
    number(room.mood, 0, 100);
    for (const key of ids(room.leaderIds, 10)) {
      ref(key, players);
      requireValue(players[key]!.clubId === room.clubId);
    }
    // socialValidation checks the cliques.
    array(room.cliques, 4);
  }
}
