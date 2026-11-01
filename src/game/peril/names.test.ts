import { expect, test } from 'bun:test';
import { teamName, teamNames } from './names';

test('team names are two words, and never repeat within a game', () => {
  let seed = 11;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 20; i++) {
    const names = teamNames(8, random);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(8);
    for (const name of names) expect(name).toMatch(/^\p{Lu}\p{L}+ \p{Lu}\p{L}+$/u);
    const another = teamName(names, random);
    expect(names).not.toContain(another);
  }
});
