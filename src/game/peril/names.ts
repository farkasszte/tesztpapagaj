/**
 * Medieval Team names, two words paired the way GitHub names repositories:
 * "Gilded Griffins", "Iron Wyverns". Pairs that share a first letter are
 * favoured, because they're more fun to say.
 */

const ADJECTIVES = [
  'Bold',
  'Brave',
  'Bronze',
  'Copper',
  'Crimson',
  'Crowned',
  'Dread',
  'Emerald',
  'Fearless',
  'Gallant',
  'Gilded',
  'Golden',
  'Grim',
  'Hidden',
  'Iron',
  'Jade',
  'Mighty',
  'Misty',
  'Moss',
  'Noble',
  'Oaken',
  'Royal',
  'Ruby',
  'Rune',
  'Scarlet',
  'Silver',
  'Sly',
  'Stone',
  'Storm',
  'Swift',
  'Thorn',
  'Valiant',
  'Wild',
  'Wise',
];

const NOUNS = [
  'Archers',
  'Bards',
  'Basilisks',
  'Bears',
  'Castles',
  'Dragons',
  'Druids',
  'Falcons',
  'Foxes',
  'Gargoyles',
  'Giants',
  'Griffins',
  'Guardians',
  'Hawks',
  'Heralds',
  'Jesters',
  'Knights',
  'Lions',
  'Mages',
  'Monks',
  'Owls',
  'Pegasi',
  'Ravens',
  'Rogues',
  'Sages',
  'Squires',
  'Stags',
  'Trolls',
  'Unicorns',
  'Vikings',
  'Wizards',
  'Wolves',
  'Wyverns',
];

const pick = <T>(list: T[], random: () => number): T => list[Math.floor(random() * list.length)];

/** A name none of `taken` already has. */
export function teamName(taken: string[], random: () => number = Math.random): string {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  for (let tries = 0; tries < 200; tries++) {
    const adjective = pick(ADJECTIVES, random);
    // Most of the time, match the first letter when a noun allows it.
    const matching = NOUNS.filter((noun) => noun[0] === adjective[0]);
    const noun = matching.length && random() < 0.7 ? pick(matching, random) : pick(NOUNS, random);
    const name = `${adjective} ${noun}`;
    if (!used.has(name.toLowerCase())) return name;
  }
  return `Team ${taken.length + 1}`;
}

export function teamNames(count: number, random: () => number = Math.random): string[] {
  const names: string[] = [];
  while (names.length < count) names.push(teamName(names, random));
  return names;
}
