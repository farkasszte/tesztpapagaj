// A beírt válasz összevetése a tanár válaszával (ADR-0053).
//
// A játékban a diák gépel, nem kártyát választ, ezért a szöveget össze kell
// vetni a bankban álló válasszal. A szigorú egyezés kevés lenne: a gyerek
// kisbetűvel, ékezet nélkül, pont nélkül gépel, és elüt egy betűt. Ezért a
// mérés laza — de csak a valószínű elütést engedi el, a másik választ nem:
//
//   1. pontos egyezés normalizálás után (kisbetű, ékezet, írásjel, szóköz),
//   2. számként egyezés (vessző/pont, tűréssel),
//   3. rövid válasznál (5 betű alatt) elütés nincs, ott csak az 1–2. eset,
//   4. hosszabb válasznál legfeljebb pár betű eltérés (bigram-hasonlóság).
//
// Az ékezet elhagyása szándékos: a magyar billentyűzeten az ő/ű gyakran marad
// el, és az „áram” válasz nem lesz hamis attól, hogy „aram”-nak gépelték.

/** Combining marks, amiket az NFD szétválaszt: ezek ejtik az ékezetet. */
const ACCENTS = /[\u0300-\u036f]/g

/** A válasz összehasonlítható alakja: ékezet, kisbetű, írásjel és szóköz nélkül. */
export function normalizeAnswer(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[’‘`´]/g, "'")
    .replace(/[–—−]/g, '-')
    .normalize('NFD')
    .replace(ACCENTS, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[^\p{L}\p{N}]+$/u, '')
    .trim()
}

/** A válasz, ha számot ír le; különben null. A vesszőt pontnak veszi. */
export function numberOf(text: string): number | null {
  // A mínuszjel a számhoz tartozik, ezért itt nem esik le az írásjel-tisztításon.
  const clean = text
    .replace(/\u00a0/g, ' ')
    .replace(/[,\u066b]/g, '.')
    .replace(/\s/g, '')
  if (!/^-?\d+(?:[.,]\d+)?$/.test(clean)) return null
  const value = Number(clean.replace(',', '.'))
  return Number.isFinite(value) ? value : null
}

/** A tanár javasolt válaszából az elfogadható alakok: `/`, `;` vagy `vagy` mentén. */
export function acceptedAnswersOf(suggested: string): string[] {
  return suggested
    .split(/\s*(?:\/|;|\bvagy\b)\s*/iu)
    .map((one) => one.trim())
    .filter(Boolean)
}

/** Két szó hasonlósága 0 és 1 között, betűpárokon (Dice-együttható). */
function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const pairs = (text: string) => {
    const list: string[] = []
    for (let index = 0; index < text.length - 1; index += 1) list.push(text.slice(index, index + 2))
    return list
  }
  const left = pairs(a)
  const right = pairs(b)
  const pool = new Map<string, number>()
  for (const pair of left) pool.set(pair, (pool.get(pair) ?? 0) + 1)
  let shared = 0
  for (const pair of right) {
    const count = pool.get(pair) ?? 0
    if (count > 0) {
      shared += 1
      pool.set(pair, count - 1)
    }
  }
  return (2 * shared) / (left.length + right.length)
}

/** A legkisebb válaszhossz, ahol egy elütött betű még belefér. */
const TYPO_FLOOR = 5
/** E fölött a hasonlóság elütésnek számít. */
const TYPO_LIMIT = 0.85

/** Egy beírt válasz helyes-e, a tanár válaszához (vagy válaszaihoz) mérve. */
export function textIsRight(given: string, accepted: readonly string[]): boolean {
  const mine = normalizeAnswer(given)
  if (!mine) return false
  const numbers = accepted.map((one) => numberOf(one))
  const myNumber = numberOf(mine)
  for (const [index, one] of accepted.entries()) {
    const theirs = normalizeAnswer(one)
    if (!theirs) continue
    if (mine === theirs) return true
    // Számként: 3,14 és 3.14 ugyanaz, és a kerekítés sem ront el egy választ.
    const theirNumber = numbers[index] ?? null
    if (myNumber !== null && theirNumber !== null) {
      const slack = Math.max(1e-9, Math.abs(theirNumber) * 1e-6)
      if (Math.abs(myNumber - theirNumber) <= slack) return true
    }
    // Elütés: csak hosszabb válasznál, és csak kis eltérésnél.
    if (theirs.length < TYPO_FLOOR || mine.length < TYPO_FLOOR) continue
    if (Math.abs(mine.length - theirs.length) > 3) continue
    if (similarity(mine, theirs) >= TYPO_LIMIT) return true
  }
  return false
}
