import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { projectRoot } from '../paths'

/**
 * Őr (tp#57): a felületre ne kerülhessen beégetett angol szöveg.
 *
 * A felület minden mondata a szótárból jön (`src/i18n/index.ts`), hogy a magyar
 * és az angol változat egy helyen legyen. Ez a teszt a `.tsx` fájlok JSX-
 * szövegcsomópontjait nézi: ha ott angol mondat áll, elbukik.
 *
 * Nem jelöl:
 * - magyar szöveget (van benne ékezet, vagy a szótárból jön),
 * - rövid címkéket, kódot, számot, jelet (az „A”, „PDF”, „1/2” nem mondat),
 * - a kivétellistán szereplő szótári maradékokat (márkanevek, fájltípusok).
 */

const ROOT = projectRoot()

/** Márkanevek és formátumnevek: nem fordíthatók, nem is mondatok. */
const ALLOWED = new Set([
  'Test Parrot',
  'Microsoft Word',
  'Google Drive',
  'PDF',
  'DOCX',
  'JSON',
  'CSV',
  'URL',
  'PIN',
  'QR',
])

/** Csak ezeket a kiterjesztéseket nézzük. */
const EXTENSIONS = ['.tsx']

function filesIn(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      // A szótár maga nem felület: ott angol szöveg a rendeltetése.
      if (entry === 'i18n') continue
      filesIn(path, found)
    } else if (EXTENSIONS.some((extension) => entry.endsWith(extension))) {
      found.push(path)
    }
  }
  return found
}

/**
 * A JSX szövegcsomópontjai — a TypeScript parserrel, nem regexszel: a `>` és a
 * `<` a kódban is áll, a parser viszont pontosan tudja, mi jelenik meg a
 * felületen.
 */
function textNodesOf(path: string, source: string): { text: string; line: number }[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: { text: string; line: number }[] = []
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, ' ').trim()
      if (text) {
        const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1
        found.push({ text, line })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

/** Angol mondat-e: legalább két szó, csak latin betű, és nincs benne ékezet. */
function looksEnglish(text: string): boolean {
  if (ALLOWED.has(text)) return false
  if (/[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(text)) return false
  // Legalább két szó, szóközzel elválasztva.
  const words = text.split(' ').filter((word) => /^[A-Za-z][A-Za-z'’,.!?-]*$/.test(word))
  if (words.length < 2) return false
  return text.length >= 6
}

describe('beégetett angol szöveg a felületen', () => {
  test('a JSX-szövegek szótárazottak', () => {
    const offenders: string[] = []
    for (const path of filesIn(join(ROOT, 'src'))) {
      const source = readFileSync(path, 'utf8')
      for (const { text, line } of textNodesOf(path, source)) {
        if (!looksEnglish(text)) continue
        // A már ismert, szándékos esetek (pl. kódrészlet, billentyű) kivételek.
        offenders.push(`${relative(ROOT, path)}:${line} — „${text}”`)
      }
    }
    expect(offenders).toEqual([])
  })
})
