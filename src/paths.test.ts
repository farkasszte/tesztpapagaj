import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fixturePath, projectRoot, publicPath, srcPath } from './paths'

const SRC = srcPath()

function sourceFiles(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path))
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) found.push(path)
  }
  return found
}

describe('a projekt gyökere', () => {
  test('felismerhető, és a három útvonal oda mutat, ahová kell', () => {
    expect(readFileSync(join(projectRoot(), 'package.json'), 'utf8').length).toBeGreaterThan(0)
    expect(srcPath('paths.ts')).toBe(join(projectRoot(), 'src', 'paths.ts'))
    expect(publicPath('fonts', 'FreeSerif.ttf')).toBe(join(projectRoot(), 'public', 'fonts', 'FreeSerif.ttf'))
    expect(fixturePath('aiken')).toBe(join(projectRoot(), 'fixtures', 'aiken'))
  })

  test('a próbaanyagok a gyökérben vannak, nem a forrás mellett', () => {
    expect(readdirSync(fixturePath()).length).toBeGreaterThan(0)
  })
})

describe('a forrás nem függ a saját helyétől', () => {
  test('egyetlen fájl sem nyit meg útvonalat a saját helyéhez képest', () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => !path.endsWith('paths.ts') && !path.endsWith('paths.test.ts'))
      .filter((path) => {
        const text = readFileSync(path, 'utf8')
        // `new URL('../…', import.meta.url)` és `join(import.meta.dir, '..', …)`.
        return /new URL\(\s*['"`]\.\.?\//.test(text) || text.includes('import.meta.dir')
      })
      .map((path) => path.slice(projectRoot().length + 1).replaceAll('\\', '/'))

    // Aki ide kerül: a fájl a saját helyéhez képest nyit meg fájlt, ezért
    // bármelyik mozgatás csendben eltörné. Használja a `paths.ts` segédeit.
    expect(offenders).toEqual([])
  })

  test('minden relatív hivatkozás létező fájlra mutat', () => {
    // A `tsc` a `?raw`/`?url` hivatkozásokat nem ellenőrzi (azokat a Vite
    // oldja fel), ezért egy elcsúszott `../public/extract.md?raw` csak az
    // éles buildben derül ki — a deploy pedig csendben elmarad.
    const offenders: string[] = []
    const reference = /(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g
    for (const path of sourceFiles(SRC)) {
      const text = readFileSync(path, 'utf8')
      for (const match of text.matchAll(reference)) {
        const target = match[1].split('?')[0]
        const absolute = join(path, '..', target)
        const candidates = [absolute, `${absolute}.ts`, `${absolute}.tsx`, `${absolute}.json`,
          `${absolute}.css`, join(absolute, 'index.ts'), join(absolute, 'index.tsx')]
        if (!candidates.some((candidate) => existsSync(candidate))) {
          offenders.push(`${path.slice(projectRoot().length + 1).replaceAll('\\', '/')} → ${match[1]}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
